import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  NOT_CONNECTED_HINT,
  nextLeaderName,
  playerMenuEntries,
  playerMenuHeader,
  type MenuAction,
  type MenuGroup,
  type MenuPerson,
  type PlayerMenuInput,
} from './playerMenu';

const HERE = 10n;

function person(id: bigint, name: string, over: Partial<MenuPerson> = {}): MenuPerson {
  return {
    id,
    name,
    level: 5n,
    race: 'Orc',
    className: 'Shaman',
    locationId: HERE,
    online: true,
    groupId: null,
    ...over,
  };
}

const ME = 1n;
const BRAM = 2n;

function input(over: Partial<PlayerMenuInput> = {}): PlayerMenuInput {
  return {
    self: person(ME, 'Ann'),
    target: person(BRAM, 'Bram'),
    group: null,
    memberCount: 1,
    liveOutgoing: [],
    selfFollowLeader: null,
    nextLeaderName: null,
    ...over,
  };
}

// Party of 3 (Ann + 2 more); target Bram is a member of it.
function inParty(lead: boolean, over: Partial<PlayerMenuInput> = {}): PlayerMenuInput {
  const group = { id: 7n, leaderCharacterId: lead ? ME : 99n };
  return input({
    self: person(ME, 'Ann', { groupId: 7n }),
    target: person(BRAM, 'Bram', { groupId: 7n }),
    group,
    memberCount: 3,
    ...over,
  });
}

function keys(groups: MenuGroup[]): string[] {
  return groups.map((g) => g.key);
}
function labels(groups: MenuGroup[]): string[][] {
  return groups.map((g) => g.entries.map((e) => e.label));
}
function entry(groups: MenuGroup[], action: MenuAction) {
  const found = groups.flatMap((g) => g.entries).find((e) => e.action === action);
  if (!found) throw new Error(`no ${action} entry`);
  return found;
}

describe('yourself', () => {
  it('as the leader of a party: Leave party only, red, with the successor in the confirm', () => {
    const me = person(ME, 'Ann', { groupId: 7n });
    const groups = playerMenuEntries(
      input({
        self: me,
        target: me,
        group: { id: 7n, leaderCharacterId: ME },
        memberCount: 3,
        nextLeaderName: 'Bram',
      }),
    );
    expect(keys(groups)).toEqual(['party']);
    expect(labels(groups)).toEqual([['Leave party']]);
    const leave = entry(groups, 'leave');
    expect(leave.icon).toBe('signOut');
    expect(leave.tone).toBe('danger');
    expect(leave.disabled).toBe(false);
    expect(leave.confirm).toEqual({
      prompt: 'Leave the party? Leadership passes to Bram.',
      confirmLabel: 'Leave',
      keepLabel: 'Stay',
    });
  });

  it('as the leader with no known successor: the confirm has no leadership sentence', () => {
    const me = person(ME, 'Ann', { groupId: 7n });
    const groups = playerMenuEntries(
      input({ self: me, target: me, group: { id: 7n, leaderCharacterId: ME }, memberCount: 2 }),
    );
    expect(entry(groups, 'leave').confirm?.prompt).toBe('Leave the party?');
  });

  it('as a member: Travel with leader (or Stop) and Leave party, no leadership sentence', () => {
    const me = person(ME, 'Ann', { groupId: 7n });
    const base = { self: me, target: me, group: { id: 7n, leaderCharacterId: 99n }, memberCount: 3, nextLeaderName: 'Bram' };
    const following = playerMenuEntries(input({ ...base, selfFollowLeader: true }));
    expect(keys(following)).toEqual(['party']);
    expect(labels(following)).toEqual([['Stop travelling with leader', 'Leave party']]);
    expect(entry(following, 'stopTravelWithLeader').icon).toBe('footprints');
    expect(entry(following, 'leave').confirm?.prompt).toBe('Leave the party?');

    const notFollowing = playerMenuEntries(input({ ...base, selfFollowLeader: false }));
    expect(labels(notFollowing)).toEqual([['Travel with leader', 'Leave party']]);
    expect(entry(notFollowing, 'travelWithLeader').icon).toBe('footprints');

    // A member row that does not carry the flag reads as following (the server default).
    const unknown = playerMenuEntries(input({ ...base, selfFollowLeader: null }));
    expect(labels(unknown)).toEqual([['Stop travelling with leader', 'Leave party']]);
  });

  it('solo gets no entries, so no menu button is shown', () => {
    const me = person(ME, 'Ann');
    expect(playerMenuEntries(input({ self: me, target: me }))).toEqual([]);
    // A lone group (only you, perhaps with pending invites) is also solo.
    expect(
      playerMenuEntries(input({ self: me, target: me, group: { id: 7n, leaderCharacterId: ME }, memberCount: 1 })),
    ).toEqual([]);
  });
});

