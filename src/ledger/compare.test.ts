import { describe, expect, it } from 'vitest';
import { emptyItemStats, sumItemStats } from '@game-data/item_stats';
import type { ItemStatTotals } from '@game-data/item_stats';
import type { ItemAffix, ItemInstance, ItemTemplate } from '../module_bindings/types';
import {
  STAT_ROWS,
  affixesFor,
  compareRows,
  gearStatTotals,
  instanceStats,
} from './compare';

function stats(overrides: Partial<ItemStatTotals>): ItemStatTotals {
  return { ...emptyItemStats(), ...overrides };
}

function tpl(id: bigint, overrides: Record<string, unknown> = {}): ItemTemplate {
  return { id, name: `T${id}`, slot: 'head', ...overrides } as unknown as ItemTemplate;
}

function inst(id: bigint, templateId: bigint, equippedSlot?: string): ItemInstance {
  return { id, templateId, ownerCharacterId: 7n, equippedSlot, quantity: 1n } as unknown as ItemInstance;
}

function affix(id: bigint, instanceId: bigint, statKey: string, magnitude: bigint): ItemAffix {
  return {
    id,
    itemInstanceId: instanceId,
    affixType: 'prefix',
    affixKey: 'k',
    affixName: 'Name',
    statKey,
    magnitude,
  } as unknown as ItemAffix;
}

describe('STAT_ROWS', () => {
  it('has the fixed order, labels and abbreviations', () => {
    expect(STAT_ROWS.map((r) => r.label)).toEqual([
      'Armor Class',
      'Damage',
      'DPS',
      'Strength',
      'Dexterity',
      'Intelligence',
      'Wisdom',
      'Charisma',
      'Health',
      'Mana',
      'Magic resist',
    ]);
    expect(STAT_ROWS.map((r) => r.abbr)).toEqual([
      'AC',
      'DMG',
      'DPS',
      'STR',
      'DEX',
      'INT',
      'WIS',
      'CHA',
      'HP',
      'MP',
      'MR',
    ]);
    expect(STAT_ROWS.map((r) => r.key)).toEqual([
      'armorClassBonus',
      'weaponBaseDamage',
      'weaponDps',
      'strBonus',
      'dexBonus',
      'intBonus',
      'wisBonus',
      'chaBonus',
      'hpBonus',
      'manaBonus',
      'magicResistanceBonus',
    ]);
  });
});

describe('instanceStats', () => {
  it('sums the template and only that instance affixes, including a Quality affix', () => {
    const template = tpl(1n, { armorClassBonus: 10n, intBonus: 1n });
    const affixes = [
      affix(1n, 5n, 'armorClassBonus', 2n),
      affix(2n, 5n, 'intBonus', 3n),
      affix(3n, 6n, 'armorClassBonus', 100n),
    ];
    const totals = instanceStats(inst(5n, 1n), template, affixes);
    expect(totals.armorClassBonus).toBe(12n);
    expect(totals.intBonus).toBe(4n);
    expect(affixesFor(5n, affixes)).toHaveLength(2);
  });
});

describe('compareRows', () => {
  const selected = stats({ armorClassBonus: 14n, intBonus: 3n });
  const equipped = stats({ armorClassBonus: 11n, intBonus: 2n, strBonus: 1n });

  it('lists the union of non-zero stats with deltas', () => {
    const rows = compareRows(selected, equipped, { withDelta: true });
    expect(rows.map((r) => r.key)).toEqual(['armorClassBonus', 'strBonus', 'intBonus']);
    const [ac, str, int] = rows;
    expect(ac.valueText).toBe('14');
    expect(ac.delta).toBe(3n);
    expect(ac.marker).toBe('up');
    expect(ac.markerText).toBe('▲3');
    expect(ac.srText).toBe(', 3 more than equipped');
    expect(str.valueText).toBe('+0');
    expect(str.delta).toBe(-1n);
    expect(str.marker).toBe('down');
    expect(str.markerText).toBe('▼1');
    expect(str.srText).toBe(', 1 less than equipped');
    expect(int.valueText).toBe('+3');
    expect(int.delta).toBe(1n);
    expect(int.marker).toBe('up');
  });

  it('shows no marker and no screen-reader text at a zero delta', () => {
    const rows = compareRows(stats({ intBonus: 2n }), stats({ intBonus: 2n }), { withDelta: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].marker).toBe('');
    expect(rows[0].markerText).toBe('');
    expect(rows[0].srText).toBe('');
  });

  it('is all up by the full value when nothing is equipped', () => {
    const rows = compareRows(selected, null, { withDelta: true });
    expect(rows.map((r) => [r.key, r.marker, r.delta])).toEqual([
      ['armorClassBonus', 'up', 14n],
      ['intBonus', 'up', 3n],
    ]);
  });

  it('has no markers or screen-reader text without deltas', () => {
    const rows = compareRows(selected, equipped, { withDelta: false });
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.marker).toBe('');
      expect(row.markerText).toBe('');
      expect(row.srText).toBe('');
    }
  });

  it('formats armor class, damage and DPS plainly and the rest with a plus sign', () => {
    const rows = compareRows(
      stats({ weaponBaseDamage: 7n, weaponDps: 3n, hpBonus: 5n, manaBonus: 2n, magicResistanceBonus: 1n }),
      null,
      { withDelta: false },
    );
    expect(rows.map((r) => r.valueText)).toEqual(['7', '3', '+5', '+2', '+1']);
  });
});

describe('gearStatTotals', () => {
  it('equals the sum of instanceStats of each equipped instance and ignores the bag', () => {
    const templates = new Map<bigint, ItemTemplate>([
      [1n, tpl(1n, { armorClassBonus: 10n, strBonus: 2n })],
      [2n, tpl(2n, { armorClassBonus: 5n })],
      [3n, tpl(3n, { armorClassBonus: 99n })],
    ]);
    const affixes = [affix(1n, 11n, 'strBonus', 1n), affix(2n, 13n, 'strBonus', 50n)];
    const items = [inst(11n, 1n, 'chest'), inst(12n, 2n, 'head'), inst(13n, 3n)];
    const totals = gearStatTotals(items, templates, affixes);
    const expected = sumItemStats(templates.get(1n)!, [affixes[0]]);
    expect(totals.armorClassBonus).toBe(expected.armorClassBonus + 5n);
    expect(totals.strBonus).toBe(3n);
    expect(totals.armorClassBonus).toBe(15n);
  });

  it('is empty with no equipped gear', () => {
    expect(gearStatTotals([inst(1n, 1n)], new Map(), [])).toEqual(emptyItemStats());
  });
});
