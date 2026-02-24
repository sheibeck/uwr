<template>
    <div>
      <div v-if="!selectedCharacter" :style="styles.subtle">
        Select a character to view location.
      </div>
      <div v-else>
        <details
          :style="activeCombat ? styles.accordionCombat : styles.accordion"
          :open="accordionState.enemies"
          @toggle="
            $emit('accordion-toggle', {
              key: 'enemies',
              open: ($event.target as HTMLDetailsElement).open,
            })
          "
        >
          <summary :style="styles.accordionSummary">Enemies</summary>
          <div v-if="activeCombat" :style="styles.combatBlock">
            <div :style="styles.combatRow">
              <span :style="styles.combatLabel">Fighting</span>
              <span :style="styles.combatValue">Enemies engaged</span>
            </div>
            <div :style="styles.roster">
              <div v-if="combatEnemies.length === 0" :style="styles.subtle">
                No enemies are present.
              </div>
              <div v-else :style="styles.rosterList">
                <div
                  v-for="enemy in combatEnemies"
                  :key="enemy.id.toString()"
                  :style="{
                    ...styles.rosterClickable,
                    ...(enemy.isTarget ? styles.rosterTagActive : {}),
                  }"
                  @click="$emit('select-enemy', enemy.id)"
                >
                  <div :style="styles.combatRow">
                      <span :style="[styles.combatValue, styles[enemy.conClass] ?? {}]">
                        {{ enemy.name }} (L{{ enemy.level }})
                      </span>
                    <span
                      v-if="enemy.isTarget"
                      :style="styles.targetBadge"
                    >
                      Target
                    </span>
                  </div>
                  <div :style="{ ...styles.hpBar, height: '13px', marginTop: '0.15rem' }">
                    <div
                      :style="{
                        ...styles.hpFill,
                        width: `${percent(enemy.hp, enemy.maxHp)}%`,
                      }"
                    ></div>
                    <span :style="{ ...styles.barText, fontSize: '0.55rem' }">{{ enemy.hp }} / {{ enemy.maxHp }}</span>
                  </div>
                  <div v-if="enemy.effects.length > 0" :style="styles.effectRow">
                    <span
                      v-for="effect in enemy.effects"
                      :key="effect.id.toString()"
                      :style="effect.isOwn
                        ? (effect.isNegative ? styles.effectBadgeOwnNegative : styles.effectBadgeOwnPositive)
                        : (effect.isNegative ? styles.effectBadgeNegative : styles.effectBadgePositive)"
                    >
                      {{ effect.label }} {{ formatEffectDuration(effect.seconds) }}
                    </span>
                  </div>
                  <div v-if="enemy.targetName" :style="styles.combatRow">
                    <span :style="styles.combatLabel">Targeting</span>
                    <span :style="styles.combatValue">{{ enemy.targetName }}</span>
                  </div>
                  <div v-if="enemy.isCasting" :style="styles.enemyCastBar">
                    <div
                      :style="{
                        ...styles.enemyCastFill,
                        width: `${Math.round(enemy.castProgress * 100)}%`,
                      }"
                    ></div>
                    <span v-if="enemy.castLabel" :style="styles.barText">{{ enemy.castLabel }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div :style="styles.panelFormInline">
              <button
                type="button"
                :disabled="!connActive || !canAct"
                :style="styles.ghostButton"
                @click="$emit('flee')"
              >
                {{ isFleeCasting ? 'Cancel' : 'Flee' }}
              </button>
            </div>
            <div v-if="isFleeCasting" :style="styles.enemyCastBar">
              <div
                :style="{
                  ...styles.enemyCastFill,
                  width: `${Math.round(fleeProgress * 100)}%`,
                  background: 'linear-gradient(90deg, rgba(255,180,60,0.6), rgba(255,120,30,0.9))',
                }"
              ></div>
              <span :style="styles.barText">Fleeing...</span>
            </div>
            <div v-if="!canAct" :style="styles.subtle">You are down and cannot act.</div>
          </div>
        </details>
      </div>
    </div>
</template>

<script setup lang="ts">
import type {
  Character,
  CombatEncounter,
} from '../module_bindings/types';
import { formatEffectDuration } from '../ui/effectTimers';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: Character | null;
  activeCombat: CombatEncounter | null;
  combatEnemies: {
    id: bigint;
    name: string;
    level: bigint;
    hp: bigint;
    maxHp: bigint;
    conClass: string;
    isTarget: boolean;
    effects: { id: bigint; label: string; seconds: number; isNegative: boolean; isOwn: boolean }[];
    castProgress: number;
    castLabel: string;
    targetName: string | null;
  }[];
  canAct: boolean;
  accordionState: {
    enemies: boolean;
  };
  isFleeCasting: boolean;
  fleeProgress: number;
}>();

const percent = (value: bigint, max: bigint) => {
  if (!max || max === 0n) return 0;
  return Math.max(0, Math.min(100, (Number(value) / Number(max)) * 100));
};

defineEmits<{
  (e: 'flee'): void;
  (e: 'select-enemy', enemyId: bigint): void;
  (e: 'accordion-toggle', value: { key: 'enemies'; open: boolean }): void;
}>();
</script>
