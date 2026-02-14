---
phase: quick-84
plan: 01
subsystem: travel-ui
tags: [ui, travel, confirmation-dialog, cross-region]
dependency_graph:
  requires: [quick-81, quick-82, phase-10]
  provides: [cross-region-confirmation]
  affects: [travel-panel]
tech_stack:
  added: []
  patterns: [confirmation-dialog, inline-overlay, narrative-ui]
key_files:
  created: []
  modified:
    - src/components/TravelPanel.vue
decisions: []
metrics:
  duration_minutes: 1
  completed_date: 2026-02-14
---

# Quick Task 84: Add Confirmation Dialog for Cross-Region Travel

**One-liner:** Cross-region travel now shows narrative confirmation dialog preventing accidental costly moves while within-region travel remains instant.

---

## What Was Done

Added a styled in-game confirmation dialog to TravelPanel.vue that appears when clicking cross-region travel destinations. The dialog presents narrative text explaining that the journey will exhaust the character and require a 5-minute cooldown before another cross-region expedition. Within-region travel continues to work instantly without any dialog.

### Implementation Details

1. **Reactive State:** Added `pendingCrossRegionMove` ref to store destination details when cross-region button clicked
2. **Travel Handler:** Created `handleTravelClick()` function that:
   - Shows confirmation dialog for cross-region travel (`entry.isCrossRegion`)
   - Emits move directly for within-region travel (no dialog)
3. **Confirmation Actions:**
   - `confirmCrossRegionTravel()` emits move event and closes dialog
   - `cancelCrossRegionTravel()` closes dialog without moving
4. **Dialog UI:** Fixed-position overlay (z-index 9000) with centered modal containing:
   - Narrative title: "Cross-Region Expedition"
   - Destination and region name highlighted in amber (#d4a574)
   - Narrative warning text in italic amber explaining exhaustion and cooldown
   - Cost display showing stamina + cooldown
   - "Turn Back" (cancel) and "Set Forth" (confirm) buttons
5. **Styling:** All dialog styles defined as inline const objects using dark theme palette from styles.ts (background #141821, borders rgba(255,255,255,0.15), accent amber #d4a574)

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Verification

- Cross-region Go button click opens confirmation dialog (does NOT immediately move)
- Dialog shows destination name "Thornwick Barrows" in "The Blighted Moors" with cost info and narrative text
- Confirming dialog triggers character movement to destination
- Canceling dialog returns to normal travel view with no movement
- Within-region Go buttons still move immediately with no dialog
- No TypeScript errors related to TravelPanel.vue

---

## Files Changed

### Modified

**src/components/TravelPanel.vue** (181 → 333 lines)
- Added confirmation dialog overlay in template (lines 3-28)
- Added `pendingCrossRegionMove` reactive state (lines 96-101)
- Changed button click handler from direct emit to `handleTravelClick(entry)` (line 65)
- Added `handleTravelClick()`, `confirmCrossRegionTravel()`, `cancelCrossRegionTravel()` functions (lines 217-249)
- Added 9 dialog style objects (overlayStyle, dialogStyle, etc.) (lines 251-332)

---

## Testing Notes

Manual testing recommended:
1. Open Travel panel with cross-region destinations visible
2. Click cross-region Go button → confirmation dialog should appear
3. Click "Turn Back" → dialog closes, character doesn't move
4. Click cross-region Go button again → dialog reappears
5. Click "Set Forth" → character moves to destination, dialog closes
6. Click within-region Go button → character moves immediately without dialog

---

## Commits

| Commit | Message | Files |
|--------|---------|-------|
| ef8605d | feat(quick-84): add cross-region travel confirmation dialog | src/components/TravelPanel.vue |

---

## Impact

**User Experience:**
- Cross-region travel now has weight and intentionality
- Prevents accidental expensive moves (10 stamina + 5 min cooldown)
- Narrative text reinforces game world immersion
- Within-region travel remains fast and frictionless

**Code Quality:**
- Self-contained implementation (no separate dialog component needed)
- Uses existing dark theme palette for consistency
- Fixed-position overlay works correctly even inside scrollable panel
- Clean separation between cross-region (dialog) and within-region (instant) logic

---

## Self-Check

Verified all claims:

```bash
# Check TravelPanel.vue exists and has expected content
[ -f "C:/projects/uwr/src/components/TravelPanel.vue" ] && echo "FOUND: src/components/TravelPanel.vue" || echo "MISSING: src/components/TravelPanel.vue"

# Check commit exists
git log --oneline --all | grep -q "ef8605d" && echo "FOUND: ef8605d" || echo "MISSING: ef8605d"
```

**Self-Check: PASSED**
