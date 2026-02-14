<template>
  <div :style="styles.panelBody">
    <!-- Tab Bar -->
    <div :style="{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }">
      <button
        type="button"
        :style="activeTab === 'factions' ? { ...styles.actionButton, ...styles.actionButtonActive } : styles.actionButton"
        @click="activeTab = 'factions'"
      >
        Factions
      </button>
      <button
        type="button"
        :style="activeTab === 'renown' ? { ...styles.actionButton, ...styles.actionButtonActive } : styles.actionButton"
        @click="activeTab = 'renown'"
      >
        Renown
      </button>
      <button
        type="button"
        :style="activeTab === 'leaderboard' ? { ...styles.actionButton, ...styles.actionButtonActive } : styles.actionButton"
        @click="activeTab = 'leaderboard'"
      >
        Leaderboard
      </button>
    </div>

    <!-- Tab Content -->
    <!-- Factions Tab -->
    <div v-if="activeTab === 'factions'">
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

    <!-- Renown Tab -->
    <div v-else-if="activeTab === 'renown'">
      <div v-if="!selectedCharacter" :style="styles.subtle">Select a character.</div>
      <div v-else>
        <!-- Current Rank Display -->
        <div :style="{ ...styles.resultCard, marginBottom: '16px' }">
          <div :style="{ color: '#fa5', fontSize: '1.4rem', fontWeight: 700, marginBottom: '4px' }">
            {{ currentRankName }}
          </div>
          <div :style="{ color: '#aaa', fontSize: '0.85rem', marginBottom: '12px' }">
            Rank {{ currentRankNum }} / 15 • {{ renownPoints }} Renown
          </div>

          <!-- Progress Bar -->
          <div v-if="!isMaxRank" :style="{ background: 'rgba(255,255,255,0.1)', borderRadius: '999px', height: '8px', overflow: 'hidden', marginBottom: '8px' }">
            <div
              :style="{
                height: '100%',
                borderRadius: '999px',
                background: 'linear-gradient(90deg, #fa5, #fc5)',
                width: `${rankProgress}%`,
                transition: 'width 0.3s ease',
              }"
            ></div>
          </div>
          <div v-if="!isMaxRank" :style="{ color: '#aaa', fontSize: '0.8rem' }">
            Next: {{ nextRankName }} ({{ nextRankThreshold }} renown)
          </div>
          <div v-else :style="{ color: '#fa5', fontSize: '0.9rem', fontWeight: 600 }">
            Maximum rank achieved!
          </div>
        </div>

        <!-- Perk Selection Section (visible only if unspent perk) -->
        <div v-if="hasUnspentPerk" :style="{ marginBottom: '16px' }">
          <div :style="{ ...styles.recipeName, marginBottom: '12px' }">
            Choose a Perk for {{ currentRankName }}
          </div>
          <div :style="{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }">
            <div
              v-for="perk in availablePerks"
              :key="perk.key"
              :style="{
                ...styles.resultCard,
                cursor: connActive ? 'pointer' : 'default',
                border: '1px solid rgba(255,255,255,0.2)',
                transition: 'all 0.2s ease',
              }"
              @click="connActive && choosePerk(perk.key)"
              @mouseenter="$event.currentTarget.style.borderColor = connActive ? '#fa5' : 'rgba(255,255,255,0.2)'"
              @mouseleave="$event.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'"
            >
              <div :style="{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }">
                <div :style="{ fontWeight: 600, fontSize: '0.9rem' }">{{ perk.name }}</div>
                <div :style="{
                  fontSize: '0.7rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: perk.type === 'passive' ? '#5af' : '#fa5',
                  color: '#000',
                  fontWeight: 600,
                }">
                  {{ perk.type === 'passive' ? 'Passive' : 'Active' }}
                </div>
              </div>
              <div :style="{ color: '#ccc', fontSize: '0.8rem' }">{{ perk.description }}</div>
            </div>
          </div>
        </div>

        <!-- Your Perks Section -->
        <div>
          <div :style="{ ...styles.recipeName, marginBottom: '8px' }">Your Perks</div>
          <div v-if="chosenPerks.length === 0" :style="{ ...styles.subtle, fontSize: '0.85rem' }">
            No perks chosen yet.
          </div>
          <div v-else :style="{ display: 'flex', flexDirection: 'column', gap: '6px' }">
            <div
              v-for="perkEntry in chosenPerks"
              :key="perkEntry.perkKey"
              :style="{ ...styles.resultCard, padding: '8px 12px' }"
            >
              <div :style="{ display: 'flex', alignItems: 'center', gap: '8px' }">
                <div :style="{ color: '#888', fontSize: '0.75rem', fontWeight: 600 }">
                  Rank {{ perkEntry.rankEarned }}
                </div>
                <div :style="{ fontWeight: 600, fontSize: '0.85rem' }">{{ perkEntry.perkName }}</div>
                <div :style="{
                  fontSize: '0.65rem',
                  padding: '1px 4px',
                  borderRadius: '3px',
                  background: perkEntry.perkType === 'passive' ? '#5af' : '#fa5',
                  color: '#000',
                  fontWeight: 600,
                }">
                  {{ perkEntry.perkType === 'passive' ? 'Passive' : 'Active' }}
                </div>
              </div>
              <div :style="{ color: '#aaa', fontSize: '0.75rem', marginTop: '2px' }">
                {{ perkEntry.perkDescription }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Leaderboard Tab -->
    <div v-else-if="activeTab === 'leaderboard'">
      <div v-if="serverFirsts.length === 0" :style="styles.subtle">
        No server-firsts recorded yet.
      </div>
      <div v-else :style="{ display: 'flex', flexDirection: 'column', gap: '8px' }">
        <div
          v-for="entry in sortedServerFirsts"
          :key="`${entry.category}-${entry.achievementKey}-${entry.characterId.toString()}`"
          :style="styles.resultCard"
        >
          <div :style="{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }">
            <div :style="{
              fontSize: '0.8rem',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '4px',
              background: getPositionColor(entry.position),
              color: '#000',
            }">
              {{ getPositionOrdinal(entry.position) }}
            </div>
            <div :style="{ fontWeight: 600, fontSize: '0.9rem' }">{{ entry.characterName }}</div>
          </div>
          <div :style="{ color: '#ccc', fontSize: '0.85rem', marginBottom: '2px' }">
            {{ humanizeAchievement(entry.category, entry.achievementKey) }}
          </div>
          <div :style="{ color: '#888', fontSize: '0.75rem' }">
            {{ formatServerFirstTimestamp(entry.achievedAt) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { FactionRow, FactionStandingRow, CharacterRow, RenownRow, RenownPerkRow, RenownServerFirstRow } from '../module_bindings';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  factions: FactionRow[];
  factionStandings: FactionStandingRow[];
  selectedCharacter: CharacterRow | null;
  renownData: RenownRow | null;
  renownPerks: RenownPerkRow[];
  serverFirsts: RenownServerFirstRow[];
  connActive: boolean;
}>();

const emit = defineEmits<{
  (e: 'choosePerk', perkKey: string): void;
}>();

// Active tab state (default to renown)
const activeTab = ref<'factions' | 'renown' | 'leaderboard'>('renown');

// Client-side renown ranks
const RENOWN_RANKS = [
  { rank: 1, name: 'Unsung', threshold: 0n },
  { rank: 2, name: 'Whispered', threshold: 100n },
  { rank: 3, name: 'Recognized', threshold: 250n },
  { rank: 4, name: 'Proven', threshold: 500n },
  { rank: 5, name: 'Stalwart', threshold: 900n },
  { rank: 6, name: 'Vanguard', threshold: 1500n },
  { rank: 7, name: 'Champion', threshold: 2500n },
  { rank: 8, name: 'Paragon', threshold: 4000n },
  { rank: 9, name: 'Exemplar', threshold: 6500n },
  { rank: 10, name: 'Hero', threshold: 10000n },
  { rank: 11, name: 'Exalted', threshold: 15000n },
  { rank: 12, name: 'Ascendant', threshold: 22000n },
  { rank: 13, name: 'Legend', threshold: 32000n },
  { rank: 14, name: 'Mythic', threshold: 47000n },
  { rank: 15, name: 'Eternal', threshold: 70000n },
];

// Client-side perk pools (subset for display)
const RENOWN_PERK_POOLS: Record<number, Array<{ key: string; name: string; type: 'passive' | 'active'; description: string }>> = {
  2: [
    { key: 'hp_boost_1', name: 'Vitality', type: 'passive', description: '+25 max health' },
    { key: 'str_boost_1', name: 'Might', type: 'passive', description: '+1 Strength' },
    { key: 'dex_boost_1', name: 'Agility', type: 'passive', description: '+1 Dexterity' },
  ],
  3: [
    { key: 'int_boost_1', name: 'Cunning', type: 'passive', description: '+1 Intelligence' },
    { key: 'wis_boost_1', name: 'Insight', type: 'passive', description: '+1 Wisdom' },
    { key: 'cha_boost_1', name: 'Presence', type: 'passive', description: '+1 Charisma' },
  ],
  4: [
    { key: 'hp_boost_2', name: 'Endurance', type: 'passive', description: '+50 max health' },
    { key: 'str_boost_2', name: 'Brawn', type: 'passive', description: '+2 Strength' },
    { key: 'dex_boost_2', name: 'Swiftness', type: 'passive', description: '+2 Dexterity' },
  ],
  5: [
    { key: 'int_boost_2', name: 'Brilliance', type: 'passive', description: '+2 Intelligence' },
    { key: 'wis_boost_2', name: 'Sagacity', type: 'passive', description: '+2 Wisdom' },
    { key: 'second_wind', name: 'Second Wind', type: 'active', description: 'Restore 20% of your maximum health (5 minute cooldown)' },
  ],
  6: [
    { key: 'cha_boost_2', name: 'Magnetism', type: 'passive', description: '+2 Charisma' },
    { key: 'armor_boost_1', name: 'Fortitude', type: 'passive', description: '+1 Armor Class' },
    { key: 'battle_focus', name: 'Battle Focus', type: 'active', description: 'Increase critical strike chance by 10% for 30 seconds (5 minute cooldown)' },
  ],
  7: [
    { key: 'hp_boost_3', name: 'Resilience', type: 'passive', description: '+75 max health' },
    { key: 'str_boost_3', name: 'Power', type: 'passive', description: '+3 Strength' },
    { key: 'warcry', name: 'Warcry', type: 'active', description: 'Increase all damage dealt by 10% for 15 seconds (5 minute cooldown)' },
  ],
  8: [
    { key: 'dex_boost_3', name: 'Precision', type: 'passive', description: '+3 Dexterity' },
    { key: 'int_boost_3', name: 'Genius', type: 'passive', description: '+3 Intelligence' },
    { key: 'evasion', name: 'Evasion', type: 'active', description: 'Dodge the next attack against you (5 minute cooldown)' },
  ],
  9: [
    { key: 'wis_boost_3', name: 'Enlightenment', type: 'passive', description: '+3 Wisdom' },
    { key: 'crit_boost_1', name: 'Deadly Aim', type: 'passive', description: '+5% critical strike chance' },
    { key: 'shield_wall', name: 'Shield Wall', type: 'active', description: 'Reduce damage taken by 50% for 10 seconds (5 minute cooldown)' },
  ],
  10: [
    { key: 'hp_boost_4', name: 'Indomitable', type: 'passive', description: '+100 max health' },
    { key: 'str_boost_4', name: 'Titan Strength', type: 'passive', description: '+4 Strength' },
    { key: 'rally', name: 'Rally', type: 'active', description: 'Restore 15% health to all nearby group members (10 minute cooldown)' },
  ],
  11: [
    { key: 'dex_boost_4', name: 'Lightning Reflexes', type: 'passive', description: '+4 Dexterity' },
    { key: 'armor_boost_2', name: 'Iron Skin', type: 'passive', description: '+2 Armor Class' },
    { key: 'berserker_rage', name: 'Berserker Rage', type: 'active', description: 'Increase damage by 25% but take 10% more damage for 20 seconds (10 minute cooldown)' },
  ],
  12: [
    { key: 'int_boost_4', name: 'Arcane Mastery', type: 'passive', description: '+4 Intelligence' },
    { key: 'wis_boost_4', name: 'Divine Wisdom', type: 'passive', description: '+4 Wisdom' },
    { key: 'life_steal', name: 'Life Steal', type: 'active', description: 'Heal for 25% of damage dealt for 15 seconds (10 minute cooldown)' },
  ],
  13: [
    { key: 'hp_boost_5', name: 'Legendary Constitution', type: 'passive', description: '+150 max health' },
    { key: 'str_boost_5', name: 'Godlike Strength', type: 'passive', description: '+5 Strength' },
    { key: 'phoenix_rebirth', name: 'Phoenix Rebirth', type: 'active', description: 'Automatically revive with 50% health when killed (30 minute cooldown)' },
  ],
  14: [
    { key: 'dex_boost_5', name: 'Supernatural Agility', type: 'passive', description: '+5 Dexterity' },
    { key: 'crit_boost_2', name: 'Perfect Strike', type: 'passive', description: '+10% critical strike chance' },
    { key: 'defy_death', name: 'Defy Death', type: 'active', description: 'Prevent fatal damage once, leaving you at 1 HP (1 hour cooldown)' },
  ],
  15: [
    { key: 'int_boost_5', name: 'Cosmic Intelligence', type: 'passive', description: '+5 Intelligence' },
    { key: 'wis_boost_5', name: 'Eternal Wisdom', type: 'passive', description: '+5 Wisdom' },
    { key: 'armor_boost_3', name: 'Invulnerability', type: 'passive', description: '+3 Armor Class' },
  ],
};

// Faction standings computed (from existing logic)
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

// Renown data computed
const currentRankNum = computed(() => props.renownData ? Number(props.renownData.currentRank) : 1);
const renownPoints = computed(() => props.renownData ? Number(props.renownData.points) : 0);
const currentRankName = computed(() => {
  const rankInfo = RENOWN_RANKS.find(r => r.rank === currentRankNum.value);
  return rankInfo?.name ?? 'Unknown';
});
const isMaxRank = computed(() => currentRankNum.value >= 15);
const nextRankName = computed(() => {
  if (isMaxRank.value) return '';
  const nextRank = RENOWN_RANKS.find(r => r.rank === currentRankNum.value + 1);
  return nextRank?.name ?? '';
});
const nextRankThreshold = computed(() => {
  if (isMaxRank.value) return 0;
  const nextRank = RENOWN_RANKS.find(r => r.rank === currentRankNum.value + 1);
  return nextRank ? Number(nextRank.threshold) : 0;
});
const rankProgress = computed(() => {
  if (isMaxRank.value) return 100;
  const currentThreshold = RENOWN_RANKS.find(r => r.rank === currentRankNum.value)?.threshold ?? 0n;
  const nextThreshold = RENOWN_RANKS.find(r => r.rank === currentRankNum.value + 1)?.threshold ?? 0n;
  if (nextThreshold === 0n) return 100;
  const range = Number(nextThreshold - currentThreshold);
  const progress = renownPoints.value - Number(currentThreshold);
  return Math.min(100, Math.max(0, (progress / range) * 100));
});

// Check if character has an unspent perk for current rank
const hasUnspentPerk = computed(() => {
  if (!props.renownData || currentRankNum.value < 2) return false;
  // Check if a perk has been chosen for the current rank
  const existingPerk = props.renownPerks.find(p => Number(p.rankEarned) === currentRankNum.value);
  return !existingPerk;
});

const availablePerks = computed(() => {
  if (!hasUnspentPerk.value) return [];
  return RENOWN_PERK_POOLS[currentRankNum.value] ?? [];
});

const choosePerk = (perkKey: string) => {
  emit('choosePerk', perkKey);
};

// Chosen perks display
const chosenPerks = computed(() => {
  return props.renownPerks.map(perkRow => {
    const rank = Number(perkRow.rankEarned);
    const pool = RENOWN_PERK_POOLS[rank] ?? [];
    const perkInfo = pool.find(p => p.key === perkRow.perkKey);
    return {
      rankEarned: rank,
      perkKey: perkRow.perkKey,
      perkName: perkInfo?.name ?? perkRow.perkKey,
      perkType: perkInfo?.type ?? 'passive',
      perkDescription: perkInfo?.description ?? '',
    };
  }).sort((a, b) => a.rankEarned - b.rankEarned);
});

// Leaderboard helpers
const sortedServerFirsts = computed(() => {
  return [...props.serverFirsts].sort((a, b) => {
    const aTime = Number(a.achievedAt.microsSinceUnixEpoch);
    const bTime = Number(b.achievedAt.microsSinceUnixEpoch);
    return bTime - aTime; // Most recent first
  });
});

const getPositionOrdinal = (position: number): string => {
  if (position === 1) return '1st';
  if (position === 2) return '2nd';
  if (position === 3) return '3rd';
  return `${position}th`;
};

const getPositionColor = (position: number): string => {
  if (position === 1) return '#fa5'; // gold
  if (position === 2) return '#aaa'; // silver
  if (position === 3) return '#c85'; // bronze
  return '#666';
};

const humanizeAchievement = (category: string, achievementKey: string): string => {
  // Convert boss_elder_oak -> Boss: Elder Oak
  if (category === 'boss_kill') {
    const name = achievementKey.replace('boss_', '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return `Boss: ${name}`;
  }
  // Default format
  const name = achievementKey.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return `${category}: ${name}`;
};

const formatServerFirstTimestamp = (timestamp: { microsSinceUnixEpoch: bigint }): string => {
  const millis = Number(timestamp.microsSinceUnixEpoch / 1000n);
  const date = new Date(millis);
  return date.toLocaleString();
};
</script>
