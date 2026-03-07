<template>
  <div :style="containerStyle">
    <!-- Context action bar -->
    <div v-if="contextActions.length > 0" :style="actionBarStyle">
      <button
        v-for="action in contextActions"
        :key="action.command"
        type="button"
        :disabled="action.disabled"
        :style="[
          actionBtnBase,
          action.disabled ? actionBtnDisabled : {},
          actionCategoryBorder(action.category),
        ]"
        @click="!action.disabled && $emit('submit', action.command)"
      >{{ action.label }}</button>
    </div>

    <!-- Input row -->
    <div :style="inputRowStyle">
      <div :style="inputWrapperStyle">
        <input
          ref="inputEl"
          type="text"
          :placeholder="placeholder"
          :disabled="disabled && !connActive"
          :value="inputText"
          :style="inputStyle"
          @input="onInput"
          @keydown="onKeydown"
          @focus="showSuggestions = true"
          @blur="onBlur"
        />
        <!-- Slash command suggestions (admin only) -->
        <div v-if="shouldShowSuggestions" :style="suggestionsStyle">
          <button
            v-for="cmd in filteredCommands"
            :key="cmd.value"
            type="button"
            :style="[
              suggestionItemStyle,
              cmd.value === highlighted ? suggestionItemActiveStyle : {},
            ]"
            @mousedown.prevent="selectCommand(cmd.value)"
          >
            <span>{{ cmd.value }}</span>
            <span :style="{ opacity: 0.5, fontSize: '0.7rem', marginLeft: '8px' }">{{ cmd.hint }}</span>
          </button>
        </div>
      </div>
      <button
        type="button"
        :disabled="!connActive || (!inputText.trim() && !disabled)"
        :style="sendBtnStyle"
        @click="handleSubmit"
      >Send</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

export type ContextAction = {
  label: string;
  command: string;
  disabled?: boolean;
  category?: 'combat' | 'explore' | 'social' | 'ability' | 'utility';
};

const props = withDefaults(defineProps<{
  disabled: boolean;
  contextActions: ContextAction[];
  placeholder: string;
  connActive: boolean;
}>(), {
  placeholder: 'What do you do?',
});

const emit = defineEmits<{
  (e: 'submit', text: string): void;
  (e: 'skip-animation'): void;
}>();

const inputEl = ref<HTMLInputElement | null>(null);
const inputText = ref('');
const showSuggestions = ref(false);
const highlighted = ref<string | null>(null);

const adminCommands = [
  { value: '/level', hint: 'Set your level (testing)' },
  { value: '/grantrenown', hint: 'Grant test renown points' },
  { value: '/spawncorpse', hint: 'Spawn test corpse with junk item' },
  { value: '/createitem', hint: 'Create test item by quality tier' },
  { value: '/createscroll', hint: 'Create recipe scroll' },
  { value: '/synccontent', hint: 'Sync server content tables' },
  { value: '/resetwindows', hint: 'Reset all panel positions' },
  { value: '/endevent', hint: 'End active world event' },
  { value: '/setappversion', hint: 'Set app version (admin)' },
  { value: '/recomputeracial', hint: 'Recompute racial bonuses (admin)' },
  { value: '/endcombat', hint: 'Force end current combat' },
  { value: '/who', hint: 'List all online characters' },
  { value: '/look', hint: 'Describe current location' },
  { value: '/say', hint: 'Talk nearby' },
  { value: '/w', hint: 'Whisper to a character' },
  { value: '/hail', hint: 'Greet an NPC' },
  { value: '/group', hint: 'Message your group' },
  { value: '/invite', hint: 'Invite to group' },
  { value: '/friend', hint: 'Send friend request' },
  { value: '/accept', hint: 'Accept group invite' },
  { value: '/decline', hint: 'Decline group invite' },
  { value: '/kick', hint: 'Kick group member' },
  { value: '/promote', hint: 'Promote group leader' },
  { value: '/leave', hint: 'Leave current group' },
];

const shouldShowSuggestions = computed(() => {
  return (
    inputText.value.trim().startsWith('/') &&
    filteredCommands.value.length > 0 &&
    showSuggestions.value
  );
});

const filteredCommands = computed(() => {
  const query = inputText.value.trim().toLowerCase();
  if (!query.startsWith('/')) return [];
  return adminCommands.filter((cmd) => cmd.value.startsWith(query));
});

const onInput = (event: Event) => {
  inputText.value = (event.target as HTMLInputElement).value;
  highlighted.value = null;
};

