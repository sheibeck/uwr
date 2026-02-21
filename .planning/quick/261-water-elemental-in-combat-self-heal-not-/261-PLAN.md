---
phase: quick-261
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [QUICK-261]

must_haves:
  truths:
    - "Water elemental HP bar visibly increases after it heals itself during combat"
    - "Subsequent auto-attack update does not reset currentHp to pre-heal value"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "In-combat pet tick loop with stale-pet fix"
      contains: "re-fetch pet after executePetAbility"
  key_links:
    - from: "executePetAbility (combat.ts helper)"
      to: "ctx.db.activePet.id.update in pet tick loop (reducers/combat.ts ~2594)"
      via: "stale pet spread clobbers currentHp"
      pattern: "activePet\\.id\\.update\\(\\{\\s*\\.\\.\\.pet"
---

<objective>
Fix the in-combat water elemental self-heal not updating its HP bar.

Purpose: The pet tick loop re-fetches the pet from DB after executePetAbility fires so
the subsequent activePet.id.update spread does not overwrite the freshly-healed currentHp
with the stale pre-heal value.

Output: Modified reducers/combat.ts where the pet is re-fetched after a successful ability use.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/projects/uwr/spacetimedb/src/reducers/combat.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Re-fetch pet after executePetAbility to prevent stale-spread overwrite</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
The bug is in the in-combat pet processing loop (around line 2523-2599).

The sequence is:
1. Line 2524: `executeAbilityAction(...)` → internally calls `executePetAbility` → calls
   `ctx.db.activePet.id.update({ ...healTarget, currentHp: newHp })` — DB row is updated.
2. Line 2540 or 2594: `ctx.db.activePet.id.update({ ...pet, nextAbilityAt, ... })` — uses
   the STALE `pet` object captured at loop start, which still has the old `currentHp`.
   This overwrites the healed HP, making it appear the heal never happened.

Fix: After the `if (used)` block (line 2531-2534), re-fetch the pet from the database so
any subsequent update spreads use the current row:

```typescript
if (used) {
  const cooldownMicros = (pet.abilityCooldownSeconds ?? 10n) * 1_000_000n;
  nextAbilityAt = nowMicros + cooldownMicros;
  // Re-fetch pet so subsequent updates don't clobber fields changed by the ability
  // (e.g. pet_heal updates currentHp; spreading stale pet would overwrite it).
  pet = ctx.db.activePet.id.find(pet.id) ?? pet;
}
```

Note: The loop variable `pet` must be declared with `let` not `const` for this reassignment.
Check whether `pet` is declared with `const` in the loop. If so, change it to `let pet = ...`
at the point where it is assigned in the loop body. Do NOT change anything outside the loop
or alter any other logic.

After the fix, both the early-exit path (line 2540: `ctx.db.activePet.id.update({ ...pet, nextAbilityAt, targetEnemyId })`)
and the normal path (line 2594: `ctx.db.activePet.id.update({ ...pet, nextAutoAttackAt, nextAbilityAt, targetEnemyId })`)
will spread from the freshly-fetched pet, preserving the updated currentHp.
  </action>
  <verify>
Publish locally and test:
1. Summon water elemental in combat
2. Let it take some damage (or note its current HP)
3. Wait for the pet_heal ability to fire (6 second cooldown)
4. Observe: the pet HP bar should visibly increase in the UI
5. Check server logs: `spacetime logs uwr` — confirm no errors during pet tick

Local publish: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb`
  </verify>
  <done>
After pet_heal fires in combat, the pet HP bar reflects the increased currentHp and does not
immediately snap back to the pre-heal value on the next tick.
  </done>
</task>

</tasks>

<verification>
- Publish module locally and confirm no compile errors
- In-combat pet self-heal visibly raises the HP bar
- HP bar does not snap back down after the next auto-attack update
</verification>

<success_criteria>
Water elemental uses pet_heal on itself during combat and the HP bar goes up and stays up,
matching the same behavior already working in the out-of-combat regen path.
</success_criteria>

<output>
After completion, create `.planning/quick/261-water-elemental-in-combat-self-heal-not-/261-SUMMARY.md`
</output>
