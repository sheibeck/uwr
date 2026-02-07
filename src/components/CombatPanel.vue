<template>
  <div>
    <div :style="styles.panelSectionTitle">Combat</div>
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to enter combat.
    </div>
    <div v-else>
      <div v-if="activeCombat">
        <div :style="styles.subtle">
          Fighting {{ activeCombat.enemyName }} (Lv {{ activeCombat.enemyLevel }})
        </div>
        <div :style="styles.subtle">
          Enemy HP: {{ activeCombat.enemyHp }} / {{ activeCombat.enemyMaxHp }}
        </div>
        <form @submit.prevent="$emit('attack')" :style="styles.panelFormInline">
          <input
            type="number"
            min="1"
            :value="attackDamage"
            :disabled="!connActive"
            :style="styles.smallInput"
            @input="onDamageInput"
          />
          <button type="submit" :disabled="!connActive" :style="styles.primaryButton">
            Attack
          </button>
          <button
            type="button"
            :disabled="!connActive"
            @click="$emit('end')"
            :style="styles.ghostButton"
          >
            Flee
          </button>
        </form>
      </div>
      <div v-else>
        <div :style="styles.subtle">Choose an enemy to engage.</div>
        <div :style="styles.buttonWrap">
          <button
            v-for="enemy in enemyTemplates"
            :key="enemy.id.toString()"
            @click="$emit('start', enemy.id)"
            :disabled="!connActive"
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
import type { CharacterRow, CombatRow, EnemyTemplateRow } from '../module_bindings';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: CharacterRow | null;
  activeCombat: CombatRow | null;
  enemyTemplates: EnemyTemplateRow[];
  attackDamage: number;
}>();

const emit = defineEmits<{
  (e: 'start', enemyId: bigint): void;
  (e: 'attack'): void;
  (e: 'end'): void;
  (e: 'update:attackDamage', value: number): void;
}>();

const onDamageInput = (event: Event) => {
  const value = Number((event.target as HTMLInputElement).value);
  emit('update:attackDamage', value);
};
</script>
