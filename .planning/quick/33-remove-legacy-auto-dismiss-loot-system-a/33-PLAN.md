---
phase: quick-33
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/reducers/items.ts
autonomous: true
must_haves:
  truths:
    - "After victory with loot, each player sees their loot items in the LootPanel"
    - "After victory without loot, no CombatResult row lingers (auto-cleaned server-side)"
    - "Each group member can independently take their own loot without waiting for the leader"
    - "Taking the last loot item auto-cleans only that character's CombatResult, not everyone's"
  artifacts:
    - path: "src/App.vue"
      provides: "Client-side result watcher without auto-dismiss"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Per-character dismiss and server-side no-loot auto-cleanup"
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "Per-character take_loot auto-cleanup"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "combat_loot rows"
      via: "Victory handler checks if loot was generated before creating CombatResult"
    - from: "spacetimedb/src/reducers/items.ts"
      to: "combat_result rows"
      via: "take_loot deletes only the character's own CombatResult when their loot is empty"
    - from: "src/App.vue"
      to: "useCombat.dismissResults"
      via: "No longer called automatically; only manually via user action if needed"
---

<objective>
Remove legacy auto-dismiss loot system that prevents loot from displaying in the new LootPanel. Fix three interrelated issues: (1) client-side auto-dismiss race condition that deletes loot before it arrives, (2) leader-only dismiss gating that prevents independent loot management, (3) take_loot global cleanup that deletes other players' results.

Purpose: Players are not seeing loot after victory because the old auto-dismiss system fires before loot rows propagate to the client, destroying them server-side. Group members cannot independently manage their own loot.

Output: Working loot flow where each player independently sees and claims their own loot in the LootPanel.
</objective>

<context>
@.planning/STATE.md
@src/App.vue
@src/composables/useCombat.ts
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/reducers/items.ts
@spacetimedb/src/views/combat.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove client-side auto-dismiss and fix server-side per-character loot management</name>
  <files>
    src/App.vue
    spacetimedb/src/reducers/combat.ts
    spacetimedb/src/reducers/items.ts
  </files>
  <action>
**A. Remove client-side auto-dismiss from App.vue (THE PRIMARY BUG)**

In the `activeResult` watcher (around lines 880-905), remove the auto-dismiss logic entirely. The watcher should ONLY:
1. Track `processedResultIds` to avoid re-posting the same result to the log
2. Post Victory/Defeat/Combat Ended message to the event log via `addLocalEvent('combat', logMessage)`
3. Do NOT call `dismissResults()` at all -- not with setTimeout, not conditionally, not at all

Remove these lines (approximately 897-903):
```typescript
// DELETE THIS ENTIRE BLOCK:
// Only auto-dismiss if no loot dropped for this character.
// When loot exists, player dismisses after claiming items.
if (pendingLoot.value.length === 0) {
  setTimeout(() => {
    dismissResults();
  }, 500);
}
```

The `dismissResults` function, the `hasOtherLootForResult` computed, and the `activeLoot` computed are still exported from `useCombat` but are no longer called from the activeResult watcher. They can remain for potential future manual-dismiss UI but are not actively used in the auto flow anymore.

Also remove `dismissResults` from the useCombat destructure in App.vue (around line 741) since it is no longer called anywhere in App.vue. Search the file to confirm no other references to `dismissResults` exist before removing.

**B. Fix server-side dismiss_combat_results to work per-character (spacetimedb/src/reducers/combat.ts)**

In the `dismiss_combat_results` reducer (around line 946-995), change the GROUP branch to allow ANY group member to dismiss THEIR OWN result and loot (not just the leader):

Replace the current group branch (lines 952-982):
```typescript
if (groupId) {
  // OLD: leader-only dismiss of ALL group results
}
```

With per-character dismiss:
```typescript
if (groupId) {
  // Each character dismisses only their own result and loot
  const myResults = [...ctx.db.combatResult.by_owner_user.filter(character.ownerUserId)]
    .filter(r => r.groupId && r.groupId === groupId);
  const combatIds = new Set<bigint>();
  for (const row of myResults) {
    combatIds.add(row.combatId);
    ctx.db.combatResult.id.delete(row.id);
  }
  // Delete only this character's loot
  for (const combatId of combatIds) {
    for (const loot of ctx.db.combatLoot.by_character.filter(character.id)) {
      if (loot.combatId === combatId) {
        ctx.db.combatLoot.id.delete(loot.id);
      }
    }
  }
  return;
}
```

