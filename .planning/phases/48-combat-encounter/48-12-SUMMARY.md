---
phase: 48-combat-encounter
plan: 12
subsystem: client-mobile-combat
tags: [vue-client, mobile, combat, sheet]
status: complete
requires: ["48-11"]
provides:
  - "EncounterStrip: mobile strip with a header button (Open encounter list), a 44px Account button and one chip per hostile (con color, 4px HP sliver, wind-up hourglass, target ring, aria-pressed, inert when defeated)"
  - "Sheet meta slot between the title and the spacer"
  - "MoreSheet logoutOnly mode (Log out as the only row)"
  - "FeedShell safeBottom prop (bottom safe-area inset on the compact composer)"
  - "AppFrame mobile combat branch: tab bar and location row hidden, strip before the feed, 'encounter' sheet with round meta and EncounterPanel variant sheet, Log-out-only More sheet from the account button"
affects: [48]
tech-stack:
  added: []
  patterns: ["strip derives hostile views with the same inputs as EncounterPanel; tap goes through the combat controller only", "combat gated on game.combat.active", "slotted meta styled by the parent"]
key-files:
  created:
    - src/combat/EncounterStrip.vue
    - src/combat/EncounterStrip.test.ts
  modified:
    - src/frame/Sheet.vue
    - src/frame/Sheet.test.ts
    - src/frame/MoreSheet.vue
    - src/frame/FeedShell.vue
    - src/frame/AppFrame.vue
    - src/frame/AppFrame.layout.test.ts
key-decisions:
  - "The account button sits on the strip header row (CONTEXT), not the vitals strip (RESEARCH Pitfall 9); flagged for the owner"
  - "Combat sheets and the composer pad by env(safe-area-inset-bottom) because the tab bar that covered it is gone"
  - "Chip and strip use the hostile view's aria label, which adds difficulty meaning and the boss word"
requirements-completed: [CMB-01, CMB-02, CMB-03, CMB-05, CMB-06]
metrics:
  tasks: 3
  files: 8
  completed: 2026-10-06
---

# Phase 48 Plan 12: Mobile encounter strip, encounter sheet and Log out in combat Summary

At 390x844 a fight now replaces the tab bar and the location row with a compact encounter strip (header, account button, tappable hostile chips); the header opens the Encounter sheet with the round meta and the full panel, and the account button opens a Log-out-only sheet so a mobile player can always leave. Client only: nothing under `spacetimedb/` or `src/module_bindings/` changed; nothing was published or started.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Mobile encounter strip | 852c938a | EncounterStrip.vue, EncounterStrip.test.ts |
| 2 | Sheet meta slot, Log-out-only More sheet, composer safe area | 8ae9c58e | Sheet.vue (+test), MoreSheet.vue, FeedShell.vue |
| 3 | Mobile combat layout, encounter sheet, Log out in combat | 5570d3b2 | AppFrame.vue, AppFrame.layout.test.ts |

## What was built

- **EncounterStrip** (`section.encounter-strip`, aria-label 'Encounter', prop `collapsed`, emits `open` and `account` with the clicked element): the header button reads 'Encounter · n hostiles' (living count) with a `PhCaretUp` and aria-label 'Open encounter list'; the 44px `PhDotsThree` button is 'Account'. The chip row (not shown when collapsed or before the enemy binding applies) has a `button.hostile-chip` per hostile in ascending id: name in its con class (ellipsized), `PhHourglassMedium` in `--color-con-orange` when it has a wind-up, a 4px sliver, accent ring and `aria-pressed` on the target, 45% opacity and `aria-disabled` when defeated. A tap on a living chip calls `requestTarget`; a defeated chip calls nothing. The row is `overflow-x: auto`, `flex-wrap: nowrap`, scrollbar hidden; chips are `flex: 1 0 96px`, min 44px high.
- **Sheet**: `<slot name="meta" />` between the h4 and the spacer; header unchanged without it.
- **MoreSheet**: `logoutOnly` hides the four screen rows and the separator.
- **FeedShell**: `safeBottom` adds the `safe-bottom` class; `.compact.safe-bottom .composer` pads `calc(8px + env(safe-area-inset-bottom))`.
- **AppFrame (mobile branch)**: `combatActive` from `game.combat.active`. In combat: LocationRow and TabBar are not rendered; the strip sits between NoticeBars and the feed, hidden (display none) while a sheet is open, collapsed with the keyboard; FeedShell gets `safe-bottom`; MoreSheet gets `logout-only`; a Sheet titled 'Encounter' shows `span.sheet-meta` (`sheetMeta(roundNumber, controller.timer)`, 12px neutral-400 tabular-nums) and `<EncounterPanel variant="sheet" />`; More and Encounter sheets carry `bottom-safe` (`:deep(.sheet.bottom-safe) { padding-bottom: env(safe-area-inset-bottom) }`). When the fight ends `useScreens` (plan 05) closes the encounter sheet and the strip is removed, the tab bar and location row render again (no animation is involved). The desktop branch is unchanged.

