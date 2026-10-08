import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx } from './test-utils';
import {
  ECONOMY_DIALS_ID,
  ECONOMY_DIAL_WORDS,
  applyDialChange,
  ensureEconomyDials,
  getDials,
  loadEffectiveDials,
  loadItemPins,
  patchEconomyDials,
  resetEconomy,
  setAiEnabled,
} from './economy_state';
import { DEFAULT_DIALS } from '../data/economy_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

type Seed = Record<string, any[]>;
const txFor = (seed: Seed = {}) => createMockCtx({ seed, strict: true } as any);
const rows = (tx: any, table: string): any[] => tx.db._tables[table] ?? [];
const dialsRow = (tx: any) => rows(tx, 'economy_dials')[0];

const REGION = { id: 7n, name: 'Ashfall' };
const ITEM = { id: 40n, name: 'Iron Ingot' };
const seeded = (): Seed => ({ region: [REGION], item_template: [ITEM] });

describe('getDials: a missing row reads as today with the AI off', () => {
  it('returns DEFAULT_DIALS on an empty db and writes nothing', () => {
    const tx = txFor();
    const d = getDials(tx);
    expect(d).toEqual(DEFAULT_DIALS);
    expect(d.aiEnabled).toBe(false);
    expect(rows(tx, 'economy_dials')).toHaveLength(0);
  });

  it('does not leak the id into the dials', () => {
    const tx = txFor();
    ensureEconomyDials(tx);
    expect('id' in getDials(tx)).toBe(false);
  });

  it('reads the stored values over the defaults', () => {
    const tx = txFor({ economy_dials: [{ id: ECONOMY_DIALS_ID, ...DEFAULT_DIALS, goldPct: 250n, aiEnabled: true }] });
    expect(getDials(tx).goldPct).toBe(250n);
    expect(getDials(tx).aiEnabled).toBe(true);
    expect(getDials(tx).dropRatePct).toBe(100n);
  });
});

describe('ensureEconomyDials', () => {
  it('inserts the singleton once with today defaults and the AI off', () => {
    const tx = txFor();
    const first = ensureEconomyDials(tx);
    expect(first.id).toBe(ECONOMY_DIALS_ID);
    expect(dialsRow(tx)).toMatchObject({ ...DEFAULT_DIALS, id: 1n });
    const second = ensureEconomyDials(tx);
    expect(second).toEqual(first);
    expect(rows(tx, 'economy_dials')).toHaveLength(1);
  });

  it('patchEconomyDials ensures the row, then applies the patch', () => {
    const tx = txFor();
    patchEconomyDials(tx, { goldPct: 150n });
    expect(rows(tx, 'economy_dials')).toHaveLength(1);
    expect(dialsRow(tx).goldPct).toBe(150n);
    expect(dialsRow(tx).dropRatePct).toBe(100n);
  });
});

