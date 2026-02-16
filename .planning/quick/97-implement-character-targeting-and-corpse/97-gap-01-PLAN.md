---
phase: quick-97
plan: gap-01
gap_closure: true
source: quick-97-UAT.md test 9
tags: [bugfix, selection-clearing, reactivity]
---

# Gap Closure: Fix corpse selection not clearing on location change

## Issue

Moving to a different location clears character and NPC selections, but corpse selection persists incorrectly.

## Root Cause

LocationGrid.vue maintained its own **local** `selectedCorpseId` ref (line 253) that was never cleared. When traveling away, App.vue's watcher cleared `selectedCorpseTarget`, but LocationGrid's local state persisted. Upon returning to the location, the stale local state caused the highlight to reappear.

This differed from character and NPC selection, which correctly used props from App.vue.

## Solution

1. Pass `selectedCorpseTarget` as prop `:selected-corpse-id` from App.vue to LocationGrid
2. Add `selectedCorpseId: bigint | null` to LocationGrid's props interface
3. Remove local `selectedCorpseId` ref from LocationGrid
4. Update highlight logic to use `props.selectedCorpseId` instead of local state
5. Update `toggleSelectCorpse` to check prop instead of local state

This matches the pattern already used for `selectedCharacterTargetId`.

## Changes

**src/App.vue (line 329)**
- Added: `:selected-corpse-id="selectedCorpseTarget"` prop to LocationGrid

**src/components/LocationGrid.vue**
- Line 212: Added `selectedCorpseId: bigint | null;` to props interface
- Line 159: Changed highlight check from `selectedCorpseId?.toString()` to `props.selectedCorpseId?.toString()`
- Line 253: Removed local `const selectedCorpseId = ref<bigint | null>(null);`
- Lines 286-294: Simplified `toggleSelectCorpse` to check prop and emit only (no local state)

## Testing

1. Select a corpse by left-clicking it (brown highlight appears)
2. Travel to a different location
3. Travel back to the original location
4. Verify corpse highlight is cleared (no highlight persists)
5. Verify can re-select corpse normally

## Files Modified

- src/App.vue (1 line added)
- src/components/LocationGrid.vue (4 changes: +1 prop, -1 ref, 2 logic updates)
