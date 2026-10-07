/**
 * Salvage is a chance at a smaller return, never a guaranteed one, and no craft then salvage loop
 * can repeat (Plan 50-40, owner 2026-10-07: "Salvaging should always return less materials. A
 * salvage should never return enough parts to just infinitely remake it over and over." and "Salvage
 * should never be a guaranteed return. Just a chance for some lesser amount of some components.
 * Rare components have rarer chance to be returned.").
 *
 * Pure: imports only crafting_rules and recipe_rules. Checks the hit rates by tier over many seeds,
 * the strict cap (amount x outputCount < req for every recipe that makes the item), the full-luck
 * loop (craft, then salvage with every roll hitting, always loses material), every recipe the
 * generator can make, and that a reagent is never a recipe input.
 */
import { describe, expect, it } from 'vitest';
import {
  CRAFTING_MODIFIER_DEFS,
  MATERIAL_DEFS,
  itemKeyFromName,
  rollSalvage,
  salvageComponents,
  salvageSeed,
} from './crafting_rules';
import type { SalvageComponent, SalvageRecipeParts } from './crafting_rules';
import {
  MATERIAL_KINDS,
  generatedOutput,
  recipeCandidates,
} from './recipe_rules';
import type { BagMaterial } from './recipe_rules';

const T0 = 1_700_000_000_000_000n;

// ---------------------------------------------------------------------------
// Distribution
// ---------------------------------------------------------------------------

