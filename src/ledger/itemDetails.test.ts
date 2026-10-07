import { describe, expect, it } from 'vitest';
import { emptyItemStats } from '@game-data/item_stats';
import { FOOD_BUFF_LABELS, generatedOutput, recipeCandidates } from '@game-data/recipe_rules';
import { sellPayout } from '@game-data/vendor_pricing';
import type { ItemTemplate } from '../module_bindings/types';
import { instanceStats } from './compare';
import { itemDetails, itemStatEntries, unitSellValue } from './itemDetails';

function tpl(overrides: Record<string, unknown> = {}): ItemTemplate {
  return {
    id: 1n,
    name: 'Thing',
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 5n,
    requiredLevel: 1n,
    allowedClasses: 'any',
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    magicResistanceBonus: 0n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    weaponType: '',
    stackable: false,
    wellFedDurationMicros: 0n,
    wellFedBuffType: '',
    wellFedBuffMagnitude: 0n,
    description: '',
    ...overrides,
  } as unknown as ItemTemplate;
}

const stats = (patch: Record<string, bigint>) => ({ ...emptyItemStats(), ...patch });

describe('itemStatEntries', () => {
  it('lists the non-zero stats in the comparison order with plain and signed text', () => {
    const entries = itemStatEntries(
      stats({ hpBonus: 6n, weaponDps: 5n, strBonus: 2n, weaponBaseDamage: 4n, armorClassBonus: 3n }),
    );
    expect(entries.map((e) => e.key)).toEqual([
      'armorClassBonus',
      'weaponBaseDamage',
      'weaponDps',
      'strBonus',
      'hpBonus',
    ]);
    expect(entries.map((e) => e.text)).toEqual(['3', '4', '5', '+2', '+6']);
    expect(entries[0]).toMatchObject({ label: 'Armor Class', abbr: 'AC' });
  });

  it('is empty for all zero stats', () => {
    expect(itemStatEntries(emptyItemStats())).toEqual([]);
  });

  it('writes a negative value with its minus', () => {
    const entries = itemStatEntries(stats({ strBonus: -2n }));
    expect(entries.map((e) => e.text)).toEqual(['-2']);
  });
});

describe('unitSellValue', () => {
  const character = { level: 5n, vendorSellMod: 100n };
  it('uses the shared sell payout for one unit with the perk percent', () => {
    const template = tpl({ vendorValue: 40n });
    expect(unitSellValue(template, character, [])).toBe(sellPayout(40n, 1n, 0, 100n));
  });

  it('is null for a quest item', () => {
    expect(unitSellValue(tpl({ name: 'Old Key', slot: 'quest' }), character, [])).toBeNull();
  });
});

