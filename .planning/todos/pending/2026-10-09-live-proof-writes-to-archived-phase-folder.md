---
created: 2026-10-09T14:00:00.000Z
title: Live proof and call-log tests point at the archived Phase 44 folder
area: tooling
files:
  - scripts/llm/prove-live.live.ts (record() writes .planning/phases/44-live-verification-and-tone-eval/44-live-results.json)
  - scripts/llm/proof_rules.test.mjs (baseline ENOENT at collection)
  - scripts/llm/call_log_report.test.mjs (baseline ENOENT at collection)
---

## Problem

Phase 44's folder was archived to `.planning/milestones/v2.2-phases/`. The paid live proof (`prove-live.live.ts`) still writes its results to the old path, so a paid run would throw ENOENT on its first `record()` after spending money. The same stale path is why `proof_rules.test.mjs` and `call_log_report.test.mjs` are baseline failures; the collection error also hid 5 real failures that Plan 51.3.1.2-09 then fixed. Found by 51.3.1.2-09.

## Solution

Pick where live results live now (a current phase folder for new runs; the archived path for the pinned Phase 44 record), point the harness and both tests at it, and confirm both test files collect and pass. Must be fixed before the milestone-end paid run (51.3.1.2 D-12, 51.3.1.1 UAT). Free; no paid call needed to verify (dry run only).
