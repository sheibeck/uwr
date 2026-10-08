/**
 * Phase 51.3 Plan 07 (SC2, SC5): the REAL finish_gather scheduled reducer, captured from index.ts on
 * the strict mock db. The base yield (2 to 6, from the clock and the node id) is multiplied by the
 * region's effective gather rate with a floor of 1, before the perk bonuses; a modifier reagent node
 * still yields exactly 1 at every dial; a region override replaces the global value; a missing dial
 * row reads as 100 percent (today's yield).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { MODULE, startSeed } from '../helpers/combat_fight_fixture';
import { DEFAULT_DIALS, gatherYield } from '../data/economy_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;

let finish: (...args: any[]) => any;
beforeAll(async () => {
  await import('../index');
  const h = capturedReducer('finish_gather');
  if (typeof h !== 'function') {
    throw new Error("capturedReducer('finish_gather') is not a function: STOP and report; never edit production code to fix this.");
  }
  finish = h as (...args: any[]) => any;
}, 120_000);

const NODE_ID = 1n;
/** The base yield today's formula gives for this clock and node id. */
const baseAt = (ts: bigint): bigint => 2n + ((ts + NODE_ID) % 5n);
/** A clock whose base yield is `want` (2 to 6). */
const tsForBase = (want: bigint): bigint => {
  for (let k = 0n; k < 5n; k += 1n) if (baseAt(T0 + k) === want) return T0 + k;
  throw new Error('no clock');
};

const STONE = 100n;
const REAGENT = 101n;

function newCtx(opts: {
  ts: bigint;
  nodeName?: string;
  nodeTemplate?: bigint;
  dials?: Record<string, any> | null;
  regionDial?: Record<string, any> | null;
}) {
  const nodeName = opts.nodeName ?? 'Stone';
  return createMockCtx({
    seed: {
      character: [{ ...startSeed().character[0], id: 1n, locationId: 10n }],
      location: [{ id: 10n, name: 'The Crossing', regionId: 1n, terrainType: 'mountains', levelOffset: 0n }],
      region: [{ id: 1n, name: 'Ashen Reach', dangerMultiplier: 100n }],
      resource_node: [
        {
          id: NODE_ID,
          locationId: 10n,
          characterId: 1n,
          itemTemplateId: opts.nodeTemplate ?? STONE,
          name: nodeName,
          timeOfDay: 'any',
          quantity: 4n,
          state: 'harvesting',
          lockedByCharacterId: 1n,
          respawnAtMicros: undefined,
        },
      ],
      resource_gather: [{ id: 1n, characterId: 1n, nodeId: NODE_ID, endsAtMicros: opts.ts }],
      item_template: [
        { id: STONE, name: 'Stone', slot: 'material', stackable: true, rarity: 'common', tier: 1n, isJunk: false },
        { id: REAGENT, name: 'Glowing Stone', slot: 'material', stackable: true, rarity: 'common', tier: 1n, isJunk: false },
      ],
      item_instance: [],
      economy_dials: opts.dials === null ? [] : [{ id: 1n, ...DEFAULT_DIALS, ...(opts.dials ?? {}) }],
      economy_region_dial: opts.regionDial ? [{ regionId: 1n, ...opts.regionDial }] : [],
      renown_perk: [],
      combat_participant: [],
      group_member: [],
    },
    sender: MODULE,
    databaseIdentity: MODULE,
    timestampMicros: opts.ts,
    strict: true,
  } as any);
}

const bagCount = (ctx: any, templateId: bigint): bigint =>
  (ctx.db._tables.item_instance ?? [])
    .filter((r: any) => r.templateId === templateId)
    .reduce((n: bigint, r: any) => n + (r.quantity ?? 1n), 0n);

const run = (ctx: any) => finish(ctx, { arg: { scheduledId: 1n, gatherId: 1n } });

describe('finish_gather scales the base yield by the gather dial', () => {
  it('at 100 percent yields exactly today\'s quantity', () => {
    for (const want of [2n, 3n, 4n, 5n, 6n]) {
      const ts = tsForBase(want);
      const ctx = newCtx({ ts, dials: { gatherRatePct: 100n } });
      run(ctx);
      expect(bagCount(ctx, STONE)).toBe(want);
    }
  });

  it('at 50 percent yields half, never below 1', () => {
    const six = newCtx({ ts: tsForBase(6n), dials: { gatherRatePct: 50n } });
    run(six);
    expect(bagCount(six, STONE)).toBe(3n);
    const two = newCtx({ ts: tsForBase(2n), dials: { gatherRatePct: 50n } });
    run(two);
    expect(bagCount(two, STONE)).toBe(1n);
    const three = newCtx({ ts: tsForBase(3n), dials: { gatherRatePct: 50n } });
    run(three);
    expect(bagCount(three, STONE)).toBe(gatherYield(3n, 50n));
    expect(bagCount(three, STONE)).toBe(1n);
  });

  it('at 300 percent yields three times', () => {
    for (const want of [2n, 4n, 6n]) {
      const ctx = newCtx({ ts: tsForBase(want), dials: { gatherRatePct: 300n } });
      run(ctx);
      expect(bagCount(ctx, STONE)).toBe(want * 3n);
    }
  });

  it('a region override applies over the global value', () => {
    const ts = tsForBase(4n);
    const raised = newCtx({ ts, dials: { gatherRatePct: 100n }, regionDial: { gatherRatePct: 200n } });
    run(raised);
    expect(bagCount(raised, STONE)).toBe(8n);
    const lowered = newCtx({ ts, dials: { gatherRatePct: 300n }, regionDial: { gatherRatePct: 50n } });
    run(lowered);
    expect(bagCount(lowered, STONE)).toBe(2n);
  });

  it('a region row that leaves gatherRatePct unset inherits the global value', () => {
    const ctx = newCtx({ ts: tsForBase(4n), dials: { gatherRatePct: 300n }, regionDial: { dropRatePct: 10n } });
    run(ctx);
    expect(bagCount(ctx, STONE)).toBe(12n);
  });

  it('a missing economy_dials row reads as 100 percent', () => {
    const ctx = newCtx({ ts: tsForBase(5n), dials: null });
    run(ctx);
    expect(bagCount(ctx, STONE)).toBe(5n);
  });

  it('clamps an out-of-range stored dial to the 50 to 300 window', () => {
    const wild = newCtx({ ts: tsForBase(6n), dials: { gatherRatePct: 100000n } });
    run(wild);
    expect(bagCount(wild, STONE)).toBe(18n);
    const zero = newCtx({ ts: tsForBase(6n), dials: { gatherRatePct: 0n } });
    run(zero);
    expect(bagCount(zero, STONE)).toBe(3n);
  });
});

describe('a modifier reagent still yields exactly 1', () => {
  for (const pct of [50n, 100n, 300n]) {
    it(`at ${pct} percent`, () => {
      const ctx = newCtx({ ts: tsForBase(6n), nodeName: 'Glowing Stone', nodeTemplate: REAGENT, dials: { gatherRatePct: pct } });
      run(ctx);
      expect(bagCount(ctx, REAGENT)).toBe(1n);
    });
  }
});
