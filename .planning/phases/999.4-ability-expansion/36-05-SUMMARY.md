---
phase: 36-ability-expansion
plan: 05
subsystem: renown-perk-ui
tags: [renown, pending-perks, client-ui, header-indicator, composable]
dependency_graph:
  requires: [36-04]
  provides: [useRenownPerks, hasPendingRenownPerks-prop, renown-perk-console-display]
  affects: [NarrativeHud, NarrativeConsole, App.vue, useCoreData, ability-display]
tech_stack:
  added: []
  patterns: [useSkillChoice-mirror, clickNpcKeyword-delegation, onPerkClick-indirection]
key_files:
  created:
    - src/composables/useRenownPerks.ts
    - src/module_bindings/pending_renown_perk_table.ts
    - src/module_bindings/choose_renown_perk_reducer.ts
  modified:
    - src/composables/data/useCoreData.ts
    - src/App.vue
    - src/components/NarrativeHud.vue
    - src/components/NarrativeConsole.vue
    - spacetimedb/src/reducers/intent.ts
    - src/module_bindings/index.ts
    - src/module_bindings/types.ts
    - src/module_bindings/ability_template_table.ts
decisions:
  - "Used onPerkClick() method instead of (window as any).clickNpcKeyword in Vue template — window is not in template scope"
  - "connActive param kept in useRenownPerks interface for consistency with useSkillChoice, renamed to _connActive to suppress unused warning"
  - "Ability source label uses [Source] prefix format: '[Race] Trollish Regeneration', '[Renown] Merchant Haggle'"
metrics:
  duration: ~7 minutes
  completed_date: 2026-03-10
  tasks_completed: 2
  files_changed: 10
---

# Phase 36 Plan 05: Renown Perk Client UI Summary

**One-liner:** Client now shows gold RENOWN PERK header indicator and perk selection panel when pending_renown_perk rows exist, mirroring the skill choice flow from level-ups.

## What Was Built

### Task 1: useRenownPerks composable and App.vue wiring

1. **spacetime generate** — Regenerated client bindings to include `PendingRenownPerk` table and `chooseRenownPerk` reducer (new from plan 04).

2. **useCoreData.ts** — Added `pendingRenownPerks` subscription and reactive rebind for `pending_renown_perk` table, following the identical pattern used for `pendingSkills`.

3. **useRenownPerks.ts** — New composable mirroring `useSkillChoice`:
   - Accepts `{ selectedCharacter, pendingRenownPerks, connActive }`
   - `myPendingRenownPerks`: computed filtering to current character's id
   - `hasPendingRenownPerks`: computed boolean
   - `pendingRenownRank`: computed returning `rank` from first pending perk
   - `chooseRenownPerk(perkName)`: finds perk by name (case-insensitive), calls `conn.reducers.chooseRenownPerk({ characterId, perkId })`

4. **App.vue** — Wired the composable:
   - Imports `useRenownPerks`
   - Destructures `pendingRenownPerks` from `useGameData`
   - Calls `useRenownPerks` and destructures result
   - Passes `:has-pending-renown-perks` and `:pending-renown-perks` to `NarrativeConsole`
   - In `clickNpcKeyword`: adds renown perk check (step 1b) right after skill choice check

### Task 2: Header indicator and console display

1. **NarrativeHud.vue** — Added gold/amber RENOWN PERK indicator:
   - New `hasPendingRenownPerks?: boolean` prop
   - Indicator span after NEW SKILL indicator, uses `#fd7e14` amber color (distinct from `#ffd43b` skill yellow)
   - Title: "Renown rank-up reward available! Check the console."
   - Style: `renownPerkIndicatorStyle` with `skillPulse` animation (reuses existing keyframe)

2. **NarrativeConsole.vue** — Added perk choice display section:
   - New `hasPendingRenownPerks?: boolean` and `pendingRenownPerks?: any[]` props
   - Passes `hasPendingRenownPerks` through to embedded `NarrativeHud`
   - Renders perk selection block in scroll area when `pendingRenownPerks.length > 0`:
     - Header: "Your growing reputation has unlocked new perks for Renown Rank {rank}. Choose one:"
     - Each perk: amber `[PerkName]` clickable span + description + kind/cooldown or "(passive bonus)"
   - Click delegates via `onPerkClick(perkName)` method → `window.clickNpcKeyword?.(perkName)` (template can't access `window` directly)

3. **intent.ts abilities command** — Shows ability source in brackets before name:
   - `[Race] Trollish Regeneration` for race abilities (`source='Race'`)
   - `[Renown] Merchant's Haggle` for renown abilities (`source='Renown'`)
   - No prefix for class abilities (`source` is null/undefined → `sourceLabel` is `''`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Pattern] Template cannot access `window` directly**
- **Found during:** Task 2
- **Issue:** Vue SFC template scope doesn't include `window`, causing TS error TS2339
- **Fix:** Created `onPerkClick(perkName)` helper method that calls `window.clickNpcKeyword?.()` from script scope
- **Files modified:** `src/components/NarrativeConsole.vue`
- **Commit:** b8bcb32

## Commits

- `3ea3e3f` — feat(36-05): create useRenownPerks composable and wire into App.vue
- `b8bcb32` — feat(36-05): add RENOWN PERK header indicator, console perk display, and ability source labels

## Self-Check: PASSED
