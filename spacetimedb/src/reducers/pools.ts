// pools.ts (reducers)
// The density pool reducers of Phase 51.3.1.1.
//   - pull_family (SC3, D-11, D-12, D-32, D-56): pull a creature family at your place. The family
//     sends a group sized by its density (Scarce 1, Stable 1-2, Overrun 2-4, roles by rule, trimmed
//     when it is far above the party's lowest member) and the fight starts at once.
//   - gather_pool (SC4, D-13, D-26..D-28, D-38, D-55): gather from a shared resource pool at your
//     place, capped per player and place, only at the resource's time of day; at a place that is not
//     safe the gather can draw an ambush from the creature pools instead. finish_gather
//     (reducers/items_gathering.ts) pays out by density and depletes the pool.
// Every roll and draw goes through helpers/encounters.ts.

import { DENSITY_RULES, countToLevel } from '../data/density_rules';
import {
  ambushLine,
  exhaustedRefusal,
  harvestCapRefusal,
  outOfTimeRefusal,
  placeNounFor,
} from '../data/density_lines';
import { drawGroup, pullFamilyFor, rollEncounter, rosterLevel, startPoolFight } from '../helpers/encounters';
import { fightRoster, getGroupOrSoloParticipants } from '../helpers/group';
import { gatherDurationMicros, harvestCappedFor } from '../helpers/harvest';
import { isNightTime } from '../helpers/location';
import { settlePool } from '../helpers/pools';

/**
 * Refusal lines of pull_family (PROPOSED, D-58: listed in 51.3.1.1-11-SUMMARY.md for the one copy
 * review). They live in helpers/encounters.ts with the shared pull body (pullFamilyFor) since Plan 16.
 */
export { PULL_REFUSALS } from '../helpers/encounters';

/**
 * Refusal lines of gather_pool (PROPOSED, D-58: listed in 51.3.1.1-12-SUMMARY.md for the one copy
 * review). The cap, time-of-day and exhausted refusals come from density_lines.
 */
export const GATHER_REFUSALS = Object.freeze({
  notHere: 'That is not here.',
  fighting: 'You cannot gather during a fight.',
  gathering: 'You are already gathering.',
});

export const registerPoolReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    ScheduleAt,
    requireCharacterOwnedBy,
    activeCombatIdForCharacter,
    effectiveGroupId,
    logPrivateAndGroup,
    fail,
  } = deps;

  const refuse = (ctx: any, character: any, message: string) => fail(ctx, character, message, 'combat');
  const refuseGather = (ctx: any, character: any, message: string) => fail(ctx, character, message, 'system');

  spacetimedb.reducer('pull_family', { characterId: t.u64(), poolId: t.u64() }, (ctx: any, args: any) => {
    // Ownership first (T-51.3.1.1-33): a foreign character id throws before anything is read.
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    // The one pull body, shared with the typed pull (helpers/encounters.ts, Plan 16).
    const stored = ctx.db.place_pool.id.find(args.poolId);
    const refusal = pullFamilyFor(deps, ctx, character, stored, ctx.timestamp.microsSinceUnixEpoch);
    if (refusal) return refuse(ctx, character, refusal);
  });

  spacetimedb.reducer('gather_pool', { characterId: t.u64(), poolId: t.u64() }, (ctx: any, args: any) => {
    // Ownership first (T-51.3.1.1-38): a foreign character id throws before anything is read.
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    if (activeCombatIdForCharacter(ctx, character.id)) return refuseGather(ctx, character, GATHER_REFUSALS.fighting);
    for (const _gather of ctx.db.resource_gather.by_character.filter(character.id)) {
      return refuseGather(ctx, character, GATHER_REFUSALS.gathering);
    }

    // The pool must be a resource pool at the character's place. A missing, foreign or creature pool
    // reads the same: it is not here.
    const stored = ctx.db.place_pool.id.find(args.poolId);
    if (!stored || stored.kind !== 'resource' || stored.locationId !== character.locationId) {
      return refuseGather(ctx, character, GATHER_REFUSALS.notHere);
    }
    const location = ctx.db.location.id.find(character.locationId);
    const template = ctx.db.item_template.id.find(stored.refId);
    if (!location || !template) return refuseGather(ctx, character, GATHER_REFUSALS.notHere);
    const resource: string = template.name;

    // Time of day (D-55): a night resource only at night, a day resource only by day.
    const timeOfDay: string = stored.timeOfDay || 'any';
    const night = isNightTime(ctx);
    if (timeOfDay === 'night' && !night) return refuseGather(ctx, character, outOfTimeRefusal(resource, true));
    if (timeOfDay === 'day' && night) return refuseGather(ctx, character, outOfTimeRefusal(resource, false));

    const now: bigint = ctx.timestamp.microsSinceUnixEpoch;
    const pool = settlePool(ctx, stored, now).pool;
    if (countToLevel(pool.count) === 0) {
      return refuseGather(ctx, character, exhaustedRefusal(resource, placeNounFor(location)));
    }
    // The per-player, per-place cap (D-27, T-51.3.1.1-37).
    if (harvestCappedFor(ctx, character.id, location.id, now)) return refuseGather(ctx, character, harvestCapRefusal());

    // The gather ambush (D-13, D-29): at a place that is not safe, one seeded roll over the creature
    // pools at GATHER_AMBUSH_FACTOR_PCT of the place chance, with the roster's LOWEST level (D-56). A
    // place whose families are all wiped out never ambushes. A hit starts the fight instead of the gather.
    if (!location.isSafe) {
      const candidates = getGroupOrSoloParticipants(ctx, character);
      const roster = fightRoster(character, candidates, (characterId: bigint) => activeCombatIdForCharacter(ctx, characterId) !== null);
      const level = rosterLevel(roster);
      const hit = rollEncounter(ctx, {
        locationId: location.id,
        isSafe: false,
        partyLevel: level,
        phase: 'gather',
        leaderId: character.id,
        now,
        factorPct: DENSITY_RULES.GATHER_AMBUSH_FACTOR_PCT,
      });
      if (hit) {
        const drawn = drawGroup(ctx, { pool: hit.pool, family: hit.family, partyLevel: level, seed: hit.seed });
        if (drawn.length > 0) {
          const family = hit.family;
          startPoolFight(deps, ctx, {
            leader: character,
            candidates,
            groupId: effectiveGroupId(character) ?? null,
            pool: hit.pool,
            family,
            drawn,
            originKind: 'ambush_gather',
            line: {
              kind: 'ambush',
              text: ambushLine({
                phase: 'gather',
                party: roster.length > 1,
                placeName: location.name,
                resource,
                count: drawn.length,
                singular: family.singularNoun,
                plural: family.pluralNoun,
                verb: family.ambushVerb ?? '',
                rest: family.ambushRest ?? '',
              }),
            },
          });
          return;
        }
      }
    }

    // The gather: the same cast as a node gather (gatherSpeedBonus shortens it); finish_gather pays out.
    const endsAt = now + gatherDurationMicros(ctx, character);
    const gather = ctx.db.resource_gather.insert({
      id: 0n,
      characterId: character.id,
      nodeId: 0n,
      endsAtMicros: endsAt,
      poolId: pool.id,
    });
    ctx.db.resource_gather_tick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(endsAt),
      gatherId: gather.id,
    });
    logPrivateAndGroup(
      ctx,
      character,
      'system',
      `You begin gathering ${resource}.`,
      `${character.name} begins gathering ${resource}.`
    );
  });
};
