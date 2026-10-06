import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { listClientFiles, parseDecls, sfcStyleBlocks, type CssDecl } from './cssContract';

// Owner try-out 2026-10-05: scrollbars match the dark interface. One shared rule in frame.css,
// colors only through var(--...) tokens (scrollbar-color is not in the colors guard's property list,
// so it is checked here).

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).split('\\').join('/');
const SRC = `${ROOT}src`;
const FRAME = `${SRC}/styles/frame.css`;
const read = (path: string): string => readFileSync(path, 'utf8');

const frame = parseDecls(read(FRAME), 'src/styles/frame.css');
const of = (selector: string, prop: string): CssDecl | undefined =>
  frame.find((d) => d.selector === selector && d.prop === prop);

const TOKEN = /^var\(--[\w-]+\)$/;

describe('shared dark scrollbar rule', () => {
  it('sets thin scrollbars on every element with token colors and a transparent track', () => {
    expect(of('*', 'scrollbar-width')?.value).toBe('thin');
    const color = of('*', 'scrollbar-color')?.value ?? '';
    const [thumb, track] = color.split(/\s+(?![^(]*\))/);
    expect(thumb).toMatch(TOKEN);
    expect(track).toBe('transparent');
  });

  it('has webkit rules with a rounded token thumb and a transparent track', () => {
    expect(of('*::-webkit-scrollbar', 'width')?.value).toBe('8px');
    expect(of('*::-webkit-scrollbar', 'height')?.value).toBe('8px');
    expect(of('*::-webkit-scrollbar-track', 'background')?.value).toBe('transparent');
    expect(of('*::-webkit-scrollbar-thumb', 'background')?.value).toMatch(TOKEN);
    expect(of('*::-webkit-scrollbar-thumb', 'border-radius')?.value).toBe('4px');
    expect(of('*::-webkit-scrollbar-thumb:hover', 'background')?.value).toMatch(TOKEN);
  });

  it('uses only var(--...) or transparent for every scrollbar color in frame.css', () => {
    const colored = frame.filter(
      (d) =>
        d.selector?.includes('scrollbar') &&
        (d.prop === 'scrollbar-color' || d.prop === 'background'),
    );
    expect(colored.length).toBeGreaterThan(0);
    for (const decl of colored) {
      const stripped = decl.value.replace(/var\(--[\w-]+\)/g, '').replace(/transparent/g, '').trim();
      expect(stripped, `${decl.selector} { ${decl.prop}: ${decl.value} }`).toBe('');
    }
  });

  it('the thumb token is defined by Nocturne', () => {
    const nocturne = read(`${SRC}/styles/nocturne.css`);
    const token = /var\((--[\w-]+)\)/.exec(of('*', 'scrollbar-color')?.value ?? '')?.[1] ?? '';
    expect(token).not.toBe('');
    expect(nocturne).toContain(`${token}:`);
  });
});

describe('scrollbar overrides in components', () => {
  const decls: CssDecl[] = [];
  for (const file of listClientFiles(SRC).vue) {
    for (const block of sfcStyleBlocks(read(file))) decls.push(...parseDecls(block, file));
  }

  it('no component re-colors a scrollbar with a literal', () => {
    const offenders = decls.filter(
      (d) => d.prop === 'scrollbar-color' && !/^(?:var\(--[\w-]+\)|transparent|\s)+$/.test(d.value),
    );
    expect(offenders).toEqual([]);
  });

  it('the surfaces that hide their bar still do', () => {
    const hidden = decls.filter((d) => d.prop === 'scrollbar-width' && d.value === 'none').map((d) => d.selector);
    expect(hidden).toContain('.chip-row');
    expect(hidden).toContain('.slot-strip');
  });
});
