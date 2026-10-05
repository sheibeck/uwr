---
phase: 42-client-cutover-and-legacy-removal
verified: 2026-09-30T20:10:00Z
status: passed
score: 4/4 roadmap criteria verified (code and local-server evidence); 5 browser/visual/live items deferred to human
behavior_unverified: 0
overrides_applied: 0
gaps: []
human_verification:
  - test: "Open the game in a browser that previously held a stored llm_proxy_secret in localStorage (set it by hand in devtools first), reload"
    expected: "The key is gone from localStorage after load, nothing is shown to the player, and no request goes to any proxy URL"
    why_human: "Unit test covers present/absent/throwing storage and main.ts calls the cleanup first in bootstrap, but no real-browser run was done"
  - test: "Trigger each LLM-driven action (creation race, class, world gen, skill, renown perk, NPC chat) and watch the narrative console"
    expected: "The route's Keeper line shows with the pulse while the job is pending/in_flight/received, clears when it ends; creation and world gen lock input, other routes do not; a forced failure/expiry shows the server-written in-voice Keeper line and no error chip"
    why_human: "Visual and real-time behaviour; the Vue wiring and mapping are verified statically and by unit tests, not in a rendered page"
  - test: "Narrow viewport (about 320px) with the longest indicator line, and a screen reader (NVDA/VoiceOver) on the always-mounted role=status region"
    expected: "Line wraps without overflow; first line is announced politely; prefers-reduced-motion turns the pulse off"
    why_human: "Visual and assistive-tech behaviour"
  - test: "Live LLM smoke test (llm_smoke_test as admin) on the local stack after starting the server"
    expected: "A job completes end to end with the stored Anthropic key (keyValid true)"
    why_human: "Needs a real Anthropic call; the user deferred live proofs. Only key_set true / key_length 108 is proven here"
  - test: "User checklist 42-USER-CHECKLIST.md: delete the Cloudflare Worker, revoke the OpenAI key, remove VITE_LLM_PROXY_* from the root .env.local and hosting settings, delete the leftover ignored llm-proxy/ folder (it still holds .dev.vars, .wrangler, dist, node_modules on disk), rebuild and redeploy; run the maincloud two-publish yourself"
    expected: "No deployed proxy, no live proxy credential, maincloud matches local"
    why_human: "User-only actions outside the repo; Claude was barred from Cloudflare, OpenAI, maincloud and secret files"
---

# Phase 42: Client Cutover and Legacy Removal Verification Report

**Phase Goal:** The browser holds no LLM credential and no LLM plumbing, the client reads only its own job status, and the old pipeline, its tables and its client-trusted result reducer are gone
**Verified:** 2026-09-30
**Status:** human_needed (no gaps; browser/visual/live items remain)
**Re-verification:** No, initial verification

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | No client can submit or forge LLM results: `submit_llm_result` gone from regenerated bindings, no reducer accepts client-supplied LLM output | VERIFIED | `ls src/module_bindings` shows no submit_llm_result, validate_llm_request, purge_*, sweep reducer or llm_task/request/budget/tick table file (only `admin_llm_status_table.ts`, `my_llm_jobs_table.ts`, `llm_smoke_test_reducer.ts`). Live `spacetime describe --server local uwr --json`: 0 occurrences of submit_llm_result, validate_llm_request, purge_legacy_llm, purge_llm_tasks, sweep_llm_errors. Repo grep of production (non-test) server and client source finds no reference to any of them. `llm_absence.test.ts` (recorder-level absence) and `legacyLlmRemoval.test.ts` passed. |
| 2 | No LLM credential in the browser: `llm-proxy/`, `useLlmProxy`, proxy env vars removed; stored `llm_proxy_secret` cleared on first load; built `dist/` has no proxy secret, URL or key name | VERIFIED (under planning note 2) | `git ls-files llm-proxy client` = 0 tracked files; `src/composables` holds only `useLlmStatus*` (no `useLlmProxy`, no `useLlm`); `git grep` for `VITE_LLM_PROXY|llm_proxy_secret|8787` outside `.planning`/tests hits only the guard script and `src/legacyCredentials.ts`. `legacyCredentials.ts` does a try/catch `removeItem('llm_proxy_secret')`; `main.ts` calls `clearLegacyLlmCredential()` as first statement of `bootstrap`. `node scripts/check-bundle.mjs` and `--explain`: "bundle clean: 4 files scanned", exit 0 (no bundle text printed). `pnpm build` is now `vue-tsc -b && vite build && node scripts/check-bundle.mjs` (WR-04 fix). The one remaining key-name occurrence in dist is the allowed single `removeItem(...)` span, per the orchestrator's reading. Caveat: ignored leftovers under `llm-proxy/` (including `.dev.vars`) still exist on disk by design; they are not in the repo or bundle and are on the user checklist. |
| 3 | Narrative console shows in-progress and failure states for every LLM action, driven only by the player's own job-status view via new `useLlmStatus`, no `llm_task`/`llm_request` subscription | VERIFIED (code + tests); visual confirmation deferred | `useCoreData.ts` subscribes `toSql(tables.my_llm_jobs)` and rebinds it (delete+insert since the view has no PK). `App.vue` calls `useLlmStatus({ llmJobs })`, derives per-console scoped lines through `resolveDisplayedLine`, and `isLlmInputLocked` covers only creation and world gen. `NarrativeConsole.vue` has an always-mounted `role="status"` region, `llmIndicatorLine` prop and reduced-motion rule. No non-test, non-binding `src/` file names llm_task/llm_request. View `my_llm_jobs` drops admin smoke jobs (WR-01). Failure state is the server-written Keeper line, written in the same tx as terminal status (`withFailureTx` in executor; `notifyFailure` in sweeper); the indicator clears for completed/failed/expired. Tests run by me and passing: executor, sweeper, apply.characterization (server), `useLlmStatus.test.ts` (client). This reading (no error chip, per CONTEXT) is the one recorded in 42-07-SUMMARY. |
| 4 | Old `llm_task`/`llm_request` tables and dead v2.0 pipeline removed by two-publish with no `--clear-database`; game runs; local Anthropic key still set | VERIFIED | Live describe has none of llm_task, llm_request, llm_budget, llm_cleanup_tick; llm_job, my_llm_jobs, admin_llm_status present. `SELECT key_set, key_length FROM admin_llm_status` -> true / 108 (a clear would have wiped `llm_config`, so this corroborates no clear). Commit order in git: 42-03/05 publish-1 code and bindings (5968d54f) precede 42-06 table removal (ec415e6d) and 42-07 bindings (e292ce92). Dead code deleted: `helpers/llm.ts`, `useLlm.ts`, `useLlmProxy.ts`, `data/llm_prompts.ts`, stale `client/` bindings. Publish commands and outputs are only in 42-05/42-07 SUMMARY (not re-provable from the repo); the key-survival and describe state are consistent with them. |

