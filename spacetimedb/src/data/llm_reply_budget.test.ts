/**
 * Phase 51.3.1.2 (Plan 04, D-12): the free reply-budget guard. No LLM call, no network.
 *
 * A route whose reply is cut at max_tokens fails (a truncated JSON reply cannot be applied), so each
 * world generation route must leave room for the largest reply its approved wording can ask for. The
 * guard builds that largest reply as a fixture and estimates its output tokens at 3 characters per
 * token, the conservative rule the request reservation already uses (helpers/measurement.ts
 * reserveCostMicroUsd: 3 request characters per input token). Real JSON text usually runs nearer 3.5-4
 * characters per token, so the estimate errs high.
 *
 * Headroom (D-12): the estimate must stay at or under 80% of the route's maxTokens, leaving a fifth of
 * the budget for longer words than the fixture's, whitespace and the model's own variance, until the
 * owner's paid measurement at milestone end replaces the budget (the route is insufficient_data until then).
 *
 * The 2b case (world_gen_families) is here. Plan 51.3.1.2-10 adds the 2a case (world_gen).
 */
import { describe, it, expect } from 'vitest';
import { LLM_ROUTES } from './llm_routes';
import { DENSITY_RULES } from './density_rules';
import { FAMILY_ICON_KEYS, FAMILY_TEMPERAMENTS, FAMILY_RELATIONS, FAMILY_PROMPT_ROLES } from './mechanical_vocabulary';
import { validateFamilies, FAMILY_HISTORY_MAX_CHARS, type FamilyPlace } from '../helpers/family_validate';

/** Characters per output token for the estimate (the reservation rule of measurement.ts). */
const CHARS_PER_TOKEN = 3;
/** The share of maxTokens the largest asked reply may fill (D-12). */
const HEADROOM_SHARE = 0.8;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const longest = (xs: readonly string[]): string => xs.reduce((a, b) => (b.length > a.length ? b : a));
/** `base` padded with lowercase letters to exactly `n` characters (letters only, so the validator keeps it). */
const pad = (base: string, n: number): string => (base + 'x'.repeat(n)).slice(0, n);

/** The largest family count the 2b message can ask for (the Families line, D-66). */
const FAMILIES = DENSITY_RULES.FAMILY_COUNT_MAX;
const NAME_CHARS = 32;
const NOUN_CHARS = 16;
const CREATURE_TYPE_CHARS = 16;
const AMBUSH_VERB_CHARS = 10;
const AMBUSH_REST_CHARS = 40;
const FIT_PLACES = 3;
const RELATIONS = 3;

/** Three-word names of exactly NAME_CHARS characters, unique by their first word. */
const familyName = (i: number): string => pad(`Fam${LETTERS[i]}ily Salt Crust`, NAME_CHARS);
const memberName = (i: number, r: number): string => pad(`Mem${LETTERS[i]}${LETTERS[r]}ber Shell Back`, NAME_CHARS);
const placeName = (p: number): string => pad(`Pla${LETTERS[p]}ce Glass Wort`, NAME_CHARS);

const PLACES: FamilyPlace[] = Array.from({ length: FAMILIES + FIT_PLACES }, (_, p) => ({
  name: placeName(p),
  isSafe: false,
  isHub: false,
  terrainType: 'swamp',
}));

/** The largest 2b reply the approved wording asks for (section 2 of the 51.3.1.2 draft). */
function largestFamiliesReply(): { families: Record<string, unknown>[] } {
  const history = `${pad('They came up through the salt in the dry years and', FAMILY_HISTORY_MAX_CHARS / 2 - 1)}. ${pad(
    'Their feud with the wardens of the gate has never cooled',
    FAMILY_HISTORY_MAX_CHARS / 2 - 2,
  )}.`;
  return {
    families: Array.from({ length: FAMILIES }, (_, i) => ({
      name: familyName(i),
      singularNoun: pad('skitterer', NOUN_CHARS),
      pluralNoun: pad('skitterers', NOUN_CHARS),
      creatureType: pad('aberration', CREATURE_TYPE_CHARS),
      iconKey: longest(FAMILY_ICON_KEYS),
      temperament: longest(FAMILY_TEMPERAMENTS),
      ambushVerb: pad('swarm', AMBUSH_VERB_CHARS),
      ambushRest: pad('up through the salt', AMBUSH_REST_CHARS),
      members: FAMILY_PROMPT_ROLES.map((role, r) => ({ role, name: memberName(i, r) })),
      fitLocations: Array.from({ length: FIT_PLACES }, (_, k) => placeName(i + k)),
      relations: Array.from({ length: RELATIONS }, (_, k) => ({
        family: familyName((i + k + 1) % FAMILIES),
        kind: longest(FAMILY_RELATIONS),
      })),
      history,
      inFeud: true,
    })),
  };
}

const estimateTokens = (reply: unknown): number => Math.ceil(JSON.stringify(reply).length / CHARS_PER_TOKEN);

describe('reply budget guard, stage 2b world_gen_families (D-12)', () => {
  const reply = largestFamiliesReply();

  it('the fixture is the largest asked reply: 15 families of 4 members at the validator caps', () => {
    expect(FAMILIES).toBe(15);
    expect(reply.families).toHaveLength(15);
    const f = reply.families[0] as Record<string, any>;
    expect(f.name).toHaveLength(NAME_CHARS);
    expect(f.members).toHaveLength(4);
    expect(f.members[0].name).toHaveLength(NAME_CHARS);
    expect(f.fitLocations).toHaveLength(FIT_PLACES);
    expect(f.relations).toHaveLength(RELATIONS);
    expect(f.history).toHaveLength(FAMILY_HISTORY_MAX_CHARS);
    expect(f.ambushRest).toHaveLength(AMBUSH_REST_CHARS);
  });

  it('the fixture passes validateFamilies with the server count 15 (every family kept)', () => {
    const { families } = validateFamilies(reply, { regionId: 1n, places: PLACES, isTaken: () => false, familyCount: FAMILIES });
    expect(families).not.toBeNull();
    expect(families!).toHaveLength(FAMILIES);
    for (const family of families!) {
      expect(family.members).toHaveLength(4);
      expect(family.fitLocationNames).toHaveLength(FIT_PLACES);
      expect(family.history.length).toBeGreaterThan(0);
    }
  });

  it('its estimate at 3 characters per token stays at or under 80% of the route maxTokens', () => {
    const estimate = estimateTokens(reply);
    const limit = HEADROOM_SHARE * LLM_ROUTES.world_gen_families.maxTokens;
    expect(estimate, `estimate ${estimate} tokens vs ${limit}`).toBeLessThanOrEqual(limit);
  });
});
