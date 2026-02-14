---
phase: quick-76
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/schema/scheduled_tables.ts
  - spacetimedb/src/reducers/hunger.ts
  - spacetimedb/src/reducers/index.ts
  - spacetimedb/src/reducers/characters.ts
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/views/hunger.ts
  - spacetimedb/src/views/index.ts
  - spacetimedb/src/views/types.ts
  - spacetimedb/src/seeding/ensure_content.ts
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/helpers/location.ts
  - spacetimedb/src/index.ts
  - src/App.vue
  - src/composables/useGameData.ts
  - src/components/HungerBar.vue
  - src/ui/styles.ts
autonomous: true
must_haves:
  truths:
    - "No hunger bar or hunger UI visible in the Stats panel"
    - "No hunger decay scheduled reducer running on server"
    - "Food items still exist in inventory and can be eaten via context menu"
    - "Eating food applies a CharacterEffect buff (str_bonus, dex_bonus) with high roundsRemaining"
    - "Combat damage still benefits from food buffs via existing sumCharacterEffect path"
    - "Food recipes still craftable"
    - "Module publishes and generates bindings without errors"
  artifacts:
    - path: "spacetimedb/src/reducers/hunger.ts"
      provides: "eat_food reducer only (decay_hunger removed)"
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "No Hunger table, no HungerDecayTick table"
  key_links:
    - from: "eat_food reducer"
      to: "CharacterEffect table"
      via: "ctx.db.characterEffect.insert with effectType str_bonus/dex_bonus"
      pattern: "characterEffect\\.insert"
    - from: "combat damage calculation"
      to: "CharacterEffect"
      via: "sumCharacterEffect already reads str_bonus/dex_bonus"
      pattern: "sumCharacterEffect"
---

<objective>
Remove the Hunger system (hunger value, decay tick, hunger bar UI) while preserving the food system. Food items become pure buff consumables -- eating food inserts a CharacterEffect row (str_bonus, dex_bonus, etc.) instead of updating a Hunger row's wellFed fields. Combat already reads these effect types via sumCharacterEffect, so food buffs continue to work without the wellFed-specific lookup code.