describe('a party member', () => {
  it('as the leader: social group then leader group, in order', () => {
    const groups = playerMenuEntries(inParty(true));
    expect(keys(groups)).toEqual(['social', 'leader']);
    expect(labels(groups)).toEqual([
      ['Whisper', 'Examine', 'Add friend'],
      ['Make party leader', 'Remove from party'],
    ]);
    const make = entry(groups, 'makeLeader');
    expect(make.tone).toBe('accent');
    expect(make.confirm).toBeNull();
    expect(make.icon).toBe('crownSimple');
    const remove = entry(groups, 'remove');
    expect(remove.tone).toBe('danger');
    expect(remove.icon).toBe('userMinus');
    expect(remove.confirm).toEqual({
      prompt: 'Remove Bram from the party?',
      confirmLabel: 'Remove',
      keepLabel: 'Keep Bram',
    });
  });

  it('as a member: only the social group', () => {
    const groups = playerMenuEntries(inParty(false));
    expect(keys(groups)).toEqual(['social']);
    expect(labels(groups)).toEqual([['Whisper', 'Examine', 'Add friend']]);
  });

  it('offline: Whisper and Examine are disabled with Offline, Add friend stays; leader entries remain', () => {
    const offline = person(BRAM, 'Bram', { groupId: 7n, online: false });
    const groups = playerMenuEntries({ ...inParty(true), target: offline });
    expect(entry(groups, 'whisper')).toMatchObject({ disabled: true, hint: 'Offline' });
    expect(entry(groups, 'examine')).toMatchObject({ disabled: true, hint: 'Offline' });
    expect(entry(groups, 'addFriend')).toMatchObject({ disabled: false, hint: null });
    expect(keys(groups)).toEqual(['social', 'leader']);
  });

  it('an unknown member (no character row) gets no menu', () => {
    expect(playerMenuEntries({ ...inParty(true), target: null })).toEqual([]);
  });
});

