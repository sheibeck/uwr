<template>
  <div :style="styles.panelSplit">
    <!-- Left column: NPC list with affinity badges -->
    <div :style="[styles.panelColumn, styles.panelColumnNarrow]">
      <div :style="styles.rosterTitle">NPCs</div>
      <div :style="styles.filterList">
        <div
          v-for="npc in npcFilters"
          :key="npc.id"
          :style="[
            styles.filterItem,
            selectedNpcId === npc.id ? styles.filterItemActive : {}
          ]"
          @click="selectedNpcId = npc.id"
        >
          <div :style="{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }">
            <span>{{ npc.name }}</span>
            <span
              :style="{
                fontSize: '0.7rem',
                padding: '2px 6px',
                borderRadius: '3px',
                background: npc.tierColor,
                color: '#fff',
                fontWeight: 600,
              }"
            >
              {{ npc.tierName }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right column: Affinity header + dialogue options + conversation history -->
    <div :style="[styles.panelColumn, styles.panelColumnWide]">
      <div v-if="!selectedNpcData" :style="styles.subtle">Select an NPC to view dialog.</div>
      <template v-else>
        <!-- Affinity header -->
        <div :style="{ marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }">
          <div :style="{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }">
            <span :style="{ fontSize: '0.95rem', fontWeight: 600 }">{{ selectedNpcData.npcName }}</span>
            <span :style="{ fontSize: '0.85rem', color: selectedNpcData.tierColor, fontWeight: 600 }">
              {{ selectedNpcData.tierName }} ({{ selectedNpcData.affinity }})
            </span>
          </div>
          <div :style="{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', opacity: 0.6, marginBottom: '4px' }">
            <span>{{ selectedNpcData.location }}</span>
            <span v-if="selectedNpcData.nextTierName">Next: {{ selectedNpcData.nextTierName }} ({{ selectedNpcData.nextTierMin }})</span>
          </div>
          <!-- Progress bar -->
          <div
            :style="{
              width: '100%',
              height: '6px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '3px',
              overflow: 'hidden',
            }"
          >
            <div
              :style="{
                width: `${selectedNpcData.progress}%`,
                height: '100%',
                background: selectedNpcData.tierColor,
                transition: 'width 0.3s ease',
              }"
            ></div>
          </div>
        </div>

        <!-- Dialogue options section -->
        <div v-if="availableDialogueOptions.length > 0" :style="{ marginBottom: '12px' }">
          <div :style="{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', opacity: 0.8 }">
            Dialogue Options
          </div>
          <div :style="{ display: 'flex', flexDirection: 'column', gap: '4px' }">
            <div
              v-for="option in availableDialogueOptions"
              :key="option.id.toString()"
              :style="[
                {
                  padding: '8px',
                  borderRadius: '4px',
                  cursor: option.isLocked ? 'not-allowed' : 'pointer',
                  background: option.isLocked ? 'rgba(255,255,255,0.02)' : 'rgba(76, 125, 240, 0.15)',
                  border: option.isLocked ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(76, 125, 240, 0.3)',
                  opacity: option.isLocked ? 0.5 : 1,
                },
                !option.isLocked ? { ':hover': { background: 'rgba(76, 125, 240, 0.25)' } } : {}
              ]"
              @click="!option.isLocked && chooseDialogueOption(option.id)"
            >
              <div :style="{ fontSize: '0.88rem' }">{{ option.playerText }}</div>
              <div v-if="option.isLocked && option.requirementText" :style="{ fontSize: '0.75rem', marginTop: '4px', color: '#f87171' }">
                {{ option.requirementText }}
              </div>
            </div>
          </div>
        </div>

        <!-- Conversation history -->
        <div :style="{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', opacity: 0.8 }">
          Conversation History
        </div>
        <div v-if="dialogEntries.length === 0" :style="styles.subtle">
          No conversations yet.
        </div>
        <div v-else :style="styles.logList">
          <div v-for="entry in dialogEntries" :key="entry.key" :style="styles.logItem">
            <span :style="styles.logMessage" v-html="renderClickableTopics(entry.text)"></span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  NpcDialogRow,
  NpcRow,
  LocationRow,
  RegionRow,
  NpcAffinityRow,
  NpcDialogueOptionRow,
  FactionStandingRow,
} from '../module_bindings';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  npcDialogs: NpcDialogRow[];
  npcs: NpcRow[];
  locations: LocationRow[];
  regions: RegionRow[];
  npcAffinities: NpcAffinityRow[];
  npcDialogueOptions: NpcDialogueOptionRow[];
  selectedCharacterId: bigint | null;
  factionStandings: FactionStandingRow[];
  selectedNpcTarget?: bigint | null;
}>();

