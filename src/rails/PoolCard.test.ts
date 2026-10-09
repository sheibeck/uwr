// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import {
  PhCrownSimple,
  PhHandGrabbing,
  PhMaskSad,
  PhPlant,
  PhSkull,
  PhSword,
  PhTarget,
  PhCube,
} from '@phosphor-icons/vue';
import PoolCard from './PoolCard.vue';
import { familyRows, namedRows, resourceRows } from './pools';
import type { PoolLike } from './pools';

// 51.3.1.1-19: one card shell for the family, named and resource rows (UI-SPEC "Nearby: Creatures",
// "Named & quest targets", "Resources", Interaction States, Accessibility Contract).

const PAYLOAD = '<img src=x onerror=alert(1)>';

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function pool(over: Partial<PoolLike>): PoolLike {
  return {
    id: 7n,
    locationId: 10n,
    kind: 'creature',
    level: 2n,
    lvLo: 4n,
    lvHi: 5n,
    name: 'Goblins',
    iconKey: 'humanoid',
    temperament: 'aggressive',
    singularNoun: 'goblin',
    pluralNoun: 'goblins',
    timeOfDay: 'any',
    ...over,
  };
}

const family = (over: Partial<PoolLike> = {}, playerLevel: bigint | null = 4n) =>
  familyRows([pool(over)], playerLevel, 'the pans')[0];

const salt = (over: Partial<PoolLike> = {}, opts: { capped?: boolean; gathering?: boolean } = {}) =>
  resourceRows(
    [pool({ id: 31n, kind: 'resource', name: 'Panlight Salt', iconKey: 'herb', ...over })],
    false,
    opts.capped ? [{ locationId: 10n, cappedUntilMicros: 99n }] : [],
    opts.gathering ?? false,
    1n,
    'the pans',
  )[0];

const named = (alive = true, templates = [{ id: 1n, level: 7n, isBoss: false }]) =>
  namedRows([{ id: 11n, name: 'Old Brannoc', enemyTemplateId: 1n, isAlive: alive }], [], templates, [], 6n)[0];

function mountCard(props: Record<string, unknown>) {
  wrapper = mount(PoolCard, { props: props as never, attachTo: document.body });
  return wrapper;
}

function describedText(w: VueWrapper, button: ReturnType<VueWrapper['get']>): string[] {
  const ids = (button.attributes('aria-describedby') ?? '').split(' ').filter(Boolean);
  return ids.map((id) => w.get(`#${id}`).text());
}

describe('family card', () => {
  it('is an li holding a div, with icon, name, range, badge, line, hint and Pull', () => {
    const w = mountCard({ variant: 'family', row: family({ level: 3n }) });
    expect(w.element.tagName).toBe('LI');
    expect(w.element.firstElementChild!.tagName).toBe('DIV');
    expect(w.findComponent(PhMaskSad).exists()).toBe(true);
    expect(w.findComponent(PhMaskSad).attributes('aria-hidden')).toBe('true');
    const name = w.get('.card-name');
    expect(name.text()).toBe('Goblins');
    expect(name.attributes('title')).toBe('Goblins · Tough');
    expect(name.classes()).toContain('con-yellow');
    expect(w.get('.card-range').text()).toBe('Lv 4–5, Tough');
    expect(w.get('.card-range .sr-only').text()).toBe(', Tough');
    expect(w.get('.density-badge').text()).toBe('Population: Overrun');
    expect(w.get('.card-line').text()).toBe('Goblins swarm the pans, and every last goblin has noticed you.');
    expect(w.get('.card-hint').text()).toBe('Expect a crowd');
  });

  it('Pull is a labelled secondary button with PhTarget, named Pull {Family}, described by the line and hint', () => {
    const w = mountCard({ variant: 'family', row: family({ level: 1n }) });
    const button = w.get('button');
    expect(button.classes()).toEqual(expect.arrayContaining(['btn', 'btn-secondary', 'card-action']));
    expect(button.text()).toBe('Pull');
    expect(button.attributes('aria-label')).toBe('Pull Goblins');
    expect(button.findComponent(PhTarget).exists()).toBe(true);
    expect(button.findComponent(PhSword).exists()).toBe(false);
    expect(describedText(w, button)).toEqual([
      'A few goblins still prowl the pans, thinned out and short-tempered.',
      'Expect one, alone',
    ]);
  });

  it('emits act on click; offline and busy are aria-disabled / aria-busy and emit nothing', async () => {
    const w = mountCard({ variant: 'family', row: family() });
    await w.get('button').trigger('click');
    expect(w.emitted('act')).toHaveLength(1);
    await w.setProps({ offline: true });
    expect(w.get('button').attributes('aria-disabled')).toBe('true');
    await w.get('button').trigger('click');
    await w.setProps({ offline: false, busy: true });
    expect(w.get('button').attributes('aria-busy')).toBe('true');
    expect(w.get('button').attributes('aria-disabled')).toBeUndefined();
    await w.get('button').trigger('click');
    expect(w.emitted('act')).toHaveLength(1);
  });

  it('level 0 keeps the card without hint or button', () => {
    const w = mountCard({ variant: 'family', row: family({ level: 0n }) });
    expect(w.find('button').exists()).toBe(false);
    expect(w.find('.card-hint').exists()).toBe(false);
    expect(w.get('.density-badge').classes()).toContain('level-0');
    expect(w.get('.card-line').text()).toBe('No goblins are left in the pans. The quiet feels borrowed.');
  });

  it('an unknown icon key uses PhSkull; an unknown player level shows no con meaning', () => {
    const w = mountCard({ variant: 'family', row: family({ iconKey: 'robot' }, null) });
    expect(w.findComponent(PhSkull).exists()).toBe(true);
    expect(w.find('.card-range .sr-only').exists()).toBe(false);
    expect(w.get('.card-name').attributes('title')).toBe('Goblins');
  });

  it('renders markup names as text', () => {
    const w = mountCard({ variant: 'family', row: family({ name: PAYLOAD, pluralNoun: '', singularNoun: '' }) });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.card-name').text()).toBe(PAYLOAD);
    expect(w.get('button').attributes('aria-label')).toBe(`Pull ${PAYLOAD}`);
  });
});

