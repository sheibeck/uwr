---
phase: quick-375
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [QUICK-375]
must_haves:
  truths:
    - "Combat action bar (Flee + abilities) appears within 1-2s of combat starting"
    - "Enemy HUD appears at the same time as the action bar"
    - "Combat damage from both auto-attacks and abilities is logged to the narrative"
  artifacts:
    - path: "src/App.vue"
      provides: "Fixed combatIntroSeen race condition"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Verified combat logging (if changes needed)"
  key_links:
    - from: "src/App.vue"
      to: "combatIntroSeen ref"
      via: "private event watcher"
      pattern: "combatIntroSeen"
---

<objective>
Fix two combat bugs: (1) ability list / combat action bar not appearing at combat start due to a race condition in the combatIntroSeen gate, and (2) investigate whether combat damage logging is incomplete.

Purpose: Combat is unplayable without the action bar — players can't use abilities or flee. The damage math investigation ensures combat resolution is correct and fully logged.

Output: Working combat UI that appears immediately after intro narration, verified damage logging.
</objective>

<context>
@.planning/STATE.md
@src/App.vue (lines 1027-1062 — combatIntroSeen gate logic)
@src/components/NarrativeInput.vue (CombatActionBar gating via isInCombat prop)
@spacetimedb/src/reducers/combat.ts (startCombatForSpawn lines 161-257 — intro + scheduleCombatTick)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix combatIntroSeen race condition so combat UI appears</name>
  <files>src/App.vue</files>
  <action>
The root cause: `startCombatForSpawn` in combat.ts inserts the combat_encounter, combat_participant, AND the private events (combat, combat_narration, system "The world grows still around you.") all in ONE reducer transaction. SpacetimeDB delivers all subscription updates from a single transaction as one batch to the client.

When the batch arrives, the `isInCombat` computed becomes true, triggering the watcher at line 1041 which sets `combatEventBaseline = userPrivateEvents.value.length`. But the system event "The world grows still around you." was ALREADY in that same batch and is already counted in the length. The second watcher (line 1047) watching `userPrivateEvents.value.length` never fires again because no NEW events arrive after the baseline. Result: `combatIntroSeen` stays false, `combatUiVisible` stays false, no action bar.

Fix approach: Remove the baseline-offset pattern entirely. Instead, when `isInCombat` becomes true, scan ALL existing private events (not just "new" ones) for the intro signal. The concern about "historical events from previous combats" (the original comment) is not relevant because private events are ephemeral and cleared between combats.

In `src/App.vue`, replace lines ~1027-1062 with:

```typescript
// Gate combat UI until intro narration completes ("The world grows still around you.")
const combatIntroSeen = ref(false);

watch(isInCombat, (inCombat) => {
  if (!inCombat) {
    combatIntroSeen.value = false;
    return;
  }
  // Check immediately — events may already be in the batch
  checkForIntroEvent();
});

function checkForIntroEvent() {
  if (combatIntroSeen.value || !isInCombat.value) return;
  for (const evt of userPrivateEvents.value) {
    if (evt.kind === 'system' && evt.message === 'The world grows still around you.') {
      combatIntroSeen.value = true;
      return;
    }
  }
}

// Also watch for late-arriving events (e.g., if subscription delivers in multiple batches)
watch(
  () => userPrivateEvents.value.length,
  () => checkForIntroEvent()
);

const combatUiVisible = computed(() => isInCombat.value && combatIntroSeen.value);
```

Key changes:
- Remove `lastCombatId` (unused)
- Remove `combatEventBaseline` offset tracking
- Scan ALL events when isInCombat becomes true (catches same-batch delivery)
- Keep the length watcher as fallback for multi-batch delivery
- Searching all events for "The world grows still around you." is fine since private_event is a small table and the string is unique to combat intro
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>combatIntroSeen is set to true immediately when combat starts (same batch), combat action bar with Flee + abilities appears, enemy HUD appears</done>
</task>

<task type="auto">
  <name>Task 2: Investigate and verify combat damage logging completeness</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
Investigate whether ability damage is being logged correctly to the combat narrative. The user reported only ~21 total auto-attack damage dealt but still won combat.

Review the following code paths for logging gaps:

1. **Player auto-attacks** (processPlayerAutoAttackForRound, line ~2241): Uses `resolveAttack` which calls `appendPrivateEvent` — this IS logged. Confirm the message format includes weapon name and damage.

2. **Player ability use** (use_ability_realtime reducer, line ~2576): Calls `executeAbilityAction` -> `executeAbility` in helpers/combat.ts. Check that `executeAbility` logs damage to private events. If it does NOT log to the player's events, that would explain why the user only saw auto-attack damage.

3. **Enemy auto-attacks** (processEnemyAutoAttackForRound, line ~2394): Uses `resolveAttack` which logs — confirmed working.

4. **Enemy abilities** (tryEnemyAbilityForRound, line ~2316): Calls `executeAbilityAction` -> `executeEnemyAbility`. Check logging.

Read `spacetimedb/src/helpers/combat.ts` executeAbility function to verify it logs damage via appendPrivateEvent. If ability damage logging is missing, add appropriate appendPrivateEvent calls.

Most likely the combat math is fine and the player won because abilities dealt additional damage that was logged under 'ability' event kind (not 'damage'). The user may not have noticed ability damage messages. This task is investigatory — only modify code if a real logging gap is found.

If no logging gap is found, add a comment at the top of processPlayerAutoAttackForRound noting that ability damage is logged separately via executeAbility -> appendPrivateEvent, for future debugging clarity.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc -p spacetimedb/tsconfig.json --noEmit 2>&1 | grep -i error | head -10 || echo "No errors"</automated>
  </verify>
  <done>Combat damage logging verified: all auto-attack and ability damage produces visible narrative events. If gap found, it is fixed and logged.</done>
</task>

<task type="auto">
  <name>Task 3: Publish and verify</name>
  <files></files>
  <action>
Publish the server module to local SpacetimeDB (only if Task 2 made server changes):
```
spacetime publish uwr -p spacetimedb
```

If no server changes were made in Task 2, skip publishing.

Regenerate client bindings if schema changed (unlikely for this fix):
```
spacetime generate --lang typescript --out-dir src/module_bindings -p spacetimedb
```
  </action>
  <verify>
    <automated>cd C:/projects/uwr && spacetime publish uwr -p spacetimedb 2>&1 | tail -5</automated>
  </verify>
  <done>Module published (if needed), client correctly shows combat action bar at combat start</done>
</task>

</tasks>

<verification>
- Combat action bar (Flee + ability buttons) appears within 1-2 seconds of entering combat
- Enemy HUD shows enemy name, level, HP bar
- Player auto-attack damage messages appear in narrative
- Ability use messages appear in narrative (if abilities are used)
- Combat resolves to victory/defeat correctly
</verification>

<success_criteria>
- combatIntroSeen race condition eliminated
- Combat UI gates correctly on intro message regardless of subscription batch timing
- All combat damage (auto-attack + abilities) logged to player's narrative stream
</success_criteria>

<output>
After completion, create `.planning/quick/375-fix-combat-ability-list-display-and-dama/375-SUMMARY.md`
</output>
