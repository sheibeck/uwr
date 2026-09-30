/**
 * startCreationGeneration (Phase 41, Plan 13, PIPE-01 / PIPE-04).
 * Strict mock db (accessors from the recorded schema); one shared identity per player.
 *
 * The mock maps the `race_definition.by_name` accessor to the column `name`, so a known race is
 * seeded with a lowercase `name` (the real index is on `nameLower`).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx } from './test-utils';
import { rowColumnProblems } from './schema_recorder';
import { startCreationGeneration } from './creation_generation';
import { resolveRouteInput } from './llm_inputs';
import { llmRefusalMessage } from './llm_queue';
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
    expect(rows(ctx, 'llm_task')).toHaveLength(0);
    expect(jobs[0]).toMatchObject({ route: 'creation_race', playerId: alice, characterId: 0n, status: 'pending' });
    expect(JSON.parse(jobs[0].dedupeKey)).toEqual([alice.toHexString(), 'creation_race', '1:race']);
    expect(rowColumnProblems('llm_job', jobs[0])).toEqual([]);

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
            secondary: { stat: 'con', value: 1 },
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
    expect(events[0].message).toContain('+2 WIS, +1 CON. Tide-wise');
    expect(events[0].message).toContain('[Warrior]');
    expect(events[0].message).toContain('Now then. Every creature must choose a path, and you are no exception.');
    expect(events[0].message).not.toContain('choose its path');
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

describe('startCreationGeneration: class', () => {
  const classState = (over: Record<string, unknown> = {}) =>
    stateRow({
      step: 'GENERATING_CLASS',
      raceName: 'Saltkin',
      raceNarrative: 'Marsh dwellers.',
      archetype: 'mystic',
      ...over,
    });

  it('enqueues one creation_class job with race and archetype from the state', () => {
    const ctx = newCtx({ character_creation_state: [classState()] });
    expect(startCreationGeneration(ctx, stateOf(ctx), 'class')).toBe('enqueued');

    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ route: 'creation_class', playerId: alice, characterId: 0n });
    expect(JSON.parse(jobs[0].dedupeKey)).toEqual([alice.toHexString(), 'creation_class', '1:class']);
    const input = resolveRouteInput(ctx, jobs[0]) as any;
    expect(input).toEqual({ raceName: 'Saltkin', raceNarrative: 'Marsh dwellers.', archetype: 'mystic' });
    expect(() => buildRouteLayers('creation_class', input)).not.toThrow();
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