Remove the leader check entirely (`group.leaderCharacterId !== character.id` check).
Remove the `force` parameter logic -- it is no longer needed since each player manages their own loot.
Remove the `force` parameter from the reducer signature (keep `characterId` only). Actually wait -- keep the `force` param as optional to avoid breaking the existing client call signature. Just ignore it.

**C. Fix take_loot auto-cleanup to be per-character (spacetimedb/src/reducers/items.ts)**

In the `take_loot` reducer (around line 241-249), change the auto-cleanup to only delete this character's CombatResult (not all results for the combat):

Replace:
```typescript
const remainingLoot = [...ctx.db.combatLoot.by_combat.filter(loot.combatId)];
if (remainingLoot.length === 0) {
  for (const result of ctx.db.combatResult.iter()) {
    if (result.combatId === loot.combatId) {
      ctx.db.combatResult.id.delete(result.id);
    }
  }
}
```

With:
```typescript
// Check if this character has any remaining loot for this combat
const myRemainingLoot = [...ctx.db.combatLoot.by_character.filter(character.id)]
  .filter(row => row.combatId === loot.combatId);
if (myRemainingLoot.length === 0) {
  // Delete only this character's result for this combat
  for (const result of ctx.db.combatResult.by_owner_user.filter(character.ownerUserId)) {
    if (result.combatId === loot.combatId) {
      ctx.db.combatResult.id.delete(result.id);
    }
  }
}
```

**D. Add server-side auto-cleanup for no-loot victories (spacetimedb/src/reducers/combat.ts)**

In the victory resolution code (around line 1907 where `combatResult.insert` happens for victory), after the result is inserted, check if this character received any loot. If NOT, immediately delete the result row:

After the `ctx.db.combatResult.insert(...)` call for victory (line 1907), add:
```typescript
const resultRow = ctx.db.combatResult.insert({
  id: 0n,
  ownerUserId: character.ownerUserId,
  characterId: character.id,
  groupId: combat.groupId,
  combatId: combat.id,
  summary: `Victory against ${summaryName}.${fallenSuffix}`,
  createdAt: ctx.timestamp,
});
// Auto-clean result if no loot was generated for this character
const charLoot = [...ctx.db.combatLoot.by_character.filter(character.id)]
  .filter(row => row.combatId === combat.id);
if (charLoot.length === 0) {
  ctx.db.combatResult.id.delete(resultRow.id);
}
```

Note: Change the existing `ctx.db.combatResult.insert({...})` to capture the returned row in `resultRow`.

Do the same for the defeat path (around line 2250) -- defeats never have loot, so just don't create a result at all. Actually, keep defeat results because the client watcher uses them to post "Defeat!" to the log. But the client watcher should still work because `activeResult` fires momentarily even if the server deletes it soon after (the view sends the insert then the delete). Actually no -- if inserted and deleted in the same transaction, the client may never see it.

REVISED APPROACH for defeats: Keep inserting the CombatResult for defeats BUT also immediately delete it. The client will receive the row via the view and the watcher will fire before the delete propagates. Actually this is unreliable.

BETTER APPROACH: Do NOT change defeat handling at all. The existing code creates CombatResult for defeats. The client watcher posts "Defeat!" to the log. Then the client previously auto-dismissed, which we removed. So defeat results will now linger. Fix: for defeats, also auto-delete the result server-side immediately since defeats never have loot:

At the defeat CombatResult insert (around line 2250):
```typescript
const defeatResult = ctx.db.combatResult.insert({
  id: 0n,
  ownerUserId: character.ownerUserId,
  characterId: character.id,
  groupId: combat.groupId,
  combatId: combat.id,
  summary: `Defeat against ${enemyName}.${fallenSuffix}`,
  createdAt: ctx.timestamp,
});
ctx.db.combatResult.id.delete(defeatResult.id);
```

WAIT - if inserted and deleted in the same reducer call/transaction, the client view will never see it. The "Defeat!" message needs to reach the client somehow.

SIMPLEST APPROACH: Defeat messages are ALREADY logged as private events via `appendPrivateEvent`. So the client can rely on those. Let me check...

