import { describe, expect, it } from 'vitest';
import { PhCube, PhTShirt } from '@phosphor-icons/vue';
import type { ItemAffix, ItemInstance, ItemTemplate, RecipeTemplate } from '../module_bindings/types';
import { salvagePreview } from '../ledger/salvagePreview';
import {
  SALVAGE_EMPTY,
  SALVAGE_INTRO,
  SALVAGE_NOTHING,
  SALVAGE_UNKNOWN,
  SALVAGE_YIELD_HEADING,
  salvageCountText,
  salvageRows,
  salvageYieldHint,
} from './salvageModel';

function tpl(id: bigint, name: string, overrides: Record<string, unknown> = {}): ItemTemplate {
  return {
    id,
    name,
    slot: 'chest',
    armorType: 'cloth',
    weaponType: '',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 20n,
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

const TEMPLATES = new Map<bigint, ItemTemplate>(
  [
    tpl(1n, 'Linen Vest'),
    tpl(2n, 'Iron Helm', { slot: 'head', armorType: 'plate', tier: 2n }),
    tpl(3n, 'Copper Sword', { slot: 'mainHand', armorType: '', weaponType: 'sword' }),
    tpl(4n, 'Rough Hide', { slot: 'material', armorType: '' }),
    tpl(5n, 'Bandage', { slot: 'consumable', armorType: '' }),
    tpl(6n, 'Broken Cog', { slot: 'chest', isJunk: true }),
    tpl(7n, 'Gilded Vest', { rarity: 'rare' }),
  ].map((t) => [t.id, t]),
);

describe('salvageRows', () => {
  it('lists only non-equipped salvageable gear', () => {
    const rows = salvageRows(
      [
        inst(1n, 1n),
        inst(2n, 2n, { equippedSlot: 'head' }),
        inst(3n, 4n),
        inst(4n, 5n),
        inst(5n, 6n),
        inst(6n, 99n),
        inst(7n, 3n),
      ],
      TEMPLATES,
    );
    expect(rows.map((r) => r.instanceId)).toEqual([7n, 1n]);
  });

  it('sorts by the bag sort: rarity high to low, then name', () => {
    const rows = salvageRows([inst(1n, 1n), inst(2n, 7n), inst(3n, 3n), inst(4n, 2n)], TEMPLATES);
    expect(rows.map((r) => r.name)).toEqual(['Gilded Vest', 'Copper Sword', 'Iron Helm', 'Linen Vest']);
  });

  it('builds the name, color, icon and the Slot, Type, Tier line, omitting absent parts', () => {
    const [helm, vest] = [
      salvageRows([inst(1n, 2n)], TEMPLATES)[0],
      salvageRows([inst(2n, 7n, { displayName: 'Mended Vest' })], TEMPLATES)[0],
    ];
    expect(helm.typeLine).toBe('Head · Plate · Tier 2');
    expect(vest.name).toBe('Mended Vest');
    expect(vest.typeLine).toBe('Chest · Cloth · Tier 1');
    expect(vest.color).toBe('var(--color-rarity-rare)');
    expect(vest.icon).toBe(PhTShirt);
    const noTier = new Map(TEMPLATES);
    noTier.set(8n, tpl(8n, 'Odd Ring', { slot: 'neck', armorType: '', tier: 0n }));
    expect(salvageRows([inst(3n, 8n)], noTier)[0].typeLine).toBe('Neck');
    expect(helm.icon).not.toBe(PhCube);
  });

  it('is empty when nothing can be salvaged', () => {
    expect(salvageRows([], TEMPLATES)).toEqual([]);
    expect(salvageRows([inst(1n, 4n), inst(2n, 5n)], TEMPLATES)).toEqual([]);
  });
});

describe('salvageCountText', () => {
  it('is singular for one', () => {
    expect(salvageCountText(0)).toBe('0 items can be salvaged');
    expect(salvageCountText(1)).toBe('1 item can be salvaged');
    expect(salvageCountText(3)).toBe('3 items can be salvaged');
  });
});

describe('words', () => {
  it('uses the owner chance words', () => {
    expect(SALVAGE_INTRO).toBe('Gear in your bag. Unequip an item to salvage it.');
    expect(SALVAGE_EMPTY).toBe('Nothing left to salvage.');
    expect(SALVAGE_YIELD_HEADING).toBe('May return');
    expect(SALVAGE_NOTHING).toBe('Nothing usable will come of it.');
    expect(SALVAGE_UNKNOWN).toBe('It may return some materials.');
  });
});

describe('salvageYieldHint', () => {
  const yieldRow = { key: 'k', icon: PhCube, iconColor: 'c', name: 'n', note: '', text: 't', chance: true };

  it('says materials may come back while the recipe parts are not known, even with a reagent', () => {
    expect(salvageYieldHint({ knowable: false, yields: [] })).toBe(SALVAGE_UNKNOWN);
    expect(salvageYieldHint({ knowable: false, yields: [yieldRow] })).toBe(SALVAGE_UNKNOWN);
  });

  it('says nothing usable when knowable and no yield', () => {
    expect(salvageYieldHint({ knowable: true, yields: [] })).toBe(SALVAGE_NOTHING);
  });

  it('is empty when knowable and any yield exists', () => {
    expect(salvageYieldHint({ knowable: true, yields: [yieldRow] })).toBe('');
  });

  describe('parity with the shared confirm text', () => {
    const chest = tpl(1n, 'Linen Vest');
    const affixOf: ItemAffix = {
      id: 1n,
      itemInstanceId: 10n,
      affixType: 'suffix',
      affixKey: 'of_intelligence',
      affixName: 'of Intelligence',
      statKey: 'int',
      magnitude: 2n,
    } as unknown as ItemAffix;
    const base = { instance: { id: 10n }, template: chest, characterId: 7n, templates: new Map<bigint, ItemTemplate>() };

    it('not knowable: the confirm holds the hint', () => {
      const preview = salvagePreview({ ...base, affixes: [], outputRecipe: undefined })!;
      expect(preview.knowable).toBe(false);
      expect(preview.confirmText).toContain(salvageYieldHint(preview));
      const withReagent = salvagePreview({ ...base, affixes: [affixOf], outputRecipe: undefined })!;
      expect(withReagent.confirmText).toContain(salvageYieldHint(withReagent));
    });

    it('nothing possible: the confirm holds the hint', () => {
      const parts = new Map<bigint, ItemTemplate>([
        [70n, tpl(70n, 'Rough Hide', { slot: 'material', vendorValue: 2n })],
        [71n, tpl(71n, 'Scrap Cloth', { slot: 'material', vendorValue: 1n })],
      ]);
      const outputRecipe = {
        id: 5n,
        key: 'r',
        name: 'Cloth Robe',
        outputTemplateId: 1n,
        outputCount: 1n,
        req1TemplateId: 70n,
        req1Count: 1n,
        req2TemplateId: 71n,
        req2Count: 1n,
        req3TemplateId: undefined,
        req3Count: undefined,
      } as unknown as RecipeTemplate;
      const preview = salvagePreview({ ...base, affixes: [], outputRecipe, templates: parts })!;
      expect(preview.knowable).toBe(true);
      expect(preview.yields).toEqual([]);
      expect(salvageYieldHint(preview)).toBe(SALVAGE_NOTHING);
      expect(preview.confirmText).toContain(SALVAGE_NOTHING);
    });

    it('neither hint holds a digit', () => {
      expect(SALVAGE_NOTHING).not.toMatch(/\d/);
      expect(SALVAGE_UNKNOWN).not.toMatch(/\d/);
    });
  });
});
