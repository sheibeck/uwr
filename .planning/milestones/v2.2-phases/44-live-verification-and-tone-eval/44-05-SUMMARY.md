---
phase: 44-live-verification-and-tone-eval
plan: 05
subsystem: testing
tags: [llm, live-proof, harness, scratch-db, qual-02, vitest, pronouns]
requires:
  - phase: 44-01
    provides: evaluateGoldenItem and the golden pronoun and tone rules
  - phase: 44-03
    provides: resolveLiveDb allowlist, call_log_report results-file contract
  - phase: 43
    provides: staged creation and world generation, LLM_SMOKE_ROUTES (8)
provides:
  - "proof_rules.mjs: staged PROOF_STEPS, PROOF_DOMAINS, proofVerdict, resolveProveMode, resolveProofDb, assertRunTarget, CREATION_ORDER, plannedCallCounts"
  - "prove-live.live.ts: staged end-to-end live-proof harness on the scratch database, dry by default"
  - "proof_observed.mjs: pronoun and tone rule ids over observed real replies"
affects: [44-06, 44-09, 44-10]
tech-stack:
  added: []
  patterns:
    - "Verdict over recorded step results: a domain with no result is not_run and fails; skipped, missing, none, timeout and zero latency never pass"
    - "Dry by default: PROVE_LIVE_RUN unset prints the plan and worst-case bound and calls no reducer"
key-files:
  created:
    - scripts/llm/proof_observed.mjs
    - scripts/llm/proof_observed.test.mjs
  modified:
    - scripts/llm/proof_rules.mjs
    - scripts/llm/proof_rules.test.mjs
    - scripts/llm/prove-live.live.ts
    - scripts/llm/vitest.live.config.ts
key-decisions:
  - "A paid run (PROVE_LIVE_RUN=run) is refused for any database but uwr-verify; the free dry run may read uwr or uwr-verify"
  - "Smoke jobs are not in my_llm_jobs (the view drops them), so the results file gets their per-route ok from lastSmokeJson and the call log report covers their ids by run window"
  - "Observed-reply checks record rule ids, kind, source and row id only; npc_gender_mismatch is judged on the NPC description pronouns against the stored gender"
  - "llm_stats is outside every domain: it is read back from the event_private insert when possible, otherwise recorded accepted-only for the user checklist"
requirements-completed: []
duration: 55min
completed: 2026-10-05
status: complete
---

# Phase 44 Plan 05: Staged Live-Proof Harness Summary

**The Phase 41 live-proof harness now runs the Phase 43 staged flow on the allowlisted local scratch database, times stage 1 and stage 2 separately, records job ids, observed times and the run window, fails any skipped or unobserved domain, and spends nothing unless `PROVE_LIVE_RUN=run`.**

## Accomplishments

- **Proof rules (Task 1):** `PROOF_STEPS` is the staged order (smoke, creation_race, creation_class_reveal, creation_class, world_gen_start, world_gen, explore_region, npc_conversation, npc_burst, combat_narration, renown_perk_gen, skill_gen, llm_stats). `proofVerdict` reports each domain as passed, failed or not_run; a domain with no result, a skipped, missing, none, timeout, error or pending job, a not-ok step, or zero or missing latency fails the run. `expectedSmokeCount()` reads `LLM_SMOKE_ROUTES.length` (8); `resolveProveMode` and `resolveProofDb` fail closed; `CREATION_ORDER` carries CLASS_FILLING and CLASS_FILL_ERROR with a drift test against the server source; `plannedCallCounts()` totals 39 calls (8 smoke plus 31 domain, the burst being 20 of those).
- **Harness (Task 2):** rewritten in place. Database through `resolveProofDb(process.env.LLM_LIVE_DB)` (default `uwr-verify`) and `withDatabaseName(DB_NAME)`; local server only. Dry mode connects, asserts one admin status row, prints the step plan, the per-route planned calls and the worst-case bound, calls no reducer and disconnects. Paid mode keeps both spend guards (daily ceiling, $2.00 run cap with the stop at $1.80, all-time figures) before every step including each NPC burst turn.
- **Recording:** per-job `{ route, jobId, status, observedMs }` through a 250 ms poller of `my_llm_jobs`, `jobIds` by route and `window { startMs, endMs, startedAt, endedAt }` in the shape `call_log_report.mjs` reads, `timeToPlayableMs`, stage timings (class reveal and fill, world start and fill, explored region start and fill), burst samples with the indicative verdict, per-step results and the verdict. Everything goes through `scrub()` and the 120 character excerpt.
- **Pronoun and tone check (the Phase 41 deferred item):** `proof_observed.mjs` runs `evaluateGoldenItem` on a pseudo item for NPC replies, NPC descriptions and greetings, location and region text, and the combat outro, keeping only keeper_pronoun, npc_gender_mismatch, player_pronoun, lone_player_named and meta_commentary. The lone-beast outro rules apply only when the spawn template is a beast.

