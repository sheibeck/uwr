---
phase: quick-66
plan: 01
subsystem: ui
tags: [log-panel, ux, defaults]
dependency_graph:
  requires: []
  provides: [log-panel-open-default]
  affects: [panel-manager, first-login-experience]
tech_stack:
  added: []
  patterns: [default-panel-state]
key_files:
  created: []
  modified:
    - src/composables/usePanelManager.ts
    - src/App.vue
decisions: []
metrics:
  duration_minutes: 2
  completed_date: 2026-02-13
---

# Quick Task 66: Make Log Panel Open by Default for New Players

**One-liner:** Log panel now opens by default for new players via optional `open` field in panel defaults, while existing players retain their saved preferences.

---

## Overview

**Problem:** New players saw no Log panel because all panels defaulted to `open: false` in usePanelManager. The log is essential for understanding game events, so it should be visible by default.

**Solution:** Extended usePanelManager to accept optional `open` field in panel defaults, allowing the log panel to start open for new players while preserving existing players' saved state.

---

## Changes Made

### 1. Type Signature Update (usePanelManager.ts)

Extended the `defaults` parameter type to include optional `open?: boolean`:

```typescript
defaults: Record<string, { x: number; y: number; w?: number; h?: number; open?: boolean }>
```

### 2. Initialization Logic (usePanelManager.ts)

Changed panel initialization from hardcoded `open: false` to configurable:

```typescript
panels[id] = {
  open: def.open ?? false,  // Use provided default or fall back to closed
  x: def.x,
  y: def.y,
  w: def.w ?? 0,
  h: def.h ?? 0,
  zIndex: 10,
};
```

### 3. Log Panel Default (App.vue)

Added `open: true` to log panel configuration:

```typescript
log: { x: 40, y: 400, w: 500, h: 300, open: true },
```

---

## Behavior Analysis

### New Players (No Saved State)
- No localStorage data → initialize from defaults
- Log panel gets `open: true` from defaults
- Panel is visible on first login
- User can close it; preference persists

### Existing Players (Saved State)
- localStorage or server has saved state
- `loadFromStorage()` and server sync use `Object.assign` to overwrite defaults
- Existing `open: false` (if closed) or `open: true` (if open) preserved
- No behavior change for existing players

### Always-Visible Panels (group, travel, hotbar)
- Still forced open via explicit assignment in:
  - `loadFromStorage()` at lines 120-122
  - Server sync watcher at lines 399-401
- Unaffected by this change

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Commits

| Commit | Message | Files |
|--------|---------|-------|
| acfe35c | feat(quick-66): make log panel open by default for new players | src/App.vue, src/composables/usePanelManager.ts |

---

## Self-Check: PASSED

**Files modified:**
- FOUND: src/composables/usePanelManager.ts
- FOUND: src/App.vue

**Commits exist:**
- FOUND: acfe35c

**Changes verified:**
- Type signature includes `open?: boolean` ✓
- Initialization uses `def.open ?? false` ✓
- Log panel default includes `open: true` ✓

---

## Impact

**User Experience:**
- New players immediately see log panel with combat messages, loot notifications, and faction standing changes
- Improves first-login experience by surfacing essential feedback

**Technical:**
- Panel defaults system now supports configurable visibility
- No breaking changes to existing panel state persistence
- Pattern can be reused for other panels that should default open

**Testing Notes:**
- Clear localStorage + no server state → log panel opens
- Existing closed log → stays closed
- Existing open log → stays open
- Always-visible panels (group/travel/hotbar) → still forced open
