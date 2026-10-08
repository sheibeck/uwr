// Party invite rules (plan 51.1-03). An invite is live until exactly createdAt +
// GROUP_INVITE_TTL_MICROS (data/group_config). Expired invites are ended lazily by the reducers
// that meet them and by the one-shot group_invite_expiry_tick. When an invite ends by expiry,
// cancel or decline, a group left with one member and no other invite dissolves.
import { ScheduleAt } from 'spacetimedb';
import {
  GROUP_REINVITE_COOLDOWN_MICROS,
  inviteExpiresAtMicros,
  isInviteExpired,
  reinviteWaitRunning,
} from '../data/group_config';
import { appendPrivateEvent } from './events';

export type InviteEnd = 'expired' | 'cancelled' | 'declined';

const byId = (a: { id: bigint }, b: { id: bigint }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** True while now is before createdAt + TTL. */
export function inviteIsLive(
  invite: { createdAt: { microsSinceUnixEpoch: bigint } },
  nowMicros: bigint,
): boolean {
  return !isInviteExpired(invite.createdAt.microsSinceUnixEpoch, nowMicros);
}

/** The live invites addressed to a character, ordered by id. */
export function liveInvitesTo(ctx: any, characterId: bigint): any[] {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  return [...ctx.db.group_invite.by_to_character.filter(characterId)]
    .filter((invite: any) => inviteIsLive(invite, now))
    .sort(byId);
}

/** The live invites a group has out, ordered by id. */
export function liveInvitesOfGroup(ctx: any, groupId: bigint): any[] {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  return [...ctx.db.group_invite.by_group.filter(groupId)]
    .filter((invite: any) => inviteIsLive(invite, now))
    .sort(byId);
}

function endExpired(ctx: any, invites: any[]): number {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const expired = invites.filter((invite) => !inviteIsLive(invite, now)).sort(byId);
  for (const invite of expired) endInvite(ctx, invite, 'expired');
  return expired.length;
}

/** Ends every expired invite addressed to a character; returns how many ended. */
export function endExpiredInvitesTo(ctx: any, characterId: bigint): number {
  return endExpired(ctx, [...ctx.db.group_invite.by_to_character.filter(characterId)]);
}

/** Ends every expired invite a group has out; returns how many ended. */
export function endExpiredInvitesOfGroup(ctx: any, groupId: bigint): number {
  return endExpired(ctx, [...ctx.db.group_invite.by_group.filter(groupId)]);
}

function tell(ctx: any, character: any, message: string) {
  if (!character) return;
  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'group', message);
}

/**
 * Ends an invite: deletes the row (when still there) and its expiry tick, starts the re-invite wait
 * after a decline or cancel (WR-02), writes the reason's lines, then dissolves
 * the invite's group if it is left with one member and no other invite. `actor` is the
 * character who cancelled (cancelled) or declined (declined). `runningTickId` is the expiry tick
 * that is running this end (the platform deletes a one-shot tick itself), left alone here.
 */
export function endInvite(
  ctx: any,
  invite: any,
  reason: InviteEnd,
  actor?: any,
  runningTickId?: bigint
): void {
  if (ctx.db.group_invite.id.find(invite.id)) ctx.db.group_invite.id.delete(invite.id);
  cancelInviteExpiry(ctx, invite.id, runningTickId);
  if (reason === 'cancelled' || reason === 'declined') {
    startReinviteWait(ctx, invite.fromCharacterId, invite.toCharacterId);
  }
  const from = ctx.db.character.id.find(invite.fromCharacterId);
  const to = ctx.db.character.id.find(invite.toCharacterId);
  if (reason === 'expired') {
    if (to) tell(ctx, from, `Your invite to ${to.name} expired.`);
    if (from) tell(ctx, to, `The invite from ${from.name} expired.`);
  } else if (reason === 'cancelled') {
    const canceller = actor ?? from;
    if (canceller) tell(ctx, to, `${canceller.name} cancelled the invite.`);
    if (to) tell(ctx, canceller, `You cancelled the invite to ${to.name}.`);
  } else {
    const decliner = actor ?? to;
    if (decliner) tell(ctx, from, `${decliner.name} declined your group invite.`);
  }
  dissolveLoneGroup(ctx, invite.groupId);
}