describe('applyDialChange: global and tier scopes', () => {
  it('stores a clamped value and reports it', () => {
    const tx = txFor();
    const res = applyDialChange(tx, { scope: 'global', dial: 'gold', value: 400n });
    expect(res).toMatchObject({ ok: true, column: 'goldPct', value: 300n, clamped: true, min: 0n, max: 300n });
    expect(dialsRow(tx).goldPct).toBe(300n);
  });

  it('reports clamped false for an in-range value', () => {
    const tx = txFor();
    const res = applyDialChange(tx, { scope: 'global', dial: 'rarity', value: -1n });
    expect(res).toMatchObject({ ok: true, column: 'rarityShift', value: -1n, clamped: false, min: -2n, max: 2n });
    expect(dialsRow(tx).rarityShift).toBe(-1n);
  });

  it('clamps the low side too (gather has a floor of 50)', () => {
    const tx = txFor();
    const res = applyDialChange(tx, { scope: 'global', dial: 'gather', value: 0n });
    expect(res).toMatchObject({ ok: true, value: 50n, clamped: true });
  });

  it('writes every global dial word to its column', () => {
    const tx = txFor();
    applyDialChange(tx, { scope: 'global', dial: 'rarity', value: 1n });
    applyDialChange(tx, { scope: 'global', dial: 'drop', value: 120n });
    applyDialChange(tx, { scope: 'global', dial: 'gold', value: 130n });
    applyDialChange(tx, { scope: 'global', dial: 'gather', value: 140n });
    applyDialChange(tx, { scope: 'global', dial: 'boss', value: 2n });
    expect(dialsRow(tx)).toMatchObject({
      rarityShift: 1n,
      dropRatePct: 120n,
      goldPct: 130n,
      gatherRatePct: 140n,
      bossRarityBonus: 2n,
    });
  });

  it('stores a tier weight', () => {
    const tx = txFor();
    const res = applyDialChange(tx, { scope: 'tier', dial: 'epic', value: 50n });
    expect(res).toMatchObject({ ok: true, column: 'tierEpicPct', value: 50n, clamped: false });
    expect(dialsRow(tx).tierEpicPct).toBe(50n);
    applyDialChange(tx, { scope: 'tier', dial: 'legendary', value: 999n });
    expect(dialsRow(tx).tierLegendaryPct).toBe(300n);
  });

  it('refuses an unknown dial word and writes nothing', () => {
    const tx = txFor();
    expect(applyDialChange(tx, { scope: 'global', dial: 'loot', value: 5n })).toEqual({
      ok: false,
      reason: 'unknown_dial',
    });
    expect(applyDialChange(tx, { scope: 'tier', dial: 'drop', value: 5n })).toEqual({
      ok: false,
      reason: 'unknown_dial',
    });
    expect(applyDialChange(tx, { scope: 'global', dial: 'epic', value: 5n })).toEqual({
      ok: false,
      reason: 'unknown_dial',
    });
    expect(rows(tx, 'economy_dials')).toHaveLength(0);
  });

  it('refuses a dial word that is only an object property name', () => {
    const tx = txFor();
    expect(applyDialChange(tx, { scope: 'global', dial: 'constructor', value: 5n })).toEqual({
      ok: false,
      reason: 'unknown_dial',
    });
    expect(applyDialChange(tx, { scope: 'global', dial: '__proto__', value: 5n })).toEqual({
      ok: false,
      reason: 'unknown_dial',
    });
  });

  it('refuses a bad scope and writes nothing', () => {
    const tx = txFor();
    expect(applyDialChange(tx, { scope: 'galaxy' as any, dial: 'gold', value: 5n })).toEqual({
      ok: false,
      reason: 'bad_scope',
    });
    expect(rows(tx, 'economy_dials')).toHaveLength(0);
  });
});

describe('applyDialChange: region scope', () => {
  it('creates a region row with only that field set', () => {
    const tx = txFor(seeded());
    const res = applyDialChange(tx, { scope: 'region', scopeId: 7n, dial: 'drop', value: 50n });
    expect(res).toMatchObject({ ok: true, column: 'dropRatePct', value: 50n, clamped: false });
    const r = rows(tx, 'economy_region_dial');
    expect(r).toHaveLength(1);
    expect(r[0].regionId).toBe(7n);
    expect(r[0].dropRatePct).toBe(50n);
    expect(r[0].rarityShift).toBeUndefined();
    expect(r[0].goldPct).toBeUndefined();
    expect(r[0].gatherRatePct).toBeUndefined();
    expect(r[0].bossRarityBonus).toBeUndefined();
  });

  it('updates the same row on a second dial, keeping the first', () => {
    const tx = txFor(seeded());
    applyDialChange(tx, { scope: 'region', scopeId: 7n, dial: 'drop', value: 50n });
    applyDialChange(tx, { scope: 'region', scopeId: 7n, dial: 'gold', value: 999n });
    const r = rows(tx, 'economy_region_dial');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ dropRatePct: 50n, goldPct: 300n });
  });

  it('refuses an unknown region and writes nothing', () => {
    const tx = txFor(seeded());
    expect(applyDialChange(tx, { scope: 'region', scopeId: 99n, dial: 'drop', value: 50n })).toEqual({
      ok: false,
      reason: 'unknown_region',
    });
    expect(applyDialChange(tx, { scope: 'region', dial: 'drop', value: 50n })).toEqual({
      ok: false,
      reason: 'unknown_region',
    });
    expect(rows(tx, 'economy_region_dial')).toHaveLength(0);
  });

  it('refuses a tier word at region scope', () => {
    const tx = txFor(seeded());
    expect(applyDialChange(tx, { scope: 'region', scopeId: 7n, dial: 'epic', value: 50n })).toEqual({
      ok: false,
      reason: 'unknown_dial',
    });
    expect(rows(tx, 'economy_region_dial')).toHaveLength(0);
  });
});

