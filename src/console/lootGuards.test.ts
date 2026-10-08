import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Design and safety source guards for the feed loot links (quick 261008-f3m). Source text only;
// behaviour is covered by lootLine, lines, FeedLine and FeedView tests. Patterned on
// src/social/socialGuards.test.ts.
const FILES = [
  'src/console/lootLine.ts',
  'src/console/lines.ts',
  'src/console/cleanServerText.ts',
  'src/console/FeedLine.vue',
  'src/console/FeedView.vue',
  'src/console/useConsole.ts',
  'spacetimedb/src/data/loot_line.ts',
];
const BANNED_WORD = ['rip', 'ple'].join('');
const ALLOWED_SIZES = new Set(['10px', '12px', '14px', '20px']);

describe('loot link source guards', () => {
  for (const name of FILES) {
    const source = readFileSync(resolve(process.cwd(), name), 'utf8');

    it(`${name} avoids v-html, inline svg and literal colors`, () => {
      expect(source).not.toContain('v-html');
      expect(source).not.toContain('<svg');
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source).not.toMatch(/\b(?:rgba?|hsla?|oklch|oklab|lch|lab)\(/);
    });

    it(`${name} avoids replaceAll, .at( and Object.hasOwn`, () => {
      expect(source).not.toContain('replaceAll');
      expect(source).not.toMatch(/\.at\(/);
      expect(source).not.toContain('Object.hasOwn');
    });

    it(`${name} avoids the banned World-events word`, () => {
      expect(source.toLowerCase()).not.toContain(BANNED_WORD);
    });

    if (name.endsWith('.vue')) {
      it(`${name} uses only the type sizes 10, 12, 14 and 20 and weights 400 and 500`, () => {
        for (const match of source.matchAll(/font-size:\s*([0-9.]+px)/g)) {
          expect(ALLOWED_SIZES.has(match[1]), `${name} ${match[1]}`).toBe(true);
        }
        for (const match of source.matchAll(/font-weight:\s*(\d+)/g)) {
          expect(['400', '500']).toContain(match[1]);
        }
      });
    }
  }

  it('the loot grammar builds no regex from data', () => {
    const source = readFileSync(resolve(process.cwd(), 'spacetimedb/src/data/loot_line.ts'), 'utf8');
    expect(source).not.toContain('new RegExp');
    expect(source).not.toMatch(/from 'spacetimedb\/server'/);
  });
});
