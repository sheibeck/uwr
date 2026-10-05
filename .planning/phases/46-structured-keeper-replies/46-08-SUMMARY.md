---
phase: 46-structured-keeper-replies
plan: 08
subsystem: llm-routes
tags: [combat-narration, structured-output, json-schema, route-flip, segments]
requires: ["46-07"]
provides:
  - "COMBAT_NARRATION_SCHEMA (required segments array of {kind, speaker, text}) and LLM_JSON_SCHEMAS.combatNarration"
  - "combat_narration is a JSON route: every request carries output_config.format with the schema"
  - "Approved combat route block (JSON segments reply) applied verbatim"
  - "sweep.live.ts treats combat_narration as a JSON route"
affects: [46-09, 46-10, 46.1]
tech-stack:
  added: []
  patterns:
    - "Phase 46.1 contract: COMBAT_NARRATION_SCHEMA has no narrative-type field, so big-moment and end-of-fight replies share it; per-moment wording belongs in the volatile user message"
key-files:
  created:
    - spacetimedb/src/helpers/__fixtures__/claude/ok_combat_segments.json
  modified:
    - spacetimedb/src/data/llm_schemas.ts
    - spacetimedb/src/data/llm_routes.ts
    - spacetimedb/src/data/llm_layers.ts
    - spacetimedb/src/data/llm_schemas.test.ts
    - spacetimedb/src/data/__snapshots__/llm_schemas.test.ts.snap
    - spacetimedb/src/data/llm_routes.test.ts
    - spacetimedb/src/data/llm_layers.test.ts
    - spacetimedb/src/helpers/claude_request.test.ts
    - spacetimedb/src/helpers/__snapshots__/claude_request.test.ts.snap
    - spacetimedb/src/helpers/llm_executor.test.ts
    - spacetimedb/src/reducers/llm_cutover.test.ts
    - scripts/llm/sweep.live.ts
    - scripts/llm/golden_rules.test.mjs
    - scripts/llm/golden_run.test.mjs
key-decisions:
  - "OQ7 applied: the recommended allow-list (listed enemies plus NPCs at the location). combatPresentSpeakers from 46-03 is unchanged, and combat-block-2 keeps its dialogue sentence"
  - "Blocks applied by script from the approved package (unique-match replace, per-file line endings preserved), not retyped"
  - "llm_tuning.ts untouched (git diff against 6aa1f4f1 is empty): combat maxTokens still traces to the measurement record"
metrics:
  duration: "about 25 minutes"
  completed: 2026-10-05
  tasks: 2
  files: 15
status: complete
---

# Phase 46 Plan 08: Combat narration as a structured-output segments route Summary

Combat narration is now a JSON route: the provider enforces `{segments: [{kind, speaker, text}]}`, the approved combat block asks for exactly that, and the apply layer from 46-03 already stores it. Schema, route kind and block landed in one commit. No paid call, no publish, no push.

## Commits

| Task | Commit | What |
|------|--------|------|
| 1 | 70a58101 | COMBAT_NARRATION_SCHEMA, json route kind, combat-block-1 to 3, test and snapshot updates |
| 2 | 2ff23913 | sweep.live.ts JSON_ROUTES, combat test fixtures moved to a segments reply, golden rule tests |

## Applied blocks (7 after blocks, conformance check exit 0)

combat-block-1, combat-block-2, combat-block-3 (llm_layers.ts); combat-schema (llm_schemas.ts); combat-import, combat-header, combat-route (llm_routes.ts). The check normalizes CRLF to LF on both sides: `blocks 7 bad` (none). No `voice:rejected` combat block existed. `llm_schemas.ts` and `llm_routes.ts` kept their CRLF endings.

## Moved pins, with the approved block id

| Pin or test | Moved by | Notes |
|-------------|----------|-------|
| `llm_layers.test.ts` "asks for 2-4 sentences of plain prose, not JSON" replaced by "asks for a JSON segments reply, not plain prose" (segments array, 2-4 sentences in the second person, at most 6 segments; `plain prose` and `No JSON` now absent) | combat-block-2 | EXACT names and Never contradict pins kept |
| `llm_layers.test.ts` new pin: lone player is only you (no man, woman, stranger, fighter or noun), summary segments sentence, player never speaks in a segment | combat-block-1, -2, -3 | The draft/self-correction pin, the summary second-person prefix pin and "a beast may be it" stayed untouched |
| `llm_routes.test.ts`: combat removed from the three text routes; now two (npc_conversation, smoke_test); combat pinned `{kind:'json', schema: COMBAT_NARRATION_SCHEMA}` by identity; JSON_SCHEMAS map gains combat | combat-route | |
| `llm_schemas.test.ts`: schema added to the ALL list (lint clean, 0 optional, 0 union params, deterministic, frozen); new shape test (required segments array, three required fields, no bounds, kind enum equals SEGMENT_KINDS); registry key list gains `combatNarration` | combat-schema | Follows the package note that a test ties the literal kind list to SEGMENT_KINDS |
| `claude_request.test.ts`: "seven json routes and three text routes" now eight and two; a json route given prose test now also covers combat | combat-route | |
| `claude_request.test.ts` CASES and tests that used combat_narration as the text-route example (ok_text, missing_cache_usage, ok text route, missing usage) now use npc_conversation; new case `ok_combat_segments` on combat_narration | combat-route | Failure-class cases for combat (pause_turn and so on) are route-independent and stay |

