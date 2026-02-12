---
phase: quick
plan: 5
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useHotbar.ts
autonomous: true

must_haves:
  truths:
    - "Nature's Mark does not show cooldown when clicked while in combat"
    - "Nature's Mark still works normally outside combat (gathers resources, triggers 120s cooldown)"
    - "Other utility abilities (cleric_sanctify, paladin_lay_on_hands, etc.) still usable in combat"
  artifacts:
    - path: "src/composables/useHotbar.ts"
      provides: "Client-side out-of-combat guard for Nature's Mark"
      contains: "druid_natures_mark"
  key_links:
    - from: "src/composables/useHotbar.ts"
      to: "spacetimedb/src/index.ts"
      via: "OUT_OF_COMBAT_ONLY_KEYS mirrors server-side combat check in executeAbilityAction"
      pattern: "druid_natures_mark"
---

<objective>
Fix Nature's Mark false cooldown when used in combat. The ability is out-of-combat only (server throws SenderError), but the client-side cooldown prediction runs before the server rejects it, causing a misleading 120-second cooldown display.

Purpose: Prevent confusing UX where Nature's Mark appears on a 2-minute cooldown despite never executing.
Output: Updated useHotbar.ts with client-side guard preventing prediction + reducer call for out-of-combat-only abilities when in combat.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/composables/useHotbar.ts
@spacetimedb/src/index.ts (lines 2607-2610: Nature's Mark combat check)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add out-of-combat-only ability guard to onHotbarClick</name>
  <files>src/composables/useHotbar.ts</files>
  <action>
Add a constant set for abilities that can only be used outside combat, mirroring the server-side check in executeAbilityAction (index.ts line 2608-2609):

```typescript
const OUT_OF_COMBAT_ONLY_KEYS = new Set([
  'druid_natures_mark',
]);
```

Place this near the existing PET_SUMMON_KEYS constant (line 45-50).

In onHotbarClick (line 277), add a guard AFTER the pet summon check (line 286) and BEFORE runPrediction (line 287):

```typescript
// Out-of-combat-only abilities cannot be used in combat — skip prediction + reducer call
if (activeCombat.value && OUT_OF_COMBAT_ONLY_KEYS.has(slot.abilityKey)) return;
```

This follows the exact same pattern as the pet summon guard on line 286, preventing both runPrediction (which sets the false 120s local cooldown) and the useAbility reducer call (which would just fail server-side anyway).

Do NOT add a client-side toast/message — the guard silently prevents the false cooldown. If someone bypasses the client guard (dev tools), the server error message "Cannot use while in combat" still comes through via the catch block.
  </action>
  <verify>
1. Read useHotbar.ts and confirm OUT_OF_COMBAT_ONLY_KEYS exists with 'druid_natures_mark'
2. Confirm the guard `if (activeCombat.value && OUT_OF_COMBAT_ONLY_KEYS.has(slot.abilityKey)) return;` is in onHotbarClick before runPrediction
3. Confirm existing PET_SUMMON_KEYS guard is unchanged
4. Run `npx vue-tsc --noEmit --project C:/projects/uwr/tsconfig.app.json` to verify no type errors
  </verify>
  <done>
Nature's Mark click while in combat is silently blocked on client, preventing false 120s cooldown prediction. Out-of-combat usage unchanged. Other utility abilities unaffected.
  </done>
</task>

</tasks>

<verification>
1. OUT_OF_COMBAT_ONLY_KEYS constant exists near PET_SUMMON_KEYS
2. Guard placed correctly in onHotbarClick flow (after pet summon check, before runPrediction)
3. No type errors from vue-tsc
4. Pattern matches the proven pet summon guard from Quick Task 2
</verification>

<success_criteria>
- Nature's Mark no longer shows false 120s cooldown when clicked in combat
- Nature's Mark still functions correctly outside combat (gathers resources, applies real cooldown)
- No regression to other utility abilities (they should still work in combat)
- No type errors introduced
</success_criteria>

<output>
After completion, create `.planning/quick/5-fix-nature-s-mark-cooldown-prevent-coold/5-SUMMARY.md`
</output>
