---
phase: quick-199
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/reducers/items.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Using a combat-only ability outside of combat shows an immersive message and does NOT consume any stamina or mana"
    - "Using a damage ability (like Marked Shot) outside of combat shows an immersive failure message and does not consume stamina"
    - "Using abilities that succeed in combat still consume resources as before"
  artifacts:
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "executeAbility with resource deduction moved to after ability execution"
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "Immersive out-of-combat failure message"
  key_links:
    - from: "spacetimedb/src/helpers/combat.ts executeAbility"
      to: "resource deduction"
      via: "deduct only after ability switch-case returns without throwing"
      pattern: "character\\.mana - resourceCost|character\\.stamina - resourceCost"
---

<objective>
Fix ability resource consumption so stamina/mana are never deducted when an ability fails to fire.
Currently in executeAbility (helpers/combat.ts), resources are deducted BEFORE the ability's switch-case
runs — so if the case throws `SenderError('No enemy in combat')`, the resource is already gone.
Also update the out-of-combat failure messages to be more immersive.

Purpose: Prevent the frustrating UX where players lose stamina/mana from abilities that silently fail.
Output: Modified executeAbility (deduct after), updated failure messages in items.ts and combat.ts.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Move resource deduction in executeAbility to after ability execution</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
In `executeAbility` (around line 294), restructure the resource deduction order:

**Current order (wrong):**
1. Validate resource sufficiency (throw if not enough) — lines 326-330
2. Validate stamina_free effect, calculate resourceCost — lines 310-325
3. Consume stamina_free CharacterEffect — line 317
4. **Deduct resource from character** — lines 357-361
5. Run ability switch-case — lines 363+

**New order (correct):**
1. Calculate resourceCost (same as now, lines 320-325)
2. Validate resource sufficiency (throw if not enough) — lines 326-330
3. Run combat state setup variables (combatId, combat, enemies, enemy, etc.)
4. Run ability switch-case (all the existing cases, unchanged)
5. **After** the switch-case returns normally (ability succeeded):
   - Consume stamina_free effect (if applicable)
   - Deduct resource from character

Implementation steps:
- Remove the `staminaFree` effect consumption block (the `ctx.db.characterEffect.id.delete(free.id)` at ~line 317). Move it to after the switch-case.
- Remove the resource deduction block at lines 357-361.
- Find the end of the ability switch-case (just before the closing `}` of `executeAbility`). Add the deduction there.

The switch-case ends with a large block of cases. The function ends (after the switch-case) before the closing `}` of `executeAbility`. Add the deduction just before that closing brace.

Note: The `staminaFree` variable must still be computed early (to know if resourceCost is 0n), but the actual CharacterEffect deletion must happen after the ability fires successfully.

Also update the `'No enemy in combat'` error messages in this file (two places, ~lines 398 and 468) to be more immersive:
- Line 398: `'No enemy in combat'` → `'You have no target to unleash this upon.'`
- Line 468: `'No enemy in combat'` → `'You have no target to unleash this upon.'`
- Line 396: `'Pets can only be summoned in combat'` → `'Your companion can only be called forth when enemies are near.'`
- Line 845: `'No enemy target'` → `'You have no target to unleash this upon.'`
  </action>
  <verify>Search for the resource deduction lines in the new position: `grep -n "character.stamina - resourceCost\|character.mana - resourceCost" spacetimedb/src/helpers/combat.ts` — should now appear AFTER the switch-case, not before it.</verify>
  <done>Resource deduction lines appear after all ability cases in executeAbility. staminaFree deletion appears in the same post-switch block. Error messages updated to immersive variants.</done>
</task>

<task type="auto">
  <name>Task 2: Update out-of-combat failure message in use_ability reducer and publish</name>
  <files>spacetimedb/src/reducers/items.ts</files>
  <action>
In `use_ability` reducer (items.ts ~line 658), update the combat-only failure message:

Current: `'This ability can only be used in combat.'`
New: `'You must be engaged in battle to use this ability.'`

Also update the out_of_combat_only failure message (~line 668):
Current: `'This ability cannot be used in combat.'`
New: `'This ability can only be used when you are at peace.'`

After making both file changes, publish the module:
```bash
spacetime publish uwr --project-path spacetimedb
```
(No --clear-database needed — this is logic-only, no schema changes.)
  </action>
  <verify>Run: `spacetime publish uwr --project-path spacetimedb` and confirm publish succeeds without errors. Then test in-game: try using Marked Shot (ranger) outside of combat — stamina should NOT decrease and message should say "You must be engaged in battle to use this ability." or similar.</verify>
  <done>Module published successfully. Attempting combat-only abilities outside of combat shows immersive message and consumes no resources.</done>
</task>

</tasks>

<verification>
1. `spacetime publish uwr --project-path spacetimedb` completes without errors.
2. In-game: Use a ranger Marked Shot outside of combat — stamina unchanged, message is immersive.
3. In-game: Use Marked Shot inside combat — stamina deducted, ability fires normally.
4. In-game: Use a pet-summon ability outside combat — mana unchanged, immersive message.
</verification>

<success_criteria>
- Combat-only abilities used outside combat: resource unchanged, immersive message shown.
- Damage abilities used outside combat: resource unchanged, "No enemy in combat"-style errors are replaced with immersive alternatives.
- All abilities used in combat continue to consume resources and function as before.
- Module publishes cleanly.
</success_criteria>

<output>
After completion, create `.planning/quick/199-don-t-consume-ability-resource-when-comb/199-SUMMARY.md`
</output>
