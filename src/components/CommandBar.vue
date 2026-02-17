<template>
  <form @submit.prevent="$emit('submit')" :style="styles.commandBar">
    <div :style="styles.commandWrapper">
      <input
        type="text"
        placeholder="Type a command..."
        :value="commandText"
        :disabled="!connActive || !hasCharacter"
        :style="styles.commandInput"
        @input="onCommandInput"
        @focus="showSuggestions = true"
        @blur="onBlur"
        @keydown="onKeydown"
      />
      <div v-if="shouldShowSuggestions" :style="styles.commandSuggestions">
        <button
          v-for="cmd in filteredCommands"
          :key="cmd.value"
          type="button"
          :style="[
            styles.commandSuggestionItem,
            cmd.value === highlighted ? styles.commandSuggestionItemActive : {}
          ]"
          @mousedown.prevent="selectCommand(cmd.value)"
        >
          <span>{{ cmd.value }}</span>
          <span :style="styles.commandSuggestionHint">{{ cmd.hint }}</span>
        </button>
      </div>
    </div>
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
import { computed, ref } from 'vue';

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

const showSuggestions = ref(false);
const highlighted = ref<string | null>(null);

  const commands = [
    { value: '/look', hint: 'Describe current location' },
    { value: '/say', hint: 'Talk nearby (targets NPC if selected)' },
    { value: '/w', hint: 'Whisper to a character' },
    { value: '/hail', hint: 'Greet an NPC' },
    { value: '/group', hint: 'Message your group' },
    { value: '/level', hint: 'Set your level (testing)' },
    { value: '/invite', hint: 'Invite to group' },
    { value: '/friend', hint: 'Send friend request' },
    { value: '/accept', hint: 'Accept group invite' },
    { value: '/decline', hint: 'Decline group invite' },
    { value: '/kick', hint: 'Kick group member' },
    { value: '/promote', hint: 'Promote group leader' },
    { value: '/leave', hint: 'Leave current group' },
    { value: '/endcombat', hint: 'Force end current combat (leader)' },
    { value: '/synccontent', hint: 'Sync server content tables' },
    { value: '/grantrenown', hint: 'Grant test renown points' },
    { value: '/spawncorpse', hint: 'Spawn test corpse with junk item' },
    { value: '/createitem', hint: 'Create test item by quality tier' },
    { value: '/resetwindows', hint: 'Reset all panel positions to center of screen' },
    { value: '/who', hint: 'List all online characters' },
  ];

const shouldShowSuggestions = computed(() => {
  return (
    props.commandText.trim().startsWith('/') &&
    filteredCommands.value.length > 0
  );
});

const filteredCommands = computed(() => {
  const query = props.commandText.trim().toLowerCase();
  if (!query.startsWith('/')) return [];
  return commands.filter((cmd) => cmd.value.startsWith(query));
});

const onCommandInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value;
  emit('update:commandText', value);
  if (!value.trim().startsWith('/')) {
    highlighted.value = null;
    return;
  }
  if (!highlighted.value && filteredCommands.value.length) {
    highlighted.value = filteredCommands.value[0].value;
  }
};

const selectCommand = (value: string) => {
  emit('update:commandText', `${value} `);
  highlighted.value = null;
};

const onBlur = () => {
  window.setTimeout(() => {
    highlighted.value = null;
  }, 100);
};

const onKeydown = (event: KeyboardEvent) => {
  if (!shouldShowSuggestions.value) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!filteredCommands.value.length) return;
    const values = filteredCommands.value.map((cmd) => cmd.value);
    const currentIndex = highlighted.value
      ? values.indexOf(highlighted.value)
      : -1;
    if (event.key === 'ArrowDown') {
      const nextIndex = (currentIndex + 1) % values.length;
      highlighted.value = values[nextIndex];
    } else {
      const prevIndex = (currentIndex - 1 + values.length) % values.length;
      highlighted.value = values[prevIndex];
    }
  }

  if (event.key === 'Enter' && highlighted.value) {
    event.preventDefault();
    const trimmed = props.commandText.trim();
    const hasArgs = trimmed.includes(' ') && trimmed.length > highlighted.value.length;

    if (trimmed === highlighted.value || hasArgs) {
      // Full command typed (with or without args) — execute it
      highlighted.value = null;
      emit('submit');
    } else {
      // Partial match — fill in the highlighted command
      selectCommand(highlighted.value);
    }
    return;
  }

  if (event.key === 'Escape') {
    highlighted.value = null;
  }
};
</script>
