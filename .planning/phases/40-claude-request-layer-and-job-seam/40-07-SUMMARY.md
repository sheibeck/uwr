---
phase: 40-claude-request-layer-and-job-seam
plan: 07
subsystem: llm
tags: [spacetimedb, views, renown, llm_job, per-sender-projection, bigint, vitest]
requires:
  - phase: 40-02
    provides: LLM_ROUTE_NAMES, isLlmRoute
  - phase: 40-04
    provides: enqueueLlmJob, SOURCE_KEYS, resolveCharacterPlayerId, llm_job table with by_player index
provides:
  - my_llm_jobs per-sender projection view (six fields, index lookup only) registered through registerViews
  - keeperMessageForJob in-voice status lines
  - Renown rank-up enqueues a valid llm_job (PIPE-08 fixed), static fallback when no identity resolves, bigint-safe
affects: [40-08, 40-09, 41, 42]
tech-stack:
  added: []
  patterns:
    - "Projection view: by_player.filter(ctx.sender) then map to a fixed key list; test wraps the DB so any iter call throws"
    - "Regression test uses real renown_data so every rank pool is exercised, not a mock"
key-files:
  created:
    - spacetimedb/src/helpers/llm_status.ts
    - spacetimedb/src/views/llm.ts
    - spacetimedb/src/views/llm.test.ts
    - spacetimedb/src/helpers/renown_llm.test.ts
  modified:
    - spacetimedb/src/views/index.ts
    - spacetimedb/src/helpers/renown.ts
    - spacetimedb/src/data/model_literals.test.ts
key-decisions:
  - "Bigint effect values in perkEffectJson are stored as plain JSON numbers (safe-range) so the stored JSON matches the {maxHp: 25} shape the perk prompt documents; out-of-range bigints become decimal strings"
  - "perkEffectJson is not parsed anywhere downstream: chosen passives resolve by perkKey in RENOWN_PERK_POOLS (chooseRenownPerkLogic writes only perkKey), so the field is a readable record"
  - "Enqueue errors in triggerRenownPerkGeneration are not swallowed; the swallowing try/catch was the PIPE-08 defect"
requirements-completed: []
duration: 30min
completed: 2026-09-29
status: complete
---

# Phase 40 Plan 07: Status View and Renown Fix Summary

Players can read only their own job status through a six-field, index-only `my_llm_jobs` view, and a renown rank-up now leaves exactly one valid pending `renown_perk_gen` job (or the static perk options when no identity resolves) instead of hitting the old swallowed insert; the static fallback no longer crashes on bigint effects.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 2 (RED) | Failing renown regression test | 2e42e309 | helpers/renown_llm.test.ts |
| 2 (GREEN) | Renown enqueues a job, bigint-safe fallback | 0fd9344d | helpers/renown.ts, data/model_literals.test.ts |
| 1 | my_llm_jobs view and keeperMessageForJob | 6cf49982 | helpers/llm_status.ts, views/llm.ts, views/llm.test.ts, views/index.ts |

Task 2's RED and GREEN were done before Task 1 (the two tasks are independent); each is its own commit.

## RED run (against the unchanged renown.ts)

`pnpm --dir spacetimedb exec vitest run src/helpers/renown_llm.test.ts`: 22 of 23 failed. The rank-up test failed with:

```
AssertionError: expected [] to have a length of 1 but got +0
  src/helpers/renown_llm.test.ts:58  expect(jobs).toHaveLength(1);
```

(the old code did `ctx.db.player.id.find(character.ownerUserId)`, a u64 against an Identity primary key, and returned early). The other tests failed with `triggerRenownPerkGeneration is not a function` (not yet exported). Afterwards, with the fix but the old plain `JSON.stringify(perk.effect)` temporarily restored, the per-rank fallback tests failed for ranks 2, 3, 5, 9, 11, 12, 13 and 14 (bigint effects), then passed with `serializePerkEffect`. Final run: 38 passed across `renown_llm.test.ts`, `reducers/renown.test.ts`, `model_literals.test.ts`.

## What was built

