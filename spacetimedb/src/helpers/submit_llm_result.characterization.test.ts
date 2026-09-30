/**
 * CHARACTERIZATION TESTS for the `submit_llm_result` reducer (Phase 40, Plan 05).
 *
 * These tests call the REAL reducer handler from `spacetimedb/src/index.ts`
 * (captured through the schema recorder) and pin its CURRENT behavior with
 * full-database snapshots, including quirks. They are written BEFORE the apply
 * logic moves (Plan 40-08) and must pass unmodified afterwards.
 *
 * Rules for editing this file:
 *  - Pin what the code does, never what it should do. A quirk stays a quirk.
 *  - Do not touch production code to make a case easier to test.
 *  - Snapshots are deterministic: fixed timestamp, Math.random stubbed, one
 *    shared identity object for seeding and for `sender` (the mock DB compares
 *    identities with ===).
 *
 * Phase 41 (plan 03) deliberately changed the pinned behavior in the cases whose title
 * starts with "Phase 41": creation replies are clamped, the renown static fallback no
 * longer throws for bigint effects, and a terminal renown failure inserts the static
 * options. Every other case still pins what the code does, unchanged.
 *
 * Known limits of the mock DB that these tests inherit (and that 40-08 inherits
 * with them): the `by_name` index accessor is mapped to the column `name`, so the
 * real `race_definition.by_name` (column `nameLower`) is exercised through a row
 * whose `name` equals the lowercase race name.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { capturedReducer, rowColumnProblems, snapshotDb } from './schema_recorder';
import { createMockCtx } from './test-utils';
import { serializePerkEffect } from './renown';
import { clampToBudget } from './skill_budget';
import { RENOWN_PERK_POOLS } from '../data/renown_data';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const T0 = 1_700_000_000_000_000n; // 2023-11-14T22:13:20Z
const T_OLD = 1_600_000_000_000_000n;
const TODAY = '2023-11-14';

const alice = { toHexString: () => 'a'.repeat(64) };
const bob = { toHexString: () => 'b'.repeat(64) };

const ts = (micros: bigint) => ({ microsSinceUnixEpoch: micros });

let handler: ((...args: any[]) => any) | undefined;

beforeAll(async () => {
  await import('../index');
  handler = capturedReducer('submit_llm_result');
  if (typeof handler !== 'function') {
    throw new Error(
      "capturedReducer('submit_llm_result') is not a function: the schema recorder could not " +
        'capture the reducer from index.ts. STOP and report; never edit production code to fix this.',
    );
  }
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
    for (const [table, rows] of Object.entries(part)) (out[table] ??= []).push(...rows);
  }
  return out;
}

function newCtx(seed: Seed, sender: any = alice) {
  return createMockCtx({ seed, sender, timestampMicros: T0 });
}

function rows(ctx: any, table: string): any[] {
  return ctx.db._tables[table] ?? [];
}

/** Sorted names of tables that hold rows (the mock creates empty tables on read). */
function nonEmptyTables(ctx: any): string[] {
  return Object.entries<any[]>(ctx.db._tables)
    .filter(([, list]) => list.length > 0)
    .map(([name]) => name)
    .sort();
}

function tableLengths(ctx: any): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, list] of Object.entries<any[]>(ctx.db._tables)) out[name] = list.length;
  return out;
}

/** Rows appended (inserted) since `before` that do not match the recorded table columns. */
function insertProblems(ctx: any, before: Record<string, number>): string[] {
  const problems: string[] = [];
  for (const [name, list] of Object.entries<any[]>(ctx.db._tables)) {
    for (const row of list.slice(before[name] ?? 0)) {
      for (const p of rowColumnProblems(name, row)) problems.push(`${name}: ${p}`);
    }
  }
  return problems;
}

function dump(ctx: any): string {
  return JSON.stringify(JSON.parse(snapshotDb(ctx.db)), null, 2);
}

function callSubmit(
  ctx: any,
  args: { taskId?: bigint; resultText?: string; success?: boolean; errorMessage?: string } = {},
) {
  return handler!(ctx, {
    taskId: 1n,
    resultText: '',
    success: true,
    errorMessage: undefined,
    ...args,
  });
}

/**
 * Call the real handler, assert every inserted row matches the recorded schema
 * (the PIPE-08 bug class), and snapshot the whole database.
 */
function exec(
  ctx: any,
  args: Parameters<typeof callSubmit>[1] = {},
  opts: { skipSchemaCheck?: boolean } = {},
) {
  const before = tableLengths(ctx);
  callSubmit(ctx, args);
  if (!opts.skipSchemaCheck) expect(insertProblems(ctx, before)).toEqual([]);
  expect(dump(ctx)).toMatchSnapshot();
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function llmTask(domain: string, contextJson?: string, over: Record<string, any> = {}) {
  return {
    id: 1n,
    playerId: alice,
    domain,
    model: 'gpt-5-mini',
    systemPrompt: '',
    userPrompt: '',
    maxTokens: 1500n,
    status: 'pending',
    contextJson,
    createdAt: ts(T_OLD),
    ...over,
  };
}

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
  return {
    id: 2n,
    playerId: alice,
    step,
    raceName: undefined,
    createdAt: ts(T_OLD),
    updatedAt: ts(T_OLD),
    ...over,
  };
}

const CTX_CHAR = JSON.stringify({ characterId: '10' });

const RACE_JSON = {
  raceName: 'Ashkin',
  narrative: 'Born of cinders and spite.',
  bonuses: {
    primary: { stat: 'str', value: 2 },
    secondary: { stat: 'dex', value: 1 },
    flavor: 'Ember-warm.',
  },
};

const CLASS_JSON = {
  className: 'Emberblade',
  classDescription: 'A duelist who fights like a grudge.',
  stats: {
    primaryStat: 'str',
    secondaryStat: 'dex',
    bonusHp: 10,
    bonusMana: 0,
    armorProficiency: 'leather',
    armorProficiencies: ['leather', 'mail'],
    weaponProficiencies: ['sword', 'dagger'],
    usesMana: false,
  },
  abilities: [
    {
      name: 'Ember Slash',
      description: 'A burning cut.',
      kind: 'damage',
      damageType: 'fire',
      value1: 12,
      castSeconds: 0,
      cooldownSeconds: 6,
      resourceCost: 5,
      resourceType: 'stamina',
      effectType: 'dot',
      effectDuration: 9,
    },
    {
      name: 'Ash Veil',
      description: 'A curtain of soot.',
      kind: 'shield',
      value1: 10,
      castSeconds: 2,
      cooldownSeconds: 12,
      resourceCost: 8,
      resourceType: 'mana',
    },
    {
      // legacy field names: baseDamage, manaCost, effect
      name: 'Old Style',
      description: 'A legacy-shaped ability.',
      baseDamage: 7,
      manaCost: 4,
      effect: 'stun',
      castSeconds: 0,
      cooldownSeconds: 3,
    },
  ],
};

