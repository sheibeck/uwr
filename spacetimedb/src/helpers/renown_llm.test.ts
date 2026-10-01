import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx as createLenientMockCtx } from './test-utils';
import { rowColumnProblems } from './schema_recorder';
import { buildDedupeKey } from './llm_queue';
import { encodeRouteInput, resolveRouteInput } from './llm_inputs';
import { utcDay } from './llm_budget';
import { scheduledMicros } from './llm_schedule';
import { appendPrivateEvent, appendSystemMessage } from './events';
import { applyRenownPerkResult, toApplyJob } from './llm_apply';
import { chooseRenownPerkLogic } from '../reducers/renown_perk';
import { RENOWN_PERK_POOLS } from '../data/renown_data';
import { LLM_PLAYER_DAILY_COST_MICRO_USD, LLM_DAILY_CEILING_DEFAULT_MICRO_USD } from '../data/llm_limits';
import {
  awardRenown,
  triggerRenownPerkGeneration,
  insertStaticRenownPerkOptions,
  renownDeferredMessage,
  renownRankClaimed,
  RENOWN_STATIC_OPTIONS_MESSAGE,
} from './renown';

// ============================================================================
// PIPE-08 regression: a renown rank-up must reach the llm_job queue.
// The legacy path looked the player up by Identity index with a u64 and returned
// early, then (had it got further) inserted into a table with the wrong columns
// inside a try/catch that swallowed the error. Real renown_data is used so the
// static fallback is exercised for every rank that has a pool.
// ============================================================================

// Records the real column definitions so rowColumnProblems can validate inserted rows.
vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

vi.mock('./events', () => ({
  appendSystemMessage: vi.fn(),
  appendPrivateEvent: vi.fn(),
  appendWorldEvent: vi.fn(),
}));

// Strict mock db (WR-04): unknown index accessors and missing-row updates throw, like the real db.
// The accessors come from the recorded schema, so load it before any test touches ctx.db.
beforeAll(async () => {
  await import('../schema/tables');
});

const createMockCtx = (o: Parameters<typeof createLenientMockCtx>[0] = {}) =>
  createLenientMockCtx({ ...o, strict: true });

const alice = { toHexString: () => 'alice-hex' };

const character = () => ({
  id: 1n,
  ownerUserId: 7n,
  name: 'Aldric',
  race: 'Kobold',
  className: 'Ashweaver',
});

function seededCtx(over: Record<string, any[]> = {}, withPlayer = true) {
  return createMockCtx({
    sender: alice,
    seed: {
      ...(withPlayer ? { player: [{ id: alice, userId: 7n, activeCharacterId: 1n }] } : {}),
      character: [character()],
      renown: [{ id: 1n, characterId: 1n, points: 90n, currentRank: 1n }],
      ...over,
    },
  });
}

const rows = (ctx: any, table: string): any[] => ctx.db[table]._rows();

