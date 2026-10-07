import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import {
  listClientFiles,
  parseDecls,
  sfcStyleBlocks,
  sfcTemplateAndScript,
  type CssDecl,
} from './cssContract';

// UI-SPEC design contract, enforced statically (happy-dom cannot compute Nocturne's cascade,
// so these read CSS through postcss and SFCs through vue/compiler-sfc).
// "Client CSS" = frame.css plus every .vue style block. nocturne.css and tokens.client.css are
// excluded from the scale rules.

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).split('\\').join('/');
const SRC = `${ROOT}src`;
const read = (path: string): string => readFileSync(path, 'utf8');
const rel = (path: string): string => path.replace(ROOT, '');

const files = listClientFiles(SRC);
const NOCTURNE = `${SRC}/styles/nocturne.css`;
const FRAME = `${SRC}/styles/frame.css`;

function clientCssDecls(): CssDecl[] {
  const decls = parseDecls(read(FRAME), rel(FRAME));
  for (const file of files.vue) {
    for (const block of sfcStyleBlocks(read(file))) decls.push(...parseDecls(block, rel(file)));
  }
  return decls;
}

// Non-test source text (templates and scripts for .vue, whole file for .ts), without the scanner itself.
function clientSourceTexts(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const file of files.vue) out.push([rel(file), sfcTemplateAndScript(read(file))]);
  for (const file of files.ts) {
    if (file === `${SRC}/styles/cssContract.ts`) continue;
    out.push([rel(file), read(file)]);
  }
  return out;
}

const report = (decl: CssDecl): string => `${decl.file}: ${decl.selector ?? ''} { ${decl.prop}: ${decl.value} }`;

// ---------------------------------------------------------------------------
// scale checks (helpers take decls so fixtures use the same code as the real scan)
// ---------------------------------------------------------------------------

const FONT_SIZES = new Set(['10px', '12px', '14px', '20px', 'inherit']);
const FONT_WEIGHTS = new Set(['400', '500', 'inherit']);
const SPACING_PX = new Set([0, 4, 8, 16, 24, 32, 48, 64]);
const SPACING_PROP = /^(?:padding|margin)(?:-[a-z-]+)?$|^(?:gap|row-gap|column-gap)$/;
const FONT_FAMILIES = new Set(['var(--font-body)', 'var(--font-heading)', 'inherit']);

const isVar = (value: string): boolean => value.trim().startsWith('var(');

function fontSizeOffenders(decls: CssDecl[]): string[] {
  return decls
    .filter((d) => d.prop === 'font-size' && !FONT_SIZES.has(d.value.trim()) && !isVar(d.value))
    .map(report);
}

function fontWeightOffenders(decls: CssDecl[]): string[] {
  return decls
    .filter((d) => d.prop === 'font-weight' && !FONT_WEIGHTS.has(d.value.trim()) && !isVar(d.value))
    .map(report);
}

function fontFamilyOffenders(decls: CssDecl[]): string[] {
  return decls
    .filter((d) => d.prop === 'font-family' && !FONT_FAMILIES.has(d.value.trim()))
    .map(report);
}

// Drops calc()/min()/max()/clamp()/env()/var() groups, innermost first.
function stripFunctionGroups(value: string): string {
  let current = value;
  for (;;) {
    const next = current.replace(/[a-z-]*\([^()]*\)/gi, ' ');
    if (next === current) return current;
    current = next;
  }
}

function spacingOffenders(decls: CssDecl[]): string[] {
  const bad: string[] = [];
  for (const d of decls) {
    if (!SPACING_PROP.test(d.prop)) continue;
    const tokens = stripFunctionGroups(d.value).split(/[\s,/]+/).filter(Boolean);
    for (const token of tokens) {
      const match = /^(-?\d*\.?\d+)px$/.exec(token);
      if (match && !SPACING_PX.has(Number(match[1]))) {
        bad.push(`${report(d)} (${token})`);
        break;
      }
    }
  }
  return bad;
}

