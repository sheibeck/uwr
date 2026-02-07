<template>
  <form @submit.prevent="$emit('submit')" :style="styles.commandBar">
    <input
      type="text"
      placeholder="Type a command..."
      :value="commandText"
      :disabled="!connActive || !hasCharacter"
      :style="styles.commandInput"
      @input="onCommandInput"
    />
    <button
      type="submit"
      :disabled="!connActive || !hasCharacter || !commandText.trim()"
      :style="styles.primaryButton"
    >
      Send
    </button>
  </form>
</template>

<script setup lang="ts">
const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  hasCharacter: boolean;
  commandText: string;
}>();

const emit = defineEmits<{
  (e: 'submit'): void;
  (e: 'update:commandText', value: string): void;
}>();

const onCommandInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value;
  emit('update:commandText', value);
};
</script>
