import { describe, expect, it } from 'vitest';
import {
  PhBread,
  PhCube,
  PhKnife,
  PhMagnifyingGlass,
  PhPackage,
  PhScroll,
} from '@phosphor-icons/vue';
import { encodeResultLines } from '@game-data/action_result';
import type { ResultLine } from '@game-data/action_result';
import type { ActionResult, ItemAffix, ItemInstance, ItemTemplate } from '../module_bindings/types';
import { nameColor } from './itemModel';
import { resultCardView } from './resultCard';

function tpl(id: bigint, overrides: Record<string, unknown> = {}): ItemTemplate {
  return {
    id,
    name: `Template ${id}`,
    slot: 'material',
    armorType: 'none',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 2n,
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

function line(kind: ResultLine['kind'], templateId: bigint, name: string, quantity: bigint, total: bigint, instanceId: bigint | null = null): ResultLine {
  return { kind, templateId, name, quantity, total, instanceId };
}

function row(overrides: Record<string, unknown> = {}): ActionResult {
  return {
    characterId: 7n,
    seq: 4n,
    kind: 'craft',
    templateId: undefined,
    itemInstanceId: undefined,
    itemName: 'Herbal Draught',
    rarity: 'common',
    craftQuality: undefined,
    quantity: 1n,
    recipeTemplateId: undefined,
    craftCount: 0n,
    linesJson: '[]',
    at: {},
    ...overrides,
  } as unknown as ActionResult;
}

function instance(id: bigint, templateId: bigint, extra: Record<string, unknown> = {}): ItemInstance {
  return {
    id,
    templateId,
    ownerCharacterId: 7n,
    equippedSlot: undefined,
    quantity: 1n,
    qualityTier: undefined,
    craftQuality: undefined,
    displayName: undefined,
    ...extra,
  } as unknown as ItemInstance;
}

function affix(instanceId: bigint, statKey: string, magnitude: bigint): ItemAffix {
  return {
    id: 1n,
    itemInstanceId: instanceId,
    affixType: 'implicit',
    affixKey: 'q',
    affixName: 'Quality',
    statKey,
    magnitude,
  } as unknown as ItemAffix;
}

const FOOD = tpl(30n, {
  name: 'Herbal Draught',
  slot: 'food',
  stackable: true,
  wellFedDurationMicros: 600_000_000n,
  wellFedBuffType: 'str',
  wellFedBuffMagnitude: 1n,
});
const HERBS = tpl(40n, { name: 'Herbs' });
const WATER = tpl(41n, { name: 'Water' });
const DAGGER = tpl(50n, {
  name: 'Iron Dagger',
  slot: 'mainHand',
  weaponType: 'dagger',
  weaponBaseDamage: 4n,
  weaponDps: 5n,
});
const ORE = tpl(60n, { name: 'Copper Ore' });
const RUNE = tpl(61n, { name: 'Ancient Rune', rarity: 'rare' });
const SCROLL = tpl(62n, { name: 'Scroll: X' });

function templates(...list: ItemTemplate[]): ReadonlyMap<bigint, ItemTemplate> {
  return new Map(list.map((t) => [t.id, t]));
}

const NO_ITEMS: ItemInstance[] = [];
const NO_AFFIXES: ItemAffix[] = [];

describe('resultCardView: craft', () => {
  const craftRow = (extra: Record<string, unknown> = {}) =>
    row({
      kind: 'craft',
      templateId: 30n,
      itemName: 'Herbal Draught',
      quantity: 3n,
      recipeTemplateId: 12n,
      craftCount: 3n,
      linesJson: encodeResultLines([
        line('used', 40n, 'Herbs', 6n, 10n),
        line('used', 41n, 'Water', 3n, 4n),
      ]),
      ...extra,
    });

  it('shows what was crafted and what was used', () => {
    const view = resultCardView({
      row: craftRow(),
      templates: templates(FOOD, HERBS, WATER),
      items: NO_ITEMS,
      affixes: NO_AFFIXES,
    });
    expect(view.kind).toBe('craft');
    expect(view.seq).toBe(4n);
    expect(view.kicker).toBe('Crafted');
    expect(view.title).toBe('Herbal Draught');
    expect(view.qtyTag).toBe('x3');
    expect(view.sub).toBe('3 added to your bag');
    expect(view.icon).toBe(PhBread);
    expect(view.listTitle).toBe('Used');
    expect(view.lines.map((l) => l.qtyText)).toEqual(['−6', '−3']);
    expect(view.lines.map((l) => l.name)).toEqual(['Herbs', 'Water']);
    expect(view.lines.every((l) => l.tone === 'used' && l.tag === '' && l.ring === false)).toBe(true);
    expect(view.lines.every((l) => l.totalText === '')).toBe(true);
    expect(view.footer).toBe('Items went to your backpack. Also written to your log.');
    expect(view.announce).toBe('Crafted 3 Herbal Draught.');
    expect(view.recipeTemplateId).toBe(12n);
    expect(view.craftCount).toBe(3n);
    expect(view.scrollInstanceId).toBeNull();
    expect(view.equipInstanceId).toBeNull();
  });

  it('shows the food effect from the template', () => {
    const view = resultCardView({
      row: craftRow(),
      templates: templates(FOOD, HERBS, WATER),
      items: NO_ITEMS,
      affixes: NO_AFFIXES,
    });
    expect(view.effect).toBe('Eat to be well fed: +1 strength.');
    expect(view.stats).toEqual([]);
  });

  it('drops the count for a single craft', () => {
    const view = resultCardView({
      row: craftRow({ quantity: 1n }),
      templates: templates(FOOD),
      items: NO_ITEMS,
      affixes: NO_AFFIXES,
    });
    expect(view.qtyTag).toBe('');
    expect(view.sub).toBe('Added to your bag');
    expect(view.announce).toBe('Crafted Herbal Draught.');
  });

  it('uses the crafted instance for gear stats, quality and the Equip id', () => {
    const view = resultCardView({
      row: craftRow({
        templateId: 50n,
        itemName: 'Iron Dagger',
        quantity: 1n,
        craftQuality: 'reinforced',
        itemInstanceId: 90n,
        rarity: 'uncommon',
        linesJson: '[]',
      }),
      templates: templates(DAGGER),
      items: [instance(90n, 50n)],
      affixes: [affix(90n, 'weaponBaseDamage', 2n), affix(91n, 'weaponBaseDamage', 9n)],
    });
    expect(view.sub).toBe('Added to your bag · Reinforced quality');
    expect(view.stats.map((s) => `${s.label} ${s.text}`)).toEqual(['Damage 6', 'DPS 5']);
    expect(view.equipInstanceId).toBe(90n);
    expect(view.icon).toBe(PhKnife);
    expect(view.titleColor).toBe(nameColor('uncommon', false));
  });

  it('falls back to the template stats and no Equip when the instance is gone', () => {
    const view = resultCardView({
      row: craftRow({
        templateId: 50n,
        itemName: 'Iron Dagger',
        quantity: 1n,
        itemInstanceId: 90n,
        linesJson: '[]',
      }),
      templates: templates(DAGGER),
      items: NO_ITEMS,
      affixes: [affix(90n, 'weaponBaseDamage', 2n)],
    });
    expect(view.equipInstanceId).toBeNull();
    expect(view.stats.map((s) => `${s.label} ${s.text}`)).toEqual(['Damage 4', 'DPS 5']);
  });

  it('uses the package icon while the template has not arrived', () => {
    const view = resultCardView({
      row: craftRow({ linesJson: encodeResultLines([line('used', 40n, 'Herbs', 6n, 10n)]) }),
      templates: templates(),
      items: NO_ITEMS,
      affixes: NO_AFFIXES,
    });
    expect(view.icon).toBe(PhPackage);
    expect(view.lines[0].icon).toBe(PhPackage);
    expect(view.effect).toBeNull();
    expect(view.stats).toEqual([]);
  });
});

describe('resultCardView: salvage', () => {
  const salvageRow = (lines: ResultLine[], extra: Record<string, unknown> = {}) =>
    row({
      kind: 'salvage',
      templateId: 50n,
      itemName: 'Iron Dagger',
      quantity: 1n,
      linesJson: encodeResultLines(lines),
      ...extra,
    });
  const lines = [
    line('received', 60n, 'Copper Ore', 2n, 6n),
    line('bonus', 61n, 'Ancient Rune', 1n, 1n),
    line('scroll', 62n, 'Scroll: X', 1n, 1n, 55n),
  ];

  it('lists what was received with the totals and tags only where the server reports them', () => {
    const view = resultCardView({
      row: salvageRow(lines),
      templates: templates(DAGGER, ORE, RUNE, SCROLL),
      items: [instance(55n, 62n)],
      affixes: NO_AFFIXES,
    });
    expect(view.kicker).toBe('Salvaged');
    expect(view.title).toBe('Iron Dagger');
    expect(view.sub).toBe('Broken down into materials');
    expect(view.listTitle).toBe('Received');
    expect(view.lines.map((l) => l.qtyText)).toEqual(['+2', '+1', '+1']);
    expect(view.lines.map((l) => l.totalText)).toEqual(['now 6', 'now 1', 'now 1']);
    expect(view.lines.map((l) => l.tag)).toEqual(['', 'Bonus', 'Recipe found']);
    expect(view.lines.map((l) => l.ring)).toEqual([false, true, true]);
    expect(view.lines.every((l) => l.tone === 'gain')).toBe(true);
    expect(view.lines[0].icon).toBe(PhCube);
    expect(view.lines[2].icon).toBe(PhScroll);
    expect(view.lines[2].iconColor).toBe('var(--color-accent)');
    expect(view.lines[1].iconColor).toBe(nameColor('rare', false));
    expect(view.scrollInstanceId).toBe(55n);
    expect(view.announce).toBe(
      'Salvaged Iron Dagger. Received 2 Copper Ore, 1 Ancient Rune, 1 Scroll: X.',
    );
    expect(view.footer).toBe('Materials went to your backpack. Also written to your log.');
    expect(view.emptyText).toBe('');
    expect(view.equipInstanceId).toBeNull();
    expect(view.stats).toEqual([]);
    expect(view.effect).toBeNull();
  });

  it('offers no scroll action when the scroll row is not in the bag', () => {
    const view = resultCardView({
      row: salvageRow(lines),
      templates: templates(DAGGER, ORE),
      items: NO_ITEMS,
      affixes: NO_AFFIXES,
    });
    expect(view.scrollInstanceId).toBeNull();
  });

  it('says so when nothing usable was left', () => {
    const view = resultCardView({
      row: salvageRow([]),
      templates: templates(DAGGER),
      items: NO_ITEMS,
      affixes: NO_AFFIXES,
    });
    expect(view.lines).toEqual([]);
    expect(view.emptyText).toBe('Nothing usable was left.');
    expect(view.announce).toBe('Salvaged Iron Dagger. Nothing usable was left.');
    // WR-01 (iteration 3): an empty roll never claims materials, in the sub (the dialog's description)
    // or the footer.
    expect(view.sub).toBe('Nothing usable was left');
    expect(view.footer).toBe('Also written to your log.');
    for (const text of [view.sub, view.footer, view.announce]) expect(text).not.toMatch(/materials/i);
  });

  it('says only a scroll came back when the scroll is the one line', () => {
    const view = resultCardView({
      row: salvageRow([line('scroll', 62n, 'Scroll: X', 1n, 1n, 55n)]),
      templates: templates(DAGGER, SCROLL),
      items: [instance(55n, 62n)],
      affixes: NO_AFFIXES,
    });
    expect(view.sub).toBe('Only a recipe scroll came back');
    expect(view.footer).toBe('The scroll went to your backpack. Also written to your log.');
    expect(view.emptyText).toBe('');
    expect(view.scrollInstanceId).toBe(55n);
  });
});

describe('resultCardView: discover', () => {
  it('says nothing new with a tip', () => {
    const view = resultCardView({
      row: row({ kind: 'discover', itemName: '', quantity: 0n }),
      templates: templates(),
      items: NO_ITEMS,
      affixes: NO_AFFIXES,
    });
    expect(view.kind).toBe('discover');
    expect(view.kicker).toBe('Discover recipes');
    expect(view.title).toBe('Nothing new');
    expect(view.sub).toBe('You already know every recipe your materials allow.');
    expect(view.listTitle).toBe('Tip');
    expect(view.lines.map((l) => l.name)).toEqual(['Gather other materials to find new recipes.']);
    expect(view.lines[0].icon).toBe(PhCube);
    expect(view.footer).toBe('Also written to your log.');
    expect(view.icon).toBe(PhMagnifyingGlass);
    expect(view.iconColor).toBe('var(--color-accent)');
    expect(view.announce).toBe('Discover recipes found nothing new.');
    expect(view.qtyTag).toBe('');
  });

  it('lists the recipes found', () => {
    const found = [line('recipe', 30n, 'Herbal Draught', 1n, 1n), line('recipe', 50n, 'Iron Dagger', 1n, 1n)];
    const view = resultCardView({
      row: row({ kind: 'discover', itemName: '', quantity: 2n, linesJson: encodeResultLines(found) }),
      templates: templates(),
      items: NO_ITEMS,
      affixes: NO_AFFIXES,
    });
    expect(view.title).toBe('2 new recipes');
    expect(view.sub).toBe('Added to your recipes.');
    expect(view.listTitle).toBe('Found');
    expect(view.lines.map((l) => l.name)).toEqual(['Herbal Draught', 'Iron Dagger']);
    expect(view.lines.every((l) => l.icon === PhScroll)).toBe(true);
    expect(view.icon).toBe(PhMagnifyingGlass);
    expect(view.announce).toBe('Discover recipes found 2 new recipes: Herbal Draught, Iron Dagger.');
  });

  it('writes one recipe in the singular', () => {
    const view = resultCardView({
      row: row({
        kind: 'discover',
        itemName: '',
        quantity: 1n,
        linesJson: encodeResultLines([line('recipe', 30n, 'Herbal Draught', 1n, 1n)]),
      }),
      templates: templates(),
      items: NO_ITEMS,
      affixes: NO_AFFIXES,
    });
    expect(view.title).toBe('1 new recipe');
  });
});

describe('resultCardView: decoding and text', () => {
  it('gives no lines for a malformed linesJson and never throws', () => {
    for (const bad of ['', 'not json', '{"a":1}', '[1,2,null]', '[{"kind":"zzz"}]']) {
      const view = resultCardView({
        row: row({ kind: 'craft', templateId: 30n, linesJson: bad }),
        templates: templates(FOOD),
        items: NO_ITEMS,
        affixes: NO_AFFIXES,
      });
      expect(view.lines).toEqual([]);
    }
  });

  it('carries markup in names as a plain string', () => {
    const markup = '<img src=x onerror=alert(1)>';
    const view = resultCardView({
      row: row({
        kind: 'craft',
        itemName: markup,
        linesJson: encodeResultLines([line('used', 40n, markup, 1n, 1n)]),
      }),
      templates: templates(),
      items: NO_ITEMS,
      affixes: NO_AFFIXES,
    });
    expect(view.title).toBe(markup);
    expect(view.lines[0].name).toBe(markup);
    expect(view.announce).toBe(`Crafted ${markup}.`);
  });

  it('gives a neutral card for an unknown kind', () => {
    const view = resultCardView({
      row: row({ kind: 'mystery', itemName: 'Thing' }),
      templates: templates(),
      items: NO_ITEMS,
      affixes: NO_AFFIXES,
    });
    expect(view.kind).toBe('mystery');
    expect(view.kicker).toBe('Done');
    expect(view.lines).toEqual([]);
  });
});
