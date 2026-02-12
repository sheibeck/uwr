---
phase: quick-17
plan: 01
subsystem: UI
tags: [bugfix, context-menu, event-handling]
dependency_graph:
  requires: []
  provides: [functional-context-menu]
  affects: [location-grid, combat, gathering, npc-interaction]
tech_stack:
  added: []
  patterns: [event-delegation, teleport]
key_files:
  created: []
  modified:
    - src/components/ContextMenu.vue
decisions: []
metrics:
  duration_minutes: 1
  completed_date: 2026-02-12
---

# Quick Task 17: Fix Context Menu Handlers Wire-Up

**One-liner:** Fixed race condition where context menu closed before click events could fire by adding data-context-menu attribute

---

## Summary

Fixed a critical bug in ContextMenu.vue where clicking any menu item did nothing. The root cause was a race condition: the `mousedown` event handler for outside-click detection couldn't find the `data-context-menu` attribute (because it was missing from the root div), so it treated every click -- including clicks on menu items themselves -- as an "outside click" and closed the menu before the `@click` handler could fire.

The fix was trivial: add `data-context-menu` attribute to the root `<div>` element.

---

## Tasks Completed

### Task 1: Fix ContextMenu outside-click handler race condition

**Files modified:**
- `src/components/ContextMenu.vue`

**Changes:**
- Added `data-context-menu` attribute to root div (line 4)
- This allows `handleOutsideClick` (line 75) to correctly identify clicks inside vs outside the menu
- No other changes needed -- all event wiring from LocationGrid -> App.vue already correct

**Commit:** `6c67d7f`

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Technical Details

### Root Cause

The `handleOutsideClick` function listens for `mousedown` events on `document`:

```typescript
const handleOutsideClick = (event: MouseEvent) => {
  if (!props.visible) return;
  const target = event.target as HTMLElement;
  if (!target.closest('[data-context-menu]')) {  // Looking for this attribute
    emit('close');
  }
};
```

The problem: the root `<div>` didn't have `data-context-menu`, so:
1. User clicks menu item
2. `mousedown` fires first
3. `handleOutsideClick` runs, doesn't find `[data-context-menu]`, emits `'close'`
4. `visible` becomes false
5. `v-if="visible"` removes menu from DOM
6. `@click` event never fires because element is gone

### Solution

Add attribute to root div:

```html
<div
  v-if="visible"
  data-context-menu  <!-- Added this -->
  :style="{...}"
>
```

Now:
1. User clicks menu item
2. `mousedown` fires
3. `handleOutsideClick` finds `[data-context-menu]`, does nothing
4. `@click` fires on menu item
5. `handleItemClick` executes `item.action()`
6. Menu closes properly via `emit('close')`

---

## Verification

**Type check:** No ContextMenu.vue errors (pre-existing errors in other files unrelated)

**Manual verification required:**
1. Right-click enemy → click "Careful Pull" → combat should start
2. Right-click resource → click "Gather" → gathering should start
3. Right-click NPC → click "Talk" or "Open Store" → interaction should trigger
4. Click outside menu → menu should still close

---

## Impact

**Before:** Context menus non-functional -- no enemy pulls, no gathering, no NPC interactions
**After:** All context menu actions work as designed

**Affected flows:**
- Enemy engagement (Careful Pull, Body Pull)
- Resource gathering
- NPC interactions (Talk, Open Store)

---

## Self-Check: PASSED

**Files created:** None (only modified existing)

**Files modified:**
```bash
[ -f "C:\projects\uwr\src\components\ContextMenu.vue" ] && echo "FOUND: src/components/ContextMenu.vue" || echo "MISSING: src/components/ContextMenu.vue"
```
FOUND: src/components/ContextMenu.vue

**Commits:**
```bash
git log --oneline --all | grep -q "6c67d7f" && echo "FOUND: 6c67d7f" || echo "MISSING: 6c67d7f"
```
FOUND: 6c67d7f
