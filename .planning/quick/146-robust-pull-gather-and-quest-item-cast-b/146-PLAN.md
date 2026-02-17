---
phase: quick-146
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useCombat.ts
  - src/App.vue
  - src/components/LocationGrid.vue
autonomous: true
must_haves:
  truths:
    - "Pull cast bar clears when pullState row disappears or spawn.state changes from 'pulling'"
    - "Gather cast bar clears when gather is interrupted (no active resourceGather row and grace period elapsed)"
    - "Quest item cast bar clears early if the quest item becomes looted before timer finishes"
    - "No orphaned cast bars persist longer than expected duration + 2s grace"
  artifacts:
    - path: "src/composables/useCombat.ts"
      provides: "Pull progress orphan safety net"
    - path: "src/App.vue"
      provides: "Gather localGather cleanup watchers"
    - path: "src/components/LocationGrid.vue"
      provides: "Quest item cast early-clear on looted detection"
  key_links:
    - from: "src/composables/useCombat.ts"
      to: "pullStates subscription"
      via: "pullProgress computed already handles isPulling+pull check; orphan is when bar shows 100% but spawn still says 'pulling'"
      pattern: "pullProgress.*clamp"
    - from: "src/App.vue"
      to: "resourceGathers subscription"
      via: "localGather watcher checks resourceGathers table for active gather row"
      pattern: "localGather.*resourceGather"
    - from: "src/components/LocationGrid.vue"
      to: "questItems prop"
      via: "watch questItems for looted status change to cancel active cast timer"
      pattern: "questItemCast.*looted"
---

<objective>
Add robustness safety nets to pull, gather, and quest-item cast bars so they never get stuck.

Purpose: Quick-144 fixed combat cast bars with activeCombat watchers and orphan safety nets. The same
patterns need to be applied to the three other "something is happening" indicators: pull bars, gather bars,
and quest item cast bars. Each can get stuck if server state changes while the client-side progress
animation is still running.

Output: All three cast bar types have cleanup watchers that clear stale state.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/composables/useCombat.ts
@src/App.vue
@src/components/LocationGrid.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pull bar orphan safety net in useCombat.ts</name>
  <files>src/composables/useCombat.ts</files>
  <action>
The pull bar is computed in the `availableEnemies` computed property (around line 504-517). It checks
`spawn.state === 'pulling'` and finds the matching `pullStates` row to calculate progress. The bar
can get stuck at 100% if the pull completes server-side but the `pullStates` subscription lags.

The computed already handles the normal case well: if `spawn.state` changes from `'pulling'` to anything
else, `isPulling` becomes false and the bar disappears. The problem is when `pullProgress` reaches 1.0
but the spawn state hasn't updated yet.

Add a clamp so pullProgress never exceeds 1.0 (already done via Math.min), BUT more importantly, add a
check: if `pullProgress >= 1` AND the pull's expected end time + 2s grace has passed, force `isPulling`
to false. This prevents the bar from sitting at 100% indefinitely.

In the `availableEnemies` computed, after the pullProgress calculation (around line 516), add:

```typescript
// Orphan safety net: if pull progress reached 100% and 2s grace elapsed, hide bar
if (isPulling && pull) {
  const pullDurationMicros = pull.pullType === 'careful' ? 2_000_000 : 1_000_000;
  const pullStartMicros = timestampToMicros(pull.createdAt);
  const pullEndMicros = pullStartMicros + pullDurationMicros;
  const graceMicros = 2_000_000; // 2s grace
  if (nowMicros.value >= pullEndMicros + graceMicros) {
    isPulling = false;
    pullProgress = 0;
  }
}
```

Change `const isPulling` to `let isPulling` so it can be reassigned by the safety net.

Also: if `isPulling` is true but NO matching pull row exists (`!pull`), the bar should not show.
Currently the code already handles this: `if (isPulling && pull)` gates the progress calc, so
pullProgress stays 0. But add an explicit safety: if `isPulling && !pull`, set `isPulling = false`.
This covers the case where the pullState row is deleted before the spawn state changes.
  </action>
  <verify>
Run `npx vue-tsc --noEmit` to verify no TypeScript errors.
Search for `isPulling` in useCombat.ts to confirm the safety net logic is present.
  </verify>
  <done>
Pull bar disappears when: (a) spawn.state is no longer 'pulling', (b) pullState row disappears,
or (c) pull duration + 2s grace has elapsed. No stuck pull bars at 100%.
  </done>
</task>

<task type="auto">
  <name>Task 2: Gather bar cleanup watchers in App.vue</name>
  <files>src/App.vue</files>
  <action>
The gather bar uses `localGather` as optimistic state (set when user clicks Gather, cleared when
duration elapses via the existing nowMicros watcher at line 1989-1996). Problems:

1. If gather is interrupted (player moves, enters combat, server deletes resourceGather row),
   localGather might not clear until its full 8s duration elapses.
2. No orphan safety net if localGather somehow outlives its expected duration.

Add TWO watchers near the existing localGather watchers (around line 1988):

**Watcher A: Sync localGather with resourceGathers table**

Watch `resourceGathers` and `activeResourceGather`. If `localGather` is set but there is NO active
`resourceGather` row for the character's current node, start a 1s grace period then clear:

