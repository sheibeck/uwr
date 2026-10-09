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
 * Phase 51.3.1.2 (D-19): the region-creation routes now share the generous REGION_CREATION_MAX_TOKENS, so
 * these guards are a sanity check (the largest asked reply fits under the cap), no longer the rule that
 * sets the budget.
 *
 * Two cases: stage 2b (world_gen_families, Plan 04) and stage 2a (world_gen, Plan 10: places and people).
 */
import { describe, it, expect } from 'vitest';
import { LLM_ROUTES } from './llm_routes';
import { REGION_CREATION_MAX_TOKENS } from './llm_tuning';
import { DENSITY_RULES } from './density_rules';
import { FAMILY_ICON_KEYS, FAMILY_TEMPERAMENTS, FAMILY_RELATIONS, FAMILY_PROMPT_ROLES } from './mechanical_vocabulary';
import { validateFamilies, FAMILY_HISTORY_MAX_CHARS, type FamilyPlace } from '../helpers/family_validate';
import { REGION_FILL_SCHEMA } from './llm_schemas';

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

// ---------------------------------------------------------------------------
// Stage 2a (world_gen, Plan 51.3.1.2-10): places and people
// ---------------------------------------------------------------------------

/** The new places of the largest region: REGION_PLACES_MAX in all, the arrival point included (section 1). */
const NEW_PLACES = DENSITY_RULES.REGION_PLACES_MAX - 1;
/** The 5 more NPCs the wording allows (3-5) plus a vendor and a banker at each of the 2 hubs a region can have. */
const MORE_NPCS = 5;
const MAX_HUBS = 2;
const NPCS = MORE_NPCS + 2 * MAX_HUBS;
const PLACE_WORD_CHARS = 16;
const PLACE_DESCRIPTION_CHARS = 300;
const CONNECTS = 3;
const NPC_DESCRIPTION_CHARS = 240;
const GREETING_CHARS = 120;
const TRAITS = 3;
const TRAIT_CHARS = 16;
const SPEECH_CHARS = 60;
const DOMAINS = 3;
const DOMAIN_CHARS = 20;
const SECRETS = 2;
const SECRET_CHARS = 100;
const FACTION_CHARS = 40;
const LANDMARKS = 4;
const LANDMARK_CHARS = 40;
const THREATS = 4;
const THREAT_CHARS = 60;

const fill = REGION_FILL_SCHEMA as any;
const locationNode = fill.properties.locations.items;
const npcNode = fill.properties.npcs.items;

/** Place 0 is the arrival point; 1..NEW_PLACES are the new places. Exactly NAME_CHARS characters each. */
const regionPlaceName = (p: number): string => pad(`Reg${LETTERS[p]}ion Glass Wort`, NAME_CHARS);

/** The largest 2a reply the approved wording asks for (section 1 of the 51.3.1.2 draft). */
function largestFillReply(): Record<string, unknown> {
  return {
    dominantFaction: pad('The Wardens of the Salt Gate', FACTION_CHARS),
    landmarks: Array.from({ length: LANDMARKS }, (_, k) => pad(`The ${LETTERS[k]} Leaning Stone`, LANDMARK_CHARS)),
    threats: Array.from({ length: THREATS }, (_, k) => pad(`Crust sickness ${LETTERS[k]} in the dry season`, THREAT_CHARS)),
    arrival: { shortName: pad('Mother Pan', PLACE_WORD_CHARS), placeNoun: pad('the pans', PLACE_WORD_CHARS), isHub: true },
    locations: Array.from({ length: NEW_PLACES }, (_, i) => ({
      name: regionPlaceName(i + 1),
      shortName: pad('Glass Wort', PLACE_WORD_CHARS),
      placeNoun: pad('the glasswort', PLACE_WORD_CHARS),
      description: pad('Salt pans stretch flat and white to the horizon', PLACE_DESCRIPTION_CHARS),
      terrainType: longest(locationNode.properties.terrainType.enum),
      isHub: true,
      isSafe: true,
      connectsTo: Array.from({ length: CONNECTS }, (_, k) => regionPlaceName((i + k + 2) % (NEW_PLACES + 1))),
    })),
    npcs: Array.from({ length: NPCS }, (_, i) => ({
      name: pad(`Mar${LETTERS[i]}ta Vell`, NAME_CHARS),
      gender: longest(npcNode.properties.gender.enum),
      npcType: longest(npcNode.properties.npcType.enum),
      locationName: regionPlaceName(i % (NEW_PLACES + 1)),
      description: pad('She keeps the tally of the brine wells', NPC_DESCRIPTION_CHARS),
      greeting: pad('Mind the plates, they crack', GREETING_CHARS),
      personality: {
        traits: Array.from({ length: TRAITS }, () => pad('watchful', TRAIT_CHARS)),
        speechPattern: pad('Short sentences, salt words', SPEECH_CHARS),
        knowledgeDomains: Array.from({ length: DOMAINS }, () => pad('brine wells', DOMAIN_CHARS)),
        secrets: Array.from({ length: SECRETS }, () => pad('She sold the old well map', SECRET_CHARS)),
        affinityMultiplier: 1.25,
      },
    })),
  };
}

