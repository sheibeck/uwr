import { toSql } from 'spacetimedb';
import { tables } from '../module_bindings';

// Typed subscription SQL for the Social hub (Phase 51.1). What each binding is for:
//   petsOf           active_pet rows of you and your party members (character_id), in and out of
//                    combat. The combat hub keeps its own active_pet WHERE combat_id binding.
//   groupInvitesOf   the invites your group has sent, for "Invited - waiting" rows (group_id).
//   groupById        the group row of the group that invited you (id), so its card can show chips
//                    while you are solo.
//   groupMembersOf   the member rows of that inviting group (group_id).
//   charactersById   character rows by id: the outgoing invite targets and the inviting group's
//                    members, so their names resolve.
//
// Every query has a WHERE on an indexed column. No whole-table subscription, and the private
// account table is never named.

export interface SocialQueries {
  /** Non-empty list: an OR chain on character_id. */
  petsOf(ids: readonly bigint[]): string;
  groupInvitesOf(groupId: bigint): string;
  groupById(groupId: bigint): string;
  groupMembersOf(groupId: bigint): string;
  /** Non-empty list: an OR chain on id. */
  charactersById(ids: readonly bigint[]): string;
}

function requireIds(ids: readonly bigint[]): void {
  if (ids.length === 0) throw new Error('[social queries] an id list must not be empty');
}

export function socialQueries(): SocialQueries {
  return {
    petsOf: (ids) => {
      requireIds(ids);
      return toSql(
        tables.activePet.where((r) => ids.map((id) => r.characterId.eq(id)).reduce((a, b) => a.or(b))),
      );
    },
    groupInvitesOf: (groupId) =>
      toSql(tables.groupInvite.where((r) => r.groupId.eq(groupId))),
    groupById: (groupId) => toSql(tables.group.where((r) => r.id.eq(groupId))),
    groupMembersOf: (groupId) =>
      toSql(tables.groupMember.where((r) => r.groupId.eq(groupId))),
    charactersById: (ids) => {
      requireIds(ids);
      return toSql(
        tables.character.where((r) => ids.map((id) => r.id.eq(id)).reduce((a, b) => a.or(b))),
      );
    },
  };
}
