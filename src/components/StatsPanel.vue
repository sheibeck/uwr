<template>
  <div>
    <div :style="styles.panelSectionTitle">Stats</div>
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to view stats.
    </div>
    <div v-else>
      <details :style="styles.accordion" open>
        <summary :style="styles.accordionSummary">Core</summary>
        <div :style="styles.statsGrid">
          <div>Level</div>
          <div>{{ selectedCharacter.level }}</div>
          <div>XP</div>
          <div>{{ selectedCharacter.xp }}</div>
          <div>HP</div>
          <div>{{ selectedCharacter.hp }} / {{ selectedCharacter.maxHp }}</div>
          <template v-if="selectedCharacter.maxMana > 0">
            <div>Mana</div>
            <div>{{ selectedCharacter.mana }} / {{ selectedCharacter.maxMana }}</div>
          </template>
          <div>Stamina</div>
          <div>{{ selectedCharacter.stamina }} / {{ selectedCharacter.maxStamina }}</div>
        </div>
      </details>

      <details :style="styles.accordion" open>
        <summary :style="styles.accordionSummary">Base Stats</summary>
        <div :style="styles.statsGrid">
          <div>Strength</div>
          <div>{{ selectedCharacter.str }}</div>
          <div>Dexterity</div>
          <div>{{ selectedCharacter.dex }}</div>
          <div>Charisma</div>
          <div>{{ selectedCharacter.cha }}</div>
          <div>Wisdom</div>
          <div>{{ selectedCharacter.wis }}</div>
          <div>Intelligence</div>
          <div>{{ selectedCharacter.int }}</div>
        </div>
      </details>

      <details :style="styles.accordion" open>
        <summary :style="styles.accordionSummary">Derived</summary>
        <div :style="styles.statsGrid">
          <div>Hit</div>
          <div>{{ formatPercent(selectedCharacter.hitChance) }}</div>
          <div>Dodge</div>
          <div>{{ formatPercent(selectedCharacter.dodgeChance) }}</div>
          <div>Parry</div>
          <div>{{ formatPercent(selectedCharacter.parryChance) }}</div>
          <div>Crit (Melee)</div>
          <div>{{ formatPercent(selectedCharacter.critMelee) }}</div>
          <div>Crit (Ranged)</div>
          <div>{{ formatPercent(selectedCharacter.critRanged) }}</div>
          <div>Crit (Divine)</div>
          <div>{{ formatPercent(selectedCharacter.critDivine) }}</div>
          <div>Crit (Arcane)</div>
          <div>{{ formatPercent(selectedCharacter.critArcane) }}</div>
          <div>Armor Class</div>
          <div>{{ selectedCharacter.armorClass }}</div>
          <div>Perception</div>
          <div>{{ formatScalar(selectedCharacter.perception) }}</div>
          <div>Search</div>
          <div>{{ formatScalar(selectedCharacter.search) }}</div>
          <div>CC Power</div>
          <div>{{ formatPercent(selectedCharacter.ccPower) }}</div>
          <div>Vendor Buy</div>
          <div>-{{ formatPercent(selectedCharacter.vendorBuyMod) }}</div>
          <div>Vendor Sell</div>
          <div>+{{ formatPercent(selectedCharacter.vendorSellMod) }}</div>
        </div>
      </details>

    </div>
  </div>
</template>

<script setup lang="ts">
import type { CharacterRow } from '../module_bindings';

defineProps<{
  styles: Record<string, Record<string, string | number>>;
  selectedCharacter: CharacterRow | null;
}>();

const formatPercent = (value: bigint) => `${(Number(value) / 100).toFixed(2)}%`;
const formatScalar = (value: bigint) => Number(value).toString();
</script>