describe('a player outside the party', () => {
  it('solo inviter: Invite to party (accent) then the social entries', () => {
    const groups = playerMenuEntries(input());
    expect(keys(groups)).toEqual(['party', 'social']);
    expect(labels(groups)).toEqual([['Invite to party'], ['Whisper', 'Examine', 'Add friend']]);
    const invite = entry(groups, 'invite');
    expect(invite).toMatchObject({ icon: 'userPlus', tone: 'accent', disabled: false, hint: null, confirm: null });
  });

  it('leader with room: Invite enabled', () => {
    const groups = playerMenuEntries(inParty(true, { target: person(BRAM, 'Bram') }));
    expect(entry(groups, 'invite').disabled).toBe(false);
  });

  it('leader with a pending invite: Cancel invite with the Pending hint', () => {
    const groups = playerMenuEntries(
      inParty(true, {
        target: person(BRAM, 'Bram'),
        liveOutgoing: [{ toCharacterId: BRAM, fromCharacterId: ME }],
      }),
    );
    expect(labels(groups)[0]).toEqual(['Cancel invite']);
    expect(entry(groups, 'cancelInvite')).toMatchObject({
      icon: 'xCircle',
      disabled: false,
      hint: 'Pending',
      confirm: null,
    });
    expect(groups.flatMap((g) => g.entries).some((e) => e.action === 'invite')).toBe(false);
  });

  it('member who sent the invite (even after a leader change) can cancel it', () => {
    const groups = playerMenuEntries(
      inParty(false, {
        target: person(BRAM, 'Bram'),
        liveOutgoing: [{ toCharacterId: BRAM, fromCharacterId: ME }],
      }),
    );
    expect(entry(groups, 'cancelInvite').hint).toBe('Pending');
  });

  it('member who did not send the invite sees Invite disabled with Leader invites', () => {
    const groups = playerMenuEntries(
      inParty(false, {
        target: person(BRAM, 'Bram'),
        liveOutgoing: [{ toCharacterId: BRAM, fromCharacterId: 99n }],
      }),
    );
    expect(entry(groups, 'invite')).toMatchObject({ disabled: true, hint: 'Leader invites' });
    expect(groups.flatMap((g) => g.entries).some((e) => e.action === 'cancelInvite')).toBe(false);
  });

  it('member, no invite: Invite disabled with Leader invites', () => {
    const groups = playerMenuEntries(inParty(false, { target: person(BRAM, 'Bram') }));
    expect(entry(groups, 'invite')).toMatchObject({ disabled: true, hint: 'Leader invites' });
  });

  it('leader with a full party: Invite disabled with Party full', () => {
    const groups = playerMenuEntries(inParty(true, { target: person(BRAM, 'Bram'), memberCount: 5 }));
    expect(entry(groups, 'invite')).toMatchObject({ disabled: true, hint: 'Party full' });
  });

  it('Party full counts live invites: 3 members + 2 live invites with max 5', () => {
    const groups = playerMenuEntries(
      inParty(true, {
        target: person(BRAM, 'Bram'),
        memberCount: 3,
        liveOutgoing: [
          { toCharacterId: 50n, fromCharacterId: ME },
          { toCharacterId: 51n, fromCharacterId: ME },
        ],
      }),
    );
    expect(entry(groups, 'invite')).toMatchObject({ disabled: true, hint: 'Party full' });
  });

  it('3 members + 1 live invite still has room', () => {
    const groups = playerMenuEntries(
      inParty(true, {
        target: person(BRAM, 'Bram'),
        memberCount: 3,
        liveOutgoing: [{ toCharacterId: 50n, fromCharacterId: ME }],
      }),
    );
    expect(entry(groups, 'invite').disabled).toBe(false);
  });

  it('maxGroupSize overrides the shared default', () => {
    const groups = playerMenuEntries(inParty(true, { target: person(BRAM, 'Bram'), memberCount: 3, maxGroupSize: 3 }));
    expect(entry(groups, 'invite')).toMatchObject({ disabled: true, hint: 'Party full' });
  });

  it('offline target: Invite disabled with Offline', () => {
    const groups = playerMenuEntries(input({ target: person(BRAM, 'Bram', { online: false }) }));
    expect(entry(groups, 'invite')).toMatchObject({ disabled: true, hint: 'Offline' });
  });

  it('a player in another party: Invite disabled with In another party', () => {
    const groups = playerMenuEntries(input({ target: person(BRAM, 'Bram', { groupId: 44n }) }));
    expect(entry(groups, 'invite')).toMatchObject({ disabled: true, hint: 'In another party' });
    expect(keys(groups)).toEqual(['party', 'social']);
  });

  it('hint precedence: another party beats leader-invites beats party-full beats offline', () => {
    const memberFullOffline = inParty(false, {
      target: person(BRAM, 'Bram', { online: false }),
      memberCount: 5,
    });
    expect(entry(playerMenuEntries(memberFullOffline), 'invite').hint).toBe('Leader invites');
    expect(
      entry(playerMenuEntries({ ...memberFullOffline, target: person(BRAM, 'Bram', { online: false, groupId: 44n }) }), 'invite').hint,
    ).toBe('In another party');
    const leaderFullOffline = inParty(true, { target: person(BRAM, 'Bram', { online: false }), memberCount: 5 });
    expect(entry(playerMenuEntries(leaderFullOffline), 'invite').hint).toBe('Party full');
    expect(
      entry(playerMenuEntries({ ...leaderFullOffline, memberCount: 3 }), 'invite').hint,
    ).toBe('Offline');
  });
});

describe('Examine', () => {
  it('is Offline when the target is offline, even when elsewhere', () => {
    const groups = playerMenuEntries(input({ target: person(BRAM, 'Bram', { online: false, locationId: 99n }) }));
    expect(entry(groups, 'examine')).toMatchObject({ disabled: true, hint: 'Offline' });
    expect(entry(groups, 'whisper')).toMatchObject({ disabled: true, hint: 'Offline' });
  });

  it('is Not here when online elsewhere; Whisper stays enabled', () => {
    const groups = playerMenuEntries(input({ target: person(BRAM, 'Bram', { locationId: 99n }) }));
    expect(entry(groups, 'examine')).toMatchObject({ disabled: true, hint: 'Not here' });
    expect(entry(groups, 'whisper')).toMatchObject({ disabled: false, hint: null });
  });

  it('is enabled when online at your place', () => {
    const groups = playerMenuEntries(input());
    expect(entry(groups, 'examine')).toMatchObject({ disabled: false, hint: null });
  });
});

