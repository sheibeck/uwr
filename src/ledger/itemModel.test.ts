import { describe, expect, it } from 'vitest';
import {
  PhBelt,
  PhBoot,
  PhBread,
  PhCoatHanger,
  PhCube,
  PhDiamond,
  PhEar,
  PhFlask,
  PhHandFist,
  PhHardHat,
  PhKey,
  PhKnife,
  PhMagicWand,
  PhPackage,
  PhPants,
  PhScroll,
  PhShield,
  PhSword,
  PhTShirt,
  PhWatch,
} from '@phosphor-icons/vue';
import { EQUIPMENT_SLOTS } from '@game-data/mechanical_vocabulary';
import type { ItemInstance, ItemTemplate } from '../module_bindings/types';
import {
  EQUIP_SLOT_ORDER,
  RARITY_ORDER,
  SLOT_LABELS,
  categoryWord,
  compareBagItems,
  itemCategory,
  itemIcon,
  itemName,
  itemRarity,
  nameColor,
  rarityColor,
  rarityLabel,
  ringColor,
  slotLabel,
} from './itemModel';

function tpl(overrides: Record<string, unknown> = {}): ItemTemplate {
  return {
    id: 1n,
    name: 'Thing',
    slot: 'head',
    armorType: 'cloth',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 1n,
    requiredLevel: 1n,
    allowedClasses: '',
    weaponType: '',
    stackable: false,
    wellFedDurationMicros: 0n,
    ...overrides,
  } as unknown as ItemTemplate;
}

function inst(overrides: Record<string, unknown> = {}): ItemInstance {
  return {
    id: 1n,
    templateId: 1n,
    ownerCharacterId: 7n,
    equippedSlot: undefined,
    quantity: 1n,
    qualityTier: undefined,
    craftQuality: undefined,
    displayName: undefined,
    ...overrides,
  } as unknown as ItemInstance;
}

describe('itemName', () => {
  it('uses the instance display name when set, else the template name', () => {
    expect(itemName(inst({ displayName: 'Ashen Blade' }), tpl({ name: 'Sword' }))).toBe('Ashen Blade');
    expect(itemName(inst(), tpl({ name: 'Sword' }))).toBe('Sword');
    expect(itemName(inst({ displayName: '' }), tpl({ name: 'Sword' }))).toBe('Sword');
  });
});

describe('itemRarity and colors', () => {
  it('prefers the instance quality tier and lowercases', () => {
    expect(itemRarity(inst({ qualityTier: 'Epic' }), tpl({ rarity: 'common' }))).toBe('epic');
    expect(itemRarity(inst(), tpl({ rarity: 'Rare' }))).toBe('rare');
  });

  it('treats unknown or missing rarity as common', () => {
    expect(itemRarity(inst(), tpl({ rarity: 'mythic' }))).toBe('common');
    expect(itemRarity(null, null)).toBe('common');
  });

  it('maps each rarity to its token and anything else to common', () => {
    for (const r of RARITY_ORDER) expect(rarityColor(r)).toBe(`var(--color-rarity-${r})`);
    expect(rarityColor('nonsense')).toBe('var(--color-rarity-common)');
    expect(rarityLabel('rare')).toBe('Rare');
  });

  it('names junk in neutral 400', () => {
    expect(nameColor('rare', true)).toBe('var(--color-neutral-400)');
    expect(nameColor('rare', false)).toBe('var(--color-rarity-rare)');
  });

  it('rings: common dim at rest and bright selected, others their token, junk dimmest', () => {
    expect(ringColor('common')).toBe('var(--color-neutral-600)');
    expect(ringColor('common', { selected: true })).toBe('var(--color-rarity-common)');
    expect(ringColor('epic')).toBe('var(--color-rarity-epic)');
    expect(ringColor('epic', { selected: true })).toBe('var(--color-rarity-epic)');
    expect(ringColor('rare', { junk: true })).toBe('var(--color-neutral-700)');
    expect(ringColor('common', { junk: true, selected: true })).toBe('var(--color-neutral-700)');
  });
});

describe('itemCategory', () => {
  it('follows the UI-SPEC rule order', () => {
    expect(itemCategory(tpl({ slot: 'quest', isJunk: true }))).toBe('quest');
    expect(itemCategory(tpl({ slot: 'head', isJunk: true }))).toBe('junk');
    expect(itemCategory(tpl({ slot: 'mainHand' }))).toBe('gear');
    expect(itemCategory(tpl({ slot: 'food' }))).toBe('food');
    expect(itemCategory(tpl({ slot: 'consumable' }))).toBe('food');
    expect(itemCategory(tpl({ slot: 'misc', wellFedDurationMicros: 5n }))).toBe('food');
    expect(itemCategory(tpl({ slot: 'misc', name: 'Scroll: Bread' }))).toBe('recipe');
    expect(itemCategory(tpl({ slot: 'material' }))).toBe('material');
    expect(itemCategory(tpl({ slot: 'resource' }))).toBe('material');
    expect(itemCategory(tpl({ slot: 'misc' }))).toBe('other');
  });

  it('gives the category words', () => {
    expect(categoryWord(tpl({ slot: 'material' }))).toBe('Material');
    expect(categoryWord(tpl({ slot: 'food' }))).toBe('Food');
    expect(categoryWord(tpl({ slot: 'misc', wellFedDurationMicros: 9n }))).toBe('Food');
    expect(categoryWord(tpl({ slot: 'consumable' }))).toBe('Consumable');
    expect(categoryWord(tpl({ slot: 'misc', name: 'Scroll: X' }))).toBe('Recipe');
    expect(categoryWord(tpl({ slot: 'quest' }))).toBe('Quest item');
    expect(categoryWord(tpl({ isJunk: true }))).toBe('Junk');
    expect(categoryWord(tpl({ slot: 'head' }))).toBe('');
  });
});

