/**
 * SEG-04 malformed-reply matrix (Phase 46, plan 03).
 *
 * Every narrative route is driven through the REAL apply layer and the REAL events module (nothing
 * here mocks ./events; only the server SDK is mocked, with the recording mock the characterization
 * suite uses). For each route a table of malformed replies is applied and the stored rows are read
 * back from the mock database. Three things hold for every case:
 *   1. applyLlmResult never throws and never writes a second narrative event;
 *   2. a malformed reply stores exactly one Keeper narration segment (model-segment routes) or the
 *      server's own in-voice line (server-wrapped routes); oversize replies are clamped;
 *   3. the companion invariant (expectSegmentInvariant): every stored narrative row that carries
 *      segments has 1 to 6 of them, each at most 600 code points, narration spoken by "The Keeper",
 *      dialogue spoken by a present speaker, and message === flattenSegments(segments).
 *
 * Fixtures are copied from llm_apply.characterization.test.ts on purpose (test-only duplication; no
 * helper is exported from production code). No network, no wording is pinned here that the owner has
 * not already seen: expected fallback lines come from the production modules.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { createMockCtx, defaultLlmAdminStateRow } from './test-utils';
import { applyLlmResult, applyLlmFailure, type ApplyJob } from './llm_apply';
import { flattenSegments, KEEPER_SPEAKER, MAX_SEGMENTS, MAX_SEGMENT_CHARS } from './segments';
import { COMBAT_NARRATION_FALLBACK_LINE } from './combat_narration';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const T_OLD = 1_600_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };
const ts = (micros: bigint) => ({ microsSinceUnixEpoch: micros });

beforeAll(async () => {
  await import('../index');
}, 120_000);

let randomSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.42);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  randomSpy.mockRestore();
  errorSpy.mockRestore();
});

type Seed = Record<string, any[]>;

function mergeSeeds(...parts: Seed[]): Seed {
  const out: Seed = {};
  for (const part of parts) {
    for (const [table, list] of Object.entries(part)) (out[table] ??= []).push(...list);
  }
  return out;
}

/** An open LLM calls gate, so a success that enqueues a follow-up job does not fail closed. */
function newCtx(seed: Seed) {
  return createMockCtx({ seed: { llm_admin_state: [defaultLlmAdminStateRow()], ...seed }, sender: alice, timestampMicros: T0 });
}

function rows(ctx: any, table: string): any[] {
  return ctx.db._tables[table] ?? [];
}

const applyJob = (domain: string, contextJson?: string): ApplyJob => ({ domain, playerId: alice, contextJson });

const keeper = (text: string) => ({ kind: 'narration', speaker: KEEPER_SPEAKER, text });

// ---------------------------------------------------------------------------
// The invariant
// ---------------------------------------------------------------------------

/**
 * Every stored narrative event row that carries segments: 1..6 segments, each non-empty and at most
 * 600 code points, narration by "The Keeper", dialogue by a present speaker (never a player name),
 * message === flattenSegments(segments).
 */
function expectSegmentInvariant(ctx: any, presentNames: readonly string[], playerNames: readonly string[] = []): void {
  for (const table of ['event_private', 'event_creation']) {
    for (const row of rows(ctx, table)) {
      if (row.segments === undefined) continue;
      const segs: any[] = row.segments;
      expect(Array.isArray(segs)).toBe(true);
      expect(segs.length).toBeGreaterThanOrEqual(1);
      expect(segs.length).toBeLessThanOrEqual(MAX_SEGMENTS);
      for (const seg of segs) {
        expect(typeof seg.text).toBe('string');
        expect(seg.text.length).toBeGreaterThan(0);
        expect(Array.from(seg.text as string).length).toBeLessThanOrEqual(MAX_SEGMENT_CHARS);
        if (seg.kind === 'narration') {
          expect(seg.speaker).toBe(KEEPER_SPEAKER);
          expect(seg.speakerNpcId).toBeUndefined();
        } else {
          expect(seg.kind).toBe('dialogue');
          expect(presentNames).toContain(seg.speaker);
          expect(playerNames).not.toContain(seg.speaker);
        }
      }
      expect(row.message).toBe(flattenSegments(segs));
    }
  }
}

/** Rows (private or creation) that carry segments: the narrative events a case wrote. */
function segmentRows(ctx: any, kind?: string): any[] {
  return [...rows(ctx, 'event_private'), ...rows(ctx, 'event_creation')].filter(
    (r) => r.segments !== undefined && (kind === undefined || r.kind === kind),
  );
}

/** Canary text that must never reach a stored row or a log line. */
const CANARY = 'CANARY-DEBRIS-7731';
function expectNoDebris(ctx: any): void {
  const stored = JSON.stringify([...rows(ctx, 'event_private'), ...rows(ctx, 'event_creation')], (_k, v) =>
    typeof v === 'bigint' ? `${v}n` : v,
  );
  expect(stored).not.toContain(CANARY);
  expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(CANARY);
}

