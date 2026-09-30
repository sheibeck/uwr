---
phase: 40
slug: claude-request-layer-and-job-seam
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-29
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 (Node environment, default include `**/*.test.ts`) |
| **Config file** | none in `spacetimedb/`: defaults apply (`spacetimedb/package.json` script `test: vitest run`) |
| **Quick run command** | `pnpm --dir spacetimedb exec vitest run <paths touched by the task>` |
| **Full suite command** | `pnpm --dir spacetimedb test` (baseline: 18 files, 683 tests, about 5 s, all green) |
| **Estimated runtime** | about 5–10 seconds for the full unit suite; `spacetime build` about 2.5 s; `spacetime generate` about 3.8 s |

---

## Sampling Rate

- **After every task commit:** run the quick command for the files the task touched (under 5 s).
- **After every plan wave:** run `pnpm --dir spacetimedb test`. The 683 existing tests and all new tests must be green. Once the schema changes land, also run `spacetime build -p spacetimedb`.
- **Before `/gsd-verify-work`:** all of the following must pass:
  - the full suite is green
  - `spacetime build -p spacetimedb` succeeds
  - the `spacetime generate` privacy check passes (see the SEC-01 toolchain row)
  - `npx tsc --noEmit --pretty false` shows zero errors in files created or modified this phase (the 236 pre-existing errors elsewhere are not a gate)
  - the local publish succeeds without `--clear-database` (**never maincloud**)
  - `src/module_bindings/` is regenerated and committed
  - the user has approved the Keeper Bible's tone
- **Max feedback latency:** 30 seconds.

---

## Per-Task Verification Map

