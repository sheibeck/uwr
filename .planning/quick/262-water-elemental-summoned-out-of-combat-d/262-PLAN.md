---
phase: quick-262
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat.ts
autonomous: true
requirements: [QUICK-262]

must_haves:
  truths:
    - "Water Elemental summoned out of combat begins healing party on the next regen_health tick"
    - "Primal Titan summoned out of combat begins healing party on the next regen_health tick"
    - "Pets with non-heal abilities summoned out of combat remain unarmed (nextAbilityAt stays undefined)"
    - "Pets summoned into active combat continue to work as before"
  artifacts:
    - path: spacetimedb/src/helpers/combat.ts
      provides: "summonPet insertion with corrected nextAbilityAt for heal pets"
      contains: "pet_heal.*pet_aoe_heal"
  key_links:
    - from: "summonPet (helpers/combat.ts line ~457)"
      to: "regen_health out-of-combat loop (reducers/combat.ts line ~1390)"
      via: "nextAbilityAt set to nowMicros enables the gate check"
      pattern: "nextAbilityAt.*nowMicros"
---

<objective>
Fix water elemental (and primal titan) not healing the party when summoned out of combat.

Purpose: Pets with `pet_heal` or `pet_aoe_heal` abilities are supposed to heal party members between
fights. This only works if `nextAbilityAt` is set to a non-undefined value on the ActivePet row at
summon time. Currently, `summonPet` sets `nextAbilityAt: undefined` for all out-of-combat summons,
which causes the `regen_health` loop to skip them immediately (`if (!pet.nextAbilityAt) continue`).

Output: One-line fix in `summonPet` that mirrors the combat-exit re-arm logic already used at line 334.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Arm heal pets on out-of-combat summon</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
    In the `summonPet` function, find the `activePet.insert(...)` call (around line 457). The current line is:

    ```
    nextAbilityAt: inActiveCombat && ability ? nowMicros : undefined,
    ```

    Replace it with:

    ```
    nextAbilityAt: inActiveCombat && ability
      ? nowMicros
      : (!inActiveCombat && (ability?.key === 'pet_heal' || ability?.key === 'pet_aoe_heal'))
        ? nowMicros
        : undefined,
    ```

    This mirrors the combat-exit re-arm logic already present at the `endCombat` path (reducers/combat.ts ~line 334):
    `(pet.abilityKey === 'pet_heal' || pet.abilityKey === 'pet_aoe_heal') ? ctx.timestamp.microsSinceUnixEpoch : undefined`

    Non-heal abilities (pet_taunt, pet_bleed, pet_aoe_damage) remain `undefined` when summoned
    out of combat — they have no out-of-combat loop and should stay disarmed until entering combat.

    Do NOT change the `inActiveCombat` branch — combat summons already work correctly.
  </action>
  <verify>
    Publish locally and test:
    1. Summon a Water Elemental or Primal Titan while out of combat
    2. Wait up to 8 seconds (one regen_health tick)
    3. Observe heal event in the event log — pet should heal a party member (or self if all full)
    4. Also verify: summoning an Earth Elemental out of combat does NOT produce heal events
       (pet_taunt has no out-of-combat loop)
  </verify>
  <done>
    Water Elemental and Primal Titan summoned out of combat produce heal events within 8 seconds.
    Earth Elemental summoned out of combat produces no out-of-combat ability events.
    Existing in-combat pet behavior is unchanged.
  </done>
</task>

</tasks>

<verification>
- `spacetimedb/src/helpers/combat.ts` compiles without errors after the change
- The `nextAbilityAt` field for a Water Elemental row inserted out of combat equals `nowMicros` (not undefined)
- The `regen_health` out-of-combat pet_heal loop passes its `!pet.nextAbilityAt` gate on the next tick
</verification>

<success_criteria>
Water Elemental and Primal Titan summon → heal fires within 8 seconds when out of combat.
</success_criteria>

<output>
After completion, create `.planning/quick/262-water-elemental-summoned-out-of-combat-d/262-SUMMARY.md`
</output>
