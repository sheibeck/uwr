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
 * Known limits of the mock DB that these tests inherit (and that 40-08 inherits
 * with them): the `by_name` index accessor is mapped to the column `name`, so the
 * real `race_definition.by_name` (column `nameLower`) is exercised through a row
 * whose `name` equals the lowercase race name.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { capturedReducer, rowColumnProblems, snapshotDb } from './schema_recorder';
import { createMockCtx } from './test-utils';

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

  it('creation_race failure without a creation state still appends the creation_error event', () => {
    const ctx = newCtx({ llm_task: [llmTask('creation_race')] });
    exec(ctx, { success: false });
    expect(rows(ctx, 'event_creation')).toHaveLength(1);
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

  it('renown_perk_gen failure changes nothing but the task status', () => {
    const ctx = newCtx({
      llm_task: [llmTask('renown_perk_gen', JSON.stringify({ characterId: '10', rank: '2' }))],
      character: [characterRow()],
    });
    exec(ctx, { success: false });
    expect(rows(ctx, 'llm_task')[0].status).toBe('error');
    expect(nonEmptyTables(ctx)).toEqual(['character', 'llm_task']);
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

  it('QUIRK: a reply without raceName stores "Unknown", prints "**undefined**" and saves no definition', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: JSON.stringify({ narrative: 'Nothing much.' }) });
    expect(rows(ctx, 'character_creation_state')[0].raceName).toBe('Unknown');
    expect(rows(ctx, 'character_creation_state')[0].raceBonuses).toBe('{}');
    expect(rows(ctx, 'event_creation')[0].message).toContain('**undefined**');
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
    expect(msg).toContain('Primary: STR, Secondary: DEX | Armor: leather, mail | Weapons: sword, dagger | Physical (+10 bonus HP)');
    expect(msg).toContain('[Ember Slash]');
    expect(msg).toContain('[Old Style]');
    expect(rows(ctx, 'llm_budget')[0].callCount).toBe(1n);
  });

  it('accepts legacy ability field names and a mana-user class line', () => {
    const ctx = newCtx(seed());
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
    expect(msg).toContain('physical stun, 6 base, 1s cast, 4s cooldown, 3 mana, stun (?s)');
  });

  it('QUIRK: an empty object stores "Unknown Class" and prints "**undefined**"', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: '{}' });
    const state = rows(ctx, 'character_creation_state')[0];
    expect(state.step).toBe('CLASS_REVEALED');
    expect(state.className).toBe('Unknown Class');
    expect(state.classStats).toBe('{}');
    expect(state.abilities).toBe('[]');
    expect(rows(ctx, 'event_creation')[0].message).toContain('**undefined**');
  });

  it('QUIRK: malformed JSON increments the budget BEFORE parsing and reverts to AWAITING_ARCHETYPE', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: 'not json at all' });
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('AWAITING_ARCHETYPE');
    expect(rows(ctx, 'event_creation')[0].kind).toBe('creation_error');
    expect(rows(ctx, 'llm_budget')[0].callCount).toBe(1n);
  });

  it('QUIRK: an error midway through the success block (null ability) reverts the state update, fields and all', () => {
    const ctx = newCtx(seed());
    exec(ctx, { resultText: JSON.stringify({ className: 'Half Built', abilities: [null] }) });
    const state = rows(ctx, 'character_creation_state')[0];
    expect(state.step).toBe('AWAITING_ARCHETYPE');
    expect(state.className).toBeUndefined();
    expect(rows(ctx, 'event_creation')).toHaveLength(1);
    expect(rows(ctx, 'event_creation')[0].kind).toBe('creation_error');
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

  it('replaces previously pending skills for the character (retry safety)', () => {
    const ctx = newCtx({
      ...seed(),
      pending_skill: [
        { id: 50n, characterId: 10n, name: 'Stale', description: 'old', kind: 'damage', targetRule: 'single_enemy', resourceType: 'mana', resourceCost: 1n, castSeconds: 1n, cooldownSeconds: 1n, scaling: 'none', value1: 1n, levelRequired: 3n, createdAt: ts(T_OLD) },
        { id: 51n, characterId: 99n, name: 'OtherChar', description: 'keep', kind: 'damage', targetRule: 'single_enemy', resourceType: 'mana', resourceCost: 1n, castSeconds: 1n, cooldownSeconds: 1n, scaling: 'none', value1: 1n, levelRequired: 3n, createdAt: ts(T_OLD) },
      ],
    });
    exec(ctx, { resultText: JSON.stringify({ skills: [skill('A'), skill('B'), skill('C')] }) }, { skipSchemaCheck: true });
    const names = rows(ctx, 'pending_skill').map((p: any) => p.name).sort();
    expect(names).toEqual(['A', 'B', 'C', 'OtherChar']);
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
