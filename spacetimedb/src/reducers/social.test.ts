import { describe, it, expect, vi, beforeAll } from 'vitest';
import { acceptFriendRequestLogic } from './social';
import { capturedReducer } from '../helpers/schema_recorder';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

// ---------------------------------------------------------------------------
// Purpose-built mock ctx for the friend tables.
//
// The shared test-utils mock maps by_from -> fromLocationId and by_to ->
// toLocationId, which is wrong for friend_request (fromUserId / toUserId), so
// we build a minimal, correctly-mapped mock here.
// ---------------------------------------------------------------------------
function makeCtx(seed: { friend_request?: any[]; friend?: any[] } = {}) {
  const friendRequest = [...(seed.friend_request ?? [])];
  const friend = [...(seed.friend ?? [])];
  let nextFriendId = 1n;
  for (const r of friend) if (typeof r.id === 'bigint' && r.id >= nextFriendId) nextFriendId = r.id + 1n;

  const friendRequestTable = {
    by_to: { filter: (v: bigint) => friendRequest.filter((r) => r.toUserId === v) },
    by_from: { filter: (v: bigint) => friendRequest.filter((r) => r.fromUserId === v) },
    id: {
      delete: (id: bigint) => {
        const i = friendRequest.findIndex((r) => r.id === id);
        if (i >= 0) friendRequest.splice(i, 1);
      },
    },
    _rows: () => friendRequest,
  };

  const friendTable = {
    by_user: { filter: (v: bigint) => friend.filter((r) => r.userId === v) },
    insert: (row: any) => {
      const r = { ...row };
      if (r.id === 0n) r.id = nextFriendId++;
      friend.push(r);
      return r;
    },
    _rows: () => friend,
  };

  return {
    db: { friend_request: friendRequestTable, friend: friendTable },
    timestamp: { microsSinceUnixEpoch: 1_000n },
  };
}

describe('acceptFriendRequestLogic', () => {
  it('returns false and inserts nothing when no matching request exists', () => {
    const ctx = makeCtx();
    const ok = acceptFriendRequestLogic(ctx, 1n, 2n);
    expect(ok).toBe(false);
    expect(ctx.db.friend._rows()).toHaveLength(0);
  });

  it('creates both friendship directions and deletes the request on accept', () => {
    const ctx = makeCtx({
      friend_request: [{ id: 100n, fromUserId: 2n, toUserId: 1n, createdAt: {} }],
    });

    const ok = acceptFriendRequestLogic(ctx, 1n, 2n);

    expect(ok).toBe(true);
    expect(ctx.db.friend_request._rows()).toHaveLength(0);

    const friends = ctx.db.friend._rows();
    expect(friends).toHaveLength(2);
    expect(friends.some((f: any) => f.userId === 1n && f.friendUserId === 2n)).toBe(true);
    expect(friends.some((f: any) => f.userId === 2n && f.friendUserId === 1n)).toBe(true);
  });

  it('does NOT create duplicate friend entries when reciprocal requests are both accepted', () => {
    // A=1 sent to B=2, and B=2 sent to A=1 (reciprocal requests both pending).
    const ctx = makeCtx({
      friend_request: [
        { id: 100n, fromUserId: 1n, toUserId: 2n, createdAt: {} },
        { id: 101n, fromUserId: 2n, toUserId: 1n, createdAt: {} },
      ],
    });

    // A(1) accepts B(2)'s request.
    expect(acceptFriendRequestLogic(ctx, 1n, 2n)).toBe(true);

    // The reciprocal request (A->B) must have been cleared so B can't accept
    // it into a second friendship.
    expect(ctx.db.friend_request._rows()).toHaveLength(0);

    // B(2) tries to accept A(1)'s (now-gone) request — should be a no-op.
    expect(acceptFriendRequestLogic(ctx, 2n, 1n)).toBe(false);

    const friends = ctx.db.friend._rows();
    expect(friends).toHaveLength(2);
    expect(friends.filter((f: any) => f.userId === 1n && f.friendUserId === 2n)).toHaveLength(1);
    expect(friends.filter((f: any) => f.userId === 2n && f.friendUserId === 1n)).toHaveLength(1);
  });

  it('is idempotent when a friendship direction already exists', () => {
    // Forward friendship already exists; only a fresh request/reverse is added.
    const ctx = makeCtx({
      friend_request: [{ id: 100n, fromUserId: 2n, toUserId: 1n, createdAt: {} }],
      friend: [{ id: 1n, userId: 1n, friendUserId: 2n, createdAt: {} }],
    });

    const ok = acceptFriendRequestLogic(ctx, 1n, 2n);

    expect(ok).toBe(true);
    const friends = ctx.db.friend._rows();
    // Only the missing reverse direction is inserted — no duplicate forward.
    expect(friends.filter((f: any) => f.userId === 1n && f.friendUserId === 2n)).toHaveLength(1);
    expect(friends.filter((f: any) => f.userId === 2n && f.friendUserId === 1n)).toHaveLength(1);
    expect(friends).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// send_friend_request { email } is neutralised (plan 51.1-05, CR-01 / research Q10).
// It used to read the private user table by email and answer 'User not found', so any client
// could test whether an email exists. It now refuses before touching any table.
// ---------------------------------------------------------------------------
describe('send_friend_request (email) is closed', () => {
  let sendFriendRequest: (...args: any[]) => any;

  beforeAll(async () => {
    await import('../index');
    const h = capturedReducer('send_friend_request');
    if (typeof h !== 'function') {
      throw new Error("capturedReducer('send_friend_request') is not a function: STOP and report.");
    }
    sendFriendRequest = h;
  }, 120_000);

  // Any table access (user, player, friend, friend_request, ...) is recorded and throws.
  const trappedCtx = () => {
    const touched: string[] = [];
    const db = new Proxy({} as any, {
      get: (_: any, name: string | symbol) => {
        touched.push(String(name));
        throw new Error(`table ${String(name)} must not be read`);
      },
    });
    return {
      touched,
      ctx: {
        db,
        sender: { toHexString: () => 'a'.repeat(64) },
        timestamp: { microsSinceUnixEpoch: 1_000n },
      },
    };
  };

  for (const email of ['bob@example.com', 'ann@example.com', 'nobody', '']) {
    it(`refuses ${JSON.stringify(email)} without reading or writing any table`, () => {
      const { ctx, touched } = trappedCtx();
      expect(() => sendFriendRequest(ctx, { email })).toThrow('Send friend requests by character name.');
      expect(touched).toEqual([]);
    });
  }
});