Purpose: Simplify game mechanics by removing unused hunger decay while keeping food as a meaningful buff consumable system.
Output: Clean codebase with no hunger references, food eating applies buffs through the existing CharacterEffect system.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/schema/tables.ts
@spacetimedb/src/reducers/hunger.ts
@spacetimedb/src/reducers/characters.ts
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/helpers/combat.ts
@spacetimedb/src/seeding/ensure_content.ts
@spacetimedb/src/index.ts
@src/App.vue
@src/composables/useGameData.ts
@src/components/HungerBar.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove Hunger system from server and convert eat_food to use CharacterEffect</name>
  <files>
    spacetimedb/src/schema/tables.ts
    spacetimedb/src/schema/scheduled_tables.ts
    spacetimedb/src/reducers/hunger.ts
    spacetimedb/src/reducers/index.ts
    spacetimedb/src/reducers/characters.ts
    spacetimedb/src/reducers/combat.ts
    spacetimedb/src/views/hunger.ts
    spacetimedb/src/views/index.ts
    spacetimedb/src/views/types.ts
    spacetimedb/src/seeding/ensure_content.ts
    spacetimedb/src/helpers/combat.ts
    spacetimedb/src/helpers/location.ts
    spacetimedb/src/index.ts
  </files>
  <action>
    **A. Remove Hunger and HungerDecayTick tables from schema (spacetimedb/src/schema/tables.ts):**
    - Delete the `Hunger` table definition (lines ~1198-1212)
    - Delete the `HungerDecayTick` table definition (lines ~1019-1022)
    - Remove `Hunger` and `HungerDecayTick` from the `schema()` call at the bottom (lines ~1324-1325)
    - Keep ItemTemplate's `wellFedDurationMicros`, `wellFedBuffType`, `wellFedBuffMagnitude` fields -- these are still used by food items

    **B. Remove HungerDecayTick from scheduled_tables.ts (spacetimedb/src/schema/scheduled_tables.ts):**
    - Remove the `HungerDecayTick` export from this file

    **C. Convert hunger.ts to food-only reducer (spacetimedb/src/reducers/hunger.ts):**
    - Remove the entire `decay_hunger` reducer
    - Remove deps for: `Hunger`, `HungerDecayTick`, `HUNGER_DECAY_INTERVAL_MICROS`, `ScheduleAt`, `Timestamp`
    - Keep the `eat_food` reducer but modify it:
      - Remove the hunger row lookup (`ctx.db.hunger.characterId.filter`)
      - Remove the `if (!hungerRow) throw` check
      - Remove the hunger row update (`ctx.db.hunger.id.update`)
      - Keep the item consumption logic (decrement quantity or delete)
      - After consuming the item, if `template.wellFedDurationMicros > 0n`, insert a `CharacterEffect` instead:
        - Map wellFedBuffType to effectType: 'str' -> 'str_bonus', 'dex' -> 'dex_bonus', 'mana_regen' -> 'mana_regen', 'stamina_regen' -> 'stamina_regen'
        - Use `roundsRemaining: 99n` (a high value so the buff persists for many combat rounds -- food buffs are long-duration)
        - First, remove any existing food buff of the same effectType for this character to prevent stacking: iterate `ctx.db.characterEffect.by_character.filter(characterId)` and delete any row where `sourceAbility === 'food_buff'`
        - Then insert: `ctx.db.characterEffect.insert({ id: 0n, characterId, effectType: mappedType, magnitude: template.wellFedBuffMagnitude as i64 (cast to signed), roundsRemaining: 99n, sourceAbility: 'food_buff' })`
      - Keep the appendPrivateEvent call for user feedback
    - Rename export to `registerFoodReducers` (optional but cleaner)

    **D. Update reducer index (spacetimedb/src/reducers/index.ts):**
    - Keep the import from './hunger' (it still has eat_food)
    - If renamed: update import name accordingly

    **E. Remove hunger from character creation/deletion (spacetimedb/src/reducers/characters.ts):**
    - In create_character reducer (~line 182): remove the `ctx.db.hunger.insert(...)` block (6 lines)
    - In delete_character reducer (~line 304): remove the `for (const row of ctx.db.hunger.characterId.filter(characterId))` deletion loop (3 lines)

    **F. Remove wellFed lookup from auto-attack in combat.ts (spacetimedb/src/reducers/combat.ts):**
    - Around line 1803-1811: remove the hungerRow lookup, isWellFed check, wellFedDmgBonus calculation
    - The `baseDamage` variable already includes `sumEnemyEffect` for damage_taken. The food buff is now a CharacterEffect (str_bonus/dex_bonus), which will be picked up by the stat system. BUT the auto-attack code doesn't currently call sumCharacterEffect for str_bonus to modify raw damage. Instead, just remove the wellFedDmgBonus addition entirely. The food buff str_bonus/dex_bonus will naturally contribute via the character's effective stats in ability resolution.
    - Change: `const damage = baseDamage + wellFedDmgBonus;` -> `const damage = baseDamage;` (remove the + wellFedDmgBonus)
    - Remove the 5 lines computing hungerRow, isWellFed, wellFedDmgBonus

    **G. Remove wellFed lookup from ability execution in helpers/combat.ts (spacetimedb/src/helpers/combat.ts):**
    - Around line 348-355: remove the abilityHungerRow lookup, abilityIsWellFed check, wellFedAbilityBonus calculation
    - Change: `const totalDamageUp = damageUp + wellFedAbilityBonus;` -> `const totalDamageUp = damageUp;`
    - Remove the 5 lines computing abilityHungerRow, abilityIsWellFed, wellFedAbilityBonus

    **H. Remove hunger view (spacetimedb/src/views/hunger.ts):**
    - Delete the entire file contents or replace with an empty export. Since the file is imported by views/index.ts, either delete the file and remove the import, or empty it. Simplest: empty the file and remove from views/index.ts.

    **I. Update views index (spacetimedb/src/views/index.ts):**
    - Remove the import of `registerHungerViews`
    - Remove the `registerHungerViews(deps)` call

    **J. Update views types (spacetimedb/src/views/types.ts):**
    - Remove `Hunger: any;` from the ViewDeps type

    **K. Remove hunger from ensure_content.ts (spacetimedb/src/seeding/ensure_content.ts):**
    - Remove the import of `HungerDecayTick` from scheduled_tables
    - Remove the `HUNGER_DECAY_INTERVAL_MICROS` constant
    - Remove the `ensureHungerDecayScheduled` function entirely
    - Keep everything else (ensureHealthRegenScheduled, ensureFoodItemTemplates, etc.)

    **L. Remove hunger from helpers/location.ts (spacetimedb/src/helpers/location.ts):**
    - Remove the `HUNGER_DECAY_INTERVAL_MICROS` constant (~line 261)
    - Remove the `ensureHungerDecayScheduled` function (~lines 263-270)

    **M. Remove hunger from monolith index.ts (spacetimedb/src/index.ts):**
    - This is the legacy monolith that has duplicated code. Remove ALL hunger references:
    - Remove the `Hunger` table definition (~line 1251)
    - Remove the `HungerDecayTick` table definition (~line 1072)
    - Remove `Hunger` and `HungerDecayTick` from schema() call (~lines 1377-1378)
    - Remove `ensureHungerDecayScheduled` function (~line 5191)
    - Remove `ensureHungerDecayScheduled(ctx)` calls from init (~line 6638) and clientConnected (~line 6660)
    - Remove `ensureHungerDecayScheduled` from the exports/deps object (~line 6807)
    - Remove `Hunger`, `HungerDecayTick`, `HUNGER_DECAY_INTERVAL_MICROS` from reducerDeps (~lines 6731-6733)
    - Remove the wellFed lookup code in ability execution (~lines 1977-1984): abilityHungerRow, abilityIsWellFed, wellFedAbilityBonus
    - Adjust `totalDamageUp = damageUp + wellFedAbilityBonus` -> `totalDamageUp = damageUp`
    - Note: the wellFedDurationMicros/wellFedBuffType/wellFedBuffMagnitude fields on ItemTemplate should remain (food items use them)
  </action>
  <verify>
    Run `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit` to verify no TypeScript errors in the server module. Grep for "hunger" (case-insensitive) in spacetimedb/src/ to verify only ItemTemplate wellFed fields remain (no Hunger table, no decay, no hunger views).
  </verify>
  <done>
    Server module has no Hunger table, no HungerDecayTick, no decay_hunger reducer, no my_hunger view. eat_food reducer consumes food items and inserts CharacterEffect rows. Combat code no longer reads Hunger row for wellFed bonus. All food item templates and recipes remain intact.
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove Hunger UI from client and regenerate bindings</name>
  <files>
    src/App.vue
    src/composables/useGameData.ts
    src/components/HungerBar.vue
    src/ui/styles.ts
  </files>
  <action>
    **A. Remove HungerBar from App.vue (src/App.vue):**
    - Remove the `import HungerBar from './components/HungerBar.vue'` (~line 479)
    - Remove the `<HungerBar v-if="selectedCharacter" :hunger="activeHunger" :styles="styles" :style="{ marginTop: '1rem' }" />` from the Stats panel template (~line 202)
    - Remove the `activeHunger` computed property (~lines 1424-1429)
    - Remove the `myHunger` destructuring from the useGameData call if present (check the destructuring at the top of script)
    - Keep the `eatFoodReducer` and `eatFood` function (~lines 1431-1435) -- food eating still works
    - Keep the `@eat-food="eatFood"` event binding on InventoryPanel (~line 180) -- food context menu still works

    **B. Remove myHunger from useGameData (src/composables/useGameData.ts):**
    - Remove `const [myHunger] = useTable(tables.hunger);` (~line 58)
    - Remove `myHunger` from the return object (~line 117)
    - Note: tables.hunger will no longer exist after binding regeneration, so this line MUST be removed

    **C. Delete HungerBar component (src/components/HungerBar.vue):**
    - Delete the entire file (or empty it). Since it is no longer imported anywhere, deleting is cleanest.

    **D. Remove hunger styles from styles.ts (src/ui/styles.ts):**
    - Remove the `hungerBar` style object (~lines 1310-1317)
    - Remove the `hungerFill` style object (~lines 1318-1322)
    - Remove the `wellFedBadge` style object (~lines 1323-1329)

    **E. Publish module and regenerate bindings:**
    - Run: `spacetime publish uwr --clear-database -y --project-path C:/projects/uwr/spacetimedb`
    - Run: `spacetime generate --lang typescript --out-dir C:/projects/uwr/src/module_bindings --project-path C:/projects/uwr/spacetimedb`
    - This will remove the hunger-related generated binding files (hunger_type.ts, hunger_table.ts, my_hunger_type.ts, my_hunger_table.ts, hunger_decay_tick_type.ts, decay_hunger_reducer.ts, decay_hunger_type.ts)
    - The eat_food_type.ts and eat_food_reducer.ts bindings will be regenerated (eat_food reducer still exists)

    **F. Verify client builds:**
    - Run: `cd C:/projects/uwr && npm run build` (or the appropriate build command)
    - Verify no TypeScript errors and no references to deleted hunger types
  </action>
  <verify>
    Run `npm run build` from project root. Verify no errors. Grep for "HungerBar" and "activeHunger" and "myHunger" in src/ to confirm all references removed. Verify src/module_bindings/ no longer contains hunger_table.ts, hunger_type.ts, my_hunger_table.ts, my_hunger_type.ts, hunger_decay_tick_type.ts, decay_hunger_reducer.ts, decay_hunger_type.ts.
  </verify>
  <done>
    Client has no HungerBar component, no hunger styles, no hunger data subscriptions. Module bindings regenerated without hunger tables/views. Food eating still works via eat_food reducer and "Eat" context menu in inventory. Build passes cleanly.
  </done>
</task>

</tasks>

<verification>
1. Server: `npx tsc --noEmit` passes in spacetimedb/
2. Client: `npm run build` passes
3. No "Hunger" table or "hunger_decay" references in active server code (wellFed fields on ItemTemplate are acceptable)
4. eat_food reducer still exists and now creates CharacterEffect rows
5. InventoryPanel still shows "Eat" option for food items
6. Food item templates and recipes unchanged in seeding
</verification>

<success_criteria>
- Hunger table, HungerDecayTick table, and my_hunger view fully removed from schema
- decay_hunger scheduled reducer removed
- HungerBar.vue component deleted
- eat_food reducer preserved and converted to use CharacterEffect
- Combat wellFed special-case code removed (handled by CharacterEffect system)
- All food item templates and recipes preserved
- Module publishes, bindings regenerate, client builds successfully
</success_criteria>

<output>
After completion, create `.planning/quick/76-we-added-a-hunger-system-that-i-want-to-/76-SUMMARY.md`
</output>
