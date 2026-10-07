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
  ['--color-line-npc', 'oklch(0.8 0.09 320)'],
  ['--color-line-whisper', 'oklch(0.8 0.07 235)'],
  ['--color-line-quest', 'oklch(0.84 0.1 90)'],
];

describe('tokens.client.css', () => {
  const tokenFile = `${SRC}/styles/tokens.client.css`;
  const decls = parseDecls(read(tokenFile), tokenFile);

  it('declares exactly the 23 pinned tokens in order', () => {
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

// A custom property a component sets on its own element through an inline style key (for example
// :style="{ '--bag-columns': String(columns) }", Plan 50-39) is defined by that component for that
// component only. The names are pinned, so no file can mint a new "token" this way (WR-07, iteration 3).
const INLINE_ALLOWED: readonly string[] = ['--bag-columns'];

/** The template without HTML comments: a commented-out binding defines nothing. */
function templateWithoutComments(source: string): string {
  return sfcTemplateAndScript(source).split('<!--').map((part, index) => {
    if (index === 0) return part;
    const end = part.indexOf('-->');
    return end === -1 ? '' : part.slice(end + 3);
  }).join('');
}

/** The custom property keys set in this component's own :style (or v-bind:style) bindings. */
function inlineStyleKeys(source: string): Set<string> {
  const keys = new Set<string>();
  for (const binding of templateWithoutComments(source).matchAll(/(?:^|\s)(?::|v-bind:)style="([^"]*)"/g)) {
    for (const key of binding[1].matchAll(/'(--[\w-]+)'\s*:/g)) keys.add(key[1]);
  }
  return keys;
}

interface VarSource {
  file: string;
  /** The text whose var(--name) uses are checked. */
  text: string;
  /** The inline style keys this file sets itself (empty for css and ts). */
  inline: ReadonlySet<string>;
}

/** Every var(--name) that is neither a defined token nor a pinned inline key the same file sets. */
function undefinedVars(sources: readonly VarSource[], defined: ReadonlySet<string>): string[] {
  const missing: string[] = [];
  for (const { file, text, inline } of sources) {
    for (const name of usedCustomProperties(text)) {
      if (defined.has(name)) continue;
      if (inline.has(name) && INLINE_ALLOWED.indexOf(name) !== -1) continue;
      missing.push(`${file.replace(ROOT, '')}: ${name}`);
    }
  }
  return missing;
}

function vueSource(file: string, source: string): VarSource {
  return {
    file,
    text: sfcStyleBlocks(source).join('\n') + '\n' + sfcTemplateAndScript(source),
    inline: inlineStyleKeys(source),
  };
}

describe('var() definitions', () => {
  const defined = new Set([
    ...definedCustomProperties(read(`${SRC}/styles/nocturne.css`)),
    ...definedCustomProperties(read(`${SRC}/styles/tokens.client.css`)),
  ]);
  const files = listClientFiles(SRC);
  const sources: VarSource[] = [
    { file: `${SRC}/styles/frame.css`, text: read(`${SRC}/styles/frame.css`), inline: new Set() },
  ];
  for (const file of files.vue) sources.push(vueSource(file, read(file)));
  for (const file of files.ts) {
    if (file === `${SRC}/styles/cssContract.ts`) continue;
    sources.push({ file, text: read(file), inline: new Set() });
  }

  it('every var(--name) in client styles is defined by Nocturne, the client tokens or its own pinned inline key', () => {
    expect(undefinedVars(sources, defined)).toEqual([]);
  });

  it('pins the inline custom property keys the client sets', () => {
    const all = new Set<string>();
    for (const source of sources) for (const key of source.inline) all.add(key);
    expect([...all].sort()).toEqual([...INLINE_ALLOWED].sort());
  });

  describe('the inline-key excuse (negative cases)', () => {
    const user = (name: string) =>
      `<template><div class="a" /></template>\n<style scoped>\n.a { width: var(${name}); }\n</style>\n`;
    const setter = (name: string) =>
      `<template><div class="b" :style="{ '${name}': '1' }" /></template>\n<style scoped>\n.b { width: var(${name}); }\n</style>\n`;

    it('a property set only in another file is not defined for this one', () => {
      const missing = undefinedVars(
        [vueSource(`${SRC}/A.vue`, setter('--bag-columns')), vueSource(`${SRC}/B.vue`, user('--bag-columns'))],
        defined,
      );
      expect(missing).toEqual(['src/B.vue: --bag-columns']);
    });

    it('a stray inline key outside the allowlist defines nothing, even in its own file', () => {
      const missing = undefinedVars([vueSource(`${SRC}/A.vue`, setter('--accent-2'))], defined);
      expect(missing).toEqual(['src/A.vue: --accent-2']);
    });

    it('a key in a comment or a plain object literal defines nothing', () => {
      const commented =
        `<template>\n<!-- <div :style="{ '--bag-columns': '1' }" /> -->\n<div class="a" />\n</template>\n` +
        `<script setup lang="ts">\nconst keys = { '--bag-columns': 1 };\n</script>\n` +
        `<style scoped>\n.a { width: var(--bag-columns); }\n</style>\n`;
      expect(inlineStyleKeys(commented).size).toBe(0);
      expect(undefinedVars([vueSource(`${SRC}/A.vue`, commented)], defined)).toEqual(['src/A.vue: --bag-columns']);
    });

    it('accepts the pinned key in the file that sets it', () => {
      expect(undefinedVars([vueSource(`${SRC}/A.vue`, setter('--bag-columns'))], defined)).toEqual([]);
    });
  });
});