describe('named card', () => {
  it('icon, name, sub-line and Fight with PhSword named Fight {Name}', () => {
    const w = mountCard({ variant: 'named', row: named() });
    expect(w.findComponent(PhCrownSimple).exists()).toBe(true);
    expect(w.get('.card-name').text()).toBe('Old Brannoc');
    expect(w.get('.card-sub').text()).toBe('Named · Lv 7');
    expect(w.get('.card-sub').attributes('title')).toBe('Named · Lv 7');
    const button = w.get('button');
    expect(button.text()).toBe('Fight');
    expect(button.attributes('aria-label')).toBe('Fight Old Brannoc');
    expect(button.findComponent(PhSword).exists()).toBe(true);
    expect(button.findComponent(PhTarget).exists()).toBe(false);
    expect(describedText(w, button)).toEqual(['Named · Lv 7']);
  });

  it('a boss uses PhSkull', () => {
    const w = mountCard({ variant: 'named', row: named(true, [{ id: 1n, level: 9n, isBoss: true }]) });
    expect(w.findComponent(PhSkull).exists()).toBe(true);
    expect(w.findComponent(PhCrownSimple).exists()).toBe(false);
  });

  it('slain: 45% class, the slain line and no button', () => {
    const w = mountCard({ variant: 'named', row: named(false) });
    expect(w.classes()).toContain('slain');
    expect(w.find('button').exists()).toBe(false);
    expect(w.get('.card-sub').text()).toBe('Slain · back after a long rest');
  });

  it('an engaged event spawn shows In combat and an aria-disabled Fight that emits nothing', async () => {
    const row = namedRows(
      [],
      [{ id: 22n, name: 'Cinder Maw', state: 'engaged', enemyTemplateId: 2n, level: 6n }],
      [],
      [],
      6n,
    )[0];
    const w = mountCard({ variant: 'named', row });
    expect(w.get('.card-sub').text()).toBe('Named · Lv 6 · In combat');
    const button = w.get('button');
    expect(button.attributes('aria-disabled')).toBe('true');
    await button.trigger('click');
    expect(w.emitted('act')).toBeUndefined();
  });
});

describe('resource card', () => {
  it('icon, name, badge, line and Gather with PhHandGrabbing named Gather {Resource}', async () => {
    const w = mountCard({ variant: 'resource', row: salt({ level: 3n }) });
    expect(w.findComponent(PhPlant).exists()).toBe(true);
    expect(w.get('.card-name').text()).toBe('Panlight Salt');
    expect(w.get('.card-name').attributes('title')).toBe('Panlight Salt');
    expect(w.get('.density-badge').text()).toBe('Supply: Abundant');
    expect(w.get('.card-line').text()).toBe('Panlight Salt lies thick across the pans.');
    const button = w.get('button');
    expect(button.text()).toBe('Gather');
    expect(button.attributes('aria-label')).toBe('Gather Panlight Salt');
    expect(button.findComponent(PhHandGrabbing).exists()).toBe(true);
    expect(button.attributes('aria-disabled')).toBeUndefined();
    expect(describedText(w, button)).toEqual(['Panlight Salt lies thick across the pans.']);
    expect(w.find('.card-reason').exists()).toBe(false);
    await button.trigger('click');
    expect(w.emitted('act')).toHaveLength(1);
  });

  it('the harvest cap shows its visible reason, aria-disabled and described by it', async () => {
    const w = mountCard({ variant: 'resource', row: salt({}, { capped: true }) });
    expect(w.get('.card-reason').text()).toBe('You have taken what you can carry from here for now.');
    const button = w.get('button');
    expect(button.attributes('aria-disabled')).toBe('true');
    expect(describedText(w, button)).toContain('You have taken what you can carry from here for now.');
    await button.trigger('click');
    expect(w.emitted('act')).toBeUndefined();
  });

  it('a gather in progress shows Finish gathering first.', () => {
    const w = mountCard({ variant: 'resource', row: salt({}, { gathering: true }) });
    expect(w.get('.card-reason').text()).toBe('Finish gathering first.');
    expect(w.get('button').attributes('aria-disabled')).toBe('true');
  });

  it('offline: aria-disabled with no reason line', () => {
    const w = mountCard({ variant: 'resource', row: salt(), offline: true });
    expect(w.get('button').attributes('aria-disabled')).toBe('true');
    expect(w.find('.card-reason').exists()).toBe(false);
  });

  it('Exhausted: no button and no reason; an unknown icon key uses PhCube', () => {
    const w = mountCard({ variant: 'resource', row: salt({ level: 0n, iconKey: 'lava' }, { capped: true }) });
    expect(w.find('button').exists()).toBe(false);
    expect(w.find('.card-reason').exists()).toBe(false);
    expect(w.findComponent(PhCube).exists()).toBe(true);
  });
});

