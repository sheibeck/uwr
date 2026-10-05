---
phase: 46-structured-keeper-replies
plan: 03
subsystem: llm-apply-layer
tags: [combat-narration, failure-drills, segments, invariant, seg-04]
requires: ["46-02"]
provides:
  - "combat_narration.ts: COMBAT_NARRATION_FALLBACK_LINE, combatPresentSpeakers, segment-aware handleCombatNarrationResult"
  - "llm_segment_drills.test.ts: SEG-04 malformed-reply matrix over every narrative route and the message/segments invariant"
  - "llm_failure_drills.test.ts: segment assertions for every Keeper-voice failure line"
affects: [46-06, 46-08, 46-09, "46.1"]
tech-stack:
  added: []
  patterns:
    - "Speaker allow-list for combat = snapshot enemy names (no id) + NPC rows at the first participant's location (with id); participant names are player names"
    - "Combat apply is narrativeType-agnostic: fallback line and speakers per call, reusable by Phase 46.1"
    - "Drills run through the real events module and read stored rows back; events.ts gets no new exports"
key-files:
  created:
    - spacetimedb/src/helpers/llm_segment_drills.test.ts
  modified:
    - spacetimedb/src/helpers/combat_narration.ts
    - spacetimedb/src/helpers/combat_narration.test.ts
    - spacetimedb/src/helpers/llm_apply.characterization.test.ts
    - spacetimedb/src/helpers/__snapshots__/llm_apply.characterization.test.ts.snap
    - spacetimedb/src/helpers/llm_failure_drills.test.ts
    - spacetimedb/src/helpers/world_gen.ts
decisions:
  - "The combat round prefix is gone: message always equals flattenSegments(segments), so a '[Round N] ' prefix is no longer possible (Phase 46.1 shows round numbers from its own public round state)"
  - "A successful combat reply that yields nothing usable (JSON without segments or narrative, whitespace-only) now stores one Keeper fallback line per participant plus one combat_narrative row; a failed job stays silent"
  - "Combat present speakers read ctx.db.npc only when a participant character with a nonzero locationId exists, so the hand-built ctx without an npc table keeps working"
metrics:
  duration: "~40 min"
  completed: 2026-10-05
  tasks: 3
  files: 7
status: complete
---

# Phase 46 Plan 03: Combat segments, SEG-04 matrix and failure drills Summary

Combat narration is segment-aware with a database-backed speaker allow-list, every narrative route's malformed replies are pinned through the real write path to one Keeper line (or the documented clamp), the invariant `message === flattenSegments(segments)` holds for every stored narrative row in the matrix, and the offline failure drills assert one Keeper narration segment per failure line.

## What was built

- **Task 1 (4af4754d)** `combat_narration.ts`:
  - `COMBAT_NARRATION_FALLBACK_LINE` (text exactly as before) now also feeds `sendNarrationSkippedMessage`.
  - `combatPresentSpeakers(ctx, context)`: total. Decodes `context.input` with `decodeRouteInput('combat_narration', ...)` inside try/catch; enemy names de-duplicated by `speakerKey` as `{ name }`; then, for the first found participant character with a nonzero `locationId`, every `npc.by_location` row as `{ name, id }`. `playerNames` = decoded player names plus every found participant's name. `ctx.db.npc` is touched only when such a character exists.
  - `handleCombatNarrationResult`: `if (!success) return;` kept; the old parse block is replaced by `segmentsFromReply(..., { legacyNarrativeField: true, salvageProse: true, cleanProse: stripNarrationSelfCorrection })`; the combat_narrative row stores the flattened text; every participant gets `appendPrivateEvent(..., 'combat_narration', text, segments)`. No round prefix. Still imports only `appendPrivateEvent` from `./events`.
  - 17 new unit tests in `combat_narration.test.ts` (31 total, all pass; RED confirmed first: 12 failed before the code).
- **Task 2 (eaffaf51)** `llm_segment_drills.test.ts` (75 tests). Only `spacetimedb/server` is mocked; `./events` is real. Model-segment routes (npc_conversation, combat_narration) run 15 malformed shapes each (truncated JSON with debris, refusal prose, JSON without segments, non-array segments, non-object items, unknown kind, missing speaker, empty and whitespace texts, 7 and 20 segments, absent spoofed speaker, spoofed "The Keeper", the player as speaker by name, "you" and "Player", present speaker with canonical casing, fenced JSON) plus a 5000-character text, markup/bidi/NUL/lone-surrogate cleanup, control-only text, and a valid mixed reply. Combat and NPC get extra shape tests (legacy narrative, prose, whitespace, failed job silent, NPC id kept, non-object JSON). Server-wrapped routes (creation_race, creation_class_reveal, creation_class, world_gen_start, skill_gen, renown_perk_gen) run a success fixture plus not-JSON, debris and missing-fields replies; world_gen runs three malformed replies and a success and proves no segments. `expectSegmentInvariant` runs after every case; a canary-debris check proves no reply fragment reaches a stored row or a log line.
- **Task 3 (233bedac, 9aeed90a)** `llm_failure_drills.test.ts`: `playerLines()` now records the segments argument (index 5 private, 4 creation); a `Phase 46: failure lines carry one Keeper narration segment` block drives the real `applyLlmFailure` for creation_race, creation_class_reveal, creation_class, world_gen_start (unplaced and placed), world_gen (character row gone and placed), skill_gen, renown_perk_gen and npc_conversation, each with a generic and a resting code (20 tests), plus combat staying silent. Pinned inline lines are untouched.

## Characterization changes (reviewed diff by diff)

Reviewed from the snapshot diff: the only content changes are the ones below; every other hunk is vitest re-sorting snapshot keys.