## Pinned assertions changed deliberately

None. All Phase 45/47/48 tests run unchanged (including the Phase 45 mobile layout cases and `screens.test.ts` with 7 ids). New cases were added: `EncounterStrip.test.ts` (new file), Sheet/MoreSheet/FeedShell cases in `Sheet.test.ts`, a 'mobile combat' block in `AppFrame.layout.test.ts`.

## Verification

- `pnpm exec vitest run src/combat/EncounterStrip.test.ts src/styles`: 79 passed.
- `pnpm exec vitest run src/frame/Sheet.test.ts src/frame/frameContract.test.ts src/styles`: 100 passed.
- `pnpm exec vitest run src/frame src/combat src/styles`: 635 passed.
- `pnpm exec vitest run --dir src --maxWorkers=2`: 94 files, 1823 tests passed (1791 before). No new failures.
- `pnpm exec vue-tsc -b`: exit 0.
- Design guards (the `src/styles` suites and `frameContract`): pass. No new tokens, no literal colors, scale spacing, 10/12/14/20 sizes, 400/500 weights, no `v-html`, no `<svg`, no new media or container queries.
- Acceptance greps hold: EncounterStrip.vue has `Open encounter list`, `PhDotsThree`, `PhCaretUp`, `requestTarget`, `overflow-x: auto`; Sheet.vue `name="meta"`; MoreSheet.vue `logoutOnly`; FeedShell.vue `safe-area-inset-bottom`; AppFrame.vue `EncounterStrip`, `variant="sheet"`, `logout-only`, `sheetMeta`.

## Deviations from Plan

None - plan executed as written. (The tests cover each behavior bullet: XSS text, chip order, targeting, inert defeated chips, collapsed and not-applied, keyboard-open harness, end-of-fight with the sheet open, Log out end to end.)

## Auth gates

None.

## Known Stubs

None. This closes the 48-05 note: `activeScreen` 'encounter' is now set (strip header) and the sheet body is drawn.

## Threat Flags

None beyond the register. T-48-41: names, aria labels and the meta render as text nodes (img onerror test). T-48-42: Log out reachable via the account button, tested end to end in AppFrame. T-48-43: defeated chips inert (tested); the controller also skips dead enemies.

## Flagged assumptions (carried for the verifier)

- CMB-05 prohibition (a mobile player must never lack a way to log out in a fight): delivered by the strip's Account button and the Log-out-only sheet; verified by a mount test, not on a device.
- A5: the account button sits on the strip header (CONTEXT), not the vitals strip (RESEARCH Pitfall 9). For the owner at UAT.
- The chip's aria label is the hostile view's (adds difficulty meaning and the boss word to the UI-SPEC's shorter label).
- The target ring's 12px glow sits inside an `overflow-x: auto` row, so it is clipped at the row edge (the 1px inset ring is unaffected). Not checked visually.
- If the More sheet is open when a fight ends it stays open and switches to the full list (only the encounter sheet closes itself).
- Safe-area padding is a planner addition (tab bar hidden); `env()` resolves to 0 in browsers without a notch, so no visible change there.

## Deferred owner verification

At 390x844 (device or devtools), in a fight:
1. The tab bar and the location row are gone; below the notices a strip shows 'ENCOUNTER · n HOSTILES' with a caret and, at its right, a dots button. Hostile chips sit under it (name in its difficulty color, thin HP sliver). When the fight ends the strip vanishes and the tab bar and location row come back at once.
2. One hostile fills the strip width; with many (6 or more) the chips scroll sideways and never wrap; long names ellipsize.
3. Tap a chip: the ring moves to it once the server confirms. The chip of a hostile that is winding up shows a small orange hourglass. A defeated chip is dimmed and does nothing.
4. Tap the header: an 'Encounter' sheet opens with 'Round N · 6s' (or 'Resolving…') beside the title, the hostile cards with wind-up lines and the threat block. Tapping a card targets it and keeps the sheet open. Esc or the close button closes it. With 8 hostiles and a long threat list the body scrolls inside the sheet. If the fight ends while it is open the sheet closes itself.
5. Tap the dots button: a 'More' sheet with only 'Log out'. Log out works.
6. Open the keyboard (tap the input): the strip shrinks to its header row; it returns on blur.
7. On a notched phone the composer and the open sheets keep clear of the home indicator.
8. Judge the account button placement (strip header vs. the vitals strip row) and the clipped target glow on the chips.

## Self-Check: PASSED

- FOUND: src/combat/EncounterStrip.vue, src/combat/EncounterStrip.test.ts, src/frame/Sheet.vue, src/frame/Sheet.test.ts, src/frame/MoreSheet.vue, src/frame/FeedShell.vue, src/frame/AppFrame.vue, src/frame/AppFrame.layout.test.ts
- FOUND commits: 852c938a, 8ae9c58e, 5570d3b2
