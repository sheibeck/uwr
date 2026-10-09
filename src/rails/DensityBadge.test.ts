// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { CREATURE_DENSITY_WORDS, RESOURCE_DENSITY_WORDS } from '@game-data/density_lines';
import DensityBadge from './DensityBadge.vue';

// 51.3.1.1-19: the density word badge of the Nearby cards (UI-SPEC "DensityBadge.vue", Color table).

describe('DensityBadge', () => {
  it('renders the word with the .sr-only Population: prefix for creatures', () => {
    const w = mount(DensityBadge, { props: { kind: 'creature', level: 3, word: 'Overrun' } });
    expect(w.element.tagName).toBe('SPAN');
    expect(w.get('.sr-only').text()).toBe('Population:');
    expect(w.text()).toBe('Population: Overrun');
    expect(w.classes()).toContain('density-badge');
    expect(w.classes()).toContain('level-3');
    expect(w.classes()).toContain('kind-creature');
  });

  it('uses the Supply: prefix for resources', () => {
    const w = mount(DensityBadge, { props: { kind: 'resource', level: 0, word: 'Exhausted' } });
    expect(w.get('.sr-only').text()).toBe('Supply:');
    expect(w.text()).toBe('Supply: Exhausted');
    expect(w.classes()).toContain('level-0');
    expect(w.classes()).toContain('kind-resource');
  });

  it('carries a class per level for every word', () => {
    for (const level of [0, 1, 2, 3] as const) {
      const creature = mount(DensityBadge, { props: { kind: 'creature', level, word: CREATURE_DENSITY_WORDS[level] } });
      expect(creature.classes()).toContain(`level-${level}`);
      const resource = mount(DensityBadge, { props: { kind: 'resource', level, word: RESOURCE_DENSITY_WORDS[level] } });
      expect(resource.text()).toContain(RESOURCE_DENSITY_WORDS[level]);
    }
  });

  it('renders a markup word as text', () => {
    const w = mount(DensityBadge, { props: { kind: 'creature', level: 2, word: '<img src=x onerror=alert(1)>' } });
    expect(w.find('img').exists()).toBe(false);
    expect(w.text()).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('DensityBadge colours (UI-SPEC Color table, tokens only)', () => {
  const source = readFileSync(resolve(__dirname, 'DensityBadge.vue'), 'utf8');
  const style = source.slice(source.indexOf('<style'));
  const rule = (selector: string): string => {
    const at = style.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    return style.slice(at, style.indexOf('}', at));
  };

  it('level 3 creature is the health tint (the boss-tag recipe)', () => {
    const body = rule('.level-3.kind-creature');
    expect(body).toContain('color-mix(in srgb, var(--color-health) 24%, var(--color-surface))');
    expect(body).toContain('color-mix(in srgb, var(--color-health) 28%, var(--color-text))');
  });

  it('level 3 resource is the light-green tint', () => {
    const body = rule('.level-3.kind-resource');
    expect(body).toContain('color-mix(in srgb, var(--color-con-light-green) 20%, var(--color-surface))');
    expect(body).toContain('color-mix(in srgb, var(--color-con-light-green) 28%, var(--color-text))');
  });

  it('level 2 neutral-800, level 1 neutral-900, level 0 a hollow ring', () => {
    expect(rule('.level-2')).toContain('var(--color-neutral-800)');
    expect(rule('.level-2')).toContain('var(--color-neutral-200)');
    expect(rule('.level-1')).toContain('var(--color-neutral-900)');
    expect(rule('.level-1')).toContain('var(--color-neutral-400)');
    expect(rule('.level-0')).toContain('transparent');
    expect(rule('.level-0')).toContain('inset 0 0 0 1px var(--color-neutral-700)');
  });

  it('is Micro 10, a pill with 0 8px padding, never wraps or shrinks', () => {
    const body = rule('.density-badge');
    expect(body).toContain('font-size: 10px');
    expect(body).toContain('border-radius: 999px');
    expect(body).toContain('padding: 0 8px');
    expect(body).toContain('white-space: nowrap');
    expect(body).toContain('flex: none');
  });

  it('has no literal colour', () => {
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b|oklch\(|rgb\(|hsl\(/);
  });
});
