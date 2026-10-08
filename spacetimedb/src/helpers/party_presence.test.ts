/**
 * Party presence lines (quick 261008-d2k): the texts, the release label, the session restore and
 * the one-row write into event_group. Strict mock db over the recorded schema.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx } from './test-utils';
import {
  partyPresenceLine,
  releaseKind,
  sessionOnReconnect,
  announcePartyPresence,
} from './party_presence';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const NOW = 1_700_000_000_000_000n;

const character = (id: bigint, name: string, groupId?: bigint) => ({
  id,
  ownerUserId: 100n + id,
  name,
  groupId,
  online: true,
});

const ctxWith = (rows: any[]) =>
  createMockCtx({ seed: { character: rows }, strict: true, timestampMicros: NOW });

const groupRows = (ctx: any): any[] => ctx.db._tables.event_group ?? [];

describe('partyPresenceLine', () => {
  it('has the three exact texts', () => {
    expect(partyPresenceLine('logged_out', 'Armond')).toBe('Armond has logged out.');
    expect(partyPresenceLine('link_dead', 'Armond')).toBe('Armond has gone link-dead.');
    expect(partyPresenceLine('back', 'Armond')).toBe('Armond is back.');
  });
});

describe('releaseKind', () => {
  it('reads a missing session as a logout and a standing session as link-dead', () => {
    expect(releaseKind({ sessionStartedAt: undefined })).toBe('logged_out');
    expect(releaseKind({ sessionStartedAt: null })).toBe('logged_out');
    expect(releaseKind({})).toBe('logged_out');
    expect(releaseKind({ sessionStartedAt: { microsSinceUnixEpoch: 5n } })).toBe('link_dead');
  });
});

describe('sessionOnReconnect', () => {
  const now = { microsSinceUnixEpoch: NOW };

  it('restores the session of a signed-in account that has none', () => {
    expect(sessionOnReconnect({ userId: 7n, sessionStartedAt: undefined }, now)).toBe(now);
    expect(sessionOnReconnect({ userId: 7n, sessionStartedAt: null }, now)).toBe(now);
  });

  it('keeps a standing session unchanged', () => {
    const standing = { microsSinceUnixEpoch: 5n };
    expect(sessionOnReconnect({ userId: 7n, sessionStartedAt: standing }, now)).toBe(standing);
  });

  it('gives an account that is not signed in nothing', () => {
    expect(sessionOnReconnect({ userId: undefined, sessionStartedAt: undefined }, now)).toBeUndefined();
    expect(sessionOnReconnect({ userId: null, sessionStartedAt: undefined }, now)).toBeUndefined();
  });
});

describe('announcePartyPresence', () => {
  it('writes exactly one group row for a grouped character and returns true', () => {
    const ctx = ctxWith([character(1n, 'Armond', 5n)]);
    expect(announcePartyPresence(ctx, 1n, 'logged_out')).toBe(true);
    expect(groupRows(ctx)).toHaveLength(1);
    expect(groupRows(ctx)[0]).toMatchObject({
      groupId: 5n,
      characterId: 1n,
      kind: 'group',
      message: 'Armond has logged out.',
      createdAt: ctx.timestamp,
    });
  });

  it('writes nothing for a character with no group', () => {
    const ctx = ctxWith([character(1n, 'Armond')]);
    expect(announcePartyPresence(ctx, 1n, 'logged_out')).toBe(false);
    expect(groupRows(ctx)).toHaveLength(0);
  });

  it('writes nothing for a missing character or a missing id', () => {
    const ctx = ctxWith([character(1n, 'Armond', 5n)]);
    expect(announcePartyPresence(ctx, 9n, 'back')).toBe(false);
    expect(announcePartyPresence(ctx, undefined, 'back')).toBe(false);
    expect(announcePartyPresence(ctx, null, 'back')).toBe(false);
    expect(groupRows(ctx)).toHaveLength(0);
  });
});
