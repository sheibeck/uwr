---
phase: 38-platform-upgrade
plan: 04
subsystem: platform
tags: [vitest-5, spacetimedb, scheduled-tables, concurrency-audit]
requires: [38-03]
provides:
  - Vitest 5.0.2 in spacetimedb/
  - Source-verified order-independence audit of all 16 scheduled tables (SC-2)
affects: [38-06]
tech-stack:
  added: []
  patterns: []
key-files:
  modified:
    - spacetimedb/package.json
    - spacetimedb/pnpm-lock.yaml
key-decisions:
  - "No order-sensitive scheduled reducer found; no source changes made"
requirements-completed: [SC-2, SC-3]
metrics:
  tasks: 2
  commits: 1
completed: 2026-09-29
status: complete
---

# Phase 38 Plan 04: Vitest 5 in spacetimedb/ and Scheduled-Table Audit Summary

The module suite now runs on Vitest 5.0.2 with all 478 tests green, and a per-reducer source audit found none of the 16 scheduled tables order-sensitive under SpacetimeDB 2.10.1's concurrent dispatch of overdue jobs.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Bump spacetimedb/ to Vitest 5, re-run both suites and the module build | b846f253 |
| 2 | Scheduled-table concurrency audit (read-only) | none (audit recorded here) |

## Task 1 Results

- Resolved vitest version: **5.0.2** (was 3.2.7). `spacetimedb/package.json` range is `^5.0.2`. Only `vitest` changed in package.json.
- `pnpm install` in `spacetimedb/`: exit 0, `+13 -31` packages. `spacetimedb/pnpm-workspace.yaml` is unchanged (comment plus `allowBuilds: esbuild: true`). `pnpm install --frozen-lockfile` exits 0.
- `pnpm --dir spacetimedb test`: 16 files, 478/478 tests, Vitest v5.0.2.
- Root `pnpm test` (still Vitest 4.1.11, collects the module tests too): 19 files, 513/513 tests.
- `spacetime build -p spacetimedb`: "Build finished successfully." It still prints the "tsc not found" message, which is the expected healthy state (no TypeScript compiler visible). `ls spacetimedb/node_modules/.bin | grep -c '^tsc'` = 0.
- Commit b846f253 touches only `spacetimedb/package.json` and `spacetimedb/pnpm-lock.yaml`.
- Test-only fixes Vitest 5 required: **none**. The `clearMocks`, top-level `vi.mock` and unawaited-assertion default changes caused no failures.

## Task 2: Scheduled-Table Concurrency Audit

Structural checks (2026-09-29), matching the plan's expected values with no delta:

- `grep -c "scheduled: () =>" spacetimedb/src/schema/tables.ts` = **16**
- `grep -rn "ScheduleAt.interval" spacetimedb/src | wc -l` = **0** (every schedule is a one-shot `ScheduleAt.time` row re-inserted by a reducer, so the 2.8.3 interval re-anchoring does not apply)
- `grep -rnE "\.procedure\(|ctx\.http" spacetimedb/src --include=*.ts | wc -l` = **0** (no procedures, no head-of-line blocking)

Question applied to each reducer: if two overdue rows of this table, or rows of different tables, ran in either order or concurrently (each reducer is still a serialized transaction with monotonic `ctx.timestamp`), could the final state differ from strict `scheduled_at` order? Only the ordering guarantee among already-overdue jobs is removed by 2.10.1.

| Table | Reducer | file:line | Guard | Order-sensitive | Note |
|-------|---------|-----------|-------|-----------------|------|
| resource_gather_tick | finish_gather | reducers/items_gathering.ts:132 | Looks up gather by id and returns if gone; deletes the gather row first; validates node lock, location and combat | No | Id-keyed, so a duplicate run is a no-op |
| enemy_respawn_tick | respawn_enemy | reducers/combat.ts:1248 | Skips safe locations; re-counts non-event spawns against the cap on every run | No | Cap re-evaluated per run, no dependence on prior runs |
| pull_tick | resolve_pull | reducers/combat.ts:1003 | Returns unless pull is `pending`; re-validates character and spawn, and cleans up if invalid | No | The state transition off `pending` makes it single-shot |
| combat_loop_tick | combat_loop | reducers/combat.ts:2714 | Returns unless combat is `active`; timing from `ctx.timestamp` and per-row `nextAutoAttackAt`; reschedules via `scheduleCombatTick` at line 2813 | No | Ends by delete or state change on victory or defeat |
| health_regen_tick | regen_health | reducers/combat.ts:1358 | Full sweep of characters keyed on `ctx.timestamp`; re-inserts itself at line 1584 | No | Idempotent sweep |
| effect_tick | tick_effects | reducers/combat.ts:1590 | No-op body | N/A | Effects tick per combat round instead |
| hot_tick | tick_hot | reducers/combat.ts:1595 | No-op body | N/A | HoTs tick per combat round instead |
| cast_tick | tick_casts | reducers/combat.ts:1734 | Full sweep of `character_cast`, skips casts with `endsAtMicros > now`; deletes casts when the character is missing or inactive; re-inserts itself at line 1807 | No | Time-keyed sweep, not row-order-keyed |
| day_night_tick | tick_day_night | index.ts:288 | Compares `world.nextTransitionAtMicros` to `ctx.timestamp` and re-inserts if early | No | A second concurrent run sees the updated transition time and re-inserts instead of flipping again |
| disconnect_logout_tick | disconnect_logout | reducers/auth.ts:57 | Skips if `player.lastSeenAt > arg.disconnectAtMicros` | No | Timestamp comparison, not order-based, so logout vs reconnect is safe regardless of dispatch order (T-38-12) |
| character_logout_tick | character_logout | reducers/characters.ts:340 | Returns if any player still has the character active | No | State-based guard; cleanup (temp items, pets) is idempotent |
| event_despawn_tick | despawn_event_content | reducers/world_events.ts:167 | Returns unless event exists and `status === 'active'`; `resolveWorldEvent` also guards | No | Manual admin resolve before the deadline is safe |
| inactivity_tick | sweep_inactivity | index.ts:325 | Re-inserts first, then time-based sweep on `ctx.timestamp`; skips characters in combat | No | Idempotent sweep |
| bard_song_tick | tick_bard_songs | reducers/combat.ts:1601 | Cleans up song rows and returns if combat is not active; returns if the bard or songs are gone; reschedules at line 1725 | No | Guarded by combat state and existing song rows |
| llm_cleanup_tick | sweep_llm_errors | index.ts:356 | Time-based delete of old error or completed requests; re-inserts at the end | No | Idempotent sweep |
| round_timer_tick | resolve_round_timer | reducers/combat.ts:2704 | No-op body | N/A | Kept registered because the table still exists |

Result: **none of the 16 reducers is order-sensitive.** RESEARCH's expectation is confirmed against the real source. `git status --porcelain spacetimedb/src` is empty, so no source was changed.

## Deviations from Plan

None. The plan was executed as written. No auto-fixes were needed.

## Blocker/Follow-up

None. No order-sensitive reducer was found. The optional idempotency unit tests were not planned and were not added, as the plan stated.

## Known Stubs

None.

## Threat Flags

None. T-38-12 is mitigated by the audit above. T-38-SC is covered by the lockfile and pnpm's release-age gate, and only esbuild is approved to run install scripts.

## Self-Check: PASSED

- Commit b846f253 exists and lists only `spacetimedb/package.json` and `spacetimedb/pnpm-lock.yaml`.
- `spacetimedb/node_modules/vitest` reports 5.0.2; no `tsc` in `spacetimedb/node_modules/.bin`.