## Task Commits

1. Task 1 RED: 29f1d81d test(44-05): failing tests for staged proof steps, domain verdict and scratch-db resolution
2. Task 1 GREEN: ed93cd25 feat(44-05): staged proof steps, domain verdict, scratch-db and mode resolvers, planned call counts
3. Task 2: a8461597 feat(44-05): staged prove-live harness on the scratch database with timings, job ids, window and pronoun checks

## Verification

- `CI=true pnpm exec vitest run --maxWorkers=1 scripts/llm/proof_rules.test.mjs scripts/llm/cli.test.mjs scripts/llm/call_log_report.test.mjs scripts/llm/proof_observed.test.mjs`: 4 files, 153 tests passed.
- `pnpm exec vitest list --config scripts/llm/vitest.live.config.ts --filesOnly` lists golden, prove-live and sweep: the harness loads.
- A representative dry run (no server up) loads and transforms the file and stops at the `/v1/ping` check, as designed; no reducer ran. `PROVE_LIVE_RUN=1`, `PROVE_LIVE_RUN=run` with `LLM_LIVE_DB=uwr`, and `LLM_LIVE_DB=prod` each throw at import.
- The worst-case bound for the whole planned run is 782,758 micro-USD ($0.78), under the $1.80 stop line; the dry run asserts this.
- No paid or live call was made, nothing was published, the local `uwr` database was not touched, no push.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Paid run could target the user's uwr database**
- **Found during:** Task 2
- **Issue:** the allowlist (uwr, uwr-verify) lets `LLM_LIVE_DB=uwr PROVE_LIVE_RUN=run` write characters, jobs and spend into the user's database, against the standing prohibition and T-44-05-01.
- **Fix:** `assertRunTarget(mode, db)` in `proof_rules.mjs` throws unless a paid run targets `uwr-verify`; the harness calls it at import. Tested, and guarded in the static source test.
- **Commits:** ed93cd25 (pure rule), a8461597 (harness)

**2. [Rule 2 - Missing critical functionality] Stale smoke summary could pass a refused smoke test**
- **Issue:** a refused or already-running `llm_smoke_test` leaves the earlier `lastSmokeJson` in place.
- **Fix:** the smoke step waits for `lastSmokeAt` to change before reading the summary.

**3. [Rule 1 - Bug in the old runner] NPC reply detection matched the player's own echo**
- **Issue:** the previous check accepted any new `npc_dialog` row, including the `You: "..."` echo appended when the job is created.
- **Fix:** replies are rows that do not start with `You:`, for the single turn and each burst turn.

**4. [Rule 3 - Scope addition] New files outside the plan's files_modified**
- `proof_observed.mjs` and its test (so the pronoun check is unit-tested rather than living only in a live file) and a comment-only edit to `vitest.live.config.ts` (the retired dry flag was named there).

**5. Test-first note:** Task 1 followed RED then GREEN. `proof_observed.test.mjs` went green on first run; its positive cases assert each rule id fires, so a no-op implementation would fail them.

## Known Stubs

None.

## Threat Flags

None. The only new surface is a local WebSocket subscription to `event_private` for the `/llm stats` read-back, within the harness's existing local-only boundary.

## Notes for later plans

- 44-06 and 44-09: the database must be published as `uwr-verify` first (the dry run needs a published scratch database, which a later plan creates). Dry run: `pnpm exec vitest run --config scripts/llm/vitest.live.config.ts prove-live`. Paid run, only after approval: `PROVE_LIVE_RUN=run` with the same command.
- The results file is `.planning/phases/44-live-verification-and-tone-eval/44-live-results.json`, with `jobIds` and `window` ready for `node scripts/llm/call_log_report.mjs --db uwr-verify --results <file>`. Smoke job ids are not visible through `my_llm_jobs`; the call log report covers them by window.
- If `/llm stats` cannot be read back, the step records accepted-only and the visual check stays on the user checklist.
- QUAL-02 is not marked complete: it needs the paid run in 44-09 and the close-out in 44-10.

## Self-Check: PASSED

- Files found: scripts/llm/proof_rules.mjs, scripts/llm/proof_rules.test.mjs, scripts/llm/prove-live.live.ts, scripts/llm/proof_observed.mjs, scripts/llm/proof_observed.test.mjs, scripts/llm/vitest.live.config.ts
- Commits found: 29f1d81d, ed93cd25, a8461597
