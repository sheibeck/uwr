---
phase: 41-executor-and-domain-cutover
plan: 10
subsystem: llm-cutover-npc-chat
tags: [spacetimedb, llm, enqueue, npc-chat, cutover, local-publish, bindings, tests]
status: complete
requires:
  - phase: 41-05 (enqueueLlmJob, EnqueueResult, llmRefusalMessage)
  - phase: 41-07 (executor: llm_dispatch to llm_run, llm_sweep_tick to llm_sweep)
  - phase: 41-08 (admin_llm_status view, llm_smoke_test)
provides:
  - "talk_to_npc enqueues one npc_conversation job and one dispatch row in its own transaction"
  - "reducers/llm_cutover.test.ts: shared cutover harness (real reducers captured from index.ts, seed builders, exported expectEnqueued(ctx, route))"
  - "LEGACY_MODEL_LITERALS without the npc_interaction.ts entry"
  - "Module published locally with the executor schema; bindings match the module and expose no private llm_* table"
affects: [41-11, 41-12, 41-13, 41-14, 41-15, 41-16]
tech-stack:
  added: []
  patterns:
    - "Refusal, dedupe and empty-message answers return before any write; the player's line is echoed only after a created job"
    - "Turn marker = npc_memory.lastUpdated micros read after getOrCreateNpcMemory, so a reply moves the key and the next message starts a new job"
key-files:
  created:
    - spacetimedb/src/reducers/llm_cutover.test.ts
  modified:
    - spacetimedb/src/reducers/npc_interaction.ts
    - spacetimedb/src/data/model_literals.test.ts
key-decisions:
  - "Region optional fields are passed as `?? undefined` so the snapshot never carries JSON nulls into the builder"
  - "Empty-message check sits after the ownership, location and combat checks and before any context building or memory creation"
  - "No bindings commit: pnpm spacetime:generate produced output identical to the committed src/module_bindings/ (private llm_* tables and the schedule/view changes were already bound in 41-07/41-08)"
metrics:
  tasks: 2
  files: 3
  tests_added: 10
  suite: "1925 passed (spacetimedb, baseline 1915 + 10); scripts/llm/cli.test.mjs 22 passed"
completed: 2026-09-30
---

# Phase 41 Plan 10: NPC Chat Cutover and First Local Publish Summary

`talk_to_npc` now enqueues an `npc_conversation` job through `enqueueLlmJob` in its own transaction (snapshotted route input, per-turn dedupe, per-player cap, budget reservation) and the module is published locally with the executor schema.

## What was built

### Task 1: talk_to_npc enqueues in-transaction (commit 28794b96)
- `npc_interaction.ts`: kept the ownership, NPC, location and combat checks; added the trimmed empty-message check (`You open your mouth, but nothing comes out.`); removed the legacy pending-task check, the legacy budget check, the prompt builders, the legacy task insert and the counter increment plus their imports. Builds an `NpcConversationInput` (npc, region, location, personality, affinity tier, memory, completed and recent quest names, active-quest flag, player message, quest counts, nearby locations and enemies) and enqueues with `SOURCE_KEYS.npcConversation(character.id, npc.id, memory.lastUpdated.microsSinceUnixEpoch)` and `request { characterId, npcId, memoryId (decimal strings), input: encodeRouteInput(input) }`. Refusal answers `fail(..., llmRefusalMessage(reason))`; a dedupe merge answers `The Keeper is already considering something. Patience.`; only a created job appends the `You: "..."` NPC dialog line and the private `say` event.
- `llm_cutover.test.ts` (10 tests, real handler via the recorder, strict mock db, 120 s `beforeAll`): one owned pending job plus one dispatch and no `llm_task` rows, rows match the recorded schema; request keys are strings and the snapshot resolves through `resolveRouteInput` into a volatile layer with the message inside `player_input` tags; the player line is echoed after enqueue; a second message answers the patience line with no second job, one dialog line and one reservation; the next message after a reply (job completed, memory moved) creates a second job; empty and whitespace messages create nothing and answer in voice; at the daily cost limit nothing is created and the text equals `llmRefusalMessage('daily_cost')` with no player line; at the per-player cap the answer equals `llmRefusalMessage('busy')`; ownership, location and combat checks still precede the enqueue; a static check that `npc_interaction.ts` has no `llm_task`, budget helper or model literal and exactly one `enqueueLlmJob(ctx`.

