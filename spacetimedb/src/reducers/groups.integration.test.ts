/**
 * Party invites need consent (plan 51.1-03): the real group reducers on the strict mock db.
 * Joining needs a live invite addressed to you; invites expire after GROUP_INVITE_TTL_MICROS
 * (lazy check here, the scheduled tick as well); a refused invite leaves no stray group; a
 * one-member group dissolves when its last invite ends; the leader or inviter can cancel.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { GROUP_INVITE_TTL_MICROS, GROUP_REINVITE_COOLDOWN_MICROS } from '../data/group_config';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const TTL = GROUP_INVITE_TTL_MICROS;
const MODULE = { toHexString: () => 'module-identity-hex' };

/** One identity per user; user n owns character n - 6 (Ann = 1 is user 7). */
const ident = (userId: bigint) => ({ toHexString: () => userId.toString(16).padStart(64, '0') });
const USERS = [7n, 8n, 9n, 10n, 11n, 12n].map((u) => ({ userId: u, id: ident(u) }));
const NAMES = ['Ann', 'Bram', 'Cole', 'Dena', 'Eli', 'Finn'];
const senderOf = (characterId: bigint) => USERS[Number(characterId) - 1].id;

const REDUCERS = [
  'join_group',
  'accept_group_invite',
  'reject_group_invite',
  'invite_to_group',
  'leave_group',
] as const;
const handlers: Record<string, (...args: any[]) => any> = {};

beforeAll(async () => {
  await import('../index');
  for (const name of REDUCERS) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    handlers[name] = h;
  }
}, 120_000);

const at = (micros: bigint) => ({ microsSinceUnixEpoch: micros });

type CharOver = { groupId?: bigint; online?: boolean };
type Seed = {
  chars?: Record<number, CharOver>;
  groups?: Array<{ id: bigint; leader: bigint }>;
  members?: Array<{ id: bigint; groupId: bigint; characterId: bigint; joinedAt?: bigint; role?: string }>;
  invites?: Array<{ id: bigint; groupId: bigint; from: bigint; to: bigint; createdAt?: bigint }>;
};

/** Six characters (Ann..Finn), all online and solo unless overridden. */
function newCtx(s: Seed = {}) {
  return createMockCtx({
    seed: {
      player: USERS.map((u, i) => ({ id: u.id, userId: u.userId, activeCharacterId: BigInt(i + 1) })),
      character: NAMES.map((name, i) => {
        const id = BigInt(i + 1);
        const over = s.chars?.[i + 1] ?? {};
        return {
          id,
          ownerUserId: USERS[i].userId,
          name,
          locationId: 10n,
          groupId: over.groupId,
          online: over.online ?? true,
        };
      }),
      group: (s.groups ?? []).map((g) => ({
        id: g.id,
        name: `${NAMES[Number(g.leader) - 1]}'s group`,
        leaderCharacterId: g.leader,
        pullerCharacterId: g.leader,
        createdAt: at(T0 - 10n),
      })),
      group_member: (s.members ?? []).map((m) => ({
        id: m.id,
        groupId: m.groupId,
        characterId: m.characterId,
        ownerUserId: USERS[Number(m.characterId) - 1].userId,
        role: m.role ?? 'member',
        followLeader: true,
        joinedAt: at(m.joinedAt ?? T0 - 10n),
      })),
      group_invite: (s.invites ?? []).map((i) => ({
        id: i.id,
        groupId: i.groupId,
        fromCharacterId: i.from,
        toCharacterId: i.to,
        createdAt: at(i.createdAt ?? T0),
      })),
    },
    sender: USERS[0].id,
    timestampMicros: T0,
    strict: true,
  });
}

function handler(name: string) {
  const h = handlers[name] ?? capturedReducer(name);
  if (typeof h !== 'function') throw new Error(`capturedReducer('${name}') is not a function`);
  return h;
}

/** Call a captured reducer as the owner of `characterId` at `now`. */
function call(ctx: any, name: string, characterId: bigint, args: Record<string, unknown>, now = T0) {
  return handler(name)({ ...ctx, sender: senderOf(characterId), timestamp: at(now) }, { characterId, ...args });
}

/** Run expire_group_invite for a tick row, as `sender` (the module by default) at `now`. */
function expire(ctx: any, tick: any, now: bigint, sender: any = MODULE) {
  return handler('expire_group_invite')({ ...ctx, sender, timestamp: at(now) }, { arg: tick });
}

const snapshot = (ctx: any) =>
  JSON.stringify(ctx.db._tables, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));

const tableRows = (ctx: any, name: string): any[] => ctx.db._tables[name] ?? [];
const char = (ctx: any, id: bigint) => tableRows(ctx, 'character').find((c) => c.id === id);
const lines = (ctx: any, characterId: bigint): string[] =>
  tableRows(ctx, 'event_private')
    .filter((e: any) => e.characterId === characterId && e.kind === 'group')
    .map((e: any) => e.message);
const membersOf = (ctx: any, groupId: bigint) => tableRows(ctx, 'group_member').filter((m) => m.groupId === groupId);

/** Ann (1) leads group 5 alone. */
const annAlone: Seed = {
  chars: { 1: { groupId: 5n } },
  groups: [{ id: 5n, leader: 1n }],
  members: [{ id: 1n, groupId: 5n, characterId: 1n, role: 'leader' }],
};
const withInvites = (base: Seed, invites: Seed['invites']): Seed => ({ ...base, invites });

describe('join_group needs a live invite for that group', () => {
  it('refuses without an invite and adds no member row', () => {
    const ctx = newCtx(annAlone);
    call(ctx, 'join_group', 2n, { groupId: 5n });
    expect(lines(ctx, 2n)).toEqual(['You need an invite to join.']);
    expect(membersOf(ctx, 5n)).toHaveLength(1);
    expect(char(ctx, 2n).groupId).toBeUndefined();
  });

  it('joins with a live invite and consumes it', () => {
    const ctx = newCtx(withInvites(annAlone, [{ id: 1n, groupId: 5n, from: 1n, to: 2n }]));
    call(ctx, 'join_group', 2n, { groupId: 5n });
    expect(membersOf(ctx, 5n).map((m) => m.characterId)).toEqual([1n, 2n]);
    expect(char(ctx, 2n).groupId).toBe(5n);
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
    expect(tableRows(ctx, 'event_group').map((e) => e.message)).toContain('Bram joined the group.');
  });

  it('refuses when the invite is for another group', () => {
    const ctx = newCtx({
      chars: { 1: { groupId: 5n }, 3: { groupId: 6n } },
      groups: [{ id: 5n, leader: 1n }, { id: 6n, leader: 3n }],
      members: [
        { id: 1n, groupId: 5n, characterId: 1n, role: 'leader' },
        { id: 2n, groupId: 6n, characterId: 3n, role: 'leader' },
      ],
      invites: [{ id: 1n, groupId: 6n, from: 3n, to: 2n }],
    });
    call(ctx, 'join_group', 2n, { groupId: 5n });
    expect(lines(ctx, 2n)).toEqual(['You need an invite to join.']);
    expect(membersOf(ctx, 5n)).toHaveLength(1);
    expect(tableRows(ctx, 'group_invite')).toHaveLength(1);
  });

  it('refuses an expired invite (now = createdAt + TTL) and ends it', () => {
    const ctx = newCtx(withInvites(annAlone, [{ id: 1n, groupId: 5n, from: 1n, to: 2n }]));
    call(ctx, 'join_group', 2n, { groupId: 5n }, T0 + TTL);
    expect(lines(ctx, 2n)).toContain('That invite has expired.');
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
    expect(tableRows(ctx, 'group_member').filter((m) => m.characterId === 2n)).toHaveLength(0);
  });
});

