/**
 * craft_recipe_count and the shared batch path (Phase 50 plan 29). Runs the REAL craft_recipe_count,
 * craft_recipe and delete_character handlers captured from index.ts on the strict mock db. Checks:
 *   - a batch consumes exactly count times the recipe and lands a stackable output on one stack, or
 *     makes each non-stackable output its own decorated instance;
 *   - every refusal is decided before any write: item_instance, item_affix, gold and action_result
 *     stay exactly as seeded, and one system line is written;
 *   - count = maxCraftCount succeeds and count + 1 is refused (the stepper maximum is the server's);
 *   - every craft writes the private action_result row (seq + 1, every field replaced);
 *   - craft_recipe keeps its line and crafts one through the same path;
 *   - delete_character removes this character's action_result row and no one else's.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import {
  CRAFTING_MODIFIER_DEFS,
  MATERIAL_DEFS,
  getCraftQualityStatBonus,
  getModifierMagnitude,
  maxCraftCount,
  MAX_CRAFT_COUNT,
} from '../data/crafting_rules';
import { decodeResultLines } from '../data/action_result';
import { buildDisplayName } from '../helpers/items';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };
const bob = { toHexString: () => 'b'.repeat(64) };

let craftCount: (...args: any[]) => any;
let craftRecipe: (...args: any[]) => any;
let deleteCharacter: (...args: any[]) => any;

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
  craftCount = capture('craft_recipe_count');
  craftRecipe = capture('craft_recipe');
  deleteCharacter = capture('delete_character');
}, 120_000);

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const clone = <T>(v: T): T => structuredClone(v);

const matName = (tier: bigint) => MATERIAL_DEFS.find((m) => m.tier === tier)!.name;
const T1 = matName(1n);
const T2 = matName(2n);
const MOD_A = CRAFTING_MODIFIER_DEFS[0];

const ID = {
  t1: 1n,
  t2: 2n,
  second: 5n,
  weapon: 10n,
  potion: 12n,
  oddBox: 13n,
  essence: 21n,
  lesser: 20n,
  modA: 30n,
  missingOutput: 777n,
};

const baseTemplate = {
  slot: 'material',
  stackable: true,
  armorType: 'none',
  rarity: 'common',
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
  requiredLevel: 1n,
  isJunk: false,
};
const tpl = (id: bigint, name: string, over: Record<string, unknown> = {}) => ({ ...baseTemplate, id, name, ...over });

const TEMPLATES = [
  tpl(ID.t1, T1),
  tpl(ID.t2, T2),
  tpl(ID.second, 'Bone Shard'),
  tpl(ID.weapon, 'Test Blade', { slot: 'mainHand', stackable: false, weaponBaseDamage: 5n, weaponDps: 3n }),
  tpl(ID.potion, 'Test Potion', { slot: 'consumable', stackable: true }),
  tpl(ID.oddBox, 'Odd Box', { slot: 'misc', stackable: false }),
  tpl(ID.lesser, 'Lesser Essence'),
  tpl(ID.essence, 'Essence'),
  tpl(ID.modA, MOD_A.name),
];

const recipe = (id: bigint, req1: bigint, output: bigint, recipeType: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Recipe ${id}`,
  recipeType,
  req1TemplateId: req1,
  req1Count: 2n,
  req2TemplateId: ID.second,
  req2Count: 1n,
  req3TemplateId: undefined,
  req3Count: undefined,
  outputTemplateId: output,
  outputCount: 1n,
  ...over,
});

const R = {
  weaponT2: 101n,
  potion: 120n,
  potionTwo: 121n,
  oddBox: 122n,
  noOutput: 123n,
  missing: 999n,
};
const RECIPES = [
  recipe(R.weaponT2, ID.t2, ID.weapon, 'weapon'),
  recipe(R.potion, ID.t1, ID.potion, 'consumable'),
  recipe(R.potionTwo, ID.t1, ID.potion, 'consumable', { outputCount: 2n }),
  recipe(R.oddBox, ID.t1, ID.oddBox, 'consumable'),
  recipe(R.noOutput, ID.t1, ID.missingOutput, 'consumable'),
];

let nextInstance = 1000n;
const stack = (templateId: bigint, quantity: bigint) => ({
  id: nextInstance++,
  templateId,
  ownerCharacterId: 1n,
  equippedSlot: undefined,
  quantity,
});

const resultRow = (characterId: bigint, itemName: string) => ({
  characterId,
  seq: 5n,
  kind: 'craft',
  templateId: 1n,
  itemInstanceId: 2n,
  itemName,
  rarity: 'common',
  craftQuality: 'sturdy',
  quantity: 9n,
  recipeTemplateId: 3n,
  craftCount: 9n,
  linesJson: '[]',
  at: { microsSinceUnixEpoch: T0 - 1n },
});

function newCtx(
  items: any[],
  opts: { craftingAvailable?: boolean; discovered?: bigint[]; sender?: any; actionResults?: any[] } = {},
) {
  const discovered = opts.discovered ?? Object.values(R).filter((r) => r !== R.missing);
  return createMockCtx({
    seed: {
      player: [
        { id: alice, userId: 7n, activeCharacterId: 1n },
        { id: bob, userId: 8n, activeCharacterId: 2n },
      ],
      character: [
        { id: 1n, ownerUserId: 7n, name: 'Mirel', className: 'Ashwarden', level: 5n, gold: 10n, locationId: 10n },
        { id: 2n, ownerUserId: 8n, name: 'Tor', className: 'Ashwarden', level: 5n, gold: 3n, locationId: 10n },
      ],
      location: [{ id: 10n, name: 'Saltmere', craftingAvailable: opts.craftingAvailable ?? true }],
      item_template: TEMPLATES,
      recipe_template: RECIPES,
      recipe_discovered: discovered.map((rid, i) => ({
        id: BigInt(i + 1),
        characterId: 1n,
        recipeTemplateId: rid,
        discoveredAt: { microsSinceUnixEpoch: T0 },
      })),
      item_instance: items,
      item_affix: [],
      action_result: opts.actionResults ?? [],
    },
    sender: opts.sender ?? alice,
    timestampMicros: T0,
    strict: true,
  });
}

type Args = {
  recipeTemplateId: bigint;
  count: bigint;
  catalystTemplateId?: bigint;
  modifier1TemplateId?: bigint;
  modifier2TemplateId?: bigint;
  modifier3TemplateId?: bigint;
};
const batch = (ctx: any, args: Args) => craftCount(ctx, { characterId: 1n, ...args });

const messages = (ctx: any): string[] => rows(ctx, 'event_private').map((e) => e.message);
const bag = (ctx: any, templateId: bigint): bigint =>
  rows(ctx, 'item_instance')
    .filter((i) => i.templateId === templateId && !i.equippedSlot)
    .reduce((sum, i) => sum + (i.quantity ?? 1n), 0n);
const copies = (ctx: any, templateId: bigint) => rows(ctx, 'item_instance').filter((i) => i.templateId === templateId);

function snapshot(ctx: any) {
  return clone({
    item_instance: rows(ctx, 'item_instance'),
    item_affix: rows(ctx, 'item_affix'),
    gold: rows(ctx, 'character').map((c) => [c.id, c.gold]),
    action_result: rows(ctx, 'action_result'),
  });
}

/** Runs the batch and asserts nothing changed but exactly one system line. */
function expectRefused(ctx: any, args: Args, message?: string) {
  const before = snapshot(ctx);
  batch(ctx, args);
  expect(snapshot(ctx)).toEqual(before);
  const events = rows(ctx, 'event_private');
  expect(events).toHaveLength(1);
  expect(events[0].kind).toBe('system');
  if (message !== undefined) expect(events[0].message).toBe(message);
}

