---
phase: 49-character-creation-interview
plan: 09
subsystem: client
tags: [vue, creation, screen, mobile]

requires:
  - phase: 49-06
    provides: "CreationData hub contract, CREATION_KEY, createInertCreation"
  - phase: 49-07
    provides: "StepBar, ChoiceBlock, CreationComposer"
  - phase: 49-08
    provides: "CreationFeed, CreationSheet"
provides:
  - "src/creation/CreationView.vue: the full-viewport creation screen composed over the injected hub (desktop rail, mobile Sheet chip)"
affects: [49-10]

tech-stack:
  added: []
  patterns:
    - "Layout-only view: every visible value derives from the hub's rows, no optimistic state"
    - "Reuse by import only: PreFrameHeader, NoticeBars, Sheet, useBreakpoint, useKeyboardOpen; the feed region is hidden with v-show while the Sheet is open so the composer keeps its draft"

key-files:
  created:
    - src/creation/CreationView.vue
    - src/creation/CreationView.test.ts
    - src/creation/CreationView.mobile.test.ts
  modified: []

key-decisions:
  - "lastKnown is a ref fed by a watcher over the derived step view, so an unknown server step keeps the bar at the last known position"
  - "One StepBar per layout branch shares one template ref, so the close handler can return focus to the chip with focusChip() after nextTick"
  - "The Sheet is closed when the layout becomes desktop (watch on isDesktop)"

requirements-completed: [CRE-01, CRE-02, CRE-03]

coverage:
  - id: W1
    description: "Mounting starts the interview through the hub once, unmounting releases it, lines persist across a remount"
    requirement: CRE-01
    verification:
      - kind: unit
        ref: "src/creation/CreationView.test.ts#CreationView: mount lifecycle"
        status: pass
    human_judgment: false
  - id: W2
    description: "Desktop: header, notices, step bar, race cards, Surprise me, typed text, sheet rail, per-step choice blocks, hold at Enter the realm with Retry finding a region, unknown step, offline, img-onerror text"
    requirement: CRE-03
    verification:
      - kind: unit
        ref: "src/creation/CreationView.test.ts"
        status: pass
    human_judgment: false
  - id: W3
    description: "Mobile 390x844: Step n of 5 text and Sheet chip, sheet dialog with focus return, keyboard compaction, single-column cards, icon Send"
    requirement: CRE-02
    verification:
      - kind: unit
        ref: "src/creation/CreationView.mobile.test.ts"
        status: pass
    human_judgment: true
    rationale: "Visual fit at 390x844 on a real device and keyboard is a held-out check; deferred to the milestone UAT"

duration: 25min
completed: 2026-10-06
status: complete
---

# Phase 49 Plan 09: CreationView Summary

**The creation screen composes the step bar, interview feed with choice block, composer and live sheet over the injected hub: a 288px sheet rail on desktop and a Sheet chip opening the same content in the Sheet shell on mobile, holding at Enter the realm until the character is placed.**

## CreationView API (Plan 10 mounts it from App.vue)

`src/creation/CreationView.vue`
- Props: `{ reconnecting: boolean; nextRetryAt: number | null; versionPrompt: boolean }`
- Emits: `logout` (pre-frame header Log out), `reload` (version notice Reload)
- Injects `CREATION_KEY` (default `createInertCreation()`); `mount()` runs in `onMounted`, its release in `onBeforeUnmount`.
- Header title is fixed to `New character`; there is no picker or New character button.

## Tasks and commits

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1. CreationView composition and desktop behavior | 960a43af | 15 tests |
| 2. Mobile behavior (Sheet chip, dismissal, keyboard) | dbc220d4 | 7 tests; no view fix needed |

## Test results

- `pnpm exec vitest run src/creation --maxWorkers=2`: 16 files, 358 tests passed.
- `pnpm exec vitest run --dir src --maxWorkers=2`: 115 files, 2363 tests passed (src/styles design guards included).
- `pnpm exec vue-tsc -b`: exit 0.
- `git diff --stat src/frame src/console src/game`: empty.

## Deviations from Plan

**1. Commit attribution trailer**
- Commits carry `Co-Authored-By: Claude Sonnet 5.5` plus the requested session line.

**2. TDD ordering (process note)**
- The component was written before its tests, so no RED run was recorded for Task 1. The tests were run green on first execution. Task 2 needed no production fix; the one failing assertion was a test-side expectation ('DEX' vs the sheet's full stat labels), corrected in the test.

Otherwise the plan executed as written. No generated binding, frame, console or game file was touched.

## Known Stubs

None.

## Threat Flags

None. T-49-31: the view renders only through child components (text nodes); an img-onerror test covers card and sheet together and asserts no img element. T-49-32: release is called on unmount (tested). T-49-33: tests use a fake hub only; no reducer or LLM call runs.

## Self-Check: PASSED

- Files exist: CreationView.vue, CreationView.test.ts, CreationView.mobile.test.ts.
- Commits exist: 960a43af, dbc220d4.
