/**
 * LOOK through the real submit_intent handler (quick 261006-a3d, WR-05). Runs the handler captured
 * from index.ts on the strict mock db and reads back the private events it writes: a bare look,
 * a look with nothing after "at" or an article, a hit, and a miss.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

let submitIntent: (...args: any[]) => any;

beforeAll(async () => {
  await import('../index');
  const h = capturedReducer('submit_intent');
  if (typeof h !== 'function') {
    throw new Error("capturedReducer('submit_intent') is not a function: STOP and report; never edit production code to fix this.");
  }
  submitIntent = h;
}, 120_000);

function newCtx() {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [{ id: 1n, ownerUserId: 7n, name: 'Mirel', level: 3n, locationId: 10n }],
      location: [{ id: 10n, name: 'The Crossing', description: 'A crossroads.', isSafe: true, bindStone: false, craftingAvailable: false }],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: T0 + 3_600_000_000n }],
      // Phase 51.3.1.1 Plan 16 (D-26): look reads resource pools; resource_node rows are no longer read.
      place_pool: [
        {
          id: 1n,
          regionId: 1n,
          locationId: 10n,
          kind: 'resource',
          refId: 7n,
          count: 100n,
          homeLevel: 3n,
          wipedAtMicros: 0n,
          lastSettledMicros: T0,
          dirty: false,
          timeOfDay: 'any',
        },
      ],
      resource_node: [
        { id: 101n, locationId: 10n, name: 'Iron Shard', state: 'available', itemTemplateId: 8n },
      ],
      item_template: [
        { id: 7n, name: 'Stone', rarity: 'common', slot: 'material', armorType: 'none', description: 'A grey lump of rock.' },
        { id: 8n, name: 'Iron Shard', rarity: 'common', slot: 'material', armorType: 'none', description: 'A shard.' },
      ],
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const events = (ctx: any): any[] => ctx.db._tables.event_private ?? [];

describe('submit_intent look (real handler)', () => {
  it('bare look writes the location overview as a look event', () => {
    const ctx = newCtx();
    submitIntent(ctx, { characterId: 1n, text: 'look' });
    expect(events(ctx)).toHaveLength(1);
    expect(events(ctx)[0].kind).toBe('look');
    expect(events(ctx)[0].message).toContain('The Crossing');
  });

  it.each(['look at', 'look the', 'look at the', 'look a', 'look at at'])(
    '"%s" with nothing after the filler words falls back to bare look',
    (text) => {
      const ctx = newCtx();
      submitIntent(ctx, { characterId: 1n, text });
      expect(events(ctx)).toHaveLength(1);
      expect(events(ctx)[0].kind).toBe('look');
      expect(events(ctx)[0].message).toContain('The Crossing');
    },
  );

  it('a hit appends one look event with the description', () => {
    const ctx = newCtx();
    submitIntent(ctx, { characterId: 1n, text: 'look at the stone' });
    expect(events(ctx)).toHaveLength(1);
    expect(events(ctx)[0].kind).toBe('look');
    expect(events(ctx)[0].characterId).toBe(1n);
    expect(events(ctx)[0].message).toContain('Gathering yields Stone');
  });

  it('a miss calls fail with the miss line and the stripped target', () => {
    const ctx = newCtx();
    submitIntent(ctx, { characterId: 1n, text: 'look at the Moon Pearl' });
    expect(events(ctx)).toHaveLength(1);
    expect(events(ctx)[0].kind).toBe('system');
    expect(events(ctx)[0].message).toBe('You don\'t see "Moon Pearl" here.');
  });

  it('a resource node row is a miss (only resource pools are read, D-26)', () => {
    const ctx = newCtx();
    submitIntent(ctx, { characterId: 1n, text: 'look iron shard' });
    expect(events(ctx)[0].message).toBe('You don\'t see "iron shard" here.');
  });

  it('bare look lists the resource pool and never a resource node', () => {
    const ctx = newCtx();
    submitIntent(ctx, { characterId: 1n, text: 'look' });
    expect(events(ctx)[0].message).toContain('[Gather Stone]');
    expect(events(ctx)[0].message).not.toContain('Iron Shard');
  });
});

// ---------------------------------------------------------------------------
// Plan 51-01: look at a neighbouring place and look at the bind stone (real handler)
// ---------------------------------------------------------------------------

const place = (over: Record<string, unknown>) => ({
  id: 11n,
  name: 'Gloamwood',
  description: 'Black pines lean over the road.',
  regionId: 1n,
  isSafe: false,
  bindStone: false,
  craftingAvailable: false,
  terrainType: 'woods',
  ...over,
});
const both = (from: bigint, to: bigint) => [
  { id: from * 100n + to, fromLocationId: from, toLocationId: to },
  { id: to * 100n + from, fromLocationId: to, toLocationId: from },
];

function placesCtx(opts: { boundLocationId?: bigint; bindStone?: boolean } = {}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [
        { id: 1n, ownerUserId: 7n, name: 'Mirel', level: 3n, locationId: 10n, boundLocationId: opts.boundLocationId ?? 10n },
      ],
      region: [
        { id: 1n, name: 'Ashfall Wilds' },
        { id: 2n, name: 'Saltmarsh' },
      ],
      location: [
        place({ id: 10n, name: 'The Crossing', description: 'A crossroads.', isSafe: true, bindStone: opts.bindStone ?? true, terrainType: 'town' }),
        place({ id: 11n, name: 'Gloamwood' }),
        place({ id: 12n, name: 'The Edge Beyond Ashfall', description: '', terrainType: 'uncharted' }),
        place({ id: 13n, name: 'Saltmarsh Gate', description: 'A rusted gate.', regionId: 2n }),
        place({ id: 14n, name: 'Far Off', description: 'Not connected.' }),
      ],
      location_connection: [...both(10n, 11n), ...both(10n, 12n), ...both(10n, 13n)],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: T0 + 3_600_000_000n }],
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

describe('submit_intent look at a place or the bind stone (real handler)', () => {
  it('look at gloamwood gives one look event for the neighbouring place', () => {
    const ctx = placesCtx();
    submitIntent(ctx, { characterId: 1n, text: 'look at gloamwood' });
    expect(events(ctx)).toHaveLength(1);
    expect(events(ctx)[0].kind).toBe('look');
    expect(events(ctx)[0].message).toBe('Gloamwood\nNext to The Crossing.\nBlack pines lean over the road.');
  });

  it('an uncharted edge with no description says nobody has been there', () => {
    const ctx = placesCtx();
    submitIntent(ctx, { characterId: 1n, text: 'look at the edge beyond ashfall' });
    expect(events(ctx)).toHaveLength(1);
    expect(events(ctx)[0].message).toBe('The Edge Beyond Ashfall\nNext to The Crossing.\nNobody has been here yet.');
  });

  it('a place in another region names it across the border', () => {
    const ctx = placesCtx();
    submitIntent(ctx, { characterId: 1n, text: 'look at saltmarsh gate' });
    expect(events(ctx)[0].message.split('\n')[1]).toBe('Next to The Crossing, across the border in Saltmarsh.');
  });

  it('a place that is not connected is a miss', () => {
    const ctx = placesCtx();
    submitIntent(ctx, { characterId: 1n, text: 'look at far off' });
    expect(events(ctx)).toHaveLength(1);
    expect(events(ctx)[0].kind).toBe('system');
    expect(events(ctx)[0].message).toBe('You don\'t see "far off" here.');
  });

  it('look at bind stone says the character is bound here', () => {
    const ctx = placesCtx({ boundLocationId: 10n });
    submitIntent(ctx, { characterId: 1n, text: 'look at bind stone' });
    expect(events(ctx)).toHaveLength(1);
    expect(events(ctx)[0].kind).toBe('look');
    expect(events(ctx)[0].message).toBe('Bind stone\nYou are bound here. You return here after defeat.');
  });

  it('look at bind stone says the character is not bound here when bound elsewhere', () => {
    const ctx = placesCtx({ boundLocationId: 99n });
    submitIntent(ctx, { characterId: 1n, text: 'look at bind stone' });
    expect(events(ctx)[0].message).toBe('Bind stone\nYou are not bound here. Bind here to return after defeat.');
  });

  it('look at bind stone at a place without a bind stone is a miss', () => {
    const ctx = placesCtx({ bindStone: false });
    submitIntent(ctx, { characterId: 1n, text: 'look at bind stone' });
    expect(events(ctx)[0].kind).toBe('system');
    expect(events(ctx)[0].message).toBe('You don\'t see "bind stone" here.');
  });
});
