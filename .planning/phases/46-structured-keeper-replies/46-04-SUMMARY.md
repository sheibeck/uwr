---
phase: 46-structured-keeper-replies
plan: 04
subsystem: golden-harness-rules
tags: [golden-harness, rules, offline, segments, seg-05]
requires: ["46-03"]
provides:
  - "sweep_rules.mjs: structural id missing_segments (replaces missing_dialogue and empty_text), segment-aware combat tone lint, NARRATIVE_KEY covering text"
  - "golden_rules.mjs: rules segments_invalid and keeper_first_person; exports GOLDEN_RULES_ADDED_IN_46 and GOLDEN_SHAPE_CHANGED_ROUTES"
  - "golden_set.mjs: expectations.allowedSpeakers on every npc_conversation and combat_narration item, derived from the item's own input"
affects: [46-05, 46-06, 46-08]
tech-stack:
  added: []
  patterns:
    - "Offline rules import the server's pure segments.ts (normalizeSegments, speakerKey, SEGMENT_KINDS, KEEPER_SPEAKER, MAX_SEGMENTS, MAX_SEGMENT_CHARS) instead of copying the contract"
    - "Shape-tolerant rules: a segments array is judged on its narration text, a reply without one keeps the old raw-text behavior"
key-files:
  created: []
  modified:
    - scripts/llm/sweep_rules.mjs
    - scripts/llm/sweep_rules.test.mjs
    - scripts/llm/golden_rules.mjs
    - scripts/llm/golden_rules.test.mjs
    - scripts/llm/golden_set.mjs
decisions:
  - "A narration segment must carry the exact speaker 'The Keeper' (a missing or differently cased speaker fails segments_invalid); dialogue speakers are compared with speakerKey against the item's allowedSpeakers"
  - "keeper_first_person also lints plain combat prose (no segments array, no JSON object) as Keeper voice, so the rule holds before and after the combat route flip in 46-08"
  - "segments_invalid does not flag a non-object segment item or a non-string text on its own (the server skips them); it fails when nothing survives the server normalizer"
  - "Combat on a segment reply with only dialogue segments has an empty joined narration and so fails narration_sentences (spec: lint the joined narration)"
metrics:
  duration: "~35 min"
  completed: 2026-10-05
  tasks: 2
  files: 5
status: complete
---

# Phase 46 Plan 04: Golden rules for the segment shape Summary

