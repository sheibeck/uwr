---
phase: quick-69
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/schema/scheduled_tables.ts
  - spacetimedb/src/helpers/events.ts
  - spacetimedb/src/helpers/character.ts
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/helpers/items.ts
  - spacetimedb/src/helpers/location.ts
  - spacetimedb/src/helpers/economy.ts
  - spacetimedb/src/seeding/ensure_items.ts
  - spacetimedb/src/seeding/ensure_world.ts
  - spacetimedb/src/seeding/ensure_enemies.ts
  - spacetimedb/src/seeding/ensure_content.ts
  - spacetimedb/src/index.ts
autonomous: true

must_haves:
  truths:
    - "Module builds successfully with spacetime build"
    - "Module publishes successfully with spacetime publish"
    - "All existing reducer/view imports continue to resolve"
    - "No functional changes - pure file reorganization"
    - "index.ts reduced from ~6825 lines to ~200 lines"
  artifacts:
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "All 74 table definitions and schema export"
      contains: "export const spacetimedb = schema("
    - path: "spacetimedb/src/schema/scheduled_tables.ts"
      provides: "Scheduled table references (DayNightTick, etc.)"
    - path: "spacetimedb/src/helpers/events.ts"
      provides: "Event logging helpers (appendWorldEvent, appendLocationEvent, etc.)"
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "Combat execution functions (executeAbility, executeEnemyAbility, etc.)"
    - path: "spacetimedb/src/helpers/items.ts"
      provides: "Inventory and equipment helpers"
    - path: "spacetimedb/src/helpers/location.ts"
      provides: "Location, resource, and spawn helpers"
    - path: "spacetimedb/src/helpers/economy.ts"
      provides: "Faction standing helpers"
    - path: "spacetimedb/src/helpers/character.ts"
      provides: "Character validation and derived stat helpers"
    - path: "spacetimedb/src/seeding/ensure_items.ts"
      provides: "Item, recipe, food, resource template seeding"
    - path: "spacetimedb/src/seeding/ensure_world.ts"
      provides: "World layout, NPC, and quest seeding"
    - path: "spacetimedb/src/seeding/ensure_enemies.ts"
      provides: "Enemy template, role, ability, and loot table seeding"
    - path: "spacetimedb/src/seeding/ensure_content.ts"
      provides: "syncAllContent orchestrator and schedule ensurers"
    - path: "spacetimedb/src/index.ts"
      provides: "Thin hub: imports, re-exports, lifecycle hooks, reducerDeps wiring"
  key_links:
    - from: "spacetimedb/src/index.ts"
      to: "spacetimedb/src/schema/tables.ts"
      via: "import * re-export"
      pattern: "from './schema/tables'"
    - from: "spacetimedb/src/index.ts"
      to: "spacetimedb/src/reducers/index.ts"
      via: "registerReducers(reducerDeps)"
      pattern: "registerReducers"
    - from: "spacetimedb/src/index.ts"
      to: "spacetimedb/src/views/index.ts"
      via: "registerViews({...})"
      pattern: "registerViews"
---

<objective>
Refactor spacetimedb/src/index.ts (6,825 lines) into organized modules using a conservative split approach.

Purpose: The monolithic file is unmaintainable. Split into schema/, helpers/, and seeding/ directories while preserving the existing deps-based architecture. Zero breaking changes - pure file reorganization.

Output: index.ts reduced to ~200 lines (thin hub), with ~6600 lines distributed across 12 new files in 3 directories.
</objective>

<execution_context>
@C:/projects/uwr/.claude/get-shit-done/workflows/execute-plan.md
@C:/projects/uwr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/index.ts
@spacetimedb/src/reducers/index.ts
@spacetimedb/src/views/index.ts
@spacetimedb/src/views/types.ts
@spacetimedb/src/helpers/group.ts
@spacetimedb/src/data/class_stats.ts
@spacetimedb/src/data/ability_catalog.ts
@spacetimedb/src/data/combat_scaling.ts
@spacetimedb/src/data/xp.ts
@spacetimedb/src/data/races.ts
@spacetimedb/src/data/faction_data.ts
@spacetimedb/tsconfig.json
@spacetimedb/package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract table definitions and schema export into schema/ directory</name>
  <files>
    spacetimedb/src/schema/tables.ts
    spacetimedb/src/schema/scheduled_tables.ts
  </files>
  <action>
