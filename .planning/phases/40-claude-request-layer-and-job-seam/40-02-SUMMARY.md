---
phase: 40-claude-request-layer-and-job-seam
plan: 02
subsystem: llm
tags: [anthropic, json-schema, structured-outputs, route-table, vitest, spend-safety]
requires:
  - phase: 40-01
    provides: offline test seam (not consumed by this plan; pure modules only)
provides:
  - CLAUDE_MODEL single model constant (data/llm_models.ts)
  - LLM_ROUTES table, validateRoutes, isLlmRoute (data/llm_routes.ts)
  - five frozen JSON Schemas plus LLM_JSON_SCHEMAS registry (data/llm_schemas.ts)
  - lintSchema structured-output subset linter (helpers/schema_lint.ts)
  - repository model-literal guard with shrinkable legacy allowlist
affects: [40-03, 40-04, 40-05, 40-06, 40-07, 40-08, 40-09, 40-10, 41]
tech-stack:
  added: []
  patterns:
    - "Module-level deep-frozen schemas so the Anthropic grammar cache sees byte-identical schemas"
    - "Pure data modules with no runtime import from the server entry, schema/tables, events or location"
    - "Shrinkable allowlist guard: an allowlisted site that loses its literal fails until the entry is removed"
key-files:
  created:
    - spacetimedb/src/helpers/schema_lint.ts
    - spacetimedb/src/helpers/schema_lint.test.ts
    - spacetimedb/src/data/llm_schemas.ts
    - spacetimedb/src/data/llm_schemas.test.ts
    - spacetimedb/src/data/__snapshots__/llm_schemas.test.ts.snap
    - spacetimedb/src/data/llm_models.ts
    - spacetimedb/src/data/llm_routes.ts
    - spacetimedb/src/data/llm_routes.test.ts
    - spacetimedb/src/data/model_literals.test.ts
  modified: []
key-decisions:
  - "Effort is set through one shared DEFAULT_EFFORT constant ('low') in a route() helper; the test asserts 'low' per route"
  - "validateRoutes additionally requires cache.bible and cache.route to be true (not in the plan list, harmless and consistent with the locked defaults)"
  - "Legacy equivalence test strips only string-valued description keys so a property literally named description is preserved"
  - "model_literals.test.ts uses // @ts-ignore on node:* imports because spacetimedb/tsconfig has no @types/node (same pre-existing gap as measurement.results.test.ts)"
requirements-completed: []
duration: 25min
completed: 2026-09-29
status: complete
---

# Phase 40 Plan 02: Model Constant, Route Table and Schemas Summary

One Claude model constant, one validated eight-route table and five frozen, lint-clean JSON Schemas (region included), with a structured-output subset linter and a repository-wide model-ID guard, all as pure modules that load in plain Node vitest. Nothing is wired to a live path and nothing publishes.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Structured-output subset linter | 2a3b7863 | helpers/schema_lint.ts, helpers/schema_lint.test.ts |
| 2 | Real JSON Schemas for the five JSON routes | 4d69e591 | data/llm_schemas.ts, data/llm_schemas.test.ts, data/__snapshots__/llm_schemas.test.ts.snap |
| 3 | Model constant, route table, model-literal guard | f91c21a4 | data/llm_models.ts, data/llm_routes.ts, data/llm_routes.test.ts, data/model_literals.test.ts |

## Parameter counts per schema

| Schema | Union (anyOf) params | Optional params |
|--------|---------------------:|----------------:|
| RACE_SCHEMA | 0 | 0 |
| CLASS_SCHEMA | 3 | 0 |
| REGION_GENERATION_SCHEMA | 0 | 0 |
| SKILL_GENERATION_SCHEMA | 4 | 0 |
| RENOWN_PERK_SCHEMA | 6 | 0 |

Limits enforced by lintSchema: 24 optional, 16 union (boundary fixtures at 24/25 and 16/17).

## Pinned LEGACY_MODEL_LITERALS (model_literals.test.ts)

Pinned from a real repository grep, not guessed; matches the planning-time expectation exactly.

| File | Count | Note |
|------|------:|------|
| spacetimedb/src/index.ts | 4 | gpt-5.4 x2, gpt-5-mini x2 |
| spacetimedb/src/helpers/combat_narration.ts | 1 | |
| spacetimedb/src/reducers/npc_interaction.ts | 1 | |
| spacetimedb/src/reducers/llm.ts | 2 | |
| spacetimedb/src/helpers/renown.ts | 1 | removed by Plan 40-07 |
| spacetimedb/src/schema/tables.ts | 1 | stale comment in dead LlmRequest table, Phase 42 |
| src/composables/useLlm.ts | 2 | dead client composable, Phase 42 |

Phase 41 shrinks this map to empty. `spacetimedb/src/data/llm_models.ts` is the only file with `claude-sonnet-5-5`.

## Route table (as built)

| Route | max_tokens | timeoutMs | output |
|-------|-----------:|----------:|--------|
| creation_race | 4096 | 90000 | json RACE_SCHEMA |
| creation_class | 4096 | 90000 | json CLASS_SCHEMA |
| world_gen | 8192 | 150000 | json REGION_GENERATION_SCHEMA |
| skill_gen | 4096 | 60000 | json SKILL_GENERATION_SCHEMA |
| renown_perk_gen | 2048 | 60000 | json RENOWN_PERK_SCHEMA |
| npc_conversation | 1024 | 30000 | text |
| combat_narration | 1024 | 20000 | text |
| smoke_test | 256 | 30000 | text |

All routes: model CLAUDE_MODEL, effort low, cache bible and route true.

## Verification

- `pnpm --dir spacetimedb test`: 816 passed across 23 files (baseline 709 plus 107 new)
- schema_lint 45 tests, llm_schemas 25 tests (incl. 5 snapshots written), llm_routes 27 tests, model_literals 10 tests; legacy `llm_prompts.test.ts` still green
- `npx tsc --noEmit -p spacetimedb`: no diagnostics in the new files
- No production file changed; `llm_prompts.ts` untouched; the repository scan proves no `http.fetch(` under `spacetimedb/src` outside tests

## Deviations from Plan

**1. [Rule 3 - Blocking] tsc could not resolve `node:fs`/`node:path`/`node:url` in model_literals.test.ts**
- **Found during:** Task 3 verification (acceptance requires zero tsc diagnostics in the new files)
- **Issue:** `spacetimedb/tsconfig.json` has no `@types/node`; the pre-existing `measurement.results.test.ts` has the same diagnostics.
- **Fix:** `// @ts-ignore` on the three imports with an explanatory comment. No package installed, no tsconfig edit.
- **Files modified:** spacetimedb/src/data/model_literals.test.ts
- **Commit:** f91c21a4

**2. [Process] TDD tasks committed once each** (tests and implementation together) rather than separate RED/GREEN commits, as in 40-01; tests were run green before each commit.

**3. [Addition] validateRoutes also checks cache flags** (both must be true). Not in the plan's list, consistent with the locked route defaults.

## Known Stubs

None.

## Threat Flags

None. T-40-09 mitigated (frozen schemas, lintSchema over all five, snapshot, vocabulary-subset tests). T-40-14 mitigated (single constant, per-route effort and locked max_tokens asserted, model-literal guard, no-`http.fetch` prohibition test).

## Self-Check: PASSED

- FOUND: schema_lint.ts, schema_lint.test.ts, llm_schemas.ts, llm_schemas.test.ts, llm_schemas.test.ts.snap, llm_models.ts, llm_routes.ts, llm_routes.test.ts, model_literals.test.ts
- FOUND commits: 2a3b7863, 4d69e591, f91c21a4
