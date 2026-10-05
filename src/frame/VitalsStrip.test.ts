// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import VitalsStrip from './VitalsStrip.vue';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function mountStrip(overrides: Record<string, unknown> = {}): VueWrapper {
  wrapper = mount(VitalsStrip, {
    props: {
      name: 'Brannoch the Wanderer',
      avatarInitial: 'B',
      classLine: 'Lv 6 · Ranger',
      hp: 212n,
      maxHp: 260n,
      mana: 140n,
      maxMana: 280n,
      stamina: 60n,
      maxStamina: 0n,
      levelUp: false,
      newSkill: false,
      ...overrides,
    },
  });
  return wrapper;
}

describe('VitalsStrip normal variant', () => {
  it('shows the avatar, the name with a full-name title and the class line', () => {
    const w = mountStrip();
    expect(w.get('.avatar').text()).toBe('B');
    expect(w.get('.name').text()).toBe('Brannoch the Wanderer');
    expect(w.get('.name').attributes('title')).toBe('Brannoch the Wanderer');
    expect(w.get('.class-line').text()).toBe('Lv 6 · Ranger');
  });

  it('shows HP, MP and SP micro labels over three progress bars', () => {
    const w = mountStrip();
    expect(w.findAll('.micro-label').map((l) => l.text())).toEqual(['HP 212', 'MP 140', 'SP 60']);
    const bars = w.findAll('[role="progressbar"]');
    expect(bars).toHaveLength(3);
    expect(bars.map((b) => b.attributes('aria-label'))).toEqual(['Health', 'Mana', 'Stamina']);
  });

  it('sets fill widths from barFraction (max 0 gives 0%)', () => {
    const w = mountStrip();
    const fills = w.findAll('.fill');
    expect((fills[0].element as HTMLElement).style.width).toBe(`${(212 / 260) * 100}%`);
    expect((fills[1].element as HTMLElement).style.width).toBe('50%');
    expect((fills[2].element as HTMLElement).style.width).toBe('0%');
  });

  it('hides both tags by default', () => {
    const w = mountStrip();
    expect(w.find('.tag').exists()).toBe(false);
  });

  it('shows the Level up outline tag when levelUp is true', () => {
    const w = mountStrip({ levelUp: true });
    const tag = w.get('.tag.tag-outline');
    expect(tag.text()).toBe('Level up');
    expect(w.find('.tag.tag-accent').exists()).toBe(false);
  });

  it('shows the New skill accent tag when newSkill is true, after Level up', () => {
    const w = mountStrip({ levelUp: true, newSkill: true });
    const tags = w.findAll('.tag');
    expect(tags.map((t) => t.text())).toEqual(['Level up', 'New skill']);
    expect(tags[1].classes()).toContain('tag-accent');
  });

  it('renders the tags as non-interactive spans', () => {
    const w = mountStrip({ levelUp: true, newSkill: true });
    for (const tag of w.findAll('.tag')) {
      expect(tag.element.tagName).toBe('SPAN');
      expect(tag.attributes('tabindex')).toBeUndefined();
    }
  });

  it('escapes the character name as text', () => {
    const w = mountStrip({ name: '<b>x</b>' });
    expect(w.find('.name b').exists()).toBe(false);
    expect(w.get('.name').text()).toBe('<b>x</b>');
  });
});

describe('VitalsStrip compact variant', () => {
  it('shows the name and exactly two progress bars (HP and MP)', () => {
    const w = mountStrip({ compact: true, levelUp: true, newSkill: true });
    expect(w.get('.name').text()).toBe('Brannoch the Wanderer');
    const bars = w.findAll('[role="progressbar"]');
    expect(bars).toHaveLength(2);
    expect(bars.map((b) => b.attributes('aria-label'))).toEqual(['Health', 'Mana']);
  });

  it('has no tags, no SP and no avatar', () => {
    const w = mountStrip({ compact: true, levelUp: true, newSkill: true });
    expect(w.find('.tag').exists()).toBe(false);
    expect(w.find('.avatar').exists()).toBe(false);
    expect(w.text()).not.toContain('SP');
  });

  it('keeps fill widths following barFraction', () => {
    const w = mountStrip({ compact: true, hp: 300n, maxHp: 260n, mana: 5n, maxMana: 0n });
    const fills = w.findAll('.fill');
    expect((fills[0].element as HTMLElement).style.width).toBe('100%');
    expect((fills[1].element as HTMLElement).style.width).toBe('0%');
  });
});

describe('VitalsStrip source', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/frame/VitalsStrip.vue'), 'utf8');

  it('carries the spec layout values and tag classes', () => {
    expect(source).toContain('tag-outline');
    expect(source).toContain('tag-accent');
    expect(source).toContain('repeat(3, 1fr)');
    expect(source).toContain('padding: 16px 16px 8px');
    expect(source).toContain('tabular-nums');
  });
});
