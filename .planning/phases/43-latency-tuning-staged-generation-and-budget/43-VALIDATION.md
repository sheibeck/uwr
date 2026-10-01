---
phase: 43
slug: latency-tuning-staged-generation-and-budget
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-30
---

# Phase 43 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2: server tests in `spacetimedb/`; client and `scripts/**/*.test.mjs` through the root runner. Node environment, no DOM test setup |
| **Config file** | none for the server (defaults). Root `vite.config.ts`. `scripts/llm/vitest.live.config.ts` covers `*.live.ts` only and is excluded from default runs |
| **Quick run command** | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 <paths>` (server) or `CI=true pnpm exec vitest run --maxWorkers=1 <paths>` (root) |
| **Full suite command** | `CI=true pnpm exec vitest run --maxWorkers=1`. The root run also collects the server files. Baseline after Phase 42: 62 files / 2411 tests |
| **Other gates** | `spacetime build -p spacetimedb`; `pnpm build` (vue-tsc + vite + bundle guard); `pnpm spacetime:generate -y` after the local publish, then the privacy and absence scans |
| **Estimated runtime** | about 45 s for the full root suite, plus about 40 s per client build |

Always run a single worker (`--maxWorkers=1`). This host exhausts memory with parallel workers. Research quotes `npx vitest run` commands without the flag; add `--maxWorkers=1` to every one.

---

## Sampling Rate

- **After every task commit:** run the quick command for the files the task touched.
- **After every plan wave:** run the full suite (single worker) and `spacetime build -p spacetimedb`.
- **After the local publish (additive schema only):**
  - Run `pnpm spacetime:generate -y` and then `pnpm build`.
  - Check `SELECT key_set, key_length FROM admin_llm_status`; it must still return `true` and `108`.
- **Paid runs:** only after the user approves at the `checkpoint:human-verify` (43-PLANNING-NOTES item 4).
- **Before `/gsd-verify-work`, all of these must hold:**
  - Both full suites and both builds are green.
  - `data/llm_tuning.ts` traces to `data/llm_measurements.json`, or the routes are marked "insufficient data" if the user deferred the sweep.
  - The local publish is recorded, with no clear and the key still set.
  - `git status` shows none of the protected local files staged (`.claude/settings.local.json`, `public/assets/logo.png`, `public/assets/logo_old.png`).
- **Max feedback latency:** 30 seconds per task, about 90 seconds including a client build.

---

## Per-Task Verification Map

The planner fills in the task IDs. The requirement-level map below comes from 43-RESEARCH.md §Validation Architecture and is adjusted by 43-PLANNING-NOTES.md: the measurements file lives at `spacetimedb/src/data/llm_measurements.json`, and `/llm stats` is a reducer.

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| LAT-01 | `tunedMaxTokens` uses a floor of 256, rounds up to a multiple of 256, and takes p99 by nearest rank. The effort rule picks the lowest passing level, breaks ties toward low, and keeps current values when data is insufficient. `LLM_ROUTES` equals the values recomputed from `llm_measurements.json` | unit | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/data/llm_tuning.test.ts src/data/llm_routes.test.ts` | ❌ W0 / ✅ extend | ⬜ pending |
| LAT-01 | Sweep rules: tone lint, fixture order, spend guard, pooling rule. The harness never prints key material | unit | `CI=true pnpm exec vitest run --maxWorkers=1 scripts/llm/sweep_rules.test.mjs` | ❌ W0 | ⬜ pending |
| LAT-02 | The cache layout is unchanged (2 breakpoints: the Keeper Bible, then the route block). The harness passes when `cache_read_input_tokens > 0` on call 2, and marks a route "not cacheable" when its prefix is under 512 tokens | unit | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/helpers/claude_request.test.ts` + `sweep_rules.test.mjs` | ✅ / ❌ W0 | ⬜ pending |
| LAT-01/02 | Live sweep (Run A) and cache/reveal confirmation (Run B), user-approved, about $0.9 | paid manual | `pnpm exec vitest run --config scripts/llm/vitest.live.config.ts sweep` (only after approval) | ❌ W0 | ⬜ pending |
| LAT-03 | **Stage 1** apply writes the region, start location and first NPC, places the character, sets `FILLING` and enqueues stage 2. Stage 1 is visible before stage 2 finishes. <br>**Stage 2** apply fills the region and sets `COMPLETE`. If stage 2 fails, stage 1 stays playable with `FILL_ERROR`, and exploring retries stage 2. A stage-2 refusal goes straight to `FILL_ERROR`. <br>**Sweeper:** moves a stranded `FILLING` to `FILL_ERROR` | unit | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/helpers/llm_apply.test.ts src/helpers/world_gen.test.ts src/helpers/llm_sweeper.test.ts src/reducers/intent.test.ts` | ✅ extend | ⬜ pending |
| LAT-04 | **Stage 1** sets `CLASS_FILLING` with exactly one ability and enqueues stage 2. **Stage 2** merges the rest and reaches `CLASS_REVEALED`. If stage 2 fails, the step is `CLASS_FILL_ERROR`, and any input re-enqueues only stage 2. The go-back rules and the sweeper lock also apply | unit | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/helpers/creation_generation.test.ts src/helpers/llm_apply.test.ts src/helpers/llm_sweeper.test.ts` | ✅ extend | ⬜ pending |
| LAT-05 | Progress-line pools: voice, pronoun rule (Keeper he/his, player "you"), ellipsis, parity with route names. The rotation is deterministic. `selectLlmIndicator` with rotation 0 matches the Phase 42 output. The client tick is wired. No new component | unit | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/data/llm_indicator_lines.test.ts src/data/pronoun_rules.test.ts` + `CI=true pnpm exec vitest run --maxWorkers=1 src/composables/useLlmStatus.test.ts src/legacyLlmRemoval.test.ts` | ✅ extend | ⬜ pending |
| LAT-06 | Decision rule: build only if the recorded post-staging reveal p50 is over 10 s. The decision and its number are recorded either way. If it is built, both archetypes enqueue in one transaction | unit | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/data/llm_tuning.test.ts src/helpers/creation_generation.test.ts` | ✅ extend | ⬜ pending |
| COST-03 | **Ceiling:** boundary at ceiling −1, =, +1 micro-USD. UTC rollover. Reserve, release, settle and sweeper charges stay consistent. <br>**Refusals:** one in-voice line when both refuse. A claim-time refusal refunds exactly once, through `failAtClaim`. A missing state row fails closed. The kill switch lets in-flight jobs finish. <br>**Admin:** the admin reducers are admin-only. The phase-cap tests are flipped on purpose | unit | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/helpers/llm_budget.test.ts src/helpers/llm_queue.test.ts src/helpers/llm_executor.test.ts src/helpers/llm_admin_state.test.ts src/reducers/llm_admin.test.ts` | ✅ extend | ⬜ pending |
| OPS-02 | `summarizeRoute`: zeros for an empty route, nearest-rank, 24 h vs all-time window edges, error and truncated counts. The output is plain text with no `[` or `<`. The reducer is admin-gated through `requireAdmin`, and a non-admin gets an in-voice refusal | unit | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/helpers/llm_stats.test.ts src/reducers/llm_admin.test.ts` | ❌ W0 / ✅ | ⬜ pending |
| All | Privacy and absence guards hold (no public `llm_*` table, bindings clean after regeneration). The model-literal guard and the route table stay valid | unit | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/schema/llm_privacy.test.ts src/schema/llm_absence.test.ts src/data/model_literals.test.ts src/data/llm_routes.test.ts` | ✅ | ⬜ pending |
| All | The additive schema change publishes locally without a clear, and the key survives (`true`, `108`) | manual/scripted (local server, run by the executor) | `pnpm spacetime:publish`, then `SELECT key_set, key_length FROM admin_llm_status` | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `spacetimedb/src/data/llm_tuning.ts` and `llm_tuning.test.ts`: traceability to `data/llm_measurements.json` and the formula (LAT-01, LAT-06)
- [ ] `spacetimedb/src/helpers/llm_stats.ts` and `llm_stats.test.ts` (OPS-02)
- [ ] `scripts/llm/sweep_rules.mjs`, `sweep_fixtures.mjs` and `sweep_rules.test.mjs`: harness logic (LAT-01, LAT-02)
- [ ] `spacetimedb/src/helpers/test-utils.ts`: a default enabled `llm_admin_state` row and a default ceiling in the shared mock context, so existing enqueue tests still pass under fail-closed (PLANNING-NOTES item 9)
- [ ] Recorder and strict test updates for the new defaulted columns on `llm_admin_state` and `llm_spend`
- Framework install: none

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Paid effort sweep and caching proof | LAT-01, LAT-02, LAT-06 | Real Anthropic calls cost money, and the user must approve them at a checkpoint | Approve the run at the checkpoint (about $0.9, range $0.5–1.5). The executor runs Run A and Run B and commits `llm_measurements.json`. If you decline, routes keep their current values ("insufficient data") and the live evidence moves to Phase 44 |
| Staged region entry and class reveal feel fast in play | LAT-03, LAT-04, LAT-05 | Real-time feel and indicator rotation in a running client | With the local stack up, trigger a new region and create a character. Confirm you can act in the stage-1 region before it fills, see the class identity and first ability early, and see rotating Keeper lines |
| Kill switch and ceiling in a live session | COST-03 | Needs the running stack and an admin identity | Flip the kill switch, then try an LLM action. Expect one in-voice resting line and no call. Flip it back and the action works again |
| The maincloud publish of the additive schema | All | Maincloud deploys are manual and done by the user only | The user publishes after Phase 42's maincloud checklist. Claude never publishes to or calls maincloud |

---

## Validation Sign-Off

- [ ] Every task has an `<automated>` verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without an automated verify
- [ ] Wave 0 covers every MISSING reference
- [ ] No watch-mode flags
- [ ] Feedback latency < 90 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
