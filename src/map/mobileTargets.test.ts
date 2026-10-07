import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The 44px touch-target check for every mobile control in src/map (51-UI-SPEC "Accessibility
// Contract"; research Pitfall 11: happy-dom has no layout, so this reads the source). Each control
// the Map sheet and its shared components render is listed below with the size rule that gives it
// 44px (48px for the dock button). A new button in src/map fails the completeness test until it is
// added to a list here, so a control cannot reach mobile under 44px unnoticed.

const ROOT = process.cwd();
const MAP_DIR = resolve(ROOT, 'src/map');

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

/** Every rule body in the source (media wrappers are looked through), keyed by its selector list. */
function rules(source: string): Array<{ selectors: string[]; body: string }> {
  const css = (source.split('<style')[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Array<{ selectors: string[]; body: string }> = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1]
      .split(',')
      .map((selector) => selector.trim().replace(/\s+/g, ' '));
    out.push({ selectors, body: match[2] });
  }
  return out;
}

function sizeOf(source: string, selector: string, property: string): number {
  let best = 0;
  for (const rule of rules(source)) {
    if (!rule.selectors.includes(selector)) continue;
    const found = rule.body.match(new RegExp(`(?:^|[;\\s])${property}:\\s*(\\d+)px`));
    if (found) best = Math.max(best, Number(found[1]));
  }
  return best;
}

interface Target {
  file: string;
  selector: string;
  /** The property that carries the size; both axes for a square control. */
  properties: string[];
  min: number;
}

const TARGETS: Target[] = [
  // The Map sheet (all rules apply on mobile)
  { file: 'src/map/MapSheet.vue', selector: '.regions-button', properties: ['min-height'], min: 44 },
  { file: 'src/map/MapSheet.vue', selector: '.legend-toggle', properties: ['min-height'], min: 44 },
  { file: 'src/map/MapSheet.vue', selector: '.center-button', properties: ['width', 'height', 'min-height'], min: 44 },
  { file: 'src/map/RegionsListbox.vue', selector: '.region-option', properties: ['min-height'], min: 44 },
  { file: 'src/map/MapDock.vue', selector: '.travel-button', properties: ['min-height'], min: 48 },
  { file: 'src/map/MapDock.vue', selector: '.details-toggle', properties: ['min-height'], min: 44 },
  // Shared with desktop: the mobile rules sit under the 899px query or a mobile class
  { file: 'src/map/GraphList.vue', selector: '.row', properties: ['min-height'], min: 44 },
  { file: 'src/map/DetailPanel.vue', selector: '.travel-button', properties: ['min-height'], min: 44 },
  { file: 'src/map/DetailPanel.vue', selector: '.travel-button.btn-primary', properties: ['min-height'], min: 48 },
  { file: 'src/ledger/SegTabs.vue', selector: '.seg-opt', properties: ['min-height'], min: 44 },
  { file: 'src/map/MapMeta.vue', selector: '.region-chip::after', properties: ['height'], min: 44 },
];

describe('mobile touch targets in src/map', () => {
  for (const target of TARGETS) {
    it(`${target.file} ${target.selector} is at least ${target.min}px`, () => {
      const source = read(target.file);
      const sizes = target.properties.map((property) => sizeOf(source, target.selector, property));
      // A square control needs every listed axis; a row needs its min-height.
      for (const size of sizes) expect(size).toBeGreaterThanOrEqual(target.min);
    });
  }

  it('graph node hit boxes are 44px on mobile and 32px on desktop', () => {
    const source = read('src/map/GraphPlane.vue');
    expect(source).toMatch(/const HIT_DESKTOP = 32;/);
    expect(source).toMatch(/const HIT_MOBILE = 44;/);
    expect(source).toMatch(/props\.mobile \? HIT_MOBILE : HIT_DESKTOP/);
  });

  it('gate pills are 24px high and reach 44px through the mobile ::after slop', () => {
    const source = read('src/map/GraphPlane.vue');
    expect(sizeOf(source, '.gate', 'height')).toBe(24);
    const slop = rules(source).find((rule) => rule.selectors.includes('.gate.mobile::after'));
    expect(slop?.body).toMatch(/inset:\s*-10px 0/);
    // 24px + 2 x 10px
    expect(24 + 2 * 10).toBeGreaterThanOrEqual(44);
  });

  it('region chips and the mobile Regions options both reach 44px', () => {
    const meta = read('src/map/MapMeta.vue');
    expect(meta).toMatch(/@media \(max-width: 899px\)[\s\S]*\.region-chip::after/);
    expect(sizeOf(read('src/map/RegionsListbox.vue'), '.region-option', 'min-height')).toBeGreaterThanOrEqual(44);
  });

  // Every <button> rendered by a src/map component carries one of these classes. A new control must
  // be given a row in TARGETS above (or a reason here) before it can ship.
  const COVERED_BY_CLASS: Record<string, string[]> = {
    'GraphList.vue': ['row'],
    'GraphPlane.vue': ['nodeClasses', 'gate'],
    'MapDock.vue': ['travel-button', 'details-toggle'],
    'MapMeta.vue': ['region-chip'],
    'MapSheet.vue': ['regions-button', 'legend-toggle', 'center-button'],
    'DetailPanel.vue': ['travel-button'],
    // Desktop branch only: the Map screen's own Center on you (32px) never renders on mobile, where
    // MapSheet draws its 44px one.
    'MapScreen.vue': ['center-button'],
  };

  it('every <button> in src/map components is covered', () => {
    const files = readdirSync(MAP_DIR).filter((name) => name.endsWith('.vue'));
    const uncovered: string[] = [];
    for (const file of files) {
      const source = readFileSync(resolve(MAP_DIR, file), 'utf8').split('<style')[0];
      for (const tag of source.matchAll(/<button\b[^>]*>/g)) {
        // Static classes, plus the name of a bound class function (the graph node buttons).
        const bound = tag[0].match(/:class="(\w+)\(/)?.[1] ?? '';
        const classes = [...(tag[0].match(/\bclass="([^"]*)"/)?.[1] ?? '').split(/\s+/), bound];
        const covered = COVERED_BY_CLASS[file] ?? [];
        if (!classes.some((name) => covered.includes(name))) uncovered.push(`${file}: ${tag[0].slice(0, 80)}`);
      }
    }
    expect(uncovered).toEqual([]);
  });

  it('role="option" and tab controls are covered too', () => {
    expect(read('src/map/RegionsListbox.vue')).toContain('role="option"');
    const listbox = read('src/map/RegionsListbox.vue');
    expect(sizeOf(listbox, '.region-option', 'min-height')).toBeGreaterThanOrEqual(44);
    // The Map sheet view switch and the Map | Here tabs are SegTabs, whose options are 44px.
    expect(read('src/map/MapSheet.vue')).toContain('<SegTabs');
    expect(read('src/map/MapScreen.vue')).toContain('<SegTabs');
  });
});
