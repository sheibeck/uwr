<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import { PhCastleTurret, PhDoorOpen, PhHammer, PhLockSimple, PhShieldCheck } from '@phosphor-icons/vue';
import { compareReading } from './graphLayout';
import type { CanvasSize, GraphLayout } from './graphLayout';
import type { GateView, NodeView } from './nodeView';

// The Map graph surface (51-UI-SPEC "Route-graph" section): one pixel plane holding, in order, the svg (border,
// edges, route), the region caption, the node buttons with their labels, and the gate pills. Every
// position comes from the layout, so lines, circles, labels and pills share one coordinate space.
// Renders from props only. Every server string is a text node or a bound attribute; the svg
// paints only through the scoped classes below (var(--...) tokens, never a literal colour).
// The plane also measures its scroll area (the parent element) and reports the whole-pixel size as
// `resize`, so the graph model can lay the region out to fill it (51-12, MS-02).
const props = defineProps<{
  layout: GraphLayout;
  views: NodeView[];
  /** Aligned with layout.gates. */
  gates: GateView[];
  /** SVG points strings, one per route polyline. */
  routes: string[];
  regionName: string;
  selectedId: bigint | null;
  currentId: bigint | null;
  mobile: boolean;
}>();

const emit = defineEmits<{ select: [id: bigint]; resize: [size: CanvasSize] }>();

const root = useTemplateRef<HTMLElement>('root');

const HIT_DESKTOP = 32;
const HIT_MOBILE = 44;

const hit = computed(() => (props.mobile ? HIT_MOBILE : HIT_DESKTOP));