describe('applyDialChange: item scope', () => {
  it('pins a value, including 0n', () => {
    const tx = txFor(seeded());
    const res = applyDialChange(tx, { scope: 'item', scopeId: 40n, dial: 'drop', value: 0n });
    expect(res).toMatchObject({ ok: true, column: 'dropRatePct', value: 0n, clamped: false, min: 0n, max: 300n });
    expect(rows(tx, 'economy_item_dial')).toEqual([{ itemTemplateId: 40n, dropRatePct: 0n }]);
  });

  it('clamps and overwrites an existing pin', () => {
    const tx = txFor(seeded());
    applyDialChange(tx, { scope: 'item', scopeId: 40n, dial: 'drop', value: 10n });
    const res = applyDialChange(tx, { scope: 'item', scopeId: 40n, dial: 'drop', value: 900n });
    expect(res).toMatchObject({ ok: true, value: 300n, clamped: true });
    expect(rows(tx, 'economy_item_dial')).toEqual([{ itemTemplateId: 40n, dropRatePct: 300n }]);
  });

  it('refuses an unknown item and writes nothing', () => {
    const tx = txFor(seeded());
    expect(applyDialChange(tx, { scope: 'item', scopeId: 99n, dial: 'drop', value: 5n })).toEqual({
      ok: false,
      reason: 'unknown_item',
    });
    expect(rows(tx, 'economy_item_dial')).toHaveLength(0);
  });

  it('refuses any dial word but drop', () => {
    const tx = txFor(seeded());
    expect(applyDialChange(tx, { scope: 'item', scopeId: 40n, dial: 'gold', value: 5n })).toEqual({
      ok: false,
      reason: 'unknown_dial',
    });
    expect(rows(tx, 'economy_item_dial')).toHaveLength(0);
  });
});

describe('loadEffectiveDials and loadItemPins (edge SC5 empty)', () => {
  it('with no rows at all equals the defaults and the pins are empty', () => {
    const tx = txFor();
    const eff = loadEffectiveDials(tx, 7n);
    expect(eff).toMatchObject({
      rarityShift: 0n,
      dropRatePct: 100n,
      goldPct: 100n,
      gatherRatePct: 100n,
      bossRarityBonus: 0n,
    });
    expect(eff.tierPct).toEqual({ common: 100n, uncommon: 100n, rare: 100n, epic: 100n, legendary: 100n });
    expect(loadEffectiveDials(tx)).toEqual(eff);
    expect(loadItemPins(tx).size).toBe(0);
    expect(rows(tx, 'economy_dials')).toHaveLength(0);
  });

  it('a region row of all undefined inherits every global value', () => {
    const tx = txFor({
      economy_dials: [{ id: 1n, ...DEFAULT_DIALS, goldPct: 200n, rarityShift: 1n }],
      economy_region_dial: [{ regionId: 7n }],
    });
    const eff = loadEffectiveDials(tx, 7n);
    expect(eff.goldPct).toBe(200n);
    expect(eff.rarityShift).toBe(1n);
    expect(eff.dropRatePct).toBe(100n);
  });

  it('a region override replaces the global value for that region only', () => {
    const tx = txFor({
      economy_dials: [{ id: 1n, ...DEFAULT_DIALS, goldPct: 200n }],
      economy_region_dial: [{ regionId: 7n, goldPct: 50n }],
    });
    expect(loadEffectiveDials(tx, 7n).goldPct).toBe(50n);
    expect(loadEffectiveDials(tx, 8n).goldPct).toBe(200n);
    expect(loadEffectiveDials(tx).goldPct).toBe(200n);
  });

  it('loadItemPins returns a Map of the pins', () => {
    const tx = txFor({
      economy_item_dial: [
        { itemTemplateId: 40n, dropRatePct: 0n },
        { itemTemplateId: 41n, dropRatePct: 250n },
      ],
    });
    const pins = loadItemPins(tx);
    expect(pins).toBeInstanceOf(Map);
    expect(pins.get(40n)).toBe(0n);
    expect(pins.get(41n)).toBe(250n);
    expect(pins.get(42n)).toBeUndefined();
  });
});

