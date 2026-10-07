/**
 * Salvage and Discover result rows through the REAL handlers (Phase 50 plan 30). salvage_item and
 * research_recipes are captured from index.ts and run on the strict mock db. Checks:
 *   - an equipped item is refused with 'Unequip item first' before any write (T-50-127);
 *   - a salvage writes the character's action_result row from what the server actually granted:
 *     'received' for each component that came back, 'bonus' for a reagent, 'scroll' for a recipe
 *     scroll, and the bonus and scroll lines exist only when the server granted them (T-50-128);
 *   - salvage_item is a chance at a smaller return, never a guaranteed one (Plan 50-40, owner
 *     2026-10-07): it grants exactly what rollSalvage says for salvageComponents and the seed from the
 *     timestamp, the instance and the character (T-50-126);
 *   - the 12% reagent and the INT scroll roll on that same seed at their own fixed indexes
 *     (SALVAGE_REAGENT_ROLL_INDEX, SALVAGE_SCROLL_ROLL_INDEX), independent of each other and of the
 *     component rolls (review IN-02);
 *   - Discover recipes writes kind 'discover' with one 'recipe' line per find, none when nothing is
 *     new, and no row without a station.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import {
  CRAFTING_MODIFIER_DEFS,
  MATERIAL_DEFS,
  SALVAGE_REAGENT_CHANCE_PCT,
  SALVAGE_REAGENT_ROLL_INDEX,
  SALVAGE_SCROLL_ROLL_INDEX,
  getMaterialForSalvage,
  rollSalvage,
  salvageComponents,
  salvageReagentDefs,
  salvageRoll,
  salvageSeed,
} from '../data/crafting_rules';
import type { SalvageComponent } from '../data/crafting_rules';
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

// The reagent and scroll rolls the handler makes: salvageRoll on the salvage seed at their fixed indexes.
const reagentRollAt = (ts: bigint, instanceId = INSTANCE, characterId = 1n) =>
  salvageRoll(salvageSeed(ts, instanceId, characterId), SALVAGE_REAGENT_ROLL_INDEX);
const scrollRollAt = (ts: bigint, instanceId = INSTANCE, characterId = 1n) =>
  salvageRoll(salvageSeed(ts, instanceId, characterId), SALVAGE_SCROLL_ROLL_INDEX);

// The first timestamp from `base` upward whose reagent roll equals `roll`.
const tsForReagentRoll = (instanceId: bigint, roll: bigint, base = T0 + 5_000_000n) => {
  for (let k = 0n; k < 20000n; k += 1n) {
    if (reagentRollAt(base + k, instanceId) === roll) return base + k;
  }
  throw new Error('tsForReagentRoll: no timestamp gives that roll');
};

const bag = (ctx: any, templateId: bigint): bigint =>
  rows(ctx, 'item_instance')
    .filter((i) => i.templateId === templateId && !i.equippedSlot)
    .reduce((sum, i) => sum + (i.quantity ?? 1n), 0n);

// What the shared rule says a salvage of `instanceTemplateId` can return, built from the same rows the
// handler reads: every recipe that outputs the template, else the slot material.
function componentsOf(ctx: any, instanceTemplateId = CHEST): SalvageComponent[] {
  const template = rows(ctx, 'item_template').find((t) => t.id === instanceTemplateId);
  const byId = (id: bigint | undefined | null) =>
    id === undefined || id === null ? undefined : rows(ctx, 'item_template').find((t) => t.id === id);
  const recipes = rows(ctx, 'recipe_template')
    .filter((r) => r.outputTemplateId === instanceTemplateId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((r) => ({
      id: r.id,
      outputCount: r.outputCount,
      parts: [
        [r.req1TemplateId, r.req1Count],
        [r.req2TemplateId, r.req2Count],
        [r.req3TemplateId, r.req3Count],
      ]
        .map(([id, count]) => ({ part: byId(id as bigint | undefined), count: count as bigint | undefined }))
        .filter((x) => x.part !== undefined)
        .map((x) => ({ templateId: x.part.id, name: x.part.name, count: x.count ?? 0n, vendorValue: x.part.vendorValue })),
    }));
  const materialName = getMaterialForSalvage(template.slot, template.armorType, template.tier ?? 1n);
  const material = materialName ? rows(ctx, 'item_template').find((t) => t.name === materialName) : undefined;
  return salvageComponents({
    slot: template.slot,
    armorType: template.armorType,
    tier: template.tier ?? 1n,
    itemValue: template.vendorValue ?? 0n,
    recipes,
    slotMaterial: material ? { templateId: material.id, name: material.name, vendorValue: material.vendorValue } : null,
  });
}

type RollWant = 'hit' | 'miss' | bigint;
const rollOk = (want: RollWant, roll: bigint, chance: bigint) =>
  want === 'hit' ? roll < chance : want === 'miss' ? roll >= chance : roll === want;

// A timestamp from T0 + 5_000_000 upward whose component outcome matches `comps` and whose reagent and
// scroll rolls match (the reagent roll misses by default; the scroll roll is free unless named), so a
// test names the outcome it wants and the real handler is checked against the shared rule instead of a
// hand-computed one.
function tsWhere(
  ctx: any,
  want: { comps?: (returned: SalvageComponent[]) => boolean; reagent?: RollWant; scroll?: RollWant | 'any' },
  instanceId = INSTANCE,
  characterId = 1n,
): bigint {
  const components = componentsOf(ctx);
  const reagent = want.reagent ?? 'miss';
  const scroll = want.scroll ?? 'any';
  for (let k = 0n; k < 20000n; k += 1n) {
    const ts = T0 + 5_000_000n + k;
    const returned = rollSalvage(components, salvageSeed(ts, instanceId, characterId));
    if (want.comps && !want.comps(returned)) continue;
    if (!rollOk(reagent, reagentRollAt(ts, instanceId, characterId), SALVAGE_REAGENT_CHANCE_PCT)) continue;
    if (scroll !== 'any' && !rollOk(scroll, scrollRollAt(ts, instanceId, characterId), SCROLL_CHANCE)) continue;
    return ts;
  }
  throw new Error('tsWhere: no timestamp matches the wanted outcome');
}
const hit = (r: SalvageComponent[]) => r.length > 0;
const none = (r: SalvageComponent[]) => r.length === 0;

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

describe('salvage_item result row: the components that came back', () => {
  it('writes one received line with the bag total and the item facts', () => {
    const ctx = newCtx({ instances: [instance(), stack(501n, HIDE, 3n)] });
    // A tier 1 cloth chest no recipe makes: one possible component, Rough Hide at half the old count (1)
    // at 50%. Pick a timestamp where the shared rule says it comes back.
    expect(componentsOf(ctx)).toEqual([{ templateId: HIDE, name: 'Rough Hide', amount: 1n, chancePct: 50n }]);
    setTs(ctx, tsWhere(ctx, { comps: hit }));
    salvageIt(ctx);
    expect(bag(ctx, HIDE)).toBe(4n);
    expect(rows(ctx, 'item_instance').some((i) => i.id === INSTANCE)).toBe(false);
    expect(rows(ctx, 'item_affix')).toHaveLength(0);
    expect(messages(ctx)).toEqual(['You salvaged Frayed Robe and received 1x Rough Hide.']);
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
      { kind: 'received', templateId: HIDE, name: 'Rough Hide', quantity: 1n, total: 4n, instanceId: null },
    ]);
  });

  it("names the item's displayName and falls back to the template rarity", () => {
    const ctx = newCtx({
      instances: [instance({ displayName: 'Frayed Robe of Strength', qualityTier: undefined, craftQuality: undefined })],
    });
    setTs(ctx, tsWhere(ctx, { comps: hit }));
    salvageIt(ctx);
    const { row } = resultOf(ctx);
    expect(row.itemName).toBe('Frayed Robe of Strength');
    expect(row.rarity).toBe('uncommon');
    expect(row.craftQuality).toBeUndefined();
    expect(messages(ctx)[0]).toBe('You salvaged Frayed Robe of Strength and received 1x Rough Hide.');
  });

  it('a crafted chest (Rough Hide x3 and Copper Ore x1) gives back 1 Rough Hide at a hit and never Copper Ore', () => {
    const ctx = newCtx({
      recipes: [chestRecipe()],
      affixes: [{ id: 1n, itemInstanceId: INSTANCE, affixType: 'implicit', affixKey: 'q', affixName: 'Quality', statKey: 'armorClassBonus', magnitude: 1n }],
    });
    expect(componentsOf(ctx)).toEqual([{ templateId: HIDE, name: 'Rough Hide', amount: 1n, chancePct: 50n }]);
    setTs(ctx, tsWhere(ctx, { comps: hit }));
    salvageIt(ctx);
    expect(bag(ctx, HIDE)).toBe(1n);
    expect(bag(ctx, COPPER)).toBe(0n);
    expect(rows(ctx, 'item_instance').some((i) => i.id === INSTANCE)).toBe(false);
    expect(rows(ctx, 'item_affix')).toHaveLength(0);
    expect(messages(ctx)).toEqual(['You salvaged Frayed Robe and received 1x Rough Hide.']);
    const { lines } = resultOf(ctx);
    expect(lines).toEqual([
      { kind: 'received', templateId: HIDE, name: 'Rough Hide', quantity: 1n, total: 1n, instanceId: null },
    ]);
  });

  it('a crafted chest at a missing roll returns nothing: no lines and the nothing usable line', () => {
    const ctx = newCtx({
      recipes: [chestRecipe()],
      affixes: [{ id: 1n, itemInstanceId: INSTANCE, affixType: 'implicit', affixKey: 'q', affixName: 'Quality', statKey: 'armorClassBonus', magnitude: 1n }],
    });
    setTs(ctx, tsWhere(ctx, { comps: none }));
    salvageIt(ctx);
    expect(bag(ctx, HIDE)).toBe(0n);
    expect(bag(ctx, COPPER)).toBe(0n);
    expect(rows(ctx, 'item_instance').some((i) => i.id === INSTANCE)).toBe(false);
    expect(rows(ctx, 'item_affix')).toHaveLength(0);
    expect(messages(ctx)).toEqual(['You salvaged Frayed Robe, but nothing usable was left.']);
    const { row, lines } = resultOf(ctx);
    expect(row.kind).toBe('salvage');
    expect(lines).toEqual([]);
  });

  it('a recipe of Rough Hide x1 and Copper Ore x1 (both req 1) never returns a material', () => {
    // Owner, 2026-10-07: "A salvage should never return enough parts to just infinitely remake it over
    // and over." One unit in means none back, whatever the roll.
    for (let k = 0n; k < 300n; k += 1n) {
      const ctx = newCtx({ recipes: [chestRecipe({ req1Count: 1n })] });
      setTs(ctx, T0 + 5_000_000n + k);
      salvageIt(ctx);
      expect(bag(ctx, HIDE), `ts +${k}`).toBe(0n);
      expect(bag(ctx, COPPER), `ts +${k}`).toBe(0n);
      expect(resultOf(ctx).lines.filter((l) => l.kind === 'received')).toEqual([]);
    }
  });

  it('Rough Hide x2 returns 1 at a hit', () => {
    const ctx = newCtx({ recipes: [chestRecipe({ req1Count: 2n })] });
    expect(componentsOf(ctx).map((c) => [c.name, c.amount])).toEqual([['Rough Hide', 1n]]);
    setTs(ctx, tsWhere(ctx, { comps: hit }));
    salvageIt(ctx);
    expect(bag(ctx, HIDE)).toBe(1n);
  });

  it('a tier 3 plate chest no recipe makes has one component: Darksteel Ore at 10%', () => {
    const ctx = newCtx({
      templates: [
        ...baseTemplates().filter((t) => t.id !== CHEST),
        gearTemplate({ armorType: 'plate', tier: 3n, vendorValue: 100n }),
      ],
    });
    expect(componentsOf(ctx)).toEqual([{ templateId: 71n, name: 'Darksteel Ore', amount: 1n, chancePct: 10n }]);
    setTs(ctx, tsWhere(ctx, { comps: hit }));
    salvageIt(ctx);
    expect(bag(ctx, 71n)).toBe(1n);
    expect(messages(ctx)).toEqual(['You salvaged Frayed Robe and received 1x Darksteel Ore.']);
  });

  it('over 400 fresh salvages of the crafted chest about half return Rough Hide, and some return nothing', () => {
    let returned = 0;
    let nothing = 0;
    for (let k = 0n; k < 400n; k += 1n) {
      const ctx = newCtx({ recipes: [chestRecipe()] });
      setTs(ctx, T0 + 5_000_000n + k);
      salvageIt(ctx);
      if (bag(ctx, HIDE) > 0n) returned += 1;
      else nothing += 1;
      expect(bag(ctx, COPPER)).toBe(0n);
    }
    expect(returned / 400).toBeGreaterThan(0.4);
    expect(returned / 400).toBeLessThan(0.6);
    expect(nothing).toBeGreaterThan(0);
  });

  it('two recipes make the chest: the components follow the lowest id', () => {
    const ctx = newCtx({
      templates: [
        ...baseTemplates(),
        tpl(SCROLL, 'Scroll: Frayed Robe Pattern', { slot: 'consumable', stackable: true }),
        tpl(301n, 'Scroll: Other Pattern', { slot: 'consumable', stackable: true }),
      ],
      recipes: [
        chestRecipe({ id: 901n, name: 'Other Pattern', req1Count: 3n, req2TemplateId: undefined, req2Count: undefined }),
        chestRecipe({ id: 900n, name: 'Frayed Robe Pattern', req1Count: 2n }),
      ],
    });
    expect(componentsOf(ctx).map((c) => [c.name, c.amount])).toEqual([['Rough Hide', 1n]]);
    // The scroll is the lowest recipe's, never the other one.
    setTs(ctx, tsWhere(ctx, { comps: hit, scroll: 'hit' }));
    salvageIt(ctx);
    expect(bag(ctx, HIDE)).toBe(1n);
    expect(bag(ctx, COPPER)).toBe(0n);
    expect(bag(ctx, SCROLL)).toBe(1n);
    expect(bag(ctx, 301n)).toBe(0n);
    expect(messages(ctx)).toEqual([
      'You salvaged Frayed Robe and received 1x Rough Hide.',
      'You found a recipe: Frayed Robe Pattern.',
    ]);
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
    // Nothing at all came back: the feed says so, as for any empty salvage.
    expect(messages(ctx)).toEqual(['You salvaged Frayed Robe, but nothing usable was left.']);
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
    const ts = tsWhere(ctx, { comps: hit, reagent: 'hit' });
    expect(reagentRollAt(ts)).toBeLessThan(SALVAGE_REAGENT_CHANCE_PCT);
    setTs(ctx, ts);
    salvageIt(ctx);
    expect(bag(ctx, reagentId('Glowing Stone'))).toBe(3n);
    expect(messages(ctx)).toEqual([
      'You salvaged Frayed Robe and received 1x Rough Hide.',
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
    const ts = tsWhere(ctx, { comps: hit, reagent: SALVAGE_REAGENT_CHANCE_PCT });
    expect(reagentRollAt(ts)).toBe(SALVAGE_REAGENT_CHANCE_PCT);
    setTs(ctx, ts);
    salvageIt(ctx);
    expect(bag(ctx, reagentId('Glowing Stone'))).toBe(0n);
    expect(messages(ctx)).toEqual(['You salvaged Frayed Robe and received 1x Rough Hide.']);
    expect(resultOf(ctx).lines.map((l) => l.kind)).toEqual(['received']);
  });

  it('only implicit affixes never give a bonus line, even on a roll of 0', () => {
    const ctx = newCtx({ affixes: [suffix(1n, 'armorClassBonus', 'implicit')] });
    setTs(ctx, tsWhere(ctx, { comps: hit, reagent: 0n }));
    salvageIt(ctx);
    expect(resultOf(ctx).lines.map((l) => l.kind)).toEqual(['received']);
    expect(messages(ctx)).toEqual(['You salvaged Frayed Robe and received 1x Rough Hide.']);
  });

  it('a component miss with a reagent hit: no received line, one bonus line, and the short main line', () => {
    const ctx = newCtx({ recipes: [chestRecipe()], affixes: [suffix(1n, 'strBonus')] });
    const ts = tsWhere(ctx, { comps: none, reagent: 'hit' });
    setTs(ctx, ts);
    salvageIt(ctx);
    expect(bag(ctx, HIDE)).toBe(0n);
    expect(bag(ctx, reagentId('Glowing Stone'))).toBe(1n);
    expect(messages(ctx)).toEqual([
      'You salvaged Frayed Robe.',
      'You also found 1x Glowing Stone while salvaging.',
    ]);
    expect(resultOf(ctx).lines.map((l) => l.kind)).toEqual(['bonus']);
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
    const ts = tsWhere(ctx, { comps: hit, scroll: 'hit' });
    expect(scrollRollAt(ts)).toBeLessThan(SCROLL_CHANCE);
    setTs(ctx, ts);
    salvageIt(ctx);
    // The recipe consumed 3 Rough Hide, so a hit returns 1.
    expect(messages(ctx)).toEqual([
      'You salvaged Frayed Robe and received 1x Rough Hide.',
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
    setTs(ctx, tsWhere(ctx, { comps: hit, scroll: 0n }));
    salvageIt(ctx);
    expect(messages(ctx)).toEqual(['You salvaged Frayed Robe and received 1x Rough Hide.']);
    expect(resultOf(ctx).lines.map((l) => l.kind)).toEqual(['received']);
  });

  it('a roll at or above the chance writes no scroll line', () => {
    const ctx = newCtx({ templates: [...baseTemplates(), scrollTemplate()], recipes: [chestRecipe()] });
    const ts = tsWhere(ctx, { comps: hit, scroll: SCROLL_CHANCE });
    setTs(ctx, ts);
    salvageIt(ctx);
    expect(bag(ctx, SCROLL)).toBe(0n);
    expect(resultOf(ctx).lines.map((l) => l.kind)).toEqual(['received']);
  });

  it('a scroll can drop even when no component comes back', () => {
    const ctx = newCtx({ templates: [...baseTemplates(), scrollTemplate()], recipes: [chestRecipe()] });
    setTs(ctx, tsWhere(ctx, { comps: none, scroll: 'hit' }));
    salvageIt(ctx);
    expect(bag(ctx, HIDE)).toBe(0n);
    expect(bag(ctx, SCROLL)).toBe(1n);
    expect(messages(ctx)).toEqual(['You salvaged Frayed Robe.', 'You found a recipe: Frayed Robe Pattern.']);
    expect(resultOf(ctx).lines.map((l) => l.kind)).toEqual(['scroll']);
  });
});

describe('salvage_item grants exactly what rollSalvage says for salvageComponents', () => {
  const ARMOR_TYPES = ['cloth', 'leather', 'chain', 'plate'];
  const cases: Array<{ slot: string; armorType: string }> = [];
  for (const slot of ['chest', 'belt']) for (const armorType of ARMOR_TYPES) cases.push({ slot, armorType });
  for (const slot of ['mainHand', 'offHand', 'earrings', 'neck', 'cloak']) cases.push({ slot, armorType: 'none' });

  it('matches for every slot, tier 1 to 3, item value, recipe size and two timestamps', () => {
    let checked = 0;
    let granted = 0;
    for (const { slot, armorType } of cases) {
      for (const tier of [1n, 2n, 3n]) {
        for (const itemValue of [1n, 5n, 100n]) {
          const gear = tpl(CHEST, 'Parity Piece', { slot, armorType, tier, vendorValue: itemValue, stackable: false });
          const materialName = getMaterialForSalvage(slot, armorType, tier)!;
          const material = MATERIALS.find((m) => m[1] === materialName)!;
          // req 0 means no recipe; else the recipe's req1 is the salvage material and req2 is Copper Ore x1.
          for (const req of [0n, 1n, 2n, 3n]) {
            for (const tsOffset of [5_000_000n, 5_000_037n]) {
              const ctx = newCtx({
                templates: [...baseTemplates().filter((t) => t.id !== CHEST), gear],
                recipes: req > 0n ? [chestRecipe({ req1TemplateId: material[0], req1Count: req })] : [],
              });
              // Independent of the handler: the parts are named from the test's own tables.
              const expectedComponents = salvageComponents({
                slot,
                armorType,
                tier,
                itemValue,
                recipes:
                  req > 0n
                    ? [
                        {
                          id: 900n,
                          outputCount: 1n,
                          parts: [
                            { templateId: material[0], name: material[1], count: req, vendorValue: material[2] },
                            { templateId: COPPER, name: 'Copper Ore', count: 1n, vendorValue: 2n },
                          ],
                        },
                      ]
                    : [],
                slotMaterial: { templateId: material[0], name: material[1], vendorValue: material[2] },
              });
              const ts = T0 + tsOffset;
              const returned = rollSalvage(expectedComponents, salvageSeed(ts, INSTANCE, 1n));
              setTs(ctx, ts);
              salvageIt(ctx);
              const label = `${slot}/${armorType}/t${tier}/v${itemValue}/req${req}/+${tsOffset}`;
              for (const m of MATERIALS) {
                const want = returned
                  .filter((c) => c.templateId === m[0])
                  .reduce((sum, c) => sum + c.amount, 0n);
                expect(bag(ctx, m[0]), `${label} ${m[1]}`).toBe(want);
              }
              const lines = resultOf(ctx).lines;
              expect(lines.map((l) => [l.templateId, l.quantity]), label).toEqual(
                returned.map((c) => [c.templateId, c.amount]),
              );
              granted += returned.length;
              checked += 1;
            }
          }
        }
      }
    }
    expect(checked).toBe(cases.length * 3 * 3 * 4 * 2);
    // The grid must exercise returns, not only misses.
    expect(granted).toBeGreaterThan(50);
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

// Review IN-03: one fixture through both the server's input assembly (salvage_item on the strict
// mock, every component forced to come back) and the client's (src/ledger/salvagePreview.ts). The
// templates carry the MATERIAL_DEFS vendor values, as ensureStarterItemTemplates upserts them in play.
describe('salvage_item and the client salvagePreview agree on one fixture', () => {
  // A non-literal specifier keeps the server type check out of the client module; vitest resolves it
  // (and its @game-data alias) at run time.
  const PREVIEW_MODULE = '../../../src/ledger/salvagePreview';
  let salvagePreview: (input: any) => any;
  beforeAll(async () => {
    salvagePreview = (await import(/* @vite-ignore */ PREVIEW_MODULE)).salvagePreview;
  });

  const defValue = (name: string) => MATERIAL_DEFS.find((m) => m.name === name)!.vendorValue;
  const parityTemplates = (gear: any) => [
    ...MATERIALS.map(([id, name]) => tpl(id, name, { vendorValue: defValue(name) })),
    ...reagentTemplates(),
    gear,
  ];
  const affixes = [
    { id: 1n, itemInstanceId: INSTANCE, affixType: 'suffix', affixKey: 'k1', affixName: 'of Strength', statKey: 'strBonus', magnitude: 2n },
    { id: 2n, itemInstanceId: INSTANCE, affixType: 'suffix', affixKey: 'k2', affixName: 'of Intellect', statKey: 'intBonus', magnitude: 2n },
    { id: 3n, itemInstanceId: INSTANCE, affixType: 'implicit', affixKey: 'q', affixName: 'Quality', statKey: 'armorClassBonus', magnitude: 1n },
  ];
  const fixtures: Array<{ label: string; gear: any; recipe: any | null }> = [
    {
      label: 'a recipe-made chest',
      gear: gearTemplate({ tier: 2n, vendorValue: 40n }),
      recipe: chestRecipe({ req1TemplateId: 72n, req1Count: 5n, req2TemplateId: 70n, req2Count: 3n, req3TemplateId: HIDE, req3Count: 2n }),
    },
    { label: 'a chest no recipe makes', gear: gearTemplate({ tier: 2n, vendorValue: 40n }), recipe: null },
  ];

  for (const { label, gear, recipe } of fixtures) {
    it(`${label}: the granted components and the reagent are the preview's`, () => {
      const templates = parityTemplates(gear);
      const ctx = newCtx({ templates, affixes, recipes: recipe ? [recipe] : [] });
      const preview = salvagePreview({
        instance: { id: INSTANCE },
        template: gear,
        affixes,
        characterId: 1n,
        outputRecipe: recipe,
        templates: new Map(templates.map((t: any) => [t.id, t])),
      });
      expect(preview.knowable).toBe(true);
      expect(preview.components.length).toBeGreaterThan(0);
      // Every component and the reagent come back at this timestamp.
      setTs(ctx, tsWhere(ctx, { comps: (r) => r.length === preview.components.length, reagent: 'hit' }));
      salvageIt(ctx);
      const { lines } = resultOf(ctx);
      const received = lines.filter((l) => l.kind === 'received');
      // The preview names the slot material without a template id (it reads MATERIAL_DEFS); the
      // server grants that material's template.
      expect(received.map((l) => [l.name, l.quantity])).toEqual(
        preview.components.map((c: SalvageComponent) => [c.name, c.amount]),
      );
      preview.components.forEach((c: SalvageComponent, i: number) => {
        if (c.templateId !== null) expect(received[i].templateId).toBe(c.templateId);
      });
      const reagentYield = preview.yields.find((y: any) => y.key === 'reagent');
      expect(lines.filter((l) => l.kind === 'bonus').map((l) => l.name)).toEqual([reagentYield.name]);
    });
  }
});

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