function skill(name: string, over: Record<string, any> = {}) {
  return {
    name,
    description: `${name} description.`,
    kind: 'damage',
    targetRule: 'single_enemy',
    resourceType: 'stamina',
    resourceCost: 5,
    castSeconds: 0,
    cooldownSeconds: 6,
    scaling: 'str',
    value1: 10,
    value2: null,
    damageType: 'physical',
    effectType: null,
    effectMagnitude: null,
    effectDuration: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Wrapper: the three guards and the status write
// ---------------------------------------------------------------------------

describe('submit_llm_result wrapper', () => {
  it('throws "LLM task not found" for an unknown task id', () => {
    const ctx = newCtx({});
    expect(() => callSubmit(ctx, { taskId: 99n })).toThrow(/LLM task not found/);
    expect(dump(ctx)).toMatchSnapshot();
  });

  it('throws "Not your task" when another player calls it and leaves the task pending', () => {
    const ctx = newCtx({ llm_task: [llmTask('creation_race')] }, bob);
    expect(() => callSubmit(ctx)).toThrow(/Not your task/);
    expect(rows(ctx, 'llm_task')[0].status).toBe('pending');
    expect(dump(ctx)).toMatchSnapshot();
  });

  it('throws "Task already processed" for a completed task', () => {
    const ctx = newCtx({ llm_task: [llmTask('creation_race', undefined, { status: 'completed' })] });
    expect(() => callSubmit(ctx)).toThrow(/Task already processed/);
    expect(rows(ctx, 'llm_task')[0].status).toBe('completed');
    expect(dump(ctx)).toMatchSnapshot();
  });

  it('throws "Task already processed" for an errored task', () => {
    const ctx = newCtx({ llm_task: [llmTask('creation_race', undefined, { status: 'error' })] });
    expect(() => callSubmit(ctx, { success: false })).toThrow(/Task already processed/);
    expect(rows(ctx, 'llm_task')[0].status).toBe('error');
  });

  it('checks existence, then ownership, then status (a completed task of another player is "Not your task")', () => {
    const ctx = newCtx({ llm_task: [llmTask('creation_race', undefined, { status: 'completed' })] }, bob);
    expect(() => callSubmit(ctx)).toThrow(/Not your task/);
  });

  it('marks an unrecognized domain completed on success and touches nothing else', () => {
    const ctx = newCtx({ llm_task: [llmTask('generic')] });
    exec(ctx, { resultText: '{"anything":true}' });
    expect(rows(ctx, 'llm_task')[0].status).toBe('completed');
    expect(nonEmptyTables(ctx)).toEqual(['llm_task']);
  });

  it('marks an unrecognized domain error on failure and touches nothing else', () => {
    const ctx = newCtx({ llm_task: [llmTask('generic')] });
    exec(ctx, { success: false, errorMessage: 'proxy timeout' });
    expect(rows(ctx, 'llm_task')[0].status).toBe('error');
    expect(nonEmptyTables(ctx)).toEqual(['llm_task']);
  });
});

// ---------------------------------------------------------------------------
// Failure paths (success: false), Task 1 domains
// ---------------------------------------------------------------------------

describe('submit_llm_result failure path: creation and skill_gen', () => {
  it('creation_race failure appends creation_error and reverts the step to AWAITING_RACE', () => {
    const ctx = newCtx({
      llm_task: [llmTask('creation_race')],
      character_creation_state: [creationState('GENERATING_RACE')],
    });
    exec(ctx, { success: false, errorMessage: 'boom' });
    expect(rows(ctx, 'llm_task')[0].status).toBe('error');
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('AWAITING_RACE');
    expect(rows(ctx, 'event_creation')).toHaveLength(1);
    expect(rows(ctx, 'event_creation')[0].kind).toBe('creation_error');
    expect(rows(ctx, 'llm_budget')).toHaveLength(0);
  });

  // Deliberate change (review WR-B03): a creation failure only acts on a state still at its
  // GENERATING step. With no such state there is nothing to revert and nothing to say.
  it('creation_race failure without a creation state posts nothing', () => {
    const ctx = newCtx({ llm_task: [llmTask('creation_race')] });
    exec(ctx, { success: false });
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
    expect(rows(ctx, 'character_creation_state')).toHaveLength(0);
  });

  it('creation_class failure appends creation_error and reverts the step to AWAITING_ARCHETYPE', () => {
    const ctx = newCtx({
      llm_task: [llmTask('creation_class')],
      character_creation_state: [creationState('GENERATING_CLASS')],
    });
    exec(ctx, { success: false });
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('AWAITING_ARCHETYPE');
    expect(rows(ctx, 'event_creation')[0].kind).toBe('creation_error');
  });

  it('skill_gen failure writes an in-voice private narrative for the character owner', () => {
    const ctx = newCtx({
      llm_task: [llmTask('skill_gen', CTX_CHAR)],
      character: [characterRow()],
    });
    exec(ctx, { success: false });
    const ev = rows(ctx, 'event_private');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ characterId: 10n, ownerUserId: 7n, kind: 'narrative' });
    expect(ev[0].message).toContain('Your potential eludes crystallization');
  });

  it('skill_gen failure for a missing character writes nothing but the task status', () => {
    const ctx = newCtx({ llm_task: [llmTask('skill_gen', CTX_CHAR)] });
    exec(ctx, { success: false });
    expect(nonEmptyTables(ctx)).toEqual(['llm_task']);
  });

  // Phase 41 (plan 03): a terminal renown failure no longer does nothing. The static options
  // for the rank are inserted and the Keeper says so, so an earned offer is never lost.
  it('Phase 41: renown_perk_gen failure inserts the static options for the rank and one Keeper line', () => {
    const ctx = newCtx({
      llm_task: [llmTask('renown_perk_gen', JSON.stringify({ characterId: '10', rank: '2' }))],
      character: [characterRow()],
    });
    exec(ctx, { success: false });
    expect(rows(ctx, 'llm_task')[0].status).toBe('error');
    expect(nonEmptyTables(ctx)).toEqual(['character', 'event_private', 'llm_task', 'pending_renown_perk']);
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(3);
    expect(rows(ctx, 'pending_renown_perk').every((p: any) => p.characterId === 10n && p.rank === 2n)).toBe(true);
    const ev = rows(ctx, 'event_private');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ characterId: 10n, ownerUserId: 7n, kind: 'narrative' });
    expect(ev[0].message).toContain('The cosmos provided some... standard options');
    expect(rows(ctx, 'llm_budget')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// creation_race success
// ---------------------------------------------------------------------------

describe('submit_llm_result creation_race success', () => {
  const seed = () => ({
    llm_task: [llmTask('creation_race')],
    character_creation_state: [creationState('GENERATING_RACE')],
  });

  it('applies a valid reply: state, creation event, race_definition and the budget', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: JSON.stringify(RACE_JSON) });

    expect(rows(ctx, 'llm_task')[0].status).toBe('completed');
    const state = rows(ctx, 'character_creation_state')[0];
    expect(state).toMatchObject({
      step: 'AWAITING_ARCHETYPE',
      raceName: 'Ashkin',
      raceNarrative: 'Born of cinders and spite.',
    });
    expect(JSON.parse(state.raceBonuses).primary).toEqual({ stat: 'str', value: 2 });
    expect(rows(ctx, 'event_creation')).toHaveLength(1);
    expect(rows(ctx, 'event_creation')[0].message).toContain('+2 STR, +1 DEX. Ember-warm.');
    expect(rows(ctx, 'race_definition')).toHaveLength(1);
    expect(rows(ctx, 'race_definition')[0]).toMatchObject({ name: 'Ashkin', nameLower: 'ashkin' });
    expect(rows(ctx, 'llm_budget')).toEqual([
      { id: 1n, playerId: alice, callCount: 1n, resetDate: TODAY },
    ]);
  });

  it('increments an existing budget row instead of adding a second one', () => {
    const ctx = newCtx({
      ...seed(),
      llm_budget: [{ id: 5n, playerId: alice, callCount: 4n, resetDate: TODAY }],
    });
    exec(ctx, { resultText: JSON.stringify(RACE_JSON) });
    expect(rows(ctx, 'llm_budget')).toHaveLength(1);
    expect(rows(ctx, 'llm_budget')[0].callCount).toBe(5n);
  });

  it('accepts a reply wrapped in a markdown code fence', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: '```json\n' + JSON.stringify(RACE_JSON) + '\n```' });
    expect(rows(ctx, 'character_creation_state')[0].raceName).toBe('Ashkin');
  });

  it('accepts a reply with prose around the JSON object (brace extraction)', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: 'Here you go: ' + JSON.stringify(RACE_JSON) + ' Enjoy.' });
    expect(rows(ctx, 'character_creation_state')[0].raceName).toBe('Ashkin');
  });

  it('does not add a second race_definition when one already exists for the race', () => {
    // Mock limit: by_name maps to the column `name`, so the seeded row's name is lowercase.
    const ctx = newCtx({
      ...seed(),
      race_definition: [
        { id: 9n, name: 'ashkin', nameLower: 'ashkin', narrative: 'old', bonusesJson: '{}', createdAt: ts(T_OLD) },
      ],
    });
    exec(ctx, { resultText: JSON.stringify(RACE_JSON) });
    expect(rows(ctx, 'race_definition')).toHaveLength(1);
    expect(rows(ctx, 'race_definition')[0].narrative).toBe('old');
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('AWAITING_ARCHETYPE');
  });

  it('Phase 41: a reply without raceName stores "Unknown" with default bonuses, prints "**Unknown**" and saves no definition', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: JSON.stringify({ narrative: 'Nothing much.' }) });
    expect(rows(ctx, 'character_creation_state')[0].raceName).toBe('Unknown');
    expect(JSON.parse(rows(ctx, 'character_creation_state')[0].raceBonuses)).toEqual({
      primary: { stat: 'str', value: 2 },
      secondary: { stat: 'dex', value: 1 },
    });
    const msg = rows(ctx, 'event_creation')[0].message as string;
    expect(msg).toContain('**Unknown**');
    expect(msg).toContain('+2 STR, +1 DEX');
    expect(rows(ctx, 'race_definition')).toHaveLength(0);
  });

  it('QUIRK: malformed JSON increments the budget BEFORE parsing, reverts the step and reports the error', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: 'the cosmos declined to answer' });
    expect(rows(ctx, 'llm_task')[0].status).toBe('completed');
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('AWAITING_RACE');
    expect(rows(ctx, 'event_creation')[0]).toMatchObject({ kind: 'creation_error' });
    expect(rows(ctx, 'event_creation')[0].message).toContain('malformed');
    expect(rows(ctx, 'llm_budget')[0].callCount).toBe(1n);
    expect(rows(ctx, 'race_definition')).toHaveLength(0);
  });

  it('with no creation state returns silently: no event and no budget increment', () => {
    const ctx = newCtx({ llm_task: [llmTask('creation_race')] });
    exec(ctx, { resultText: JSON.stringify(RACE_JSON) });
    expect(rows(ctx, 'llm_task')[0].status).toBe('completed');
    expect(nonEmptyTables(ctx)).toEqual(['llm_task']);
  });
});

// ---------------------------------------------------------------------------
// creation_class success
// ---------------------------------------------------------------------------

