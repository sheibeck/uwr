---
phase: quick-19
plan: 01
subsystem: ui-log
tags:
  - user-experience
  - scroll-behavior
  - quality-of-life
dependency-graph:
  requires: []
  provides:
    - smart-auto-scroll-behavior
  affects:
    - log-window-component
tech-stack:
  added: []
  patterns:
    - reactive-scroll-state-tracking
    - conditional-auto-scroll
    - user-intent-detection
key-files:
  created: []
  modified:
    - src/components/LogWindow.vue
    - src/ui/styles.ts
decisions:
  - name: "30px threshold for bottom detection"
    rationale: "Accounts for browser rounding and provides forgiving UX"
  - name: "isAtBottom initialized to true"
    rationale: "User starts at bottom on first load, should see auto-scroll immediately"
  - name: "Button appears only when scrolled up AND events exist"
    rationale: "Avoids showing button on empty log or when already at bottom"
metrics:
  duration: "~2 minutes"
  completed: "2026-02-12T17:47:22Z"
---

# Quick Task 19: Add Smart Auto-Scroll to LogWindow

**One-liner:** Smart auto-scroll with user scroll detection - auto-scrolls new log entries only when user is at bottom, pauses when scrolled up, and shows "New messages" jump button

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement smart auto-scroll and jump-to-bottom button | 6530580 | src/components/LogWindow.vue, src/ui/styles.ts |

## Implementation Summary

### Problem
LogWindow previously force-scrolled to bottom on every new event, making it impossible to review log history during active gameplay (combat, exploration). Users couldn't scroll up without being yanked back down.

### Solution
Implemented smart auto-scroll that:
1. **Tracks user scroll position** via `isAtBottom` ref
2. **Only auto-scrolls when user is already at bottom** (30px threshold)
3. **Pauses auto-scroll when user scrolls up** to read history
4. **Resumes auto-scroll automatically** when user manually scrolls back to bottom
5. **Shows "New messages" button** when scrolled up and new events arrive

### Key Changes

**LogWindow.vue:**
- Added `isAtBottom` ref initialized to `true` (user starts at bottom)
- Added `checkIfAtBottom()` function with 30px threshold for scroll detection
- Added `@scroll` event listener on log list div
- Modified `combinedEvents` watch to call `scrollToBottom()` only when `isAtBottom.value === true`
- Added `jumpToBottom()` function that sets `isAtBottom = true` and scrolls
- Added button with `v-if="!isAtBottom && combinedEvents.length > 0"` conditional rendering
- Button displays unicode down arrow (↓) and "New messages" text

**styles.ts:**
- Added `logJumpBtn` style with absolute positioning (bottom center), semi-transparent background, monospace font
- Updated `log` style to add `position: 'relative'` for button anchor point

### Behavior Flow

1. **Initial state:** `isAtBottom = true`, auto-scroll active
2. **New event arrives:** Watch fires → `isAtBottom` check passes → scrolls to bottom
3. **User scrolls up:** `@scroll` fires → `checkIfAtBottom()` → `isAtBottom = false`
4. **New event while scrolled up:** Watch fires → `isAtBottom` check fails → no scroll, button appears
5. **User clicks button:** `jumpToBottom()` → sets `isAtBottom = true` → scrolls → button disappears
6. **User manually scrolls to bottom:** `@scroll` fires → `checkIfAtBottom()` → `isAtBottom = true` → button disappears

### Edge Cases Handled

- **Empty log:** Button doesn't appear (`combinedEvents.length > 0` check)
- **No character selected:** Behavior unchanged (empty state message)
- **Near-bottom scroll:** 30px threshold allows for browser rounding/fractional pixels
- **Rapid scroll:** Event listener updates `isAtBottom` state on every scroll event
- **Button click while at bottom:** No-op (button not visible when at bottom)

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

**TypeScript Compilation:**
- No new type errors introduced
- Pre-existing type errors in project are unrelated to LogWindow changes

**Manual Testing Required:**
1. Open game, generate log entries → auto-scroll should work at bottom
2. Scroll up in log → new entries should NOT force scroll back down
3. Verify "New messages" button appears when scrolled up
4. Click button → should jump to bottom and button should disappear
5. After jumping to bottom → auto-scroll should resume for new entries
6. Manually scroll back to bottom → button should disappear without clicking

## Self-Check: PASSED

**Created files exist:**
- N/A (no new files created)

**Modified files exist:**
```
FOUND: src/components/LogWindow.vue
FOUND: src/ui/styles.ts
```

**Commits exist:**
```
FOUND: 6530580
```

**Commit verification:**
```bash
$ git log --oneline -1
6530580 feat(quick-19): add smart auto-scroll to LogWindow
```

All artifacts verified successfully.
