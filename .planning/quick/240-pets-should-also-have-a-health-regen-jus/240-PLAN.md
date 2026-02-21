---
phase: quick-240
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements:
  - QUICK-240
must_haves:
  truths:
    - "Pets with currentHp < maxHp and no combatId slowly regen HP each tick"
    - "Pets in combat (combatId set) regen HP at half rate (every other tick)"
    - "Dead pets (currentHp === 0) are skipped"
    - "Pet HP is clamped to maxHp"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Pet regen loop inside regen_health reducer"
      contains: "activePet.iter()"
  key_links:
    - from: "regen_health reducer"
      to: "ctx.db.activePet"
      via: "iter() loop after character regen loop"
      pattern: "activePet\\.iter\\(\\)"
---

<objective>
Extend the existing `regen_health` reducer to also regen HP for active pets.

Purpose: Pets currently have `currentHp` and `maxHp` but no recovery mechanism. Characters regen via the existing scheduled `regen_health` tick — pets should piggyback on the same tick.

Output: Pet HP regenerates out of combat (3 HP/tick) and in combat (2 HP/tick, every other tick), mirroring character regen rates. No new scheduled table is needed.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/projects/uwr/.planning/ROADMAP.md
@C:/projects/uwr/spacetimedb/src/reducers/combat.ts
@C:/projects/uwr/spacetimedb/src/schema/tables.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add pet HP regen loop inside regen_health reducer</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
Inside the `regen_health` reducer (around line 1353, after the closing brace of the `for (const character of ctx.db.character.iter())` loop and before the watchdog block), add a pet regen loop:

```typescript
// Pet HP regen — mirrors character regen rates
const PET_HP_REGEN_OUT = 3n;
const PET_HP_REGEN_IN = 2n;

for (const pet of ctx.db.activePet.iter()) {
  if (pet.currentHp === 0n) continue;           // dead pet — skip
  if (pet.currentHp >= pet.maxHp) continue;     // full HP — skip

  const petInCombat = pet.combatId !== undefined && pet.combatId !== null;

  // In combat: only regen on halfTick (every other 8s tick = every 16s)
  if (petInCombat && !halfTick) continue;

  const regenAmount = petInCombat ? PET_HP_REGEN_IN : PET_HP_REGEN_OUT;
  const nextHp = pet.currentHp + regenAmount;

  ctx.db.activePet.id.update({
    ...pet,
    currentHp: nextHp > pet.maxHp ? pet.maxHp : nextHp,
  });
}
```

Place this block AFTER the character `for` loop's closing `}` (line ~1353) and BEFORE the watchdog `for (const combat of ctx.db.combatEncounter.iter())` block (line ~1355).

The `halfTick` variable is already in scope (computed at the top of the reducer). The constants `PET_HP_REGEN_OUT` and `PET_HP_REGEN_IN` should be declared immediately before the `for` loop — do NOT redeclare `REGEN_TICK_MICROS` or existing constants.

Use `pet.combatId !== undefined && pet.combatId !== null` to check in-combat status since `combatId` is optional on the `ActivePet` table.
  </action>
  <verify>
1. Publish to local: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb`
2. Confirm no compile errors in output.
3. Check logs after a regen tick fires: `spacetime logs uwr` — no panics or errors.
4. Optionally: summon a pet, deal damage to it, confirm its `currentHp` increases on the next regen tick (visible via the `active_pet` table).
  </verify>
  <done>
Module publishes cleanly. Pets with damaged HP recover HP over time. Pets at full HP are not updated unnecessarily. Dead pets (currentHp=0) are skipped.
  </done>
</task>

</tasks>

<verification>
- `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` succeeds with no TypeScript errors
- No runtime panics in `spacetime logs uwr`
- Pet `currentHp` increases toward `maxHp` between regen ticks when below max
</verification>

<success_criteria>
Pets regen 3 HP per tick (8s) when out of combat and 2 HP per tick (16s) when in combat, clamped to maxHp, with dead pets and full-HP pets skipped — achieved by extending the existing regen_health reducer with a single additional loop.
</success_criteria>

<output>
After completion, create `.planning/quick/240-pets-should-also-have-a-health-regen-jus/240-SUMMARY.md`
</output>
