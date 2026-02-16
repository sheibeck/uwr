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

The watcher at App.vue:1199-1203 watches `currentLocation` (a computed object). While this should work, watching the computed object may have reactivity timing issues compared to watching the primitive locationId value directly.

## Solution

Change the watcher to watch `selectedCharacter.value?.locationId` directly instead of the `currentLocation` computed object. This ensures the watcher triggers reliably when the locationId changes, regardless of how the Location object is recomputed.

## Changes

**src/App.vue (lines 1198-1203)**
- BEFORE: `watch(currentLocation, () => { ... })`
- AFTER: `watch(() => selectedCharacter.value?.locationId, () => { ... })`
- Updated comment to clarify we're watching locationId directly

## Testing

1. Select a corpse by left-clicking it (brown highlight appears)
2. Travel to a different location
3. Verify corpse selection is cleared (no brown highlight, corpse-targeted abilities require new target)

## Files Modified

- src/App.vue (1 line changed, comment updated)