const plenty = () => [stack(ID.t1, 6n), stack(ID.t2, 6n), stack(ID.second, 6n)];

describe('craft_recipe_count success', () => {
  it('a stackable consumable batch consumes count x the recipe and lands on one stack', () => {
    const ctx = newCtx([stack(ID.t1, 6n), stack(ID.second, 6n)]);
    batch(ctx, { recipeTemplateId: R.potion, count: 3n });
    expect(bag(ctx, ID.t1)).toBe(0n);
    expect(bag(ctx, ID.second)).toBe(3n);
    const potions = copies(ctx, ID.potion);
    expect(potions).toHaveLength(1);
    expect(potions[0].quantity).toBe(3n);
    expect(rows(ctx, 'event_private')).toHaveLength(1);
    expect(rows(ctx, 'event_private')[0].kind).toBe('reward');
    expect(messages(ctx)).toEqual(['You craft 3x Test Potion.']);

    const row = rows(ctx, 'action_result')[0];
    expect(rows(ctx, 'action_result')).toHaveLength(1);
    expect(row.characterId).toBe(1n);
    expect(row.seq).toBe(1n);
    expect(row.kind).toBe('craft');
    expect(row.templateId).toBe(ID.potion);
    expect(row.itemInstanceId).toBe(potions[0].id);
    expect(row.itemName).toBe('Test Potion');
    expect(row.craftQuality).toBeUndefined();
    expect(row.quantity).toBe(3n);
    expect(row.recipeTemplateId).toBe(R.potion);
    expect(row.craftCount).toBe(3n);
    expect(decodeResultLines(row.linesJson)).toEqual([
      { kind: 'used', templateId: ID.t1, name: T1, quantity: 6n, total: 0n, instanceId: null },
      { kind: 'used', templateId: ID.second, name: 'Bone Shard', quantity: 3n, total: 3n, instanceId: null },
    ]);
  });

  it('merges into an existing stack of the output', () => {
    const ctx = newCtx([stack(ID.t1, 4n), stack(ID.second, 2n), stack(ID.potion, 5n)]);
    batch(ctx, { recipeTemplateId: R.potion, count: 2n });
    const potions = copies(ctx, ID.potion);
    expect(potions).toHaveLength(1);
    expect(potions[0].quantity).toBe(7n);
  });

  it('outputCount multiplies into the one stack and the line', () => {
    const ctx = newCtx([stack(ID.t1, 6n), stack(ID.second, 6n)]);
    batch(ctx, { recipeTemplateId: R.potionTwo, count: 2n });
    const potions = copies(ctx, ID.potion);
    expect(potions).toHaveLength(1);
    expect(potions[0].quantity).toBe(4n);
    expect(messages(ctx)).toEqual(['You craft 4x Test Potion.']);
    expect(rows(ctx, 'action_result')[0].quantity).toBe(4n);
    expect(rows(ctx, 'action_result')[0].craftCount).toBe(2n);
  });

  it('a gear batch with an essence makes decorated instances and consumes the essence and reagent per craft', () => {
    const ctx = newCtx([...plenty(), stack(ID.essence, 2n), stack(ID.modA, 2n)]);
    batch(ctx, {
      recipeTemplateId: R.weaponT2,
      count: 2n,
      catalystTemplateId: ID.essence,
      modifier1TemplateId: ID.modA,
    });
    const made = copies(ctx, ID.weapon);
    expect(made).toHaveLength(2);
    const bonus = getCraftQualityStatBonus('reinforced');
    expect(bonus).toBeGreaterThan(0n);
    for (const w of made) {
      expect(w.craftQuality).toBe('reinforced');
      expect(w.qualityTier).toBe('common');
      const affixes = rows(ctx, 'item_affix').filter((a) => a.itemInstanceId === w.id);
      const suffixes = affixes.filter((a) => a.affixType === 'suffix');
      expect(suffixes).toHaveLength(1);
      expect(suffixes[0].statKey).toBe(MOD_A.statKey);
      expect(suffixes[0].magnitude).toBe(getModifierMagnitude('essence', MOD_A.statKey));
      expect(w.displayName).toBe(buildDisplayName('Test Blade', suffixes));
      const implicit = affixes.filter((a) => a.affixType === 'implicit');
      expect(implicit.map((a) => [a.statKey, a.magnitude]).sort()).toEqual(
        [
          ['weaponBaseDamage', bonus],
          ['weaponDps', bonus],
        ].sort(),
      );
    }
    expect(bag(ctx, ID.t2)).toBe(2n);
    expect(bag(ctx, ID.second)).toBe(4n);
    expect(bag(ctx, ID.essence)).toBe(0n);
    expect(bag(ctx, ID.modA)).toBe(0n);

    const row = rows(ctx, 'action_result')[0];
    expect(row.craftQuality).toBe('reinforced');
    expect(row.craftCount).toBe(2n);
    expect(row.quantity).toBe(2n);
    expect(row.itemInstanceId).toBe(made[1].id);
    expect(row.itemName).toBe(made[1].displayName);
    const lines = decodeResultLines(row.linesJson);
    expect(lines.map((l) => [l.kind, l.templateId, l.quantity, l.total])).toEqual([
      ['used', ID.t2, 4n, 2n],
      ['used', ID.second, 2n, 4n],
      ['used', ID.essence, 2n, 0n],
      ['used', ID.modA, 2n, 0n],
    ]);
    expect(messages(ctx)).toEqual([`You craft 2x ${made[1].displayName}.`]);
  });

  it('a non-stackable, non-gear output makes separate undecorated instances', () => {
    const ctx = newCtx([stack(ID.t1, 6n), stack(ID.second, 6n)]);
    batch(ctx, { recipeTemplateId: R.oddBox, count: 2n });
    const boxes = copies(ctx, ID.oddBox);
    expect(boxes).toHaveLength(2);
    for (const b of boxes) {
      expect(b.quantity).toBe(1n);
      expect(b.craftQuality).toBeUndefined();
    }
    expect(rows(ctx, 'item_affix')).toEqual([]);
    expect(rows(ctx, 'action_result')[0].craftQuality).toBeUndefined();
    expect(rows(ctx, 'action_result')[0].itemInstanceId).toBe(boxes[1].id);
    expect(messages(ctx)).toEqual(['You craft 2x Odd Box.']);
  });
});

