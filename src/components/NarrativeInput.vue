<template>
  <div :style="containerStyle">
    <!-- Enemy HUD (during active combat) -->
    <EnemyHud
      v-if="isInCombat"
      :enemies="combatEnemies"
      @target-enemy="(id: bigint) => $emit('target-enemy', id)"
    />

    <!-- Hotbar strip (always visible when character selected) -->
    <NarrativeHotbar
      v-if="showHotbar"
      :slots="hotbarSlots"
      :active-hotbar-name="activeHotbarName"
      :hotbar-list="hotbarList"
      @use-slot="emit('use-hotbar-slot', $event)"
      @prev-hotbar="emit('prev-hotbar')"
      @next-hotbar="emit('next-hotbar')"
      @list-hotbars="emit('list-hotbars')"
    />

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
import EnemyHud from './EnemyHud.vue';
import NarrativeHotbar from './NarrativeHotbar.vue';

type CombatEnemyEntry = {
  id: bigint;
  name: string;
  level: bigint;
  hp: bigint;
  maxHp: bigint;
  conClass: string;
  isTarget: boolean;
  isBoss: boolean;
  effects: { id: bigint; label: string; seconds: number; isNegative: boolean; isOwn: boolean }[];
};

const props = withDefaults(defineProps<{
  disabled: boolean;
  placeholder: string;
  connActive: boolean;
  isInCombat?: boolean;
  combatEnemies?: CombatEnemyEntry[];
  hotbarSlots?: any[];
  activeHotbarName?: string;
  hotbarList?: any[];
  showHotbar?: boolean;
}>(), {
  placeholder: 'What do you do?',
  isInCombat: false,
  combatEnemies: () => [],
  hotbarSlots: () => [],
  activeHotbarName: 'main',
  hotbarList: () => [],
  showHotbar: false,
});

const emit = defineEmits<{
  (e: 'submit', text: string): void;
  (e: 'skip-animation'): void;
  (e: 'target-enemy', enemyId: bigint): void;
  (e: 'use-hotbar-slot', slot: any): void;
  (e: 'prev-hotbar'): void;
  (e: 'next-hotbar'): void;
  (e: 'list-hotbars'): void;
}>();

const inputEl = ref<HTMLInputElement | null>(null);
const inputText = ref('');
const showSuggestions = ref(false);
const highlighted = ref<string | null>(null);

const playerCommands = [
  { value: 'abilities', hint: 'View your abilities' },
  { value: 'accept', hint: 'Accept group invite' },
  { value: 'attack', hint: 'Engage enemies' },
  { value: 'backpack', hint: 'View unequipped items' },
  { value: 'bank', hint: 'Access bank vault' },
  { value: 'bind', hint: 'Bind to location' },
  { value: 'camp', hint: 'Log out your character' },
  { value: 'character', hint: 'View race and class info' },
  { value: 'consider', hint: "Assess a target's threat level" },
  { value: 'craft', hint: 'View recipes' },
  { value: 'decline', hint: 'Decline group invite' },
  { value: 'endcombat', hint: 'Force end combat' },
  { value: 'events', hint: 'View world events' },
  { value: 'factions', hint: 'View faction standings' },
  { value: 'flee', hint: 'Escape combat' },
  { value: 'friend', hint: 'Send friend request' },
  { value: 'group', hint: 'Message your group' },
  { value: 'hail', hint: 'Greet an NPC' },
  { value: 'hotbar', hint: 'Manage hotbars (add/set/swap/switch)' },
  { value: 'hotbars', hint: 'List all hotbars' },
  { value: 'inventory', hint: 'View equipped gear' },
  { value: 'invite', hint: 'Invite to group' },
  { value: 'kick', hint: 'Kick group member' },
  { value: 'leave', hint: 'Leave current group' },
  { value: 'look', hint: 'Describe current location' },
  { value: 'loot', hint: 'Check for loot' },
  { value: 'promote', hint: 'Promote group leader' },
  { value: 'quest', hint: 'View active quests' },
  { value: 'quests', hint: 'View active quests' },
  { value: 'renown', hint: 'View renown rank and perks' },
  { value: 'say', hint: 'Talk nearby' },
  { value: 'sell', hint: 'Sell items to vendor' },
  { value: 'shop', hint: 'Browse vendor wares' },
  { value: 'stats', hint: 'View character stats' },
  { value: 'time', hint: 'Check day/night cycle' },
  { value: 'travel', hint: 'List destinations' },
  { value: 'w', hint: 'Whisper to a character' },
  { value: 'whisper', hint: 'Whisper to a character' },
  { value: 'who', hint: 'List online characters' },
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