describe('accessibility and privacy', () => {
  it('no card nests a button and each holds at most one', () => {
    for (const props of [
      { variant: 'family', row: family() },
      { variant: 'named', row: named() },
      { variant: 'resource', row: salt({}, { capped: true }) },
    ]) {
      const w = mountCard(props);
      expect(w.findAll('button button')).toHaveLength(0);
      expect(w.findAll('button').length).toBeLessThanOrEqual(1);
      w.unmount();
      wrapper = null;
    }
  });

  it('with numeric fixtures no rendered text holds a count, cap or percent', () => {
    const texts = [
      mountCard({ variant: 'family', row: family({ level: 3n, lvLo: 12n, lvHi: 14n }, 13n) }).text(),
      mountCard({ variant: 'resource', row: salt({ level: 1n }, { capped: true }) }).text(),
    ];
    for (const text of texts) {
      expect(text.replace(/Lv \d+(–\d+)?/g, '')).not.toMatch(/\d|%/);
    }
  });
});

// UI Q1 overflow (backstop): happy-dom has no layout, so the measured check reads the card CSS the
// way src/social/mobileTargets.test.ts does, at the 256px rail (no media query applies above 899px
// rules) and at 390x844 (the max-width 899px block applies).
describe('measured layout at a 256px rail and at 390x844', () => {
  const source = readFileSync(resolve(__dirname, 'PoolCard.vue'), 'utf8');
  const style = source.slice(source.indexOf('<style'));
  const media = style.slice(style.indexOf('@media (max-width: 899px)'));
  const base = style.slice(0, style.indexOf('@media'));
  const rule = (css: string, selector: string): string => {
    const at = css.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf('}', at));
  };

  it('a 24-character family name ellipsizes with its title and full accessible name', () => {
    const long = 'Bramblethorn Sporecrawls';
    expect(long).toHaveLength(24);
    const w = mountCard({ variant: 'family', row: family({ name: long, pluralNoun: '', singularNoun: '' }) });
    const name = w.get('.card-name');
    expect(name.classes()).toContain('card-name');
    expect(name.attributes('title')).toContain(long);
    expect(w.get('button').attributes('aria-label')).toBe(`Pull ${long}`);
    const body = rule(base, '.card-name');
    for (const decl of ['min-width: 0', 'overflow: hidden', 'text-overflow: ellipsis', 'white-space: nowrap']) {
      expect(body).toContain(decl);
    }
  });

  it('the name gives way before the range; the badge and the button never shrink', () => {
    expect(rule(base, '.card-name')).toContain('flex-shrink: 100');
    expect(rule(base, '.card-range')).toContain('white-space: nowrap');
    expect(rule(base, '.card-action')).toContain('flex: none');
    const badge = readFileSync(resolve(__dirname, 'DensityBadge.vue'), 'utf8');
    expect(badge).toMatch(/\.density-badge \{[^}]*flex: none/);
  });

  it('density lines, reasons and named sub-lines behave as the spec says', () => {
    expect(rule(base, '.card-line')).toContain('overflow-wrap: anywhere');
    expect(rule(base, '.card-reason')).toContain('overflow-wrap: anywhere');
    const sub = rule(base, '.card-sub');
    expect(sub).toContain('text-overflow: ellipsis');
    expect(sub).toContain('white-space: nowrap');
  });

  it('buttons are 28px on the rail and 44px on mobile', () => {
    expect(rule(base, '.card-action')).toContain('min-height: 28px');
    expect(rule(media, '.card-action')).toContain('min-height: 44px');
  });
});
