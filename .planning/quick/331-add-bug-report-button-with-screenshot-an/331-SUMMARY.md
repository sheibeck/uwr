---
phase: quick-331
plan: 01
subsystem: ui
tags: [bug-report, screenshot, github-integration, html2canvas]
dependency-graph:
  requires: []
  provides: [bug-report-modal, screenshot-capture]
  affects: [action-bar, app-wiring]
tech-stack:
  added: [html2canvas]
  patterns: [modal-overlay, viewport-capture, clipboard-api]
key-files:
  created:
    - src/components/BugReportModal.vue
  modified:
    - src/components/ActionBar.vue
    - src/App.vue
    - package.json
decisions:
  - "Bug Report button placed after Help, before character-gated buttons -- always visible even without active character"
  - "Screenshot copied to clipboard via Clipboard API for easy pasting into GitHub issue body"
  - "togglePanel made async to support html2canvas await -- safe since emitter does not await return"
metrics:
  duration: 232s
  completed: 2026-02-26
---

# Quick Task 331: Add Bug Report Button with Screenshot Summary

Bug Report button in ActionBar captures viewport screenshot via html2canvas, presents modal with preview/title/description, opens pre-filled GitHub issue URL on submit with screenshot on clipboard.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Install html2canvas and create BugReportModal | 4a7a938 | src/components/BugReportModal.vue, package.json |
| 2 | Wire Bug Report button in ActionBar and App.vue | b629227 | src/components/ActionBar.vue, src/App.vue |

## What Was Built

### BugReportModal.vue
- Fixed overlay backdrop matching CraftingModal pattern (rgba(0,0,0,0.7), z-index 9500)
- Screenshot preview in bordered container (max-height 200px, object-fit contain)
- Title input and description textarea with dark theme styling
- Submit button disabled when title empty; opens `https://github.com/sheibeck/uwr/issues/new` with encoded title/body
- Copies screenshot PNG to clipboard via Clipboard API (try/catch for browser compat)
- Cancel button and backdrop click close the modal

### ActionBar.vue
- Added `bugReport` to PanelKey union type
- Added "Bug Report" button after Help, before `v-if="hasActiveCharacter"` block (always visible)

### App.vue
- Imported BugReportModal and html2canvas
- Added `showBugReport` and `screenshotDataUrl` refs
- Made `togglePanel` async with bugReport intercept that captures screenshot via `html2canvas(appEl)`
- Rendered BugReportModal after HelpOverlay with close handler that clears both refs

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- `npm ls html2canvas` confirms installation (v1.4.1)
- `npx vite build` succeeds (pre-existing TS warnings unrelated to changes)
- No TypeScript errors from new/modified files

## Self-Check: PASSED
