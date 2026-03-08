---
phase: quick-343
plan: 01
subsystem: combat-ui
tags: [combat, narrative, ux, timer]
dependency_graph:
  requires: [useCombat, NarrativeConsole, NarrativeMessage, App.vue combat watchers]
  provides: [round lifecycle markers, live countdown timer, action feedback, resolving indicator]
  affects: [combat narrative flow, player feedback loop]
tech_stack:
  patterns: [phase-aware watcher injection, computed round headers, reactive timer display]
key_files:
  modified:
    - src/composables/useCombat.ts
    - src/components/NarrativeMessage.vue
    - src/components/NarrativeConsole.vue
    - src/App.vue
decisions:
  - Round headers use Unicode double-line box chars for visual distinction
  - Timer element lives in scroll area (not fixed bar) for natural flow
  - Action submit feedback shows action type (Ability/Auto-attack/Flee)
  - Combat start/end markers use same combat_round_header kind as round markers
metrics:
  duration: 3min
  completed: 2026-03-08
---

# Quick Task 343: Clear Combat Round Flow with Distinct Headers

Phase-aware combat round lifecycle markers with live countdown timer, action feedback, and resolving indicators in the narrative stream.

## One-liner

Round lifecycle markers (header/footer), live countdown timer with color transitions, action submission feedback, and resolving pulse indicator for clear combat flow.

## Task Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add round header/footer kinds and live timer prop plumbing | b076d1d | useCombat.ts, NarrativeMessage.vue, NarrativeConsole.vue |
| 2 | Rewrite combat event injection watchers in App.vue | 0b4e903 | App.vue |

## What Changed

### useCombat.ts
- Removed static timer text `(Xs remaining)` from `actionPromptMessage` -- timer is now live in NarrativeConsole
- Changed round summary header from `--- Round N ---` to `--- Round N Results ---`
- Added `roundHeaderMessage` computed: returns `=== ROUND N ===` with Unicode double-line chars
- Added `roundEndMessage` computed: returns `--- Round N complete ---` when round is resolved

### NarrativeMessage.vue
- Added `combat_round_header` kind (#ffa94d orange) with bold, centered, larger font, letter-spacing
- Added `combat_resolving` kind (#ffd43b gold) with pulsing animation (narrativePulse)
- Updated template style bindings for the two new kinds

### NarrativeConsole.vue
- Added props: `roundTimeRemaining`, `roundState`, `hasSubmittedAction`
- Added countdown timer element in scroll area: yellow text, turns red and pulses at 3 seconds
- Added "Action locked in. Awaiting resolution..." indicator (green italic)
- Added "Round resolving..." indicator (gold italic pulsing)

### App.vue
- Rewrote combat event injection from 3 simple watchers to 5 phase-aware lifecycle watchers
- Round start watcher: injects header + status bars + action prompt (deduplicated per round key)
- Action submit watcher: injects type-specific confirmation (Ability/Auto-attack/Flee)
- Round resolved watcher: injects summary bars + round end marker
- Combat start watcher: injects "COMBAT BEGINS" header if no round yet
- Combat end watcher: injects "COMBAT ENDED" footer on combat teardown
- Passes roundTimeRemaining, roundState, hasSubmittedAction props to NarrativeConsole
- Destructures myAction for action type display

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- TypeScript type-check passes (only pre-existing LogWindow.vue error, unrelated)
