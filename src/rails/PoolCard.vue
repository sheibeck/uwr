<script setup lang="ts">
import { computed, useId } from 'vue';
import type { Component } from 'vue';
import { PhCrownSimple, PhHandGrabbing, PhSkull, PhSword, PhTarget } from '@phosphor-icons/vue';
import DensityBadge from './DensityBadge.vue';
import { familyIcon, resourceIcon } from './familyIcons';
import { NEARBY_COPY } from './pools';
import type { FamilyRow, NamedRow, ResourceRow } from './pools';

// One card shell for the Nearby pool rows (51.3.1.1 UI-SPEC "Nearby: Creatures", "Named & quest
// targets", "Resources"): an li holding a div, never a clickable div, with at most one button.
// - family: icon, name, Lv range with the con meaning, density badge, the density line, the group
//   hint and Pull (PhTarget). Level 0 keeps the card with no hint and no button.
// - named: icon (PhCrownSimple, PhSkull for a boss), name over the sub-line, and Fight (PhSword).
//   Slain: 45%, the slain line, no button. In combat elsewhere: Fight is aria-disabled.
// - resource: icon, name, badge, line, the visible disabled reason and Gather (PhHandGrabbing).
// No icon is shared between two actions (51.1 owner rule). The button's accessible name contains
// its visible label ('Pull Goblins') and is described by the line and the hint or reason. Names are
// server text: text nodes and bound attributes only. The card sends nothing itself: it emits 'act'
// and the list runs the console call (pending: aria-busy, offline: aria-disabled).
const props = defineProps<{
  variant: 'family' | 'named' | 'resource';
  row: FamilyRow | NamedRow | ResourceRow;
  /** Not connected: the button is aria-disabled. */
  offline?: boolean;
  /** The call is pending: the button is inert with aria-busy. */
  busy?: boolean;
}>();

const emit = defineEmits<{ act: [] }>();

const id = useId();
const lineId = `${id}-line`;
const hintId = `${id}-hint`;
const reasonId = `${id}-reason`;
const subId = `${id}-sub`;

const family = computed(() => (props.variant === 'family' ? (props.row as FamilyRow) : null));
const named = computed(() => (props.variant === 'named' ? (props.row as NamedRow) : null));
const resource = computed(() => (props.variant === 'resource' ? (props.row as ResourceRow) : null));

const icon = computed<Component>(() => {
  if (family.value) return familyIcon(family.value.iconKey);
  if (resource.value) return resourceIcon(resource.value.iconKey);
  return named.value?.boss ? PhSkull : PhCrownSimple;
});

const conClass = computed(() => {
  if (family.value) return family.value.con?.className;
  if (named.value && named.value.state !== 'slain') return named.value.con?.className;
  return undefined;
});

const badge = computed(() => {
  if (family.value) return { kind: 'creature' as const, level: family.value.badgeLevel, word: family.value.badgeWord };
  if (resource.value) return { kind: 'resource' as const, level: resource.value.badgeLevel, word: resource.value.badgeWord };
  return null;
});

const line = computed(() => family.value?.line ?? resource.value?.line ?? '');
const hint = computed(() => family.value?.hint ?? '');
const reason = computed(() => resource.value?.reason ?? null);

const action = computed<{ label: string; name: string; icon: Component; blocked: boolean } | null>(() => {
  if (family.value) {
    if (!family.value.pullable) return null;
    return { label: NEARBY_COPY.actions.pull, name: family.value.pullLabel, icon: PhTarget, blocked: false };
  }
  if (named.value) {
    if (named.value.state === 'slain') return null;
    return {
      label: NEARBY_COPY.actions.fight,
      name: named.value.fightLabel,
      icon: PhSword,
      blocked: !named.value.fightable,
    };
  }
  if (resource.value) {
    if (!resource.value.gatherable) return null;
    return {
      label: NEARBY_COPY.actions.gather,
      name: resource.value.gatherLabel,
      icon: PhHandGrabbing,
      blocked: resource.value.reason !== null,
    };
  }
  return null;
});

const disabled = computed(() => props.offline === true || action.value?.blocked === true);

const describedBy = computed(() => {
  if (named.value) return subId;
  const ids = [lineId];
  if (hint.value !== '') ids.push(hintId);
  if (reason.value !== null) ids.push(reasonId);
  return ids.join(' ');
});

