import { scheduledReducers } from '../schema/tables';
import { markLocationVisited } from '../helpers/visited';
import { collapsePassageAfterLeaving } from '../helpers/passages';
import { syncCharacterOnline } from '../helpers/online';
import { announcePartyPresence } from '../helpers/party_presence';
import { endInvite, settleGroupAfterLeave } from '../helpers/group_invites';
import { promptRespawnIfDead, refuseWhileDead, respawnDeadCharacter } from '../helpers/character';

export const registerCharacterReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    CombatParticipant,
    requirePlayerUserId,
    requireCharacterOwnedBy,
    friendUserIds,
    appendPrivateEvent,
    appendGroupEvent,
    appendLocationEvent,
    campCharacter,
    ensurePoolsForLocation,
    recomputeCharacterDerived,
    ScheduleAt,
    CharacterLogoutTick,
    activeCombatIdForCharacter,
    cleanupDecayedCorpses,
    fail,
  } = deps;
  const CHARACTER_SWITCH_LOGOUT_DELAY = 30_000_000n;

  spacetimedb.reducer('set_active_character', { characterId: t.u64() }, (ctx, { characterId }) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player) throw new SenderError('Player not found');
    const character = requireCharacterOwnedBy(ctx, characterId);
    const previousActiveId = player.activeCharacterId;
    if (previousActiveId) {
      const activeCombat = activeCombatIdForCharacter(ctx, previousActiveId);
      if (activeCombat) {
        const activeCharacter = ctx.db.character.id.find(previousActiveId);
        if (activeCharacter) {
          appendPrivateEvent(
            ctx,
            activeCharacter.id,
            activeCharacter.ownerUserId,
            'system',
            'You cannot switch characters during combat.'
          );
        }
        return;
      }
    }
    if (activeCombatIdForCharacter(ctx, character.id)) {
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        'You cannot switch into a character that is currently in combat.'
      );
      return;
    }
    if (previousActiveId && previousActiveId !== character.id) {
      const previous = ctx.db.character.id.find(previousActiveId);
        if (previous) {
        const logoutAtMicros = ctx.timestamp.microsSinceUnixEpoch + CHARACTER_SWITCH_LOGOUT_DELAY;
        ctx.db.character_logout_tick.insert({
          scheduledId: 0n,
          scheduledAt: ScheduleAt.time(logoutAtMicros),
          characterId: previous.id,
          ownerUserId: previous.ownerUserId,
          logoutAtMicros,
        });
        }
    }

    ctx.db.player.id.update({ ...player, activeCharacterId: character.id });

    // Visited places: backfill for characters that existed before the table; the current place counts as stood in (no origin).
    if (character.locationId !== 0n) markLocationVisited(ctx, character.id, character.locationId);

    // Recompute derived stats on character selection (ensures mana/stamina/etc. are correct)
    recomputeCharacterDerived(ctx, character);
    // Set current hp/mana/stamina to max if they're at 0 (fixes legacy characters with missing resources)
    const refreshed = ctx.db.character.id.find(character.id);
    if (refreshed && refreshed.mana === 0n && refreshed.maxMana > 0n) {
      ctx.db.character.id.update({ ...refreshed, mana: refreshed.maxMana });
    }
    if (refreshed && refreshed.stamina === 0n && refreshed.maxStamina > 0n) {
      ctx.db.character.id.update({ ...ctx.db.character.id.find(character.id)!, stamina: refreshed.maxStamina });
    }

    const userId = requirePlayerUserId(ctx);
    appendPrivateEvent(ctx, character.id, userId, 'presence', 'You are online.');
    const friends = friendUserIds(ctx, userId);
    for (const friendId of friends) {
      appendPrivateEvent(
        ctx,
        character.id,
        friendId,
        'presence',
        `${character.name} is online.`
      );
    }

    appendLocationEvent(
      ctx,
      character.locationId,
      'system',
      `${character.name} steps into the area.`,
      character.id
    );
    ensurePoolsForLocation(ctx, character.locationId);

    // Online status (51.1): the last character-row writes of the reducer (research Pitfall 1).
    // The previous character goes offline unless another session still holds it.
    // The party hears each flip once; the announcements write event_group only, so the syncs stay the
    // last character-row writes.
    if (previousActiveId && previousActiveId !== character.id && syncCharacterOnline(ctx, previousActiveId)) {
      announcePartyPresence(ctx, previousActiveId, 'logged_out');
    }
    if (syncCharacterOnline(ctx, character.id)) announcePartyPresence(ctx, character.id, 'back');
    // Coming back in dead: the death prompt again, with its [respawn] (owner, 2026-10-09).
    promptRespawnIfDead(ctx, ctx.db.character.id.find(character.id));
  });

  spacetimedb.reducer('clear_active_character', {}, (ctx, _) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player) throw new SenderError('Player not found');
    if (!player.activeCharacterId) return;
    const activeCombat = activeCombatIdForCharacter(ctx, player.activeCharacterId);
    if (activeCombat) {
      appendPrivateEvent(ctx, player.activeCharacterId, player.userId!, 'system', 'You cannot camp during combat.');
      return;
    }
    const character = ctx.db.character.id.find(player.activeCharacterId);
    if (character) campCharacter(ctx, player, character);
    else ctx.db.player.id.update({ ...player, activeCharacterId: undefined, lastActivityAt: undefined });
  });

  spacetimedb.reducer('bind_location', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    if (refuseWhileDead(ctx, character)) return;
    // Same rule and wording as the typed `bind` intent (reducers/intent.ts).
    if (activeCombatIdForCharacter(ctx, character.id)) {
      fail(ctx, character, 'You cannot bind while in combat.');
      return;
    }
    const location = ctx.db.location.id.find(character.locationId);
    if (!location || !location.bindStone) {
      fail(ctx, character, 'No bindstone here');
      return;
    }
    ctx.db.character.id.update({ ...character, boundLocationId: location.id });
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      `You are now bound to ${location.name}.`
    );
  });

  spacetimedb.reducer('delete_character', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const characterId = character.id;

    for (const player of ctx.db.player.iter()) {
      if (player.activeCharacterId === characterId) {
        ctx.db.player.id.update({ ...player, activeCharacterId: undefined });
      }
    }

    // Every invite to or from the deleted character ends as withdrawn, so its other side is told
    // and a solo inviter's lone group dissolves (WR-05). Runs first (before the group is settled,
    // the character row and its private lines are deleted), so the names still resolve and a group
    // left with one member is settled once, below.
    const invites = [...ctx.db.group_invite.iter()]
      .filter((invite: any) => invite.fromCharacterId === characterId || invite.toCharacterId === characterId)
      .sort((x: any, y: any) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    for (const invite of invites) {
      if (ctx.db.group_invite.id.find(invite.id)) endInvite(ctx, invite, 'withdrawn', undefined, undefined, { deletion: true });
    }
    for (const row of [...ctx.db.group_invite_cooldown.iter()]) {
      if (row.fromCharacterId === characterId || row.toCharacterId === characterId) {
        ctx.db.group_invite_cooldown.id.delete(row.id);
      }
    }

    // An invite end above may have dissolved the character's own lone group.
    const current = ctx.db.character.id.find(characterId) ?? character;
    if (current.groupId) {
      const groupId = current.groupId;
      for (const member of ctx.db.group_member.by_group.filter(groupId)) {
        if (member.characterId === characterId) {
          ctx.db.group_member.id.delete(member.id);
          break;
        }
      }

      const departure = `${character.name} was removed from the group.`;
      appendGroupEvent(ctx, groupId, characterId, 'group', departure);

      // The shared rule with leave_group, kick and camp: successor (online first), withdrawn
      // invites, or the lone-group dissolve (WR-04, WR-05). It also hands on the puller role.
      settleGroupAfterLeave(ctx, groupId, characterId, departure);
    }

    for (const row of ctx.db.event_group.by_character.filter(characterId)) {
      ctx.db.event_group.id.delete(row.id);
    }
    for (const row of ctx.db.event_private.by_character.filter(characterId)) {
      ctx.db.event_private.id.delete(row.id);
    }
    for (const row of ctx.db.command.by_character.filter(characterId)) {
      ctx.db.command.id.delete(row.id);
    }
    for (const row of ctx.db.npc_dialog.by_character.filter(characterId)) {
      ctx.db.npc_dialog.id.delete(row.id);
    }
    for (const row of ctx.db.quest_instance.by_character.filter(characterId)) {
      ctx.db.quest_instance.id.delete(row.id);
    }
    for (const row of ctx.db.hotbar_slot.by_character.filter(characterId)) {
      ctx.db.hotbar_slot.id.delete(row.id);
    }
    for (const row of ctx.db.character_effect.by_character.filter(characterId)) {
      ctx.db.character_effect.id.delete(row.id);
    }
    for (const row of ctx.db.faction_standing.by_character.filter(characterId)) {
      ctx.db.faction_standing.id.delete(row.id);
    }
    for (const row of ctx.db.item_instance.by_owner.filter(characterId)) {
      ctx.db.item_instance.id.delete(row.id);
    }

    const combatIds = new Set<bigint>();
    for (const participant of ctx.db.combat_participant.by_character.filter(characterId)) {
      combatIds.add(participant.combatId);
      ctx.db.combat_participant.id.delete(participant.id);
    }

    for (const combatId of combatIds) {
      for (const entry of ctx.db.aggro_entry.by_combat.filter(combatId)) {
        if (entry.characterId === characterId) {
          ctx.db.aggro_entry.id.delete(entry.id);
        }
      }
      const combat = ctx.db.combat_encounter.id.find(combatId);
      if (combat && combat.leaderCharacterId === characterId) {
        let replacement: typeof CombatParticipant.rowType | null = null;
        for (const participant of ctx.db.combat_participant.by_combat.filter(combatId)) {
          if (!replacement) replacement = participant;
        }
        ctx.db.combat_encounter.id.update({
          ...combat,
          leaderCharacterId: replacement ? replacement.characterId : undefined,
        });
      }
    }

    for (const row of ctx.db.combat_result.by_owner_user.filter(character.ownerUserId)) {
      if (row.characterId === characterId) {
        ctx.db.combat_result.id.delete(row.id);
      }
    }

    // Clean up corpses for this character
    for (const corpse of ctx.db.corpse.by_character.filter(characterId)) {
      // Delete all CorpseItem rows
      for (const corpseItem of ctx.db.corpse_item.by_corpse.filter(corpse.id)) {
        ctx.db.corpse_item.id.delete(corpseItem.id);
      }
      // Delete the corpse
      ctx.db.corpse.id.delete(corpse.id);
    }

    for (const row of ctx.db.visited_location.by_character.filter(characterId)) {
      ctx.db.visited_location.id.delete(row.id);
    }
    ctx.db.vendor_buyback.characterId.delete(characterId);
    ctx.db.action_result.characterId.delete(characterId);

    ctx.db.character.id.delete(characterId);
    // A passage the deleted character stood in collapses once nobody is left in it.
    collapsePassageAfterLeaving(ctx, character.locationId);
  });

  spacetimedb.reducer('respawn_character', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    if (character.hp > 0n) return;
    respawnDeadCharacter(ctx, character);
  });

  scheduledReducers['character_logout'] = spacetimedb.reducer(
    'character_logout',
    { arg: CharacterLogoutTick.rowType },
    (ctx, { arg }) => {
      if (ctx.sender.toHexString() !== ctx.databaseIdentity.toHexString()) return;
      const character = ctx.db.character.id.find(arg.characterId);
      if (!character) return;
      for (const player of ctx.db.player.iter()) {
        if (player.activeCharacterId === character.id) {
          return;
        }
      }

      // Delete all temporary items for this character (Summoner Conjure Equipment)
      for (const instance of ctx.db.item_instance.by_owner.filter(arg.characterId)) {
        if (instance.isTemporary) {
          ctx.db.item_instance.id.delete(instance.id);
        }
      }
      // Dismiss active pets on logout
      for (const pet of ctx.db.active_pet.by_character.filter(arg.characterId)) {
        ctx.db.active_pet.id.delete(pet.id);
      }

      const friends = friendUserIds(ctx, arg.ownerUserId);
      for (const friendId of friends) {
        appendPrivateEvent(
          ctx,
          character.id,
          friendId,
          'presence',
          `${character.name} went offline.`
        );
      }
    }
  );
};
