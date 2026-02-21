---
phase: quick-255
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat.ts
autonomous: true
requirements:
  - QUICK-255
must_haves:
  truths:
    - "Water elemental heals itself when it is the lowest-HP entity in the party"
    - "Water elemental still heals party members when they have lower HP than the pet"
    - "Heal target selection picks the single entity with the lowest HP ratio, whether character or pet"
  artifacts:
    - path: spacetimedb/src/helpers/combat.ts
      provides: "pet_heal branch inside executePetAbility"
      contains: "pet.currentHp"
  key_links:
    - from: "pet_heal branch"
      to: "ctx.db.activePet.id.update"
      via: "conditional heal-target dispatch"
      pattern: "activePet.id.update"
---

<objective>
Include the water elemental pet itself as a candidate heal target in the `pet_heal` ability.

Purpose: The pet can currently heal party members but never itself. When the pet has lower HP than everyone else it should self-heal, matching how AOE heal already covers the owner.
Output: Updated `pet_heal` branch in `executePetAbility` that considers `pet.currentHp / pet.maxHp` alongside character ratios and dispatches the correct DB update depending on which entity won.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add pet as heal candidate in pet_heal branch</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
In `executePetAbility`, inside the `if (abilityKey === 'pet_heal')` block (around line 2210), make the following targeted changes:

1. After the `lowestHpRatio` / `healTarget` variable declarations, introduce a parallel flag `let healTargetIsPet = false;` to track whether the winning candidate is the pet.

2. After the participant loop (after line 2225), add a block that checks the pet itself:
   ```typescript
   // Consider the pet itself as a heal candidate
   if (pet.currentHp > 0n && pet.currentHp < pet.maxHp) {
     const petRatio = (pet.currentHp * 100n) / pet.maxHp;
     if (petRatio < lowestHpRatio) {
       lowestHpRatio = petRatio;
       healTarget = pet;
       healTargetIsPet = true;
     }
   }
   ```
   Place this BEFORE the existing owner fallback block (line 2227).

3. Remove or keep the existing owner fallback as-is — it guards the case where *no* candidate was found at all (everyone at full HP) and uses `!healTarget`, so it will only fire if the pet is also at full HP. No change needed there.

4. Replace the single unconditional `ctx.db.character.id.update(...)` call (line 2238) with a dispatch:
   ```typescript
   if (healTargetIsPet) {
     ctx.db.activePet.id.update({ ...healTarget, currentHp: newHp });
   } else {
     ctx.db.character.id.update({ ...healTarget, hp: newHp });
   }
   ```
   Note: for a character, the HP field is `hp`; for an ActivePet row it is `currentHp`. The `newHp` calculation above line 2238 uses `healTarget.hp` — when the target is the pet, `healTarget.hp` will be undefined; update the calculation to use the correct field:
   ```typescript
   const targetCurrentHp = healTargetIsPet ? healTarget.currentHp : healTarget.hp;
   const newHp = targetCurrentHp + healAmount > healTarget.maxHp
     ? healTarget.maxHp
     : targetCurrentHp + healAmount;
   ```

5. The event message on line 2240 uses `healTarget.name` — ActivePet also has a `name` field, so this works unchanged.

Do NOT touch the `pet_aoe_heal` block or any other code.
  </action>
  <verify>
Run `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` (local). The module must compile and publish without errors.
  </verify>
  <done>
Module publishes cleanly. The `pet_heal` branch considers the pet's own `currentHp/maxHp` ratio in the same comparison loop as party members, and updates `activePet` (not `character`) when the pet wins.
  </done>
</task>

</tasks>

<verification>
After publish:
1. Summon a water elemental in combat.
2. Damage the water elemental to below its max HP while party members are at full HP.
3. Wait for its heal cooldown — it should heal itself and log "[Name] heals [PetName] for X."
4. Verify it still heals the lowest-HP party member when a character has a lower HP ratio than the pet.
</verification>

<success_criteria>
Water elemental heals itself when it has the lowest HP ratio in the party. Heal target selection (pet vs character) is determined by the same integer-ratio comparison already used for party members.
</success_criteria>

<output>
After completion, create `.planning/quick/255-water-elemental-is-not-healing-itself/255-01-SUMMARY.md`
</output>