/**
 * Dissolves a group with exactly one member and no invite rows: deletes the member row, clears
 * that character's groupId and deletes the group. Returns whether it dissolved.
 */
export function dissolveLoneGroup(ctx: any, groupId: bigint): boolean {
  const group = ctx.db.group.id.find(groupId);
  if (!group) return false;
  const members = [...ctx.db.group_member.by_group.filter(groupId)];
  if (members.length !== 1) return false;
  for (const _invite of ctx.db.group_invite.by_group.filter(groupId)) return false;

  const lone = members[0];
  ctx.db.group_member.id.delete(lone.id);
  const character = ctx.db.character.id.find(lone.characterId);
  if (character && character.groupId === groupId) {
    ctx.db.character.id.update({ ...character, groupId: undefined });
  }
  ctx.db.group.id.delete(groupId);
  return true;
}

/**
 * Who leads after `leavingCharacterId` goes: the remaining member with the earliest joinedAt,
 * then the lowest member row id. Null when nobody else is left.
 */
export function nextLeaderAfter(ctx: any, groupId: bigint, leavingCharacterId: bigint): any | null {
  const joined = (m: any): bigint => m.joinedAt?.microsSinceUnixEpoch ?? 0n;
  const remaining = [...ctx.db.group_member.by_group.filter(groupId)]
    .filter((m: any) => m.characterId !== leavingCharacterId)
    .sort((a: any, b: any) => {
      const ja = joined(a);
      const jb = joined(b);
      if (ja !== jb) return ja < jb ? -1 : 1;
      return byId(a, b);
    });
  return remaining[0] ?? null;
}

/** Schedules the one-shot expiry tick for a new invite, due at createdAt + TTL. */
export function scheduleInviteExpiry(ctx: any, invite: any): void {
  ctx.db.group_invite_expiry_tick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(inviteExpiresAtMicros(invite.createdAt.microsSinceUnixEpoch)),
    inviteId: invite.id,
  });
}

/**
 * Deletes the expiry tick(s) of an invite that ended early (accept, decline, cancel, lazy expiry),
 * so no scheduled row outlives its invite (code review WR-02). The table is private and holds one
 * row per open invite, so a scan is cheap; no index (and no schema change) is needed.
 */
export function cancelInviteExpiry(ctx: any, inviteId: bigint, runningTickId?: bigint): void {
  const ticks = [...ctx.db.group_invite_expiry_tick.iter()].filter(
    (tick: any) => tick.inviteId === inviteId && tick.scheduledId !== runningTickId
  );
  for (const tick of ticks) ctx.db.group_invite_expiry_tick.scheduledId.delete(tick.scheduledId);
}

/** Starts (or restarts) the wait before fromCharacterId may invite toCharacterId again. */
export function startReinviteWait(ctx: any, fromCharacterId: bigint, toCharacterId: bigint): void {
  const untilMicros = ctx.timestamp.microsSinceUnixEpoch + GROUP_REINVITE_COOLDOWN_MICROS;
  const existing = [...ctx.db.group_invite_cooldown.by_to_character.filter(toCharacterId)].find(
    (row: any) => row.fromCharacterId === fromCharacterId
  );
  if (existing) ctx.db.group_invite_cooldown.id.update({ ...existing, untilMicros });
  else ctx.db.group_invite_cooldown.insert({ id: 0n, fromCharacterId, toCharacterId, untilMicros });
}

/**
 * Whether fromCharacterId must still wait before inviting toCharacterId again. Finished waits
 * addressed to toCharacterId are deleted on the way, so the table stays small.
 */
export function reinviteWaitActive(ctx: any, fromCharacterId: bigint, toCharacterId: bigint): boolean {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  let active = false;
  for (const row of [...ctx.db.group_invite_cooldown.by_to_character.filter(toCharacterId)]) {
    if (!reinviteWaitRunning(row.untilMicros, now)) ctx.db.group_invite_cooldown.id.delete(row.id);
    else if (row.fromCharacterId === fromCharacterId) active = true;
  }
  return active;
}