describe('submit_llm_result creation_class success', () => {
  const seed = () => ({
    llm_task: [llmTask('creation_class')],
    character_creation_state: [
      creationState('GENERATING_CLASS', { raceName: 'Ashkin', raceNarrative: 'Born of cinders.' }),
    ],
  });

  it('applies a valid reply: CLASS_REVEALED, stats, abilities, presentation event, budget', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: JSON.stringify(CLASS_JSON) });

    const state = rows(ctx, 'character_creation_state')[0];
    expect(state).toMatchObject({
      step: 'CLASS_REVEALED',
      className: 'Emberblade',
      classDescription: 'A duelist who fights like a grudge.',
      raceName: 'Ashkin',
    });
    expect(JSON.parse(state.classStats).primaryStat).toBe('str');
    expect(JSON.parse(state.abilities)).toHaveLength(3);
    const msg = rows(ctx, 'event_creation')[0].message as string;
    // Phase 41: 'mail' is not a vocabulary armor type, so the validator drops it.
    expect(msg).toContain('Primary: STR, Secondary: DEX | Armor: leather | Weapons: sword, dagger | Physical (+10 bonus HP)');
    expect(msg).toContain('[Ember Slash]');
    expect(msg).toContain('[Old Style]');
    expect(rows(ctx, 'llm_budget')[0].callCount).toBe(1n);
  });

  it('Phase 41: legacy ability field names are not read (vocabulary defaults apply) on a mana-user class line', () => {
    const ctx = newCtx({
      llm_task: [llmTask('creation_class')],
      character_creation_state: [
        creationState('GENERATING_CLASS', { raceName: 'Ashkin', raceNarrative: 'Born of cinders.', archetype: 'mystic' }),
      ],
    });
    const legacy = {
      className: 'Cinder Mystic',
      classDescription: 'Glows unpleasantly.',
      stats: { primaryStat: 'int', secondaryStat: 'none', usesMana: true, bonusMana: 15, armorProficiency: 'cloth' },
      abilities: [
        { name: 'Spark', description: 'A spark.', baseDamage: 6, manaCost: 3, effect: 'stun', castSeconds: 1, cooldownSeconds: 4 },
      ],
    };
    exec(ctx, { resultText: JSON.stringify(legacy) });
    const msg = rows(ctx, 'event_creation')[0].message as string;
    expect(msg).toContain('Primary: INT | Armor: cloth | Mana user (+15 bonus mana)');
    // baseDamage, manaCost and effect are ignored: kind defaults to damage, value1 to 15, the
    // mana cost to 15, and no effect line is printed.
    expect(msg).toContain('physical damage, 15 base, 1s cast, 4s cooldown, 15 mana');
    expect(msg).not.toContain('stun');
  });

  it('Phase 41: an empty object stores "Unknown Class" with default stats and prints "**Unknown Class**"', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: '{}' });
    const state = rows(ctx, 'character_creation_state')[0];
    expect(state.step).toBe('CLASS_REVEALED');
    expect(state.className).toBe('Unknown Class');
    expect(JSON.parse(state.classStats)).toEqual({
      primaryStat: 'str',
      secondaryStat: 'dex',
      bonusHp: 0,
      bonusMana: 0,
      usesMana: false,
      weaponProficiencies: [],
      armorProficiencies: [],
    });
    expect(state.abilities).toBe('[]');
    expect(rows(ctx, 'event_creation')[0].message).toContain('**Unknown Class**');
  });

  it('QUIRK: malformed JSON increments the budget BEFORE parsing and reverts to AWAITING_ARCHETYPE', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: 'not json at all' });
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('AWAITING_ARCHETYPE');
    expect(rows(ctx, 'event_creation')[0].kind).toBe('creation_error');
    expect(rows(ctx, 'llm_budget')[0].callCount).toBe(1n);
  });

  it('Phase 41: a null ability entry is dropped, not fatal (the old midway throw and revert is gone)', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: JSON.stringify({ className: 'Half Built', abilities: [null] }) });
    const state = rows(ctx, 'character_creation_state')[0];
    expect(state.step).toBe('CLASS_REVEALED');
    expect(state.className).toBe('Half Built');
    expect(state.abilities).toBe('[]');
    expect(rows(ctx, 'event_creation')).toHaveLength(1);
    expect(rows(ctx, 'event_creation')[0].kind).toBe('creation');
    expect(rows(ctx, 'llm_budget')[0].callCount).toBe(1n);
  });
});

// ---------------------------------------------------------------------------
// skill_gen success
// ---------------------------------------------------------------------------

describe('submit_llm_result skill_gen success', () => {
  const seed = () => ({
    llm_task: [llmTask('skill_gen', CTX_CHAR)],
    character: [characterRow({ level: 3n })],
  });

  it('inserts three pending skills, presents them and increments the budget', () => {
    const ctx = newCtx(seed());
    const reply = { skills: [skill('Cinder Cut'), skill('Ash Ward', { kind: 'shield', resourceType: 'mana', castSeconds: 0 }), skill('Ember Pulse', { kind: 'heal', targetRule: 'self', scaling: 'wis' })] };
    exec(ctx, { resultText: JSON.stringify(reply) });

    const pending = rows(ctx, 'pending_skill');
    expect(pending).toHaveLength(3);
    expect(pending.map((p: any) => p.name)).toEqual(['Cinder Cut', 'Ash Ward', 'Ember Pulse']);
    expect(pending.every((p: any) => p.characterId === 10n && p.levelRequired === 3n)).toBe(true);
    const ev = rows(ctx, 'event_private');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ characterId: 10n, ownerUserId: 7n, kind: 'narrative' });
    expect(ev[0].message).toContain('Level 3. How quaint.');
    expect(ev[0].message).toContain('[Cinder Cut]');
    expect(rows(ctx, 'llm_budget')[0]).toMatchObject({ playerId: alice, callCount: 1n });
  });

  it('applies the v2.0 validators on the way in (over-budget value, unknown kind, mana cast floor)', () => {
    const ctx = newCtx(seed());
    const reply = {
      skills: [
        skill('Overkill', { value1: 9999 }),
        skill('Mystery', { kind: 'nonsense' }),
        skill('Instant Mana', { resourceType: 'mana', castSeconds: 0 }),
      ],
    };
    exec(ctx, { resultText: JSON.stringify(reply) });
    const pending = rows(ctx, 'pending_skill');
    expect(pending[0].value1).toBeLessThan(9999n);
    expect(pending[1].kind).toBe('damage');
    expect(pending[2].castSeconds).toBe(1n);
  });

  it('accepts the Claude structured-output shape with explicit nulls', () => {
    const ctx = newCtx(seed());
    const reply = { skills: [skill('A'), skill('B'), skill('C')] };
    exec(ctx, { resultText: JSON.stringify(reply) });
    const pending = rows(ctx, 'pending_skill');
    expect(pending).toHaveLength(3);
    expect(pending[0].value2).toBeUndefined();
    expect(pending[0].effectType).toBeUndefined();
  });

  // Deliberate change (review CR-B02): a result never overwrites an offer the player may be
  // looking at. The old "retry safety" delete silently lost an earned offer.
  it('keeps an offer that is already pending for the character and inserts nothing', () => {
    const ctx = newCtx({
      ...seed(),
      pending_skill: [
        { id: 50n, characterId: 10n, name: 'Stale', description: 'old', kind: 'damage', targetRule: 'single_enemy', resourceType: 'mana', resourceCost: 1n, castSeconds: 1n, cooldownSeconds: 1n, scaling: 'none', value1: 1n, levelRequired: 3n, createdAt: ts(T_OLD) },
        { id: 51n, characterId: 99n, name: 'OtherChar', description: 'keep', kind: 'damage', targetRule: 'single_enemy', resourceType: 'mana', resourceCost: 1n, castSeconds: 1n, cooldownSeconds: 1n, scaling: 'none', value1: 1n, levelRequired: 3n, createdAt: ts(T_OLD) },
      ],
    });
    exec(ctx, { resultText: JSON.stringify({ skills: [skill('A'), skill('B'), skill('C')] }) }, { skipSchemaCheck: true });
    const names = rows(ctx, 'pending_skill').map((p: any) => p.name).sort();
    expect(names).toEqual(['OtherChar', 'Stale']);
  });

  it('QUIRK: fewer than three skills writes the grimace message with NO budget increment and NO pending rows', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: JSON.stringify({ skills: [skill('Only One'), skill('Only Two')] }) });
    expect(rows(ctx, 'llm_task')[0].status).toBe('completed');
    expect(rows(ctx, 'pending_skill')).toHaveLength(0);
    expect(rows(ctx, 'llm_budget')).toHaveLength(0);
    expect(rows(ctx, 'event_private')).toHaveLength(1);
    expect(rows(ctx, 'event_private')[0].message).toContain('The cosmic machinery sputtered');
  });

  it('QUIRK: a skill missing name or kind is skipped, dropping the batch under three (grimace)', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: JSON.stringify({ skills: [skill('A'), skill('B'), { ...skill('C'), kind: '' }] }) });
    expect(rows(ctx, 'pending_skill')).toHaveLength(0);
    expect(rows(ctx, 'event_private')[0].message).toContain('sputtered');
  });

  it('QUIRK: only the first three skills are considered', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: JSON.stringify({ skills: [skill('A'), skill('B'), skill('C'), skill('D')] }) });
    expect(rows(ctx, 'pending_skill').map((p: any) => p.name)).toEqual(['A', 'B', 'C']);
  });

  it('unparseable text writes the grimace message with no budget increment', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: 'sorry, no skills today' });
    expect(rows(ctx, 'pending_skill')).toHaveLength(0);
    expect(rows(ctx, 'llm_budget')).toHaveLength(0);
    expect(rows(ctx, 'event_private')[0].message).toContain('sputtered');
  });

  it('a missing character returns silently (only the task status changes)', () => {
    const ctx = newCtx({ llm_task: [llmTask('skill_gen', CTX_CHAR)] });
    exec(ctx, { resultText: JSON.stringify({ skills: [skill('A'), skill('B'), skill('C')] }) });
    expect(nonEmptyTables(ctx)).toEqual(['llm_task']);
  });
});

// ---------------------------------------------------------------------------
// Task 2 fixtures: world_gen, npc_conversation, combat_narration, renown_perk_gen
// ---------------------------------------------------------------------------

const GEN_CTX = JSON.stringify({ genStateId: '5' });

function genState(over: Record<string, any> = {}) {
  return {
    id: 5n,
    playerId: alice,
    characterId: 10n,
    sourceLocationId: 0n,
    sourceRegionId: 0n,
    step: 'GENERATING',
    createdAt: ts(T_OLD),
    updatedAt: ts(T_OLD),
    ...over,
  };
}

