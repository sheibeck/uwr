// Travel checks for the Map and the rail travel panel (51-UI-SPEC "Checklist" and "Travel button").
//
// This is a prediction for display only. performTravel on the server re-checks every trip (combat,
// gathering, connection, stamina for all travellers, then the region timer) and its refusal line is
// the truth. Every stamina number comes from the shared rule in @game-data/travel_config, the same
// function the server charges with; nothing is copied here and the cooldown length is never read
// (the timers come from travel_cooldown rows through travelTimer).
//
// The block order is the UI-SPEC one: gathering, your region timer, a follower's region timer, your
// stamina, a follower's stamina. The first that applies sets the button label (detailModel.ts).

import { travelEffectDiscount, travelStaminaCost } from '@game-data/travel_config';
import { formatClock, travelTimer } from './travelTimer';

export interface TravellerLike {
  id: bigint;
  name: string;
  locationId: bigint;
  stamina: bigint;
  racialTravelCostIncrease?: bigint | null;
  racialTravelCostDiscount?: bigint | null;
}

export interface TravelCheck {
  key: 'region' | 'stamina' | 'activity';
  status: 'ok' | 'wait' | 'bad';
  label: string;
  detail: string;
  /** The running timer behind a WAIT row, else null. */
  secondsLeft: number | null;
}

export type TravelBlock = {
  reason: 'gathering' | 'selfTimer' | 'followerTimer' | 'selfStamina' | 'followerStamina';
  secondsLeft: number | null;
};

export interface TravelChecks {
  crossRegion: boolean;
  /** You lead a group (followers may come along). */
  leading: boolean;
  /** You are in a group but do not lead it: only you travel. */
  member: boolean;
  followers: TravellerLike[];
  selfCost: bigint;
  /** '{n} stamina', or for a party '{n} stamina each' / '{min}–{max} stamina each'. */
  costText: string;
  checks: TravelCheck[];
  block: TravelBlock | null;
  selfTimer: { running: boolean; secondsLeft: number };
}

export interface TravelChecksInput {
  self: TravellerLike | null;
  origin: { id: bigint; regionId: bigint } | null;
  destination: { id: bigint; regionId: bigint } | null;
  regionName: (id: bigint) => string;
  group: { leaderCharacterId: bigint } | null;
  members: readonly { characterId: bigint; followLeader: boolean }[];
  characters: readonly TravellerLike[];
  effects: readonly { characterId: bigint; effectType: string; roundsRemaining: bigint; magnitude: bigint | number }[];
  cooldowns: readonly { characterId: bigint; readyAtMicros: bigint }[];
  nowMicros: number;
  gathering: boolean;
}

/** 'A', 'A and B', 'A, B and C'. */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function costOf(
  who: TravellerLike,
  crossRegion: boolean,
  effects: TravelChecksInput['effects'],
): bigint {
  return travelStaminaCost({
    crossRegion,
    racialIncrease: who.racialTravelCostIncrease,
    racialDiscount: who.racialTravelCostDiscount,
    effectDiscount: travelEffectDiscount(effects.filter((e) => e.characterId === who.id)),
  });
}

function costTextFor(costs: readonly bigint[], party: boolean): string {
  let lo = costs[0];
  let hi = costs[0];
  for (const cost of costs) {
    if (cost < lo) lo = cost;
    if (cost > hi) hi = cost;
  }
  if (!party) return `${lo} stamina`;
  return lo === hi ? `${lo} stamina each` : `${lo}–${hi} stamina each`;
}

/** Followers: members with follow on, known, at your place, other than you (only when you lead). */
function followersOf(input: TravelChecksInput, leading: boolean): TravellerLike[] {
  if (!leading || input.self === null || input.origin === null) return [];
  const followers: TravellerLike[] = [];
  for (const member of input.members) {
    if (!member.followLeader || member.characterId === input.self.id) continue;
    const row = input.characters.find((c) => c.id === member.characterId);
    if (!row || row.locationId !== input.origin.id) continue;
    if (input.destination !== null && row.locationId === input.destination.id) continue;
    if (!followers.some((f) => f.id === row.id)) followers.push(row);
  }
  return followers;
}

