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
// ============================================================================

// Changing WORLD_GEN_BLOCK or WORLD_GEN_START_BLOCK requires the owner's approval of the new wording
// (D-49, D-58), then updating the hash and length in the same commit.
// The world_gen pin moved with the owner's approval of Revision 2 on 2026-10-08 (was 32bd3555..., 5262).
const APPROVED_WORLD_GEN_SHA256 = '2225ffd6ac5b5e39766b8ea0662ade1753a20e2a941bf47f9f74a9da07f2820d';
const APPROVED_WORLD_GEN_LENGTH = 5896;
const APPROVED_WORLD_GEN_START_SHA256 = '99c44b73a12ef8dbc6e1fd897e4c3c78aaf18b75659ef115f45b597429a37960';
const APPROVED_WORLD_GEN_START_LENGTH = 2560;

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

describe('world_gen block: the approved section A1 text', () => {
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

  it('carries the Revision 2 Counts sentence, the Place words, Hubs and Creature families paragraphs', () => {
    expect(block).toContain(
      'Counts: 2-4 more locations, 1-3 more NPCs besides the vendor and banker each hub needs, and as many creature families as the Families line of the user message says.',
    );
    expect(block).not.toContain('2-3 creature families');
    expect(block).toContain('Place words:');
    expect(block).toContain('Creature families:');
    expect(block).toContain('Hubs: the Hubs line of the user message');
    expect(block).toContain('a family never lives at a safe place or at a hub');
    expect(block).toContain('never it or they');
    expect(block).not.toContain('Essential services:');
    expect(block).not.toContain('Enemies:');
    expect(block).not.toMatch(/enemy types/);
  });

  it('carries the Revision 2 history sentence and Feud paragraph in the approved places (R2-A1, D-68, D-70)', () => {
    const history =
      "In history, write one or two sentences of the family's past in this region, such as where it came from and its feud or tie with a hub, the dominant faction or a rival family; use no numbers, and call any person he or she, never it or they.";
    const feud =
      'Feud: the Feud line of the user message says how many families are locked in a feud, an old hatred that no truce has ever held. Set inFeud to true on exactly that many families and to false on every other family. Choose families whose lands or hungers cross, and let the history of each feuding family name the feud and the families it hates.';
    expect(block).toContain(`each with the kind rival, prey or predator. ${history} Never give a family levels`);
    expect(block).toContain(`the server sets every number.\n\n${feud}\n\nNAMING RULES: `);
    expect(block.split('In history, write one or two sentences')).toHaveLength(2);
    expect(block.split('Feud: the Feud line of the user message')).toHaveLength(2);
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

describe('buildWorldFillVolatile: the Revision 2 Families and Feud lines (R2-A2, D-66, D-70, D-71)', () => {
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
  // The draft's own R2-A2 examples, copied exactly.
  const R2_EXAMPLE_ONE = 'Hubs: one.\nFamilies: seven.\nFeud: two families.';
  const R2_EXAMPLE_NONE = 'Hubs: none, this region is too wild for settlements.\nFamilies: seven.\nFeud: three families.';
  // D-71 (owner 2026-10-08): the exact line for a region that rolls no feud.
  const FEUD_NONE = 'Feud: none.';

  it('prints the R2-A2 examples right after the People line, in the order Hubs, Families, Feud', () => {
    const one = buildWorldFillVolatile({ ...base, hubCount: 1, familyCount: 7, feudCount: 2 });
    expect(one).toContain(`${PEOPLE}\n${R2_EXAMPLE_ONE}\n\n`);
    const none = buildWorldFillVolatile({ ...base, hubCount: 0, familyCount: 7, feudCount: 3 });
    expect(none).toContain(`${PEOPLE}\n${R2_EXAMPLE_NONE}\n\n`);
  });

  it('a region that rolls no feud prints exactly "Feud: none." (D-71)', () => {
    const out = buildWorldFillVolatile({ ...base, hubCount: 1, familyCount: 7, feudCount: 0 });
    expect(out).toContain(`${PEOPLE}\nHubs: one.\nFamilies: seven.\n${FEUD_NONE}\n\n`);
    expect(out).not.toContain(' families.\n');
  });

  it.each([
    [3, 'three'],
    [4, 'four'],
    [5, 'five'],
    [6, 'six'],
    [7, 'seven'],
    [8, 'eight'],
    [9, 'nine'],
    [10, 'ten'],
    [11, 'eleven'],
    [12, 'twelve'],
    [13, 'thirteen'],
    [14, 'fourteen'],
    [15, 'fifteen'],
  ])('familyCount %s prints "Families: %s."', (familyCount, word) => {
    const out = buildWorldFillVolatile({ ...base, hubCount: 1, familyCount, feudCount: 2 }).split('\n');
    const at = out.indexOf(PEOPLE);
    expect(out.slice(at + 1, at + 4)).toEqual(['Hubs: one.', `Families: ${word}.`, 'Feud: two families.']);
  });

  it('feudCount 3 prints "Feud: three families."', () => {
    expect(buildWorldFillVolatile({ ...base, familyCount: 7, feudCount: 3 })).toContain('\nFamilies: seven.\nFeud: three families.\n');
  });

  it('without a hub count the Families and Feud lines still follow the People line', () => {
    expect(buildWorldFillVolatile({ ...base, familyCount: 7, feudCount: 2 })).toContain(
      `${PEOPLE}\nFamilies: seven.\nFeud: two families.\n\n`,
    );
  });

  it('a stored input without familyCount (a job queued before Revision 2) prints neither line and is otherwise unchanged', () => {
    const before = buildWorldFillVolatile({ ...base, hubCount: 1 });
    expect(before).not.toContain('Families:');
    expect(before).not.toContain('Feud:');
    expect(buildWorldFillVolatile({ ...base, hubCount: 1, feudCount: 2 })).toBe(before);
    expect(
      buildWorldFillVolatile({ ...base, hubCount: 1, familyCount: 7, feudCount: 2 }).replace('\nFamilies: seven.\nFeud: two families.', ''),
    ).toBe(before);
  });

  it('a family count outside 3..15 or a non-integer prints neither line (never a number from storage)', () => {
    const before = buildWorldFillVolatile({ ...base, hubCount: 1 });
    for (const familyCount of [0, 1, 2, 16, -3, 7.5, Number.NaN, '7' as unknown as number, null as unknown as number]) {
      expect(buildWorldFillVolatile({ ...base, hubCount: 1, familyCount, feudCount: 2 })).toBe(before);
    }
  });

  it('a feud count other than 0, 2 or 3 prints no Feud line; the Families line stays', () => {
    for (const feudCount of [undefined, 1, 4, -1, 2.5, Number.NaN, '2' as unknown as number, null as unknown as number]) {
      const out = buildWorldFillVolatile({ ...base, hubCount: 1, familyCount: 7, feudCount });
      expect(out).toContain('\nHubs: one.\nFamilies: seven.\n\n');
      expect(out).not.toContain('Feud:');
    }
  });
});