The planner fills in task IDs. The requirement-level map comes from 40-RESEARCH.md §Validation Architecture:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| CLAUDE-01 | One model constant. Every route has the model, an explicit effort, the locked `max_tokens`, a timeout ≤ 180 s, and a schema exactly when it returns JSON. A grep guard rejects other model IDs, with a shrinkable legacy allowlist | unit | `pnpm --dir spacetimedb exec vitest run src/data/llm_routes.test.ts src/data/model_literals.test.ts` | ❌ W0 | ⬜ pending |
| CLAUDE-02 | Body snapshots for all 8 routes. Forbidden and unknown keys are absent. Headers are correct. The parser reads the first `text` block. Stop reasons are handled: `max_tokens`, `refusal`, other. Error fixtures per status. `retry-after`, request-id, all 4 usage fields. Thrown timeout and network errors. Redaction | unit | `pnpm --dir spacetimedb exec vitest run src/helpers/claude_request.test.ts` | ❌ W0 | ⬜ pending |
| CLAUDE-03 | The linter passes all five schemas, region included, with one negative fixture per rule. Schemas are deterministic. The skill schema equals the mapped legacy schema. Enums are a subset of the mechanical vocabulary. Validators still clamp or reject: skill over budget, bad kind, mana cast floor, and a `world_gen` missing locations triggers a retry | unit | `pnpm --dir spacetimedb exec vitest run src/helpers/schema_lint.test.ts src/data/llm_schemas.test.ts src/helpers/skill_gen.test.ts src/helpers/world_gen.test.ts src/helpers/llm_apply.test.ts` | ❌ W0 (the skill_gen and world_gen tests exist and are extended) | ⬜ pending |
| CLAUDE-04 | `system` is [Bible, route block], each with `cache_control`, and is byte-identical across different volatile inputs. Player text appears only inside one tag pair. A neutralization matrix covers injection strings. The Bible is within its character range, has no interpolation markers and contains the tag rule. At most 4 breakpoints | unit | `pnpm --dir spacetimedb exec vitest run src/data/llm_layers.test.ts src/data/keeper_bible.test.ts` | ❌ W0 | ⬜ pending |
| PIPE-03 | Enqueuing twice from the same identity creates one job. A different key, route or identity creates separate jobs. A job in a terminal state allows a new one. Positive-control index lookup | unit | `pnpm --dir spacetimedb exec vitest run src/helpers/llm_queue.test.ts` | ❌ W0 | ⬜ pending |
| PIPE-08 | A rank-up enqueues a valid `llm_job` (route, playerId, pending, `requestJson` keys) and no `llm_task` row. Its columns are valid against `LlmJob`. A second rank-up call creates no duplicate. The fallback runs when no identity resolves. The test fails on the old insert shape | unit (regression) | `pnpm --dir spacetimedb exec vitest run src/helpers/renown_llm.test.ts` | ❌ W0 | ⬜ pending |
| SEC-01 | Recorder test: the new `llm_*` tables are private, and the public `llm_*` set is exactly `['llm_task']`. The view returns only the caller's rows, has six keys and no payload columns, and never uses `.iter()`. Keeper messages are non-empty | unit | `pnpm --dir spacetimedb exec vitest run src/schema/llm_privacy.test.ts src/views/llm.test.ts` | ❌ W0 | ⬜ pending |
| SEC-01 (toolchain) | `spacetime generate` into a temporary directory produces no `llm_job_table.ts`, `llm_call_log_table.ts` or `llm_config_table.ts`, and does produce `my_llm_jobs_table.ts` | script (phase gate) | `spacetime generate --lang typescript --out-dir <tmp> -p spacetimedb`, then `ls <tmp>` checks | ❌ phase gate | ⬜ pending |
| QUAL-04 | `createMockProcCtx` behavior: scripted fetch, timeout throw, sync-only `withTx`, rollback, re-invoke, no `ctx.db`, clock. A reference driver re-invokes `withTx` to persist and apply | unit | `pnpm --dir spacetimedb exec vitest run src/helpers/test-utils.test.ts src/helpers/llm_seam.test.ts` | ❌ W0 (extends the existing test-utils tests) | ⬜ pending |
| Extraction (behavior unchanged) | Characterization tests per domain and per failure path, written against the unchanged reducer and run unmodified after the move. Static guards: `submit_llm_result` is a thin wrapper, and `llm_apply.ts` never reads the sender | unit | `CI=true pnpm --dir spacetimedb exec vitest run src/helpers/submit_llm_result.characterization.test.ts src/helpers/llm_apply.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Task-level map (filled by the planner)

All commands run from the repo root. `vitest` below means `pnpm --dir spacetimedb exec vitest run`.

| Task | Wave | Requirement | Automated verify |
|------|------|-------------|------------------|
| 40-01 T1 createMockProcCtx + index mappings | 1 | QUAL-04 | `vitest src/helpers/test-utils.test.ts` |
| 40-01 T2 schema recorder + reducer capture | 1 | QUAL-04, SEC-01, PIPE-08 (column validator) | `vitest src/helpers/schema_recorder.test.ts` |
| 40-02 T1 subset linter | 1 | CLAUDE-03 | `vitest src/helpers/schema_lint.test.ts` |
| 40-02 T2 JSON Schemas | 1 | CLAUDE-03 | `vitest src/data/llm_schemas.test.ts src/helpers/schema_lint.test.ts` |
| 40-02 T3 model constant, route table, model-literal guard | 1 | CLAUDE-01 | `vitest src/data/llm_routes.test.ts src/data/model_literals.test.ts` |
| 40-03 T1 Keeper Bible draft | 2 | CLAUDE-04 | `vitest src/data/keeper_bible.test.ts` |
| 40-03 T2 player-text neutralizer and wrappers | 2 | CLAUDE-04 | `vitest src/data/llm_layers.test.ts` |
| 40-03 T3 route blocks and volatile builders | 2 | CLAUDE-04 | `vitest src/data/llm_layers.test.ts src/data/keeper_bible.test.ts` |
| 40-04 T1 private llm_job / llm_call_log + privacy test | 2 | SEC-01 | `vitest src/schema/llm_privacy.test.ts` then `spacetime build -p spacetimedb` |
| 40-04 T2 enqueueLlmJob, dedupe, call log | 2 | PIPE-03, SEC-01 | `vitest src/helpers/llm_queue.test.ts src/schema/llm_privacy.test.ts` |
| 40-05 T1 characterization: wrapper, creation, skill_gen | 2 | QUAL-04 (extraction safety) | `vitest src/helpers/submit_llm_result.characterization.test.ts` |
| 40-05 T2 characterization: world_gen, npc, combat, renown | 2 | QUAL-04 (extraction safety) | `vitest src/helpers/submit_llm_result.characterization.test.ts` |
| 40-05 T3 validator retention on model output | 2 | CLAUDE-03 | `vitest src/helpers/skill_gen.test.ts src/helpers/world_gen.test.ts` |
| 40-06 T1 request builder, headers, body guard | 3 | CLAUDE-02, CLAUDE-01, CLAUDE-04 (cache layout) | `vitest src/helpers/claude_request.test.ts` |
| 40-06 T2 parser, classifier, fixtures | 3 | CLAUDE-02 | `vitest src/helpers/claude_request.test.ts` |
| 40-07 T1 keeperMessageForJob + my_llm_jobs view | 3 | SEC-01 | `vitest src/views/llm.test.ts` then `spacetime build -p spacetimedb` |
| 40-07 T2 renown fix (RED then GREEN) | 3 | PIPE-08, PIPE-03 | `vitest src/helpers/renown_llm.test.ts src/reducers/renown.test.ts src/data/model_literals.test.ts` |
| 40-08 T1 llm_apply.ts verbatim copy + sender independence | 3 | QUAL-04, SEC-01 | `vitest src/helpers/llm_apply.test.ts src/helpers/submit_llm_result.characterization.test.ts` |
| 40-08 T2 thin submit_llm_result wrapper | 3 | QUAL-04 | `CI=true vitest src/helpers/submit_llm_result.characterization.test.ts src/helpers/llm_apply.test.ts` then `spacetime build -p spacetimedb` |
| 40-09 T1 reference-driver seam test | 4 | QUAL-04, SEC-01, PIPE-08 | `vitest src/helpers/llm_seam.test.ts` |
| 40-09 T2 phase gate, local publish, bindings, toolchain privacy | 4 | SEC-01 (toolchain) | `pnpm --dir spacetimedb test && spacetime build -p spacetimedb && test -f src/module_bindings/my_llm_jobs_table.ts && test ! -f src/module_bindings/llm_job_table.ts && test ! -f src/module_bindings/llm_call_log_table.ts && test ! -f src/module_bindings/llm_config_table.ts` |
| 40-10 T1 Keeper Bible tone sign-off (checkpoint:human-verify) | 5 | CLAUDE-04 | `vitest src/data/keeper_bible.test.ts` before presenting; the approval itself is manual |
| 40-10 T2 apply edits and re-test | 5 | CLAUDE-04 | `vitest src/data/keeper_bible.test.ts src/data/llm_layers.test.ts src/helpers/claude_request.test.ts && pnpm --dir spacetimedb test && spacetime build -p spacetimedb` |

Sampling continuity: every task has an automated command; no three consecutive tasks lack one.

---

## Wave 0 Requirements

- [ ] `spacetimedb/src/helpers/test-utils.ts`: add `createMockProcCtx`, and add `by_dedupe_key`, `by_status` and `by_job` to `INDEX_TO_COLUMN`. Extend `test-utils.test.ts`, including a positive control showing the new index accessors return rows (Plan 40-01 Task 1)
- [ ] A test-only schema recorder, `spacetimedb/src/helpers/schema_recorder.ts` (`createRecordingServerMock`, `rowColumnProblems`, `capturedReducer`, `snapshotDb`), so tests can load `schema/tables.ts` and `index.ts` without the real server package (Plan 40-01 Task 2)
- [ ] `spacetimedb/src/helpers/__fixtures__/claude/*.json`: Claude response fixtures (ok, truncated, refusal, 400, 401, 403, 429 with and without `retry-after`, spend-limit 429 and 400, 500, 529, empty output, unexpected stop) (Plan 40-06 Task 2)
- [ ] Characterization tests of the unchanged `submit_llm_result` before extraction (Plan 40-05)
- [ ] The new test files in the map above (none exist yet)
- [ ] Framework install: none (Vitest 5.0.2 is already present)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| The Keeper Bible's tone is approved | CLAUDE-04 (success criterion: user tone sign-off) | Tone is a judgment call, and CONTEXT locks it as a `checkpoint:human-verify` | The user reads `spacetimedb/src/data/keeper_bible.ts`, covering its voice rules, banned phrases, examples and tag rule, and replies "approved" or gives edits. Automated tests still check length, the tag rule and the absence of interpolation markers |
| Local publish succeeds without `--clear-database` | SEC-01 / schema delivery | Needs the local SpacetimeDB server, which isn't running at planning time. Must never go to maincloud | Start the server following the run-local skill (`spacetime start --non-interactive --listen-addr 127.0.0.1:3000`, backgrounded), then run `spacetime publish uwr -p spacetimedb` with no clear. If the publish asks to clear, **stop and ask the user**. Then `spacetime generate` into `src/module_bindings` and commit |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