Create `spacetimedb/src/schema/` directory.

**schema/tables.ts** — Move ALL 74 table definitions (lines 56-1305) plus the schema() export (lines 1307-1382). This is the largest single extraction (~1325 lines).

The file must:
- Import `{ schema, table, t }` from `'spacetimedb/server'`
- Contain all `const XxxTable = table(...)` definitions exactly as they are today
- Export the `spacetimedb` const from `schema(...)` at the bottom
- Export EVERY table const individually (e.g., `export const Player = table(...)`) so they can be imported by other files
- Keep table definitions in exact same order as current index.ts

**schema/scheduled_tables.ts** — This is a convenience re-export file (~20 lines) that groups scheduled table references for easy import by the seeding/ensure_content.ts file. Re-export the scheduled tables from tables.ts:
```typescript
export {
  DayNightTick,
  HealthRegenTick,
  HungerDecayTick,
  EffectTick,
  HotTick,
  CastTick,
  DisconnectLogoutTick,
  CharacterLogoutTick,
  ResourceGatherTick,
  ResourceRespawnTick,
  EnemyRespawnTick,
  PullTick,
  CombatLoopTick,
  CombatEnemyCast,
} from './tables';
```

CRITICAL: The `spacetimedb` export from schema/tables.ts is the schema registration object that reducers, views, and lifecycle hooks all depend on. It MUST be the single source of truth.
  </action>
  <verify>
Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` — should have no new errors related to table imports.
Confirm all 74 table names are exported from schema/tables.ts.
  </verify>
  <done>
All 74 table definitions and the schema() export live in schema/tables.ts. Scheduled tables re-exported from schema/scheduled_tables.ts. No table definitions remain in index.ts.
  </done>
</task>

<task type="auto">
  <name>Task 2: Extract helper functions into helpers/ domain files</name>
  <files>
    spacetimedb/src/helpers/events.ts
    spacetimedb/src/helpers/character.ts
    spacetimedb/src/helpers/combat.ts
    spacetimedb/src/helpers/items.ts
    spacetimedb/src/helpers/location.ts
    spacetimedb/src/helpers/economy.ts
  </files>
  <action>
Move ALL helper functions from index.ts (lines 1384-3670 and 6637-6676) into domain-specific files under `spacetimedb/src/helpers/`. The existing `helpers/group.ts` stays untouched.

**helpers/events.ts** (~200 lines) — Event logging and utility:
- `tableHasRows()` (line 1384)
- `EVENT_TRIM_MAX`, `EVENT_TRIM_AGE_MICROS`, `trimEventRows()` (lines 1389-1420)
- `requirePlayerUserId()` (line 1422)
- `requireCharacterOwnedBy()` (line 1428)
- `activeCombatIdForCharacter()` (line 1438)
- `appendWorldEvent()` (line 1446)
- `appendLocationEvent()` (line 1458)
- `appendPrivateEvent()` (line 1478)
- `appendSystemMessage()` (line 1498)
- `logPrivateAndGroup()` (line 1502)
- `appendPrivateAndGroupEvent()` (line 1516)
- `fail()` (line 1526)
- `appendNpcDialog()` (line 1530)
- `appendGroupEvent()` (line 1548)
- Import `SenderError` from `'spacetimedb/server'`
- Export all functions

**helpers/character.ts** (~100 lines) — Character validation and derived stats:
- `recomputeCharacterDerived()` (line 3098) — this is a large function
- `isClassAllowed()` (line 3551)
- `findCharacterByName()` (line 4845)
- `getGroupParticipants()` (line 1685)
- `isGroupLeaderOrSolo()` (line 1702)
- `partyMembersInLocation()` (line 1782)
- `friendUserIds()` (line 4837)
- Import needed data imports from `'../data/class_stats'` (computeBaseStats, BASE_HP, HP_STR_MULTIPLIER, BASE_MANA, manaStatForClass, baseArmorForClass, usesMana)
- Export all functions

**helpers/combat.ts** (~2000 lines) — THE largest helper file. Contains combat execution:
- `rollAttackOutcome()` (line 1736)
- `abilityDamageFromWeapon()` (line 1773)
- `addCharacterEffect()` (line 1796)
- `addEnemyEffect()` (line 1825)
- `applyHpBonus()` (line 1859)
- `getTopAggroId()` (line 1874)
- `sumCharacterEffect()` (line 1884)
- `sumEnemyEffect()` (line 1892)
- `executeAbility()` (line 1901) — massive function, ~1200 lines
- `applyEnemyAbilityDamage()` (line 3166)
- `executeEnemyAbility()` (line 3188)
- `executePetAbility()` (line 3371)
- `executeAbilityAction()` (line 3437)
- `awardCombatXp()` (line 3497)
- `applyDeathXpPenalty()` (line 3538)
- `scheduleCombatTick()` (line 4863)
- `abilityResourceCost()` (line 1670)
- `hasShieldEquipped()` (line 1674)
- `abilityCooldownMicros()` (line 1709)
- `abilityCastMicros()` (line 1717)
- `enemyAbilityCastMicros()` (line 1724)
- `enemyAbilityCooldownMicros()` (line 1730)
- `getEnemyRole()` (line 4579)
- `scaleByPercent()` (line 4584)
- `applyArmorMitigation()` (line 4594)
- `computeEnemyStats()` (line 4600)
- All combat-related constants: `COMBAT_LOOP_INTERVAL_MICROS`, `AUTO_ATTACK_INTERVAL`, `GROUP_SIZE_DANGER_BASE`, `GROUP_SIZE_BIAS_RANGE`, `GROUP_SIZE_BIAS_MAX`
- Import combat_scaling functions and constants from `'../data/combat_scaling'`
- Import ability data from `'../data/ability_catalog'`
- Import event helpers from `'./events'`
- Import character helpers from `'./character'` as needed
- Export all functions and constants

**helpers/items.ts** (~200 lines) — Inventory, equipment, and item helpers:
- `EQUIPMENT_SLOTS` constant (line 1568)
- `STARTER_ARMOR` constant (line 1583)
- `STARTER_WEAPONS` constant (line 1609)
- `getEquippedBonuses()` (line 1628)
- `getEquippedWeaponStats()` (line 1655)
- `findItemTemplateByName()` (line 3562)
- `getItemCount()` (line 3569)
- `addItemToInventory()` (line 3578)
- `getInventorySlotCount()` (line 3610)
- `hasInventorySpace()` (line 3615)
- `removeItemFromInventory()` (line 3627)
- `MAX_INVENTORY_SLOTS` constant (line 3608)
- `grantStarterItems()` (line 4547) — uses STARTER_ARMOR, STARTER_WEAPONS, findItemTemplateByName
- Export all functions and constants

**helpers/location.ts** (~250 lines) — Location, resource, and spawn helpers:
- `DAY_DURATION_MICROS`, `NIGHT_DURATION_MICROS`, `DEFAULT_LOCATION_SPAWNS`, `RESOURCE_NODES_PER_LOCATION`, `RESOURCE_GATHER_CAST_MICROS`, `RESOURCE_RESPAWN_MICROS` constants
- `getGatherableResourceTemplates()` (line 3648)
- `spawnResourceNode()` (line 4488)
- `ensureResourceNodesForLocation()` (line 4522)
- `respawnResourceNodesForLocation()` (line 4533)
- `computeLocationTargetLevel()` (line 4805)
- `getWorldState()` (line 4816)
- `isNightTime()` (line 4820)
- `connectLocations()` (line 4825)
- `areLocationsConnected()` (line 4830)
- `findEnemyTemplateByName()` (line 4856)
- `getEnemyRoleTemplates()` (line 4897)
- `pickRoleTemplate()` (line 4901)
- `seedSpawnMembers()` (line 4912)
- `refreshSpawnGroupCount()` (line 4932)
- `spawnEnemy()` (line 4944)
- `spawnEnemyWithTemplate()` (line 5056)
- `ensureAvailableSpawn()` (line 5125)
- `ensureSpawnsForLocation()` (line 5210)
- `respawnLocationSpawns()` (line 5271)
- Export all functions and constants

**helpers/economy.ts** (~50 lines) — Faction standing:
- `STANDING_PER_KILL`, `RIVAL_STANDING_PENALTY` constants (lines 6637-6638)
- `mutateStanding()` (line 6640)
- `grantFactionStandingForKill()` (line 6650)
- Import `logPrivateAndGroup` from `'./events'`
- Export all functions and constants

CRITICAL RULES for all helper files:
1. Functions use `ctx: any` pattern extensively — keep the `any` types, do NOT try to type them more precisely.
2. Functions reference `ctx.db.tableName` — this works because ctx carries the database context at runtime. They do NOT need table imports.
3. Some functions call other helpers — track cross-file dependencies and import accordingly.
4. The `SenderError` import from `'spacetimedb/server'` is needed in events.ts and character.ts.
5. Export every function and constant — index.ts will re-export them all.
  </action>
  <verify>
Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` — no new type errors.
Verify each helper file exports all its functions by checking export statements.
Cross-reference: every function name from the original index.ts (lines 1384-3670, 6637-6676) appears as an export in exactly one helpers/ file.
  </verify>
  <done>
