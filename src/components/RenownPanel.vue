<template>
  <div :style="styles.panelBody">
    <div v-if="!selectedCharacter" :style="styles.subtle">Select a character.</div>
    <div v-else-if="factionRows.length === 0" :style="styles.subtle">No faction data.</div>
    <div v-else>
      <div
        v-for="row in factionRows"
        :key="row.factionId.toString()"
        :style="styles.resultCard"
      >
        <div :style="styles.recipeName">{{ row.factionName }}</div>
        <div :style="styles.subtleSmall">{{ row.description }}</div>
        <div :style="{ color: row.rank.color, fontWeight: 600, fontSize: '0.85rem' }">
          {{ row.rank.name }} ({{ row.standing }})
        </div>
        <div :style="{ background: 'rgba(255,255,255,0.1)', borderRadius: '999px', height: '6px', overflow: 'hidden' }">
          <div
            :style="{
              height: '100%',
              borderRadius: '999px',
              background: row.rank.color,
              width: `${row.progress}%`,
              transition: 'width 0.3s ease',
            }"
          ></div>
        </div>
        <div :style="styles.subtleSmall">
          <span v-if="row.nextRank">Next: {{ row.nextRank.name }} ({{ row.nextRank.min }})</span>
          <span v-else>Exalted (max)</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FactionRow, MyFactionStandingsRow, CharacterRow } from '../module_bindings';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  factions: FactionRow[];
  factionStandings: MyFactionStandingsRow[];
  selectedCharacter: CharacterRow | null;
}>();

const FACTION_RANKS = [
  { name: 'Hostile',    min: -Infinity, max: -5001,    color: '#c55' },
  { name: 'Unfriendly', min: -5000,     max: -1,       color: '#c85' },
  { name: 'Neutral',    min: 0,         max: 999,      color: '#aaa' },
  { name: 'Friendly',   min: 1000,      max: 2999,     color: '#8af' },
  { name: 'Honored',    min: 3000,      max: 5999,     color: '#5af' },
  { name: 'Revered',    min: 6000,      max: 8999,     color: '#a5f' },
  { name: 'Exalted',    min: 9000,      max: Infinity, color: '#fa5' },
];

const getRankIndex = (standing: number): number => {
  for (let i = FACTION_RANKS.length - 1; i >= 0; i--) {
    if (standing >= FACTION_RANKS[i].min) {
      return i;
    }
  }
  return 0;
};

const getProgress = (standing: number, rankIdx: number): number => {
  const rank = FACTION_RANKS[rankIdx];
  if (rank.max === Infinity) return 100;
  const progress = ((standing - rank.min) / (rank.max - rank.min + 1)) * 100;
  return Math.min(100, Math.max(0, progress));
};

const factionRows = computed(() => {
  if (!props.selectedCharacter) return [];
  return props.factions.map((faction) => {
    const standingRow = props.factionStandings.find(
      (s) => s.factionId.toString() === faction.id.toString()
    );
    const standing = Number(standingRow?.standing ?? 0n);
    const rankIdx = getRankIndex(standing);
    const rank = FACTION_RANKS[rankIdx];
    const nextRank = rankIdx < FACTION_RANKS.length - 1 ? FACTION_RANKS[rankIdx + 1] : null;
    const progress = getProgress(standing, rankIdx);
    return {
      factionId: faction.id,
      factionName: faction.name,
      description: faction.description,
      standing,
      rank,
      nextRank,
      progress,
    };
  });
});
</script>