describe('accept_group_invite', () => {
  it('joins one microsecond before the invite expires', () => {
    const ctx = newCtx(withInvites(annAlone, [{ id: 1n, groupId: 5n, from: 1n, to: 2n }]));
    call(ctx, 'accept_group_invite', 2n, { fromName: 'Ann' }, T0 + TTL - 1n);
    expect(char(ctx, 2n).groupId).toBe(5n);
    expect(membersOf(ctx, 5n)).toHaveLength(2);
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
  });

  it('refuses at exactly createdAt + TTL, ends the invite and dissolves the inviter\'s lone group', () => {
    const ctx = newCtx(withInvites(annAlone, [{ id: 1n, groupId: 5n, from: 1n, to: 2n }]));
    call(ctx, 'accept_group_invite', 2n, { fromName: 'Ann' }, T0 + TTL);
    expect(lines(ctx, 2n)).toEqual(['The invite from Ann expired.', 'That invite has expired.']);
    expect(lines(ctx, 1n)).toEqual(['Your invite to Bram expired.']);
    expect(char(ctx, 2n).groupId).toBeUndefined();
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
    expect(tableRows(ctx, 'group')).toHaveLength(0);
    expect(tableRows(ctx, 'group_member')).toHaveLength(0);
    expect(char(ctx, 1n).groupId).toBeUndefined();
  });

  it('accepting twice joins once; the second call is refused', () => {
    const ctx = newCtx(withInvites(annAlone, [{ id: 1n, groupId: 5n, from: 1n, to: 2n }]));
    call(ctx, 'accept_group_invite', 2n, { fromName: 'Ann' });
    call(ctx, 'accept_group_invite', 2n, { fromName: 'Ann' });
    expect(lines(ctx, 2n)).toEqual(['Character already in a group']);
    expect(tableRows(ctx, 'group_member').filter((m) => m.characterId === 2n)).toHaveLength(1);
  });
});

describe('invite_to_group checks everything before creating anything', () => {
  /** A solo Ann's refused invite must leave no group, member or invite row of hers. */
  function expectNothingOfAnns(ctx: any) {
    expect(tableRows(ctx, 'group').filter((g) => g.leaderCharacterId === 1n)).toHaveLength(0);
    expect(tableRows(ctx, 'group_member').filter((m) => m.characterId === 1n)).toHaveLength(0);
    expect(tableRows(ctx, 'group_invite').filter((i) => i.fromCharacterId === 1n)).toHaveLength(0);
    expect(char(ctx, 1n).groupId).toBeUndefined();
    expect(tableRows(ctx, 'event_group')).toHaveLength(0);
  }

  it('an offline target: refused, nothing created', () => {
    const ctx = newCtx({ chars: { 2: { online: false } } });
    call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' });
    expect(lines(ctx, 1n)).toEqual(['Bram is offline.']);
    expectNothingOfAnns(ctx);
  });

  it('a target already in a group: refused, nothing created', () => {
    const ctx = newCtx({
      chars: { 2: { groupId: 6n }, 3: { groupId: 6n } },
      groups: [{ id: 6n, leader: 3n }],
      members: [
        { id: 1n, groupId: 6n, characterId: 3n, role: 'leader' },
        { id: 2n, groupId: 6n, characterId: 2n },
      ],
    });
    call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' });
    expect(lines(ctx, 1n)).toEqual(['Bram is already in a group.']);
    expectNothingOfAnns(ctx);
  });

  it('an unknown name: refused, nothing created', () => {
    const ctx = newCtx();
    call(ctx, 'invite_to_group', 1n, { targetName: 'Nobody' });
    expect(lines(ctx, 1n)).toEqual(['Target not found']);
    expectNothingOfAnns(ctx);
  });

  it('an empty name: refused with Target required, nothing created', () => {
    const ctx = newCtx();
    call(ctx, 'invite_to_group', 1n, { targetName: '   ' });
    expect(lines(ctx, 1n)).toEqual(['Target required']);
    expectNothingOfAnns(ctx);
  });

  it('yourself: refused, nothing created', () => {
    const ctx = newCtx();
    call(ctx, 'invite_to_group', 1n, { targetName: 'ann' });
    expect(lines(ctx, 1n)).toEqual(['Cannot invite yourself']);
    expectNothingOfAnns(ctx);
  });

  it('a target with a live pending invite: refused, nothing created', () => {
    const ctx = newCtx({
      chars: { 3: { groupId: 6n } },
      groups: [{ id: 6n, leader: 3n }],
      members: [{ id: 1n, groupId: 6n, characterId: 3n, role: 'leader' }],
      invites: [{ id: 1n, groupId: 6n, from: 3n, to: 2n }],
    });
    call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' });
    expect(lines(ctx, 1n)).toEqual(['Bram already has a pending invite.']);
    expectNothingOfAnns(ctx);
    expect(tableRows(ctx, 'group_invite')).toHaveLength(1);
  });

  it('a non-leader member: the existing leader-only line, nothing inserted', () => {
    const ctx = newCtx({
      chars: { 1: { groupId: 5n }, 2: { groupId: 5n } },
      groups: [{ id: 5n, leader: 1n }],
      members: [
        { id: 1n, groupId: 5n, characterId: 1n, role: 'leader' },
        { id: 2n, groupId: 5n, characterId: 2n },
      ],
    });
    call(ctx, 'invite_to_group', 2n, { targetName: 'Cole' });
    expect(lines(ctx, 2n)).toEqual(['Only the group leader can invite new members.']);
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
    expect(tableRows(ctx, 'group')).toHaveLength(1);
    expect(tableRows(ctx, 'group_member')).toHaveLength(2);
  });
});

