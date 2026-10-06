// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import { PhSparkle } from '@phosphor-icons/vue';
import EffectChips from './EffectChips.vue';
import type { EffectView } from './effects';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function view(id: number, over: Partial<EffectView> = {}): EffectView {
  return {
    id: BigInt(id),
    name: `Effect ${id}`,
    polarity: 'buff',
    icon: PhSparkle,
    timeText: null,
    text: `Effect ${id}`,
    title: `Effect ${id}`,
    ...over,
  };
}

function many(n: number): EffectView[] {
  return Array.from({ length: n }, (_, i) => view(i + 1));
}

function mountChips(effects: EffectView[], nowrap?: boolean): VueWrapper {
  wrapper = mount(EffectChips, { props: { effects, nowrap } });
  return wrapper;
}

describe('EffectChips', () => {
  it('renders one .tag chip per effect with icon, text and a title equal to the text', () => {
    const w = mountChips([
      view(1, { text: 'Bless · 3 rounds', title: 'Bless · 3 rounds' }),
      view(2),
      view(3),
    ]);
    const chips = w.findAll('.tag');
    expect(chips).toHaveLength(3);
    expect(chips[0].text()).toBe('Bless · 3 rounds');
    expect(chips[0].attributes('title')).toBe('Bless · 3 rounds');
    for (const chip of chips) expect(chip.find('svg').exists()).toBe(true);
  });

  it('styles buffs with tag-accent and debuffs with effect-debuff', () => {
    const w = mountChips([view(1), view(2, { polarity: 'debuff' })]);
    const chips = w.findAll('.tag');
    expect(chips[0].classes()).toContain('tag-accent');
    expect(chips[0].classes()).not.toContain('effect-debuff');
    expect(chips[1].classes()).toContain('effect-debuff');
    expect(chips[1].classes()).not.toContain('tag-accent');
  });

  it('caps at 8 chips and ends with a +n neutral chip', () => {
    const w = mountChips(many(10));
    const chips = w.findAll('.tag');
    expect(chips).toHaveLength(9);
    const last = chips[8];
    expect(last.text()).toBe('+2');
    expect(last.classes()).toContain('tag-neutral');
  });

  it('shows no overflow chip at exactly 8', () => {
    const w = mountChips(many(8));
    expect(w.findAll('.tag')).toHaveLength(8);
    expect(w.find('.tag-neutral').exists()).toBe(false);
  });

  it('renders nothing with no effects', () => {
    const w = mountChips([]);
    expect(w.find('.effect-chips').exists()).toBe(false);
    expect(w.html()).not.toContain('tag');
  });

  it('applies the no-wrap row class only when nowrap is set', () => {
    expect(mountChips(many(2), true).get('.effect-chips').classes()).toContain('nowrap');
    wrapper?.unmount();
    expect(mountChips(many(2)).get('.effect-chips').classes()).not.toContain('nowrap');
  });

  it('renders chips as spans, never buttons', () => {
    const w = mountChips(many(10));
    expect(w.find('button').exists()).toBe(false);
    for (const chip of w.findAll('.tag')) expect(chip.element.tagName).toBe('SPAN');
  });

  it('shows the first `limit` chips and a +n chip for the rest', () => {
    wrapper = mount(EffectChips, { props: { effects: many(5), limit: 2 } });
    const chips = wrapper.findAll('.tag');
    expect(chips.map((chip) => chip.text())).toEqual(['Effect 1', 'Effect 2', '+3']);
  });

  it('swaps in compactText only for compact, falling back to text', () => {
    const effects = [view(1, { text: 'Damage over time · 3 rounds', compactText: '3 rounds' }), view(2)];
    wrapper = mount(EffectChips, { props: { effects } });
    expect(wrapper.findAll('.chip-text').map((t) => t.text())).toEqual(['Damage over time · 3 rounds', 'Effect 2']);
    wrapper.unmount();
    wrapper = mount(EffectChips, { props: { effects, compact: true } });
    expect(wrapper.findAll('.chip-text').map((t) => t.text())).toEqual(['3 rounds', 'Effect 2']);
    expect(wrapper.get('.effect-chips').classes()).toContain('compact');
  });

  it('marks dense chips, and draws a span root when inline', () => {
    wrapper = mount(EffectChips, { props: { effects: many(1), dense: true, inline: true } });
    const root = wrapper.get('.effect-chips');
    expect(root.element.tagName).toBe('SPAN');
    expect(root.classes()).toContain('dense');
    wrapper.unmount();
    wrapper = mount(EffectChips, { props: { effects: many(1) } });
    expect(wrapper.get('.effect-chips').element.tagName).toBe('DIV');
  });

  it('renders an effect name as text, not markup', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const w = mountChips([view(1, { text: payload, title: payload })]);
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.chip-text').text()).toBe(payload);
  });
});

describe('EffectChips source', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/rails/EffectChips.vue'), 'utf8');

  it('adds only on-scale sizes and spacing for the dense and compact chips', () => {
    expect(source).toMatch(/\.effect-chips\.compact \.tag \{\s*font-size: 10px;/);
    expect(source).toMatch(/\.effect-chips\.dense \.tag,\s*\.effect-chips\.compact \.tag \{\s*padding: 0 4px;/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(source).not.toContain('v-html');
    expect(source).not.toContain('<svg');
  });

  it('carries the debuff color mix from the UI-SPEC', () => {
    expect(source).toContain('color-mix(in srgb, var(--color-health) 24%, var(--color-surface))');
    expect(source).toContain('color-mix(in srgb, var(--color-health) 28%, var(--color-text))');
  });
});
