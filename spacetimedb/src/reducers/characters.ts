import { scheduledReducers } from '../schema/tables';

export const registerCharacterReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    GroupMember,
    CombatParticipant,
    requirePlayerUserId,
    requireCharacterOwnedBy,
    friendUserIds,
    appendPrivateEvent,
    appendGroupEvent,
    appendLocationEvent,
    campCharacter,
    ensureSpawnsForLocation,
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
    ensureSpawnsForLocation(ctx, character.locationId);
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

    if (character.groupId) {
      const groupId = character.groupId;
      const group = ctx.db.group.id.find(groupId);
      const wasLeader = group?.leaderCharacterId === characterId;

      for (const member of ctx.db.group_member.by_group.filter(groupId)) {
        if (member.characterId === characterId) {
          ctx.db.group_member.id.delete(member.id);
          break;
        }
      }

      appendGroupEvent(
        ctx,
        groupId,
        characterId,
        'group',
        `${character.name} was removed from the group.`
      );

      let newLeaderMember: typeof GroupMember.rowType | null = null;
      for (const member of ctx.db.group_member.by_group.filter(groupId)) {
        if (!newLeaderMember) newLeaderMember = member;
      }

      if (!newLeaderMember) {
        for (const invite of ctx.db.group_invite.by_group.filter(groupId)) {
          ctx.db.group_invite.id.delete(invite.id);
        }
        ctx.db.group.id.delete(groupId);
      } else if (group && wasLeader) {
        const newLeaderCharacter = ctx.db.character.id.find(newLeaderMember.characterId);
        if (newLeaderCharacter) {
          ctx.db.group.id.update({ ...group, leaderCharacterId: newLeaderCharacter.id });
          ctx.db.group_member.id.update({ ...newLeaderMember, role: 'leader' });
          appendGroupEvent(
            ctx,
            groupId,
            newLeaderCharacter.id,
            'group',
            `${newLeaderCharacter.name} is now the group leader.`
          );
        }
      }
    }

    for (const invite of ctx.db.group_invite.iter()) {
      if (invite.fromCharacterId === characterId || invite.toCharacterId === characterId) {
        ctx.db.group_invite.id.delete(invite.id);
      }
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

    ctx.db.character.id.delete(characterId);
  });

  spacetimedb.reducer('respawn_character', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    if (character.hp > 0n) return;
    if (activeCombatIdForCharacter(ctx, character.id)) {
      fail(ctx, character, 'Cannot respawn during combat');
      return;
    }

    // Clean up decayed corpses opportunistically
    deps.cleanupDecayedCorpses(ctx);

    for (const effect of ctx.db.character_effect.by_character.filter(character.id)) {
      ctx.db.character_effect.id.delete(effect.id);
    }
    // Clear any pending casts on respawn
    for (const cast of ctx.db.character_cast.by_character.filter(character.id)) {
      ctx.db.character_cast.id.delete(cast.id);
    }
    // Clear travel cooldown on respawn
    for (const cd of ctx.db.travel_cooldown.by_character.filter(character.id)) {
      ctx.db.travel_cooldown.id.delete(cd.id);
    }
    const nextLocationId = character.boundLocationId ?? character.locationId;
    const respawnLocation = ctx.db.location.id.find(nextLocationId)?.name ?? 'your bind point';
    ctx.db.character.id.update({
      ...character,
      locationId: nextLocationId,
      hp: 1n,
      mana: character.maxMana > 0n ? 1n : 0n,
      stamina: character.maxStamina > 0n ? 1n : 0n,
    });
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'combat',
      `You awaken at ${respawnLocation}, shaken but alive.`
    );

    // Check for corpses and notify player
    const corpses = [...ctx.db.corpse.by_character.filter(character.id)];
    if (corpses.length > 0) {
      const locationNames = corpses.map(c => {
        const loc = ctx.db.location.id.find(c.locationId);
        return loc?.name ?? 'unknown';
      });
      const unique = [...new Set(locationNames)];
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        `You have ${corpses.length} corpse(s) containing your belongings at: ${unique.join(', ')}.`
      );
    }

    if (character.groupId) {
      appendGroupEvent(
        ctx,
        character.groupId,
        character.id,
        'combat',
        `You awaken at ${respawnLocation}, shaken but alive.`
      );
    }
  });

  scheduledReducers['character_logout'] = spacetimedb.reducer(
    'character_logout',
    { arg: CharacterLogoutTick.rowType },
    (ctx, { arg }) => {
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
