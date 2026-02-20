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

    <!-- Racial Profile section -->
    <div v-if="racialProfileRace" style="margin-top: 12px">
      <div :style="styles.panelSectionTitle">Racial Profile — {{ racialProfileRace.name }}</div>
      <div :style="styles.statsGrid">
        <template v-for="entry in racialProfileEntries" :key="entry.label + entry.style">
          <div :style="entry.style === 'rate' ? { color: 'rgba(180,180,180,0.65)', fontStyle: 'italic' } : {}">
            {{ entry.label }}
          </div>
          <div :style="
            entry.style === 'penalty' ? { color: 'rgba(255,100,100,0.85)' } :
            entry.style === 'level' ? { color: 'rgba(255,215,100,0.9)' } :
            entry.style === 'rate' ? { color: 'rgba(180,180,180,0.65)', fontStyle: 'italic' } :
            {}
          ">{{ entry.value }}</div>
        </template>
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
    races: any[];
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

  // Format a bonus value for a given type (100=1% scale for % stats)
  function fmtVal(type: string, value: bigint): string {
    const v = Number(value);
    switch (type) {
      case 'crit_chance':
      case 'dodge':
      case 'hit_chance':
      case 'parry':
      case 'magic_resist':
        return `+${(v / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
      case 'faction_bonus':
      case 'loot_bonus':
        return `+${v}%`;
      case 'travel_cost_discount':
        return `−${v} stamina`;
      case 'travel_cost_increase':
        return `+${v} stamina`;
      default:
        return `+${v}`;
    }
  }

  function fmtLabel(type: string): string {
    switch (type) {
      case 'stat_str': return 'STR';
      case 'stat_dex': return 'DEX';
      case 'stat_int': return 'INT';
      case 'stat_wis': return 'WIS';
      case 'stat_cha': return 'CHA';
      case 'spell_damage': return 'Spell Damage';
      case 'phys_damage': return 'Phys Damage';
      case 'max_hp': return 'Max HP';
      case 'max_mana': return 'Max Mana';
      case 'mana_regen': return 'Mana Regen';
      case 'stamina_regen': return 'Stamina Regen';
      case 'crit_chance': return 'Crit';
      case 'armor': return 'Armor';
      case 'dodge': return 'Dodge';
      case 'hp_regen': return 'HP Regen';
      case 'max_stamina': return 'Max Stamina';
      case 'hit_chance': return 'Hit';
      case 'parry': return 'Parry';
      case 'faction_bonus': return 'Faction Gain';
      case 'magic_resist': return 'Magic Resist';
      case 'perception': return 'Perception';
      case 'travel_cost_discount': return 'Travel Discount';
      case 'travel_cost_increase': return 'Travel Cost';
      case 'loot_bonus': return 'Resource Find';
      default: return type;
    }
  }

  const racialProfileRace = computed(() => {
    const c = props.selectedCharacter;
    if (!c || !props.races?.length) return null;
    return props.races.find((r: any) => r.id.toString() === c.raceId?.toString()) ?? null;
  });

  type ProfileEntry = { label: string; value: string; style: 'normal' | 'penalty' | 'level' | 'rate' };

  const racialProfileEntries = computed((): ProfileEntry[] => {
    const c = props.selectedCharacter;
    const race = racialProfileRace.value;
    if (!c || !race) return [];

    const level = c.level as bigint;
    const evenLevels = level / 2n;
    const entries: ProfileEntry[] = [];

    // Creation bonus 1
    entries.push({ label: fmtLabel(race.bonus1Type), value: fmtVal(race.bonus1Type, race.bonus1Value), style: 'normal' });
    // Creation bonus 2
    entries.push({ label: fmtLabel(race.bonus2Type), value: fmtVal(race.bonus2Type, race.bonus2Value), style: 'normal' });

    // Penalty (one-time at creation)
    if (race.penaltyType && race.penaltyValue) {
      const pType = race.penaltyType as string;
      const pVal = race.penaltyValue as bigint;
      if (pType === 'travel_cost_discount') {
        // discount as penalty slot = a benefit
        entries.push({ label: fmtLabel(pType), value: fmtVal(pType, pVal), style: 'normal' });
      } else if (pType === 'travel_cost_increase') {
        entries.push({ label: fmtLabel(pType), value: `+${pVal} stamina`, style: 'penalty' });
      } else {
        entries.push({ label: fmtLabel(pType), value: `−${pVal}`, style: 'penalty' });
      }
    }

    // Accumulated level bonuses (gold, shows total so far)
    if (evenLevels > 0n) {
      const totalVal = race.levelBonusValue * evenLevels;
      const rateStr = fmtVal(race.levelBonusType, race.levelBonusValue);
      entries.push({
        label: fmtLabel(race.levelBonusType),
        value: `${fmtVal(race.levelBonusType, totalVal)} (${evenLevels}× ${rateStr})`,
        style: 'level',
      });
    }

    // Per-even-level rate (gray/italic)
    entries.push({
      label: 'Per even level',
      value: `${fmtVal(race.levelBonusType, race.levelBonusValue)} ${fmtLabel(race.levelBonusType)}`,
      style: 'rate',
    });

    return entries;
  });
  </script>