describe('itemIcon', () => {
  it('picks the main-hand icon by weapon type', () => {
    expect(itemIcon(tpl({ slot: 'mainHand', weaponType: 'staff' }))).toBe(PhMagicWand);
    expect(itemIcon(tpl({ slot: 'mainHand', weaponType: 'wand' }))).toBe(PhMagicWand);
    expect(itemIcon(tpl({ slot: 'mainHand', weaponType: 'dagger' }))).toBe(PhKnife);
    expect(itemIcon(tpl({ slot: 'mainHand', weaponType: 'rapier' }))).toBe(PhKnife);
    expect(itemIcon(tpl({ slot: 'mainHand', weaponType: 'sword' }))).toBe(PhSword);
    expect(itemIcon(tpl({ slot: 'mainHand', weaponType: '' }))).toBe(PhSword);
  });

  it('picks one icon per armor and accessory slot', () => {
    const bySlot: Array<[string, unknown]> = [
      ['offHand', PhShield],
      ['head', PhHardHat],
      ['chest', PhTShirt],
      ['legs', PhPants],
      ['boots', PhBoot],
      ['hands', PhHandFist],
      ['wrists', PhWatch],
      ['belt', PhBelt],
      ['neck', PhDiamond],
      ['earrings', PhEar],
      ['cloak', PhCoatHanger],
    ];
    for (const [slot, icon] of bySlot) expect(itemIcon(tpl({ slot }))).toBe(icon);
  });

  it('picks the non-gear icons', () => {
    expect(itemIcon(tpl({ slot: 'material' }))).toBe(PhCube);
    expect(itemIcon(tpl({ slot: 'food' }))).toBe(PhBread);
    expect(itemIcon(tpl({ slot: 'misc', wellFedDurationMicros: 9n }))).toBe(PhBread);
    expect(itemIcon(tpl({ slot: 'consumable' }))).toBe(PhFlask);
    expect(itemIcon(tpl({ slot: 'misc', name: 'Scroll: X' }))).toBe(PhScroll);
    expect(itemIcon(tpl({ slot: 'quest' }))).toBe(PhKey);
    expect(itemIcon(tpl({ isJunk: true }))).toBe(PhPackage);
    expect(itemIcon(tpl({ slot: 'misc' }))).toBe(PhPackage);
  });
});

describe('slot labels and order', () => {
  it('labels the 12 slots with the UI-SPEC words', () => {
    expect(SLOT_LABELS).toEqual({
      head: 'Head',
      neck: 'Neck',
      earrings: 'Earrings',
      cloak: 'Cloak',
      chest: 'Chest',
      wrists: 'Wrists',
      hands: 'Hands',
      belt: 'Belt',
      legs: 'Legs',
      boots: 'Boots',
      mainHand: 'Main hand',
      offHand: 'Off hand',
    });
    expect(slotLabel('mainHand')).toBe('Main hand');
    expect(slotLabel('constructor')).toBe('');
    expect(slotLabel('food')).toBe('');
  });

  it('orders the grid and covers exactly the server equipment slots', () => {
    expect(EQUIP_SLOT_ORDER.map((slot) => SLOT_LABELS[slot])).toEqual([
      'Head',
      'Neck',
      'Earrings',
      'Cloak',
      'Chest',
      'Wrists',
      'Hands',
      'Belt',
      'Legs',
      'Boots',
      'Main hand',
      'Off hand',
    ]);
    expect([...EQUIP_SLOT_ORDER].sort()).toEqual([...EQUIPMENT_SLOTS].sort());
  });
});

describe('compareBagItems', () => {
  const entry = (id: bigint, t: Record<string, unknown>, i: Record<string, unknown> = {}) => ({
    instance: inst({ id, ...i }),
    template: tpl(t),
  });

  function sorted(entries: ReturnType<typeof entry>[]): bigint[] {
    return [...entries].sort(compareBagItems).map((e) => e.instance.id);
  }

  it('sorts by category, then rarity high to low, then name, then id', () => {
    const list = [
      entry(1n, { slot: 'quest', name: 'Q' }),
      entry(2n, { isJunk: true, name: 'J' }),
      entry(3n, { slot: 'misc', name: 'Odd' }),
      entry(4n, { slot: 'misc', name: 'Scroll: A' }),
      entry(5n, { slot: 'food', name: 'Bread' }),
      entry(6n, { slot: 'material', name: 'Ore' }),
      entry(7n, { slot: 'head', name: 'Cap', rarity: 'common' }),
      entry(8n, { slot: 'head', name: 'Zed', rarity: 'epic' }),
      entry(9n, { slot: 'head', name: 'Abe', rarity: 'common' }),
      entry(10n, { slot: 'head', name: 'Abe', rarity: 'common' }),
    ];
    expect(sorted(list)).toEqual([8n, 9n, 10n, 7n, 6n, 5n, 4n, 3n, 1n, 2n]);
  });

  it('uses the instance quality tier for rarity and the display name for the name', () => {
    const list = [
      entry(1n, { slot: 'head', name: 'B', rarity: 'common' }, { qualityTier: 'rare' }),
      entry(2n, { slot: 'head', name: 'A', rarity: 'uncommon' }),
      entry(3n, { slot: 'head', name: 'Z', rarity: 'common' }, { displayName: 'A' }),
    ];
    expect(sorted(list)).toEqual([1n, 2n, 3n]);
  });

  it('never infers recency from an id (id is only the last tie-break)', () => {
    const list = [
      entry(900n, { slot: 'head', name: 'Aa' }),
      entry(1n, { slot: 'head', name: 'Bb' }),
    ];
    expect(sorted(list)).toEqual([900n, 1n]);
  });
});
