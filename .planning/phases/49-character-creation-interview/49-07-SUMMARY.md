---
phase: 49-character-creation-interview
plan: 07
subsystem: client
tags: [vue, creation, components, step-indicator, cards, composer]

requires:
  - phase: 49-03
    provides: "creationSteps (stepMarkers, mobileStepText, stepAnnouncement) and creationControls (controlsFor, START_OVER_CONFIRMATION, ARCHETYPE_CHOICES)"
  - phase: 49-04
    provides: "RaceCard and AbilityCard models"
provides:
  - "src/creation/StepBar.vue: step indicator (desktop band, mobile segments, text row, Sheet chip, hidden status line)"
  - "src/creation/ChoiceBlock.vue: race, archetype and ability card blocks"
  - "src/creation/CreationComposer.vue: creation input row, quick row, decision row, Start over confirmation, name hint"
affects: [49-09]

tech-stack:
  added: []
  patterns:
    - "Presentational components: props in, one emit or a send function out; the view passes the breakpoint as `desktop`"
    - "aria-disabled (never the native attribute) for inert cards so they stay focusable"
    - "Own scoped spinner and reduced-motion rule in the component, pinned by a source test"

key-files:
  created:
    - src/creation/StepBar.vue
    - src/creation/StepBar.test.ts
    - src/creation/ChoiceBlock.vue
    - src/creation/ChoiceBlock.test.ts
    - src/creation/CreationComposer.vue
    - src/creation/CreationComposer.test.ts
  modified: []

key-decisions:
  - "The Keep my choices button of the Start over confirmation carries the 49-03 `dismiss` action: it closes the confirmation locally and sends nothing"
  - "The confirmation closes when the set of decision button ids changes (a step change), not on every controls object change, so a recomputed controls object does not flicker it"
  - "The no-races line renders as a plain paragraph inside the block wrapper (no role=group); the group exists only when there are cards"
  - "While locked, the Send button is disabled and a submit is a no-op; while only inert (send in flight) the input stays enabled and the hub refuses a second send"

requirements-completed: [CRE-01, CRE-03]

coverage:
  - id: S1
    description: "Step bar shows Race, Archetype, Class, Name, Enter the realm with done, current, working and error markers, aria-current, mobile segments, text row, Sheet chip and a status line that announces moves"
    requirement: CRE-01
    verification:
      - kind: unit
        ref: "src/creation/StepBar.test.ts"
        status: pass
    human_judgment: true
    rationale: "The visual layout at 900px and 390px is a held-out visual check (UI-SPEC backstop rows); deferred to the milestone UAT"
  - id: S2
    description: "Race, archetype and ability choices are whole-card buttons that emit the exact server text, inert while a send is in flight; no-races line; nothing before the race subscription applies"
    requirement: CRE-03
    verification:
      - kind: unit
        ref: "src/creation/ChoiceBlock.test.ts"
        status: pass
    human_judgment: false
  - id: S3
    description: "Composer sends typed text, Surprise me and every decision word through one send function, keeps the draft on failure, locks as the controls say, confirms Start over first"
    requirement: CRE-01
    verification:
      - kind: unit
        ref: "src/creation/CreationComposer.test.ts"
        status: pass
    human_judgment: false
  - id: S4
    description: "Server-authored strings render as text: an img-onerror name never becomes an element"
    requirement: CRE-03
    verification:
      - kind: unit
        ref: "src/creation/ChoiceBlock.test.ts#renders an img-onerror race name"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-10-06
status: complete
---

# Phase 49 Plan 07: Step Bar, Choice Block and Composer Summary

**Three presentational creation components: a step indicator with every marker state on both layouts, labelled whole-card choices that emit the exact text the server expects, and a composer that sends typed text, Surprise me and every decision word through one send function.**

## Components (Plan 09 composes them)

`StepBar.vue`
- Props: `{ view: CreationStepView; desktop: boolean; keyboardOpen: boolean }`
- Emits: `openSheet` (the Sheet chip, mobile only)
- Exposes: `focusChip()` (return focus after the mobile sheet closes)
- Desktop: five labelled columns with icons (`icon-done`, `icon-current` plus `spinning` while working, `icon-error`, `icon-todo`). Mobile: five segments, `Step n of 5 · label` and the chip, both hidden while `keyboardOpen`. A visually hidden `role="status"` line fills after the first position change.

`ChoiceBlock.vue`
- Props: `{ kind: 'race' | 'archetype' | 'ability'; raceCards?: RaceCard[] | null; abilityCards?: AbilityCard[]; inert: boolean; desktop: boolean }`
- Emits: `choose: [text: string]` (race name, `Warrior` or `Mystic`, ability name)
- Renders nothing for `raceCards` null or missing and for an empty ability list; the no-races line for `raceCards: []`. Inert sets `aria-disabled="true"` and the click returns early.

`CreationComposer.vue`
- Props: `{ controls: CreationControls; inert: boolean; desktop: boolean; send: (text: string) => Promise<boolean>; start: () => void }`
- Emits: `focusChange: [focused: boolean]` (the view feeds it to `useKeyboardOpen`)
- The `send` prop is the hub's `send`; the draft clears only when it resolves true. The `start` prop is called by the `start` decision action (Retry after a failed start). No CONSOLE_KEY or GAME_KEY injection.

## Tasks and commits

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1. StepBar | 6a04c3db | 14 tests |
| 2. ChoiceBlock | 63c1fd1a | 15 tests |
| 3. CreationComposer | 00f74cd4 | 18 tests |

## Test results

- `pnpm exec vitest run src/creation --maxWorkers=2` and `src/styles` green with each new file (design guards included).
- `pnpm exec vitest run --dir src --maxWorkers=2`: 111 files, 2315 tests passed.
- `pnpm exec vue-tsc -b`: exit 0.
- `git diff --stat src/input/Composer.vue`: empty.

## Deviations from Plan

**1. [Handled as instructed] `dismiss` DecisionAction**
- 49-03 added a fourth `DecisionAction` variant, `{ type: 'dismiss' }`, for the Keep button of the Start over confirmation. The composer branches on it as a local close that sends nothing (tested: no send, row restored).

**2. Commit attribution trailer**
- Commits carry `Co-Authored-By: Claude Sonnet 5.5` (the model that ran), plus the requested session line.

**3. TDD ordering (process note)**
- Tests were written before each component and each task is one commit (tests plus implementation), as in plans 03 to 06. A separate RED run was not recorded for the three component tests (the component files did not exist when the tests were written).

Otherwise the plan executed as written. No file outside `src/creation/` was touched and no generated binding was edited.

## Known Stubs

None.

## Threat Flags

None. T-49-24: every server string (names, descriptions, tags, labels) is a text node or an aria-label/title binding; img-onerror tests in ChoiceBlock (race and ability) and StepBar and CreationComposer assert no element is created; no raw-HTML directive. T-49-25: cards, chip and decision buttons are inert or disabled while a send is in flight. T-49-26: Start over asks first and sends `start over` only on Yes. T-49-27: `maxlength` is INPUT_MAX_CHARS.

## Self-Check: PASSED

- Files exist: StepBar.vue/.test.ts, ChoiceBlock.vue/.test.ts, CreationComposer.vue/.test.ts.
- Commits exist: 6a04c3db, 63c1fd1a, 00f74cd4.
