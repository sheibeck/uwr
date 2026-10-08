// Who travels with the leader (51.1-UI-SPEC "Travel with Leader").
//
// The one client rule mirrored from the server (helpers/travel.ts) and the Map (map/travelChecks.ts):
// a member comes along only while following, online and at the leader's place. All three call
// comesAlongWithLeader from @game-data/group_config, and the parity test
// (spacetimedb/src/reducers/follow_parity.integration.test.ts) pins them against the real server
// handler. Nothing here re-derives the rule.
//
// Pure: no Vue, no connection. The rail, combat cards and the sheet read the states, the summary
// and the stamina warning from partyTravelView.

import { comesAlongWithLeader } from '@game-data/group_config';

export type FollowState = 'leader' | 'comes_along' | 'following_elsewhere' | 'not_following';

/** The title text of each state (UI-SPEC "Travel with Leader"). */
export const FOLLOW_TEXT: Readonly<Record<FollowState, string>> = {
  leader: 'Leader · others travel with them',
  comes_along: 'Travels with the leader',
  following_elsewhere: "Follows the leader, but isn't with them",
  not_following: 'Stays behind when the leader travels',
};

/**
 * The state of one member. Anything but a literal true in `online` reads as offline, so a character
 * row without the field (or a null) is left behind exactly as the server leaves it.
 */
export function followState(input: {
  isLeader: boolean;
  followLeader: boolean;
  online: boolean;
  atLeaderPlace: boolean;
}): FollowState {
  if (input.isLeader) return 'leader';
  if (!input.followLeader) return 'not_following';
  const online = input.online === true;
  const comes = comesAlongWithLeader({
    followLeader: input.followLeader,
    online,
    atLeaderPlace: input.atLeaderPlace,
  });
  return comes ? 'comes_along' : 'following_elsewhere';
}

/** FOLLOW_TEXT with a lower-case first letter, for accessible names. */
export function followPhrase(state: FollowState): string {
  const text = FOLLOW_TEXT[state];
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** 'A', 'A and B', 'A, B and C'; past `max` names, 'A, B, C and 2 more'. No limit without `max`. */
export function joinNames(names: readonly string[], max?: number): string {
  let shown = names.slice();
  let more = 0;
  if (max !== undefined && names.length > max) {
    shown = names.slice(0, max);
    more = names.length - max;
  }
  if (more > 0) return `${shown.join(', ')} and ${more} more`;
  if (shown.length <= 1) return shown.join('');
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

export interface PartyTravelMember {
  id: bigint;
  name: string;
  /** The member's character row is readable. */
  known: boolean;
  isLeader: boolean;
  followLeader: boolean;
  online: boolean;
  locationId: bigint | null;
  /** Stamina below the within-region cost (lowStaminaFor / PartyMemberView.lowStamina). */
  lowStamina: boolean;
}

export interface PartyTravelView {
  /** Every member's state, in the order the members arrived. */
  states: ReadonlyMap<bigint, FollowState>;
  /** '{n} of {m} travel with you · …' or null while it does not apply. */
  summary: string | null;
  /** The stamina warning for those who would travel, or null. */
  warning: string | null;
}

const BEHIND_NAMES_MAX = 3;

/**
 * The follow states, the follow summary and the stamina warning for a party. `members` includes you,
 * in partyMembers order (leader first, then joinedAt, then member row id); names follow that order.
 * The summary and the warning exist only in a party of two or more and only once every member's
 * character row is known.
 */
export function partyTravelView(input: {
  selfId: bigint;
  leaderId: bigint;
  leaderName: string;
  members: readonly PartyTravelMember[];
}): PartyTravelView {
  const { members } = input;
  const leader = members.find((member) => member.id === input.leaderId) ?? null;
  const leaderPlace = leader === null ? null : leader.locationId;

  const states = new Map<bigint, FollowState>();
  for (const member of members) {
    const atLeaderPlace =
      leaderPlace !== null && member.locationId !== null && member.locationId === leaderPlace;
    states.set(
      member.id,
      followState({
        isLeader: member.id === input.leaderId,
        followLeader: member.followLeader,
        online: member.online,
        atLeaderPlace,
      }),
    );
  }

  const applies = members.length >= 2 && members.every((member) => member.known);
  if (!applies) return { states, summary: null, warning: null };

  const others = members.filter((member) => member.id !== input.leaderId);
  const travelling = others.filter((member) => states.get(member.id) === 'comes_along');
  const youLead = input.selfId === input.leaderId;

  let summary: string;
  if (youLead) {
    summary = `${travelling.length} of ${others.length} travel with you`;
    const behind = others.filter((member) => states.get(member.id) !== 'comes_along');
    if (behind.length === 1) {
      summary += ` · ${behind[0].name} stays behind`;
    } else if (behind.length > 1) {
      summary += ` · ${joinNames(
        behind.map((member) => member.name),
        BEHIND_NAMES_MAX,
      )} stay behind`;
    }
  } else {
    summary = `${travelling.length} of ${others.length} travel with ${input.leaderName}`;
  }

  // The leader always travels; a member only while they come along.
  const short = members.filter(
    (member) =>
      member.lowStamina && (member.id === input.leaderId || states.get(member.id) === 'comes_along'),
  );
  let warning: string | null = null;
  if (short.some((member) => member.id === input.selfId)) {
    warning = 'You do not have enough stamina to travel.';
  } else if (short.length === 1) {
    warning = `${short[0].name} does not have enough stamina to travel.`;
  } else if (short.length > 1) {
    warning = `${joinNames(short.map((member) => member.name))} do not have enough stamina to travel.`;
  }

  return { states, summary, warning };
}
