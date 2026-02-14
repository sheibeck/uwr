# Quick Task 69: Completion Guide

## Current Status

**Completed:**
- ✅ Task 1: Schema extraction (100%)
- ✅ Task 2: Helper extraction (60%)
  - helpers/events.ts ✅
  - helpers/economy.ts ✅
  - helpers/items.ts ✅
  - helpers/character.ts ❌
  - helpers/location.ts ❌
  - helpers/combat.ts ❌ (largest file)

**Progress:**
- Lines extracted: 1643
- Current size: 5182 lines (down from 6825)
- Remaining to extract: ~4800 lines
- Target: 200-350 lines

**Commits made:**
1. 04b238f - Schema extraction
2. 7860cdd - Events helpers
3. bca6cc2 - Economy helpers
4. bb5aa00 - Items helpers

## Remaining Work

### helpers/character.ts (~100 lines)

**Functions to extract (currently in index.ts):**
- `getGroupParticipants` (line ~269)
- `isGroupLeaderOrSolo` (line ~286)
- `partyMembersInLocation` (line ~366)
- `recomputeCharacterDerived` (line ~1682)
- `isClassAllowed` (line ~2135)
- `friendUserIds` (line ~3421)
- `findCharacterByName` (line ~3429)

**Imports needed:**
```typescript
import { Character } from '../schema/tables';
import {
  BASE_HP,
  HP_STR_MULTIPLIER,
  BASE_MANA,
  baseArmorForClass,
  manaStatForClass,
  usesMana,
} from '../data/class_stats';
import { getEquippedBonuses } from './items';
import { sumCharacterEffect } from './combat';
import { effectiveGroupId } from './group';
```

### helpers/location.ts (~250 lines)

**Constants:**
- `DAY_DURATION_MICROS = 1_200_000_000n`
- `NIGHT_DURATION_MICROS = 600_000_000n`
- `DEFAULT_LOCATION_SPAWNS = 3`
- `RESOURCE_NODES_PER_LOCATION = 3`
- `RESOURCE_GATHER_CAST_MICROS = 8_000_000n`
- `RESOURCE_RESPAWN_MICROS = 10n * 60n * 1_000_000n`

**Functions to extract:**
- `getGatherableResourceTemplates` (line ~2238)
- `spawnResourceNode` (line ~4488)
- `ensureResourceNodesForLocation` (line ~4522)
- `respawnResourceNodesForLocation` (line ~4533)
- `computeLocationTargetLevel` (line ~4805)
- `getWorldState` (line ~4816)
- `isNightTime` (line ~4820)
- `connectLocations` (line ~4825)
- `areLocationsConnected` (line ~4830)
- `findEnemyTemplateByName` (line ~4856)
- `getEnemyRoleTemplates` (line ~4897)
- `pickRoleTemplate` (line ~4901)
- `seedSpawnMembers` (line ~4912)
- `refreshSpawnGroupCount` (line ~4932)
- `spawnEnemy` (line ~4944)
- `spawnEnemyWithTemplate` (line ~5056)
- `ensureAvailableSpawn` (line ~5125)
- `ensureSpawnsForLocation` (line ~5210)
- `respawnLocationSpawns` (line ~5271)

**Imports needed:**
```typescript
import { computeEnemyStats } from './combat';
```

### helpers/combat.ts (~2000 lines) **LARGEST**

**Constants:**
- `COMBAT_LOOP_INTERVAL_MICROS = 1_000_000n`
- `AUTO_ATTACK_INTERVAL = 5_000_000n`
- `GROUP_SIZE_DANGER_BASE = 100n`
- `GROUP_SIZE_BIAS_RANGE = 200n`
- `GROUP_SIZE_BIAS_MAX = 0.8`

**All remaining combat functions (lines 260-2000+):**
- `abilityResourceCost`
- `hasShieldEquipped`
- `abilityCooldownMicros`
- `abilityCastMicros`
- `enemyAbilityCastMicros`
- `enemyAbilityCooldownMicros`
- `rollAttackOutcome`
- `abilityDamageFromWeapon`
- `addCharacterEffect`
- `addEnemyEffect`
- `applyHpBonus`
- `getTopAggroId`
- `sumCharacterEffect`
- `sumEnemyEffect`
- `executeAbility` (massive ~1200 line function)
- `applyEnemyAbilityDamage`
- `executeEnemyAbility`
- `executePetAbility`
- `executeAbilityAction`
- `awardCombatXp`
- `applyDeathXpPenalty`
- `scheduleCombatTick`
- `getEnemyRole`
- `scaleByPercent`
- `applyArmorMitigation`
- `computeEnemyStats`
- `ENEMY_ROLE_CONFIG` constant

