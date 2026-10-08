import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The 44px touch-target check for every mobile party control (51.1-UI-SPEC "Exceptions": every
// mobile control min-height 44, the mobile menu sheet rows 48; ROADMAP 51.1 criterion 6 and probe
// E19: each target keeps its size on its own and does not lean on its neighbours). happy-dom has no
// layout, so this reads the source, as src/map/mobileTargets.test.ts does (the parser, the
// media-aware size reading and the completeness rule are copied from it; this file is self-contained).
// A new button in src/social fails the completeness test until it is listed here with its size rule.

const ROOT = process.cwd();
const SOCIAL_DIR = resolve(ROOT, 'src/social');

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
      const selectors = match[1].split(',').map((selector) => selector.trim().replace(/\s+/g, ' '));
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
  /** What the control is, for the test name. */
  name: string;
  file: string;
  selector: string;
  /** The property that carries the size; every axis listed for a square control. */
  properties: string[];
  min: number;
}

/** True when every listed axis of the target reaches its minimum on the phone. */
function meets(source: string, target: Pick<Target, 'selector' | 'properties' | 'min'>): boolean {
  return target.properties.every((property) => mobileSizeOf(source, target.selector, property) >= target.min);
}

const TARGETS: Target[] = [
  // Menus (PlayerMenu size sheet, ActionMenu mobile sheet)
  { name: 'member and self card ⋯ (PlayerMenu size sheet)', file: 'src/social/PlayerMenu.vue', selector: '.menu-opener.sheet', properties: ['width', 'height'], min: 44 },
  { name: 'mobile menu sheet rows', file: 'src/social/ActionMenu.vue', selector: '.menu-item.mobile', properties: ['min-height'], min: 48 },
  { name: 'mobile menu sheet Cancel', file: 'src/social/ActionMenu.vue', selector: '.menu-cancel', properties: ['min-height'], min: 44 },
  { name: 'mobile menu sheet confirm buttons (InlineConfirm mobile)', file: 'src/ledger/InlineConfirm.vue', selector: '.mobile .decision-btn', properties: ['min-height'], min: 44 },
  // The Party sheet body
  { name: 'Party sheet Invite', file: 'src/rails/PartyBlock.vue', selector: '.invite.sheet', properties: ['min-height'], min: 44 },
  { name: 'Travel with leader switch (sheet)', file: 'src/social/TravelSwitch.vue', selector: '.travel-switch.sheet', properties: ['min-height'], min: 44 },
  { name: 'Invited · waiting row (sheet)', file: 'src/social/OutgoingInvites.vue', selector: '.sheet .row', properties: ['min-height'], min: 44 },
  { name: 'Cancel invite (sheet)', file: 'src/social/OutgoingInvites.vue', selector: '.sheet .cancel', properties: ['min-height'], min: 44 },
  // The invite card on the composer (mobile) and in the sheet: Accept and Decline share the .touch rule
  { name: 'invite card Accept and Decline (mobile and sheet)', file: 'src/social/InviteCard.vue', selector: '.touch .answer', properties: ['min-height'], min: 44 },
  // The mobile combat strip
  { name: 'mobile combat self row (button.self-target)', file: 'src/frame/VitalsStrip.vue', selector: '.self-target', properties: ['min-height'], min: 44 },
  { name: 'mobile combat grid card (button.ally-card)', file: 'src/frame/VitalsStrip.vue', selector: '.ally-card', properties: ['min-height'], min: 44 },
];

