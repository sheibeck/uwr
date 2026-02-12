---
phase: quick-40
plan: 01
subsystem: ui-logging
tags: [bug-fix, combat, group-play, ux]
dependency_graph:
  requires: [log-event-system, group-events]
  provides: [fixed-group-combat-colors, stable-event-sorting]
  affects: [LogWindow, useEvents]
tech_stack:
  added: []
  patterns: [vue-style-binding-priority, scope-based-sorting]
key_files:
  created: []
  modified:
    - src/components/LogWindow.vue
    - src/composables/useEvents.ts
decisions:
  - "Style array ordering: scope styles before kind styles for proper override hierarchy"
  - "Scope sort order: world > location > private > group > client for intuitive grouping"
metrics:
  duration: "1m 48s"
  completed_date: "2026-02-12"
---

# Quick Task 40: Fix Log Message Sorting and Coloring

**One-liner:** Fixed group combat messages to show proper red/green/gold colors instead of blue, and prevented same-timestamp events from interleaving across scopes

**Completed:** 2026-02-12
**Duration:** 1m 48s

---

## What Was Done

### Task 1: Fix Group Event Color Priority (LogWindow.vue)
**Problem:** In group play, combat damage/heal/reward messages appeared blue (the group scope color) instead of their proper red/green/gold colors because Vue's style binding array applied `logGroup` style last, overriding kind-specific styles.

**Solution:** Reordered the style array to place scope-based styles (private, group) BEFORE kind-specific styles (damage, heal, reward, avoid, faction, blocked). This allows kind-specific colors to take precedence while group events without kind-specific styling still get the blue default color.

**Files Modified:**
- `src/components/LogWindow.vue`: Moved `event.scope === 'group'` condition before all `event.kind` conditions in style array

**Commit:** `aebbfc4`

---

### Task 2: Fix Sort Stability for Same-Timestamp Events (useEvents.ts)
**Problem:** Events created in the same reducer call share identical timestamps but have IDs from independent auto-increment sequences (private, group, location tables). This caused arbitrary interleaving where "Bob hit Goblin" might appear before "You hit Goblin" even though both happened in the same tick.

**Solution:** Added scope-based secondary sort key (world > location > private > group > client) in the sort comparator, applied BEFORE the id tiebreaker. Now same-timestamp events from the same scope stay grouped together, with personal actions appearing before group messages for better readability.

**Files Modified:**
- `src/composables/useEvents.ts`: Added `scopeOrder` constant and scope-based comparison in combinedEvents sort

**Commit:** `3f0cdcb`

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Key Technical Details

### Vue Style Binding Priority
Vue's `:style="[...]"` array applies styles in order, with later entries overriding earlier ones. By placing base scope styles before specific kind styles, we create a proper cascade where:
1. `logText` provides base styling
2. `logPrivate` or `logGroup` sets scope-specific color (dim white or blue)
3. Kind-specific styles (damage=red, heal=green, reward=gold) override scope color when present
4. Events without kind-specific styling retain scope color

### Scope Sort Ordering
The `world > location > private > group > client` ordering ensures:
- World events (rare, high-priority) appear first
- Location events (NPCs, ambient) next
- Private events (player's own actions) before group messages
- Group events (other party members) after player's own
- Client events (local feedback, errors) last

This matches intuitive reading order: see what you did first, then what your party did.

---

## Verification

**Manual Testing:**
- Group combat damage messages display in red (#ff6b6b), not blue
- Group heal messages display in green (#7ee081), not blue
- Group reward messages display in gold (#f6c453), not blue
- Group events with no kind-specific color still show blue (#8bd3ff) as default
- Same-timestamp events from the same scope stay grouped together

**Code Verification:**
- LogWindow.vue: `event.scope === 'group'` appears before all `event.kind` entries ✓
- useEvents.ts: Sort comparator includes scope-based secondary sort ✓
- TypeScript compilation: No new errors introduced (pre-existing errors unrelated to changes)

---

## Impact

**User Experience:**
- Group combat logs now properly color-coded for quick scanning
- Damage (red), healing (green), and rewards (gold) visually distinct even in group play
- Same-tick events no longer interleave confusingly
- Personal actions appear before group messages for clearer combat flow

**Code Quality:**
- Proper use of Vue style binding order
- Stable, predictable event sorting
- No performance impact (sort complexity unchanged)

---

## Self-Check: PASSED

**Files Modified:**
```bash
$ [ -f "C:/projects/uwr/src/components/LogWindow.vue" ] && echo "FOUND: src/components/LogWindow.vue" || echo "MISSING: src/components/LogWindow.vue"
FOUND: src/components/LogWindow.vue

$ [ -f "C:/projects/uwr/src/composables/useEvents.ts" ] && echo "FOUND: src/composables/useEvents.ts" || echo "MISSING: src/composables/useEvents.ts"
FOUND: src/composables/useEvents.ts
```

**Commits Exist:**
```bash
$ git log --oneline --all | grep -q "aebbfc4" && echo "FOUND: aebbfc4" || echo "MISSING: aebbfc4"
FOUND: aebbfc4

$ git log --oneline --all | grep -q "3f0cdcb" && echo "FOUND: 3f0cdcb" || echo "MISSING: 3f0cdcb"
FOUND: 3f0cdcb
```

All referenced files and commits verified successfully.