// ---------------------------------------------------------------------------
// Fixtures (copied from the characterization suite)
// ---------------------------------------------------------------------------

function characterRow(over: Record<string, any> = {}) {
  return {
    id: 10n,
    ownerUserId: 7n,
    name: 'Tester',
    race: 'Ashkin',
    className: 'Emberblade',
    level: 3n,
    xp: 0n,
    gold: 0n,
    locationId: 100n,
    boundLocationId: 100n,
    groupId: undefined,
    cha: 10n,
    ...over,
  };
}

function creationState(step: string, over: Record<string, any> = {}) {
  return { id: 2n, playerId: alice, step, raceName: undefined, createdAt: ts(T_OLD), updatedAt: ts(T_OLD), ...over };
}

const CTX_CHAR = JSON.stringify({ characterId: '10' });
const GEN_CTX = JSON.stringify({ genStateId: '5' });
const NPC_CTX = JSON.stringify({ characterId: '10', npcId: '20', memoryId: '30' });
const EMPTY_MEMORY = JSON.stringify({ topics: [], questsCompleted: [], secretsShared: [], giftsGiven: [], lastConversationSummary: '' });

const RACE_JSON = {
  raceName: 'Ashkin',
  narrative: 'Born of cinders and spite.',
  bonuses: { primary: { stat: 'str', value: 2 }, secondary: { stat: 'dex', value: 1 }, flavor: 'Ember-warm.' },
};

const CLASS_FIRST_ABILITY = {
  name: 'Ember Slash', description: 'A burning cut.', kind: 'damage', damageType: 'fire', value1: 12,
  castSeconds: 0, cooldownSeconds: 6, resourceCost: 5, resourceType: 'stamina', effectType: 'dot', effectDuration: 9,
};
const CLASS_REVEAL_JSON = {
  className: 'Emberblade',
  classDescription: 'A duelist who fights like a grudge.',
  firstAbility: CLASS_FIRST_ABILITY,
};
const CLASS_FILL_JSON = {
  stats: {
    primaryStat: 'str', secondaryStat: 'dex', bonusHp: 10, bonusMana: 0, armorProficiency: 'leather',
    armorProficiencies: ['leather', 'mail'], weaponProficiencies: ['sword', 'dagger'], usesMana: false,
  },
  abilities: [
    { name: 'Ash Veil', description: 'A curtain of soot.', kind: 'shield', value1: 10, castSeconds: 2, cooldownSeconds: 12, resourceCost: 8, resourceType: 'mana' },
    { name: 'Old Style', description: 'A legacy-shaped ability.', baseDamage: 7, manaCost: 4, effect: 'stun', castSeconds: 0, cooldownSeconds: 3 },
  ],
};

function skill(name: string, over: Record<string, any> = {}) {
  return {
    name, description: `${name} description.`, kind: 'damage', targetRule: 'single_enemy', resourceType: 'stamina',
    resourceCost: 5, castSeconds: 0, cooldownSeconds: 6, scaling: 'str', value1: 10, value2: null, damageType: 'physical',
    effectType: null, effectMagnitude: null, effectDuration: null, ...over,
  };
}

function genState(over: Record<string, any> = {}) {
  return { id: 5n, playerId: alice, characterId: 10n, sourceLocationId: 0n, sourceRegionId: 0n, step: 'GENERATING', createdAt: ts(T_OLD), updatedAt: ts(T_OLD), ...over };
}

const WORLD_START_JSON = {
  regionName: 'Cinderfall',
  regionDescription: 'Ash drifts down like a slow, grey snowfall.',
  biome: 'volcanic',
  startLocation: { name: 'Ember Hollow', description: 'A sheltered town.', terrainType: 'town', levelOffset: 0 },
  firstNpc: { name: 'Vessa', gender: 'female', npcType: 'vendor', description: 'A soot-streaked trader.', greeting: 'Buy something.', personality: { traits: ['brisk'], speechPattern: 'clipped', knowledgeDomains: ['trade'], secrets: [], affinityMultiplier: 1.0 } },
};

