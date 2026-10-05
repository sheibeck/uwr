---
phase: 46-structured-keeper-replies
verified: 2026-10-05T17:40:00Z
status: human_needed
score: 4/5 must-haves verified (SEG-05 owner-deferred, routed to human verification)
behavior_unverified: 0
overrides_applied: 0
gaps: []
deferred:
  - truth: "CR-01 login_email exposure, public event-table exposure (pre-existing), WR-07 (keeper_first_person noun 'mine', owner decision G3), OQ4 (NPC re-sweep after the paid run)"
    addressed_in: "Owner-deferred (not a Phase 46 gap)"
    evidence: "Orchestrator context and 46-REVIEW-FIX.md (WR-07 skipped by owner decision G3); 46-10-SUMMARY Deferred owner verification items 3 and 7"
human_verification:
  - test: "SEG-05 paid golden run. Run `GOLDEN_LIVE_RUN=run pnpm exec vitest run --config scripts/llm/vitest.live.config.ts golden` only after the owner approves the cost (worst-case reservation about $0.62, cap $2.00)."
    expected: "The golden run passes its mechanical rules in the narrator voice, including segments_invalid and keeper_first_person; the eight Phase 44 range_violation items (cre-04, cre-05, skl-01, skl-02, skl-03, ren-01, ren-02, adv-2) no longer fail after the OQ3 (a) budget text. 46-golden-run.json and 46-golden-review.html are written."
    why_human: "Paid LLM calls; the owner deferred the run to the end-of-milestone testing pass. No golden-run artifact exists in the phase directory (confirmed)."
  - test: "SEG-05 owner tone sign-off on the labelled-line review page (46-golden-review.html), 'How the player reads it' lines."
    expected: "The owner judges the second-person scene-narrator voice acceptable; approvedBy is set only from the owner's own approval in chat."
    why_human: "Tone is the owner's call; golden_run.mjs accepts only { approved: true, approvedBy: 'user' }."
  - test: "Live combat schema acceptance: run one combat to a victory or defeat against the real API."
    expected: "The live API accepts COMBAT_NARRATION_SCHEMA, the longer JSON reply fits the unchanged combat maxTokens, and a dialogue segment from an enemy person lands as a dialogue segment; event_private rows of kind combat_narration carry segments."
    why_human: "Needs the live Anthropic API (assumption A1, T-46-08-01); no paid call is allowed in this phase."
  - test: "NPC segments in a real session: talk to an NPC."
    expected: "event_private gets a row with a 'The Keeper' narration segment and a separate '<NPC> says' dialogue segment; a malformed live reply shows one Keeper line."
    why_human: "Needs a live LLM reply; covered offline by tests only."
  - test: "Console read-through of the arrival, skill offer, renown offer, failure lines and the shorter NPC and combat fallback lines."
    expected: "The unquoted narration reads in the second-person narrator voice as the owner intended."
    why_human: "Subjective tone judgement."
  - test: "Live check that skill, renown and class replies come back in range with the stated power budgets (OQ3 a); note the added input tokens per call (about 400)."
    expected: "No range_violation on live replies."
    why_human: "Needs live LLM replies."
---

# Phase 46: Structured Keeper Replies Verification Report

**Phase Goal:** Every narrative LLM reply arrives as speaker-attributed segments in the Keeper's second-person scene-narrator voice and is stored with its event, so any client can render labelled lines.
**Verified:** 2026-10-05
**Status:** human_needed
**Re-verification:** No, initial verification