describe('resetEconomy', () => {
  const dirty = () =>
    txFor({
      ...seeded(),
      economy_dials: [
        {
          id: 1n,
          ...DEFAULT_DIALS,
          rarityShift: 2n,
          goldPct: 250n,
          tierEpicPct: 10n,
          aiEnabled: true,
        },
      ],
      economy_region_dial: [{ regionId: 7n, goldPct: 50n }, { regionId: 8n, dropRatePct: 70n }],
      economy_item_dial: [{ itemTemplateId: 40n, dropRatePct: 0n }],
    });

  it('global: restores every dial, keeps aiEnabled, deletes region and item rows', () => {
    const tx = dirty();
    const res = resetEconomy(tx, 'global');
    expect(res).toEqual({ regions: 2, items: 1 });
    expect(dialsRow(tx)).toMatchObject({ ...DEFAULT_DIALS, aiEnabled: true });
    expect(rows(tx, 'economy_region_dial')).toHaveLength(0);
    expect(rows(tx, 'economy_item_dial')).toHaveLength(0);
  });

  it('global: a second call leaves the same state', () => {
    const tx = dirty();
    resetEconomy(tx, 'global');
    const snap = JSON.stringify(dialsRow(tx), (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
    expect(resetEconomy(tx, 'global')).toEqual({ regions: 0, items: 0 });
    expect(JSON.stringify(dialsRow(tx), (_k, v) => (typeof v === 'bigint' ? `${v}n` : v))).toBe(snap);
    expect(rows(tx, 'economy_dials')).toHaveLength(1);
  });

  it('global: keeps aiEnabled false when it was false', () => {
    const tx = txFor({ economy_dials: [{ id: 1n, ...DEFAULT_DIALS, goldPct: 20n }] });
    resetEconomy(tx, 'global');
    expect(dialsRow(tx).aiEnabled).toBe(false);
    expect(dialsRow(tx).goldPct).toBe(100n);
  });

  it('region: deletes that row only', () => {
    const tx = dirty();
    expect(resetEconomy(tx, 'region', 7n)).toEqual({ regions: 1, items: 0 });
    expect(rows(tx, 'economy_region_dial').map((r) => r.regionId)).toEqual([8n]);
    expect(dialsRow(tx).goldPct).toBe(250n);
    expect(resetEconomy(tx, 'region', 7n)).toEqual({ regions: 0, items: 0 });
  });

  it('item: deletes that pin only', () => {
    const tx = dirty();
    expect(resetEconomy(tx, 'item', 40n)).toEqual({ regions: 0, items: 1 });
    expect(rows(tx, 'economy_item_dial')).toHaveLength(0);
    expect(rows(tx, 'economy_region_dial')).toHaveLength(2);
  });
});

describe('setAiEnabled', () => {
  it('flips only aiEnabled', () => {
    const tx = txFor({ economy_dials: [{ id: 1n, ...DEFAULT_DIALS, goldPct: 20n }] });
    setAiEnabled(tx, true);
    expect(dialsRow(tx)).toMatchObject({ ...DEFAULT_DIALS, goldPct: 20n, aiEnabled: true });
    setAiEnabled(tx, false);
    expect(dialsRow(tx).aiEnabled).toBe(false);
    expect(dialsRow(tx).goldPct).toBe(20n);
  });

  it('creates the row when it is missing', () => {
    const tx = txFor();
    setAiEnabled(tx, true);
    expect(dialsRow(tx)).toMatchObject({ ...DEFAULT_DIALS, aiEnabled: true });
  });
});

describe('ECONOMY_DIAL_WORDS', () => {
  it('maps the words to their columns and is frozen', () => {
    expect(Object.isFrozen(ECONOMY_DIAL_WORDS)).toBe(true);
    expect(ECONOMY_DIAL_WORDS.drop).toBe('dropRatePct');
    expect(ECONOMY_DIAL_WORDS.rarity).toBe('rarityShift');
    expect(ECONOMY_DIAL_WORDS.boss).toBe('bossRarityBonus');
    expect(ECONOMY_DIAL_WORDS.legendary).toBe('tierLegendaryPct');
    expect(Object.keys(ECONOMY_DIAL_WORDS)).toHaveLength(10);
  });
});
