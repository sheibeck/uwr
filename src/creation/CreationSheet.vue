<script setup lang="ts">
import { computed } from 'vue';
import { PhQuestion } from '@phosphor-icons/vue';
import type { SheetModel } from './sheetModel';

// The live character sheet (49-UI-SPEC "Live Character Sheet"): a pure rendering of the SheetModel.
// 'rail' is the desktop right rail (aside, heading, padding); 'sheet' is the body of the mobile
// Sheet, whose shell provides the title. The block order is fixed so rows never jump. Every
// string, including other players' race names, is a text node.
const props = defineProps<{ model: SheetModel; variant: 'rail' | 'sheet' }>();

const UNWRITTEN = 'Unwritten';
const UNWRITTEN_STAT = '—';

const isRail = computed(() => props.variant === 'rail');

const rows = computed(() => [
  { label: 'Race', value: props.model.raceName },
  { label: 'Archetype', value: props.model.archetype },
  { label: 'Class', value: props.model.className },
]);
</script>

<template>
  <component
    :is="isRail ? 'aside' : 'div'"
    class="sheet"
    :class="isRail ? 'rail' : 'body'"
    :aria-label="isRail ? 'Character sheet' : undefined"
  >
    <h6 v-if="isRail" class="heading">The ledger so far</h6>

    <div class="identity">
      <div class="avatar" aria-hidden="true">
        <PhQuestion v-if="props.model.avatarInitial === null" class="avatar-icon" :size="20" />
        <span v-else class="avatar-initial">{{ props.model.avatarInitial }}</span>
      </div>
      <div class="identity-text">
        <span
          class="name"
          :class="props.model.name === null ? 'unnamed' : 'named'"
          :title="props.model.name ?? undefined"
        >{{ props.model.name ?? 'Unnamed' }}</span>
        <span class="identity-line"><span
            :class="props.model.raceName === null ? 'unknown' : 'known'"
          >{{ props.model.raceName ?? 'race unwritten' }}</span><span class="sep">{{ ' · ' }}</span><span
            :class="props.model.className === null ? 'unknown' : 'known'"
          >{{ props.model.className ?? 'class unwritten' }}</span></span>
      </div>
    </div>

    <div class="block">
      <div v-for="row in rows" :key="row.label" class="row">
        <span class="row-label">{{ row.label }}</span>
        <span
          class="row-value"
          :class="{ unwritten: row.value === null }"
          :title="row.value ?? undefined"
        >{{ row.value ?? UNWRITTEN }}</span>
      </div>
    </div>

    <div class="block stats">
      <div v-for="stat in props.model.stats" :key="stat.key" class="row">
        <span class="row-label">{{ stat.label }}</span>
        <span class="stat-cell">
          <span
            class="stat-value"
            :class="{ boosted: stat.boosted, unwritten: stat.value === UNWRITTEN_STAT }"
            :aria-label="stat.ariaLabel"
          >{{ stat.value }}</span>
          <span v-if="stat.annotation !== null" class="annotation">{{ stat.annotation }}</span>
        </span>
      </div>
    </div>

    <hr class="hr" />

    <p v-if="props.model.trait !== null" class="trait"><span class="trait-text">{{ `“${props.model.trait}”` }}</span><span class="trait-suffix">{{ ' — racial trait' }}</span></p>

    <div v-if="props.model.abilityName !== null" class="block">
      <div class="row">
        <span class="row-label">Ability</span>
        <span class="row-value" :title="props.model.abilityName">{{ props.model.abilityName }}</span>
      </div>
    </div>
  </component>
</template>

<style scoped>
.sheet {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.sheet.rail {
  width: 288px;
  flex: none;
  min-height: 0;
  padding: 16px;
  overflow-y: auto;
  background: color-mix(in srgb, var(--color-surface) 30%, transparent);
}

.sheet.body {
  padding: 0;
}

.hr {
  margin: 0;
}

.heading {
  margin: 0;
  color: var(--color-neutral-400);
}

.identity {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.avatar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--color-accent-900);
  box-shadow: inset 0 0 0 1px var(--color-accent-700);
  color: var(--color-accent-300);
}

.avatar-initial {
  font-size: 20px;
  font-weight: 500;
  line-height: 1.12;
}

.identity-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.name {
  font-size: 20px;
  font-weight: 500;
  line-height: 1.12;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name.unnamed {
  color: var(--color-neutral-500);
}

.name.named {
  color: var(--color-text);
}

.identity-line {
  font-size: 12px;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-neutral-500);
}

.identity-line .known {
  color: var(--color-accent-300);
}

.identity-line .unknown {
  color: var(--color-neutral-500);
}

.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
}

.row-label {
  min-width: 0;
  color: var(--color-neutral-400);
}

.row-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-neutral-200);
}

.row-value.unwritten {
  color: var(--color-neutral-500);
}

.stats .row {
  font-variant-numeric: tabular-nums;
}

.stat-cell {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}

.stat-value {
  color: var(--color-neutral-200);
}

.stat-value.boosted {
  color: var(--color-accent-300);
}

.stat-value.unwritten {
  color: var(--color-neutral-600);
}

.annotation {
  color: var(--color-neutral-500);
}

.trait {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.trait-text {
  font-style: italic;
  color: var(--color-neutral-400);
}

.trait-suffix {
  color: var(--color-neutral-500);
}
</style>
