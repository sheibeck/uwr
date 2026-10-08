import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedViews, recordedTable } from '../helpers/schema_recorder';
import { createMockDb } from '../helpers/test-utils';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../index');
}, 120_000);

// Phase 51.3.1.1 (SC1, SC5, D-05, T-51.3.1.1-07/08): the density pool tables. The hidden count, home
// level, wipe and settle times live only in the private place_pool table; pool_level is the one
// public table and carries only the level 0-3, the level range and the display strings.

const POOL_COLUMNS: Record<string, string[]> = {
  creature_family: [
    'id',
    'regionId',
    'key',
    'name',
    'singularNoun',
    'pluralNoun',
    'temperament',
    'iconKey',
    'creatureType',
    'ambushVerb',
    'ambushRest',
    'fitTerrains',
  ],
  family_member: ['id', 'familyId', 'enemyTemplateId', 'role', 'filler'],
  family_relation: ['id', 'familyId', 'otherFamilyId', 'kind'],
  place_pool: [
    'id',
    'regionId',
    'locationId',
    'kind',
    'refId',
    'count',
    'homeLevel',
    'wipedAtMicros',
    'lastSettledMicros',
    'dirty',
    'timeOfDay',
  ],
  pool_level: [
    'id',
    'regionId',
    'locationId',
    'kind',
    'refId',
    'level',
    'lvLo',
    'lvHi',
    'name',
    'iconKey',
    'temperament',
    'singularNoun',
    'pluralNoun',
    'timeOfDay',
  ],
  pool_harvest: ['id', 'characterId', 'locationId', 'windowStartMicros', 'gathers', 'cappedUntilMicros'],
  pool_state: ['id', 'version', 'lastHunterMicros', 'lastTrendMicros'],
  pool_region: ['regionId', 'trendSum'],
  pool_rumor: ['id', 'regionId', 'locationId', 'kind', 'familyId', 'otherFamilyId', 'atMicros'],
  pool_tick: ['scheduledId', 'scheduledAt', 'afterRegionId'],
};
const NAMES = Object.keys(POOL_COLUMNS);
const PRIVATE_NAMES = NAMES.filter((n) => n !== 'pool_level');

const indexesOf = (name: string) => (recordedTable(name)!.opts.indexes ?? []) as any[];
const indexOf = (name: string, accessor: string) => indexesOf(name).find((i) => i.accessor === accessor);

describe('pool tables: privacy by construction (D-05)', () => {
  it('records all ten tables', () => {
    for (const name of NAMES) expect(recordedTable(name), name).toBeDefined();
  });

  it('pool_level is the only public one', () => {
    expect(recordedTable('pool_level')!.opts.public).toBe(true);
    for (const name of PRIVATE_NAMES) expect(recordedTable(name)!.opts.public, name).toBeFalsy();
  });

  it('pool_level has no count, home, wiped, settled, dirty, harvest or cap column', () => {
    const cols = Object.keys(recordedTable('pool_level')!.cols);
    for (const col of cols) expect(col, col).not.toMatch(/count|home|wiped|settled|dirty|harvest|cap/i);
  });

  it('registers all ten in schema({...}) by snake_case key', async () => {
    const mod: any = await import('./tables');
    expect(Object.keys(mod.default.__defs)).toEqual(expect.arrayContaining(NAMES));
  });

  it('pool_tick is scheduled by tick_pools', () => {
    const opts = recordedTable('pool_tick')!.opts;
    expect(typeof opts.scheduled).toBe('function');
  });
});

describe('pool table columns', () => {
  it('has exactly the planned columns, in order', () => {
    for (const [name, cols] of Object.entries(POOL_COLUMNS)) {
      expect(Object.keys(recordedTable(name)!.cols), name).toEqual(cols);
    }
  });

  it('keys: creature_family.key unique, pool_region.regionId and pool_state.id primary, pool_level.id without autoInc', () => {
    expect(recordedTable('creature_family')!.cols.key).toMatchObject({ kind: 'string', unique: true });
    expect(recordedTable('creature_family')!.cols.id).toMatchObject({ primaryKey: true, autoInc: true });
    expect(recordedTable('pool_region')!.cols.regionId).toMatchObject({ kind: 'u64', primaryKey: true, autoInc: false });
    expect(recordedTable('pool_state')!.cols.id).toMatchObject({ kind: 'u64', primaryKey: true, autoInc: false });
    expect(recordedTable('pool_level')!.cols.id).toMatchObject({ kind: 'u64', primaryKey: true, autoInc: false });
    expect(recordedTable('pool_tick')!.cols.scheduledId).toMatchObject({ primaryKey: true, autoInc: true });
    expect(recordedTable('pool_tick')!.cols.scheduledAt.kind).toBe('scheduleAt');
    for (const name of ['family_member', 'family_relation', 'place_pool', 'pool_harvest', 'pool_rumor']) {
      expect(recordedTable(name)!.cols.id, name).toMatchObject({ primaryKey: true, autoInc: true });
    }
  });

  it('no new column is optional', () => {
    for (const name of NAMES) {
      for (const [col, info] of Object.entries(recordedTable(name)!.cols)) {
        expect(info.optional, `${name}.${col}`).toBe(false);
      }
    }
  });

  it('flags are bools and the hidden numbers are u64', () => {
    expect(recordedTable('family_member')!.cols.filler.kind).toBe('bool');
    expect(recordedTable('place_pool')!.cols.dirty.kind).toBe('bool');
    for (const col of ['count', 'homeLevel', 'wipedAtMicros', 'lastSettledMicros', 'refId']) {
      expect(recordedTable('place_pool')!.cols[col].kind, col).toBe('u64');
    }
    for (const col of ['level', 'lvLo', 'lvHi']) expect(recordedTable('pool_level')!.cols[col].kind, col).toBe('u64');
  });
});