function act(): void {
  if (disabled.value || props.busy === true) return;
  emit('act');
}
</script>

<template>
  <li class="pool-card nearby-item" :class="[`variant-${variant}`, { slain: named?.state === 'slain' }]">
    <div v-if="named" class="card card-named">
      <component :is="icon" class="card-icon" :class="conClass" :size="14" aria-hidden="true" />
      <div class="card-col">
        <span class="card-name" :class="conClass" :title="named.title">{{ named.name }}</span>
        <span :id="subId" class="card-sub" :title="named.subLine">{{ named.subLine }}</span>
      </div>
      <button
        v-if="action"
        type="button"
        class="btn btn-secondary card-action"
        :aria-label="action.name"
        :aria-describedby="describedBy"
        :aria-disabled="disabled ? 'true' : undefined"
        :aria-busy="busy ? 'true' : undefined"
        @click="act"
      >
        <component :is="action.icon" :size="14" aria-hidden="true" />
        <span>{{ action.label }}</span>
      </button>
    </div>
    <div v-else class="card">
      <div class="card-head">
        <component
          :is="icon"
          class="card-icon"
          :class="family ? conClass : 'resource-icon'"
          :size="14"
          aria-hidden="true"
        />
        <span v-if="family" class="card-name" :class="conClass" :title="family.title">{{ family.name }}</span>
        <span v-else-if="resource" class="card-name" :title="resource.title">{{ resource.name }}</span>
        <span v-if="family" class="card-range"
          >{{ family.levelText
          }}<span v-if="family.con" class="sr-only">, {{ family.con.meaning }}</span></span
        >
        <DensityBadge v-if="badge" class="card-badge" :kind="badge.kind" :level="badge.level" :word="badge.word" />
      </div>
      <p :id="lineId" class="card-line">{{ line }}</p>
      <div v-if="hint !== '' || reason !== null || action" class="card-foot">
        <span v-if="hint !== ''" :id="hintId" class="card-hint">{{ hint }}</span>
        <span v-if="reason !== null" :id="reasonId" class="card-reason">{{ reason }}</span>
        <button
          v-if="action"
          type="button"
          class="btn btn-secondary card-action"
          :aria-label="action.name"
          :aria-describedby="describedBy"
          :aria-disabled="disabled ? 'true' : undefined"
          :aria-busy="busy ? 'true' : undefined"
          @click="act"
        >
          <component :is="action.icon" :size="14" aria-hidden="true" />
          <span>{{ action.label }}</span>
        </button>
      </div>
    </div>
  </li>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.pool-card {
  min-width: 0;
}

.pool-card.slain {
  opacity: 0.45;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 8px;
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.card-named {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.card-icon {
  flex: none;
}

.resource-icon {
  color: var(--color-stamina);
}

.card-col {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

/* At a 256px rail the name gives way first (ellipsis), then the range; the badge and the button never shrink. */
.card-name {
  flex-shrink: 100;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
}

.card-range {
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
}

.card-badge {
  margin-left: auto;
}

.card-line {
  margin: 0;
  font-size: 12px;
  font-style: italic;
  color: var(--color-neutral-300);
  overflow-wrap: anywhere;
}

.card-sub {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--color-neutral-400);
}

.card-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.card-hint {
  font-size: 10px;
  color: var(--color-neutral-500);
}

.card-reason {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 10px;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.card-action {
  flex: none;
  gap: 4px;
  min-height: 28px;
  margin-left: auto;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 500;
}

.card-action[aria-disabled='true'] {
  opacity: 0.45;
  cursor: not-allowed;
}

.card-action[aria-busy='true'] {
  cursor: progress;
}

.slain .card-name,
.slain .card-icon {
  color: var(--color-neutral-500);
}

.con-gray {
  color: var(--color-con-gray);
}

.con-light-green {
  color: var(--color-con-light-green);
}

.con-blue {
  color: var(--color-con-blue);
}

.con-white {
  color: var(--color-con-white);
}

.con-yellow {
  color: var(--color-con-yellow);
}

.con-orange {
  color: var(--color-con-orange);
}

.con-red {
  color: var(--color-con-red);
}

@media (max-width: 899px) {
  .card-action {
    min-height: 44px;
  }
}
</style>