All ~97 helper functions extracted from index.ts into 6 domain-specific files under helpers/. Each file imports its dependencies and exports all public functions. No helper function remains in index.ts.
  </done>
</task>

<task type="auto">
  <name>Task 3: Extract seeding functions and reduce index.ts to thin hub</name>
  <files>
    spacetimedb/src/seeding/ensure_items.ts
    spacetimedb/src/seeding/ensure_world.ts
    spacetimedb/src/seeding/ensure_enemies.ts
    spacetimedb/src/seeding/ensure_content.ts
    spacetimedb/src/index.ts
  </files>
  <action>
**Part A: Create seeding/ directory and extract seeding functions.**

**seeding/ensure_items.ts** (~700 lines) — Item, recipe, food, and resource template seeding:
- `ensureStarterItemTemplates()` (line 3718)
- `ensureResourceItemTemplates()` (line 3927)
- `ensureFoodItemTemplates()` (line 4056)
- `ensureRecipeTemplates()` (line 4126)
- `ensureAbilityTemplates()` (line 4346) — imports from `'../data/ability_catalog'` and `'../data/combat_scaling'`
- Import ABILITY_STAT_SCALING from `'../data/combat_scaling'`
- Import ABILITIES, ENEMY_ABILITIES from `'../data/ability_catalog'`
- Export all functions

