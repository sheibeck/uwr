---
phase: 46-structured-keeper-replies
plan: 07
subsystem: voice
tags: [voice, keeper-bible, route-blocks, npc-reply-shape, segments, approved-edits]
requires: ["46-06"]
provides:
  - "Approved narrator-voice Keeper Bible (bible-identity, bible-voice, bible-formatting, bible-example-1 to 4) applied verbatim"
  - "Approved non-combat route blocks (creation_race, creation_class_reveal, creation_class, world_gen_start, world_gen, skill_gen, renown_perk_gen) applied verbatim"
  - "npc_conversation route block asks for a segments reply (Keeper narration plus NPC dialogue), keeping internalThought, effects, memoryUpdate"
  - "Three approved schema descriptions (route-schema-race, -skill, -renown) applied in llm_schemas.ts"
affects: [46-08, 46-09, 46-10]
tech-stack:
  added: []
  patterns:
    - "Conformance check: every voice:after block with prefix bible- or route- is a substring of its source file after CRLF-to-LF normalization on both sides"
key-files:
  created: []
  modified:
    - spacetimedb/src/data/keeper_bible.ts
    - spacetimedb/src/data/keeper_bible.test.ts
    - spacetimedb/src/data/llm_layers.ts
    - spacetimedb/src/data/llm_layers.test.ts
    - spacetimedb/src/data/llm_schemas.ts
    - spacetimedb/src/data/__snapshots__/llm_schemas.test.ts.snap
    - spacetimedb/src/helpers/__snapshots__/claude_request.test.ts.snap
    - spacetimedb/src/helpers/__snapshots__/llm_apply.characterization.test.ts.snap
key-decisions:
  - "Applied the three route-schema-* blocks to llm_schemas.ts: the package (section G) assigns them to 46-07 and the plan's own conformance check with prefix route- requires them, which overrides the plan's 'llm_schemas.ts unchanged' acceptance line"
  - "Blocks were applied by script from the approved package (unique-match replace, file line endings preserved), not retyped"
metrics:
  duration: "about 15 minutes"
  completed: 2026-10-05
  tasks: 2
  files: 8
status: complete
---

# Phase 46 Plan 07: Approved Bible and non-combat route blocks Summary

