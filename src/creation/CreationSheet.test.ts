// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import CreationSheet from './CreationSheet.vue';
import { buildSheet } from './sheetModel';
import type { SheetModel } from './sheetModel';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

const BONUSES =
  '{"primary":{"stat":"dex","value":2},"secondary":{"stat":"int","value":1},"flavor":"Underlight Eyes"}';

function filledModel(overrides: Record<string, unknown> = {}): SheetModel {
  return buildSheet({
    raceName: 'Saltkin',
    raceBonuses: BONUSES,
    archetype: 'mystic',
    className: 'Tidecaller',
    classStats: '{"primaryStat":"int","secondaryStat":"wis"}',
    abilities: JSON.stringify([{ name: 'Brine Lash' }, { name: 'Undertow' }]),
    chosenAbilityIndex: 1n,
    characterName: 'Mirel',
    ...overrides,
  });
}

function mountSheet(model: SheetModel, variant: 'rail' | 'sheet' = 'rail') {
  wrapper = mount(CreationSheet, { props: { model, variant } });
  return wrapper;
}

const rowValue = (w: VueWrapper, label: string): string => {
  const row = w.findAll('.row').find((r) => r.find('.row-label').text() === label);
  if (!row) throw new Error(`no row ${label}`);
  return row.find('.row-value, .stat-value').text();
};

describe('CreationSheet: empty model', () => {
  it('shows Unnamed, the unwritten identity line, Unwritten rows and dash stats', () => {
    const w = mountSheet(buildSheet(null));
    expect(w.find('.name').text()).toBe('Unnamed');
    expect(w.find('.identity-line').text()).toBe('race unwritten · class unwritten');
    expect(rowValue(w, 'Race')).toBe('Unwritten');
    expect(rowValue(w, 'Archetype')).toBe('Unwritten');
    expect(rowValue(w, 'Class')).toBe('Unwritten');
    for (const label of ['Strength', 'Dexterity', 'Intelligence', 'Wisdom', 'Charisma']) {
      expect(rowValue(w, label)).toBe('—');
    }
    expect(w.find('.annotation').exists()).toBe(false);
  });

  it('has no trait element, no Ability row and the question icon in the avatar tile', () => {
    const w = mountSheet(buildSheet(null));
    expect(w.find('.trait').exists()).toBe(false);
    expect(w.findAll('.row').some((r) => r.find('.row-label').text() === 'Ability')).toBe(false);
    expect(w.find('.avatar .avatar-icon').exists()).toBe(true);
    expect(w.find('.avatar-initial').exists()).toBe(false);
  });
});

describe('CreationSheet: filled model', () => {
  it('shows the name, the avatar initial, the identity names and the rows', () => {
    const w = mountSheet(filledModel());
    expect(w.find('.name').text()).toBe('Mirel');
    expect(w.find('.name').attributes('title')).toBe('Mirel');
    expect(w.find('.avatar-initial').text()).toBe('M');
    expect(w.find('.avatar .avatar-icon').exists()).toBe(false);
    expect(w.find('.identity-line').text()).toBe('Saltkin · Tidecaller');
    expect(rowValue(w, 'Race')).toBe('Saltkin');
    expect(rowValue(w, 'Archetype')).toBe('Mystic');
    expect(rowValue(w, 'Class')).toBe('Tidecaller');
  });

  it('shows stat values, +N race annotations on boosted stats and the full reading as hidden text', () => {
    const model = filledModel({ classStats: null, abilities: null, chosenAbilityIndex: null });
    const w = mountSheet(model);
    const dex = model.stats.find((s) => s.key === 'dex')!;
    const row = w.findAll('.row').find((r) => r.find('.row-label').text() === 'Dexterity')!;
    expect(row.find('.stat-value').text()).toBe(dex.value);
    expect(row.find('.annotation').text()).toBe('+2 race');
    expect(row.find('.sr-only').text()).toBe(`Dexterity ${dex.value}, including 2 from your race`);
    expect(row.find('.stat-value').attributes('aria-hidden')).toBe('true');
    expect(row.find('.stat-value').attributes('aria-label')).toBeUndefined();
    expect(row.find('.stat-value').classes()).toContain('boosted');
    const str = w.findAll('.row').find((r) => r.find('.row-label').text() === 'Strength')!;
    expect(str.find('.annotation').exists()).toBe(false);
    expect(str.find('.stat-value').classes()).not.toContain('boosted');
    expect(str.find('.sr-only').text()).toBe(`Strength ${model.stats[0].value}`);
  });

  it('shows the racial trait with typographic quotes and the suffix', () => {
    const w = mountSheet(filledModel());
    expect(w.find('.trait').text()).toBe('“Underlight Eyes” — racial trait');
  });

  it('shows the Ability row with the chosen ability', () => {
    const w = mountSheet(filledModel());
    expect(rowValue(w, 'Ability')).toBe('Undertow');
  });
});

describe('CreationSheet: variants', () => {
  it('rail renders an aside "Character sheet" with an h6 "The ledger so far"', () => {
    const w = mountSheet(filledModel(), 'rail');
    const aside = w.find('aside');
    expect(aside.exists()).toBe(true);
    expect(aside.attributes('aria-label')).toBe('Character sheet');
    expect(w.find('h6').text()).toBe('The ledger so far');
  });

  it('sheet renders the same content with neither the aside nor the h6', () => {
    const rail = mountSheet(filledModel(), 'rail');
    const railNames = rail.findAll('.row-label').map((n) => n.text());
    rail.unmount();
    wrapper = null;
    const w = mountSheet(filledModel(), 'sheet');
    expect(w.find('aside').exists()).toBe(false);
    expect(w.find('h6').exists()).toBe(false);
    expect(w.text()).not.toContain('The ledger so far');
    expect(w.findAll('.row-label').map((n) => n.text())).toEqual(railNames);
    expect(w.find('.name').text()).toBe('Mirel');
  });
});

describe('CreationSheet: stat order and text', () => {
  it('keeps the stat row order between the empty and filled models', () => {
    const order = (w: VueWrapper): string[] => w.findAll('.row-label').map((n) => n.text());
    const empty = order(mountSheet(buildSheet(null)));
    wrapper?.unmount();
    wrapper = null;
    const filled = order(mountSheet(filledModel({ abilities: null, chosenAbilityIndex: null })));
    expect(empty).toEqual(['Race', 'Archetype', 'Class', 'Strength', 'Dexterity', 'Intelligence', 'Wisdom', 'Charisma']);
    expect(filled).toEqual(empty);
  });

  it('renders an img-onerror race, class, name and ability as text, never an element', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const w = mountSheet(
      filledModel({
        raceName: evil,
        className: evil,
        characterName: evil,
        abilities: JSON.stringify([{ name: evil }]),
        chosenAbilityIndex: 0n,
        raceBonuses: `{"primary":{"stat":"dex","value":2},"flavor":${JSON.stringify(evil)}}`,
      }),
    );
    expect(w.text()).toContain(evil);
    expect(w.element.querySelector('img')).toBeNull();
  });
});