**seeding/ensure_world.ts** (~500 lines) — World layout, NPC, and quest seeding:
- `ensureWorldLayout()` (line 5542) — large function, ~1000 lines of world definition
- `ensureNpcs()` (line 5347)
- `ensureQuestTemplates()` (line 5402)
- Import `connectLocations` from `'../helpers/location'`
- Export all functions

**seeding/ensure_enemies.ts** (~500 lines) — Enemy templates, roles, abilities, loot:
- `ensureEnemyTemplatesAndRoles()` (line 5752) — massive function, ~800 lines
- `ensureEnemyAbilities()` (line 5461)
- `ensureLocationEnemyTemplates()` (line 4872)
- `ensureLootTables()` (line 4620)
- `ensureVendorInventory()` (line 4709)
- Export all functions

**seeding/ensure_content.ts** (~100 lines) — Orchestration, scheduling, and sync:
- `syncAllContent()` (line 5252) — imports and calls all ensure* functions
- `ensureHealthRegenScheduled()` (line 5151)
- `ensureHungerDecayScheduled()` (line 5162)
- `ensureEffectTickScheduled()` (line 5171)
- `ensureHotTickScheduled()` (line 5180)
- `ensureCastTickScheduled()` (line 5189)
- `ensureDayNightTickScheduled()` (line 5198)
- `ensureLocationRuntimeBootstrap()` (line 5234)
- `HUNGER_DECAY_INTERVAL_MICROS` constant (line 5160)
- Import `ScheduleAt` from `'spacetimedb'`
- Import scheduled table types from `'../schema/scheduled_tables'` for `.rowType` references in `ScheduleAt.time()` insert calls
- Import `ensureRaces` from `'../data/races'`
- Import `ensureFactions` from `'../data/faction_data'`
- Import all ensure* functions from sibling seeding files
- Import `ensureSpawnsForLocation`, `ensureResourceNodesForLocation` from `'../helpers/location'`
- Export all functions and HUNGER_DECAY_INTERVAL_MICROS

**Part B: Rewrite index.ts as thin hub (~200 lines).**

The new index.ts must:

