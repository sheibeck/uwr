---
phase: quick-85
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/index.ts
autonomous: true
must_haves:
  truths:
    - "Module compiles without 'name is used for multiple types' errors"
    - "All table definitions exist in exactly one place (schema/tables.ts)"
    - "index.ts imports tables from schema/tables.ts instead of redefining them"
  artifacts:
    - path: "spacetimedb/src/index.ts"
      provides: "Module entrypoint without duplicate table definitions"
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "Single source of truth for all table definitions and schema export"
  key_links:
    - from: "spacetimedb/src/index.ts"
      to: "spacetimedb/src/schema/tables.ts"
      via: "import { spacetimedb, Player, ... } from './schema/tables'"
      pattern: "from ['\"]\\./schema/tables['\"]"
---

<objective>
Fix duplicate table definition errors that prevent the SpacetimeDB module from compiling.

Purpose: After quick-83 eliminated duplicate seeding code, the module now fails to compile because `index.ts` still defines all ~70 tables locally AND `schema/tables.ts` also defines all the same tables. Both files call `table()` with the same `name:` string values and both call `schema()`, causing SpacetimeDB to see each table name registered to multiple types.

Output: A compiling module with table definitions living exclusively in `schema/tables.ts`.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/index.ts
@spacetimedb/src/schema/tables.ts
@spacetimedb/src/schema/scheduled_tables.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove duplicate table definitions from index.ts and import from schema/tables.ts</name>
  <files>spacetimedb/src/index.ts</files>
  <action>
The root cause: `spacetimedb/src/schema/tables.ts` defines ALL tables and exports `spacetimedb` (the schema), while `spacetimedb/src/index.ts` ALSO defines ALL the same tables locally (lines ~199-1519) and calls `schema()` again. Both use identical `name:` strings (e.g. `name: 'player'`, `name: 'combat_loop_tick'`, etc.), causing SpacetimeDB to see each name registered twice.

Fix by rewriting `index.ts` to:

1. REMOVE the `import { schema, table, t, SenderError } from 'spacetimedb/server'` line (schema and table are no longer needed here; keep SenderError if used, but it is not used in index.ts directly -- check before removing). Actually `t` and `SenderError` ARE still used in `reducerDeps` and in the `tick_day_night` reducer definition. Keep `{ t, SenderError }` from `'spacetimedb/server'` but remove `schema` and `table`.

2. REMOVE ALL local `const XxxTable = table(...)` definitions (lines ~199-1444). That is every `const` that calls `table(...)`.

3. REMOVE the local `export const spacetimedb = schema(...)` call (lines ~1446-1520).

4. ADD an import at the top that brings in `spacetimedb` AND every table constant that is referenced later in the file from `'./schema/tables'`. The tables referenced in index.ts are:
   - Used in `registerViews` call: Player, FriendRequest, Friend, GroupInvite, EventGroup, GroupMember, CharacterEffect, CombatResult, CombatLoot, EventLocation, EventPrivate, NpcDialog, QuestInstance, Faction, FactionStanding, UiPanelLayout
   - Used in `reducerDeps` object: Character, GroupMember, GroupInvite, CombatParticipant, CombatLoopTick, PullState, PullTick, HealthRegenTick, EffectTick, HotTick, CastTick, DayNightTick, DisconnectLogoutTick, CharacterLogoutTick, ResourceGatherTick, ResourceRespawnTick, EnemyRespawnTick, TradeSession, TradeItem, EnemyAbility, CombatEnemyCooldown, CombatEnemyCast, CombatPendingAdd, AggroEntry, Faction, FactionStanding, UiPanelLayout
   - Used in `tick_day_night` reducer: DayNightTick (for `.rowType`)
   - Used in `clientConnected`/`clientDisconnected`: none directly (uses ctx.db)

   Deduplicated full list to import:
   ```
   import {
     spacetimedb,
     Player, Character,
     FriendRequest, Friend,
     GroupMember, GroupInvite, EventGroup,
     CharacterEffect, CombatResult, CombatLoot,
     EventLocation, EventPrivate, NpcDialog, QuestInstance,
     Faction, FactionStanding, UiPanelLayout,
     CombatParticipant, CombatLoopTick,
     PullState, PullTick,
     HealthRegenTick, EffectTick, HotTick, CastTick,
     DayNightTick, DisconnectLogoutTick, CharacterLogoutTick,
     ResourceGatherTick, ResourceRespawnTick, EnemyRespawnTick,
     TradeSession, TradeItem,
     EnemyAbility, CombatEnemyCooldown, CombatEnemyCast,
     CombatPendingAdd, AggroEntry,
   } from './schema/tables';
   ```

5. REMOVE the `export` keyword from `spacetimedb` since it is now imported (it was `export const spacetimedb = schema(...)` before). Instead just re-export it:
   ```
   export { spacetimedb } from './schema/tables';
   ```
   Or if no other file imports spacetimedb from index.ts (confirmed: nothing does), just use the import without re-export.

6. Keep ALL other code in index.ts intact: the helper imports, the `tick_day_night` reducer, `registerViews`, `spacetimedb.init`, `clientConnected`, `clientDisconnected`, `reducerDeps`, `registerReducers`, etc.

7. The `spacetimedb.reducer('tick_day_night', ...)` call references `DayNightTick.rowType` -- this will now come from the import. The `spacetimedb` object used for `.reducer()`, `.init()`, `.clientConnected()`, `.clientDisconnected()` will come from the import.

IMPORTANT: Do NOT touch `schema/tables.ts` -- it is already correct and is the single source of truth.
  </action>
  <verify>
Run `cd C:/projects/uwr && npx spacetime build spacetimedb` (or the project's build command) and confirm no "name is used for multiple types" errors. If the build command is different, try `spacetime publish --dry-run` or just check that TypeScript compilation succeeds with `npx tsc --noEmit -p spacetimedb/tsconfig.json`.
  </verify>
  <done>Module compiles without duplicate table name errors. All table definitions exist only in schema/tables.ts. index.ts imports from schema/tables.ts.</done>
</task>

</tasks>

<verification>
- `spacetime publish` or module build completes without "name is used for multiple types" errors
- `grep -c "= table(" spacetimedb/src/index.ts` returns 0 (no local table definitions)
- `grep -c "= table(" spacetimedb/src/schema/tables.ts` returns the full count (~70 tables)
- All existing functionality preserved (reducers, views, init, lifecycle hooks)
</verification>

<success_criteria>
- Module compiles cleanly
- Zero duplicate table definitions
- All tables defined exclusively in schema/tables.ts
- index.ts imports tables instead of redefining them
</success_criteria>

<output>
After completion, create `.planning/quick/85-fix-duplicate-table-definition-errors-ta/85-SUMMARY.md`
</output>
