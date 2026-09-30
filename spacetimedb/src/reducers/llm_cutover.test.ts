/**
 * Per-domain cutover tests (Phase 41): each triggering reducer, called through the REAL handler
 * captured from `spacetimedb/src/index.ts`, must enqueue exactly one job (plus its dispatch row)
 * in its own transaction and must not touch the legacy `llm_task` table. Plans 41-11 to 41-15
 * add their domains to this file, reusing the harness below (seed builders, `expectEnqueued`).
 *
 * The mock db is strict (unknown tables and index accessors throw, like the real database) and
 * one shared identity object is used for seeding and as the sender (the mock compares
 * identities with ===).
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { capturedReducer, rowColumnProblems } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { llmRefusalMessage } from '../helpers/llm_queue';
import { resolveRouteInput } from '../helpers/llm_inputs';
import { utcDay } from '../helpers/llm_budget';
import { buildRouteLayers } from '../data/llm_layers';
import { LLM_PLAYER_DAILY_COST_MICRO_USD } from '../data/llm_limits';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const T0 = 1_700_000_000_000_000n; // 2023-11-14T22:13:20Z

const alice = { toHexString: () => 'a'.repeat(64) };

const handlers: Record<string, (...args: any[]) => any> = {};

beforeAll(async () => {
  await import('../index');
  for (const name of ['talk_to_npc']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(
        `capturedReducer('${name}') is not a function: the schema recorder could not capture the ` +
          'reducer from index.ts. STOP and report; never edit production code to fix this.',
      );
    }
    handlers[name] = h;
  }
}, 120_000);

let randomSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.42);
});
afterEach(() => {
  randomSpy.mockRestore();
});

type Seed = Record<string, any[]>;

function newCtx(seed: Seed, sender: any = alice, timestampMicros: bigint = T0) {
  return createMockCtx({ seed, sender, timestampMicros, strict: true });
}

function rows(ctx: any, table: string): any[] {
  return ctx.db._tables[table] ?? [];
}

/** Every inserted row matches the recorded table columns (the PIPE-08 bug class). */
function allRowsMatchSchema(ctx: any, tables: string[]): string[] {
  const problems: string[] = [];
  for (const table of tables) {
    for (const row of rows(ctx, table)) {
      for (const p of rowColumnProblems(table, row)) problems.push(`${table}: ${p}`);
    }
  }
  return problems;
}

/**
 * Asserts the reducer left exactly one job for `route`, exactly one dispatch row for it, and no
 * legacy `llm_task` rows; returns the job.
 */
export function expectEnqueued(ctx: any, route: string, expectedJobs = 1): any {
  const jobs = rows(ctx, 'llm_job').filter((j: any) => j.route === route);
  expect(jobs).toHaveLength(expectedJobs);
  expect(rows(ctx, 'llm_job')).toHaveLength(expectedJobs);
  const dispatch = rows(ctx, 'llm_dispatch');
  expect(dispatch).toHaveLength(expectedJobs);
  for (const job of jobs) {
    expect(dispatch.filter((d: any) => d.jobId === job.id)).toHaveLength(1);
  }
  expect(rows(ctx, 'llm_task')).toHaveLength(0);
  expect(allRowsMatchSchema(ctx, ['llm_job', 'llm_dispatch'])).toEqual([]);
  return jobs[jobs.length - 1];
}

/** No job, no dispatch row, no sweep tick, no reservation anywhere. */
function expectNothingReserved(ctx: any) {
  expect(rows(ctx, 'llm_job')).toHaveLength(0);
  expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
  expect(rows(ctx, 'llm_sweep_tick')).toHaveLength(0);
  expect(rows(ctx, 'llm_task')).toHaveLength(0);
  for (const day of rows(ctx, 'llm_player_budget')) expect(day.reservedMicroUsd).toBe(0n);
  for (const led of rows(ctx, 'llm_spend')) expect(led.reservedMicroUsd).toBe(0n);
}

const systemLines = (ctx: any): string[] =>
  rows(ctx, 'event_private').filter((e: any) => e.kind === 'system').map((e: any) => e.message);

// Seed builders -------------------------------------------------------------

const playerSeed = (): Seed => ({
  player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
});

const worldSeed = (): Seed => ({
  region: [
    {
      id: 1n,
      name: 'Ashen Reach',
      dangerMultiplier: 100n,
      regionType: 'wild',
      biome: 'volcanic',
      landmarks: '["The Cinder Gate"]',
      threats: '["ash wraiths"]',
    },
  ],
  location: [
    { id: 10n, name: 'The Crossing', description: 'A crossroads.', zone: 'z', regionId: 1n },
  ],
});

