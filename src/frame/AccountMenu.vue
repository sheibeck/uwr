<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { PhDotsThree, PhSignOut } from '@phosphor-icons/vue';

const props = defineProps<{ characterName: string; accountLine: string }>();
const emit = defineEmits<{ logout: [] }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const button = ref<HTMLButtonElement | null>(null);
const menu = ref<HTMLElement | null>(null);

function items(): HTMLElement[] {
  return menu.value ? Array.from(menu.value.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
}

function closeMenu(returnFocus: boolean) {
  open.value = false;
  if (returnFocus) button.value?.focus();
}

function toggle() {
  if (open.value) closeMenu(true);
  else open.value = true;
}

function onPointerDown(event: Event) {
  const target = event.target as Node | null;
  if (target && root.value && !root.value.contains(target)) closeMenu(true);
}

function onKeydown(event: KeyboardEvent) {
  if (!open.value) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeMenu(true);
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const list = items();
    if (list.length === 0) return;
    event.preventDefault();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = (index + step + list.length) % list.length;
    list[next].focus();
  }
}

function logout() {
  closeMenu(false);
  emit('logout');
}

watch(open, async (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onPointerDown);
    await nextTick();
    items()[0]?.focus();
  } else {
    document.removeEventListener('pointerdown', onPointerDown);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown);
});
</script>

<template>
  <div ref="root" class="account-menu" @keydown="onKeydown">
    <button
      ref="button"
      type="button"
      class="btn btn-ghost btn-icon"
      aria-label="Account menu"
      title="Account menu"
      aria-haspopup="menu"
      :aria-expanded="open ? 'true' : 'false'"
      @click="toggle"
    >
      <PhDotsThree :size="16" aria-hidden="true" />
    </button>
    <div v-if="open" ref="menu" class="card elev-md menu" role="menu">
      <div class="menu-head">
        <div class="menu-name" :title="props.characterName">{{ props.characterName }}</div>
        <div class="menu-line" :title="props.accountLine">{{ props.accountLine }}</div>
      </div>
      <div class="hr" role="separator"></div>
      <button type="button" role="menuitem" class="menu-item" @click="logout">
        <PhSignOut :size="16" aria-hidden="true" />
        Log out
      </button>
    </div>
  </div>
</template>

<style scoped>
.account-menu {
  position: relative;
  flex-shrink: 0;
}
.menu {
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 4px;
  width: 200px;
  z-index: 20;
  padding: 0;
  overflow: hidden;
}
.menu-head {
  padding: 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}
.menu-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.menu-line {
  font-size: 12px;
  font-weight: 400;
  color: var(--color-neutral-400);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 36px;
  padding: 0 16px;
  border: 0;
  background: transparent;
  color: var(--color-neutral-200);
  font-size: 14px;
  font-weight: 400;
  text-align: left;
  cursor: pointer;
}
.menu-item:active {
  background: color-mix(in srgb, var(--color-text) 14%, transparent);
}
.menu-item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
@media (hover: hover) {
  .menu-item:hover {
    background: color-mix(in srgb, var(--color-text) 7%, transparent);
  }
}
</style>
