import { describe, expect, it } from 'vitest';
import { sellPayout } from '@game-data/vendor_pricing';
import type { ItemAffix, ItemInstance, ItemTemplate } from '../module_bindings/types';
import { dockSummary, inspectorView, salvagePrompt } from './inspector';
import type { InspectorInput } from './inspector';
import { MAX_INVENTORY_SLOTS } from '@game-data/inventory_rules';

function tpl(id: bigint, overrides: Record<string, unknown> = {}): ItemTemplate {
  return {
    id,
    name: `Item ${id}`,
    slot: 'chest',
    armorType: 'leather',
    weaponType: '',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 10n,
    requiredLevel: 1n,
    allowedClasses: '',
    stackable: false,
    wellFedDurationMicros: 0n,
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
    description: undefined,
    ...overrides,
  } as unknown as ItemTemplate;
}

function inst(id: bigint, templateId: bigint, overrides: Record<string, unknown> = {}): ItemInstance {
  return {
    id,
    templateId,
    ownerCharacterId: 7n,
    equippedSlot: undefined,
    quantity: 1n,
    qualityTier: undefined,
    craftQuality: undefined,
    displayName: undefined,
    ...overrides,
  } as unknown as ItemInstance;
}

function affix(id: bigint, instanceId: bigint, statKey: string, magnitude: bigint, type = 'prefix', name = 'Keen'): ItemAffix {
  return {
    id,
    itemInstanceId: instanceId,
    affixType: type,
    affixKey: 'k',
    affixName: name,
    statKey,
    magnitude,
  } as unknown as ItemAffix;
}

const FREE = { used: 5, cap: MAX_INVENTORY_SLOTS, full: false };
const FULL = { used: MAX_INVENTORY_SLOTS, cap: MAX_INVENTORY_SLOTS, full: true };

function input(
  instance: ItemInstance,
  templates: ItemTemplate[],
  extra: Partial<InspectorInput> & { items?: ItemInstance[] } = {},
): InspectorInput {
  return {
    instance,
    templates: new Map(templates.map((t) => [t.id, t])),
    affixes: [],
    items: [instance],
    character: {
      level: 5n,
      className: 'Warrior',
      weaponProficiencies: 'sword,axe',
      armorProficiencies: 'leather,plate',
      vendorSellMod: 0n,
    },
    perkKeys: [],
    usage: FREE,
    ...extra,
  };
}

describe('inspectorView header', () => {
  it('builds the kicker for a rare tier-2 chest in the bag and adds Equipped for worn gear', () => {
    const t = tpl(1n, { rarity: 'rare', tier: 2n });
    const bag = inspectorView(input(inst(1n, 1n), [t]))!;
    expect(bag.kicker).toBe('Rare · Tier 2 · Chest');
    expect(bag.name).toBe('Item 1');
    const worn = inspectorView(input(inst(1n, 1n, { equippedSlot: 'chest' }), [t]))!;
    expect(worn.kicker).toBe('Rare · Tier 2 · Chest · Equipped');
  });

  it('uses category words for non-gear items and the instance rarity and name', () => {
    const words: Array<[Record<string, unknown>, string]> = [
      [{ slot: 'material' }, 'Material'],
      [{ slot: 'food' }, 'Food'],
      [{ slot: 'consumable' }, 'Consumable'],
      [{ slot: 'misc', name: 'Scroll: Rope' }, 'Recipe'],
      [{ slot: 'quest' }, 'Quest item'],
      [{ slot: 'misc', isJunk: true }, 'Junk'],
    ];
    for (const [over, word] of words) {
      const view = inspectorView(input(inst(1n, 1n), [tpl(1n, over)]))!;
      expect(view.kicker).toBe(`Common · Tier 1 · ${word}`);
    }
    const named = inspectorView(
      input(inst(1n, 1n, { displayName: 'Stormcaller', qualityTier: 'epic' }), [tpl(1n)]),
    )!;
    expect(named.name).toBe('Stormcaller');
    expect(named.kicker.startsWith('Epic')).toBe(true);
    expect(named.nameColor).toBe('var(--color-rarity-epic)');
  });

  it('returns null while the template has not arrived', () => {
    expect(inspectorView(input(inst(1n, 99n), [tpl(1n)]))).toBeNull();
  });
});

