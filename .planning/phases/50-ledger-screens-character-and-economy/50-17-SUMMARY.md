---
phase: 50-ledger-screens-character-and-economy
plan: 17
subsystem: client-stats
tags: [vue, stats, screen, mobile]

requires:
  - phase: 50-12
    provides: "FrameControls isDesktop, ScreenDef.meta slot"
  - phase: 50-16
    provides: "statsModel, format, PerkChooser"
provides:
  - "src/stats/StatsScreen.vue: the Stats body (desktop columns and mobile tabs)"
  - "src/stats/StatsMeta.vue: header meta and the Level up tag"
  - "src/stats/RenownPanel.vue, StatBars.vue, DerivedTable.vue, FactionList.vue"
affects: [50-23 screen registration]

tech-stack:
  added: []
  patterns:
    - "Section components take model output as props; the screen owns the data wiring and the layout"

key-files:
  created:
    - src/stats/RenownPanel.vue
    - src/stats/StatsMeta.vue
    - src/stats/StatBars.vue
    - src/stats/DerivedTable.vue
    - src/stats/FactionList.vue
    - src/stats/StatsScreen.vue
    - src/stats/StatsScreen.test.ts
  modified: []

key-decisions:
  - "Base stats, Derived and Faction standing are small section components (StatBars, DerivedTable, FactionList) so the desktop columns and the mobile tab panels share one markup; the screen calls statBars, derivedRows and factionRows and passes the 'Derived stats' caption"
  - "StatsMeta renders on the desktop drawer only: the mobile sheet shows the same name, level, XP and Level up tag in its identity row, so a sheet meta would repeat them"
  - "The perk row heading is a visually hidden h6 'Perks' (tabindex -1), the focus target after a perk is taken"
  - "Below 1200px the grid is two columns (base stats and renown beside derived over factions) and one scroll region"

requirements-completed: [LDG-03]

status: complete
duration: 40min
completed: 2026-10-06
---

# Phase 50 Plan 17: Stats screen Summary

The Stats screen composes the base stat bars with the gear segment, Renown with the inline perk chooser, the Derived table and Faction standing as columns in the desktop drawer, and as an identity row plus four tabs in the 390x844 sheet, with one action runner shared by the renown panel and the notice line. Registration in SCREENS is Plan 23.

## Components Plan 23 registers

- `StatsScreen` (`src/stats/StatsScreen.vue`): the screen body, no props.
- `StatsMeta` (`src/stats/StatsMeta.vue`): the `ScreenDef.meta` component, no props. `{Name} · Level {n} · {xp} / {next} XP · Bound at {place}` plus a non-interactive `Level up available` tag (a span with `PhArrowFatUp`, no button) when `pendingLevels > 0`. Desktop only (see key decisions).

## Other components

- `RenownPanel` props `runner`, `mobile?`: heading `Renown · Rank {n}, {name}`, 4px progressbar (`aria-label` `Renown to next rank`, values in points), the points line, owned perks as accent tags (`No perks yet.` with none), a `Choose rank {n} perk` tag-outline button with `aria-expanded` only while a choice is pending, and the inline `PerkChooser`. After `taken` the chooser closes and focus moves to the perk row heading; Not now and Esc return focus to the choose button.
- `StatBars` props `bars`, `mobile?`; `DerivedTable` props `rows`, `caption` (sr-only caption, `th scope="row"`, no thead, right-aligned values); `FactionList` props `rows` (name, tier word in its tier color, 4px bar, per-row `aria-label`, empty line).

## Verification

- `pnpm exec vitest run src/stats src/ledger src/styles --maxWorkers=2`: 15 files, 236 tests passed (StatsScreen.test.ts 36: RenownPanel 11, StatsMeta 3, desktop 13, mobile 9).
- `pnpm exec vue-tsc -b`: exit 0.
- `grep -c "Derived stats" src/stats/StatsScreen.vue` prints 1; `grep -c "statBars(" ...` prints 1; `grep -c 'role="progressbar"' src/stats/RenownPanel.vue` prints 1. The Plan 16 source test (no deferred card word in any non-test file under src/stats) still passes, and a screen test checks the same for every component.

## Task commits

1. `ddc156c4` renown panel and stats header meta
2. `fcd54a3f` stats screen composition
3. `eb70deed` frame breakpoint guard allows the 1200px tier

## Deviations from Plan

**1. [Interpretation, additive files] Three extra section components**
- `StatBars.vue`, `DerivedTable.vue` and `FactionList.vue` are not in the plan's file list. Writing the three sections inline would have duplicated their markup between the desktop columns and the mobile tab panels. The plan's greps (`statBars(`, `Derived stats`) still match StatsScreen.vue.

**2. [Interpretation] StatsMeta is desktop only**
- The frame renders `ScreenDef.meta` in both shells; on mobile the identity row already carries the same line and the Level up tag, so the sheet meta would show them twice.

**2. [Rule 3 - Blocking] Frame breakpoint guard widened**
- `src/frame/frameContract.test.ts` ("every width media query is exactly the 900px pair") failed on the 1200px column switch the UI-SPEC "Layout Contract" asks for as a viewport media query. The guard now also allows `(min-width: 1200px)` (one entry and a comment); DESKTOP_QUERY and the 900px switch are unchanged. Found by the full-suite gate (targeted runs do not include the frame tests). Commit: eb70deed. Plans 20 and 22 use the same 1200px tier and are covered by this change.

## Known Stubs

None.

## Threat Flags

None. T-50-56 (faction rows and perk tags are text nodes; escape tests for a faction name, a perk name and a perk description) and T-50-57 (standings read from the existing per-sender view; the model additionally filters to the active character id) hold.

## Self-Check: PASSED

- FOUND: the seven files above; commits ddc156c4, fcd54a3f, eb70deed