const REGION_JSON = {
  regionName: 'Cinderfall',
  regionDescription: 'Ash drifts down like a slow, grey snowfall.',
  biome: 'volcanic',
  dominantFaction: 'Ash Court',
  landmarks: ['The Slag Spire'],
  threats: ['ember wolves'],
  locations: [
    { name: 'Ember Hollow', description: 'A sheltered town.', terrainType: 'town', isSafe: true, levelOffset: 0, connectsTo: ['Slag Road'] },
    { name: 'Slag Road', description: 'A cracked road.', terrainType: 'plains', isSafe: false, levelOffset: 0, connectsTo: ['Ember Hollow', 'Ashen Pit'] },
    { name: 'Ashen Pit', description: 'A smoking crater.', terrainType: 'mountains', isSafe: false, levelOffset: 1, connectsTo: ['Slag Road'] },
  ],
  npcs: [
    { name: 'Vessa', npcType: 'vendor', locationName: 'Ember Hollow', description: 'A soot-streaked trader.', greeting: 'Buy something.', personality: { traits: ['brisk'], speechPattern: 'clipped', knowledgeDomains: ['trade'], secrets: [], affinityMultiplier: 1.0 } },
    { name: 'Old Brann', npcType: 'lore', locationName: 'Nowhere In Particular' },
  ],
  enemies: [
    { name: 'Ember Wolf', creatureType: 'beast', role: 'melee', terrainTypes: 'plains', groupMin: 1, groupMax: 2, level: 1 },
    { name: 'Slag Caster', creatureType: 'humanoid', role: 'caster', terrainTypes: 'mountains', groupMin: 1, groupMax: 1, level: 1 },
  ],
};

function worldSeed(over: { gen?: Record<string, any>; char?: Record<string, any> | null } = {}): Seed {
  return {
    llm_task: [llmTask('world_gen', GEN_CTX)],
    world_gen_state: [genState(over.gen)],
    character: over.char === null ? [] : [characterRow({ locationId: 0n, boundLocationId: 0n, level: 1n, ...over.char })],
  };
}

const NPC_CTX = JSON.stringify({ characterId: '10', npcId: '20', memoryId: '30' });
const EMPTY_MEMORY = JSON.stringify({
  topics: [],
  questsCompleted: [],
  secretsShared: [],
  giftsGiven: [],
  lastConversationSummary: '',
});

function npcSeed(...extra: Seed[]): Seed {
  return mergeSeeds(
    {
      llm_task: [llmTask('npc_conversation', NPC_CTX)],
      character: [characterRow()],
      npc: [
        { id: 20n, name: 'Marta', npcType: 'lore', locationId: 100n, description: 'A baker.', greeting: 'Hello.', personalityJson: JSON.stringify({ affinityMultiplier: 1.0 }) },
      ],
      npc_memory: [{ id: 30n, characterId: 10n, npcId: 20n, memoryJson: EMPTY_MEMORY, lastUpdated: ts(T_OLD) }],
      npc_affinity: [
        { id: 40n, characterId: 10n, npcId: 20n, affinity: 0n, lastInteraction: ts(T_OLD), giftsGiven: 0n, conversationCount: 0n },
      ],
    },
    ...extra,
  );
}

const WORLD_LOCS: Seed = {
  location: [
    { id: 100n, name: 'Market Square', regionId: 1n, isSafe: true, terrainType: 'town' },
    { id: 101n, name: 'Old Mill', regionId: 1n, isSafe: false, terrainType: 'plains' },
    { id: 102n, name: 'Far Field', regionId: 2n, isSafe: false, terrainType: 'plains' },
  ],
  location_connection: [
    { id: 1n, fromLocationId: 100n, toLocationId: 101n },
    { id: 2n, fromLocationId: 101n, toLocationId: 100n },
  ],
};

const WOLF_TEMPLATE: Seed = {
  enemy_template: [{ id: 60n, name: 'Wolf', level: 3n }],
  location_enemy_template: [{ id: 70n, locationId: 101n, enemyTemplateId: 60n }],
};

function npcReply(over: Record<string, any> = {}) {
  return JSON.stringify({
    dialogue: 'The bread is warm today.',
    effects: [],
    memoryUpdate: {},
    internalThought: '',
    ...over,
  });
}

function offer(over: Record<string, any> = {}) {
  return { type: 'offer_quest', questName: 'Rats in the Cellar', ...over };
}

// ---------------------------------------------------------------------------
// world_gen
// ---------------------------------------------------------------------------

describe('submit_llm_result world_gen failure path', () => {
  it('sets the state to ERROR and tells a placed character through a private system event', () => {
    const ctx = newCtx({
      llm_task: [llmTask('world_gen', GEN_CTX)],
      world_gen_state: [genState({ step: 'GENERATING', errorMessage: 'stale' })],
      character: [characterRow({ locationId: 100n })],
    });
    exec(ctx, { success: false });
    expect(rows(ctx, 'llm_task')[0].status).toBe('error');
    expect(rows(ctx, 'world_gen_state')[0]).toMatchObject({
      step: 'ERROR',
      errorMessage: 'The Keeper falters. "The world refuses to be remembered right now."',
    });
    expect(rows(ctx, 'event_private')).toHaveLength(1);
    expect(rows(ctx, 'event_private')[0]).toMatchObject({ kind: 'system', characterId: 10n, ownerUserId: 7n });
    expect(rows(ctx, 'event_private')[0].message).toContain(' Type [explore] to try again.');
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
  });

  it('routes the message to the creation events when the character has no location yet', () => {
    const ctx = newCtx(worldSeed());
    exec(ctx, { success: false });
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('ERROR');
    expect(rows(ctx, 'event_creation')).toHaveLength(1);
    expect(rows(ctx, 'event_creation')[0]).toMatchObject({ kind: 'creation_error', playerId: alice });
    expect(rows(ctx, 'event_creation')[0].message).toContain(' Type [explore] to try again.');
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });

  it('routes to the creation events when the character row is gone', () => {
    const ctx = newCtx(worldSeed({ char: null }));
    exec(ctx, { success: false });
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('ERROR');
    expect(rows(ctx, 'event_creation')).toHaveLength(1);
  });

  it('writes nothing but the task status when the generation state is gone', () => {
    const ctx = newCtx({ llm_task: [llmTask('world_gen', GEN_CTX)] });
    exec(ctx, { success: false });
    expect(nonEmptyTables(ctx)).toEqual(['llm_task']);
  });

  it('QUIRK: a context without genStateId throws (the whole call rolls back in production)', () => {
    const ctx = newCtx({ llm_task: [llmTask('world_gen', '{}')] });
    expect(() => callSubmit(ctx, { success: false })).toThrow();
    const ctx2 = newCtx({ llm_task: [llmTask('world_gen', '{}')] });
    expect(() => callSubmit(ctx2, { success: true, resultText: '{}' })).toThrow();
  });
});

