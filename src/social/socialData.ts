import { computed, effectScope, watch } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import { inviteExpiresAtMicros } from '@game-data/group_config';
import type {
  ActivePet,
  Character,
  Group,
  GroupInvite,
  GroupMember,
} from '../module_bindings/types';
import type { ConnectionStatus } from '../net/connection';
import type { BindTableOptions, ConnLike, TableBinding, TableLike } from '../net/bindTable';
import { createKeyed, idListKey, keyedRows, parseIdListKey } from '../game/keyedBinding';
import { createSecondsTick } from '../map/secondsTick';
import type { SocialData } from './socialContext';
import type { SocialQueries } from './queries';

// The Social hub (Phase 51.1): the session-owned subscriptions of the party surfaces that the game
// hub does not hold, and the invite and pet timers on the server clock. It sits beside the map and
// ledger hubs on purpose (a copy of the map hub's structure).
//
// Scope and key of each subscription:
//   active_pet        key: ids of you plus your party members (character_id), in and out of
//                     combat. Re-keys as the party changes; the old rows stay until the new
//                     binding has applied, so a pet never flashes away.
//   group_invite      key: your character's group id (group_id). None while solo. Swaps at once.
//   group             key: the incoming invite's group id (id). Swaps at once, so a previous
//   group_member      inviter's group never shows on a new invite. Subscribed by the invite's
//                     group, not your own, so the invite card's chips work while you are solo.
//   character         key: ids of your outgoing invite targets plus the inviting group's members
//                     (id). Names for the Invited rows and the invite card.
//
// The incoming invite itself is the game hub's my_group_invites row addressed to the active
// character (the lowest id when several, a stale row before the server ends it).
//
// Shared-cache rule: the SDK cache is shared by every subscription of the same table, so each
// keyed binding passes a filter equal to its query (the combat hub binds active_pet WHERE combat_id
// beside this hub's character_id binding). Nothing is optimistic: rows drive every change. Timers
// are display only: the server owns expiry (the group_invite_expiry_tick) and the TTL rule, and
// this hub only reads the server clock and the shared TTL constant.

type Row<T> = TableLike<T>;

export interface SocialConn extends ConnLike {
  db: {
    activePet: Row<ActivePet>;
    groupInvite: Row<GroupInvite>;
    group: Row<Group>;
    groupMember: Row<GroupMember>;
    character: Row<Character>;
  };
}

export interface SocialInput<C> {
  conn: Readonly<ShallowRef<C | null>>;
  status: Readonly<Ref<ConnectionStatus>>;
  character: Readonly<Ref<Character | null>>;
  /** Character ids of your party members other than your own. */
  partyCharacterIds: Readonly<Ref<readonly bigint[]>>;
  /** The game hub's my_group_invites rows (every invite addressed to one of your characters). */
  incomingInvites: Readonly<Ref<readonly GroupInvite[]>>;
  /** The game hub's known characters (party members, fight participants, inviters). */
  knownCharacters: Readonly<Ref<readonly Character[]>>;
  clock: { nowMicros(): number };
}

export interface SocialDeps<C> {
  bind: <R>(options: BindTableOptions<C, R>) => TableBinding<C, R>;
  queries: SocialQueries;
}

const MICROS_PER_SECOND = 1_000_000;

function secondsUntil(expiresAtMicros: bigint, nowMicros: number): number {
  const remaining = Number(expiresAtMicros) - nowMicros;
  if (!(remaining > 0)) return 0;
  return Math.ceil(remaining / MICROS_PER_SECOND);
}

