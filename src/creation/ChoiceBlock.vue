<script setup lang="ts">
import { computed } from 'vue';
import type { Component } from 'vue';
import { PhMagicWand, PhSword } from '@phosphor-icons/vue';
import { abilityIcon } from '../hotbar/hotbar';
import type { AbilityCard } from './abilityCards';
import { ARCHETYPE_CHOICES } from './creationControls';
import { NO_RACES_LINE } from './raceCards';
import type { RaceCard } from './raceCards';

// The choice block in the creation feed (49-UI-SPEC "Choice block", "Race Cards", "Archetype
// Cards", "Class Reveal"): race, archetype and ability cards as whole-card buttons. A click emits
// the exact text the server expects. Cards are never preselected. Every string is a text node.
const props = defineProps<{
  kind: 'race' | 'archetype' | 'ability';
  raceCards?: RaceCard[] | null;
  abilityCards?: AbilityCard[];
  inert: boolean;
  desktop: boolean;
}>();
const emit = defineEmits<{ choose: [text: string] }>();

interface CardView {
  key: string;
  name: string;
  description: string;
  tags: string[];
  ariaLabel: string;
  sends: string;
  icon: Component | null;
  iconClass: string;
}

const ARCHETYPE_ICONS: Record<'sword' | 'wand', { icon: Component; iconClass: string }> = {
  sword: { icon: PhSword, iconClass: 'archetype-icon icon-sword' },
  wand: { icon: PhMagicWand, iconClass: 'archetype-icon icon-wand' },
};

const GROUP_LABELS = {
  race: 'Race suggestions',
  archetype: 'Archetype',
  ability: 'Starting ability',
} as const;

const cards = computed<CardView[]>(() => {
  if (props.kind === 'race') {
    return (props.raceCards ?? []).map((card) => ({
      key: `race:${card.id.toString()}`,
      name: card.name,
      description: card.description,
      tags: card.tags,
      ariaLabel: card.ariaLabel,
      sends: card.sends,
      icon: null,
      iconClass: '',
    }));
  }
  if (props.kind === 'archetype') {
    return ARCHETYPE_CHOICES.map((choice) => ({
      key: `archetype:${choice.id}`,
      name: choice.name,
      description: choice.description,
      tags: [],
      ariaLabel: choice.ariaLabel,
      sends: choice.sends,
      icon: ARCHETYPE_ICONS[choice.icon].icon,
      iconClass: ARCHETYPE_ICONS[choice.icon].iconClass,
    }));
  }
  return (props.abilityCards ?? []).map((card) => ({
    key: `ability:${card.key}`,
    name: card.name,
    description: card.description,
    tags: card.tags,
    ariaLabel: card.ariaLabel,
    sends: card.sends,
    icon: abilityIcon(card.kind),
    iconClass: 'ability-icon',
  }));
});

// Nothing renders before the race subscription applied (null) or for an empty ability list.
const showNoRaces = computed(
  () => props.kind === 'race' && props.raceCards !== null && props.raceCards !== undefined && props.raceCards.length === 0,
);
const visible = computed(() => showNoRaces.value || cards.value.length > 0);

function choose(card: CardView): void {
  if (props.inert) return;
  emit('choose', card.sends);
}
</script>

<template>
  <div v-if="visible" class="choice-block">
    <p v-if="showNoRaces" class="empty-line">{{ NO_RACES_LINE }}</p>
    <div
      v-else
      role="group"
      class="grid"
      :class="[
        props.desktop ? 'grid-multi' : 'grid-single',
        props.kind === 'archetype' ? 'cols-2' : 'cols-3',
      ]"
      :aria-label="GROUP_LABELS[props.kind]"
    >
      <button
        v-for="card in cards"
        :key="card.key"
        type="button"
        class="choice-card"
        :class="{ inert: props.inert }"
        :aria-label="card.ariaLabel"
        :aria-disabled="props.inert ? 'true' : undefined"
        @click="choose(card)"
      >
        <span class="name-row">
          <component :is="card.icon" v-if="card.icon" class="card-icon" :class="card.iconClass" :size="16" aria-hidden="true" />
          <span class="name" :title="card.name">{{ card.name }}</span>
          <span v-if="!props.desktop && card.tags.length > 0" class="tags tags-inline">
            <span v-for="(tag, index) in card.tags" :key="`${index}:${tag}`" class="tag tag-neutral">{{ tag }}</span>
          </span>
        </span>
        <span v-if="card.description !== ''" class="description">{{ card.description }}</span>
        <span v-if="props.desktop && card.tags.length > 0" class="tags">
          <span v-for="(tag, index) in card.tags" :key="`${index}:${tag}`" class="tag tag-neutral">{{ tag }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.choice-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.empty-line {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}

.grid {
  display: grid;
  gap: 8px;
  justify-content: start;
  min-width: 0;
}

.grid-single {
  grid-template-columns: minmax(0, 1fr);
}

.grid-multi.cols-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.grid-multi.cols-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.choice-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  min-height: 44px;
  padding: 16px;
  text-align: left;
  cursor: pointer;
  color: var(--color-text);
  background: var(--color-surface);
  border: 0;
  border-radius: var(--radius-md);
}

.grid-multi .choice-card {
  gap: 8px;
}

.choice-card:hover {
  background: color-mix(in srgb, var(--color-text) 7%, var(--color-surface));
}

.choice-card:active {
  background: color-mix(in srgb, var(--color-text) 14%, var(--color-surface));
}

.choice-card:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.choice-card.inert {
  opacity: 0.45;
  cursor: default;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.card-icon {
  flex: none;
}

.archetype-icon {
  color: var(--color-neutral-300);
}

.ability-icon {
  color: var(--color-accent-300);
}

.name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.description {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-300);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tags-inline {
  flex: none;
  justify-content: flex-end;
}
</style>
