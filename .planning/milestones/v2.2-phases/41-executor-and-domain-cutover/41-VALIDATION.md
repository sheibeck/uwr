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

All module commands run as `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 <files>` (shortened to `vitest <files>` below). Script tests run from the repo root as `pnpm exec vitest run --maxWorkers=1 <file>`.

| Task | Wave | Requirement | Automated verify |
|------|------|-------------|------------------|
| 41-01 T1 constants and admin identity | 1 | PIPE-06, COST-02, SEC-04 (admin gate) | `vitest src/data/llm_limits.test.ts src/data/admin.test.ts` |
| 41-01 T2 tables, columns, privacy, row shapes | 1 | PIPE-09, COST-01, COST-02, SEC-01 regression | `vitest src/schema/llm_privacy.test.ts src/helpers/llm_queue.test.ts src/helpers/renown_llm.test.ts src/helpers/llm_seam.test.ts` + `spacetime build -p spacetimedb` |
| 41-01 T3 test-seam extensions, wave gate | 1 | PIPE-04, PIPE-07 (enablers) | full suite + `spacetime build -p spacetimedb` |
| 41-02 T1 reservation and refusals | 2 | COST-02 | `vitest src/helpers/llm_budget.test.ts` |
| 41-02 T2 release, settle, prune | 2 | COST-02, PIPE-05 (refund) | `vitest src/helpers/llm_budget.test.ts` |
| 41-03 T1 toBigIntSafe, creation validators | 2 | PIPE-02 | `vitest src/helpers/safe_numbers.test.ts src/helpers/creation_validate.test.ts` |
| 41-03 T2 apply hardening, renown fallback, pinned flips | 2 | PIPE-02, PIPE-05 | `vitest src/helpers/llm_apply.test.ts src/helpers/submit_llm_result.characterization.test.ts src/helpers/renown_llm.test.ts src/reducers/renown.test.ts` |
| 41-04 T1 retry, defer, schedule helpers | 2 | PIPE-04, PIPE-06 | `vitest src/helpers/llm_retry.test.ts src/helpers/llm_schedule.test.ts` |
| 41-04 T2 route-input snapshots (golden) | 2 | PIPE-01, PIPE-02 | `vitest src/helpers/llm_inputs.test.ts` |
| 41-04 T3 needle-aware classifier | 2 | SEC-04 | `vitest src/helpers/claude_request.test.ts src/helpers/llm_seam.test.ts` |
| 41-05 T1 enqueue: reserve, cap, dispatch, refuse | 3 | PIPE-01, COST-02 | `vitest src/helpers/llm_queue.test.ts` |
| 41-05 T2 renown caller, seam suite | 3 | PIPE-01, PIPE-05 | `vitest src/helpers/renown_llm.test.ts src/helpers/llm_seam.test.ts src/reducers/renown.test.ts` + full suite |
| 41-06 T1 guard and claim paths | 3 | PIPE-06, PIPE-07, PIPE-09, SEC-04 | `vitest src/helpers/llm_admin_state.test.ts src/helpers/llm_executor.test.ts` |
| 41-06 T2 call, persist, retry, apply, redaction, fetch guard | 3 | PIPE-02, PIPE-04, PIPE-07, COST-01, SEC-04 | `vitest src/helpers/llm_executor.test.ts src/data/model_literals.test.ts` + full suite |
| 41-07 T1 sweeper body | 4 | PIPE-05, PIPE-02 | `vitest src/helpers/llm_sweeper.test.ts` |
| 41-07 T2 llm_run and llm_sweep registration | 4 | PIPE-09 | `vitest src/helpers/schema_recorder.test.ts` + `spacetime build -p spacetimedb` + full suite |
| 41-08 T1 set_api_key status, smoke test, level grant | 4 | OPS-01, SEC-04 | `vitest src/reducers/llm_admin.test.ts` |
| 41-08 T2 admin_llm_status view | 4 | OPS-01, SEC-04 | `vitest src/views/llm.test.ts` + `spacetime build -p spacetimedb` |
| 41-09 T1 key script | 5 | SEC-04 | `pnpm exec vitest run --maxWorkers=1 scripts/llm/cli.test.mjs` |
| 41-09 T2 runbook | 5 | SEC-04 | node heading check (plan verify command) |
| 41-10 T1 NPC chat cutover | 5 | PIPE-01, PIPE-02 | `vitest src/reducers/llm_cutover.test.ts` |
| 41-10 T2 allowlist, first local publish, bindings, build | 5 | PIPE-01 | `vitest src/data/model_literals.test.ts` + `spacetime build -p spacetimedb` + `pnpm build` |
| 41-11 T1 outro narration helper | 6 | PIPE-07, PIPE-01 | `vitest src/helpers/combat_narration.test.ts` |
| 41-11 T2 hook before cleanup, publish, build | 6 | PIPE-07 | `vitest src/reducers/llm_cutover.test.ts src/data/model_literals.test.ts` + full suite + builds |
| 41-12 T1 skill-offer rules | 7 | PIPE-01, PIPE-05 | `vitest src/helpers/skill_offer.test.ts` |
| 41-12 T2 level-up, request_skill_offer, [skills], renown end to end | 7 | PIPE-01, PIPE-05, PIPE-02 | `vitest src/reducers/llm_cutover.test.ts src/helpers/submit_llm_result.characterization.test.ts src/helpers/llm_apply.test.ts` |
| 41-12 T3 client cleanup, publish, bindings, build | 7 | PIPE-01 | full suite + `spacetime build -p spacetimedb` + `pnpm build` |
| 41-13 T1 creation generation helper | 8 | PIPE-01, PIPE-04 | `vitest src/helpers/creation_generation.test.ts` |
| 41-13 T2 creation wiring, prepare deletion, client, publish | 8 | PIPE-01, PIPE-04 | full suite + `spacetime build -p spacetimedb` + `pnpm build` |
| 41-14 T1 startWorldGeneration, failWorldGen (ERROR) | 9 | PIPE-01, PIPE-04, PIPE-05 | `vitest src/helpers/world_gen.test.ts src/helpers/llm_apply.test.ts src/helpers/submit_llm_result.characterization.test.ts` |
| 41-14 T2 triggers and first-region explore | 9 | PIPE-01, PIPE-04 | `vitest src/reducers/llm_cutover.test.ts src/reducers/intent.test.ts` |
| 41-14 T3 client cleanup, publish, bindings, build | 9 | PIPE-01 | full suite + `spacetime build -p spacetimedb` + `pnpm build` |
| 41-15 T1 purge and final static checks | 10 | PIPE-01 | `vitest src/reducers/llm_admin.test.ts src/reducers/llm_cutover.test.ts` + full suite + builds |
| 41-15 T2 proof rules, harness, dry run | 10 | OPS-01 | `pnpm exec vitest run --maxWorkers=1 scripts/llm/proof_rules.test.mjs` + dry run `PROVE_LIVE_DRY=1 pnpm exec vitest run --config scripts/llm/vitest.live.config.ts` |
| 41-16 T1 user sets the key (checkpoint) | 11 | SEC-04 | `spacetime sql --server local uwr "SELECT * FROM llm_admin_state"` (key-free) |
| 41-16 T2 local live proof | 11 | OPS-01, COST-01, PIPE-09, PIPE-02 | proof-file heading and key-prefix check (plan verify command) |
| 41-17 T1 maincloud checklist | 12 | PIPE-09, OPS-01 | checklist content check (plan verify command) |
| 41-17 T2 user runs or defers (checkpoint) | 12 | PIPE-09 | manual (user-only maincloud) |
| 41-17 T3 record results or deferral | 12 | PIPE-09 | verdict or `Status: deferred (human_needed)` check (plan verify command) |

