---
phase: 44-live-verification-and-tone-eval
plan: 09
subsystem: testing
tags: [llm, live-proof, scratch-db, qual-02, deferred, human-needed]
requires:
  - phase: 44-03
    provides: resolveLiveDb allowlist, set-key script and scratch database runbook
  - phase: 44-05
    provides: staged live-proof harness (prove-live.live.ts) and proof_rules
  - phase: 44-06
    provides: scratch database state after the live drills
  - phase: 44-07
    provides: golden run record (separate window)
provides:
  - "44-live-results.json: status deferred, all 13 steps and all 7 domains not_run, requirement status human_needed"
  - "proof_rules.test.mjs 'pinned live results': invariants that hold for a deferred, declined or recorded record"
affects: [44-10]
tech-stack:
  added: []
  patterns:
    - "A deferred record carries every step as not_run and an explicit verdict, never a pass"
key-files:
  created:
    - .planning/phases/44-live-verification-and-tone-eval/44-live-results.json
  modified:
    - scripts/llm/proof_rules.test.mjs
key-decisions:
  - "Owner deferred the paid end-to-end run at the cost checkpoint; no paid call was made and the harness was never run in run mode"
  - "Domains in a deferred record are stored as not_run (not failed), and the pinned test also checks that proofVerdict recomputed from the stored steps fails"
requirements-completed: []
duration: not meaningful (preparation and checkpoint, then a short close-out)
completed: 2026-10-05
status: complete
---

# Phase 44 Plan 09: Live End-to-End Run on the Scratch Database Summary

**The owner deferred the paid end-to-end run at the cost checkpoint, so the plan recorded a deferred result with every step not run. QUAL-02's live half (per-domain real-call verification, per-route p50/p95/p99, token totals for the Console reconciliation) is deferred by the owner and is human_needed, not passed. QUAL-02 is NOT marked complete.**

## What happened

- **Task 1 (free preparation, no repo change):** local server online; `uwr-verify` published from the unmodified source with the key stored (length 108). Dry harness: one admin row, key set, kill switch on, ceiling $10.00, all-time spend 18,248 micro-USD left over from the 44-06 drills. Full suite 76 files and 3869 tests green; `spacetime build` OK; `pnpm build` and the bundle guard clean; no Anthropic host in `dist/`. Worst-case cost bound $0.7828 over 39 planned calls, below the $1.80 stop of the $2.00 cap.
- **Task 2 (checkpoint):** the owner answered "defer" through the orchestrator's question tool.
- **Task 3 (deferral path):** wrote `44-live-results.json` with status deferred, every one of the 13 PROOF_STEPS present and marked `not_run` (ok false, job status not_run, zero latency), all 7 domains `not_run`, overall verdict fail, no window, no jobs, report status `not_run`, and `requirementStatus: human_needed`. Added the "pinned live results" describe block to `scripts/llm/proof_rules.test.mjs` (8 tests). No paid or live call was made and no paid harness mode was run.

## Task Commits

1. Task 1: no commit (free checks and a local publish only)
2. Task 2: checkpoint, owner answered "defer" (no commit)
3. Task 3: c1fc1c93 docs(44-09): record the deferred end-to-end run and pin it with tests

## What is not verified (human_needed)

- No domain (smoke, creation, world generation, NPC chat, combat narration, renown, skills) has a live end-to-end result from this plan. All are `not_run`.
- No per-route p50/p95/p99 latency table, no NPC chat sample count, no token totals, no run window and no streaming verdict inputs exist; the Console reconciliation for this run cannot happen.
- Pronoun and tone rules were not applied to real replies from this run (the golden run in 44-07 is a separate record).
- The machine-measurable parts of Phase 43 UAT items 1 and 2 (stage-1 and stage-2 timings, time to a playable region, act-during-fill, tab-close) were not measured and stay open.
- The browser network-tab check stays a user item.
- A later paid run needs its own approval at a cost checkpoint showing the bound; the harness is ready (`PROVE_LIVE_RUN=run LLM_LIVE_DB=uwr-verify`, file filter `prove-live`).

## Deviations from Plan

None. The plan's deferral branch was followed as written.

## Auth gates

None.

## Known Stubs

None in code. The results file intentionally holds `null` for window, stages, time to playable and observed checks because nothing ran; these are documented as not run, not as passes.

## Environment left as is

The local server and `uwr-verify` (unmodified module, real key stored, ceiling $10.00, kill switch on) were left running for plan 44-10 to decide cleanup. The user's `uwr` database and the hosted target were never touched. 44-08 files and golden files were not touched.

## Verification

`CI=true pnpm exec vitest run --maxWorkers=1 scripts/llm/proof_rules.test.mjs scripts/llm/call_log_report.test.mjs`: 2 files, 117 tests, green.

## Self-Check: PASSED

- FOUND: .planning/phases/44-live-verification-and-tone-eval/44-live-results.json
- FOUND: scripts/llm/proof_rules.test.mjs (pinned live results block)
- FOUND: commit c1fc1c93