describe('renown rank-up enqueues a job (PIPE-08)', () => {
  it('leaves exactly one valid pending renown_perk_gen job and no legacy task row', async () => {
    await import('../schema/tables');
    const ctx = seededCtx();
    awardRenown(ctx, character(), 20n, 'test');

    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    const job = jobs[0];
    expect(job.route).toBe('renown_perk_gen');
    expect(job.playerId).toBe(alice);
    expect(job.status).toBe('pending');
    expect(job.characterId).toBe(1n);
    expect(job.dedupeKey).toBe(buildDedupeKey(alice, 'renown_perk_gen', '1:2'));
    expect(JSON.parse(job.requestJson)).toEqual({
      characterId: '1',
      rank: 2,
      className: 'Ashweaver',
      raceName: 'Kobold',
      existingPerks: [],
      input: encodeRouteInput({
        characterName: 'Aldric',
        className: 'Ashweaver',
        raceName: 'Kobold',
        rank: 2,
        existingPerks: [],
      }),
    });
    expect(rowColumnProblems('llm_job', job)).toEqual([]);
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(0);
  });

  it('includes the perks the character already holds', () => {
    const ctx = seededCtx({
      renown_perk: [{ id: 1n, characterId: 1n, rank: 2n, perkKey: 'iron_will' }],
    });
    triggerRenownPerkGeneration(ctx, character(), 3);
    const req = JSON.parse(rows(ctx, 'llm_job')[0].requestJson);
    expect(req.existingPerks).toEqual([{ name: 'iron_will', perkKey: 'iron_will' }]);
    expect(req.rank).toBe(3);
  });

  it('raceName comes from character.race', () => {
    const ctx = seededCtx();
    const c: any = { ...character() };
    delete c.raceName;
    triggerRenownPerkGeneration(ctx, c, 2);
    expect(JSON.parse(rows(ctx, 'llm_job')[0].requestJson).raceName).toBe('Kobold');
  });

  it('a jump across two ranks enqueues only the lowest rank and tells the player the next one waits (CR-B01)', () => {
    const ctx = seededCtx();
    vi.mocked(appendSystemMessage).mockClear();
    awardRenown(ctx, character(), 200n, 'test');
    const ranks = rows(ctx, 'llm_job').map((j: any) => JSON.parse(j.requestJson).rank);
    expect(ranks).toEqual([2]);
    const lines = vi.mocked(appendSystemMessage).mock.calls.map((c) => c[2]);
    expect(lines).toContain(renownDeferredMessage(3));
    expect(lines).not.toContain(renownDeferredMessage(2));
  });

  it('is idempotent per character and rank, and a different rank waits while an offer is open (CR-B01)', () => {
    const ctx = seededCtx();
    expect(triggerRenownPerkGeneration(ctx, character(), 2)).toBe('offered');
    triggerRenownPerkGeneration(ctx, character(), 2);
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
    expect(triggerRenownPerkGeneration(ctx, character(), 3)).toBe('deferred');
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
  });
});

