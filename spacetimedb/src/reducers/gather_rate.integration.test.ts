/**
 * Phase 51.3 Plan 07 (SC2, SC5), review A WR-06: the REAL finish_gather scheduled reducer, captured
 * from index.ts on the strict mock db. CONTEXT Area 1: "a dial change takes effect on the next roll
 * only. Loot already dropped and nodes already found keep their rolls." The gather dial therefore
 * applies when a node is spawned (helpers/location.ts spawnResourceNode stores the scaled quantity),
 * and finish_gather yields the node's stored quantity before the perk bonuses, whatever the dial says
 * by then. A modifier reagent node still yields exactly 1; a node with no stored quantity falls back
 * to today's 2 to 6 roll.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { MODULE, startSeed } from '../helpers/combat_fight_fixture';
import { DEFAULT_DIALS } from '../data/economy_rules';

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
  quantity?: bigint;
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
          quantity: opts.quantity ?? 4n,
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

describe('finish_gather yields the quantity the node was found with', () => {
  it('yields the stored quantity at every dial: a change after the node was found never alters it', () => {
    for (const quantity of [1n, 3n, 9n, 18n]) {
      for (const dial of [{ gatherRatePct: 50n }, { gatherRatePct: 100n }, { gatherRatePct: 300n }, null]) {
        const ctx = newCtx({ ts: tsForBase(6n), dials: dial, quantity });
        run(ctx);
        expect(bagCount(ctx, STONE)).toBe(quantity);
      }
    }
  });

  it('a region override set after the node was found changes nothing either', () => {
    const ctx = newCtx({ ts: tsForBase(4n), dials: { gatherRatePct: 100n }, regionDial: { gatherRatePct: 300n }, quantity: 5n });
    run(ctx);
    expect(bagCount(ctx, STONE)).toBe(5n);
  });

  it('a node with no stored quantity falls back to the 2 to 6 roll, without the dial', () => {
    for (const want of [2n, 4n, 6n]) {
      const ctx = newCtx({ ts: tsForBase(want), dials: { gatherRatePct: 300n }, quantity: 0n });
      run(ctx);
      expect(bagCount(ctx, STONE)).toBe(want);
    }
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