Sampling continuity: every task has an automated command except 41-17 T2 (a user-only checkpoint between two automated tasks), so no three consecutive tasks lack automated verification.

### Spec-less probe coverage map

The edge probe produced 23 unresolved items. Each is lifted into a plan's `must_haves.truths` (covered), a `verification: backstop` truth, or a flagged assumption; none is dropped.

| # | Req | Category | Disposition | Where |
|---|-----|----------|-------------|-------|
| 1 | PIPE-01 | adjacency | covered: identical dedupe keys merge into one job and one dispatch; a different key separates | 41-05 truths |
| 2 | PIPE-01 | empty | covered: an empty or whitespace NPC message creates no job; empty source key still throws | 41-10 truths, 41-05 truths |
| 3 | PIPE-01 | ordering | covered: a second NPC message before the reply is deduplicated, so one conversation's replies apply in order | 41-10 truths |
| 4 | PIPE-02 | unclassified | flagged assumption plus backstop: a publish or crash mid-call leaves at most one in_flight job that the sweeper expires | 41-07 backstop truth; RESEARCH A-log |
| 5 | PIPE-04 | boundary | covered: attempt 3 is last; retry-after 60 s and 61 s both give the 60 s cap plus jitter | 41-04 truths, 41-06 truths |
| 6 | PIPE-04 | precision | covered: fractional retry-after rounds up to whole ms; delays are integers; ms to micros is ceil | 41-04 truths |
| 7 | PIPE-04 | idempotency | covered: a duplicate or early dispatch makes no call and no second dispatch | 41-06 truths |
| 8 | PIPE-04 | concurrency | backstop: two llm_run invocations cannot both claim a job (serializable claim transaction) | 41-06 backstop truth |
| 9 | PIPE-05 | empty | covered: a sweep over an empty queue writes only its next tick | 41-07 truths |
| 10 | PIPE-05 | encoding | covered: stored error text is redacted then capped by code points (never splitting a surrogate pair); smoke JSON capped at 4096 chars | 41-01 truths, 41-06 truths |
| 11 | PIPE-06 | boundary | covered: exactly 4 in flight defers the 5th; 3 in flight runs; narration defers at 3 and runs at 2 | 41-06 truths |
| 12 | PIPE-06 | precision | covered: deferral is an integer in [500, 750) ms, deterministic, converted to micros without floats | 41-04 truths |
| 13 | PIPE-07 | unclassified | flagged assumption: "late" is measured from job creation (combat resolution) to the claim and persist transactions, not to the client's render; exactly 20 s is on time | 41-06 truths (boundary), flagged here |
| 14 | PIPE-09 | concurrency | backstop: a publish during a call waits (Phase 39) and a crash is swept | 41-07 backstop truth |
| 15 | SEC-04 | concurrency | covered: rotating the key while calls are in flight changes only later claims and marks the key unverified | 41-08 truths |
| 16 | COST-01 | adjacency | covered: each attempt of one job writes its own call-log row (attempt number), and the job's counters add attempts together | 41-06 truths |
| 17 | COST-01 | empty | covered: missing usage records four zeros; the ledger is charged the reservation, the player nothing | 41-06 truths |
| 18 | COST-01 | ordering | covered: call-log rows are identified by job id and attempt, never by auto-increment id order | 41-06 truths (attempt per row); consumers in 41-16 and 41-17 order by attempt |
| 19 | COST-02 | boundary | covered: exactly $1.00 and the 200th call allowed, one over refused; exactly $2.00 ledger allowed, one over refused; UTC midnight rollover | 41-02 truths |
| 20 | COST-02 | precision | covered: whole micro-USD bigints, ceil once in the tested helpers, no stored floats | 41-02 truths |
| 21 | OPS-01 | adjacency | covered: a second smoke run while the first is active enqueues nothing | 41-08 truths |
| 22 | OPS-01 | empty | covered: with no admin state or ledger the admin view returns defaults (keySet false, keyValid false); no key makes smoke jobs fail 'auth' without a call | 41-08 truths, 41-06 truths |
| 23 | OPS-01 | ordering | covered: smoke results are keyed by route, so completion order does not matter | 41-06 truths (recordSmokeResult) |

