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
      resource_node: [
        { id: 100n, locationId: 10n, name: 'Stone', state: 'available', itemTemplateId: 7n },
        { id: 101n, locationId: 10n, name: 'Iron Shard', state: 'available', itemTemplateId: 8n, characterId: 99n },
      ],
      item_template: [
        { id: 7n, name: 'Stone', rarity: 'common', slot: 'material', armorType: 'none', description: 'A grey lump of rock.' },
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

  it('another character\'s personal node is a miss', () => {
    const ctx = newCtx();
    submitIntent(ctx, { characterId: 1n, text: 'look iron shard' });
    expect(events(ctx)[0].message).toBe('You don\'t see "iron shard" here.');
  });

  it('bare look does not list another character\'s personal node', () => {
    const ctx = newCtx();
    submitIntent(ctx, { characterId: 1n, text: 'look' });
    expect(events(ctx)[0].message).toContain('Gather Stone');
    expect(events(ctx)[0].message).not.toContain('Iron Shard');
  });
});
