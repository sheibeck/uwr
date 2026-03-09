<template>
  <div :style="containerStyle">
    <!-- Combat UI: Enemy HUD + Action Bar (during active combat) -->
    <template v-if="isInCombat">
      <EnemyHud
        :enemies="combatEnemies"
        @target-enemy="(id: bigint) => $emit('target-enemy', id)"
      />
      <CombatActionBar
        :abilities="combatAbilities"
        :casting-ability-id="castingAbilityId"
        :cast-progress="castProgress"
        @flee="$emit('flee')"
        @use-ability="(id: bigint) => $emit('use-ability', id)"
      />
    </template>

    <!-- Context action bar (outside combat) -->
    <div v-else-if="contextActions.length > 0" :style="actionBarStyle">
      <button
        v-for="action in contextActions"
        :key="action.command"
        type="button"
        :disabled="action.disabled"
        :style="[
          actionBtnBase,
          action.disabled ? actionBtnDisabled : {},
          action.active ? actionBtnActive : {},
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
          :disabled="disabled || !connActive"
          :value="inputText"
          :style="inputStyle"
          @input="onInput"
          @keydown="onKeydown"
          @focus="showSuggestions = true"
          @blur="onBlur"
        />
        <!-- Command suggestions -->
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
        :disabled="!connActive || disabled || !inputText.trim()"
        :style="sendBtnStyle"
        @click="handleSubmit"
      >Send</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import CombatActionBar from './CombatActionBar.vue';
import type { CombatAbility } from './CombatActionBar.vue';
import EnemyHud from './EnemyHud.vue';

export type ContextAction = {
  label: string;
  command: string;
  disabled?: boolean;
  category?: 'combat' | 'explore' | 'social' | 'ability' | 'utility';
  active?: boolean;
};

type CombatEnemyEntry = {
  id: bigint;
  name: string;
  level: bigint;
  hp: bigint;
  maxHp: bigint;
  conClass: string;
  isTarget: boolean;
  isBoss: boolean;
};

const props = withDefaults(defineProps<{
  disabled: boolean;
  contextActions: ContextAction[];
  placeholder: string;
  connActive: boolean;
  isInCombat?: boolean;
  combatAbilities?: CombatAbility[];
  combatEnemies?: CombatEnemyEntry[];
  castingAbilityId?: bigint | null;
  castProgress?: number;
}>(), {
  placeholder: 'What do you do?',
  isInCombat: false,
  combatAbilities: () => [],
  combatEnemies: () => [],
  castingAbilityId: null,
  castProgress: 0,
});

const emit = defineEmits<{
  (e: 'submit', text: string): void;
  (e: 'skip-animation'): void;
  (e: 'flee'): void;
  (e: 'use-ability', abilityId: bigint): void;
  (e: 'target-enemy', enemyId: bigint): void;
}>();

const inputEl = ref<HTMLInputElement | null>(null);
const inputText = ref('');
const showSuggestions = ref(false);
const highlighted = ref<string | null>(null);

const playerCommands = [
  { value: 'look', hint: 'Describe current location' },
  { value: 'consider', hint: "Assess a target's threat level" },
  { value: 'attack', hint: 'Engage enemies' },
  { value: 'flee', hint: 'Escape combat' },
  { value: 'hail', hint: 'Greet an NPC' },
  { value: 'say', hint: 'Talk nearby' },
  { value: 'w', hint: 'Whisper to a character' },
  { value: 'whisper', hint: 'Whisper to a character' },
  { value: 'group', hint: 'Message your group' },
  { value: 'invite', hint: 'Invite to group' },
  { value: 'accept', hint: 'Accept group invite' },
  { value: 'decline', hint: 'Decline group invite' },
  { value: 'kick', hint: 'Kick group member' },
  { value: 'promote', hint: 'Promote group leader' },
  { value: 'leave', hint: 'Leave current group' },
  { value: 'who', hint: 'List online characters' },
  { value: 'friend', hint: 'Send friend request' },
  { value: 'camp', hint: 'Log out your character' },
  { value: 'endcombat', hint: 'Force end combat' },
  { value: 'time', hint: 'Check day/night cycle' },
  { value: 'stats', hint: 'View character stats' },
  { value: 'abilities', hint: 'View your abilities' },
  { value: 'character', hint: 'View race and class info' },
  { value: 'inventory', hint: 'View equipped gear' },
  { value: 'backpack', hint: 'View unequipped items' },
  { value: 'quests', hint: 'View active quests' },
  { value: 'travel', hint: 'List destinations' },
  { value: 'bind', hint: 'Bind to location' },
  { value: 'loot', hint: 'Check for loot' },
  { value: 'bank', hint: 'Access bank vault' },
  { value: 'shop', hint: 'Browse vendor wares' },
  { value: 'craft', hint: 'View recipes' },
];

const shouldShowSuggestions = computed(() => {
  const trimmed = inputText.value.trim();
  return (
    filteredCommands.value.length > 0 &&
    trimmed.length > 0 &&
    !trimmed.includes(' ') &&
    showSuggestions.value
  );
});

const filteredCommands = computed(() => {
  const query = inputText.value.trim().toLowerCase();
  if (!query) return [];
  const bare = query.replace(/^\//, '');
  return playerCommands.filter((cmd) => {
    const cmdBare = cmd.value.replace(/^\//, '');
    return cmdBare.startsWith(bare);
  });
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

const actionBtnActive = {
  background: 'rgba(218, 119, 242, 0.2)',
  border: '1px solid rgba(218, 119, 242, 0.7)',
  color: '#da77f2',
  boxShadow: '0 0 8px rgba(218, 119, 242, 0.3)',
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
