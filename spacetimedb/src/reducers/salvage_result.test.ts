/**
 * Salvage and Discover result rows through the REAL handlers (Phase 50 plan 30). salvage_item and
 * research_recipes are captured from index.ts and run on the strict mock db. Checks:
 *   - an equipped item is refused with 'Unequip item first' before any write (T-50-127);
 *   - a salvage writes the character's action_result row from what the server actually granted:
 *     'received' for the guaranteed material, 'bonus' for a reagent, 'scroll' for a recipe scroll,
 *     and the bonus and scroll lines exist only when the server granted them (T-50-128);
 *   - salvage_item grants exactly what salvageMaterialYield says (T-50-126);
 *   - Discover recipes writes kind 'discover' with one 'recipe' line per find, none when nothing is
 *     new, and no row without a station.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import {
  CRAFTING_MODIFIER_DEFS,
  SALVAGE_REAGENT_CHANCE_PCT,
  salvageMaterialYield,
  salvageReagentDefs,
} from '../data/crafting_rules';
import { decodeResultLines } from '../data/action_result';
import { INT_SALVAGE_BONUS_PER_POINT, SALVAGE_SCROLL_CHANCE_BASE, statOffset } from '../data/combat_scaling';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

let salvage: (...args: any[]) => any;
let research: (...args: any[]) => any;

function capture(name: string): (...args: any[]) => any {
  const h = capturedReducer(name);
  if (typeof h !== 'function') {
    throw new Error(
      `capturedReducer('${name}') is not a function: the schema recorder could not capture the ` +
        'reducer from index.ts. STOP and report; never edit production code to fix this.',
    );
  }
  return h as (...args: any[]) => any;
}

beforeAll(async () => {
  await import('../index');
  salvage = capture('salvage_item');
  research = capture('research_recipes');
}, 120_000);

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const clone = <T>(v: T): T => structuredClone(v);
const messages = (ctx: any): string[] => rows(ctx, 'event_private').map((e) => e.message);

const baseTemplate = {
  slot: 'material',
  stackable: true,
  armorType: 'none',
  rarity: 'common',
  tier: 1n,
  isJunk: false,
  vendorValue: 1n,
  strBonus: 0n,
  dexBonus: 0n,
  intBonus: 0n,
  wisBonus: 0n,
  chaBonus: 0n,
  hpBonus: 0n,
  manaBonus: 0n,
  armorClassBonus: 0n,
  magicResistanceBonus: 0n,
  weaponBaseDamage: 0n,
  weaponDps: 0n,
  weaponType: '',
  requiredLevel: 1n,
  allowedClasses: 'any',
};
const tpl = (id: bigint, name: string, over: Record<string, unknown> = {}) => ({ ...baseTemplate, id, name, ...over });

// The nine salvage materials and their vendor values, as the tier table names them.
const MATERIALS: Array<[bigint, string, bigint]> = [
  [51n, 'Rough Hide', 2n],
  [50n, 'Copper Ore', 2n],
  [70n, 'Iron Ore', 4n],
  [71n, 'Darksteel Ore', 8n],
  [72n, 'Tanned Leather', 4n],
  [73n, 'Shadowhide', 8n],
  [74n, 'Bone Shard', 2n],
  [75n, 'Spirit Essence', 5n],
  [76n, 'Void Crystal', 10n],
];
const HIDE = 51n;
const COPPER = 50n;
const reagentTemplates = () =>
  CRAFTING_MODIFIER_DEFS.map((d, i) => tpl(200n + BigInt(i), d.name, { vendorValue: 3n }));
const reagentId = (name: string) => 200n + BigInt(CRAFTING_MODIFIER_DEFS.findIndex((d) => d.name === name));

const CHEST = 10n;
const SCROLL = 300n;
const gearTemplate = (over: Record<string, unknown> = {}) =>
  tpl(CHEST, 'Frayed Robe', {
    slot: 'chest',
    armorType: 'cloth',
    stackable: false,
    vendorValue: 20n,
    rarity: 'uncommon',
    ...over,
  });
const baseTemplates = () => [
  ...MATERIALS.map(([id, name, vv]) => tpl(id, name, { vendorValue: vv })),
  ...reagentTemplates(),
  gearTemplate(),
];

const INT = 18n;
const SCROLL_CHANCE = (() => {
  const raw = SALVAGE_SCROLL_CHANCE_BASE + statOffset(INT, INT_SALVAGE_BONUS_PER_POINT);
  return raw < 5n ? 5n : raw > 95n ? 95n : raw;
})();

const INSTANCE = 500n;
const instance = (over: Record<string, unknown> = {}) => ({
  id: INSTANCE,
  templateId: CHEST,
  ownerCharacterId: 1n,
  equippedSlot: undefined,
  quantity: 1n,
  qualityTier: 'rare',
  craftQuality: 'sturdy',
  displayName: undefined,
  ...over,
});

const stack = (id: bigint, templateId: bigint, quantity: bigint) => ({
  id,
  templateId,
  ownerCharacterId: 1n,
  equippedSlot: undefined,
  quantity,
});

const craftRow = () => ({
  characterId: 1n,
  seq: 4n,
  kind: 'craft',
  templateId: 1n,
  itemInstanceId: 2n,
  itemName: 'Old',
  rarity: 'common',
  craftQuality: 'sturdy',
  quantity: 3n,
  recipeTemplateId: 3n,
  craftCount: 3n,
  linesJson: '[]',
  at: { microsSinceUnixEpoch: T0 - 1n },
});

// A recipe that makes the chest: Rough Hide x3 + Scrap Cloth x1 (consumed Rough Hide = 3).
const chestRecipe = (over: Record<string, unknown> = {}) => ({
  id: 900n,
  key: 'k',
  name: 'Frayed Robe Pattern',
  recipeType: 'armor',
  req1TemplateId: HIDE,
  req1Count: 3n,
  req2TemplateId: COPPER,
  req2Count: 1n,
  req3TemplateId: undefined,
  req3Count: undefined,
  outputTemplateId: CHEST,
  outputCount: 1n,
  ...over,
});

interface Opts {
  templates?: any[];
  instances?: any[];
  affixes?: any[];
  recipes?: any[];
  actionResults?: any[];
  at?: bigint;
  ts?: bigint;
}
function newCtx(opts: Opts = {}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [
        { id: 1n, ownerUserId: 7n, name: 'Mirel', className: 'Ashwarden', level: 5n, int: INT, gold: 10n, locationId: 10n },
      ],
      location: [{ id: 10n, name: 'Saltmere', craftingAvailable: true }],
      item_template: opts.templates ?? baseTemplates(),
      item_instance: opts.instances ?? [instance()],
      item_affix: opts.affixes ?? [],
      recipe_template: opts.recipes ?? [],
      recipe_discovered: [],
      action_result: opts.actionResults ?? [],
    },
    sender: alice,
    timestampMicros: opts.ts ?? T0,
    strict: true,
  });
}
const setTs = (ctx: any, ts: bigint) => {
  ctx.timestamp = { microsSinceUnixEpoch: ts };
};

// A timestamp whose reagent roll, (ts + instanceId * 13) % 100, equals `roll`.
const tsForReagentRoll = (instanceId: bigint, roll: bigint, base = T0 + 5_000_000n) =>
  base + ((100n + roll - ((base + instanceId * 13n) % 100n)) % 100n);
// A timestamp whose scroll roll, (ts + characterId) % 100, equals `roll`.
const tsForScrollRoll = (characterId: bigint, roll: bigint, base = T0 + 5_000_000n) =>
  base + ((100n + roll - ((base + characterId) % 100n)) % 100n);

const bag = (ctx: any, templateId: bigint): bigint =>
  rows(ctx, 'item_instance')
    .filter((i) => i.templateId === templateId && !i.equippedSlot)
    .reduce((sum, i) => sum + (i.quantity ?? 1n), 0n);

const salvageIt = (ctx: any, id = INSTANCE) => salvage(ctx, { characterId: 1n, itemInstanceId: id });
const resultOf = (ctx: any) => {
  const all = rows(ctx, 'action_result');
  expect(all).toHaveLength(1);
  return { row: all[0], lines: decodeResultLines(all[0].linesJson) };
};

describe('salvage_item refuses an equipped item', () => {
  it('writes one system line and changes nothing', () => {
    const ctx = newCtx({
      instances: [instance({ equippedSlot: 'chest' })],
      affixes: [{ id: 1n, itemInstanceId: INSTANCE, affixType: 'suffix', affixKey: 'k', affixName: 'of Strength', statKey: 'strBonus', magnitude: 2n }],
      actionResults: [craftRow()],
    });
    const before = clone({
      item_instance: rows(ctx, 'item_instance'),
      item_affix: rows(ctx, 'item_affix'),
      action_result: rows(ctx, 'action_result'),
    });
    setTs(ctx, tsForReagentRoll(INSTANCE, 0n));
    salvageIt(ctx);
    expect({
      item_instance: rows(ctx, 'item_instance'),
      item_affix: rows(ctx, 'item_affix'),
      action_result: rows(ctx, 'action_result'),
    }).toEqual(before);
    const events = rows(ctx, 'event_private');
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('system');
    expect(events[0].message).toBe('Unequip item first');
  });
});

describe('salvage_item result row: the guaranteed material', () => {
  it('writes one received line with the bag total and the item facts', () => {
    const ctx = newCtx({ instances: [instance(), stack(501n, HIDE, 3n)] });
    salvageIt(ctx);
    const expected = salvageMaterialYield({
      slot: 'chest',
      armorType: 'cloth',
      tier: 1n,
      itemValue: 20n,
      material: { name: 'Rough Hide', vendorValue: 2n },
      recipeConsumed: 0n,
    })!;
    expect(expected.count).toBe(2n);
    expect(bag(ctx, HIDE)).toBe(3n + expected.count);
    expect(rows(ctx, 'item_instance').some((i) => i.id === INSTANCE)).toBe(false);
    expect(rows(ctx, 'item_affix')).toHaveLength(0);
    expect(messages(ctx)).toEqual(['You salvaged Frayed Robe and received 2x Rough Hide.']);
    expect(rows(ctx, 'event_private')[0].kind).toBe('reward');

    const { row, lines } = resultOf(ctx);
    expect(row.characterId).toBe(1n);
    expect(row.seq).toBe(1n);
    expect(row.kind).toBe('salvage');
    expect(row.templateId).toBe(CHEST);
    expect(row.itemInstanceId).toBeUndefined();
    expect(row.itemName).toBe('Frayed Robe');
    expect(row.rarity).toBe('rare');
    expect(row.craftQuality).toBe('sturdy');
    expect(row.quantity).toBe(1n);
    expect(row.recipeTemplateId).toBeUndefined();
    expect(row.craftCount).toBe(0n);
    expect(lines).toEqual([
      { kind: 'received', templateId: HIDE, name: 'Rough Hide', quantity: 2n, total: 5n, instanceId: null },
    ]);
  });

  it("names the item's displayName and falls back to the template rarity", () => {
    const ctx = newCtx({
      instances: [instance({ displayName: 'Frayed Robe of Strength', qualityTier: undefined, craftQuality: undefined })],
    });
    salvageIt(ctx);
    const { row } = resultOf(ctx);
    expect(row.itemName).toBe('Frayed Robe of Strength');
    expect(row.rarity).toBe('uncommon');
    expect(row.craftQuality).toBeUndefined();
    expect(messages(ctx)[0]).toBe('You salvaged Frayed Robe of Strength and received 2x Rough Hide.');
  });

  it('nothing usable: no received line, the old feed line, and still a row', () => {
    const ctx = newCtx({
      templates: [...baseTemplates().filter((t) => t.id !== CHEST), gearTemplate({ vendorValue: 1n })],
    });
    salvageIt(ctx);
    expect(bag(ctx, HIDE)).toBe(0n);
    expect(messages(ctx)).toEqual(['You salvaged Frayed Robe, but nothing usable was left.']);
    const { row, lines } = resultOf(ctx);
    expect(row.kind).toBe('salvage');
    expect(lines).toEqual([]);
  });

  it('a slot with no salvage material writes a row with no lines', () => {
    const ctx = newCtx({
      templates: [
        ...baseTemplates().filter((t) => t.id !== CHEST),
        gearTemplate({ tier: 0n }),
      ],
    });
    salvageIt(ctx);
    expect(rows(ctx, 'item_instance')).toHaveLength(0);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
    const { lines } = resultOf(ctx);
    expect(lines).toEqual([]);
  });

  it('replaces the craft row and raises seq', () => {
    const ctx = newCtx({ actionResults: [craftRow()] });
    salvageIt(ctx);
    const { row } = resultOf(ctx);
    expect(row.seq).toBe(5n);
    expect(row.kind).toBe('salvage');
    expect(row.itemName).toBe('Frayed Robe');
    expect(row.craftCount).toBe(0n);
    expect(row.recipeTemplateId).toBeUndefined();
  });
});

describe('salvage_item result row: the reagent bonus', () => {
  const suffix = (id: bigint, statKey: string, affixType = 'suffix') => ({
    id,
    itemInstanceId: INSTANCE,
    affixType,
    affixKey: `k_${statKey}`,
    affixName: 'of Power',
    statKey,
    magnitude: 2n,
  });

  it('a hit under the chance adds a bonus line and the reagent', () => {
    const ctx = newCtx({ instances: [instance(), stack(501n, reagentId('Glowing Stone'), 2n)], affixes: [suffix(1n, 'strBonus')] });
    const ts = tsForReagentRoll(INSTANCE, SALVAGE_REAGENT_CHANCE_PCT - 1n);
    expect((ts + INSTANCE * 13n) % 100n).toBeLessThan(SALVAGE_REAGENT_CHANCE_PCT);
    setTs(ctx, ts);
    salvageIt(ctx);
    expect(bag(ctx, reagentId('Glowing Stone'))).toBe(3n);
    expect(messages(ctx)).toEqual([
      'You salvaged Frayed Robe and received 2x Rough Hide.',
      'You also found 1x Glowing Stone while salvaging.',
    ]);
    const { lines } = resultOf(ctx);
    expect(lines.map((l) => l.kind)).toEqual(['received', 'bonus']);
    expect(lines[1]).toEqual({
      kind: 'bonus',
      templateId: reagentId('Glowing Stone'),
      name: 'Glowing Stone',
      quantity: 1n,
      total: 3n,
      instanceId: null,
    });
  });

  it('picks the reagent with the old formula among several affix defs', () => {
    const affixes = [suffix(1n, 'strBonus'), suffix(2n, 'dexBonus'), suffix(3n, 'intBonus')];
    const ctx = newCtx({ affixes });
    setTs(ctx, tsForReagentRoll(INSTANCE, 0n));
    salvageIt(ctx);
    const defs = salvageReagentDefs(affixes);
    expect(defs).toHaveLength(3);
    const picked = defs[Number((INSTANCE + 1n) % BigInt(defs.length))];
    const { lines } = resultOf(ctx);
    const bonus = lines.filter((l) => l.kind === 'bonus');
    expect(bonus).toHaveLength(1);
    expect(bonus[0].name).toBe(picked.name);
    expect(bag(ctx, reagentId(picked.name))).toBe(1n);
  });

  it('a miss writes no bonus line and grants nothing', () => {
    const ctx = newCtx({ affixes: [suffix(1n, 'strBonus')] });
    const ts = tsForReagentRoll(INSTANCE, SALVAGE_REAGENT_CHANCE_PCT);
    expect((ts + INSTANCE * 13n) % 100n).toBe(SALVAGE_REAGENT_CHANCE_PCT);
    setTs(ctx, ts);
    salvageIt(ctx);
    expect(bag(ctx, reagentId('Glowing Stone'))).toBe(0n);
    expect(messages(ctx)).toEqual(['You salvaged Frayed Robe and received 2x Rough Hide.']);
    expect(resultOf(ctx).lines.map((l) => l.kind)).toEqual(['received']);
  });

  it('only implicit affixes never give a bonus line, even on a roll of 0', () => {
    const ctx = newCtx({ affixes: [suffix(1n, 'armorClassBonus', 'implicit')] });
    setTs(ctx, tsForReagentRoll(INSTANCE, 0n));
    salvageIt(ctx);
    expect(resultOf(ctx).lines.map((l) => l.kind)).toEqual(['received']);
    expect(messages(ctx)).toEqual(['You salvaged Frayed Robe and received 2x Rough Hide.']);
  });
});

describe('salvage_item result row: the recipe scroll', () => {
  const scrollTemplate = () => tpl(SCROLL, 'Scroll: Frayed Robe Pattern', { slot: 'consumable', stackable: true });

  it('a hit under the INT chance adds a scroll line with the scroll bag row', () => {
    const ctx = newCtx({
      templates: [...baseTemplates(), scrollTemplate()],
      recipes: [chestRecipe()],
      instances: [instance(), stack(501n, SCROLL, 1n)],
    });
    const ts = tsForScrollRoll(1n, SCROLL_CHANCE - 1n);
    expect((ts + 1n) % 100n).toBeLessThan(SCROLL_CHANCE);
    setTs(ctx, ts);
    salvageIt(ctx);
    // The recipe consumed 3 Rough Hide, so the cap is the table count 2: unchanged here.
    expect(messages(ctx)).toEqual([
      'You salvaged Frayed Robe and received 2x Rough Hide.',
      'You found a recipe: Frayed Robe Pattern.',
    ]);
    const scrollRow = rows(ctx, 'item_instance').find((i) => i.templateId === SCROLL)!;
    expect(scrollRow.quantity).toBe(2n);
    const { lines } = resultOf(ctx);
    expect(lines.map((l) => l.kind)).toEqual(['received', 'scroll']);
    expect(lines[1]).toEqual({
      kind: 'scroll',
      templateId: SCROLL,
      name: 'Scroll: Frayed Robe Pattern',
      quantity: 1n,
      total: 2n,
      instanceId: scrollRow.id,
    });
  });

  it('a hit without a scroll template writes no scroll line and no extra feed line', () => {
    const ctx = newCtx({ recipes: [chestRecipe()] });
    setTs(ctx, tsForScrollRoll(1n, 0n));
    salvageIt(ctx);
    expect(messages(ctx)).toEqual(['You salvaged Frayed Robe and received 2x Rough Hide.']);
    expect(resultOf(ctx).lines.map((l) => l.kind)).toEqual(['received']);
  });

  it('a roll at or above the chance writes no scroll line', () => {
    const ctx = newCtx({ templates: [...baseTemplates(), scrollTemplate()], recipes: [chestRecipe()] });
    const ts = tsForScrollRoll(1n, SCROLL_CHANCE);
    setTs(ctx, ts);
    salvageIt(ctx);
    expect(bag(ctx, SCROLL)).toBe(0n);
    expect(resultOf(ctx).lines.map((l) => l.kind)).toEqual(['received']);
  });

  it('the recipe cap on the material still applies (recipe consumed 1 caps the yield at 1)', () => {
    const ctx = newCtx({ recipes: [chestRecipe({ req1Count: 1n })] });
    setTs(ctx, tsForScrollRoll(1n, 99n));
    salvageIt(ctx);
    expect(bag(ctx, HIDE)).toBe(1n);
    expect(resultOf(ctx).lines[0]).toMatchObject({ kind: 'received', quantity: 1n, total: 1n });
  });
});

describe('salvage_item grants exactly salvageMaterialYield', () => {
  const ARMOR_TYPES = ['cloth', 'leather', 'chain', 'plate'];
  const cases: Array<{ slot: string; armorType: string }> = [];
  for (const slot of ['chest', 'belt']) for (const armorType of ARMOR_TYPES) cases.push({ slot, armorType });
  for (const slot of ['mainHand', 'offHand', 'earrings', 'neck', 'cloak']) cases.push({ slot, armorType: 'none' });

  it('matches for every slot, tier 1 to 3, item value and with or without a recipe', () => {
    let checked = 0;
    for (const { slot, armorType } of cases) {
      for (const tier of [1n, 2n, 3n]) {
        for (const itemValue of [1n, 5n, 100n]) {
          for (const consumed of [0n, 1n]) {
            const gear = tpl(CHEST, 'Parity Piece', { slot, armorType, tier, vendorValue: itemValue, stackable: false });
            const materialName = salvageMaterialYield({
              slot, armorType, tier, itemValue, material: { name: 'x', vendorValue: 0n }, recipeConsumed: 0n,
            })!.name;
            const material = MATERIALS.find((m) => m[1] === materialName)!;
            // The recipe's req1 is the salvage material of this case.
            const ctx = newCtx({
              templates: [...baseTemplates().filter((t) => t.id !== CHEST), gear],
              recipes:
                consumed > 0n
                  ? [chestRecipe({ req1TemplateId: material[0], req1Count: consumed, req2TemplateId: undefined, req2Count: undefined })]
                  : [],
            });
            // A roll that misses the scroll and the reagent (no affixes, no scroll template anyway).
            setTs(ctx, tsForScrollRoll(1n, 50n));
            salvageIt(ctx);
            const expected = salvageMaterialYield({
              slot, armorType, tier, itemValue,
              material: { name: material[1], vendorValue: material[2] },
              recipeConsumed: consumed,
            })!;
            const label = `${slot}/${armorType}/t${tier}/v${itemValue}/c${consumed}`;
            expect(bag(ctx, material[0]), label).toBe(expected.count);
            const lines = resultOf(ctx).lines;
            if (expected.count > 0n) {
              expect(lines, label).toEqual([
                { kind: 'received', templateId: material[0], name: material[1], quantity: expected.count, total: expected.count, instanceId: null },
              ]);
            } else {
              expect(lines, label).toEqual([]);
            }
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBe(cases.length * 3 * 3 * 2);
  });
});

// ---------------------------------------------------------------------------
// Discover recipes
// ---------------------------------------------------------------------------

const D = {
  lamp: 49n,
  peat: 43n,
  herbs: 40n,
  cloth: 48n,
  shard: 46n,
  stone: 31n,
  murky: 45n,
  life: 68n,
};
const discoverTemplates = () => [
  tpl(D.lamp, 'Lamp Oil'),
  tpl(D.peat, 'Peat'),
  tpl(D.herbs, 'Herbs'),
  tpl(D.cloth, 'Scrap Cloth'),
  tpl(D.shard, 'Iron Shard', { vendorValue: 2n }),
  tpl(D.stone, 'Stone'),
  tpl(D.murky, 'Murky Water'),
  tpl(D.life, 'Life Stone', { vendorValue: 3n }),
];
const ELF_BAG: Array<[bigint, bigint]> = [
  [D.lamp, 12n], [D.peat, 9n], [D.herbs, 18n], [D.cloth, 11n],
  [D.shard, 3n], [D.stone, 11n], [D.murky, 4n], [D.life, 1n],
];

function discoverCtx(bagItems: Array<[bigint, bigint]>, at = 10n) {
  const ctx = createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [
        { id: 1n, ownerUserId: 7n, name: 'Mirel', className: 'Ashwarden', level: 3n, int: INT, gold: 10n, locationId: at },
      ],
      region: [{ id: 4097n, name: 'Tessarine Shelf', dangerMultiplier: 169n }],
      location: [
        { id: 10n, name: 'Cormorant Stair', regionId: 4097n, levelOffset: 0n, craftingAvailable: true },
        { id: 11n, name: "Saltwidow's Rest", regionId: 4097n, levelOffset: 2n, craftingAvailable: false },
      ],
      item_template: discoverTemplates(),
      item_instance: bagItems.map(([templateId, quantity], i) => stack(1000n + BigInt(i), templateId, quantity)),
      item_affix: [],
      recipe_template: [],
      recipe_discovered: [],
      action_result: [],
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
  return ctx;
}
const discover = (ctx: any) => research(ctx, { characterId: 1n });

describe('Discover recipes result row', () => {
  it('a find writes kind discover, the count and one recipe line per find in discovery order', () => {
    const ctx = discoverCtx(ELF_BAG);
    discover(ctx);
    const found = rows(ctx, 'recipe_discovered');
    expect(found.length).toBeGreaterThanOrEqual(2);
    const { row, lines } = resultOf(ctx);
    expect(row.characterId).toBe(1n);
    expect(row.seq).toBe(1n);
    expect(row.kind).toBe('discover');
    expect(row.itemName).toBe('');
    expect(row.rarity).toBe('common');
    expect(row.craftCount).toBe(0n);
    expect(row.templateId).toBeUndefined();
    expect(row.itemInstanceId).toBeUndefined();
    expect(row.recipeTemplateId).toBeUndefined();
    expect(row.quantity).toBe(BigInt(found.length));
    expect(lines).toHaveLength(found.length);
    found.forEach((discoveredRow, i) => {
      const recipe = rows(ctx, 'recipe_template').find((r) => r.id === discoveredRow.recipeTemplateId)!;
      expect(lines[i]).toEqual({
        kind: 'recipe',
        templateId: recipe.outputTemplateId,
        name: recipe.name,
        quantity: 1n,
        total: 0n,
        instanceId: null,
      });
      expect(messages(ctx)[i]).toContain(`You discover ${recipe.name}`);
    });
  });

  it('a bag that supports two new recipes reports two', () => {
    const ctx = discoverCtx([[D.shard, 3n], [D.cloth, 11n], [D.herbs, 18n], [D.peat, 9n]]);
    discover(ctx);
    const { row, lines } = resultOf(ctx);
    expect(row.quantity).toBe(2n);
    expect(lines.map((l) => l.kind)).toEqual(['recipe', 'recipe']);
    expect(rows(ctx, 'recipe_discovered')).toHaveLength(2);
  });

  it('a repeat Discover writes quantity 0 and no lines, and seq rises', () => {
    const ctx = discoverCtx([[D.shard, 3n], [D.cloth, 11n], [D.herbs, 18n], [D.peat, 9n]]);
    discover(ctx);
    expect(rows(ctx, 'action_result')[0].seq).toBe(1n);
    discover(ctx);
    const { row, lines } = resultOf(ctx);
    expect(row.seq).toBe(2n);
    expect(row.kind).toBe('discover');
    expect(row.quantity).toBe(0n);
    expect(lines).toEqual([]);
    expect(messages(ctx).pop()).toBe('You discover nothing new.');
  });

  it('without a station no row is written and only the station line appears', () => {
    const ctx = discoverCtx(ELF_BAG, 11n);
    discover(ctx);
    expect(rows(ctx, 'action_result')).toHaveLength(0);
    expect(messages(ctx)).toEqual(['Crafting is only available at locations with crafting stations.']);
    expect(rows(ctx, 'recipe_template')).toHaveLength(0);
  });
});
