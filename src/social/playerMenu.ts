// The rules behind every party and player menu (UI-SPEC "Entries by target and role"): who sees
// which entry, in which group and order, why an entry is disabled and which confirmations are asked.
//
// Pure: no Vue, no connection. Icons are returned as ids (MenuIcon) and the renderer maps them to
// Phosphor components. The renderer draws a separator only between non-empty groups, so a fourth
// group (Phase 52.2 may append a 'guild' group) needs no change here or in the renderer.
// Disabled entries are a convenience only: the server re-validates every action.
import { MAX_GROUP_SIZE, successorOrder } from '@game-data/group_config';

export type MenuAction =
  | 'invite'
  | 'cancelInvite'
  | 'whisper'
  | 'examine'
  | 'addFriend'
  | 'makeLeader'
  | 'remove'
  | 'travelWithLeader'
  | 'stopTravelWithLeader'
  | 'leave';

export type MenuIcon =
  | 'userPlus'
  | 'xCircle'
  | 'chatCircleDots'
  | 'eye'
  | 'heart'
  | 'crownSimple'
  | 'userMinus'
  | 'footprints'
  | 'signOut';

export type MenuTone = 'default' | 'accent' | 'danger';

export interface MenuConfirm {
  prompt: string;
  confirmLabel: string;
  keepLabel: string;
}

export interface MenuEntry {
  action: MenuAction;
  label: string;
  icon: MenuIcon;
  tone: MenuTone;
  disabled: boolean;
  /** The reason a disabled entry is unavailable, or 'Pending' on Cancel invite; null otherwise. */
  hint: string | null;
  confirm: MenuConfirm | null;
}

export interface MenuGroup {
  key: string;
  entries: MenuEntry[];
}

export interface MenuPerson {
  id: bigint;
  name: string;
  level: bigint;
  race: string;
  className: string;
  locationId: bigint;
  online: boolean;
  groupId: bigint | null;
}

export interface PlayerMenuInput {
  self: MenuPerson;
  /** Null for an unknown member (no character row): no menu. */
  target: MenuPerson | null;
  /** Your group, null when solo. */
  group: { id: bigint; leaderCharacterId: bigint } | null;
  /** Member rows of your group, you included (1 when solo). */
  memberCount: number;
  /** Live (not expired) invites of your group. */
  liveOutgoing: readonly { toCharacterId: bigint; fromCharacterId: bigint }[];
  /** Your member row's "Travel with leader" flag; null reads as following (the server default). */
  selfFollowLeader: boolean | null;
  /** Who leads after you leave (see nextLeaderName); null when unknown or nobody remains. */
  nextLeaderName: string | null;
  maxGroupSize?: number;
}

const HINT_OFFLINE = 'Offline';

function entry(
  action: MenuAction,
  label: string,
  icon: MenuIcon,
  over: Partial<Pick<MenuEntry, 'tone' | 'disabled' | 'hint' | 'confirm'>> = {},
): MenuEntry {
  return { action, label, icon, tone: 'default', disabled: false, hint: null, confirm: null, ...over };
}

function disabled(hint: string): Partial<Pick<MenuEntry, 'disabled' | 'hint'>> {
  return { disabled: true, hint };
}

function nonEmpty(groups: MenuGroup[]): MenuGroup[] {
  return groups.filter((group) => group.entries.length > 0);
}

function selfEntries(input: PlayerMenuInput): MenuGroup[] {
  const { group, self } = input;
  // Solo (no group, or a lone group): there is nobody to leave or follow, so no menu.
  if (group === null || input.memberCount <= 1) return [];
  const isLeader = group.leaderCharacterId === self.id;
  const entries: MenuEntry[] = [];
  if (!isLeader) {
    if (input.selfFollowLeader === false) {
      entries.push(entry('travelWithLeader', 'Travel with leader', 'footprints'));
    } else {
      entries.push(entry('stopTravelWithLeader', 'Stop travelling with leader', 'footprints'));
    }
  }
  const successor = isLeader && input.nextLeaderName ? ` Leadership passes to ${input.nextLeaderName}.` : '';
  entries.push(
    entry('leave', 'Leave party', 'signOut', {
      tone: 'danger',
      confirm: { prompt: `Leave the party?${successor}`, confirmLabel: 'Leave', keepLabel: 'Stay' },
    }),
  );
  return nonEmpty([{ key: 'party', entries }]);
}

