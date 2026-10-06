import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockDb } from '../helpers/test-utils';
import { capturedViews, createRecordingServerMock } from '../helpers/schema_recorder';
import { registerCombatViews, myCombatAggroRows, MY_COMBAT_AGGRO_KEYS } from './combat';

// vi.mock is hoisted; the recording mock supplies a chainable `t` and captures view registrations.
vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

// Strict mock db: unknown index accessors throw like the real db. Accessors come from the
// recorded schema, so load it before any test touches ctx.db.
beforeAll(async () => {
  await import('../schema/tables');
});

// The mock db compares index values with ===, so the same identity object is used as
// player.id and as ctx.sender.
const ident = (hex: string) => ({ toHexString: () => hex });
const alice = ident('alice');
const bob = ident('bob');
const carol = ident('carol');

/** Wrap a mock DB so touching any table's iter throws: the view must use index lookups only. */
function noScanDb(seed: Record<string, any[]>) {
  const db = createMockDb(seed, { strict: true });
  return new Proxy({} as any, {
    get: (_t, table: string) =>
      new Proxy({} as any, {
        get: (_u, prop: string) => {
          if (prop === 'iter') throw new Error(`table scan attempted on ${table}`);
          return db[table][prop];
        },
      }),
  });
}

function registeredAggroView() {
  const { t, schema } = createRecordingServerMock();
  const spacetimedb = schema({});
  const before = capturedViews().length;
  registerCombatViews({
    spacetimedb,
    t,
    CombatResult: { rowType: {} },
    CombatLoot: { rowType: {} },
  } as any);
  const added = capturedViews().slice(before);
  return { added, view: added.find((v) => v.opts?.name === 'my_combat_aggro') };
}

const player = (id: any, userId: bigint | undefined) => ({ id, userId });
const character = (id: bigint, ownerUserId: bigint) => ({ id, ownerUserId });
const participant = (id: bigint, combatId: bigint, characterId: bigint) => ({
  id,
  combatId,
  characterId,
  status: 'active',
  nextAutoAttackAt: 0n,
});
const aggro = (
  id: bigint,
  combatId: bigint,
  enemyId: bigint,
  characterId: bigint,
  value: bigint,
  petId?: bigint,
) => ({ id, combatId, enemyId, characterId, petId, value });

/** alice (user 7) owns character 1 in combat 10; bob (user 8) owns character 2 in combat 20. */
const seed = () => ({
  player: [player(alice, 7n), player(bob, 8n), player(carol, undefined)],
  character: [character(1n, 7n), character(2n, 8n)],
  combat_participant: [participant(1n, 10n, 1n), participant(2n, 20n, 2n)],
  aggro_entry: [
    aggro(1n, 10n, 100n, 1n, 50n),
    aggro(2n, 10n, 101n, 1n, 20n),
    aggro(3n, 20n, 200n, 2n, 70n),
  ],
});

describe('my_combat_aggro registration', () => {
  it('registers my_combat_aggro as a public view next to the two existing combat views', () => {
    const { added, view } = registeredAggroView();
    expect(added.map((v) => v.opts?.name)).toEqual(['my_combat_results', 'my_combat_loot', 'my_combat_aggro']);
    expect(view?.opts).toEqual({ name: 'my_combat_aggro', public: true });
  });

  it('exposes the five projection keys', () => {
    expect([...MY_COMBAT_AGGRO_KEYS]).toEqual(['id', 'combatId', 'enemyId', 'characterId', 'value']);
  });
});

describe('my_combat_aggro per-sender rows (no table scan)', () => {
  it('returns only the sender own fight rows, each sender seeing a different fight', () => {
    const { view } = registeredAggroView();
    const fn = view!.fn as (ctx: any) => any[];
    const db = noScanDb(seed());
    const aliceRows = fn({ db, sender: alice });
    expect(aliceRows.map((r) => r.id)).toEqual([1n, 2n]);
    expect(aliceRows.every((r) => r.combatId === 10n)).toBe(true);
    const bobRows = fn({ db, sender: bob });
    expect(bobRows.map((r) => r.id)).toEqual([3n]);
    expect(bobRows[0].combatId).toBe(20n);
  });

  it('the direct helper gives the same answer as the registered view', () => {
    const { view } = registeredAggroView();
    const db = noScanDb(seed());
    expect(myCombatAggroRows({ db, sender: alice })).toEqual((view!.fn as any)({ db, sender: alice }));
  });

  it('returns [] for a sender with no player row and for a player with no userId', () => {
    const db = noScanDb(seed());
    expect(myCombatAggroRows({ db, sender: ident('stranger') })).toEqual([]);
    expect(myCombatAggroRows({ db, sender: carol })).toEqual([]);
  });

  it('returns [] for a user whose characters are in no fight', () => {
    const s = seed();
    s.combat_participant = [participant(2n, 20n, 2n)];
    expect(myCombatAggroRows({ db: noScanDb(s), sender: alice })).toEqual([]);
  });

  it('returns the rows of both fights when one user has characters in two fights', () => {
    const s = seed();
    s.character.push(character(3n, 7n));
    s.combat_participant.push(participant(3n, 30n, 3n));
    s.aggro_entry.push(aggro(4n, 30n, 300n, 3n, 9n));
    const rows = myCombatAggroRows({ db: noScanDb(s), sender: alice });
    expect(rows.map((r) => r.id).sort()).toEqual([1n, 2n, 4n]);
    expect(new Set(rows.map((r) => r.combatId))).toEqual(new Set([10n, 30n]));
  });

  it('reads each combat once: a second participant row of the same combat does not duplicate rows', () => {
    const s = seed();
    s.character.push(character(3n, 7n));
    s.combat_participant.push(participant(3n, 10n, 3n));
    const rows = myCombatAggroRows({ db: noScanDb(s), sender: alice });
    expect(rows.map((r) => r.id)).toEqual([1n, 2n]);
  });

  it('drops pet aggro rows but keeps a value of 0', () => {
    const s = seed();
    s.aggro_entry.push(aggro(4n, 10n, 100n, 1n, 40n, 5n));
    s.aggro_entry.push(aggro(5n, 10n, 102n, 1n, 0n));
    const rows = myCombatAggroRows({ db: noScanDb(s), sender: alice });
    expect(rows.map((r) => r.id)).toEqual([1n, 2n, 5n]);
    expect(rows.find((r) => r.id === 5n)?.value).toBe(0n);
  });

  it('projects exactly the declared keys (no petId)', () => {
    const rows = myCombatAggroRows({ db: noScanDb(seed()), sender: alice });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([...MY_COMBAT_AGGRO_KEYS].sort());
    }
  });
});