const REGION_FILL_JSON = {
  dominantFaction: 'Ash Court',
  landmarks: ['The Slag Spire'],
  threats: ['ember wolves'],
  locations: [
    { name: 'Slag Road', description: 'A cracked road.', terrainType: 'plains', isSafe: false, levelOffset: 0, connectsTo: ['Ember Hollow', 'Ashen Pit'] },
    { name: 'Ashen Pit', description: 'A smoking crater.', terrainType: 'mountains', isSafe: false, levelOffset: 1, connectsTo: ['Slag Road'] },
  ],
  npcs: [
    { name: 'Old Brann', gender: 'male', npcType: 'lore', locationName: 'Nowhere In Particular', description: 'A hermit.', greeting: 'Hm.', personality: { traits: ['gruff'], speechPattern: 'slow', knowledgeDomains: ['ash'], secrets: [], affinityMultiplier: 1.0 } },
  ],
  enemies: [
    { name: 'Ember Wolf', creatureType: 'beast', role: 'melee', terrainTypes: 'plains', groupMin: 1, groupMax: 2, level: 1 },
    { name: 'Slag Caster', creatureType: 'humanoid', role: 'caster', terrainTypes: 'mountains', groupMin: 1, groupMax: 1, level: 1 },
  ],
};

/** A character at location 0 waiting on stage 1: failure and arrival lines go to the creation events. */
const worldSeed = (): Seed => ({
  world_gen_state: [genState()],
  character: [characterRow({ locationId: 0n, boundLocationId: 0n, level: 1n })],
});

/** Stage 1 has landed: its region, start location and first NPC are stored, the state is FILLING. */
const fillSeed = (): Seed => ({
  world_gen_state: [genState({ step: 'FILLING', generatedRegionId: 1n })],
  character: [characterRow({ locationId: 1n, boundLocationId: 1n, level: 1n })],
  region: [{ id: 1n, name: 'Cinderfall', dangerMultiplier: 100n, regionType: 'generated', biome: 'volcanic', generatedByCharacterId: 10n, isGenerated: true, starterForRace: 'ashkin' }],
  location: [{ id: 1n, name: 'Ember Hollow', description: 'A sheltered town.', zone: 'Cinderfall', regionId: 1n, levelOffset: 0n, isSafe: true, terrainType: 'town', bindStone: true, craftingAvailable: true }],
  npc: [{ id: 1n, name: 'Vessa', npcType: 'vendor', locationId: 1n, description: 'A soot-streaked trader.', greeting: 'Buy something.', gender: 'female', personalityJson: '{}' }],
});

// ---------------------------------------------------------------------------
// Model-segment routes: npc_conversation and combat_narration
// ---------------------------------------------------------------------------

type ModelRoute = {
  route: 'npc_conversation' | 'combat_narration';
  seed: () => Seed;
  job: () => ApplyJob;
  /** Present speaker the model may name, and the segment that name must produce. */
  speaker: string;
  speakerSegment: (text: string) => Record<string, any>;
  presentNames: string[];
  playerNames: string[];
  /** Narrative rows one apply writes (npc: one; combat: one per participant). */
  rowKind: string;
  rowCount: number;
  /** The one Keeper line stored for a reply that is JSON but has no usable segments. */
  fallbackText: string;
  /** The one Keeper line stored for a reply that is not a JSON object at all. */
  notJsonText: string;
  /** An absent but plausible NPC name. */
  absentName: string;
};

const COMBAT_CTX = JSON.stringify({
  combatId: '77',
  roundNumber: '0',
  narrativeType: 'victory',
  participantCharacterIds: ['10', '11'],
  input: { enemyNames: ['Gravel Hound'], playerNames: ['Tester', 'Brienne'] },
});

const MODEL_ROUTES: ModelRoute[] = [
  {
    route: 'npc_conversation',
    seed: () =>
      mergeSeeds({
        character: [characterRow()],
        npc: [
          { id: 20n, name: 'Marta', npcType: 'lore', locationId: 100n, description: 'A baker.', greeting: 'Hello.', personalityJson: JSON.stringify({ affinityMultiplier: 1.0 }) },
          { id: 21n, name: 'Gil', npcType: 'lore', locationId: 100n, description: 'A carter.', greeting: 'Ho.', personalityJson: '{}' },
        ],
        npc_memory: [{ id: 30n, characterId: 10n, npcId: 20n, memoryJson: EMPTY_MEMORY, lastUpdated: ts(T_OLD) }],
        npc_affinity: [{ id: 40n, characterId: 10n, npcId: 20n, affinity: 0n, lastInteraction: ts(T_OLD), giftsGiven: 0n, conversationCount: 0n }],
      }),
    job: () => applyJob('npc_conversation', NPC_CTX),
    speaker: 'Marta',
    speakerSegment: (text) => ({ kind: 'dialogue', speaker: 'Marta', text, speakerNpcId: 20n }),
    presentNames: ['Marta', 'Gil'],
    playerNames: ['Tester'],
    rowKind: 'npc',
    rowCount: 1,
    fallbackText: 'Marta mutters something you cannot make out.',
    notJsonText: 'Marta mutters something you cannot make out. (Try again.)',
    absentName: 'Nobody',
  },
  {
    route: 'combat_narration',
    seed: () => ({
      character: [characterRow(), characterRow({ id: 11n, ownerUserId: 8n, name: 'Brienne' })],
      npc: [{ id: 30n, name: 'Old Tam', locationId: 100n }],
    }),
    job: () => applyJob('combat_narration', COMBAT_CTX),
    speaker: 'Gravel Hound',
    speakerSegment: (text) => ({ kind: 'dialogue', speaker: 'Gravel Hound', text }),
    presentNames: ['Gravel Hound', 'Old Tam'],
    playerNames: ['Tester', 'Brienne'],
    rowKind: 'combat_narration',
    rowCount: 2,
    fallbackText: COMBAT_NARRATION_FALLBACK_LINE,
    notJsonText: COMBAT_NARRATION_FALLBACK_LINE,
    absentName: 'Nobody',
  },
];

