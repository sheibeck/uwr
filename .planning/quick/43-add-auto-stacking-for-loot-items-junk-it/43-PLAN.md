---
phase: quick-43
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/index.ts
autonomous: true
must_haves:
  truths:
    - "Junk loot items (Rat Tail, Torn Pelt, Cracked Fang, Ashen Bone) auto-stack when looted"
    - "Gear drops (weapons, armor) do NOT stack"
    - "Resource items from loot tables continue to stack as before"
  artifacts:
    - path: "spacetimedb/src/index.ts"
      provides: "Junk templates seeded with stackable: true"
      contains: "stackable: true"
  key_links:
    - from: "ensureStarterItemTemplates junk seeding"
      to: "addItemToInventory stacking logic"
      via: "template.stackable check"
      pattern: "stackable.*true"
---

<objective>
Make junk loot items (Rat Tail, Torn Pelt, Cracked Fang, Ashen Bone) auto-stack when looted from combat, matching the existing stacking behavior of gatherable resources.

Purpose: Players currently get separate inventory slots for each junk item looted, filling bags quickly. Junk should stack like resources do since they're fungible vendor-trash items.

Output: Updated junk item template seed data with `stackable: true`. Existing `addItemToInventory` and `take_loot` already handle stacking correctly -- only the seed data needs to change.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/index.ts (lines 3456-3486: junk template seeding, lines 3140-3168: addItemToInventory)
@spacetimedb/src/reducers/items.ts (lines 217-254: take_loot reducer)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Set junk item templates to stackable</name>
  <files>spacetimedb/src/index.ts</files>
  <action>
In the `ensureStarterItemTemplates` function, locate the junk template seeding loop (around line 3463-3486). Change `stackable: false` to `stackable: true` in the `upsertItemTemplateByName` call for junk items.

This is a ONE-LINE change: line 3484, change `stackable: false` to `stackable: true`.

The existing `upsertItemTemplateByName` helper already performs an update-if-exists, so this change will propagate to live databases on next `sync_equipment_tables` or `sync_all_content` call.

Do NOT change stackable for any gear items (weapons, armor, accessories) -- those must remain `stackable: false`.

Verification that existing code handles this correctly:
- `addItemToInventory` (line 3140) already checks `template.stackable` and merges into existing stacks
- `take_loot` reducer (items.ts line 233) already calls `addItemToInventory` which handles stacking
- `buy_item` reducer (items.ts line 152) already calls `addItemToInventory`
- Backpack-full checks in `take_loot` and `buy_item` already account for stackable items (hasStack logic)

No other files need changes -- the stacking infrastructure is already built for gatherables.
  </action>
  <verify>
1. Read the junk template seeding section and confirm `stackable: true`
2. Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` to verify no type errors
3. Grep for the junk seeding block to confirm only junk items changed, not gear items
  </verify>
  <done>
Junk item templates (Rat Tail, Torn Pelt, Cracked Fang, Ashen Bone) are seeded with `stackable: true`. Gear items remain `stackable: false`. TypeScript compiles without errors.
  </done>
</task>

</tasks>

<verification>
1. Junk templates have `stackable: true` in seed data
2. Gear/weapon/armor templates still have `stackable: false`
3. Resource templates still have `stackable: true` (unchanged)
4. TypeScript compiles cleanly
</verification>

<success_criteria>
- Junk items (slot='junk', isJunk=true) seeded with stackable: true
- All equipment items (weapons, armor, accessories) remain stackable: false
- No compilation errors introduced
- After publishing and syncing content, looted junk items will auto-stack via existing addItemToInventory logic
</success_criteria>

<output>
After completion, create `.planning/quick/43-add-auto-stacking-for-loot-items-junk-it/43-SUMMARY.md`
</output>