describe('invite_to_group: the size cap counts live invites', () => {
  /** Group 5: Ann (leader), Bram, Cole, Dena; one invite to Eli. Ann invites Finn. */
  const fourAndAnInvite = (inviteCreatedAt: bigint): Seed => ({
    chars: { 1: { groupId: 5n }, 2: { groupId: 5n }, 3: { groupId: 5n }, 4: { groupId: 5n } },
    groups: [{ id: 5n, leader: 1n }],
    members: [
      { id: 1n, groupId: 5n, characterId: 1n, role: 'leader' },
      { id: 2n, groupId: 5n, characterId: 2n },
      { id: 3n, groupId: 5n, characterId: 3n },
      { id: 4n, groupId: 5n, characterId: 4n },
    ],
    invites: [{ id: 1n, groupId: 5n, from: 1n, to: 5n, createdAt: inviteCreatedAt }],
  });

  it('4 members + 1 live invite: Your group is full.', () => {
    const ctx = newCtx(fourAndAnInvite(T0));
    call(ctx, 'invite_to_group', 1n, { targetName: 'Finn' });
    expect(lines(ctx, 1n)).toEqual(['Your group is full.']);
    expect(tableRows(ctx, 'group_invite').map((i) => i.toCharacterId)).toEqual([5n]);
  });

  it('with that invite expired, the same call succeeds and the expired invite is ended', () => {
    const ctx = newCtx(fourAndAnInvite(T0 - TTL));
    call(ctx, 'invite_to_group', 1n, { targetName: 'Finn' });
    expect(tableRows(ctx, 'group_invite').map((i) => i.toCharacterId)).toEqual([6n]);
    expect(lines(ctx, 1n)).toContain('You invited Finn.');
    expect(lines(ctx, 1n)).toContain('Your invite to Eli expired.');
    expect(membersOf(ctx, 5n)).toHaveLength(4);
  });
});

describe('invite_to_group: success and stale invites', () => {
  it('a solo inviter: one invite at now, the target line, the inviter line, the group and leader row', () => {
    const ctx = newCtx();
    call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' });
    const invites = tableRows(ctx, 'group_invite');
    expect(invites).toHaveLength(1);
    expect(invites[0].createdAt.microsSinceUnixEpoch).toBe(T0);
    expect(invites[0].fromCharacterId).toBe(1n);
    expect(invites[0].toCharacterId).toBe(2n);
    const group = tableRows(ctx, 'group')[0];
    expect(group.leaderCharacterId).toBe(1n);
    expect(invites[0].groupId).toBe(group.id);
    expect(membersOf(ctx, group.id).map((m) => [m.characterId, m.role])).toEqual([[1n, 'leader']]);
    expect(char(ctx, 1n).groupId).toBe(group.id);
    expect(lines(ctx, 2n)).toEqual([
      'Ann invited you to a group. Type [accept Ann] to join or [decline Ann] to refuse.',
    ]);
    expect(lines(ctx, 1n)).toEqual(['You invited Bram.']);
  });

  it('a target holding an expired invite from another group can be invited; the stale lone group dissolves', () => {
    const ctx = newCtx({
      chars: { 3: { groupId: 6n } },
      groups: [{ id: 6n, leader: 3n }],
      members: [{ id: 1n, groupId: 6n, characterId: 3n, role: 'leader' }],
      invites: [{ id: 1n, groupId: 6n, from: 3n, to: 2n, createdAt: T0 - TTL }],
    });
    call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' });
    expect(tableRows(ctx, 'group_invite').map((i) => i.fromCharacterId)).toEqual([1n]);
    expect(lines(ctx, 3n)).toEqual(['Your invite to Bram expired.']);
    expect(lines(ctx, 2n)[0]).toBe('The invite from Cole expired.');
    expect(tableRows(ctx, 'group').some((g) => g.id === 6n)).toBe(false);
    expect(char(ctx, 3n).groupId).toBeUndefined();
    expect(lines(ctx, 1n)).toEqual(['You invited Bram.']);
  });
});

describe('names are trimmed and matched case-insensitively', () => {
  for (const name of [' bram ', 'BRAM']) {
    it(`invite '${name}' reaches Bram`, () => {
      const ctx = newCtx();
      call(ctx, 'invite_to_group', 1n, { targetName: name });
      expect(tableRows(ctx, 'group_invite').map((i) => i.toCharacterId)).toEqual([2n]);
    });
  }

  for (const name of [' ann ', 'ANN']) {
    it(`accept '${name}' finds Ann's invite`, () => {
      const ctx = newCtx(withInvites(annAlone, [{ id: 1n, groupId: 5n, from: 1n, to: 2n }]));
      call(ctx, 'accept_group_invite', 2n, { fromName: name });
      expect(char(ctx, 2n).groupId).toBe(5n);
    });

    it(`reject '${name}' finds Ann's invite`, () => {
      const ctx = newCtx(withInvites(annAlone, [{ id: 1n, groupId: 5n, from: 1n, to: 2n }]));
      call(ctx, 'reject_group_invite', 2n, { fromName: name });
      expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
    });
  }
});