function inviteEntry(input: PlayerMenuInput, target: MenuPerson): MenuEntry {
  const { group, self } = input;
  const max = input.maxGroupSize ?? MAX_GROUP_SIZE;
  const pending = input.liveOutgoing.some(
    (invite) => invite.toCharacterId === target.id && (group?.leaderCharacterId === self.id || invite.fromCharacterId === self.id),
  );
  if (pending) return entry('cancelInvite', 'Cancel invite', 'xCircle', { hint: 'Pending' });
  // One hint only, in this order.
  let hint: string | null = null;
  if (target.groupId !== null) hint = 'In another party';
  else if (group !== null && group.leaderCharacterId !== self.id) hint = 'Leader invites';
  else if (input.memberCount + input.liveOutgoing.length >= max) hint = 'Party full';
  else if (!target.online) hint = HINT_OFFLINE;
  return entry('invite', 'Invite to party', 'userPlus', {
    tone: 'accent',
    ...(hint === null ? {} : disabled(hint)),
  });
}

function socialEntries(input: PlayerMenuInput, target: MenuPerson): MenuEntry[] {
  const offline = !target.online;
  const elsewhere = target.locationId !== input.self.locationId;
  return [
    entry('whisper', 'Whisper', 'chatCircleDots', offline ? disabled(HINT_OFFLINE) : {}),
    entry(
      'examine',
      'Examine',
      'eye',
      offline ? disabled(HINT_OFFLINE) : elsewhere ? disabled('Not here') : {},
    ),
    entry('addFriend', 'Add friend', 'heart'),
  ];
}

export function playerMenuEntries(input: PlayerMenuInput): MenuGroup[] {
  const { target, self, group } = input;
  if (target === null) return [];
  if (target.id === self.id) return selfEntries(input);

  const inMyParty = group !== null && target.groupId !== null && target.groupId === group.id;
  const party: MenuEntry[] = inMyParty ? [] : [inviteEntry(input, target)];
  const leader: MenuEntry[] =
    inMyParty && group.leaderCharacterId === self.id
      ? [
          entry('makeLeader', 'Make party leader', 'crownSimple', { tone: 'accent' }),
          entry('remove', 'Remove from party', 'userMinus', {
            tone: 'danger',
            confirm: {
              prompt: `Remove ${target.name} from the party?`,
              confirmLabel: 'Remove',
              keepLabel: `Keep ${target.name}`,
            },
          }),
        ]
      : [];
  return nonEmpty([
    { key: 'party', entries: party },
    { key: 'social', entries: socialEntries(input, target) },
    { key: 'leader', entries: leader },
  ]);
}

/** Sheet header: the name, whether it is you, and 'Lv {n} {race} {class} · in your party · offline'. */
export function playerMenuHeader(input: PlayerMenuInput): { name: string; you: boolean; line: string } {
  const { target, self, group } = input;
  if (target === null) return { name: '', you: false, line: '' };
  const you = target.id === self.id;
  const identity = [target.level > 0n ? `Lv ${target.level}` : '', target.race.trim(), target.className.trim()]
    .filter((part) => part !== '')
    .join(' ');
  const parts: string[] = [];
  if (identity !== '') parts.push(identity);
  if (!you && group !== null && target.groupId !== null && target.groupId === group.id) parts.push('in your party');
  if (!target.online) parts.push('offline');
  return { name: target.name, you, line: parts.join(' · ') };
}

/**
 * The name of the member who leads after `leavingId` leaves, by the server's own successor rule
 * (successorOrder from @game-data/group_config): an online member before an offline one, then the
 * earliest joinedAt, then the lowest member row id. `onlineOf` reads the member's character row
 * (online only when exactly true). Null when nobody remains or the name is unknown.
 */
export function nextLeaderName(
  members: readonly { id: bigint; characterId: bigint; joinedAt: { microsSinceUnixEpoch: bigint } }[],
  leavingId: bigint,
  nameOf: (id: bigint) => string | null,
  onlineOf: (id: bigint) => boolean,
): string | null {
  const remaining = members
    .filter((member) => member.characterId !== leavingId)
    .map((member) => ({
      characterId: member.characterId,
      candidate: {
        online: onlineOf(member.characterId),
        joinedAtMicros: member.joinedAt.microsSinceUnixEpoch,
        memberId: member.id,
      },
    }))
    .sort((a, b) => successorOrder(a.candidate, b.candidate));
  if (remaining.length === 0) return null;
  const first = remaining[0];
  const name = nameOf(first.characterId);
  return name === null || name === '' ? null : name;
}