describe('inspectorView meta parts', () => {
  it('shows the type, a short level in the short tone and the craft quality', () => {
    const t = tpl(1n, { requiredLevel: 8n, armorType: 'plate' });
    const view = inspectorView(input(inst(1n, 1n, { craftQuality: 'exquisite' }), [t]))!;
    expect(view.metaParts).toEqual([
      { text: 'Plate', tone: 'normal' },
      { text: 'Requires Lv 8', tone: 'short' },
      { text: 'Exquisite quality', tone: 'craft', craftQuality: 'exquisite' },
    ]);
  });

  it('uses the normal tone when the level is met and omits the requirement at level 1', () => {
    const met = inspectorView(input(inst(1n, 1n), [tpl(1n, { requiredLevel: 5n })]))!;
    expect(met.metaParts.find((p) => p.text === 'Requires Lv 5')?.tone).toBe('normal');
    const none = inspectorView(input(inst(1n, 1n), [tpl(1n, { requiredLevel: 1n })]))!;
    expect(none.metaParts.map((p) => p.text)).toEqual(['Leather']);
    const bare = inspectorView(
      input(inst(1n, 1n), [tpl(1n, { slot: 'material', armorType: '', requiredLevel: 0n })]),
    )!;
    expect(bare.metaParts).toEqual([]);
  });

  it('names the weapon type for a weapon', () => {
    const t = tpl(1n, { slot: 'mainHand', armorType: '', weaponType: 'sword' });
    expect(inspectorView(input(inst(1n, 1n), [t]))!.metaParts[0].text).toBe('Sword');
  });
});

