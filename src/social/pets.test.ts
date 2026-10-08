// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import { PhHourglassMedium, PhPawPrint } from '@phosphor-icons/vue';
import PetRow from './PetRow.vue';
import PetTag from './PetTag.vue';

// The pet row under its owner and the mobile in-combat pet tag (51.1-UI-SPEC "Pets"). Owner: name,
// level, HP and expiry only; never interactive.

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function source(name: string): string {
  return readFileSync(resolve(process.cwd(), 'src/social', name), 'utf8');
}

const WOLF = { name: 'Wolf', level: 3n, currentHp: 18n, maxHp: 40n, expiresAtMicros: null };
const TIMED = { ...WOLF, expiresAtMicros: 9_000_000n };

function mountRow(props: Record<string, unknown>): VueWrapper {
  wrapper = mount(PetRow, { props: props as never });
  return wrapper;
}

describe('PetRow', () => {
  it('is a div with nothing interactive or focusable inside', () => {
    const w = mountRow({ pet: TIMED, ownerName: null, secondsLeft: 125 });
    expect(w.element.tagName).toBe('DIV');
    expect(w.find('button').exists()).toBe(false);
    expect(w.find('a').exists()).toBe(false);
    expect(w.find('[tabindex]').exists()).toBe(false);
    expect(w.find('[role="button"]').exists()).toBe(false);
  });

  it('shows the name with a title, the level and the hp numbers', () => {
    const w = mountRow({ pet: WOLF, ownerName: null, secondsLeft: null });
    const name = w.find('.pet-name');
    expect(name.text()).toBe('Wolf');
    expect(name.attributes('title')).toBe('Wolf');
    expect(w.text()).toContain('Lv 3');
    expect(w.find('.pet-hp').text()).toBe('18/40');
    expect(w.findComponent(PhPawPrint).props('size')).toBe(12);
  });

  it('draws a labelled progressbar with the hp value and a proportional fill', () => {
    const w = mountRow({ pet: WOLF, ownerName: null, secondsLeft: null });
    const bar = w.find('[role="progressbar"]');
    expect(bar.attributes('aria-label')).toBe('Wolf health 18 of 40');
    expect(bar.attributes('aria-valuenow')).toBe('18');
    expect(bar.attributes('aria-valuemax')).toBe('40');
    expect(bar.attributes('aria-valuemin')).toBe('0');
    expect(w.find('.fill').attributes('style')).toContain('width: 45%');
  });

  it('clamps the fill when hp is above max or max is zero', () => {
    const over = mountRow({ pet: { ...WOLF, currentHp: 50n }, ownerName: null, secondsLeft: null });
    expect(over.find('.fill').attributes('style')).toContain('width: 100%');
    over.unmount();
    const zero = mountRow({ pet: { ...WOLF, currentHp: 0n, maxHp: 0n }, ownerName: null, secondsLeft: null });
    expect(zero.find('.fill').attributes('style')).toContain('width: 0%');
  });

  it('with a timer shows m:ss aria-hidden and an sr-only fades-in sentence', () => {
    const w = mountRow({ pet: TIMED, ownerName: null, secondsLeft: 125 });
    expect(w.findComponent(PhHourglassMedium).exists()).toBe(true);
    const timer = w.find('.pet-timer');
    expect(timer.text()).toBe('2:05');
    expect(timer.attributes('aria-hidden')).toBe('true');
    const fades = w.findAll('.sr-only').map((el) => el.text());
    expect(fades).toContain('fades in about 3 minutes');
  });

  it('without a timer draws no hourglass, no clock and no fades-in text', () => {
    const w = mountRow({ pet: WOLF, ownerName: null, secondsLeft: null });
    expect(w.findComponent(PhHourglassMedium).exists()).toBe(false);
    expect(w.find('.pet-timer').exists()).toBe(false);
    expect(w.text()).not.toContain('fades');
  });

  it('draws no timer for a pet with no expiry even if a count is passed', () => {
    const w = mountRow({ pet: WOLF, ownerName: null, secondsLeft: 125 });
    expect(w.find('.pet-timer').exists()).toBe(false);
    expect(w.text()).not.toContain('fades');
  });

  it('at 0 seconds (faded, row not yet deleted) shows no clock, hourglass or fades-in text (review IN-04)', () => {
    const w = mountRow({ pet: TIMED, ownerName: null, secondsLeft: 0 });
    expect(w.findComponent(PhHourglassMedium).exists()).toBe(false);
    expect(w.find('.pet-timer').exists()).toBe(false);
    expect(w.text()).not.toContain('0:00');
    expect(w.text()).not.toContain('fades');
  });

  it('reads "Your pet" for the owner and "<owner>\'s pet" for a member', () => {
    const mine = mountRow({ pet: WOLF, ownerName: null, secondsLeft: null });
    expect(mine.find('.sr-only').text()).toBe('Your pet');
    mine.unmount();
    const theirs = mountRow({ pet: WOLF, ownerName: 'Bram', secondsLeft: null });
    expect(theirs.find('.sr-only').text()).toBe("Bram's pet");
  });

  it('renders markup in the pet or owner name as text', () => {
    const bad = '<img src=x onerror=alert(1)>';
    const w = mountRow({ pet: { ...WOLF, name: bad }, ownerName: bad, secondsLeft: null });
    expect(w.find('img').exists()).toBe(false);
    expect(w.find('.pet-name').text()).toBe(bad);
    expect(w.find('[role="progressbar"]').attributes('aria-label')).toBe(`${bad} health 18 of 40`);
  });

  it('shows no pet data the server lacks (kind, ability, cooldown, buffs)', () => {
    const w = mountRow({
      pet: { ...WOLF, kind: 'Summoned', abilityKey: 'maul', abilityCooldownSeconds: 4n },
      ownerName: null,
      secondsLeft: null,
    });
    expect(w.text()).not.toMatch(/Summoned|maul|cooldown|ready/i);
  });

  it('draws the elbow with a pseudo-element at left -12px, 1px neutral-700 borders', () => {
    const text = source('PetRow.vue');
    expect(text).toContain('::before');
    expect(text).toContain('left: -12px');
    expect(text).toContain('top: -4px');
    expect(text).toMatch(/var\(--color-neutral-700\)/);
    expect(text).toContain('var(--color-stamina)');
    expect(text).toContain('min-width: 24px');
  });
});