**Score:** 4/4 verified. 0 behavior-unverified truths flagged as gaps: the behavior-dependent invariants (terminal job clears indicator; failure writes line in same tx as status; refunds) each have a passing named test (re-ran the files below).

### Plan must-have spot checks

| Check | Result |
|-------|--------|
| Server tests: `llm_absence`, `llm_privacy`, `llm_executor`, `llm_sweeper`, `llm_apply.characterization` (single worker) | 5 files / 287 tests passed |
| Client tests: `legacyLlmRemoval`, `legacyCredentials`, `useLlmStatus`, `scripts/check-bundle.test.mjs` | 4 files / 132 tests passed |
| Full root suite (orchestrator) | 62 files / 2411 tests passed |
| Public llm_* tables exactly [] and 8 private llm_* tables remain | pinned by `llm_privacy.test.ts` (passed) |
| `purge_legacy_llm` exists only between publishes | absent from live describe and bindings |
| `.claude/settings.local.json`, logos not staged | `git status` shows ` M`, ` M`, `??` only |
| `my_llm_jobs` retention todo | `.planning/todos/pending/2026-09-30-llm-job-retention-and-pruning.md` present |
| `docs/runbooks/llm-key.md` referenced by README/skill | present; README and run-local skill no longer mention proxy/wrangler/8787 |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| SEC-02 | 42-01, 42-03, 42-05, 42-07 | No client can submit or forge LLM results | SATISFIED | Criterion 1 evidence |
| SEC-03 | 42-02, 42-04, 42-05, 42-07 | No LLM credential in the browser | SATISFIED (user cleanup of Cloudflare/OpenAI/env pending) | Criterion 2 evidence |
| SEC-05 | 42-03, 42-05, 42-06, 42-07 | Legacy tables and dead pipeline removed by two-publish, no clear | SATISFIED locally; maincloud two-publish is a user step | Criterion 4 evidence |

All three IDs in REQUIREMENTS.md mapped to Phase 42 are claimed by plans; no orphaned requirements. REQUIREMENTS.md still shows them unchecked/Pending; not changed here (mark-complete not run, as instructed).

### Anti-Patterns

No TBD/FIXME/XXX in phase-modified source. Code review: 4 warnings (smoke jobs in view, per-console scoping, live-region mount, guard not in build) fixed in commits caeae065, 70fc2877, e2279386, 935eaa77; iteration-2 re-review: 0 critical, 0 warning, 9 info (non-blocking). Info items worth carrying: IN-04 (`my_llm_jobs` unbounded, tracked by the retention todo), IN-06 (indicator not bound to selected character in the game console, deferred by design), IN-09 (README mentions a deploy workflow that does not exist), IN-03 (source maps would trip the guard).

### Deferred / Not Blockers

- Live LLM smoke proof (user deferred; `key_set` true, `key_length` 108 only).
- Maincloud, Cloudflare Worker deletion, OpenAI key revocation, burned proxy secret, deleting the ignored local `llm-proxy/` folder: all user-only per 42-USER-CHECKLIST.md.

### Gaps Summary

No gaps. Every roadmap criterion holds in the codebase and on the local server under the orchestrator's recorded interpretations (one allowed `removeItem('llm_proxy_secret')`; "key still set" = key_set true and length 108; failure state = server-written Keeper line, no client error chip). Status is `human_needed` solely because browser-visual, accessibility, returning-browser and live-LLM checks were not and could not be run.

---

_Verified: 2026-09-30_
_Verifier: Claude (gsd-verifier)_

## Human Verification Outcome (2026-09-30)

The user resolved all 5 items (see 42-UAT.md): 4 passed and 1 skipped (layout and assistive checks, left to the UX overhaul). The live smoke test passed: 6/6 routes, `key_valid` true. The maincloud two-publish is deferred by the user to the end of the milestone. Status is set to passed.
