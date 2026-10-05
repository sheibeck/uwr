---
phase: 46
slug: structured-keeper-replies
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-05
---

# Phase 46 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 46-RESEARCH.md "## Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2. Module tests run from `spacetimedb/` with the default `vitest run` (no config file). Harness tests run from the root. Live harness files use `scripts/llm/vitest.live.config.ts`. |
| **Config file** | none for module and `scripts/llm` unit tests; `scripts/llm/vitest.live.config.ts` for the golden dry run |
| **Quick run command** | `cd spacetimedb && pnpm exec vitest run src/helpers/segments.test.ts src/helpers/llm_segment_drills.test.ts src/helpers/events.test.ts` |
| **Full suite command** | `cd spacetimedb && pnpm exec vitest run` and, from the root, `pnpm exec vitest run scripts/llm` |
| **Golden dry run (free)** | `pnpm exec vitest run --config scripts/llm/vitest.live.config.ts golden` (no `GOLDEN_LIVE_RUN`, so no paid call) |
| **Estimated runtime** | ~10 s quick, ~60 s full (module + harness) |

**Baseline (pre-existing, unrelated):**
- `spacetimedb/src/helpers/measurement.results.test.ts`
- `scripts/llm/call_log_report.test.mjs`
- `scripts/llm/proof_rules.test.mjs`
- `scripts/llm/golden_run.test.mjs`. This one is in scope for repair in this phase (SEG-05 path fix and replay guard). After the fix it must pass.

All four fail because the v2.2 phase folders moved to `.planning/milestones/`. The gate is "no new failures beyond this list".

---

## Sampling Rate

- **After every task commit:** the quick run command, plus the one suite for the layer the task touched.
- **After every plan wave:** `cd spacetimedb && pnpm exec vitest run` and `pnpm exec vitest run scripts/llm`. Compare the results against the baseline.
- **Before `/gsd-verify-work`, all of the following:**
  - full module suite green apart from the baseline
  - `scripts/llm` green apart from the two untouched baseline files
  - golden dry run green
  - local publish (`--break-clients`, no clear) and bindings regeneration done
  - voice checkpoint approved and its diff verified
- **Max feedback latency:** 60 seconds

---

## Per-Requirement Verification Map

Task IDs are assigned by the planner. Each plan's tasks reference the rows below.

