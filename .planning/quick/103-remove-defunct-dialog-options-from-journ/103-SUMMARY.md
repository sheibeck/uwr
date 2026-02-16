---
phase: quick-103
plan: 01
subsystem: UI/NPC Interactions
tags: [npc, dialogue, ui-cleanup, journal]
dependency_graph:
  requires: []
  provides: [clean-dialogue-options]
  affects: [npc-dialog-panel]
tech_stack:
  added: []
  patterns: [client-side-filtering]
key_files:
  created: []
  modified:
    - src/components/NpcDialogPanel.vue
decisions:
  - Client-side filtering of empty playerText options in computed property
  - Server-side dialogue data structure unchanged (root nodes still needed for /hail)
metrics:
  duration_seconds: 67
  tasks_completed: 1
  files_modified: 1
  commits: 1
  completed_date: 2026-02-16
---

# Phase quick-103 Plan 01: Remove Defunct Dialog Options from Journal Summary

**One-liner:** Filtered empty-playerText root greeting nodes from NPC dialogue options display while preserving /hail greeting functionality

## Objective Achieved

Removed defunct dialog options from the Journal (NpcDialogPanel). The NpcDialogueOption table contains root greeting nodes with empty `playerText` (e.g., `marla_root`, `soren_root`, `jyn_root`) that are used by the `/hail` system on the server to display NPC greetings. These were appearing as empty clickable buttons in the "Dialogue Options" section. They are now filtered out from the displayed options.

## Implementation Summary

### Task 1: Filter out empty-playerText dialogue options from NpcDialogPanel
**Commit:** 55de49a
**Files:** src/components/NpcDialogPanel.vue

Modified the `availableDialogueOptions` computed property to add a secondary filter that excludes options where `playerText` is empty or whitespace-only:

```typescript
const options = props.npcDialogueOptions.filter(
  (opt) => opt.npcId.toString() === selectedNpcId.value && !opt.parentOptionId
).filter(opt => opt.playerText.trim().length > 0);
```

This simple filter chain:
1. First gets root options (`!opt.parentOptionId`)
2. Then excludes any with empty `playerText`

**Result:** Root greeting nodes like `marla_root` (with `playerText: ''`) no longer display as clickable dialogue options, while legitimate root options like `marla_past_unlocked` (playerText: 'past') and `marla_shortcuts` (playerText: 'shortcuts') still appear correctly.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

✅ Modified file compiles without introducing new TypeScript errors
✅ Root greeting nodes (empty playerText) excluded via `.filter(opt => opt.playerText.trim().length > 0)`
✅ Legitimate dialogue options with playerText still included in the filter results
✅ Affinity-locked options logic unchanged (still show with lock indicator when requirements not met)
✅ No server-side changes made - hail greeting system unaffected

## Technical Details

### Pattern Used
- **Client-side filtering:** Simple predicate filter on computed property
- **Preservation strategy:** Server-side data untouched (root nodes still needed for `/hail` reducer)

### Why This Works
The root greeting nodes serve a dual purpose in the original design:
1. Server-side: Used by `hailNpc` reducer to look up and display NPC greetings
2. Client-side: Unintentionally displayed as clickable dialogue options (bug)

By filtering on the client side, we eliminate the UI bug while preserving the server-side greeting functionality.

## Self-Check

### Created files exist:
None - this was a modification-only task.

### Modified files exist:
```bash
[ -f "src/components/NpcDialogPanel.vue" ] && echo "FOUND: src/components/NpcDialogPanel.vue" || echo "MISSING: src/components/NpcDialogPanel.vue"
```
**Result:** FOUND: src/components/NpcDialogPanel.vue

### Commits exist:
```bash
git log --oneline --all | grep -q "55de49a" && echo "FOUND: 55de49a" || echo "MISSING: 55de49a"
```
**Result:** FOUND: 55de49a

## Self-Check: PASSED

All files and commits verified present.

## Impact

- **User Experience:** Cleaner dialogue options UI - no more mysterious empty buttons
- **Functionality:** Zero impact on NPC greeting system via `/hail` command
- **Maintainability:** Simple, localized change - easy to understand and modify if needed
- **Performance:** Negligible - single additional filter predicate in computed property

## Future Considerations

None. This is a complete solution. If dialogue system is refactored in the future, consider whether root greeting nodes should be marked differently in the database (e.g., `isGreetingNode: boolean` flag) for more explicit filtering rather than relying on empty `playerText`.
