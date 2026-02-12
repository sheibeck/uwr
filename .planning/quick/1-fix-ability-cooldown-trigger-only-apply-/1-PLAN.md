---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/items.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true
must_haves:
  truths:
    - "Cooldown is only applied when the ability actually produces its intended effect"
    - "Abilities denied due to combat state (dead, fled, combat ended) do not trigger cooldown"
    - "Abilities that execute successfully still apply cooldown as before"
  artifacts:
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "use_ability reducer with guarded cooldown on instant-cast path"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "tick_casts reducer with combat-state guard before ability execution"
  key_links:
    - from: "spacetimedb/src/reducers/items.ts"
      to: "executeAbilityAction"
      via: "return value check before cooldown insert"
      pattern: "executeAbilityAction.*cooldown"
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "combatParticipant status check"
      via: "guard before executeAbilityAction in tick_casts"
      pattern: "participant.*status.*active"
---

<objective>
Fix ability cooldown trigger so cooldowns are only applied when the ability actually executes its effect, not when denied due to combat state (character dead, combat ended, participant not active).

Purpose: Currently, if an ability fires but produces no meaningful effect (e.g., character died during cast, combat ended, participant status is not 'active'), the cooldown is still applied, punishing the player for a failed ability. This creates a frustrating experience where the player loses both their cast time AND their cooldown for nothing.

Output: Patched `use_ability` reducer and `tick_casts` reducer with proper combat-state guards.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/items.ts (use_ability reducer, lines 356-496)
@spacetimedb/src/reducers/combat.ts (tick_casts reducer, lines 1323-1375)
@spacetimedb/src/index.ts (executeAbilityAction at line 2923, executeAbility at line 1814)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Guard cooldown application in tick_casts and use_ability</name>
  <files>spacetimedb/src/reducers/combat.ts, spacetimedb/src/reducers/items.ts</files>
  <action>
Two locations need fixes:

**1. `tick_casts` reducer in `spacetimedb/src/reducers/combat.ts` (~line 1323):**

Before calling `executeAbilityAction`, add a combat-state guard. After finding the character (line 1327), check:
- Find the active combat for this character using `activeCombatIdForCharacter(ctx, character.id)` (already available via deps)
- If in combat, find the participant row via `ctx.db.combatParticipant.by_combat.filter(combatId)` and check `participant.status === 'active'`
- If the participant exists but status is NOT 'active' (e.g., 'dead', 'fled'), delete the cast row and continue WITHOUT executing the ability or applying cooldown
- If NOT in combat, the ability can still proceed (out-of-combat abilities like heals are valid)
- Also check: if character.hp is 0n and there IS an active combat, skip execution (dead characters should not cast)

The guard should be inserted between the character-not-found check (line 1328-1330) and the try block (line 1332). Pseudocode:
```typescript
const castCombatId = activeCombatIdForCharacter(ctx, character.id);
if (castCombatId) {
  const participant = [...ctx.db.combatParticipant.by_combat.filter(castCombatId)].find(
    (row) => row.characterId === character.id
  );
  if (participant && participant.status !== 'active') {
    ctx.db.characterCast.id.delete(cast.id);
    continue;
  }
}
```

Note: `activeCombatIdForCharacter` is already available in the deps object passed to `registerCombatReducers`. It is destructured at the top of the function but verify it is in scope within the `tick_casts` reducer.

**2. `use_ability` reducer in `spacetimedb/src/reducers/items.ts` (~line 441):**

For the instant-cast path (lines 441-495), the `executeAbilityAction` return value is currently IGNORED. It returns `false` when the character can't be found. Change the instant-cast path to check the return value:
```typescript
const executed = executeAbilityAction(ctx, {
  actorType: 'character',
  actorId: character.id,
  abilityKey,
  targetCharacterId: args.targetCharacterId,
});
if (!executed) {
  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability', 'Ability had no effect.');
  return;
}
// ... cooldown and event logic stays the same
```

Move the `const cooldown = ...` and cooldown insertion block (lines 448-463) to ONLY execute when `executed` is truthy. The existing try/catch already handles thrown SenderErrors correctly (cooldown is not applied on catch), so this change only addresses the silent `return false` case.

**Important:** Do NOT change the behavior for abilities that succeed. The cooldown logic for successful abilities must remain identical. Only change what happens when the ability is denied/has no effect.
  </action>
  <verify>
1. `cd C:\projects\uwr && npx tsc --noEmit --project spacetimedb/tsconfig.json` compiles without errors (or use whatever build/check command the project uses)
2. Read both modified files and confirm:
   - tick_casts: combat state guard exists before executeAbilityAction call
   - use_ability: executeAbilityAction return value is checked before cooldown application
3. Confirm cooldown insertion code is unchanged for the success path
  </verify>
  <done>
- tick_casts skips ability execution and cooldown when participant status is not 'active' in combat
- use_ability instant-cast path checks executeAbilityAction return value before applying cooldown
- Successful ability executions still apply cooldown exactly as before
- No TypeScript compilation errors
  </done>
</task>

</tasks>

<verification>
- Both files compile without TypeScript errors
- The cooldown-application code paths are gated behind actual ability execution success
- No behavioral change for the happy path (ability succeeds -> cooldown applied)
- Dead/fled characters in tick_casts get their cast deleted without cooldown or resource cost from executeAbility
</verification>

<success_criteria>
Cooldowns are only set when an ability actually fires and produces its effect. Characters who die during a cast, or whose combat ends during a cast, do not get penalized with a cooldown for an ability that never landed.
</success_criteria>

<output>
After completion, create `.planning/quick/1-fix-ability-cooldown-trigger-only-apply-/1-SUMMARY.md`
</output>
