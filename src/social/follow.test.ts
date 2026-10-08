import { describe, expect, it } from 'vitest';
import {
  FOLLOW_TEXT,
  followPhrase,
  followState,
  joinNames,
  partyTravelView,
  type PartyTravelMember,
} from './follow';

describe('followState', () => {
  const base = { isLeader: false, followLeader: true, online: true, atLeaderPlace: true };

  it('is leader for the leader whatever the rest says', () => {
    expect(followState({ isLeader: true, followLeader: false, online: false, atLeaderPlace: false })).toBe('leader');
  });

  it('comes along only while following, online and at the leader place', () => {
    expect(followState(base)).toBe('comes_along');
  });

  it('is following_elsewhere when following but offline or elsewhere', () => {
    expect(followState({ ...base, online: false })).toBe('following_elsewhere');
    expect(followState({ ...base, atLeaderPlace: false })).toBe('following_elsewhere');
    expect(followState({ ...base, online: false, atLeaderPlace: false })).toBe('following_elsewhere');
  });

  it('is not_following when follow is off', () => {
    expect(followState({ ...base, followLeader: false })).toBe('not_following');
    expect(followState({ ...base, followLeader: false, online: false })).toBe('not_following');
  });

  it('reads an online value that is not exactly true as offline', () => {
    const input = { ...base, online: undefined as unknown as boolean };
    expect(followState(input)).toBe('following_elsewhere');
    expect(followState({ ...base, online: null as unknown as boolean })).toBe('following_elsewhere');
  });
});

describe('FOLLOW_TEXT and followPhrase', () => {
  it('carries the UI-SPEC titles', () => {
    expect(FOLLOW_TEXT.leader).toBe('Leader · others travel with them');
    expect(FOLLOW_TEXT.comes_along).toBe('Travels with the leader');
    expect(FOLLOW_TEXT.following_elsewhere).toBe("Follows the leader, but isn't with them");
    expect(FOLLOW_TEXT.not_following).toBe('Stays behind when the leader travels');
  });

  it('lower-cases the first letter for accessible names', () => {
    expect(followPhrase('comes_along')).toBe('travels with the leader');
    expect(followPhrase('leader')).toBe('leader · others travel with them');
    expect(followPhrase('not_following')).toBe('stays behind when the leader travels');
  });
});

describe('joinNames', () => {
  it('joins with commas and a final and', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A and B');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
    expect(joinNames(['A', 'B', 'C', 'D'])).toBe('A, B, C and D');
  });

  it('shortens to the first names and a count past the maximum', () => {
    expect(joinNames(['A', 'B', 'C'], 3)).toBe('A, B and C');
    expect(joinNames(['A', 'B', 'C', 'D'], 3)).toBe('A, B, C and 1 more');
    expect(joinNames(['A', 'B', 'C', 'D', 'E'], 3)).toBe('A, B, C and 2 more');
  });
});

