---
phase: quick
plan: 42
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/index.ts
  - src/composables/useGameData.ts
  - src/App.vue
autonomous: true

must_haves:
  truths:
    - "Out-of-combat buffs (Ballad of Resolve, etc.) show on caster and all affected party members in group panel"
    - "In-combat buffs and debuffs continue to show correctly in group panel"
    - "Solo character effects still display in group panel solo view"
  artifacts:
    - path: "spacetimedb/src/index.ts"
      provides: "CharacterEffect table with public: true"
      contains: "public: true"
    - path: "src/composables/useGameData.ts"
      provides: "Direct subscription to characterEffect table"
      contains: "tables.characterEffect"
    - path: "src/App.vue"
      provides: "Client-side effect filtering for group members"
  key_links:
    - from: "src/composables/useGameData.ts"
      to: "tables.characterEffect"
      via: "useTable subscription"
      pattern: "useTable.*tables\\.characterEffect"
    - from: "src/App.vue"
      to: "GroupPanel"
      via: "character-effects prop"
      pattern: "character-effects"
---

<objective>
Fix out-of-combat buffs (like Ballad of Resolve) not showing in the group panel for affected characters.

Purpose: SpacetimeDB views have known reactivity issues (see Decision #33 — views don't re-evaluate reliably). The `my_character_effects` view fails to push updates to clients when effects are inserted outside of combat. The fix follows the established pattern from quick task 35: switch from unreliable view to a direct public table subscription with client-side filtering.

Output: Working buff/debuff display for both in-combat and out-of-combat effects on all group members.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/index.ts (CharacterEffect table at ~line 926, my_character_effects view in views/effects.ts)
@spacetimedb/src/views/effects.ts (current view — to be bypassed)
@src/composables/useGameData.ts (useTable subscriptions)
@src/App.vue (GroupPanel props wiring)
@src/components/GroupPanel.vue (effectsFor filtering)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make CharacterEffect table public and update client subscription</name>
  <files>
    spacetimedb/src/index.ts
    src/composables/useGameData.ts
    src/App.vue
  </files>
  <action>
1. In `spacetimedb/src/index.ts`, find the CharacterEffect table definition (~line 926) and add `public: true` to its options object:
   ```
   const CharacterEffect = table(
     {
       name: 'character_effect',
       public: true,   // ADD THIS
       indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
     },
     ...
   ```

2. In `src/composables/useGameData.ts`, change the effects subscription from the view to the direct table:
   - Change `const [characterEffects] = useTable(tables.myCharacterEffects);` to `const [characterEffects] = useTable(tables.characterEffect);`
   - The returned rows have the exact same shape (id, characterId, effectType, magnitude, roundsRemaining, sourceAbility) so no other changes needed in this file.

3. In `src/App.vue`, add client-side filtering to only pass relevant effects to GroupPanel. Find where `characterEffects` is used:
   - Currently passed directly as `:character-effects="characterEffects"` (~line 366)
   - Create a computed that filters effects to only include effects for the selected character and their group members:
     ```
     const relevantEffects = computed(() => {
       if (!selectedCharacter.value) return [];
       const memberIds = new Set<string>();
       memberIds.add(selectedCharacter.value.id.toString());
       for (const member of groupCharacterMembers.value) {
         memberIds.add(member.id.toString());
       }
       return characterEffects.value.filter(
         (effect: any) => memberIds.has(effect.characterId.toString())
       );
     });
     ```
   - Update the GroupPanel prop to use the filtered list: `:character-effects="relevantEffects"`
   - Note: `groupCharacterMembers` is already available in the App.vue scope (computed from useCharacters)

4. Publish the module with `spacetime publish uwr --clear-database -y --project-path spacetimedb` and regenerate bindings with `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb`.

Note: The `my_character_effects` view in `spacetimedb/src/views/effects.ts` can be left as-is (it becomes unused but harmless). Removing it would require updating the schema export and view registration which is unnecessary churn. If the view causes issues during publish, remove the `registerEffectViews` call from the views registration chain.
  </action>
  <verify>
    - `spacetime publish` succeeds without errors
    - `spacetime generate` regenerates bindings
    - `spacetime logs uwr` shows no errors related to character_effect table
    - Client builds without TypeScript errors: `npx tsc --noEmit` or equivalent
  </verify>
  <done>
    - CharacterEffect table is public (verified in schema)
    - Client subscribes to characterEffect directly (not the view)
    - Effects are filtered client-side by selected character + group members
    - Out-of-combat buffs like Ballad of Resolve will show on affected characters in group panel
    - In-combat debuffs/buffs continue to work (same underlying table, just different subscription path)
  </done>
</task>

</tasks>

<verification>
- Publish module and verify no errors in `spacetime logs uwr`
- Check that `character_effect` table is listed as public in the module
- Verify client builds without errors
- Manual verification: cast Ballad of Resolve out of combat and confirm buff appears on group panel for affected characters
</verification>

<success_criteria>
- Out-of-combat buffs (Ballad of Resolve str_bonus) display on all affected group members in group panel
- In-combat buffs and debuffs continue to display correctly
- Solo character effects display correctly
- No regression in combat flow or effect tick-down behavior
</success_criteria>

<output>
After completion, create `.planning/quick/42-fix-out-of-combat-buffs-not-showing-in-g/42-SUMMARY.md`
</output>
