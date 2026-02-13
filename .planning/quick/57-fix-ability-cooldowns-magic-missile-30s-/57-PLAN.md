---
phase: quick-57
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/data/ability_catalog.ts
  - src/composables/useHotbar.ts
autonomous: true
must_haves:
  truths:
    - "Wizard Magic Missile shows at most a 1-second GCD after casting, not 30 seconds"
    - "Druid Thorn Lash cooldown expires and stays at 0 — does not immediately refill"
    - "All other ability cooldowns continue working correctly"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Expired AbilityCooldown row cleanup in clearCombatArtifacts"
    - path: "src/composables/useHotbar.ts"
      provides: "Robust client-side cooldown display that handles server/client timing skew"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "AbilityCooldown table"
      via: "clearCombatArtifacts cleanup"
      pattern: "abilityCooldown.*delete"
    - from: "src/composables/useHotbar.ts"
      to: "cooldownByAbility computed"
      via: "server cooldown suppression logic"
      pattern: "suppressServer|serverRemaining"
---

<objective>
Fix two ability cooldown bugs:
1. Wizard Magic Missile shows a ~30-second cooldown after use (should be 1s GCD)
2. Druid Thorn Lash cooldown expires then immediately refills, making it unusable

Purpose: Combat usability — these are core damage abilities that players spam frequently.
Output: Both abilities display correct cooldowns; stale cooldown rows are cleaned up.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/data/ability_catalog.ts
@spacetimedb/src/index.ts (abilityCooldownMicros function ~line 1697, ensureAbilityTemplates ~line 4290, clearCombatArtifacts via combat.ts)
@spacetimedb/src/reducers/combat.ts (clearCombatArtifacts ~line 266, tick_cast_timer ~line 1350, combat_loop ~line 1414)
@spacetimedb/src/reducers/items.ts (use_ability reducer ~line 428)
@src/composables/useHotbar.ts (cooldown display logic, runPrediction, suppressServerAsDuplicate)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Diagnose and fix server-side cooldown issues</name>
  <files>spacetimedb/src/reducers/combat.ts, spacetimedb/src/index.ts, spacetimedb/src/data/ability_catalog.ts</files>
  <action>
Diagnose and fix three server-side cooldown issues:

**A) Clean up expired AbilityCooldown rows when combat ends:**

In `clearCombatArtifacts` (combat.ts ~line 266), after the existing cleanup of characterCast rows for each participant (line 287-289), add cleanup of expired AbilityCooldown rows:

```typescript
// Clean up expired ability cooldowns for combat participants
for (const characterId of participantIds) {
  // ... existing characterCast cleanup ...

  // Remove expired cooldown rows to prevent stale data
  for (const cd of ctx.db.abilityCooldown.by_character.filter(characterId)) {
    if (cd.readyAtMicros <= ctx.timestamp.microsSinceUnixEpoch) {
      ctx.db.abilityCooldown.id.delete(cd.id);
    }
  }
}
```

This prevents stale AbilityCooldown rows from accumulating and potentially confusing the client. Rows that are still active (readyAtMicros in the future) are preserved.

**B) Also clean up expired cooldowns in the regen_health tick:**

In the `regen_health` reducer (combat.ts ~line 1085), add periodic cleanup of expired AbilityCooldown rows for characters NOT in combat. This is a safety net for cooldown rows that persist after combat. Add after the regen logic for each character:

```typescript
// Clean up expired cooldown rows for out-of-combat characters
if (!inCombat) {
  for (const cd of ctx.db.abilityCooldown.by_character.filter(character.id)) {
    if (cd.readyAtMicros <= ctx.timestamp.microsSinceUnixEpoch) {
      ctx.db.abilityCooldown.id.delete(cd.id);
    }
  }
}
```

**C) Verify GLOBAL_COOLDOWN_MICROS is appropriate:**

In `ability_catalog.ts`, `GLOBAL_COOLDOWN_MICROS = 1_000_000n` (1 second). This is the minimum cooldown for ANY ability including Magic Missile (which has `cooldownSeconds: 0n`). Verify this is correct — do NOT change it. The 30s bug is NOT from this value.

**Root cause hypothesis for 30s Magic Missile bug:** After combat, the AbilityCooldown row persists with a `readyAtMicros` from the last combat tick. If the server's timestamp in the combat tick was ahead of the client's perceived time (maincloud latency), the client sees a future readyAt. The cleanup in (A) above fixes this by removing expired rows at combat end.
  </action>
  <verify>
1. `cd spacetimedb && npx tsc --noEmit` — TypeScript compiles without errors
2. Grep for `abilityCooldown.*delete` in combat.ts to confirm cleanup was added in both locations
3. Verify GLOBAL_COOLDOWN_MICROS is still 1_000_000n in ability_catalog.ts
  </verify>
  <done>
clearCombatArtifacts deletes expired AbilityCooldown rows for all combat participants. regen_health deletes expired AbilityCooldown rows for out-of-combat characters. No stale cooldown rows persist after combat ends.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix client-side cooldown display robustness</name>
  <files>src/composables/useHotbar.ts</files>
  <action>
Fix two client-side issues in `useHotbar.ts` that cause incorrect cooldown display:

**A) Fix the "recurring cooldown" bug (Thorn Lash):**

The current `suppressServerAsDuplicate` logic (line 138-141) fails when:
1. Client local prediction expires (localRemaining = 0)
2. Server row still has readyAtMicros slightly in the future (server processed cast completion later)
3. Server cooldown "replaces" the expired local prediction, making it look like the cooldown restarted

Fix: Expand the suppression logic so that when a `predictedCooldownReadyAt` entry exists for an ability, the server value is ALWAYS suppressed (the prediction was correct; any server value is just the delayed confirmation). Only fall through to server when no prediction was ever made.