Actually, the client watcher in App.vue is watching `activeResult` (from the `myCombatResults` view). If we delete the result in the same transaction as the insert, the client never sees it. But the log messages (Victory/Defeat) were already being sent as private/group events by the combat system. The watcher in App.vue was a SECONDARY posting mechanism added in quick-29.

THE CLEANEST SOLUTION: Since we're removing the auto-dismiss, and since Victory/Defeat events are already logged server-side as private events (they appear in the log via `privateEvents`), we can:
1. For no-loot victories: Don't insert CombatResult at all (skip the insert). The victory event is already logged server-side.
2. For loot victories: Insert CombatResult as before (it gets cleaned up when last loot is taken via take_loot).
3. For defeats: Don't insert CombatResult at all. The defeat event is already logged server-side.

But wait -- the client `activeResult` watcher also plays sounds (victory/defeat sounds are in a separate watcher). Let me re-check... The sound watcher (around App.vue line 845) also watches `activeResult`. If we don't create CombatResult for no-loot victories and defeats, sounds won't play.

FINAL APPROACH - keep it simple:
1. For ALL victories: Always insert CombatResult. If no loot generated, immediately delete it. The client may or may not see it briefly.
2. For defeats: Always insert CombatResult. Immediately delete it.
3. On the CLIENT: The existing sound watcher and log watcher both watch `activeResult`. Since these results may be ephemeral (inserted then deleted same transaction), they might not be seen by client.

