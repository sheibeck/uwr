import { TRAVEL_CONFIG, travelEffectDiscount, travelStaminaCost } from '../data/travel_config';
import { comesAlongWithLeader } from '../data/group_config';
import { performPassiveSearch } from './search';
import { getPerkBonusByField } from './renown';
import { buildLookOutput } from './look';
import { startWorldGeneration } from './world_gen';
import { beginCombatCooldowns } from './combat_round_state';
import { markLocationVisited } from './visited';
import { collapsePassageIfEmpty } from './passages';

/** The deps performTravel needs (the fight start comes in through startCombat, the bound form). */
export interface TravelDeps {
  appendSystemMessage: (ctx: any, character: any, msg: string) => void;
  appendPrivateEvent: (ctx: any, charId: bigint, ownerId: any, kind: string, msg: string) => void;
  appendLocationEvent: (ctx: any, locationId: bigint, kind: string, msg: string, charId?: bigint) => void;
  appendGroupEvent?: (ctx: any, groupId: bigint, charId: bigint, kind: string, msg: string) => void;
  areLocationsConnected: (ctx: any, fromId: bigint, toId: bigint) => boolean;
  activeCombatIdForCharacter: (ctx: any, charId: bigint) => bigint | undefined;
  ensurePoolsForLocation: (ctx: any, locationId: bigint) => void;
  isGroupLeaderOrSolo: (ctx: any, character: any) => boolean;
  effectiveGroupId: (character: any) => bigint | undefined;
  /** index.ts reducerDeps.startCombat: (ctx, leader, candidates, groupId, drawn, origin) => combat row. */
  startCombat: (...args: any[]) => any;
}

/**
 * The one deps builder for every travel caller (move_character and both typed travel paths), picked
 * from the module deps bag, so no caller can miss a dependency (the fight start above all). Call it
 * inside the reducer: index.ts fills reducerDeps.startCombat after the bag is built.
 */
export function travelDeps(deps: any): TravelDeps {
  return {
    appendSystemMessage: deps.appendSystemMessage,
    appendPrivateEvent: deps.appendPrivateEvent,
    appendLocationEvent: deps.appendLocationEvent,
    appendGroupEvent: deps.appendGroupEvent,
    areLocationsConnected: deps.areLocationsConnected,
    activeCombatIdForCharacter: deps.activeCombatIdForCharacter,
    ensurePoolsForLocation: deps.ensurePoolsForLocation,
    isGroupLeaderOrSolo: deps.isGroupLeaderOrSolo,
    effectiveGroupId: deps.effectiveGroupId,
    startCombat: deps.startCombat,
  };
}

/**
 * Shared travel logic used by both move_character reducer and narrative intent handler.
 * Handles validation, stamina costs, cross-region cooldowns, group travel,
 * pool seeding (ensurePoolsForLocation), passive search, auto-look, world events, and auto-join group combat.
 *
 * Errors are reported via deps.appendSystemMessage (the fail() pattern).
 * Returns true if travel succeeded, false if blocked.
 */
export function performTravel(
  ctx: any,
  deps: TravelDeps,
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
    ensurePoolsForLocation,
    isGroupLeaderOrSolo,
    effectiveGroupId,
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

  // Collect all traveling characters (group travel)
  const travelingCharacters: any[] = [];
  const groupId = effectiveGroupId(character);
  if (groupId && isGroupLeaderOrSolo(ctx, character)) {
    const group = ctx.db.group.id.find(groupId);
    if (group && group.leaderCharacterId === character.id) {
      // Group leader - add the leader and the members who come along. The owner's rule: a member
      // travels only while following, online and standing at the leader's place; offline members are
      // left behind (no move, no stamina check, no region timer). src/map/travelChecks.ts and
      // src/social/follow.ts mirror it through the same predicate (parity test in plan 51.1-07).
      travelingCharacters.push(character);
      for (const member of ctx.db.group_member.by_group.filter(group.id)) {
        // The leader is already in the list; his own member row must not move him twice (WR-03).
        if (member.characterId === character.id) continue;
        const memberCharacter = ctx.db.character.id.find(member.characterId);
        if (!memberCharacter) continue;
        const online = memberCharacter.online === true;
        if (
          comesAlongWithLeader({
            followLeader: member.followLeader,
            online,
            atLeaderPlace: memberCharacter.locationId === originLocationId,
          }) &&
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
    // The one stamina rule (data/travel_config.ts), shared with the client's displayed cost.
    const effectiveCost = travelStaminaCost({
      crossRegion: isCrossRegion,
      racialIncrease: traveler.racialTravelCostIncrease,
      racialDiscount: traveler.racialTravelCostDiscount,
      effectDiscount: travelEffectDiscount([...ctx.db.character_effect.by_character.filter(traveler.id)]),
    });
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
    // The one stamina rule (data/travel_config.ts), shared with the client's displayed cost.
    const effectiveCost = travelStaminaCost({
      crossRegion: isCrossRegion,
      racialIncrease: traveler.racialTravelCostIncrease,
      racialDiscount: traveler.racialTravelCostDiscount,
      effectDiscount: travelEffectDiscount([...ctx.db.character_effect.by_character.filter(traveler.id)]),
    });
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
    // Visited places: the origin gets a row when it has none, the destination records where this arrival came from.
    markLocationVisited(ctx, row.id, originLocationId);
    markLocationVisited(ctx, row.id, location.id, originLocationId);
    appendPrivateEvent(ctx, row.id, row.ownerUserId, 'move', `You travel to ${location.name}.`);
    appendLocationEvent(ctx, originLocationId, 'move', `${row.name} departs.`, row.id);
    appendLocationEvent(ctx, location.id, 'move', `${row.name} arrives.`, row.id);
    ensurePoolsForLocation(ctx, location.id);
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

        // Rounds, not a weapon timer, pace a fight: the joiner acts at its place in the round, the
        // open round now waits for its choice (or the deadline), and its live wall-clock cooldowns
        // count in rounds from here.
        ctx.db.combat_participant.insert({
          id: 0n,
          combatId: combat.id,
          characterId: movedChar.id,
          status: 'active',
          nextAutoAttackAt: 0n,
        });
        beginCombatCooldowns(ctx, movedChar.id);

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

  // An explored passage collapses into a border crossing once its last traveller has left. Checked
  // once, after every traveller (leader and followers) has moved, so no follower targets a deleted place.
  collapsePassageIfEmpty(ctx, originLocationId);

  // Check if destination is uncharted -- trigger world generation
  const destLocation = ctx.db.location.id.find(targetLocationId);
  if (destLocation && destLocation.terrainType === 'uncharted') {
    const existingGen = [...ctx.db.world_gen_state.by_source_location.filter(targetLocationId)]
      .find((s: any) => s.step !== 'ERROR');
    if (existingGen && existingGen.step === 'COMPLETE' && existingGen.generatedRegionId) {
      // Already done
    } else if (!existingGen) {
      // We need characterId for the world_gen_state — use the lead character
      const genState = ctx.db.world_gen_state.insert({
        id: 0n,
        playerId: ctx.sender,
        characterId: character.id,
        sourceLocationId: targetLocationId,
        sourceRegionId: destLocation.regionId,
        step: 'PENDING',
        createdAt: ctx.timestamp,
        updatedAt: ctx.timestamp,
      });
      const started = startWorldGeneration(ctx, genState);
      // A refusal has already told the player how to try again; the World event line is for a real start.
      if (started === 'enqueued' || started === 'duplicate') {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          'The edges of reality shimmer around you. The world pauses, as if remembering something it had forgotten...');
      }
    }
  }

  return true;
}
