import { TRAVEL_CONFIG } from '../data/travel_config';
import { performPassiveSearch } from './search';
import { getPerkBonusByField } from './renown';
import { buildLookOutput } from './look';

/**
 * Shared travel logic used by both move_character reducer and narrative intent handler.
 * Handles validation, stamina costs, cross-region cooldowns, group travel,
 * spawns, passive search, auto-look, world events, and auto-join group combat.
 *
 * Errors are reported via deps.appendSystemMessage (the fail() pattern).
 * Returns true if travel succeeded, false if blocked.
 */
export function performTravel(
  ctx: any,
  deps: {
    appendSystemMessage: (ctx: any, character: any, msg: string) => void;
    appendPrivateEvent: (ctx: any, charId: bigint, ownerId: any, kind: string, msg: string) => void;
    appendLocationEvent: (ctx: any, locationId: bigint, kind: string, msg: string, charId?: bigint) => void;
    appendGroupEvent?: (ctx: any, groupId: bigint, charId: bigint, kind: string, msg: string) => void;
    areLocationsConnected: (ctx: any, fromId: bigint, toId: bigint) => boolean;
    activeCombatIdForCharacter: (ctx: any, charId: bigint) => bigint | undefined;
    ensureSpawnsForLocation: (ctx: any, locationId: bigint) => void;
    isGroupLeaderOrSolo: (ctx: any, character: any) => boolean;
    effectiveGroupId: (character: any) => bigint | undefined;
    getEquippedWeaponStats: (ctx: any, charId: bigint) => { speed: bigint; [k: string]: any };
  },
  character: any,
  targetLocationId: bigint
): boolean {
  const {
    appendSystemMessage,
    appendPrivateEvent,
    appendLocationEvent,
    appendGroupEvent,
    areLocationsConnected,
    activeCombatIdForCharacter,
    ensureSpawnsForLocation,
    isGroupLeaderOrSolo,
    effectiveGroupId,
    getEquippedWeaponStats,
  } = deps;

  const fail = (msg: string) => {
    appendSystemMessage(ctx, character, msg);
  };

  // Validate location exists
  const location = ctx.db.location.id.find(targetLocationId);
  if (!location) { fail('Location not found'); return false; }
  if (character.locationId === location.id) return true; // already there

  // Combat check
  if (activeCombatIdForCharacter(ctx, character.id)) {
    fail('Cannot travel while in combat');
    return false;
  }

  // Gathering check
  const activeGather = [...ctx.db.resource_gather.by_character.filter(character.id)][0];
  if (activeGather) {
    fail('Cannot travel while gathering');
    return false;
  }

  // Connection check
  if (!areLocationsConnected(ctx, character.locationId, location.id)) {
    fail('Location not connected');
    return false;
  }

  const originLocationId = character.locationId;

  // Determine if travel crosses regions
  const fromLocation = ctx.db.location.id.find(character.locationId);
  const isCrossRegion = fromLocation!.regionId !== location.regionId;
  const staminaCost = isCrossRegion ? TRAVEL_CONFIG.CROSS_REGION_STAMINA : TRAVEL_CONFIG.WITHIN_REGION_STAMINA;

  // Collect all traveling characters (group travel)
  const travelingCharacters: any[] = [];
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
      travelingCharacters.push(character);
    }
  } else {
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
      fail(`${traveler.name} does not have enough stamina to travel`);
      return false;
    }
  }

  // Check cross-region cooldown
  if (isCrossRegion) {
    for (const traveler of travelingCharacters) {
      const cooldowns = [...ctx.db.travel_cooldown.by_character.filter(traveler.id)];
      const activeCooldown = cooldowns.find((cd: any) => cd.readyAtMicros > ctx.timestamp.microsSinceUnixEpoch);
      if (activeCooldown) {
        const remainingSec = Number(BigInt(activeCooldown.readyAtMicros - ctx.timestamp.microsSinceUnixEpoch) / 1_000_000n);
        fail(`${traveler.name} cannot travel to another region yet (${remainingSec}s remaining)`);
        return false;
      }
      // Clean up expired cooldowns opportunistically
      for (const cd of cooldowns) {
        if (cd.readyAtMicros <= ctx.timestamp.microsSinceUnixEpoch) {
          ctx.db.travel_cooldown.id.delete(cd.id);
        }
      }
    }
  }

  // Deduct stamina and apply cooldowns
  for (const traveler of travelingCharacters) {
    const costIncrease = traveler.racialTravelCostIncrease ?? 0n;
    const costDiscount = traveler.racialTravelCostDiscount ?? 0n;
    const rawCost = staminaCost + costIncrease;
    const abilityDiscount = [...ctx.db.character_effect.by_character.filter(traveler.id)]
      .filter((e: any) => e.effectType === 'travel_discount' && e.roundsRemaining > 0n)
      .reduce((sum: bigint, e: any) => sum + BigInt(e.magnitude), 0n);
    const totalDiscount = costDiscount + abilityDiscount;
    const effectiveCost = rawCost > totalDiscount ? BigInt(rawCost - totalDiscount) : 0n;
    ctx.db.character.id.update({ ...traveler, stamina: traveler.stamina - effectiveCost });
    if (isCrossRegion) {
      const existingCd = [...ctx.db.travel_cooldown.by_character.filter(traveler.id)][0];
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

  // Execute movement for each character
  const moveOne = (charId: bigint) => {
    const row = ctx.db.character.id.find(charId)!;
    ctx.db.character.id.update({ ...row, locationId: location.id });
    appendPrivateEvent(ctx, row.id, row.ownerUserId, 'move', `You travel to ${location.name}.`);
    appendLocationEvent(ctx, originLocationId, 'move', `${row.name} departs.`, row.id);
    appendLocationEvent(ctx, location.id, 'move', `${row.name} arrives.`, row.id);
    ensureSpawnsForLocation(ctx, location.id);
    performPassiveSearch(ctx, ctx.db.character.id.find(charId)!, location.id, appendPrivateEvent);

    // Auto-look: show full location overview after travel
    const arrivedChar = ctx.db.character.id.find(charId);
    if (arrivedChar) {
      const lookParts = buildLookOutput(ctx, arrivedChar);
      if (lookParts.length > 0) {
        appendPrivateEvent(ctx, arrivedChar.id, arrivedChar.ownerUserId, 'look', lookParts.join('\n'));
      }
    }

    // AUTO-REGISTER for active world events in destination region
    const destLocation = ctx.db.location.id.find(location.id);
    if (destLocation) {
      const destRegionId = destLocation.regionId;
      for (const event of ctx.db.world_event.by_region.filter(destRegionId)) {
        if (event.status !== 'active') continue;
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
      for (const combat of ctx.db.combat_encounter.by_group.filter(gId)) {
        if (combat.state !== 'active' || combat.locationId !== location.id) continue;
        const alreadyIn = [...ctx.db.combat_participant.by_character.filter(movedChar.id)]
          .some((p: any) => p.combatId === combat.id);
        if (alreadyIn) break;

        const joinWeapon = getEquippedWeaponStats(ctx, movedChar.id);
        ctx.db.combat_participant.insert({
          id: 0n,
          combatId: combat.id,
          characterId: movedChar.id,
          status: 'active',
          nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + joinWeapon.speed,
        });

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

        const firstLiving = enemies.find((e: any) => e.currentHp > 0n);
        if (firstLiving && !movedChar.combatTargetEnemyId) {
          ctx.db.character.id.update({ ...movedChar, combatTargetEnemyId: firstLiving.id });
        }

        appendPrivateEvent(ctx, movedChar.id, movedChar.ownerUserId, 'combat',
          'You join your group in combat!');
        if (appendGroupEvent) {
          appendGroupEvent(ctx, gId, movedChar.id, 'combat',
            `${movedChar.name} joins the fight!`);
        }
        break;
      }
    }
  };

  for (const traveler of travelingCharacters) {
    moveOne(traveler.id);
  }

  // Check if destination is uncharted -- trigger world generation
  const destLocation = ctx.db.location.id.find(targetLocationId);
  if (destLocation && destLocation.terrainType === 'uncharted') {
    const existingGen = [...ctx.db.world_gen_state.by_source_location.filter(targetLocationId)]
      .find((s: any) => s.step !== 'ERROR');
    if (existingGen && existingGen.step === 'COMPLETE' && existingGen.generatedRegionId) {
      // Already done
    } else if (!existingGen) {
      // We need characterId for the world_gen_state — use the lead character
      ctx.db.world_gen_state.insert({
        id: 0n,
        playerId: ctx.sender,
        characterId: character.id,
        sourceLocationId: targetLocationId,
        sourceRegionId: destLocation.regionId,
        step: 'PENDING',
        createdAt: ctx.timestamp,
        updatedAt: ctx.timestamp,
      });
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        'The edges of reality ripple around you. The world pauses, as if remembering something it had forgotten...');
    }
  }

  return true;
}
