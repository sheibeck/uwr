---
phase: 39-procedure-to-claude-spike
plan: 10
subsystem: spike-cleanup
tags: [cleanup, revert, maincloud]
requires: [39-09]
provides:
  - "Production module restored to its pre-registration state (index.ts, schema/tables.ts byte-identical to Phase-start SHA)"
  - "Throwaway spike module and harness (including the maincloud guard allowance) deleted; local uwr-spike database dropped"
affects: [phase-41]
key-files:
  deleted:
    - spacetimedb/src/spike/ (5 files)
    - scripts/spike/ (20 tracked files)
  modified:
    - spacetimedb/src/index.ts
    - spacetimedb/src/schema/tables.ts
decisions:
  - "Maincloud database uwr-spike-925iv intentionally kept by the user (2026-09-29); Task 1 resolved as keep, not delete"
metrics:
  completed: 2026-09-29
status: complete
---

# Phase 39 Plan 10: Spike Cleanup Summary

Spike module, harness and registration removed with a single cleanup commit (e5f414d9); the local `uwr-spike` database is dropped and the local server this phase started is stopped. The maincloud `uwr-spike-925iv` database was kept on purpose at the user's request.

## Task Outcomes

| Task | Outcome | Commit |
|------|---------|--------|
| 1. User deletes maincloud uwr-spike-925iv | Precondition held (confirmation outcome `confirm-strict`; Plan 09 docs commit 688ef666). User answered "Keep it for now". No delete was run against maincloud. | none |
| 2. Verify maincloud state, drop local database, record server ownership | Done (see below) | none (no repo changes) |
| 3. Delete module and harness, restore registration, verify, commit | Done, gates all green | e5f414d9 |

## Task 1: Maincloud database kept (user decision)

The user replied "Keep it for now". The database holds only the 25-character placeholder key written at the end of Plan 11 and may be reused for the Phase 41 maincloud proof. The plan's "describe must fail with not-found" gate was replaced by an information-only check that the database still exists.

Outputs recorded before the harness was deleted:

- `spacetime server ping maincloud`: `Server is online: https://maincloud.spacetimedb.com`
- `SPIKE_TARGET=maincloud node scripts/spike/cli.mjs describe` (guarded): `target: maincloud database: uwr-spike-925iv`, `describe exit status: 0`, and it lists the spike tables and reducers (spike_result, spike_state, spike_job, spike_run_job, spike_set_key and others). So the database still exists, as expected.
- `SPIKE_TARGET=maincloud node scripts/spike/cli.mjs state` (guarded, read-only): phase `idle`, probe_on false, in_flight 0, calls 111, est_cost_micro_usd 1147112, reserved 0. This matches the Plan 11 final state.
- Placeholder key: the guard has no key-length read (only `state`, which selects `spike_state`), so the placeholder was not re-read. This relies on 39-11-SUMMARY step 10: `key stored: yes (len 25) [canary value]`. The key value was never printed or read.

## Task 2: Local database dropped

- `node scripts/spike/cli.mjs delete` (local target): exit 0, "Skipping confirmation due to --yes".
- `node scripts/spike/cli.mjs probe-uwr`: `uwr spike tables: absent (unknown table (spike tables absent))`, exit 0. This confirms the local server answered and the local `uwr` database has no spike tables.
- `spacetime describe --json uwr-spike --server local --no-config -y`: `Error: No such database.` (HTTP 404 Not Found), exit 1.
- server-started.json: `startedBySpike: true`, `pid: 14384` (process `spacetimedb-standalone`, listen 127.0.0.1:3000, started by the phase orchestrator).

No publish, clear flag or maincloud write ran.

## Task 3: Cleanup and gates

- Phase-start SHA (39-02-SUMMARY): `14b14f40d34a1edc871c557a95e2372530fa775b`.
- Cross-check: first commit from `git log -S registerSpike -- spacetimedb/src/index.ts` is 561cb22e; its parent is `14b14f40d34a1edc871c557a95e2372530fa775b` (identical to the recorded SHA), and `git diff --quiet <parent> <sha>` on the two registration files exits 0.
- `git rm -r spacetimedb/src/spike scripts/spike`, plus `rm -rf` of the gitignored leftovers (out/, bindings/). `git checkout 14b14f40 -- spacetimedb/src/index.ts spacetimedb/src/schema/tables.ts`.
- Gates (all passed):
  - two registration files equal the SHA
  - whole `spacetimedb/src` equals the SHA excluding the spike directory and `helpers/measurement*` (so `data/combat_scaling.ts` is untouched)
  - the identifier-pattern `git grep --untracked` over `spacetimedb/src` prints nothing (so `uwr-spike-925iv` is not named anywhere under spacetimedb/src)
  - `scripts/spike` and `spacetimedb/src/spike` do not exist
  - `llm-proxy` diff is empty, `src/module_bindings` status is empty
  - key-shape grep `sk-ant-[A-Za-z0-9_-]{20,}` over tracked files prints nothing
  - `pnpm --dir spacetimedb run build`: "Build finished successfully" (exit 0)
  - `pnpm --dir spacetimedb test`: 18 files, 666 tests passed. `measurement.results.test.ts` ran in final mode: 109 passed, none skipped.
- Cleanup commit: `e5f414d9` "chore(39): remove spike module, harness and registration" (25 file deletions, all intentional, plus the two restored registration files).
- Server: PID 14384 (started by this phase) was stopped with `Stop-Process`. No `spacetimedb-standalone.exe` process remains and `netstat` shows nothing listening on port 3000.

## Deviations from Plan

1. **[Checkpoint resolution] Task 1 outcome was "keep", not "maincloud-deleted".** The user chose to keep `uwr-spike-925iv`. The Task 2 step 1 gate (describe must fail not-found) was replaced with an info-only ping plus a guarded describe that succeeds, plus the read-only `state`. No delete ran on maincloud. The maincloud identifier no longer appears under spacetimedb/src, so the identifier gate still holds. Threat T-39-45 (maincloud spike database left behind) is accepted for now: the database holds only a placeholder key (real key replaced in Plan 11), so it holds no secret; it costs nothing while idle.

No other deviations.

## Outstanding user action

Maincloud database `uwr-spike-925iv` is intentionally kept by the user (2026-09-29); it holds only a placeholder key. Delete it with `spacetime delete uwr-spike-925iv --server maincloud --no-config` when no longer needed (user action). The spike harness and guard are deleted, so any future reuse needs the Phase 41 executor module, not the spike module.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- scripts/spike and spacetimedb/src/spike absent; the kept helpers, 39-SPIKE-RECORD.md, 39-spike-results.json and 39-maincloud-results.json present.
- Commit e5f414d9 exists.
