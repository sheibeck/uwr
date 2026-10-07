/**
 * Online gates (plan 51.1-02): offline characters drop out of who, look and look at, and a whisper
 * to an offline character is refused by name on both the reducer and the typed-intent path. The
 * REAL submit_intent and whisper handlers run on the strict mock db.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

const handlers: Record<string, (...args: any[]) => any> = {};

beforeAll(async () => {
  await import('../index');
  for (const name of ['submit_intent', 'whisper']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    handlers[name] = h;
  }
}, 120_000);

const person = (id: bigint, name: string, online: boolean | undefined, over: Record<string, unknown> = {}) => ({
  id,
  ownerUserId: 100n + id,
  name,
  level: 4n,
  race: 'Elf',
  className: 'Mage',
  locationId: 10n,
  ...(online === undefined ? {} : { online }),
  ...over,
});

/** Mirel (id 1, the actor) at place 10 with the given others. */
function newCtx(others: any[]) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [{ ...person(1n, 'Mirel', true), ownerUserId: 7n }, ...others],
      location: [
        { id: 10n, name: 'The Crossing', description: 'A crossroads.', isSafe: true, bindStone: false, craftingAvailable: false },
      ],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: T0 + 3_600_000_000n }],
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const events = (ctx: any): any[] => ctx.db._tables.event_private ?? [];
const linesFor = (ctx: any, ownerUserId: bigint): any[] => events(ctx).filter((e) => e.ownerUserId === ownerUserId);

describe('who (real handler)', () => {
  it('lists only the online other character', () => {
    const ctx = newCtx([person(2n, 'Bram', true), person(3n, 'Cael', false)]);
    handlers.submit_intent(ctx, { characterId: 1n, text: 'who' });
    const msg = events(ctx)[0].message as string;
    expect(msg).toContain('[Bram]');
    expect(msg).not.toContain('Cael');
  });

  it('with only offline others reads "No other players nearby."', () => {
    const ctx = newCtx([person(3n, 'Cael', false), person(4n, 'Dara', undefined)]);
    handlers.submit_intent(ctx, { characterId: 1n, text: 'who' });
    expect(events(ctx)).toHaveLength(1);
    expect(events(ctx)[0].message).toBe('No other players nearby.');
  });
});

describe('look (real handler)', () => {
  it('names only online others in the "is here" line', () => {
    const ctx = newCtx([person(2n, 'Bram', true), person(3n, 'Cael', false)]);
    handlers.submit_intent(ctx, { characterId: 1n, text: 'look' });
    const msg = events(ctx)[0].message as string;
    expect(msg).toContain('[Bram]');
    expect(msg).toContain('is here.');
    expect(msg).not.toContain('Cael');
  });

  it('with only offline others the line is absent', () => {
    const ctx = newCtx([person(3n, 'Cael', false)]);
    handlers.submit_intent(ctx, { characterId: 1n, text: 'look' });
    const msg = events(ctx)[0].message as string;
    expect(msg).not.toContain('Cael');
    expect(msg).not.toMatch(/ (is|are) here\./);
  });
});

describe('look at (real handler)', () => {
  it('describes an online character', () => {
    const ctx = newCtx([person(2n, 'Bram', true)]);
    handlers.submit_intent(ctx, { characterId: 1n, text: 'look at Bram' });
    expect(events(ctx)).toHaveLength(1);
    expect(events(ctx)[0].kind).toBe('look');
    expect(events(ctx)[0].message).toBe('Bram, Level 4 Elf Mage.');
  });

  it('does not describe an offline character', () => {
    const ctx = newCtx([person(2n, 'Bram', false)]);
    handlers.submit_intent(ctx, { characterId: 1n, text: 'look at Bram' });
    expect(events(ctx)).toHaveLength(1);
    expect(events(ctx)[0].message).not.toContain('Level 4 Elf Mage');
  });
});

describe('whisper (real handlers)', () => {
  it('the reducer to an offline character writes one refusal to the sender and nothing to the target', () => {
    const ctx = newCtx([person(2n, 'Bram', false)]);
    handlers.whisper(ctx, { characterId: 1n, targetName: 'Bram', message: 'hello' });
    expect(events(ctx)).toHaveLength(1);
    expect(events(ctx)[0]).toMatchObject({ ownerUserId: 7n, kind: 'whisper', message: 'Bram is offline.' });
    expect(linesFor(ctx, 102n)).toEqual([]);
  });

  it('the reducer to an online character writes both lines as before', () => {
    const ctx = newCtx([person(2n, 'Bram', true)]);
    handlers.whisper(ctx, { characterId: 1n, targetName: 'Bram', message: 'hello' });
    expect(linesFor(ctx, 7n).map((e) => e.message)).toEqual(['You whisper to Bram: "hello"']);
    expect(linesFor(ctx, 102n).map((e) => e.message)).toEqual(['Mirel whispers: "hello"']);
  });

  it.each(['whisper Bram hello', 'w Bram hello', 'tell Bram hello'])(
    'the typed "%s" to an offline character writes "Bram is offline." and no whisper lines',
    (text) => {
      const ctx = newCtx([person(2n, 'Bram', false)]);
      handlers.submit_intent(ctx, { characterId: 1n, text });
      expect(events(ctx).filter((e) => e.message.includes('hello'))).toEqual([]);
      expect(linesFor(ctx, 102n)).toEqual([]);
      expect(linesFor(ctx, 7n).map((e) => e.message)).toEqual(['Bram is offline.']);
    },
  );

  it('the typed whisper to an online character writes both lines as before', () => {
    const ctx = newCtx([person(2n, 'Bram', true)]);
    handlers.submit_intent(ctx, { characterId: 1n, text: 'whisper Bram hello' });
    expect(linesFor(ctx, 7n).map((e) => e.message)).toEqual(['You whisper to Bram: "hello"']);
    expect(linesFor(ctx, 102n).map((e) => e.message)).toEqual(['Mirel whispers: "hello"']);
  });
});
