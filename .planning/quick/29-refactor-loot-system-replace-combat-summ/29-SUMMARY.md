---
phase: quick-29
plan: 1
subsystem: combat-loot
tags: [ui, refactor, loot, combat-flow]
dependency-graph:
  requires: [combat-system, event-log]
  provides: [loot-accumulation, non-blocking-combat-flow]
  affects: [travel-panel, inventory-lock, hotbar-lock]
tech-stack:
  added: [LootPanel.vue, pendingLoot-computed]
  patterns: [floating-panel, auto-open-on-data, watcher-driven-automation]
key-files:
  created:
    - src/components/LootPanel.vue
  modified:
    - src/composables/useCombat.ts
    - src/components/CombatPanel.vue
    - src/components/ActionBar.vue
    - src/composables/useCombatLock.ts
    - src/App.vue
decisions:
  - decision: "Auto-dismiss results after 500ms delay to ensure loot rows arrive from server before dismissal"
    rationale: "Network latency means loot rows may not be immediately available when result arrives"
    alternatives: ["Dismiss immediately (risky - loot might be lost)", "Wait for user action (blocks flow)"]
  - decision: "Post Victory/Defeat to log as combat kind messages, not system messages"
    rationale: "Combat messages have distinct color (purple) for easy scanning in busy log"
  - decision: "Keep activeLoot computed in useCombat for dismiss logic, add new pendingLoot for panel"
    rationale: "Dismiss logic still needs single-combat loot context to warn about unclaimed items"
  - decision: "Cap pendingLoot at 10 items to prevent UI overflow"
    rationale: "Players shouldn't accumulate more than 10 unclaimed items; forces periodic cleanup"
  - decision: "Remove activeResult from combatLocked - only activeCombat blocks inventory/hotbar"
    rationale: "Players should be able to equip loot immediately after combat ends"
metrics:
  duration: "~15 min"
  completed: "2026-02-12"
  tasks: 2
  files: 6
  commits: 2
---

# Quick 29: Refactor Loot System to Replace Combat Summary Modal

**One-liner:** Combat results post to log as messages; loot accumulates in dedicated floating panel that auto-opens when items drop

## Changes Summary

### Task 1: Create LootPanel component and refactor useCombat to support loot accumulation

**Commit:** `c89ed88`

Created new `LootPanel.vue` component following existing panel patterns (VendorPanel, InventoryPanel):
- Props: `styles`, `lootItems` array, `connActive` boolean
- Emits: `take-loot`, `show-tooltip`, `move-tooltip`, `hide-tooltip`
- Template: Vertical list of loot items with rarity-colored names, subtitle (rarity + tier), Take buttons
- Shows "No unclaimed loot." when empty

Added `pendingLoot` computed to `useCombat.ts`:
- Filters `combatLoot` by selected character ID (across ALL combats, not just active result)
- Caps at 10 items using `.slice(0, 10)`
- Maps to same shape as `activeLoot` with item template data, stats, and tooltips
- Exported in return object alongside existing `activeLoot`

### Task 2: Wire LootPanel into App.vue, add Loot button to ActionBar, auto-dismiss results, post Victory/Defeat to log

**Commit:** `061ac97`

**ActionBar.vue:**
- Added `'loot'` to PanelKey type union
- Added Loot button between Renown and Friends buttons
- No special locking needed - always accessible

**CombatPanel.vue:**
- Removed entire `activeResult` display block (lines 7-67: result card, heading, summary, fallen list, loot items, Dismiss button)
- Removed `v-if="activeResult"` condition - template now only shows enemies accordion during active combat
- Removed props: `activeLoot`, `activeResult`, `canDismissResults`
- Removed emits: `dismiss-results`, `take-loot`, `show-tooltip`, `move-tooltip`, `hide-tooltip`
- Removed helper functions: `rarityStyle`, `fallenList`, `stripFallen`, `resultOutcome`
- Removed `CombatResultRow` import

**useCombatLock.ts:**
- Removed `activeResult` parameter from `UseCombatLockArgs` type
- Changed `combatLocked` from `activeCombat || activeResult` to just `activeCombat`
- Inventory/hotbar now unlock immediately when combat ends (not waiting for result dismissal)

