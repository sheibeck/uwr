import { describe, it, expect } from 'vitest';
// This tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { createHash } from 'node:crypto';
import { ROUTE_BLOCKS, buildWorldFillVolatile } from './llm_layers';
import type { WorldFillInput } from './llm_layers';

// ============================================================================
// world_gen_start and world_gen prompts (Phase 51.3.1.1, Plan 23; SC1, D-46, D-49, D-58 to D-62)
// ============================================================================
//
// The owner approved both blocks word for word on 2026-10-08
// (.planning/phases/51.3.1.1-density-pools/51.3.1.1-PROMPT-DRAFT.md, sections A0 and A1, with the
// owner's Counts edit "1-3 more NPCs besides the vendor and banker each hub needs"), and the Hubs
// line of the fill request (section A2). The draft is the source of truth: never change an expected
// string here to match the code.
//
// Plan 51.3.1.1-30: the owner approved Revision 2 on 2026-10-08 (draft line "Revision 2 status:
// APPROVED 2026-10-08", D-66, D-68, D-70) and the D-71 "Feud: none." variant: the world_gen block is
// A1 with the three R2-A1 edits (the Counts sentence, the history sentence, the Feud paragraph), and
// the fill request gains the Families and Feud lines (R2-A2).
//
// Phase 51.3.1.2 (Plan 10): the owner approved the 51.3.1.2 draft on 2026-10-09
// (.planning/phases/51.3.1.2-bigger-regions/51.3.1.2-PROMPT-DRAFT.md, "Status: APPROVED 2026-10-09",
// sections 1 and 3 approved as drafted). The world_gen block is now stage 2a, places and people:
// the Counts paragraph reads the place count from the Places line and asks for 3-5 more NPCs
// (D-03, D-06), the Locations paragraph has no levelOffset (D-04), and the Creature families and
// Feud paragraphs moved to the world_gen_families block (D-01). The fill request gains the Places
// line and loses the Families and Feud lines (section 3); world_gen_start is unchanged.
// ============================================================================

// Changing WORLD_GEN_BLOCK or WORLD_GEN_START_BLOCK requires the owner's approval of new wording
// (D-49, D-58, D-13), then updating the hash and length in the same commit.
// The world_gen pin moved with the owner's approval of the 51.3.1.2 draft on 2026-10-09, section 1
// (was 2225ffd6..., 5896 for Revision 2; 32bd3555..., 5262 before that).
const APPROVED_WORLD_GEN_SHA256 = 'a27e15b580fbfa3d8fc394287ee6bc64598428c44bc87e3fc2ed619ce7d3effa';
const APPROVED_WORLD_GEN_LENGTH = 4099;
const APPROVED_WORLD_GEN_START_SHA256 = '99c44b73a12ef8dbc6e1fd897e4c3c78aaf18b75659ef115f45b597429a37960';
const APPROVED_WORLD_GEN_START_LENGTH = 2560;

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

describe('world_gen block: the approved 51.3.1.2 section 1 text (stage 2a)', () => {
  const block = ROUTE_BLOCKS.world_gen;

  it('matches the approved sha256 and length', () => {
    expect(block.length).toBe(APPROVED_WORLD_GEN_LENGTH);
    expect(sha256(block)).toBe(APPROVED_WORLD_GEN_SHA256);
  });

  it('starts and ends as approved, with the naming rules interpolated and no template left', () => {
    expect(block.startsWith('TASK: WORLD GENERATION, FILL IN THE REGION')).toBe(true);
    expect(block.endsWith('Reply with the JSON object only.')).toBe(true);
    expect(block).not.toContain('${');
    expect(block).not.toContain('{WORLD_NAMING_RULES}');
    expect(block).toContain('NAMING RULES: location and region names MUST be diverse.');
  });

  it('carries the section 1 Counts paragraph: the Places line count, 3-5 more NPCs, families in a later step (D-03, D-06)', () => {
    expect(block).toContain(
      'Counts: the Places line of the user message says how many places the region has in all, the arrival point included, so write one new location fewer than that number. Write 3-5 more NPCs besides the vendor and banker each hub needs. Also name the region\'s dominant faction, a few landmarks and the threats that make a sensible traveler nervous. The region\'s creature families are written in a later step.',
    );
    expect(block).toContain('the Places line of the user message says how many places the region has in all');
    expect(block.split('Write 3-5 more NPCs')).toHaveLength(2);
    expect(block).not.toContain('2-4 more locations');
    expect(block).not.toContain('1-3 more NPCs');
    expect(block).toContain('Place words:');
    expect(block).toContain('Hubs: the Hubs line of the user message');
    expect(block).toContain('never it or they');
    expect(block).not.toContain('Essential services:');
    expect(block).not.toContain('Enemies:');
    expect(block).not.toMatch(/enemy types/);
  });

  it('asks for no levels and no families: no levelOffset, no Creature families or Feud paragraph (D-04, D-01)', () => {
    expect(block).toContain('Each location has a terrainType and isSafe set to true or false.');
    expect(block).not.toContain('levelOffset');
    expect(block).not.toContain('Creature families:');
    expect(block).not.toContain('Feud:');
    expect(block).not.toContain('Families line');
    expect(block).not.toContain('inFeud');
    expect(block).not.toContain('fitLocations');
  });

  it('its only interpolation is WORLD_NAMING_RULES, once, right before the last line', () => {
    expect(block.split('NAMING RULES: ')).toHaveLength(2);
    expect(block).toMatch(/\n\nNAMING RULES: [^]*\n\nReply with the JSON object only\.$/);
    expect(block).not.toContain('<player_input>');
  });
});