describe('inspectorView comparison', () => {
  const worn = tpl(1n, { name: 'Old Vest', armorClassBonus: 4n });
  const next = tpl(2n, { name: 'New Vest', armorClassBonus: 6n, intBonus: 2n });

  it('compares bag gear with the item equipped in the same slot', () => {
    const wornInst = inst(1n, 1n, { equippedSlot: 'chest' });
    const bagInst = inst(2n, 2n);
    const view = inspectorView(input(bagInst, [worn, next], { items: [wornInst, bagInst] }))!;
    expect(view.caption).toBe('Compared with Old Vest');
    const ac = view.rows.find((r) => r.abbr === 'AC')!;
    expect(ac.valueText).toBe('6');
    expect(ac.markerText).toBe('▲2');
    const int = view.rows.find((r) => r.abbr === 'INT')!;
    expect(int.valueText).toBe('+2');
    expect(int.markerText).toBe('▲2');
  });

  it('shows a loss as a down marker', () => {
    const wornInst = inst(1n, 1n, { equippedSlot: 'chest' });
    const bagInst = inst(2n, 2n);
    const lower = tpl(2n, { armorClassBonus: 1n });
    const view = inspectorView(input(bagInst, [worn, lower], { items: [wornInst, bagInst] }))!;
    expect(view.rows.find((r) => r.abbr === 'AC')!.markerText).toBe('▼3');
  });

  it('says nothing is equipped and marks every stat up', () => {
    const bagInst = inst(2n, 2n);
    const view = inspectorView(input(bagInst, [next], { items: [bagInst] }))!;
    expect(view.caption).toBe('Nothing equipped in Chest');
    expect(view.rows.every((r) => r.marker === 'up')).toBe(true);
  });

  it('compares an off hand only with the off hand slot', () => {
    const shield = tpl(3n, { slot: 'offHand', armorType: 'shield', armorClassBonus: 3n });
    const bigger = tpl(4n, { slot: 'offHand', armorType: 'shield', armorClassBonus: 5n });
    const mainHand = tpl(5n, { slot: 'mainHand', armorClassBonus: 99n });
    const items = [inst(10n, 5n, { equippedSlot: 'mainHand' }), inst(11n, 3n, { equippedSlot: 'offHand' })];
    const bag = inst(12n, 4n);
    const view = inspectorView(input(bag, [shield, bigger, mainHand], { items: [...items, bag] }))!;
    expect(view.rows.find((r) => r.abbr === 'AC')!.markerText).toBe('▲2');
  });

  it('has no caption and no deltas for equipped gear and non-gear items', () => {
    const wornInst = inst(1n, 1n, { equippedSlot: 'chest' });
    const equippedView = inspectorView(input(wornInst, [worn]))!;
    expect(equippedView.caption).toBeNull();
    expect(equippedView.rows.every((r) => r.marker === '')).toBe(true);
    const food = tpl(6n, { slot: 'food', armorType: '', strBonus: 1n });
    const foodView = inspectorView(input(inst(6n, 6n), [food]))!;
    expect(foodView.caption).toBeNull();
    expect(foodView.rows.every((r) => r.marker === '')).toBe(true);
  });

  it('adds the affix magnitudes to the stats and lists one row per affix', () => {
    const bagInst = inst(2n, 2n);
    const affixes = [
      affix(1n, 2n, 'intBonus', 3n, 'prefix', 'Sage'),
      affix(2n, 2n, 'armorClassBonus', 2n, 'implicit', 'Exquisite'),
      affix(3n, 99n, 'strBonus', 9n),
    ];
    const view = inspectorView(input(bagInst, [next], { affixes }))!;
    expect(view.affixRows).toEqual([
      { name: 'Sage', text: '+3 INT' },
      { name: 'Quality', text: '+2 AC' },
    ]);
    expect(view.rows.find((r) => r.abbr === 'AC')!.valueText).toBe('8');
    expect(view.rows.find((r) => r.abbr === 'INT')!.valueText).toBe('+5');
  });

  it('carries the flavor text and hides it when empty', () => {
    const view = inspectorView(input(inst(1n, 1n), [tpl(1n, { description: 'Worn at the seams.' })]))!;
    expect(view.flavor).toBe('Worn at the seams.');
    expect(inspectorView(input(inst(1n, 1n), [tpl(1n, { description: '  ' })]))!.flavor).toBeNull();
    expect(inspectorView(input(inst(1n, 1n), [tpl(1n)]))!.flavor).toBeNull();
  });
});