**App.vue:**
1. Imported `LootPanel` component
2. Added `pendingLoot` to useCombat destructure
3. Removed `activeResult` from useCombatLock arguments
4. Registered `loot` panel in usePanelManager defaults at position `{ x: 600, y: 200 }`
5. Added LootPanel as floating panel after Renown Panel with standard structure (header, body, resize handles)
6. Changed travel panel body visibility from `activeCombat || activeResult` to just `activeCombat`
7. Removed CombatPanel props: `:active-loot`, `:active-result`, `:can-dismiss-results`
8. Removed CombatPanel event handlers: `@dismiss-results`, `@take-loot`, tooltip handlers (kept on LootPanel)
9. Added watcher on `activeResult` that:
   - Tracks `processedResultIds` to avoid re-processing same result
   - Parses summary to extract outcome (Victory/Defeat/Combat Ended)
   - Strips "Victory! " or "Defeat! " prefix and posts detail to log as combat message
   - Auto-dismisses results after 500ms delay (allows loot rows to arrive)
10. Added watcher to trim `processedResultIds` when size > 50 (keeps last 20)
11. Added watcher on `pendingLoot.value.length` that auto-opens loot panel when count goes from 0 to positive
12. Removed `canDismissResults` computed (no longer used in template; dismissResults handles group check internally)

## Deviations from Plan

None - plan executed exactly as written.

## Verification

Verified by code inspection:
- [x] LootPanel.vue exists with proper props/emits defined
- [x] useCombat.ts exports `pendingLoot` in return object
- [x] CombatPanel.vue no longer has activeResult, activeLoot, canDismissResults props
- [x] ActionBar.vue has Loot button between Renown and Friends
- [x] App.vue has LootPanel floating panel section
- [x] useCombatLock.ts no longer references activeResult
- [x] `loot` panel registered in usePanelManager defaults
- [x] TypeScript compiles (no new errors introduced)

Expected runtime behavior (not tested, requires SpacetimeDB server):
1. After combat victory with loot: Victory message appears in log, loot panel auto-opens with items, travel panel shows location/enemies normally
2. After combat victory without loot: Victory message appears in log, travel panel returns to normal, no loot panel opens
3. After combat defeat: Defeat message appears in log, travel panel returns to normal
4. Loot button in action bar toggles the loot panel open/closed
5. Taking loot removes items from the loot panel list (server deletes combatLoot row)
6. Multiple combats accumulate loot (items from combat 1 and combat 2 both visible, up to 10 total)
7. Victory/defeat sounds still play when combat ends (existing watcher unchanged)
8. Inventory and hotbar edits unlock immediately after combat ends (not waiting for dismiss)

## Self-Check

Checking created files exist:
```bash
[ -f "src/components/LootPanel.vue" ] && echo "FOUND: src/components/LootPanel.vue" || echo "MISSING: src/components/LootPanel.vue"
```
Result: FOUND: src/components/LootPanel.vue

Checking commits exist:
```bash
git log --oneline --all | grep -q "c89ed88" && echo "FOUND: c89ed88" || echo "MISSING: c89ed88"
git log --oneline --all | grep -q "061ac97" && echo "FOUND: 061ac97" || echo "MISSING: 061ac97"
```
Result: FOUND: c89ed88, FOUND: 061ac97

## Self-Check: PASSED

All files and commits verified.

## Impact

**Before:** Combat results blocked the entire travel panel until dismissed. Players couldn't move, engage new enemies, or access inventory/hotbar until clicking Dismiss. Loot was shown inline in the result card and disappeared when dismissed.

**After:** Combat results post to log as Victory/Defeat messages (purple color). Loot accumulates in a dedicated floating panel that auto-opens when items drop. Travel panel returns to location view immediately. Inventory/hotbar unlock instantly. Players can continue playing while reviewing loot. Loot button in action bar provides manual access to panel.

This removes the primary UX blocker in combat flow - players are no longer forced to stop and acknowledge results before continuing gameplay.
