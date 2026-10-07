/**
 * Party invite rules (plan 51.1-03): when an invite is live, which invites count, how an invite
 * ends (the lines it writes), when a one-member group dissolves, and who leads after a leave.
 * Strict mock db over the recorded schema.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockDb } from './test-utils';
import { GROUP_INVITE_TTL_MICROS } from '../data/group_config';
import {
  inviteIsLive,
  liveInvitesTo,
  liveInvitesOfGroup,
  endExpiredInvitesTo,
  endInvite,
  dissolveLoneGroup,
  nextLeaderAfter,
  scheduleInviteExpiry,
} from './group_invites';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const T0 = 1_700_000_000_000_000n;
const at = (micros: bigint) => ({ microsSinceUnixEpoch: micros });

const character = (id: bigint, name: string, groupId?: bigint) => ({
  id,
  ownerUserId: 100n + id,
  name,
  groupId,
  online: true,
});

const member = (id: bigint, groupId: bigint, characterId: bigint, joinedAt = T0) => ({
  id,
  groupId,
  characterId,
  ownerUserId: 100n + characterId,
  role: id === 1n ? 'leader' : 'member',
  followLeader: true,
  joinedAt: at(joinedAt),
});

const invite = (id: bigint, groupId: bigint, from: bigint, to: bigint, createdAt = T0) => ({
  id,
  groupId,
  fromCharacterId: from,
  toCharacterId: to,
  createdAt: at(createdAt),
});

const group = (id: bigint, leader: bigint) => ({
  id,
  name: 'Ann\'s group',
  leaderCharacterId: leader,
  pullerCharacterId: leader,
  createdAt: at(T0),
});

function ctxWith(seed: Record<string, any[]>, now = T0) {
  return { db: createMockDb(seed, { strict: true }), timestamp: at(now) };
}

const tableRows = (ctx: any, name: string): any[] => ctx.db._tables[name] ?? [];
const linesFor = (ctx: any, characterId: bigint): string[] =>
  tableRows(ctx, 'event_private')
    .filter((e: any) => e.characterId === characterId && e.kind === 'group')
    .map((e: any) => e.message);

/** Ann (1) leads group 5 alone; Bram (2) and Cole (3) are solo. */
function soloLeaderSeed(invites: any[] = []) {
  return {
    character: [character(1n, 'Ann', 5n), character(2n, 'Bram'), character(3n, 'Cole')],
    group: [group(5n, 1n)],
    group_member: [member(1n, 5n, 1n)],
    group_invite: invites,
  };
}

describe('inviteIsLive', () => {
  it('is live one microsecond before createdAt + TTL and expired at exactly createdAt + TTL', () => {
    const row = invite(1n, 5n, 1n, 2n);
    expect(inviteIsLive(row, T0 + GROUP_INVITE_TTL_MICROS - 1n)).toBe(true);
    expect(inviteIsLive(row, T0 + GROUP_INVITE_TTL_MICROS)).toBe(false);
  });
});

describe('liveInvitesTo / liveInvitesOfGroup', () => {
  it('ignore expired rows and order by id', () => {
    const ctx = ctxWith(
      soloLeaderSeed([
        invite(4n, 5n, 1n, 2n, T0),
        invite(2n, 6n, 3n, 2n, T0 - GROUP_INVITE_TTL_MICROS),
        invite(3n, 7n, 3n, 2n, T0 - 1n),
      ]),
    );
    expect(liveInvitesTo(ctx, 2n).map((i) => i.id)).toEqual([3n, 4n]);
    expect(liveInvitesOfGroup(ctx, 5n).map((i) => i.id)).toEqual([4n]);
    expect(liveInvitesOfGroup(ctx, 6n)).toEqual([]);
  });
});

describe('dissolveLoneGroup', () => {
  it('removes a group of one with no invites: member row, character groupId and group are gone', () => {
    const ctx = ctxWith(soloLeaderSeed());
    expect(dissolveLoneGroup(ctx, 5n)).toBe(true);
    expect(tableRows(ctx, 'group')).toHaveLength(0);
    expect(tableRows(ctx, 'group_member')).toHaveLength(0);
    expect(tableRows(ctx, 'character').find((c) => c.id === 1n).groupId).toBeUndefined();
  });

  it('leaves a group of two alone', () => {
    const seed = soloLeaderSeed();
    seed.character[1] = character(2n, 'Bram', 5n);
    seed.group_member.push(member(2n, 5n, 2n));
    const ctx = ctxWith(seed);
    expect(dissolveLoneGroup(ctx, 5n)).toBe(false);
    expect(tableRows(ctx, 'group')).toHaveLength(1);
    expect(tableRows(ctx, 'group_member')).toHaveLength(2);
  });

  it('leaves a group of one that still has another live invite alone', () => {
    const ctx = ctxWith(soloLeaderSeed([invite(1n, 5n, 1n, 3n)]));
    expect(dissolveLoneGroup(ctx, 5n)).toBe(false);
    expect(tableRows(ctx, 'group')).toHaveLength(1);
    expect(tableRows(ctx, 'character').find((c) => c.id === 1n).groupId).toBe(5n);
  });

  it('is false for a group that does not exist', () => {
    const ctx = ctxWith(soloLeaderSeed());
    expect(dissolveLoneGroup(ctx, 99n)).toBe(false);
  });
});