Replace the current cooldown remaining computation (lines ~128-165 inside hotbarDisplay computed) with:

```typescript
const readyAt = assignment.abilityKey
  ? cooldownByAbility.value.get(assignment.abilityKey)
  : undefined;
const serverReadyAt = readyAt ? Number(readyAt) : 0;
const localReadyAt = assignment.abilityKey
  ? localCooldowns.value.get(assignment.abilityKey) ?? 0
  : 0;
const predictedReadyAt = assignment.abilityKey
  ? predictedCooldownReadyAt.value.get(assignment.abilityKey) ?? 0
  : 0;

// If we made a local prediction for this ability, trust it over the server
// until the prediction entry is fully cleaned up (10s after expiry).
// This prevents the "cooldown refills" visual glitch from server latency.
const hasPrediction = predictedReadyAt > 0;
const serverRemaining = hasPrediction ? 0 : Math.max(serverReadyAt - nowMicros.value, 0);
const localRemaining = localReadyAt ? localReadyAt - nowMicros.value : 0;

const isLocallyCastingThisAbility = Boolean(
  localCast.value &&
    assignment.abilityKey &&
    localCast.value.abilityKey === assignment.abilityKey &&
    nowMicros.value < localCast.value.startMicros + localCast.value.durationMicros
);
const effectiveLocalRemaining = isLocallyCastingThisAbility ? 0 : localRemaining;
const remainingMicros =
  effectiveLocalRemaining > 0
    ? effectiveLocalRemaining
    : Math.max(serverRemaining, 0);
```

The key change: when `predictedReadyAt > 0` (we predicted this cooldown), we suppress the server value entirely. The prediction entry persists for 10 seconds after expiry (line 323-326), so this window covers any server latency.

**B) Clamp cooldown display to ability's configured cooldown (safety net):**

The existing clamping at lines 162-165 already clamps to `configuredCooldownSeconds`:
```typescript
const cooldownRemaining = configuredCooldownSeconds > 0
  ? Math.min(cooldownRemainingRaw, configuredCooldownSeconds)
  : cooldownRemainingRaw;
```

For abilities with `cooldownSeconds: 0n` (like Magic Missile), this falls through to `cooldownRemainingRaw` unclamped. Add a fallback clamp to the GCD (1 second) for abilities with no configured cooldown:

```typescript
const GCD_SECONDS = 1;
const cooldownRemaining =
  configuredCooldownSeconds > 0
    ? Math.min(cooldownRemainingRaw, configuredCooldownSeconds)
    : Math.min(cooldownRemainingRaw, GCD_SECONDS);
```

This ensures that even if the server sends a wonky readyAtMicros for a 0-cooldown ability, the UI never shows more than 1 second of cooldown. This directly caps the Magic Missile bug.

**C) Remove the old suppressServerAsDuplicate variable and its condition** since the new `hasPrediction` check replaces it cleanly.
  </action>
  <verify>
1. `cd client && npx tsc --noEmit` (if client has its own tsconfig) OR verify no syntax/type errors in useHotbar.ts
2. Grep useHotbar.ts for `GCD_SECONDS` to confirm the safety clamp was added
3. Grep useHotbar.ts for `hasPrediction` to confirm the suppression logic was updated
4. Verify `suppressServerAsDuplicate` variable is removed
  </verify>
  <done>
Client cooldown display: (1) abilities with local predictions never show server-sourced "refill" artifacts, (2) zero-cooldown abilities like Magic Missile are clamped to 1s GCD maximum display. Both user-reported bugs are addressed.
  </done>
</task>

<task type="auto">
  <name>Task 3: Publish and verify</name>
  <files></files>
  <action>
1. Publish the updated module to the server:
   ```
   spacetime publish uwr --project-path spacetimedb
   ```
   If the default server is maincloud, publish there. Do NOT use --clear-database.

2. Generate updated client bindings (in case AbilityCooldown table structure changed — it shouldn't have, but regenerate for safety):
   ```
   spacetime generate --lang typescript --out-dir client/src/module_bindings --project-path spacetimedb
   spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb
   ```

3. Run the sync to clean up any stale ability template data:
   After connecting, call `sync_ability_templates` from the client or CLI to ensure AbilityTemplate rows have current cooldownSeconds values.

4. Verify server logs for any errors:
   ```
   spacetime logs uwr
   ```
  </action>
  <verify>
1. `spacetime publish` succeeds without errors
2. `spacetime logs uwr` shows no errors related to cooldowns
3. Client builds without errors after binding regeneration
  </verify>
  <done>
Module published, bindings regenerated, server running cleanly. Magic Missile should show <=1s cooldown, Thorn Lash should not exhibit recurring cooldown behavior.
  </done>
</task>

</tasks>

<verification>
1. Create a Wizard character, use Magic Missile — cooldown should show 1 second or less, NOT 30 seconds
2. Create a Druid character, enter combat, use Thorn Lash — 3-second cooldown should count down to 0 and STAY at 0
3. Use Thorn Lash again after cooldown expires — should cast normally, new 3-second cooldown
4. End combat — no lingering phantom cooldowns on any ability
5. Other abilities (e.g., Cleric Smite with 4s CD, Warrior Slam with 6s CD) still show correct cooldowns
</verification>

<success_criteria>
- Magic Missile never shows a cooldown longer than 1 second
- Thorn Lash cooldown counts down to 0 and does not refill unless the ability is used again
- No regressions on other ability cooldowns
- No stale AbilityCooldown rows accumulate in the database after combat
</success_criteria>

<output>
After completion, create `.planning/quick/57-fix-ability-cooldowns-magic-missile-30s-/57-SUMMARY.md`
</output>
