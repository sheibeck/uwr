import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx as createLenientMockCtx } from './test-utils';
import { rowColumnProblems } from './schema_recorder';
import { buildDedupeKey } from './llm_queue';
import { RENOWN_PERK_POOLS } from '../data/renown_data';
import { awardRenown, triggerRenownPerkGeneration } from './renown';

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
    });
    expect(rowColumnProblems('llm_job', job)).toEqual([]);
    expect(rows(ctx, 'llm_task')).toHaveLength(0);
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

  it('a jump across two ranks enqueues one job per rank', () => {
    const ctx = seededCtx();
    awardRenown(ctx, character(), 200n, 'test');
    const ranks = rows(ctx, 'llm_job')
      .map((j: any) => JSON.parse(j.requestJson).rank)
      .sort();
    expect(ranks).toEqual([2, 3]);
  });

  it('is idempotent per character and rank, and a different rank is a second job', () => {
    const ctx = seededCtx();
    triggerRenownPerkGeneration(ctx, character(), 2);
    triggerRenownPerkGeneration(ctx, character(), 2);
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
    triggerRenownPerkGeneration(ctx, character(), 3);
    expect(rows(ctx, 'llm_job')).toHaveLength(2);
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
