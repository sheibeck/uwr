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

/** The phone width of the UI-SPEC mobile frame (390 x 844): media queries are judged at this width. */
const MOBILE_WIDTH = 390;

interface CssRule {
  selectors: string[];
  body: string;
  /** The @media condition the rule sits in, or null at the top level. */
  media: string | null;
}

/** Every rule body in source order, with the @media block (if any) that wraps it. */
function rules(source: string): CssRule[] {
  // The text after the <style ...> tag's '>' only, so the first rule's selector is not '<attrs> .x'.
  const style = source.split('<style')[1] ?? '';
  const css = style
    .slice(style.indexOf('>') + 1)
    .split('</style>')[0]
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const out: CssRule[] = [];
  const plain = (text: string, media: string | null): void => {
    for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = match[1]
        .split(',')
        .map((selector) => selector.trim().replace(/\s+/g, ' '));
      out.push({ selectors, body: match[2], media });
    }
  };
  let pos = 0;
  while (pos < css.length) {
    const at = css.indexOf('@media', pos);
    if (at === -1) {
      plain(css.slice(pos), null);
      break;
    }
    plain(css.slice(pos, at), null);
    const open = css.indexOf('{', at);
    let depth = 1;
    let end = open + 1;
    while (depth > 0 && end < css.length) {
      if (css[end] === '{') depth += 1;
      else if (css[end] === '}') depth -= 1;
      end += 1;
    }
    plain(css.slice(open + 1, end - 1), css.slice(at + '@media'.length, open).trim());
    pos = end;
  }
  return out;
}

/** True when a rule's @media condition holds on the phone (width conditions judged at 390px). */
function appliesOnMobile(media: string | null): boolean {
  if (media === null) return true;
  for (const match of media.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)) {
    const limit = Number(match[2]);
    if (match[1] === 'min' && MOBILE_WIDTH < limit) return false;
    if (match[1] === 'max' && MOBILE_WIDTH > limit) return false;
  }
  return true;
}

/**
 * The size a selector gets on the phone: the last declaration of the property, in source order, among
 * the rules for exactly that selector that apply at the mobile width (the cascade for equal
 * specificity). A desktop-only rule (min-width: 900px, say) can never satisfy a mobile requirement.
 * 0 when no applicable rule sets it.
 */
function mobileSizeOf(source: string, selector: string, property: string): number {
  let size = 0;
  for (const rule of rules(source)) {
    if (!rule.selectors.includes(selector) || !appliesOnMobile(rule.media)) continue;
    const found = rule.body.match(new RegExp(`(?:^|[;\\s])${property}:\\s*(\\d+)px`));
    if (found) size = Number(found[1]);
  }
  return size;
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
  { file: 'src/map/DetailPanel.vue', selector: '.travel-button', properties: ['min-height'], min: 44 },
  { file: 'src/map/DetailPanel.vue', selector: '.travel-button.btn-primary', properties: ['min-height'], min: 48 },
  { file: 'src/ledger/SegTabs.vue', selector: '.seg-opt', properties: ['min-height'], min: 44 },
];

describe('mobile touch targets in src/map', () => {
  for (const target of TARGETS) {
    it(`${target.file} ${target.selector} is at least ${target.min}px`, () => {
      const source = read(target.file);
      const sizes = target.properties.map((property) => mobileSizeOf(source, target.selector, property));
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

  it('gate pills reach 44px through the mobile ::after slop, computed from the source', () => {
    const source = read('src/map/GraphPlane.vue');
    const height = mobileSizeOf(source, '.gate', 'height');
    expect(height).toBeGreaterThan(0);
    const slop = rules(source).find((rule) => rule.selectors.includes('.gate.mobile::after'));
    // review IN-05: the vertical inset is read from the rule, so a smaller slop fails here
    const inset = slop?.body.match(/inset:\s*-(\d+)px\b/);
    expect(inset).not.toBeNull();
    expect(height + 2 * Number(inset![1])).toBeGreaterThanOrEqual(44);
  });

  it('region chips render on desktop only; on the phone the Regions options reach 44px', () => {
    const meta = read('src/map/MapMeta.vue');
    // The chips sit in the desktop branch; the phone chooses regions in the Map sheet's listbox.
    expect(meta).toMatch(/<span v-if="frame\.isDesktop\.value" class="map-meta">[\s\S]*class="tag region-chip"[\s\S]*<span v-else/);
    // review IN-05: no mobile rule for a control that never renders on mobile
    expect(meta).not.toContain('::after');
    expect(meta).not.toMatch(/max-width: 899px/);
    expect(mobileSizeOf(read('src/map/RegionsListbox.vue'), '.region-option', 'min-height')).toBeGreaterThanOrEqual(44);
  });

  it('the mobile size helper ignores desktop-only rules and follows the cascade', () => {
    const css = `<style>
      .a { min-height: 32px; }
      @media (min-width: 900px) { .a { min-height: 64px; } }
      @media (max-width: 899px) { .b { min-height: 44px; } }
      .b { min-height: 24px; }
    </style>`;
    expect(mobileSizeOf(css, '.a', 'min-height')).toBe(32);
    expect(mobileSizeOf(css, '.b', 'min-height')).toBe(24);
  });

  // Every <button> rendered by a src/map component carries one of these classes. A new control must
  // be given a row in TARGETS above (or a reason here) before it can ship.
  const COVERED_BY_CLASS: Record<string, string[]> = {
    'GraphPlane.vue': ['nodeClasses', 'gate'],
    'MapDock.vue': ['travel-button', 'details-toggle'],
    // Desktop branch only (frame.isDesktop): the phone chooses regions in the RegionsListbox.
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
    expect(mobileSizeOf(listbox, '.region-option', 'min-height')).toBeGreaterThanOrEqual(44);
    // The Map | Here tabs are SegTabs, whose options are 44px. The Map sheet has no view switch.
    expect(read('src/map/MapScreen.vue')).toContain('<SegTabs');
    expect(read('src/map/MapSheet.vue')).not.toContain('<SegTabs');
  });
});