const seg = (kind: string, speaker: string, text: string) => JSON.stringify({ kind, speaker, text });
const segs = (...items: string[]) => `{"segments":[${items.join(',')}]}`;

describe.each(MODEL_ROUTES)('SEG-04 matrix: $route (model-segment route)', (cfg) => {
  type Case = { name: string; reply: string; expected: (c: ModelRoute) => any[] };
  const k = keeper;

  const CASES: Case[] = [
    { name: 'bad JSON (truncated, with debris)', reply: `{"segments": [ ${CANARY}`, expected: (c) => [k(c.route === 'npc_conversation' ? c.notJsonText : c.fallbackText)] },
    { name: 'a refusal in prose', reply: "I'm sorry, but I can't continue with that.", expected: (c) => [k(c.notJsonText)] },
    { name: 'valid JSON without segments', reply: '{"foo":1,"note":"nothing here"}', expected: (c) => [k(c.fallbackText)] },
    { name: 'segments that is not an array', reply: '{"segments":"hello"}', expected: (c) => [k(c.fallbackText)] },
    { name: 'a segments array of non-objects', reply: '{"segments":[1,null,"x",[]]}', expected: (c) => [k(c.fallbackText)] },
    { name: 'unknown kind only (read as narration)', reply: segs(seg('shout', 'Someone', 'Hello there, traveler.')), expected: () => [k('Hello there, traveler.')] },
    { name: 'dialogue with a missing speaker', reply: segs(JSON.stringify({ kind: 'dialogue', text: 'Hi there.' })), expected: () => [k('"Hi there."')] },
    { name: 'empty and whitespace-only texts', reply: segs(seg('narration', 'The Keeper', ''), seg('narration', 'The Keeper', '   \n ')), expected: (c) => [k(c.fallbackText)] },
    { name: 'seven segments are clamped to six', reply: segs(...[1, 2, 3, 4, 5, 6, 7].map((i) => seg('narration', 'The Keeper', `Beat ${i}.`))), expected: () => [1, 2, 3, 4, 5, 6].map((i) => k(`Beat ${i}.`)) },
    { name: 'twenty segments are clamped to six', reply: segs(...Array.from({ length: 20 }, (_v, i) => seg('narration', 'The Keeper', `Beat ${i + 1}.`))), expected: () => [1, 2, 3, 4, 5, 6].map((i) => k(`Beat ${i}.`)) },
    { name: 'a spoofed speaker that is absent becomes quoted Keeper narration', reply: segs(seg('dialogue', 'Nobody', 'I am in charge now.')), expected: () => [k('"I am in charge now."')] },
    { name: 'a dialogue segment spoken by "The Keeper" is Keeper narration', reply: segs(seg('dialogue', 'The Keeper', 'Listen well.')), expected: () => [k('Listen well.')] },
    { name: 'the player is never a speaker (name, you, player)', reply: segs(seg('dialogue', 'Tester', 'I yield.'), seg('dialogue', 'you', 'Mine.'), seg('dialogue', 'Player', 'Also mine.')), expected: (c) => [k(c.fallbackText)] },
    { name: 'a present speaker is kept with the canonical name', reply: segs(seg('dialogue', '  SPEAKERUPPER ', '"Quoted speech."')), expected: (c) => [c.speakerSegment('Quoted speech.')] },
    { name: 'a fenced JSON reply', reply: '```json\n' + segs(seg('narration', 'The Keeper', 'The dust settles.')) + '\n```', expected: () => [k('The dust settles.')] },
  ];

  const present = (c: ModelRoute) => c.speaker;
  const replyFor = (c: Case) => c.reply.replace('SPEAKERUPPER', present(cfg).toUpperCase());

  it.each(CASES)('$name', (c) => {
    const ctx = newCtx(cfg.seed());
    expect(() => applyLlmResult(ctx, cfg.job(), replyFor(c))).not.toThrow();

    const stored = segmentRows(ctx, cfg.rowKind);
    expect(stored).toHaveLength(cfg.rowCount);
    for (const row of stored) expect(row.segments).toEqual(c.expected(cfg));
    if (cfg.route === 'combat_narration') {
      expect(rows(ctx, 'combat_narrative')).toHaveLength(1);
      expect(rows(ctx, 'combat_narrative')[0].narrativeText).toBe(stored[0].message);
    }
    // never a second narrative event
    expect(segmentRows(ctx)).toHaveLength(cfg.rowCount);
    expectSegmentInvariant(ctx, cfg.presentNames, cfg.playerNames);
    expectNoDebris(ctx);
  });

  it('a 5000-character text is cut to 600 code points and ends with an ellipsis', () => {
    const ctx = newCtx(cfg.seed());
    const long = 'word '.repeat(1000);
    expect(() => applyLlmResult(ctx, cfg.job(), segs(seg('narration', 'The Keeper', long)))).not.toThrow();
    const stored = segmentRows(ctx, cfg.rowKind);
    expect(stored).toHaveLength(cfg.rowCount);
    const only = stored[0].segments;
    expect(only).toHaveLength(1);
    expect(Array.from(only[0].text as string).length).toBeLessThanOrEqual(MAX_SEGMENT_CHARS);
    expect(only[0].text.endsWith('…')).toBe(true);
    expectSegmentInvariant(ctx, cfg.presentNames, cfg.playerNames);
  });

  it('markup, a bidi override, a NUL and a lone surrogate are cleaned; tags stay as plain text', () => {
    const ctx = newCtx(cfg.seed());
    const dirty = '<b>bold</b> a‮b\u0000c \uD800d <script>x</script>';
    expect(() => applyLlmResult(ctx, cfg.job(), segs(seg('narration', 'The Keeper', dirty)))).not.toThrow();
    const only = segmentRows(ctx, cfg.rowKind)[0].segments;
    expect(only).toHaveLength(1);
    expect(only[0].text).toBe('<b>bold</b> abc �d <script>x</script>');
    expectSegmentInvariant(ctx, cfg.presentNames, cfg.playerNames);
  });

  it('a lone-surrogate-only and control-only text leaves no empty segment', () => {
    const ctx = newCtx(cfg.seed());
    expect(() => applyLlmResult(ctx, cfg.job(), segs(seg('narration', 'The Keeper', '\u0000‮​')))).not.toThrow();
    expect(segmentRows(ctx, cfg.rowKind)[0].segments).toEqual([keeper(cfg.fallbackText)]);
    expectSegmentInvariant(ctx, cfg.presentNames, cfg.playerNames);
  });

  it('a valid mixed reply keeps Keeper narration and the present speaker, in order', () => {
    const ctx = newCtx(cfg.seed());
    const reply = segs(
      seg('narration', 'The Keeper', 'A beat of silence.'),
      seg('dialogue', cfg.speaker, 'Well met.'),
      seg('narration', 'The Keeper', 'It passes.'),
    );
    expect(() => applyLlmResult(ctx, cfg.job(), reply)).not.toThrow();
    for (const row of segmentRows(ctx, cfg.rowKind)) {
      expect(row.segments).toEqual([keeper('A beat of silence.'), cfg.speakerSegment('Well met.'), keeper('It passes.')]);
    }
    expectSegmentInvariant(ctx, cfg.presentNames, cfg.playerNames);
  });
});

