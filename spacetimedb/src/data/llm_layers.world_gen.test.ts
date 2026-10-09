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
// ============================================================================

// Changing WORLD_GEN_BLOCK or WORLD_GEN_START_BLOCK requires the owner's approval of the new wording
// (D-49, D-58), then updating the hash and length in the same commit.
const APPROVED_WORLD_GEN_SHA256 = '32bd355591f108a53418a9ac1a493f550e5a1585e52f0cf4058aa7f84c8e4a31';
const APPROVED_WORLD_GEN_LENGTH = 5262;
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

  it('carries the owner-edited Counts sentence, the Place words, Hubs and Creature families paragraphs', () => {
    expect(block).toContain(
      'Counts: 2-4 more locations, 1-3 more NPCs besides the vendor and banker each hub needs, and 2-3 creature families.',
    );
    expect(block).toContain('Place words:');
    expect(block).toContain('Creature families:');
    expect(block).toContain('Hubs: the Hubs line of the user message');
    expect(block).toContain('a family never lives at a safe place or at a hub');
    expect(block).toContain('never it or they');
    expect(block).not.toContain('Essential services:');
    expect(block).not.toContain('Enemies:');
    expect(block).not.toMatch(/enemy types/);
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
