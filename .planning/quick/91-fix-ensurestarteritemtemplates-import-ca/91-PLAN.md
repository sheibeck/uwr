---
phase: quick-91
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/characters.ts
autonomous: true
---

<objective>
Fix character creation crash caused by missing `ensureStarterItemTemplates` dependency in the `grantStarterItems` function call.

Purpose: Character creation is completely broken (PANIC: ensureStarterItemTemplates$1 is not a function)
Output: Characters can be created successfully
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
Error at spacetimedb/src/reducers/characters.ts:180
- `grantStarterItems(ctx, character)` called with 2 args
- Function signature in spacetimedb/src/helpers/items.ts:193 requires 3 args: `(ctx, character, ensureStarterItemTemplates)`
- `ensureStarterItemTemplates` is imported in spacetimedb/src/index.ts but not passed to reducer dependencies

Root cause: The `grantStarterItems` function expects `ensureStarterItemTemplates` as a callback parameter, but it's being called without it. The reducer dependencies include the function but don't pass it through.
</context>

<tasks>

<task type="auto">
  <name>Fix grantStarterItems call signature by adding ensureStarterItemTemplates to reducer dependencies</name>
  <files>spacetimedb/src/reducers/characters.ts</files>
  <action>
Update the dependency list in registerCharacterReducers to include `ensureStarterItemTemplates` and pass it as the third argument to `grantStarterItems`.

In spacetimedb/src/reducers/characters.ts:
1. Add `ensureStarterItemTemplates` to the destructured deps object at the top (around line 24)
2. Change line 180 from `grantStarterItems(ctx, character)` to `grantStarterItems(ctx, character, ensureStarterItemTemplates)`

The function signature in helpers/items.ts line 193 is:
```typescript
export function grantStarterItems(ctx: any, character: any, ensureStarterItemTemplates: (ctx: any) => void)
```

This requires the `ensureStarterItemTemplates` function to be passed as a callback so it can ensure the starter item templates exist in the database before granting them to the character.
  </action>
  <verify>
1. Search for "grantStarterItems" in spacetimedb/src/reducers/characters.ts - should show the call with 3 arguments
2. Verify ensureStarterItemTemplates is in the destructured deps list at line ~24
3. `spacetime publish <module-name> --clear-database -y --project-path spacetimedb` - should publish without errors
4. Character creation should succeed without PANIC error
  </verify>
  <done>
- ensureStarterItemTemplates is available in reducer dependencies
- grantStarterItems is called with all 3 required parameters: ctx, character, ensureStarterItemTemplates
- Character creation reducer executes without "is not a function" panic
- Starter items are granted when a new character is created
  </done>
</task>

</tasks>

<verification>
After completing the task, verify:
1. No more PANIC errors about ensureStarterItemTemplates in server logs
2. Character creation completes successfully (character record is created)
3. New characters receive starter armor and weapons (visible in inventory)
4. Multiple characters can be created without errors
</verification>

<success_criteria>
Character creation is fully functional:
- New characters can be created without crashing
- Starter items (armor and weapons) are automatically granted
- No runtime errors in spacetime logs
</success_criteria>

<output>
After completion, create `.planning/quick/91-fix-ensurestarteritemtemplates-import-ca/91-SUMMARY.md`
</output>
