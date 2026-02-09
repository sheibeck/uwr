<template>
    <div>
      <div v-if="!selectedCharacter" :style="styles.subtle">
        Select a character to view inhabitants.
      </div>
      <div v-else>
        <div v-if="activeResult">
          <div :style="{ ...styles.resultCard, minHeight: '200px' }">
            <div :style="styles.resultHeading">{{ resultOutcome(activeResult.summary) }}</div>
            <div :style="styles.resultSummary">{{ stripFallen(activeResult.summary) }}</div>
            <div v-if="fallenList(activeResult.summary).length" :style="styles.resultRow">
              <span :style="styles.resultLabel">Fallen</span>
              <div :style="styles.resultList">
                <span
                  v-for="name in fallenList(activeResult.summary)"
                  :key="name"
                  :style="styles.resultTag"
                >
                  {{ name }}
                </span>
              </div>
            </div>
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
        </div>
        <details v-else :style="activeCombat ? styles.accordionCombat : styles.accordion" open>
          <summary :style="styles.accordionSummary">Enemies</summary>
          <div v-if="activeCombat" :style="styles.combatBlock">
            <div :style="styles.combatRow">
              <span :style="styles.combatLabel">Fighting</span>
              <span :style="[styles.combatValue, styles[activeEnemyConClass] ?? {}]">
                {{ activeEnemyName }} (Lv {{ activeEnemyLevel }})
              </span>
            </div>
    <div v-if="activeEnemy" :style="styles.combatRow">
      <span :style="styles.combatLabel">Enemy HP</span>
      <span :style="styles.combatValue">
        {{ activeEnemy.currentHp }} / {{ activeEnemy.maxHp }}
      </span>
    </div>
    <div v-if="activeEnemy" :style="styles.hpBar">
      <div
        :style="{
          ...styles.hpFill,
          width: `${percent(activeEnemy.currentHp, activeEnemy.maxHp)}%`,
        }"
      ></div>
    </div>
    <div v-if="enemyCastProgress > 0" :style="styles.enemyCastBar">
      <div
        :style="{
          ...styles.enemyCastFill,
          width: `${Math.round(enemyCastProgress * 100)}%`,
        }"
      ></div>
      <div :style="styles.enemyCastLabel">{{ enemyCastLabel }}</div>
    </div>
    <div v-if="activeEnemyEffects.length > 0" :style="styles.effectRow">
      <span
        v-for="effect in activeEnemyEffects"
        :key="effect.id.toString()"
        :style="effect.isNegative ? styles.effectBadgeNegative : styles.effectBadgePositive"
      >
        {{ effect.label }} {{ effect.seconds }}s
      </span>
    </div>
    <div v-if="enemyTargetName" :style="styles.combatRow">
      <span :style="styles.combatLabel">Targeting</span>
      <span :style="styles.combatValue">{{ enemyTargetName }}</span>
    </div>
    <div :style="styles.combatRow">
      <span :style="styles.combatLabel">Status</span>
      <span :style="styles.combatValue">{{ enemyActionText }}</span>
    </div>
    <div :style="styles.panelFormInline">
      <button
        type="button"
        :disabled="!connActive || !canAct"
        :style="styles.ghostButton"
        @click="$emit('flee')"
      >
        Flee
      </button>
    </div>
    <div v-if="!canAct" :style="styles.subtle">You are down and cannot act.</div>
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
        <template v-if="!activeCombat && !activeResult">
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
        </template>
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
  activeEnemyEffects: { id: bigint; label: string; seconds: number; isNegative: boolean }[];
  activeEnemySpawn: { id: bigint } | null;
  enemySpawns: EnemySummary[];
  activeResult: CombatResultRow | null;
  canEngage: boolean;
  canDismissResults: boolean;
  canAct: boolean;
  enemyTargetName: string;
  enemyActionText: string;
  enemyCastProgress: number;
  enemyCastLabel: string;
}>();

const percent = (value: bigint, max: bigint) => {
  if (!max || max === 0n) return 0;
  return Math.max(0, Math.min(100, (Number(value) / Number(max)) * 100));
};

const fallenList = (summary: string) => {
  const match = summary.match(/Fallen:\s*([^.]*)/i);
  if (!match) return [] as string[];
  return match[1]
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
};

const stripFallen = (summary: string) => summary.replace(/\s*Fallen:.*$/i, '').trim();

const resultOutcome = (summary: string) => {
  const lowered = summary.toLowerCase();
  if (lowered.startsWith('victory')) return 'Victory';
  if (lowered.startsWith('defeat')) return 'Defeat';
  return 'Combat Results';
};

defineEmits<{
  (e: 'start', enemyId: bigint): void;
  (e: 'flee'): void;
  (e: 'dismiss-results'): void;
}>();
</script>