export function createSocialData<C extends SocialConn>(
  deps: SocialDeps<C>,
  input: SocialInput<C>,
): SocialData {
  const { queries } = deps;
  // Every watcher and keyed binding lives in one child scope, so dispose() can stop them all
  // and the session scope still stops them when it ends.
  const scope = effectScope();

  const characterId = computed<bigint | null>(() => input.character.value?.id ?? null);

  // The invite addressed to the active character; the lowest id when several rows exist.
  const incomingInvite = computed<GroupInvite | null>(() => {
    const own = characterId.value;
    if (own === null) return null;
    let lowest: GroupInvite | null = null;
    for (const invite of input.incomingInvites.value) {
      if (invite.toCharacterId !== own) continue;
      if (lowest === null || invite.id < lowest.id) lowest = invite;
    }
    return lowest;
  });

  const petKey = computed<string | null>(() => {
    const own = characterId.value;
    if (own === null) return null;
    return idListKey([own, ...input.partyCharacterIds.value]);
  });
  const outgoingKey = computed<bigint | null>(() =>
    characterId.value === null ? null : (input.character.value?.groupId ?? null),
  );
  const inviteGroupKey = computed<bigint | null>(() => incomingInvite.value?.groupId ?? null);

  const run = scope.run(() => {
    function keyedTable<R>(
      key: Readonly<Ref<bigint | null>>,
      table: (c: C) => TableLike<R>,
      sql: (k: bigint) => string,
      matches: (row: R, k: bigint) => boolean,
    ) {
      // Immediate swap: a changed group must never show the previous group's rows.
      return createKeyed<C, bigint, TableBinding<C, R>>({
        key,
        conn: input.conn,
        swap: 'immediate',
        make: (k) => deps.bind<R>({ table, sql: [sql(k)], filter: (row) => matches(row, k) }),
      });
    }

    function keyedIdList<R>(
      key: Readonly<Ref<string | null>>,
      table: (c: C) => TableLike<R>,
      sql: (ids: bigint[]) => string,
      idOf: (row: R) => bigint,
    ) {
      return createKeyed<C, string, TableBinding<C, R>>({
        key,
        conn: input.conn,
        make: (k) => {
          const ids = parseIdListKey(k);
          const set = new Set(ids);
          return deps.bind<R>({ table, sql: [sql(ids)], filter: (row) => set.has(idOf(row)) });
        },
      });
    }

    const petsKeyed = keyedIdList<ActivePet>(
      petKey,
      (c) => c.db.activePet,
      queries.petsOf,
      (row) => row.characterId,
    );
    const outgoingKeyed = keyedTable<GroupInvite>(
      outgoingKey,
      (c) => c.db.groupInvite,
      queries.groupInvitesOf,
      (row, k) => row.groupId === k,
    );
    const groupKeyed = keyedTable<Group>(
      inviteGroupKey,
      (c) => c.db.group,
      queries.groupById,
      (row, k) => row.id === k,
    );
    const membersKeyed = keyedTable<GroupMember>(
      inviteGroupKey,
      (c) => c.db.groupMember,
      queries.groupMembersOf,
      (row, k) => row.groupId === k,
    );

    const pets = keyedRows(petsKeyed);
    const outgoingInvites = keyedRows(outgoingKeyed);
    const groupRows = keyedRows(groupKeyed);
    const inviteGroupMembers = keyedRows(membersKeyed);
    const inviteGroup = computed<Group | null>(() => groupRows.value[0] ?? null);

    const petsApplied = computed(() => petsKeyed.current.value?.applied.value ?? false);
    const outgoingApplied = computed(() => outgoingKeyed.current.value?.applied.value ?? false);
    const inviteGroupApplied = computed(
      () =>
        (groupKeyed.current.value?.applied.value ?? false) &&
        (membersKeyed.current.value?.applied.value ?? false),
    );

    // Names for the Invited rows and the invite card: outgoing targets plus the inviting group.
    const extraKey = computed<string | null>(() => {
      if (characterId.value === null) return null;
      const ids: bigint[] = [];
      for (const invite of outgoingInvites.value) ids.push(invite.toCharacterId);
      for (const member of inviteGroupMembers.value) ids.push(member.characterId);
      return idListKey(ids);
    });
    const extraKeyed = keyedIdList<Character>(
      extraKey,
      (c) => c.db.character,
      queries.charactersById,
      (row) => row.id,
    );
    const extraCharacters = keyedRows(extraKeyed);

    // The 1-second tick runs only while an invite or a timed pet is shown. New or changed rows
    // sample the clock at once, so a timer never reads a stale second.
    const tickActive = computed(
      () =>
        incomingInvite.value !== null ||
        outgoingInvites.value.length > 0 ||
        pets.value.some((pet) => pet.expiresAtMicros !== undefined && pet.expiresAtMicros !== null),
    );
    const tick = createSecondsTick({ clock: input.clock, active: tickActive });
    watch([incomingInvite, outgoingInvites, pets], () => tick.refresh(), { flush: 'sync' });

    return {
      keyed: [petsKeyed, outgoingKeyed, groupKeyed, membersKeyed, extraKeyed],
      pets,
      petsApplied,
      outgoingInvites,
      outgoingApplied,
      inviteGroup,
      inviteGroupMembers,
      inviteGroupApplied,
      extraCharacters,
      nowMicros: tick.nowMicros,
    };
  })!;

  function reset(): void {
    for (const keyed of run.keyed) keyed.reset();
  }

  function dispose(): void {
    scope.stop();
    reset();
  }

  return {
    pets: run.pets,
    petsApplied: run.petsApplied,
    petOf(id) {
      return run.pets.value.find((pet) => pet.characterId === id) ?? null;
    },
    outgoingInvites: run.outgoingInvites,
    outgoingApplied: run.outgoingApplied,
    incomingInvite,
    inviteGroup: run.inviteGroup,
    inviteGroupMembers: run.inviteGroupMembers,
    inviteGroupApplied: run.inviteGroupApplied,
    extraCharacters: run.extraCharacters,
    characterById(id) {
      const own = input.character.value;
      if (own !== null && own.id === id) return own;
      const known = input.knownCharacters.value.find((row) => row.id === id);
      if (known !== undefined) return known;
      return run.extraCharacters.value.find((row) => row.id === id) ?? null;
    },
    nowMicros: run.nowMicros,
    inviteSecondsLeft(invite) {
      return secondsUntil(inviteExpiresAtMicros(invite.createdAt.microsSinceUnixEpoch), run.nowMicros.value);
    },
    petSecondsLeft(pet) {
      if (pet.expiresAtMicros === undefined || pet.expiresAtMicros === null) return null;
      return secondsUntil(pet.expiresAtMicros, run.nowMicros.value);
    },
    reset,
    dispose,
  };
}
