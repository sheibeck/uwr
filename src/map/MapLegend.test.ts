// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import MapLegend from './MapLegend.vue';

const SOURCE = readFileSync(resolve(process.cwd(), 'src/map/MapLegend.vue'), 'utf8');

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function mountLegend(playerLevel = 7, mobile = false): VueWrapper {
  wrapper = mount(MapLegend, { props: { playerLevel, mobile } });
  return wrapper;
}

const words = (w: VueWrapper, selector: string): string[] => w.findAll(selector).map((el) => el.text());

describe('MapLegend', () => {
  it('has four groups in fixed order separated by three 1px dividers', () => {
    const w = mountLegend();
    const groups = w.findAll('.group');
    expect(groups).toHaveLength(4);
    expect(groups.map((g) => g.attributes('data-group'))).toEqual(['places', 'terrain', 'danger', 'marks']);
    const dividers = w.findAll('.divider');
    expect(dividers).toHaveLength(3);
    for (const divider of dividers) expect(divider.attributes('aria-hidden')).toBe('true');
    // dividers sit between the groups
    const kids = Array.from(w.get('.legend').element.children).map((el) =>
      el.classList.contains('divider') ? 'divider' : 'group',
    );
    expect(kids).toEqual(['group', 'divider', 'group', 'divider', 'group', 'divider', 'group']);
  });

  it('Places: You, Visited and Heard of with aria-hidden swatches', () => {
    const w = mountLegend();
    const places = w.get('[data-group="places"]');
    expect(words(places as unknown as VueWrapper, '.item')).toEqual(['You', 'Visited', 'Heard of']);
    const swatches = places.findAll('.swatch');
    expect(swatches).toHaveLength(3);
    for (const swatch of swatches) expect(swatch.attributes('aria-hidden')).toBe('true');
  });

  it('Terrain: the eight words in order, Swamp included, each with an aria-hidden icon', () => {
    const w = mountLegend();
    const terrain = w.get('[data-group="terrain"]');
    expect(terrain.findAll('.item').map((el) => el.text())).toEqual([
      'Town',
      'City',
      'Dungeon',
      'Woods',
      'Plains',
      'Mountains',
      'Swamp',
      'Uncharted',
    ]);
    const icons = terrain.findAll('svg');
    expect(icons).toHaveLength(8);
    for (const icon of icons) expect(icon.attributes('aria-hidden')).toBe('true');
  });

  it('Danger: Safe with a shield, then Danger vs Lv {n}: and the four bands in their colours', () => {
    const w = mountLegend(7);
    const danger = w.get('[data-group="danger"]');
    expect(danger.text()).toContain('Safe');
    expect(danger.get('.item-safe svg').attributes('aria-hidden')).toBe('true');
    expect(danger.get('.danger-label').text()).toBe('Danger vs Lv 7:');
    const bands = danger.findAll('.band');
    expect(bands.map((b) => b.text())).toEqual(['easy', 'even', 'tough', 'deadly']);
    expect(bands.map((b) => b.attributes('style'))).toEqual([
      expect.stringContaining('var(--color-con-light-green)'),
      expect.stringContaining('var(--color-con-blue)'),
      expect.stringContaining('var(--color-con-yellow)'),
      expect.stringContaining('var(--color-con-red)'),
    ]);
  });

  it('Danger vs Lv reads the character level', async () => {
    const w = mountLegend(3);
    expect(w.get('.danger-label').text()).toBe('Danger vs Lv 3:');
    await w.setProps({ playerLevel: 12 });
    expect(w.get('.danger-label').text()).toBe('Danger vs Lv 12:');
  });

  it('Marks: Region entrance, Bind and Crafting with aria-hidden icons', () => {
    const w = mountLegend();
    const marks = w.get('[data-group="marks"]');
    expect(marks.findAll('.item').map((el) => el.text())).toEqual(['Region entrance', 'Bind', 'Crafting']);
    const icons = marks.findAll('svg');
    expect(icons).toHaveLength(3);
    for (const icon of icons) expect(icon.attributes('aria-hidden')).toBe('true');
  });

  it('mobile renders the same words', () => {
    const desktop = mountLegend(5, false).text();
    wrapper?.unmount();
    const mobile = mountLegend(5, true).text();
    expect(mobile).toBe(desktop);
  });

  it('source: Label 12 text, neutral-400, 1px by 12px dividers, gaps on the scale, no literal colour', () => {
    expect(SOURCE).toContain('Danger vs Lv');
    expect(SOURCE).toContain('Region entrance');
    expect(SOURCE).toMatch(/column-gap:\s*16px/);
    expect(SOURCE).toMatch(/row-gap:\s*4px/);
    expect(SOURCE).toMatch(/width:\s*1px/);
    expect(SOURCE).toMatch(/height:\s*12px/);
    expect(SOURCE).toContain('var(--color-divider)');
    expect(SOURCE).toContain('var(--color-neutral-400)');
    expect(SOURCE).toContain('var(--color-neutral-200)');
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