const characterSeed = (over: Record<string, unknown> = {}): Seed => ({
  character: [
    {
      id: 1n,
      ownerUserId: 7n,
      name: 'Aldric',
      race: 'Kobold',
      className: 'Ashweaver',
      locationId: 10n,
      combatTargetEnemyId: undefined,
      ...over,
    },
  ],
});

const npcSeed = (): Seed => ({
  npc: [
    {
      id: 5n,
      name: 'Mirel',
      npcType: 'villager',
      locationId: 10n,
      description: 'A weathered keeper of the crossing.',
      greeting: 'Well met.',
    },
  ],
});

const baseSeed = (): Seed => ({
  ...playerSeed(),
  ...worldSeed(),
  ...characterSeed(),
  ...npcSeed(),
});

// ---------------------------------------------------------------------------
// NPC chat (41-10)
// ---------------------------------------------------------------------------

describe('talk_to_npc (NPC chat cutover)', () => {
  const talk = (ctx: any, message: string, over: Record<string, unknown> = {}) =>
    handlers.talk_to_npc(ctx, { characterId: 1n, npcId: 5n, message, ...over });

  it('enqueues exactly one owned npc_conversation job and one dispatch row, and writes no legacy task', () => {
    const ctx = newCtx(baseSeed());
    talk(ctx, 'Hello there');

    const job = expectEnqueued(ctx, 'npc_conversation');
    expect(job.playerId).toBe(alice);
    expect(job.characterId).toBe(1n);
    expect(job.status).toBe('pending');
    expect(job.reservedMicroUsd > 0n).toBe(true);
    expect(job.budgetDay).toBe(utcDay(ctx.timestamp));

    const memory = rows(ctx, 'npc_memory');
    expect(memory).toHaveLength(1);
    const req = JSON.parse(job.requestJson);
    expect(req.characterId).toBe('1');
    expect(req.npcId).toBe('5');
    expect(req.memoryId).toBe(memory[0].id.toString());
    expect(typeof req.memoryId).toBe('string');

    expect(allRowsMatchSchema(ctx, ['npc_memory', 'npc_dialog', 'event_private'])).toEqual([]);
  });

  it('snapshots a route input whose player message reaches the volatile layer inside player_input tags', () => {
    const ctx = newCtx(baseSeed());
    talk(ctx, 'Hello there');
    const job = expectEnqueued(ctx, 'npc_conversation');

    const input = resolveRouteInput(ctx, job) as any;
    expect(input.playerMessage).toBe('Hello there');
    expect(input.npc).toEqual({ name: 'Mirel', npcType: 'villager' });
    expect(input.region.name).toBe('Ashen Reach');
    expect(input.location).toEqual({ name: 'The Crossing' });

    const { volatile } = buildRouteLayers('npc_conversation', input);
    expect(volatile).toMatch(/<player_input>\s*Hello there\s*<\/player_input>/);
  });

  it('appends the player line to the dialog and the private log only after a successful enqueue', () => {
    const ctx = newCtx(baseSeed());
    talk(ctx, 'Hello there');
    expectEnqueued(ctx, 'npc_conversation');
    const dialog = rows(ctx, 'npc_dialog');
    expect(dialog).toHaveLength(1);
    expect(dialog[0].text).toBe('You: "Hello there"');
    const say = rows(ctx, 'event_private').filter((e: any) => e.kind === 'say');
    expect(say).toHaveLength(1);
    expect(say[0].message).toBe('You say to Mirel: "Hello there"');
  });

  it('answers a second message before the reply with the patience line, no second job and no echoed line', () => {
    const ctx = newCtx(baseSeed());
    talk(ctx, 'Hello there');
    talk(ctx, 'Are you there?');

    expectEnqueued(ctx, 'npc_conversation');
    expect(systemLines(ctx)).toEqual(['The Keeper is already considering something. Patience.']);
    const dialog = rows(ctx, 'npc_dialog');
    expect(dialog).toHaveLength(1);
    expect(dialog[0].text).toBe('You: "Hello there"');
    expect(rows(ctx, 'event_private').filter((e: any) => e.kind === 'say')).toHaveLength(1);
    // The duplicate reserved nothing more: one call against the player's day.
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(1);
    expect(rows(ctx, 'llm_player_budget')[0].calls).toBe(1n);
  });

  it('creates a new job for the next message once the reply updated the memory', () => {
    const ctx = newCtx(baseSeed());
    talk(ctx, 'Hello there');
    const first = expectEnqueued(ctx, 'npc_conversation');

    // The executor applied the reply: the job is terminal and the memory moved forward.
    Object.assign(first, { status: 'completed' });
    const memory = rows(ctx, 'npc_memory')[0];
    memory.lastUpdated = { microsSinceUnixEpoch: T0 + 5_000_000n };
    ctx.timestamp = { microsSinceUnixEpoch: T0 + 10_000_000n };

    talk(ctx, 'What news?');
    expect(rows(ctx, 'llm_job')).toHaveLength(2);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(2);
    expect(rows(ctx, 'llm_job')[1].dedupeKey).not.toBe(first.dedupeKey);
    expect(rows(ctx, 'llm_task')).toHaveLength(0);
    expect(systemLines(ctx)).toEqual([]);
    expect(rows(ctx, 'npc_dialog').map((d: any) => d.text)).toEqual([
      'You: "Hello there"',
      'You: "What news?"',
    ]);
  });

  it('refuses an empty or whitespace-only message in voice with no job and no reservation', () => {
    for (const message of ['', '   ', '\n\t ']) {
      const ctx = newCtx(baseSeed());
      talk(ctx, message);
      expectNothingReserved(ctx);
      expect(rows(ctx, 'llm_player_budget')).toHaveLength(0);
      expect(systemLines(ctx)).toEqual(['You open your mouth, but nothing comes out.']);
      expect(rows(ctx, 'npc_dialog')).toHaveLength(0);
    }
  });

  it('over the daily cost limit creates nothing and answers with the refusal line, no player line', () => {
    const ctx = newCtx(baseSeed());
    ctx.db.llm_player_budget.insert({
      id: 0n,
      playerId: alice,
      dayUtc: utcDay(ctx.timestamp),
      reservedMicroUsd: 0n,
      spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD,
      calls: 1n,
    });
    talk(ctx, 'Hello there');

    expectNothingReserved(ctx);
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(1);
    expect(rows(ctx, 'llm_player_budget')[0].calls).toBe(1n);
    expect(systemLines(ctx)).toEqual([llmRefusalMessage('daily_cost')]);
    expect(rows(ctx, 'npc_dialog')).toHaveLength(0);
    expect(rows(ctx, 'event_private').filter((e: any) => e.kind === 'say')).toHaveLength(0);
  });

  it('over the per-player active-job cap answers busy, with no job, no reservation and no player line', () => {
    const ctx = newCtx(baseSeed());
    // Three active capped jobs of other routes, each holding a budget day.
    for (let i = 0; i < 3; i++) {
      ctx.db.llm_job.insert({
        id: 0n,
        playerId: alice,
        characterId: 1n,
        route: 'skill_gen',
        dedupeKey: `k${i}`,
        status: 'pending',
        attempt: 0n,
        requestJson: '{}',
        inputTokens: 0n,
        outputTokens: 0n,
        cacheWriteTokens: 0n,
        cacheReadTokens: 0n,
        createdAt: ctx.timestamp,
        reservedMicroUsd: 0n,
        costMicroUsd: 0n,
        budgetDay: utcDay(ctx.timestamp),
        applyAttempts: 0n,
      });
    }
    talk(ctx, 'Hello there');

    expect(rows(ctx, 'llm_job')).toHaveLength(3);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(0);
    expect(systemLines(ctx)).toEqual([llmRefusalMessage('busy')]);
    expect(rows(ctx, 'npc_dialog')).toHaveLength(0);
  });

  it('keeps the ownership, location and combat checks ahead of the enqueue', () => {
    const away = newCtx({ ...baseSeed(), ...characterSeed({ locationId: 99n }) });
    talk(away, 'Hello');
    expectNothingReserved(away);
    expect(systemLines(away)).toEqual(['You are not near this NPC.']);

    const fighting = newCtx({ ...baseSeed(), ...characterSeed({ combatTargetEnemyId: 3n }) });
    talk(fighting, 'Hello');
    expectNothingReserved(fighting);
    expect(systemLines(fighting)).toEqual(['You cannot converse while in combat.']);

    const missing = newCtx(baseSeed());
    talk(missing, 'Hello', { npcId: 404n });
    expectNothingReserved(missing);
    expect(systemLines(missing)).toEqual(['NPC not found.']);
  });

  it('npc_interaction.ts no longer reads the legacy task table, the legacy budget helpers or a model literal', () => {
    const source = readFileSync(new URL('./npc_interaction.ts', import.meta.url), 'utf-8');
    expect(source).not.toMatch(/llm_task/);
    expect(source).not.toMatch(/checkBudget|incrementBudget/);
    expect(source).not.toMatch(/(?:gpt-\d|claude-)/i);
    expect(source.match(/enqueueLlmJob\(ctx/g)).toHaveLength(1);
  });
});
