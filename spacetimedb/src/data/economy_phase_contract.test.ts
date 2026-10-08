import { describe, it, expect, vi, beforeAll } from 'vitest';
// This tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { readdirSync, readFileSync, statSync } from 'node:fs';
// @ts-ignore
import { join, relative, sep } from 'node:path';
// @ts-ignore
import { fileURLToPath } from 'node:url';
import { recordedTable } from '../helpers/schema_recorder';
import { DEFAULT_DIALS } from './economy_rules';
import { REGION_ECONOMY_BIGINT_PATHS } from './economy_design_rules';
import { LLM_ROUTE_NAMES } from './llm_routes';
import { LLM_SWEEP_ROUTES } from './llm_tuning';
import { LLM_SMOKE_ROUTES, LLM_NO_AUTO_RETRY_ROUTES } from './llm_limits';
import { ROUTE_BIGINT_PATHS } from '../helpers/llm_inputs';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

// ============================================================================
// Phase 51.3 SC6: the spend-safety and registration contract
// ============================================================================
//
// The region economy route ships off and cannot be called by tests, sweeps, smokes or proofs. This
// test pins that contract across modules, so a later edit that breaks it fails here. A failure is a
// real contract break: fix the code, never weaken the test.
// ============================================================================

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SRC_ROOT = join(HERE, '..'); // spacetimedb/src
const REPO_ROOT = join(SRC_ROOT, '..', '..');
const ECONOMY_FILE = 'helpers/region_economy.ts';

function walk(dir: string, accept: (path: string) => boolean, out: string[] = []): string[] {
  for (const name of readdirSync(dir) as string[]) {
    if (name === 'node_modules' || name === '__fixtures__') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, accept, out);
    else if (accept(path)) out.push(path);
  }
  return out;
}

const rel = (path: string) => relative(SRC_ROOT, path).split(sep).join('/');

/** Every non-test .ts file under spacetimedb/src. */
const productionFiles = walk(SRC_ROOT, (p) => p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.endsWith('.d.ts'));

describe('Phase 51.3 spend-safety contract (SC6)', () => {
  it('the AI economy switch defaults to off, and the column is a defaulted bool', () => {
    expect(DEFAULT_DIALS.aiEnabled).toBe(false);
    expect(recordedTable('economy_dials')!.cols.aiEnabled).toMatchObject({ kind: 'bool', defaulted: true, optional: false });
  });

  it('region_economy is a registered route and absent from the sweep, smoke and no-auto-retry lists', () => {
    expect(LLM_ROUTE_NAMES as readonly string[]).toContain('region_economy');
    expect(LLM_SWEEP_ROUTES as readonly string[]).not.toContain('region_economy');
    expect(LLM_SMOKE_ROUTES as readonly string[]).not.toContain('region_economy');
    expect(LLM_NO_AUTO_RETRY_ROUTES as readonly string[]).not.toContain('region_economy');
  });

  it('ROUTE_BIGINT_PATHS.region_economy equals REGION_ECONOMY_BIGINT_PATHS', () => {
    expect([...ROUTE_BIGINT_PATHS.region_economy]).toEqual([...REGION_ECONOMY_BIGINT_PATHS]);
  });

  it('the route literal appears in production code only in helpers/region_economy.ts, always with budget phase_only', () => {
    const found: string[] = [];
    for (const file of productionFiles) {
      const lines = (readFileSync(file, 'utf8') as string).split('\n');
      lines.forEach((line, i) => {
        if (!/route:\s*['"]region_economy['"]/.test(line)) return;
        found.push(rel(file));
        const call = lines.slice(i, i + 12).join('\n');
        expect(call, `${rel(file)}:${i + 1} enqueue must carry budget: 'phase_only'`).toMatch(/budget:\s*['"]phase_only['"]/);
      });
    }
    // Names the files the literal was found in (expected: only helpers/region_economy.ts, two enqueues).
    expect([...new Set(found)], `route literal found in: ${found.join(', ')}`).toEqual([ECONOMY_FILE]);
    expect(found.length).toBeGreaterThanOrEqual(2);
  });

  it('every enqueuing function in helpers/region_economy.ts reads aiEnabled before it enqueues', () => {
    const source = readFileSync(join(SRC_ROOT, ECONOMY_FILE), 'utf8') as string;
    for (const fn of ['startRegionEconomy', 'startEnemyLoot']) {
      const start = source.indexOf(`export function ${fn}(`);
      expect(start, `${fn} exists`).toBeGreaterThan(-1);
      const rest = source.slice(start + 1);
      const next = rest.search(/\nexport function |\nfunction /);
      const body = next === -1 ? rest : rest.slice(0, next);
      const gate = body.search(/aiEnabled/);
      const enqueue = body.search(/enqueueLlmJob\(/);
      expect(enqueue, `${fn} enqueues`).toBeGreaterThan(-1);
      expect(gate, `${fn} reads aiEnabled`).toBeGreaterThan(-1);
      expect(gate, `${fn} reads aiEnabled before enqueueLlmJob`).toBeLessThan(enqueue);
    }
    // The only enqueueLlmJob calls in the module are inside those two functions.
    expect((source.match(/enqueueLlmJob\(/g) ?? []).length).toBe(2);
  });

  it('no script under scripts/llm names region_economy in a smoke or sweep list', () => {
    const dir = join(REPO_ROOT, 'scripts', 'llm');
    const scripts = (readdirSync(dir) as string[]).filter((n) => n.endsWith('.mjs'));
    expect(scripts.length).toBeGreaterThan(0);
    for (const name of scripts) {
      const lines = (readFileSync(join(dir, name), 'utf8') as string).split('\n');
      lines.forEach((line, i) => {
        if (!line.includes('region_economy')) return;
        expect(/SMOKE|SWEEP/.test(line), `scripts/llm/${name}:${i + 1} lists region_economy with a smoke or sweep list`).toBe(false);
      });
    }
  });
});
