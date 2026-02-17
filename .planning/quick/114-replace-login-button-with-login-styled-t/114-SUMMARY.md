---
phase: quick
plan: 114
subsystem: ui/splash
tags: [splash-screen, ui, styling]
key-files:
  modified:
    - src/components/SplashScreen.vue
    - src/ui/styles.ts
decisions:
  - Used monospace font for >> Login << to reinforce terminal/game aesthetic
  - Disabled state uses opacity 0.4 + cursor:default instead of hiding element
  - Two style keys (splashLoginText + splashLoginTextDisabled) bound as array for clean Vue conditional
metrics:
  duration: 3min
  completed: 2026-02-16
  tasks: 1
  files: 2
---

# Quick Task 114: Replace Login Button with >> Login << Styled Text

**One-liner:** Login button replaced with amber monospace `>> Login <<` text span — no border, background, or padding; disabled state dims to 0.4 opacity.

## What Was Done

Replaced the `<button>` element on the splash screen with a `<span>` that renders `>> Login <<` as plain styled text:

- No button chrome: no border, no background, no padding, no border-radius
- Monospace font for game terminal aesthetic
- Amber/gold color (`rgba(248, 201, 74, 0.9)`) matching existing splash palette
- `cursor: pointer` preserved on active state; `cursor: default` when disabled
- Disabled guard: `@click="connActive && $emit('login')"` — click is a no-op when not connected
- Disabled appearance: `opacity: 0.4` via `splashLoginTextDisabled` style bound conditionally
- Enter key handler from quick-113 (`window keydown`) is unaffected — lives in `<script setup>`, not on the button

## Style Changes

Removed `splashLogin` (button-oriented: border, padding, border-radius, fontFamily serif).

Added two new style keys in `src/ui/styles.ts`:
- `splashLoginText` — active state (amber, monospace, pointer cursor, letter-spacing)
- `splashLoginTextDisabled` — overlaid when `!connActive` (opacity 0.4, default cursor)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `src/components/SplashScreen.vue` modified — `<span>` with `>> Login <<`
- [x] `src/ui/styles.ts` modified — `splashLogin` replaced with `splashLoginText` + `splashLoginTextDisabled`
- [x] Commit b20bcd8 exists
