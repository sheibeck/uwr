---
phase: 258-pet-health-bar-not-updating-in-ui-when-p
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "Pet HP bar increases visually when a pet_heal or pet_aoe_heal ability heals the pet itself (out of combat)"
    - "Out-of-combat pet_heal considers the pet as a heal candidate when it is more injured than party members"
    - "Out-of-combat pet_aoe_heal heals the pet itself if it is injured, in addition to party members"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Out-of-combat pet heal tick logic"
      contains: "activePet.id.update"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts (out-of-combat pet_heal loop)"
      to: "ctx.db.activePet.id.update"
      via: "pet self-heal candidate check"
      pattern: "activePet\\.id\\.update.*currentHp"
---

<objective>
Fix the server-side out-of-combat pet heal tick so the pet itself is a valid heal target.

Purpose: When a pet's `pet_heal` or `pet_aoe_heal` ability fires out of combat, the pet's own HP is never updated — only character HPs are. The in-combat path (in `helpers/combat.ts`) correctly includes the pet as a heal candidate, but the out-of-combat path (in `reducers/combat.ts`) does not. Because `currentHp` on `ActivePet` is never changed, the client's reactive computed (`combatPetsForGroup`) correctly reflects the data but the data itself is stale.

Output: Updated `spacetimedb/src/reducers/combat.ts` with pet self-heal logic added to both out-of-combat tick loops.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add pet self-heal to out-of-combat pet_heal tick</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In the out-of-combat `pet_heal` ability loop (starting around line 1385 with the comment "Out-of-combat pet_heal ability ticks"), after checking the owner and group members for the lowest HP ratio, add the pet itself as a heal candidate — mirroring the in-combat logic in `helpers/combat.ts` lines 2229-2252.

Specifically, after the group member loop (before the `if (!healTarget)` guard), add:

```typescript
// Consider the pet itself as a heal candidate
if (pet.currentHp > 0n && pet.currentHp < pet.maxHp) {
  const petRatio = (pet.currentHp * 100n) / pet.maxHp;
  if (petRatio < lowestHpRatio) {
    lowestHpRatio = petRatio;
    healTarget = { ...pet, isPet: true };
  }
}
```

Then update the heal dispatch at the bottom of the loop (currently `ctx.db.character.id.update({ ...healTarget, hp: newHp })`) to branch on whether the target is the pet:

```typescript
const healAmount = 10n + pet.level * 5n;
if (healTarget.isPet) {
  const newHp = pet.currentHp + healAmount > pet.maxHp ? pet.maxHp : pet.currentHp + healAmount;
  ctx.db.activePet.id.update({ ...pet, currentHp: newHp });
} else {
  const newHp = healTarget.hp + healAmount > healTarget.maxHp ? healTarget.maxHp : healTarget.hp + healAmount;
  ctx.db.character.id.update({ ...healTarget, hp: newHp });
}
```

Use a boolean flag (`healTargetIsPet`) instead of a tagged property on the object if that is cleaner given existing variable types. The key invariant: `ctx.db.activePet.id.update` must be called with the updated `currentHp` when the pet is chosen.

Do NOT use `isPet` as a property injected onto a CharacterRow object (type mismatch). Instead declare a separate `healTargetIsPet: boolean` flag alongside `healTarget`, initialized to `false`, and set to `true` when the pet wins the comparison.
  </action>
  <verify>
    `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` succeeds (no compile errors).
  </verify>
  <done>
    Module compiles and publishes. Out-of-combat pet_heal tick can select the pet as the lowest-HP target and calls `ctx.db.activePet.id.update` with the incremented `currentHp`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add pet self-heal to out-of-combat pet_aoe_heal tick</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In the out-of-combat `pet_aoe_heal` ability loop (starting around line 1446 with the comment "Out-of-combat pet_aoe_heal ability ticks"), after healing the owner and group members, add a block to also heal the pet itself if it is injured — mirroring the in-combat AOE heal in `helpers/combat.ts` lines 2287-2291.

After the group member loop (before the `if (healedCount === 0n)` guard), add:

```typescript
// Also heal the pet itself if injured
if (pet.currentHp > 0n && pet.currentHp < pet.maxHp) {
  const newPetHp = pet.currentHp + healAmount > pet.maxHp ? pet.maxHp : pet.currentHp + healAmount;
  ctx.db.activePet.id.update({ ...pet, currentHp: newPetHp });
  healedCount++;
}
```

This ensures the pet's own HP is tracked in `healedCount` so the cooldown update fires correctly and `nextAbilityAt` is not incorrectly cleared.
  </action>
  <verify>
    `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` succeeds. Confirm no TypeScript errors in the loop block.
  </verify>
  <done>
    Module compiles. Out-of-combat pet_aoe_heal tick heals the pet's own `currentHp` via `ctx.db.activePet.id.update` and counts it in `healedCount`.
  </done>
</task>

</tasks>

<verification>
After publishing:
1. Summon a pet with `pet_heal` or `pet_aoe_heal` ability key out of combat.
2. Damage the pet somehow (or enter/exit combat after taking pet damage).
3. Wait for the tick interval — the pet HP bar in GroupPanel should visually increase.
4. Confirm the `spacetime logs uwr` shows no panic or reducer errors.
</verification>

<success_criteria>
- `spacetime publish` succeeds with no TypeScript errors.
- Out-of-combat pet heal ticks update `activePet.currentHp` on the server when the pet is the most injured entity.
- The GroupPanel pet HP bar reflects the updated value from the reactive `activePets` subscription.
</success_criteria>

<output>
After completion, create `.planning/quick/258-pet-health-bar-not-updating-in-ui-when-p/258-01-SUMMARY.md`
</output>
