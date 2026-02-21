---
phase: quick-256
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat.ts
autonomous: true
requirements:
  - QUICK-256
must_haves:
  truths:
    - "Primal Titan heals itself when its currentHp < maxHp during pet_aoe_heal"
    - "Pet self-heal uses the same formula as participant heals (10n + pet.level * 5n), clamped to maxHp"
    - "healedCount increments when the pet is healed so the 'nothing to heal' guard still works correctly"
    - "The heal message remains unchanged (party heal message covers the whole AoE)"
  artifacts:
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "pet_aoe_heal case with pet self-heal block"
      contains: "pet.currentHp < pet.maxHp"
  key_links:
    - from: "pet_aoe_heal case"
      to: "ctx.db.activePet.id.update"
      via: "self-heal block after participant loop"
      pattern: "activePet\\.id\\.update.*currentHp"
---

<objective>
Make the Primal Titan's `pet_aoe_heal` ability include the pet itself as a heal target, matching the behaviour added for `pet_heal` (water elemental) in quick-255.

Purpose: The Titan is a front-line tank that takes heavy damage. Excluding it from its own AoE heal is inconsistent and punishing.
Output: Updated `pet_aoe_heal` case in `executePetAbility` that heals the pet after the participant loop.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/PROJECT.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add pet self-heal to pet_aoe_heal case</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
In `executePetAbility`, locate the `pet_aoe_heal` block (around line 2265). It currently:
1. Heals the owner if injured.
2. Loops over combat participants and heals injured members.
3. Returns false if healedCount === 0n.
4. Fires a message and returns true.

After the participant loop and before the `if (healedCount === 0n) return false;` guard, insert a pet self-heal block:

```typescript
// Also heal the pet itself if injured
if (pet.currentHp > 0n && pet.currentHp < pet.maxHp) {
  const newPetHp = pet.currentHp + healAmount > pet.maxHp ? pet.maxHp : pet.currentHp + healAmount;
  ctx.db.activePet.id.update({ ...pet, currentHp: newPetHp });
  healedCount++;
}
```

This mirrors the pattern used for `pet_heal` in quick-255. The `healAmount` variable is already in scope at that point.

Do NOT change the message string or any other logic.
  </action>
  <verify>
Publish to local and confirm via game client: summon a Primal Titan, take damage on the Titan (let enemies hit it), wait for the AoE heal tick, and verify the Titan's HP increases. Alternatively inspect server logs for no errors after publish: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb`
  </verify>
  <done>
The pet_aoe_heal case includes the pet self-heal block. The Primal Titan recovers HP from its own AoE heal when below max HP. The build compiles without errors.
  </done>
</task>

</tasks>

<verification>
- `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` completes without TypeScript/compile errors.
- The `pet_aoe_heal` case in `executePetAbility` contains `pet.currentHp < pet.maxHp` and a call to `ctx.db.activePet.id.update` with updated `currentHp`.
</verification>

<success_criteria>
Primal Titan heals itself during `pet_aoe_heal`. The existing participant and owner heal logic is unchanged. No regressions in build.
</success_criteria>

<output>
After completion, create `.planning/quick/256-primal-titan-pet-aoe-heal-should-also-he/256-SUMMARY.md` using the summary template.
</output>
