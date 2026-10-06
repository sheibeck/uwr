import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Design and compatibility guards for the files of quick 261006-hpp (enemy effect chips and the
// hotbar type line). Source text only; behavior is covered by the component tests.
const FILES = [
  'src/combat/kindLabel.ts',
  'src/combat/hostiles.ts',
  'src/combat/HostileCard.vue',
  'src/combat/EncounterStrip.vue',
  'src/combat/EncounterPanel.vue',
  'src/rails/EffectChips.vue',
  'src/hotbar/hotbar.ts',
  'src/hotbar/HotbarRow.vue',
  'src/game/gameData.ts',
  'src/game/queries.ts',
  'src/game/context.ts',
];

const ALLOWED_SIZES = new Set(['10px', '12px', '14px', '20px']);

describe('quick 261006-hpp source guards', () => {
  for (const file of FILES) {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');

    it(`${file} avoids v-html, inline svg, literal colors and unsupported APIs`, () => {
      expect(source).not.toContain('v-html');
      expect(source).not.toContain('<svg');
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source).not.toMatch(/\brgba?\(/);
      expect(source).not.toContain('replaceAll');
      expect(source).not.toContain('Object.hasOwn');
      expect(source).not.toMatch(/\.at\(/);
      expect(source.toLowerCase()).not.toContain('ripple');
    });

    it(`${file} uses only the type sizes 10, 12, 14 and 20 and weights 400 and 500`, () => {
      for (const match of source.matchAll(/font-size:\s*([0-9.]+px)/g)) {
        expect(ALLOWED_SIZES.has(match[1]), `${file} ${match[1]}`).toBe(true);
      }
      for (const match of source.matchAll(/font-weight:\s*(\d+)/g)) {
        expect(['400', '500']).toContain(match[1]);
      }
    });
  }

  it('the mechanical vocabulary label map stays import-free', () => {
    const source = readFileSync(resolve(process.cwd(), 'spacetimedb/src/data/mechanical_vocabulary.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).toContain('ABILITY_KIND_LABELS');
  });
});