describe('PetTag', () => {
  function mountTag(props: Record<string, unknown>): VueWrapper {
    wrapper = mount(PetTag, { props: props as never });
    return wrapper;
  }

  it('is a span.tag.tag-neutral, never a button and not focusable', () => {
    const w = mountTag({ pet: WOLF, secondsLeft: null });
    expect(w.element.tagName).toBe('SPAN');
    expect(w.classes()).toEqual(expect.arrayContaining(['tag', 'tag-neutral']));
    expect(w.find('button').exists()).toBe(false);
    expect(w.find('[tabindex]').exists()).toBe(false);
    expect(w.attributes('tabindex')).toBeUndefined();
    expect(w.attributes('role')).toBeUndefined();
  });

  it('shows the paw, the name and the health percent', () => {
    const w = mountTag({ pet: WOLF, secondsLeft: null });
    expect(w.findComponent(PhPawPrint).props('size')).toBe(12);
    expect(w.find('.pet-text').text()).toBe('Wolf 45%');
    expect(w.find('.pet-text').attributes('aria-hidden')).toBe('true');
  });

  it('with an expiry shows m:ss and the sentence with the fades-in part', () => {
    const w = mountTag({ pet: TIMED, secondsLeft: 45 });
    expect(w.find('.pet-timer').text()).toBe('0:45');
    expect(w.find('.pet-timer').attributes('aria-hidden')).toBe('true');
    expect(w.find('.sr-only').text()).toBe('Your pet Wolf, health 45 percent, fades in about 1 minute');
  });

  it('without an expiry the sentence has no fades part and no timer is drawn', () => {
    const w = mountTag({ pet: WOLF, secondsLeft: null });
    expect(w.find('.pet-timer').exists()).toBe(false);
    expect(w.find('.sr-only').text()).toBe('Your pet Wolf, health 45 percent');
  });

  it('draws no timer for a pet with no expiry even if a count is passed', () => {
    const w = mountTag({ pet: WOLF, secondsLeft: 30 });
    expect(w.find('.pet-timer').exists()).toBe(false);
    expect(w.find('.sr-only').text()).not.toContain('fades');
  });

  it('at 0 seconds shows no clock and drops the fades part from the sentence (review IN-04)', () => {
    const w = mountTag({ pet: TIMED, secondsLeft: 0 });
    expect(w.find('.pet-timer').exists()).toBe(false);
    expect(w.find('.sr-only').text()).toBe('Your pet Wolf, health 45 percent');
  });

  it('renders markup in the name as text', () => {
    const bad = '<img src=x onerror=alert(1)>';
    const w = mountTag({ pet: { ...WOLF, name: bad }, secondsLeft: null });
    expect(w.find('img').exists()).toBe(false);
    expect(w.find('.pet-text').text()).toContain(bad);
  });

  it('caps its width at half the row and ellipsizes the name (source)', () => {
    const text = source('PetTag.vue');
    expect(text).toContain('max-width: 50%');
    expect(text).toContain('margin-left: auto');
    expect(text).toMatch(/text-overflow:\s*ellipsis/);
    expect(text).toContain('var(--color-stamina)');
    expect(text).toContain('var(--color-accent-300)');
  });
});