The structural check, combat tone lints and golden rules now judge the segment shape offline: `missing_segments`, `segments_invalid` (built on the server's own normalizer) and `keeper_first_person`, with every npc and combat golden item carrying its allowed speakers. No network, no spend, no existing rule weakened.

## What was built

- **Task 1 (478aedc0)** `sweep_rules.mjs`:
  - Imports `SEGMENT_KINDS` from `segments.ts`. `structuralCheck` has one shared case for npc_conversation and combat_narration: `missing_segments` unless `segments` is an array holding an object whose kind is a known kind and whose text is non-blank (string text with JSON inside, or a parsed object). `missing_dialogue` and `empty_text` are no longer produced.
  - `NARRATIVE_KEY` also matches `text`, so an exclamation mark in any segment (npc or combat, either kind) fails `exclamation`.
  - `toneLint` extracts the JSON object for combat as it already did for npc. With a `segments` array, `exclamation`, `text_json_wrapper`, `text_quotes` and `narration_sentences` run on the narration texts joined with one space; without one the raw-text checks are unchanged. `TONE_RULES` keeps its 11 ids in order.
- **Task 2 (812b3e0e)** `golden_rules.mjs`, `golden_set.mjs`:
  - `GOLDEN_SPECIFIC` is now 16 ids in the planned order (`segments_invalid` after `structure_invalid`, `keeper_first_person` after `keeper_pronoun`). `GOLDEN_RULES_ADDED_IN_46` and `GOLDEN_SHAPE_CHANGED_ROUTES` exported and frozen.
  - Local `SEGMENT_ROUTES` replaces the npc-only special cases for object extraction, emptiness and the structural shape.
  - `segments_invalid`: no segments array; more than 6 segments; a text over 600 code points; unknown or missing kind; a narration speaker other than `The Keeper`; a dialogue speaker outside `expectations.allowedSpeakers` (by `speakerKey`); or zero segments left after `normalizeSegments(raw, allowedSpeakers, input.playerNames)`. Never fires on stage routes; reasons recorded in `notes.segments`.
  - `keeper_first_person`: whole words I, me, my, mine, myself (any case) in Keeper-voice strings after removing straight and curly double-quoted spans. Keeper-voice strings are narration segments on segment routes, and values under keys matching `description$|narrative|narration` on stage routes. Dialogue is never read.
  - `player_pronoun` and `lone_player_named` for combat run on the joined narration of the segments when present, else on the reply text.
  - `golden_set.mjs` post-processes the items so every npc item gets `[input.npc.name]` and every combat item (incl. adv-3, adv-4, adv-5) gets the de-duplicated `input.enemyNames`; still 27 ids in the same order, deeply frozen, inputs still shared by reference with the sweep fixtures.
- Tests: `sweep_rules.test.mjs` 135 tests (was 104), `golden_rules.test.mjs` 118 tests (was 92). The CLEAN npc and combat fixtures, `npcReply` and the good outcomes are segment-shaped; the mutation table has 16 golden-specific rows each firing exactly its rule; new blocks cover allowed speakers, the replay-guard exports, every `segments_invalid` branch with 6/7 and 600/601 boundaries (also astral code points), `keeper_first_person` (quotes, dialogue, You text, look-alike words), segment-aware combat pronouns and the shared extraction.

## Verification

- `pnpm exec vitest run scripts/llm/golden_rules.test.mjs scripts/llm/sweep_rules.test.mjs scripts/llm/proof_observed.test.mjs`: 3 files, 263 tests pass.
- Free dry run `env -u GOLDEN_LIVE_RUN pnpm exec vitest run --config scripts/llm/vitest.live.config.ts golden`: passes, prints "dry: 27 requests built, validated and byte-stable, none sent". No paid call, no `approvedBy`, GOLDEN_LIVE_RUN never set.
- `pnpm exec vitest run scripts/llm`: 410 tests pass; only the baseline collection failures `call_log_report.test.mjs`, `golden_run.test.mjs`, `proof_rules.test.mjs` (golden_run is repaired in 46-05). No new failing file.
- Voice gate `git diff --quiet 6aa1f4f1 -- keeper_bible.ts llm_layers.ts llm_schemas.ts llm_routes.ts`: exit 0. `range_violation` and every other existing rule's logic untouched.
- Greps: `missing_segments` and `segments.ts` in sweep_rules.mjs; `export const GOLDEN_RULES_ADDED_IN_46` 1; `export const GOLDEN_SHAPE_CHANGED_ROUTES` 1; `allowedSpeakers` in golden_set.mjs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Process] Tests first only for Task 1**
Task 1 followed RED (34 failing) then GREEN. For Task 2 I rewrote the existing fixtures and added the new tests in the same pass as the implementation and ran them together (118 pass on the first run), so there is no separate failing run for it. The intermediate commit 478aedc0 leaves `golden_rules.test.mjs` red by design (it uses `structuralCheck`); 812b3e0e repairs it.

**2. [Rule 1 - Bug avoided] Existing combat prose tests**
Plain-prose combat replies now fail `structure_invalid` and `segments_invalid` by design. The existing tests that asserted an exact failure list or a pass for combat (mutation rows for budget, keeper_pronoun, player_pronoun, lone_player_named, prompt_leak, "lets a beast be called it") were switched to segment-shaped replies. Tests that only assert `toContain` of a rule on prose were left on the legacy path on purpose, so the raw-text behavior stays pinned.

## Known Stubs

None.

## Threat Flags

None. Offline pure rules only; the harness spend guards are untouched.

## Flagged assumption (SEG-05, unresolved)

Whether a narrator-voice golden run actually passes these mechanical rules is unknown until the paid run, deferred to the end-of-milestone testing pass with a cost estimate first. This plan proves readiness only. Notes for that run: a combat reply that is only dialogue segments fails `narration_sentences`, and the plain word `mine` (the noun) in Keeper narration fails `keeper_first_person` because the plan lists it explicitly.

## Deferred owner verification

None for this plan (no `checkpoint:human-verify` task).

## Self-Check: PASSED

- FOUND: scripts/llm/sweep_rules.mjs, sweep_rules.test.mjs, golden_rules.mjs, golden_rules.test.mjs, golden_set.mjs
- FOUND commits: 478aedc0, 812b3e0e