No-silent-drop check: 23 items surfaced = 19 covered truths + 3 backstop truths (items 4, 8, 14) + 1 flagged-only assumption (item 13, listed under "Flagged assumptions" in 41-06). Item 4 is also listed as a flagged assumption in 41-07.

Wave 0 note: besides the files listed below, the plans add `helpers/safe_numbers.test.ts`, `helpers/llm_schedule.test.ts`, `helpers/llm_admin_state.test.ts`, `helpers/combat_narration.test.ts`, `helpers/skill_offer.test.ts`, `helpers/creation_generation.test.ts`, `scripts/llm/cli.test.mjs` and `scripts/llm/proof_rules.test.mjs`; each is created by the task that needs it (no separate Wave 0 plan).

Kept prohibitions (descriptor-less, in `must_haves.prohibitions`): key exposure (41-06, 41-08, 41-09, 41-16), platform-fault charging (41-02), refusal leaves no trace (41-05), no auto-retry of creation and world gen (41-06), no lost renown offer (41-03), no lockout on stuck jobs (41-07), no refused-line echo (41-10), narration never alters combat (41-11), no ability farming (41-12), no budget detail in public world-gen state (41-14), no spend past the cap or maincloud from scripts (41-15), no agent maincloud action (41-17). Canon referral: prompt injection is canon (breadcrumb to /gsd-secure-phase), handled by Phase 40's tagging plus this phase's clamps.

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
