---
created: 2026-10-09T18:00:00.000Z
title: The Here card drops the danger rating sentence (rail space)
area: ui
files:
  - spacetimedb/src/data/density_lines.ts:151 (RATING_LINES)
  - src/rails/HereCard.vue (rating chip and its line)
  - src/rails/HereCard.test.ts:257, src/rails/rating.test.ts:60
  - .planning/phases/51.3.1.1-density-pools/51.3.1.1-UI-SPEC.md:556,636
---

## Problem

Owner, 2026-10-09: "add this to the right menu widening phase. Don't show the `You should not be here alone. You are not alone.` text in the right menu in the curernt location menu. We don't need that text there and right-hand rail space is valuable realestate."

The Here card shows the place's danger rating with a sentence under it (Deadly: "You should not be here alone. You are not alone."; Safe, Quiet and Risky have their own). It costs a line of rail space at every place.

## Solution

Pulled into Phase 51.5.1 Motion and Polish (success criterion 6). Drop the sentence from the Here card and keep the rating itself. Default: all four sentences go; confirm with the owner, and whether the sentence stays as the rating chip's tooltip (the Map already uses it as a title). Update the 51.3.1.1 UI-SPEC rating rows and the HereCard tests. Client only.
