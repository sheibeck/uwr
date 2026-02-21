---
phase: quick-230
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/reducers/items.ts
autonomous: true
requirements: [QUICK-230]

must_haves:
  truths:
    - "AbilityCooldown schema has startedAtMicros + durationMicros instead of readyAtMicros"
    - "All server-side cooldown writes use the new fields"
    - "All server-side cooldown expiry checks use startedAtMicros + durationMicros"
    - "Client bindings are regenerated to match new schema"
  artifacts:
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "AbilityCooldown table with startedAtMicros + durationMicros"
      contains: "startedAtMicros"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Updated cooldown write/check logic"
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "Updated cooldown write/check logic"
    - path: "src/module_bindings/"
      provides: "Regenerated client bindings"
  key_links:
    - from: "spacetimedb/src/schema/tables.ts"
      to: "spacetimedb/src/reducers/combat.ts"
      via: "AbilityCooldown row shape"
      pattern: "startedAtMicros.*durationMicros"
    - from: "spacetimedb/src/schema/tables.ts"
      to: "spacetimedb/src/reducers/items.ts"
      via: "AbilityCooldown row shape"
      pattern: "startedAtMicros.*durationMicros"
---

<objective>
Change the AbilityCooldown table schema from storing an absolute future timestamp (readyAtMicros) to storing start time + duration (startedAtMicros + durationMicros), then update all server usages and regenerate client bindings.

Purpose: Eliminate server/client clock skew problems. Storing duration relative to a recorded start time lets the client compute remaining cooldown using its own clock without depending on server clock synchronization.
Output: Updated schema, updated reducers, published local module, regenerated bindings.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update AbilityCooldown schema and all server usages</name>
  <files>
    spacetimedb/src/schema/tables.ts
    spacetimedb/src/reducers/combat.ts
    spacetimedb/src/reducers/items.ts
  </files>
  <action>
    **tables.ts** — Find the AbilityCooldown table definition (around line 617). It currently has:
    ```
    abilityKey: t.string(),
    readyAtMicros: t.u64(),
    ```
    Replace `readyAtMicros: t.u64()` with two fields:
    ```
    abilityKey: t.string(),
    startedAtMicros: t.u64(),
    durationMicros: t.u64(),
    ```
    Do NOT touch ItemCooldown, CombatEnemyCooldown, or any other table — only AbilityCooldown.

    **combat.ts** — Three locations:

    1. Lines ~350-354 (cleanup on combat end): Change the expiry check:
       - Old: `cd.readyAtMicros <= ctx.timestamp.microsSinceUnixEpoch`
       - New: `cd.startedAtMicros + cd.durationMicros <= ctx.timestamp.microsSinceUnixEpoch`

    2. Lines ~1331-1335 (cleanup in loop tick): Same change as above.

    3. Lines ~1732-1744 (write cooldown after cast): Two sub-cases — update and insert:
       - Old update: `readyAtMicros: nowMicros + cooldown`
       - New update: `startedAtMicros: nowMicros, durationMicros: cooldown`
       - Old insert: `readyAtMicros: nowMicros + cooldown`
       - New insert: `startedAtMicros: nowMicros, durationMicros: cooldown`
       Note: The spread `...existingCooldown` in the update will now spread old fields — make sure the new fields override correctly by listing them after the spread.

    **items.ts** — Three locations:

    1. Line ~652 (on-cooldown check):
       - Old: `existingCooldown.readyAtMicros > nowMicros`
       - New: `existingCooldown.startedAtMicros + existingCooldown.durationMicros > nowMicros`

    2. Lines ~754-765 (perk cooldown write):
       - Old update: `readyAtMicros: nowMicros + perkCooldownMicros`
       - New update: `startedAtMicros: nowMicros, durationMicros: perkCooldownMicros`
       - Old insert: `readyAtMicros: nowMicros + perkCooldownMicros`
       - New insert: `startedAtMicros: nowMicros, durationMicros: perkCooldownMicros`

    3. Lines ~813-826 (non-combat ability write):
       - Old update: `readyAtMicros: nowMicros + cooldown`
       - New update: `startedAtMicros: nowMicros, durationMicros: cooldown`
       - Old insert: `readyAtMicros: nowMicros + cooldown`
       - New insert: `startedAtMicros: nowMicros, durationMicros: cooldown`

    After all edits, verify no remaining `readyAtMicros` references exist in AbilityCooldown contexts in these files (a grep for `readyAtMicros` across the spacetimedb/src dir should only return ItemCooldown and CombatEnemyCooldown usages).
  </action>
  <verify>
    grep -n "readyAtMicros" C:/projects/uwr/spacetimedb/src/schema/tables.ts
    — should NOT contain readyAtMicros for AbilityCooldown (lines around 617-629)
    — should still contain readyAtMicros for ItemCooldown and CombatEnemyCooldown

    grep -n "readyAtMicros" C:/projects/uwr/spacetimedb/src/reducers/combat.ts
    — should return 0 matches for AbilityCooldown contexts (lines 348-354, 1329-1335, 1732-1744)
    — lines ~2026 and ~2051-2052 reference CombatEnemyCooldown readyAtMicros — those should remain untouched

    grep -n "readyAtMicros" C:/projects/uwr/spacetimedb/src/reducers/items.ts
    — lines ~652, 756, 763, 816, 823 should be gone
    — lines ~1376-1398 reference ItemCooldown readyAtMicros — those should remain untouched
  </verify>
  <done>
    AbilityCooldown schema has startedAtMicros and durationMicros fields. All three combat.ts locations and all three items.ts locations use the new field names. CombatEnemyCooldown and ItemCooldown are untouched.
  </done>
