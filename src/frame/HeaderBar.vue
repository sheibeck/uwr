<script setup lang="ts">
import { PhArrowFatUp, PhMapPin, PhMoonStars, PhSun } from '@phosphor-icons/vue';
import { HEADER_SCREENS, type ScreenId } from '../screens/screens';
import AccountMenu from './AccountMenu.vue';

const props = defineProps<{
  placeLabel: string;
  timeOfDay: 'day' | 'night' | null;
  levelUp: boolean;
  newSkill: boolean;
  activeScreen: ScreenId | null;
  characterName: string;
  accountLine: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'toggle-screen': [screen: ScreenId, opener: HTMLElement];
  logout: [];
}>();

function onScreenClick(id: ScreenId, event: MouseEvent) {
  emit('toggle-screen', id, event.currentTarget as HTMLElement);
}
</script>

<template>
  <header class="header-bar">
    <span class="brand">Unwritten Realms</span>
    <span class="divider" aria-hidden="true"></span>
    <span class="location">
      <PhMapPin class="location-icon" :size="14" aria-hidden="true" />
      <span class="place" :title="props.placeLabel">{{ props.placeLabel }}</span>
    </span>
    <span v-if="props.timeOfDay" class="time">
      <PhSun v-if="props.timeOfDay === 'day'" :size="14" aria-hidden="true" />
      <PhMoonStars v-else :size="14" aria-hidden="true" />
      {{ props.timeOfDay === 'day' ? 'Day' : 'Night' }}
    </span>
    <span class="spacer"></span>
    <span v-if="props.levelUp || props.newSkill" class="tags">
      <span v-if="props.levelUp" class="tag tag-outline"><PhArrowFatUp :size="12" aria-hidden="true" />Level up</span>
      <span v-if="props.newSkill" class="tag tag-accent">New skill</span>
    </span>
    <nav class="screens" aria-label="Screens">
      <button
        v-for="def in HEADER_SCREENS"
        :key="def.id"
        type="button"
        class="btn btn-ghost screen-btn"
        :class="{ open: props.activeScreen === def.id }"
        :data-screen="def.id"
        :aria-pressed="props.activeScreen === def.id ? 'true' : 'false'"
        :aria-label="def.label"
        :title="def.label"
        :disabled="props.disabled"
        @click="onScreenClick(def.id, $event)"
      >
        <component :is="def.icon" :size="16" aria-hidden="true" />
        <span class="screen-label">{{ def.label }}</span>
      </button>
    </nav>
    <AccountMenu
      :character-name="props.characterName"
      :account-line="props.accountLine"
      @logout="emit('logout')"
    />
  </header>
</template>

<style scoped>
.header-bar {
  height: 48px;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  container-type: inline-size;
  background: color-mix(in srgb, var(--color-surface) 55%, transparent);
  flex-shrink: 0;
}
.header-bar > * {
  flex-shrink: 0;
}
.brand {
  font-size: 14px;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: var(--color-text);
  white-space: nowrap;
}
.divider {
  width: 1px;
  height: 18px;
  background: var(--color-divider);
}
.header-bar > .location {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex-shrink: 1;
  font-size: 14px;
  font-weight: 400;
  color: var(--color-neutral-300);
}
.location-icon {
  flex-shrink: 0;
  color: var(--color-accent);
}
.place {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.time {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 400;
  color: var(--color-neutral-500);
  white-space: nowrap;
}
.spacer {
  flex: 1;
  min-width: 0;
}
.tags {
  display: flex;
  align-items: center;
  gap: 4px;
}
.tags .tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.screens {
  display: flex;
  align-items: center;
  gap: 4px;
}
.screen-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 14px;
  font-weight: 400;
  color: var(--color-neutral-300);
}
.screen-btn.open {
  color: var(--color-accent);
  background: var(--color-accent-900);
}
@container (max-width: 1099px) {
  .screen-label {
    display: none;
  }
}
</style>