All code-level and offline-testable truths are VERIFIED against the source. The remaining items are the owner-deferred live and tone checks (SEG-05 and the 46-10 deferred list), which were declared out of scope for paid calls in this phase. No gaps found.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | NPC chat, world/scene narration, combat outro and creation replies come back as segments `{kind, speaker, text}`; NPC speech appears only in dialogue segments | VERIFIED | `helpers/segments.ts` (447 lines) exports `SEGMENT_KINDS = ['narration','dialogue']`, `normalizeSegments`, `segmentsFromReply` (ladder). `llm_apply.ts` `applyNpcConversationResult` builds `present` speakers from the DB (never model text) and stores `result.segments`. Combat route `combat_narration` is `{kind:'json', schema: COMBAT_NARRATION_SCHEMA}` (llm_routes.ts:82; schema llm_schemas.ts:321 with `segments[{kind enum, speaker, text}]`). Creation, arrival, skill, renown write `keeperSegments(...)` through `writeCreationSegments`/`writePrivateSegments`. Tests: 14 targeted files, 1433 tests pass (segments, llm_apply, combat_narration, drills, layers, schemas, routes, keeper_bible, pronoun_rules, claude_request). Live API acceptance of the combat schema is deferred (human item). |
| 2 | Segments are stored with the event: NPC talk yields "The Keeper" narration plus a separate "<NPC> says" dialogue line in the event data | VERIFIED | `schema/tables.ts:1353` `KeeperSegment` product type; optional `segments` column on three event tables (event_private, event_location, event_creation, tables.ts:1374/1395/1978). `events.ts` `segmentColumn` and trailing `segments?` param on `appendPrivateEvent`, `appendLocationEvent`, `appendCreationEvent`. Generated bindings carry the column (`src/module_bindings/event_*_table.ts`, `types.ts` `KeeperSegment`); the 46-10 bindings regeneration produced an empty diff and `git status` is clean. NPC apply calls `writePrivateSegments(..., 'npc', result.segments)` with `message = flattenSegments(segments)`. Schema column test `event_segments.test.ts` passes. Rows without segments (static, non-LLM text) render from `message`, the documented Phase 47 contract. |
| 3 | A malformed reply (bad JSON, unknown kind, missing speaker, empty text) is stored as one Keeper narration line and never breaks the feed; the offline failure drills cover it | VERIFIED | `segmentsFromReply` never throws and never returns an empty list (try/catch, final `keeperFallback`); NPC non-JSON path stores one Keeper line with no memory/affinity writes; combat apply uses `COMBAT_NARRATION_FALLBACK_LINE`. `llm_segment_drills.test.ts` (SEG-04 matrix over every narrative route plus the message/segments invariant) and `llm_failure_drills.test.ts` pass. Review iteration 3 ran a 20,000-input randomized probe on the packing (0 failures). |
| 4 | The Keeper narrates in the second person as in the Ledger mock, and the owner approved every Keeper Bible and route-block change before it landed | VERIFIED | 46-VOICE-CHANGES.md "Status: APPROVED 2026-10-05", section H records per-row owner decisions (bible-*, route-*, combat-*, fallback-*, string-*, OQ3 = a) and the post-review WR-01 addendum approved in chat. I re-ran a conformance check (CRLF-normalized): 59 of 59 approved after-blocks present in source, none missing. `keeper_bible.ts` states the narrator's chair, second person and "never say I, me, my or mine"; pronoun_rules and keeper_bible tests pass. Prohibition "MUST NOT change Bible/route-block wording before owner approval": satisfied by the approval record (judgment tier; the approval is documented in-repo, not an unflagged pass). |
| 5 | A golden run in the narrator voice passes its mechanical rules and the owner signs off on the tone (SEG-05, QUAL-01 carry-over) | HUMAN_NEEDED (owner-deferred) | Harness readiness is verified: `segments_invalid` and `keeper_first_person` rules in `golden_rules.mjs`, labelled-line `golden_review.mjs`, Phase 46 record paths, replay guard, `approvedBy: 'user'` gate in `golden_run.mjs`. Free dry run (re-run by me, env unset): "27 requests built, validated and byte-stable, none sent", worst-case reservation $0.6180. `golden_rules`, `golden_run`, `golden_review`, `sweep_rules` tests: 361 pass. No `46-golden-run.json` exists, as designed. Run and sign-off are the owner's end-of-milestone items. REQUIREMENTS.md correctly leaves SEG-05 unchecked/Pending. |

**Score:** 4/5 truths verified; 1 owner-deferred (human). 0 behavior-unverified truths: the state/invariant truths (fallback never empty, message equals flattened segments, speaker only from DB) each have a passing behavioral test.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `spacetimedb/src/helpers/segments.ts` | Pure segment contract and fallback ladder | VERIFIED | Substantive, imported by llm_apply, combat_narration, creation_generation, llm_sweeper, world_gen, golden_rules |
| `spacetimedb/src/schema/tables.ts` | KeeperSegment + optional column on 3 tables | VERIFIED | Lines 1353, 1374, 1395, 1978 |
| `spacetimedb/src/helpers/events.ts` | Helpers take segments | VERIFIED | `segmentColumn`, three helpers |
| `spacetimedb/src/helpers/llm_apply.ts` | Every narrative write path stores segments | VERIFIED | writePrivateSegments/writeCreationSegments at all LLM-reply sites |
| `spacetimedb/src/helpers/combat_narration.ts` | Segment-aware combat apply | VERIFIED | `segmentsFromReply` + `appendPrivateEvent(..., result.segments)` |
| `spacetimedb/src/data/llm_schemas.ts` / `llm_routes.ts` | COMBAT_NARRATION_SCHEMA, json route | VERIFIED | Lines above |
| `spacetimedb/src/data/keeper_bible.ts`, `llm_layers.ts` | Approved narrator-voice text | VERIFIED | 59/59 conformance |
| `scripts/llm/golden_rules.mjs`, `golden_review.mjs`, `golden_set.mjs`, `sweep_rules.mjs`, `golden.live.ts` | Harness for SEG-05 | VERIFIED | Tests pass, dry run builds 27 requests |
| `src/module_bindings/*` | Regenerated bindings | VERIFIED | `segments` getter on three tables, `KeeperSegment` type |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| llm_apply NPC apply | event_private.segments | `segmentsFromReply` -> `writePrivateSegments` -> `appendPrivateEvent(..., segs)` | WIRED |
| combat_narration apply | event_private.segments | `appendPrivateEvent(..., 'combat_narration', text, result.segments)` | WIRED |
| llm_routes combat_narration | COMBAT_NARRATION_SCHEMA | route table entry | WIRED |
| llm_layers per-call budget | skill_budget clamp | `abilityBudgetBounds` reads the clamp | WIRED |
| golden_rules | server normalizer | imports `normalizeSegments` from segments.ts | WIRED |