## Changed snapshots

- `llm_schemas.test.ts.snap`: one new entry, COMBAT_NARRATION_SCHEMA (nothing else moved).
- `claude_request.test.ts.snap`: only the combat_narration body changed: `output_config.format` (json_schema with the segments schema) added, and the three approved block changes. All other routes unchanged.

## OQ7 decision applied

The owner approved the recommended allow-list: listed enemies plus NPCs at the first participant's location. `combatPresentSpeakers` (46-03) is untouched, as are `combat_narration.test.ts` and `llm_segment_drills.test.ts`; both stayed green.

## Verification

- Schema, routes, layers, claude_request, tuning tests: 527 passed. `git diff --quiet 6aa1f4f1 -- llm_tuning.ts` exits 0.
- `grep -c "export const COMBAT_NARRATION_SCHEMA"` = 1; `grep -c "kind: 'json', schema: COMBAT_NARRATION_SCHEMA"` = 1; `grep -c "r !== 'combat_narration'" sweep.live.ts` = 0; the npc_conversation exclusion remains.
- Free golden dry run (`env -u GOLDEN_LIVE_RUN -u GOLDEN_ONLY`): passes, "dry: 27 requests built, validated and byte-stable, none sent".
- Module suite: 3383 passed, 2 failed, both `measurement.results.test.ts` (known baseline).
- Scripts suite: 485 passed; failing files only `call_log_report.test.mjs` and `proof_rules.test.mjs` (known baseline); `golden_run.test.mjs` and `golden_rules.test.mjs` pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Executor and cutover tests scripted a plain-prose combat reply**
- **Found during:** Task 2 (full module suite)
- **Issue:** `llm_executor.test.ts` (2 tests) and `llm_cutover.test.ts` (2 tests) fed the `ok_text` fixture to a combat_narration job; on a JSON route that is `invalid_json`, so the job failed. These files were not in the plan's file list.
- **Fix:** Added fixture `ok_combat_segments.json` (same usage and cost as `ok_text`, one Keeper narration segment with the same sentence, so cost and message assertions are unchanged) and pointed those four tests at it. Registered it in the `claude_request.test.ts` fixture case table (a test requires one case per fixture).
- **Commit:** 2ff23913

**2. [Rule 3 - Blocking] Golden rule tests assumed combat is a text route**
- **Found during:** Task 2 (scripts suite)
- **Issue:** 11 tests in `golden_rules.test.mjs` and `golden_run.test.mjs` judged combat prose; on a JSON route `evaluateGoldenItem` reports `empty_reply` for prose. `golden_run.test.mjs` is required to stay green.
- **Fix:** Tone, boundary, order and golden_run redaction cases now feed combat replies as segments objects (`cmbOut`). The "combat prose is structure_invalid" test became "combat prose is an empty reply" plus a new test that a JSON object without segments is schema_invalid, structure_invalid and segments_invalid. The rule code (`golden_rules.mjs`) is unchanged: it already read `cfg.output.kind`.
- **Commit:** 2ff23913

## Deferred owner verification

Nothing human-verify in this plan. For the deferred paid run (SEG-05, not authorized): confirm the live API accepts COMBAT_NARRATION_SCHEMA (assumption A1, T-46-08-01), that combat outro replies stay inside the unchanged combat maxTokens with the longer JSON shape, and that dialogue from a person-enemy lands as a dialogue segment.

## Known Stubs

None.

## Threat Flags

None. T-46-08-02 mitigated (schema, route and block in one commit, conformance 7 of 7), T-46-08-03 (server allow-list unchanged, normalizer decides speakers), T-46-08-04 (sweep edited, never run; golden dry run only with paid modes unset; no publish, no push).

## Self-Check: PASSED

- FOUND: spacetimedb/src/data/llm_schemas.ts (COMBAT_NARRATION_SCHEMA), llm_routes.ts, llm_layers.ts, helpers/__fixtures__/claude/ok_combat_segments.json
- FOUND commits: 70a58101, 2ff23913
