<template>
  <div :style="{ overflow: 'auto', padding: '12px' }">
    <div v-if="renderedNodes.length === 0" :style="{ color: '#6b7280', fontSize: '0.9rem' }">
      No region data available.
    </div>
    <svg
      v-else
      :width="svgWidth"
      :height="svgHeight"
      :style="{ display: 'block', maxWidth: '100%' }"
    >
      <!-- Edges drawn first so nodes render on top -->
      <line
        v-for="(edge, i) in renderedEdges"
        :key="`edge-${i}`"
        :x1="edge.x1" :y1="edge.y1"
        :x2="edge.x2" :y2="edge.y2"
        stroke="#374151"
        stroke-width="2"
      />
      <!-- Region nodes -->
      <g v-for="node in renderedNodes" :key="node.id">
        <rect
          :x="node.x" :y="node.y"
          :width="NODE_W" :height="NODE_H"
          rx="6"
          :fill="node.isCurrent ? '#0d2118' : '#111827'"
          :stroke="node.isCurrent ? '#50dc96' : node.color"
          :stroke-width="node.isCurrent ? 2.5 : 1.5"
        />
        <!-- Current region: name / level range / you are here -->
        <template v-if="node.isCurrent">
          <text
            :x="node.x + NODE_W / 2"
            :y="node.y + 15"
            text-anchor="middle"
            dominant-baseline="middle"
            fill="#50dc96"
            font-size="13"
            font-family="ui-monospace, 'Cascadia Code', monospace"
          >{{ node.name }}</text>
          <text
            :x="node.x + NODE_W / 2"
            :y="node.y + 31"
            text-anchor="middle"
            dominant-baseline="middle"
            fill="#9ca3af"
            font-size="11"
            font-family="ui-monospace, 'Cascadia Code', monospace"
          >{{ node.levelLabel }}</text>
          <text
            :x="node.x + NODE_W / 2"
            :y="node.y + 47"
            text-anchor="middle"
            dominant-baseline="middle"
            fill="#50dc96"
            font-size="10"
            font-style="italic"
            font-family="ui-monospace, 'Cascadia Code', monospace"
          >(you are here)</text>
        </template>
        <!-- Other regions: name / level range, colorized by difficulty -->
        <template v-else>
          <text
            :x="node.x + NODE_W / 2"
            :y="node.y + NODE_H / 2 - 8"
            text-anchor="middle"
            dominant-baseline="middle"
            :fill="node.color"
            font-size="13"
            font-family="ui-monospace, 'Cascadia Code', monospace"
          >{{ node.name }}</text>
          <text
            :x="node.x + NODE_W / 2"
            :y="node.y + NODE_H / 2 + 10"
            text-anchor="middle"
            dominant-baseline="middle"
            fill="#6b7280"
            font-size="11"
            font-family="ui-monospace, 'Cascadia Code', monospace"
          >{{ node.levelLabel }}</text>
        </template>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { RegionRow, LocationRow, LocationConnectionRow, CharacterRow } from '../module_bindings';

const props = defineProps<{
  regions: RegionRow[];
  locations: LocationRow[];
  locationConnections: LocationConnectionRow[];
  selectedCharacter: CharacterRow | null;
}>();

const NODE_W = 180;
const NODE_H = 60;
const H_GAP = 64;
const V_GAP = 24;
const PADDING = 32;

const conColorForDiff = (diff: number): string => {
  if (diff <= -5) return '#6b7280';
  if (diff <= -3) return '#b6f7c4';
  if (diff <= -1) return '#8bd3ff';
  if (diff === 0) return '#f8fafc';
  if (diff <= 2) return '#f6d365';
  if (diff <= 4) return '#f59e0b';
  return '#f87171';
};

// Deduplicated region-to-region edges derived from cross-region location connections
const regionEdges = computed(() => {
  const seen = new Set<string>();
  const pairs: Array<[string, string]> = [];
  for (const conn of props.locationConnections) {
    const fromLoc = props.locations.find(l => l.id.toString() === conn.fromLocationId.toString());
    const toLoc = props.locations.find(l => l.id.toString() === conn.toLocationId.toString());
    if (!fromLoc || !toLoc) continue;
    const aId = fromLoc.regionId.toString();
    const bId = toLoc.regionId.toString();
    if (aId === bId) continue;
    const key = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push([aId < bId ? aId : bId, aId < bId ? bId : aId]);
    }
  }
  return pairs;
});