describe('endExpiredInvitesTo', () => {
  it('ends only the expired invites to that character and counts them', () => {
    const ctx = ctxWith(
      soloLeaderSeed([invite(1n, 5n, 1n, 2n, T0 - GROUP_INVITE_TTL_MICROS), invite(2n, 5n, 1n, 3n, T0)]),
    );
    expect(endExpiredInvitesTo(ctx, 2n)).toBe(1);
    expect(tableRows(ctx, 'group_invite').map((i) => i.id)).toEqual([2n]);
    expect(linesFor(ctx, 1n)).toEqual(['Your invite to Bram expired.']);
    expect(linesFor(ctx, 2n)).toEqual(['The invite from Ann expired.']);
    // Ann still has a live invite out, so her group stays.
    expect(tableRows(ctx, 'group')).toHaveLength(1);
  });
});

describe('endInvite', () => {
  it('expired: tells the inviter and the target, then dissolves the lone group', () => {
    const ctx = ctxWith(soloLeaderSeed([invite(1n, 5n, 1n, 2n)]));
    endInvite(ctx, tableRows(ctx, 'group_invite')[0], 'expired');
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
    expect(linesFor(ctx, 1n)).toEqual(['Your invite to Bram expired.']);
    expect(linesFor(ctx, 2n)).toEqual(['The invite from Ann expired.']);
    expect(tableRows(ctx, 'group')).toHaveLength(0);
    expect(tableRows(ctx, 'character').find((c) => c.id === 1n).groupId).toBeUndefined();
  });

  it('cancelled: tells the target who cancelled and the canceller', () => {
    const ctx = ctxWith(soloLeaderSeed([invite(1n, 5n, 1n, 2n)]));
    const ann = tableRows(ctx, 'character')[0];
    endInvite(ctx, tableRows(ctx, 'group_invite')[0], 'cancelled', ann);
    expect(linesFor(ctx, 2n)).toEqual(['Ann cancelled the invite.']);
    expect(linesFor(ctx, 1n)).toEqual(['You cancelled the invite to Bram.']);
    expect(tableRows(ctx, 'group')).toHaveLength(0);
  });

  it('declined: the inviter gets the existing declined line; the lone group stays while another invite is out', () => {
    const ctx = ctxWith(soloLeaderSeed([invite(1n, 5n, 1n, 2n), invite(2n, 5n, 1n, 3n)]));
    const bram = tableRows(ctx, 'character')[1];
    endInvite(ctx, tableRows(ctx, 'group_invite')[0], 'declined', bram);
    expect(linesFor(ctx, 1n)).toEqual(['Bram declined your group invite.']);
    expect(linesFor(ctx, 2n)).toEqual([]);
    expect(tableRows(ctx, 'group_invite').map((i) => i.id)).toEqual([2n]);
    expect(tableRows(ctx, 'group')).toHaveLength(1);
  });
});

describe('nextLeaderAfter', () => {
  it('picks the earliest joinedAt and never the leaving character', () => {
    const ctx = ctxWith({
      group_member: [member(1n, 5n, 1n, T0), member(2n, 5n, 2n, T0 + 2n), member(3n, 5n, 3n, T0 + 1n)],
    });
    expect(nextLeaderAfter(ctx, 5n, 1n)?.characterId).toBe(3n);
  });

  it('breaks a joinedAt tie with the lowest member id', () => {
    const ctx = ctxWith({
      group_member: [member(9n, 5n, 1n, T0), member(7n, 5n, 2n, T0 + 1n), member(4n, 5n, 3n, T0 + 1n)],
    });
    expect(nextLeaderAfter(ctx, 5n, 1n)?.characterId).toBe(3n);
  });

  it('is null when nobody else is left', () => {
    const ctx = ctxWith({ group_member: [member(1n, 5n, 1n)] });
    expect(nextLeaderAfter(ctx, 5n, 1n)).toBeNull();
  });
});

describe('scheduleInviteExpiry', () => {
  it('inserts one private tick for the invite, due at createdAt + TTL', () => {
    const ctx = ctxWith(soloLeaderSeed());
    scheduleInviteExpiry(ctx, invite(42n, 5n, 1n, 2n, T0 + 7n));
    const ticks = tableRows(ctx, 'group_invite_expiry_tick');
    expect(ticks).toHaveLength(1);
    expect(ticks[0].inviteId).toBe(42n);
    expect(ticks[0].scheduledAt.tag).toBe('Time');
    expect(ticks[0].scheduledAt.value.microsSinceUnixEpoch).toBe(T0 + 7n + GROUP_INVITE_TTL_MICROS);
  });
});
