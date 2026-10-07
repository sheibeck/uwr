import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx } from './test-utils';
import {
  isCharacterActive,
  onlineCharacterIds,
  reconcileOnline,
  setCharacterOnline,
  syncCharacterOnline,
} from './online';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const NOW = 1_700_000_000_123_457n; // beyond 2^53: proves the stamp stays an exact u64

function ident(hex: string) {
  return { toHexString: () => hex };
}

function character(id: bigint, extra: Record<string, unknown> = {}) {
  return { id, name: `C${id}`, hp: 10n, online: false, lastOnlineAtMicros: 0n, ...extra };
}

function player(hex: string, activeCharacterId?: bigint) {
  return { id: ident(hex), activeCharacterId };
}

function ctxWith(seed: Record<string, any[]>) {
  return createMockCtx({ seed, strict: true, timestampMicros: NOW });
}

function row(ctx: any, id: bigint) {
  return ctx.db.character.id.find(id);
}

describe('setCharacterOnline', () => {
  it('turns an offline row online, stamps the reducer time and reports the write', () => {
    const ctx = ctxWith({ character: [character(1n)] });
    expect(setCharacterOnline(ctx, 1n, true)).toBe(true);
    expect(row(ctx, 1n).online).toBe(true);
    expect(row(ctx, 1n).lastOnlineAtMicros).toBe(NOW);
    expect(typeof row(ctx, 1n).lastOnlineAtMicros).toBe('bigint');
  });

  it('writes nothing when the flag already matches', () => {
    const ctx = ctxWith({ character: [character(1n, { online: true, lastOnlineAtMicros: 5n })] });
    const before = row(ctx, 1n);
    expect(setCharacterOnline(ctx, 1n, true)).toBe(false);
    expect(row(ctx, 1n)).toBe(before);
    expect(row(ctx, 1n).lastOnlineAtMicros).toBe(5n);
  });

  it('is a no-op for a missing id', () => {
    const ctx = ctxWith({ character: [character(1n)] });
    expect(setCharacterOnline(ctx, 9n, true)).toBe(false);
    expect(ctx.db.character._rows()).toHaveLength(1);
    expect(row(ctx, 1n).online).toBe(false);
  });

  it('re-reads the row, so an older snapshot held by the caller cannot overwrite other columns', () => {
    const ctx = ctxWith({ character: [character(1n, { hp: 10n })] });
    const snapshot = row(ctx, 1n);
    ctx.db.character.id.update({ ...snapshot, hp: 3n });
    setCharacterOnline(ctx, snapshot.id, true);
    expect(row(ctx, 1n).hp).toBe(3n);
    expect(row(ctx, 1n).online).toBe(true);
  });
});

describe('isCharacterActive', () => {
  it('is true when any player row holds the character', () => {
    const ctx = ctxWith({ character: [character(1n)], player: [player('a', 2n), player('b', 1n)] });
    expect(isCharacterActive(ctx, 1n)).toBe(true);
  });

  it('is false with no player rows', () => {
    const ctx = ctxWith({ character: [character(1n)], player: [] });
    expect(isCharacterActive(ctx, 1n)).toBe(false);
  });
});

describe('syncCharacterOnline', () => {
  it('turns a flagged character with no player row offline', () => {
    const ctx = ctxWith({ character: [character(1n, { online: true })], player: [] });
    expect(syncCharacterOnline(ctx, 1n)).toBe(true);
    expect(row(ctx, 1n).online).toBe(false);
    expect(row(ctx, 1n).lastOnlineAtMicros).toBe(NOW);
  });

  it('turns a held character online', () => {
    const ctx = ctxWith({ character: [character(1n)], player: [player('a', 1n)] });
    expect(syncCharacterOnline(ctx, 1n)).toBe(true);
    expect(row(ctx, 1n).online).toBe(true);
  });

  it('is a no-op for null, undefined and missing ids', () => {
    const ctx = ctxWith({ character: [character(1n, { online: true })], player: [] });
    expect(syncCharacterOnline(ctx, null)).toBe(false);
    expect(syncCharacterOnline(ctx, undefined)).toBe(false);
    expect(syncCharacterOnline(ctx, 7n)).toBe(false);
    expect(row(ctx, 1n).online).toBe(true);
  });

  it('keeps a character online while a second player row still holds it', () => {
    const ctx = ctxWith({
      character: [character(1n, { online: true, lastOnlineAtMicros: 5n })],
      player: [player('a', 1n), player('b', 1n)],
    });
    const a = ctx.db.player._rows()[0];
    ctx.db.player.id.update({ ...a, activeCharacterId: undefined });
    expect(syncCharacterOnline(ctx, 1n)).toBe(false);
    expect(row(ctx, 1n).online).toBe(true);
    expect(row(ctx, 1n).lastOnlineAtMicros).toBe(5n);
  });
});

describe('reconcileOnline', () => {
  it('fixes every drifted flag in either direction and reports the flips', () => {
    const ctx = ctxWith({
      character: [character(1n), character(2n, { online: true }), character(3n, { online: true })],
      player: [player('a', 1n), player('b', 3n)],
    });
    expect(reconcileOnline(ctx)).toBe(2);
    expect(row(ctx, 1n).online).toBe(true);
    expect(row(ctx, 2n).online).toBe(false);
    expect(row(ctx, 3n).online).toBe(true);
    expect(reconcileOnline(ctx)).toBe(0);
  });
});

describe('onlineCharacterIds', () => {
  it('returns exactly the ids whose stored flag is true', () => {
    const ctx = ctxWith({
      character: [character(1n, { online: true }), character(2n), character(3n, { online: true })],
      // character 2 is held but its flag still reads false: the stored flag decides
      player: [player('a', 2n)],
    });
    expect([...onlineCharacterIds(ctx)].sort()).toEqual([1n, 3n]);
  });
});
