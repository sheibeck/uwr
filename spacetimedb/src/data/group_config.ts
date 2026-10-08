// Party rules shared by the server (the groups reducers, travel) and the client
// (@game-data/group_config), so the two can never disagree. This file imports nothing so the
// browser can import it.
//
// The follow rule is the owner's decision after research: offline members are left behind. A
// follower comes along only while following, online, and standing at the leader's place.
// An invite is expired from exactly createdAt + GROUP_INVITE_TTL_MICROS (one microsecond before,
// it is still live).

/** Most characters one group can hold, the leader included. */
export const MAX_GROUP_SIZE = 5;

/** How long a party invite stays open: 5 minutes in microseconds. */
export const GROUP_INVITE_TTL_MICROS = 300_000_000n;

/** The moment an invite created at createdAtMicros expires. */
export function inviteExpiresAtMicros(createdAtMicros: bigint): bigint {
  return createdAtMicros + GROUP_INVITE_TTL_MICROS;
}

/** True from exactly createdAt + TTL onwards. */
export function isInviteExpired(createdAtMicros: bigint, nowMicros: bigint): boolean {
  return nowMicros >= inviteExpiresAtMicros(createdAtMicros);
}

/** Whether a group member travels with the leader: following, online, and at the leader's place. */
export function comesAlongWithLeader(input: {
  followLeader: boolean;
  online: boolean;
  atLeaderPlace: boolean;
}): boolean {
  return input.followLeader && input.online && input.atLeaderPlace;
}

/**
 * Invite spam guard (code review WR-02): after a character's invite to someone is declined or
 * cancelled, that character cannot invite the same person again for 30 seconds (microseconds).
 * An accepted or expired invite starts no wait.
 */
export const GROUP_REINVITE_COOLDOWN_MICROS = 30_000_000n;

/** True while a re-invite wait that ends at untilMicros is still running at nowMicros. */
export function reinviteWaitRunning(untilMicros: bigint, nowMicros: bigint): boolean {
  return nowMicros < untilMicros;
}

/**
 * What happens to a group once a member leaves, camps, is removed or is deleted (code review WR-05;
 * review 2 WR-02). `remaining` counts the members left after that member goes, `liveInvites` the
 * group's live (not expired) invites:
 * - 'empty': nobody is left; the group and its invites end;
 * - 'disbands': one member is left and no live invite keeps the group, so it dissolves;
 * - 'stays': the group goes on (a new leader takes over if the leaver led).
 * The server settles the group with it and the client's Leave prompt reads it, so the prompt never
 * names a successor for a group that is about to dissolve.
 */
export type LeaveOutcome = 'empty' | 'disbands' | 'stays';

export function leaveOutcome(input: { remaining: number; liveInvites: number }): LeaveOutcome {
  if (input.remaining <= 0) return 'empty';
  if (input.remaining === 1 && input.liveInvites === 0) return 'disbands';
  return 'stays';
}

/** One remaining member as the successor rule sees it. */
export type SuccessorCandidate = { online: boolean; joinedAtMicros: bigint; memberId: bigint };

/**
 * Who leads after the leader leaves, camps or is deleted (code review WR-04): an online member
 * before an offline one, then the earliest joinedAt, then the lowest group_member id. Sort the
 * remaining members with it and take the first. The client's "Leadership passes to {name}." prompt
 * should use the same order.
 */
export function successorOrder(a: SuccessorCandidate, b: SuccessorCandidate): number {
  if (a.online !== b.online) return a.online ? -1 : 1;
  if (a.joinedAtMicros !== b.joinedAtMicros) return a.joinedAtMicros < b.joinedAtMicros ? -1 : 1;
  if (a.memberId !== b.memberId) return a.memberId < b.memberId ? -1 : 1;
  return 0;
}
