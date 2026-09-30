---
phase: 41-executor-and-domain-cutover
plan: 17
subsystem: llm-maincloud-proof
tags: [spacetimedb, llm, maincloud, checklist, deferred, human-needed]
status: deferred
verification_status: human_needed
requires:
  - phase: 41-16 (local live proof, deferred)
  - phase: 41-18 (npc.gender column affects the maincloud publish)
provides:
  - "41-MAINCLOUD-CHECKLIST.md: self-contained, user-run maincloud proof with paste-back queries and the gate table"
  - "41-MAINCLOUD-PROOF.md: the recorded deferral (human_needed)"
affects: [phase-41-verification]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/41-executor-and-domain-cutover/41-MAINCLOUD-CHECKLIST.md
    - .planning/phases/41-executor-and-domain-cutover/41-MAINCLOUD-PROOF.md
  modified: []
key-decisions:
  - "User chose 'Write checklist, defer run' (2026-09-30): the maincloud proof and the Phase 39 gate re-check are deferred, reported as human_needed, not passed"
metrics:
  tasks: "3 of 3 (Task 1 done, Task 2 answered 'defer', Task 3 deferral branch)"
  files: 2
completed: 2026-09-30
---

# Phase 41 Plan 17: Maincloud Proof Checklist Summary

The maincloud checklist is written for the user to run; the run itself is deferred by the user, so the maincloud proof and the Phase 39 gate re-check are recorded as human_needed (outstanding, not passed), and Claude touched nothing on maincloud.

## Status

**DEFERRED (human_needed). The maincloud proof has not been run, there is no gate verdict, and nothing is passed.** ROADMAP success criterion 6 (maincloud smoke test and one real action per domain, Phase 39 gate re-checked) and the browser half of criterion 2 must be reported as outstanding by phase verification.

## Task outcomes

| Task | Name | Outcome | Commit |
|---|---|---|---|
| 1 | Write the maincloud checklist | Done; 99 lines; verify command prints ok | 5f49b047 |
| 2 | User runs the checklist (checkpoint:human-action) | User answered "defer" (chose "Write checklist, defer run") | n/a |
| 3 | Record results and re-check the gate, or record the deferral | Deferral branch: `41-MAINCLOUD-PROOF.md` with "Status: deferred (human_needed)" and the date; gate re-check deferred (no live data) | docs commit |

### The checklist (Task 1)

`41-MAINCLOUD-CHECKLIST.md` states at the top that Claude never runs any of it and tells the user never to paste a key, token or `llm_config`. Steps: 0 run the local live proof first (deferred), 1 preconditions, 2 publish with `pnpm spacetime:publishprod`, 3 key with `node scripts/llm/set-key.mjs --target maincloud --confirm-maincloud`, 4 `llm_smoke_test` and `llm_admin_state`, 5 browser run with the network tab (including the close-the-tab-during-generation check and the he/she pronoun check), 6 responsiveness, 7 paste-back queries (`llm_admin_state`, `llm_call_log`, `llm_spend`), 8 the gate table (dispatch p95 under 250 ms against Phase 39's 3.0 ms, zero reliability failures, region schema, ledger, responsiveness, browser), 9 how to defer.

Publish notes folded in from Plan 41-18 and STATE.md: publishing the current schema adds `npc.gender` (default `''`) and will ask for `--break-clients` (clients disconnected, no data loss, no clear); the first publish after the 2.10 upgrade may also need it (14 views re-created); never `--clear-database` on maincloud.

## What remains (user action)

1. Run the local live proof (`41-LOCAL-PROOF.md`, "How to resume later").
2. Run `41-MAINCLOUD-CHECKLIST.md` and paste back the three query outputs and notes.
3. Then Claude re-checks the Phase 39 gate and writes the verdict into `41-MAINCLOUD-PROOF.md`. A failed gate reopens the executor decision.

## Deviations from Plan

None. Task 2's answer was "defer", which the plan accepts, and Task 3 ran its deferral branch. No maincloud command was run and no code was changed.

## Known Stubs

None.

## Threat Flags

None. T-41-14 held (checklist written only; no maincloud command run by Claude). T-41-01 held (the checklist never asks for a key, token or `llm_config`; proof files grep-checked). T-41-24 held (the deferral is explicit and recorded as human_needed).

## Self-Check: PASSED
- FOUND: 41-MAINCLOUD-CHECKLIST.md (99 lines), 41-MAINCLOUD-PROOF.md
- FOUND commit: 5f49b047