describe('craft_recipe_count max parity', () => {
  const stateFor = (k: bigint, withEssence: boolean) => {
    const items: any[] = [stack(ID.t2, k), stack(ID.second, 50n)];
    if (withEssence) items.push(stack(ID.essence, k), stack(ID.modA, k));
    return items.filter((i) => i.quantity > 0n);
  };
  const argsFor = (count: bigint, withEssence: boolean): Args => ({
    recipeTemplateId: R.weaponT2,
    count,
    ...(withEssence ? { catalystTemplateId: ID.essence, modifier1TemplateId: ID.modA } : {}),
  });

  for (const withEssence of [false, true]) {
    for (let k = 0n; k <= 9n; k++) {
      it(`bag ${k} of the first material ${withEssence ? 'with' : 'without'} an essence`, () => {
        const ctx = newCtx(stateFor(k, withEssence));
        const input = {
          recipe: RECIPES[0],
          primaryMaterialName: T2,
          catalyst: withEssence ? { templateId: ID.essence, name: 'Essence' } : null,
          modifiers: withEssence ? [{ templateId: ID.modA, name: MOD_A.name }] : [],
          countOf: (id: bigint) => bag(ctx, id),
        };
        const max = maxCraftCount(input);
        expect(max).toBe(k / 2n);
        // count + 1 is refused with nothing changed
        expectRefused(ctx, argsFor(max + 1n, withEssence));
        if (max > 0n) {
          const ok = newCtx(stateFor(k, withEssence));
          batch(ok, argsFor(max, withEssence));
          expect(copies(ok, ID.weapon)).toHaveLength(Number(max));
          expect(rows(ok, 'event_private')[0].kind).toBe('reward');
          expect(rows(ok, 'action_result')[0].craftCount).toBe(max);
        }
      });
    }
  }

  it('the cap is 99 even when the bag allows more', () => {
    const ctx = newCtx([stack(ID.t1, 500n), stack(ID.second, 500n)]);
    batch(ctx, { recipeTemplateId: R.potion, count: MAX_CRAFT_COUNT });
    expect(bag(ctx, ID.potion)).toBe(99n);
  });
});