describe('reject_group_invite', () => {
  it('deletes the invite, tells the inviter, and dissolves a solo inviter\'s lone group; again is silent', () => {
    const ctx = newCtx(withInvites(annAlone, [{ id: 1n, groupId: 5n, from: 1n, to: 2n }]));
    call(ctx, 'reject_group_invite', 2n, { fromName: 'Ann' });
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
    expect(lines(ctx, 1n)).toEqual(['Bram declined your group invite.']);
    expect(tableRows(ctx, 'group')).toHaveLength(0);
    expect(char(ctx, 1n).groupId).toBeUndefined();

    const before = JSON.stringify(ctx.db._tables, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    call(ctx, 'reject_group_invite', 2n, { fromName: 'Ann' });
    const after = JSON.stringify(ctx.db._tables, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    expect(after).toBe(before);
  });

  it('a group with another member is left alone', () => {
    const ctx = newCtx({
      chars: { 1: { groupId: 5n }, 3: { groupId: 5n } },
      groups: [{ id: 5n, leader: 1n }],
      members: [
        { id: 1n, groupId: 5n, characterId: 1n, role: 'leader' },
        { id: 2n, groupId: 5n, characterId: 3n },
      ],
      invites: [{ id: 1n, groupId: 5n, from: 1n, to: 2n }],
    });
    call(ctx, 'reject_group_invite', 2n, { fromName: 'Ann' });
    expect(tableRows(ctx, 'group')).toHaveLength(1);
    expect(membersOf(ctx, 5n)).toHaveLength(2);
  });
});

describe('leave_group passes leadership deterministically', () => {
  const three = (bramJoined: bigint, coleJoined: bigint): Seed => ({
    chars: { 1: { groupId: 5n }, 2: { groupId: 5n }, 3: { groupId: 5n } },
    groups: [{ id: 5n, leader: 1n }],
    members: [
      { id: 1n, groupId: 5n, characterId: 1n, role: 'leader', joinedAt: T0 },
      { id: 2n, groupId: 5n, characterId: 2n, joinedAt: bramJoined },
      { id: 3n, groupId: 5n, characterId: 3n, joinedAt: coleJoined },
    ],
  });

  it('the earliest joiner becomes leader', () => {
    const ctx = newCtx(three(T0 + 2n, T0 + 1n));
    call(ctx, 'leave_group', 1n, {});
    expect(tableRows(ctx, 'group')[0].leaderCharacterId).toBe(3n);
    expect(membersOf(ctx, 5n).find((m) => m.characterId === 3n).role).toBe('leader');
  });

  it('with equal joinedAt the lower member id wins', () => {
    const ctx = newCtx(three(T0 + 1n, T0 + 1n));
    call(ctx, 'leave_group', 1n, {});
    expect(tableRows(ctx, 'group')[0].leaderCharacterId).toBe(2n);
  });
});

describe('invite expiry tick (expire_group_invite)', () => {
  /** Ann (solo) invites Bram at T0 through the real reducer; returns the ctx, invite and tick. */
  function annInvitesBram(seed: Seed = {}) {
    const ctx = newCtx(seed);
    call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' });
    const invite = tableRows(ctx, 'group_invite')[0];
    const tick = tableRows(ctx, 'group_invite_expiry_tick')[0];
    return { ctx, invite, tick };
  }

  it('an invite inserts exactly one tick for that invite, due at createdAt + TTL', () => {
    const { ctx, invite } = annInvitesBram();
    const ticks = tableRows(ctx, 'group_invite_expiry_tick');
    expect(ticks).toHaveLength(1);
    expect(ticks[0].inviteId).toBe(invite.id);
    expect(ticks[0].scheduledAt.tag).toBe('Time');
    expect(ticks[0].scheduledAt.value.microsSinceUnixEpoch).toBe(T0 + 300_000_000n);
  });

  it('a refused invite schedules no tick', () => {
    const ctx = newCtx({ chars: { 2: { online: false } } });
    call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' });
    expect(tableRows(ctx, 'group_invite_expiry_tick')).toHaveLength(0);
  });

  it('the module at createdAt + TTL ends the invite, tells both, and dissolves the lone group', () => {
    const { ctx, tick } = annInvitesBram();
    expire(ctx, tick, T0 + TTL);
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
    expect(lines(ctx, 1n)).toEqual(['You invited Bram.', 'Your invite to Bram expired.']);
    expect(lines(ctx, 2n).slice(-1)).toEqual(['The invite from Ann expired.']);
    expect(tableRows(ctx, 'group')).toHaveLength(0);
    expect(tableRows(ctx, 'group_member')).toHaveLength(0);
    expect(char(ctx, 1n).groupId).toBeUndefined();
  });

  for (const [label, end] of [
    ['accepted', (ctx: any) => call(ctx, 'accept_group_invite', 2n, { fromName: 'Ann' })],
    ['declined', (ctx: any) => call(ctx, 'reject_group_invite', 2n, { fromName: 'Ann' })],
    ['cancelled', (ctx: any) => call(ctx, 'cancel_group_invite', 1n, { targetName: 'Bram' })],
  ] as const) {
    it(`a tick for an invite already ${label} changes nothing and writes no line`, () => {
      const { ctx, tick } = annInvitesBram();
      end(ctx);
      const before = snapshot(ctx);
      expire(ctx, tick, T0 + TTL);
      expect(snapshot(ctx)).toBe(before);
    });
  }

  it('a tick on a still-live invite changes nothing', () => {
    const { ctx, tick } = annInvitesBram();
    const before = snapshot(ctx);
    expire(ctx, tick, T0 + TTL - 1n);
    expect(snapshot(ctx)).toBe(before);
  });

  it('a client identity calling it changes nothing, even when the invite is expired', () => {
    const { ctx, tick } = annInvitesBram();
    const before = snapshot(ctx);
    expire(ctx, tick, T0 + TTL, senderOf(1n));
    expect(snapshot(ctx)).toBe(before);
  });
});

describe('cancel_group_invite', () => {
  /** Group 5: Ann leads, Cole and Dena are members; `from` invited Bram at T0. */
  const groupWithInvite = (from: bigint): Seed => ({
    chars: { 1: { groupId: 5n }, 3: { groupId: 5n }, 4: { groupId: 5n } },
    groups: [{ id: 5n, leader: 1n }],
    members: [
      { id: 1n, groupId: 5n, characterId: 1n, role: 'leader' },
      { id: 2n, groupId: 5n, characterId: 3n },
      { id: 3n, groupId: 5n, characterId: 4n },
    ],
    invites: [{ id: 1n, groupId: 5n, from, to: 2n }],
  });

  it('the leader ends the invite: Bram and Ann get their lines', () => {
    const ctx = newCtx(groupWithInvite(1n));
    call(ctx, 'cancel_group_invite', 1n, { targetName: 'Bram' });
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
    expect(lines(ctx, 2n)).toEqual(['Ann cancelled the invite.']);
    expect(lines(ctx, 1n)).toEqual(['You cancelled the invite to Bram.']);
    expect(membersOf(ctx, 5n)).toHaveLength(3);
  });

  it('the inviter who no longer leads may cancel', () => {
    const ctx = newCtx(groupWithInvite(3n));
    call(ctx, 'cancel_group_invite', 3n, { targetName: ' bram ' });
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
    expect(lines(ctx, 2n)).toEqual(['Cole cancelled the invite.']);
    expect(lines(ctx, 3n)).toEqual(['You cancelled the invite to Bram.']);
  });

  it('another member who neither leads nor invited is refused and the invite stays', () => {
    const ctx = newCtx(groupWithInvite(1n));
    call(ctx, 'cancel_group_invite', 4n, { targetName: 'Bram' });
    expect(lines(ctx, 4n)).toEqual(['No pending invite to Bram.']);
    expect(tableRows(ctx, 'group_invite')).toHaveLength(1);
    expect(lines(ctx, 2n)).toEqual([]);
  });

  it('a second cancel of the same invite is refused the same way', () => {
    const ctx = newCtx(groupWithInvite(1n));
    call(ctx, 'cancel_group_invite', 1n, { targetName: 'Bram' });
    call(ctx, 'cancel_group_invite', 1n, { targetName: 'Bram' });
    expect(lines(ctx, 1n)).toEqual(['You cancelled the invite to Bram.', 'No pending invite to Bram.']);
  });

  it('an empty name: Target required', () => {
    const ctx = newCtx(groupWithInvite(1n));
    call(ctx, 'cancel_group_invite', 1n, { targetName: '  ' });
    expect(lines(ctx, 1n)).toEqual(['Target required']);
    expect(tableRows(ctx, 'group_invite')).toHaveLength(1);
  });

  it('an unknown name: Target not found', () => {
    const ctx = newCtx(groupWithInvite(1n));
    call(ctx, 'cancel_group_invite', 1n, { targetName: 'Nobody' });
    expect(lines(ctx, 1n)).toEqual(['Target not found']);
  });

  it('someone outside the group cannot cancel it', () => {
    const ctx = newCtx(groupWithInvite(1n));
    call(ctx, 'cancel_group_invite', 6n, { targetName: 'Bram' });
    expect(lines(ctx, 6n)).toEqual(['No pending invite to Bram.']);
    expect(tableRows(ctx, 'group_invite')).toHaveLength(1);
  });

  it('cancelling the last invite of a solo leader\'s lone group dissolves it', () => {
    const ctx = newCtx(withInvites(annAlone, [{ id: 1n, groupId: 5n, from: 1n, to: 2n }]));
    call(ctx, 'cancel_group_invite', 1n, { targetName: 'Bram' });
    expect(tableRows(ctx, 'group')).toHaveLength(0);
    expect(tableRows(ctx, 'group_member')).toHaveLength(0);
    expect(char(ctx, 1n).groupId).toBeUndefined();
  });

  it('cancelling one of two invites keeps the lone group', () => {
    const ctx = newCtx(
      withInvites(annAlone, [
        { id: 1n, groupId: 5n, from: 1n, to: 2n },
        { id: 2n, groupId: 5n, from: 1n, to: 3n },
      ]),
    );
    call(ctx, 'cancel_group_invite', 1n, { targetName: 'Bram' });
    expect(tableRows(ctx, 'group')).toHaveLength(1);
    expect(tableRows(ctx, 'group_invite').map((i) => i.toCharacterId)).toEqual([3n]);
  });
});

describe('invite spam guard (code review WR-02)', () => {
  const WAIT = GROUP_REINVITE_COOLDOWN_MICROS;
  const WAIT_LINE = 'Wait a moment before inviting Bram again.';

  /** Ann (solo) invites Bram at T0; then `end` ends the invite at T0 + 1. */
  function invitedThen(end: 'decline' | 'cancel' | 'accept' | 'expire') {
    const ctx = newCtx();
    call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' });
    const tick = tableRows(ctx, 'group_invite_expiry_tick')[0];
    if (end === 'decline') call(ctx, 'reject_group_invite', 2n, { fromName: 'Ann' }, T0 + 1n);
    if (end === 'cancel') call(ctx, 'cancel_group_invite', 1n, { targetName: 'Bram' }, T0 + 1n);
    if (end === 'accept') call(ctx, 'accept_group_invite', 2n, { fromName: 'Ann' }, T0 + 1n);
    if (end === 'expire') expire(ctx, tick, T0 + TTL);
    return { ctx, tick };
  }

  for (const end of ['decline', 'cancel'] as const) {
    it(`after a ${end}, Ann cannot invite Bram again until the wait is over`, () => {
      const { ctx } = invitedThen(end);
      call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' }, T0 + 1n + WAIT - 1n);
      expect(lines(ctx, 1n).slice(-1)).toEqual([WAIT_LINE]);
      expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
      expect(tableRows(ctx, 'group_invite_expiry_tick')).toHaveLength(0);
      expect(tableRows(ctx, 'group')).toHaveLength(0);
      expect(lines(ctx, 2n).filter((l) => l.startsWith('Ann invited you'))).toHaveLength(1);

      call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' }, T0 + 1n + WAIT);
      expect(tableRows(ctx, 'group_invite')).toHaveLength(1);
      expect(lines(ctx, 1n).slice(-1)).toEqual(['You invited Bram.']);
      // The finished wait was pruned when Bram was invited again.
      expect(tableRows(ctx, 'group_invite_cooldown')).toHaveLength(0);
    });
  }

  // Review 2 WR-01: leaving (or camping out of) the lone group withdrew the invite with no wait, so
  // invite → leave → invite repeated with no throttle.
  it('invite → leave → invite: the leave starts the wait, so the re-invite is refused', () => {
    const ctx = newCtx();
    call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' });
    call(ctx, 'leave_group', 1n, {}, T0 + 1n);
    expect(lines(ctx, 2n).slice(-1)).toEqual(['The invite from Ann is no longer open.']);
    call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' }, T0 + 2n);
    expect(lines(ctx, 1n).slice(-1)).toEqual([WAIT_LINE]);
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
    expect(tableRows(ctx, 'group')).toHaveLength(0);
    expect(lines(ctx, 2n).filter((l) => l.startsWith('Ann invited you'))).toHaveLength(1);

    call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' }, T0 + 1n + WAIT);
    expect(lines(ctx, 1n).slice(-1)).toEqual(['You invited Bram.']);
  });

  it('a leave/re-invite loop of ten rounds sends Bram one invite line', () => {
    const ctx = newCtx();
    for (let i = 0n; i < 10n; i++) {
      call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' }, T0 + i * 10n);
      if (char(ctx, 1n).groupId) call(ctx, 'leave_group', 1n, {}, T0 + i * 10n + 1n);
    }
    expect(lines(ctx, 2n).filter((l) => l.startsWith('Ann invited you'))).toHaveLength(1);
  });

  it('camping out of the lone group starts the wait too', () => {
    const ctx = newCtx();
    call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' });
    call(ctx, 'clear_active_character', 1n, {}, T0 + 1n);
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
    expect(tableRows(ctx, 'group_invite_cooldown')).toMatchObject([
      { fromCharacterId: 1n, toCharacterId: 2n, untilMicros: T0 + 1n + WAIT },
    ]);
  });

  // Review 3 WR-01: a withdrawal starts the wait whoever caused it, except a character deletion.
  it('a withdrawal another member caused starts the wait for the original inviter', () => {
    // Ann invited Cole, then left; Bram leads alone. Bram leaving withdraws Ann's invite.
    const ctx = newCtx({
      chars: { 1: { groupId: 5n }, 2: { groupId: 5n } },
      groups: [{ id: 5n, leader: 1n }],
      members: [
        { id: 1n, groupId: 5n, characterId: 1n, role: 'leader', joinedAt: T0 - 5n },
        { id: 2n, groupId: 5n, characterId: 2n, joinedAt: T0 - 4n },
      ],
      invites: [{ id: 1n, groupId: 5n, from: 1n, to: 3n }],
    });
    call(ctx, 'leave_group', 1n, {}, T0 + 1n);
    call(ctx, 'leave_group', 2n, {}, T0 + 2n);
    expect(lines(ctx, 3n).slice(-1)).toEqual(['The invite from Ann is no longer open.']);
    expect(tableRows(ctx, 'group_invite_cooldown')).toMatchObject([
      { fromCharacterId: 1n, toCharacterId: 3n, untilMicros: T0 + 2n + WAIT },
    ]);
  });

  it('deleting the invited character starts no wait', () => {
    const ctx = newCtx();
    call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' });
    call(ctx, 'delete_character', 2n, {}, T0 + 1n);
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
    expect(tableRows(ctx, 'group_invite_cooldown')).toHaveLength(0);
  });

  it('deleting the inviter starts no wait', () => {
    const ctx = newCtx();
    call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' });
    call(ctx, 'delete_character', 1n, {}, T0 + 1n);
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
    expect(tableRows(ctx, 'group_invite_cooldown')).toHaveLength(0);
  });

  // Review 3 WR-01: A and her second character M loop invite C with no throttle.
  it('a two-character leave loop sends Cole one invite line over ten rounds', () => {
    const ctx = newCtx();
    for (let i = 0n; i < 10n; i++) {
      const t = T0 + i * 10n;
      // Round start: Ann and Bram form {Ann, Bram}, Ann leading.
      call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' }, t);
      call(ctx, 'accept_group_invite', 2n, { fromName: 'Ann' }, t + 1n);
      call(ctx, 'invite_to_group', 1n, { targetName: 'Cole' }, t + 2n);
      // Ann leaves (the group stays for the live invite), then Bram leaves (the group empties).
      call(ctx, 'leave_group', 1n, {}, t + 3n);
      call(ctx, 'leave_group', 2n, {}, t + 4n);
    }
    expect(lines(ctx, 3n).filter((l) => l.startsWith('Ann invited you'))).toHaveLength(1);
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
    expect(tableRows(ctx, 'group')).toHaveLength(0);
  });

  // Review 2 IN-05: finished waits for someone nobody invites again are pruned by the sweep.
  it('the inactivity sweep deletes finished waits and keeps running ones', () => {
    const ctx = newCtx();
    call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' });
    call(ctx, 'reject_group_invite', 2n, { fromName: 'Ann' }, T0 + 1n);
    call(ctx, 'invite_to_group', 3n, { targetName: 'Dena' }, T0 + 10n);
    call(ctx, 'reject_group_invite', 4n, { fromName: 'Cole' }, T0 + WAIT);
    expect(tableRows(ctx, 'group_invite_cooldown')).toHaveLength(2);
    const sweep = handler('sweep_inactivity');
    sweep({ ...ctx, sender: MODULE, timestamp: at(T0 + 1n + WAIT) }, { arg: { scheduledId: 1n } });
    expect(tableRows(ctx, 'group_invite_cooldown').map((r) => [r.fromCharacterId, r.toCharacterId])).toEqual([[3n, 4n]]);
  });

  it('the wait is per inviter: someone else may invite Bram straight away', () => {
    const { ctx } = invitedThen('decline');
    call(ctx, 'invite_to_group', 3n, { targetName: 'Bram' }, T0 + 2n);
    expect(lines(ctx, 3n)).toEqual(['You invited Bram.']);
    expect(tableRows(ctx, 'group_invite').map((i) => i.fromCharacterId)).toEqual([3n]);
  });

  it('an expired invite starts no wait', () => {
    const { ctx } = invitedThen('expire');
    call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' }, T0 + TTL + 1n);
    expect(lines(ctx, 1n).slice(-1)).toEqual(['You invited Bram.']);
    expect(tableRows(ctx, 'group_invite_cooldown')).toHaveLength(0);
  });

  for (const end of ['decline', 'cancel', 'accept'] as const) {
    it(`an invite ended by ${end} leaves no expiry tick behind`, () => {
      const { ctx } = invitedThen(end);
      expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
      expect(tableRows(ctx, 'group_invite_expiry_tick')).toHaveLength(0);
    });
  }

  it('an invite ended lazily as expired by another reducer deletes its tick', () => {
    const ctx = newCtx();
    call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' });
    call(ctx, 'accept_group_invite', 2n, { fromName: 'Ann' }, T0 + TTL);
    expect(lines(ctx, 2n)).toContain('That invite has expired.');
    expect(tableRows(ctx, 'group_invite_expiry_tick')).toHaveLength(0);
  });

  it('the running expiry tick is left for the platform to delete', () => {
    const { ctx, tick } = invitedThen('expire');
    expect(tableRows(ctx, 'group_invite_expiry_tick').map((t) => t.scheduledId)).toEqual([tick.scheduledId]);
  });

  it('a decline/re-invite loop of ten rounds sends Bram one invite line and leaves no ticks', () => {
    const ctx = newCtx();
    for (let i = 0n; i < 10n; i++) {
      call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' }, T0 + i * 10n);
      call(ctx, 'reject_group_invite', 2n, { fromName: 'Ann' }, T0 + i * 10n + 1n);
    }
    expect(lines(ctx, 2n).filter((l) => l.startsWith('Ann invited you'))).toHaveLength(1);
    expect(tableRows(ctx, 'group_invite_expiry_tick')).toHaveLength(0);
    expect(tableRows(ctx, 'group_invite_cooldown')).toHaveLength(1);
  });
});

describe('one successor rule for leave, camp and delete; online members first (code review WR-04)', () => {
  /**
   * Ann (1) leads and pulls group 5. Bram (2) joined first, Cole (3) second, Dena (4) third.
   * `offline` lists who is offline.
   */
  const four = (offline: bigint[]): Seed => ({
    chars: {
      1: { groupId: 5n },
      2: { groupId: 5n, online: !offline.includes(2n) },
      3: { groupId: 5n, online: !offline.includes(3n) },
      4: { groupId: 5n, online: !offline.includes(4n) },
    },
    groups: [{ id: 5n, leader: 1n }],
    members: [
      { id: 1n, groupId: 5n, characterId: 1n, role: 'leader', joinedAt: T0 },
      { id: 2n, groupId: 5n, characterId: 2n, joinedAt: T0 + 1n },
      { id: 3n, groupId: 5n, characterId: 3n, joinedAt: T0 + 2n },
      { id: 4n, groupId: 5n, characterId: 4n, joinedAt: T0 + 3n },
    ],
  });
  const leader = (ctx: any) => tableRows(ctx, 'group')[0];

  const PATHS = [
    ['leave_group', (ctx: any) => call(ctx, 'leave_group', 1n, {})],
    ['camp (clear_active_character)', (ctx: any) => call(ctx, 'clear_active_character', 1n, {})],
    ['delete_character', (ctx: any) => call(ctx, 'delete_character', 1n, {})],
  ] as const;

  for (const [label, leave] of PATHS) {
    it(`${label}: an offline earliest joiner is passed over for the next online member`, () => {
      const ctx = newCtx(four([2n]));
      leave(ctx);
      expect(leader(ctx).leaderCharacterId).toBe(3n);
      expect(leader(ctx).pullerCharacterId).toBe(3n);
      expect(membersOf(ctx, 5n).find((m) => m.characterId === 3n).role).toBe('leader');
      expect(tableRows(ctx, 'event_group').map((e) => e.message)).toContain('Cole is now the group leader.');
    });

    it(`${label}: with everyone online the earliest joiner leads`, () => {
      const ctx = newCtx(four([]));
      leave(ctx);
      expect(leader(ctx).leaderCharacterId).toBe(2n);
      expect(leader(ctx).pullerCharacterId).toBe(2n);
    });

    it(`${label}: with everyone else offline the earliest joiner still leads`, () => {
      const ctx = newCtx(four([2n, 3n, 4n]));
      leave(ctx);
      expect(leader(ctx).leaderCharacterId).toBe(2n);
    });
  }
});

describe('a group left with one member dissolves; invites end with a line (code review WR-05, client review WR-02)', () => {
  /** Ann (1) leads group 5 with Bram (2); optional invites of group 5. */
  const pair = (invites: Seed['invites'] = []): Seed => ({
    chars: { 1: { groupId: 5n }, 2: { groupId: 5n } },
    groups: [{ id: 5n, leader: 1n }],
    members: [
      { id: 1n, groupId: 5n, characterId: 1n, role: 'leader', joinedAt: T0 - 5n },
      { id: 2n, groupId: 5n, characterId: 2n, joinedAt: T0 - 4n },
    ],
    invites,
  });
  const solo = (ctx: any, id: bigint) => {
    expect(char(ctx, id).groupId).toBeUndefined();
    expect(tableRows(ctx, 'group_member').filter((m) => m.characterId === id)).toHaveLength(0);
  };

  const DEPARTURES = [
    ['leave_group (member leaves)', (ctx: any) => call(ctx, 'leave_group', 2n, {}), 1n, 'Bram left the group.'],
    ['leave_group (leader leaves)', (ctx: any) => call(ctx, 'leave_group', 1n, {}), 2n, 'Ann left the group.'],
    ['kick_group_member', (ctx: any) => call(ctx, 'kick_group_member', 1n, { targetName: 'Bram' }), 1n, 'Bram was removed from the group.'],
    ['camp (clear_active_character)', (ctx: any) => call(ctx, 'clear_active_character', 2n, {}), 1n, 'Bram headed to camp.'],
    ['delete_character', (ctx: any) => call(ctx, 'delete_character', 2n, {}), 1n, 'Bram was removed from the group.'],
  ] as const;

  for (const [label, depart, stayer, departure] of DEPARTURES) {
    it(`${label}: the one member left becomes solo and is told`, () => {
      const ctx = newCtx(pair());
      depart(ctx);
      expect(tableRows(ctx, 'group')).toHaveLength(0);
      expect(tableRows(ctx, 'group_member')).toHaveLength(0);
      solo(ctx, stayer);
      expect(lines(ctx, stayer).slice(-1)).toEqual([`${departure} The group has disbanded.`]);
      expect(tableRows(ctx, 'event_group').map((e) => e.message)).not.toContain(
        `${NAMES[Number(stayer) - 1]} is now the group leader.`,
      );
    });

    it(`${label}: a group with a live invite stays; its last member leads it`, () => {
      const ctx = newCtx(pair([{ id: 1n, groupId: 5n, from: 1n, to: 3n }]));
      depart(ctx);
      const group = tableRows(ctx, 'group')[0];
      expect(group.leaderCharacterId).toBe(stayer);
      expect(membersOf(ctx, 5n).map((m) => m.characterId)).toEqual([stayer]);
      expect(char(ctx, stayer).groupId).toBe(5n);
      expect(tableRows(ctx, 'group_invite').map((i) => i.toCharacterId)).toEqual([3n]);
    });
  }

  // Review 2 WR-05: a group kept alive by a live invite later dissolves; its last member is told.
  describe('a group kept alive by an invite: its last member is told when it dissolves', () => {
    /** Ann (leader) invited Cole, then left; Bram leads group 5 alone with that live invite. */
    function keptAlive() {
      const ctx = newCtx(pair([{ id: 1n, groupId: 5n, from: 1n, to: 3n }]));
      call(ctx, 'leave_group', 1n, {});
      expect(tableRows(ctx, 'group')).toHaveLength(1);
      return ctx;
    }

    it('Cole declines: Bram is told and becomes solo; Ann gets the usual declined line', () => {
      const ctx = keptAlive();
      call(ctx, 'reject_group_invite', 3n, { fromName: 'Ann' }, T0 + 1n);
      expect(tableRows(ctx, 'group')).toHaveLength(0);
      solo(ctx, 2n);
      expect(lines(ctx, 2n).slice(-1)).toEqual(['Cole declined the invite. The group has disbanded.']);
      expect(lines(ctx, 1n).slice(-1)).toEqual(['Cole declined your group invite.']);
    });

    it('the invite expires: Bram is told', () => {
      const ctx = keptAlive();
      // The seeded invite has no tick row; the module runs one for it.
      expire(ctx, { scheduledId: 99n, inviteId: 1n }, T0 + TTL);
      expect(tableRows(ctx, 'group')).toHaveLength(0);
      solo(ctx, 2n);
      expect(lines(ctx, 2n).slice(-1)).toEqual(['The invite to Cole expired. The group has disbanded.']);
      expect(lines(ctx, 1n).slice(-1)).toEqual(['Your invite to Cole expired.']);
    });

    it('Bram cancels: his own cancel line says the group disbanded', () => {
      const ctx = keptAlive();
      call(ctx, 'cancel_group_invite', 2n, { targetName: 'Cole' }, T0 + 1n);
      expect(tableRows(ctx, 'group')).toHaveLength(0);
      solo(ctx, 2n);
      expect(lines(ctx, 2n).slice(-1)).toEqual(['You cancelled the invite to Cole. The group has disbanded.']);
      expect(lines(ctx, 3n).slice(-1)).toEqual(['Bram cancelled the invite.']);
    });

    it('a solo inviter\'s own lone group still dissolves without the extra line', () => {
      const ctx = newCtx();
      call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' });
      call(ctx, 'reject_group_invite', 2n, { fromName: 'Ann' }, T0 + 1n);
      expect(lines(ctx, 1n)).toEqual(['You invited Bram.', 'Bram declined your group invite.']);
    });
  });

  it('an expired invite does not keep the group: it ends with its lines, then the group dissolves', () => {
    const ctx = newCtx(pair([{ id: 1n, groupId: 5n, from: 1n, to: 3n, createdAt: T0 - TTL }]));
    call(ctx, 'leave_group', 2n, {});
    expect(tableRows(ctx, 'group')).toHaveLength(0);
    expect(lines(ctx, 3n)).toEqual(['The invite from Ann expired.']);
    expect(lines(ctx, 1n)).toEqual(['Your invite to Cole expired.', 'Bram left the group. The group has disbanded.']);
    solo(ctx, 1n);
  });

  it('dissolving during a group fight leaves the fight alone', () => {
    const seed = pair();
    const ctx = newCtx(seed);
    ctx.db._tables.combat_encounter = [
      { id: 9n, locationId: 10n, groupId: 5n, leaderCharacterId: 1n, state: 'active', addCount: 0n, pendingAddCount: 0n, createdAt: at(T0) },
    ];
    ctx.db._tables.combat_participant = [
      { id: 1n, combatId: 9n, characterId: 1n, status: 'active', nextAutoAttackAt: 0n },
      { id: 2n, combatId: 9n, characterId: 2n, status: 'active', nextAutoAttackAt: 0n },
    ];
    call(ctx, 'leave_group', 2n, {});
    solo(ctx, 1n);
    expect(tableRows(ctx, 'combat_encounter')[0]).toMatchObject({ id: 9n, state: 'active' });
    expect(tableRows(ctx, 'combat_participant')).toHaveLength(2);
  });

  it('the last member leaving withdraws every invite and tells each target', () => {
    const ctx = newCtx(withInvites(annAlone, [
      { id: 1n, groupId: 5n, from: 1n, to: 2n },
      { id: 2n, groupId: 5n, from: 1n, to: 3n },
    ]));
    call(ctx, 'leave_group', 1n, {});
    expect(tableRows(ctx, 'group')).toHaveLength(0);
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
    expect(tableRows(ctx, 'group_invite_expiry_tick')).toHaveLength(0);
    expect(lines(ctx, 2n)).toEqual(['The invite from Ann is no longer open.']);
    expect(lines(ctx, 3n)).toEqual(['The invite from Ann is no longer open.']);
  });

  it('camping as the last member withdraws the invites the same way', () => {
    const ctx = newCtx(withInvites(annAlone, [{ id: 1n, groupId: 5n, from: 1n, to: 2n }]));
    call(ctx, 'clear_active_character', 1n, {});
    expect(tableRows(ctx, 'group')).toHaveLength(0);
    expect(lines(ctx, 2n)).toEqual(['The invite from Ann is no longer open.']);
  });

  it('deleting an invited character tells the solo inviter and dissolves the inviter\'s lone group', () => {
    const ctx = newCtx();
    call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' });
    call(ctx, 'delete_character', 2n, {});
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
    expect(tableRows(ctx, 'group_invite_expiry_tick')).toHaveLength(0);
    expect(lines(ctx, 1n)).toEqual(['You invited Bram.', 'Your invite to Bram is no longer open.']);
    expect(tableRows(ctx, 'group')).toHaveLength(0);
    solo(ctx, 1n);
  });

  it('deleting an inviter tells the target; the group left with one member dissolves once', () => {
    const ctx = newCtx({
      chars: { 1: { groupId: 5n }, 3: { groupId: 5n } },
      groups: [{ id: 5n, leader: 1n }],
      members: [
        { id: 1n, groupId: 5n, characterId: 1n, role: 'leader' },
        { id: 2n, groupId: 5n, characterId: 3n },
      ],
      invites: [{ id: 1n, groupId: 5n, from: 1n, to: 2n }],
    });
    call(ctx, 'delete_character', 1n, {});
    expect(lines(ctx, 2n)).toEqual(['The invite from Ann is no longer open.']);
    expect(tableRows(ctx, 'group')).toHaveLength(0);
    solo(ctx, 3n);
    expect(lines(ctx, 3n)).toEqual(['Ann was removed from the group. The group has disbanded.']);
  });
});

describe('declining an expired invite (code review IN-01)', () => {
  it('ends it as expired: both get the expiry lines, no declined line, no re-invite wait', () => {
    const ctx = newCtx(withInvites(annAlone, [{ id: 1n, groupId: 5n, from: 1n, to: 2n }]));
    call(ctx, 'reject_group_invite', 2n, { fromName: 'Ann' }, T0 + TTL);
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
    expect(lines(ctx, 1n)).toEqual(['Your invite to Bram expired.']);
    expect(lines(ctx, 2n)).toEqual(['The invite from Ann expired.']);
    expect(tableRows(ctx, 'group_invite_cooldown')).toHaveLength(0);
    expect(tableRows(ctx, 'group')).toHaveLength(0);
  });
});

describe("party actions need the caller's online character (code review IN-06)", () => {
  it('an offline inviter is refused and nothing is created', () => {
    const ctx = newCtx({ chars: { 1: { online: false } } });
    call(ctx, 'invite_to_group', 1n, { targetName: 'Bram' });
    expect(lines(ctx, 1n)).toEqual(['Ann is offline.']);
    expect(tableRows(ctx, 'group')).toHaveLength(0);
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
    expect(lines(ctx, 2n)).toEqual([]);
  });

  it('an offline invitee cannot accept or join; the invite stays', () => {
    const ctx = newCtx({ ...withInvites(annAlone, [{ id: 1n, groupId: 5n, from: 1n, to: 2n }]), chars: { 1: { groupId: 5n }, 2: { online: false } } });
    call(ctx, 'accept_group_invite', 2n, { fromName: 'Ann' });
    call(ctx, 'join_group', 2n, { groupId: 5n });
    expect(lines(ctx, 2n)).toEqual(['Bram is offline.', 'Bram is offline.']);
    expect(char(ctx, 2n).groupId).toBeUndefined();
    expect(tableRows(ctx, 'group_invite')).toHaveLength(1);
  });

  it('an offline leader cannot cancel; declining from an offline character still works', () => {
    const ctx = newCtx({ ...withInvites(annAlone, [{ id: 1n, groupId: 5n, from: 1n, to: 2n }]), chars: { 1: { groupId: 5n, online: false }, 2: { online: false } } });
    call(ctx, 'cancel_group_invite', 1n, { targetName: 'Bram' });
    expect(lines(ctx, 1n)).toEqual(['Ann is offline.']);
    expect(tableRows(ctx, 'group_invite')).toHaveLength(1);
    call(ctx, 'reject_group_invite', 2n, { fromName: 'Ann' });
    expect(tableRows(ctx, 'group_invite')).toHaveLength(0);
  });
});
