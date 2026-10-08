import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Pins the generated client bindings for the Phase 51.3 regional economy (Plan 51.3-09): the
// three admin economy reducers are bound, the recipe template carries the 4th requirement, and
// no private economy table is ever bound to the client. Reads generated source text only.

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/');
const BINDINGS = `${ROOT}src/module_bindings`;

const PRIVATE_ECONOMY_TABLES = [
  'economy_dials',
  'economy_region_dial',
  'economy_item_dial',
  'region_economy',
  'economy_item',
  'enemy_loot_entry',
  'region_recipe',
];

function read(name: string): string {
  return readFileSync(`${BINDINGS}/${name}`, 'utf8');
}

describe('generated economy bindings', () => {
  it('binds the economy_set_dial, economy_reset, economy_set_ai_enabled and economy_repair_region reducers', () => {
    for (const file of [
      'economy_set_dial_reducer.ts',
      'economy_reset_reducer.ts',
      'economy_set_ai_enabled_reducer.ts',
      'economy_repair_region_reducer.ts',
    ]) {
      expect(existsSync(`${BINDINGS}/${file}`), file).toBe(true);
    }
    const index = read('index.ts');
    expect(index).toContain('__reducerSchema("economy_set_dial", EconomySetDialReducer)');
    expect(index).toContain('__reducerSchema("economy_reset", EconomyResetReducer)');
    expect(index).toContain('__reducerSchema("economy_set_ai_enabled", EconomySetAiEnabledReducer)');
    expect(index).toContain('__reducerSchema("economy_repair_region", EconomyRepairRegionReducer)');
    const params = read('types/reducers.ts');
    expect(params).toContain('export type EconomySetDialParams');
    expect(params).toContain('export type EconomyResetParams');
    expect(params).toContain('export type EconomySetAiEnabledParams');
    expect(params).toContain('export type EconomyRepairRegionParams');
  });

  it('RecipeTemplate carries the 4th requirement fields', () => {
    const types = read('types.ts');
    const start = types.indexOf('export const RecipeTemplate = ');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = types.indexOf('export type RecipeTemplate', start);
    const block = types.slice(start, end);
    expect(block).toContain('req4TemplateId');
    expect(block).toContain('req4Count');
    const table = read('recipe_template_table.ts');
    expect(table).toContain('req4TemplateId');
    expect(table).toContain('req4Count');
  });

  it('binds no private economy table to the client', () => {
    const tableFiles = readdirSync(BINDINGS).filter((file) => file.endsWith('_table.ts'));
    for (const name of PRIVATE_ECONOMY_TABLES) {
      expect(tableFiles, name).not.toContain(`${name}_table.ts`);
    }
    // The registered table list in index.ts must not name them either.
    const index = read('index.ts');
    for (const name of PRIVATE_ECONOMY_TABLES) {
      expect(index, name).not.toContain(`name: '${name}'`);
      expect(index, name).not.toContain(`name: "${name}"`);
    }
  });
});