</task>

<task type="auto">
  <name>Task 2: Publish local module and regenerate client bindings</name>
  <files>
    src/module_bindings/
  </files>
  <action>
    Publish the updated module to the local SpacetimeDB instance (NOT maincloud — per project rules):
    ```
    spacetime publish uwr --project-path C:/projects/uwr/spacetimedb
    ```

    If publish fails due to compile errors, fix the TypeScript errors in the schema/reducers before proceeding. Common issue: spreading `...existingCooldown` in update calls will include the old `readyAtMicros` field from the existing row type — the generated types will enforce the new shape, so the spread pattern is fine as long as the new fields are listed after it to override.

    After successful publish, regenerate client bindings:
    ```
    spacetime generate --lang typescript --out-dir C:/projects/uwr/src/module_bindings --project-path C:/projects/uwr/spacetimedb
    ```

    Do NOT edit any generated files in src/module_bindings/ — they are fully regenerated.
  </action>
  <verify>
    grep -n "startedAtMicros\|durationMicros" C:/projects/uwr/src/module_bindings/ability_cooldown_row.ts
    — should show both fields in the generated row type

    grep -n "readyAtMicros" C:/projects/uwr/src/module_bindings/ability_cooldown_row.ts
    — should return 0 matches
  </verify>
  <done>
    Module published successfully to local. Generated bindings in src/module_bindings/ reflect AbilityCooldownRow with startedAtMicros (bigint) and durationMicros (bigint) fields, no readyAtMicros.
  </done>
</task>