describe('renown offers are serialized, one rank at a time (CR-B01)', () => {
  const passive = (name: string) => ({
    name,
    description: `${name} description.`,
    kind: '',
    perkEffectJson: '{"maxHp":10}',
    perkDomain: 'combat',
  });
  const reply = (prefix: string) =>
    JSON.stringify({ perks: [passive(`${prefix} A`), passive(`${prefix} B`), passive(`${prefix} C`)] });

  /** Complete the single active renown job and apply the reply, as the executor does. */
  function completeAndApply(ctx: any, text: string): number {
    const active = rows(ctx, 'llm_job').filter((j: any) => j.status === 'pending');
    expect(active).toHaveLength(1);
    const job = active[0];
    ctx.db.llm_job.id.update({ ...job, status: 'completed' });
    applyRenownPerkResult(ctx, toApplyJob(job), text);
    return JSON.parse(job.requestJson).rank;
  }

  const pendingRanks = (ctx: any) =>
    rows(ctx, 'pending_renown_perk').map((p: any) => Number(p.rank));

  it('crossing two ranks bills one call at a time; choosing rank 2 queues rank 3 and loses nothing', () => {
    const ctx = seededCtx();
    awardRenown(ctx, character(), 200n, 'test'); // 90 -> 290: ranks 2 and 3
    expect(rows(ctx, 'llm_job')).toHaveLength(1);

    expect(completeAndApply(ctx, reply('Two'))).toBe(2);
    expect(pendingRanks(ctx)).toEqual([2, 2, 2]);
    expect(rows(ctx, 'llm_job').filter((j: any) => j.status === 'pending')).toHaveLength(0);

    const pick = rows(ctx, 'pending_renown_perk')[0];
    expect(chooseRenownPerkLogic(ctx, { characterId: 1n, perkId: pick.id })).toEqual({ success: true });
    expect(rows(ctx, 'renown_perk').map((r: any) => r.rank)).toEqual([2n]);
    expect(pendingRanks(ctx)).toEqual([]);

    // The rank 3 offer follows the choice.
    expect(completeAndApply(ctx, reply('Three'))).toBe(3);
    expect(pendingRanks(ctx)).toEqual([3, 3, 3]);
    expect(rows(ctx, 'llm_job')).toHaveLength(2);

    const pick3 = rows(ctx, 'pending_renown_perk')[0];
    chooseRenownPerkLogic(ctx, { characterId: 1n, perkId: pick3.id });
    expect(rows(ctx, 'renown_perk').map((r: any) => r.rank).sort()).toEqual([2n, 3n]);
    expect(pendingRanks(ctx)).toEqual([]);
    // Every earned rank is claimed: nothing further is queued.
    expect(rows(ctx, 'llm_job')).toHaveLength(2);
  });

  it('reaching rank 3 while the rank 2 options are pending queues nothing until the choice', () => {
    const ctx = seededCtx();
    awardRenown(ctx, character(), 20n, 'test'); // rank 2
    completeAndApply(ctx, reply('Two'));
    awardRenown(ctx, character(), 200n, 'test'); // rank 3
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
    expect(pendingRanks(ctx)).toEqual([2, 2, 2]);

    chooseRenownPerkLogic(ctx, { characterId: 1n, perkId: rows(ctx, 'pending_renown_perk')[0].id });
    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(2);
    expect(JSON.parse(jobs[1].requestJson).rank).toBe(3);
  });

  it("when two ranks are already pending, choosing one keeps the other rank's options", () => {
    const ctx = seededCtx({ renown: [{ id: 1n, characterId: 1n, points: 290n, currentRank: 3n }] });
    insertStaticRenownPerkOptions(ctx, 1n, 2);
    insertStaticRenownPerkOptions(ctx, 1n, 3);
    expect(pendingRanks(ctx).sort()).toEqual([2, 2, 2, 3, 3, 3]);

    const rank2 = rows(ctx, 'pending_renown_perk').find((p: any) => p.rank === 2n);
    chooseRenownPerkLogic(ctx, { characterId: 1n, perkId: rank2.id });
    expect(pendingRanks(ctx)).toEqual([3, 3, 3]);
    // Rank 3 is still open, so no job is queued for it.
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });

  it('a result for a rank that is already pending or claimed inserts nothing', () => {
    const ctx = seededCtx();
    insertStaticRenownPerkOptions(ctx, 1n, 2);
    const job = { domain: 'renown_perk_gen', playerId: alice, contextJson: JSON.stringify({ characterId: '1', rank: 2 }) };
    applyRenownPerkResult(ctx, job, reply('Again'));
    expect(pendingRanks(ctx)).toEqual([2, 2, 2]);

    const claimed = seededCtx({ renown_perk: [{ id: 1n, characterId: 1n, rank: 2n, perkKey: 'renown_rank2_x' }] });
    applyRenownPerkResult(claimed, job, reply('Again'));
    expect(rows(claimed, 'pending_renown_perk')).toHaveLength(0);
    expect(insertStaticRenownPerkOptions(claimed, 1n, 2)).toBe(0);
  });

  it('a rank claimed as a Renown ability counts as claimed', () => {
    const ctx = seededCtx({
      ability_template: [{ id: 5n, characterId: 1n, source: 'Renown', abilityKey: 'renown_rank2_void_strike' }],
    });
    expect(renownRankClaimed(ctx, 1n, 2)).toBe(true);
    expect(renownRankClaimed(ctx, 1n, 3)).toBe(false);
    expect(triggerRenownPerkGeneration(ctx, character(), 2)).toBe('claimed');
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });
});

