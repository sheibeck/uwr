---
phase: 49-character-creation-interview
plan: 06
subsystem: client
tags: [vue, creation, spacetimedb-client, subscriptions]

requires:
  - phase: 49-03
    provides: "creationSteps (firstRegionFailed, effectiveCreationStep)"
  - phase: 49-05
    provides: "createCreationFeedStore"
provides:
  - "src/creation/queries.ts: own-identity filtered SQL for creation state, events and world gen; race_definition"
  - "src/creation/creationContext.ts: CreationData contract, CREATION_KEY, createInertCreation"
  - "src/creation/creationData.ts: createCreationData hub (bindings, start gating, send, retry, one-shot hand-off)"
affects: [49-09, 49-10]

tech-stack:
  added: []
  patterns:
    - "Hub owned by the session, view-independent feed (RESEARCH Pitfall 7)"
    - "Keyed bindings with swap immediate over a computed identity key (no game hub files touched)"
    - "Per-mount detached effectScope for the start gate"

key-files:
  created:
    - src/creation/queries.ts
    - src/creation/creationContext.ts
    - src/creation/creationData.ts
    - src/creation/creationData.test.ts
  modified: []

key-decisions:
  - "Key is the identity hex while an identity exists and the active character is not placed (locationId 0 or no active character); a placed character disposes the three creation bindings"
  - "The hub owns one child effectScope for its watchers and keyed bindings, so dispose() can stop them while the session scope still stops them at session end"
  - "regionFailed is not additionally gated on unplacedActive: the world-gen binding is disposed once the character is placed, so genApplied is false and firstRegionFailed returns false"
  - "The defensive hand-off reads the raw state step (CONFIRMING then COMPLETE), not effectiveStep, and fires with characters[0].id"

requirements-completed: [CRE-01, CRE-03]

coverage:
  - id: H1
    description: "State, events and world gen are subscribed only for the player's own identity while no placed active character exists; events are re-checked by hex"
    requirement: CRE-01
    verification:
      - kind: unit
        ref: "src/creation/creationData.test.ts#createCreationData: bindings"
        status: pass
    human_judgment: false
  - id: H2
    description: "start_creation is called once per mount, only for zero characters, only after connected, characters, state and events applied (any order); rejection shows the error line and Retry"
    requirement: CRE-01
    verification:
      - kind: unit
        ref: "src/creation/creationData.test.ts#createCreationData: start gating"
        status: pass
    human_judgment: false
  - id: H3
    description: "Every send echoes then calls submit_creation_input with object syntax; empty, offline and concurrent sends are refused; failure reports false so the draft is kept"
    requirement: CRE-01
    verification:
      - kind: unit
        ref: "src/creation/creationData.test.ts#createCreationData: send"
        status: pass
    human_judgment: false
  - id: H4
    description: "race_definition is bound only while a view is mounted; the feed survives unmount and remount"
    requirement: CRE-03
    verification:
      - kind: unit
        ref: "src/creation/creationData.test.ts#createCreationData: bindings, #createCreationData: feed and reset"
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-10-06
status: complete
---

# Phase 49 Plan 06: Creation Hub Summary

**A session-ownable creation hub subscribes to the player's own creation rows, starts the interview once per mount after every subscription has applied, sends each answer with an echo, reports failures, and keeps the feed across view remounts.**

## CreationData contract (Plan 10 wires it into the session, Plan 09 injects it)

`src/creation/creationContext.ts`

