import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Pins the generated client bindings for the Phase 51.3.1.1 density pools (Plan 18, D-05,
// T-51.3.1.1-57): only pool_level, named_enemy and the my_harvest_caps view reach the client. The
// private pool tables have no table handle or table file. The generator still writes their row
// types into types.ts (as it does for region_economy), so this test checks handles and files, not
// type exports. Reads generated source text only.

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/');
const BINDINGS = `${ROOT}src/module_bindings`;

const PRIVATE_POOL_TABLES = [
  'place_pool',
  'creature_family',
  'family_member',
  'family_relation',
  'pool_harvest',
  'pool_state',
  'pool_region',
  'pool_rumor',
  'pool_tick',
];

// A hidden number or private state would show up as one of these words in a field name.
const HIDDEN_FIELD = /count|home|wiped|settled|dirty|harvest/i;

function read(name: string): string {
  return readFileSync(`${BINDINGS}/${name}`, 'utf8');
}

/** The field names of one generated object type in types.ts. */
function fieldsOf(typeName: string): string[] {
  const types = read('types.ts');
  const start = types.indexOf(`export const ${typeName} = __t.object("${typeName}", {`);
  expect(start, typeName).toBeGreaterThanOrEqual(0);
  const end = types.indexOf('});', start);
  const block = types.slice(start, end);
  const fields: string[] = [];
  for (const line of block.split('\n').slice(1)) {
    const match = /^\s+([A-Za-z0-9_]+):/.exec(line);
    if (match) fields.push(match[1]);
  }
  return fields;
}

describe('generated pool bindings', () => {
  it('binds no private pool table to the client', () => {
    const tableFiles = readdirSync(BINDINGS).filter((file) => file.endsWith('_table.ts'));
    for (const name of PRIVATE_POOL_TABLES) {
      expect(tableFiles, name).not.toContain(`${name}_table.ts`);
    }
    const index = read('index.ts');
    for (const name of PRIVATE_POOL_TABLES) {
      expect(index, name).not.toContain(`name: '${name}'`);
      expect(index, name).not.toContain(`name: "${name}"`);
      expect(index, name).not.toContain(`readonly "${name}"`);
    }
  });

  it('binds pool_level, named_enemy and my_harvest_caps', () => {
    for (const file of ['pool_level_table.ts', 'named_enemy_table.ts', 'my_harvest_caps_table.ts']) {
      expect(existsSync(`${BINDINGS}/${file}`), file).toBe(true);
    }
    const index = read('index.ts');
    expect(index).toContain(`name: 'pool_level'`);
    expect(index).toContain(`name: 'my_harvest_caps'`);
  });

  it('PoolLevel carries no count, home level, wipe, settle, dirty or harvest field', () => {
    const fields = fieldsOf('PoolLevel');
    expect(fields).toContain('level');
    expect(fields).toContain('regionId');
    for (const field of fields) expect(field).not.toMatch(HIDDEN_FIELD);
    const table = read('pool_level_table.ts');
    for (const line of table.split('\n')) {
      const match = /^\s+([A-Za-z0-9_]+): __t\./.exec(line);
      if (match) expect(match[1]).not.toMatch(HIDDEN_FIELD);
    }
  });

  it('the harvest-cap view row says only where and until when (never an amount)', () => {
    expect(fieldsOf('MyHarvestCap').sort()).toEqual(['cappedUntilMicros', 'id', 'locationId']);
  });

  it('binds the pool reducers with object arguments', () => {
    for (const file of [
      'pull_family_reducer.ts',
      'gather_pool_reducer.ts',
      'pull_named_enemy_reducer.ts',
      'start_combat_reducer.ts',
    ]) {
      expect(existsSync(`${BINDINGS}/${file}`), file).toBe(true);
    }
    expect(read('pull_family_reducer.ts')).toContain('poolId: __t.u64()');
    expect(read('gather_pool_reducer.ts')).toContain('poolId: __t.u64()');
    expect(read('pull_named_enemy_reducer.ts')).toContain('namedEnemyId: __t.u64()');
    expect(read('start_combat_reducer.ts')).toContain('enemySpawnId: __t.u64()');
  });
});
