# Phase 41 Maincloud Proof

Status: deferred (human_needed)

Date: 2026-09-30

## Summary

The maincloud proof has NOT been run. The user chose "Write checklist, defer run" at the Plan 41-17 checkpoint on 2026-09-30. There is no maincloud data, so there is no gate verdict: the maincloud half of ROADMAP success criterion 6 and the browser half of success criterion 2 (no request from the browser to Anthropic or a proxy) are outstanding, not passed.

## Phase 39 gate re-check

Deferred too. The re-check needs real maincloud data (dispatch p95 from `llm_call_log.dispatchLateMs`, failure count, `world_gen` ok in the smoke results, the user's responsiveness note). None exists. It stays pending until the user runs the checklist and pastes the results. The Phase 39 verdict (go, confirmed 2026-09-29) stands until a measured failure reopens it.

Reference figures from Phase 39 (maincloud, `uwr-spike-925iv`): dispatch p95 3.0 ms, 0 of 164 reliability failures, region schema compiles, ping p95 34.3 ms, tick p95 2.72 ms.

## Ordering note

The local live proof (Plan 41-16) is also deferred. Run it first (see `41-LOCAL-PROOF.md`, "How to resume later"), then the maincloud checklist.

## Pointer

Run `41-MAINCLOUD-CHECKLIST.md` yourself when ready. A publish of the current schema adds `npc.gender` and may need `--break-clients` (no data loss, no clear); the first publish after the 2.10 upgrade may need it too. Claude never touches maincloud.
