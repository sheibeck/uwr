<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue';
import type { Component } from 'vue';
import {
  PhChatCircleDots,
  PhCrownSimple,
  PhEye,
  PhFootprints,
  PhHeart,
  PhSignOut,
  PhUserMinus,
  PhUserPlus,
  PhXCircle,
} from '@phosphor-icons/vue';
import InlineConfirm from '../ledger/InlineConfirm.vue';
import CharacterName from './CharacterName.vue';
import { menuPosition } from './menuPosition';
import type { MenuAnchor } from './menuPosition';
import type { MenuAction, MenuEntry, MenuGroup, MenuIcon } from './playerMenu';

// The party and player menu renderer (51.1-UI-SPEC "Party and Player Menus"). It draws whatever
// ordered entry groups it receives, with a separator only between non-empty groups, so a later
// group (52.2's guild entries) needs no change here. Desktop: a fixed popover beside the opener.
// The keyboard rules live on the panel: arrows wrap (disabled items included, so their reasons
// are reachable), Home and End jump, Escape closes without reaching a drawer or sheet behind, Tab
// closes and lets focus move on. Entries with a confirm swap the items for an InlineConfirm.
// Names are player text and render as text nodes only; labels and hints are fixed copy.
const props = defineProps<{
  groups: MenuGroup[];
  header: { name: string; you: boolean; line: string };
  mobile: boolean;
  menuId: string;
  anchor: MenuAnchor | null;
  side: 'right' | 'left';
  initialFocus: 'first' | 'last';
  pendingAction: MenuAction | null;
}>();
const emit = defineEmits<{ select: [entry: MenuEntry]; close: [returnFocus: boolean] }>();

const ICONS: Record<MenuIcon, Component> = {
  userPlus: PhUserPlus,
  xCircle: PhXCircle,
  chatCircleDots: PhChatCircleDots,
  eye: PhEye,
  heart: PhHeart,
  crownSimple: PhCrownSimple,
  userMinus: PhUserMinus,
  footprints: PhFootprints,
  signOut: PhSignOut,
};

const nameId = useId();
const panel = ref<HTMLElement | null>(null);
const list = ref<HTMLElement | null>(null);

const shown = computed(() => props.groups.filter((group) => group.entries.length > 0));
const entries = computed(() => shown.value.flatMap((group) => group.entries));

// The entry whose inline confirm is open, by action, so a re-derived entry (new prompt) is used.
const confirmingAction = ref<MenuAction | null>(null);
const confirming = computed(
  () => entries.value.find((entry) => entry.action === confirmingAction.value && entry.confirm !== null) ?? null,
);

// An entry that disappears while its confirm is open drops the confirm.
watch(confirming, (entry) => {
  if (entry === null) confirmingAction.value = null;
});

function isPending(entry: MenuEntry): boolean {
  return props.pendingAction !== null && props.pendingAction === entry.action;
}

function inert(entry: MenuEntry): boolean {
  return entry.disabled || isPending(entry);
}

function accessibleName(entry: MenuEntry): string | undefined {
  return entry.hint === null ? undefined : `${entry.label}, ${entry.hint}`;
}

