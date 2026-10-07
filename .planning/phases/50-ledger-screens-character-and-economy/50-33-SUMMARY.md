---
phase: 50-ledger-screens-character-and-economy
plan: 33
subsystem: ledger-result-card
tags: [vue, ledger, result-card, dialog, focus-trap, live-region, accessibility, client, gap-closure]
status: complete

requires:
  - phase: 50-31
    provides: "ResultCardView (resultCardView), ledger.lastResult"
  - phase: 50-32
    provides: "backpack tiles; screens that will host the card"
provides:
  - "ResultCard.vue: the shared result dialog (desktop card, mobile bottom sheet) with focus trap, Esc, scrim and a polite live region"
  - "useActionResult: arm by runner key, open by seq and kind, close with focus return"
  - "InlineConfirm optional warning icon (PhWarning in --color-con-yellow)"
affects: [50-34, 50-37, 50-38]

key-files:
  created:
    - src/ledger/ResultCard.vue
    - src/ledger/ResultCardDialog.test.ts
    - src/ledger/useActionResult.ts
    - src/ledger/useActionResult.test.ts
  modified:
    - src/ledger/InlineConfirm.vue
    - src/ledger/parts.test.ts

key-decisions:
  - "One card for Crafting and Inventory (Crafted, Salvaged, Discover recipes)"
  - "Esc closes the card (the mock draws none); it is prevented in the capture phase so the drawer stays open"
  - "No auto-dismiss timer (as the mock)"
  - "The card opens only for a result the screen asked for: arm on pending, open on a higher seq of the armed kind"

requirements-completed: [LDG-01, LDG-10, LDG-11]

duration: 30min
completed: 2026-10-06
---

# Phase 50 Plan 33: Shared result card and the opening rule Summary

One accessible result card (centered 440px card on desktop, bottom sheet on mobile) and the small composable that decides when it opens, plus the optional warning icon on InlineConfirm. No screen hosts the card yet (plans 50-34, 50-37 and 50-38 do); no server or bindings change.

## Commits

| Commit | Message |
|--------|---------|
| 774533c6 | feat(50-33): useActionResult arms on the action, opens on the server row, returns focus (Task 1) |
| 6c645d1f | feat(50-33): ResultCard dialog and bottom sheet with focus trap, Esc, live region; InlineConfirm warning icon (Task 2) |

## What changed

- **useActionResult.ts.** A sync watch on `runner.pending` arms each mapped key that newly enters pending with its kind, `lastResult.seq ?? 0n` as the baseline and the focused element (null for body). A watch on `lastResult` opens (sets `shown`) when armed, the kind matches and seq is above the baseline, and spends the arm. `close()` clears `shown` and, after nextTick, focuses the opener when connected, else calls `fallbackFocus` once. A new action while a card is open re-arms but keeps the first opener. The keys map is read with `Object.prototype.hasOwnProperty.call`.
- **ResultCard.vue.** Props `view`, `mobile`, `actions`; emits `close` and `action`. A `p.sr-only[role=status][aria-live=polite]` is always rendered and holds `view.announce` for each new seq (kept after close). With a view: scrim (`@click.self` closes) holding `section[role=dialog][aria-modal]` labelled by the h4 and described by the sub (useId). Focus goes to Done on open. Tab is wrapped by `trapTabKey` on the section and stopped there, so the drawer's document trap never sees it. Esc is a capture-phase document listener that prevents the default and emits close (added only while a card is shown, removed on clear and unmount). Pending actions are aria-disabled and emit nothing. Chips are desktop only. All server strings are mustache text.
- **InlineConfirm.vue.** Optional `warning` prop (default false) renders `PhWarning` (`.warn-icon`, `--color-con-yellow`, aria-hidden) before the prompt. Without it the DOM is unchanged.

## Mock-to-scale mappings

| Mock | Used |
|------|------|
| card padding 22, gap 14 | 24, 16 |
| icon box 84 / 72, glyph 40 / 34 | 84 / 72, glyph 40 / 32 |
| icon box radius 14 | `--radius-lg` (14px) |
| kicker tracking 0.12em | 0.1em |
| title 20 (mobile 18) | 20 |
| effect 12.5, footer 11, row icon 15 | 12, 12, 16 |
| chip padding 3px 9px, chip gap 6 | 4px 8px, 8 |
| row padding 7px 10px / min-height 34 / mobile 40 | padding 8, min-height 32 / mobile 44 |
| sheet padding 22px 16px 24px | 24px 16px, gap 16 |
| mobile buttons 48 | 44 |
| ring var for the icon box | inline box-shadow built from the view's color string (a custom `--ring` property fails the tokens guard, which allows only defined tokens) |

## TDD evidence and gates

- **Task 1.** RED: `useActionResult.test.ts` failed to load (module missing, no tests ran). GREEN: with actionRunner.test.ts, 2 files, 22 tests pass; `vue-tsc -b` exit 0.
- **Task 2.** RED: the dialog test failed to load (ResultCard.vue missing) and the new InlineConfirm warning case failed (no `.warn-icon`). GREEN: `vitest run src/ledger src/styles src/frame/frameContract.test.ts` 17 files, 269 tests pass (designContract, colors.guard, tokens.client pin 23, scrollbars, frameContract included); `vue-tsc -b` exit 0. One mid-task failure: tokens.client rejected a `--ring` custom property, fixed by computing the shadow inline.
- **Greps.** `trapTabKey(` 1, `stopPropagation` 1, `aria-live="polite"` 1, `role="dialog"` 1, `PhWarning` 2 in InlineConfirm, v-html / `<svg` / 1200px query 0; no `replaceAll`, `.at(`, `Object.hasOwn(` or banned word.

## Deviations from Plan

**1. [Rule 3 - Blocking] Test file renamed `ResultCardDialog.test.ts`.** The plan names `src/ledger/ResultCard.test.ts`, but on this case-insensitive Windows filesystem that is the same path as the tracked `src/ledger/resultCard.test.ts` (the 50-31 model test); writing it overwrote that file. The 50-31 file was restored byte-for-byte from `git show HEAD:src/ledger/resultCard.test.ts` (git shows no diff for it) and the new tests live in `ResultCardDialog.test.ts`. The on-disk name of the restored file now carries the capital R; git tracks it unchanged. The plan's `files_modified` entry `ResultCard.test.ts` is therefore `ResultCardDialog.test.ts`.

**2. [Interpretation] Single list title and footer on mobile.** The mocks differ (the crafting mobile sheet drops the list title and footer, the inventory one keeps the footer). One component serves both, so the list title and footer show on mobile as well; stat chips are desktop only as the plan says.

## Notes for the screen plans

- The host screen root must be `position: relative` (the scrim is `position: absolute; inset: 0; z-index: 5`).
- Pass `actions` only for reducer or navigation backed actions; each is `{ id, label, icon?, tone, pending?, ariaLabel? }`.
- `useActionResult` keys are the runner keys the screen uses, for example `{ craft: 'craft', 'item-salvage': 'salvage', discover: 'discover' }`.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-50-138 (text nodes, escape test), T-50-139 (arm and seq rule, tested), T-50-140 (Tab trap with propagation stopped, scoped Esc, focus return, tested) and T-50-141 (pending actions inert, tested) are implemented.

## Self-Check: PASSED

- Files exist: ResultCard.vue, ResultCardDialog.test.ts, useActionResult.ts, useActionResult.test.ts, and the edited InlineConfirm.vue and parts.test.ts.
- Commits 774533c6 and 6c645d1f exist on master.
