<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { PhDotsThree } from '@phosphor-icons/vue';
import {
  CONSOLE_KEY,
  FRAME_KEY,
  GAME_KEY,
  createInertConsole,
  createInertFrame,
  createInertGame,
} from '../game/context';
import type { Character } from '../module_bindings/types';
import { focusLost } from '../ledger/keepFocus';
import ActionMenu from './ActionMenu.vue';
import type { MenuAnchor } from './menuPosition';
import { claimMenu, newMenuId, releaseMenu } from './menuRegistry';
import { nextLeaderName, playerMenuEntries, playerMenuHeader } from './playerMenu';
import type { MenuAction, MenuEntry, MenuGroup, MenuPerson, PlayerMenuInput } from './playerMenu';
import { SOCIAL_KEY, createInertSocial } from './socialContext';
import { usePartyActions } from './usePartyActions';

// The ⋯ opener and its menu for one character (51.1-UI-SPEC "Party and Player Menus"). Hosts
// mount it as a sibling of their target element (never inside another button) and may call the
// exposed open() from a contextmenu handler. The entries come from the applied rows through
// playerMenuEntries, so they re-derive while the menu is open; with no entries (yourself while
// solo, an unknown character) nothing renders. Actions go through the shared party action layer;
// a rejected call prints the shared send-error line once. Opening a menu closes any other
// (menuRegistry). If the opener disappears while it holds focus, focus moves to fallbackFocus().
const props = withDefaults(
  defineProps<{
    targetId: bigint;
    side?: 'right' | 'left';
    size?: 'rail' | 'sheet';
    fallbackFocus?: () => HTMLElement | null;
  }>(),
  { side: 'right', size: 'rail', fallbackFocus: undefined },
);

const game = inject(GAME_KEY, createInertGame());
const social = inject(SOCIAL_KEY, createInertSocial());
const consoleApi = inject(CONSOLE_KEY, createInertConsole());
const frame = inject(FRAME_KEY, createInertFrame());

// A rejected reducer promise prints the shared send error line in the feed (usePartyActions).
const { runner, actions } = usePartyActions(game, consoleApi);

const menuId = newMenuId();
const root = ref<HTMLElement | null>(null);
const opener = ref<HTMLButtonElement | null>(null);

// Your own row, then the players here, the party's known characters and the social hub's rows.
function characterRow(id: bigint): Character | null {
  const own = game.character.value;
  if (own !== null && own.id === id) return own;
  return (
    game.playersHere.value.find((row) => row.id === id) ??
    game.knownCharacters.value.find((row) => row.id === id) ??
    social.characterById(id)
  );
}

function person(row: Character): MenuPerson {
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    race: row.race,
    className: row.className,
    locationId: row.locationId,
    online: row.online === true,
    groupId: row.groupId ?? null,
  };
}

const input = computed<PlayerMenuInput | null>(() => {
  const own = game.character.value;
  if (own === null) return null;
  const target = characterRow(props.targetId);
  const group = game.group.value;
  const members = group === null ? [] : game.groupMembers.value.filter((row) => row.groupId === group.id);
  const mine = members.find((row) => row.characterId === own.id) ?? null;
  const liveOutgoing =
    group === null
      ? []
      : social.outgoingInvites.value
          .filter((invite) => social.inviteSecondsLeft(invite) > 0)
          .map((invite) => ({ toCharacterId: invite.toCharacterId, fromCharacterId: invite.fromCharacterId }));
  return {
    self: person(own),
    target: target === null ? null : person(target),
    group: group === null ? null : { id: group.id, leaderCharacterId: group.leaderCharacterId },
    memberCount: Math.max(1, members.length),
    liveOutgoing,
    selfFollowLeader: mine === null ? null : mine.followLeader,
    nextLeaderName:
      group === null
        ? null
        : nextLeaderName(
            members,
            own.id,
            (id) => characterRow(id)?.name ?? null,
            (id) => characterRow(id)?.online === true,
          ),
  };
});

const groups = computed<MenuGroup[]>(() => (input.value === null ? [] : playerMenuEntries(input.value)));
const header = computed(() =>
  input.value === null ? { name: '', you: false, line: '' } : playerMenuHeader(input.value),
);
const targetName = computed(() => input.value?.target?.name ?? '');
const visible = computed(() => groups.value.length > 0);
const label = computed(() => (header.value.you ? 'Actions for yourself' : `Actions for ${targetName.value}`));
const mobile = computed(() => !frame.isDesktop.value);