describe('SEG-04 matrix: combat_narration extra shapes', () => {
  const cfg = MODEL_ROUTES[1];

  it('legacy {"narrative"} JSON and plain prose each store one Keeper narration segment per participant', () => {
    for (const [reply, text] of [
      [JSON.stringify({ narrative: 'Steel meets bone.' }), 'Steel meets bone.'],
      ['The hound sags, spent and ashamed of itself.', 'The hound sags, spent and ashamed of itself.'],
    ] as const) {
      const ctx = newCtx(cfg.seed());
      expect(() => applyLlmResult(ctx, cfg.job(), reply)).not.toThrow();
      const stored = segmentRows(ctx, 'combat_narration');
      expect(stored).toHaveLength(2);
      for (const row of stored) expect(row.segments).toEqual([keeper(text)]);
      expectSegmentInvariant(ctx, cfg.presentNames, cfg.playerNames);
    }
  });

  it('a whitespace-only successful reply stores one fallback line per participant', () => {
    const ctx = newCtx(cfg.seed());
    expect(() => applyLlmResult(ctx, cfg.job(), '  \n ')).not.toThrow();
    const stored = segmentRows(ctx, 'combat_narration');
    expect(stored).toHaveLength(2);
    for (const row of stored) expect(row.segments).toEqual([keeper(COMBAT_NARRATION_FALLBACK_LINE)]);
    expect(rows(ctx, 'combat_narrative')).toHaveLength(1);
  });

  it('a failed job stays silent (no rows at all)', () => {
    const ctx = newCtx(cfg.seed());
    expect(() => applyLlmFailure(ctx, applyJob('combat_narration', COMBAT_CTX))).not.toThrow();
    expect(rows(ctx, 'combat_narrative')).toHaveLength(0);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });

  it('dialogue by an NPC at the fight location keeps the NPC id; dialogue by a participant is dropped', () => {
    const ctx = newCtx(cfg.seed());
    const reply = segs(seg('dialogue', 'old tam', 'Well fought.'), seg('dialogue', 'Brienne', 'Thanks.'));
    applyLlmResult(ctx, cfg.job(), reply);
    for (const row of segmentRows(ctx, 'combat_narration')) {
      expect(row.segments).toEqual([{ kind: 'dialogue', speaker: 'Old Tam', text: 'Well fought.', speakerNpcId: 30n }]);
    }
    expectSegmentInvariant(ctx, cfg.presentNames, cfg.playerNames);
  });
});

