---
phase: quick
plan: 41
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/views/effects.ts
autonomous: true

must_haves:
  truths:
    - "Enemy debuffs (DoTs, ac_bonus debuffs) applied to players appear in the group panel under the affected player's name"
    - "Player-applied buffs continue to appear in the group panel"
    - "Solo player effects display correctly in the group panel (no-group case)"
  artifacts:
    - path: "spacetimedb/src/views/effects.ts"
      provides: "Fixed my_character_effects view using index lookups instead of .iter()"
      contains: "by_character.filter"
  key_links:
    - from: "spacetimedb/src/views/effects.ts"
      to: "ctx.db.characterEffect.by_character"
      via: "index lookup per character ID"
      pattern: "by_character\\.filter"
---

<objective>
Fix the group panel not displaying enemy-applied debuffs and DoTs on player characters.

Purpose: Enemy abilities (e.g., DoTs, AC debuffs) call `addCharacterEffect()` and correctly insert rows into the `CharacterEffect` table, but the `my_character_effects` view that surfaces this data to the client uses `ctx.db.characterEffect.iter()` which is NOT supported in SpacetimeDB views. Views can ONLY access data via index lookups, not `.iter()`. This causes the view to return empty or incomplete results, so the group panel never receives the effect data.

Output: Fixed view that uses `by_character` index lookups to return all effects for the player's character and group members.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/views/effects.ts
@spacetimedb/src/index.ts (CharacterEffect table definition at ~line 926, has `by_character` btree index on `characterId`)
@spacetimedb/src/helpers/group.ts (effectiveGroupId helper)
@src/components/GroupPanel.vue (consumer - effectsFor filters by characterId)
@CLAUDE.md (SpacetimeDB rules: views can ONLY use index lookups, NOT .iter())
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix my_character_effects view to use index lookups instead of .iter()</name>
  <files>spacetimedb/src/views/effects.ts</files>
  <action>
    Replace the broken `.iter()` scan in the `my_character_effects` view with per-character index lookups using `by_character.filter()`.

    Current broken code (line 24):
    ```
    for (const effect of ctx.db.characterEffect.iter()) {
      if (ids.has(effect.characterId)) effects.push(effect);
    }
    ```

    Replace with index-based lookups:
    ```
    for (const characterId of ids) {
      for (const effect of ctx.db.characterEffect.by_character.filter(characterId)) {
        effects.push(effect);
      }
    }
    ```

    This is the ONLY change needed. The rest of the view logic (player lookup, group member collection) is correct and already uses proper index lookups.

    Why: SpacetimeDB views CANNOT use `.iter()` to scan tables. Per CLAUDE.md: "Views can ONLY access data via index lookups, NOT `.iter()`". The `CharacterEffect` table already has a `by_character` btree index on `characterId` (defined at index.ts ~line 929), so this is a direct swap.
  </action>
  <verify>
    1. Run `spacetime publish uwr --clear-database -y --project-path spacetimedb` to republish the module
    2. Run `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb` to regenerate bindings
    3. Verify `spacetime logs uwr` shows no errors related to the view
    4. Manual test: Start combat with enemies that use abilities (DoTs/debuffs) and verify effects appear under player name in the group panel
  </verify>
  <done>
    The my_character_effects view uses `by_character.filter(characterId)` index lookups instead of `.iter()`. Enemy-applied debuffs and DoTs on player characters are visible in the group panel. Player-applied buffs continue to display correctly.
  </done>
</task>

</tasks>

<verification>
- The view no longer uses `.iter()` anywhere
- The view uses `ctx.db.characterEffect.by_character.filter()` for each character ID
- Module publishes without errors
- Client receives character effects through the view subscription
</verification>

<success_criteria>
Enemy debuffs (DoTs, AC penalties, etc.) applied to player characters during combat appear as effect badges in the group panel under the affected player's name, alongside any player-applied buffs.
</success_criteria>

<output>
After completion, create `.planning/quick/41-fix-group-panel-buffs-debuffs-display-en/41-SUMMARY.md`
</output>