describe('partyTravelView', () => {
  const m = (id: number, name: string, over: Partial<PartyTravelMember> = {}): PartyTravelMember => ({
    id: BigInt(id),
    name,
    known: true,
    isLeader: false,
    followLeader: true,
    online: true,
    locationId: 10n,
    lowStamina: false,
    ...over,
  });
  const lead = (over: Partial<PartyTravelMember> = {}) => m(1, 'You', { isLeader: true, ...over });
  const view = (members: PartyTravelMember[], selfId = 1, leaderId = 1, leaderName = 'You') =>
    partyTravelView({ selfId: BigInt(selfId), leaderId: BigInt(leaderId), leaderName, members });

  it('has no summary and no warning when you are alone', () => {
    const v = view([lead({ lowStamina: true })]);
    expect(v.summary).toBeNull();
    expect(v.warning).toBeNull();
    expect(v.states.get(1n)).toBe('leader');
  });

  it('counts who travels and names who stays behind (leader view)', () => {
    const v = view([
      lead(),
      m(2, 'Bo'),
      m(3, 'Cy', { online: false }),
      m(4, 'Dee', { followLeader: false }),
    ]);
    expect(v.summary).toBe('1 of 3 travel with you · Cy and Dee stay behind');
    expect([...v.states.entries()]).toEqual([
      [1n, 'leader'],
      [2n, 'comes_along'],
      [3n, 'following_elsewhere'],
      [4n, 'not_following'],
    ]);
  });

  it('uses the singular for one who stays behind', () => {
    const v = view([lead(), m(2, 'Bo', { followLeader: false })]);
    expect(v.summary).toBe('0 of 1 travel with you · Bo stays behind');
  });

  it('adds nothing after the count when everyone travels', () => {
    expect(view([lead(), m(2, 'Bo'), m(3, 'Cy')]).summary).toBe('2 of 2 travel with you');
  });

  it('shortens four names behind to three and a count', () => {
    const v = view([
      lead(),
      m(2, 'A', { followLeader: false }),
      m(3, 'B', { followLeader: false }),
      m(4, 'C', { followLeader: false }),
      m(5, 'D', { followLeader: false }),
    ]);
    expect(v.summary).toBe('0 of 4 travel with you · A, B, C and 1 more stay behind');
  });

  it('counts a member elsewhere as staying behind', () => {
    const v = view([lead(), m(2, 'Bo', { locationId: 11n })]);
    expect(v.summary).toBe('0 of 1 travel with you · Bo stays behind');
    expect(v.states.get(2n)).toBe('following_elsewhere');
  });

  it('reads the member view with the leader name', () => {
    const v = view(
      [m(9, 'Ann', { isLeader: true }), m(1, 'You'), m(3, 'Cy')],
      1,
      9,
      'Ann',
    );
    expect(v.summary).toBe('2 of 2 travel with Ann');
  });

  it('gives no summary and no warning while a member row is unknown', () => {
    const v = view([lead({ lowStamina: true }), m(2, 'Bo', { known: false, name: '' })]);
    expect(v.summary).toBeNull();
    expect(v.warning).toBeNull();
  });

  it('warns with no line when no traveller is short', () => {
    expect(view([lead(), m(2, 'Bo')]).warning).toBeNull();
  });

  it('warns about you when you lead and are short', () => {
    const v = view([lead({ lowStamina: true }), m(2, 'Bo', { lowStamina: true })]);
    expect(v.warning).toBe('You do not have enough stamina to travel.');
  });

  it('warns about you when you are a short member who comes along', () => {
    const v = view([m(9, 'Ann', { isLeader: true }), m(1, 'You', { lowStamina: true })], 1, 9, 'Ann');
    expect(v.warning).toBe('You do not have enough stamina to travel.');
  });

  it('names one other short traveller', () => {
    const v = view([lead(), m(2, 'Bo', { lowStamina: true }), m(3, 'Cy')]);
    expect(v.warning).toBe('Bo does not have enough stamina to travel.');
  });

  it('names two or more short travellers', () => {
    const two = view([lead(), m(2, 'Bo', { lowStamina: true }), m(3, 'Cy', { lowStamina: true })]);
    expect(two.warning).toBe('Bo and Cy do not have enough stamina to travel.');
    const three = view([
      lead(),
      m(2, 'Bo', { lowStamina: true }),
      m(3, 'Cy', { lowStamina: true }),
      m(4, 'Di', { lowStamina: true }),
    ]);
    expect(three.warning).toBe('Bo, Cy and Di do not have enough stamina to travel.');
  });

  it('names the leader when the leader is the short traveller and you are a member', () => {
    const v = view([m(9, 'Ann', { isLeader: true, lowStamina: true }), m(1, 'You')], 1, 9, 'Ann');
    expect(v.warning).toBe('Ann does not have enough stamina to travel.');
  });

  it('ignores a short member who does not travel', () => {
    const v = view([
      lead(),
      m(2, 'Bo', { lowStamina: true, followLeader: false }),
      m(3, 'Cy', { lowStamina: true, online: false }),
      m(4, 'Di', { lowStamina: true, locationId: 11n }),
    ]);
    expect(v.warning).toBeNull();
  });

  it('keeps names in the order the members arrive (equal join times ordered by id upstream)', () => {
    const v = view([lead(), m(5, 'Eve', { followLeader: false }), m(6, 'Fay', { followLeader: false })]);
    expect(v.summary).toBe('0 of 2 travel with you · Eve and Fay stay behind');
  });

  it('treats an unknown location as not at the leader place', () => {
    const v = view([lead(), m(2, 'Bo', { locationId: null })]);
    expect(v.states.get(2n)).toBe('following_elsewhere');
  });
});
