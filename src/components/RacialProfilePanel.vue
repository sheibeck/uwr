<template>
  <div :style="styles.panelBody">
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to view racial profile.
    </div>
    <div v-else-if="!race" :style="styles.subtle">
      No race data found.
    </div>
    <div v-else>
      <!-- Race header -->
      <div :style="styles.panelSectionTitle">{{ race.name }}</div>
      <div :style="{ ...styles.subtle, marginBottom: '12px' }">{{ race.description }}</div>

      <!-- Bonus grid -->
      <div :style="styles.statsGrid">
        <!-- Creation bonuses -->
        <div>{{ fmtLabel(race.bonus1Type) }}</div>
        <div>{{ fmtVal(race.bonus1Type, race.bonus1Value) }}</div>

        <div>{{ fmtLabel(race.bonus2Type) }}</div>
        <div>{{ fmtVal(race.bonus2Type, race.bonus2Value) }}</div>

        <!-- Penalty -->
        <template v-if="race.penaltyType && race.penaltyValue">
          <div style="color: rgba(255,100,100,0.85)">{{ fmtLabel(race.penaltyType) }}</div>
          <div style="color: rgba(255,100,100,0.85)">{{ fmtPenalty(race.penaltyType, race.penaltyValue) }}</div>
        </template>

        <!-- Divider row (spacer) -->
        <div style="grid-column: 1 / -1; height: 1px; background: rgba(255,255,255,0.08); margin: 6px 0" />

        <!-- Accumulated level bonuses -->
        <template v-if="evenLevels > 0n">
          <div style="color: rgba(255,215,100,0.9)">{{ fmtLabel(race.levelBonusType) }}</div>
          <div style="color: rgba(255,215,100,0.9)">
            {{ fmtVal(race.levelBonusType, race.levelBonusValue * evenLevels) }}
            <span :style="styles.subtleSmall">({{ evenLevels }}× {{ fmtVal(race.levelBonusType, race.levelBonusValue) }})</span>
          </div>
        </template>

        <!-- Per-even-level rate -->
        <div style="color: rgba(180,180,180,0.65); font-style: italic">Per even level</div>
        <div style="color: rgba(180,180,180,0.65); font-style: italic">
          {{ fmtVal(race.levelBonusType, race.levelBonusValue) }} {{ fmtLabel(race.levelBonusType) }}
        </div>
      </div>

      <!-- Class restrictions -->
      <div v-if="race.availableClasses && race.availableClasses.trim() !== ''" style="margin-top: 14px">
        <div :style="styles.panelSectionTitle">Available Classes</div>
        <div :style="styles.subtle">{{ formatClasses(race.availableClasses) }}</div>
      </div>
      <div v-else style="margin-top: 14px">
        <div :style="styles.panelSectionTitle">Available Classes</div>
        <div :style="styles.subtle">All classes</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CharacterRow } from '../stdb-types';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  selectedCharacter: CharacterRow | null;
  races: any[];
}>();

const race = computed(() => {
  const c = props.selectedCharacter;
  if (!c || !props.races?.length) return null;
  return props.races.find((r: any) => r.name.toLowerCase() === (c.race as string).toLowerCase()) ?? null;
});

const evenLevels = computed((): bigint => {
  const c = props.selectedCharacter;
  if (!c) return 0n;
  return (c.level as bigint) / 2n;
});

function fmtVal(type: string, value: bigint): string {
  const v = Number(value);
  switch (type) {
    case 'crit_chance':
    case 'dodge':
    case 'hit_chance':
    case 'parry':
    case 'magic_resist':
      return `+${(v / 10).toFixed(2).replace(/\.?0+$/, '')}%`;
    case 'faction_bonus':
    case 'loot_bonus':
      return `+${v}%`;
    case 'travel_cost_discount':
      return `−${v} stamina`;
    case 'travel_cost_increase':
      return `+${v} stamina`;
    default:
      return `+${v}`;
  }
}

function fmtLabel(type: string): string {
  switch (type) {
    case 'stat_str': return 'STR';
    case 'stat_dex': return 'DEX';
    case 'stat_int': return 'INT';
    case 'stat_wis': return 'WIS';
    case 'stat_cha': return 'CHA';
    case 'spell_damage': return 'Spell Damage';
    case 'phys_damage': return 'Phys Damage';
    case 'max_hp': return 'Max HP';
    case 'max_mana': return 'Max Mana';
    case 'mana_regen': return 'Mana Regen';
    case 'stamina_regen': return 'Stamina Regen';
    case 'crit_chance': return 'Crit';
    case 'armor': return 'Armor';
    case 'dodge': return 'Dodge';
    case 'hp_regen': return 'HP Regen';
    case 'max_stamina': return 'Max Stamina';
    case 'hit_chance': return 'Hit';
    case 'parry': return 'Parry';
    case 'faction_bonus': return 'Faction Gain';
    case 'magic_resist': return 'Magic Resist';
    case 'perception': return 'Perception';
    case 'travel_cost_discount': return 'Travel Discount';
    case 'travel_cost_increase': return 'Travel Cost';
    case 'loot_bonus': return 'Resource Find';
    default: return type;
  }
}

function fmtPenalty(type: string, value: bigint): string {
  const v = Number(value);
  if (type === 'travel_cost_increase') return `+${v} stamina`;
  if (type === 'travel_cost_discount') return `−${v} stamina`; // benefit in penalty slot
  return `−${v}`;
}

function formatClasses(classes: string): string {
  return classes.split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => c.charAt(0).toUpperCase() + c.slice(1))
    .join(', ');
}
</script>