1. Re-export the spacetimedb schema object:
```typescript
export { spacetimedb } from './schema/tables';
```

2. Import spacetimedb for lifecycle hooks:
```typescript
import { spacetimedb } from './schema/tables';
```

3. Import ALL table consts from schema/tables.ts (needed for reducerDeps and registerViews)

4. Import ALL helper functions from helpers/* files (needed for reducerDeps)

5. Import seeding/scheduling functions from seeding/ensure_content.ts (needed for init/connect)

6. Import external deps: `{ t, SenderError }` from `'spacetimedb/server'`, `{ ScheduleAt, Timestamp }` from `'spacetimedb'`

7. Import reducers/views: `{ registerReducers }` from `'./reducers'`, `{ registerViews }` from `'./views'`, `{ startCombatForSpawn }` from `'./reducers/combat'`

8. Import group helpers: same as current line 4-9

9. Import data modules: same as current lines 12-54

10. Keep the `tick_day_night` reducer inline (lines 5294-5323) since it references spacetimedb.reducer directly — OR move it to a new file. For simplicity, keep it inline in index.ts since it's only ~30 lines and uses spacetimedb.reducer() which requires the schema object.

11. Keep `spacetimedb.init()`, `spacetimedb.clientConnected()`, `spacetimedb.clientDisconnected()` (lines 6584-6635) in index.ts — these are lifecycle hooks that must be in the entry point.

12. Keep the `reducerDeps` object construction and `registerReducers(reducerDeps)` call (lines 6678-6807) in index.ts — this is the wiring hub.

13. Keep the `registerViews({...})` call (lines 5325-5345) in index.ts.

The final index.ts structure should be approximately:
```
// Imports (~60 lines)
// Re-export spacetimedb schema
// tick_day_night reducer (~30 lines)
// registerViews call (~25 lines)
// spacetimedb.init, clientConnected, clientDisconnected (~55 lines)
// reducerDeps + registerReducers (~130 lines)
// Total: ~300 lines (acceptable for a thin hub)
```

CRITICAL: The `reducerDeps` object references BOTH table consts AND helper functions by name. Every single reference must resolve. Cross-check every key in reducerDeps against its import source.

CRITICAL: The `registerViews({...})` call passes table consts. Cross-check against ViewDeps type.

CRITICAL: Do NOT change any function signatures, return types, or behavior. This is purely moving code between files.
  </action>
  <verify>
1. Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` — zero errors.
2. Run `spacetime build --project-path spacetimedb` — successful build.
3. Count lines in index.ts: `wc -l spacetimedb/src/index.ts` — should be ~200-350 lines.
4. Verify no function is duplicated: grep for each function name across all files, should appear as export in exactly one file.
5. Run `spacetime publish uwr --project-path spacetimedb` — module publishes successfully (the ultimate verification).
  </verify>
  <done>
All seeding functions extracted into 4 files under seeding/. index.ts reduced to a thin hub of ~300 lines containing only imports, re-exports, lifecycle hooks, the tick_day_night reducer, and the reducerDeps wiring. Module builds and publishes successfully with zero functional changes.
  </done>
</task>

</tasks>

<verification>
1. `spacetime build --project-path spacetimedb` succeeds (compilation)
2. `spacetime publish uwr --project-path spacetimedb` succeeds (deployment)
3. `wc -l spacetimedb/src/index.ts` shows ~200-350 lines (down from 6825)
4. `wc -l spacetimedb/src/schema/*.ts spacetimedb/src/helpers/*.ts spacetimedb/src/seeding/*.ts` shows ~6500 lines distributed across new files
5. No grep hits for functions defined in multiple files (no duplication)
6. All existing reducer files (reducers/*.ts) compile without changes
7. All existing view files (views/*.ts) compile without changes
</verification>

<success_criteria>
- index.ts is under 350 lines (thin hub with lifecycle hooks and wiring)
- All 74 tables live in schema/tables.ts
- Helper functions organized by domain in 6+ files under helpers/
- Seeding functions organized in 4 files under seeding/
- Module builds and publishes with zero breaking changes
- No logic changes — pure file reorganization
</success_criteria>

<output>
After completion, create `.planning/quick/69-refactor-spacetimedb-src-index-ts-split-/69-SUMMARY.md`
</output>
