<template>
  <Teleport to="body">
    <div
      v-if="visible"
      data-context-menu
      :style="{
        ...styles.contextMenu,
        left: `${clampedX}px`,
        top: `${clampedY}px`,
      }"
    >
      <div :style="styles.contextMenuTitle">{{ title }}</div>
      <div v-if="subtitle" :style="styles.contextMenuSubtitle">{{ subtitle }}</div>
      <template v-if="$slots.default">
        <slot />
      </template>
      <div
        v-for="(item, idx) in items"
        :key="idx"
        :style="item.disabled ? styles.contextMenuItemDisabled : hoverIndex === idx ? hoveredItemStyle : styles.contextMenuItem"
        @click="!item.disabled && handleItemClick(item)"
        @mouseenter="!item.disabled && (hoverIndex = idx)"
        @mouseleave="hoverIndex = null"
      >
        {{ item.label }}
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{
  visible: boolean;
  x: number;
  y: number;
  title: string;
  subtitle?: string;
  items: Array<{ label: string; disabled?: boolean; action: () => void }>;
  styles: Record<string, any>;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const hoverIndex = ref<number | null>(null);

const hoveredItemStyle = computed(() => ({
  ...props.styles.contextMenuItem,
  background: 'rgba(76, 125, 240, 0.25)',
}));

const clampedX = computed(() => {
  const menuWidth = 280;
  if (props.x + menuWidth > window.innerWidth) {
    return window.innerWidth - menuWidth - 10;
  }
  return props.x;
});

const clampedY = computed(() => {
  const menuHeight = 200;
  if (props.y + menuHeight > window.innerHeight) {
    return window.innerHeight - menuHeight - 10;
  }
  return props.y;
});

const handleItemClick = (item: { action: () => void }) => {
  item.action();
  emit('close');
};

const handleOutsideClick = (event: MouseEvent) => {
  if (!props.visible) return;
  const target = event.target as HTMLElement;
  if (!target.closest('[data-context-menu]')) {
    emit('close');
  }
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && props.visible) {
    emit('close');
  }
};

onMounted(() => {
  document.addEventListener('mousedown', handleOutsideClick);
  document.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleOutsideClick);
  document.removeEventListener('keydown', handleKeydown);
});
</script>
