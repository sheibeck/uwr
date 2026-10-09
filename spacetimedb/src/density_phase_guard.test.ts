/**
 * Phase 51.3.1.1 Plan 27: the phase guards (SC6, D-12, D-43, D-51, Pitfall 9).
 *
 * - The careful pull and node gathering are retired: start_pull, start_tracked_combat and
 *   start_gather_resource are no longer registered, while the scheduled drains (resolve_pull,
 *   respawn_enemy, finish_gather) and the pool reducers (tick_pools, pull_family, gather_pool) are.
 * - No population admin surface ships (D-43, D-51): no '/populations' command, no population or
 *   pool dial table, no simulator reducer (advance time, set a family's level, force the hunters,
 *   always ambush).
 * - Every tunable density number is a named constant in data/density_rules.ts (SC6): no other
 *   source file assigns one of the DENSITY_RULES names (reading DENSITY_RULES.X is fine).
 * - The pool modules are deterministic: no Math.random or Date.now.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
// This tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { readdirSync, readFileSync, statSync } from 'node:fs';
// @ts-ignore
import { join, relative, sep } from 'node:path';
// @ts-ignore
import { fileURLToPath } from 'node:url';
import { capturedReducer, recordedTables } from './helpers/schema_recorder';
import { DENSITY_RULES } from './data/density_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('./helpers/schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('./index');
}, 120_000);

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url)); // spacetimedb/src -> repo root
const SCAN_ROOTS = ['spacetimedb/src', 'src'];
const EXCLUDED_DIRS = new Set(['node_modules', 'module_bindings', 'dist', '__snapshots__']);
const EXTENSIONS = ['.ts', '.vue'];

function walk(dir: string, out: string[]): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!EXCLUDED_DIRS.has(name)) walk(full, out);
    } else if (EXTENSIONS.some((ext) => name.endsWith(ext)) && !/\.test\.ts$/.test(name)) {
      out.push(full);
    }
  }
}

/** Every non-test .ts/.vue source file under spacetimedb/src and src (bindings excluded), by repo path. */
function sourceFiles(): Record<string, string> {
  const paths: string[] = [];
  for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), paths);
  const files: Record<string, string> = {};
  for (const full of paths) files[relative(REPO_ROOT, full).split(sep).join('/')] = readFileSync(full, 'utf-8');
  return files;
}

/** `path:line` for every line matching `pattern`. */
function hits(files: Record<string, string>, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const [path, text] of Object.entries(files)) {
    text.split(/\r?\n/).forEach((line, i) => {
      if (pattern.test(line)) out.push(`${path}:${i + 1}`);
    });
  }
  return out;
}

describe('retired reducers are gone; the scheduled drains and pool reducers stay (D-12, Pitfall 9)', () => {
  for (const name of ['start_pull', 'start_tracked_combat', 'start_gather_resource']) {
    it(`${name} is not registered`, () => {
      expect(capturedReducer(name)).toBeUndefined();
    });
  }
  for (const name of ['resolve_pull', 'respawn_enemy', 'finish_gather', 'tick_pools', 'pull_family', 'gather_pool']) {
    it(`${name} is registered`, () => {
      expect(typeof capturedReducer(name)).toBe('function');
    });
  }

  it('no source names the retired spawn and node helpers', () => {
    const files = sourceFiles();
    expect(hits(files, /\b(spawnResourceNode|ensureAvailableSpawn|relevelLegacySpawns)\b/)).toEqual([]);
  });

  it('the client calls none of the retired reducers', () => {
    const files = Object.fromEntries(Object.entries(sourceFiles()).filter(([p]) => p.startsWith('src/')));
    expect(hits(files, /\b(startPull|startTrackedCombat|startGatherResource)\b/)).toEqual([]);
  });
});

describe('no population admin surface ships (D-43, D-51)', () => {
  const SIMULATOR_REDUCERS = ['advance_time', 'set_family_level', 'force_hunters', 'always_ambush'];

  it('no simulator reducer is registered', () => {
    for (const name of SIMULATOR_REDUCERS) expect(capturedReducer(name)).toBeUndefined();
  });

  it('no table is a population or pool dial', () => {
    const names = recordedTables().map((t) => t.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((n) => /population|pool_dial|density_dial/i.test(n))).toEqual([]);
  });

  it("no source defines a '/populations' command, a dial table or a simulator reducer", () => {
    const files = sourceFiles();
    expect(hits(files, /['"`]\/?populations\b/i)).toEqual([]);
    expect(hits(files, /name:\s*['"](population\w*|pool_dial\w*|density_dial\w*)['"]/i)).toEqual([]);
    expect(hits(files, new RegExp(`['"](${SIMULATOR_REDUCERS.join('|')})['"]`))).toEqual([]);
  });
});

describe('every density number lives in data/density_rules.ts (SC6)', () => {
  const NAMES = Object.keys(DENSITY_RULES);

  it('DENSITY_RULES carries the phase constants', () => {
    for (const name of ['HARVEST_CAP_GATHERS', 'ENCOUNTER_BASE_PCT', 'DEPLETION_BY_ROLE', 'YIELD_BY_LEVEL', 'GATHER_YIELD_MULTIPLIER']) {
      expect(NAMES).toContain(name);
    }
  });

  it('no other source file assigns one of its names', () => {
    const files = sourceFiles();
    delete files['spacetimedb/src/data/density_rules.ts'];
    const pattern = new RegExp(`(?<![.\\w])(${NAMES.join('|')})\\s*(?::|=(?!=))`);
    expect(hits(files, pattern)).toEqual([]);
  });

  it('the pattern catches a redefinition but not a read (synthetic)', () => {
    const pattern = new RegExp(`(?<![.\\w])(${NAMES.join('|')})\\s*(?::|=(?!=))`);
    expect(pattern.test('const HARVEST_CAP_GATHERS = 6n;')).toBe(true);
    expect(pattern.test('  ENCOUNTER_BASE_PCT: [0, 1, 2, 3],')).toBe(true);
    expect(pattern.test('const cap = DENSITY_RULES.HARVEST_CAP_GATHERS;')).toBe(false);
    expect(pattern.test('if (x === DENSITY_RULES.YIELD_BY_LEVEL[1]) {}')).toBe(false);
  });
});

describe('the pool modules are deterministic', () => {
  const POOL_MODULES = [
    'data/density_rules.ts',
    'helpers/pools.ts',
    'helpers/encounters.ts',
    'helpers/pool_tick.ts',
    'helpers/pool_migration.ts',
    'helpers/families.ts',
    'helpers/harvest.ts',
  ];
  for (const file of POOL_MODULES) {
    it(`${file} has no Math.random or Date.now`, () => {
      const text = readFileSync(new URL(`./${file}`, import.meta.url), 'utf-8');
      // Calls only: the header comments say "no Math.random" on purpose.
      expect(text).not.toMatch(/Math\.random\s*\(|Date\.now\s*\(/);
    });
  }
});