```ts
interface CreationData {
  connected: Readonly<Ref<boolean>>
  state: Readonly<Ref<CharacterCreationState | null>>       // lowest-id row
  stateApplied; eventsApplied; racesApplied: Readonly<Ref<boolean>>
  races: Readonly<Ref<readonly RaceDefinition[]>>           // empty unless a view is mounted
  llmJobs: Readonly<Ref<readonly MyLlmJob[]>>
  creationJobActive: Readonly<Ref<boolean>>                 // selectLlmIndicator(jobs, 'creation').active
  unplacedActive: Readonly<Ref<boolean>>                    // active character with locationId 0n
  regionFailed: Readonly<Ref<boolean>>                      // firstRegionFailed over world_gen_state
  effectiveStep: Readonly<Ref<string | null>>               // COMPLETE for an unplaced active character
  sending; startFailed: Readonly<Ref<boolean>>
  feed: CreationFeedStore
  mount(): () => void; retryStart(): void; send(text): Promise<boolean>; reset(): void; dispose(): void
}
export const CREATION_KEY: InjectionKey<CreationData> = Symbol('uwr.creation')
export function createInertCreation(): CreationData
```

## CreationInput fields (`src/creation/creationData.ts`)

```ts
createCreationData<C extends CreationConn>(deps: CreationDeps<C>, input: CreationInput<C>): CreationData
CreationInput<C> { conn: ShallowRef<C|null>; status: Ref<ConnectionStatus>; identity: Ref<Identity|null>;
  charactersApplied: Ref<boolean>; characters: Ref<readonly Character[]>; activeCharacterId: Ref<bigint|null>;
  activeCharacter: Ref<Character|null>; llmJobs: Ref<readonly MyLlmJob[]> }
CreationDeps<C> { bind; bindEvent; queries: CreationQueries }   // creationQueries() from ./queries is the real one
CreationConn: db.characterCreationState, raceDefinition, worldGenState (TableLike), eventCreation (EventTableLike);
  reducers.startCreation({}), submitCreationInput({ text }), setActiveCharacter({ characterId })
```

`llmJobs` is the session's existing `my_llm_jobs` rows (the game hub's `llmJobs`); the identity is `my_player.id`. Plan 10 must call `createCreationData` inside the session effect scope, pass `deps.bind`/`deps.bindEvent` (`bindTable`, `bindEventTable`) and call `reset()` on logout. Exported copy constants: `START_ERROR_TEXT`, `SEND_ERROR_TEXT`.

## Tasks and commits

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1. Queries, CreationData contract, key, inert hub | ec4517a3 | vue-tsc clean |
| 2. createCreationData hub with tests | 25706652 | 29 tests (red first: module missing) |

## Test results

- `pnpm exec vitest run src/creation/creationData.test.ts --maxWorkers=2`: 29 passed.
- `pnpm exec vitest run --dir src --maxWorkers=2`: 108 files, 2266 tests passed (includes the src/styles design guards).
- `pnpm exec vue-tsc -b`: exit 0.
- `git diff --stat src/game`: empty (no Phase 47 hub file edited).

## Deviations from Plan

**1. Commit attribution trailer**
- Commits carry `Co-Authored-By: Claude Sonnet 5.5` (the model that ran), plus the requested session line.

**2. TDD ordering (process note)**
- The test file was written and run to RED (import of the missing module failed) before the implementation, but each task is one commit (tests plus implementation), following the 49-01 convention used in plans 03 to 05.

**3. Test double detail**
- The race binding is created at hub construction and the sync watcher disposes it at once (mount count 0), so the fake binding already reads `disposed` at start. Race tests count `dispose` calls after the mounts instead of reading the flag. No production impact (the real `bindTable.dispose` is idempotent).

Otherwise the plan executed as written. No generated binding or server file was touched.

## Known Stubs

None.

## Threat Flags

None. T-49-20: no identity or character id is sent for creation; `setActiveCharacter` sends only the user's own character id. T-49-21: the subscriptions are always identity-filtered and the event listener re-checks the hex. T-49-22: one send in flight, one start per mount, empty text never sent. T-49-23: the hand-off arms only after this session saw CONFIRMING and fires once.

## Self-Check: PASSED

- Files exist: queries.ts, creationContext.ts, creationData.ts, creationData.test.ts.
- Commits exist: ec4517a3, 25706652.
