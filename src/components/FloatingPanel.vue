<template>
  <div
    v-if="alwaysOpen || panels[panelId]?.open"
    :data-panel-id="panelId"
    :class="extraClass"
    :style="rootStyle"
    @mousedown="bringToFront(panelId)"
  >
    <div
      :style="headerStyle"
      @mousedown="startDrag(panelId, $event)"
    >
      <slot name="header">
        <div>{{ title }}</div>
      </slot>
      <button
        v-if="closable"
        type="button"
        :style="styles.panelClose"
        @click="closePanelById(panelId)"
      >x</button>
    </div>
    <div :style="computedBodyStyle">
      <slot />
    </div>
    <div :style="styles.resizeHandleRight" @mousedown.stop="startResize(panelId, $event, { right: true })" />
    <div :style="styles.resizeHandleBottom" @mousedown.stop="startResize(panelId, $event, { bottom: true })" />
    <div :style="styles.resizeHandle" @mousedown.stop="startResize(panelId, $event, { right: true, bottom: true })" />
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import { styles } from '../ui/styles';

const props = withDefaults(defineProps<{
  panelId: string;
  title?: string;
  wide?: boolean;
  compact?: boolean;
  hotbar?: boolean;
  alwaysOpen?: boolean;
  closable?: boolean;
  bodyStyle?: Record<string, any>;
  extraClass?: string;
}>(), {
  title: '',
  wide: false,
  compact: false,
  hotbar: false,
  alwaysOpen: false,
  closable: true,
  bodyStyle: undefined,
  extraClass: undefined,
});

const pm = inject<{
  panels: Record<string, any>;
  panelStyle: (id: string) => { value: Record<string, any> };
  bringToFront: (id: string) => void;
  startDrag: (id: string, event: MouseEvent) => void;
  startResize: (id: string, event: MouseEvent, edges: { right?: boolean; bottom?: boolean }) => void;
  closePanelById: (id: string) => void;
}>('panelManager')!;

const { panels, panelStyle, bringToFront, startDrag, startResize, closePanelById } = pm;

const rootStyle = computed(() => {
  const base: Record<string, any> = { ...styles.floatingPanel };
  if (props.wide) Object.assign(base, styles.floatingPanelWide);
  if (props.compact) Object.assign(base, styles.floatingPanelCompact);
  if (props.hotbar) Object.assign(base, styles.floatingPanelHotbar);
  const ps = panelStyle(props.panelId).value || {};
  Object.assign(base, ps);
  return base;
});

const headerStyle = computed(() => styles.floatingPanelHeader);

const computedBodyStyle = computed(() => {
  if (props.bodyStyle) return props.bodyStyle;
  return styles.floatingPanelBody;
});
</script>
