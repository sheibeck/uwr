---
created: 2026-09-30T23:40:00.000Z
title: Add llm_job retention and pruning
area: backend
priority: medium
files:
  - spacetimedb/src/helpers/llm_sweeper.ts
  - spacetimedb/src/views/llm.ts
  - spacetimedb/src/schema/tables.ts (LlmJob)
  - src/composables/data/useCoreData.ts
---

## Problem

`llm_job` rows are never deleted. Every finished job (completed, failed or expired) stays forever, so each player's `my_llm_jobs` view, the client's subscription to it and the client-side `selectLlmIndicator` scan all grow with every LLM call the player ever makes. Phase 42 accepted this on purpose (planning note 3) to keep the cutover small; it is fine for a playtest and not fine for a long-lived world.

Only the small per-player `llm_player_budget` rows are pruned today (`prunePlayerBudgets` in the sweeper). Jobs and their `llm_call_log` rows are not.

## Solution

Two ideas, not mutually exclusive:

- **Server-side pruning in the sweeper (preferred).** Extend `sweepLlmJobs` in `spacetimedb/src/helpers/llm_sweeper.ts` to delete terminal jobs (`completed`, `failed`, `expired`) older than a retention window, in bounded batches per sweep like the budget prune. Keep `llm_call_log` rows, because Phase 43 latency and budget stats read them. Never delete an active job (`pending`, `in_flight`, `received`): the dedupe key on active jobs is what stops duplicate work.
- **Filtered client subscription.** Subscribe only to active statuses for the indicator, for example a `my_llm_jobs` query limited to active rows, so old rows never reach the browser. This is untested (research A4: whether the view or subscription accepts a status filter needs a probe first), so treat it as a follow-up to pruning, not a replacement.

Tests to add, per the project rule that every change ships tests:

- the pruning boundary: a terminal job one second younger than the window survives, one older is deleted;
- an active job is never pruned, however old;
- the dedupe rule still blocks a repeat enqueue while a job is active and allows one after the old terminal row is pruned;
- the batch cap: one sweep never deletes more than the cap, and the next sweep continues;
- `my_llm_jobs` and `selectLlmIndicator` still behave the same after pruning.

Publish locally only (`spacetime publish uwr -p spacetimedb`); this is a code-only change, so no `--clear-database`. The user decides when to publish to maincloud.
