---
phase: 49-character-creation-interview
plan: 08
subsystem: client
tags: [vue, creation, feed, character-sheet]

requires:
  - phase: 49-04
    provides: "SheetModel (buildSheet)"
  - phase: 49-05
    provides: "creationLines and the creation feed store entries"
provides:
  - "src/creation/CreationFeed.vue: creation story log with labelled lines, warning wrapper, progress line, pinning, New lines pill and a choice-block slot"
  - "src/creation/CreationSheet.vue: live character sheet, rail and sheet-body variants"
affects: [49-09]

tech-stack:
  added: []
  patterns:
    - "Reuse by import only: FeedLine, KeeperProgress, selectLlmIndicator, isPinned, prefersReducedMotion (no src/console file edited)"
    - "One dynamic root (aside or div) so the rail and the mobile sheet body share one template"

key-files:
  created:
    - src/creation/CreationFeed.vue
    - src/creation/CreationFeed.test.ts
    - src/creation/CreationSheet.vue
    - src/creation/CreationSheet.test.ts
  modified: []

key-decisions:
  - "The progress line and the choice slot render inside the role=log element (the plan places them there), unlike FeedView where the progress tail sits outside the log"
  - "The warning icon is a wrapper row in CreationFeed (PhWarning 14px con-orange, gap 4) around FeedLine; FeedLine.vue and lines.ts are untouched"
  - "The scoped deep rule sets the Keeper body to white-space: pre-line per the UI-SPEC; FeedLine's base .body is already pre-wrap after the quick tasks, so newlines survive either way (pre-line also collapses space runs)"
  - "Stat '—' detection in the sheet is the value text, not the race name, so a hand-built model renders the same way"

requirements-completed: [CRE-01, CRE-02]

coverage:
  - id: V1
    description: "The feed shows Keeper lines labelled The Keeper, creation errors as Error lines, go-back warnings with a warning icon and an echo for every send, cleaned of ** markers with newlines kept"
    requirement: CRE-01
    verification:
      - kind: unit
        ref: "src/creation/CreationFeed.test.ts#CreationFeed: lines"
        status: pass
    human_judgment: false
  - id: V2
    description: "The creation-scope Keeper progress line shows while a creation route job is active, rotates with a timer that is cleared on unmount, and the choice slot follows it inside the log"
    requirement: CRE-01
    verification:
      - kind: unit
        ref: "src/creation/CreationFeed.test.ts#CreationFeed: progress line and slot"
        status: pass
    human_judgment: false
  - id: V3
    description: "The live sheet shows The ledger so far, identity, Race, Archetype, Class, five stats with +N race annotations, the racial trait, the chosen ability and Unnamed until the name exists"
    requirement: CRE-02
    verification:
      - kind: unit
        ref: "src/creation/CreationSheet.test.ts"
        status: pass
    human_judgment: true
    rationale: "The visual fit at 900px to 1100px and with a 20-character name is a held-out visual check (UI-SPEC backstop rows); deferred to the milestone UAT"
  - id: V4
    description: "All server text renders as text nodes: an img-onerror line, race, class, name and ability never become an element"
    requirement: CRE-01
    verification:
      - kind: unit
        ref: "src/creation/CreationFeed.test.ts#renders markup-shaped server and echo text; src/creation/CreationSheet.test.ts#renders an img-onerror race"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-10-06
status: complete
---

# Phase 49 Plan 08: Creation Feed and Live Sheet Summary

**The interview story log renders labelled Keeper, Error, warning and echo lines through the Phase 47 FeedLine with the creation Keeper progress line and a slot for the choice block, and the live sheet fills race, archetype, class, stats with race annotations, the racial trait and the ability, with the name last.**

## Components (Plan 09 composes them)

`CreationFeed.vue`
- Props: `{ entries: readonly CreationEntry[]; llmJobs: readonly LlmJobRowLike[]; desktop: boolean }` (`CreationEntry` from `creationFeedStore`, `LlmJobRowLike` from `console/indicator`; the hub's `feed.entries` and `llmJobs` fit)
- Slot: default, the choice block (after the last line and the progress line, inside `role="log"`)
- No emits. It owns its scroll pinning, the `New lines` pill and the progress rotation timer.
- Root is `.feed-region` (flex 1, min-height 0) so the view can place it directly in the center column.

`CreationSheet.vue`
- Props: `{ model: SheetModel; variant: 'rail' | 'sheet' }`
- `rail`: `aside aria-label="Character sheet"`, 288px, padding 16, `h6` "The ledger so far". `sheet`: a plain `div`, padding 0, no heading (the mobile Sheet shell supplies the title).
- No emits, no slots.

## Tasks and commits

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1. CreationFeed | ed036761 | 16 tests (10 behavior lines plus pinning and pill) |
| 2. CreationSheet | 048567a9 | 10 tests |

## Test results

- `pnpm exec vitest run src/creation src/styles --maxWorkers=2` green with each file (design guards included).
- `pnpm exec vitest run --dir src --maxWorkers=2`: 113 files, 2341 tests passed.
- `pnpm exec vue-tsc -b`: exit 0.
- `git diff --stat src/console`: empty.

## Deviations from Plan

**1. Pre-line rule against an already pre-wrap FeedLine**
- The plan expected FeedLine's base `.body` to be `pre-line` after quick task a3d; the file now has `white-space: pre-wrap` on the base `.body`. The scoped deep rule `:deep(.line-keeper .body) { white-space: pre-line }` is kept as the UI-SPEC specifies. Newlines are kept either way; no FeedLine edit.

**2. Extra tests beyond the plan's list**
- Two pinning tests (New lines pill appears only while scrolled up, and jumping hides it) were added because the plan requires the pill and the 48px pinning copied from FeedView but lists no behavior line for them.

**3. Commit attribution trailer and TDD ordering**
- Commits carry `Co-Authored-By: Claude Sonnet 5.5` plus the session line. Tests were written first; each task is one commit (tests plus implementation), as in plans 03 to 07.

Otherwise the plan executed as written. No file outside `src/creation/` was touched and no generated binding was edited.

## Known Stubs

None.

## Threat Flags

None. T-49-28: FeedLine and the sheet use text interpolation only; img-onerror tests in both components assert no element. T-49-29: the rotation interval is cleared when the job ends and on unmount (fake-timer tests). T-49-30: the indicator is scoped to `'creation'`, so a game-route job never shows in the interview (tested).

## Self-Check: PASSED

- Files exist: CreationFeed.vue/.test.ts, CreationSheet.vue/.test.ts.
- Commits exist: ed036761, 048567a9.
