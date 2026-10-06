/**
 * startCreationGeneration (Phase 41, Plan 13, PIPE-01 / PIPE-04).
 * Strict mock db (accessors from the recorded schema); one shared identity per player.
 *
 * The mock maps the `race_definition.by_name` accessor to the column `name`, so a known race is
 * seeded with a lowercase `name` (the real index is on `nameLower`).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx } from './test-utils';
import { flattenSegments } from './segments';
import { rowColumnProblems } from './schema_recorder';
import {
  startCreationGeneration,
  buildClassFillInput,
  startClassFill,
  retryClassFill,
  CLASS_REVEAL_MILESTONE_LINE,
  CLASS_FILL_FAILED_LINE,
  CLASS_FILL_PATIENCE_LINE,
  CLASS_FILL_RETRY_LINE,
  CLASS_FILL_RETRY_HINT,
  classFillRetryLine,
} from './creation_generation';
import { resolveRouteInput } from './llm_inputs';
import { llmRefusalMessage, LLM_RESTING_LINE } from './llm_queue';
import { setLlmEnabled } from './llm_admin_state';
import { utcDay } from './llm_budget';
import { buildRouteLayers } from '../data/llm_layers';
import { LLM_PLAYER_DAILY_COST_MICRO_USD } from '../data/llm_limits';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

type Seed = Record<string, any[]>;

const stateRow = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  playerId: alice,
  step: 'GENERATING_RACE',
  raceDescription: 'A quiet people of the salt marshes',
  createdAt: { microsSinceUnixEpoch: T0 },
  updatedAt: { microsSinceUnixEpoch: T0 },
  ...over,
});

const newCtx = (over: Seed = {}) =>
  createMockCtx({
    seed: { player: [{ id: alice, userId: 7n }], character_creation_state: [stateRow()], ...over },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const stateOf = (ctx: any) => rows(ctx, 'character_creation_state')[0];
const creationEvents = (ctx: any) => rows(ctx, 'event_creation');

const exhaustDay = (ctx: any) =>
  ctx.db.llm_player_budget.insert({
    id: 0n,
    playerId: alice,
    dayUtc: utcDay(ctx.timestamp),
    reservedMicroUsd: 0n,
    spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD,
    calls: 1n,
  });

describe('startCreationGeneration: race', () => {
  it('enqueues one creation_race job and one dispatch for a new description, leaving the state alone', () => {
    const ctx = newCtx();
    const before = { ...stateOf(ctx) };
    expect(startCreationGeneration(ctx, stateOf(ctx), 'race')).toBe('enqueued');

    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ route: 'creation_race', playerId: alice, characterId: 0n, status: 'pending' });
    expect(JSON.parse(jobs[0].dedupeKey)).toEqual([alice.toHexString(), 'creation_race', '1:race']);
    expect(rowColumnProblems('llm_job', jobs[0])).toEqual([]);
    // WR-B03: the job names its creation state, so apply and failure touch only that row.
    expect(JSON.parse(jobs[0].requestJson)).toMatchObject({ creationStateId: '1', generationType: 'race' });

    const input = resolveRouteInput(ctx, jobs[0]) as any;
    expect(input).toEqual({ raceDescription: 'A quiet people of the salt marshes' });
    expect(() => buildRouteLayers('creation_race', input)).not.toThrow();

    expect(stateOf(ctx)).toEqual(before);
    expect(creationEvents(ctx)).toHaveLength(0);
  });

  it('reuses a known race definition with no model call and posts the reuse text', () => {
    const ctx = newCtx({
      race_definition: [
        {
          id: 1n,
          name: 'a quiet people of the salt marshes',
          nameLower: 'a quiet people of the salt marshes',
          narrative: 'Salt and patience.',
          bonusesJson: JSON.stringify({
            primary: { stat: 'wis', value: 2 },
            secondary: { stat: 'int', value: 1 },
            flavor: 'Tide-wise',
          }),
          createdAt: { microsSinceUnixEpoch: T0 },
        },
      ],
    });
    expect(startCreationGeneration(ctx, stateOf(ctx), 'race')).toBe('reused');

    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    const s = stateOf(ctx);
    expect(s.step).toBe('AWAITING_ARCHETYPE');
    expect(s.raceName).toBe('a quiet people of the salt marshes');
    expect(s.raceNarrative).toBe('Salt and patience.');
    expect(JSON.parse(s.raceBonuses).primary.stat).toBe('wis');

    const events = creationEvents(ctx);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('creation');
    expect(events[0].message).toContain('Salt and patience.');
    expect(events[0].message).toContain('**a quiet people of the salt marshes**');
    expect(events[0].message).toContain('+2 WIS, +1 INT. Tide-wise');
    expect(events[0].message).toContain('[Warrior]');
    expect(events[0].message).toContain('Now then. Every creature must choose a path, and you are no exception.');
    expect(events[0].message).not.toContain('choose its path');
  });

  it('IN-11: the reuse line prints only the stored bonuses that apply, with no invented default secondary', () => {
    const reuse = (bonusesJson: string) => {
      const ctx = newCtx({
        race_definition: [
          { id: 1n, name: 'salt folk', nameLower: 'salt folk', narrative: 'n', bonusesJson, createdAt: { microsSinceUnixEpoch: T0 } },
        ],
        character_creation_state: [stateRow({ raceDescription: 'salt folk' })],
      });
      expect(startCreationGeneration(ctx, stateOf(ctx), 'race')).toBe('reused');
      return creationEvents(ctx)[0].message as string;
    };
    const msg = reuse('{"primary":{"stat":"str","value":2},"secondary":{"stat":"bogus","value":1}}');
    expect(msg).toContain('**salt folk**\n+2 STR\n\nNow then.');
    expect(msg).not.toContain('DEX');
    expect(reuse('{"primary":{"stat":"str","value":2}}')).toContain('**salt folk**\n+2 STR\n\nNow then.');
    expect(reuse('{}')).toContain('**salt folk**\n\nNow then.');
    expect(reuse('not json')).toContain('**salt folk**\n\nNow then.');
  });

  it("WR-06: a description of 'unknown' never reuses a definition stored under that name", () => {
    const ctx = newCtx({
      race_definition: [
        { id: 1n, name: 'Unknown', nameLower: 'unknown', narrative: 'n', bonusesJson: '{"primary":{"stat":"str","value":2}}', createdAt: { microsSinceUnixEpoch: T0 } },
      ],
      character_creation_state: [stateRow({ raceDescription: ' Unknown ' })],
    });
    expect(startCreationGeneration(ctx, stateOf(ctx), 'race')).toBe('enqueued');
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
  });

  it('matches the description case-insensitively and ignoring surrounding spaces', () => {
    const ctx = newCtx({
      character_creation_state: [stateRow({ raceDescription: '  Salt Folk  ' })],
      race_definition: [
        { id: 1n, name: 'salt folk', nameLower: 'salt folk', narrative: 'n', bonusesJson: '{}', createdAt: { microsSinceUnixEpoch: T0 } },
      ],
    });
    expect(startCreationGeneration(ctx, stateOf(ctx), 'race')).toBe('reused');
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });

  it('a second start for the same state while the job is active is a duplicate', () => {
    const ctx = newCtx();
    expect(startCreationGeneration(ctx, stateOf(ctx), 'race')).toBe('enqueued');
    expect(startCreationGeneration(ctx, stateOf(ctx), 'race')).toBe('duplicate');
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
    expect(rows(ctx, 'llm_player_budget')[0].calls).toBe(1n);
    expect(stateOf(ctx).step).toBe('GENERATING_RACE');
  });

  it('a refused race (daily cost) creates nothing, reverts to AWAITING_RACE and posts the refusal', () => {
    const ctx = newCtx();
    exhaustDay(ctx);
    expect(startCreationGeneration(ctx, stateOf(ctx), 'race')).toBe('refused');

    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'llm_sweep_tick')).toHaveLength(0);
    expect(rows(ctx, 'llm_player_budget')[0].reservedMicroUsd).toBe(0n);
    expect(stateOf(ctx).step).toBe('AWAITING_RACE');
    const events = creationEvents(ctx);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('creation_error');
    expect(events[0].message).toBe(llmRefusalMessage('daily_cost'));
  });
});

describe('startCreationGeneration: kill switch refusal (Phase 43)', () => {
  it('a halted race request reverts the step and posts exactly one creation_error equal to the resting line', () => {
    const ctx = newCtx();
    setLlmEnabled(ctx, false);
    expect(startCreationGeneration(ctx, stateOf(ctx), 'race')).toBe('refused');

    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(stateOf(ctx).step).toBe('AWAITING_RACE');
    const events = creationEvents(ctx);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'creation_error', message: LLM_RESTING_LINE });
  });

  it('a halted class request reverts to AWAITING_ARCHETYPE with the same single resting line', () => {
    const ctx = newCtx({
      character_creation_state: [stateRow({ step: 'GENERATING_CLASS', raceName: 'Saltkin', archetype: 'mystic' })],
    });
    setLlmEnabled(ctx, false);
    expect(startCreationGeneration(ctx, stateOf(ctx), 'class')).toBe('refused');
    expect(stateOf(ctx).step).toBe('AWAITING_ARCHETYPE');
    const events = creationEvents(ctx);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'creation_error', message: LLM_RESTING_LINE });
  });
});

describe('startCreationGeneration: class', () => {
  const classState = (over: Record<string, unknown> = {}) =>
    stateRow({
      step: 'GENERATING_CLASS',
      raceName: 'Saltkin',
      raceNarrative: 'Marsh dwellers.',
      archetype: 'mystic',
      ...over,
    });

  it('enqueues one creation_class_reveal job with race and archetype from the state (Phase 43 stage 1)', () => {
    const ctx = newCtx({ character_creation_state: [classState()] });
    expect(startCreationGeneration(ctx, stateOf(ctx), 'class')).toBe('enqueued');

    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ route: 'creation_class_reveal', playerId: alice, characterId: 0n });
    expect(JSON.parse(jobs[0].dedupeKey)).toEqual([alice.toHexString(), 'creation_class_reveal', '1:class']);
    const input = resolveRouteInput(ctx, jobs[0]) as any;
    expect(input).toEqual({ raceName: 'Saltkin', raceNarrative: 'Marsh dwellers.', archetype: 'mystic' });
    expect(() => buildRouteLayers('creation_class_reveal', input)).not.toThrow();
    expect(stateOf(ctx).step).toBe('GENERATING_CLASS');
  });

  it("defaults the archetype to 'warrior' and the race to 'Unknown'", () => {
    const ctx = newCtx({
      character_creation_state: [classState({ archetype: undefined, raceName: undefined, raceNarrative: undefined })],
    });
    startCreationGeneration(ctx, stateOf(ctx), 'class');
    expect(resolveRouteInput(ctx, rows(ctx, 'llm_job')[0])).toEqual({
      raceName: 'Unknown',
      raceNarrative: '',
      archetype: 'warrior',
    });
  });

  it('race and class jobs for the same state do not merge', () => {
    const ctx = newCtx({ character_creation_state: [classState()] });
    expect(startCreationGeneration(ctx, stateOf(ctx), 'race')).toBe('enqueued');
    expect(startCreationGeneration(ctx, stateOf(ctx), 'class')).toBe('enqueued');
    expect(rows(ctx, 'llm_job')).toHaveLength(2);
  });

  it('a duplicate class start writes nothing more', () => {
    const ctx = newCtx({ character_creation_state: [classState()] });
    startCreationGeneration(ctx, stateOf(ctx), 'class');
    expect(startCreationGeneration(ctx, stateOf(ctx), 'class')).toBe('duplicate');
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
  });

  it('a refused class reverts to AWAITING_ARCHETYPE and posts the refusal', () => {
    const ctx = newCtx({ character_creation_state: [classState()] });
    exhaustDay(ctx);
    expect(startCreationGeneration(ctx, stateOf(ctx), 'class')).toBe('refused');

    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    const s = stateOf(ctx);
    expect(s.step).toBe('AWAITING_ARCHETYPE');
    expect(s.raceName).toBe('Saltkin');
    expect(s.archetype).toBe('mystic');
    const events = creationEvents(ctx);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'creation_error', message: llmRefusalMessage('daily_cost') });
  });
});

// ----------------------------------------------------------------------------
// Phase 43, plan 13: the class fill (stage 2) helpers
// ----------------------------------------------------------------------------

const FIRST_ABILITY = {
  name: 'Brine Lash',
  description: 'A whip of salt water.',
  kind: 'damage',
  damageType: 'magic',
  targetRule: 'single_enemy',
  resourceType: 'mana',
  resourceCost: 15,
  castSeconds: 1,
  cooldownSeconds: 6,
  value1: 12,
};

const revealedState = (over: Record<string, unknown> = {}) =>
  stateRow({
    step: 'CLASS_FILLING',
    raceName: 'Saltkin',
    raceNarrative: 'Marsh dwellers.',
    archetype: 'mystic',
    className: 'Tidecaller',
    classDescription: 'Speaks to the sea and is rarely answered.',
    abilities: JSON.stringify([FIRST_ABILITY]),
    ...over,
  });

describe('buildClassFillInput', () => {
  it('reads the race, archetype, class and the first stored ability', () => {
    expect(buildClassFillInput(revealedState())).toEqual({
      raceName: 'Saltkin',
      raceNarrative: 'Marsh dwellers.',
      archetype: 'mystic',
      className: 'Tidecaller',
      classDescription: 'Speaks to the sea and is rarely answered.',
      firstAbility: {
        name: 'Brine Lash',
        description: 'A whip of salt water.',
        kind: 'damage',
        damageType: 'magic',
        resourceType: 'mana',
      },
    });
  });

  it('throws a plain Error when there is no first ability', () => {
    expect(() => buildClassFillInput(revealedState({ abilities: undefined }))).toThrow(Error);
    expect(() => buildClassFillInput(revealedState({ abilities: '[]' }))).toThrow(Error);
    expect(() => buildClassFillInput(revealedState({ abilities: 'not json' }))).toThrow(Error);
  });
});

describe('startClassFill', () => {
  it('enqueues one creation_class job with the stored reveal and moves to CLASS_FILLING', () => {
    const ctx = newCtx({ character_creation_state: [revealedState({ step: 'GENERATING_CLASS' })] });
    expect(startClassFill(ctx, stateOf(ctx))).toBe('enqueued');

    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ route: 'creation_class', playerId: alice, characterId: 0n, status: 'pending' });
    expect(JSON.parse(jobs[0].dedupeKey)).toEqual([alice.toHexString(), 'creation_class', '1:class']);
    expect(rowColumnProblems('llm_job', jobs[0])).toEqual([]);
    expect(JSON.parse(jobs[0].requestJson)).toMatchObject({ creationStateId: '1', generationType: 'class' });
    const input = resolveRouteInput(ctx, jobs[0]) as any;
    expect(input.className).toBe('Tidecaller');
    expect(input.firstAbility.name).toBe('Brine Lash');
    expect(() => buildRouteLayers('creation_class', input)).not.toThrow();
    expect(stateOf(ctx).step).toBe('CLASS_FILLING');
    expect(creationEvents(ctx)).toHaveLength(0);
  });

  it('a second start while the fill is active is a duplicate and writes nothing more', () => {
    const ctx = newCtx({ character_creation_state: [revealedState()] });
    expect(startClassFill(ctx, stateOf(ctx))).toBe('enqueued');
    expect(startClassFill(ctx, stateOf(ctx))).toBe('duplicate');
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
  });

  it('a refused fill (daily cost) becomes CLASS_FILL_ERROR, keeps the reveal and posts the refusal once', () => {
    const ctx = newCtx({ character_creation_state: [revealedState()] });
    exhaustDay(ctx);
    expect(startClassFill(ctx, stateOf(ctx))).toBe('refused');

    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    const s = stateOf(ctx);
    expect(s.step).toBe('CLASS_FILL_ERROR');
    expect(s.className).toBe('Tidecaller');
    expect(JSON.parse(s.abilities)).toHaveLength(1);
    const events = creationEvents(ctx);
    expect(events).toHaveLength(1);
    // Review WR-B03: the refusal is followed by what the player must do, since nothing retries on its own.
    expect(events[0]).toMatchObject({ kind: 'creation_error', message: classFillRetryLine(llmRefusalMessage('daily_cost')) });
    expect(events[0].message).toBe(`${llmRefusalMessage('daily_cost')} Say anything when you want the rest tried again.`);
  });

  it('a halted fill posts the resting line and becomes CLASS_FILL_ERROR', () => {
    const ctx = newCtx({ character_creation_state: [revealedState()] });
    setLlmEnabled(ctx, false);
    expect(startClassFill(ctx, stateOf(ctx))).toBe('refused');
    expect(stateOf(ctx).step).toBe('CLASS_FILL_ERROR');
    expect(creationEvents(ctx)).toEqual([
      expect.objectContaining({ kind: 'creation_error', message: `${LLM_RESTING_LINE} ${CLASS_FILL_RETRY_HINT}` }),
    ]);
  });

  it('review WR-B03: every refusal into CLASS_FILL_ERROR ends with the retry hint (busy included)', () => {
    for (const reason of ['busy', 'halted', 'ceiling', 'daily_cost', 'daily_calls'] as const) {
      const line = classFillRetryLine(llmRefusalMessage(reason));
      expect(line.startsWith(llmRefusalMessage(reason))).toBe(true);
      expect(line.endsWith(CLASS_FILL_RETRY_HINT)).toBe(true);
    }
    // In voice (approved string-24): narration with no Keeper pronoun, no exclamation, nothing the console would read as markup.
    expect(CLASS_FILL_RETRY_HINT).toBe('Say anything when you want the rest tried again.');
    expect(CLASS_FILL_RETRY_HINT).not.toMatch(/[!<]/);
    expect(CLASS_FILL_RETRY_HINT).not.toMatch(/\b(it|its|they|them|their)\b/i);
  });

  it('with no stored first ability it refuses without a job and becomes CLASS_FILL_ERROR', () => {
    const ctx = newCtx({ character_creation_state: [revealedState({ abilities: undefined })] });
    expect(startClassFill(ctx, stateOf(ctx))).toBe('refused');
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(stateOf(ctx).step).toBe('CLASS_FILL_ERROR');
    expect(creationEvents(ctx)).toHaveLength(1);
  });
});

describe('retryClassFill', () => {
  it('enqueues only the creation_class fill, moves to CLASS_FILLING and posts the retry line', () => {
    const ctx = newCtx({ character_creation_state: [revealedState({ step: 'CLASS_FILL_ERROR' })] });
    expect(retryClassFill(ctx, stateOf(ctx))).toBe('enqueued');

    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].route).toBe('creation_class');
    expect(jobs.some((j: any) => j.route === 'creation_class_reveal')).toBe(false);
    expect(stateOf(ctx).step).toBe('CLASS_FILLING');
    expect(stateOf(ctx).className).toBe('Tidecaller');
    expect(creationEvents(ctx)).toEqual([expect.objectContaining({ kind: 'creation', message: CLASS_FILL_RETRY_LINE })]);
  });

  it('a refused retry posts only the refusal line, not the retry line', () => {
    const ctx = newCtx({ character_creation_state: [revealedState({ step: 'CLASS_FILL_ERROR' })] });
    setLlmEnabled(ctx, false);
    expect(retryClassFill(ctx, stateOf(ctx))).toBe('refused');
    expect(stateOf(ctx).step).toBe('CLASS_FILL_ERROR');
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(creationEvents(ctx)).toEqual([
      expect.objectContaining({ kind: 'creation_error', message: classFillRetryLine(LLM_RESTING_LINE) }),
    ]);
  });
});

describe('class stage lines', () => {
  it('has the agreed copy', () => {
    expect(CLASS_REVEAL_MILESTONE_LINE).toBe(
      'That is the shape of you. The rest of your abilities are still being worked out, so do not touch anything.',
    );
    expect(CLASS_FILL_FAILED_LINE).toBe(
      'The thread of your finer details slips away. Your class and first ability stand. Say anything and the rest will be tried again.',
    );
    expect(CLASS_FILL_PATIENCE_LINE).toBe('The Keeper is still working out the rest of what you can do. Patience.');
    expect(CLASS_FILL_RETRY_LINE).toBe('The Keeper picks the thread of your finer details back up...');
  });

  it.each([
    ['reveal milestone', CLASS_REVEAL_MILESTONE_LINE],
    ['fill failed', CLASS_FILL_FAILED_LINE],
    ['patience', CLASS_FILL_PATIENCE_LINE],
    ['retry', CLASS_FILL_RETRY_LINE],
  ])('%s: the Keeper is he, never it/they, and the player is never "your name"', (_n, line) => {
    expect(line).not.toMatch(/\b(it|its|they|them|their|she|her)\b/i);
    expect(line).not.toMatch(/your name/i);
    expect(line).not.toContain('!');
  });
});

describe('Keeper lines carry segments (Phase 46, WR-06)', () => {
  /** Every row stores Keeper narration segments whose flattening is exactly its message. */
  const expectKeeperSegments = (event: any) => {
    expect(Array.isArray(event.segments)).toBe(true);
    expect(event.segments.length).toBeGreaterThan(0);
    for (const seg of event.segments) {
      expect(seg).toMatchObject({ kind: 'narration', speaker: 'The Keeper' });
    }
    expect(flattenSegments(event.segments)).toBe(event.message);
  };

  it('a reused race stores the same segments as a fresh one (narrative, bonuses, choose-your-path prompt)', () => {
    const ctx = newCtx({
      race_definition: [
        {
          id: 1n,
          name: 'a quiet people of the salt marshes',
          nameLower: 'a quiet people of the salt marshes',
          narrative: 'Salt and patience.',
          bonusesJson: JSON.stringify({ primary: { stat: 'wis', value: 2 }, secondary: { stat: 'int', value: 1 }, flavor: 'Tide-wise' }),
          createdAt: { microsSinceUnixEpoch: T0 },
        },
      ],
    });
    expect(startCreationGeneration(ctx, stateOf(ctx), 'race')).toBe('reused');
    const [event] = creationEvents(ctx);
    expectKeeperSegments(event);
    expect(event.segments).toHaveLength(4);
    expect(event.segments[0].text).toBe('Salt and patience.');
    expect(event.segments[1].text).toBe('**a quiet people of the salt marshes**\n+2 WIS, +1 INT. Tide-wise');
    expect(event.segments[2].text).toContain('Now then. Every creature must choose a path');
  });

  it('a refused request stores its refusal line as one Keeper segment', () => {
    const ctx = newCtx();
    exhaustDay(ctx);
    expect(startCreationGeneration(ctx, stateOf(ctx), 'race')).toBe('refused');
    const [event] = creationEvents(ctx);
    expectKeeperSegments(event);
    expect(event.segments).toHaveLength(1);
    expect(event.message).toBe(llmRefusalMessage('daily_cost'));
  });

  it('a refused class fill and a class-fill retry store one Keeper segment each', () => {
    const refused = newCtx({ character_creation_state: [revealedState({ step: 'CLASS_FILL_ERROR' })] });
    setLlmEnabled(refused, false);
    expect(retryClassFill(refused, stateOf(refused))).toBe('refused');
    const [errorEvent] = creationEvents(refused);
    expectKeeperSegments(errorEvent);
    expect(errorEvent.message).toBe(classFillRetryLine(LLM_RESTING_LINE));

    const retried = newCtx({ character_creation_state: [revealedState({ step: 'CLASS_FILL_ERROR' })] });
    expect(retryClassFill(retried, stateOf(retried))).toBe('enqueued');
    const [retryEvent] = creationEvents(retried);
    expectKeeperSegments(retryEvent);
    expect(retryEvent.message).toBe(CLASS_FILL_RETRY_LINE);
  });
});
