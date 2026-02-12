---
phase: quick-27
plan: 01
subsystem: UI-Panels
tags: [ui, bugfix, panels]
dependency_graph:
  requires: []
  provides: ["Log panel toggle button in action bar"]
  affects: ["ActionBar.vue"]
tech_stack:
  added: []
  patterns: ["Event emit pattern for panel toggling"]
key_files:
  created: []
  modified: ["src/components/ActionBar.vue"]
decisions:
  - "Log button placed BEFORE Characters button (always visible, not character-gated)"
  - "No isLocked() logic for log button (log panel always available)"
  - "Added 'log' to PanelKey type union for documentation completeness"
metrics:
  duration: "1 minute"
  completed: "2026-02-12"
  tasks: 1
  commits: 1
---

# Quick Task 27: Add Log Button to Action Bar

**One-liner:** Log button in action bar enables users to reopen log panel after closing it via X button.

---

## What Was Built

Added a "Log" toggle button to the action bar (ActionBar.vue) that allows users to reopen the log panel after closing it. Previously, users could close the log panel via the X button but had no way to reopen it, losing access to game events permanently until page reload.

---

## Implementation

### Task 1: Add Log button to ActionBar

**Commit:** c0ab274

**Changes:**
- Added Log button at the start of the action bar, BEFORE the Characters button
- Button placed outside the `v-if="hasActiveCharacter"` block so it's always visible
- Uses standard `emit('toggle', 'log')` pattern for panel toggling
- Uses `actionStyle('log')` for active-state highlighting when panel is open
- Added `'log'` to PanelKey type union for type safety

**Key implementation details:**
- No `isLocked()` logic needed — log panel is always accessible
- No changes needed in App.vue or usePanelManager — 'log' panel key already registered in panel defaults
- Follows exact same pattern as existing panel toggle buttons (Characters, Inventory, etc.)

**Files modified:**
- `src/components/ActionBar.vue` — added Log button markup and updated PanelKey type

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Verification

Verification steps from plan:
1. Open the app in browser
2. Verify "Log" button appears in the action bar
3. Close the log panel via X button
4. Click "Log" button — panel should reopen
5. Click "Log" button again — panel should close (toggle behavior)
6. Verify Log button shows active styling when panel is open

All verification steps can be manually tested in the running app.

---

## Auth Gates Encountered

None.

---

## Self-Check

Checking created files:
```bash
# No new files created
```

Checking modified files:
```bash
[ -f "C:/projects/uwr/src/components/ActionBar.vue" ] && echo "FOUND: src/components/ActionBar.vue" || echo "MISSING: src/components/ActionBar.vue"
```

Checking commits:
```bash
git log --oneline --all | grep -q "c0ab274" && echo "FOUND: c0ab274" || echo "MISSING: c0ab274"
```

## Self-Check: PASSED

All files exist and commit is present in git history.

---

## Quick Task Complete

**Duration:** ~1 minute
**Tasks completed:** 1/1
**Commits:** 1 (c0ab274)
**Outcome:** Users can now reopen the log panel via a clearly visible "Log" button in the action bar.