describe('craft_recipe_count refusals cost nothing', () => {
  it('count 0', () => {
    expectRefused(newCtx(plenty()), { recipeTemplateId: R.potion, count: 0n }, 'Choose at least one to craft.');
  });

  it('count 100', () => {
    expectRefused(
      newCtx([stack(ID.t1, 500n), stack(ID.second, 500n)]),
      { recipeTemplateId: R.potion, count: 100n },
      'You can craft up to 99 at once.',
    );
  });

  it('one more than the materials allow', () => {
    expectRefused(
      newCtx([stack(ID.t1, 5n), stack(ID.second, 6n)]),
      { recipeTemplateId: R.potion, count: 3n },
      'Missing materials to craft this recipe.',
    );
  });

  it('an essence with only one on hand at count 2', () => {
    expectRefused(
      newCtx([...plenty(), stack(ID.essence, 1n), stack(ID.modA, 5n)]),
      { recipeTemplateId: R.weaponT2, count: 2n, catalystTemplateId: ID.essence, modifier1TemplateId: ID.modA },
      'Missing catalyst (Essence)',
    );
  });

  it('an essence too weak for the quality', () => {
    expectRefused(
      newCtx([...plenty(), stack(ID.lesser, 5n), stack(ID.modA, 5n)]),
      { recipeTemplateId: R.weaponT2, count: 2n, catalystTemplateId: ID.lesser, modifier1TemplateId: ID.modA },
      'Essence tier too low for this craft quality',
    );
  });

  it('an essence with no reagent', () => {
    expectRefused(
      newCtx([...plenty(), stack(ID.essence, 5n)]),
      { recipeTemplateId: R.weaponT2, count: 2n, catalystTemplateId: ID.essence },
      'Must provide at least one reagent when using an Essence',
    );
  });

  it('recipe not found', () => {
    expectRefused(newCtx(plenty()), { recipeTemplateId: R.missing, count: 1n }, 'Recipe not found');
  });

  it('recipe not discovered', () => {
    expectRefused(newCtx(plenty(), { discovered: [] }), { recipeTemplateId: R.potion, count: 1n }, 'Recipe not discovered');
  });

  it('a recipe whose output template is missing', () => {
    expectRefused(newCtx(plenty()), { recipeTemplateId: R.noOutput, count: 1n }, 'Recipe output not found');
  });

  it('no crafting station', () => {
    expectRefused(
      newCtx(plenty(), { craftingAvailable: false }),
      { recipeTemplateId: R.potion, count: 2n },
      'Crafting is only available at locations with crafting stations.',
    );
  });

  it('a refusal leaves an existing action_result row exactly as it was', () => {
    const ctx = newCtx(plenty(), { actionResults: [resultRow(1n, 'Old')] });
    expectRefused(ctx, { recipeTemplateId: R.potion, count: 0n }, 'Choose at least one to craft.');
    expect(rows(ctx, 'action_result')).toEqual([resultRow(1n, 'Old')]);
  });

  it('another owner call throws and every table stays the same', () => {
    const ctx = newCtx(plenty(), { sender: bob });
    const before = snapshot(ctx);
    expect(() => batch(ctx, { recipeTemplateId: R.potion, count: 1n })).toThrow();
    expect(snapshot(ctx)).toEqual(before);
    expect(rows(ctx, 'event_private')).toEqual([]);
  });
});

