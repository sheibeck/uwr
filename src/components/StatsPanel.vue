<template>
  <div>
    <div :style="styles.panelSectionTitle">Stats</div>
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to view stats.
    </div>
    <div v-else>
      <div :style="styles.panelSectionTitle">Core</div>
      <div :style="styles.statsGrid">
        <div>Level</div>
        <div>{{ selectedCharacter.level }}</div>
        <div>XP</div>
        <div>{{ selectedCharacter.xp }}</div>
        <div>HP</div>
        <div>{{ selectedCharacter.hp }} / {{ selectedCharacter.maxHp }}</div>
        <div>Mana</div>
        <div>{{ selectedCharacter.mana }} / {{ selectedCharacter.maxMana }}</div>
        <div>Stamina</div>
        <div>{{ selectedCharacter.stamina }} / {{ selectedCharacter.maxStamina }}</div>
      </div>

      <div :style="styles.panelSectionTitle">Base Stats</div>
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

      <div :style="styles.panelSectionTitle">Derived</div>
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

      <div :style="styles.panelSectionTitle">Equipment</div>
      <div v-if="equippedItems.length === 0" :style="styles.subtle">
        No equipment equipped.
      </div>
      <ul v-else :style="styles.list">
        <li v-for="item in equippedItems" :key="item.slot">
          {{ item.slot }}: {{ item.name }} ({{ item.rarity }})
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CharacterRow } from '../module_bindings';

defineProps<{
  styles: Record<string, Record<string, string | number>>;
  selectedCharacter: CharacterRow | null;
  equippedItems: { slot: string; name: string; rarity: string }[];
}>();

const formatPercent = (value: bigint) => `${(Number(value) / 100).toFixed(2)}%`;
const formatScalar = (value: bigint) => Number(value).toString();
</script>