<task type="auto">
  <name>Task 3: Update useHotbar.ts and App.vue to use clock-independent cooldown display</name>
  <files>
    src/composables/useHotbar.ts
    src/App.vue
  </files>
  <action>
    **useHotbar.ts** — Replace the clock-skew suppression system with a receivedAt tracking approach. Make these changes:

    **Remove:**
    - `const COOLDOWN_SKEW_SUPPRESS_MICROS = 30_000_000;` constant
    - `const predictedCooldownReadyAt = ref(new Map<string, number>());` ref

    **Add after `localCooldowns` ref declaration:**
    ```typescript
    const cooldownReceivedAt = ref(new Map<string, number>());
    ```

    **Update `cooldownByAbility` computed** (currently returns `Map<string, bigint>`, change to return `Map<string, { durationMicros: number; receivedAt: number }>`):
    ```typescript
    const cooldownByAbility = computed(() => {
      if (!selectedCharacter.value) return new Map<string, { durationMicros: number; receivedAt: number }>();
      const map = new Map<string, { durationMicros: number; receivedAt: number }>();
      for (const row of abilityCooldowns.value) {
        if (row.characterId.toString() !== selectedCharacter.value.id.toString()) continue;
        const key = row.abilityKey;
        const receivedAt = cooldownReceivedAt.value.get(key) ?? Date.now() * 1000;
        map.set(key, { durationMicros: Number(row.durationMicros), receivedAt });
      }
      return map;
    });
    ```

    **Add a watch on `abilityCooldowns`** (insert before `hotbarDisplay` computed or after `cooldownByAbility`):
    ```typescript
    watch(
      () => abilityCooldowns.value,
      (rows) => {
        const charId = selectedCharacter.value?.id;
        if (!charId) return;
        const activeKeys = new Set<string>();
        for (const row of rows) {
          if (row.characterId.toString() !== charId.toString()) continue;
          const key = row.abilityKey;
          activeKeys.add(key);
          if (!cooldownReceivedAt.value.has(key)) {
            cooldownReceivedAt.value.set(key, Date.now() * 1000);
          }
          // Server confirmed this cooldown — remove local prediction if it exists
          if (localCooldowns.value.has(key)) {
            localCooldowns.value.delete(key);
          }
        }
        // Clean up receivedAt entries for rows that no longer exist
        for (const key of cooldownReceivedAt.value.keys()) {
          if (!activeKeys.has(key)) {
            cooldownReceivedAt.value.delete(key);
          }
        }
      },
      { deep: true }
    );
    ```

    **Update `hotbarDisplay` computed** — replace the readyAt / hasPrediction / predictedReadyAt logic:

    Old block (lines ~140-168):
    ```typescript
    const readyAt = assignment.abilityKey
      ? cooldownByAbility.value.get(assignment.abilityKey)
      : undefined;
    const serverReadyAt = readyAt ? Number(readyAt) : 0;
    const localReadyAt = ...
    const predictedReadyAt = ...
    const hasPrediction = predictedReadyAt > 0;
    const serverRemaining = hasPrediction ? 0 : Math.max(serverReadyAt - nowMicros.value, 0);
    const localRemaining = localReadyAt ? localReadyAt - nowMicros.value : 0;
    const isLocallyCastingThisAbility = ...
    const effectiveLocalRemaining = isLocallyCastingThisAbility ? 0 : localRemaining;
    const remainingMicros = effectiveLocalRemaining > 0 ? effectiveLocalRemaining : Math.max(serverRemaining, 0);
    ```

    New block:
    ```typescript
    const localReadyAt = assignment.abilityKey
      ? localCooldowns.value.get(assignment.abilityKey) ?? 0
      : 0;
    const serverCd = assignment.abilityKey
      ? cooldownByAbility.value.get(assignment.abilityKey)
      : undefined;
    const localRemaining = localReadyAt ? localReadyAt - nowMicros.value : 0;
    const serverRemaining = serverCd
      ? Math.max(0, serverCd.durationMicros - (nowMicros.value - serverCd.receivedAt))
      : 0;
    const isLocallyCastingThisAbility = Boolean(
      localCast.value &&
        assignment.abilityKey &&
        localCast.value.abilityKey === assignment.abilityKey &&
        nowMicros.value < localCast.value.startMicros + localCast.value.durationMicros
    );
    const effectiveLocalRemaining = isLocallyCastingThisAbility ? 0 : localRemaining;
    const remainingMicros =
      effectiveLocalRemaining > 0 ? effectiveLocalRemaining : serverRemaining;
    ```

    **Update `runPrediction`** — remove `predictedCooldownReadyAt.value.set(...)`:
    Old:
    ```typescript
    localCooldowns.value.set(abilityKey, readyAt);
    predictedCooldownReadyAt.value.set(abilityKey, readyAt);
    ```
    New:
    ```typescript
    localCooldowns.value.set(abilityKey, readyAt);
    ```

    **Update `nowMicros` watcher** — remove the predictedCooldownReadyAt loop:
    Old:
    ```typescript
    for (const [key, readyAt] of predictedCooldownReadyAt.value.entries()) {
      if (now >= readyAt + COOLDOWN_SKEW_SUPPRESS_MICROS) {
        predictedCooldownReadyAt.value.delete(key);
      }
    }
    ```
    New: delete that entire for loop (keep the localCooldowns loop and localCast logic).

    **Update the failure-check watcher** (the 500ms check) — remove `predictedCooldownReadyAt.value.delete(key)` and update the server active-key detection to use new schema:
    Old `serverCooldownKeys` filter:
    ```typescript
    serverCooldowns
      .filter(cd => cd.characterId === charId && Number(cd.readyAtMicros) > now)
      .map(cd => cd.abilityKey)
    ```
    New (cooldown is active while startedAt + duration > now):
    ```typescript
    serverCooldowns
      .filter(cd => {
        if (cd.characterId.toString() !== charId.toString()) return false;
        const receivedAt = cooldownReceivedAt.value.get(cd.abilityKey) ?? (Date.now() * 1000);
        return Number(cd.durationMicros) - (now - receivedAt) > 0;
      })
      .map(cd => cd.abilityKey)
    ```
    Also remove `predictedCooldownReadyAt.value.delete(key)` from the inner loop.

    **Update character change watcher** — add `cooldownReceivedAt.value.clear()`:
    ```typescript
    watch(
      () => selectedCharacter.value?.id,
      () => {
        localCast.value = null;
        localCooldowns.value.clear();
        cooldownReceivedAt.value.clear();
        hotbarPulseKey.value = null;
      }
    );
    ```

    ---

    **App.vue** — Two changes:

    1. Remove `const serverClockOffset = ref(0);`

    2. Remove the watch block for `player.value?.lastSeenAt` (the block that computes serverClockOffset, approximately lines ~736-749).

    3. In the `uiTimer` setInterval callback, change:
       - Old: `nowMicros.value = Date.now() * 1000 + serverClockOffset.value;`
       - New: `nowMicros.value = Date.now() * 1000;`

    After the App.vue edits, verify `serverClockOffset` has no remaining references with:
    `grep -n "serverClockOffset" C:/projects/uwr/src/App.vue` — should return 0 matches.
  </action>
  <verify>
    # No remaining old refs
    grep -n "predictedCooldownReadyAt\|COOLDOWN_SKEW_SUPPRESS\|serverClockOffset\|readyAtMicros" C:/projects/uwr/src/composables/useHotbar.ts
    grep -n "serverClockOffset\|lastSeenAt" C:/projects/uwr/src/App.vue

    # New refs present
    grep -n "cooldownReceivedAt\|durationMicros\|startedAtMicros" C:/projects/uwr/src/composables/useHotbar.ts

    # TypeScript compiles (run from project root)
    npx vue-tsc --noEmit
  </verify>
  <done>
    useHotbar.ts uses cooldownReceivedAt to track when each server cooldown row first arrived, computes remaining as durationMicros - (now - receivedAt). No predictedCooldownReadyAt or COOLDOWN_SKEW_SUPPRESS_MICROS remain. App.vue nowMicros timer uses Date.now() * 1000 directly with no serverClockOffset. TypeScript compiles without errors.
  </done>