- `helpers/llm_status.ts`: `keeperMessageForJob(status, errorCode, route)`; distinct Keeper lines for pending, in_flight, received, completed, expired; failed groups transient / account / refusal / malformed plus a generic fallback for unknown status or class. No digits, provider names, "API", key fragments.
- `views/llm.ts`: `my_llm_jobs` (`public: true`, per-sender via the lookup), row type `MyLlmJob` through `t.row('MyLlmJob', ...)`, `projectMyLlmJob`, `MY_LLM_JOB_KEYS`. `registerLlmViews(deps)` is the last call inside `registerViews`; `index.ts` (root) was not edited, its existing export collection picks the view up by name. Client not wired (Phase 42 `useLlmStatus`).
- `helpers/renown.ts`: `triggerRenownPerkGeneration` exported and rewritten: `resolveCharacterPlayerId`, null gives `insertStaticRenownPerkOptions`, otherwise `enqueueLlmJob` with `SOURCE_KEYS.renownPerk(character.id, rank)` and request `{ characterId, rank, className, raceName (from character.race), existingPerks }`. Legacy `llm_task` insert, try/catch, gpt-5-mini literal and prompt-builder import removed. `renown.ts` entry removed from `LEGACY_MODEL_LITERALS`.
- Bigint fix: `serializePerkEffect` in `helpers/renown.ts` (replacer turns bigint into a JSON number when within the safe-integer range, else a decimal string).

## Verification

- `pnpm --dir spacetimedb exec vitest run src/views/llm.test.ts`: 14 passed
- `pnpm --dir spacetimedb exec vitest run src/helpers/renown_llm.test.ts src/reducers/renown.test.ts src/data/model_literals.test.ts`: 38 passed
- `pnpm --dir spacetimedb test`: 1373 passed (1336 before this plan)
- `spacetime build -p spacetimedb`: "Build finished successfully" (with the same harmless "tsc not found" notice as before). Build only bundles the module; the view's schema is validated by the host at publish, which is plan 40-09.
- `npx tsc --noEmit -p spacetimedb`: no diagnostics in `helpers/renown`, `helpers/llm_status`, `views/llm`, `views/index`
- Acceptance greps: `llm_task`, `gpt-`, `buildRenownPerk` in `renown.ts` = 0; `enqueueLlmJob(ctx` = 1; `insertStaticRenownPerkOptions(ctx` = 2; `registerLlmViews(deps);` = 1; no `.iter(` in `views/llm.ts`; no `requestJson|resultText|dedupeKey` in `views/llm.ts`.
- Nothing published.

## Deviations from Plan

None on scope. Notes:

- The regression test uses the real `renown_data` rather than a mock so all 14 static pools (ranks 2 to 15) are covered, per the orchestrator's instruction to test every rank with a static pool. The rank-up path works because real thresholds put 110 points at rank 2.
- Added two tests beyond the behavior block: a two-rank jump (one job per rank) and existing perks carried into the request.

## Hand-offs

- **Phase 41 (renown, pending jobs):** Phase 41's executor must process or expire pre-existing pending `renown_perk_gen` jobs; nothing sweeps `llm_job` yet. Until then a rank-up leaves the job pending and the player sees no perk offer (accepted, orchestrator resolution 7).
- **Phase 41 (bigint defect still in index.ts):** the separate copy of the static-fallback logic inside `submit_llm_result` in `spacetimedb/src/index.ts` (around line 1578) still calls `JSON.stringify(perk.effect)` and still throws `TypeError: Do not know how to serialize a BigInt` for ranks 2, 3, 5, 9, 11 (and by the same test 12, 13, 14). Its behavior is pinned by 40-05's characterization tests and moves verbatim in 40-08; it must be fixed when the renown apply step is extracted (reuse a bigint-safe serializer like `serializePerkEffect`, which is currently module-private in `helpers/renown.ts`).
- **Phase 41 (latent defect, RESEARCH 2.1):** `Character` has no archetype column, so skill_gen prompts always say "warrior".
- **Phase 41 (route name):** the request context now carries `characterId` as a decimal string plus the existing perks, a superset of the legacy `contextJson` keys, so the extracted renown apply step can take `requestJson` directly.

## Known Stubs

None.

## Threat Flags

None. T-40-02 mitigated (index lookup on `ctx.sender`, six-field projection, tests for isolation, empty result, key set, no scan, static grep); T-40-19 (message content tested); T-40-05 (dedupe by `characterId:rank`, double-call test); T-40-11 (validated helper, `rowColumnProblems` check, recorded RED run); T-40-20 (static fallback tested; pending jobs until Phase 41 documented above).

## Self-Check: PASSED

- FOUND: spacetimedb/src/helpers/llm_status.ts, spacetimedb/src/views/llm.ts, spacetimedb/src/views/llm.test.ts, spacetimedb/src/helpers/renown_llm.test.ts
- FOUND commits: 2e42e309, 0fd9344d, 6cf49982
