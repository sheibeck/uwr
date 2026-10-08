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