describe('icons and labels across every case', () => {
  const me = person(ME, 'Ann', { groupId: 7n });
  const cases: PlayerMenuInput[] = [
    input(),
    input({ target: person(BRAM, 'Bram', { online: false }) }),
    input({ target: person(BRAM, 'Bram', { groupId: 44n }) }),
    inParty(true),
    inParty(false),
    inParty(true, { target: person(BRAM, 'Bram'), liveOutgoing: [{ toCharacterId: BRAM, fromCharacterId: ME }] }),
    inParty(false, { target: person(BRAM, 'Bram') }),
    inParty(true, { target: person(BRAM, 'Bram'), memberCount: 5 }),
    input({ self: me, target: me, group: { id: 7n, leaderCharacterId: ME }, memberCount: 3 }),
    input({ self: me, target: me, group: { id: 7n, leaderCharacterId: 99n }, memberCount: 3, selfFollowLeader: false }),
  ];

  it('maps one action to one icon and one icon to one action', () => {
    const iconOf = new Map<string, string>();
    const actionOf = new Map<string, string>();
    for (const c of cases) {
      for (const group of playerMenuEntries(c)) {
        for (const e of group.entries) {
          expect(iconOf.get(e.action) ?? e.icon).toBe(e.icon);
          iconOf.set(e.action, e.icon);
          if (e.action !== 'travelWithLeader' && e.action !== 'stopTravelWithLeader') {
            expect(actionOf.get(e.icon) ?? e.action).toBe(e.action);
            actionOf.set(e.icon, e.action);
          }
        }
      }
    }
    // The owner's three icons.
    expect(iconOf.get('whisper')).toBe('chatCircleDots');
    expect(iconOf.get('addFriend')).toBe('heart');
    expect(iconOf.get('invite')).toBe('userPlus');
    expect(iconOf.get('cancelInvite')).toBe('xCircle');
    expect(iconOf.get('examine')).toBe('eye');
    expect(iconOf.get('makeLeader')).toBe('crownSimple');
    expect(iconOf.get('remove')).toBe('userMinus');
    expect(iconOf.get('leave')).toBe('signOut');
  });

  it('has one to five entries in up to three groups, never an empty group, never a banned label', () => {
    const banned = ['Trade', 'Vote to kick', 'Remove friend', 'Requested'];
    for (const c of cases) {
      const groups = playerMenuEntries(c);
      expect(groups.length).toBeGreaterThan(0);
      expect(groups.length).toBeLessThanOrEqual(3);
      const total = groups.reduce((n, g) => n + g.entries.length, 0);
      expect(total).toBeGreaterThanOrEqual(1);
      expect(total).toBeLessThanOrEqual(5);
      for (const g of groups) {
        expect(g.entries.length).toBeGreaterThan(0);
        for (const e of g.entries) {
          expect(banned).not.toContain(e.label);
          // A disabled entry always keeps its reason.
          if (e.disabled) expect(e.hint).not.toBeNull();
        }
      }
    }
  });
});

describe('playerMenuHeader', () => {
  it('gives name, level, race, class, party and offline parts', () => {
    const offline = person(BRAM, 'Bram', { groupId: 7n, online: false });
    expect(playerMenuHeader({ ...inParty(true), target: offline })).toEqual({
      name: 'Bram',
      you: false,
      line: 'Lv 5 Orc Shaman · in your party · offline',
    });
  });

  it('online party member: only the party suffix; outsider: none', () => {
    expect(playerMenuHeader(inParty(true)).line).toBe('Lv 5 Orc Shaman · in your party');
    expect(playerMenuHeader(input()).line).toBe('Lv 5 Orc Shaman');
    expect(playerMenuHeader(input({ target: person(BRAM, 'Bram', { online: false }) })).line).toBe(
      'Lv 5 Orc Shaman · offline',
    );
  });

  it('omits an empty race or class without double spaces', () => {
    expect(playerMenuHeader(input({ target: person(BRAM, 'Bram', { race: '' }) })).line).toBe('Lv 5 Shaman');
    expect(playerMenuHeader(input({ target: person(BRAM, 'Bram', { className: '  ' }) })).line).toBe('Lv 5 Orc');
    expect(playerMenuHeader(input({ target: person(BRAM, 'Bram', { race: '', className: '' }) })).line).toBe('Lv 5');
  });

  it('with nothing known but an offline flag, the line is just that part', () => {
    const t = person(BRAM, 'Bram', { level: 0n, race: '', className: '', online: false });
    expect(playerMenuHeader(input({ target: t })).line).toBe('offline');
  });

  it('flags the self menu with you true', () => {
    const me = person(ME, 'Ann', { groupId: 7n });
    const header = playerMenuHeader(input({ self: me, target: me, group: { id: 7n, leaderCharacterId: ME }, memberCount: 2 }));
    expect(header.you).toBe(true);
    expect(header.name).toBe('Ann');
    expect(header.line).toBe('Lv 5 Orc Shaman');
  });

  it('an unknown target gives an empty header', () => {
    expect(playerMenuHeader({ ...inParty(true), target: null })).toEqual({ name: '', you: false, line: '' });
  });
});

