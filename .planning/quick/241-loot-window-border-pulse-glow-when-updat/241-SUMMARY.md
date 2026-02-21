---
phase: 241-loot-window-border-pulse-glow-when-updat
plan: 01
subsystem: ui
tags: [vue, css-animation, keyframe, reactive-ref, watcher]

# Dependency graph
requires: []
provides:
  - Amber/gold border pulse animation on the loot panel whenever new loot is added to pendingLoot
affects: [loot-panel, App.vue]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ref-driven CSS animation: toggle a boolean ref to apply/remove an animation class, use setTimeout to auto-clear the ref after animation completes"

key-files:
  created: []
  modified:
    - src/App.vue

key-decisions:
  - "Merged pulse logic into existing pendingLoot watcher (no new watcher) to keep watchers consolidated"
  - "Used count > (prevCount ?? 0) guard so decreasing item count (taking loot) never re-triggers the pulse"
  - "4 cycles x 0.9s = 3.6s animation with 3.5s JS timer — timer fires slightly before animation ends for clean teardown"
  - "lootPulseTimer clearTimeout before re-setting ensures mid-pulse arrivals restart the glow cleanly"

patterns-established:
  - "Pulse pattern: const pulsing = ref(false); let timer = null; on trigger: clearTimeout(timer); pulsing.value = true; timer = setTimeout(() => { pulsing.value = false; timer = null; }, duration)"

requirements-completed: [LOOT-PULSE-01]

# Metrics
duration: 8min
completed: 2026-02-21
---

# Quick Task 241: Loot Window Border Pulse Glow Summary

**Amber/gold CSS keyframe border pulse on the loot panel div, triggered by ref watcher when pendingLoot item count increases, auto-clearing after 3.5 seconds**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-21T20:05:00Z
- **Completed:** 2026-02-21T20:13:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `lootPanelPulsing` ref and `lootPulseTimer` to App.vue script setup
- Extended existing `pendingLoot` watcher to trigger the pulse when item count increases (not decreases)
- Applied conditional `:class="{ 'loot-panel-pulse': lootPanelPulsing }"` to the loot panel outer div
- Added `@keyframes lootBorderPulse` and `.loot-panel-pulse` CSS to the style block (4 cycles x 0.9s)

## Task Commits

Each task was committed atomically:

1. **Tasks 1 + 2: Add ref, watcher logic, class binding, and CSS keyframe** - `db9a88e` (feat)

**Plan metadata:** (created with SUMMARY)

## Files Created/Modified
- `src/App.vue` - Added lootPanelPulsing ref, pulse timer, updated pendingLoot watcher, conditional class on loot panel div, lootBorderPulse keyframe and .loot-panel-pulse CSS class

## Decisions Made
- Merged Tasks 1 and 2 into a single commit since both touch only App.vue and form one coherent feature unit
- Used `count > (prevCount ?? 0)` as the increase guard so the pulse never fires when items are taken
- Timer duration (3500ms) set slightly shorter than total animation duration (3600ms) to avoid a brief flash of the amber border color after animation ends

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npm run type-check` does not exist; used `npx vue-tsc --noEmit` instead. Confirmed zero errors introduced by these changes (all pre-existing unrelated errors).

## Next Phase Readiness
- Feature is complete and self-contained
- No follow-up work required

## Self-Check: PASSED

- `src/App.vue` modified: FOUND
- Commit `db9a88e` exists: FOUND
- `lootPanelPulsing` ref present in script setup: FOUND (line 1292)
- `:class="{ 'loot-panel-pulse': lootPanelPulsing }"` on loot panel div: FOUND (line 226)
- `@keyframes lootBorderPulse` in style block: FOUND (line 2361)
- `.loot-panel-pulse` class in style block: FOUND (line 2369)

---
*Phase: 241-loot-window-border-pulse-glow-when-updat*
*Completed: 2026-02-21*
