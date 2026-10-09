<script setup lang="ts">
import type { RoleView } from './roles';

// The role chip on an enemy card (51.3.1.1 UI-SPEC "Enemy card", D-40): a span holding the role icon
// (12, aria-hidden) and the uppercase word. Colours come from existing tokens only (Color table); the
// word is always shown, so colour is never the only cue. Not interactive: it sits inside the card
// button as a phrasing element.
withDefaults(defineProps<{ role: RoleView; variant?: 'rail' | 'sheet' }>(), { variant: 'rail' });
</script>

<template>
  <span class="role-chip" :class="[role.cls, { sheet: variant === 'sheet' }]">
    <component :is="role.icon" class="role-icon" :size="12" aria-hidden="true" />
    <span class="role-word">{{ role.word }}</span>
  </span>
</template>

<style scoped>
.role-chip {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  padding: 0 4px;
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  font-size: 10px;
  font-weight: 500;
  line-height: 16px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
}

.role-chip.sheet {
  background: var(--color-surface);
}

.role-icon {
  flex-shrink: 0;
}

.role-tank {
  color: var(--color-neutral-200);
}

.role-damage {
  color: var(--color-con-orange);
}

.role-caster {
  color: var(--color-line-npc);
}

.role-support {
  color: var(--color-con-light-green);
}

.role-named {
  color: var(--color-line-quest);
}

.role-boss {
  color: var(--color-con-red);
}
</style>