function items(): HTMLElement[] {
  return list.value ? Array.from(list.value.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
}

function focusItem(action: MenuAction): void {
  items()
    .find((item) => item.dataset.action === action)
    ?.focus();
}

function focusInitial(): void {
  const enabled = entries.value.filter((entry) => !entry.disabled);
  const target = props.initialFocus === 'last' ? enabled[enabled.length - 1] : enabled[0];
  if (target) focusItem(target.action);
  else items()[0]?.focus();
}

// Placement (desktop): fixed, from the opener's rectangle and the panel's measured height.
function placementFor(height: number): { top: number; left: number } {
  if (props.anchor === null) return { top: 8, left: 8 };
  return menuPosition({
    anchor: props.anchor,
    side: props.side,
    height,
    viewport: { width: window.innerWidth, height: window.innerHeight },
  });
}

// The first render uses height 0; the mounted panel's measured height refines it before paint.
const placement = ref<{ top: number; left: number }>(placementFor(0));

function place(): void {
  if (props.mobile) return;
  placement.value = placementFor(panel.value?.offsetHeight ?? 0);
}

const panelStyle = computed(() =>
  props.mobile ? undefined : { top: `${placement.value.top}px`, left: `${placement.value.left}px` },
);

watch([shown, confirmingAction], () => {
  void nextTick(place);
});

onMounted(() => {
  place();
  focusInitial();
});

function choose(entry: MenuEntry): void {
  if (inert(entry)) return;
  if (entry.confirm !== null) {
    confirmingAction.value = entry.action;
    return;
  }
  emit('select', entry);
}

function onConfirm(): void {
  const entry = confirming.value;
  if (entry === null || isPending(entry)) return;
  emit('select', entry);
}

function onKeep(): void {
  const action = confirmingAction.value;
  confirmingAction.value = null;
  if (action !== null) void nextTick(() => focusItem(action));
}

function moveFocus(event: KeyboardEvent): void {
  const all = items();
  if (all.length === 0) return;
  const index = all.indexOf(document.activeElement as HTMLElement);
  let next: number;
  if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = all.length - 1;
  else if (event.key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % all.length;
  else next = index < 0 ? all.length - 1 : (index - 1 + all.length) % all.length;
  event.preventDefault();
  all[next].focus();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    // The inline confirm took this Escape (it returns to the items); keep it from a drawer behind.
    if (event.defaultPrevented) {
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    emit('close', true);
    return;
  }
  if (event.key === 'Tab') {
    emit('close', false);
    return;
  }
  if (confirming.value !== null) return;
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) moveFocus(event);
}
</script>

<template>
  <div
    :id="props.menuId"
    ref="panel"
    class="menu-panel"
    :style="panelStyle"
    @keydown="onKeydown"
  >
    <div class="menu-head">
      <span :id="nameId" class="head-name">
        <CharacterName :name="props.header.name" />
        <span v-if="props.header.you" class="head-you">{{ ' you' }}</span>
      </span>
      <span v-if="props.header.line !== ''" class="head-line">{{ props.header.line }}</span>
    </div>
    <div v-if="confirming === null" ref="list" role="menu" :aria-labelledby="nameId" class="menu-list">
      <template v-for="(group, index) in shown" :key="group.key">
        <div v-if="index > 0" role="separator" class="menu-sep"></div>
        <button
          v-for="entry in group.entries"
          :key="entry.action"
          type="button"
          role="menuitem"
          class="menu-item"
          :class="[`tone-${entry.tone}`, { pending: isPending(entry) }]"
          :data-action="entry.action"
          :aria-disabled="inert(entry) ? 'true' : undefined"
          :aria-label="accessibleName(entry)"
          @click="choose(entry)"
        >
          <component :is="ICONS[entry.icon]" :size="16" class="item-icon" aria-hidden="true" />
          <span class="item-label">{{ entry.label }}</span>
          <span v-if="entry.hint !== null" class="item-hint" aria-hidden="true">{{ entry.hint }}</span>
        </button>
      </template>
    </div>
    <div v-else class="menu-confirm">
      <InlineConfirm
        :prompt="confirming.confirm?.prompt ?? ''"
        :confirm-label="confirming.confirm?.confirmLabel ?? ''"
        :keep-label="confirming.confirm?.keepLabel ?? ''"
        :pending="isPending(confirming)"
        :mobile="props.mobile"
        @confirm="onConfirm"
        @keep="onKeep"
      />
    </div>
  </div>
</template>

<style scoped>
.menu-panel {
  position: fixed;
  z-index: 40;
  box-sizing: border-box;
  width: 224px;
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  padding: 4px;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow:
    inset 0 0 0 1px var(--color-neutral-800),
    var(--shadow-lg);
}

.menu-head {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 8px;
}

/* The name wraps in the header (long names), unlike the one-line rows. */
.head-name {
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.head-name :deep(.character-name),
.head-name :deep(.name) {
  white-space: normal;
  overflow: visible;
}

.head-you {
  font-size: 10px;
  font-weight: 400;
  color: var(--color-neutral-500);
}

.head-line {
  font-size: 10px;
  color: var(--color-neutral-500);
  overflow-wrap: anywhere;
}

.menu-list {
  display: flex;
  flex-direction: column;
}

.menu-sep {
  height: 1px;
  margin: 4px 8px;
  background: var(--color-neutral-800);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-neutral-200);
  font: inherit;
  font-size: 12px;
  font-weight: 400;
  text-align: left;
  cursor: pointer;
}

.menu-item:hover,
.menu-item:focus {
  background: var(--color-accent-900);
}

.menu-item:active {
  background: color-mix(in srgb, var(--color-text) 14%, var(--color-accent-900));
}

.menu-item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.item-icon {
  flex: none;
}

.item-label {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.item-hint {
  flex: none;
  margin-left: auto;
  font-size: 10px;
  color: var(--color-neutral-500);
}

.tone-accent .item-icon {
  color: var(--color-accent-200);
}

.tone-danger {
  color: var(--color-con-red);
}

.menu-item[aria-disabled='true'] {
  color: var(--color-neutral-600);
  cursor: default;
}

.menu-item[aria-disabled='true'] .item-icon {
  color: inherit;
}

.menu-confirm {
  padding: 8px;
}
</style>
