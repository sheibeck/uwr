---
phase: 41-executor-and-domain-cutover
plan: 16
subsystem: llm-local-live-proof
tags: [spacetimedb, llm, live-proof, anthropic-key, deferred, human-needed]
status: deferred
verification_status: human_needed
requires:
  - phase: 41-15 (live-proof harness and dry run)
  - phase: 41-18 (NPC gender and pronoun rule)
provides:
  - "Anthropic key stored in the local module (set by the user; llm_admin_state keySet true, keyLength 108)"
  - "41-LOCAL-PROOF.md recording the deferral and the exact commands to resume"
affects: [41-17, phase-41-verification]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/41-executor-and-domain-cutover/41-LOCAL-PROOF.md
  modified: []
key-decisions:
  - "User decision 2026-09-30 (verbatim): 'we can skip the live proof for now'. The live proof is deferred, not passed; phase verification must report it as human_needed"
metrics:
  tasks: "1 of 2 (Task 1 done; Task 2 deferred by user)"
  files: 1
completed: 2026-09-30
---

# Phase 41 Plan 16: Local Live Proof Summary

The user set the Anthropic key in the local module (Task 1 done), then deferred the live proof: no smoke test, no harness run and no Claude call were made, so the local live proof is outstanding (human_needed), not passed.

## Status

**DEFERRED (human_needed). The live proof has not been run and is not passed.** The success criterion "locally, with the key set by the user, the smoke test passes for all six routes and every domain completes one real action" is NOT met and must be reported as outstanding by phase verification.

## Task outcomes

| Task | Name | Outcome |
|---|---|---|
| 1 | User sets the Anthropic key locally | Done (user action, evidence below) |
| 2 | Smoke test and one real action per domain under the $2 cap | Deferred by user decision; `41-LOCAL-PROOF.md` written with "Status: deferred by user (human_needed)" per the plan's own skip branch |

### Task 1 evidence

- The user ran `node scripts/llm/set-key.mjs` in their own terminal. Output: `set_api_key: HTTP 200 (positional arguments)` and `key stored: yes (len 108)`.
- The orchestrator verified with `spacetime sql --server local uwr "SELECT * FROM llm_admin_state"`: key_set true, key_length 108, key_last_check_ok false, last_smoke_at none.
- A continuation agent was started and stopped by the orchestrator before any call: `llm_job` empty, `llm_call_log` count 0, `llm_spend` empty, no git changes.
- The key, `spacetimedb/.env.local`, the CLI token and `llm_config` were never read by Claude.

### Task 2 (deferred)

The user said, verbatim: "we can skip the live proof for now". Nothing in Task 2 ran: no paid harness, no `llm_smoke_test`, no bundle check, no pronoun check on real replies. Spend so far is zero.

## What remains to run later

From the repo root with the local server up and the module published:

1. Smoke test: `spacetime call uwr llm_smoke_test --server local`; after about a minute read `lastSmokeJson` from `SELECT * FROM llm_admin_state`. Expect six `ok` and `keyValid` true.
2. Paid harness (PROVE_LIVE_DRY unset): `pnpm exec vitest run --config scripts/llm/vitest.live.config.ts`. At most two paid runs in total.
3. Read `llm_call_log`, `llm_admin_state` and `llm_spend`; confirm four usage columns on every call row and ledger under 2,000,000 micro-USD.
4. `pnpm build` and confirm no `api.anthropic.com` in `dist/`.
5. Check the Plan 41-18 pronoun rule on real output (every NPC male or female, he or she in text, the Keeper is he).
6. Record the redacted results in `41-LOCAL-PROOF.md` and `41-live-results.json`.

This should be done before the maincloud proof (Plan 41-17 checklist).

## Important notes

- **The key remains stored in the local module.** Local play will make real Claude calls, within the module caps: $1.00 and 200 calls per player per UTC day, 3 active jobs per player and the $2.00 phase ledger.
- Do not use `--clear-database` locally without need: it would wipe the stored key and reset the ledger (runbook "Recovery after --clear-database").
- The harness paid path has never been run against a live key (Plan 41-15 note); expect small fixes on the first real run.

## Follow-up (cosmetic, not acted on)

Running `set-key.mjs` printed Node warning `[MODULE_TYPELESS_PACKAGE_JSON]` for `spacetimedb/src/helpers/measurement.ts`, suggesting `"type": "module"` in `spacetimedb/package.json`. Logged here as a follow-up; a change to the module package type is out of scope for this plan.

## Deviations from Plan

None in execution. The plan's own Task 1 resume-signal allows "skip", and Task 2's action defines the deferred branch, which was followed exactly. No code was changed.

## Known Stubs

None.

## Threat Flags

None. T-41-01 held (key set by the user; Claude read only `llm_admin_state`). T-41-04b held (no spend). T-41-14 held (local only, no maincloud command).

## Self-Check: PASSED
- FOUND: .planning/phases/41-executor-and-domain-cutover/41-LOCAL-PROOF.md
- No code commits in this plan (no task changed source files)
