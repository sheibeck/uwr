---
phase: quick-399
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/intent.ts
  - spacetimedb/src/reducers/items.ts
  - spacetimedb/src/reducers/items.test.ts
  - src/composables/useHotbar.ts
autonomous: true
requirements: [HOTBAR-DELETE]
must_haves:
  truths:
    - "Player can type 'hotbar delete <name>' to remove a hotbar and all its slots"
    - "Cannot delete the last remaining hotbar"
    - "Deleting the active hotbar auto-switches to the next available hotbar"
    - "Help text includes the hotbar delete command"
  artifacts:
    - path: "spacetimedb/src/reducers/intent.ts"
      provides: "hotbar delete intent command"
      contains: "hotbar.*delete"
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "delete_hotbar reducer"
      contains: "delete_hotbar"
    - path: "spacetimedb/src/reducers/items.test.ts"
      provides: "delete_hotbar unit tests"
      contains: "delete_hotbar"
  key_links:
    - from: "spacetimedb/src/reducers/intent.ts"
      to: "ctx.db.hotbar"
      via: "hotbar delete command handler"
      pattern: "hotbar\\s+delete"
---

<objective>
Add a `hotbar delete <name>` command that removes a named hotbar and all its associated slots.

Purpose: Players can currently create hotbars but have no way to remove them. This completes the hotbar CRUD.
Output: Working delete command in intent system, delete_hotbar reducer, client composable wiring, unit tests.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/intent.ts (hotbar command section, lines ~1062-1260)
@spacetimedb/src/reducers/items.ts (create_hotbar and switch_hotbar reducers, lines ~632-670)
@spacetimedb/src/reducers/items.test.ts (hotbar test patterns)
@src/composables/useHotbar.ts (client composable)
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add delete_hotbar logic, reducer, intent command, and client wiring</name>
  <files>spacetimedb/src/reducers/items.test.ts, spacetimedb/src/reducers/intent.ts, spacetimedb/src/reducers/items.ts, src/composables/useHotbar.ts</files>
  <behavior>
    - Test: deleteHotbar removes the hotbar row and all its hotbar_slot rows
    - Test: deleteHotbar returns error when hotbar name not found
    - Test: deleteHotbar returns error when trying to delete the last remaining hotbar
    - Test: deleting the active hotbar sets another hotbar as active
    - Test: deleteHotbar is case-insensitive when matching name
    - Test: intent pattern `hotbar delete <name>` matches correctly and does not conflict with switch pattern
    - Test: switch pattern still does not match `hotbar delete X`
  </behavior>
  <action>
    1. **items.test.ts** — Add a `deleteHotbar` inline helper function that mirrors the logic to be added in items.ts:
       - Find hotbar by name (case-insensitive) among character's hotbars
       - If not found, return error string
       - If it's the last hotbar, return error string "Cannot delete your only hotbar"
       - Delete all hotbar_slot rows where hotbarId matches (use `by_hotbar.filter(hotbar.id)` then delete each)
       - Delete the hotbar row via `ctx.db.hotbar.id.delete(hotbar.id)`
       - If the deleted hotbar was active, set the first remaining hotbar as active
       - Return undefined on success
       Add test describe block `delete_hotbar logic` with the behavior tests above.
       Also add intent pattern test for `hotbar delete <name>` regex: `/^hotbar\s+delete\s+(.+)$/i`
       Update the switch pattern test to use the updated negative lookahead that includes `delete\s`.

    2. **intent.ts** — Add `hotbar delete <name>` command handler:
       - Insert AFTER the `hotbar add` block and BEFORE `hotbar clear`:
       ```
       const hotbarDeleteMatch = lower.match(/^hotbar\s+delete\s+(.+)$/i);
       if (hotbarDeleteMatch) { ... }
       ```
       - Extract name from raw input (preserve casing for display): `raw.substring('hotbar delete '.length).trim()`
       - Find all character hotbars, find target by case-insensitive name match
       - If not found: `fail(ctx, character, 'No hotbar named "X" found.')`
       - If only 1 hotbar: `fail(ctx, character, 'Cannot delete your only hotbar.')`
       - Delete all slots: `for (const s of [...ctx.db.hotbar_slot.by_hotbar.filter(target.id)]) { ctx.db.hotbar_slot.id.delete(s.id); }`
       - Delete the hotbar: `ctx.db.hotbar.id.delete(target.id)`
       - If target was active, set first remaining hotbar as active
       - Send success message with color formatting
       - Update the switch regex negative lookahead from `(?!add\s|set\b|swap\b|clear\b)` to `(?!add\s|set\b|swap\b|clear\b|delete\s)`
       - Add help text line: `'  {{color:#c9a227}}hotbar delete {name}{{/color}} — Delete a hotbar and all its slots.',` after the `hotbar add` help line
       - Add bad-args usage catch: `if (lower.match(/^hotbar\s+delete\b/i))` returning usage hint, placed near the other bad-args catches

    3. **items.ts** — Add `delete_hotbar` reducer after `switch_hotbar`:
       ```
       spacetimedb.reducer('delete_hotbar', { characterId: t.u64(), hotbarName: t.string() }, (ctx, args) => {
         const character = requireCharacterOwnedBy(ctx, args.characterId);
         const all = [...ctx.db.hotbar.by_character.filter(character.id)];
         const target = all.find((h: any) => h.name.toLowerCase() === args.hotbarName.toLowerCase());
         if (!target) return failItem(ctx, character, `No hotbar named "${args.hotbarName}" found.`);
         if (all.length <= 1) return failItem(ctx, character, 'Cannot delete your only hotbar.');
         // Delete all slots
         for (const s of [...ctx.db.hotbar_slot.by_hotbar.filter(target.id)]) {
           ctx.db.hotbar_slot.id.delete(s.id);
         }
         ctx.db.hotbar.id.delete(target.id);
         // If was active, activate another
         if (target.isActive) {
           const remaining = all.filter((h: any) => h.id !== target.id);
           if (remaining.length > 0) {
             ctx.db.hotbar.id.update({ ...remaining[0], isActive: true });
           }
         }
         appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
           `Hotbar "${target.name}" deleted.`);
       });
       ```

    4. **useHotbar.ts** — Add `deleteHotbar` function and expose it:
       - Add `const deleteHotbarReducer = useReducer(reducers.deleteHotbar);` (after switchHotbarReducer)
       - Add function:
       ```
       const deleteHotbar = (hotbarName: string) => {
         if (!connActive.value || !selectedCharacter.value) return;
         deleteHotbarReducer({ characterId: selectedCharacter.value.id, hotbarName });
       };
       ```
       - Add `deleteHotbar` to the return object
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vitest run spacetimedb/src/reducers/items.test.ts 2>&1 | tail -30</automated>
  </verify>
  <done>
    - `hotbar delete <name>` command works in intent system
    - delete_hotbar reducer exists in items.ts
    - Cannot delete last hotbar (error message)
    - Deleting active hotbar auto-switches to another
    - All hotbar_slot rows for deleted hotbar are removed
    - Help text updated
    - Switch regex excludes "delete"
    - All tests pass
    - Client composable exposes deleteHotbar function
  </done>
</task>

</tasks>

<verification>
- `npx vitest run spacetimedb/src/reducers/items.test.ts` — all hotbar tests pass including new delete tests
- `npx tsc --noEmit -p spacetimedb/tsconfig.json` — server compiles
- Grep for `hotbar delete` in intent.ts confirms command handler exists
- Grep for `delete_hotbar` in items.ts confirms reducer exists
- Grep for `deleteHotbar` in useHotbar.ts confirms client wiring
</verification>

<success_criteria>
- Player can type `hotbar delete <name>` to remove a hotbar and its slots
- Cannot delete the last remaining hotbar
- Deleting the active hotbar switches to the next available one
- Help text shows the delete command
- All existing and new tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/399-add-a-hotbar-delete-command/399-SUMMARY.md`
</output>
