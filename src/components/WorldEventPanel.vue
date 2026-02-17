<template>
  <div :style="styles.panelBody">
    <!-- Tab Bar — matches RenownPanel pattern -->
    <div :style="{ display: 'flex', gap: '0', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '8px' }">
      <button type="button" @click="activeTab = 'active'" :style="tabStyle('active')">Active</button>
      <button type="button" @click="activeTab = 'history'" :style="tabStyle('history')">History</button>
    </div>

    <!-- Active Tab -->
    <div v-if="activeTab === 'active'">
      <div v-if="activeEvents.length === 0" :style="styles.subtle">No active world events.</div>
      <div v-else :style="{ display: 'flex', flexDirection: 'column', gap: '10px' }">
        <div
          v-for="event in activeEvents"
          :key="event.id.toString()"
          :style="styles.resultCard"
        >
          <!-- Event Name -->
          <div :style="{ fontWeight: 700, color: '#facc15', fontSize: '1rem' }">{{ event.name }}</div>

          <!-- Region -->
          <div :style="styles.subtleSmall">Region: {{ regionNameMap.get(event.regionId.toString()) ?? 'Unknown Region' }}</div>

          <!-- Objective Progress Bar (kill_count) -->
          <template v-for="obj in objectivesForEvent(event.id)" :key="obj.id.toString()">
            <div v-if="obj.objectiveType === 'kill_count'" :style="{ fontSize: '0.8rem', color: '#ccc' }">
              Objective: {{ obj.name }}
            </div>
            <div :style="{ background: 'rgba(255,255,255,0.1)', borderRadius: '999px', height: '6px', overflow: 'hidden' }">
              <div
                :style="{
                  height: '100%',
                  borderRadius: '999px',
                  background: 'linear-gradient(90deg, #facc15, #f59e0b)',
                  width: `${progressPercent(event, obj)}%`,
                  transition: 'width 0.3s ease',
                }"
              ></div>
            </div>
            <div :style="styles.subtleSmall">
              {{ Number(obj.currentCount) }} / {{ Number(obj.targetCount) }}
            </div>
          </template>

          <!-- Threshold Race Progress -->
          <template v-if="event.failureConditionType === 'threshold_race' && event.successCounter != null && event.successThreshold != null">
            <div :style="{ fontSize: '0.8rem', color: '#ccc' }">Progress: {{ Number(event.successCounter) }} / {{ Number(event.successThreshold) }}</div>
            <div :style="{ background: 'rgba(255,255,255,0.1)', borderRadius: '999px', height: '6px', overflow: 'hidden' }">
              <div
                :style="{
                  height: '100%',
                  borderRadius: '999px',
                  background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                  width: `${thresholdPercent(event)}%`,
                  transition: 'width 0.3s ease',
                }"
              ></div>
            </div>
          </template>

          <!-- Time Remaining -->
          <div v-if="event.deadlineAtMicros != null" :style="{ fontSize: '0.8rem', color: '#f59e0b' }">
            Time remaining: {{ timeRemaining(event) }}
          </div>

          <!-- Contribution Tier (for selected character) -->
          <template v-if="selectedCharacter">
            <div :style="{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }">
              <span :style="{ fontSize: '0.75rem', color: 'rgba(230,232,239,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }">Your Contribution:</span>
              <span :style="{ fontSize: '0.85rem', fontWeight: 600 }">{{ contributionCount(event.id) }}</span>
              <span :style="{ fontSize: '0.8rem', fontWeight: 700, color: tierColor(tierForCount(contributionCount(event.id), event.rewardTiersJson)) }">
                {{ tierLabel(tierForCount(contributionCount(event.id), event.rewardTiersJson)) }}
              </span>
            </div>
          </template>

          <!-- Rewards Preview -->
          <div :style="{ fontSize: '0.78rem', color: '#aaa' }">
            Rewards: {{ rewardsPreview(event) }}
          </div>
        </div>
      </div>
    </div>

    <!-- History Tab -->
    <div v-else-if="activeTab === 'history'">
      <div v-if="historyEvents.length === 0" :style="styles.subtle">No resolved events yet.</div>
      <div v-else :style="{ display: 'flex', flexDirection: 'column', gap: '10px' }">
        <div
          v-for="event in historyEvents"
          :key="event.id.toString()"
          :style="styles.resultCard"
        >
          <!-- Event Name -->
          <div :style="{ fontWeight: 700, fontSize: '0.95rem' }">{{ event.name }}</div>

          <!-- Outcome Badge -->
          <div :style="{ display: 'flex', alignItems: 'center', gap: '8px' }">
            <span :style="{
              padding: '2px 10px',
              borderRadius: '999px',
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              background: event.status === 'success' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              border: `1px solid ${event.status === 'success' ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)'}`,
              color: event.status === 'success' ? '#22c55e' : '#ef4444',
            }">{{ event.status === 'success' ? 'Success' : 'Failed' }}</span>
          </div>

          <!-- Consequence Text -->
          <div v-if="event.consequenceText" :style="{ fontSize: '0.82rem', color: '#ccc', fontStyle: 'italic' }">
            {{ event.consequenceText }}
          </div>
          <div v-else :style="{ fontSize: '0.82rem', color: '#888', fontStyle: 'italic' }">
            {{ event.status === 'success' ? event.successConsequenceType : event.failureConsequenceType }} consequence applied.
          </div>

          <!-- Resolved Timestamp -->
          <div v-if="event.resolvedAt" :style="styles.subtleSmall">
            Resolved: {{ formatTimestamp(event.resolvedAt) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { CharacterRow, RegionRow } from '../module_bindings';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  worldEventRows: any[];
  eventContributions: any[];
  eventObjectives: any[];
  regions: RegionRow[];
  selectedCharacter: CharacterRow | null;
}>();

const activeTab = ref<'active' | 'history'>('active');

// Tab styling — matches RenownPanel pattern exactly
const tabStyle = (tab: 'active' | 'history') => ({
  background: activeTab.value === tab ? 'rgba(255,255,255,0.08)' : 'transparent',
  borderBottom: activeTab.value === tab ? '2px solid #60a5fa' : '2px solid transparent',
  padding: '8px 16px',
  cursor: 'pointer',
  color: activeTab.value === tab ? '#fff' : '#d1d5db',
  fontSize: '0.85rem',
  fontWeight: 600,
  border: 'none',
  outline: 'none',
});

// Computed: active events (status === 'active')
const activeEvents = computed(() =>
  (props.worldEventRows as any[]).filter((e: any) => e.status === 'active')
);

// Computed: history events sorted by resolvedAt descending
const historyEvents = computed(() =>
  (props.worldEventRows as any[])
    .filter((e: any) => e.status !== 'active')
    .sort((a: any, b: any) => {
      const aTime = a.resolvedAt ? Number(a.resolvedAt.microsSinceUnixEpoch) : 0;
      const bTime = b.resolvedAt ? Number(b.resolvedAt.microsSinceUnixEpoch) : 0;
      return bTime - aTime;
    })
);

// Region name map
const regionNameMap = computed(() => {
  const map = new Map<string, string>();
  for (const r of props.regions) {
    map.set(r.id.toString(), r.name);
  }
  return map;
});

// My contributions map (eventId -> count)
const myContributions = computed(() => {
  const map = new Map<string, number>();
  if (!props.selectedCharacter) return map;
  const charId = props.selectedCharacter.id.toString();
  for (const c of props.eventContributions as any[]) {
    if (c.characterId.toString() === charId) {
      map.set(c.eventId.toString(), Number(c.count));
    }
  }
  return map;
});

const contributionCount = (eventId: any) => myContributions.value.get(eventId.toString()) ?? 0;

// Objectives for a given event
const objectivesForEvent = (eventId: any) =>
  (props.eventObjectives as any[]).filter((o: any) => o.eventId.toString() === eventId.toString());

// Progress percent for kill_count objective
const progressPercent = (event: any, obj: any): number => {
  const current = Number(obj.currentCount);
  const target = Number(obj.targetCount);
  if (target === 0) return 0;
  return Math.min(100, Math.max(0, (current / target) * 100));
};

// Threshold race progress percent
const thresholdPercent = (event: any): number => {
  const current = Number(event.successCounter ?? 0n);
  const target = Number(event.successThreshold ?? 1n);
  if (target === 0) return 0;
  return Math.min(100, Math.max(0, (current / target) * 100));
};

// Time remaining string
const timeRemaining = (event: any): string => {
  if (!event.deadlineAtMicros) return '';
  const nowMicros = BigInt(Date.now()) * 1000n;
  const deadlineMicros = BigInt(event.deadlineAtMicros);
  if (nowMicros >= deadlineMicros) return 'Expired';
  const remainMicros = deadlineMicros - nowMicros;
  const remainSec = Number(remainMicros / 1_000_000n);
  const m = Math.floor(remainSec / 60);
  const s = remainSec % 60;
  return `${m}m ${s}s`;
};

// Parse reward tiers JSON
interface RewardTier {
  tier: string;
  minCount: number;
  renown?: number;
  gold?: number;
  factionStanding?: number;
}

const parseRewardTiers = (json: string): RewardTier[] => {
  try {
    return JSON.parse(json) as RewardTier[];
  } catch {
    return [];
  }
};

// Tier for a given count
const tierForCount = (count: number, rewardTiersJson: string): 'gold' | 'silver' | 'bronze' | 'none' => {
  const tiers = parseRewardTiers(rewardTiersJson);
  // Sort by minCount descending to find highest qualifying tier
  const sorted = [...tiers].sort((a, b) => b.minCount - a.minCount);
  for (const tier of sorted) {
    if (count >= tier.minCount) {
      const t = tier.tier.toLowerCase();
      if (t === 'gold') return 'gold';
      if (t === 'silver') return 'silver';
      if (t === 'bronze') return 'bronze';
    }
  }
  return 'none';
};

const tierColor = (tier: 'gold' | 'silver' | 'bronze' | 'none'): string => {
  if (tier === 'gold') return '#facc15';
  if (tier === 'silver') return '#c0c0c0';
  if (tier === 'bronze') return '#cd7f32';
  return '#888';
};

const tierLabel = (tier: 'gold' | 'silver' | 'bronze' | 'none'): string => {
  if (tier === 'none') return 'No tier';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
};

// Rewards preview string
const rewardsPreview = (event: any): string => {
  const tiers = parseRewardTiers(event.rewardTiersJson);
  if (tiers.length === 0) return 'See event details.';
  const parts = tiers.map((t: RewardTier) => {
    const pieces: string[] = [];
    if (t.renown) pieces.push(`${t.renown} renown`);
    if (t.gold) pieces.push(`${t.gold}g`);
    if (t.factionStanding) pieces.push(`${t.factionStanding} faction`);
    return `${t.tier.charAt(0).toUpperCase() + t.tier.slice(1)}: ${pieces.join(', ') || 'reward'}`;
  });
  return parts.join(' | ');
};

// Format timestamp for history display
const formatTimestamp = (ts: any): string => {
  if (!ts) return '';
  try {
    const millis = Number(ts.microsSinceUnixEpoch / 1000n);
    return new Date(millis).toLocaleString();
  } catch {
    return '';
  }
};
</script>