```typescript
// Gather interruption detector: if server has no active gather for our node, clear localGather after grace
watch(
  () => [localGather.value, activeResourceGather.value] as const,
  ([local, serverGather]) => {
    if (!local) return;
    // Server still shows active gather for this node - all good
    if (serverGather && serverGather.nodeId.toString() === local.nodeId.toString()) return;
    // Server has no active gather - check if enough time passed (1s grace for subscription lag)
    const elapsed = nowMicros.value - local.startMicros;
    if (elapsed > 1_000_000) {
      // Grace period passed, server doesn't have this gather - it was interrupted
      localGather.value = null;
    }
  }
);
```

**Watcher B: Extend existing nowMicros orphan safety net**

The existing nowMicros watcher (line 1989-1996) already clears localGather when duration elapses.
Extend it with an orphan safety net: if localGather has been active for duration + 2s (10s total
for 8s gather), force clear regardless:

Update the existing nowMicros watcher to also include:
```typescript
// Orphan safety net: if localGather exceeds duration + 2s grace, force clear
if (localGather.value && now - localGather.value.startMicros >= localGather.value.durationMicros + 2_000_000) {
  localGather.value = null;
}
```

This is slightly redundant with the existing duration check but adds the explicit 2s grace buffer
for cases where timing precision causes the bar to linger.

**Also: Clear localGather on combat start**

Add a watcher on `activeCombat` to clear `localGather` when combat begins (gathering should stop
if you enter combat):

```typescript
watch(
  () => activeCombat.value,
  (newVal) => {
    if (newVal && localGather.value) {
      localGather.value = null;
    }
  }
);
```

Place all new watchers near the existing localGather watchers (after line 1996).
  </action>
  <verify>
Run `npx vue-tsc --noEmit` to verify no TypeScript errors.
Search for `localGather` in App.vue to confirm both the interruption detector and orphan safety net exist.
  </verify>
  <done>
Gather bar clears when: (a) duration elapses normally, (b) server resourceGather row disappears with
1s grace, (c) combat begins, or (d) duration + 2s orphan safety net fires. No stuck gather bars.
  </done>
</task>

<task type="auto">
  <name>Task 3: Quest item cast early-clear on looted detection in LocationGrid.vue</name>
  <files>src/components/LocationGrid.vue</files>
  <action>
The quest item cast is a fully client-side 3s timer in LocationGrid.vue (lines 341-367). It uses
`setInterval` and emits `loot-quest-item` when progress reaches 100%. Problem: if the reducer
succeeds before the timer finishes (or if the quest item becomes looted by another mechanism),
the cast bar keeps running pointlessly.

Add a `watch` on the `questItems` prop to detect when the actively-cast quest item has been looted
or removed from the list. Import `watch` (already imported from 'vue' at line 256).

After the `onBeforeUnmount` block (line 373), add:

```typescript
// Early-clear quest item cast if the item disappears from the list (already looted/removed)
watch(
  () => props.questItems,
  (items) => {
    if (!questItemCast.value) return;
    const castId = questItemCast.value.id.toString();
    const stillPresent = items.some(qi => qi.id.toString() === castId && !qi.looted);
    if (!stillPresent) {
      // Item was looted or removed - clear the cast bar
      if (questItemCast.value.timer != null) {
        clearInterval(questItemCast.value.timer);
      }
      questItemCast.value = null;
    }
  },
  { deep: true }
);
```

Note: The `questItems` prop is already filtered to `discovered && !looted` in App.vue's
`locationQuestItems` computed (line 1033-1038), so if the item becomes looted it will disappear
from the prop entirely. The `stillPresent` check handles both cases: item removed from list OR
item still in list but marked looted.

Also add a 5s absolute orphan safety net in `startQuestItemCast` to prevent any stuck timer.
The cast is 3s, so 5s is generous. Inside the setInterval callback, after the `if (progress >= 1)`
block, add:

```typescript
// Absolute orphan safety: if somehow stuck beyond 5s, force clear
if (elapsed > 5000) {
  clearInterval(timer);
  questItemCast.value = null;
}
```
  </action>
  <verify>
Run `npx vue-tsc --noEmit` to verify no TypeScript errors.
Search for `stillPresent` in LocationGrid.vue to confirm the early-clear watcher exists.
  </verify>
  <done>
Quest item cast bar clears early when: (a) timer completes normally at 3s, (b) quest item disappears
from props (looted/removed), or (c) 5s absolute orphan safety net fires. No stuck quest item bars.
  </done>
</task>

</tasks>

<verification>
After all three tasks, verify:
1. `npx vue-tsc --noEmit` passes with no errors
2. Pull bar in useCombat.ts has orphan safety net (duration + 2s grace) and missing-pullState guard
3. Gather bar in App.vue has resourceGathers sync watcher, combat-start clear, and orphan safety net
4. Quest item bar in LocationGrid.vue has looted-detection watcher and absolute orphan timeout
</verification>

<success_criteria>
All three cast bar types (pull, gather, quest item) have cleanup safety nets that prevent stuck indicators.
TypeScript compiles without errors. Pattern matches quick-144's approach: watchers + grace periods + orphan timeouts.
</success_criteria>

<output>
After completion, create `.planning/quick/146-robust-pull-gather-and-quest-item-cast-b/146-SUMMARY.md`
</output>
