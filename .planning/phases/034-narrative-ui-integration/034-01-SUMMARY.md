---
phase: 034-narrative-ui-integration
plan: "01"
subsystem: narrative-ui
tags: [sell-commands, perk-bonus, event-colors, tdd]
dependency_graph:
  requires: []
  provides: [sell-perk-fix, sell-all-junk-command, sell-n-command, kind-colors-social-ability]
  affects: [spacetimedb/src/reducers/intent.ts, spacetimedb/src/reducers/items.ts, src/components/NarrativeMessage.vue]
tech_stack:
  added: [vitest (client devDependency)]
  patterns: [TDD red-green, extracted constants module for Vue SFC testability]
key_files:
  created:
    - src/components/NarrativeMessage.colors.ts
    - src/components/NarrativeMessage.test.ts
    - spacetimedb/src/reducers/intent.test.ts (extended with sell tests)
  modified:
    - spacetimedb/src/reducers/intent.ts
    - spacetimedb/src/reducers/items.ts
    - src/components/NarrativeMessage.vue
decisions:
  - "Extracted KIND_COLORS to NarrativeMessage.colors.ts because Vue SFC <script setup> blocks cannot use export keyword"
  - "Used inline computeSellValue/getPerkBonusByField logic in tests because helpers transitively import spacetimedb/server (ESM spacetime: protocol) which breaks vitest"
  - "sell N <item> uses includes() for partial name matching (consistent with other sell logic)"
metrics:
  duration: "9 minutes"
  completed_date: "2026-03-10"
  tasks_completed: 2
  files_modified: 6
---

# Phase 034 Plan 01: Sell Commands + Event Feed Colors Summary

Wire sell commands (single, bulk, junk) into the narrative intent system with correct perk bonuses, and complete event feed color coding with social and ability entries verified by tests.

## What Was Built

### Task 1: Fix sell perk bonus + add sell all junk and sell N commands

Added `getPerkBonusByField` import to `intent.ts` and restructured the sell command block into three branches:

1. **sell junk / sell all junk**: Iterates unequipped inventory, filters `isJunk=true` items, applies `getPerkBonusByField('vendorSellBonus')` then `computeSellValue` per item, deletes affixes+instances, shows summary: "You sell N junk item(s) for X gold (Y% perk bonus): item1, item2, and N more."

2. **sell N \<item\>**: Parses regex `/^(\d+)\s+(.+)$/i`, finds matching items by name (includes match), sells `min(N, available)` non-equipped items with perk+CHA bonus each.

3. **sell \<item\> (single)**: Unchanged logic but now applies `getPerkBonusByField` before `computeSellValue`.

Fixed `sell_all_junk` reducer in `items.ts` to also apply `getPerkBonusByField` and `computeSellValue`, making the reducer path consistent with the intent path.

### Task 2: Complete event feed color coding with tests

Extracted `KIND_COLORS` to `NarrativeMessage.colors.ts` (necessary because Vue SFC `<script setup>` blocks cannot export named symbols). Added two new entries:
- `social: '#74c0fc'` (blue — for social-typed events)
- `ability: '#74c0fc'` (blue — for ability use events)

Updated `NarrativeMessage.vue` to import from the colors module. Created 14-test suite verifying all required keys and hex values.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extracted KIND_COLORS to separate module**
- **Found during:** Task 2 implementation
- **Issue:** `export` keyword is not valid in Vue SFC `<script setup>` blocks — causes Vue compiler error
- **Fix:** Created `NarrativeMessage.colors.ts` as a pure TS module. Both the test and the component import from it.
- **Files modified:** `src/components/NarrativeMessage.colors.ts` (created), `src/components/NarrativeMessage.vue` (import added), `src/components/NarrativeMessage.test.ts` (import updated)

**2. [Rule 3 - Blocking] Used inline helper logic in intent.test.ts**
- **Found during:** Task 1 test writing
- **Issue:** `helpers/economy.ts` and `helpers/renown.ts` both transitively import `spacetimedb/server` via `helpers/events.ts`, which uses `spacetime:` ESM protocol. This protocol is rejected by Node's ESM loader, causing `ERR_UNSUPPORTED_ESM_URL_SCHEME`.
- **Fix:** Inline `computeSellValue` function in test file; use `simulatePerkBonus` inline that mirrors `getPerkBonusByField` logic with a test-only perk pool

**3. [Rule 3 - Blocking] Installed vitest for client**
- **Found during:** Task 2 test creation
- **Issue:** Client `package.json` had no test framework; `npx vitest run` requires it to be installed
- **Fix:** `npm install --save-dev vitest`

### Pre-existing Issues (Out of Scope)

See `deferred-items.md` for pre-existing `buildLookOutput` test failures (2 tests fail before and after this plan because the helper now wraps location names in color tags).

## Self-Check: PASSED

Files created/modified:
- [x] `spacetimedb/src/reducers/intent.ts` — getPerkBonusByField import + 3 sell branches
- [x] `spacetimedb/src/reducers/items.ts` — sell_all_junk perk+computeSellValue fix
- [x] `spacetimedb/src/reducers/intent.test.ts` — 25 sell command tests added
- [x] `src/components/NarrativeMessage.colors.ts` — KIND_COLORS with social+ability
- [x] `src/components/NarrativeMessage.vue` — imports from colors module
- [x] `src/components/NarrativeMessage.test.ts` — 14 KIND_COLORS tests

Commits:
- 241d117: feat(034-01): add sell all junk, sell N, and perk bonus to sell commands
- 9ca1630: feat(034-01): complete KIND_COLORS with social and ability entries + tests