Combat cases (all now titled with "Phase 46:" and noted in the file header):

| Case | Change |
|---|---|
| `Phase 46: success with a JSON narrative stores the row and broadcasts an unprefixed private event with one Keeper narration segment to known participants` | message `[Round 2] Steel meets bone.` becomes `Steel meets bone.`; row gains `segments` |
| `Phase 46: success accepts a code-fenced JSON narrative (one Keeper narration segment)` | message loses the `[Round 2] ` prefix, gains `segments` |
| `Phase 46: success with raw prose stores the trimmed text as one Keeper narration segment, unprefixed` | message loses the prefix, gains `segments` |
| `Phase 46: JSON without a segments or narrative field stores the Keeper fallback line, never the JSON text` | was the JSON text itself (QUIRK); now the fallback line in both the combat_narrative row and the event |
| `Phase 46: an empty reply stores one fallback combat_narrative row and one fallback line per known participant` | was nothing stored; now one fallback combat_narrative row and one fallback event row |
| `Phase 46: a victory narration is one Keeper narration segment, not round-prefixed` | text unchanged, row gains `segments` |
| `Phase 46: a segments reply stores the flattened text, with a snapshot enemy as a dialogue speaker` | new case |
| `a context without participants stores the row and broadcasts nothing`, `failure changes nothing (silent)` | unchanged content (the dump now shows an empty `npc` table where the allow-list read it; no other change) |

World-fill case: `Phase 46: routes the message to the creation events when the character row is gone (one Keeper narration segment)` gains a one-segment `segments` array on the creation_error row, message unchanged (see deviation 1).

## Verification

- `vitest run src/helpers/combat_narration.test.ts src/helpers/llm_segment_drills.test.ts src/helpers/llm_failure_drills.test.ts src/helpers/llm_apply.characterization.test.ts src/helpers/combat.test.ts`: all pass.
- Whole module suite (`--maxWorkers=1`): 60 of 61 files pass, 3376 tests pass; the only failure is the baseline `measurement.results.test.ts` (2 tests).
- `pnpm exec vitest run scripts/llm`: 353 tests pass; only the three baseline collection failures (call_log_report, golden_run, proof_rules).
- Voice gate `git diff --quiet 6aa1f4f1 -- keeper_bible.ts llm_layers.ts llm_schemas.ts llm_routes.ts` exits 0. `events.ts` is untouched (no new exports). No wording changed anywhere.
- Greps: `export const COMBAT_NARRATION_FALLBACK_LINE` 1, `export function combatPresentSpeakers` 1; the drills file mocks only `spacetimedb/server`; every one of the nine route names appears in the drills file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] failWorldFill creation_error line carried no segments**
- **Found during:** Task 3 (the new `world_gen (character row gone)` drill failed, exactly as 46-02 had flagged)
- **Issue:** `failWorldFill` in `world_gen.ts` wrote a Keeper-voice `creation_error` line with no segments when the character row is gone or unplaced, breaking the invariant for that line.
- **Fix:** the creation_error branch now stores `keeperFallback(line)` through the existing trailing `segments` parameter of `appendCreationEvent`, with `flattenSegments` as the message. Wording unchanged. Imports only the pure `./segments`. The placed-character system line is unchanged.
- **Files modified:** `spacetimedb/src/helpers/world_gen.ts`, one characterization case and its snapshot.
- **Commit:** 233bedac

**2. [Plan expectation vs behavior] creation_race with valid JSON missing fields stores a creation row, not creation_error**
- **Found during:** Task 2
- **Issue:** the plan's behavior block groups "valid JSON missing the required fields" under creation_error for all four creation routes. For `creation_race`, Phase 41 deliberately tolerates it (stores race "Unknown" with default bonuses, a normal `creation` row).
- **Fix:** none to production; the matrix pins the real behavior (one `creation` row, Keeper segments only, invariant holds). The other creation routes and world_gen_start do write one `creation_error` row with one segment.
- **Commit:** eaffaf51

**3. [Process] Tests-first for Task 1 only**
Task 1 followed RED (12 failing) then GREEN. Tasks 2 and 3 are test-only; no production bug surfaced in Task 2 (all 75 passed first run apart from one wrong fixture table in my test, the world_gen_start success row lives in event_private not event_creation).

## Known Stubs

None.

## Threat Flags

None. Combat segments hold exactly the text the message already held; speakers come only from the server-written snapshot, the database or the constant "The Keeper". The threat register items T-46-03-01 to -05 are covered by the matrix (spoof, no-throw, markup/control cleanup, oversize clamp, no debris).

## Flagged assumption

The matrix pins hand-built fixtures; whether it covers every malformed shape a live model produces is unknown until the deferred live checks (the prose-salvage heuristic `isUsableProse` may keep odd but harmless text). After the combat route flip (46-08), malformed combat JSON is intercepted by the provider classifier as a billed silent failure, so the apply-layer combat fallback mostly guards legacy and test inputs.

## Phase 46.1 contract note

`handleCombatNarrationResult` treats intro, round, victory and defeat identically. 46.1 can call it for big moments with its own context; `combatPresentSpeakers` builds the list from `context.input` and `context.participantCharacterIds`, and the fallback line is the exported constant (swap it per call by passing a different line if a new entry point is added; the owner decides wording in 46-06).

## Deferred owner verification

None for this plan (no `checkpoint:human-verify` task).

## Self-Check: PASSED

- FOUND: spacetimedb/src/helpers/combat_narration.ts, combat_narration.test.ts, llm_segment_drills.test.ts, llm_failure_drills.test.ts, world_gen.ts, llm_apply.characterization.test.ts and its snapshot
- FOUND commits: 4af4754d, eaffaf51, 233bedac, 9aeed90a
