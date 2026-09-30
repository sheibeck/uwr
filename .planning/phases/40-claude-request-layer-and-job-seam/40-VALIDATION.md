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
| Extraction (behavior unchanged) | Characterization tests per domain and per failure path. Static guards: `submit_llm_result` is a thin wrapper, and `llm_apply.ts` never uses `ctx.sender` | unit | `pnpm --dir spacetimedb exec vitest run src/helpers/llm_apply.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Task-level map (filled by the planner)

| Task | Requirement | Automated verify |
|------|-------------|------------------|
| _planner fills_ | | |

---

## Wave 0 Requirements

- [ ] `spacetimedb/src/helpers/test-utils.ts`: add `createMockProcCtx`, and add `by_dedupe_key`, `by_status` and `by_job` to `INDEX_TO_COLUMN`. Extend `test-utils.test.ts`, including a positive control showing the new index accessors return rows
- [ ] A test-only schema recorder (a shared `vi.hoisted` recorder plus `expectRowMatchesTable`), so pure modules never import `spacetimedb/server` in vitest
- [ ] `spacetimedb/src/helpers/__fixtures__/claude/*.json`: Claude response fixtures (ok, truncated, refusal, 400, 401, 403, 429 with and without `retry-after`, spend-limit 429 and 400, 500, 529, empty output, unexpected stop)
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
