/**
 * Combat outro narration (Phase 41, Plan 11, PIPE-07): enqueue, silent refusal, failure isolation.
 * Strict mock db (accessors from the recorded schema); one shared identity per player.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
import { createMockCtx } from './test-utils';
import { rowColumnProblems } from './schema_recorder';
import { buildCombatOutroSummary, enqueueCombatOutroNarration } from './combat_narration';
import { resolveRouteInput } from './llm_inputs';
import { utcDay } from './llm_budget';
import { buildRouteLayers } from '../data/llm_layers';
import { LLM_PLAYER_DAILY_COST_MICRO_USD } from '../data/llm_limits';
import { appendPrivateEvent } from './events';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

vi.mock('./events', () => ({
  appendSystemMessage: vi.fn(),
  appendPrivateEvent: vi.fn(),
  appendWorldEvent: vi.fn(),
  appendNpcDialog: vi.fn(),
  appendCreationEvent: vi.fn(),
}));

beforeAll(async () => {
  await import('../schema/tables');
});

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };
const bob = { toHexString: () => 'b'.repeat(64) };

/** A fake key built from fragments so no key-shaped literal appears in the source. */
const FAKE_KEY = ['sk', '-ant-', 'api03-', 'NARRTESTKEY'.repeat(4)].join('');

type Seed = Record<string, any[]>;

const seed = (over: Seed = {}): Seed => ({
  player: [
    { id: alice, userId: 7n, activeCharacterId: 1n },
    { id: bob, userId: 8n, activeCharacterId: 2n },
  ],
  character: [
    { id: 1n, ownerUserId: 7n, name: 'Aldric', hp: 50n, maxHp: 100n },
    { id: 2n, ownerUserId: 8n, name: 'Brienne', hp: 5n, maxHp: 100n },
  ],
  location: [{ id: 10n, name: 'Saltmarsh', description: 'A salt flat.', zone: 'z', regionId: 1n }],
  combat_encounter: [
    { id: 1n, locationId: 10n, leaderCharacterId: 1n, state: 'active', addCount: 0n, pendingAddCount: 0n, createdAt: { microsSinceUnixEpoch: T0 } },
  ],
  combat_participant: [
    { id: 1n, combatId: 1n, characterId: 1n, status: 'active', nextAutoAttackAt: 0n },
    { id: 2n, combatId: 1n, characterId: 2n, status: 'active', nextAutoAttackAt: 0n },
  ],
  combat_enemy: [
    { id: 1n, combatId: 1n, spawnId: 1n, enemyTemplateId: 1n, displayName: 'Cave Rat', currentHp: 0n, maxHp: 30n, attackDamage: 3n, armorClass: 1n, nextAutoAttackAt: 0n },
    { id: 2n, combatId: 1n, spawnId: 2n, enemyTemplateId: 1n, displayName: 'Cave Bat', currentHp: 12n, maxHp: 20n, attackDamage: 3n, armorClass: 1n, nextAutoAttackAt: 0n },
  ],
  ...over,
});

const newCtx = (s: Seed = seed()) => createMockCtx({ seed: s, sender: alice, timestampMicros: T0, strict: true });
const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];

/** The combat as the handlers see it: rows read from the db. */
const combatOf = (ctx: any) => rows(ctx, 'combat_encounter')[0];
const participantsOf = (ctx: any) => [...rows(ctx, 'combat_participant')];
const enemiesOf = (ctx: any) => [...rows(ctx, 'combat_enemy')];

const outro = (ctx: any, type: 'victory' | 'defeat' = 'victory') =>
  enqueueCombatOutroNarration(ctx, combatOf(ctx), participantsOf(ctx), enemiesOf(ctx), type);