describe('renown enqueue: snapshot, dispatch and refusal fallback (41-05)', () => {
  const eventMock = vi.mocked(appendPrivateEvent);
  const line = () =>
    eventMock.mock.calls.filter((c) => c[4] === RENOWN_STATIC_OPTIONS_MESSAGE);

  it('the snapshot resolves to the same input the executor builds, and one dispatch row exists', () => {
    const ctx = seededCtx();
    triggerRenownPerkGeneration(ctx, character(), 2);
    const job = rows(ctx, 'llm_job')[0];
    expect(resolveRouteInput(ctx, job)).toEqual({
      characterName: 'Aldric',
      className: 'Ashweaver',
      raceName: 'Kobold',
      rank: 2,
      existingPerks: [],
    });
    const dispatch = rows(ctx, 'llm_dispatch');
    expect(dispatch).toHaveLength(1);
    expect(dispatch[0].jobId).toBe(job.id);
    expect(scheduledMicros(dispatch[0].scheduledAt)).toBe(ctx.timestamp.microsSinceUnixEpoch);
    expect(job.reservedMicroUsd > 0n).toBe(true);
    expect(job.budgetDay).toBe(utcDay(ctx.timestamp));
    expect(rows(ctx, 'llm_sweep_tick')).toHaveLength(1);
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(0);
  });

  it('a refusal at the daily cost limit inserts the static rank 2 options and one Keeper line, and no job, dispatch or reservation', () => {
    const ctx = seededCtx();
    // The day row is seeded against the identity the mock resolves for the player.
    ctx.db.llm_player_budget.insert({
      id: 0n,
      playerId: alice,
      dayUtc: utcDay(ctx.timestamp),
      reservedMicroUsd: 0n,
      spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD,
      calls: 1n,
    });
    eventMock.mockClear();
    triggerRenownPerkGeneration(ctx, character(), 2);

    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'llm_sweep_tick')).toHaveLength(0);
    expect(rows(ctx, 'llm_spend')).toHaveLength(0);
    const day = rows(ctx, 'llm_player_budget');
    expect(day).toHaveLength(1);
    expect(day[0].reservedMicroUsd).toBe(0n);
    expect(day[0].calls).toBe(1n);

    const pending = rows(ctx, 'pending_renown_perk');
    expect(pending).toHaveLength(3);
    expect(pending.every((p: any) => p.rank === 2n && p.characterId === 1n)).toBe(true);
    for (const p of pending) expect(rowColumnProblems('pending_renown_perk', p)).toEqual([]);
    expect(line()).toHaveLength(1);
    expect(line()[0][1]).toBe(1n);
  });

  // Phase 43 CONTEXT retires the $2 phase cap as a limit; the global daily ceiling replaces it, so this
  // case now reaches the ceiling today (an earned offer still falls back to the static options).
  it('a refusal at the global daily ceiling falls back to static options too', () => {
    const ctx = seededCtx();
    ctx.db.llm_spend.insert({
      id: 1n,
      spentMicroUsd: LLM_DAILY_CEILING_DEFAULT_MICRO_USD,
      reservedMicroUsd: 0n,
      calls: 0n,
      updatedAt: ctx.timestamp,
      dayUtc: utcDay(ctx.timestamp),
      daySpentMicroUsd: LLM_DAILY_CEILING_DEFAULT_MICRO_USD,
    });
    eventMock.mockClear();
    triggerRenownPerkGeneration(ctx, character(), 2);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(0);
    expect(rows(ctx, 'llm_spend')[0].reservedMicroUsd).toBe(0n);
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(3);
    expect(line()).toHaveLength(1);
  });

  it('a rank with no static pool inserts nothing and posts no line', () => {
    const noPool = Object.keys(RENOWN_PERK_POOLS)
      .map(Number)
      .find((r) => RENOWN_PERK_POOLS[r].length === 0);
    const rank = noPool ?? 99;
    const ctx = seededCtx();
    ctx.db.llm_spend.insert({
      id: 1n,
      spentMicroUsd: LLM_DAILY_CEILING_DEFAULT_MICRO_USD,
      reservedMicroUsd: 0n,
      calls: 0n,
      updatedAt: ctx.timestamp,
      dayUtc: utcDay(ctx.timestamp),
      daySpentMicroUsd: LLM_DAILY_CEILING_DEFAULT_MICRO_USD,
    });
    eventMock.mockClear();
    triggerRenownPerkGeneration(ctx, character(), rank);
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(0);
    expect(line()).toHaveLength(0);
  });

  it('a dedupe hit inserts nothing further and posts nothing', () => {
    const ctx = seededCtx();
    triggerRenownPerkGeneration(ctx, character(), 2);
    eventMock.mockClear();
    const jobs = rows(ctx, 'llm_job').length;
    const dispatches = rows(ctx, 'llm_dispatch').length;
    const reserved = rows(ctx, 'llm_spend')[0].reservedMicroUsd;
    triggerRenownPerkGeneration(ctx, character(), 2);
    expect(rows(ctx, 'llm_job')).toHaveLength(jobs);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(dispatches);
    expect(rows(ctx, 'llm_spend')[0].reservedMicroUsd).toBe(reserved);
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(0);
    expect(eventMock).not.toHaveBeenCalled();
  });

  it('an earned renown job is never refused as busy when the player already holds three capped jobs', () => {
    const day = '1970-01-12';
    const active = (id: bigint, route: string) => ({
      id,
      playerId: alice,
      route,
      dedupeKey: `seed-${id}`,
      status: 'pending',
      budgetDay: day,
    });
    const ctx = seededCtx({
      llm_job: [active(11n, 'npc_conversation'), active(12n, 'skill_gen'), active(13n, 'creation_race')],
    });
    triggerRenownPerkGeneration(ctx, character(), 2);
    expect(rows(ctx, 'llm_job')).toHaveLength(4);
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(0);
  });
});