function nodeStyle(view: NodeView): Record<string, string> {
  const size = hit.value;
  return {
    left: `${view.x - size / 2}px`,
    top: `${view.y - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
  };
}

function labelStyle(view: NodeView): Record<string, string> {
  return { left: `${view.label.x}px`, top: `${view.label.y}px`, width: `${view.label.w}px` };
}

function captionStyle(caption: NonNullable<GraphLayout['caption']>): Record<string, string> {
  return { left: `${caption.x}px`, top: `${caption.y}px`, maxWidth: `${caption.w}px` };
}

function gateStyle(index: number): Record<string, string> {
  const gate = props.layout.gates[index];
  return gate ? { left: `${gate.x}px`, top: `${gate.y}px` } : {};
}

/** The scoped class that carries the ring colour of a place's danger. */
function bandClass(view: NodeView): string {
  if (view.danger.kind === 'safe') return 'band-safe';
  if (view.danger.kind === 'unknown' || view.danger.band === null) return 'band-unknown';
  return `band-${view.danger.band}`;
}

function nodeClasses(view: NodeView): string[] {
  const classes = ['node', `state-${view.stateWord === 'heard of' ? 'heard' : view.stateWord}`, bandClass(view)];
  if (view.pressed) classes.push('selected');
  if (view.uncharted) classes.push('uncharted');
  if (view.passage) classes.push('passage');
  if (view.otherRegion) classes.push('other');
  return classes;
}

// ---------------------------------------------------------------------------
// roving tabindex
// ---------------------------------------------------------------------------

const focusedId = ref<bigint | null>(null);

const viewIds = computed(() => new Set(props.views.map((view) => view.id)));

/** The one node with tabindex 0: the focused one, else the selected, your place, the start. */
const tabId = computed<bigint | null>(() => {
  const ids = viewIds.value;
  for (const candidate of [focusedId.value, props.selectedId, props.currentId, props.layout.startId]) {
    if (candidate !== null && ids.has(candidate)) return candidate;
  }
  return props.views.length > 0 ? props.views[0].id : null;
});

// A new selection (a click, Enter, another screen) is the tab stop again.
watch(
  () => props.selectedId,
  () => {
    focusedId.value = null;
  },
);

function nodeElement(id: bigint | null): HTMLElement | null {
  if (id === null) return null;
  return root.value?.querySelector<HTMLElement>(`button.node[data-node-id="${id}"]`) ?? null;
}

function moveTo(id: bigint): void {
  focusedId.value = id;
  const element = nodeElement(id);
  if (element === null) return;
  element.focus();
  element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

function homeId(): bigint | null {
  const ids = viewIds.value;
  if (props.currentId !== null && ids.has(props.currentId)) return props.currentId;
  if (props.layout.startId !== null && ids.has(props.layout.startId)) return props.layout.startId;
  return props.views.length > 0 ? props.views[0].id : null;
}

/**
 * The node a navigation key leads to from `id`; null keeps focus where it is (MS-05). Home is your
 * place (else the start); End is the last view, since views follow the reading order. An arrow goes
 * to the nearest place in its direction: places inside the 45-degree cone first, then the lowest
 * forward offset + 2 x sideways offset, ties in reading order.
 */
function target(key: string, id: bigint): bigint | null {
  if (key === 'Home') return homeId();
  if (key === 'End') return props.views.length > 0 ? props.views[props.views.length - 1].id : null;

  const here = props.views.find((view) => view.id === id);
  if (here === undefined) return null;
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  const sign = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;

  let best: NodeView | null = null;
  let bestCone = false;
  let bestScore = Infinity;
  for (const view of props.views) {
    if (view.id === id) continue;
    const dx = view.x - here.x;
    const dy = view.y - here.y;
    const forward = (horizontal ? dx : dy) * sign;
    if (forward <= 0) continue;
    const side = Math.abs(horizontal ? dy : dx);
    const cone = side <= forward;
    const score = forward + 2 * side;
    const better =
      best === null ||
      (cone && !bestCone) ||
      (cone === bestCone && (score < bestScore || (score === bestScore && compareReading(view, best) < 0)));
    if (better) {
      best = view;
      bestCone = cone;
      bestScore = score;
    }
  }
  return best === null ? null : best.id;
}

function onKeydown(event: KeyboardEvent, id: bigint): void {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
    event.preventDefault();
    emit('select', id);
    return;
  }
  if (!NAV_KEYS.has(event.key)) return;
  event.preventDefault();
  const next = target(event.key, id);
  if (next !== null) moveTo(next);
}

/** Focus the group's current node (the roving tab stop), once the plane has redrawn. */
function focusCurrent(): void {
  void nextTick(() => nodeElement(tabId.value)?.focus());
}

/** Scroll a node into the canvas (centred by default). Unknown ids do nothing. */
function scrollToNode(id: bigint, block: 'center' | 'nearest' = 'center'): void {
  nodeElement(id)?.scrollIntoView?.({ block, inline: block });
}

// ---------------------------------------------------------------------------
// measured canvas: one ResizeObserver on the scroll area (the parent element), feature-detected,
// disconnected on unmount; whole pixels, only above zero and only when the size changes
// ---------------------------------------------------------------------------

let observer: ResizeObserver | null = null;
let lastSize: CanvasSize | null = null;

function stopObserving(): void {
  if (observer !== null) observer.disconnect();
  observer = null;
}

watch(
  root,
  (el) => {
    stopObserving();
    const area = el?.parentElement ?? null;
    if (area === null || typeof ResizeObserver === 'undefined') return;
    observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry === undefined) return;
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      if (width <= 0 || height <= 0) return;
      if (lastSize !== null && lastSize.width === width && lastSize.height === height) return;
      lastSize = { width, height };
      emit('resize', { width, height });
    });
    observer.observe(area);
  },
  { flush: 'post', immediate: true },
);

onBeforeUnmount(stopObserving);

defineExpose({ focusCurrent, scrollToNode });
</script>

<template>
  <div
    ref="root"
    class="graph-plane"
    :style="{ width: `${props.layout.width}px`, height: `${props.layout.height}px` }"
  >
    <svg
      class="plane-svg"
      :width="props.layout.width"
      :height="props.layout.height"
      :viewBox="`0 0 ${props.layout.width} ${props.layout.height}`"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        v-if="props.layout.border"
        class="border"
        :x="props.layout.border.x"
        :y="props.layout.border.y"
        :width="props.layout.border.w"
        :height="props.layout.border.h"
        rx="24"
        ry="24"
      />
      <line
        v-for="edge in props.layout.edges"
        :key="edge.key"
        class="edge"
        :class="{ cross: edge.kind === 'cross', uncharted: edge.kind === 'uncharted' }"
        :x1="edge.x1"
        :y1="edge.y1"
        :x2="edge.x2"
        :y2="edge.y2"
      />
      <polyline v-for="(points, index) in props.routes" :key="`route-${index}`" class="route" :points="points" />
    </svg>

    <span
      v-if="props.layout.caption"
      class="caption"
      aria-hidden="true"
      :style="captionStyle(props.layout.caption)"
      >{{ props.regionName }}</span
    >

    <div class="node-layer" role="group" :aria-label="`${props.regionName} route graph`">
      <template v-for="view in props.views" :key="String(view.id)">
        <button
          type="button"
          :class="nodeClasses(view)"
          :style="nodeStyle(view)"
          :data-node-id="String(view.id)"
          :aria-label="view.ariaLabel"
          :aria-pressed="view.pressed ? 'true' : 'false'"
          :tabindex="view.id === tabId ? 0 : -1"
          @focus="focusedId = view.id"
          @keydown="onKeydown($event, view.id)"
          @click="emit('select', view.id)"
        >
          <span class="circle" :class="`size-${view.size}`" aria-hidden="true">
            <component :is="view.terrain.icon" :size="view.size === 32 ? 16 : 12" aria-hidden="true" />
          </span>
        </button>
        <div
          class="label"
          :class="[
            `align-${view.label.align}`,
            `state-${view.stateWord === 'heard of' ? 'heard' : view.stateWord}`,
            { selected: view.pressed, other: view.otherRegion, mobile: props.mobile },
          ]"
          :style="labelStyle(view)"
          :data-node-id="String(view.id)"
          aria-hidden="true"
          @click="emit('select', view.id)"
        >
          <span class="line">
            <span class="name" :title="view.title">{{ view.name }}</span>
            <PhCastleTurret
              v-if="view.bindPoint"
              class="mark mark-bind-point"
              :size="12"
              aria-hidden="true"
            />
            <PhCastleTurret v-else-if="view.bindStone" class="mark mark-bind-stone" :size="12" aria-hidden="true" />
            <PhHammer v-if="view.crafting" class="mark mark-crafting" :size="12" aria-hidden="true" />
            <span
              v-if="props.mobile && view.levelLabel !== '' && !view.safe"
              class="level level-inline"
              :style="{ color: view.levelColor }"
              >{{ view.levelLabel }}</span
            >
          </span>
          <span v-if="!props.mobile" class="sub"
            >{{ view.subPrefix }}{{ view.terrain.word }}{{ view.subState }}<PhShieldCheck
              v-if="view.safe"
              class="sub-safe"
              :size="10"
              aria-hidden="true"
            /><template v-if="view.levelLabel !== '' && !view.safe"
              > · <span class="level" :style="{ color: view.levelColor }">{{ view.levelLabel }}</span></template
            ></span
          >
        </div>
      </template>
    </div>

    <button
      v-for="(gate, index) in props.gates"
      :key="gate.key"
      type="button"
      class="gate"
      :class="{
        locked: gate.locked,
        mobile: props.mobile,
        selected: props.selectedId !== null && gate.farId === props.selectedId,
      }"
      :style="gateStyle(index)"
      :data-gate-key="gate.key"
      :aria-label="gate.ariaLabel"
      @click="emit('select', gate.farId)"
    >
      <PhLockSimple v-if="gate.locked" class="gate-lock" :size="12" aria-hidden="true" />
      <PhDoorOpen v-else class="gate-door" :size="12" aria-hidden="true" />
      <span class="gate-text">{{ gate.text }}</span>
      <span v-if="gate.locked" class="gate-time" aria-hidden="true"> · {{ gate.timeText }}</span>
      <span v-else-if="!props.mobile && gate.levelText !== ''" class="gate-level" :style="{ color: gate.levelColor }">
        · {{ gate.levelText }}</span
      >
    </button>
  </div>
</template>

<style scoped>
.graph-plane {
  position: relative;
  flex: none;
  font-variant-numeric: tabular-nums;
}

/* ---- svg layer: paints only through these classes ---- */
.plane-svg {
  position: absolute;
  inset: 0;
  display: block;
  overflow: visible;
  pointer-events: none;
}

.border {
  fill: color-mix(in srgb, var(--color-accent-900) 35%, transparent);
  stroke: var(--color-neutral-600);
  stroke-width: 1px;
  stroke-dasharray: 6 4;
  vector-effect: non-scaling-stroke;
}

.edge {
  fill: none;
  stroke: var(--color-neutral-700);
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
}

.edge.cross {
  stroke: var(--color-accent-600);
  stroke-width: 2px;
  stroke-dasharray: 6 4;
}

.edge.uncharted {
  stroke-dasharray: 4 4;
}

.route {
  fill: none;
  stroke: var(--color-accent);
  stroke-width: 2px;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

/* ---- caption ---- */
.caption {
  position: absolute;
  overflow: hidden;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-overflow: ellipsis;
  color: var(--color-neutral-500);
  pointer-events: none;
  white-space: nowrap;
}

/* ---- nodes ---- */
.node-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.node {
  position: absolute;
  display: grid;
  place-items: center;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  pointer-events: auto;
}

.node:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.circle {
  position: relative;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-neutral-100);
}

.circle.size-32 {
  width: 32px;
  height: 32px;
}

.circle.size-24 {
  width: 24px;
  height: 24px;
}

.node:hover .circle {
  outline: 1px solid var(--color-neutral-300);
  outline-offset: 1px;
}

/* ring: visited 2px band colour, heard of 1px band colour at 45% */
.state-visited .circle {
  border: 2px solid var(--color-neutral-500);
}

.state-heard .circle {
  border: 1px solid color-mix(in srgb, var(--color-neutral-500) 45%, transparent);
  color: var(--color-neutral-400);
}

.band-safe.state-visited .circle,
.band-easy.state-visited .circle {
  border-color: var(--color-con-light-green);
}

.band-even.state-visited .circle {
  border-color: var(--color-con-blue);
}

.band-tough.state-visited .circle {
  border-color: var(--color-con-yellow);
}

.band-deadly.state-visited .circle {
  border-color: var(--color-con-red);
}

.band-safe.state-heard .circle,
.band-easy.state-heard .circle {
  border-color: color-mix(in srgb, var(--color-con-light-green) 45%, transparent);
}

.band-even.state-heard .circle {
  border-color: color-mix(in srgb, var(--color-con-blue) 45%, transparent);
}

.band-tough.state-heard .circle {
  border-color: color-mix(in srgb, var(--color-con-yellow) 45%, transparent);
}

.band-deadly.state-heard .circle {
  border-color: color-mix(in srgb, var(--color-con-red) 45%, transparent);
}

/* uncharted and unknown-danger places: a 1px dashed neutral ring */
.band-unknown.state-visited .circle,
.band-unknown.state-heard .circle {
  border: 1px dashed var(--color-neutral-500);
}

.uncharted .circle {
  color: var(--color-neutral-400);
}

.passage .circle {
  color: var(--color-accent-200);
}

/* here: 2px accent ring and glow, accent-200 icon */
.state-here .circle {
  border: 2px solid var(--color-accent);
  color: var(--color-accent-200);
  box-shadow: 0 0 16px color-mix(in srgb, var(--color-accent) 60%, transparent);
}

/* selected (not here): the accent halo around its own ring */
.selected:not(.state-here) .circle {
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-accent) 35%, transparent);
}

.node.other,
.label.other {
  opacity: 0.75;
}

/* ---- labels ---- */
.label {
  position: absolute;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  max-width: 144px;
  min-width: 0;
  cursor: pointer;
  pointer-events: auto;
  text-align: left;
}

.label.align-right {
  text-align: right;
}

.label.align-center {
  text-align: center;
}

.line {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-size: 12px;
  font-weight: 400;
}

.label.align-right .line {
  justify-content: flex-end;
}

.label.align-center .line {
  justify-content: center;
}

/* Mobile: one Micro 10 line, the name then the level in its band colour; the full sub-line stays in
   the node aria-label. */
.label.mobile .line {
  font-size: 10px;
}

.level-inline {
  flex: none;
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-neutral-300);
}

.state-heard .name {
  color: var(--color-neutral-500);
}

.state-here .name {
  color: var(--color-text);
  font-weight: 500;
}

.label.selected .name {
  color: var(--color-accent-200);
  font-weight: 500;
}

.label:hover .name,
.node:hover + .label .name {
  text-decoration: underline;
}

.mark {
  flex: none;
  color: var(--color-neutral-400);
}

.mark-bind-point {
  color: var(--color-accent-300);
}

.sub {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  font-weight: 400;
  color: var(--color-neutral-500);
}

.sub-safe {
  margin-left: 4px;
  vertical-align: middle;
  color: var(--color-con-light-green);
}

/* ---- gate pills ---- */
.gate {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  box-sizing: border-box;
  height: 24px;
  max-width: 176px;
  padding: 0 8px;
  border: 0;
  border-radius: 999px;
  background: var(--color-surface);
  box-shadow: inset 0 0 0 1px var(--color-accent-700);
  color: var(--color-accent-200);
  font: inherit;
  font-size: 10px;
  font-weight: 400;
  white-space: nowrap;
  cursor: pointer;
  transform: translate(-50%, -50%);
}

.gate:hover {
  background: var(--color-accent-900);
}

.gate:active {
  background: color-mix(in srgb, var(--color-text) 14%, var(--color-accent-900));
}

.gate:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.gate.locked {
  box-shadow: inset 0 0 0 1px var(--color-neutral-700);
  color: var(--color-neutral-400);
}

.gate.selected {
  box-shadow:
    inset 0 0 0 1px var(--color-accent),
    0 0 14px color-mix(in srgb, var(--color-accent) 40%, transparent);
}

.gate-lock,
.gate-door {
  flex: none;
}

.gate-text {
  max-width: 144px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Mobile: the pill is still 24px high and reaches 44px through the slop (44px target). */
.gate.mobile::after {
  content: '';
  position: absolute;
  inset: -10px 0;
}
</style>