const fillDay = (ctx: any, playerId: any, spent: bigint) =>
  ctx.db.llm_player_budget.insert({
    id: 0n,
    playerId,
    dayUtc: utcDay(ctx.timestamp),
    reservedMicroUsd: 0n,
    spentMicroUsd: spent,
    calls: 1n,
  });

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe('enqueueCombatOutroNarration: the enqueue', () => {
  it("creates one combat_narration job for the leader's player, one dispatch row, and the keys the result handler reads", () => {
    const ctx = newCtx();
    outro(ctx, 'victory');

    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')[0].jobId).toBe(jobs[0].id);
    expect(rows(ctx, 'llm_task')).toHaveLength(0);
    expect(jobs[0].route).toBe('combat_narration');
    expect(jobs[0].playerId).toBe(alice);
    expect(jobs[0].characterId).toBe(1n);
    expect(jobs[0].status).toBe('pending');

    const req = JSON.parse(jobs[0].requestJson);
    expect(req.combatId).toBe('1');
    expect(req.roundNumber).toBe('0');
    expect(req.narrativeType).toBe('victory');
    expect(req.participantCharacterIds).toEqual(['1', '2']);

    for (const table of ['llm_job', 'llm_dispatch']) {
      for (const row of rows(ctx, table)) expect(rowColumnProblems(table, row)).toEqual([]);
    }
  });

  it('snapshots an outro input that decodes with bigint HP and builds its layers', () => {
    const ctx = newCtx();
    outro(ctx, 'victory');
    const input = resolveRouteInput(ctx, rows(ctx, 'llm_job')[0]) as any;

    expect(input.narrativeType).toBe('victory');
    expect(input.roundNumber).toBe(0n);
    expect(input.combatId).toBe(1n);
    expect(input.locationName).toBe('Saltmarsh');
    expect(input.playerNames).toEqual(['Aldric', 'Brienne']);
    expect(input.enemyNames).toEqual(['Cave Rat', 'Cave Bat']);
    expect(input.deaths).toEqual(['Cave Rat']);
    expect(input.nearDeathNames).toEqual(['Brienne']);
    expect(input.participantHpSummary).toEqual([
      { name: 'Aldric', hp: 50n, maxHp: 100n, isEnemy: false },
      { name: 'Brienne', hp: 5n, maxHp: 100n, isEnemy: false },
      { name: 'Cave Rat', hp: 0n, maxHp: 30n, isEnemy: true },
      { name: 'Cave Bat', hp: 12n, maxHp: 20n, isEnemy: true },
    ]);
    expect(() => buildRouteLayers('combat_narration', input)).not.toThrow();
    const { volatile } = buildRouteLayers('combat_narration', input);
    expect(volatile).toContain('VICTORY');
  });

  it('a defeat records dead participants in deaths and marks the type', () => {
    const ctx = newCtx();
    rows(ctx, 'character')[1].hp = 0n;
    outro(ctx, 'defeat');
    const input = resolveRouteInput(ctx, rows(ctx, 'llm_job')[0]) as any;
    expect(input.narrativeType).toBe('defeat');
    expect(input.deaths).toEqual(['Brienne', 'Cave Rat']);
    expect(input.hasKill).toBe(true);
    expect(input.nearDeathNames).toEqual([]);
    expect(JSON.parse(rows(ctx, 'llm_job')[0].requestJson).narrativeType).toBe('defeat');
  });

  it("charges the first participant's owner when the combat has no leader", () => {
    const ctx = newCtx();
    const combat = { ...combatOf(ctx), leaderCharacterId: undefined };
    const participants = [participantsOf(ctx)[1], participantsOf(ctx)[0]];
    enqueueCombatOutroNarration(ctx, combat, participants, enemiesOf(ctx), 'victory');
    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].playerId).toBe(bob);
    expect(jobs[0].characterId).toBe(2n);
  });

  it('called twice for the same combat and type creates one job', () => {
    const ctx = newCtx();
    outro(ctx, 'victory');
    outro(ctx, 'victory');
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
  });

  it('is cap-exempt: three active capped jobs do not stop the narration', () => {
    const ctx = newCtx();
    for (let i = 0; i < 3; i++) {
      ctx.db.llm_job.insert({
        id: 0n, playerId: alice, characterId: 1n, route: 'skill_gen', dedupeKey: `k${i}`, status: 'pending',
        attempt: 0n, requestJson: '{}', inputTokens: 0n, outputTokens: 0n, cacheWriteTokens: 0n,
        cacheReadTokens: 0n, createdAt: ctx.timestamp, reservedMicroUsd: 0n, costMicroUsd: 0n,
        budgetDay: utcDay(ctx.timestamp), applyAttempts: 0n,
      });
    }
    outro(ctx, 'victory');
    expect(rows(ctx, 'llm_job').filter((j) => j.route === 'combat_narration')).toHaveLength(1);
  });
});