describe('static fallback when no player identity resolves', () => {
  it('inserts three pending perks for rank 2 and creates no job', async () => {
    await import('../schema/tables');
    const ctx = seededCtx({}, false);
    triggerRenownPerkGeneration(ctx, character(), 2);
    const pending = rows(ctx, 'pending_renown_perk');
    expect(pending).toHaveLength(3);
    expect(pending.every((p: any) => p.rank === 2n && p.characterId === 1n)).toBe(true);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    for (const p of pending) expect(rowColumnProblems('pending_renown_perk', p)).toEqual([]);
  });

  it('a player with another userId does not resolve, so the fallback runs', () => {
    const ctx = seededCtx({ player: [{ id: alice, userId: 99n, activeCharacterId: 5n }] }, false);
    triggerRenownPerkGeneration(ctx, character(), 2);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(3);
  });

  it('with an identity resolved, no static options are inserted', () => {
    const ctx = seededCtx();
    triggerRenownPerkGeneration(ctx, character(), 2);
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(0);
  });

  const ranksWithPools = Object.keys(RENOWN_PERK_POOLS)
    .map(Number)
    .filter((r) => RENOWN_PERK_POOLS[r].length > 0);

  it('the real pools cover the ranks that used to crash (2, 3, 5, 9, 11)', () => {
    for (const r of [2, 3, 5, 9, 11]) expect(ranksWithPools).toContain(r);
  });

  it.each(ranksWithPools)('rank %i: never drops the earned offer, and stores readable JSON', async (rank) => {
    await import('../schema/tables');
    const ctx = seededCtx({}, false);
    expect(() => triggerRenownPerkGeneration(ctx, character(), rank)).not.toThrow();

    const pool = RENOWN_PERK_POOLS[rank];
    const pending = rows(ctx, 'pending_renown_perk');
    expect(pending).toHaveLength(Math.min(3, pool.length));
    expect(rows(ctx, 'llm_job')).toHaveLength(0);

    pending.forEach((row: any, i: number) => {
      const perk = pool[i];
      expect(rowColumnProblems('pending_renown_perk', row)).toEqual([]);
      expect(row.name).toBe(perk.name);
      if (perk.type === 'active') {
        expect(row.perkEffectJson).toBeUndefined();
        expect(row.kind).toBe('utility');
      } else {
        expect(typeof row.perkEffectJson).toBe('string');
        const parsed = JSON.parse(row.perkEffectJson);
        // Same keys, bigint values readable as plain numbers (the shape the LLM prompt documents).
        expect(Object.keys(parsed).sort()).toEqual(Object.keys(perk.effect).sort());
        for (const [k, v] of Object.entries(perk.effect as Record<string, unknown>)) {
          expect(parsed[k]).toEqual(typeof v === 'bigint' ? Number(v) : v);
        }
      }
    });
  });
});