describe('world_gen_start block: the approved section A0 text', () => {
  const block = ROUTE_BLOCKS.world_gen_start;

  it('matches the approved sha256 and length', () => {
    expect(block.length).toBe(APPROVED_WORLD_GEN_START_LENGTH);
    expect(sha256(block)).toBe(APPROVED_WORLD_GEN_START_SHA256);
  });

  it('starts and ends as approved; the arrival point is where a traveler first arrives and the model sets isSafe (D-61)', () => {
    expect(block.startsWith('TASK: WORLD GENERATION, FIRST GLIMPSE')).toBe(true);
    expect(block.endsWith('Reply with the JSON object only.')).toBe(true);
    expect(block).toContain('Start location: the place where a traveler first arrives.');
    expect(block).toContain('isSafe set to true or false');
    expect(block).not.toContain('the safe place where a traveler first arrives');
    expect(block).not.toContain('${');
    expect(block).toContain('NAMING RULES: location and region names MUST be diverse.');
  });
});

describe('buildWorldFillVolatile: the approved Hubs line (section A2, D-62)', () => {
  const base: WorldFillInput = {
    regionName: 'Kesterlane Basin',
    biome: 'coastal',
    startLocation: { name: 'Mother Pan Flats', description: 'Salt as far as the eye goes.', terrainType: 'swamp' },
    npcsPresent: [{ name: 'Marta Vell', npcType: 'lore', gender: 'female' }],
    characterRace: 'Kobold',
    characterClass: 'Ashweaver',
    characterArchetype: 'warrior',
    sourceRegionName: 'Emberdeep',
    neighborRegions: [],
  };
  const lines = (input: WorldFillInput) => buildWorldFillVolatile(input).split('\n');
  const PEOPLE = 'People already there: Marta Vell (lore, she)';

  it.each([
    [0, false, 'Hubs: none, this region is too wild for settlements.'],
    [1, false, 'Hubs: one.'],
    [2, false, 'Hubs: two.'],
    [1, true, 'Hubs: one. The arrival point is a hub.'],
    [2, true, 'Hubs: two. The arrival point is a hub.'],
  ])('hubCount %s, arrivalIsHub %s prints "%s" right after the People line', (hubCount, arrivalIsHub, expected) => {
    const out = lines({ ...base, hubCount, arrivalIsHub });
    const at = out.indexOf(PEOPLE);
    expect(at).toBeGreaterThan(-1);
    expect(out[at + 1]).toBe(expected);
    expect(out.filter((l) => l.startsWith('Hubs:'))).toHaveLength(1);
  });

  it('an input without hubCount (a job stored before this change) prints no Hubs line and is otherwise unchanged', () => {
    const before = buildWorldFillVolatile(base);
    expect(before).not.toContain('Hubs:');
    const withHubs = buildWorldFillVolatile({ ...base, hubCount: 1 });
    expect(withHubs.replace('\nHubs: one.', '')).toBe(before);
    expect(before.split('\n').slice(0, 4)).toEqual([
      'Region: Kesterlane Basin (coastal)',
      'Arrival point: Mother Pan Flats (swamp): Salt as far as the eye goes.',
      PEOPLE,
      '',
    ]);
  });

  it('a hub count outside 0-2 or a non-number prints no Hubs line (never a number from storage)', () => {
    for (const hubCount of [3, -1, 1.5, Number.NaN, '1' as unknown as number, null as unknown as number]) {
      expect(buildWorldFillVolatile({ ...base, hubCount })).not.toContain('Hubs:');
    }
  });
});