**Imports needed:**
```typescript
import { Character, AggroEntry } from '../schema/tables';
import { GLOBAL_COOLDOWN_MICROS, ABILITIES, ENEMY_ABILITIES } from '../data/ability_catalog';
import { MAX_LEVEL, xpModifierForDiff, xpRequiredForLevel } from '../data/xp';
import { computeBaseStats, usesMana, manaStatForClass, BASE_HP, HP_STR_MULTIPLIER, BASE_MANA, baseArmorForClass } from '../data/class_stats';
import {
  calculateCritChance,
  getCritMultiplier,
  getAbilityStatScaling,
  getAbilityMultiplier,
  calculateHealingPower,
  applyMagicResistMitigation,
  DOT_SCALING_RATE_MODIFIER,
  AOE_DAMAGE_MULTIPLIER,
  DEBUFF_POWER_COST_PERCENT,
  ENEMY_BASE_POWER,
  ENEMY_LEVEL_POWER_SCALING,
  GLOBAL_DAMAGE_MULTIPLIER,
  TANK_THREAT_MULTIPLIER,
  HEALER_THREAT_MULTIPLIER,
  HEALING_THREAT_PERCENT,
} from '../data/combat_scaling';
import { effectiveGroupId } from './group';
import { appendPrivateEvent, appendGroupEvent, appendPrivateAndGroupEvent, logPrivateAndGroup } from './events';
import { getEquippedBonuses, getEquippedWeaponStats } from './items';
```

### seeding/ensure_items.ts (~700 lines)

**Functions to extract:**
- `ensureStarterItemTemplates` (line ~3718)
- `ensureResourceItemTemplates` (line ~3927)
- `ensureFoodItemTemplates` (line ~4056)
- `ensureRecipeTemplates` (line ~4126)
- `ensureAbilityTemplates` (line ~4346)

**Imports:**
```typescript
import { ABILITY_STAT_SCALING } from '../data/combat_scaling';
import { ABILITIES, ENEMY_ABILITIES } from '../data/ability_catalog';
```

### seeding/ensure_enemies.ts (~500 lines)

**Functions to extract:**
- `ensureLootTables` (line ~4620)
- `ensureVendorInventory` (line ~4709)
- `ensureLocationEnemyTemplates` (line ~4872)
- `ensureEnemyAbilities` (line ~5461)
- `ensureEnemyTemplatesAndRoles` (line ~5752) - massive ~800 line function

### seeding/ensure_world.ts (~500 lines)

**Functions to extract:**
- `ensureNpcs` (line ~5347)
- `ensureQuestTemplates` (line ~5402)
- `ensureWorldLayout` (line ~5542) - massive ~1000 line function with world data

**Imports:**
```typescript
import { connectLocations } from '../helpers/location';
```

### seeding/ensure_content.ts (~100 lines)

**Functions to extract:**
- `ensureHealthRegenScheduled` (line ~5151)
- `ensureHungerDecayScheduled` (line ~5162)
- `ensureEffectTickScheduled` (line ~5171)
- `ensureHotTickScheduled` (line ~5180)
- `ensureCastTickScheduled` (line ~5189)
- `ensureDayNightTickScheduled` (line ~5198)
- `ensureLocationRuntimeBootstrap` (line ~5234)
- `syncAllContent` (line ~5252)

**Constants:**
- `HUNGER_DECAY_INTERVAL_MICROS` (line ~5160)

**Imports:**
```typescript
import { ScheduleAt } from 'spacetimedb';
import {
  DayNightTick,
  HealthRegenTick,
  HungerDecayTick,
  EffectTick,
  HotTick,
  CastTick,
} from '../schema/scheduled_tables';
import { ensureRaces } from '../data/races';
import { ensureFactions } from '../data/faction_data';
import { ensureStarterItemTemplates, ensureResourceItemTemplates, ensureFoodItemTemplates, ensureRecipeTemplates, ensureAbilityTemplates } from './ensure_items';
import { ensureNpcs, ensureQuestTemplates, ensureWorldLayout } from './ensure_world';
import { ensureLootTables, ensureVendorInventory, ensureLocationEnemyTemplates, ensureEnemyAbilities, ensureEnemyTemplatesAndRoles } from './ensure_enemies';
import { ensureSpawnsForLocation, ensureResourceNodesForLocation } from '../helpers/location';
```

## Final index.ts Structure

After all extractions, index.ts should contain ONLY:

1. **Imports** (~60 lines)
   - Schema import/export
   - All helper imports
   - All seeding imports
   - Data imports
   - Reducer/view imports

2. **tick_day_night reducer** (~30 lines) - kept inline
   ```typescript
   spacetimedb.reducer('tick_day_night', { arg: DayNightTick.rowType }, (ctx, { arg }) => {
     // ... day/night transition logic
   });
   ```

3. **Lifecycle hooks** (~55 lines)
   - `spacetimedb.init()`
   - `spacetimedb.clientConnected()`
   - `spacetimedb.clientDisconnected()`

4. **reducerDeps + registerReducers** (~130 lines)
   - Build deps object with all helpers
   - Call `registerReducers(reducerDeps)`

5. **registerViews** (~25 lines)
   - Build view deps object
   - Call `registerViews(viewDeps)`

**Target:** 200-350 lines total

## Extraction Steps

1. Create each helper file with proper imports
2. Copy functions from index.ts
3. Export all functions
4. Add imports to index.ts
5. Delete functions from index.ts
6. Test compilation
7. Commit

Repeat for all remaining files, then final cleanup and test module publish.

## Testing

After all extractions:
```bash
cd spacetimedb
npx tsc --noEmit  # Should have zero errors
spacetime publish uwr --clear-database -y --project-path .  # Should succeed
```

## Verification Checklist

- [ ] All helper files created
- [ ] All seeding files created
- [ ] index.ts reduced to <350 lines
- [ ] TypeScript compiles with zero errors
- [ ] Module publishes successfully
- [ ] SUMMARY.md created
- [ ] All commits made

---

**Estimated remaining time:** 2-3 hours of careful extraction and testing.
