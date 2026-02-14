---
phase: quick-83
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/index.ts
  - spacetimedb/src/seeding/ensure_content.ts
autonomous: true
must_haves:
  truths:
    - "index.ts contains no local function/constant definitions that duplicate modular files"
    - "index.ts imports all needed symbols from helpers/ and seeding/ modules"
    - "The reducerDeps object still passes all required symbols to registerReducers"
    - "spacetime publish compiles and publishes successfully"
  artifacts:
    - path: "spacetimedb/src/index.ts"
      provides: "Thin orchestrator importing from modular files"
    - path: "spacetimedb/src/seeding/ensure_content.ts"
      provides: "Content seeding orchestrator with correct imports"
  key_links:
    - from: "spacetimedb/src/index.ts"
      to: "spacetimedb/src/helpers/*.ts"
      via: "import statements"
      pattern: "import.*from.*helpers/"
    - from: "spacetimedb/src/index.ts"
      to: "spacetimedb/src/seeding/ensure_content.ts"
      via: "import statements"
      pattern: "import.*from.*seeding/"
---

<objective>
Eliminate all duplicate function and constant definitions from spacetimedb/src/index.ts by replacing them with imports from the modular files (helpers/, seeding/) that were created in quick-69 but never wired up. Fix broken imports in ensure_content.ts. This prevents the stale-copy sync issue that caused quick-82.

Purpose: Quick-69 created modular files but left the original 6000+ lines of local definitions in index.ts. Quick-81 updated ensure_world.ts (modular file) but index.ts still had the stale local copy, causing quick-82. Removing duplicates makes modular files the single source of truth.

