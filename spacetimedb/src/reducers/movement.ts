import { TRAVEL_CONFIG } from '../data/travel_config';
import { performPassiveSearch } from '../helpers/search';
import { getPerkBonusByField } from '../helpers/renown';

export const registerMovementReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    requireCharacterOwnedBy,
    areLocationsConnected,
    activeCombatIdForCharacter,
    appendPrivateEvent,
    appendLocationEvent,
    appendGroupEvent,
    ensureSpawnsForLocation,
    isGroupLeaderOrSolo,
    effectiveGroupId,
  } = deps;

  const fail = (ctx: any, character: any, message: string) => {
    deps.appendSystemMessage(ctx, character, message);
    return;
  };

  spacetimedb.reducer('move_character', { characterId: t.u64(), locationId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const _player = ctx.db.player.id.find(ctx.sender);
    if (_player) {
      ctx.db.player.id.update({ ..._player, lastActivityAt: ctx.timestamp });
    }
    const location = ctx.db.location.id.find(args.locationId);
    if (!location) return fail(ctx, character, 'Location not found');
    if (character.locationId === location.id) return;
    if (activeCombatIdForCharacter(ctx, character.id)) {
      return fail(ctx, character, 'Cannot travel while in combat');
    }
    const activeGather = [...ctx.db.resource_gather.by_character.filter(character.id)][0];
    if (activeGather) {
      return fail(ctx, character, 'Cannot travel while gathering');
    }
    if (!areLocationsConnected(ctx, character.locationId, location.id)) {
      return fail(ctx, character, 'Location not connected');
    }

    const originLocationId = character.locationId;

    // Determine if travel crosses regions
    const fromLocation = ctx.db.location.id.find(character.locationId);
    const toLocation = location;
    const isCrossRegion = fromLocation!.regionId !== toLocation.regionId;
    const staminaCost = isCrossRegion ? TRAVEL_CONFIG.CROSS_REGION_STAMINA : TRAVEL_CONFIG.WITHIN_REGION_STAMINA;

    // Collect all traveling characters
    const travelingCharacters: (typeof deps.Character.rowType)[] = [];
    const groupId = effectiveGroupId(character);
    if (groupId && isGroupLeaderOrSolo(ctx, character)) {
      const group = ctx.db.group.id.find(groupId);
      if (group && group.leaderCharacterId === character.id) {
        // Group leader - add leader and following members at same location
        travelingCharacters.push(character);
        for (const member of ctx.db.group_member.by_group.filter(group.id)) {
          if (!member.followLeader) continue;
          const memberCharacter = ctx.db.character.id.find(member.characterId);
          if (
            memberCharacter &&
            memberCharacter.locationId === originLocationId &&
            memberCharacter.locationId !== location.id
          ) {
            travelingCharacters.push(memberCharacter);
          }
        }
      } else {
        // Solo
        travelingCharacters.push(character);
      }
    } else {
      // Solo or follower (follower shouldn't move on their own, but handle as solo)
      travelingCharacters.push(character);
    }

    // Validate ALL-OR-NOTHING stamina (using each traveler's effective cost)
    for (const traveler of travelingCharacters) {
      const costIncrease = traveler.racialTravelCostIncrease ?? 0n;
      const costDiscount = traveler.racialTravelCostDiscount ?? 0n;
      const rawCost = staminaCost + costIncrease;
      const abilityDiscount = [...ctx.db.character_effect.by_character.filter(traveler.id)]
        .filter((e: any) => e.effectType === 'travel_discount' && e.roundsRemaining > 0n)
        .reduce((sum: bigint, e: any) => sum + BigInt(e.magnitude), 0n);
      const totalDiscount = costDiscount + abilityDiscount;
      const effectiveCost = rawCost > totalDiscount ? rawCost - totalDiscount : 0n;
      if (traveler.stamina < effectiveCost) {
        return fail(ctx, character, `${traveler.name} does not have enough stamina to travel`);
      }
    }

    // Check cross-region cooldown (only for cross-region travel)
    if (isCrossRegion) {
      for (const traveler of travelingCharacters) {
        const cooldowns = [...ctx.db.travel_cooldown.by_character.filter(traveler.id)];
        const activeCooldown = cooldowns.find(cd => cd.readyAtMicros > ctx.timestamp.microsSinceUnixEpoch);
        if (activeCooldown) {
          const remainingSec = Number((activeCooldown.readyAtMicros - ctx.timestamp.microsSinceUnixEpoch) / 1_000_000n);
          return fail(ctx, character, `${traveler.name} cannot travel to another region yet (${remainingSec}s remaining)`);
        }
        // Clean up expired cooldowns opportunistically
        for (const cd of cooldowns) {
          if (cd.readyAtMicros <= ctx.timestamp.microsSinceUnixEpoch) {
            ctx.db.travel_cooldown.id.delete(cd.id);
          }
        }
      }
    }

    // Deduct stamina and apply cooldowns (using each traveler's effective cost)
    for (const traveler of travelingCharacters) {
      const costIncrease = traveler.racialTravelCostIncrease ?? 0n;
      const costDiscount = traveler.racialTravelCostDiscount ?? 0n;
      const rawCost = staminaCost + costIncrease;
      const abilityDiscount = [...ctx.db.character_effect.by_character.filter(traveler.id)]
        .filter((e: any) => e.effectType === 'travel_discount' && e.roundsRemaining > 0n)
        .reduce((sum: bigint, e: any) => sum + BigInt(e.magnitude), 0n);
      const totalDiscount = costDiscount + abilityDiscount;
      const effectiveCost = rawCost > totalDiscount ? rawCost - totalDiscount : 0n;
      ctx.db.character.id.update({ ...traveler, stamina: traveler.stamina - effectiveCost });
      if (isCrossRegion) {
        const existingCd = [...ctx.db.travel_cooldown.by_character.filter(traveler.id)][0];
        // Apply travel cooldown reduction perk
        const travelCdReduction = getPerkBonusByField(ctx, traveler.id, 'travelCooldownReduction', traveler.level);
        const baseCooldown = TRAVEL_CONFIG.CROSS_REGION_COOLDOWN_MICROS;
        const reducedCooldown = travelCdReduction > 0
          ? (baseCooldown * BigInt(100 - Math.min(travelCdReduction, 80))) / 100n
          : baseCooldown;
        const readyAt = ctx.timestamp.microsSinceUnixEpoch + reducedCooldown;
        if (existingCd) {
          ctx.db.travel_cooldown.id.update({ ...existingCd, readyAtMicros: readyAt });
        } else {
          ctx.db.travel_cooldown.insert({ id: 0n, characterId: traveler.id, readyAtMicros: readyAt });
        }
      }
    }

    // Execute movement for each character (re-read fresh row for location update)
    const moveOne = (charId: bigint) => {
      const row = ctx.db.character.id.find(charId)!;
      ctx.db.character.id.update({ ...row, locationId: location.id });
      appendPrivateEvent(
        ctx,
        row.id,
        row.ownerUserId,
        'move',
        `You travel to ${location.name}. ${location.description}`
      );
      appendLocationEvent(ctx, originLocationId, 'move', `${row.name} departs.`, row.id);
      appendLocationEvent(ctx, location.id, 'move', `${row.name} arrives.`, row.id);
      ensureSpawnsForLocation(ctx, location.id);
      performPassiveSearch(ctx, ctx.db.character.id.find(charId)!, location.id, appendPrivateEvent);

      // AUTO-REGISTER for active world events in destination region
      // Region entry creates EventContribution row with count=0 (rewards only if count > 0)
      const destLocation = ctx.db.location.id.find(location.id);
      if (destLocation) {
        const destRegionId = destLocation.regionId;
        for (const event of ctx.db.world_event.by_region.filter(destRegionId)) {
          if (event.status !== 'active') continue;
          // Check if character already has a contribution row for this event
          let alreadyRegistered = false;
          for (const contrib of ctx.db.event_contribution.by_character.filter(charId)) {
            if (contrib.eventId === event.id) {
              alreadyRegistered = true;
              break;
            }
          }
          if (!alreadyRegistered) {
            ctx.db.event_contribution.insert({
              id: 0n,
              eventId: event.id,
              characterId: charId,
              count: 0n,
              regionEnteredAt: ctx.timestamp,
            });
          }
        }
      }

      // AUTO-JOIN: If character's group has active combat at this location, join it
      const movedChar = ctx.db.character.id.find(charId)!;
      const gId = effectiveGroupId(movedChar);
      if (gId && !activeCombatIdForCharacter(ctx, movedChar.id)) {
        // Find active combat for this group at this location
        for (const combat of ctx.db.combat_encounter.by_group.filter(gId)) {
          if (combat.state !== 'active' || combat.locationId !== location.id) continue;
          // Character is not already a participant
          const alreadyIn = [...ctx.db.combat_participant.by_character.filter(movedChar.id)]
            .some(p => p.combatId === combat.id);
          if (alreadyIn) break;

          // Add as combat participant — use character's weapon speed
          const joinWeapon = deps.getEquippedWeaponStats(ctx, movedChar.id);
          ctx.db.combat_participant.insert({
            id: 0n,
            combatId: combat.id,
            characterId: movedChar.id,
            status: 'active',
            nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + joinWeapon.speed,
          });

          // Add aggro entries for all living enemies in this combat
          const enemies = [...ctx.db.combat_enemy.by_combat.filter(combat.id)];
          for (const enemy of enemies) {
            if (enemy.currentHp <= 0n) continue;
            ctx.db.aggro_entry.insert({
              id: 0n,
              combatId: combat.id,
              enemyId: enemy.id,
              characterId: movedChar.id,
              petId: undefined,
              value: 0n,
            });
          }

          // Auto-target first living enemy if character has no target
          const firstLiving = enemies.find(e => e.currentHp > 0n);
          if (firstLiving && !movedChar.combatTargetEnemyId) {
            ctx.db.character.id.update({ ...movedChar, combatTargetEnemyId: firstLiving.id });
          }

          appendPrivateEvent(ctx, movedChar.id, movedChar.ownerUserId, 'combat',
            'You join your group in combat!');
          if (appendGroupEvent) {
            appendGroupEvent(ctx, gId, movedChar.id, 'combat',
              `${movedChar.name} joins the fight!`);
          }
          break; // Only join one combat
        }
      }
    };

    for (const traveler of travelingCharacters) {
      moveOne(traveler.id);
    }
  });
};
