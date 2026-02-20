<template>
  <div :style="styles.panelBody">
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to view stats.
    </div>
    <div v-else>
    <div :style="styles.statsColumns">
      <div :style="styles.statsColumn">
        <div :style="styles.panelSectionTitle">Core</div>
        <div :style="styles.statsGrid">
          <div>Level</div>
          <div>{{ selectedCharacter.level }}</div>
            <div>XP</div>
            <div>{{ selectedCharacter.xp }}</div>
            <div>Bound</div>
            <div>{{ boundLocationName }}<span v-if="boundRegionName">, {{ boundRegionName }}</span></div>
            <div>HP</div>
            <div>{{ selectedCharacter.hp }} / {{ selectedCharacter.maxHp }}</div>
            <template v-if="selectedCharacter.maxMana > 0">
              <div>Mana</div>
              <div>{{ selectedCharacter.mana }} / {{ selectedCharacter.maxMana }}</div>
            </template>
          <div>Stamina</div>
          <div>{{ selectedCharacter.stamina }} / {{ selectedCharacter.maxStamina }}</div>
        </div>

        <div :style="styles.panelSectionTitle">Base Stats</div>
        <div :style="styles.statsGrid">
          <div>Strength</div>
          <div>
            {{ totalStr }}
              <span :style="styles.subtleSmall" title="Base Strength">({{ baseStr }})</span>
            </div>
            <div>Dexterity</div>
            <div>
              {{ totalDex }}
              <span :style="styles.subtleSmall" title="Base Dexterity">({{ baseDex }})</span>
            </div>
            <div>Charisma</div>
            <div>
              {{ totalCha }}
              <span :style="styles.subtleSmall" title="Base Charisma">({{ baseCha }})</span>
            </div>
            <div>Wisdom</div>
            <div>
              {{ totalWis }}
              <span :style="styles.subtleSmall" title="Base Wisdom">({{ baseWis }})</span>
            </div>
          <div>Intelligence</div>
          <div>
            {{ totalInt }}
            <span :style="styles.subtleSmall" title="Base Intelligence">({{ baseInt }})</span>
          </div>
        </div>
      </div>

      <div :style="styles.statsColumn">
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
      </div>
    </div>

    </div>
  </div>
</template>

  <script setup lang="ts">
  import { computed } from 'vue';
  import type { CharacterRow, LocationRow, RegionRow } from '../module_bindings';

  const props = defineProps<{
    styles: Record<string, Record<string, string | number>>;
    selectedCharacter: CharacterRow | null;
    statBonuses: { str: bigint; dex: bigint; cha: bigint; wis: bigint; int: bigint };
    locations: LocationRow[];
    regions: RegionRow[];
  }>();

  const boundLocationName = computed(() => {
    if (!props.selectedCharacter) return 'Unknown';
    const match = props.locations.find(
      (row) => row.id.toString() === props.selectedCharacter?.boundLocationId?.toString()
    );
    return match?.name ?? 'Unknown';
  });

  const boundRegionName = computed(() => {
    if (!props.selectedCharacter) return '';
    const match = props.locations.find(
      (row) => row.id.toString() === props.selectedCharacter?.boundLocationId?.toString()
    );
    if (!match) return '';
    const region = props.regions.find((row) => row.id.toString() === match.regionId.toString());
    return region?.name ?? '';
  });

  const baseStr = computed(() => Number(props.selectedCharacter?.str ?? 0n));
  const baseDex = computed(() => Number(props.selectedCharacter?.dex ?? 0n));
  const baseCha = computed(() => Number(props.selectedCharacter?.cha ?? 0n));
  const baseWis = computed(() => Number(props.selectedCharacter?.wis ?? 0n));
  const baseInt = computed(() => Number(props.selectedCharacter?.int ?? 0n));

  const totalStr = computed(() => baseStr.value + Number(props.statBonuses?.str ?? 0n));
  const totalDex = computed(() => baseDex.value + Number(props.statBonuses?.dex ?? 0n));
  const totalCha = computed(() => baseCha.value + Number(props.statBonuses?.cha ?? 0n));
  const totalWis = computed(() => baseWis.value + Number(props.statBonuses?.wis ?? 0n));
  const totalInt = computed(() => baseInt.value + Number(props.statBonuses?.int ?? 0n));

  const formatPercent = (value: bigint) => `${(Number(value) / 100).toFixed(2)}%`;
  const formatScalar = (value: bigint) => Number(value).toString();
  </script>
