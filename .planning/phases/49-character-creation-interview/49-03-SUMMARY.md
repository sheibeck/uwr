---
phase: 49-character-creation-interview
plan: 03
subsystem: client
tags: [vue, creation, pure, step-indicator, controls]

requires:
  - phase: 49-01
    provides: server creation state machine facts (no code import in this plan)
provides:
  - "src/creation/creationSteps.ts: pure step-bar derivations from the server row"
  - "src/creation/creationControls.ts: pure per-step quick row, decision row, input text, lock and choice block"
  - "src/creation/serverWords.test.ts: button words pinned against creation.ts"
affects: [49-06, 49-07, 49-09]

tech-stack:
  added: []
  patterns:
    - "Table-driven tests like deriveScreen.test.ts, one row per server step"
    - "Source-text pin of server matching rules with readFileSync(resolve(process.cwd(), ...))"

key-files:
  created:
    - src/creation/creationSteps.ts
    - src/creation/creationSteps.test.ts
    - src/creation/creationControls.ts
    - src/creation/creationControls.test.ts
    - src/creation/serverWords.test.ts
  modified: []

key-decisions:
  - "Copy per the planner decision: Retry class details, Retry finding a region, Go back a step, Keep my choices; the start-failure button stays Retry"
  - "DecisionAction gained a fourth variant, dismiss, for the Keep button of the Start over confirmation (sends nothing)"
  - "Unknown steps and known:false both lock the input and keep the last known position; lookup uses hasOwnProperty so prototype keys are unknown"

requirements-completed: [CRE-01]

coverage:
  - id: C1
    description: "Every server step (11 known, no row, unknown, COMPLETE working and failed) maps to one of five positions; the name is position 4 after Class"
    requirement: CRE-01
    verification:
      - kind: unit
        ref: "src/creation/creationSteps.test.ts#deriveCreationStep"
        status: pass
    human_judgment: false
  - id: C2
    description: "Each step offers exactly the UI-SPEC controls; Go back only at AWAITING_ARCHETYPE, CLASS_REVEALED, CLASS_FILL_ERROR"
    requirement: CRE-01
    verification:
      - kind: unit
        ref: "src/creation/creationControls.test.ts#Go back placement"
        status: pass
    human_judgment: false
  - id: C3
    description: "Every word a button sends is pinned against the server matching rules read from creation.ts"
    requirement: CRE-01
    verification:
      - kind: unit
        ref: "src/creation/serverWords.test.ts"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-06
status: complete
---

# Phase 49 Plan 03: Step Bar and Controls Derivations Summary

**The step bar and the composer controls for the Keeper interview are now pure functions of the server row, tested one row per server step, and every button word is pinned against the server's own matching code.**

## Exports (Plans 06, 07 and 09 import these)

`src/creation/creationSteps.ts`

```ts
export const STEP_LABELS: readonly ['Race','Archetype','Class','Name','Enter the realm']
export type StepPosition = 1 | 2 | 3 | 4 | 5
export const KNOWN_CREATION_STEPS: readonly string[]            // the 11 reducer values
export interface CreationStepView { position; label; error; working; known }
export function deriveCreationStep(input: { step: string | null; previousStep: string | null; regionFailed: boolean; lastKnown: StepPosition | null }): CreationStepView
export interface StepMarker { label; state: 'done' | 'current' | 'error' | 'todo'; ariaLabel }
export function stepMarkers(view): StepMarker[]
export function mobileStepText(view): string                    // 'Step 2 of 5 · Archetype'
export function stepAnnouncement(view): string                  // 'Step 2 of 5: Archetype'
export function firstRegionFailed(input: { genRows: readonly { id: bigint; characterId: bigint; step: string }[]; genApplied: boolean; characterId: bigint | null; worldJobActive: boolean }): boolean
export function effectiveCreationStep(stateStep: string | null | undefined, unplacedActive: boolean): string | null
```

`src/creation/creationControls.ts`

```ts
export type DecisionAction = { type: 'send'; text } | { type: 'start' } | { type: 'askStartOver' } | { type: 'dismiss' }
export interface DecisionButton { id; label; variant: 'primary' | 'secondary' | 'ghost'; icon: 'retry' | 'back' | null; action; danger }
export interface CreationControls { quick; decisions; placeholder; mobilePlaceholder; locked; disabled; choice: 'race' | 'archetype' | 'ability' | null; nameHint }
export function controlsFor(input: { step: string | null; known: boolean; regionFailed: boolean; startFailed: boolean; connected: boolean }): CreationControls
export const SURPRISE_ME_TEXT = 'Surprise me.'
export const NAME_HINT = '3 to 20 letters. One word.'
export const START_OVER_CONFIRMATION: { prompt; yes: DecisionButton; keep: DecisionButton }
export const ARCHETYPE_CHOICES: readonly { id; name; description; ariaLabel; sends; icon: 'sword' | 'wand' }[]
```

Decision button ids: `retry-start`, `retry-class`, `retry-region`, `go-back`, `enter-realm`, `start-over`, `go-back-yes`, `go-back-keep`, `start-over-yes`, `start-over-keep`.

## Tasks and commits

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1. deriveCreationStep and step-bar derivations | 8cf20e2e | 47 tests |
| 2. controlsFor per step | 247ca3a8 | 40 tests |
| 3. serverWords pin test | dad623c7 | 18 tests |

## Test results

- `pnpm exec vitest run src/creation --maxWorkers=2`: 3 files, 105 tests passed.
- `pnpm exec vitest run --dir src --maxWorkers=2`: 102 files, 2097 tests passed (includes the src/styles design guards).
- `pnpm exec vue-tsc -b`: exit 0.

## Why serverWords.test.ts fails loudly

It reads `spacetimedb/src/reducers/creation.ts` at run time and asserts the exact source text of each matching rule (the `GO_BACK_PATTERNS` array, the `'yes'`, `'confirm'`, `'start over'` checks, the `explore` regex, the two archetype `includes` checks). Every word that `controlsFor` (all steps, regionFailed and startFailed variants), the Start over confirmation and the archetype cards can send is collected and must have a pin entry, so a changed or newly added button word with no pin fails the coverage test, and a server rule edit fails the matching source assertion. Reasoned, not demonstrated by editing the server.

## Deviations from Plan

**1. [Rule 2 - Missing functionality] Fourth DecisionAction variant `dismiss`**
- **Found during:** Task 2
- **Issue:** The plan types `START_OVER_CONFIRMATION.keep` as a `DecisionButton` that "sends nothing", but its three-variant `DecisionAction` union has no inert action for it.
- **Fix:** Added `{ type: 'dismiss' }` (closes the confirmation). Plan 07 already treats Keep as a local close; it should branch on `dismiss` (or ignore the action for that button).
- **Files modified:** src/creation/creationControls.ts. **Commit:** 247ca3a8.

**2. Commit attribution trailer**
- The commits carry `Co-Authored-By: Claude Sonnet 5.5` (the model that actually ran), per the harness attribution instruction, not the `Claude Opus 5.5 (1M context)` line named in the run prompt. The session line is the one requested.

**3. TDD ordering (process note)**
- Task 1 and Task 2 tests were written first and run to RED (Task 1: module missing); each task is one commit (tests plus implementation) following the 49-01 convention rather than separate test and feat commits. Task 3 is source pins over already-built code, so it passed on first run by design.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or file access beyond reading server source in a test.

## Self-Check: PASSED

- Files exist: creationSteps.ts, creationSteps.test.ts, creationControls.ts, creationControls.test.ts, serverWords.test.ts.
- Commits exist: 8cf20e2e, 247ca3a8, dad623c7.
