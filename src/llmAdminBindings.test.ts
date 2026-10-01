import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Pins the generated client bindings for the Phase 43 admin controls (Plan 43-15): the
// kill-switch and ceiling reducers, the new admin_llm_status fields, and the rule that no
// private llm_ table is ever bound to the client. Reads generated source text only.

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/');
const BINDINGS = `${ROOT}src/module_bindings`;

function read(name: string): string {
  return readFileSync(`${BINDINGS}/${name}`, 'utf8');
}

describe('generated admin LLM bindings', () => {
  it('binds the llm_set_enabled and llm_set_daily_ceiling reducers', () => {
    expect(existsSync(`${BINDINGS}/llm_set_enabled_reducer.ts`)).toBe(true);
    expect(existsSync(`${BINDINGS}/llm_set_daily_ceiling_reducer.ts`)).toBe(true);
    // The generator registers reducers by snake_case name with a PascalCase import, and exposes
    // the camelCase client call (conn.reducers.llmSetEnabled) from the registered schema.
    const index = read('index.ts');
    expect(index).toContain('__reducerSchema("llm_set_enabled", LlmSetEnabledReducer)');
    expect(index).toContain('__reducerSchema("llm_set_daily_ceiling", LlmSetDailyCeilingReducer)');
    const params = read('types/reducers.ts');
    expect(params).toContain('export type LlmSetEnabledParams');
    expect(params).toContain('export type LlmSetDailyCeilingParams');
  });

  it('admin_llm_status carries the new budget and kill-switch fields', () => {
    const view = read('admin_llm_status_table.ts');
    expect(view).toContain('dailyCeilingMicroUsd');
    expect(view).toContain('llmEnabled');
    expect(view).toContain('spendDayUtc');
    expect(view).toContain('daySpentMicroUsd');
  });

  it('admin_llm_status no longer declares the retired phase-cap field', () => {
    const view = read('admin_llm_status_table.ts');
    expect(view).not.toContain('phaseCapMicroUsd');
    expect(view).not.toContain('phase_cap_micro_usd');
  });

  it('binds no private llm_ table: only the admin status view and the player job view', () => {
    const llmTableFiles = readdirSync(BINDINGS)
      .filter((file) => /llm/.test(file) && file.endsWith('_table.ts'))
      .sort();
    expect(llmTableFiles).toEqual(['admin_llm_status_table.ts', 'my_llm_jobs_table.ts']);
  });
});
