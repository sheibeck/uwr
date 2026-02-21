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
            <div>CC Power</div>
            <div>{{ formatPercent(selectedCharacter.ccPower) }}</div>
            <div>Vendor Buy</div>
            <div>-{{ formatPercent(selectedCharacter.vendorBuyMod) }}</div>
          <div>Vendor Sell</div>
          <div>+{{ formatPercent(selectedCharacter.vendorSellMod) }}</div>
            <div>Block Chance</div>
            <div>{{ blockChancePercent.toFixed(1) }}% <span :style="styles.subtleSmall">(with shield)</span></div>
            <div>Block Mitigation</div>
            <div>{{ blockMitigationPercent }}% <span :style="styles.subtleSmall">(with shield)</span></div>
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

  // Block stats — same constants and formula as combat_scaling.ts / reducers/combat.ts
  // Computed from character base stats (not gear-boosted totals) to match server behaviour
  const STAT_BASE = 10n;
  const BLOCK_CHANCE_DEX_PER_POINT = 5n;  // 0.5% per DEX point, on 1000-scale
  const BLOCK_CHANCE_BASE = 50n;           // 5% base, on 1000-scale
  const BLOCK_MITIGATION_STR_PER_POINT = 2n; // 2% per STR point, on 100-scale
  const BLOCK_MITIGATION_BASE = 30n;       // 30% base, on 100-scale

  // Block chance: 5.0% at DEX=10, +0.5% per DEX above 10, clamped [1%, 20%]
  const blockChancePercent = computed((): number => {
    if (!props.selectedCharacter) return 0;
    const dex = props.selectedCharacter.dex;
    const offset = (dex - STAT_BASE) * BLOCK_CHANCE_DEX_PER_POINT;
    const raw = BLOCK_CHANCE_BASE + offset;
    const clamped = raw < 10n ? 10n : raw > 200n ? 200n : raw;
    return Number(clamped) / 10; // 1000-scale → percentage with one decimal (50n → 5.0%)
  });

  // Block mitigation: 30% at STR=10, +2% per STR above 10, clamped [10%, 80%]
  const blockMitigationPercent = computed((): number => {
    if (!props.selectedCharacter) return 0;
    const str = props.selectedCharacter.str;
    const offset = (str - STAT_BASE) * BLOCK_MITIGATION_STR_PER_POINT;
    const raw = BLOCK_MITIGATION_BASE + offset;
    const clamped = raw < 10n ? 10n : raw > 80n ? 80n : raw;
    return Number(clamped); // 100-scale → direct percentage (30n → 30%)
  });

  const formatPercent = (value: bigint) => `${(Number(value) / 10).toFixed(2)}%`;
  const formatScalar = (value: bigint) => Number(value).toString();
  </script>
