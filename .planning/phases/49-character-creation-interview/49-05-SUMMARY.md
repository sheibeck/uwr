---
phase: 49-character-creation-interview
plan: 05
subsystem: client
tags: [vue, creation, feed, keeper-lines]

requires:
  - phase: 47
    provides: "console feed store, FeedLineView, cleanServerText, FEED_LINE_CAP"
provides:
  - "src/creation/creationLines.ts: event_creation entries to FeedLine-ready lines, classified by kind first"
  - "src/creation/creationFeedStore.ts: capped, deduped, ordered creation feed that lives outside any component"
  - "src/console/feedStore.ts: private rows held while no character is active and replayed on setCharacter (O3)"
affects: [49-06, 49-08]

tech-stack:
  added: []
  patterns:
    - "Structural CreationEntryLike so the lines module stays independent of the store"
    - "Held-row replay through the normal ingest path so dedupe, ordering and the cap apply"

key-files:
  created:
    - src/creation/creationLines.ts
    - src/creation/creationLines.test.ts
    - src/creation/creationFeedStore.ts
    - src/creation/creationFeedStore.test.ts
  modified:
    - src/console/feedStore.ts
    - src/console/feedStore.test.ts

key-decisions:
  - "cleanCreationText removes the ** markers first and runs cleanServerText second, so the end trim added by quick task 261006-a3d is the last step (same result as the plan's order, plus edge whitespace next to a marker is trimmed)"
  - "Segment kind is ignored in creation: every segment is a Keeper line labelled The Keeper, dialogue included"
  - "Local echo and error text is never cleaned or trimmed; echo lines do not set playerAuthored (the echo kind has its own arrow prefix in FeedLine, as in lines.ts)"
  - "A segment that is empty after cleaning is skipped, and the line key index counts emitted lines (as lines.ts does)"
  - "Held rows dedupe by id so a resubscribe cannot fill the 50 slots with copies"

requirements-completed: [CRE-01]

coverage:
  - id: F1
    description: "Creation rows render as labelled Keeper lines; creation_error is an Error line; creation_warning flags the first line"
    requirement: CRE-01
    verification:
      - kind: unit
        ref: "src/creation/creationLines.test.ts#creationLines: server rows"
        status: pass
    human_judgment: false
  - id: F2
    description: "Server markup cleaned as plain text; echoes shown as typed; markup strings stay verbatim"
    requirement: CRE-01
    verification:
      - kind: unit
        ref: "src/creation/creationLines.test.ts#cleanCreationText"
        status: pass
    human_judgment: false
  - id: F3
    description: "Creation feed keeps up to 300 lines, never duplicates a row, never moves a local echo"
    requirement: CRE-01
    verification:
      - kind: unit
        ref: "src/creation/creationFeedStore.test.ts"
        status: pass
    human_judgment: false
  - id: F4
    description: "Starter tips written to event_private before the new character is active appear in its feed (O3)"
    requirement: CRE-01
    verification:
      - kind: unit
        ref: "src/console/feedStore.test.ts#held private rows (49 O3: starter tips written before the character is active)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-06
status: complete
---

# Phase 49 Plan 05: Creation Feed Pipeline Summary

**Creation rows now become labelled Keeper, Error and Echo lines classified by kind first, a capped creation feed store keeps them outside the view, and the Phase 47 feed store holds and replays the finalize starter tips so they are no longer dropped.**

## Exports (Plans 06 and 08 use these)

`src/creation/creationLines.ts`

```ts
export interface CreationEntryLike { key: string; origin: 'server' | 'local'; kind: string; message: string; segments: readonly SegmentLike[] | null }
export interface CreationLine { key: string; line: FeedLineView; warning: boolean }
export function cleanCreationText(text: string): string
export function creationLines(entries: readonly CreationEntryLike[]): CreationLine[]
```

`src/creation/creationFeedStore.ts` (`CreationEntry` satisfies `CreationEntryLike`)

