/**
 * Phase 51.3 code review B WR-01 / WR-02, owner decision "repair in place": the live job 8206 reply
 * (local uwr, Kesterlane Basin) through the region apply and through repairRegionEconomyOutputs, on the
 * strict mock db under the recording schema. No LLM call is made; the reply is the stored fixture.
 *
 * Checks:
 *   - with the fixed rules the apply writes "Kesterlane Basin Jerkin" (chest, rule description) for the
 *     recipe the model called "Salted Wayfarer Jerky", and "Wickthread Sash" as chest, not legs;
 *   - the repair turns rows written by the old rules (8207 jerky as chest armor, 8208 sash as legs) into
 *     exactly what the fixed apply writes, keeping every id, so recipes, loot and bags still point at them;
 *   - the repair is idempotent and refuses a region with no economy, an unfinished one, or no stored design.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
// The tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { readFileSync } from 'node:fs';
// @ts-ignore
import { join } from 'node:path';
// @ts-ignore
import { fileURLToPath } from 'node:url';
import { createMockCtx } from './test-utils';
import { encodeRouteInput } from './llm_inputs';
import type { RegionEconomyInput } from '../data/economy_design_rules';
import { ARMOR_FORMS, armorGrowth } from '../data/recipe_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

let econ: typeof import('./region_economy');

beforeAll(async () => {
  await import('../schema/tables');
  econ = await import('./region_economy');
}, 120_000);

const FIXTURE_DIR = fileURLToPath(new URL('./__fixtures__/economy/', import.meta.url));
const LIVE_REPLY = readFileSync(join(FIXTURE_DIR, 'kesterlane_live.reply.json'), 'utf8');

const T0 = 1_700_000_000_000_000n;
const JOB_ID = 8206n;
const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];

/** The stored input of job 8206 (its request_json), trimmed to what the apply reads. */
function liveInput(): RegionEconomyInput {
  return {
    mode: 'region',
    regionId: 1n,
    regionName: 'Kesterlane Basin',
    biome: 'desert',
    areaLevel: 1,
    dominantFaction: 'The Lampwrights of Orrin Sill',
    landmarks: [],
    threats: [],
    terrains: ['dungeon', 'plains', 'swamp', 'town', 'woods'],
    enemies: [
      { ref: 'E1', templateId: 1n, name: 'Salt-Crust Skitterer', creatureType: 'beast', level: 1 },
      { ref: 'E2', templateId: 2n, name: 'Glass Orchard Wisp', creatureType: 'elemental', level: 1 },
      { ref: 'E3', templateId: 3n, name: 'Brine Sentinel', creatureType: 'construct', level: 1 },
    ],
    recipeSlots: [
      { tier: 'common', foreignRegionIndexes: [] },
      { tier: 'common', foreignRegionIndexes: [] },
      { tier: 'uncommon', foreignRegionIndexes: [] },
    ],
    foreignRegions: [],
    foreign: [],
    existingMaterials: [],
  };
}

const requestJson = (input: RegionEconomyInput) =>
  JSON.stringify({ regionId: '1', mode: 'region', enemyTemplateId: '0', characterId: '1', input: encodeRouteInput(input) });

function liveWorld(status = 'pending', extra: Record<string, any[]> = {}) {
  return {
    region: [{ id: 1n, name: 'Kesterlane Basin', dangerMultiplier: 100n }],
    item_template: [],
    recipe_template: [],
    economy_item: [],
    enemy_loot_entry: [],
    region_recipe: [],
    region_economy: [
      {
        regionId: 1n,
        status,
        jobId: JOB_ID,
        otherRegionIds: '[]',
        createdAt: { microsSinceUnixEpoch: T0 - 10n },
        updatedAt: { microsSinceUnixEpoch: T0 - 10n },
      },
    ],
    llm_job: [{ id: JOB_ID, route: 'region_economy', status: 'completed', requestJson: requestJson(liveInput()), resultText: LIVE_REPLY }],
    ...extra,
  };
}

const ctxFor = (seed: Record<string, any[]>) => createMockCtx({ seed, strict: true, timestampMicros: T0 } as any);

function applied(ctx: any): void {
  econ.applyRegionEconomyResult(ctx, { domain: 'region_economy', playerId: null, contextJson: requestJson(liveInput()) }, LIVE_REPLY);
}

const output = (ctx: any, index: number) => {
  const tag = rows(ctx, 'economy_item').find((r: any) => r.slotKey === `recipe:${index}`);
  return { tag, item: rows(ctx, 'item_template').find((t: any) => t.id === tag?.itemTemplateId) };
};
const recipeRow = (ctx: any, index: number) => rows(ctx, 'recipe_template').find((r: any) => r.key === `region:1:r${index}`);

/** Turn the fixed apply's rows back into what the old rules wrote for job 8206 (items 8207, 8208). */
function makeOld(ctx: any): void {
  const jerky = output(ctx, 0).item;
  Object.assign(jerky, {
    name: 'Salted Wayfarer Jerky',
    description: 'Strips of cured meat rubbed with pan salt, tough enough to outlast the walk.',
  });
  recipeRow(ctx, 0).name = 'Salted Wayfarer Jerky';
  const sash = output(ctx, 1).item;
  Object.assign(sash, {
    slot: 'legs',
    armorClassBonus: ARMOR_FORMS[1].baseAc.cloth + armorGrowth(1n),
  });
}

