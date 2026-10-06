---
phase: 50-ledger-screens-character-and-economy
plan: 16
subsystem: client-stats
tags: [vue, stats, renown, factions, perks]

requires:
  - phase: 50-03
    provides: "perkDisplayName, factionTier"
  - phase: 50-11
    provides: "gearStatTotals"
  - phase: 50-13
    provides: "action runner conventions"
provides:
  - "src/stats/format.ts: formatPermille, formatVendorMods"
  - "src/stats/statsModel.ts: the Stats model"
  - "src/stats/PerkChooser.vue: inline select-then-Take chooser"
affects: [50-17 stats screen]

tech-stack:
  added: []
  patterns:
    - "Integer-only permille formatter (no float rounding)"
    - "Capture-phase Escape on the document for an inline chooser, same as InlineConfirm"

key-files:
  created:
    - src/stats/format.ts
    - src/stats/format.test.ts
    - src/stats/statsModel.ts
    - src/stats/statsModel.test.ts
    - src/stats/PerkChooser.vue
    - src/stats/PerkChooser.test.ts
  modified: []

key-decisions:
  - "renownView derives the rank from the points with the shared RENOWN_RANKS thresholds (not the stored currentRank), so the heading, the bar and the points line always agree"
  - "statBars takes the character, the owned items, the templates and the affixes and calls gearStatTotals itself"
  - "factionRows takes an optional character id, so another character's standing on the same account never shows"

requirements-completed: [LDG-03]

status: complete
duration: 25min
completed: 2026-10-06
---

# Phase 50 Plan 16: Stats model and perk chooser Summary

Every Stats number and label now comes from tested functions over the subscribed rows and the server's shared rules, and a pending renown perk can be chosen deliberately: select an option, then Take.

## statsModel.ts exports (src/stats/statsModel.ts)

- `barScaleMax(totals)`: `max(20, largest total rounded up to a multiple of 10)`.
- `statBars(character, items, templates, affixes): { scaleMax, bars: StatBar[] }`; `StatBar = { key, name, abbr, base, gear, total, baseWidth, gearWidth, srText }` (widths are fractions of the bar; order Strength, Dexterity, Intelligence, Wisdom, Charisma).
- `renownView(row | null): RenownView` = `{ rank, name, points, heading, fraction, valueNow, valueMin, valueMax, highest, text }` (`'300 / 500 renown'`, `'{points} renown · Highest rank'`).
- `ownedPerkNames(perks, abilities): string[]` (passive keys through `perkDisplayName`, abilities with source 'Renown' by name, no repeats).
- `pendingChoice(rows): { rank, options } | null` (lowest rank, that rank's rows by id) and `perkOptionTags(option): string[]`.
- `factionRows(standings, factions, characterId?): FactionRow[]` with `{ id, name, standing, tier, group: 'hostile' | 'unfriendly' | 'neutral' | 'friendly', width, ariaLabel }`.
- `derivedRows(character): { label, text }[]` (Hit, Dodge, Parry, Crit x4, Armor Class, Perception, Search, CC Power, Vendor Buy / Sell; no Block).
- `statsMetaText(character, locations)` and `statsMobileLine(character)`.

`src/stats/format.ts`: `formatPermille(value: bigint)` (150n gives `15.00%`, integer math) and `formatVendorMods(buy, sell)` (`−2.00% / +3.50%`, U+2212).

## PerkChooser props and emits

Props: `choice: PendingChoice` (the `pendingChoice` result), `runner: ActionRunner`, `mobile?: boolean`. Emits `close` (Not now, or Escape, prevented in the capture phase) and `taken` (when `chooseRenownPerk` resolved). Take runs `runner.run('perk', () => reducers.chooseRenownPerk({ characterId, perkId }))`, is `aria-disabled` until an option is chosen, while pending and offline. The component does not move focus; the screen moves it to the perk row heading after `taken` (Plan 17).

## Verification

- `pnpm exec vitest run src/stats src/styles --maxWorkers=2`: 7 files, 104 tests passed (format 5, statsModel 25, PerkChooser 10).
- `pnpm exec vue-tsc -b`: exit 0.
- `grep -c "@game-data/faction_rules"` and `"@game-data/perk_rules"` in statsModel.ts both print 1; `grep -c "Your choice is permanent." PerkChooser.vue` prints 1. The source test confirms no non-test file under src/stats contains the deferred card word.

## Task commits

1. `18b9713f` stats model and percent formatter
2. `9c76b164` perk chooser

## Deviations from Plan

None to scope. Interpretations: the renown rank comes from the points (see key decisions); `statBars` takes the item inputs rather than a pre-summed total so the model owns the gear sum; the perk kind word is capitalized in its tag (`Heal`).

## Known Stubs

None.

## Threat Flags

None. T-50-53 (text nodes only; escape test for perk name and description), T-50-54 (tests use mocked reducers only; no paid generation call), T-50-55 (select then Take, `Your choice is permanent.`) hold.

## Self-Check: PASSED

- FOUND: src/stats/format.ts, statsModel.ts, PerkChooser.vue and their tests
- FOUND commits: 18b9713f, 9c76b164