describe('itemDetails', () => {
  it('gives the gear type line with a short level requirement', () => {
    const template = tpl({
      slot: 'chest',
      armorType: 'leather',
      tier: 2n,
      requiredLevel: 4n,
      armorClassBonus: 3n,
    });
    const details = itemDetails({
      template,
      stats: instanceStats({ id: 1n }, template, []),
      characterLevel: 2n,
      sellValue: 12n,
    });
    expect(details.typeParts).toEqual([
      { text: 'Chest', tone: 'normal' },
      { text: 'Leather', tone: 'normal' },
      { text: 'Tier 2', tone: 'normal' },
      { text: 'Requires Lv 4', tone: 'short' },
    ]);
    expect(details.stats.map((s) => s.text)).toEqual(['3']);
    expect(details.effect).toBeNull();
    expect(details.meta).toBe('Sells for 12');
  });

  it('omits missing type parts and a met level requirement stays normal', () => {
    const template = tpl({ slot: 'neck', armorType: 'none', tier: 0n, requiredLevel: 3n });
    const details = itemDetails({ template, stats: emptyItemStats(), characterLevel: 3n, sellValue: 1n });
    expect(details.typeParts).toEqual([
      { text: 'Neck', tone: 'normal' },
      { text: 'Requires Lv 3', tone: 'normal' },
    ]);
  });

  it('gives food its type, effect sentence and stackable meta', () => {
    const template = tpl({
      slot: 'food',
      stackable: true,
      wellFedDurationMicros: 600_000_000n,
      wellFedBuffType: 'mana_regen',
      wellFedBuffMagnitude: 2n,
      vendorValue: 1234n,
    });
    const details = itemDetails({ template, stats: emptyItemStats(), characterLevel: 1n, sellValue: 1234n });
    expect(details.typeParts).toEqual([{ text: 'Food', tone: 'normal' }]);
    expect(details.effect).toBe(`Eat to be well fed: +2 ${FOOD_BUFF_LABELS.mana_regen}.`);
    expect(details.meta).toBe('Stackable · Sells for 1,234');
  });

  it('falls back to the raw buff type for an unknown key', () => {
    const template = tpl({
      slot: 'food',
      wellFedDurationMicros: 1n,
      wellFedBuffType: 'luck',
      wellFedBuffMagnitude: 1n,
    });
    expect(itemDetails({ template, stats: emptyItemStats(), characterLevel: 1n, sellValue: 1n }).effect).toBe(
      'Eat to be well fed: +1 luck.',
    );
  });

  it("says Can't be sold when there is no sell value", () => {
    const details = itemDetails({
      template: tpl({ stackable: true }),
      stats: emptyItemStats(),
      characterLevel: 1n,
      sellValue: null,
    });
    expect(details.meta).toBe("Stackable · Can't be sold");
    const plain = itemDetails({ template: tpl(), stats: emptyItemStats(), characterLevel: 1n, sellValue: null });
    expect(plain.meta).toBe("Can't be sold");
  });

  it('gives a material only its word, and the trimmed description or null', () => {
    const material = tpl({ slot: 'material', description: '  A lump of ore.  ' });
    const details = itemDetails({ template: material, stats: emptyItemStats(), characterLevel: 1n, sellValue: 2n });
    expect(details.typeParts).toEqual([{ text: 'Material', tone: 'normal' }]);
    expect(details.description).toBe('A lump of ore.');
    const bare = itemDetails({
      template: tpl({ slot: 'material', description: '   ' }),
      stats: emptyItemStats(),
      characterLevel: 1n,
      sellValue: 2n,
    });
    expect(bare.description).toBeNull();
  });

  it('shows the stats of a generated dagger, and still shows them with the old two-material description', () => {
    const candidate = recipeCandidates(
      [
        { templateId: 46n, name: 'Iron Shard', tier: 1n, vendorValue: 2n, count: 3n },
        { templateId: 48n, name: 'Scrap Cloth', tier: 1n, vendorValue: 1n, count: 11n },
      ],
      1n,
    ).find((c) => c.category === 'weapon')!;
    const { itemTemplate } = generatedOutput(candidate, () => false);
    for (const description of [
      itemTemplate.description,
      'Crafted from Iron Shard and Scrap Cloth.',
    ]) {
      const template = tpl({ ...itemTemplate, id: 9n, description });
      const details = itemDetails({
        template,
        stats: instanceStats({ id: 1n }, template, []),
        characterLevel: 1n,
        sellValue: 3n,
      });
      expect(details.stats.map((s) => `${s.label} ${s.text}`)).toEqual(['Damage 4', 'DPS 5']);
      expect(details.description).toBe(description);
    }
    expect(itemTemplate.description).toContain('4 base damage at 5 DPS');
  });

  it('carries markup in a name or description as a plain string', () => {
    const markup = '<img src=x onerror=alert(1)>';
    const details = itemDetails({
      template: tpl({ slot: 'material', description: markup }),
      stats: emptyItemStats(),
      characterLevel: 1n,
      sellValue: 1n,
    });
    expect(details.description).toBe(markup);
  });
});