const css = (selector: string, body: string, file = 'fixture.css'): CssDecl[] =>
  parseDecls(`${selector} { ${body} }`, file);

// ---------------------------------------------------------------------------
// type scale, weights, spacing, font
// ---------------------------------------------------------------------------

describe('type scale', () => {
  it('flags an off-scale size and accepts the scale', () => {
    expect(fontSizeOffenders(css('.x', 'font-size: 13px'))).toHaveLength(1);
    expect(fontSizeOffenders(css('.x', 'font-size: 10px'))).toEqual([]);
    expect(fontSizeOffenders(css('.x', 'font-size: var(--size)'))).toEqual([]);
  });

  it('client CSS uses only 10, 12, 14 and 20px', () => {
    expect(fontSizeOffenders(clientCssDecls())).toEqual([]);
  });
});

describe('font weights', () => {
  it('flags 600 and accepts 400, 500 and the heading token', () => {
    expect(fontWeightOffenders(css('.x', 'font-weight: 600'))).toHaveLength(1);
    expect(fontWeightOffenders(css('.x', 'font-weight: 500'))).toEqual([]);
    expect(fontWeightOffenders(css('.x', 'font-weight: var(--font-heading-weight)'))).toEqual([]);
  });

  it('client CSS uses only 400 and 500', () => {
    expect(fontWeightOffenders(clientCssDecls())).toEqual([]);
  });
});

describe('spacing scale', () => {
  it('flags off-scale padding and gap and accepts the scale', () => {
    expect(spacingOffenders(css('.x', 'padding: 6px'))).toHaveLength(1);
    expect(spacingOffenders(css('.x', 'margin: 0 auto 4px 12px'))).toHaveLength(1);
    expect(spacingOffenders(css('.x', 'gap: 10px'))).toHaveLength(1);
    expect(spacingOffenders(css('.x', 'padding: 8px 16px 0 24px'))).toEqual([]);
    expect(spacingOffenders(css('.x', 'padding: calc(100% - 7px) var(--space-1)'))).toEqual([]);
    expect(spacingOffenders(css('.x', 'padding: env(safe-area-inset-top, 3px)'))).toEqual([]);
  });

  it('client CSS padding, margin and gap use only 0/4/8/16/24/32/48/64px', () => {
    expect(spacingOffenders(clientCssDecls())).toEqual([]);
  });
});

describe('font family', () => {
  it('flags a literal family', () => {
    expect(fontFamilyOffenders(css('.x', 'font-family: Arial, sans-serif'))).toHaveLength(1);
    expect(fontFamilyOffenders(css('.x', 'font-family: var(--font-body)'))).toEqual([]);
  });

  it('client CSS uses only the Nocturne font tokens', () => {
    expect(fontFamilyOffenders(clientCssDecls())).toEqual([]);
  });

  it('Nocturne defines both font tokens with Inter', () => {
    const decls = parseDecls(read(NOCTURNE), rel(NOCTURNE));
    for (const name of ['--font-body', '--font-heading']) {
      const decl = decls.find((d) => d.prop === name);
      expect(decl?.value, name).toContain('"Inter"');
    }
  });
});

// ---------------------------------------------------------------------------
// Nocturne overrides resolve to the declared scale
// ---------------------------------------------------------------------------