describe('SEG-04 matrix: npc_conversation extra shapes', () => {
  const cfg = MODEL_ROUTES[0];

  it('a speaker who is another NPC at the location is kept with that NPC id', () => {
    const ctx = newCtx(cfg.seed());
    applyLlmResult(ctx, cfg.job(), segs(seg('dialogue', 'Gil', 'Mind the cart.')));
    expect(segmentRows(ctx, 'npc')[0].segments).toEqual([{ kind: 'dialogue', speaker: 'Gil', text: 'Mind the cart.', speakerNpcId: 21n }]);
    expectSegmentInvariant(ctx, cfg.presentNames, cfg.playerNames);
  });

  it('a non-object JSON reply (array, string, null) takes the early return with one Keeper line', () => {
    for (const reply of ['[1,2,3]', '"just a string"', 'null']) {
      const ctx = newCtx(cfg.seed());
      expect(() => applyLlmResult(ctx, cfg.job(), reply)).not.toThrow();
      expect(segmentRows(ctx, 'npc')).toHaveLength(1);
      expect(segmentRows(ctx, 'npc')[0].segments).toEqual([keeper(cfg.notJsonText)]);
      expectSegmentInvariant(ctx, cfg.presentNames, cfg.playerNames);
    }
  });
});

// ---------------------------------------------------------------------------
// Server-wrapped routes: the server composes the player-facing text
// ---------------------------------------------------------------------------

type WrappedCase = { name: string; reply: string; table: 'event_creation' | 'event_private'; kind: string; count: number | 'some' };
type WrappedRoute = {
  route: string;
  seed: () => Seed;
  job: () => ApplyJob;
  success: { reply: string; table: 'event_creation' | 'event_private'; kind: string };
  malformed: WrappedCase[];
};

const NOT_JSON = 'the cosmos declined to answer';
const UNRELATED = '{"unrelated":true,"note":"nothing you asked for"}';

