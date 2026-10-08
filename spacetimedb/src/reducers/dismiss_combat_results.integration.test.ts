/**
 * Phase 51.1 code review 2, WR-03: a group that dissolves mid-fight leaves its former members solo,
 * so their dismiss_combat_results takes the solo path. That path must delete only the caller's own
 * results and loot, never another participant's unclaimed loot from the same fight.
 * Runs the real handler captured from index.ts on the strict mock db.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const ann = { toHexString: () => 'a'.repeat(64) };
const bram = { toHexString: () => 'b'.repeat(64) };
const at = (micros: bigint) => ({ microsSinceUnixEpoch: micros });

let dismiss: (...args: any[]) => any;
beforeAll(async () => {
  await import('../index');
  const h = capturedReducer('dismiss_combat_results');
  if (typeof h !== 'function') {
    throw new Error("capturedReducer('dismiss_combat_results') is not a function: STOP and report; never edit production code to fix this.");
  }
  dismiss = h;
}, 120_000);

const result = (id: bigint, ownerUserId: bigint, characterId: bigint, combatId: bigint, groupId?: bigint) => ({
  id, ownerUserId, characterId, groupId, combatId, summary: 'Victory', createdAt: at(T0),
});
const loot = (id: bigint, ownerUserId: bigint, characterId: bigint, combatId: bigint) => ({
  id, combatId, ownerUserId, characterId, itemTemplateId: 50n, createdAt: at(T0),
});

/** Ann (1, user 7) and Bram (2, user 8) shared fight 9; their group has since dissolved (both solo). */
function newCtx(groupIds: { ann?: bigint; bram?: bigint } = {}) {
  return createMockCtx({
    seed: {
      player: [
        { id: ann, userId: 7n, activeCharacterId: 1n },
        { id: bram, userId: 8n, activeCharacterId: 2n },
      ],
      character: [
        { id: 1n, ownerUserId: 7n, name: 'Ann', locationId: 10n, groupId: groupIds.ann, online: true },
        { id: 2n, ownerUserId: 8n, name: 'Bram', locationId: 10n, groupId: groupIds.bram, online: true },
      ],
      combat_result: [result(1n, 7n, 1n, 9n, 5n), result(2n, 8n, 2n, 9n, 5n)],
      combat_loot: [loot(1n, 7n, 1n, 9n), loot(2n, 8n, 2n, 9n), loot(3n, 8n, 2n, 9n)],
    },
    sender: ann,
    timestampMicros: T0,
    strict: true,
  });
}

const rows = (ctx: any, name: string): any[] => ctx.db._tables[name] ?? [];

describe('dismiss_combat_results deletes only the caller\'s own rows (review 2 WR-03)', () => {
  it('solo after a mid-fight dissolve: Ann\'s dismiss keeps Bram\'s result and loot', () => {
    const ctx = newCtx();
    dismiss({ ...ctx, sender: ann, timestamp: at(T0) }, { characterId: 1n });
    expect(rows(ctx, 'combat_result').map((r) => r.id)).toEqual([2n]);
    expect(rows(ctx, 'combat_loot').map((l) => l.id)).toEqual([2n, 3n]);
  });

  it('Bram dismissing afterwards clears his own rows', () => {
    const ctx = newCtx();
    dismiss({ ...ctx, sender: ann, timestamp: at(T0) }, { characterId: 1n });
    dismiss({ ...ctx, sender: bram, timestamp: at(T0) }, { characterId: 2n });
    expect(rows(ctx, 'combat_result')).toHaveLength(0);
    expect(rows(ctx, 'combat_loot')).toHaveLength(0);
  });

  it('in a group the caller\'s dismiss still keeps the others\' loot (unchanged)', () => {
    const ctx = newCtx({ ann: 5n, bram: 5n });
    dismiss({ ...ctx, sender: ann, timestamp: at(T0) }, { characterId: 1n });
    expect(rows(ctx, 'combat_result').map((r) => r.id)).toEqual([2n]);
    expect(rows(ctx, 'combat_loot').map((l) => l.id)).toEqual([2n, 3n]);
  });
});