describe('cascade after client overrides', () => {
  const ordered: Array<{ selectors: string[]; props: Map<string, string> }> = [];
  for (const file of [NOCTURNE, FRAME]) {
    postcss.parse(read(file)).walkRules((rule) => {
      const props = new Map<string, string>();
      rule.each((node) => {
        if (node.type === 'decl') props.set(node.prop, node.value);
      });
      ordered.push({ selectors: rule.selector.split(',').map((s) => s.trim()), props });
    });
  }

  const resolved = (selector: string, prop: string): string | undefined => {
    let value: string | undefined;
    for (const rule of ordered) {
      if (rule.selectors.includes(selector) && rule.props.has(prop)) value = rule.props.get(prop);
    }
    return value;
  };

  it.each([
    ['.card-title', '20px'],
    ['.tag', '12px'],
    ['.tag-accent', '12px'],
    ['.tag-outline', '12px'],
    ['.tag-neutral', '12px'],
    ['.card-body', '14px'],
    ['h6', '10px'],
    ['body', '14px'],
  ])('%s resolves to %s', (selector, size) => {
    expect(resolved(selector, 'font-size')).toBe(size);
  });

  it('h6 keeps uppercase and 0.1em tracking, .card-title is weight 500', () => {
    const frame = parseDecls(read(FRAME), rel(FRAME));
    const of = (selector: string, prop: string) =>
      frame.find((d) => d.selector === selector && d.prop === prop)?.value;
    expect(of('h6', 'text-transform')).toBe('uppercase');
    expect(of('h6', 'letter-spacing')).toBe('0.1em');
    expect(of('.card-title', 'font-weight')).toBe('500');
  });
});

// ---------------------------------------------------------------------------
// icons and headings
// ---------------------------------------------------------------------------

const ICON_LIBRARIES = /lucide|heroicons|fortawesome|font-?awesome|\bmdi\b|material|iconify|feather/i;

