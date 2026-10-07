import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Source guards for the Map folder (51-02). Every production .ts and .vue file under src/map/ is
// scanned, so files added by later plans are covered without editing this list.
const MAP_DIR = resolve(process.cwd(), 'src/map');

function productionFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...productionFiles(path));
    else if (/\.(ts|vue)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) out.push(path);
  }
  return out;
}

const FILES = productionFiles(MAP_DIR);
const BANNED_WORD = ['rip', 'ple'].join('');

describe('src/map source guards', () => {
  it('finds the map helpers', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(4);
  });

  for (const file of FILES) {
    const name = file.slice(MAP_DIR.length + 1).split('\\').join('/');
    const source = readFileSync(file, 'utf8');

    it(`${name} never reads the cross-region cooldown length of the server`, () => {
      // The stamina helpers of travel_config stay importable; only the cooldown length is banned.
      expect(source).not.toMatch(/COOLDOWN_MICROS/);
    });

    it(`${name} takes time from the server clock, not Date.now`, () => {
      expect(source).not.toMatch(/Date\.now/);
    });

    it(`${name} avoids replaceAll, .at( and Object.hasOwn`, () => {
      expect(source).not.toContain('replaceAll');
      expect(source).not.toMatch(/\.at\(/);
      expect(source).not.toContain('Object.hasOwn');
    });

    it(`${name} avoids the banned World-events word`, () => {
      expect(source.toLowerCase()).not.toContain(BANNED_WORD);
    });
  }
});