describe('submit_llm_result world_gen success', () => {
  it('starter region: writes region, locations, NPCs, enemies, completes the state and places the character', () => {
    const ctx = newCtx(worldSeed());
    exec(ctx, { resultText: JSON.stringify(REGION_JSON) });

    expect(rows(ctx, 'llm_task')[0].status).toBe('completed');
    const region = rows(ctx, 'region')[0];
    expect(region).toMatchObject({ name: 'Cinderfall', dangerMultiplier: 100n, isGenerated: true, starterForRace: 'ashkin', generatedByCharacterId: 10n });
    expect(rows(ctx, 'world_gen_state')[0]).toMatchObject({ step: 'COMPLETE', generatedRegionId: region.id });

    const names = rows(ctx, 'location').map((l: any) => l.name);
    expect(names).toEqual(['Ember Hollow', 'Slag Road', 'Ashen Pit', 'The Edge Beyond Cinderfall']);
    expect(rows(ctx, 'enemy_template').map((e: any) => e.level)).toEqual([1n, 1n]);
    expect(rows(ctx, 'npc').map((n: any) => n.name)).toEqual(['Vessa', 'Old Brann', 'The Ledger Keeper']);

    const home = rows(ctx, 'location')[0];
    expect(rows(ctx, 'character')[0]).toMatchObject({ locationId: home.id, boundLocationId: home.id });
    const priv = rows(ctx, 'event_private');
    expect(priv.map((e: any) => e.kind)).toEqual(['narrative', 'system']);
    expect(priv[0].message).toContain('You open your eyes in Ember Hollow, Cinderfall.');
    expect(priv[0].message).toContain('You notice Vessa and Old Brann and The Ledger Keeper nearby.');
    expect(rows(ctx, 'event_world')).toHaveLength(1);
    expect(rows(ctx, 'llm_budget')).toEqual([{ id: 1n, playerId: alice, callCount: 1n, resetDate: TODAY }]);
  });

  it('non-starter region: raises danger from the source, clamps enemy levels, turns the uncharted edge into a passage', () => {
    const ctx = newCtx({
      llm_task: [llmTask('world_gen', GEN_CTX)],
      world_gen_state: [genState({ sourceRegionId: 100n, sourceLocationId: 50n })],
      character: [characterRow({ locationId: 50n })],
      region: [{ id: 100n, name: 'Old Reach', dangerMultiplier: 300n }],
      location: [{ id: 50n, name: 'The Edge Beyond Old Reach', regionId: 100n, isSafe: true, terrainType: 'uncharted' }],
    });
    const reply = {
      ...REGION_JSON,
      enemies: [
        { name: 'Way Too Big', role: 'melee', level: 99 },
        { name: 'Way Too Small', role: 'ranged', level: 0 },
        { name: 'Just Right', role: 'melee', level: 3 },
      ],
    };
    exec(ctx, { resultText: JSON.stringify(reply) });

    const region = rows(ctx, 'region').find((r: any) => r.name === 'Cinderfall');
    expect(region.dangerMultiplier).toBeGreaterThanOrEqual(350n);
    expect(region.dangerMultiplier).toBeLessThanOrEqual(400n);
    expect(region.starterForRace).toBeUndefined();
    const levels = rows(ctx, 'enemy_template').map((e: any) => e.level);
    const base = region.dangerMultiplier / 100n;
    expect(levels).toEqual([base + 1n, base - 1n, 3n]);
    expect(rows(ctx, 'location').find((l: any) => l.id === 50n)).toMatchObject({
      terrainType: 'passage',
      name: 'The Passage to Cinderfall',
    });
    // The character already had a location: no placement, no arrival message, still a discovery message.
    expect(rows(ctx, 'character')[0].locationId).toBe(50n);
    expect(rows(ctx, 'event_private').map((e: any) => e.kind)).toEqual(['system']);
    expect(rows(ctx, 'event_world')[0].message).toContain('Old Reach');
  });

  it('places the character in a non-safe home location when the region has no safe one', () => {
    const ctx = newCtx(worldSeed());
    const reply = {
      ...REGION_JSON,
      locations: REGION_JSON.locations.map((l) => ({ ...l, isSafe: false })),
      npcs: [],
    };
    exec(ctx, { resultText: JSON.stringify(reply) });
    const home = rows(ctx, 'location')[0];
    expect(rows(ctx, 'character')[0].locationId).toBe(home.id);
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('COMPLETE');
  });

  it('QUIRK: charges the budget to the generation state player, not the sender', () => {
    const ctx = newCtx(worldSeed({ gen: { playerId: bob } }));
    exec(ctx, { resultText: JSON.stringify(REGION_JSON) });
    expect(rows(ctx, 'llm_budget')).toHaveLength(1);
    expect(rows(ctx, 'llm_budget')[0].playerId).toBe(bob);
  });

  it('QUIRK: a missing character still gets the region written, but no private events and no starter mark', () => {
    const ctx = newCtx(worldSeed({ char: null }));
    exec(ctx, { resultText: JSON.stringify(REGION_JSON) });
    expect(rows(ctx, 'region')[0].starterForRace).toBeUndefined();
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('COMPLETE');
    expect(rows(ctx, 'event_private')).toHaveLength(0);
    expect(rows(ctx, 'event_world')).toHaveLength(1);
    expect(rows(ctx, 'llm_budget')).toHaveLength(1);
  });

  it('accepts a code-fenced reply', () => {
    const ctx = newCtx(worldSeed());
    exec(ctx, { resultText: '```json\n' + JSON.stringify(REGION_JSON) + '\n```' });
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('COMPLETE');
  });

  it.each(['COMPLETE', 'PENDING', 'ERROR'])(
    'QUIRK: a state in step %s returns silently (only the task status changes)',
    (step) => {
      const ctx = newCtx(worldSeed({ gen: { step } }));
      exec(ctx, { resultText: JSON.stringify(REGION_JSON) });
      expect(rows(ctx, 'llm_task')[0].status).toBe('completed');
      expect(rows(ctx, 'world_gen_state')[0].step).toBe(step);
      expect(rows(ctx, 'region')).toHaveLength(0);
      expect(rows(ctx, 'llm_budget')).toHaveLength(0);
    },
  );

  it('returns silently when the generation state is gone', () => {
    const ctx = newCtx({ llm_task: [llmTask('world_gen', GEN_CTX)] });
    exec(ctx, { resultText: JSON.stringify(REGION_JSON) });
    expect(nonEmptyTables(ctx)).toEqual(['llm_task']);
  });

  it('invalid JSON fails the generation: state ERROR, creation_error for a character without a location, no budget', () => {
    const ctx = newCtx(worldSeed());
    exec(ctx, { resultText: 'the world did not say anything useful' });
    expect(rows(ctx, 'llm_task')[0].status).toBe('completed');
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('ERROR');
    expect(rows(ctx, 'event_creation')[0].message).toContain('came out wrong');
    expect(rows(ctx, 'event_creation')[0].message).toContain('Type [explore] to try again.');
    expect(rows(ctx, 'region')).toHaveLength(0);
    expect(rows(ctx, 'llm_budget')).toHaveLength(0);
  });

  it('invalid JSON fails through a private system event for a placed character', () => {
    const ctx = newCtx(worldSeed({ char: { locationId: 100n } }));
    exec(ctx, { resultText: '{ not json' });
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('ERROR');
    expect(rows(ctx, 'event_private')).toHaveLength(1);
    expect(rows(ctx, 'event_private')[0].kind).toBe('system');
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
  });

  it.each([
    ['a missing regionName', { ...REGION_JSON, regionName: undefined }],
    ['an empty regionName', { ...REGION_JSON, regionName: '' }],
    ['an empty locations array', { ...REGION_JSON, locations: [] }],
    ['no locations key', { ...REGION_JSON, locations: undefined }],
  ])('%s ends in ERROR with the "incomplete" message', (_label, reply) => {
    const ctx = newCtx(worldSeed());
    exec(ctx, { resultText: JSON.stringify(reply) });
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('ERROR');
    expect(rows(ctx, 'event_creation')[0].message).toContain('incomplete');
    expect(rows(ctx, 'region')).toHaveLength(0);
    expect(rows(ctx, 'llm_budget')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// npc_conversation
// ---------------------------------------------------------------------------

describe('submit_llm_result npc_conversation failure path', () => {
  it('logs "seems distracted" to the NPC dialog and the private events', () => {
    const ctx = newCtx(npcSeed());
    exec(ctx, { success: false });
    expect(rows(ctx, 'llm_task')[0].status).toBe('error');
    expect(rows(ctx, 'npc_dialog')).toHaveLength(1);
    expect(rows(ctx, 'npc_dialog')[0].text).toBe('Marta seems distracted.');
    expect(rows(ctx, 'event_private')[0]).toMatchObject({ kind: 'npc', message: 'Marta seems distracted. Try again.' });
    expect(rows(ctx, 'llm_budget')).toHaveLength(0);
  });

  it('does not repeat an identical dialog line logged within the last minute (private event still written)', () => {
    const ctx = newCtx(
      npcSeed({
        npc_dialog: [{ id: 3n, characterId: 10n, npcId: 20n, text: 'Marta seems distracted.', createdAt: ts(T0 - 5_000_000n) }],
      }),
    );
    exec(ctx, { success: false });
    expect(rows(ctx, 'npc_dialog')).toHaveLength(1);
    expect(rows(ctx, 'event_private')).toHaveLength(1);
  });

  it('writes nothing but the task status when the NPC is gone', () => {
    const ctx = newCtx({ llm_task: [llmTask('npc_conversation', NPC_CTX)], character: [characterRow()] });
    exec(ctx, { success: false });
    expect(nonEmptyTables(ctx)).toEqual(['character', 'llm_task']);
  });

  it('writes nothing but the task status when the character is gone', () => {
    const ctx = newCtx({ llm_task: [llmTask('npc_conversation', NPC_CTX)], npc: npcSeed().npc });
    exec(ctx, { success: false });
    expect(nonEmptyTables(ctx)).toEqual(['llm_task', 'npc']);
  });
});

describe('submit_llm_result npc_conversation success', () => {
  it('logs the dialogue, runs the narrative effects, updates memory and the cooldown, increments the budget', () => {
    const ctx = newCtx(npcSeed());
    const reply = npcReply({
      effects: [
        { type: 'affinity_change', amount: 3 },
        { type: 'reveal_location', locationName: 'The Old Cistern', locationDescription: 'It still holds water.' },
        { type: 'give_item' },
        { type: 'warn_danger' },
        { type: 'open_shop' },
        { type: 'none' },
        null,
        {},
        { amount: 4 },
      ],
      memoryUpdate: { addTopics: ['bread', 'the mill'], addSecret: 'the cellar is haunted' },
      internalThought: 'The traveler likes bread.',
    });
    exec(ctx, { resultText: reply });

    expect(rows(ctx, 'llm_task')[0].status).toBe('completed');
    expect(rows(ctx, 'npc_dialog')[0].text).toBe('Marta: "The bread is warm today."');
    const msgs = rows(ctx, 'event_private').map((e: any) => e.message);
    expect(msgs[0]).toBe('Marta says, "The bread is warm today."');
    expect(msgs).toContain('Marta seems genuinely pleased by your words.');
    expect(msgs).toContain('Marta reveals: "The Old Cistern -- It still holds water."');
    expect(msgs).toContain('Marta offers you something... (Item generation deferred.)');
    const memory = JSON.parse(rows(ctx, 'npc_memory')[0].memoryJson);
    expect(memory).toMatchObject({ topics: ['bread', 'the mill'], secretsShared: ['the cellar is haunted'], lastConversationSummary: 'The traveler likes bread.' });
    expect(rows(ctx, 'npc_memory')[0].lastUpdated).toEqual(ts(T0));
    expect(rows(ctx, 'npc_affinity')[0].affinity).toBe(3n);
    expect(rows(ctx, 'npc_affinity')[0].lastInteraction).toEqual(ts(T0));
    expect(rows(ctx, 'llm_budget')[0]).toMatchObject({ playerId: alice, callCount: 1n });
  });

  it('does not duplicate a known memory topic and keeps the old summary when there is no new thought', () => {
    const seed = npcSeed();
    seed.npc_memory = [
      {
        id: 30n,
        characterId: 10n,
        npcId: 20n,
        memoryJson: JSON.stringify({ topics: ['bread'], questsCompleted: [], secretsShared: [], giftsGiven: [], lastConversationSummary: 'old' }),
        lastUpdated: ts(T_OLD),
      },
    ];
    const ctx = newCtx(seed);
    exec(ctx, { resultText: npcReply({ memoryUpdate: { addTopics: ['bread', 'rain'] } }) });
    const memory = JSON.parse(rows(ctx, 'npc_memory')[0].memoryJson);
    expect(memory.topics).toEqual(['bread', 'rain']);
    expect(memory.lastConversationSummary).toBe('old');
  });

  it.each([
    [50, 5n, 'seems genuinely pleased'],
    [3, 3n, 'seems genuinely pleased'],
    [1, 1n, 'hint of warmth'],
    [-1, -1n, 'eyes narrow slightly'],
    [-3, -3n, 'expression darkens'],
    [-50, -5n, 'expression darkens'],
  ])('affinity change %i lands as %s (clamped to +/-5) with the matching cue', (amount, expected, cue) => {
    const ctx = newCtx(npcSeed());
    exec(ctx, { resultText: npcReply({ effects: [{ type: 'affinity_change', amount }] }) });
    expect(rows(ctx, 'npc_affinity')[0].affinity).toBe(expected);
    expect(rows(ctx, 'event_private').some((e: any) => (e.message as string).includes(cue))).toBe(true);
  });

  it('QUIRK: a negative affinity change that crosses a tier still logs an "improved to" system message', () => {
    const ctx = newCtx(npcSeed());
    exec(ctx, { resultText: npcReply({ effects: [{ type: 'affinity_change', amount: -4 }] }) });
    const sys = rows(ctx, 'event_private').filter((e: any) => e.kind === 'system');
    expect(sys).toHaveLength(1);
    expect(sys[0].message).toBe('Your relationship with Marta improved to Wary.');
  });

  it.each([['0', 0], ['not a number', 'abc'], ['missing amount', undefined]])(
    'an affinity_change with %s is skipped with no cue',
    (_label, amount) => {
      const ctx = newCtx(npcSeed());
      exec(ctx, { resultText: npcReply({ effects: [{ type: 'affinity_change', amount }] }) });
      expect(rows(ctx, 'npc_affinity')[0].affinity).toBe(0n);
      expect(rows(ctx, 'event_private')).toHaveLength(1);
    },
  );

  it('creates the affinity row on first contact', () => {
    const seed = npcSeed();
    seed.npc_affinity = [];
    const ctx = newCtx(seed);
    exec(ctx, { resultText: npcReply({ effects: [{ type: 'affinity_change', amount: 2 }] }) });
    expect(rows(ctx, 'npc_affinity')).toHaveLength(1);
    expect(rows(ctx, 'npc_affinity')[0]).toMatchObject({ characterId: 10n, npcId: 20n, affinity: 2n, conversationCount: 1n });
  });

  it('falls back to "..." when the reply has no dialogue and ignores a non-array effects field', () => {
    const ctx = newCtx(npcSeed());
    exec(ctx, { resultText: JSON.stringify({ effects: 'lots', memoryUpdate: null }) });
    expect(rows(ctx, 'npc_dialog')[0].text).toBe('Marta: "..."');
    expect(rows(ctx, 'event_private')).toHaveLength(1);
    expect(rows(ctx, 'llm_budget')[0].callCount).toBe(1n);
  });

  it('accepts a code-fenced reply', () => {
    const ctx = newCtx(npcSeed());
    exec(ctx, { resultText: '```json\n' + npcReply() + '\n```' });
    expect(rows(ctx, 'npc_dialog')[0].text).toBe('Marta: "The bread is warm today."');
  });

  it('skips the memory update and cooldown when those rows are missing but still charges the budget', () => {
    const seed = npcSeed();
    seed.npc_memory = [];
    seed.npc_affinity = [];
    const ctx = newCtx(seed);
    exec(ctx, { resultText: npcReply({ memoryUpdate: { addTopics: ['x'] } }) });
    expect(rows(ctx, 'npc_memory')).toHaveLength(0);
    expect(rows(ctx, 'npc_affinity')).toHaveLength(0);
    expect(rows(ctx, 'llm_budget')[0].callCount).toBe(1n);
  });

  it('QUIRK: invalid JSON writes the "unintelligible" messages with NO budget increment and no memory change', () => {
    const ctx = newCtx(npcSeed());
    exec(ctx, { resultText: 'Marta hums a tune' });
    expect(rows(ctx, 'llm_task')[0].status).toBe('completed');
    expect(rows(ctx, 'npc_dialog')[0].text).toBe('Marta mutters something unintelligible.');
    expect(rows(ctx, 'event_private')[0].message).toBe('Marta mutters something unintelligible. (Try again.)');
    expect(rows(ctx, 'llm_budget')).toHaveLength(0);
    expect(rows(ctx, 'npc_memory')[0].lastUpdated).toEqual(ts(T_OLD));
    expect(rows(ctx, 'npc_affinity')[0].lastInteraction).toEqual(ts(T_OLD));
  });

  it('returns silently when the character is gone', () => {
    const ctx = newCtx({ llm_task: [llmTask('npc_conversation', NPC_CTX)], npc: npcSeed().npc });
    exec(ctx, { resultText: npcReply() });
    expect(nonEmptyTables(ctx)).toEqual(['llm_task', 'npc']);
  });

  it('returns silently when the NPC is gone', () => {
    const ctx = newCtx({ llm_task: [llmTask('npc_conversation', NPC_CTX)], character: [characterRow()] });
    exec(ctx, { resultText: npcReply() });
    expect(nonEmptyTables(ctx)).toEqual(['character', 'llm_task']);
  });
});

describe('submit_llm_result npc_conversation offer_quest effects', () => {
  it('kill quest for an unknown enemy creates the enemy template, links it here and creates the instance', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS));
    exec(ctx, {
      resultText: npcReply({
        effects: [offer({ targetEnemyName: 'Cellar Undead Rat', targetCount: 3, questDescription: 'Clear the cellar.', rewardXp: 80 })],
      }),
    });
    const qt = rows(ctx, 'quest_template');
    expect(qt).toHaveLength(1);
    expect(qt[0]).toMatchObject({ name: 'Rats in the Cellar', npcId: 20n, questType: 'kill', requiredCount: 3n, rewardXp: 80n, minLevel: 3n, maxLevel: 8n, characterId: 10n });
    const et = rows(ctx, 'enemy_template');
    expect(et).toHaveLength(1);
    expect(et[0]).toMatchObject({ name: 'Cellar Undead Rat', creatureType: 'undead', level: 3n, maxHp: 44n });
    expect(qt[0].targetEnemyTemplateId).toBe(et[0].id);
    expect(rows(ctx, 'location_enemy_template')).toEqual([{ id: 1n, locationId: 100n, enemyTemplateId: et[0].id }]);
    expect(rows(ctx, 'quest_instance')).toHaveLength(1);
    expect(rows(ctx, 'quest_instance')[0]).toMatchObject({ characterId: 10n, questTemplateId: qt[0].id, progress: 0n, completed: false });
    expect(rows(ctx, 'event_private').map((e: any) => e.message)).toContain('New quest: Rats in the Cellar');
  });

  it('kill quest resolves an existing enemy template by name (case-insensitive) at a connected location', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS, WOLF_TEMPLATE));
    exec(ctx, { resultText: npcReply({ effects: [offer({ questName: 'Wolf Trouble', targetEnemyName: 'WOLF' })] }) });
    expect(rows(ctx, 'enemy_template')).toHaveLength(1);
    expect(rows(ctx, 'quest_template')[0].targetEnemyTemplateId).toBe(60n);
    expect(rows(ctx, 'quest_instance')).toHaveLength(1);
  });

  it('kill quest without a target name falls back to the first enemy at the character location', () => {
    const ctx = newCtx(
      npcSeed(WORLD_LOCS, {
        enemy_template: [{ id: 60n, name: 'Wolf', level: 3n }],
        location_enemy_template: [{ id: 70n, locationId: 100n, enemyTemplateId: 60n }],
      }),
    );
    exec(ctx, { resultText: npcReply({ effects: [offer()] }) });
    expect(rows(ctx, 'quest_template')[0].targetEnemyTemplateId).toBe(60n);
  });

  it('kill quest with no name and no enemy here keeps targetEnemyTemplateId 0', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS));
    exec(ctx, { resultText: npcReply({ effects: [offer()] }) });
    expect(rows(ctx, 'quest_template')[0].targetEnemyTemplateId).toBe(0n);
    expect(rows(ctx, 'quest_instance')).toHaveLength(1);
  });

  it('an invalid quest type falls back to kill', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS, WOLF_TEMPLATE));
    exec(ctx, { resultText: npcReply({ effects: [offer({ questType: 'dance', targetEnemyName: 'Wolf' })] }) });
    expect(rows(ctx, 'quest_template')[0].questType).toBe('kill');
    expect(rows(ctx, 'quest_template')[0].targetEnemyTemplateId).toBe(60n);
  });

  it.each(['kill_loot', 'boss_kill'])('%s quests resolve the enemy like kill quests', (questType) => {
    const ctx = newCtx(npcSeed(WORLD_LOCS, WOLF_TEMPLATE));
    exec(ctx, { resultText: npcReply({ effects: [offer({ questType, targetEnemyName: 'wolf' })] }) });
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({ questType, targetEnemyTemplateId: 60n });
  });

  it('delivery quest resolves the source location by name and the target NPC by name', () => {
    const ctx = newCtx(
      npcSeed(WORLD_LOCS, {
        npc: [{ id: 21n, name: 'Tobin', npcType: 'lore', locationId: 101n, description: '', greeting: '' }],
      }),
    );
    exec(ctx, {
      resultText: npcReply({
        effects: [offer({ questType: 'delivery', questName: 'Bread Run', sourceLocationName: 'old mill', targetNpcName: 'Tobin', targetItemName: 'Warm Bread', rewardType: 'gold', rewardGold: 12 })],
      }),
    });
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({
      questType: 'delivery',
      sourceLocationId: 101n,
      targetItemName: 'Warm Bread',
      targetNpcId: 21n,
      targetLocationId: 101n,
      rewardType: 'gold',
      rewardGold: 12n,
    });
  });

  it('delivery quest without a usable source name picks a connected neighbor of the NPC', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS));
    exec(ctx, { resultText: npcReply({ effects: [offer({ questType: 'delivery', questName: 'Parcel' })] }) });
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({ sourceLocationId: 101n, targetItemName: 'Parcel' });
    expect(rows(ctx, 'quest_template')[0].targetNpcId).toBeUndefined();
  });

  it('delivery quest whose source name is the NPC own location still picks a neighbor', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS));
    exec(ctx, { resultText: npcReply({ effects: [offer({ questType: 'delivery', sourceLocationName: 'Market Square' })] }) });
    expect(rows(ctx, 'quest_template')[0].sourceLocationId).toBe(101n);
  });

  it('delivery quest with no neighbors falls back to the NPC own location', () => {
    const ctx = newCtx(npcSeed({ location: WORLD_LOCS.location }));
    exec(ctx, { resultText: npcReply({ effects: [offer({ questType: 'delivery' })] }) });
    expect(rows(ctx, 'quest_template')[0].sourceLocationId).toBe(100n);
  });

  it('explore quest targets the NPC location', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS));
    exec(ctx, { resultText: npcReply({ effects: [offer({ questType: 'explore', questName: 'Find the Well' })] }) });
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({ questType: 'explore', targetLocationId: 100n, targetItemName: 'Find the Well' });
  });

  it('a type without special handling (gather) only creates the template and instance, with default rewards', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS));
    exec(ctx, { resultText: npcReply({ effects: [offer({ questType: 'gather', questName: undefined })] }) });
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({ name: 'Unknown Quest', questType: 'gather', requiredCount: 1n, rewardXp: 55n, rewardType: 'xp' });
    expect(rows(ctx, 'event_private').map((e: any) => e.message)).toContain('New quest: Unknown Quest');
  });

  it('QUIRK: two offers in one reply create only the first (the per-NPC cap of 1 counts the new quest)', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS));
    exec(ctx, { resultText: npcReply({ effects: [offer({ questName: 'First' }), offer({ questName: 'Second' })] }) });
    expect(rows(ctx, 'quest_template').map((q: any) => q.name)).toEqual(['First']);
    expect(rows(ctx, 'quest_instance')).toHaveLength(1);
  });

  it('skips an offer when the character already has the maximum active quests (4)', () => {
    const others = [1n, 2n, 3n, 4n].map((n) => ({ id: 200n + n, npcId: 99n, name: `Other ${n}`, characterId: 10n }));
    const ctx = newCtx(
      npcSeed(WORLD_LOCS, {
        quest_template: others,
        quest_instance: others.map((q, i) => ({ id: 300n + BigInt(i), characterId: 10n, questTemplateId: q.id, progress: 0n, completed: false, acceptedAt: ts(T_OLD) })),
      }),
    );
    exec(ctx, { resultText: npcReply({ effects: [offer()] }) });
    expect(rows(ctx, 'quest_template')).toHaveLength(4);
    expect(rows(ctx, 'quest_instance')).toHaveLength(4);
    expect(rows(ctx, 'event_private').map((e: any) => e.message).some((m: string) => m.startsWith('New quest'))).toBe(false);
  });

  it('skips an offer when this NPC already has an active quest for the character (per-NPC cap)', () => {
    const ctx = newCtx(
      npcSeed(WORLD_LOCS, {
        quest_template: [{ id: 201n, npcId: 20n, name: 'Existing', characterId: 10n }],
        quest_instance: [{ id: 301n, characterId: 10n, questTemplateId: 201n, progress: 0n, completed: false, acceptedAt: ts(T_OLD) }],
      }),
    );
    exec(ctx, { resultText: npcReply({ effects: [offer()] }) });
    expect(rows(ctx, 'quest_template')).toHaveLength(1);
    expect(rows(ctx, 'quest_instance')).toHaveLength(1);
  });

  it('skips an offer that repeats a quest name this NPC already gave this character (completed)', () => {
    const ctx = newCtx(
      npcSeed(WORLD_LOCS, {
        quest_template: [{ id: 201n, npcId: 20n, name: 'Rats in the Cellar', characterId: 10n }],
        quest_instance: [{ id: 301n, characterId: 10n, questTemplateId: 201n, progress: 3n, completed: true, acceptedAt: ts(T_OLD) }],
      }),
    );
    exec(ctx, { resultText: npcReply({ effects: [offer()] }) });
    expect(rows(ctx, 'quest_template')).toHaveLength(1);
    expect(rows(ctx, 'quest_instance')).toHaveLength(1);
  });

  it('a completed quest does not count against the caps', () => {
    const ctx = newCtx(
      npcSeed(WORLD_LOCS, {
        quest_template: [{ id: 201n, npcId: 20n, name: 'Done', characterId: 10n }],
        quest_instance: [{ id: 301n, characterId: 10n, questTemplateId: 201n, progress: 3n, completed: true, acceptedAt: ts(T_OLD) }],
      }),
    );
    exec(ctx, { resultText: npcReply({ effects: [offer({ questName: 'Fresh Work' })] }) });
    expect(rows(ctx, 'quest_template').map((q: any) => q.name)).toEqual(['Done', 'Fresh Work']);
  });
});