The owner-approved narrator-voice Keeper Bible and the approved non-combat route blocks are applied verbatim, and the NPC route now asks the model for a `segments` array (one optional Keeper narration line plus the NPC's dialogue), which the 46-02 apply layer already stores. No paid call, no publish.

## Commits

| Task | Commit | What |
|------|--------|------|
| 1 | e85859be | Bible blocks bible-identity, bible-voice, bible-formatting, bible-example-1 to 4; new no-first-person example test |
| 2 | 7c68e2e5 | route-* blocks, route-schema-* descriptions, moved pin, re-recorded snapshots |

## Applied blocks (21 after blocks, conformance check exit 0)

- Bible (7): bible-identity, bible-voice, bible-formatting, bible-example-1, -2, -3, -4. Bible is now 8827 characters, seven headings once and in order, 4 examples.
- Route (11, llm_layers.ts): route-creation_race-1, route-creation_class_reveal-1, route-creation_class-1, route-world_gen_start-1, route-world_gen-1, route-skill_gen-1, route-renown_perk_gen-1, route-npc_conversation-1 to 4.
- Route schema (3, llm_schemas.ts): route-schema-race, route-schema-skill, route-schema-renown.
- No `voice:rejected` block existed; none applied. Combat block, COMBAT_NARRATION_SCHEMA, reply schemas for combat and `llm_routes.ts` are untouched (46-08).

Conformance command: all `voice:after` blocks with prefixes `bible-` and `route-`, comparing after normalizing CRLF to LF on both sides: `after-blocks 21 missing` (none), exit 0.

## Moved pins and snapshots, with the approved block id

| Pin or snapshot | Moved by | Notes |
|-----------------|----------|-------|
| `llm_layers.test.ts` "npc_conversation describes the JSON reply...": key list `dialogue` becomes `segments`; added `not.toContain('"dialogue":')` | route-npc_conversation-4 | The old pin would still have passed by accident (`"kind": "dialogue"`), so the new line makes it real |
| `claude_request.test.ts.snap`: creation_race | route-creation_race-1, route-schema-race | |
| same: creation_class_reveal | route-creation_class_reveal-1 | |
| same: creation_class | route-creation_class-1 | |
| same: world_gen_start | route-world_gen_start-1 | |
| same: world_gen | route-world_gen-1 | |
| same: skill_gen | route-skill_gen-1, route-schema-skill | |
| same: renown_perk_gen | route-renown_perk_gen-1, route-schema-renown | |
| same: npc_conversation | route-npc_conversation-1 to 4 | |
| same: combat_narration | none | Snapshot unchanged (8 request snapshots re-recorded, one per edited route above; the 3 schema snapshots below make the 11 updated in the run) |
| `llm_schemas.test.ts.snap`: RACE_SCHEMA, SKILL_GENERATION_SCHEMA, RENOWN_PERK_SCHEMA | route-schema-race, -skill, -renown | description text only |
| `llm_apply.characterization.test.ts.snap`: `reservedMicroUsd` on creation_class jobs (12 values, about +865 micro-USD each, e.g. 20348n to 21213n) | bible-* and route-creation_class_reveal-1 | The reservation is computed from prompt length; only that number changed in the diff |

The Bible examples changed no existing Bible or pronoun pin (`keeper_bible.test.ts` and `pronoun_rules.test.ts` passed unmodified on the approved text). The `claude_request` snapshots hold a Bible placeholder, so they did not move for bible-*.

New test: `keeper_bible.test.ts` "never uses the first person or names the Keeper inside an example". It excludes the `Example N (...)` description lines and the `Player text:` line, strips quoted speech, then asserts no whole-word I, me, my, mine, myself and no "the Keeper". It fails on the pre-edit examples ("the Keeper notes", "The Keeper has seen").

## Verification

- `vitest run` for keeper_bible, pronoun_rules, llm_layers, claude_request, llm_apply, llm_schemas: pass.
- Free golden dry run (`env -u GOLDEN_LIVE_RUN -u GOLDEN_ONLY ... golden`): passes, "dry: 27 requests built, validated and byte-stable, none sent". Worst-case reservation now $0.6046 (it was $0.5744 before the longer prompts); research estimate $0.25 to $0.60 and cap $2.00 unchanged. Nothing sent.
- Module suite: 3377 passed, 2 failed, both in `measurement.results.test.ts` (known baseline).
- Scripts suite (`scripts/llm`): 484 passed; failing files only `call_log_report.test.mjs` and `proof_rules.test.mjs` (known baseline); `golden_run.test.mjs` passes.
- `llm_routes.ts` unchanged since 6aa1f4f1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] llm_schemas.ts changed, contradicting the plan's "unchanged" acceptance line**
- **Found during:** Task 2 (conformance check)
- **Issue:** The plan's conformance prefix `route-` matches the three approved `route-schema-*` blocks, whose file is `llm_schemas.ts`; section G of the package assigns them to 46-07 (including the `llm_schemas.test.ts` snapshot). The plan's acceptance line `git diff --quiet 6aa1f4f1 -- llm_schemas.ts llm_routes.ts` could not hold at the same time.
- **Fix:** Applied the approved blocks (owner approved the optional pairs). `llm_routes.ts` is unchanged; `llm_schemas.ts` differs from the phase base only in those three description strings. The combat schema (46-08) is not touched; its before block (the registry) is intact.
- **Files modified:** spacetimedb/src/data/llm_schemas.ts, spacetimedb/src/data/__snapshots__/llm_schemas.test.ts.snap
- **Commit:** 7c68e2e5

**2. [Rule 3 - Blocking] llm_apply.characterization snapshot moved**
- **Found during:** Task 2 (full module suite)
- **Issue:** 4 tests failed because `reservedMicroUsd` is derived from the prompt length, which the approved Bible and route edits grew.
- **Fix:** Re-recorded the snapshot; diff reviewed, only `reservedMicroUsd` values changed.
- **Files modified:** spacetimedb/src/helpers/__snapshots__/llm_apply.characterization.test.ts.snap
- **Commit:** 7c68e2e5

## Notes for 46-08 to 46-10

- 46-08 edits `llm_schemas.ts` too (CRLF file); its combat-schema before block (the registry) is still verbatim in the file.
- The golden worst-case reservation total is now $0.6046 (hard upper bound, no retry). The package quoted $0.5744; the SEG-05 paid-run estimate in section F10 is slightly out of date and should be refreshed when the paid run is authorized. Nothing authorized now.
- OQ4 (NPC token headroom, maxTokens 512) remains for the deferred paid run.

## Known Stubs

None.

## Threat Flags

None. T-46-07-01 mitigated (byte-for-byte conformance, 21 of 21), T-46-07-02 (PLAYER INPUT paragraph and TAGGED_DATA_NOTE pins stayed green and untouched), T-46-07-04 (dry run only, no paid call, no publish, no push).

## Self-Check: PASSED

- FOUND: spacetimedb/src/data/keeper_bible.ts, llm_layers.ts, llm_schemas.ts (edited)
- FOUND commits: e85859be, 7c68e2e5