describe('salvage chance distribution', () => {
  const SEEDS = 20000;
  const components: SalvageComponent[] = [
    { templateId: 1n, name: 'Copper Ore', amount: 1n, chancePct: 50n },
    { templateId: 2n, name: 'Iron Ore', amount: 1n, chancePct: 25n },
    { templateId: 3n, name: 'Darksteel Ore', amount: 1n, chancePct: 10n },
  ];
  const hits = [0, 0, 0];
  let empty = 0;
  let all = 0;
  for (let k = 0; k < SEEDS; k += 1) {
    const got = rollSalvage(components, salvageSeed(T0 + BigInt(k), 500n, 1n));
    if (got.length === 0) empty += 1;
    if (got.length === 3) all += 1;
    for (const g of got) hits[Number(g.templateId) - 1] += 1;
  }
  const rate = (n: number) => (n / SEEDS) * 100;

  it('hit rates are within 3 points of 50, 25 and 10, and fall with the tier', () => {
    // eslint-disable-next-line no-console
    console.log(
      `salvage rates over ${SEEDS} seeds: tier1 ${rate(hits[0]).toFixed(2)}%, tier2 ${rate(hits[1]).toFixed(2)}%, ` +
        `tier3 ${rate(hits[2]).toFixed(2)}%, empty ${rate(empty).toFixed(2)}%, all three ${rate(all).toFixed(2)}%`,
    );
    expect(Math.abs(rate(hits[0]) - 50)).toBeLessThan(3);
    expect(Math.abs(rate(hits[1]) - 25)).toBeLessThan(3);
    expect(Math.abs(rate(hits[2]) - 10)).toBeLessThan(3);
    expect(rate(hits[0])).toBeGreaterThan(rate(hits[1]));
    expect(rate(hits[1])).toBeGreaterThan(rate(hits[2]));
  });

  it('no component hits on every seed', () => {
    for (const h of hits) expect(h).toBeLessThan(SEEDS);
  });

  it('the empty outcome happens, at about 0.5 x 0.75 x 0.9 = 33.75 percent', () => {
    expect(empty).toBeGreaterThan(0);
    expect(Math.abs(rate(empty) - 33.75)).toBeLessThan(3);
  });

  it('all three come back together on at least one seed', () => {
    expect(all).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The strict cap
// ---------------------------------------------------------------------------

interface Case {
  itemValue: bigint;
  recipes: SalvageRecipeParts[];
}

/** A small deterministic generator, so the property grid never changes between runs. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const NAMES = ['Copper Ore', 'Iron Ore', 'Darksteel Ore', 'Iron Shard', 'Scrap Cloth', 'Void Crystal'];
const VALUES = [0n, 2n, 8n];
const ITEM_VALUES = [0n, 5n, 1000n];

function allCases(): Case[] {
  const cases: Case[] = [];
  // Every single-part recipe: output count 1 to 3, req 1 to 6, vendor value 0, 2, 8, item value 0, 5, 1000.
  for (let out = 1n; out <= 3n; out += 1n) {
    for (let req = 1n; req <= 6n; req += 1n) {
      for (const vendorValue of VALUES) {
        for (const itemValue of ITEM_VALUES) {
          cases.push({
            itemValue,
            recipes: [{ id: 1n, outputCount: out, parts: [{ templateId: 1n, name: 'Iron Shard', count: req, vendorValue }] }],
          });
        }
      }
    }
  }
  // One to three parts, zero to two extra recipes that share materials.
  const next = lcg(50040);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)];
  for (let n = 0; n < 4000; n += 1) {
    const makeRecipe = (id: bigint, names: string[]): SalvageRecipeParts => ({
      id,
      outputCount: BigInt(1 + Math.floor(next() * 3)),
      parts: names.map((name, i) => ({
        templateId: BigInt(i + 1),
        name,
        count: BigInt(1 + Math.floor(next() * 6)),
        vendorValue: pick(VALUES),
      })),
    });
    const partCount = 1 + Math.floor(next() * 3);
    const names: string[] = [];
    while (names.length < partCount) {
      const name = pick(NAMES);
      if (names.indexOf(name) === -1) names.push(name);
    }
    const recipes = [makeRecipe(BigInt(1 + Math.floor(next() * 9)), names)];
    const extra = Math.floor(next() * 3);
    for (let e = 0; e < extra; e += 1) {
      const shared = names.filter(() => next() < 0.6);
      if (shared.length === 0) shared.push(names[0]);
      if (next() < 0.5) shared.push(pick(NAMES.filter((x) => shared.indexOf(x) === -1)));
      recipes.push(makeRecipe(BigInt(1 + Math.floor(next() * 9)), shared));
    }
    cases.push({ itemValue: pick(ITEM_VALUES), recipes });
  }
  return cases;
}

function requiredOf(recipe: SalvageRecipeParts, name: string): bigint {
  const key = itemKeyFromName(name);
  let sum = 0n;
  for (const p of recipe.parts) if (itemKeyFromName(p.name) === key && p.count > 0n) sum += p.count;
  return sum;
}

describe('salvage strict cap', () => {
  const cases = allCases();

  it('covers a real grid of recipes', () => {
    expect(cases.length).toBeGreaterThan(4000);
  });

  it('every component and every recipe that makes the item: amount x outputCount < req', () => {
    let withComponents = 0;
    for (const c of cases) {
      const comps = salvageComponents({ slot: 'mainHand', tier: 1n, itemValue: c.itemValue, recipes: c.recipes, slotMaterial: null });
      if (comps.length > 0) withComponents += 1;
      for (const comp of comps) {
        expect(comp.amount > 0n).toBe(true);
        for (const r of c.recipes) {
          const req = requiredOf(r, comp.name);
          if (req === 0n) continue;
          expect(comp.amount * (r.outputCount ?? 1n) < req).toBe(true);
        }
      }
    }
    expect(withComponents).toBeGreaterThan(1000);
  });

  it('the sum of amounts x outputCount is below the total required, for every recipe', () => {
    for (const c of cases) {
      const comps = salvageComponents({ slot: 'mainHand', tier: 1n, itemValue: c.itemValue, recipes: c.recipes, slotMaterial: null });
      const sum = comps.reduce((s, x) => s + x.amount, 0n);
      for (const r of c.recipes) {
        const total = r.parts.reduce((s, p) => s + (p.count > 0n ? p.count : 0n), 0n);
        if (sum > 0n) expect(sum * (r.outputCount ?? 1n) < total).toBe(true);
      }
    }
  });

  it('full luck is worth at most the item', () => {
    for (const c of cases) {
      const comps = salvageComponents({ slot: 'mainHand', tier: 1n, itemValue: c.itemValue, recipes: c.recipes, slotMaterial: null });
      const lowest = [...c.recipes].sort((a, b) => (a.id! < b.id! ? -1 : a.id! > b.id! ? 1 : 0))[0];
      let worth = 0n;
      for (const comp of comps) {
        const p = lowest.parts.find((x) => itemKeyFromName(x.name) === itemKeyFromName(comp.name))!;
        worth += comp.amount * (p.vendorValue ?? 0n);
      }
      expect(worth <= c.itemValue).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// The full-luck loop
// ---------------------------------------------------------------------------

describe('salvage can never feed a craft loop', () => {
  const recipeGrid: Array<{ out: bigint; parts: Array<[string, bigint, bigint]> }> = [];
  for (const out of [1n, 2n]) {
    for (const a of [1n, 2n, 3n, 4n, 6n]) {
      for (const b of [0n, 1n, 2n, 5n]) {
        const parts: Array<[string, bigint, bigint]> = [['Copper Ore', a, 2n]];
        if (b > 0n) parts.push(['Rough Hide', b, 2n]);
        recipeGrid.push({ out, parts });
      }
    }
  }

  it('craft, then salvage with every roll hitting: material strictly falls and the loop ends', () => {
    let loops = 0;
    for (const { out, parts } of recipeGrid) {
      const recipe: SalvageRecipeParts = {
        id: 1n,
        outputCount: out,
        parts: parts.map(([name, count, vendorValue], i) => ({ templateId: BigInt(i + 1), name, count, vendorValue })),
      };
      const itemValue = 1000n;
      const bag = new Map<string, bigint>();
      for (const [name, count] of parts) bag.set(name, count * 6n);
      const units = () => [...bag.values()].reduce((s, v) => s + v, 0n);
      const start = units();
      let last = start;
      let rounds = 0;
      for (;;) {
        const canCraft = recipe.parts.every((p) => (bag.get(p.name) ?? 0n) >= p.count);
        if (!canCraft) break;
        for (const p of recipe.parts) bag.set(p.name, (bag.get(p.name) ?? 0n) - p.count);
        const comps = salvageComponents({ slot: 'mainHand', tier: 1n, itemValue, recipes: [recipe], slotMaterial: null });
        // Every roll hits: all components come back, once per crafted item.
        for (let i = 0n; i < out; i += 1n) {
          for (const comp of comps) bag.set(comp.name, (bag.get(comp.name) ?? 0n) + comp.amount);
        }
        const now = units();
        expect(now < last).toBe(true);
        last = now;
        rounds += 1;
        loops += 1;
        expect(rounds <= Number(start)).toBe(true);
      }
      expect(rounds).toBeGreaterThan(0);
    }
    expect(loops).toBeGreaterThan(recipeGrid.length);
  });
});

// ---------------------------------------------------------------------------
// Generated recipes and the reagent invariant
// ---------------------------------------------------------------------------

describe('salvage over every generated recipe', () => {
  const bag: BagMaterial[] = [];
  let id = 1n;
  for (const key of Object.keys(MATERIAL_KINDS)) {
    const def = MATERIAL_DEFS.find((m) => m.key === key);
    bag.push({
      templateId: id,
      name: def ? def.name : key.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      tier: def ? def.tier : 1n,
      vendorValue: def ? (def.vendorValue ?? 1n) : 1n,
      count: 10n,
    });
    id += 1n;
  }
  const reagents: BagMaterial[] = CRAFTING_MODIFIER_DEFS.map((d, i) => ({
    templateId: 500n + BigInt(i),
    name: d.name,
    tier: 1n,
    vendorValue: 3n,
    count: 10n,
  }));

  const generated: Array<{ level: bigint; recipe: ReturnType<typeof generatedOutput>['recipe']; value: bigint; slot: string; armorType: string; tier: bigint }> = [];
  for (const level of [1n, 11n, 21n]) {
    for (const candidate of recipeCandidates([...bag, ...reagents], level)) {
      const made = generatedOutput(candidate, () => false);
      generated.push({
        level,
        recipe: made.recipe,
        value: made.itemTemplate.vendorValue,
        slot: made.itemTemplate.slot,
        armorType: made.itemTemplate.armorType,
        tier: made.itemTemplate.tier,
      });
    }
  }

  const partsOf = (r: (typeof generated)[number]['recipe']) => {
    const nameOf = (templateId: bigint) =>
      [...bag, ...reagents].find((m) => m.templateId === templateId)!;
    const parts = [
      { templateId: r.req1TemplateId, name: nameOf(r.req1TemplateId).name, count: r.req1Count, vendorValue: nameOf(r.req1TemplateId).vendorValue },
      { templateId: r.req2TemplateId, name: nameOf(r.req2TemplateId).name, count: r.req2Count, vendorValue: nameOf(r.req2TemplateId).vendorValue },
    ];
    return { id: 1n, outputCount: r.outputCount, parts };
  };

  it('the generator makes recipes at all three levels', () => {
    expect(generated.length).toBeGreaterThan(30);
    for (const level of [1n, 11n, 21n]) expect(generated.some((g) => g.level === level)).toBe(true);
  });

  it('every output returns only its own inputs, at most req - 1, and never a req 1 secondary', () => {
    let returning = 0;
    for (const g of generated) {
      const recipe = partsOf(g.recipe);
      const comps = salvageComponents({ slot: g.slot, armorType: g.armorType, tier: g.tier, itemValue: g.value, recipes: [recipe], slotMaterial: null });
      if (comps.length > 0) returning += 1;
      for (const comp of comps) {
        const part = recipe.parts.find((p) => itemKeyFromName(p.name) === itemKeyFromName(comp.name));
        expect(part, comp.name).toBeDefined();
        expect(comp.amount <= part!.count - 1n).toBe(true);
        expect(part!.count > 1n).toBe(true);
      }
    }
    expect(returning).toBeGreaterThan(0);
  });

  it('no recipe lists a reagent as req1 or req2', () => {
    const reagentIds = new Set(reagents.map((r) => r.templateId));
    for (const g of generated) {
      expect(reagentIds.has(g.recipe.req1TemplateId)).toBe(false);
      expect(reagentIds.has(g.recipe.req2TemplateId)).toBe(false);
    }
  });

  it('no crafting reagent is a recipe material kind: the bonus reagent never closes a loop', () => {
    for (const def of CRAFTING_MODIFIER_DEFS) {
      expect(Object.prototype.hasOwnProperty.call(MATERIAL_KINDS, def.key), def.key).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(MATERIAL_KINDS, itemKeyFromName(def.name)), def.name).toBe(false);
    }
  });
});