| Requirement | Behavior | Threat Ref | Test Type | Automated Command | File Exists | Status |
|-------------|----------|------------|-----------|-------------------|-------------|--------|
| SEG-01 | Segment rules: type, kind allowlist (`narration`/`dialogue`), narration speaker is always "The Keeper", dialogue speaker matched to a present NPC (otherwise narration), caps of 6 segments and 600 code points (astral-safe), empty segments dropped | spoofed speaker / prompt-injected speaker name | unit | `cd spacetimedb && pnpm exec vitest run src/helpers/segments.test.ts` | ❌ W0 | ⬜ pending |
| SEG-01 | `COMBAT_NARRATION_SCHEMA` lints clean, union and optional counts within limits, `combat_narration` is a json route, request carries `output_config.format` | — | unit | `cd spacetimedb && pnpm exec vitest run src/data/llm_schemas.test.ts src/data/llm_routes.test.ts src/helpers/claude_request.test.ts` | ✅ (edit) | ⬜ pending |
| SEG-01 | NPC reply yields a Keeper narration segment and a separate dialogue segment; NPC speech only in dialogue segments; the player is never a speaker | player-text echo as a speaker | integration (apply) | `cd spacetimedb && pnpm exec vitest run src/helpers/llm_apply.test.ts` | ✅ (edit) | ⬜ pending |
| SEG-02 | Optional `segments` column on exactly `event_private`, `event_location` and `event_creation`; absent on `event_world` and `event_group`; named type `KeeperSegment` | — | schema | `cd spacetimedb && pnpm exec vitest run src/schema/event_segments.test.ts` | ❌ W0 (uses `schema_recorder`) | ⬜ pending |
| SEG-02 | Helpers write `segments` when given and omit them otherwise; `message` equals `flattenSegments(segments)`; existing callers unchanged | — | unit | `cd spacetimedb && pnpm exec vitest run src/helpers/events.test.ts` | ✅ (edit) | ⬜ pending |
| SEG-02 | Stored event shape per route (npc, combat, creation ×3, skill, renown, arrival): one row with segments and a plain `message` | — | characterization | `cd spacetimedb && pnpm exec vitest run src/helpers/llm_apply.characterization.test.ts` | ✅ (re-record, reviewed) | ⬜ pending |
| SEG-02 | Local publish accepts the schema with `--break-clients` and no clear; bindings regenerate cleanly | data loss via `--clear-database` (wipes the stored key) | manual (local server) | `spacetime publish uwr -p spacetimedb --break-clients`, then `pnpm spacetime:generate`. `git diff --stat src/module_bindings` shows only the three tables and the types file. | manual-only | ⬜ pending |
| SEG-03 | No Bible or route-block edit before approval: `git diff` of `keeper_bible.ts` and `llm_layers.ts` is empty at the checkpoint. After approval the diff equals the approved package, and the pinned layer and Bible tests are updated and green. | unapproved voice change | manual gate + unit | Pre-approval: `git diff --quiet <phase-base> -- spacetimedb/src/data/keeper_bible.ts spacetimedb/src/data/llm_layers.ts`. Post-approval: `cd spacetimedb && pnpm exec vitest run src/data/llm_layers.test.ts src/data/keeper_bible.test.ts src/data/pronoun_rules.test.ts` | ✅ (edit after approval) | ⬜ pending |
| SEG-04 | Malformed-reply matrix on every narrative route: bad JSON, valid JSON without segments, unknown kind, missing speaker, empty or whitespace text, zero valid segments, over 6, over 600, spoofed speaker, markup or control characters, fenced JSON. Each case stores exactly one Keeper narration segment (or the specified wrap) and a plain `message`. It never throws and never writes a second event. | malformed / hostile model output | unit (table-driven) | `cd spacetimedb && pnpm exec vitest run src/helpers/llm_segment_drills.test.ts` | ❌ W0 | ⬜ pending |
| SEG-04 | Offline failure drills (`llm_failure_drills.test.ts`) stay green and gain segment cases for failure lines | — | unit | `cd spacetimedb && pnpm exec vitest run src/helpers/llm_failure_drills.test.ts` | ✅ (extend) | ⬜ pending |
| SEG-05 | Golden rules for the segment shape; items carry expectations; `GOLDEN_RULES` order; combat tone lints on joined text; `NARRATIVE_KEY` covers `text` | — | unit | `pnpm exec vitest run scripts/llm/golden_rules.test.mjs scripts/llm/sweep_rules.test.mjs scripts/llm/golden_review.test.mjs` | ✅ (edit) | ⬜ pending |
| SEG-05 | Golden dry run builds all 27 production requests (combat now with `output_config.format`); output is byte-stable; worst case is under the stop line | paid call by accident | dry (free) | `pnpm exec vitest run --config scripts/llm/vitest.live.config.ts golden` | ✅ | ⬜ pending |
| SEG-05 | `golden_run` pure rules restored (path fix); replay guarded for changed-shape routes | — | unit | `pnpm exec vitest run scripts/llm/golden_run.test.mjs` | ✅ (edit; fails at collection today) | ⬜ pending |
| SEG-05 | Paid golden run and owner tone sign-off | unapproved spend | manual, deferred to end of milestone | `GOLDEN_LIVE_RUN=run pnpm exec vitest run --config scripts/llm/vitest.live.config.ts golden`, only after the owner approves the cost estimate | deferred | ⬜ deferred |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `spacetimedb/src/helpers/segments.test.ts`: clamp and canonicalization cases for SEG-01 and SEG-04
- [ ] `spacetimedb/src/helpers/llm_segment_drills.test.ts`: the SEG-04 matrix. Drive it through `applyLlmResult` with the real events module, not the mocked one, so the stored row shape is asserted.
- [ ] `spacetimedb/src/schema/event_segments.test.ts`: SEG-02 column presence and absence, checked through `schema_recorder`
- [ ] `scripts/llm/golden_run.test.mjs`: repoint the path and add the replay guard, to restore SEG-05 coverage
- [ ] Framework install: none (existing Vitest infrastructure)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Local publish and bindings regeneration | SEG-02 | Needs the owner's running local SpacetimeDB server. Never maincloud. | `spacetime publish uwr -p spacetimedb --break-clients` (no `--clear-database`), then `pnpm spacetime:generate`, then review `git diff --stat src/module_bindings` |
| Voice package approval | SEG-03 | A content judgment by the owner. This is not testing, so it is not deferred. | Review `46-VOICE-CHANGES.md` at the blocking checkpoint, then approve or edit it |
| Paid golden run and tone sign-off | SEG-05 | Billed LLM calls. Deferred to the end-of-milestone testing pass with a cost estimate first. | Owner approves the estimate, then the live golden run and review |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