// ---------------------------------------------------------------------------
// combat_narration
// ---------------------------------------------------------------------------

describe('submit_llm_result combat_narration', () => {
  const COMBAT_CTX = JSON.stringify({ combatId: '77', roundNumber: '2', narrativeType: 'round', participantCharacterIds: ['10', '11'] });
  const seed = (ctxJson = COMBAT_CTX): Seed => ({
    llm_task: [llmTask('combat_narration', ctxJson)],
    character: [characterRow()],
  });

  it('failure changes nothing but the task status (silent)', () => {
    const ctx = newCtx(seed());
    exec(ctx, { success: false });
    expect(rows(ctx, 'llm_task')[0].status).toBe('error');
    expect(rows(ctx, 'combat_narrative')).toHaveLength(0);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
    expect(nonEmptyTables(ctx)).toEqual(['character', 'llm_task']);
  });

  it('success with a JSON narrative stores the row and broadcasts a round-prefixed private event to known participants', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: JSON.stringify({ narrative: 'Steel meets bone.' }) });
    expect(rows(ctx, 'combat_narrative')).toEqual([
      { id: 1n, combatId: 77n, roundNumber: 2n, narrativeText: 'Steel meets bone.', narrativeType: 'round', createdAt: ts(T0) },
    ]);
    const ev = rows(ctx, 'event_private');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ characterId: 10n, ownerUserId: 7n, kind: 'combat_narration', message: '[Round 2] Steel meets bone.' });
  });

  it('success accepts a code-fenced JSON narrative', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: '```json\n{"narrative":"Sparks fly."}\n```' });
    expect(rows(ctx, 'combat_narrative')[0].narrativeText).toBe('Sparks fly.');
  });

  it('success with raw prose falls back to the trimmed text as the narrative', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: '   The wolf lunges and misses badly.  \n' });
    expect(rows(ctx, 'combat_narrative')[0].narrativeText).toBe('The wolf lunges and misses badly.');
    expect(rows(ctx, 'event_private')[0].message).toBe('[Round 2] The wolf lunges and misses badly.');
  });

  it('QUIRK: JSON without a narrative field stores the JSON text itself as the narrative', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: '{"note":"no narrative here"}' });
    expect(rows(ctx, 'combat_narrative')[0].narrativeText).toBe('{"note":"no narrative here"}');
  });

  it('an empty reply stores nothing', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: '   ' });
    expect(rows(ctx, 'combat_narrative')).toHaveLength(0);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });

  it('a victory narration is not round-prefixed', () => {
    const ctx = newCtx(seed(JSON.stringify({ combatId: '77', roundNumber: '0', narrativeType: 'victory', participantCharacterIds: ['10'] })));
    exec(ctx, { resultText: JSON.stringify({ narrative: 'The wolf falls.' }) });
    expect(rows(ctx, 'combat_narrative')[0]).toMatchObject({ narrativeType: 'victory', roundNumber: 0n });
    expect(rows(ctx, 'event_private')[0].message).toBe('The wolf falls.');
  });

  it('a context without participants stores the row and broadcasts nothing; the budget is never touched', () => {
    const ctx = newCtx(seed(JSON.stringify({ combatId: '77', roundNumber: '1' })));
    exec(ctx, { resultText: 'A quiet round.' });
    expect(rows(ctx, 'combat_narrative')).toHaveLength(1);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
    expect(rows(ctx, 'llm_budget')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// renown_perk_gen
// ---------------------------------------------------------------------------

describe('submit_llm_result renown_perk_gen success', () => {
  const RENOWN_CTX = (rank: string | number = '2') => JSON.stringify({ characterId: '10', rank: String(rank) });
  const seed = (ctxJson = RENOWN_CTX()): Seed => ({
    llm_task: [llmTask('renown_perk_gen', ctxJson)],
    character: [characterRow()],
  });

  const active = (name: string) => ({
    name,
    description: `${name} description.`,
    kind: 'heal',
    targetRule: 'self',
    resourceType: 'stamina',
    resourceCost: 10,
    castSeconds: 0,
    cooldownSeconds: 300,
    scaling: 'none',
    value1: 20,
    value2: null,
    damageType: null,
    effectType: null,
    effectMagnitude: null,
    effectDuration: null,
    perkEffectJson: null,
    perkDomain: 'combat',
  });
  const passive = (name: string, over: Record<string, any> = {}) => ({
    name,
    description: `${name} description.`,
    kind: '',
    perkEffectJson: '{"maxHp":10}',
    perkDomain: 'crafting',
    ...over,
  });

  it('inserts three valid perks for the rank, presents them and increments the budget', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: JSON.stringify({ perks: [active('Second Wind'), passive('Thick Skin'), passive('Deft Hands', { perkDomain: undefined })] }) });

    const perks = rows(ctx, 'pending_renown_perk');
    expect(perks.map((p: any) => p.name)).toEqual(['Second Wind', 'Thick Skin', 'Deft Hands']);
    expect(perks.every((p: any) => p.characterId === 10n && p.rank === 2n)).toBe(true);
    expect(perks[0]).toMatchObject({ kind: 'heal', resourceCost: 10n, cooldownSeconds: 300n, value1: 20n });
    expect(perks[1]).toMatchObject({ kind: '', perkEffectJson: '{"maxHp":10}', perkDomain: 'crafting', targetRule: 'self', resourceType: 'none' });
    expect(perks[2].perkDomain).toBe('combat');
    const msg = rows(ctx, 'event_private')[0].message as string;
    expect(msg).toContain('"Rank 2. The world owes you something. Choose your due:"');
    expect(msg).toContain('Active ability | 10 stamina | 300s cooldown');
    expect(msg).toContain('Passive bonus');
    expect(rows(ctx, 'llm_budget')[0]).toMatchObject({ playerId: alice, callCount: 1n });
  });

  it('only the first three valid perks are inserted', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: JSON.stringify({ perks: [passive('A'), passive('B'), passive('C'), passive('D')] }) });
    expect(rows(ctx, 'pending_renown_perk').map((p: any) => p.name)).toEqual(['A', 'B', 'C']);
  });

  it('uses the rank from the task context', () => {
    const ctx = newCtx(seed(RENOWN_CTX('5')));
    exec(ctx, { resultText: JSON.stringify({ perks: [passive('A'), passive('B'), passive('C')] }) });
    expect(rows(ctx, 'pending_renown_perk').every((p: any) => p.rank === 5n)).toBe(true);
    expect(rows(ctx, 'event_private')[0].message).toContain('Rank 5.');
  });

  it.each([['missing', JSON.stringify({ characterId: '10' })], ['zero', RENOWN_CTX('0')]])(
    'QUIRK: a %s rank defaults to 2',
    (_label, ctxJson) => {
      const ctx = newCtx(seed(ctxJson));
      exec(ctx, { resultText: JSON.stringify({ perks: [passive('A'), passive('B'), passive('C')] }) });
      expect(rows(ctx, 'pending_renown_perk')[0].rank).toBe(2n);
    },
  );

  it('QUIRK: fewer than three VALID perks (one lacks a description) falls back to the static pool for the rank', () => {
    const ctx = newCtx(seed(RENOWN_CTX('4')));
    exec(ctx, {
      resultText: JSON.stringify({ perks: [passive('A'), passive('B'), { name: 'No description', kind: 'heal' }, { description: 'no name', kind: 'heal' }] }),
    });
    const perks = rows(ctx, 'pending_renown_perk');
    expect(perks.map((p: any) => p.name)).toEqual(['Bloodthirst', "Prospector's Luck", "Wanderer's Pace"]);
    expect(perks.every((p: any) => p.rank === 4n && p.kind === '')).toBe(true);
    expect(rows(ctx, 'event_private')[0].message).toContain('The cosmos provided some... standard options');
    expect(rows(ctx, 'llm_budget')[0].callCount).toBe(1n);
  });

  it.each([
    ['unparseable text', 'no perks for you'],
    ['perks that is not an array', JSON.stringify({ perks: 'many' })],
    ['an empty perks array', JSON.stringify({ perks: [] })],
  ])('%s takes the static fallback (rank 4) and increments the budget', (_label, resultText) => {
    const ctx = newCtx(seed(RENOWN_CTX('4')));
    exec(ctx, { resultText });
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(3);
    expect(rows(ctx, 'llm_budget')[0].callCount).toBe(1n);
  });

  it('static fallback for an active-first pool (rank 6) inserts the active perk as a utility ability', () => {
    const ctx = newCtx(seed(RENOWN_CTX('6')));
    exec(ctx, { resultText: 'nothing' });
    const perks = rows(ctx, 'pending_renown_perk');
    expect(perks[0]).toMatchObject({ kind: 'utility', resourceType: 'stamina', perkEffectJson: undefined });
    expect(perks[1].kind).toBe('');
  });

  it('Phase 41: the rank-2 static fallback inserts serialized options (bigint effects no longer throw)', () => {
    const ctx = newCtx(seed(RENOWN_CTX('2')));
    exec(ctx, { resultText: 'nothing' });
    const perks = rows(ctx, 'pending_renown_perk');
    expect(perks.map((p: any) => p.name)).toEqual(['Iron Will', 'Keen Eye', 'Smooth Talker']);
    // maxHp: 25n serializes as the number 25 (the shape the perk prompt documents).
    expect(perks[0].perkEffectJson).toBe('{"maxHp":25,"str":1}');
    expect(perks.map((p: any) => p.perkEffectJson)).toEqual(
      RENOWN_PERK_POOLS[2].slice(0, 3).map((p) => serializePerkEffect(p.effect)),
    );
    expect(rows(ctx, 'event_private')[0].message).toContain('The cosmos provided some... standard options');
    expect(rows(ctx, 'llm_budget')[0].callCount).toBe(1n);
  });

  it.each([3, 5, 9, 11])('Phase 41: the rank-%s static fallback inserts three options with serialized effects', (rank) => {
    const ctx = newCtx(seed(RENOWN_CTX(String(rank))));
    callSubmit(ctx, { resultText: 'nothing' });
    const perks = rows(ctx, 'pending_renown_perk');
    expect(perks).toHaveLength(3);
    expect(perks.every((p: any) => p.rank === BigInt(rank))).toBe(true);
    const pool = RENOWN_PERK_POOLS[rank].slice(0, 3);
    expect(perks.map((p: any) => p.perkEffectJson)).toEqual(
      pool.map((p) => (p.type === 'active' ? undefined : serializePerkEffect(p.effect))),
    );
    for (const p of perks) if (p.perkEffectJson !== undefined) expect(() => JSON.parse(p.perkEffectJson)).not.toThrow();
  });

  it('QUIRK: a rank without a static pool inserts nothing and writes no message, but still increments the budget', () => {
    const ctx = newCtx(seed(RENOWN_CTX('99')));
    exec(ctx, { resultText: 'nothing' });
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(0);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
    expect(rows(ctx, 'llm_budget')[0].callCount).toBe(1n);
  });

  it('returns silently when the character is gone (no budget increment)', () => {
    const ctx = newCtx({ llm_task: [llmTask('renown_perk_gen', RENOWN_CTX())] });
    exec(ctx, { resultText: JSON.stringify({ perks: [passive('A'), passive('B'), passive('C')] }) });
    expect(nonEmptyTables(ctx)).toEqual(['llm_task']);
  });
});