// Review client-rest WR-04: while the client is not connected nothing can be sent, so every entry
// is disabled with the reason; the entries stay readable.
describe('playerMenuEntries while not connected', () => {
  it('disables every entry with the Reconnecting… hint, in every group, the pending Cancel invite too', () => {
    const cases: PlayerMenuInput[] = [
      input({ connected: false }),
      inParty(true, { connected: false }),
      inParty(false, { connected: false, target: person(ME, 'Ann', { groupId: 7n }), selfFollowLeader: true }),
      input({ connected: false, liveOutgoing: [{ toCharacterId: BRAM, fromCharacterId: ME }] }),
    ];
    for (const value of cases) {
      const groups = playerMenuEntries(value);
      expect(groups.length).toBeGreaterThan(0);
      for (const entry of groups.flatMap((group) => group.entries)) {
        expect(entry.disabled, entry.action).toBe(true);
        expect(entry.hint, entry.action).toBe(NOT_CONNECTED_HINT);
      }
    }
    expect(NOT_CONNECTED_HINT).toBe('Reconnecting…');
  });

  it('keeps the same groups and entries as when connected', () => {
    const online = playerMenuEntries(inParty(true));
    const offline = playerMenuEntries(inParty(true, { connected: false }));
    expect(keys(offline)).toEqual(keys(online));
    expect(offline.flatMap((g) => g.entries.map((e) => e.action))).toEqual(
      online.flatMap((g) => g.entries.map((e) => e.action)),
    );
  });

  it('connected true or absent changes nothing', () => {
    expect(playerMenuEntries(input({ connected: true }))).toEqual(playerMenuEntries(input()));
  });
});

describe('nextLeaderName', () => {
  const at = (n: number) => ({ microsSinceUnixEpoch: BigInt(n) });
  const names: Record<string, string> = { '1': 'Ann', '2': 'Bram', '3': 'Cyd' };
  const nameOf = (id: bigint) => names[String(id)] ?? null;
  const allOnline = () => true;

  it('picks the earliest joinedAt, never the leaving character', () => {
    const members = [
      { id: 10n, characterId: 1n, joinedAt: at(100) },
      { id: 11n, characterId: 3n, joinedAt: at(300) },
      { id: 12n, characterId: 2n, joinedAt: at(200) },
    ];
    expect(nextLeaderName(members, 1n, nameOf, allOnline)).toBe('Bram');
    expect(nextLeaderName(members, 2n, nameOf, allOnline)).toBe('Ann');
  });

  it('breaks a joinedAt tie by the lowest member row id', () => {
    const members = [
      { id: 12n, characterId: 3n, joinedAt: at(200) },
      { id: 11n, characterId: 2n, joinedAt: at(200) },
      { id: 10n, characterId: 1n, joinedAt: at(100) },
    ];
    expect(nextLeaderName(members, 1n, nameOf, allOnline)).toBe('Bram');
  });

  it('is null when nobody remains or the name is unknown', () => {
    expect(nextLeaderName([{ id: 10n, characterId: 1n, joinedAt: at(1) }], 1n, nameOf, allOnline)).toBeNull();
    expect(nextLeaderName([], 1n, nameOf, allOnline)).toBeNull();
    expect(
      nextLeaderName(
        [
          { id: 10n, characterId: 1n, joinedAt: at(1) },
          { id: 11n, characterId: 9n, joinedAt: at(2) },
        ],
        1n,
        nameOf,
        allOnline,
      ),
    ).toBeNull();
  });

  // The server's successor rule (successorOrder, group_config): online members first.
  it('passes over an offline earlier joiner for an online member', () => {
    const members = [
      { id: 10n, characterId: 1n, joinedAt: at(100) },
      { id: 11n, characterId: 2n, joinedAt: at(200) },
      { id: 12n, characterId: 3n, joinedAt: at(300) },
    ];
    const online = (id: bigint) => id !== 2n;
    expect(nextLeaderName(members, 1n, nameOf, online)).toBe('Cyd');
  });

  it('falls back to the earliest joiner when every other member is offline', () => {
    const members = [
      { id: 10n, characterId: 1n, joinedAt: at(100) },
      { id: 12n, characterId: 3n, joinedAt: at(300) },
      { id: 11n, characterId: 2n, joinedAt: at(200) },
    ];
    expect(nextLeaderName(members, 1n, nameOf, () => false)).toBe('Bram');
  });

  it('uses successorOrder from @game-data, not a copy of the rule', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/social/playerMenu.ts'), 'utf8');
    expect(source).toContain('successorOrder');
    expect(source).toContain("successorOrder } from '@game-data/group_config'");
  });
});
