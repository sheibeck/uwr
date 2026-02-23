---
phase: quick-288
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/helpers/combat_rewards.ts
autonomous: true
requirements: [REFACTOR-288]

must_haves:
  truths:
    - "All existing combat behaviors are preserved exactly (zero functional changes)"
    - "The combat_loop reducer is decomposed into named sub-functions"
    - "Duplicated logic blocks are consolidated into shared helpers"
    - "The file compiles without errors and passes existing tests"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Refactored combat reducer with extracted helpers"
    - path: "spacetimedb/src/helpers/combat_rewards.ts"
      provides: "Extracted victory/defeat reward and event contribution helpers"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "spacetimedb/src/helpers/combat_rewards.ts"
      via: "import"
      pattern: "import.*combat_rewards"
---

<objective>
Refactor combat.ts (3512 lines) for cleaner, more maintainable code by extracting repeated patterns, consolidating duplicated logic, and decomposing the monolithic combat_loop reducer into named sub-functions.

Purpose: The combat_loop reducer alone is ~1550 lines. Multiple logic blocks are copy-pasted between victory/defeat/leash paths. This refactor extracts shared helpers and names inline logic for readability, with ZERO behavior changes.

Output: A significantly more readable combat.ts with duplicated code eliminated and the combat_loop broken into clearly named phases.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/helpers/combat.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract duplicated reward/event helpers into combat_rewards.ts</name>
  <files>spacetimedb/src/helpers/combat_rewards.ts, spacetimedb/src/reducers/combat.ts</files>
  <action>
Create `spacetimedb/src/helpers/combat_rewards.ts` and extract these duplicated patterns from combat.ts:

1. **awardEventContribution(ctx, character, activeEvent)** -- The "find or create EventContribution" block that appears identically at lines 2750-2766 (victory path) and lines 3426-3442 (defeat path). Both do the same: iterate `eventContribution.by_character.filter(character.id)`, find matching eventId, update or insert.

2. **advanceEventKillObjectives(ctx, activeEvent)** -- The "advance kill_count objective" block at lines 2789-2793 (victory) and lines 3445-3449 (defeat). Both iterate `eventObjective.by_event.filter(activeEvent.id)` and increment `currentCount` for `kill_count` type.

3. **getEventSpawnTemplateIds(ctx, enemies, enemySpawnIds, eventId)** -- The "determine which killed enemies were event-spawned" lookup at lines 2738-2748 (victory) and lines 3418-3421 (defeat). Both check `eventSpawnEnemy.by_spawn` to build a set of template IDs spawned by the event.

4. **buildFallenNamesSuffix(ctx, participants)** -- The "build fallen names" block at lines 2802-2806 (victory) and lines 3454-3461 (defeat). Both filter dead participants, get names, join with commas.

5. **handleDeathConsequences(ctx, deps, participants, combatId)** -- The "create corpses + apply XP penalty + log" pattern at lines 2979-3005 (victory) and lines 3477-3505 (defeat). Both iterate participants, create corpses for hp===0 characters, apply XP penalty, log messages.

6. **resetSpawnAfterCombat(ctx, spawn, enemies, ScheduleAt, ENEMY_RESPAWN_MICROS)** -- The spawn cleanup logic: if groupCount > 0, set available; else delete spawn + members and schedule respawn. This appears at lines 2703-2720 (victory) and lines 3366-3407 (defeat). The defeat path also re-inserts surviving enemies. Make the function handle both cases: accept an optional `reinsertSurvivors: boolean` flag.

Export all functions. Then update combat.ts to import and call these helpers, replacing the duplicated inline blocks. Each replacement must produce EXACTLY the same DB mutations in the same order.

CRITICAL: This is a pure refactor. Every function must accept the same `ctx`, `deps`, etc. parameters and perform identical operations. Do NOT change any logic, thresholds, orderings, or error handling.
  </action>
  <verify>
Run `cd C:/projects/uwr && npx tsc --noEmit --project spacetimedb/tsconfig.json` to confirm no type errors. Manually verify that every call site in combat.ts passes the same arguments that the inline code was using.
  </verify>
  <done>
All 6 duplicated patterns extracted to combat_rewards.ts. Combat.ts imports and calls them. TypeScript compiles cleanly. No behavior changes -- same DB operations in same order.
  </done>
</task>

<task type="auto">
  <name>Task 2: Decompose combat_loop into named sub-functions</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
The combat_loop reducer (line ~1966-3510) is a single function with ~1550 lines. Break it into clearly named inner functions that are called in sequence from the main combat_loop body. Each function encapsulates one "phase" of the combat loop:

1. **markNewlyDeadParticipants(ctx, combat, participants)** -- Lines ~1996-2009. Checks if active participants have hp===0 and marks them dead + clears effects + cleans aggro.

2. **resolveFleeAttempts(ctx, combat, participants, nowMicros)** -- Lines ~2012-2070. Processes fleeing status, rolls flee chance, marks fled or reverts to active, clears pets/aggro on success.

3. **handleLeashEviction(ctx, combat, enemies, participants, activeParticipants)** -- Lines ~2076-2161. When no active participants remain: reset enemies to full HP, restore spawns, log evade messages, clean up combat. Returns a boolean -- if true, combat_loop should `return` early.