describe('the action_result row is replaced by every craft', () => {
  it('a second craft makes seq 2 and replaces every field, leaving another character row alone', () => {
    const other = resultRow(2n, 'Tor Result');
    const ctx = newCtx([...plenty(), stack(ID.essence, 1n), stack(ID.modA, 1n)], { actionResults: [other] });
    batch(ctx, {
      recipeTemplateId: R.weaponT2,
      count: 1n,
      catalystTemplateId: ID.essence,
      modifier1TemplateId: ID.modA,
    });
    const first = clone(rows(ctx, 'action_result').find((r) => r.characterId === 1n));
    expect(first.seq).toBe(1n);
    expect(first.craftQuality).toBe('reinforced');

    batch(ctx, { recipeTemplateId: R.potion, count: 2n });
    const mine = rows(ctx, 'action_result').filter((r) => r.characterId === 1n);
    expect(mine).toHaveLength(1);
    expect(mine[0].seq).toBe(2n);
    expect(mine[0].templateId).toBe(ID.potion);
    expect(mine[0].craftQuality).toBeUndefined();
    expect(mine[0].recipeTemplateId).toBe(R.potion);
    expect(mine[0].quantity).toBe(2n);
    expect(mine[0].craftCount).toBe(2n);
    expect(decodeResultLines(mine[0].linesJson).map((l) => l.templateId)).toEqual([ID.t1, ID.second]);
    expect(rows(ctx, 'action_result').find((r) => r.characterId === 2n)).toEqual(other);
  });
});

