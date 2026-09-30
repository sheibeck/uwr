---
phase: 41
slug: executor-and-domain-cutover
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-30
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 (`spacetimedb/`) |
| **Config file** | none (defaults; `spacetimedb/package.json` scripts) |
| **Quick run command** | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 <paths touched by the task>` |
| **Full suite command** | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1` (baseline 34 files, 1454 tests, about 21 s) |
| **Other gates** | `spacetime build -p spacetimedb` (about 3 s, offline); `spacetime generate --lang typescript --out-dir <tmp> --module-path spacetimedb` (privacy check); client `pnpm build` (about 35 s; baseline green, `vue-tsc -b` clean) |
| **Estimated runtime** | about 21 s for the unit suite, plus about 35 s per client build |

---

## Sampling Rate

- **After every task commit:** run the quick command for the files the task touched.
- **After every plan wave:** run the full suite (single worker) and `spacetime build -p spacetimedb`.
- **After each domain-cutover plan:** run `pnpm spacetime:generate`, then `pnpm build`. The client must stay green once its `prepare_*` call is removed.
- **Before `/gsd-verify-work`:**
  - the full suite is green, the module build is green and the client build is green
  - the privacy `generate` check passes: the new tables are absent from bindings, and the admin view is admin-only
  - the local live proof has been run: the user set the key, the smoke test returned 6/6 ok, and one real action per domain succeeded under the $2 cap
  - the maincloud checklist has been run by the user, or explicitly deferred as `human_needed`
- **Max feedback latency:** 30 seconds per task, and about 60 seconds including a client build.

---

## Per-Task Verification Map