describe('buildWorldFillVolatile: the approved 51.3.1.2 Places line (section 3, D-03)', () => {
  const base: WorldFillInput = {
    regionName: 'Kesterlane Basin',
    biome: 'coastal',
    startLocation: { name: 'Mother Pan Flats', description: 'Salt as far as the eye goes.', terrainType: 'swamp' },
    npcsPresent: [{ name: 'Marta Vell', npcType: 'lore', gender: 'female' }],
    characterRace: 'Kobold',
    characterClass: 'Ashweaver',
    characterArchetype: 'warrior',
    sourceRegionName: 'Emberdeep',
    neighborRegions: [],
  };
  const PEOPLE = 'People already there: Marta Vell (lore, she)';

  // The section 3 rendered example of the approved draft (N = 9), copied exactly
  // (`node scripts/llm/prompt_draft.mjs fences <draft> "## 3."`, second fence).
  const SECTION_3_EXAMPLE = `Region: Kesterlane Basin (coastal)
Arrival point: Mother Pan Flats (swamp): Salt pans stretch flat and white to the horizon, cracked into plates the size of tables. Brine wells up between them in the heat of the day and smells of old coins.
People already there: Marta Vell (lore, she)
Places: nine in all, the arrival point included.
Hubs: one.

A Dwarf Warden (warrior) wandered beyond Cragmoor Reach. Neighboring regions: Cragmoor Reach (mountains, threats: rockfalls; wolves in the passes)

Fill in the rest of this region.`;
  const SECTION_3_INPUT: WorldFillInput = {
    regionName: 'Kesterlane Basin',
    biome: 'coastal',
    startLocation: {
      name: 'Mother Pan Flats',
      description:
        'Salt pans stretch flat and white to the horizon, cracked into plates the size of tables. Brine wells up between them in the heat of the day and smells of old coins.',
      terrainType: 'swamp',
    },
    npcsPresent: [{ name: 'Marta Vell', npcType: 'lore', gender: 'female' }],
    characterRace: 'Dwarf',
    characterClass: 'Warden',
    characterArchetype: 'warrior',
    sourceRegionName: 'Cragmoor Reach',
    neighborRegions: [{ name: 'Cragmoor Reach', biome: 'mountains', threats: 'rockfalls; wolves in the passes' }],
    hubCount: 1,
    placeCount: 9,
  };

  it('renders the section 3 example exactly', () => {
    expect(buildWorldFillVolatile(SECTION_3_INPUT)).toBe(SECTION_3_EXAMPLE);
  });

  it.each([
    [8, 'eight'],
    [9, 'nine'],
    [10, 'ten'],
  ])('placeCount %s prints "Places: %s in all, the arrival point included." between the People and Hubs lines', (placeCount, word) => {
    const out = buildWorldFillVolatile({ ...base, hubCount: 1, placeCount }).split('\n');
    const at = out.indexOf(PEOPLE);
    expect(at).toBeGreaterThan(-1);
    expect(out.slice(at + 1, at + 3)).toEqual([`Places: ${word} in all, the arrival point included.`, 'Hubs: one.']);
    expect(out.filter((l) => l.startsWith('Places:'))).toHaveLength(1);
  });

  it('without a hub count the Places line still follows the People line', () => {
    expect(buildWorldFillVolatile({ ...base, placeCount: 8 })).toContain(
      `${PEOPLE}\nPlaces: eight in all, the arrival point included.\n\n`,
    );
  });

  it('a place count outside 8..10, a non-integer or a missing one prints no Places line (a job stored before 51.3.1.2)', () => {
    const before = buildWorldFillVolatile({ ...base, hubCount: 1 });
    expect(before).not.toContain('Places:');
    for (const placeCount of [7, 11, 9.5, 0, -9, Number.NaN, undefined, '9' as unknown as number, null as unknown as number]) {
      expect(buildWorldFillVolatile({ ...base, hubCount: 1, placeCount })).toBe(before);
    }
  });

  it('every other line is unchanged: removing the Places line gives the message of the same input without a count', () => {
    const before = buildWorldFillVolatile({ ...base, hubCount: 2, arrivalIsHub: true });
    const withPlaces = buildWorldFillVolatile({ ...base, hubCount: 2, arrivalIsHub: true, placeCount: 10 });
    expect(withPlaces.replace('\nPlaces: ten in all, the arrival point included.', '')).toBe(before);
    expect(before.split('\n').slice(0, 5)).toEqual([
      'Region: Kesterlane Basin (coastal)',
      'Arrival point: Mother Pan Flats (swamp): Salt as far as the eye goes.',
      PEOPLE,
      'Hubs: two. The arrival point is a hub.',
      '',
    ]);
  });

  it('an older stored input carrying familyCount and feudCount prints neither a Families nor a Feud line (they moved to 2b)', () => {
    const before = buildWorldFillVolatile({ ...base, hubCount: 1, placeCount: 9 });
    for (const feudCount of [0, 2, 3]) {
      const old = buildWorldFillVolatile({ ...base, hubCount: 1, placeCount: 9, familyCount: 7, feudCount });
      expect(old).not.toContain('Families:');
      expect(old).not.toContain('Feud:');
      expect(old).toBe(before);
    }
    const revision2Job = buildWorldFillVolatile({ ...base, hubCount: 1, familyCount: 7, feudCount: 2 });
    expect(revision2Job).toBe(buildWorldFillVolatile({ ...base, hubCount: 1 }));
  });
});
