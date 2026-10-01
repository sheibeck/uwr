---
phase: 43-latency-tuning-staged-generation-and-budget
plan: 04
subsystem: api
tags: [spacetimedb, llm, schemas, routes, prompts, staged-generation, vitest]
status: complete

requires:
  - phase: 43-latency-tuning-staged-generation-and-budget
    provides: kill switch, ceiling and resting line (Plans 43-01 to 43-03)
provides:
  - WORLD_START_SCHEMA, REGION_FILL_SCHEMA, CLASS_REVEAL_SCHEMA, CLASS_FILL_SCHEMA and the registry keys classReveal, classFill, worldStart, regionFill
  - Ten-route table with the stage-1 routes creation_class_reveal and world_gen_start; world_gen and creation_class are the stage-2 fills
  - WorldFillInput, CreationClassFillInput, four stage route blocks, buildWorldStartVolatile, buildWorldFillVolatile, buildCreationClassRevealVolatile, buildCreationClassFillVolatile
  - ROUTE_BIGINT_PATHS and smokeInputFor entries for all ten routes
affects: [43-05, 43-08, 43-10, 43-13, 43-15]

tech-stack:
  added: []
  patterns:
    - "Stage-1 schema is the smallest that serves the reveal; stage-1 facts reach stage 2 only through the sanitized volatile user message"
    - "Fill builders read their input through asRecord/asArray/orUnknown, so an older stored input renders 'unknown' instead of throwing"

key-files:
  created: []
  modified:
    - spacetimedb/src/data/llm_schemas.ts
    - spacetimedb/src/data/llm_schemas.test.ts
    - spacetimedb/src/data/__snapshots__/llm_schemas.test.ts.snap
    - spacetimedb/src/data/llm_routes.ts
    - spacetimedb/src/data/llm_routes.test.ts
    - spacetimedb/src/data/llm_layers.ts
    - spacetimedb/src/data/llm_layers.test.ts
    - spacetimedb/src/helpers/llm_inputs.ts
    - spacetimedb/src/helpers/llm_inputs.test.ts

key-decisions:
  - "Shared schema nodes (location terrain, NPC type, NPC personality, ability, stats) are named constants reused by the stage schemas, so no enum or field changed from the proven Phase 39 and Phase 40 shapes"
  - "WORLD_START_SCHEMA firstNpc has no locationName (the first NPC always stands in the start location) and startLocation has no isSafe or connectsTo (the start location is always safe)"
  - "The shared class valid-values, mechanical-guidance and archetype text and the NAMING RULES paragraph became module constants used by both blocks of a pair, so the text stays verbatim and cannot drift between stages"
  - "buildWorldStartVolatile ends 'Generate the first glimpse of a region: its name, description and biome, the place a traveler arrives, and the first person met there.' (the plan's wording)"

patterns-established:
  - "Tolerant builder inputs: stage-2 builders accept any object shape, missing strings read 'unknown', missing arrays are empty, a missing gender resolves deterministically through resolveNpcGender"

requirements-completed: []  # LAT-03 and LAT-04 data layer only; standing rule: no requirements mark-complete

coverage:
  - id: D1
    description: "Ten routes exist in the fixed order with the contract max_tokens and timeouts; json routes carry their frozen schema by identity; validateRoutes is clean"
    requirement: LAT-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/data/llm_routes.test.ts#LLM_ROUTES"
        status: pass
    human_judgment: false
  - id: D2
    description: "All four stage schemas are all-required, additionalProperties false, lint clean, deep-frozen, registered by identity; WORLD_START_SCHEMA has exactly five required fields and no landmarks, threats, enemies, extra locations or isSafe; CLASS_REVEAL_SCHEMA has no stats and one ability object; NPC gender enum stays on firstNpc and on every fill NPC"
    requirement: LAT-04
    verification:
      - kind: unit
        ref: "spacetimedb/src/data/llm_schemas.test.ts#staged generation schemas (Plan 43-04)"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/data/llm_schemas.test.ts#lint and determinism"
        status: pass
    human_judgment: false
  - id: D3
    description: "Stage route blocks start with TASK: and end with the JSON-only line; stage-2 blocks say to use the given names exactly and never rename or repeat stage-1 facts; both world blocks carry 'Set gender to male or female' and the traveler-is-you sentence; no stage block calls the Keeper or an NPC it or they"
    requirement: LAT-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/data/llm_layers.test.ts#route blocks and volatile builders and #pronoun rule in route blocks and volatile builders (Plan 41-18)"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/data/pronoun_rules.test.ts#repository pronoun guard"
        status: pass
    human_judgment: false
  - id: D4
    description: "Stage-2 volatile builders sanitize every stage-1 fact (hostile world data adds no tag or raw angle bracket), are deterministic, and tolerate old-shaped and missing-field inputs without throwing (T-43-12)"
    requirement: LAT-04
    verification:
      - kind: unit
        ref: "spacetimedb/src/data/llm_layers.test.ts#stage-2 builders tolerate an older stored input (Plan 43-04)"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/data/llm_layers.test.ts#buildRouteLayers"
        status: pass
    human_judgment: false
  - id: D5
    description: "ROUTE_BIGINT_PATHS has an entry for each of the ten routes and smokeInputFor returns a fixed player-free input for each; the golden round trip is byte-identical for all ten"
    requirement: LAT-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_inputs.test.ts#golden round trip, #ROUTE_BIGINT_PATHS, #smokeInputFor"
        status: pass
    human_judgment: false
  - id: D6
    description: "Builder tolerance: the apply, characterization, executor, seam and cutover suites pass with no edits (393 tests)"
    requirement: LAT-04
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_apply.test.ts, llm_apply.characterization.test.ts, llm_executor.test.ts, llm_seam.test.ts, reducers/llm_cutover.test.ts"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-10-01
---

