---
phase: quick-11
plan: 01
subsystem: combat-ui
tags: [ui, tooltip, enemy, faction]
dependency_graph:
  requires: []
  provides: [enemy-hover-tooltips]
  affects: [combat-panel, tooltip-system]
tech_stack:
  added: []
  patterns: [event-emission, tooltip-reuse]
key_files:
  created: []
  modified:
    - src/composables/useCombat.ts
    - src/components/CombatPanel.vue
    - src/App.vue
decisions: []
metrics:
  duration_minutes: 4
  tasks_completed: 2
  files_modified: 3
  commits: 2
  completed_at: "2026-02-12T15:34:18Z"
---

# Quick Task 11: Add Enemy Popover Tooltips

**One-liner:** Enemy spawn rows now show styled popover tooltips with individual member names and faction affiliation on hover.

## Summary

Added hover tooltips to enemy spawn rows in the Combat Panel Enemies section. The tooltips display:
- Enemy group name as title
- Individual member names (for multi-enemy groups)
- Faction affiliation

The tooltips reuse the existing tooltip system and styling used for equipment items, ensuring visual consistency across the application.

## Implementation Details

### Task 1: Add factionName to EnemySummary and pass factions to useCombat

**Files modified:** `src/composables/useCombat.ts`, `src/App.vue`

1. Added `FactionRow` import to useCombat composable
2. Extended `EnemySummary` type to include `factionName: string` field
3. Added `factions: Ref<FactionRow[]>` to `UseCombatArgs` type
4. Updated `useCombat` function signature to accept `factions` parameter
5. Modified `availableEnemies` computed to resolve faction name:
   ```typescript
   const factionName = template?.factionId
     ? factions.value.find(f => f.id.toString() === template.factionId!.toString())?.name ?? ''
     : '';
   ```
6. Updated App.vue to pass `factions` ref (from `useGameData`) to `useCombat`

**Commit:** c61ca80

### Task 2: Add tooltip events to enemy spawn rows and render enemy tooltip content

**Files modified:** `src/components/CombatPanel.vue`, `src/App.vue`

1. Updated local `EnemySummary` type in CombatPanel to include `factionName: string`
2. Added tooltip event handlers to enemy spawn `<div>` wrapper:
   - `@mouseenter` - emits `show-tooltip` with enemy data (name, memberNames, factionName, level, groupCount)
   - `@mousemove` - emits `move-tooltip` with cursor position
   - `@mouseleave` - emits `hide-tooltip`
3. Removed native `:title` attribute from enemy name `<span>` (replaced by popover)
4. Added enemy-specific tooltip content in App.vue tooltip rendering block:
   - Members section with bold "Members:" header and list of individual enemy names
   - Faction line showing "Faction: {name}" when present
5. Reused existing `styles.tooltipLine` and `styles.tooltip` for visual consistency

**Commit:** 9b94ece

## Deviations from Plan

None - plan executed exactly as written.

## Verification

### Manual Testing Checklist

- [x] Build succeeds (`npx vite build` - passed)
- [x] Type definitions updated correctly (factionName in EnemySummary)
- [x] Event handlers added to enemy spawn rows
- [x] Tooltip content renders enemy-specific fields
- [x] Visual consistency with equipment tooltips maintained

### Expected Behavior

1. **Multi-enemy groups** - hovering shows each individual enemy name listed under "Members:"
2. **Faction enemies** - hovering shows "Faction: {name}" line
3. **Non-faction enemies** - no faction line appears (conditional rendering via `v-if`)
4. **Mouse leave** - tooltip disappears
5. **Mouse move** - tooltip follows cursor
6. **Equipment tooltips** - still work correctly (no regression)

## Technical Notes

### Faction Resolution

The faction name is resolved at the `availableEnemies` computed level by:
1. Looking up the enemy template via `enemyTemplateId`
2. Checking if `template.factionId` exists
3. Finding the matching faction in the `factions` array
4. Extracting the `name` field (or defaulting to empty string)

This approach ensures faction data is available when the tooltip is shown, without requiring additional lookups at render time.

### Tooltip Event Pattern

The implementation follows the exact same event emission pattern used for loot items:
- Emit `show-tooltip` with item data object and initial cursor position
- Emit `move-tooltip` with updated cursor position
- Emit `hide-tooltip` on mouse leave

This consistency ensures the tooltip system handles enemy and equipment tooltips identically.

## Self-Check: PASSED

**Created files:** None (expected)

**Modified files:**
- [FOUND] src/composables/useCombat.ts
- [FOUND] src/components/CombatPanel.vue
- [FOUND] src/App.vue

**Commits:**
- [FOUND] c61ca80 (Task 1 - factionName support)
- [FOUND] 9b94ece (Task 2 - tooltip events and rendering)

All expected artifacts verified.