// ---------------------------------------------------------------------------
// Phase 41: creation replies are clamped server-side (creation_validate)
// ---------------------------------------------------------------------------

describe('submit_llm_result creation replies: Phase 41 clamped', () => {
  it('Phase 41: clamped - a race reply with out-of-range bonuses is stored and shown clamped', () => {
    const ctx = newCtx({
      llm_task: [llmTask('creation_race')],
      character_creation_state: [creationState('GENERATING_RACE')],
    });
    const reply = { ...RACE_JSON, bonuses: { primary: { stat: 'str', value: 99 }, secondary: { stat: 'nonsense', value: -5 } } };
    exec(ctx, { resultText: JSON.stringify(reply) });
    const stored = JSON.parse(rows(ctx, 'character_creation_state')[0].raceBonuses);
    expect(stored.primary).toEqual({ stat: 'str', value: 3 });
    // 'nonsense' is not a stat: the secondary defaults to 'dex'; -5 is raised to the minimum 1.
    expect(stored.secondary).toEqual({ stat: 'dex', value: 1 });
    expect(rows(ctx, 'race_definition')[0].bonusesJson).not.toContain('99');
    expect(JSON.parse(rows(ctx, 'race_definition')[0].bonusesJson).primary.value).toBe(3);
    expect(rows(ctx, 'event_creation')[0].message).toContain('+3 STR, +1 DEX');
  });

  it('Phase 41: clamped - a class reply with over-budget ability values is stored clamped', () => {
    const ctx = newCtx({
      llm_task: [llmTask('creation_class')],
      character_creation_state: [creationState('GENERATING_CLASS')],
    });
    const reply = {
      ...CLASS_JSON,
      stats: { ...CLASS_JSON.stats, bonusHp: 9999 },
      abilities: [{ ...CLASS_JSON.abilities[0], value1: 99999, kind: 'nonsense', resourceCost: 9999 }],
    };
    exec(ctx, { resultText: JSON.stringify(reply) });
    const state = rows(ctx, 'character_creation_state')[0];
    // kind 'nonsense' becomes 'damage'; value1 is capped at the level-1 damage budget maximum;
    // a stamina cost is capped at 15.
    const budgetMax = Number(clampToBudget('damage', 1, { value1: 99999 }).value1);
    expect(JSON.parse(state.abilities)[0]).toMatchObject({ value1: budgetMax, kind: 'damage', resourceCost: 15 });
    expect(budgetMax).toBeLessThan(99999);
    expect(JSON.parse(state.classStats).bonusHp).toBe(20);
  });
});