# Phase 43 Plan 04: Stage schemas, routes, blocks and builders Summary

**Ten routes with a small stage-1 reveal schema and a stage-2 fill schema for both class creation and world generation, static Keeper-voice blocks, sanitized and tolerant volatile builders, and fixed smoke inputs for every route.**

## Accomplishments

- `llm_schemas.ts`: `CLASS_REVEAL_SCHEMA` (className, classDescription, firstAbility), `CLASS_FILL_SCHEMA` (stats plus an abilities array described as exactly 2 more), `WORLD_START_SCHEMA` (regionName, regionDescription, biome, startLocation without isSafe, firstNpc without locationName) and `REGION_FILL_SCHEMA` (dominantFaction, landmarks, threats, locations, npcs, enemies). The old `CLASS_SCHEMA` and `REGION_GENERATION_SCHEMA` are removed; registry is `{ race, classReveal, classFill, worldStart, regionFill, skill, renown }`.
- `llm_routes.ts`: route order creation_race, creation_class_reveal, creation_class, world_gen_start, world_gen, skill_gen, npc_conversation, combat_narration, renown_perk_gen, smoke_test; creation_class_reveal 2048/60 s, creation_class 4096/90 s, world_gen_start 4096/90 s, world_gen 8192/150 s.
- `llm_layers.ts`: input types, `CREATION_CLASS_REVEAL_BLOCK`, `CREATION_CLASS_BLOCK` (fill), `WORLD_GEN_START_BLOCK`, `WORLD_GEN_BLOCK` (fill), four builders, four dispatch cases. COMBAT_NARRATION_BLOCK and buildCombatOutroVolatile untouched.
- `llm_inputs.ts`: empty bigint paths for the two new routes, fixed smoke inputs for all ten.

## Task Commits

1. **Task 1: stage schemas and the ten-route table** - `ac06fcc6` (feat)
2. **Task 2: stage route blocks, tolerant fill builders, input types, bigint paths, smoke inputs** - `f93e9838` (feat)

## Final size of each new route block (characters)

| Route | Characters |
|---|---|
| creation_class_reveal | 3787 |
| creation_class (fill) | 3910 |
| world_gen_start | 2316 |
| world_gen (fill) | 3018 |

## Pinned tests changed

| File | Test | Change |
|---|---|---|
| llm_schemas.test.ts | the five-schema ALL list, parameter counts, frozen spot-checks, registry identity, class vocabulary enums, no-non-vocabulary-values, region NPC gender | moved from CLASS_SCHEMA and REGION_GENERATION_SCHEMA to the four new schemas (class union count 3 on both class schemas, 0 on both world schemas); new "staged generation schemas" describe block |
| `__snapshots__/llm_schemas.test.ts.snap` | CLASS_SCHEMA and REGION_GENERATION_SCHEMA snapshots | two obsolete entries removed with `-u` after review (race, skill and renown snapshots unchanged); four new snapshots written |
| llm_routes.test.ts | route count, LOCKED_MAX_TOKENS, JSON_SCHEMAS map, missing-route count | eight to ten, contract values, new schemas; new order and timeout tests |
| llm_layers.test.ts | EXPECTED_TAG_MATCHES, makeInputs, "eight routes" block test | ten routes, 0 tags for the four stage routes |
| llm_layers.test.ts | "creation_class keeps both archetype paragraphs ... exactly 3 starting abilities" | split into reveal ("exactly 1 starting ability", className, classDescription and firstAbility only, no stats) and fill ("exactly 2 more starting abilities", stats rules, never repeat or rename) |
| llm_layers.test.ts | "world_gen keeps naming rules ... first safe location ... 3-5 locations" | split into world_gen_start (remembered framing, safe arrival point, first NPC) and world_gen fill ("2-4 more locations, 1-2 more NPCs and 2-3 enemy types", arrival-point vendor and banker rule, exact-names rule) |
| llm_layers.test.ts | pronoun tests | "as you" list gains the reveal and start blocks (start via "it says you"); gender sentence asserted on both world blocks; new no-it-or-they test over the four stage blocks |
| llm_inputs.test.ts | INPUTS fixture and route count | ten routes, count ten; new bigint-path and smoke-input tests |

## Red tests left for Plan 43-05

Full server run: 54 files, 4 failed, 25 failing tests, 2344 passed. Every failure is in one of the four expected-red files.