Output: index.ts reduced from ~7100 lines to ~500 lines (tables, schema, init/connect/disconnect, reducerDeps wiring). ensure_content.ts has all missing imports fixed.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/index.ts
@spacetimedb/src/helpers/events.ts
@spacetimedb/src/helpers/items.ts
@spacetimedb/src/helpers/location.ts
@spacetimedb/src/helpers/combat.ts
@spacetimedb/src/helpers/character.ts
@spacetimedb/src/helpers/economy.ts
@spacetimedb/src/seeding/ensure_content.ts
@spacetimedb/src/seeding/ensure_items.ts
@spacetimedb/src/seeding/ensure_world.ts
@spacetimedb/src/seeding/ensure_enemies.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix ensure_content.ts broken imports and remove duplicate definitions</name>
  <files>spacetimedb/src/seeding/ensure_content.ts</files>
  <action>
  The ensure_content.ts file references several symbols without importing them. Fix by adding the missing imports:

  1. Add import for `getWorldState`, `DAY_DURATION_MICROS`, `DEFAULT_LOCATION_SPAWNS`, `spawnEnemy` from `../helpers/location`
  2. Add import for `effectiveGroupKey` from `../helpers/group`
  3. Add import for `ensureStarterItemTemplates` from `./ensure_items` -- BUT ensureStarterItemTemplates does NOT exist in ensure_items.ts yet. It only exists in index.ts. So this function must first be moved to ensure_items.ts (see below).

  For `ensureStarterItemTemplates`: This function is defined at line 3721 in index.ts and is NOT yet in any modular file. Extract it to `spacetimedb/src/seeding/ensure_items.ts`:
  - Copy the function from index.ts (lines 3721-3928) to ensure_items.ts
  - It depends on: `findItemTemplateByName` (from ../helpers/items), `STARTER_ARMOR` and `STARTER_WEAPONS` (from ../helpers/items)
  - Export it from ensure_items.ts
  - Then import it in ensure_content.ts

  Also remove the duplicate `ensureSpawnsForLocation` and `ensureResourceNodesForLocation` definitions from ensure_content.ts (lines 66-88 and the import from helpers/location on line 16) since those already exist in helpers/location.ts. The ensure_content.ts re-declares them locally which shadows the imports. Instead, import them from helpers/location (they are already exported from there).

  Wait -- actually re-check: ensure_content.ts line 16 imports `ensureSpawnsForLocation, ensureResourceNodesForLocation` from `../helpers/location` but then ALSO defines local `ensureSpawnsForLocation` (line 66) and `ensureLocationRuntimeBootstrap` (line 90) and `respawnLocationSpawns` (line 127). These local definitions reference `spawnEnemy` and `effectiveGroupKey` which aren't imported. Since helpers/location.ts already exports `ensureSpawnsForLocation`, `respawnLocationSpawns`, and the helpers could contain `ensureLocationRuntimeBootstrap` -- check if helpers/location.ts already has these. If so, remove the local copies from ensure_content.ts and import from helpers/location.ts instead.

  Based on investigation, helpers/location.ts exports: `ensureSpawnsForLocation`, `respawnLocationSpawns`, `ensureResourceNodesForLocation`, `spawnEnemy`, `getWorldState`, `DAY_DURATION_MICROS`, `DEFAULT_LOCATION_SPAWNS`.

  So the fix for ensure_content.ts is:
  - Remove local function definitions for: `ensureSpawnsForLocation` (line 66-88), `ensureLocationRuntimeBootstrap` (line 90-106), `respawnLocationSpawns` (line 127-148)
  - Keep the tick scheduler functions (ensureHealthRegenScheduled, ensureEffectTickScheduled, etc.) as they are unique to this file
  - Keep `syncAllContent` as it's the orchestrator
  - Update imports from `../helpers/location` to include everything needed: `DAY_DURATION_MICROS`, `DEFAULT_LOCATION_SPAWNS`, `getWorldState`, `ensureSpawnsForLocation`, `ensureResourceNodesForLocation`, `ensureLocationRuntimeBootstrap`, `respawnLocationSpawns`
  - Import `ensureStarterItemTemplates` from `./ensure_items` (after extracting it there)
  - Remove unused import of `SenderError`

  Note: `ensureLocationRuntimeBootstrap` needs to be checked if it exists in helpers/location.ts. If NOT, it should be added there since it uses `ensureResourceNodesForLocation` and `spawnEnemy` which are both in that file.
  </action>
  <verify>
  Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` from the spacetimedb directory to verify no TypeScript compilation errors in the seeding files. If tsconfig is not set up for this, at minimum verify that all imported symbols exist in their source files by grepping for `export function` or `export const` matching each import.
  </verify>
  <done>ensure_content.ts has zero undefined references; all functions it calls are properly imported; no duplicate function bodies that exist in helpers/location.ts; ensureStarterItemTemplates exists in ensure_items.ts</done>
</task>

<task type="auto">
  <name>Task 2: Replace all duplicate definitions in index.ts with imports from modular files</name>
  <files>spacetimedb/src/index.ts</files>
  <action>
  Remove ALL duplicate function definitions and constants from index.ts that already exist in modular helper/seeding files. Replace with imports. The goal is to reduce index.ts from ~7100 lines to ~500 lines.

  **Functions/constants to REMOVE from index.ts and IMPORT instead:**

  From `./helpers/events`:
  - `tableHasRows` (line 1365)
  - `requirePlayerUserId` (line 1403)
  - `requireCharacterOwnedBy` (line 1409)
  - `activeCombatIdForCharacter` (line 1419)
  - `appendWorldEvent` (line 1427)
  - `appendLocationEvent` (line 1439)
  - `appendPrivateEvent` (line 1459)
  - `appendSystemMessage` (line 1479)
  - `logPrivateAndGroup` (line 1483)
  - `appendPrivateAndGroupEvent` (line 1497)
  - `fail` (line 1507)
  - `appendNpcDialog` (line 1511)
  - `appendGroupEvent` (line 1529)

  From `./helpers/items`:
  - `EQUIPMENT_SLOTS` (line 1549)
  - `STARTER_ARMOR` (line 1564)
  - `STARTER_WEAPONS` (line 1590)
  - `getEquippedBonuses` (line 1609)
  - `getEquippedWeaponStats` (line 1636)
  - `findItemTemplateByName` (line 3565)
  - `getItemCount` (line 3572)
  - `addItemToInventory` (line 3581)
  - `getInventorySlotCount` (line 3613)
  - `hasInventorySpace` (line 3618)
  - `removeItemFromInventory` (line 3630)
  - `grantStarterItems` (line 4550) -- Note: helpers/items.ts version takes ensureStarterItemTemplates as parameter; the index.ts version calls the local ensureStarterItemTemplates. After refactor, grantStarterItems will need to be imported and called with the ensureStarterItemTemplates function. Check if the index.ts usage passes it through reducerDeps and adjust accordingly.

  From `./helpers/combat`:
  - `abilityResourceCost` (line 1651)
  - `hasShieldEquipped` (line 1655)
  - `abilityCooldownMicros` (line 1690)
  - `abilityCastMicros` (line 1698)
  - `enemyAbilityCastMicros` (line 1705)
  - `enemyAbilityCooldownMicros` (line 1711)
  - `rollAttackOutcome` (line 1717)
  - `abilityDamageFromWeapon` (line 1754)
  - `addCharacterEffect` (line 1777)
  - `addEnemyEffect` (line 1806)
  - `applyHpBonus` (line 1840)
  - `getTopAggroId` (line 1855)
  - `sumCharacterEffect` (line 1865)
  - `sumEnemyEffect` (line 1873)
  - `executeAbility` (line 1882)
  - `recomputeCharacterDerived` (line 3072) -- actually in helpers/character.ts
  - `applyEnemyAbilityDamage` (line 3140)
  - `executeEnemyAbility` (line 3162)
  - `executePetAbility` (line 3374)
  - `executeAbilityAction` (line 3440)
  - `COMBAT_LOOP_INTERVAL_MICROS` (line 3489)
  - `AUTO_ATTACK_INTERVAL` (line 3490)
  - `GROUP_SIZE_DANGER_BASE` (line 3497)
  - `GROUP_SIZE_BIAS_RANGE` (line 3498)
  - `GROUP_SIZE_BIAS_MAX` (line 3499)
  - `awardCombatXp` (line 3500)
  - `applyDeathXpPenalty` (line 3541)
  - `getEnemyRole` (line 4582)
  - `scaleByPercent` (line 4587)
  - `applyArmorMitigation` (line 4597)
  - `computeEnemyStats` (line 4603)
  - `scheduleCombatTick` (line 4866)

  From `./helpers/character`:
  - `getGroupParticipants` (line 1666)
  - `isGroupLeaderOrSolo` (line 1683)
  - `partyMembersInLocation` (line 1763)
  - `recomputeCharacterDerived` (line 3072)
  - `isClassAllowed` (line 3554)
  - `friendUserIds` (line 4840)
  - `findCharacterByName` (line 4848)

  From `./helpers/location`:
  - `DAY_DURATION_MICROS` (line 3491)
  - `NIGHT_DURATION_MICROS` (line 3492)
  - `DEFAULT_LOCATION_SPAWNS` (line 3493)
  - `RESOURCE_NODES_PER_LOCATION` (line 3494)
  - `RESOURCE_GATHER_CAST_MICROS` (line 3495)
  - `RESOURCE_RESPAWN_MICROS` (line 3496)
  - `getGatherableResourceTemplates` (line 3651)
  - `spawnResourceNode` (line 4491)
  - `ensureResourceNodesForLocation` (line 4525)
  - `respawnResourceNodesForLocation` (line 4536)
  - `computeLocationTargetLevel` (line 4808)
  - `getWorldState` (line 4819)
  - `isNightTime` (line 4823)
  - `connectLocations` (line 4828)
  - `areLocationsConnected` (line 4833)
  - `findEnemyTemplateByName` (line 4859)
  - `getEnemyRoleTemplates` (line 4900)
  - `pickRoleTemplate` (line 4904)
  - `seedSpawnMembers` (line 4915)
  - `refreshSpawnGroupCount` (line 4935)
  - `spawnEnemy` (line 4947)
  - `spawnEnemyWithTemplate` (line 5059)
  - `ensureAvailableSpawn` (line 5128)
  - `ensureSpawnsForLocation` (line 5202)
  - `ensureLocationRuntimeBootstrap` (line 5229)
  - `respawnLocationSpawns` (line 5278)

  From `./helpers/economy`:
  - `STANDING_PER_KILL` (line 6918)
  - `RIVAL_STANDING_PENALTY` (line 6919)
  - `mutateStanding` (line 6921)
  - `grantFactionStandingForKill` (line 6931)

  From `./seeding/ensure_content`:
  - `ensureHealthRegenScheduled` (line 5154)
  - `ensureEffectTickScheduled` (line 5163)
  - `ensureHotTickScheduled` (line 5172)
  - `ensureCastTickScheduled` (line 5181)
  - `ensureDayNightTickScheduled` (line 5190)
  - `syncAllContent` (line 5259)
  - (ensureSpawnsForLocation, ensureLocationRuntimeBootstrap, respawnLocationSpawns already covered by helpers/location)

  From `./seeding/ensure_items`:
  - `ensureStarterItemTemplates` (after Task 1 extracts it)
  - `ensureResourceItemTemplates` (line 3930)
  - `ensureFoodItemTemplates` (line 4059)
  - `ensureRecipeTemplates` (line 4129)
  - `ensureAbilityTemplates` (line 4349)

  From `./seeding/ensure_world`:
  - `ensureNpcs` (line 5355)
  - `ensureQuestTemplates` (line 5410)
  - `ensureEnemyAbilities` (line 5469)
  - `ensureWorldLayout` (line 5550)

  From `./seeding/ensure_enemies`:
  - `ensureLootTables` (line 4623)
  - `ensureVendorInventory` (line 4712)
  - `ensureLocationEnemyTemplates` (line 4875)
  - `ensureEnemyTemplatesAndRoles` (line 6035)

  **What to KEEP in index.ts:**
  - All table definitions (Player, User, FriendRequest, Friend, Character, etc.) -- lines 56-1360 approx
  - The `spacetimedb` schema export
  - The `spacetimedb.init()` block (call syncAllContent and ensureXxxScheduled -- now imported)
  - The `spacetimedb.clientConnected()` block
  - The `spacetimedb.clientDisconnected()` block
  - The `tick_day_night` reducer (lines 5301-5332) -- uses respawnLocationSpawns and respawnResourceNodesForLocation
  - The `registerViews` call (lines 5334+)
  - The `registerReducers` call via reducerDeps (lines 6959-7084)
  - The `reducerDeps` object itself -- update it to reference imported symbols instead of locally-defined ones

  **Critical: the `grantStarterItems` in index.ts (line 4550) calls local `ensureStarterItemTemplates` directly. The modular helpers/items.ts version takes it as a parameter. After importing, the reducerDeps must pass the imported `grantStarterItems` which takes `ensureStarterItemTemplates` as an arg. Check how reducers call `grantStarterItems` via deps and ensure the call sites pass the right args. If the signature mismatch is an issue, update helpers/items.ts `grantStarterItems` to not require the param (just import ensureStarterItemTemplates directly in items.ts) or keep the current helpers/items.ts signature and have index.ts wrap it: `grantStarterItems: (ctx, char) => grantStarterItemsHelper(ctx, char, ensureStarterItemTemplates)`.

  **Approach:** Rather than editing line-by-line (error-prone on a 7100-line file), the safest approach is:
  1. Read and understand the structure: tables (top), functions (middle), lifecycle+wiring (bottom)
  2. Add all new import statements at the top of the file
  3. Delete all function/constant blocks that now come from imports (lines ~1365-6957)
  4. Keep only: table definitions, schema export, lifecycle hooks, tick_day_night reducer, registerViews, reducerDeps
  5. Update reducerDeps to use imported names

  The `tick_day_night` reducer uses `respawnLocationSpawns`, `respawnResourceNodesForLocation`, `appendWorldEvent`, `getWorldState`, `DAY_DURATION_MICROS`, `NIGHT_DURATION_MICROS`, `ScheduleAt`, and `DEFAULT_LOCATION_SPAWNS` -- all of which will now be imported.
  </action>
  <verify>
  1. Run `spacetime publish uwr --project-path spacetimedb` to verify the module compiles and publishes. If the local server isn't running, at minimum verify with TypeScript compilation.
  2. Verify index.ts is under 600 lines: `wc -l spacetimedb/src/index.ts`
  3. Grep to confirm no local function definitions remain that should be imports: `grep -c "^function " spacetimedb/src/index.ts` should return 0 or very low (only if there are index.ts-unique functions).
  </verify>
  <done>index.ts contains only table definitions, schema export, imports, lifecycle hooks, the tick_day_night reducer, and reducerDeps wiring. All function/constant bodies are imported from modular files. File is under 600 lines. Module compiles successfully.</done>
</task>

<task type="auto">
  <name>Task 3: Clean up backup files and verify no stale copies</name>
  <files>spacetimedb/src/index.ts.backup, spacetimedb/src/index.ts.items_backup, spacetimedb/src/index.ts.broken</files>
  <action>
  Remove the stale backup files that were left behind during the quick-69 refactoring:
  - `spacetimedb/src/index.ts.backup`
  - `spacetimedb/src/index.ts.items_backup`
  - `spacetimedb/src/index.ts.broken`

  These files contain old copies of index.ts from before/during the refactoring and serve no purpose now that the modular files are the source of truth. They could confuse future searches (grep matches in them already showed up during investigation).

  After deletion, verify there are no other stale copies by searching for any `.backup` or `.broken` files in the spacetimedb directory.
  </action>
  <verify>
  `ls spacetimedb/src/index.ts.* 2>/dev/null` returns nothing. `find spacetimedb/src -name "*.backup" -o -name "*.broken" -o -name "*.bak"` returns nothing.
  </verify>
  <done>No stale backup files exist in spacetimedb/src/. Only the canonical source files remain.</done>
</task>

</tasks>

<verification>
1. `wc -l spacetimedb/src/index.ts` -- should be under 600 lines
2. Module compiles: `spacetime publish uwr --project-path spacetimedb` succeeds (or `npx tsc --noEmit` if server unavailable)
3. No duplicate function definitions: `grep -c "^function ensure" spacetimedb/src/index.ts` returns 0
4. Imports exist: `grep "from.*helpers/" spacetimedb/src/index.ts` shows imports from events, items, combat, character, location, economy
5. Imports exist: `grep "from.*seeding/" spacetimedb/src/index.ts` shows imports from ensure_content, ensure_items, ensure_world, ensure_enemies
6. No backup files: `ls spacetimedb/src/*.backup spacetimedb/src/*.broken 2>/dev/null` returns nothing
</verification>

<success_criteria>
- index.ts reduced from ~7100 lines to under 600 lines
- All duplicate functions replaced with imports from modular files
- ensure_content.ts has all imports fixed (no undefined references)
- ensureStarterItemTemplates extracted to ensure_items.ts
- Module compiles and publishes successfully
- No stale backup files remain
- reducerDeps still passes all required symbols to registerReducers
</success_criteria>

<output>
After completion, create `.planning/quick/83-eliminate-duplicate-seeding-code-in-inde/83-SUMMARY.md`
</output>