ACTUALLY THE SIMPLEST FIX: Don't change the server victory/defeat result creation at all. Just remove the client auto-dismiss. The results will linger on the server until either:
- Loot is taken (take_loot cleans up results when character's loot is empty)
- A new combat starts (could add cleanup then)
- We add a server-side scheduled cleanup

For the "no loot" case where results linger: this is actually fine! The CombatResult row is tiny and the `my_combat_results` view filters per-user. The client watcher posts the message to the log. The result row just sits there harmlessly. The `pendingLoot` computed already filters by `characterId` and shows "No unclaimed loot" which is correct.

But this means `activeResult` will remain non-null forever for no-loot combats, which could interfere with future combat result processing.

OK HERE IS THE ACTUAL SIMPLEST CORRECT FIX:

1. **Client (App.vue)**: Remove the auto-dismiss `setTimeout`/`dismissResults` block. Keep everything else.
2. **Server victory (combat.ts ~line 1907)**: After inserting CombatResult, check if character has loot for this combat. If not, immediately delete the result.
3. **Server defeat (combat.ts ~line 2250)**: After inserting CombatResult, immediately delete it.
4. **Server dismiss (combat.ts ~line 946)**: Change to per-character (remove leader check).
5. **Server take_loot (items.ts ~line 241)**: Change to per-character cleanup.

For items 2 and 3: The client will NOT see the insert+delete in the same transaction. That's OK because:
- Victory/defeat sounds: We move the sound triggers to use the EVENT log instead of activeResult. In the `combinedEvents` watcher (or a new watcher), check for "Victory" or "Defeat" combat messages.
- Victory/defeat log messages: Already posted server-side via `appendPrivateEvent` and `logGroupEvent`.

So we ALSO need to:
6. **Client (App.vue)**: Remove the `activeResult` watcher that posts to the log (lines 880-905). It's redundant -- server already posts these events.
7. **Client (App.vue)**: Move the sound watcher to trigger off `combinedEvents` instead of `activeResult`. Watch for new combat events containing "Victory" or "Defeat".

Actually, looking at the EXISTING sound watcher (lines 845-859), it already watches `activeResult` independently. We need to change it to watch combinedEvents instead.

HERE IS THE FINAL CONSOLIDATED PLAN:

**App.vue changes:**

1. Remove the ENTIRE `activeResult` log-posting watcher (lines 880-905), including the `processedResultIds` ref and its cleanup watcher (lines 907-916). This watcher posted redundant Victory/Defeat messages and called the problematic auto-dismiss.

2. Change the sound watcher (lines 845-859) to trigger off `combinedEvents` instead of `activeResult`. Replace:
```typescript
watch(
  () => activeResult.value,
  (result) => {
    if (!result) return;
    const id = result.id.toString();
    if (lastResultId.value === id) return;
    lastResultId.value = id;
    const summary = result.summary.toLowerCase();
    if (summary.startsWith('victory')) {
      playVictorySound();
    } else if (summary.startsWith('defeat')) {
      playDefeatSound();
    }
  }
);
```
With:
```typescript
watch(
  () => combinedEvents.value,
  (events) => {
    if (!events || events.length === 0) return;
    const last = events[events.length - 1];
    const id = `sound-${last.id}`;
    if (lastResultId.value === id) return;
    if (last.kind !== 'combat') return;
    const msg = (last.message ?? '').toLowerCase();
    if (msg.startsWith('victory')) {
      lastResultId.value = id;
      playVictorySound();
    } else if (msg.startsWith('defeat')) {
      lastResultId.value = id;
      playDefeatSound();
    }
  },
  { deep: true }
);
```

3. Remove `activeResult` and `dismissResults` from the useCombat destructure (around line 725-743) since they are no longer used in App.vue. Also remove `hasOtherLootForResult` and `activeLoot` from the destructure if not used elsewhere in App.vue. Search the file first to confirm none of these are referenced elsewhere in the template or script.

4. Remove the `processedResultIds` ref declaration and its size-cleanup watcher.

**combat.ts changes:**

5. In `dismiss_combat_results` (line 946-995): Change the group branch to per-character dismiss. Remove the leader check. Each character deletes only their own CombatResult rows (filtered by `ownerUserId` AND `groupId`) and their own CombatLoot rows (filtered by `characterId`). The solo branch (lines 984-993) is already per-user, keep it as-is.

6. In victory resolution (around line 1907): Capture the inserted row. Check if character has loot. If no loot, delete the result row immediately.

7. In defeat resolution (around line 2250): Capture the inserted row. Delete it immediately (defeats never have loot).

There's also a SECOND defeat path -- check for all `combatResult.insert` calls. The grep showed 3 inserts: line 1027 (end_combat), line 1907 (victory), line 2250 (defeat). The end_combat one (line 1027) is manual leader action -- leave it as-is.

Wait, there might also be a flee defeat path. Let me note: there appear to be at least 2 defeat-like paths based on the grep output showing lines around 1920-1935 and 2235-2260. Line 1907 is the main victory, line 2250 is the main defeat. The 1920-1935 area has death XP loss (part of the same victory handler for fallen characters).

For the defeat at line 2250: delete immediately after insert (no loot for defeats).
For end_combat at line 1027: leave as-is (manual action by leader).

**items.ts changes:**

8. In `take_loot` (line 241-249): Change to only check this character's remaining loot and only delete this character's CombatResult.
  </action>
  <verify>
    1. Run `npx vue-tsc --noEmit` in the client directory to verify no TypeScript errors
    2. Verify the watcher in App.vue no longer calls `dismissResults()`
    3. Verify `dismiss_combat_results` reducer no longer has the leader check
    4. Verify `take_loot` only deletes the character's own CombatResult
    5. Publish and test: `spacetime publish uwr --project-path spacetimedb`
  </verify>
  <done>
    - Client auto-dismiss removed: activeResult watcher only logs events, no dismissResults call
    - Sound triggers moved from activeResult to combinedEvents
    - Server dismiss_combat_results allows per-character dismiss (no leader gate)
    - Server take_loot auto-cleanup scoped to character (not global combat)
    - Server victory with no loot: CombatResult auto-deleted immediately
    - Server defeat: CombatResult auto-deleted immediately
    - Each group member independently sees and manages their own loot in LootPanel
  </done>
</task>

</tasks>

<verification>
After publishing the module and starting the game:
1. Solo combat with loot: Win a fight. Loot panel auto-opens with items. Take each item. Panel shows "No unclaimed loot" when done.
2. Solo combat without loot: Win a fight against enemies that drop no loot. Victory message appears in log. No result lingers.
3. Group combat with loot: Both players get their own loot independently. Each can take without waiting for leader.
4. Defeat: Defeat message appears in log. No result lingers.
5. Victory/defeat sounds still play correctly.
</verification>

<success_criteria>
- Loot items appear in LootPanel after victory (the primary bug is fixed)
- No auto-dismiss race condition
- Group members manage loot independently
- Victory/defeat sounds still trigger
- Victory/defeat messages still appear in log
</success_criteria>

<output>
After completion, create `.planning/quick/33-remove-legacy-auto-dismiss-loot-system-a/33-SUMMARY.md`
</output>