- `src/data/llm_indicator_lines.test.ts`
  - LLM_INDICATOR_LINES > has exactly one key per route in LLM_ROUTE_NAMES
  - LLM_INDICATOR_PRIORITY and LLM_INDICATOR_SILENT_ROUTES > priority plus silent routes cover every route once
- `src/helpers/llm_budget.test.ts`
  - reservation estimate > equals BigInt(reserveCostMicroUsd(maxTokens, bible + route block + json)) for all eight routes
- `src/helpers/llm_retry.test.ts`
  - maxAttempts > covers all eight routes with exactly the LLM_NO_AUTO_RETRY_ROUTES set at 1
- `src/helpers/claude_request.test.ts` (buildClaudeRequest unless noted)
  - covers five json routes and three text routes
  - creation_class_reveal and world_gen_start, each: fixed key order and locked parameters; system is [Keeper Bible, route block], cached; json route carries output_config.format json_schema with the route schema; body snapshot; body never carries a forbidden key, an assistant message or thinking; system and output_config are byte-identical for benign and hostile volatile input; identical inputs give byte-identical bodyText, distinct objects
  - creation_class and world_gen, each: body snapshot (Keeper Bible replaced by a placeholder)
  - building in forward and reversed route order gives the same body per route
  - assertValidClaudeBody > accepts a freshly built body for every route
  - buildClaudeHeaders > creation_class_reveal: the key is in the headers only, never in the body; world_gen_start: the key is in the headers only, never in the body

`claude_request.test.ts` also fails `tsc` on its route-keyed inputs fixture (line 66, missing creation_class_reveal and world_gen_start); that fixture is Plan 43-05's. No snapshot file for `claude_request` was modified.

## Verification

- Data-layer gate (`llm_schemas`, `llm_routes`, `llm_layers`, `llm_inputs`, `schema_lint`, `pronoun_rules`): 6 files, 313 tests pass (re-run after the final edit: 238 tests in the four touched files pass).
- Tolerance gate (`llm_apply`, `llm_apply.characterization`, `llm_executor`, `llm_seam`, `reducers/llm_cutover`): 5 files, 393 tests pass; `git diff --stat` on those five files is empty and no snapshot was updated for them.
- `spacetime build -p spacetimedb`: "Build finished successfully" (with the pre-existing "tsc not found" notice).
- `pnpm exec tsc --noEmit -p spacetimedb/tsconfig.json`: the only error in this plan's area is the expected-red `claude_request.test.ts` fixture.
- Acceptance greps: schema exports 4, `world_gen_start: route(4096, 90_000` 1, `creation_class_reveal: route(2048, 60_000` 1, `REGION_GENERATION_SCHEMA` 0, builders 4, `case 'world_gen_start'|'creation_class_reveal'` 2, WorldFillInput 1, CreationClassFillInput 1, `Set gender to male or female` 2.
- No `spacetime publish`, `call` or `generate` was run; nothing touched the running local stack.

## Deviations from Plan

**1. [Process note] TDD RED was written first but each task is one `feat` commit** rather than a test/feat pair, matching Plans 43-01 to 43-03. Task 1's new assertions were written before the schema code; Task 2's one failing assertion (the stage-1 volatile wording) was found on the first green run and fixed in the builder to match the plan's text.

**2. [Scope note] Snapshot `-u` on `llm_schemas.test.ts` only**, to remove the two obsolete snapshots of the deleted schemas. The plan names no `-u`; the diff was reviewed first (only the CLASS_SCHEMA and REGION_GENERATION_SCHEMA keys removed, four new keys added, nothing else changed).

No auto-fixed bugs and no scope creep.

## Known Stubs

None. The intermediate state is intended per the plan: apply still treats `world_gen` and `creation_class` as one-shot replies, and the enqueue paths still build one-shot inputs; the fill builders tolerate that. Plans 43-08 and 43-13 move apply and enqueue to the stages; nothing is published before 43-15.

## Threat Flags

None. T-43-12 (every stage-1 fact passes through `w()`/`wm()`; hostile-world test and tolerance tests pass), T-43-13 (all schemas all-required, lint clean, 0 optional and at most 3 union parameters) and T-43-14 (pronoun guard and pinned sentences) are mitigated and unit-tested. No new endpoint or trust boundary.

## Notes for later plans

- Plan 43-05 owns the four red files above, the indicator entries, the budget and retry route sets, and the `claude_request` fixture and snapshots; the new routes should be added to the smoke-warming set there.
- Plans 43-08 and 43-13: the start location is always safe (no isSafe in the schema); the first NPC always stands in the start location (no locationName); fill NPCs may use the arrival point's exact name as locationName, and the fill prompt asks for at least one new location to connect to the arrival point by exact name.
- Plan 43-10 still moves effort and max_tokens into the tuning module; `route()` and `DEFAULT_EFFORT` were kept as they were.

## Self-Check: PASSED

- Commits `ac06fcc6` and `f93e9838` exist on master.
- All nine modified files exist and are committed; `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` were never staged.
