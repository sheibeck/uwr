import { computed } from 'vue';
import type { InjectionKey, Ref } from 'vue';
import type {
  ActivePet,
  Character,
  Group,
  GroupInvite,
  GroupMember,
} from '../module_bindings/types';

// The Social data contract (Phase 51.1): what the party surfaces (rail, combat cards, mobile grid
// and sheet, player menus, the invite card) read beyond the game hub. The session owns the hub;
// components inject it through SOCIAL_KEY and mount bare against the inert default (tests and the
// Phase 45 shell).

type List<T> = Readonly<Ref<readonly T[]>>;

export interface SocialData {
  /** active_pet rows of you and your party members. */
  readonly pets: List<ActivePet>;
  readonly petsApplied: Readonly<Ref<boolean>>;
  /** The pet of a character (one per character), or null. */
  petOf(characterId: bigint): ActivePet | null;
  /** The invites your group has sent (empty while solo). */
  readonly outgoingInvites: List<GroupInvite>;
  readonly outgoingApplied: Readonly<Ref<boolean>>;
  /** The invite addressed to your active character; the lowest id when several. */
  readonly incomingInvite: Readonly<Ref<GroupInvite | null>>;
  /** The group that sent the incoming invite. */
  readonly inviteGroup: Readonly<Ref<Group | null>>;
  readonly inviteGroupMembers: List<GroupMember>;
  /** The inviting group's row and member rows have both applied. */
  readonly inviteGroupApplied: Readonly<Ref<boolean>>;
  /** Outgoing invite targets and inviting-group members, by id. */
  readonly extraCharacters: List<Character>;
  /** Your own row, then the game hub's known characters, then the extra characters. */
  characterById(id: bigint): Character | null;
  /** Server-clock microseconds, refreshed each second while an invite or a timed pet is shown. */
  readonly nowMicros: Readonly<Ref<number>>;
  /** Whole seconds until the invite expires (rounded up, never below 0). */
  inviteSecondsLeft(invite: { createdAt: { microsSinceUnixEpoch: bigint } }): number;
  /** Whole seconds until a timed pet expires (rounded up, never below 0); null for an untimed pet. */
  petSecondsLeft(pet: { expiresAtMicros?: bigint | null }): number | null;
  /** Drop every binding (logout). */
  reset(): void;
  /** Dispose every binding and watcher. */
  dispose(): void;
}

export const SOCIAL_KEY: InjectionKey<SocialData> = Symbol('uwr.social');

// A constant, read-only ref. computed() keeps rows out of deep reactivity.
function constant<T>(value: T): Readonly<Ref<T>> {
  return computed(() => value);
}

function empty<T>(): List<T> {
  return constant<readonly T[]>([]);
}

export function createInertSocial(): SocialData {
  return {
    pets: empty<ActivePet>(),
    petsApplied: constant(false),
    petOf: () => null,
    outgoingInvites: empty<GroupInvite>(),
    outgoingApplied: constant(false),
    incomingInvite: constant<GroupInvite | null>(null),
    inviteGroup: constant<Group | null>(null),
    inviteGroupMembers: empty<GroupMember>(),
    inviteGroupApplied: constant(false),
    extraCharacters: empty<Character>(),
    characterById: () => null,
    nowMicros: constant(0),
    inviteSecondsLeft: () => 0,
    petSecondsLeft: () => null,
    reset() {},
    dispose() {},
  };
}
