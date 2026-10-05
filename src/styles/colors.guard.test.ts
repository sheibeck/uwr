import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  colorOffenders,
  listClientFiles,
  sfcStyleBlocks,
  sfcTemplateAndScript,
  textColorOffenders,
} from './cssContract';

// FND-02: no literal colors in client source. Tokens live in nocturne.css (vendored) and
// tokens.client.css; everything else references var(--...). Static scan, no DOM needed.

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replaceAll('\\', '/');
const SRC = `${ROOT}src`;
const rel = (path: string): string => path.replace(ROOT, '');

describe('colorOffenders fixtures', () => {
  it.each([
    'color: #fff',
    'background: rgb(0 0 0)',
    'border-color: red',
    'color: oklch(0.6 0.1 20)',
    'box-shadow: 0 0 0 1px hsl(0 0% 0%)',
    'outline-color: White',
    'background: linear-gradient(#000, var(--color-bg))',
  ])('flags %s', (decl) => {
    expect(colorOffenders(`.x { ${decl}; }`, 'fixture.css')).toHaveLength(1);
  });

  it.each([
    'color: var(--color-bg)',
    'background: transparent',
    'color: currentColor',
    'fill: none',
    'color: inherit',
    'background: color-mix(in srgb, var(--color-surface) 55%, transparent)',
    'border: 1px solid var(--color-divider)',
    'color: var(--x, var(--color-text))',
  ])('passes %s', (decl) => {
    expect(colorOffenders(`.x { ${decl}; }`, 'fixture.css')).toEqual([]);
  });

  it('does not treat selectors as values', () => {
    expect(colorOffenders('#app { color: inherit; }', 'fixture.css')).toEqual([]);
  });
});

describe('textColorOffenders fixtures', () => {
  it('flags hex and functional colors in text', () => {
    expect(textColorOffenders("const c = '#ff6b6b';", 'f.ts')).toHaveLength(1);
    expect(textColorOffenders("const c = 'rgba(0,0,0,.5)';", 'f.ts')).toHaveLength(1);
  });

  it('ignores PR numbers in comments', () => {
    expect(textColorOffenders('// SpacetimeDB (PR #5707) fix\n/* #5707 */', 'f.ts')).toEqual([]);
  });

  it('passes selectors and ordinary calls', () => {
    expect(textColorOffenders("mount('#app'); getColor(x);", 'f.ts')).toEqual([]);
  });
});

describe('client source has no literal colors', () => {
  const files = listClientFiles(SRC);
  const exempt = new Set([`${SRC}/styles/nocturne.css`, `${SRC}/styles/tokens.client.css`]);

  it('scans a non-trivial set of .vue files', () => {
    expect(files.vue.length).toBeGreaterThanOrEqual(9);
  });

  it('finds no literal colors', () => {
    const offenders: string[] = [];
    for (const file of files.css) {
      if (exempt.has(file)) continue;
      offenders.push(...colorOffenders(readFileSync(file, 'utf8'), rel(file)));
    }
    for (const file of files.vue) {
      const source = readFileSync(file, 'utf8');
      for (const block of sfcStyleBlocks(source)) offenders.push(...colorOffenders(block, rel(file)));
      offenders.push(...textColorOffenders(sfcTemplateAndScript(source), rel(file)));
    }
    for (const file of files.ts) {
      if (file === `${SRC}/styles/cssContract.ts`) continue;
      offenders.push(...textColorOffenders(readFileSync(file, 'utf8'), rel(file)));
    }
    const html = readFileSync(`${ROOT}index.html`, 'utf8');
    for (const match of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
      offenders.push(...colorOffenders(match[1], 'index.html'));
    }
    offenders.push(...textColorOffenders(html, 'index.html'));
    expect(offenders).toEqual([]);
  });
});