// BFS positions: root = lowest dangerMultiplier, laid out left-to-right by depth
const positions = computed(() => {
  const result = new Map<string, { x: number; y: number }>();
  if (props.regions.length === 0) return result;

  const adj = new Map<string, string[]>();
  for (const r of props.regions) adj.set(r.id.toString(), []);
  for (const [a, b] of regionEdges.value) {
    adj.get(a)?.push(b);
    adj.get(b)?.push(a);
  }

  // Root: region with lowest dangerMultiplier (the starting area)
  const root = [...props.regions].sort((a, b) => Number(a.dangerMultiplier) - Number(b.dangerMultiplier))[0];

  // BFS to assign depths
  const depths = new Map<string, number>();
  const queue = [root.id.toString()];
  depths.set(root.id.toString(), 0);
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const d = depths.get(curr)!;
    for (const nb of adj.get(curr) ?? []) {
      if (!depths.has(nb)) {
        depths.set(nb, d + 1);
        queue.push(nb);
      }
    }
  }
  // Disconnected regions fall back to depth 0
  for (const r of props.regions) {
    if (!depths.has(r.id.toString())) depths.set(r.id.toString(), 0);
  }

  // Group by depth
  const byDepth = new Map<number, string[]>();
  for (const [id, depth] of depths) {
    if (!byDepth.has(depth)) byDepth.set(depth, []);
    byDepth.get(depth)!.push(id);
  }

  // Total height based on the tallest column
  const maxCount = Math.max(...[...byDepth.values()].map(v => v.length));
  const totalH = maxCount * NODE_H + (maxCount - 1) * V_GAP + PADDING * 2;

  for (const [depth, ids] of byDepth) {
    const colH = ids.length * NODE_H + (ids.length - 1) * V_GAP;
    const startY = (totalH - colH) / 2;
    for (let i = 0; i < ids.length; i++) {
      result.set(ids[i], {
        x: PADDING + depth * (NODE_W + H_GAP),
        y: startY + i * (NODE_H + V_GAP),
      });
    }
  }

  return result;
});

const svgWidth = computed(() => {
  if (positions.value.size === 0) return 200;
  return Math.max(...[...positions.value.values()].map(p => p.x + NODE_W)) + PADDING;
});

const svgHeight = computed(() => {
  if (positions.value.size === 0) return 100;
  return Math.max(...[...positions.value.values()].map(p => p.y + NODE_H)) + PADDING;
});

const currentRegionId = computed(() => {
  if (!props.selectedCharacter) return null;
  const loc = props.locations.find(l => l.id.toString() === props.selectedCharacter!.locationId.toString());
  return loc?.regionId?.toString() ?? null;
});

const renderedNodes = computed(() => {
  const playerLevel = props.selectedCharacter ? Number(props.selectedCharacter.level) : 1;
  return props.regions.flatMap(r => {
    const pos = positions.value.get(r.id.toString());
    if (!pos) return [];

    // Fixed base level derived from dangerMultiplier alone (÷10 gives a clean scale)
    const base = Math.round(Number(r.dangerMultiplier) / 10);
    const locs = props.locations.filter(l => l.regionId.toString() === r.id.toString());
    const levels = locs.length > 0
      ? locs.map(l => Math.max(1, base + Number(l.levelOffset)))
      : [Math.max(1, base)];
    const minLv = Math.min(...levels);
    const maxLv = Math.max(...levels);
    const levelLabel = minLv === maxLv ? `Approx. Level ${minLv}` : `Approx. Level ${minLv}-${maxLv}`;

    // Colorize relative to player level using the average fixed level
    const avgLv = Math.round((minLv + maxLv) / 2);
    const diff = avgLv - playerLevel;

    return [{
      id: r.id.toString(),
      name: r.name,
      levelLabel,
      x: pos.x,
      y: pos.y,
      color: conColorForDiff(diff),
      isCurrent: r.id.toString() === currentRegionId.value,
    }];
  });
});

const renderedEdges = computed(() => {
  return regionEdges.value.flatMap(([aId, bId]) => {
    const posA = positions.value.get(aId);
    const posB = positions.value.get(bId);
    if (!posA || !posB) return [];
    return [{
      x1: posA.x + NODE_W / 2,
      y1: posA.y + NODE_H / 2,
      x2: posB.x + NODE_W / 2,
      y2: posB.y + NODE_H / 2,
    }];
  });
});
</script>
