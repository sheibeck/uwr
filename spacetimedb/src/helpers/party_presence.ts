// ============================================================================
// Party presence lines (quick 261008-d2k)
// ============================================================================
//
// The party hears one kind 'group' line per real presence transition of a grouped character:
// "{name} has logged out.", "{name} has gone link-dead." and "{name} is back.". The line is one
// event_group row, which the my_group_events view hands to every member.
//
// Callers gate every call on the boolean syncCharacterOnline returns (true only when the stored
// flag really flipped). That gives one line per transition, none while another session still holds
// the character, and none on a repeated scheduled tick.
//
// Camp keeps its own "headed to camp." line (campCharacter) and never calls this module.
//
// Logout ends the signed-in session at once (player.sessionStartedAt is cleared) while the
// character lingers for the enforced 30 s window. A dropped connection leaves the session
// standing. So at the release, disconnect_logout reads a missing session as "has logged out" and a
// standing one as "has gone link-dead". A sign-in inside the window restores the session
// (sessionOnReconnect), so a later drop reads as link-dead.
//
// The friend presence lines ("went offline." and "is online.") are separate and unchanged. An
// offline member stays in the party.
// ============================================================================

import { appendGroupEvent } from './events';

export type PartyPresenceKind = 'logged_out' | 'link_dead' | 'back';

/** The exact party line for one transition of the named character. */
export function partyPresenceLine(kind: PartyPresenceKind, name: string): string {
  if (kind === 'logged_out') return `${name} has logged out.`;
  if (kind === 'link_dead') return `${name} has gone link-dead.`;
  return `${name} is back.`;
}

/** Why a player row is being released: no standing session means Logout, a standing one a drop. */
export function releaseKind(player: any): 'logged_out' | 'link_dead' {
  return player.sessionStartedAt == null ? 'logged_out' : 'link_dead';
}

/**
 * The session start a reconnecting player row should carry: a signed-in account without a session
 * (it clicked Logout and signed back in inside the window) gets `now`; anything else keeps what it has.
 */
export function sessionOnReconnect(player: any, now: any) {
  if (player.userId != null && player.sessionStartedAt == null) return now;
  return player.sessionStartedAt;
}

/**
 * Tell the character's party. Returns true when a row was written; false for a missing id, a
 * missing character or a character with no group.
 */
export function announcePartyPresence(
  ctx: any,
  characterId: bigint | null | undefined,
  kind: PartyPresenceKind,
): boolean {
  if (characterId === null || characterId === undefined) return false;
  const character = ctx.db.character.id.find(characterId);
  if (!character || character.groupId == null) return false;
  appendGroupEvent(ctx, character.groupId, character.id, 'group', partyPresenceLine(kind, character.name));
  return true;
}
