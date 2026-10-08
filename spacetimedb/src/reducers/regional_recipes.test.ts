/**
 * Regional recipes through the REAL handlers (Phase 51.3 Plan 06, CUT-01, SC3). research_recipes,
 * craft_recipe, learn_recipe_scroll and salvage_item are captured from index.ts and run on the
 * strict mock db. Checks:
 *   - research discovers a regional common or uncommon recipe (region_recipe learnBy 'research')
 *     only when the bag holds every requirement in full, before the rule candidates and inside the
 *     shared limit of 3; a scroll-learned recipe is never researched;
 *   - a regional material outside MATERIAL_KINDS joins the rule recipes through its economy_item kind;
 *   - rule recipes are inserted with req4TemplateId 0n and req4Count 0n (full column set);
 *   - a legendary recipe with four requirements crafts (all four consumed) or is refused whole;
 *   - a rare regional recipe is learned from its 'Scroll: <name>' item;
 *   - craft quality follows a regional primary's rarity;
 *   - salvage of a regional output can return parts of all four requirements.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer, rowColumnProblems } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { getMaterialForSalvage, recipeRequirements, rollSalvage, salvageComponents, salvageSeed } from '../data/crafting_rules';
import type { SalvageComponent } from '../data/crafting_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

let research: (...args: any[]) => any;
let craft: (...args: any[]) => any;
let learn: (...args: any[]) => any;
let salvage: (...args: any[]) => any;

beforeAll(async () => {
  await import('../index');
  const names = ['research_recipes', 'craft_recipe', 'learn_recipe_scroll', 'salvage_item'] as const;
  const handlers = names.map((n) => capturedReducer(n));
  handlers.forEach((h, i) => {
    if (typeof h !== 'function') {
      throw new Error(
        `capturedReducer('${names[i]}') is not a function: the schema recorder could not capture the ` +
          'reducer from index.ts. STOP and report; never edit production code to fix this.',
      );
    }
  });
  [research, craft, learn, salvage] = handlers as Array<(...args: any[]) => any>;
}, 120_000);

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const clone = <T>(v: T): T => structuredClone(v);

const HOME = 4097n;
const STATION = 4097n;

const ID = {
  // Rule materials (MATERIAL_KINDS names).
  stone: 31n,
  shard: 46n,
  cloth: 48n,
  // Regional materials of the home region.
  saltglass: 300n, // metal, common
  kelpweave: 301n, // cloth, common
  tidepearl: 302n, // trinket, uncommon
  // Foreign regional materials (regions 2, 3, 4).
  brinewort: 310n, // trinket, rare
  emberroot: 320n, // wood, epic
  frostmoss: 330n, // edible, legendary
  // Recipe outputs and scrolls.
  cutlassOut: 950n,
  charmOut: 951n,
  bladeOut: 952n,
  glaiveOut: 953n,
  bladeScroll: 960n,
  glaiveScroll: 961n,
};

const R = { common: 900n, uncommon: 901n, rare: 902n, legendary: 903n };

const template = (id: bigint, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  slot: 'material',
  armorType: 'none',
  rarity: 'common',
  tier: 1n,
  isJunk: false,
  vendorValue: 1n,
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
  stackable: true,
  wellFedDurationMicros: 0n,
  wellFedBuffType: '',
  wellFedBuffMagnitude: 0n,
  description: undefined,
  ...over,
});

const weapon = (id: bigint, name: string, rarity: string, vendorValue: bigint) =>
  template(id, name, {
    slot: 'mainHand',
    rarity,
    stackable: false,
    vendorValue,
    weaponType: 'sword',
    weaponBaseDamage: 6n,
    weaponDps: 7n,
  });

const templates = () => [
  template(ID.stone, 'Stone'),
  template(ID.shard, 'Iron Shard', { vendorValue: 2n }),
  template(ID.cloth, 'Scrap Cloth'),
  template(ID.saltglass, 'Saltglass Shard', { vendorValue: 2n }),
  template(ID.kelpweave, 'Kelpweave', { vendorValue: 2n }),
  template(ID.tidepearl, 'Tidepearl', { rarity: 'uncommon', vendorValue: 4n }),
  template(ID.brinewort, 'Brinewort Crystal', { rarity: 'rare', vendorValue: 8n }),
  template(ID.emberroot, 'Emberroot Bark', { rarity: 'epic', vendorValue: 16n }),
  template(ID.frostmoss, 'Frostmoss', { rarity: 'legendary', vendorValue: 32n }),
  weapon(ID.cutlassOut, 'Saltglass Cutlass', 'common', 20n),
  template(ID.charmOut, 'Tidepearl Charm', { slot: 'neck', rarity: 'uncommon', stackable: false, vendorValue: 40n, wisBonus: 2n }),
  weapon(ID.bladeOut, 'Brinewort Blade', 'rare', 60n),
  weapon(ID.glaiveOut, 'Tidewrought Glaive', 'legendary', 400n),
  template(ID.bladeScroll, 'Scroll: Brinewort Blade', { slot: 'resource', rarity: 'rare', vendorValue: 25n }),
  template(ID.glaiveScroll, 'Scroll: Tidewrought Glaive', { slot: 'resource', rarity: 'legendary', vendorValue: 100n }),
];

const economyItem = (itemTemplateId: bigint, regionId: bigint, kind: string, rarity: string) => ({
  itemTemplateId,
  regionId,
  role: 'gather',
  slotKey: rarity,
  kind,
  rarity,
  terrain: 'shore',
  timeOfDay: '',
  enemyTemplateId: 0n,
});

const economyItems = () => [
  economyItem(ID.saltglass, HOME, 'metal', 'common'),
  economyItem(ID.kelpweave, HOME, 'cloth', 'common'),
  economyItem(ID.tidepearl, HOME, 'trinket', 'uncommon'),
  economyItem(ID.brinewort, 2n, 'trinket', 'rare'),
  economyItem(ID.emberroot, 3n, 'wood', 'epic'),
  economyItem(ID.frostmoss, 4n, 'edible', 'legendary'),
];

const recipe = (
  id: bigint,
  key: string,
  name: string,
  outputTemplateId: bigint,
  recipeType: string,
  reqs: Array<[bigint, bigint]>,
) => ({
  id,
  key,
  name,
  outputTemplateId,
  outputCount: 1n,
  req1TemplateId: reqs[0][0],
  req1Count: reqs[0][1],
  req2TemplateId: reqs[1][0],
  req2Count: reqs[1][1],
  req3TemplateId: reqs[2]?.[0],
  req3Count: reqs[2]?.[1],
  recipeType,
  materialType: undefined,
  req4TemplateId: reqs[3]?.[0] ?? 0n,
  req4Count: reqs[3]?.[1] ?? 0n,
});

const recipes = () => [
  recipe(R.common, `region:${HOME}:r0`, 'Saltglass Cutlass', ID.cutlassOut, 'weapon', [
    [ID.saltglass, 3n],
    [ID.kelpweave, 1n],
  ]),
  recipe(R.uncommon, `region:${HOME}:r1`, 'Tidepearl Charm', ID.charmOut, 'accessory', [
    [ID.tidepearl, 3n],
    [ID.kelpweave, 2n],
  ]),
  recipe(R.rare, `region:${HOME}:r2`, 'Brinewort Blade', ID.bladeOut, 'weapon', [
    [ID.saltglass, 3n],
    [ID.kelpweave, 1n],
    [ID.brinewort, 1n],
  ]),
  recipe(R.legendary, 'region:5:r2', 'Tidewrought Glaive', ID.glaiveOut, 'weapon', [
    [ID.tidepearl, 4n],
    [ID.brinewort, 2n],
    [ID.emberroot, 2n],
    [ID.frostmoss, 2n],
  ]),
];

const regionRecipes = () => [
  { recipeTemplateId: R.common, regionId: HOME, tier: 'common', learnBy: 'research', scrollTemplateId: 0n, foreignRegionIds: '[]' },
  { recipeTemplateId: R.uncommon, regionId: HOME, tier: 'uncommon', learnBy: 'research', scrollTemplateId: 0n, foreignRegionIds: '[]' },
  { recipeTemplateId: R.rare, regionId: HOME, tier: 'rare', learnBy: 'scroll', scrollTemplateId: ID.bladeScroll, foreignRegionIds: '["2"]' },
  {
    recipeTemplateId: R.legendary,
    regionId: 5n,
    tier: 'legendary',
    learnBy: 'scroll',
    scrollTemplateId: ID.glaiveScroll,
    foreignRegionIds: '["2","3","4"]',
  },
];

type Bag = Array<[bigint, bigint]>;

let nextInstance = 1000n;
const stacks = (owner: bigint, bag: Bag) =>
  bag.map(([templateId, quantity]) => ({
    id: nextInstance++,
    templateId,
    ownerCharacterId: owner,
    equippedSlot: undefined,
    quantity,
  }));

function newCtx(opts: { bag?: Bag; known?: bigint[]; extraInstances?: any[] } = {}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [
        {
          id: 1n,
          ownerUserId: 7n,
          name: 'Elfansworth',
          className: 'Gloamweaver',
          level: 3n,
          int: 18n,
          gold: 10n,
          locationId: STATION,
          weaponProficiencies: 'dagger,wand,staff,sword',
          armorProficiencies: 'cloth,leather',
        },
      ],
      region: [{ id: HOME, name: 'Tessarine Shelf', dangerMultiplier: 169n }],
      location: [{ id: STATION, name: 'Cormorant Stair', regionId: HOME, levelOffset: 0n, craftingAvailable: true }],
      item_template: templates(),
      item_instance: [...stacks(1n, opts.bag ?? []), ...(opts.extraInstances ?? [])],
      item_affix: [],
      recipe_template: recipes(),
      recipe_discovered: (opts.known ?? []).map((recipeTemplateId, i) => ({
        id: 500n + BigInt(i),
        characterId: 1n,
        recipeTemplateId,
        discoveredAt: { microsSinceUnixEpoch: T0 },
      })),
      region_recipe: regionRecipes(),
      economy_item: economyItems(),
      character_effect: [],
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const discover = (ctx: any) => research(ctx, { characterId: 1n });
const lines = (ctx: any): string[] => rows(ctx, 'event_private').filter((e) => e.characterId === 1n).map((e) => e.message);
const knownIds = (ctx: any): bigint[] =>
  rows(ctx, 'recipe_discovered').filter((d) => d.characterId === 1n).map((d) => d.recipeTemplateId);
const countOf = (ctx: any, templateId: bigint): bigint =>
  rows(ctx, 'item_instance')
    .filter((i) => i.ownerCharacterId === 1n && i.templateId === templateId && !i.equippedSlot)
    .reduce((sum, i) => sum + i.quantity, 0n);

describe('research_recipes discovers regional recipes', () => {
  it('discovers a regional common recipe when the bag holds every requirement in full', () => {
    const ctx = newCtx({ bag: [[ID.saltglass, 3n], [ID.kelpweave, 1n]] });
    const itemsBefore = clone(rows(ctx, 'item_instance'));
    discover(ctx);
    expect(knownIds(ctx)).toContain(R.common);
    expect(lines(ctx)[0]).toBe('You discover Saltglass Cutlass because you have Saltglass Shard and Kelpweave.');
    // Research consumes nothing.
    expect(rows(ctx, 'item_instance')).toEqual(itemsBefore);
    // The regional recipe row is reused, never duplicated.
    expect(rows(ctx, 'recipe_template').filter((r) => r.name === 'Saltglass Cutlass')).toHaveLength(1);
    const result = rows(ctx, 'action_result').find((r) => r.characterId === 1n);
    expect(result).toBeDefined();
  });

  it('does not discover a regional recipe with one requirement short', () => {
    const ctx = newCtx({ bag: [[ID.saltglass, 2n], [ID.kelpweave, 5n]] });
    discover(ctx);
    expect(knownIds(ctx)).not.toContain(R.common);
    expect(lines(ctx).some((l) => l.includes('Saltglass Cutlass'))).toBe(false);
  });

  it('never discovers a scroll-learned recipe, even with every requirement held', () => {
    const ctx = newCtx({ bag: [[ID.saltglass, 3n], [ID.kelpweave, 1n], [ID.brinewort, 1n]] });
    discover(ctx);
    expect(knownIds(ctx)).toContain(R.common);
    expect(knownIds(ctx)).not.toContain(R.rare);
    const legendaryBag = newCtx({
      bag: [[ID.tidepearl, 4n], [ID.brinewort, 2n], [ID.emberroot, 2n], [ID.frostmoss, 2n]],
    });
    discover(legendaryBag);
    expect(knownIds(legendaryBag)).not.toContain(R.legendary);
  });

  it('offers regional recipes before the rule candidates, inside the shared limit of 3', () => {
    const ctx = newCtx({
      bag: [
        [ID.saltglass, 3n],
        [ID.kelpweave, 2n],
        [ID.tidepearl, 3n],
        [ID.shard, 3n],
        [ID.cloth, 11n],
        [ID.stone, 11n],
      ],
    });
    discover(ctx);
    const first = lines(ctx);
    expect(first).toHaveLength(3);
    expect(first[0]).toBe('You discover Saltglass Cutlass because you have Saltglass Shard and Kelpweave.');
    expect(first[1]).toBe('You discover Tidepearl Charm because you have Tidepearl and Kelpweave.');
    expect(knownIds(ctx)).toHaveLength(3);
    expect(knownIds(ctx).slice(0, 2)).toEqual([R.common, R.uncommon]);
    // The third is a rule recipe (gen: key), inserted with the full column set and no 4th requirement.
    const rule = rows(ctx, 'recipe_template').find((r) => r.id === knownIds(ctx)[2]);
    expect(rule.key.startsWith('gen:')).toBe(true);
    expect(rule.req4TemplateId).toBe(0n);
    expect(rule.req4Count).toBe(0n);
    expect(rowColumnProblems('recipe_template', rule)).toEqual([]);

    // A second Discover skips the known regional recipes and only adds rule recipes.
    const before = lines(ctx).length;
    discover(ctx);
    const second = lines(ctx).slice(before);
    expect(second.some((l) => l.includes('Saltglass Cutlass') || l.includes('Tidepearl Charm'))).toBe(false);
    expect(knownIds(ctx).filter((id) => id === R.common)).toHaveLength(1);
  });

  it('a regional material outside MATERIAL_KINDS joins the rule recipes through its economy_item kind', () => {
    const ctx = newCtx({ bag: [[ID.brinewort, 2n], [ID.cloth, 5n]] });
    discover(ctx);
    const accessory = rows(ctx, 'recipe_template').find((r) => r.key === 'gen:accessory:brinewort_crystal+scrap_cloth:L1');
    expect(accessory).toBeDefined();
    expect(accessory.req1TemplateId).toBe(ID.brinewort);
    expect(knownIds(ctx)).toContain(accessory.id);
    for (const row of rows(ctx, 'recipe_template').filter((r) => r.key.startsWith('gen:'))) {
      expect(row.req4TemplateId, row.name).toBe(0n);
      expect(row.req4Count, row.name).toBe(0n);
      expect(rowColumnProblems('recipe_template', row), row.name).toEqual([]);
    }
  });
});

describe('craft_recipe with regional recipes', () => {
  const LEGENDARY_BAG: Bag = [[ID.tidepearl, 4n], [ID.brinewort, 2n], [ID.emberroot, 2n], [ID.frostmoss, 2n]];

  it('a legendary recipe with four requirements consumes all four and makes the output', () => {
    const ctx = newCtx({ bag: LEGENDARY_BAG, known: [R.legendary] });
    craft(ctx, { characterId: 1n, recipeTemplateId: R.legendary });
    for (const [id] of LEGENDARY_BAG) expect(countOf(ctx, id), String(id)).toBe(0n);
    expect(countOf(ctx, ID.glaiveOut)).toBe(1n);
    expect(lines(ctx)).toContain('You craft Tidewrought Glaive.');
  });

  it('with only the 4th requirement short it writes the materials message and consumes nothing', () => {
    const bag: Bag = [[ID.tidepearl, 4n], [ID.brinewort, 2n], [ID.emberroot, 2n], [ID.frostmoss, 1n]];
    const ctx = newCtx({ bag, known: [R.legendary] });
    const itemsBefore = clone(rows(ctx, 'item_instance'));
    craft(ctx, { characterId: 1n, recipeTemplateId: R.legendary });
    expect(lines(ctx)).toEqual(['Missing materials to craft this recipe.']);
    expect(rows(ctx, 'item_instance')).toEqual(itemsBefore);
  });

  it('a gear recipe whose primary is an uncommon regional material crafts reinforced', () => {
    const ctx = newCtx({ bag: [[ID.tidepearl, 3n], [ID.kelpweave, 2n]], known: [R.uncommon] });
    craft(ctx, { characterId: 1n, recipeTemplateId: R.uncommon });
    const made = rows(ctx, 'item_instance').find((i) => i.ownerCharacterId === 1n && i.templateId === ID.charmOut);
    expect(made).toBeDefined();
    expect(made.craftQuality).toBe('reinforced');
  });

  it('a common regional primary crafts standard', () => {
    const ctx = newCtx({ bag: [[ID.saltglass, 3n], [ID.kelpweave, 1n]], known: [R.common] });
    craft(ctx, { characterId: 1n, recipeTemplateId: R.common });
    const made = rows(ctx, 'item_instance').find((i) => i.ownerCharacterId === 1n && i.templateId === ID.cutlassOut);
    expect(made.craftQuality).toBe('standard');
  });

  // Review A WR-03: decorateCrafted stamped every crafted piece 'common', so a legendary recipe made a
  // "Common" item (the client reads instance.qualityTier before template.rarity).
  it('a legendary regional output keeps its legendary rarity on the crafted instance', () => {
    const ctx = newCtx({ bag: LEGENDARY_BAG, known: [R.legendary] });
    craft(ctx, { characterId: 1n, recipeTemplateId: R.legendary });
    const made = rows(ctx, 'item_instance').find((i) => i.ownerCharacterId === 1n && i.templateId === ID.glaiveOut);
    expect(made.qualityTier).toBe('legendary');
  });

  it('an uncommon regional accessory keeps uncommon; a common output stays common', () => {
    const charm = newCtx({ bag: [[ID.tidepearl, 3n], [ID.kelpweave, 2n]], known: [R.uncommon] });
    craft(charm, { characterId: 1n, recipeTemplateId: R.uncommon });
    expect(rows(charm, 'item_instance').find((i) => i.templateId === ID.charmOut).qualityTier).toBe('uncommon');
    const cutlass = newCtx({ bag: [[ID.saltglass, 3n], [ID.kelpweave, 1n]], known: [R.common] });
    craft(cutlass, { characterId: 1n, recipeTemplateId: R.common });
    expect(rows(cutlass, 'item_instance').find((i) => i.templateId === ID.cutlassOut).qualityTier).toBe('common');
  });
});

describe('learn_recipe_scroll with regional recipes', () => {
  it("teaches a rare regional recipe from its 'Scroll: <name>' item and consumes the scroll", () => {
    const ctx = newCtx({ bag: [[ID.bladeScroll, 1n], [ID.saltglass, 3n], [ID.kelpweave, 1n], [ID.brinewort, 1n]] });
    const scroll = rows(ctx, 'item_instance').find((i) => i.templateId === ID.bladeScroll);
    learn(ctx, { characterId: 1n, itemInstanceId: scroll.id });
    expect(knownIds(ctx)).toContain(R.rare);
    expect(lines(ctx)).toContain('You have learned: Brinewort Blade');
    expect(countOf(ctx, ID.bladeScroll)).toBe(0n);
    // The learned recipe crafts; its rare foreign secondary does not set the quality, the primary does.
    craft(ctx, { characterId: 1n, recipeTemplateId: R.rare });
    expect(countOf(ctx, ID.bladeOut)).toBe(1n);
  });

  it('teaches a legendary regional recipe from its scroll', () => {
    const ctx = newCtx({ bag: [[ID.glaiveScroll, 1n]] });
    const scroll = rows(ctx, 'item_instance').find((i) => i.templateId === ID.glaiveScroll);
    learn(ctx, { characterId: 1n, itemInstanceId: scroll.id });
    expect(knownIds(ctx)).toContain(R.legendary);
  });
});

describe('salvage_item of a regional output', () => {
  // What the shared rule says the salvage can return, from the same rows the handler reads.
  const componentsFor = (ctx: any, templateId: bigint): SalvageComponent[] => {
    const byId = (id: bigint) => rows(ctx, 'item_template').find((t) => t.id === id);
    const target = byId(templateId);
    const making = rows(ctx, 'recipe_template')
      .filter((r) => r.outputTemplateId === templateId)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((r) => ({
        id: r.id,
        outputCount: r.outputCount,
        parts: recipeRequirements(r)
          .map((req) => ({ part: byId(req.templateId), count: req.count }))
          .filter((x) => x.part !== undefined)
          .map((x) => ({ templateId: x.part.id, name: x.part.name, count: x.count, vendorValue: x.part.vendorValue })),
      }));
    const name = getMaterialForSalvage(target.slot, target.armorType, target.tier ?? 1n);
    const material = name ? rows(ctx, 'item_template').find((t) => t.name === name) : undefined;
    return salvageComponents({
      slot: target.slot,
      armorType: target.armorType,
      tier: target.tier ?? 1n,
      itemValue: target.vendorValue ?? 0n,
      recipes: making,
      slotMaterial: material ? { templateId: material.id, name: material.name, vendorValue: material.vendorValue } : null,
    });
  };

  it('lists components from all four requirements and can return the 4th', () => {
    const glaive = { id: 7000n, templateId: ID.glaiveOut, ownerCharacterId: 1n, equippedSlot: undefined, quantity: 1n };
    const ctx = newCtx({ extraInstances: [glaive] });
    const components = componentsFor(ctx, ID.glaiveOut);
    expect(components.map((c) => c.templateId)).toEqual([ID.tidepearl, ID.brinewort, ID.emberroot, ID.frostmoss]);
    // A timestamp where every component comes back.
    let returned: SalvageComponent[] = [];
    for (let k = 0n; k < 20000n; k += 1n) {
      const ts = T0 + 5_000_000n + k;
      returned = rollSalvage(components, salvageSeed(ts, glaive.id, 1n));
      if (returned.length === components.length) {
        ctx.timestamp = { microsSinceUnixEpoch: ts };
        break;
      }
    }
    expect(returned).toHaveLength(components.length);
    salvage(ctx, { characterId: 1n, itemInstanceId: glaive.id });
    expect(rows(ctx, 'item_instance').some((i) => i.id === glaive.id)).toBe(false);
    for (const c of returned) expect(countOf(ctx, c.templateId!), c.name).toBe(c.amount);
    expect(countOf(ctx, ID.frostmoss)).toBeGreaterThan(0n);
  });
});
