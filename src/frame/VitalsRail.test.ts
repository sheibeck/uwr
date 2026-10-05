// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import { barFraction, vitalText } from './vitals';
import VitalsRail from './VitalsRail.vue';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function mountRail(overrides: Record<string, unknown> = {}): VueWrapper {
  wrapper = mount(VitalsRail, {
    props: {
      name: 'Brannoch the Wanderer',
      avatarInitial: 'B',
      classLine: 'Lv 6 · Ranger',
      hp: 130n,
      maxHp: 260n,
      mana: 300n,
      maxMana: 260n,
      stamina: 5n,
      maxStamina: 0n,
      ...overrides,
    },
  });
  return wrapper;
}

describe('barFraction', () => {
  it('returns the ratio for bigints and numbers', () => {
    expect(barFraction(130n, 260n)).toBe(0.5);
    expect(barFraction(130, 260)).toBe(0.5);
  });

  it('clamps above one and below zero', () => {
    expect(barFraction(300n, 260n)).toBe(1);
    expect(barFraction(-5n, 260n)).toBe(0);
  });

  it('is 0 when max is 0 or negative', () => {
    expect(barFraction(5n, 0n)).toBe(0);
    expect(barFraction(5, -3)).toBe(0);
  });
});

describe('vitalText', () => {
  it('formats value / max', () => {
    expect(vitalText(212n, 260n)).toBe('212 / 260');
    expect(vitalText(212, 260)).toBe('212 / 260');
  });

  it('is 0 / 0 when max is 0 or negative', () => {
    expect(vitalText(5n, 0n)).toBe('0 / 0');
    expect(vitalText(5n, -1n)).toBe('0 / 0');
  });
});

describe('VitalsRail', () => {
  it('renders the avatar initial, the name with a full-name title and the class line', () => {
    const w = mountRail();
    expect(w.get('.avatar').text()).toBe('B');
    const name = w.get('.name');
    expect(name.text()).toBe('Brannoch the Wanderer');
    expect(name.attributes('title')).toBe('Brannoch the Wanderer');
    expect(w.get('.class-line').text()).toBe('Lv 6 · Ranger');
  });

  it('renders three labelled progress bars in order', () => {
    const w = mountRail();
    const bars = w.findAll('[role="progressbar"]');
    expect(bars).toHaveLength(3);
    expect(bars.map((b) => b.attributes('aria-label'))).toEqual(['Health', 'Mana', 'Stamina']);
    expect(bars[0].attributes('aria-valuenow')).toBe('130');
    expect(bars[0].attributes('aria-valuemax')).toBe('260');
    expect(bars[1].attributes('aria-valuenow')).toBe('300');
    expect(bars[1].attributes('aria-valuemax')).toBe('260');
  });

  it('sets fill widths: 50%, clamped 100% and 0% for max 0, with readouts', () => {
    const w = mountRail();
    const fills = w.findAll('.fill');
    expect((fills[0].element as HTMLElement).style.width).toBe('50%');
    expect((fills[1].element as HTMLElement).style.width).toBe('100%');
    expect((fills[2].element as HTMLElement).style.width).toBe('0%');
    const values = w.findAll('.value').map((v) => v.text());
    expect(values).toEqual(['130 / 260', '300 / 260', '0 / 0']);
  });

  it('shows the Party heading and its empty line', () => {
    const w = mountRail();
    expect(w.get('h6').text()).toBe('Party');
    expect(w.text()).toContain('Not in a party.');
  });

  it('escapes the character name as text (no markup injection)', () => {
    const w = mountRail({ name: '<img src=x onerror=alert(1)>' });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.name').text()).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('VitalsRail source', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/frame/VitalsRail.vue'), 'utf8');

  it('carries the spec width, resource tokens and tabular figures', () => {
    expect(source).toContain('width: 252px');
    expect(source).toContain('var(--color-health)');
    expect(source).toContain('var(--color-mana)');
    expect(source).toContain('var(--color-stamina)');
    expect(source).toContain('tabular-nums');
    expect(source).toContain('Not in a party.');
  });
});