describe('enqueueCombatOutroNarration: silent skips', () => {
  it('a refusal at the daily cost limit writes nothing and says nothing', () => {
    const ctx = newCtx();
    fillDay(ctx, alice, LLM_PLAYER_DAILY_COST_MICRO_USD);
    expect(() => outro(ctx, 'victory')).not.toThrow();

    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'llm_sweep_tick')).toHaveLength(0);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
    expect(appendPrivateEvent).not.toHaveBeenCalled();
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(1);
    expect(rows(ctx, 'llm_player_budget')[0].reservedMicroUsd).toBe(0n);
    expect(rows(ctx, 'llm_player_budget')[0].calls).toBe(1n);
    for (const led of rows(ctx, 'llm_spend')) expect(led.reservedMicroUsd).toBe(0n);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('nothing is written and nothing throws when no player resolves for the leader', () => {
    const ctx = newCtx(seed({ player: [] }));
    expect(() => outro(ctx, 'victory')).not.toThrow();
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(0);
  });

  it('nothing is written when the combat has no participants', () => {
    const ctx = newCtx();
    const combat = { ...combatOf(ctx), leaderCharacterId: undefined };
    expect(() => enqueueCombatOutroNarration(ctx, combat, [], enemiesOf(ctx), 'victory')).not.toThrow();
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });
});

describe('enqueueCombatOutroNarration: failure isolation (T-41-23)', () => {
  const snapshotCombat = (ctx: any): string =>
    JSON.stringify(
      ['combat_encounter', 'combat_participant', 'combat_enemy', 'character'].map((t) => rows(ctx, t)),
      (_k, v) => (typeof v === 'bigint' ? `${v}n` : v),
    );

  it('a throwing job insert is caught: returns normally, logs a redacted line, leaves combat rows unchanged', () => {
    const ctx = newCtx();
    const realDb = ctx.db;
    ctx.db = new Proxy(realDb, {
      get: (_t, name: string) => {
        const table = (realDb as any)[name];
        if (name !== 'llm_job') return table;
        return new Proxy(table, {
          get: (tt, prop: string) =>
            prop === 'insert'
              ? () => {
                  throw new Error(`insert exploded with ${FAKE_KEY}`);
                }
              : (tt as any)[prop],
        });
      },
    });
    const before = snapshotCombat(ctx);

    expect(() => outro(ctx, 'victory')).not.toThrow();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = String(errorSpy.mock.calls[0][0]);
    expect(line).toContain('combat narration skipped');
    expect(line).not.toContain(FAKE_KEY);
    expect(snapshotCombat(ctx)).toBe(before);
  });

  it('an error while building the summary (missing location table row is fine; a throwing lookup is not) is caught', () => {
    const ctx = newCtx();
    const realDb = ctx.db;
    ctx.db = new Proxy(realDb, {
      get: (_t, name: string) => {
        if (name === 'location') throw new Error('location lookup exploded');
        return (realDb as any)[name];
      },
    });
    expect(() => outro(ctx, 'victory')).not.toThrow();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
  });

  it('buildCombatOutroSummary with an unknown location leaves locationName undefined', () => {
    const ctx = newCtx(seed({ location: [] }));
    const summary = buildCombatOutroSummary(ctx, combatOf(ctx), participantsOf(ctx), enemiesOf(ctx), 'victory');
    expect(summary.locationName).toBeUndefined();
    expect(summary.roundNumber).toBe(0n);
  });
});

describe('combat_narration.ts static shape', () => {
  const source = readFileSync(new URL('./combat_narration.ts', import.meta.url), 'utf-8');

  it('no longer has the round trigger, the round qualification, the legacy task table, the legacy budget helpers or a model literal', () => {
    expect(source).not.toMatch(/triggerCombatNarration|shouldNarrateRound/);
    expect(source).not.toMatch(/llm_task/);
    expect(source).not.toMatch(/checkBudget|incrementBudget/);
    expect(source).not.toMatch(/gpt-|claude-/i);
  });

  it('keeps the exports the rest of the module needs', () => {
    expect(source).toMatch(/export function enqueueCombatOutroNarration/);
    expect(source).toMatch(/export function buildCombatOutroSummary/);
    expect(source).toMatch(/export function handleCombatNarrationResult/);
    expect(source).toMatch(/export function sendNarrationSkippedMessage/);
    expect(source).toMatch(/export type RoundEventSummary/);
  });
});
