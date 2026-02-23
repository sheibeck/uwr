---
phase: quick-292
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [QUICK-292]
must_haves:
  truths:
    - "Friendly spell casts (heals, buffs, resurrects) persist when combat ends"
    - "Hostile/combat-only casts are still cancelled when combat ends"
    - "Friendly casts that complete after combat ends execute successfully via tick_casts"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Conditional cast cancellation in clearCombatArtifacts"
      contains: "combatState"
  key_links:
    - from: "clearCombatArtifacts cast cleanup"
      to: "abilityTemplate.by_key"
      via: "lookup ability combatState before deciding to delete"
      pattern: "abilityTemplate\\.by_key"
---

<objective>
Fix bug where friendly spell casts (heals, buffs, resurrects, utility) are cancelled when combat state transitions occur. Only combat-only abilities should be cancelled when combat ends.

Purpose: Players casting heals or buffs should not have their casts interrupted by combat ending.
Output: Modified clearCombatArtifacts in combat.ts that preserves non-combat-only casts.
</objective>

<context>
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/schema/tables.ts (AbilityTemplate schema, CharacterCast schema)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make clearCombatArtifacts skip friendly casts</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In `clearCombatArtifacts` (defined at line 331), modify the characterCast cleanup loop at lines 365-367.

Currently the code unconditionally deletes ALL casts:
```typescript
for (const cast of ctx.db.characterCast.by_character.filter(characterId)) {
  ctx.db.characterCast.id.delete(cast.id);
}
```

Change it to look up the ability's `combatState` from the `AbilityTemplate` table before deciding to cancel. Only cancel casts whose ability has `combatState === 'combat_only'`. All other combatState values ('any', 'out_of_combat', 'out_of_combat_only') indicate the ability is usable outside combat and should NOT be cancelled.

The new code should be:
```typescript
for (const cast of ctx.db.characterCast.by_character.filter(characterId)) {
  const abilityRows = [...ctx.db.abilityTemplate.by_key.filter(cast.abilityKey)];
  const ability = abilityRows[0];
  // Only cancel combat-only casts; friendly/utility casts persist through combat transitions
  if (!ability || ability.combatState === 'combat_only') {
    ctx.db.characterCast.id.delete(cast.id);
  }
}
```

Note: If the ability is not found in the template table (shouldn't happen, but defensive), cancel it as a safety measure. This handles edge cases with deleted/migrated abilities.

This is the ONLY location where combat state transitions cancel player casts. The `startCombatForSpawn` function (line 158) and `start_combat` reducer (line 791) do NOT cancel existing casts when entering combat, so no changes needed there.

The `tick_casts` reducer (line 1883) will naturally execute the preserved friendly casts when their cast timer expires, regardless of combat state -- it already handles both in-combat and out-of-combat execution paths.
  </action>
  <verify>
1. `cd C:/projects/uwr && npx tsc --noEmit --project spacetimedb/tsconfig.json` compiles without errors
2. Read the modified lines to confirm only `combat_only` casts are deleted and other combatState values are preserved
  </verify>
  <done>
When combat ends, only abilities with combatState 'combat_only' have their pending casts cancelled. Abilities with combatState 'any', 'out_of_combat', or 'out_of_combat_only' retain their CharacterCast rows and will complete normally via the tick_casts scheduled reducer.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles: `npx tsc --noEmit --project spacetimedb/tsconfig.json`
- The modified loop in clearCombatArtifacts filters by combatState before deleting
- No other files need changes (startCombatForSpawn already does not cancel casts on combat entry)
</verification>

<success_criteria>
- Friendly casts (heals, buffs, resurrects with combatState != 'combat_only') are NOT cancelled when combat ends
- Combat-only casts ARE still cancelled when combat ends
- No TypeScript compilation errors
</success_criteria>

<output>
After completion, create `.planning/quick/292-friendly-spell-casts-should-not-be-cance/292-SUMMARY.md`
</output>
