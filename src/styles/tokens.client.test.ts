import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CRAFT_QUALITIES, QUALITY_TIERS } from '@game-data/mechanical_vocabulary';
import {
  definedCustomProperties,
  listClientFiles,
  parseDecls,
  sfcStyleBlocks,
  sfcTemplateAndScript,
  usedCustomProperties,
} from './cssContract';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).split('\\').join('/');
const SRC = `${ROOT}src`;
const read = (path: string): string => readFileSync(path, 'utf8');

// Values are the hues CONTEXT says survive the deletion, plus the resource-bar colors.
const EXPECTED_TOKENS: Array<[string, string]> = [
  ['--color-rarity-common', '#ffffff'],
  ['--color-rarity-uncommon', '#22c55e'],
  ['--color-rarity-rare', '#3b82f6'],
  ['--color-rarity-epic', '#aa44ff'],
  ['--color-rarity-legendary', '#ff8800'],
  ['--color-con-red', '#ff6b6b'],
  ['--color-con-orange', '#f08c00'],
  ['--color-con-yellow', '#ffd43b'],
  ['--color-con-white', '#e9ecef'],
  ['--color-con-blue', '#4dabf7'],
  ['--color-con-light-green', '#69db7c'],
  ['--color-con-gray', '#868e96'],
  ['--color-craft-dented', '#888888'],
  ['--color-craft-standard', '#cccccc'],
  ['--color-craft-reinforced', '#66cc99'],
  ['--color-craft-exquisite', '#99ccff'],
  ['--color-craft-mastercraft', '#ff9900'],
  ['--color-health', 'oklch(0.62 0.16 24)'],
  ['--color-mana', 'oklch(0.62 0.12 258)'],
  ['--color-stamina', 'oklch(0.74 0.12 70)'],
];

describe('tokens.client.css', () => {
  const tokenFile = `${SRC}/styles/tokens.client.css`;
  const decls = parseDecls(read(tokenFile), tokenFile);

  it('declares exactly the 20 pinned tokens in order', () => {
    expect(decls.map((d) => [d.prop, d.value])).toEqual(EXPECTED_TOKENS);
  });

  it('declares every token on :root', () => {
    expect(decls.every((d) => d.selector === ':root')).toBe(true);
  });

  it('has a rarity token for every server quality tier', () => {
    const names = new Set(decls.map((d) => d.prop));
    const missing = QUALITY_TIERS.filter((tier) => !names.has(`--color-rarity-${tier}`));
    expect(missing).toEqual([]);
  });

  it('has a craft token for every server craft quality', () => {
    const names = new Set(decls.map((d) => d.prop));
    const missing = CRAFT_QUALITIES.filter((quality) => !names.has(`--color-craft-${quality}`));
    expect(missing).toEqual([]);
  });
});

describe('var() definitions', () => {
  it('every var(--name) in client styles is defined by Nocturne or the client tokens', () => {
    const defined = new Set([
      ...definedCustomProperties(read(`${SRC}/styles/nocturne.css`)),
      ...definedCustomProperties(read(`${SRC}/styles/tokens.client.css`)),
    ]);
    const files = listClientFiles(SRC);
    const texts: Array<[string, string]> = [[`${SRC}/styles/frame.css`, read(`${SRC}/styles/frame.css`)]];
    for (const file of files.vue) {
      const source = read(file);
      texts.push([file, sfcStyleBlocks(source).join('\n') + '\n' + sfcTemplateAndScript(source)]);
    }
    for (const file of files.ts) {
      if (file === `${SRC}/styles/cssContract.ts`) continue;
      texts.push([file, read(file)]);
    }
    const missing: string[] = [];
    for (const [file, text] of texts) {
      for (const name of usedCustomProperties(text)) {
        if (!defined.has(name)) missing.push(`${file.replace(ROOT, '')}: ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
