<script setup lang="ts">
import { PhSignOut } from '@phosphor-icons/vue';

defineProps<{ title: string }>();
const emit = defineEmits<{ logout: [] }>();
</script>

<template>
  <header class="pre-frame">
    <span class="brand">Unwritten Realms</span>
    <span class="divider" aria-hidden="true"></span>
    <span class="title">{{ title }}</span>
    <span class="spacer"></span>
    <button type="button" class="btn btn-ghost logout" @click="emit('logout')">
      <PhSignOut :size="16" aria-hidden="true" />
      Log out
    </button>
  </header>
</template>

<style scoped>
.pre-frame {
  height: 48px;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  background: color-mix(in srgb, var(--color-surface) 55%, transparent);
}
.brand {
  font-size: 14px;
  font-weight: 500;
}
.divider {
  width: 1px;
  height: 18px;
  background: var(--color-divider);
}
@media (max-width: 899px) {
  .brand,
  .divider {
    display: none;
  }
}
.title {
  font-size: 14px;
  color: var(--color-neutral-400);
}
.spacer {
  flex: 1;
}
.logout {
  color: var(--color-neutral-300);
}
</style>
