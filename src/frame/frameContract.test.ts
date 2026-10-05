import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { listClientFiles, parseDecls, sfcStyleBlocks, type CssDecl } from '../styles/cssContract';
import { DESKTOP_QUERY } from './useBreakpoint';

// Static frame dimensions, breakpoint and motion contract (45-UI-SPEC "Frame Contract").

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).split('\\').join('/');
const SRC = `${ROOT}src`;
const read = (path: string): string => readFileSync(path, 'utf8');
const rel = (path: string): string => path.replace(ROOT, '');

function sfcDecls(name: string): CssDecl[] {
  const file = `${SRC}/frame/${name}`;
  return sfcStyleBlocks(read(file)).flatMap((block) => parseDecls(block, rel(file)));
}

function declValue(decls: CssDecl[], selector: string, prop: string): string | undefined {
  return decls.find((d) => d.selector === selector && d.prop === prop)?.value.trim();
}

function expectDecl(file: string, selector: string, prop: string, value: string): void {
  const actual = declValue(sfcDecls(file), selector, prop);
  expect(actual, `${file}: ${selector} ${prop} (expected ${value}, got ${actual})`).toBe(value);
}

const FRAME_CSS = `${SRC}/styles/frame.css`;
const clientFiles = listClientFiles(SRC);

function atRules(css: string, name: string, file: string): string[] {
  const out: string[] = [];
  postcss.parse(css, { from: file }).walkAtRules(name, (rule) => {
    out.push(rule.params.trim());
  });
  return out;
}

function allStyleSources(): Array<{ file: string; css: string }> {
  const out = [{ file: rel(FRAME_CSS), css: read(FRAME_CSS) }];
  for (const file of clientFiles.vue) {
    for (const css of sfcStyleBlocks(read(file))) out.push({ file: rel(file), css });
  }
  return out;
}

describe('frame dimensions', () => {
  it('VitalsRail is 252px wide', () => expectDecl('VitalsRail.vue', '.vitals-rail', 'width', '252px'));
  it('ContextRail is 288px wide', () => expectDecl('ContextRail.vue', '.context-rail', 'width', '288px'));
  it('HeaderBar is 48px high', () => expectDecl('HeaderBar.vue', '.header-bar', 'height', '48px'));
  it('Drawer covers the center and right columns', () => expectDecl('Drawer.vue', '.drawer', 'inset', '0 0 0 252px'));
  it('the feed line is capped at 760px', () => expectDecl('FeedShell.vue', '.feed-line', 'max-width', '760px'));
  it('TabBar is 64px plus the bottom safe area', () =>
    expectDecl('TabBar.vue', '.tab-bar', 'height', 'calc(64px + env(safe-area-inset-bottom))'));
  it('Sheet has a 20px top radius', () => expectDecl('Sheet.vue', '.sheet', 'border-radius', '20px 20px 0 0'));
  it('NoticeBars are 32px high', () => expectDecl('NoticeBars.vue', '.notice-bar', 'height', '32px'));
  it('AppFrame is 100dvh with overflow hidden', () => {
    expectDecl('AppFrame.vue', '.app-frame', 'height', '100dvh');
    expectDecl('AppFrame.vue', '.app-frame', 'overflow', 'hidden');
  });
  it('the frame body is the positioning context for the drawer', () => {
    expectDecl('AppFrame.vue', '.frame-body', 'position', 'relative');
  });
});

describe('breakpoint', () => {
  it('DESKTOP_QUERY is (min-width: 900px)', () => {
    expect(DESKTOP_QUERY).toBe('(min-width: 900px)');
  });

  it('every width media query is exactly the 900px pair', () => {
    const allowed = new Set(['(min-width: 900px)', '(max-width: 899px)']);
    const offenders: string[] = [];
    for (const { file, css } of allStyleSources()) {
      for (const params of atRules(css, 'media', file)) {
        if (/width/i.test(params) && !allowed.has(params)) offenders.push(`${file}: @media ${params}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the only container query is (max-width: 1099px) in HeaderBar.vue', () => {
    const found: string[] = [];
    for (const { file, css } of allStyleSources()) {
      for (const params of atRules(css, 'container', file)) found.push(`${file}: @container ${params}`);
    }
    expect(found).toEqual(['src/frame/HeaderBar.vue: @container (max-width: 1099px)']);
  });
});

describe('scrolling and motion', () => {
  it('Drawer and Sheet bodies scroll inside themselves', () => {
    for (const [file, selector] of [
      ['Drawer.vue', '.drawer-body'],
      ['Sheet.vue', '.sheet-body'],
    ] as const) {
      expectDecl(file, selector, 'overflow-y', 'auto');
      expectDecl(file, selector, 'min-height', '0');
    }
  });

  it('Drawer, Sheet and frame.css each honor prefers-reduced-motion', () => {
    for (const path of [`${SRC}/frame/Drawer.vue`, `${SRC}/frame/Sheet.vue`, FRAME_CSS]) {
      expect(read(path), rel(path)).toContain('prefers-reduced-motion');
    }
  });
});
