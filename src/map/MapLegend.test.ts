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
    expect(places.findAll('.item').map((el) => el.text())).toEqual(['You', 'Visited', 'Heard of']);
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

  it('Danger: Safe with a shield, then Safety for Lv {n}: and Quiet, Risky, Deadly in their rating colours', () => {
    const w = mountLegend(7);
    const danger = w.get('[data-group="danger"]');
    expect(danger.get('.item-safe').text()).toBe('Safe');
    expect(danger.get('.item-safe svg').attributes('aria-hidden')).toBe('true');
    expect(danger.get('.danger-label').text()).toBe('Safety for Lv 7:');
    const rates = danger.findAll('.rate');
    expect(rates.map((r) => r.text())).toEqual(['Quiet', 'Risky', 'Deadly']);
    expect(rates.map((r) => r.classes())).toEqual([
      expect.arrayContaining(['rate-quiet']),
      expect.arrayContaining(['rate-risky']),
      expect.arrayContaining(['rate-deadly']),
    ]);
    for (const r of rates) expect(r.attributes('style')).toBeUndefined();
    expect(danger.findAll('.band')).toHaveLength(0);
    expect(danger.text()).not.toMatch(/easy|even|tough/);
  });

  it('Safety for Lv reads the level it is given', async () => {
    const w = mountLegend(3);
    expect(w.get('.danger-label').text()).toBe('Safety for Lv 3:');
    await w.setProps({ playerLevel: 12 });
    expect(w.get('.danger-label').text()).toBe('Safety for Lv 12:');
  });

  it('source: the rate-* classes map to the rating tokens and the words come from the shared rule', () => {
    expect(SOURCE).toMatch(/\.rate-quiet \{\s*color: var\(--color-con-blue\);/);
    expect(SOURCE).toMatch(/\.rate-risky \{\s*color: var\(--color-con-yellow\);/);
    expect(SOURCE).toMatch(/\.rate-deadly \{\s*color: var\(--color-con-red\);/);
    expect(SOURCE).toContain('@game-data/place_rating');
    expect(SOURCE).not.toContain('BAND_COLOR');
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
    expect(SOURCE).toContain('Safety for Lv');
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