const selectCommand = (value: string) => {
  inputText.value = `${value} `;
  highlighted.value = null;
  inputEl.value?.focus();
};

const onBlur = () => {
  window.setTimeout(() => {
    showSuggestions.value = false;
    highlighted.value = null;
  }, 150);
};

const handleSubmit = () => {
  if (props.disabled) {
    emit('skip-animation');
    return;
  }
  const text = inputText.value.trim();
  if (!text) return;
  emit('submit', text);
  inputText.value = '';
};

const onKeydown = (event: KeyboardEvent) => {
  if (props.disabled) {
    emit('skip-animation');
    return;
  }

  // Arrow navigation for suggestions
  if (shouldShowSuggestions.value) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const values = filteredCommands.value.map((cmd) => cmd.value);
      if (!values.length) return;
      const currentIndex = highlighted.value ? values.indexOf(highlighted.value) : -1;
      if (event.key === 'ArrowDown') {
        highlighted.value = values[(currentIndex + 1) % values.length];
      } else {
        highlighted.value = values[(currentIndex - 1 + values.length) % values.length];
      }
      return;
    }

    if (event.key === 'Enter' && highlighted.value) {
      event.preventDefault();
      const trimmed = inputText.value.trim();
      const hasArgs = trimmed.includes(' ') && trimmed.length > highlighted.value.length;
      if (trimmed === highlighted.value || hasArgs) {
        highlighted.value = null;
        handleSubmit();
      } else {
        selectCommand(highlighted.value);
      }
      return;
    }

    if (event.key === 'Escape') {
      highlighted.value = null;
      showSuggestions.value = false;
      return;
    }
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    handleSubmit();
  }
};

const actionCategoryBorder = (category?: string) => {
  switch (category) {
    case 'combat':
    case 'ability':
      return { borderColor: '#5c2a2a' };
    case 'explore':
      return { borderColor: '#2a5c2a' };
    case 'social':
      return { borderColor: '#2a2a5c' };
    default:
      return {};
  }
};

// Styles
const containerStyle = {
  position: 'fixed' as const,
  bottom: '0',
  left: '0',
  right: '0',
  zIndex: 10000,
  background: '#12121a',
  borderTop: '1px solid #2a2a3a',
};

const actionBarStyle = {
  padding: '4px 12px',
  display: 'flex',
  gap: '4px',
  overflowX: 'auto' as const,
};

const actionBtnBase = {
  background: '#1a1a2e',
  border: '1px solid #2a2a3a',
  color: '#adb5bd',
  padding: '3px 8px',
  borderRadius: '3px',
  fontSize: '0.75rem',
  whiteSpace: 'nowrap' as const,
  cursor: 'pointer',
};

const actionBtnDisabled = {
  opacity: '0.4',
  cursor: 'default',
};

const inputRowStyle = {
  display: 'flex',
  padding: '6px 12px',
  gap: '8px',
};

const inputWrapperStyle = {
  flex: '1',
  position: 'relative' as const,
};

const inputStyle = {
  width: '100%',
  background: '#0d0d14',
  border: '1px solid #2a2a3a',
  color: '#e9ecef',
  padding: '8px 12px',
  borderRadius: '4px',
  fontSize: '0.9rem',
  outline: 'none',
  boxSizing: 'border-box' as const,
};

const sendBtnStyle = {
  background: '#1864ab',
  border: 'none',
  color: '#e9ecef',
  padding: '8px 16px',
  borderRadius: '4px',
  fontSize: '0.85rem',
  cursor: 'pointer',
  fontWeight: 600,
  whiteSpace: 'nowrap' as const,
};

const suggestionsStyle = {
  position: 'absolute' as const,
  bottom: '100%',
  left: '0',
  right: '0',
  background: '#1a1a2e',
  border: '1px solid #2a2a3a',
  borderBottom: 'none',
  borderRadius: '4px 4px 0 0',
  maxHeight: '200px',
  overflowY: 'auto' as const,
  zIndex: 10001,
};

const suggestionItemStyle = {
  display: 'flex',
  width: '100%',
  padding: '6px 12px',
  background: 'transparent',
  border: 'none',
  color: '#e9ecef',
  fontSize: '0.8rem',
  cursor: 'pointer',
  textAlign: 'left' as const,
};

const suggestionItemActiveStyle = {
  background: 'rgba(24, 100, 171, 0.3)',
};
</script>