describe('craft_recipe uses the same path', () => {
  it('crafts one with its unchanged line and writes a row with craftCount 1', () => {
    const ctx = newCtx([stack(ID.t1, 6n), stack(ID.second, 6n)]);
    craftRecipe(ctx, { characterId: 1n, recipeTemplateId: R.potionTwo });
    expect(messages(ctx)).toEqual(['You craft Test Potion.']);
    expect(rows(ctx, 'event_private')[0].kind).toBe('reward');
    expect(bag(ctx, ID.potion)).toBe(2n);
    const row = rows(ctx, 'action_result')[0];
    expect(row.craftCount).toBe(1n);
    expect(row.quantity).toBe(2n);
    expect(row.seq).toBe(1n);
    expect(row.kind).toBe('craft');
  });

  it('a gear craft_recipe row carries the quality and the display name', () => {
    const ctx = newCtx([...plenty(), stack(ID.essence, 1n), stack(ID.modA, 1n)]);
    craftRecipe(ctx, {
      characterId: 1n,
      recipeTemplateId: R.weaponT2,
      catalystTemplateId: ID.essence,
      modifier1TemplateId: ID.modA,
    });
    const made = copies(ctx, ID.weapon)[0];
    const row = rows(ctx, 'action_result')[0];
    expect(row.craftQuality).toBe('reinforced');
    expect(row.itemInstanceId).toBe(made.id);
    expect(row.itemName).toBe(made.displayName);
    expect(messages(ctx)).toEqual([`You craft ${made.displayName}.`]);
  });
});

describe('delete_character cleanup', () => {
  it('removes this character action_result row after a craft and leaves another character row alone', () => {
    const other = resultRow(2n, 'Tor Result');
    const ctx = newCtx([stack(ID.t1, 6n), stack(ID.second, 6n)], { actionResults: [other] });
    batch(ctx, { recipeTemplateId: R.potion, count: 1n });
    expect(rows(ctx, 'action_result').map((r) => r.characterId).sort()).toEqual([1n, 2n]);
    deleteCharacter(ctx, { characterId: 1n });
    expect(rows(ctx, 'action_result')).toEqual([other]);
    expect(rows(ctx, 'character').map((c) => c.id)).toEqual([2n]);
  });

  it('succeeds with no row', () => {
    const other = resultRow(2n, 'Tor Result');
    const ctx = newCtx([], { actionResults: [other] });
    expect(() => deleteCharacter(ctx, { characterId: 1n })).not.toThrow();
    expect(rows(ctx, 'action_result')).toEqual([other]);
  });
});
