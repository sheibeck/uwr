---
phase: quick-394
plan: 01
subsystem: narrative-formatting
tags: [ui, formatting, color, narrative, commands]
dependency_graph:
  requires: []
  provides: [gold-narrative-headers]
  affects: [look.ts, intent.ts]
tech_stack:
  added: []
  patterns: [color-tag-template-strings]
key_files:
  created: []
  modified:
    - spacetimedb/src/helpers/look.ts
    - spacetimedb/src/reducers/intent.ts
decisions:
  - "Applied gold (#fbbf24) color tag to all narrative command headers for visual consistency"
  - "Inventory equipped items now show item descriptions matching backpack display pattern"
metrics:
  duration: ~10 minutes
  completed: 2026-03-10
  tasks_completed: 2
  files_modified: 2
---

# Quick-394: Apply Gold Formatting to All Narrative Commands Summary

Gold (#fbbf24) color-tag formatting applied to all five narrative command outputs (look, stats, abilities, character, inv), replacing === delimiter headers and adding item descriptions to inventory.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add gold formatting to look output location name | 59bfb65 | spacetimedb/src/helpers/look.ts |
| 2 | Apply gold headers to stats, abilities, character, and inventory commands | 91ce26f | spacetimedb/src/reducers/intent.ts |

## Changes Made

### Task 1 — look.ts

- `buildLookOutput()`: location name now rendered as `{{color:#fbbf24}}${location.name}{{/color}}` instead of plain text

### Task 2 — intent.ts

**STATS handler:**
- Main header changed from `=== Name — Level X Race Class ===` to gold-formatted
- "Resources:", "Base Stats:", "Combat:" sub-headers wrapped in gold color tags

**ABILITIES handler:**
- Header changed from `=== Abilities (N) ===` to gold-formatted
- Each individual ability name is now gold-formatted
- `[choose ability]` link is gold-formatted

**CHARACTER handler:**
- Header changed from `=== Name ===` to gold-formatted
- "Racial Bonuses:" sub-header (both race_definition and legacy race code paths) gold-formatted
- "Level Bonus (every 2 levels):" sub-header gold-formatted

**INVENTORY handler:**
- "Equipment:" header gold-formatted
- "Gold:" label gold-formatted
- Equipped items now show item description below the stat line (matching backpack pattern)

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `grep -c "color:#fbbf24" spacetimedb/src/reducers/intent.ts` → 14 (PASS, expected 10+)
- `grep "color:#fbbf24" spacetimedb/src/helpers/look.ts` → matches location name line (PASS)
- `grep "template.description" spacetimedb/src/reducers/intent.ts` → matches in both inventory (line 199) and backpack (line 253) handlers (PASS)
- No `=== ... ===` header delimiter strings remain in stats/abilities/character handlers

## Self-Check: PASSED

- spacetimedb/src/helpers/look.ts: modified (gold location name)
- spacetimedb/src/reducers/intent.ts: modified (14 gold tags, item descriptions in inv)
- Commits 59bfb65 and 91ce26f both exist in git log