### Task 2: allowlist, publish, bindings, client build (commit 357b86d7)
- Deleted the `npc_interaction.ts` entry from `LEGACY_MODEL_LITERALS`; full suite green; `spacetime build -p spacetimedb` finished successfully.
- Privacy check (`spacetime generate` into a scratch dir, then deleted): generated files matching `llm|admin` were `admin_llm_status_table.ts`, `llm_smoke_test_reducer.ts`, `llm_task_table.ts` (the legacy public table, removed by a later plan), `my_llm_jobs_table.ts`, `prepare_creation_llm_reducer.ts`, `prepare_world_gen_llm_reducer.ts`, `submit_llm_result_reducer.ts`, `validate_llm_request_reducer.ts`. Zero table bindings for `llm_job`, `llm_call_log`, `llm_config`, `llm_dispatch`, `llm_sweep_tick`, `llm_player_budget`, `llm_spend` or `llm_admin_state`. The committed `src/module_bindings/` gives the same result (`admin_llm_status` present, zero private llm_* table files).

## Local publish

The local server was not running; started `spacetime start --non-interactive --listen-addr 127.0.0.1:3000` in the background (ping 200) and left it running.

First `pnpm spacetime:publish < /dev/null` refused:

```
Errors occurred:
Adding a column next_attempt_at to table llm_job requires a default value annotation

Aborting publish due to required manual migration.
Error: Aborting because publishing would require manual migration or deletion of data and --delete-data was not specified.
```

A local clear WAS needed (schema change: new `llm_job.next_attempt_at` column from 41-07; greenfield, user-approved, the key in `llm_config` is only the Phase 39 dummy). Re-ran `pnpm spacetime:publish --clear-database -y < /dev/null`:

```
This will DESTROY the current uwr module, and ALL corresponding data.
Skipping confirmation due to --yes
Publishing module...
Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a
```

`--break-clients` was not needed. Nothing targeted maincloud. `pnpm spacetime:generate` then produced no diff against the committed bindings, so there is no bindings commit. `pnpm build` (vue-tsc and Vite) exits 0.

## Post-publish checks (orchestrator hand-off)

1. Schedule bindings: `spacetime describe uwr --server local --json` lists `llm_sweep_tick_sched` (llm_sweep_tick to `llm_sweep`), `llm_dispatch_sched` (llm_dispatch to `llm_run`) and `llm_cleanup_tick_sched` (to `sweep_llm_errors`). `spacetime logs uwr --server local` over about 3 minutes after init contains only the init lines, with zero matches for panic, error or failed. The sweep demonstrably runs: see 2.
2. `llm_sweep_tick` holds exactly one row between ticks (owner CLI sql works locally): 16:10:13 shows `scheduled_id 4` (next at 16:10:13.39), 16:11:00 shows `scheduled_id 6` (next at 16:11:13.40). The id advances by one per 30 s tick while exactly one row remains each time, so the tick reschedules itself without duplicating. `llm_dispatch` is empty (no jobs enqueued in this plan; the dispatch to `llm_run` path was confirmed by the schedule binding above and the unit tests, not by a live job).
3. `keyValid` through the smoke test is NOT exercised here: no real key is set until 41-16 and no real Claude call was made.

## Deviations from Plan

None - plan executed as written. The plan's "regenerated bindings" commit does not exist because regeneration yielded no changes.

## Known regression (cosmetic, until Phase 42)

The client's `useLlmProxy` no longer sees NPC tasks, so the processing indicator does not cover NPC replies until Phase 42's `useLlmStatus`. No client code changed (the client already calls `talkToNpc` directly). NPC replies themselves are applied by the executor (41-07); a live reply needs the real key from 41-16.

## Known Stubs

None.

## Threat Flags

None. T-41-04 (spam, two tabs) mitigated by per-turn dedupe, per-player cap and reservation, all covered by tests; T-41-01c mitigated by the privacy check above; T-41-14 respected (local publish only). T-41-11 (prompt injection via the NPC message) is transferred: the text is stored only in private `requestJson` and tagged by the Phase 40 builder. Breadcrumb to `/gsd-secure-phase`.

## Self-Check: PASSED
- FOUND: spacetimedb/src/reducers/llm_cutover.test.ts, spacetimedb/src/reducers/npc_interaction.ts, spacetimedb/src/data/model_literals.test.ts
- FOUND commits: 28794b96, 357b86d7
- Acceptance greps: `llm_task` 0, `checkBudget|incrementBudget` 0, `gpt-|claude-` 0, `enqueueLlmJob(ctx` 1, allowlist entry 0, admin_llm_status bindings 1, private llm_* table bindings 0