describe('pool table indexes', () => {
  const EXPECTED: Array<[string, string, string]> = [
    ['creature_family', 'by_region', 'regionId'],
    ['family_member', 'by_family', 'familyId'],
    ['family_member', 'by_template', 'enemyTemplateId'],
    ['family_relation', 'by_family', 'familyId'],
    ['place_pool', 'by_location', 'locationId'],
    ['place_pool', 'by_region', 'regionId'],
    ['place_pool', 'by_dirty', 'dirty'],
    ['pool_level', 'by_location', 'locationId'],
    ['pool_level', 'by_region', 'regionId'],
    ['pool_harvest', 'by_character', 'characterId'],
    ['pool_rumor', 'by_region', 'regionId'],
  ];
  for (const [table, accessor, column] of EXPECTED) {
    it(`${table}.${accessor} is a btree on ${column}`, () => {
      expect(indexOf(table, accessor)).toMatchObject({ algorithm: 'btree', columns: [column] });
    });
  }

  it('creature_family.key has no extra btree index (unique already gives .find())', () => {
    expect(indexesOf('creature_family').some((i) => (i.columns ?? []).includes('key'))).toBe(false);
  });
});

// Every new column on an existing (populated) table must carry a default, or publish asks for a
// clear (Pitfall 1). None may be a bare optional.
const NEW_COLUMNS: Record<string, Record<string, string>> = {
  location: { shortName: 'string', placeNoun: 'string', isHub: 'bool' },
  resource_gather: { poolId: 'u64' },
  combat_enemy: { poolId: 'u64', healTargetEnemyId: 'u64' },
  combat_enemy_cast: { targetEnemyId: 'u64' },
  combat_encounter: {
    origin: 'string',
    originFamilyId: 'u64',
    originLevel: 'u64',
    originName: 'string',
    originPlural: 'string',
  },
  economy_item: { familyId: 'u64' },
};

describe('defaulted columns on existing tables (additive only)', () => {
  for (const [table, cols] of Object.entries(NEW_COLUMNS)) {
    it(`${table}: ${Object.keys(cols).join(', ')} are defaulted, required and appended last`, () => {
      const rec = recordedTable(table)!;
      for (const [col, kind] of Object.entries(cols)) {
        expect(rec.cols[col], `${table}.${col}`).toMatchObject({ kind, defaulted: true, optional: false });
      }
      const all = Object.keys(rec.cols);
      expect(all.slice(all.length - Object.keys(cols).length)).toEqual(Object.keys(cols));
    });
  }

  it('location keeps its earlier columns in place', () => {
    expect(Object.keys(recordedTable('location')!.cols)).toEqual([
      'id',
      'name',
      'description',
      'zone',
      'regionId',
      'levelOffset',
      'isSafe',
      'terrainType',
      'bindStone',
      'craftingAvailable',
      'shortName',
      'placeNoun',
      'isHub',
    ]);
  });
});

// The per-sender harvest-cap view (D-27, T-51.3.1.1-08).
const ident = (hex: string) => ({ toHexString: () => hex });
const alice = ident('alice');

/** A strict mock db where any table scan throws: the view may use index lookups only. */
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

function harvestView() {
  const view = capturedViews().find((v) => v.opts?.name === 'my_harvest_caps');
  if (!view) throw new Error('my_harvest_caps view not captured');
  return view;
}

const HARVEST_ROWS = [
  { id: 1n, characterId: 5n, locationId: 10n, windowStartMicros: 100n, gathers: 3n, cappedUntilMicros: 900n },
  { id: 2n, characterId: 5n, locationId: 11n, windowStartMicros: 100n, gathers: 1n, cappedUntilMicros: 0n },
  { id: 3n, characterId: 6n, locationId: 10n, windowStartMicros: 100n, gathers: 3n, cappedUntilMicros: 800n },
];

describe('my_harvest_caps view', () => {
  it('is captured as a public view', () => {
    expect(harvestView().opts).toMatchObject({ name: 'my_harvest_caps', public: true });
  });

  it("returns only the active character's capped rows, with id, locationId and cappedUntilMicros only", () => {
    const db = noScanDb({
      player: [{ id: alice, userId: 7n, activeCharacterId: 5n }],
      pool_harvest: HARVEST_ROWS,
    });
    const out = harvestView().fn({ db, sender: alice });
    expect(out).toEqual([{ id: 1n, locationId: 10n, cappedUntilMicros: 900n }]);
  });

  it('returns [] without a player, a userId or an active character', () => {
    const none = noScanDb({ player: [], pool_harvest: HARVEST_ROWS });
    expect(harvestView().fn({ db: none, sender: alice })).toEqual([]);
    const noUser = noScanDb({ player: [{ id: alice, userId: undefined, activeCharacterId: 5n }], pool_harvest: HARVEST_ROWS });
    expect(harvestView().fn({ db: noUser, sender: alice })).toEqual([]);
    const noChar = noScanDb({ player: [{ id: alice, userId: 7n, activeCharacterId: undefined }], pool_harvest: HARVEST_ROWS });
    expect(harvestView().fn({ db: noChar, sender: alice })).toEqual([]);
  });

  it('never reads the timestamp', () => {
    const db = noScanDb({
      player: [{ id: alice, userId: 7n, activeCharacterId: 5n }],
      pool_harvest: HARVEST_ROWS,
    });
    const ctx = new Proxy(
      { db, sender: alice } as any,
      {
        get: (target, prop) => {
          if (prop === 'timestamp') throw new Error('timestamp read');
          return target[prop];
        },
      },
    );
    expect(() => harvestView().fn(ctx)).not.toThrow();
  });
});