function importOffenders(file: string, text: string): string[] {
  const bad: string[] = [];
  for (const match of text.matchAll(/import\s+([^;]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const [, clause, specifier] = match;
    // Only package specifiers name an icon library; a relative path is a local file whose name may
    // contain a word such as 'material' (MaterialsOnHand.vue).
    if (!specifier.startsWith('.') && ICON_LIBRARIES.test(specifier)) bad.push(`${file}: ${specifier}`);
    if (specifier !== '@phosphor-icons/vue') {
      const names = clause.match(/\bPh[A-Z]\w*/g) ?? [];
      for (const name of names) bad.push(`${file}: ${name} imported from ${specifier}`);
    }
  }
  return bad;
}

describe('icons', () => {
  it('flags a foreign icon library and a Ph name from elsewhere', () => {
    expect(importOffenders('f.ts', "import { Sword } from 'lucide-vue-next';")).toHaveLength(1);
    expect(importOffenders('f.ts', "import { PhSword } from './icons';")).toHaveLength(1);
    expect(importOffenders('f.ts', "import { PhSword } from '@phosphor-icons/vue';")).toEqual([]);
    expect(importOffenders('f.ts', "import MaterialsOnHand from './MaterialsOnHand.vue';")).toEqual([]);
    expect(importOffenders('f.ts', "import { Icon } from '@iconify/vue';")).toHaveLength(1);
  });

  it('client source uses Phosphor icons only', () => {
    const offenders = clientSourceTexts().flatMap(([file, text]) => importOffenders(file, text));
    expect(offenders).toEqual([]);
  });

  // Exactly one folder may draw inline svg: the Map's graph plane (51-UI-SPEC O1; CONTEXT "SVG is
  // allowed on the map screen only"). The prefix ends in a slash so a sibling such as src/mapping/
  // is still flagged.
  const SVG_FOLDER = 'src/map/';
  const svgOffenders = (entries: Array<[string, string]>): string[] =>
    entries
      .filter(([file, text]) => !file.startsWith(SVG_FOLDER) && /<svg\b/i.test(text))
      .map(([file]) => file);

  it('the svg allowance is exactly the src/map/ folder', () => {
    const svg = '<template><svg viewBox="0 0 1 1"></svg></template>';
    expect(svgOffenders([['src/rails/X.vue', svg]])).toEqual(['src/rails/X.vue']);
    expect(svgOffenders([['src/map/GraphPlane.vue', svg]])).toEqual([]);
    expect(svgOffenders([['src/mapping/X.vue', svg]])).toEqual(['src/mapping/X.vue']);
  });

  it('no .vue template outside src/map/ draws an inline svg', () => {
    const offenders = svgOffenders(files.vue.map((file) => [rel(file), sfcTemplateAndScript(read(file))]));
    expect(offenders).toEqual([]);
  });
});

describe('headings', () => {
  const FORBIDDEN = /<h[1235]\b/i;

  it('detects h1, h2, h3 and h5 elements', () => {
    expect(FORBIDDEN.test('<template><h2>Title</h2></template>')).toBe(true);
    expect(FORBIDDEN.test('<template><h4>Title</h4><h6>Kicker</h6></template>')).toBe(false);
  });

  it('.vue templates use only h4 and h6', () => {
    const offenders = files.vue.filter((file) => FORBIDDEN.test(sfcTemplateAndScript(read(file)))).map(rel);
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// XSS sinks (T-45-08)
// ---------------------------------------------------------------------------

describe('XSS sinks', () => {
  const SINKS = /\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b|document\.write\b/;

  it('detects the sinks', () => {
    expect(SINKS.test('el.innerHTML = x')).toBe(true);
    expect(SINKS.test('el.insertAdjacentHTML("beforeend", x)')).toBe(true);
    expect(SINKS.test('document.write(x)')).toBe(true);
    expect(SINKS.test('el.textContent = x')).toBe(false);
  });

  it('no .vue file uses v-html', () => {
    const offenders = files.vue.filter((file) => /\bv-html\b/.test(read(file))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('no non-test source writes raw HTML', () => {
    const offenders = clientSourceTexts()
      .filter(([, text]) => SINKS.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// focus, image rendering, import order
// ---------------------------------------------------------------------------

describe('focus ring and image rendering', () => {
  const removesOutline = (decls: CssDecl[]): string[] =>
    decls
      .filter((d) => d.prop === 'outline' && /^(?:none|0|0px)(?:\s|$)/.test(d.value.trim()))
      .map(report);

  it('flags outline removal', () => {
    expect(removesOutline(css('a:focus', 'outline: none'))).toHaveLength(1);
    expect(removesOutline(css('a:focus', 'outline: 0'))).toHaveLength(1);
    expect(removesOutline(css('a:focus', 'outline: 2px solid var(--color-accent)'))).toEqual([]);
  });

  it('client CSS never removes the focus outline', () => {
    expect(removesOutline(clientCssDecls())).toEqual([]);
  });

  it('client CSS declares no image-rendering', () => {
    expect(clientCssDecls().filter((d) => d.prop === 'image-rendering').map(report)).toEqual([]);
  });

  it('Nocturne keeps its :focus-visible ring', () => {
    const decls = parseDecls(read(NOCTURNE), rel(NOCTURNE));
    const ring = decls.find((d) => d.selector === ':focus-visible' && d.prop === 'outline');
    expect(ring?.value).toContain('var(--color-accent)');
  });
});

describe('stylesheet import order', () => {
  it('main.ts imports nocturne, then tokens.client, then frame', () => {
    const imports = [...read(`${SRC}/main.ts`).matchAll(/^import\s+['"]([^'"]+)['"];?$/gm)].map((m) => m[1]);
    expect(imports.slice(0, 3)).toEqual([
      './styles/nocturne.css',
      './styles/tokens.client.css',
      './styles/frame.css',
    ]);
    const firstImportLine = read(`${SRC}/main.ts`).split('\n').find((line) => line.startsWith('import '));
    expect(firstImportLine).toContain('nocturne.css');
  });

  it('nocturne.css leads with its header and the Inter font import', () => {
    const source = read(NOCTURNE);
    expect(source.startsWith('/* Nocturne')).toBe(true);
    const firstAtRule = /@[a-z-]+[^;{]*/i.exec(source)?.[0] ?? '';
    expect(firstAtRule).toContain('@import');
    expect(firstAtRule).toContain('family=Inter');
  });
});