The planner fills in the task IDs. The requirement-level map comes from 41-RESEARCH.md §Validation Architecture. Every test runs through `createMockProcCtx` unless noted.

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| PIPE-01 | Each domain's triggering reducer inserts one `llm_job` plus one `llm_dispatch` in the caller's transaction. No `llm_task` row. No client `prepare_*` call, checked by a static grep of `src/` | unit (recorder + `capturedReducer`) | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/reducers/llm_cutover.test.ts` | ❌ W0 | ⬜ pending |
| PIPE-01 | `enqueueLlmJob` extension: dispatch row, reservation, refusal reasons, per-player cap of 3; dedupe still holds | unit | `… src/helpers/llm_queue.test.ts` | ✅ extend | ⬜ pending |
| PIPE-02 | Result applied from stored text after a simulated crash between tx2 and tx3 (sweeper re-apply). Apply acts for `job.playerId`, not the module sender | unit | `… src/helpers/llm_executor.test.ts src/helpers/llm_sweeper.test.ts` | ❌ W0 | ⬜ pending |
| PIPE-04 | Class table: 429 with `retry-after`, 529, 500, timeout and network retry with 2 s then 8 s delays (or `retry-after`, capped at 60 s) plus jitter, max 3 attempts. auth, billing, bad_request, refusal and truncated fail fast. creation, world_gen and narration never retry | unit | `… src/helpers/llm_retry.test.ts src/helpers/llm_executor.test.ts` | ❌ W0 | ⬜ pending |
| PIPE-05 | Sweeper: stuck `in_flight` (timeout + 30 s) expires, `received` re-applies, `pending` over 10 min expires (renown over 24 h), orphan pending jobs are dispatched. Each case refunds once, releases the domain lock and posts the Keeper message. The sweeper never throws | unit | `… src/helpers/llm_sweeper.test.ts` | ❌ W0 | ⬜ pending |
| PIPE-06 | Cap 4: the 5th job defers with a new dispatch 500–750 ms out. Narration defers at 3. `withTxReinvoke: 1` gives an identical end state | unit | `… src/helpers/llm_executor.test.ts` | ❌ W0 | ⬜ pending |
| PIPE-07 | Narration: skipped silently on refusal, one attempt, expired at claim when older than 20 s, dropped at persist when late, applied when on time. Outro enqueued from `handleVictory`/`handleDefeat` | unit | `… src/helpers/llm_executor.test.ts src/helpers/combat_narration.test.ts` | ❌ W0 | ⬜ pending |
| PIPE-09 | `capturedProcedure('llm_run')` and the sweeper reducer exist after loading `index.ts`. The procedure guards against a non-module sender. Only `helpers/llm_executor.ts` reaches `ctx.http` (fetch guard) | unit | `… src/helpers/schema_recorder.test.ts src/data/model_literals.test.ts` | ✅ extend | ⬜ pending |
| SEC-04 | Redaction across every failure class with the key as needle: no leak in any row outside `llm_config`, in call-log messages or in captured `console` output. The key appears only in the header. Admin gating covers `set_api_key`, the smoke test and the status view (a non-admin gets `[]`). The CLI identity is in the admin set | unit | `… src/helpers/llm_executor.test.ts src/views/llm.test.ts src/data/admin.test.ts` | ❌ W0 | ⬜ pending |
| COST-01 | tx2 writes the 4 usage counts and the cost per route to `llm_call_log`. The counts survive on a `received` job | unit | `… src/helpers/llm_executor.test.ts` | ❌ W0 | ⬜ pending |
| COST-02 | Reserve/settle math from all 4 usage fields matches `estimateCostMicroUsd`. The $1.00/day and 200-call limits refuse in voice with nothing reserved. The $2 phase cap refuses. Refunds are idempotent in either order. UTC day rollover works. A thrown timeout charges the ledger but not the player | unit | `… src/helpers/llm_budget.test.ts` | ❌ W0 | ⬜ pending |
| OPS-01 | The admin `llm_smoke_test` enqueues 6 jobs and skips apply. It updates the last smoke result and the key-verified time, and key status is derived correctly after `set_api_key` | unit | `… src/reducers/llm_admin.test.ts` | ❌ W0 | ⬜ pending |
| Hand-offs | Renown bigint fallback serialized (ranks 2, 3, 5, 9, 11). Creation clamps: stat enums, ranges, kinds. `toBigIntSafe`. `retryWorldGen` sets `ERROR`. `request_skill_offer` works | unit | `… src/helpers/submit_llm_result.characterization.test.ts src/helpers/creation_validate.test.ts src/helpers/llm_inputs.test.ts` | partial; update deliberately | ⬜ pending |
| Client | Build stays green after each domain removes its `prepare_*` call | build gate | `pnpm build` | ✅ | ⬜ pending |
| Live | A real call per domain locally under the $2 cap, and a smoke test with all 6 ok | manual/live | the live-proof script, then read the admin status view | ❌ W0 (human-action) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Task-level map (filled by the planner)

| Task | Requirement | Automated verify |
|------|-------------|------------------|
| _planner fills_ | | |

---

## Wave 0 Requirements

- [ ] New test files:
  - `helpers/llm_executor.test.ts`
  - `llm_budget.test.ts`
  - `llm_sweeper.test.ts`
  - `llm_retry.test.ts`
  - `llm_inputs.test.ts`
  - `creation_validate.test.ts`
  - `reducers/llm_admin.test.ts`
  - `reducers/llm_cutover.test.ts`
  - `data/admin.test.ts`
- [ ] `helpers/test-utils.ts`: `MockReply.advanceMicros`, so a fetch advances the mock clock
- [ ] Extend the fetch guard and `llm_privacy.test.ts` for the new private tables and the admin view. Shrink the model-literal allowlist per domain
- [ ] Framework install: none

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Set the Anthropic key locally | SEC-04 / OPS-01 | The key is the user's secret. `llm_config` holds the Phase 39 placeholder | The user runs the key script (`scripts/llm/set-key.mjs`), which reads `spacetimedb/.env.local` and never echoes the key. Claude never reads the key |
| Local live proof, one real action per domain | PIPE-01/02/09, COST-01 | Real Claude calls cost money (within the $2 cap) and need the key | After the key is set, run the live-proof script: NPC chat, combat outro, skill offer, renown, creation and world gen. Then check that every `llm_job` completed and `llm_call_log` has usage |
| Maincloud proof | Roadmap SC6 | Claude never publishes to or calls maincloud | The user publishes when ready, sets the key, runs the smoke test and one action per domain from the checklist, and reports dispatch p95 / reliability from `llm_call_log`, plus a qualitative ping/tick check. A failure reopens the executor decision |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
