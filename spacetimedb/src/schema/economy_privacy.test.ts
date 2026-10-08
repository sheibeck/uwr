import { describe, it, expect, vi, beforeAll } from 'vitest';
import { recordedTable } from '../helpers/schema_recorder';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('./tables');
});

// Phase 51.3 (SC5, T-51.3-09/10): the seven economy tables are private, registered, additive, and
// shaped exactly as the economy helpers expect. Clients never read dials, AI loot tables or origins.

const ECONOMY_COLUMNS: Record<string, string[]> = {
  economy_dials: [
    'id',
    'rarityShift',
    'dropRatePct',
    'goldPct',
    'gatherRatePct',
    'bossRarityBonus',
    'tierCommonPct',
    'tierUncommonPct',
    'tierRarePct',
    'tierEpicPct',
    'tierLegendaryPct',
    'aiEnabled',
  ],
  economy_region_dial: ['regionId', 'rarityShift', 'dropRatePct', 'goldPct', 'gatherRatePct', 'bossRarityBonus'],
  economy_item_dial: ['itemTemplateId', 'dropRatePct'],
  region_economy: ['regionId', 'status', 'jobId', 'otherRegionIds', 'createdAt', 'updatedAt'],
  economy_item: [
    'itemTemplateId',
    'regionId',
    'role',
    'slotKey',
    'kind',
    'rarity',
    'terrain',
    'timeOfDay',
    'enemyTemplateId',
    'familyId', // Phase 51.3.1.1 (D-47), defaulted 0n
  ],
  enemy_loot_entry: ['id', 'enemyTemplateId', 'regionId', 'itemTemplateId', 'role', 'weight'],
  region_recipe: ['recipeTemplateId', 'regionId', 'tier', 'learnBy', 'scrollTemplateId', 'foreignRegionIds'],
};
const NAMES = Object.keys(ECONOMY_COLUMNS);

const indexesOf = (name: string) => (recordedTable(name)!.opts.indexes ?? []) as any[];

describe('economy tables are private and registered', () => {
  it('records all seven without a truthy public option', () => {
    for (const name of NAMES) {
      const rec = recordedTable(name);
      expect(rec, name).toBeDefined();
      expect(rec!.opts.public, name).toBeFalsy();
    }
  });

  it('registers all seven in schema({...})', async () => {
    const mod: any = await import('./tables');
    expect(Object.keys(mod.default.__defs)).toEqual(expect.arrayContaining(NAMES));
  });
});

describe('economy table columns', () => {
  it('has exactly the planned columns, in order', () => {
    for (const [name, cols] of Object.entries(ECONOMY_COLUMNS)) {
      expect(Object.keys(recordedTable(name)!.cols), name).toEqual(cols);
    }
  });

  it('economy_dials: every dial is defaulted and required; aiEnabled is a bool', () => {
    const cols = recordedTable('economy_dials')!.cols;
    for (const name of ECONOMY_COLUMNS.economy_dials.slice(1)) {
      expect(cols[name], name).toMatchObject({ defaulted: true, optional: false });
    }
    expect(cols.id).toMatchObject({ kind: 'u64', primaryKey: true });
    expect(cols.aiEnabled).toMatchObject({ kind: 'bool', defaulted: true, optional: false });
    expect(cols.rarityShift.kind).toBe('i64');
  });

  it('economy_region_dial: the five dial columns are optional', () => {
    const cols = recordedTable('economy_region_dial')!.cols;
    expect(cols.regionId).toMatchObject({ kind: 'u64', primaryKey: true, optional: false });
    for (const name of ECONOMY_COLUMNS.economy_region_dial.slice(1)) {
      expect(cols[name], name).toMatchObject({ optional: true });
    }
    expect(cols.rarityShift.kind).toBe('i64');
  });

  it('keys: the primary key columns and the one autoInc id', () => {
    expect(recordedTable('economy_item_dial')!.cols.itemTemplateId).toMatchObject({ primaryKey: true });
    expect(recordedTable('region_economy')!.cols.regionId).toMatchObject({ primaryKey: true });
    expect(recordedTable('economy_item')!.cols.itemTemplateId).toMatchObject({ primaryKey: true });
    expect(recordedTable('region_recipe')!.cols.recipeTemplateId).toMatchObject({ primaryKey: true });
    expect(recordedTable('enemy_loot_entry')!.cols.id).toMatchObject({ primaryKey: true, autoInc: true });
  });
});

describe('economy table indexes', () => {
  it('economy_item has by_region and by_enemy', () => {
    const idx = indexesOf('economy_item');
    expect(idx.find((i) => i.accessor === 'by_region')).toMatchObject({ algorithm: 'btree', columns: ['regionId'] });
    expect(idx.find((i) => i.accessor === 'by_enemy')).toMatchObject({
      algorithm: 'btree',
      columns: ['enemyTemplateId'],
    });
  });

  it('enemy_loot_entry has by_enemy', () => {
    expect(indexesOf('enemy_loot_entry').find((i) => i.accessor === 'by_enemy')).toMatchObject({
      algorithm: 'btree',
      columns: ['enemyTemplateId'],
    });
  });

  it('region_recipe has by_region', () => {
    expect(indexesOf('region_recipe').find((i) => i.accessor === 'by_region')).toMatchObject({
      algorithm: 'btree',
      columns: ['regionId'],
    });
  });
});

describe('no existing table changed (additive only)', () => {
  it('pins item_template columns to today', () => {
    expect(Object.keys(recordedTable('item_template')!.cols)).toEqual([
      'id',
      'name',
      'slot',
      'armorType',
      'rarity',
      'tier',
      'isJunk',
      'vendorValue',
      'requiredLevel',
      'allowedClasses',
      'strBonus',
      'dexBonus',
      'chaBonus',
      'wisBonus',
      'intBonus',
      'hpBonus',
      'manaBonus',
      'armorClassBonus',
      'magicResistanceBonus',
      'weaponBaseDamage',
      'weaponDps',
      'weaponType',
      'stackable',
      'wellFedDurationMicros',
      'wellFedBuffType',
      'wellFedBuffMagnitude',
      'description',
    ]);
  });

  // Plan 06 added the two defaulted 4th-requirement columns last (legendary regional recipes).
  it('pins recipe_template columns to today', () => {
    expect(Object.keys(recordedTable('recipe_template')!.cols)).toEqual([
      'id',
      'key',
      'name',
      'outputTemplateId',
      'outputCount',
      'req1TemplateId',
      'req1Count',
      'req2TemplateId',
      'req2Count',
      'req3TemplateId',
      'req3Count',
      'recipeType',
      'materialType',
      'req4TemplateId',
      'req4Count',
    ]);
  });

  it('recipe_template req4 columns are defaulted, required u64 (publishes without a clear)', () => {
    const cols = recordedTable('recipe_template')!.cols;
    expect(cols.req4TemplateId).toMatchObject({ kind: 'u64', defaulted: true, optional: false });
    expect(cols.req4Count).toMatchObject({ kind: 'u64', defaulted: true, optional: false });
  });

  it('keeps the old loot tables', () => {
    expect(recordedTable('loot_table')).toBeDefined();
    expect(recordedTable('loot_table_entry')).toBeDefined();
  });
});