describe('inspectorView actions', () => {
  it('gives bag gear Equip item (mobile Equip) and Salvage', () => {
    const view = inspectorView(input(inst(1n, 1n), [tpl(1n)]))!;
    expect(view.primary).toEqual({
      kind: 'equip',
      label: 'Equip item',
      mobileLabel: 'Equip',
      available: true,
      reason: null,
    });
    expect(view.salvage.visible).toBe(true);
  });

  it('makes Equip unavailable for a class failure with the type in the reason', () => {
    const armor = inspectorView(
      input(inst(1n, 1n), [tpl(1n, { armorType: 'cloth' })]),
    )!;
    expect(armor.primary!.available).toBe(false);
    expect(armor.primary!.reason).toBe("Your class can't use cloth.");
    const weapon = inspectorView(
      input(inst(1n, 1n), [tpl(1n, { slot: 'mainHand', armorType: '', weaponType: 'staff' })]),
    )!;
    expect(weapon.primary!.reason).toBe("Your class can't use staff.");
  });

  it('never makes Equip unavailable for a level shortfall', () => {
    const view = inspectorView(input(inst(1n, 1n), [tpl(1n, { requiredLevel: 40n })]))!;
    expect(view.primary!.available).toBe(true);
    expect(view.primary!.reason).toBeNull();
    expect(view.metaParts.some((p) => p.tone === 'short')).toBe(true);
  });

  it('gives equipped gear Unequip, unavailable with a full bag', () => {
    const worn = inst(1n, 1n, { equippedSlot: 'chest' });
    const ok = inspectorView(input(worn, [tpl(1n)]))!;
    expect(ok.primary).toMatchObject({ kind: 'unequip', label: 'Unequip item', mobileLabel: 'Unequip', available: true });
    const full = inspectorView(input(worn, [tpl(1n)], { usage: FULL }))!;
    expect(full.primary!.available).toBe(false);
    expect(full.primary!.reason).toBe('Your backpack is full.');
    expect(full.salvage.available).toBe(false);
    expect(full.salvage.reason).toBe('Your backpack is full.');
  });

  it('offers Use only for effectful food and consumables', () => {
    const bread = tpl(1n, { slot: 'food', name: 'Simple Rations', armorType: '' });
    expect(inspectorView(input(inst(1n, 1n), [bread]))!.primary).toMatchObject({
      kind: 'use',
      label: 'Use item',
      mobileLabel: 'Use',
    });
    const torch = tpl(1n, { slot: 'consumable', name: 'Torch', armorType: '' });
    expect(inspectorView(input(inst(1n, 1n), [torch]))!.primary).toBeNull();
    const salvageable = inspectorView(input(inst(1n, 1n), [bread]))!;
    expect(salvageable.salvage.visible).toBe(false);
  });

  it('offers Eat item (mobile Eat) for generated food the use_item keys do not cover (WR-01)', () => {
    const stew = tpl(1n, { slot: 'food', name: 'Hearthstone Stew', armorType: '', wellFedDurationMicros: 60n });
    const view = inspectorView(input(inst(1n, 1n), [stew]))!;
    expect(view.primary).toEqual({
      kind: 'eat',
      label: 'Eat item',
      mobileLabel: 'Eat',
      available: true,
      reason: null,
    });
    expect(view.salvage.visible).toBe(false);
  });

  it('offers Learn recipe for scrolls', () => {
    const scroll = tpl(1n, { slot: 'misc', name: 'Scroll: Rope', armorType: '' });
    expect(inspectorView(input(inst(1n, 1n), [scroll]))!.primary).toMatchObject({
      kind: 'learn',
      label: 'Learn recipe',
    });
  });

  it('offers no primary for materials, junk, quest and other items', () => {
    for (const over of [{ slot: 'material' }, { slot: 'misc', isJunk: true }, { slot: 'quest' }, { slot: 'misc' }]) {
      const view = inspectorView(input(inst(1n, 1n), [tpl(1n, { armorType: '', ...over })]))!;
      expect(view.primary).toBeNull();
      expect(view.salvage.visible).toBe(false);
    }
  });
});

describe('inspectorView salvage', () => {
  it('needs no confirmation for a common bag item', () => {
    const view = inspectorView(input(inst(1n, 1n), [tpl(1n)]))!;
    expect(view.salvage).toEqual({ visible: true, needsConfirm: false, available: true, reason: null });
  });

  it('needs confirmation above common rarity, by template or instance quality', () => {
    expect(inspectorView(input(inst(1n, 1n), [tpl(1n, { rarity: 'uncommon' })]))!.salvage.needsConfirm).toBe(true);
    expect(
      inspectorView(input(inst(1n, 1n, { qualityTier: 'rare' }), [tpl(1n)]))!.salvage.needsConfirm,
    ).toBe(true);
  });

  it('needs confirmation for crafted gear stored as common (CR-01)', () => {
    const crafted = inst(1n, 1n, { qualityTier: 'common', craftQuality: 'exquisite' });
    expect(inspectorView(input(crafted, [tpl(1n)]))!.salvage.needsConfirm).toBe(true);
    const standard = inst(1n, 1n, { craftQuality: 'standard' });
    expect(inspectorView(input(standard, [tpl(1n)]))!.salvage.needsConfirm).toBe(true);
  });

  it('needs confirmation for a common item with a reagent or rolled affix, not an implicit one', () => {
    const bag = inst(1n, 1n);
    const prefixed = [affix(1n, 1n, 'intBonus', 2n, 'prefix', 'Sage')];
    expect(inspectorView(input(bag, [tpl(1n)], { affixes: prefixed }))!.salvage.needsConfirm).toBe(true);
    const implicit = [affix(2n, 1n, 'armorClassBonus', 1n, 'implicit', 'Standard')];
    expect(inspectorView(input(bag, [tpl(1n)], { affixes: implicit }))!.salvage.needsConfirm).toBe(false);
    const other = [affix(3n, 99n, 'intBonus', 2n, 'prefix', 'Sage')];
    expect(inspectorView(input(bag, [tpl(1n)], { affixes: other }))!.salvage.needsConfirm).toBe(false);
  });

  it('needs confirmation for an equipped item even when common', () => {
    const view = inspectorView(input(inst(1n, 1n, { equippedSlot: 'chest' }), [tpl(1n)]))!;
    expect(view.salvage.needsConfirm).toBe(true);
    expect(view.salvage.available).toBe(true);
  });

  it('writes the bag and equipped prompts', () => {
    expect(salvagePrompt('Old Vest', false)).toBe(
      "Salvage Old Vest? It breaks down into materials. This can't be undone.",
    );
    expect(salvagePrompt('Old Vest', true)).toBe(
      "Salvage Old Vest? It's unequipped first, then broken down into materials. This can't be undone.",
    );
  });
});

