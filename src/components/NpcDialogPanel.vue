<template>
  <!-- Tab bar -->
  <div :style="{ display: 'flex', gap: '0', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '8px' }">
    <button
      @click="setTab('journal')"
      :style="{
        background: activeTab === 'journal' ? 'rgba(255,255,255,0.08)' : 'transparent',
        borderBottom: activeTab === 'journal' ? '2px solid #60a5fa' : '2px solid transparent',
        padding: '8px 16px',
        cursor: 'pointer',
        color: activeTab === 'journal' ? '#fff' : '#d1d5db',
        fontSize: '0.85rem',
        fontWeight: 600,
        border: 'none',
        outline: 'none',
      }"
    >Journal</button>
    <button
      @click="setTab('quests')"
      :style="{
        background: activeTab === 'quests' ? 'rgba(255,255,255,0.08)' : 'transparent',
        borderBottom: activeTab === 'quests' ? '2px solid #60a5fa' : '2px solid transparent',
        padding: '8px 16px',
        cursor: 'pointer',
        color: activeTab === 'quests' ? '#fff' : '#d1d5db',
        fontSize: '0.85rem',
        fontWeight: 600,
        border: 'none',
        outline: 'none',
      }"
    >Quests</button>
  </div>

  <!-- Journal tab -->
  <div v-if="activeTab === 'journal'" :style="styles.panelSplit">
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

  <!-- Quests tab -->
  <div v-else-if="activeTab === 'quests'" :style="styles.panelBody">
    <div v-if="questRows.length === 0" :style="styles.subtle">No active quests.</div>
    <div v-else :style="styles.rosterList">
      <div v-for="quest in questRows" :key="quest.id" :style="styles.rosterClickable">
        <div>{{ quest.name }}</div>
        <div :style="styles.subtleSmall">
          {{ quest.giver }} · {{ quest.location }}
        </div>
        <div :style="styles.subtleSmall">
          Progress: {{ quest.progress }}/{{ quest.requiredCount }}
          <span v-if="quest.completed"> (Complete)</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  NpcDialog,
  Npc,
  Location,
  Region,
  NpcAffinity,
  QuestInstance,
  QuestTemplate,
} from '../module_bindings/types';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  npcDialogs: NpcDialog[];
  npcs: Npc[];
  allNpcs: Npc[];
  locations: Location[];
  regions: Region[];
  npcAffinities: NpcAffinity[];
  selectedCharacterId: bigint | null;
  selectedNpcTarget?: bigint | null;
  questInstances: QuestInstance[];
  questTemplates: QuestTemplate[];
  requestedTab?: 'journal' | 'quests' | null;
}>();

const emit = defineEmits<{
  (e: 'tab-change', tab: string): void;
}>();

const activeTab = ref<'journal' | 'quests'>('journal');

watch(() => props.requestedTab, (val) => {
  if (val) activeTab.value = val;
}, { immediate: true });

const setTab = (tab: 'journal' | 'quests') => {
  activeTab.value = tab;
  emit('tab-change', tab);
};

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
    const npc = props.allNpcs.find((row) => row.id.toString() === entry.npcId.toString());
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
      const npc = props.allNpcs.find((row) => row.id.toString() === entry.npcId.toString());
      return {
        key: entry.id.toString(),
        npc: npc ? npc.name : 'NPC',
        text: entry.text,
      };
    });
});

const selectedNpcData = computed(() => {
  if (!selectedNpcId.value || !props.selectedCharacterId) return null;
  const npc = props.allNpcs.find((row) => row.id.toString() === selectedNpcId.value);
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

const questRows = computed(() => {
  return props.questInstances.map((instance) => {
    const template = props.questTemplates.find(
      (row) => row.id.toString() === instance.questTemplateId.toString()
    );
    const npc = template
      ? props.allNpcs.find((row) => row.id.toString() === template.npcId.toString())
      : null;
    const location = npc
      ? props.locations.find((row) => row.id.toString() === npc.locationId.toString())
      : null;
    const region = location
      ? props.regions.find((row) => row.id.toString() === location.regionId.toString())
      : null;
    const locationLabel = location
      ? `${location.name}${region ? `, ${region.name}` : ''}`
      : 'Unknown';
    return {
      id: instance.id.toString(),
      name: template?.name ?? 'Unknown Quest',
      giver: npc?.name ?? 'Unknown',
      location: locationLabel,
      progress: instance.progress,
      requiredCount: template?.requiredCount ?? 0n,
      completed: instance.completed,
    };
  });
});

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