export function travelChecks(input: TravelChecksInput): TravelChecks {
  const { self, origin, destination } = input;
  const crossRegion = origin !== null && destination !== null && origin.regionId !== destination.regionId;
  const leading = self !== null && input.group !== null && input.group.leaderCharacterId === self.id;
  const member = self !== null && input.group !== null && !leading;
  const followers = followersOf(input, leading);

  const selfCost = self === null ? 0n : costOf(self, crossRegion, input.effects);
  const followerCosts = followers.map((f) => costOf(f, crossRegion, input.effects));
  const party = followers.length > 0;
  const costText = costTextFor([selfCost, ...followerCosts], party);

  const timerOf = (id: bigint) => travelTimer(input.cooldowns.filter((c) => c.characterId === id), input.nowMicros);
  const selfTimer = self === null ? { running: false, secondsLeft: 0 } : timerOf(self.id);
  const followerTimers = followers.map((f) => ({ who: f, timer: timerOf(f.id) })).filter((t) => t.timer.running);
  let followerSeconds = 0;
  for (const t of followerTimers) followerSeconds = Math.max(followerSeconds, t.timer.secondsLeft);

  const selfShort = self !== null && self.stamina < selfCost;
  const shortFollowers = followers.filter((f, i) => f.stamina < followerCosts[i]);

  const checks: TravelCheck[] = [];

  if (crossRegion && origin !== null) {
    if (selfTimer.running) {
      checks.push({
        key: 'region',
        status: 'wait',
        label: 'Region travel cooling down',
        detail: `Ready in ${formatClock(selfTimer.secondsLeft)}. Moving within ${input.regionName(origin.regionId)} is still fine.`,
        secondsLeft: selfTimer.secondsLeft,
      });
    } else if (followerTimers.length > 0) {
      checks.push({
        key: 'region',
        status: 'wait',
        label: `${joinNames(followerTimers.map((t) => t.who.name))} can't cross yet`,
        detail: `Ready in ${formatClock(followerSeconds)}.`,
        secondsLeft: followerSeconds,
      });
    } else {
      checks.push({
        key: 'region',
        status: 'ok',
        label: 'Region travel ready',
        detail: 'Crossing starts the region travel timer for everyone who travels.',
        secondsLeft: null,
      });
    }
  }

  if (selfShort && self !== null) {
    checks.push({
      key: 'stamina',
      status: 'bad',
      label: 'You are short on stamina',
      detail: `Needs ${selfCost}, you have ${self.stamina}.`,
      secondsLeft: null,
    });
  } else if (shortFollowers.length === 1) {
    const only = shortFollowers[0];
    const needs = followerCosts[followers.indexOf(only)];
    checks.push({
      key: 'stamina',
      status: 'bad',
      label: `${only.name} is short on stamina`,
      detail: `Needs ${needs}, has ${only.stamina}. Party travel is all or nothing.`,
      secondsLeft: null,
    });
  } else if (shortFollowers.length > 1) {
    checks.push({
      key: 'stamina',
      status: 'bad',
      label: `${joinNames(shortFollowers.map((f) => f.name))} are short on stamina`,
      detail: 'Party travel is all or nothing.',
      secondsLeft: null,
    });
  } else if (party) {
    checks.push({
      key: 'stamina',
      status: 'ok',
      label: 'Party has the stamina',
      detail: `You and ${followers.length} following · ${costText}`,
      secondsLeft: null,
    });
  } else {
    checks.push({ key: 'stamina', status: 'ok', label: 'You have the stamina', detail: costText, secondsLeft: null });
  }

  checks.push(
    input.gathering
      ? { key: 'activity', status: 'bad', label: 'Gathering', detail: 'Finish gathering first.', secondsLeft: null }
      : { key: 'activity', status: 'ok', label: 'Not in combat or gathering', detail: '', secondsLeft: null },
  );

  let block: TravelBlock | null = null;
  if (input.gathering) block = { reason: 'gathering', secondsLeft: null };
  else if (crossRegion && selfTimer.running) block = { reason: 'selfTimer', secondsLeft: selfTimer.secondsLeft };
  else if (crossRegion && followerTimers.length > 0) block = { reason: 'followerTimer', secondsLeft: followerSeconds };
  else if (selfShort) block = { reason: 'selfStamina', secondsLeft: null };
  else if (shortFollowers.length > 0) block = { reason: 'followerStamina', secondsLeft: null };

  return { crossRegion, leading, member, followers, selfCost, costText, checks, block, selfTimer };
}