describe('inspectorView footer', () => {
  it('says quest items cannot be sold', () => {
    const view = inspectorView(input(inst(1n, 1n), [tpl(1n, { slot: 'quest', armorType: '' })]))!;
    expect(view.footer).toEqual({ kind: 'quest', text: "Can't be sold", amount: null });
  });

  it('says what junk sells for', () => {
    const view = inspectorView(
      input(inst(1n, 1n, { quantity: 3n }), [tpl(1n, { slot: 'misc', armorType: '', isJunk: true, vendorValue: 2n })]),
    )!;
    expect(view.footer).toEqual({ kind: 'junk', text: 'Junk. Sells for 6 at a vendor.', amount: 6n });
  });

  it('uses the shared payout with the quantity, the Charisma mod and the renown perk percent', () => {
    const t = tpl(1n, { vendorValue: 40n });
    const withMod = inspectorView(
      input(inst(1n, 1n, { quantity: 2n }), [t], {
        character: { level: 5n, className: 'Warrior', vendorSellMod: 100n },
      }),
    )!;
    expect(withMod.footer.kind).toBe('sell');
    expect(withMod.footer.text).toBe('Sells for');
    expect(withMod.footer.amount).toBe(sellPayout(40n, 2n, 0, 100n));
    expect(withMod.footer.amount).toBe(88n);
    const perked = inspectorView(
      input(inst(1n, 1n), [t], { perkKeys: ['shrewd_bargainer'] }),
    )!;
    expect(perked.footer.amount! >= 40n).toBe(true);
  });
});

describe('dockSummary', () => {
  it('lists the rarity, the slot and the compared stats', () => {
    const worn = tpl(1n, { armorClassBonus: 11n, intBonus: 2n });
    const next = tpl(2n, { rarity: 'rare', armorClassBonus: 14n, intBonus: 3n });
    const wornInst = inst(1n, 1n, { equippedSlot: 'chest' });
    const bagInst = inst(2n, 2n);
    const view = inspectorView(input(bagInst, [worn, next], { items: [wornInst, bagInst] }))!;
    expect(dockSummary(view)).toBe('Rare chest · AC 14 ▲3 · INT +3 ▲1');
  });

  it('keeps at most four stats in the comparison order', () => {
    const rich = tpl(1n, {
      armorClassBonus: 1n,
      strBonus: 1n,
      dexBonus: 1n,
      intBonus: 1n,
      wisBonus: 1n,
    });
    const view = inspectorView(input(inst(1n, 1n), [rich]))!;
    const parts = dockSummary(view).split(' · ');
    expect(parts).toHaveLength(5);
    expect(parts[4]).toContain('INT');
  });

  it('shows only the head for an item without stats', () => {
    const view = inspectorView(input(inst(1n, 1n), [tpl(1n, { slot: 'material', armorType: '' })]))!;
    expect(dockSummary(view)).toBe('Common material');
  });
});