4. **processPendingAdds(ctx, combat, enemies, participants, activeParticipants, nowMicros)** -- Lines ~2171-2203. Materializes pending add enemies that have arrived.

5. **processEnemyAbilities(ctx, combat, enemies, activeParticipants, nowMicros)** -- Lines ~2206-2437. The entire enemy AI ability selection and cast resolution block.

6. **processPlayerAutoAttacks(ctx, combat, enemies, activeParticipants, nowMicros)** -- Lines ~2439-2546. Player auto-attack resolution against enemies.

7. **processPetCombat(ctx, combat, livingEnemies, nowMicros)** -- Lines ~2553-2659. Pet auto-attacks and ability usage.

8. **handleVictory(ctx, combat, enemies, participants, activeParticipants, enemyName, nowMicros)** -- Lines ~2672-3114. All victory logic: quest progress, loot generation, XP, renown, spawn cleanup. Uses the new helpers from Task 1.

9. **handleDefeat(ctx, combat, enemies, participants, enemyName, nowMicros)** -- Lines ~3341-3506. All defeat logic: mark dead, reset spawns, event credit, corpses, XP penalty. Uses the new helpers from Task 1.

Each function should be defined as a `const` inside `registerCombatReducers` (same scope as the existing helpers like `resolveAttack`, `clearCombatArtifacts`). They capture `deps` and other closured variables from the parent scope.

The combat_loop reducer body then becomes a clear sequence:

```
markNewlyDeadParticipants(...)
resolveFleeAttempts(...)
if (handleLeashEviction(...)) return
processPendingAdds(...)
processEnemyAbilities(...)
processPlayerAutoAttacks(...)
processPetCombat(...)
// retarget dead enemy targets
if (livingEnemies.length === 0) { handleVictory(...); return }
// enemy auto-attacks
if (!stillActive) { handleDefeat(...); return }
scheduleCombatTick(...)
```

Also apply these smaller cleanups throughout the file:

A. **Extract resolveMessageTemplate()** -- The deeply nested ternary chain in resolveAttack (lines 608-637) that maps outcome to message template appears twice (personal + group). Extract to a small helper: `const resolveMessageTemplate = (outcome, messages) => messages[outcome] ?? messages.hit`.

B. **Extract clampBigInt(value, min, max)** helper to replace the 4+ inline IIFE clamp patterns (L2472-2475, L3254-3265, L3268-3276 etc.).

C. **Remove the duplicate `if (enemy.currentHp === 0n) continue;`** on line 2209 (exact duplicate of line 2208).

CRITICAL: Pure refactor. Each extracted function must perform EXACTLY the same operations. Do not reorder DB mutations, change any threshold values, or alter control flow. The `return` statements in handleLeashEviction, handleVictory, and handleDefeat must terminate the reducer execution properly (use return values or early returns as appropriate).
  </action>
  <verify>
Run `cd C:/projects/uwr && npx tsc --noEmit --project spacetimedb/tsconfig.json` to confirm compilation. Verify the combat_loop reducer body is now under ~80 lines (down from ~1550). Count total file lines -- should be similar or slightly smaller than original 3512 (structural overhead of function signatures is offset by removing duplication).
  </verify>
  <done>
The combat_loop reducer body reads as a clear sequence of named phases. Each phase function is independently readable. No behavior changes. File compiles cleanly. The duplicate hp check on line 2209 is removed. Message template resolution and value clamping use shared helpers.
  </done>
</task>

<task type="auto">
  <name>Task 3: Publish module and verify no regressions</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
Publish the refactored module to the local SpacetimeDB server to verify it compiles and bundles correctly:

```bash
spacetime publish uwr --project-path C:/projects/uwr/spacetimedb
```

If publish fails, fix the errors and retry. Common issues to watch for:
- Closure variables not accessible in extracted functions (solution: pass as parameters or keep in same closure scope)
- Import paths wrong for new combat_rewards.ts
- Missing re-exports or type mismatches

After successful publish, check logs for any immediate errors:
```bash
spacetime logs uwr --num-lines 20
```

Do NOT publish to maincloud per project rules.
  </action>
  <verify>
`spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` succeeds. `spacetime logs uwr --num-lines 20` shows no new errors related to combat reducers.
  </verify>
  <done>
Module publishes successfully to local SpacetimeDB. No errors in logs. Refactored combat.ts is fully functional.
  </done>
</task>

</tasks>

<verification>
- TypeScript compilation: `npx tsc --noEmit --project spacetimedb/tsconfig.json` passes
- Module publish: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` succeeds
- No behavior changes: All extracted functions perform identical DB mutations in identical order
- combat_loop reducer body is a readable sequence of named phases (~80 lines vs ~1550)
- All duplicated blocks (event contribution, spawn reset, death consequences, fallen names) consolidated
</verification>

<success_criteria>
1. combat.ts compiles and the module publishes to local SpacetimeDB without errors
2. The combat_loop reducer body is under 100 lines (delegating to named sub-functions)
3. At least 5 duplicated logic blocks are consolidated into shared helpers
4. Zero behavior changes -- every DB mutation, threshold, ordering, and control flow path is preserved exactly
5. New combat_rewards.ts helper file exists with exported shared functions
</success_criteria>

<output>
After completion, create `.planning/quick/288-refactor-combat-ts-for-cleaner-maintaina/288-SUMMARY.md`
</output>