describe('mobile touch targets for the party (51.1)', () => {
  for (const target of TARGETS) {
    it(`${target.name}: ${target.file} ${target.selector} is at least ${target.min}px`, () => {
      expect(meets(read(target.file), target)).toBe(true);
    });
  }

  it('the strip self row and grid cards are real buttons', () => {
    const strip = read('src/frame/VitalsStrip.vue').split('<style')[0];
    expect(strip).toMatch(/<button[^>]*class="self-target"/);
    expect(strip).toMatch(/<button[^>]*class="ally-card"/);
    expect(read('src/frame/VitalsStrip.vue')).toMatch(/button\.ally-card \{/);
  });

  it('the mobile sheet branch of MemberCard uses the 44px opener and the invite card passes touch', () => {
    expect(read('src/social/MemberCard.vue')).toContain(`:size="isSheet ? 'sheet' : 'rail'"`);
    expect(read('src/social/InviteCard.vue')).toContain(`touch: props.variant !== 'rail'`);
    expect(read('src/rails/PartyBlock.vue')).toContain(`:class="{ sheet: isSheet }"`);
    expect(read('src/rails/PartyBlock.vue')).toContain(`<TravelSwitch variant="sheet"`);
    expect(read('src/rails/PartyBlock.vue')).toContain(`<OutgoingInvites :variant="isSheet ? 'sheet' : 'rail'"`);
  });

  it('the size helper has teeth: a 40px rule, a desktop-only rule and a missing rule all fail', () => {
    const forty = `<style>.x { min-height: 40px; }</style>`;
    expect(meets(forty, { selector: '.x', properties: ['min-height'], min: 44 })).toBe(false);
    const desktopOnly = `<style>.x { min-height: 28px; } @media (min-width: 900px) { .x { min-height: 64px; } }</style>`;
    expect(meets(desktopOnly, { selector: '.x', properties: ['min-height'], min: 44 })).toBe(false);
    const missing = `<style>.y { min-height: 44px; }</style>`;
    expect(meets(missing, { selector: '.x', properties: ['min-height'], min: 44 })).toBe(false);
    const oneAxis = `<style>.x { width: 44px; height: 28px; }</style>`;
    expect(meets(oneAxis, { selector: '.x', properties: ['width', 'height'], min: 44 })).toBe(false);
    const forty4 = `<style>.x { min-height: 40px; } .x { min-height: 44px; }</style>`;
    expect(meets(forty4, { selector: '.x', properties: ['min-height'], min: 44 })).toBe(true);
  });

  it('the size helper ignores desktop-only rules and follows the cascade', () => {
    const css = `<style>
      .a { min-height: 32px; }
      @media (min-width: 900px) { .a { min-height: 64px; } }
      @media (max-width: 899px) { .b { min-height: 44px; } }
      .b { min-height: 24px; }
    </style>`;
    expect(mobileSizeOf(css, '.a', 'min-height')).toBe(32);
    expect(mobileSizeOf(css, '.b', 'min-height')).toBe(24);
  });

  // Every <button> rendered by a src/social component carries one of these classes. A new control
  // must be given a row in TARGETS above (or a reason here) before it can ship.
  const COVERED_BY_CLASS: Record<string, string[]> = {
    'ActionMenu.vue': ['menu-item', 'menu-cancel'],
    // The desktop rail's combat ally target. There are no ⋯ and no member buttons on the phone in
    // combat (assumption B13): the mobile grid cards are VitalsStrip's .ally-card, listed above.
    'CombatMemberCard.vue': ['member-target'],
    'InviteCard.vue': ['answer'],
    'OutgoingInvites.vue': ['cancel'],
    'PlayerMenu.vue': ['menu-opener'],
    'TravelSwitch.vue': ['travel-switch'],
  };

  it('every <button> in src/social components is covered', () => {
    const files = readdirSync(SOCIAL_DIR).filter((name) => name.endsWith('.vue'));
    expect(files.length).toBeGreaterThanOrEqual(12);
    const uncovered: string[] = [];
    for (const file of files) {
      const source = readFileSync(resolve(SOCIAL_DIR, file), 'utf8').split('<style')[0];
      for (const tag of source.matchAll(/<button\b[^>]*>/g)) {
        const classes = (tag[0].match(/\bclass="([^"]*)"/)?.[1] ?? '').split(/\s+/);
        const covered = COVERED_BY_CLASS[file] ?? [];
        if (!classes.some((name) => covered.includes(name))) uncovered.push(`${file}: ${tag[0].slice(0, 80)}`);
      }
    }
    expect(uncovered).toEqual([]);
  });

  it('every <button> in the Party sheet block is the 44px Invite', () => {
    const source = read('src/rails/PartyBlock.vue').split('<style')[0];
    const buttons = [...source.matchAll(/<button\b[^>]*>/g)].map((tag) => tag[0]);
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toContain('invite');
  });

  it('a button listed as covered still exists (a stale entry fails)', () => {
    for (const [file, classes] of Object.entries(COVERED_BY_CLASS)) {
      const source = readFileSync(resolve(SOCIAL_DIR, file), 'utf8').split('<style')[0];
      const used = [...source.matchAll(/<button\b[^>]*>/g)].map((tag) => tag[0]).join('\n');
      for (const name of classes) expect(used, `${file} ${name}`).toContain(name);
    }
  });

  it('the CombatMemberCard is only mounted from the rail party block, never the phone sheet', () => {
    const source = read('src/rails/PartyBlock.vue').split('<style')[0];
    // The sheet recipe is chosen before the combat recipe: outOfCombat is true for the sheet.
    expect(source).toContain('const outOfCombat = computed(() => !inCombat.value || isSheet.value);');
    expect(source).toContain('<CombatMemberCard');
  });
});