describe('reply budget guard, stage 2a world_gen (D-12)', () => {
  const reply = largestFillReply() as Record<string, any>;

  it('the fixture has exactly the REGION_FILL_SCHEMA shape (no families, no levelOffset)', () => {
    expect(Object.keys(reply)).toEqual(fill.required);
    expect(Object.keys(reply.arrival)).toEqual(fill.properties.arrival.required);
    expect(Object.keys(reply.locations[0])).toEqual(locationNode.required);
    expect(Object.keys(reply.npcs[0])).toEqual(npcNode.required);
    expect(Object.keys(reply.npcs[0].personality)).toEqual(npcNode.properties.personality.required);
  });

  it('the fixture is the largest asked reply: 9 new places and 9 NPCs at the fixture sizes', () => {
    expect(NEW_PLACES).toBe(9);
    expect(NPCS).toBe(9);
    expect(reply.locations).toHaveLength(9);
    expect(reply.npcs).toHaveLength(9);
    const loc = reply.locations[0];
    expect(loc.name).toHaveLength(NAME_CHARS);
    expect(loc.shortName).toHaveLength(PLACE_WORD_CHARS);
    expect(loc.placeNoun).toHaveLength(PLACE_WORD_CHARS);
    expect(loc.description).toHaveLength(PLACE_DESCRIPTION_CHARS);
    expect(loc.connectsTo).toHaveLength(CONNECTS);
    for (const name of loc.connectsTo) expect(name).toHaveLength(NAME_CHARS);
    const npc = reply.npcs[0];
    expect(npc.name).toHaveLength(NAME_CHARS);
    expect(npc.locationName).toHaveLength(NAME_CHARS);
    expect(npc.description).toHaveLength(NPC_DESCRIPTION_CHARS);
    expect(npc.greeting).toHaveLength(GREETING_CHARS);
    expect(npc.personality.traits).toHaveLength(TRAITS);
    expect(npc.personality.traits[0]).toHaveLength(TRAIT_CHARS);
    expect(npc.personality.speechPattern).toHaveLength(SPEECH_CHARS);
    expect(npc.personality.knowledgeDomains).toHaveLength(DOMAINS);
    expect(npc.personality.knowledgeDomains[0]).toHaveLength(DOMAIN_CHARS);
    expect(npc.personality.secrets).toHaveLength(SECRETS);
    expect(npc.personality.secrets[0]).toHaveLength(SECRET_CHARS);
    expect(reply.dominantFaction).toHaveLength(FACTION_CHARS);
    expect(reply.landmarks).toHaveLength(LANDMARKS);
    expect(reply.landmarks[0]).toHaveLength(LANDMARK_CHARS);
    expect(reply.threats).toHaveLength(THREATS);
    expect(reply.threats[0]).toHaveLength(THREAT_CHARS);
    expect(reply.arrival.shortName).toHaveLength(PLACE_WORD_CHARS);
    expect(reply.arrival.placeNoun).toHaveLength(PLACE_WORD_CHARS);
  });

  it('its estimate at 3 characters per token stays at or under 80% of the route maxTokens', () => {
    const estimate = estimateTokens(reply);
    const limit = HEADROOM_SHARE * LLM_ROUTES.world_gen.maxTokens;
    expect(estimate, `estimate ${estimate} tokens vs ${limit}`).toBeLessThanOrEqual(limit);
  });

  it('sanity check (D-19): the budget is the shared region-creation cap and the largest asked reply fits well under it', () => {
    const estimate = estimateTokens(reply);
    const budget = LLM_ROUTES.world_gen.maxTokens;
    expect(budget).toBe(REGION_CREATION_MAX_TOKENS);
    expect(LLM_ROUTES.world_gen_families.maxTokens).toBe(REGION_CREATION_MAX_TOKENS);
    // A sanity bound, not a budget rule: the estimate stays at or under the 80% headroom of the cap.
    expect(estimate).toBeGreaterThan(0);
    expect(estimate, `estimate ${estimate} tokens vs cap ${budget}`).toBeLessThanOrEqual(HEADROOM_SHARE * budget);
  });
});