const WRAPPED: WrappedRoute[] = [
  {
    route: 'creation_race',
    seed: () => ({ character_creation_state: [creationState('GENERATING_RACE')] }),
    job: () => applyJob('creation_race'),
    success: { reply: JSON.stringify(RACE_JSON), table: 'event_creation', kind: 'creation' },
    malformed: [
      { name: 'not JSON', reply: NOT_JSON, table: 'event_creation', kind: 'creation_error', count: 1 },
      { name: 'debris', reply: `{"raceName": ${CANARY}`, table: 'event_creation', kind: 'creation_error', count: 1 },
      // Phase 41: a reply without a race name is stored as "Unknown" with default bonuses, not rejected.
      { name: 'valid JSON missing the fields', reply: UNRELATED, table: 'event_creation', kind: 'creation', count: 1 },
    ],
  },
  {
    route: 'creation_class_reveal',
    seed: () => ({ character_creation_state: [creationState('GENERATING_CLASS', { raceName: 'Ashkin', raceNarrative: 'Born of cinders.' })] }),
    job: () => applyJob('creation_class_reveal'),
    success: { reply: JSON.stringify(CLASS_REVEAL_JSON), table: 'event_creation', kind: 'creation' },
    malformed: [
      { name: 'not JSON', reply: NOT_JSON, table: 'event_creation', kind: 'creation_error', count: 1 },
      { name: 'debris', reply: `{"className": ${CANARY}`, table: 'event_creation', kind: 'creation_error', count: 1 },
      { name: 'valid JSON missing the fields', reply: UNRELATED, table: 'event_creation', kind: 'creation_error', count: 1 },
    ],
  },
  {
    route: 'creation_class',
    seed: () => ({
      character_creation_state: [
        creationState('CLASS_FILLING', {
          raceName: 'Ashkin', raceNarrative: 'Born of cinders.', className: 'Emberblade',
          classDescription: 'A duelist who fights like a grudge.', abilities: JSON.stringify([CLASS_FIRST_ABILITY]),
        }),
      ],
    }),
    job: () => applyJob('creation_class'),
    success: { reply: JSON.stringify(CLASS_FILL_JSON), table: 'event_creation', kind: 'creation' },
    malformed: [
      { name: 'not JSON', reply: NOT_JSON, table: 'event_creation', kind: 'creation_error', count: 1 },
      { name: 'debris', reply: `{"stats": ${CANARY}`, table: 'event_creation', kind: 'creation_error', count: 1 },
      { name: 'valid JSON missing the fields', reply: UNRELATED, table: 'event_creation', kind: 'creation_error', count: 1 },
    ],
  },
  {
    route: 'world_gen_start',
    seed: worldSeed,
    job: () => applyJob('world_gen_start', GEN_CTX),
    // the arrival line is written to the character's private events once the start location is placed
    success: { reply: JSON.stringify(WORLD_START_JSON), table: 'event_creation', kind: 'creation' }, // 51.3.1.2-13: a starter character waits in creation; stage 1 posts the 7e line there
    malformed: [
      { name: 'not JSON', reply: NOT_JSON, table: 'event_creation', kind: 'creation_error', count: 1 },
      { name: 'debris', reply: `{"regionName": ${CANARY}`, table: 'event_creation', kind: 'creation_error', count: 1 },
      { name: 'valid JSON missing the fields', reply: UNRELATED, table: 'event_creation', kind: 'creation_error', count: 1 },
    ],
  },
  {
    route: 'skill_gen',
    seed: () => ({ character: [characterRow({ level: 3n })] }),
    job: () => applyJob('skill_gen', CTX_CHAR),
    success: { reply: JSON.stringify({ skills: [skill('Cinder Cut'), skill('Ash Ward'), skill('Ember Pulse')] }), table: 'event_private', kind: 'narrative' },
    malformed: [
      { name: 'not JSON', reply: NOT_JSON, table: 'event_private', kind: 'narrative', count: 1 },
      { name: 'debris', reply: `{"skills": ${CANARY}`, table: 'event_private', kind: 'narrative', count: 1 },
      { name: 'valid JSON missing the fields', reply: UNRELATED, table: 'event_private', kind: 'narrative', count: 1 },
    ],
  },
  {
    route: 'renown_perk_gen',
    seed: () => ({ character: [characterRow()] }),
    job: () => applyJob('renown_perk_gen', JSON.stringify({ characterId: '10', rank: '2' })),
    success: {
      reply: JSON.stringify({
        perks: ['A', 'B', 'C'].map((n) => ({ name: `Perk ${n}`, description: `Perk ${n} does a thing.`, kind: '', perkEffectJson: '{"maxHp":10}', perkDomain: 'crafting' })),
      }),
      table: 'event_private',
      kind: 'narrative',
    },
    malformed: [
      { name: 'not JSON', reply: NOT_JSON, table: 'event_private', kind: 'narrative', count: 1 },
      { name: 'debris', reply: `{"perks": ${CANARY}`, table: 'event_private', kind: 'narrative', count: 1 },
      { name: 'valid JSON missing the fields', reply: UNRELATED, table: 'event_private', kind: 'narrative', count: 1 },
    ],
  },
];

describe.each(WRAPPED)('SEG-04 matrix: $route (server-wrapped route)', (cfg) => {
  it('a success stores Keeper narration segments only, within the invariant', () => {
    const ctx = newCtx(cfg.seed());
    expect(() => applyLlmResult(ctx, cfg.job(), cfg.success.reply)).not.toThrow();
    const stored = rows(ctx, cfg.success.table).filter((r) => r.kind === cfg.success.kind);
    expect(stored.length).toBeGreaterThanOrEqual(1);
    for (const row of stored) {
      expect(row.segments).toBeDefined();
      for (const s of row.segments) expect(s).toEqual(keeper(s.text));
    }
    expectSegmentInvariant(ctx, []);
  });

  it.each(cfg.malformed)('$name: never throws, one narrative event, Keeper narration only, no debris', (c) => {
    const ctx = newCtx(cfg.seed());
    expect(() => applyLlmResult(ctx, cfg.job(), c.reply)).not.toThrow();
    const stored = rows(ctx, c.table).filter((r) => r.kind === c.kind);
    expect(stored).toHaveLength(1);
    expect(stored[0].segments).toBeDefined();
    if (c.kind === 'creation_error' || c.kind === 'narrative') {
      expect(stored[0].segments).toHaveLength(1);
      expect(stored[0].segments[0]).toEqual(keeper(stored[0].message));
    }
    // no second narrative event on either table
    expect(segmentRows(ctx)).toHaveLength(1);
    expectSegmentInvariant(ctx, []);
    expectNoDebris(ctx);
  });
});