```ts
export interface EventCreationLike { id: bigint; kind: string; message: string; createdAt: { microsSinceUnixEpoch: bigint }; segments?: readonly SegmentRowLike[] | null }
export interface CreationEntry { key; origin: 'server' | 'local'; id: bigint; kind; message; segments; createdAtMicros: bigint; lineCount: number }
export interface CreationFeedStore { entries: Readonly<ShallowRef<readonly CreationEntry[]>>; ingest(row); appendEcho(text); appendError(text); clear() }
export function createCreationFeedStore(options?: { cap?: number; now?: () => number }): CreationFeedStore
```

`src/console/feedStore.ts` gained `export const HELD_PRIVATE_CAP = 50`; the `FeedStore` interface is unchanged.

## FeedLineView fields filled

Re-read at execution time (the quick-task changes added the optional `playerAuthored`). Every line sets the required fields: `key`, `kind` ('keeper' | 'error' | 'echo'), `label` ('The Keeper' from `KEEPER_LABEL` for Keeper lines, else null), `speaker` null, `speakerNpcId` null, `direction` null, `title` null, `text`, `queued` false, `keywordEligible` false, `parts` null, `titleParts` null, `speakerKeyword` null. The optional round, windup and `playerAuthored` fields are omitted. The `warning` flag lives on `CreationLine`, not on the view (Plan 08 draws the icon in a wrapper, no FeedLine.vue edit).

## Tasks and commits

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1. creationLines classifier | c17a1e23 | 29 tests |
| 2. Creation feed store | 0187e349 | 23 tests |
| 3. Held private rows (O3) | d12870c5 | 13 new tests in feedStore.test.ts, red first (6 failed before the change) |

## Test results

- `pnpm exec vitest run src/console/feedStore.test.ts src/creation --maxWorkers=2`: 9 files, 284 tests passed.
- `pnpm exec vitest run --dir src --maxWorkers=2`: 107 files, 2237 tests passed (includes the src/styles design guards).
- `pnpm exec vue-tsc -b`: exit 0.

## Deviations from Plan

**1. [Rule 3 - Structure] `ingest` moved out of the returned object in feedStore.ts**
- **Found during:** Task 3
- **Issue:** `setCharacter` must replay held rows through the normal `ingest` path, and a method cannot be called safely without `this` (callers may destructure the store).
- **Fix:** `ingest` became a closure function and the object lists it as `ingest`. Its body is unchanged apart from the holding branch and one level of dedent, so the raw diff is larger than the logic change (`git diff -w`: 38 insertions, 9 deletions). `acceptRow` is untouched and no existing test changed.
- **Files modified:** src/console/feedStore.ts. **Commit:** d12870c5.

**2. Line endings in feedStore.ts**
- After the edits the working file carried CRLF (git stores LF via `eol=lf`); it was normalized back to LF with `sed` before committing, so the commit holds no whole-file rewrite.

**3. Existing test file import line**
- `src/console/feedStore.test.ts`: the plan says do not edit existing tests. Only the import line changed (added `HELD_PRIVATE_CAP`); the new describe block is appended and every existing test is untouched.

**4. Commit attribution trailer**
- Commits carry `Co-Authored-By: Claude Sonnet 5.5` (the model that ran), per the harness attribution instruction, not the Opus line in the run prompt. Session line as requested.

## Known Stubs

None.

## Threat Flags

None. T-49-17: lines are plain strings and cleaning is regex text removal only; the img-onerror string stays verbatim in server rows, segments and echoes. T-49-18: only rows whose characterId equals the newly active character are replayed, and the buffer empties on any setCharacter and on clear(). T-49-19: creation feed capped at 300 lines, held rows at 50.

## Self-Check: PASSED

- Files exist: creationLines.ts, creationLines.test.ts, creationFeedStore.ts, creationFeedStore.test.ts; feedStore.ts and feedStore.test.ts modified.
- Commits exist: c17a1e23, 0187e349, d12870c5.