### Data-Flow Trace (Level 4)

Backend only; no rendering artifact in this phase. The stored data flows from the model reply through `segmentsFromReply` to the event row, and speakers come from DB names, not model text. FLOWING.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 46 module suites | `vitest run` on 14 files (segments, apply, combat, drills, events, schema column, layers, schemas, routes, bible, pronoun, claude_request) | 1433 passed | PASS |
| Harness suites | `vitest run scripts/llm/golden_rules, golden_run, golden_review, sweep_rules` | 361 passed | PASS |
| Free golden dry run | `env -u GOLDEN_LIVE_RUN -u GOLDEN_ONLY vitest run --config scripts/llm/vitest.live.config.ts golden` | 27 requests built, none sent | PASS |
| Approved text conformance | CRLF-normalized check of 59 voice:after blocks | missing: none | PASS |
| Full root suite / build | Orchestrator-provided (not re-run) | 4429 pass, only baseline failures; `pnpm build` clean | accepted |

### Probe Execution

No probes declared by this phase. Step 7c: SKIPPED.

### Requirements Coverage

All five IDs appear in plan frontmatter and in REQUIREMENTS.md; no orphaned Phase 46 requirement.

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| SEG-01 | 46-01, 02, 03, 07, 08 | Narrative routes return `{kind, speaker, text}` segments | SATISFIED | Truth 1; live combat schema acceptance is a human item |
| SEG-02 | 46-01, 02, 03 | Segments stored with the event | SATISFIED | Truth 2 |
| SEG-03 | 46-06, 07, 08, 09 | Second-person narrator voice; owner approves Bible/route changes | SATISFIED | Truth 4; approval record and 59/59 conformance. Tone read-through is a human item |
| SEG-04 | 46-01, 02, 03, 09 | Malformed reply falls back to one Keeper line | SATISFIED | Truth 3 |
| SEG-05 | 46-04, 05, 06, 10 | Golden run passes, owner tone sign-off | NEEDS HUMAN (deferred by owner) | Truth 5; REQUIREMENTS.md marks it Pending, which is accurate |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase diff f80654a9..HEAD, 47 source files) | - | TBD/FIXME/XXX added | none | No debt markers introduced |
| `world_gen.ts:371`, `renown.ts:192`, `index.ts:369,460`, `reducers/creation.ts`, `reducers/commands.ts` | - | Static, non-LLM Keeper-voice rows written without `segments` | Info | Not LLM replies; rows render from `message` (documented Phase 47 contract). Not a goal gap. |
| `world_gen.ts failWorldFill` (missing character path) | - | Resolved: the creation_error line carries `keeperFallback` segments (46-03 commit 233bedac, world_gen.ts:661-662); the private row on this path is a `system` line by design | Info | Orchestrator-checked 2026-10-05; the 46-02/46-10 summary note was stale |
| `spacetimedb/src/helpers/segments.ts`, `golden_rules.mjs` | - | WR-07 `keeper_first_person` flags the noun "mine" | Info | Owner decision G3, kept strict; revisit only if the paid run shows it firing |
| 46-10-SUMMARY / dry run | - | Worst-case reservation is $0.6180 now vs $0.6169 stated | Info | Small drift from the WR fixes; still well under the $2.00 cap |

### Human Verification Required

See the `human_verification` frontmatter list. In short: (1) the paid golden run, (2) the owner tone sign-off, (3) live combat schema acceptance, (4) NPC segments in a real session, (5) the console read-through, (6) live in-range skill/renown/class replies after the OQ3 budget text. All are owner-deferred to the end-of-milestone pass; none is a code gap.

### Gaps Summary

No gaps. Code review is clean (iteration 3; WR-01 to WR-09 fixed, WR-07 owner-deferred). The phase delivers segment contract, storage on three event tables with regenerated bindings, segment-aware apply for NPC, combat, creation, arrival, skill and renown, a malformed-reply fallback proven by offline drills, the owner-approved narrator voice (59/59 blocks in source), and a ready, dry-run-verified golden harness. The phase stays `human_needed` solely because SEG-05 (paid run and tone sign-off) and the live checks are deferred by owner decision.

---

_Verified: 2026-10-05_
_Verifier: Claude (gsd-verifier)_