</task>

</tasks>

<verification>
1. `grep -rn "readyAtMicros" C:/projects/uwr/spacetimedb/src/` — should only match ItemCooldown (~line 440) and CombatEnemyCooldown (~line 770) in tables.ts, ItemCooldown usages in items.ts (~lines 1376-1398), and CombatEnemyCooldown usages in combat.ts (~lines 2026, 2051-2052). No AbilityCooldown hits.
2. `grep -n "startedAtMicros\|durationMicros" C:/projects/uwr/src/module_bindings/ability_cooldown_row.ts` — both fields present.
3. `grep -n "predictedCooldownReadyAt\|COOLDOWN_SKEW_SUPPRESS\|serverClockOffset" C:/projects/uwr/src/composables/useHotbar.ts C:/projects/uwr/src/App.vue` — zero matches.
4. `npx vue-tsc --noEmit` from C:/projects/uwr — exits 0.
</verification>

<success_criteria>
- AbilityCooldown schema has startedAtMicros + durationMicros, no readyAtMicros
- Local SpacetimeDB module published with new schema
- Generated bindings in src/module_bindings/ match new schema
- useHotbar.ts cooldown display is fully clock-independent (receivedAt pattern)
- App.vue nowMicros timer uses Date.now() * 1000 with no server offset
- TypeScript compiles clean
</success_criteria>

<output>
After completion, create `.planning/quick/230-replace-abilitycooldown-readyatmicros-wi/230-SUMMARY.md`
</output>
