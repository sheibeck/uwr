---
phase: quick-318
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [QUICK-318]
must_haves:
  truths:
    - "In-combat regen ticks every 8 seconds (every tick), not every 16 seconds"
    - "In-combat base HP regen remains 2 per tick"
    - "Food and racial bonuses still stack on top of base regen during combat"
    - "Out-of-combat regen is unchanged"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Consistent 8-second in-combat regen ticks"
  key_links: []
---

<objective>
Fix in-combat healing to tick consistently every 8 seconds instead of every 16 seconds.

Purpose: The halfTick mechanism on line 1325 causes regen to skip every other tick during combat, meaning players only heal every 16 seconds with a burst of ~5-7 HP. The intended behavior is a steady 2 HP base per 8-second tick (plus food/racial bonuses).

Output: Updated regen_health reducer without the halfTick skip.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/combat.ts (lines 1300-1377 — regen_health reducer)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove halfTick skip from regen_health reducer</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In `spacetimedb/src/reducers/combat.ts`, inside the `regen_health` reducer (starts ~line 1308):

1. **Delete line 1309**: `const tickIndex = ctx.timestamp.microsSinceUnixEpoch / REGEN_TICK_MICROS;`
2. **Delete line 1310**: `const halfTick = tickIndex % 2n === 0n;`
3. **Delete line 1325**: `if (inCombat && !halfTick) continue;`

These three lines are the entire halfTick mechanism. The `tickIndex` and `halfTick` variables are not used anywhere else in the reducer — they only exist for the skip on line 1325.

Do NOT change:
- HP_REGEN_IN (stays 2n)
- MANA_REGEN_IN (stays 2n)
- STAMINA_REGEN_IN (stays 2n)
- Food/racial bonus stacking (lines 1331-1347)
- Out-of-combat regen calculation (line 1327 ternary else branch)
- Any other part of the reducer
  </action>
  <verify>
    <automated>cd C:/projects/uwr && grep -n "halfTick\|tickIndex" spacetimedb/src/reducers/combat.ts | head -5</automated>
    <manual>Grep should return zero results — both variables should be completely removed.</manual>
  </verify>
  <done>The halfTick mechanism is removed. In-combat regen fires every 8-second tick. Base rates (HP_REGEN_IN=2, MANA_REGEN_IN=2, STAMINA_REGEN_IN=2) and food/racial bonus stacking are unchanged.</done>
</task>

</tasks>

<verification>
1. `grep -n "halfTick\|tickIndex" spacetimedb/src/reducers/combat.ts` returns nothing
2. `grep -n "HP_REGEN_IN\|inCombat" spacetimedb/src/reducers/combat.ts` still shows the base rate constants and combat detection logic intact
3. Module publishes successfully to local: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb`
</verification>

<success_criteria>
- halfTick and tickIndex variables are fully removed from regen_health
- In-combat characters regen every 8-second tick (not every 16 seconds)
- Base in-combat HP regen is 2 per tick
- Food and racial bonuses still apply during combat
- Out-of-combat regen logic is untouched
- Module compiles and publishes
</success_criteria>

<output>
After completion, create `.planning/quick/318-fix-in-combat-healing-ticks-of-7-hp-occu/318-01-SUMMARY.md`
</output>