const snapshot = (ctx: any) =>
  JSON.stringify(
    {
      item_template: rows(ctx, 'item_template'),
      recipe_template: rows(ctx, 'recipe_template'),
      economy_item: rows(ctx, 'economy_item'),
      enemy_loot_entry: rows(ctx, 'enemy_loot_entry'),
      region_recipe: rows(ctx, 'region_recipe'),
    },
    (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
  );

describe('the fixed apply on the live job 8206 reply', () => {
  it('writes the jerky recipe as "Kesterlane Basin Jerkin" (chest, rule description) and the sash as chest', () => {
    const ctx = ctxFor(liveWorld());
    applied(ctx);
    const first = output(ctx, 0);
    expect(first.item).toMatchObject({ name: 'Kesterlane Basin Jerkin', slot: 'chest', armorType: 'leather' });
    expect(first.item.description).toBe('A jerkin made from regional materials.');
    expect(first.tag.kind).toBe('armor');
    expect(recipeRow(ctx, 0).name).toBe('Kesterlane Basin Jerkin');
    const second = output(ctx, 1);
    expect(second.item).toMatchObject({ name: 'Wickthread Sash', slot: 'chest', armorType: 'cloth' });
    expect(second.item.description).toContain('woven sash');
    expect(output(ctx, 2).item).toMatchObject({ name: 'Orchard Glow Pendant', slot: 'neck' });
  });
});

describe('repairRegionEconomyOutputs', () => {
  it('turns the old rows into exactly what the fixed apply writes, keeping every id', () => {
    const fixed = ctxFor(liveWorld());
    applied(fixed);
    rows(fixed, 'region_economy')[0].status = 'complete';
    const want = snapshot(fixed);

    const ctx = ctxFor(liveWorld());
    applied(ctx);
    rows(ctx, 'region_economy')[0].status = 'complete';
    makeOld(ctx);
    const ids = [0, 1, 2].map((i) => output(ctx, i).item.id);
    const recipeOutputs = [0, 1, 2].map((i) => recipeRow(ctx, i).outputTemplateId);
    expect(output(ctx, 1).item.slot).toBe('legs');

    const result = econ.repairRegionEconomyOutputs(ctx, 1n);
    expect(result).toEqual({
      ok: true,
      checked: 3,
      changed: [
        { index: 0, oldName: 'Salted Wayfarer Jerky', newName: 'Kesterlane Basin Jerkin', oldSlot: 'chest', newSlot: 'chest' },
        { index: 1, oldName: 'Wickthread Sash', newName: 'Wickthread Sash', oldSlot: 'legs', newSlot: 'chest' },
      ],
    });
    expect([0, 1, 2].map((i) => output(ctx, i).item.id)).toEqual(ids);
    expect([0, 1, 2].map((i) => recipeRow(ctx, i).outputTemplateId)).toEqual(recipeOutputs);
    expect(snapshot(ctx)).toBe(want);
  });

  it('is idempotent: a second run changes nothing', () => {
    const ctx = ctxFor(liveWorld());
    applied(ctx);
    rows(ctx, 'region_economy')[0].status = 'complete';
    makeOld(ctx);
    econ.repairRegionEconomyOutputs(ctx, 1n);
    const after = snapshot(ctx);
    expect(econ.repairRegionEconomyOutputs(ctx, 1n)).toEqual({ ok: true, checked: 3, changed: [] });
    expect(snapshot(ctx)).toBe(after);
  });

  it('refuses a region with no economy, an unfinished economy, or no stored design, and writes nothing', () => {
    const none = ctxFor({ ...liveWorld(), region_economy: [] });
    expect(econ.repairRegionEconomyOutputs(none, 1n)).toEqual({ ok: false, reason: 'no_economy' });
    const pending = ctxFor(liveWorld('pending'));
    expect(econ.repairRegionEconomyOutputs(pending, 1n)).toEqual({ ok: false, reason: 'not_complete' });
    const lost = ctxFor({ ...liveWorld('complete'), llm_job: [] });
    const before = snapshot(lost);
    expect(econ.repairRegionEconomyOutputs(lost, 1n)).toEqual({ ok: false, reason: 'no_design' });
    expect(snapshot(lost)).toBe(before);
  });
});

describe('/economy repair Kesterlane Basin (admin console)', () => {
  it('repairs the live rows and reports each corrected output; a second run says nothing changed', async () => {
    const { handleEconomyAdminCommand } = await import('./economy_admin_commands');
    const admin = { toHexString: () => 'c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e' };
    const ctx = createMockCtx({ seed: liveWorld(), strict: true, timestampMicros: T0, sender: admin } as any);
    applied(ctx);
    rows(ctx, 'region_economy')[0].status = 'complete';
    makeOld(ctx);
    const character = { id: 1n, ownerUserId: 7n };
    const said = () => rows(ctx, 'event_private').filter((e: any) => e.kind === 'system').map((e: any) => e.message);
    handleEconomyAdminCommand(ctx, character, '/economy repair Kesterlane Basin');
    expect(said()).toEqual([
      [
        'Repaired Kesterlane Basin: 2 of 3 crafted outputs corrected.',
        'Recipe 1: Salted Wayfarer Jerky is now Kesterlane Basin Jerkin, slot chest.',
        'Recipe 2: Wickthread Sash, slot legs is now chest.',
      ].join('\n'),
    ]);
    expect(output(ctx, 1).item.slot).toBe('chest');
    handleEconomyAdminCommand(ctx, character, '/economy repair Kesterlane Basin');
    expect(said()[1]).toBe('Kesterlane Basin: every crafted output already follows the rules (3 recipes checked).');
  });
});
