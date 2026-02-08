<template>
  <div>
    <div :style="styles.panelSectionTitle">Combat</div>
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to enter combat.
    </div>
    <div v-else>
      <div v-if="activeCombat">
        <div :style="styles.subtle">
          Fighting {{ activeEnemyName }} (Lv {{ activeEnemyLevel }})
        </div>
        <div v-if="activeEnemy" :style="styles.subtle">
          Enemy HP: {{ activeEnemy.currentHp }} / {{ activeEnemy.maxHp }}
        </div>
        <div :style="styles.combatTimer">Round ends in {{ roundEndsInSeconds }}s</div>
        <div :style="styles.subtle">
          {{ selectedAction ? `Action selected: ${selectedAction}` : 'Awaiting your action.' }}
        </div>
        <div :style="styles.panelSectionTitle">Combatants</div>
        <ul :style="styles.list">
          <li v-for="member in combatRoster" :key="member.id.toString()">
            <strong>{{ member.name }}</strong>
            <span :style="styles.subtle">
              (Lv {{ member.level }}) · HP {{ member.hp }} / {{ member.maxHp }} ·
              {{ formatStatus(member.status) }}
              <span v-if="member.isYou">(You)</span>
            </span>
            <div :style="styles.hpBar">
              <div :style="{ ...styles.hpFill, width: `${hpPercent(member)}%` }"></div>
            </div>
          </li>
        </ul>
        <div :style="styles.panelFormInline">
          <button
            type="button"
            :disabled="!connActive"
            :style="selectedAction === 'attack' ? styles.actionButtonSelected : styles.ghostButton"
            @click="$emit('attack')"
          >
            Attack
          </button>
          <button
            type="button"
            :disabled="!connActive"
            :style="selectedAction === 'skip' ? styles.actionButtonSelected : styles.ghostButton"
            @click="$emit('skip')"
          >
            Skip
          </button>
          <button
            type="button"
            :disabled="!connActive"
            :style="selectedAction === 'flee' ? styles.actionButtonSelected : styles.ghostButton"
            @click="$emit('flee')"
          >
            Flee
          </button>
        </div>
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
            {{ enemy.name }} (Lv {{ enemy.level }})
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
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

type CombatRosterEntry = {
  id: bigint;
  name: string;
  level: bigint;
  hp: bigint;
  maxHp: bigint;
  status: string;
  isYou: boolean;
};

defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: CharacterRow | null;
  activeCombat: CombatEncounterRow | null;
  activeEnemy: CombatEnemyRow | null;
  activeEnemyName: string;
  activeEnemyLevel: bigint;
  activeEnemySpawn: { id: bigint } | null;
  combatRoster: CombatRosterEntry[];
  roundEndsInSeconds: number;
  selectedAction: 'attack' | 'skip' | 'flee' | null;
  enemySpawns: EnemySummary[];
  activeResult: CombatResultRow | null;
  canEngage: boolean;
  canDismissResults: boolean;
}>();

defineEmits<{
  (e: 'start', enemyId: bigint): void;
  (e: 'attack'): void;
  (e: 'skip'): void;
  (e: 'flee'): void;
  (e: 'dismiss-results'): void;
}>();

const formatStatus = (status: string) => {
  switch (status) {
    case 'active':
      return 'Active';
    case 'fled':
      return 'Fled';
    case 'dead':
      return 'Dead';
    default:
      return status;
  }
};

const hpPercent = (member: CombatRosterEntry) => {
  if (!member.maxHp) return 0;
  const percent = (Number(member.hp) / Number(member.maxHp)) * 100;
  return Math.max(0, Math.min(100, Math.round(percent)));
};
</script>