const AFFINITY_TIERS = [
  { min: -100, max: -51, name: 'Hostile', color: '#f87171' },
  { min: -50, max: -26, name: 'Unfriendly', color: '#f87171' },
  { min: -25, max: -1, name: 'Wary', color: '#fb923c' },
  { min: 0, max: 24, name: 'Stranger', color: '#9ca3af' },
  { min: 25, max: 49, name: 'Acquaintance', color: '#fbbf24' },
  { min: 50, max: 74, name: 'Friend', color: '#60a5fa' },
  { min: 75, max: 99, name: 'Close Friend', color: '#4ade80' },
  { min: 100, max: 100, name: 'Devoted', color: '#a78bfa' },
];

const selectedNpcId = ref<string | null>(null);

// Sync with parent's selected NPC target
watch(() => props.selectedNpcTarget, (npcId) => {
  if (npcId !== null && npcId !== undefined) {
    selectedNpcId.value = npcId.toString();
  }
}, { immediate: true });

const getAffinityTier = (affinity: number) => {
  return AFFINITY_TIERS.find(tier => affinity >= tier.min && affinity <= tier.max) || AFFINITY_TIERS[3]; // Default to Stranger
};

const npcFilters = computed(() => {
  const seen = new Map<string, { name: string; tierName: string; tierColor: string }>();
  for (const entry of props.npcDialogs) {
    const npc = props.npcs.find((row) => row.id.toString() === entry.npcId.toString());
    if (npc && !seen.has(npc.id.toString())) {
      // Get affinity for this NPC
      const affinity = props.npcAffinities.find(
        (a) => a.npcId.toString() === npc.id.toString() && a.characterId.toString() === props.selectedCharacterId?.toString()
      );
      const affinityValue = affinity ? Number(affinity.affinity) : 0;
      const tier = getAffinityTier(affinityValue);
      seen.set(npc.id.toString(), {
        name: npc.name,
        tierName: tier.name,
        tierColor: tier.color,
      });
    }
  }
  return Array.from(seen.entries()).map(([id, data]) => ({ id, ...data }));
});

const dialogEntries = computed(() => {
  const selected = selectedNpcId.value;
  if (!selected) return [];
  return [...props.npcDialogs]
    .filter((entry) => entry.npcId.toString() === selected)
    .sort((a, b) => Number(a.createdAt.microsSinceUnixEpoch - b.createdAt.microsSinceUnixEpoch))
    .map((entry) => {
      const npc = props.npcs.find((row) => row.id.toString() === entry.npcId.toString());
      return {
        key: entry.id.toString(),
        npc: npc ? npc.name : 'NPC',
        text: entry.text,
      };
    });
});

const selectedNpcData = computed(() => {
  if (!selectedNpcId.value || !props.selectedCharacterId) return null;
  const npc = props.npcs.find((row) => row.id.toString() === selectedNpcId.value);
  if (!npc) return null;

  // Get affinity
  const affinity = props.npcAffinities.find(
    (a) => a.npcId.toString() === npc.id.toString() && a.characterId.toString() === props.selectedCharacterId?.toString()
  );
  const affinityValue = affinity ? Number(affinity.affinity) : 0;
  const tier = getAffinityTier(affinityValue);

  // Calculate progress to next tier
  const currentTierIndex = AFFINITY_TIERS.findIndex(t => t.name === tier.name);
  const nextTier = currentTierIndex < AFFINITY_TIERS.length - 1 ? AFFINITY_TIERS[currentTierIndex + 1] : null;
  const progress = nextTier
    ? ((affinityValue - tier.min) / (nextTier.min - tier.min)) * 100
    : 100; // Max tier shows 100%

  // Get location
  const location = props.locations.find((row) => row.id.toString() === npc.locationId.toString());
  const region = location
    ? props.regions.find((row) => row.id.toString() === location.regionId.toString())
    : null;
  const locationLabel = location
    ? `${location.name}${region ? ` · ${region.name}` : ''}`
    : 'Unknown location';

  return {
    npcName: npc.name,
    affinity: affinityValue,
    tierName: tier.name,
    tierColor: tier.color,
    progress: Math.round(Math.max(0, Math.min(100, progress))),
    nextTierName: nextTier?.name,
    nextTierMin: nextTier?.min,
    location: locationLabel,
  };
});

