// pools.ts (reducers)
// The density pool reducers of Phase 51.3.1.1. pull_family (SC3, D-11, D-12, D-32, D-56): pull a
// creature family at your place. The family sends a group sized by its density (Scarce 1, Stable
// 1-2, Overrun 2-4, roles by rule, trimmed when it is far above the party's lowest member) and the
// fight starts at once. Every roll and draw goes through helpers/encounters.ts.

import { countToLevel } from '../data/density_rules';
import { pullLeadIn, pullRefusal } from '../data/density_lines';
import { drawForPull, rosterLevel, startPoolFight } from '../helpers/encounters';
import { fightRoster, getGroupOrSoloParticipants } from '../helpers/group';
import { settlePool } from '../helpers/pools';

/**
 * Refusal lines of pull_family (PROPOSED, D-58: listed in 51.3.1.1-11-SUMMARY.md for the one copy
 * review). A wiped-out family uses density_lines pullRefusal ("There are no {plural} here to pull.").
 */
export const PULL_REFUSALS = Object.freeze({
  notHere: 'That is not here.',
  safe: 'Nothing will fight you here.',
  fighting: 'You are already in a fight.',
  gathering: 'Finish gathering first.',
});

export const registerPoolReducers = (deps: any) => {
  const { spacetimedb, t, requireCharacterOwnedBy, activeCombatIdForCharacter, effectiveGroupId, fail } = deps;

  const refuse = (ctx: any, character: any, message: string) => fail(ctx, character, message, 'combat');

  spacetimedb.reducer('pull_family', { characterId: t.u64(), poolId: t.u64() }, (ctx: any, args: any) => {
    // Ownership first (T-51.3.1.1-33): a foreign character id throws before anything is read.
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    if (activeCombatIdForCharacter(ctx, character.id)) return refuse(ctx, character, PULL_REFUSALS.fighting);
    for (const _gather of ctx.db.resource_gather.by_character.filter(character.id)) {
      return refuse(ctx, character, PULL_REFUSALS.gathering);
    }

    // The pool must be a creature pool at the character's place, at a place that is not safe
    // (T-51.3.1.1-34). A missing, foreign or resource pool reads the same: it is not here.
    const stored = ctx.db.place_pool.id.find(args.poolId);
    if (!stored || stored.kind !== 'creature' || stored.locationId !== character.locationId) {
      return refuse(ctx, character, PULL_REFUSALS.notHere);
    }
    const location = ctx.db.location.id.find(character.locationId);
    if (!location || location.isSafe) return refuse(ctx, character, PULL_REFUSALS.safe);
    const family = ctx.db.creature_family.id.find(stored.refId);
    if (!family) return refuse(ctx, character, PULL_REFUSALS.notHere);

    const now: bigint = ctx.timestamp.microsSinceUnixEpoch;
    const pool = settlePool(ctx, stored, now).pool;
    if (countToLevel(pool.count) === 0) return refuse(ctx, character, pullRefusal(family.pluralNoun));

    // The fight roster (online, here, not in another fight) and its LOWEST level (D-56).
    const candidates = getGroupOrSoloParticipants(ctx, character);
    const roster = fightRoster(character, candidates, (characterId: bigint) => activeCombatIdForCharacter(ctx, characterId) !== null);
    const drawn = drawForPull(ctx, pool, family, rosterLevel(roster), character.id, now);
    if (drawn.length === 0) return refuse(ctx, character, pullRefusal(family.pluralNoun));

    startPoolFight(deps, ctx, {
      leader: character,
      candidates,
      groupId: effectiveGroupId(character) ?? null,
      pool,
      family,
      drawn,
      originKind: 'pull',
      line: { kind: 'combat', text: pullLeadIn(drawn.length, family.singularNoun, family.pluralNoun) },
    });
  });
};