describe('SEG-04 matrix: renown_perk_gen still writes the static options on a malformed reply', () => {
  it.each([NOT_JSON, UNRELATED, '{"perks":[]}'])('%s', (reply) => {
    const ctx = newCtx({ character: [characterRow()] });
    applyLlmResult(ctx, applyJob('renown_perk_gen', JSON.stringify({ characterId: '10', rank: '2' })), reply);
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(3);
    expect(segmentRows(ctx)).toHaveLength(1);
    expectSegmentInvariant(ctx, []);
  });
});

describe('SEG-04 matrix: world_gen (stage 2) writes its existing system line and no segments', () => {
  it.each([
    ['not JSON', NOT_JSON],
    ['valid JSON missing the fields', UNRELATED],
    ['debris', `{"locations": ${CANARY}`],
  ])('%s', (_label, reply) => {
    const ctx = newCtx(fillSeed());
    expect(() => applyLlmResult(ctx, applyJob('world_gen', GEN_CTX), reply)).not.toThrow();
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FILL_ERROR');
    const system = rows(ctx, 'event_private').filter((r) => r.kind === 'system');
    expect(system).toHaveLength(1);
    expect(system[0].segments).toBeUndefined();
    expect(segmentRows(ctx)).toHaveLength(0);
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
    expectNoDebris(ctx);
  });

  it('a success (stage 2a, Phase 51.3.1.2) writes no line and no segments: it starts the families job', () => {
    const ctx = newCtx(fillSeed());
    expect(() => applyLlmResult(ctx, applyJob('world_gen', GEN_CTX), JSON.stringify(REGION_FILL_JSON))).not.toThrow();
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FILLING_FAMILIES');
    expect(rows(ctx, 'event_private')).toHaveLength(0);
    expect(segmentRows(ctx)).toHaveLength(0);
    expectSegmentInvariant(ctx, []);
  });
});

describe('SEG-04 matrix: world_gen_families (stage 2b, Phase 51.3.1.2) writes no segment of its own', () => {
  /** A traveller's region whose places stage 2a wrote: the state is FILLING_FAMILIES. */
  const familiesCtx = () => {
    const seed = fillSeed();
    seed.world_gen_state = [genState({ step: 'FILLING', generatedRegionId: 1n, sourceLocationId: 50n, sourceRegionId: 100n })];
    const ctx = newCtx(seed);
    applyLlmResult(ctx, applyJob('world_gen', GEN_CTX), JSON.stringify(REGION_FILL_JSON));
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FILLING_FAMILIES');
    return ctx;
  };
  const FAMILIES_JSON = {
    families: [
      {
        name: 'Ember Wolves', singularNoun: 'ember wolf', pluralNoun: 'ember wolves', creatureType: 'beast', iconKey: 'beast',
        temperament: 'aggressive', ambushVerb: 'lunge', ambushRest: 'out of the ash',
        members: [{ role: 'damage', name: 'Ember Wolf' }], fitLocations: ['Slag Road'], relations: [],
      },
    ],
  };

  it.each([
    ['not JSON', NOT_JSON],
    ['valid JSON missing the fields', UNRELATED],
    ['debris', `{"families": ${CANARY}`],
  ])('%s: FAMILIES_ERROR with one system line and no segments', (_label, reply) => {
    const ctx = familiesCtx();
    expect(() => applyLlmResult(ctx, applyJob('world_gen_families', GEN_CTX), reply)).not.toThrow();
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FAMILIES_ERROR');
    const system = rows(ctx, 'event_private').filter((r) => r.kind === 'system');
    expect(system).toHaveLength(1);
    expect(system[0].segments).toBeUndefined();
    expect(segmentRows(ctx)).toHaveLength(0);
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
    expectNoDebris(ctx);
  });

  it('a success writes only the lines finishRegionFill posts (the region-opened and discovery lines), with no segments', () => {
    const ctx = familiesCtx();
    expect(() => applyLlmResult(ctx, applyJob('world_gen_families', GEN_CTX), JSON.stringify(FAMILIES_JSON))).not.toThrow();
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('COMPLETE');
    const lines = rows(ctx, 'event_private');
    expect(lines.map((r) => r.kind)).toEqual(['system', 'system']);
    for (const line of lines) expect(line.segments).toBeUndefined();
    expect(segmentRows(ctx)).toHaveLength(0);
    expectSegmentInvariant(ctx, []);
  });

  it('a failed families job writes one system line and no segments', () => {
    const ctx = familiesCtx();
    applyLlmFailure(ctx, applyJob('world_gen_families', GEN_CTX));
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FAMILIES_ERROR');
    expect(rows(ctx, 'event_private').map((r) => r.segments)).toEqual([undefined]);
    expect(segmentRows(ctx)).toHaveLength(0);
  });
});
