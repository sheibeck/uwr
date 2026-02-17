---
phase: 128-loot-window-shows-only-most-recent-comba
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
autonomous: true
must_haves:
  truths:
    - "When new combat ends with loot, only items from that combat appear in loot window"
    - "Previously unlooted CombatLoot rows from older combats are deleted before new loot is inserted"
    - "CombatResult rows for orphaned old combats are also cleaned up"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Stale loot cleanup before new loot insertion"
      contains: "combatLoot.by_character.filter"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "ctx.db.combatLoot"
      via: "delete stale rows before insert"
      pattern: "combatLoot\\.by_character\\.filter.*delete"
---

<objective>
Clear stale CombatLoot rows when new combat ends with loot, so the loot window only shows items from the most recent combat.

Purpose: Currently, if a player finishes combat and does not loot all items, then finishes another combat, the loot window accumulates items from multiple combats. The loot window should only show items from the most recent combat.

Output: Modified combat victory handler that deletes old CombatLoot rows per-character before inserting new ones.
</objective>

<execution_context>
@.planning/quick/128-loot-window-shows-only-most-recent-comba/128-PLAN.md
</execution_context>

<context>
@spacetimedb/src/reducers/combat.ts (lines 2179-2300 — victory loot distribution loop)
@spacetimedb/src/schema/tables.ts (lines 518-539 — CombatLoot table definition with by_character index)
@spacetimedb/src/reducers/items.ts (lines 223-298 — take_loot reducer for reference)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete stale CombatLoot and orphaned CombatResult rows before inserting new loot</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In the victory loot distribution section (around line 2179), inside the `for (const p of participants)` loop, BEFORE the inner `for (const template of enemyTemplates)` loop that inserts new CombatLoot rows:

1. Query all existing CombatLoot rows for this character using the `by_character` index:
   `const staleLoot = [...ctx.db.combatLoot.by_character.filter(character.id)];`

2. Collect the unique combatIds from stale loot (these are old combats whose loot was never taken):
   `const staleCombatIds = new Set(staleLoot.map(row => row.combatId));`

3. Delete all stale CombatLoot rows:
   `for (const row of staleLoot) { ctx.db.combatLoot.id.delete(row.id); }`

4. Clean up orphaned CombatResult rows for those old combats (this character only). For each staleCombatId, find CombatResult rows belonging to this character's ownerUserId with that combatId and delete them:
   ```
   for (const oldCombatId of staleCombatIds) {
     for (const result of ctx.db.combatResult.by_owner_user.filter(character.ownerUserId)) {
       if (result.combatId === oldCombatId && result.characterId === character.id) {
         ctx.db.combatResult.id.delete(result.id);
       }
     }
   }
   ```

This block should go AFTER the `const character = ctx.db.character.id.find(p.characterId);` null check (line ~2180-2181) and BEFORE the `for (const template of enemyTemplates)` loop (line ~2182).

Important: Do NOT modify any other logic in this function. The existing auto-clean at lines 2247-2252 (which deletes CombatResult when no loot was generated) remains unchanged — it handles the case where the CURRENT combat produces no loot for a character.
  </action>
  <verify>
1. `cd C:/projects/uwr && spacetime publish uwr --clear-database -y --project-path spacetimedb` succeeds without errors
2. Read the modified section to confirm stale loot deletion occurs before new loot insertion
3. Verify the by_character index is used (not iter()) for the stale loot query
  </verify>
  <done>
When combat ends with a victory that produces loot, any existing CombatLoot rows for each participating character are deleted before new loot rows are inserted. Orphaned CombatResult rows from those old combats are also cleaned up. The loot window will only ever show items from the most recent combat.
  </done>
</task>

</tasks>

<verification>
- Module publishes successfully
- The stale loot cleanup uses the `by_character` index (not `.iter()`)
- The cleanup is scoped per-character (each participant only has their own old loot deleted)
- The cleanup happens before new loot insertion (not after)
- Existing logic for auto-cleaning no-loot results (lines 2247-2252) is untouched
</verification>

<success_criteria>
- CombatLoot rows from previous combats are deleted when a new combat ends for a character
- Only the most recent combat's loot appears in the loot window
- Module compiles and publishes without errors
</success_criteria>

<output>
After completion, create `.planning/quick/128-loot-window-shows-only-most-recent-comba/128-SUMMARY.md`
</output>
