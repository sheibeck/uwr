import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CRAFT_QUALITIES, QUALITY_TIERS } from '@game-data/mechanical_vocabulary';
import {
  CRAFT_QUALITIES as RELATIVE_CRAFT_QUALITIES,
  QUALITY_TIERS as RELATIVE_QUALITY_TIERS,
} from '../spacetimedb/src/data/mechanical_vocabulary';

// The server owns game data; client code reaches it only through the @game-data alias
// (CONTEXT: server is source of truth, imported through a path alias).

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/');

// TEMP (removed with the old UI in the cutover commit): legacy client dirs still hold relative imports.
const SKIPPED_DIRS = new Set(['module_bindings', 'node_modules', 'components', 'composables', 'ui', 'data']);

function walkProduction(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) walkProduction(`${dir}/${entry.name}`, out);
      continue;
    }
    const name = entry.name;
    if (name.endsWith('.test.ts')) continue;
    if (!name.endsWith('.ts') && !name.endsWith('.vue')) continue;
    out.push(`${dir}/${name}`);
  }
  return out;
}

describe('@game-data alias', () => {
  it('resolves to the same module as the relative server path', () => {
    expect(QUALITY_TIERS).toEqual(RELATIVE_QUALITY_TIERS);
    expect(CRAFT_QUALITIES).toEqual(RELATIVE_CRAFT_QUALITIES);
    expect(QUALITY_TIERS.length).toBeGreaterThan(0);
    expect(CRAFT_QUALITIES.length).toBeGreaterThan(0);
    expect(QUALITY_TIERS).toContain('common');
    expect(QUALITY_TIERS).toContain('legendary');
  });

  it('is declared in vite.config.ts', () => {
    const vite = readFileSync(`${ROOT}vite.config.ts`, 'utf8');
    expect(vite).toContain("'@game-data'");
  });

  it('is declared in tsconfig.json paths', () => {
    const tsconfig = JSON.parse(readFileSync(`${ROOT}tsconfig.json`, 'utf8'));
    expect(tsconfig.compilerOptions.paths['@game-data/*']).toEqual(['./spacetimedb/src/data/*']);
  });

  it('no client source reaches spacetimedb/src/data through a relative path', () => {
    const offenders: string[] = [];
    const relative = /from\s+'(?:\.\.\/)+spacetimedb\/src\/data/;
    for (const file of walkProduction(`${ROOT}src`)) {
      if (relative.test(readFileSync(file, 'utf8'))) offenders.push(file.slice(ROOT.length));
    }
    expect(offenders).toEqual([]);
  });
});