// The entry whose call is in flight (from the runner), so the menu shows it inert.
const pendingAction = computed<MenuAction | null>(() => {
  const name = targetName.value;
  const all = groups.value.flatMap((group) => group.entries);
  return all.find((entry) => runner.isPending(actions.keyFor(entry.action, name)))?.action ?? null;
});

const open = ref(false);
const anchor = ref<MenuAnchor | null>(null);
const initialFocus = ref<'first' | 'last'>('first');
// Bumps on every open, so a call that settles after the menu was closed (or reopened) leaves it.
let session = 0;

function focusInside(): boolean {
  const active = document.activeElement;
  return root.value !== null && active instanceof Node && root.value.contains(active);
}

function onPointerDown(event: Event): void {
  const target = event.target as Node | null;
  if (target && root.value && !root.value.contains(target)) closeMenu(true);
}

function stopListening(): void {
  document.removeEventListener('pointerdown', onPointerDown);
}

function openMenu(focus: 'first' | 'last' = 'first'): void {
  if (!visible.value || open.value) return;
  const rect = opener.value?.getBoundingClientRect();
  anchor.value = rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null;
  initialFocus.value = focus;
  claimMenu(menuId, () => closeMenu(false));
  session += 1;
  open.value = true;
  document.addEventListener('pointerdown', onPointerDown);
}

function closeMenu(returnFocus: boolean): void {
  if (!open.value) return;
  open.value = false;
  releaseMenu(menuId);
  stopListening();
  if (returnFocus) opener.value?.focus();
}

// Tab (close without focus return) still hands focus to the opener first, so the browser's Tab
// moves on from the ⋯ rather than from a menu item that is about to be removed.
function onMenuClose(returnFocus: boolean): void {
  const inside = focusInside();
  closeMenu(returnFocus);
  if (!returnFocus && inside) opener.value?.focus();
}

function toggle(): void {
  if (open.value) closeMenu(true);
  else openMenu('first');
}

function onOpenerKeydown(event: KeyboardEvent): void {
  if (open.value) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    }
    return;
  }
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
    event.preventDefault();
    openMenu('first');
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    openMenu('last');
  }
}

async function onSelect(entry: MenuEntry): Promise<void> {
  if (entry.disabled || pendingAction.value === entry.action) return;
  const name = targetName.value;
  const started = session;
  if (entry.action === 'whisper') {
    // Whisper focuses the composer instead of the opener.
    closeMenu(false);
    await actions.perform(entry.action, name);
    return;
  }
  await actions.perform(entry.action, name);
  if (open.value && session === started) closeMenu(true);
}

// Deferred until the DOM settles, so a host's own rule (keepFocus: the next row's control) goes
// first; the fallback (a heading) applies only when focus is still lost.
function moveToFallback(): void {
  void nextTick(() => {
    if (focusLost()) props.fallbackFocus?.()?.focus();
  });
}

// The opener disappears (the member left, the row is gone): close, and move focus if it was here.
watch(visible, (isVisible) => {
  if (isVisible) return;
  const hadFocus = focusInside();
  closeMenu(false);
  if (hadFocus) moveToFallback();
});

onBeforeUnmount(() => {
  const hadFocus = focusInside();
  if (open.value) {
    open.value = false;
    releaseMenu(menuId);
  }
  stopListening();
  if (hadFocus) moveToFallback();
});

defineExpose({
  open: (focus: 'first' | 'last' = 'first') => openMenu(focus),
  close: () => closeMenu(false),
});
</script>

<template>
  <div v-if="visible" ref="root" class="player-menu">
    <button
      ref="opener"
      type="button"
      class="btn btn-ghost btn-icon menu-opener"
      :class="{ sheet: props.size === 'sheet' }"
      :aria-label="label"
      :title="label"
      aria-haspopup="menu"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="open ? menuId : undefined"
      @click="toggle"
      @keydown="onOpenerKeydown"
    >
      <PhDotsThree :size="16" aria-hidden="true" />
    </button>
    <ActionMenu
      v-if="open"
      :groups="groups"
      :header="header"
      :mobile="mobile"
      :menu-id="menuId"
      :anchor="anchor"
      :side="props.side"
      :initial-focus="initialFocus"
      :pending-action="pendingAction"
      @select="onSelect"
      @close="onMenuClose"
    />
  </div>
</template>

<style scoped>
.player-menu {
  display: inline-flex;
  flex: none;
}

.menu-opener {
  width: 28px;
  height: 28px;
  color: var(--color-neutral-300);
}

.menu-opener.sheet {
  width: 44px;
  height: 44px;
}

/* An open menu keeps the opener's hover fill. */
.menu-opener[aria-expanded='true'] {
  background: color-mix(in srgb, var(--color-accent) 10%, transparent);
}
</style>