const availableDialogueOptions = computed(() => {
  if (!selectedNpcId.value || !props.selectedCharacterId) return [];

  // Get root dialogue options for this NPC (parentOptionId is null/undefined)
  const options = props.npcDialogueOptions.filter(
    (opt) => opt.npcId.toString() === selectedNpcId.value && !opt.parentOptionId
  ).filter(opt => opt.playerText.trim().length > 0);

  // Get current affinity
  const affinity = props.npcAffinities.find(
    (a) => a.npcId.toString() === selectedNpcId.value && a.characterId.toString() === props.selectedCharacterId?.toString()
  );
  const affinityValue = affinity ? Number(affinity.affinity) : 0;

  return options.map((opt) => {
    const requirementTexts: string[] = [];
    let isLocked = false;

    // Check affinity requirement
    if (opt.requiredAffinity !== null && opt.requiredAffinity !== undefined) {
      const required = Number(opt.requiredAffinity);
      if (affinityValue < required) {
        isLocked = true;
        const tier = getAffinityTier(required);
        requirementTexts.push(`Requires ${tier.name} (${required} affinity)`);
      }
    }

    // Check faction standing requirement
    if (opt.requiredFactionId && opt.requiredFactionStanding !== null && opt.requiredFactionStanding !== undefined) {
      const standing = props.factionStandings.find(
        (s) => s.factionId.toString() === opt.requiredFactionId?.toString() && s.characterId.toString() === props.selectedCharacterId?.toString()
      );
      const standingValue = standing ? Number(standing.standing) : 0;
      const required = Number(opt.requiredFactionStanding);
      if (standingValue < required) {
        isLocked = true;
        requirementTexts.push(`Requires ${required} faction standing`);
      }
    }

    // Check renown rank requirement
    if (opt.requiredRenownRank !== null && opt.requiredRenownRank !== undefined) {
      // TODO: When renown is wired up, add renown rank check here
      // For now, we'll just show the requirement text if present
      const required = Number(opt.requiredRenownRank);
      requirementTexts.push(`Requires Renown Rank ${required}`);
      isLocked = true;
    }

    return {
      id: opt.id,
      playerText: opt.playerText,
      isLocked,
      requirementText: requirementTexts.join(', '),
    };
  });
});

const chooseDialogueOption = (optionId: bigint) => {
  if (!props.selectedCharacterId || !selectedNpcId.value) return;

  const npcIdBigint = BigInt(selectedNpcId.value);

  window.__db_conn?.reducers.chooseDialogueOption({
    characterId: props.selectedCharacterId,
    npcId: npcIdBigint,
    optionId: optionId,
  });
};

// Parse text and make [bracketed] topics clickable
const renderClickableTopics = (text: string): string => {
  return text.replace(/\[([^\]]+)\]/g, (match, topic) => {
    return `<span style="color: #60a5fa; cursor: pointer; text-decoration: underline;" onclick="window.clickNpcTopic('${topic.replace(/'/g, "\\'")}')">${match}</span>`;
  });
};

// Handle clicking on a [topic] - trigger /say command
if (typeof window !== 'undefined') {
  (window as any).clickNpcTopic = (topic: string) => {
    if (!props.selectedCharacterId) return;
    window.__db_conn?.reducers.say({
      characterId: props.selectedCharacterId,
      message: topic,
    });
  };
}
</script>
