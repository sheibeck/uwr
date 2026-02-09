<template>
    <div>
      <div v-if="!selectedCharacter" :style="styles.subtle">
        Select a character to view inhabitants.
      </div>
      <div v-else>
        <details :style="styles.accordion" open>
          <summary :style="styles.accordionSummary">Characters ({{ charactersHere.length }})</summary>
          <div :style="styles.roster">
            <div v-if="charactersHere.length === 0" :style="styles.subtle">
              Nobody else is around.
            </div>
            <div v-else :style="styles.rosterList">
              <span
                v-for="character in charactersHere"
                :key="character.id.toString()"
                :style="styles.rosterTag"
              >
                {{ character.name }}
              </span>
            </div>
          </div>
        </details>

        <details :style="styles.accordion">
          <summary :style="styles.accordionSummary">NPCs</summary>
          <div :style="styles.roster">
            <div :style="styles.subtle">No NPCs here yet.</div>
          </div>
        </details>

<details :style="styles.accordion" open>
  <summary :style="styles.accordionSummary">Enemies</summary>
  <div v-if="activeCombat">
    <div :style="styles.subtle">
      Fighting
      <span :style="styles[activeEnemyConClass] ?? {}">
        {{ activeEnemyName }} (Lv {{ activeEnemyLevel }})
      </span>
    </div>
    <div v-if="activeEnemy" :style="styles.subtle">
      Enemy HP: {{ activeEnemy.currentHp }} / {{ activeEnemy.maxHp }}
    </div>
    <div :style="styles.combatTimer">Round ends in {{ roundEndsInSeconds }}s</div>
    <div :style="styles.subtle">
      {{ selectedActionLabel }}
    </div>
    <div :style="styles.panelFormInline">
      <button
        type="button"
        :disabled="!connActive || !canAct"
        :style="selectedAction === 'attack' ? styles.actionButtonSelected : styles.ghostButton"
        @click="$emit('attack')"
      >
        Attack
      </button>
      <button
        type="button"
        :disabled="!connActive || !canAct"
        :style="selectedAction === 'skip' ? styles.actionButtonSelected : styles.ghostButton"
        @click="$emit('skip')"
      >
        Skip
      </button>
      <button
        type="button"
        :disabled="!connActive || !canAct"
        :style="selectedAction === 'flee' ? styles.actionButtonSelected : styles.ghostButton"
        @click="$emit('flee')"
      >
        Flee
      </button>
    </div>
    <div v-if="hotbar.length > 0" :style="styles.buttonWrap">
      <button
        v-for="slot in hotbar"
        :key="slot.slot"
        type="button"
        :disabled="!connActive || !canUseAbility || !slot.abilityKey"
        :style="
          selectedAction === `ability:${slot.abilityKey}`
            ? styles.actionButtonSelected
            : styles.ghostButton
        "
        @click="$emit('use-ability', slot.abilityKey)"
      >
        {{ slot.slot }}: {{ slot.name }}
      </button>
    </div>
    <div v-if="!canAct" :style="styles.subtle">You are down and cannot act.</div>
  </div>
  <div v-else-if="activeResult">
    <div :style="styles.panelSectionTitle">Combat Results</div>
    <div :style="styles.subtle">{{ activeResult.summary }}</div>
    <div :style="styles.panelFormInline">
      <button
        v-if="canDismissResults"
        type="button"
        :style="styles.primaryButton"
        @click="$emit('dismiss-results')"
      >
        Dismiss
      </button>
      <span v-else :style="styles.subtle">Waiting for the leader to dismiss.</span>
    </div>
  </div>
  <div v-else>
    <div :style="styles.subtle">Choose an enemy to engage.</div>
    <div v-if="!canEngage" :style="styles.subtle">
      Only the group leader can engage enemies.
    </div>
    <div v-if="enemySpawns.length === 0" :style="styles.subtle">
      No enemies are available right now.
    </div>
    <div :style="styles.buttonWrap">
      <button
        v-for="enemy in enemySpawns"
        :key="enemy.id.toString()"
        @click="$emit('start', enemy.id)"
        :disabled="!connActive || !canEngage"
        :style="styles.ghostButton"
      >
        <span :style="styles[enemy.conClass] ?? {}">
          {{ enemy.name }} (Lv {{ enemy.level }})
        </span>
      </button>
    </div>
  </div>
        </details>
      </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  CharacterRow,
  CombatEncounterRow,
  CombatEnemyRow,
  CombatResultRow,
} from '../module_bindings';

type EnemySummary = {
  id: bigint;
  name: string;
  level: bigint;
};

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: CharacterRow | null;
  charactersHere: CharacterRow[];
  activeCombat: CombatEncounterRow | null;
  activeEnemy: CombatEnemyRow | null;
  activeEnemyName: string;
  activeEnemyLevel: bigint;
  activeEnemyConClass: string;
  activeEnemySpawn: { id: bigint } | null;
  roundEndsInSeconds: number;
  selectedAction: string | null;
  enemySpawns: EnemySummary[];
  activeResult: CombatResultRow | null;
  canEngage: boolean;
  canDismissResults: boolean;
  canAct: boolean;
  hotbar: { slot: number; abilityKey: string; name: string }[];
  canUseAbility: boolean;
}>();

defineEmits<{
  (e: 'start', enemyId: bigint): void;
  (e: 'attack'): void;
  (e: 'skip'): void;
  (e: 'flee'): void;
  (e: 'use-ability', abilityKey: string): void;
  (e: 'dismiss-results'): void;
}>();

const selectedActionLabel = computed(() => {
  if (!props.selectedAction) return 'Awaiting your action.';
  if (props.selectedAction.startsWith('ability:')) {
    const key = props.selectedAction.replace('ability:', '');
    const ability = props.hotbar.find((slot) => slot.abilityKey === key);
    return `Action selected: ${ability?.name ?? key}`;
  }
  return `Action selected: ${props.selectedAction}`;
});

</script>
