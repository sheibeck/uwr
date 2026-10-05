---
phase: 40-claude-request-layer-and-job-seam
verified: 2026-09-30T07:00:00Z
status: passed
score: 5/5 roadmap success criteria verified (plus 8/8 requirement IDs accounted for)
behavior_unverified: 0
overrides_applied: 0
re_verification: false
gaps: []
deferred:
  - truth: "Legacy call sites still name gpt-5.4 / gpt-5-mini (index.ts:475,604,664,893; helpers/combat_narration.ts:172; reducers/npc_interaction.ts:99; reducers/llm.ts:38) and still use the public llm_task and proxy path"
    addressed_in: "Phase 41 (domain cutover), Phase 42 (llm_task removal)"
    evidence: "40-CONTEXT: 'No live call path changes in Phase 40'; model_literals.test.ts pins these as a shrinkable legacy allowlist; ROADMAP Phase 41 goal moves every domain to the server-side executor"
  - truth: "A renown perk job actually reaches Claude (REQUIREMENTS PIPE-08 wording 'actually reaches the LLM')"
    addressed_in: "Phase 41"
    evidence: "ROADMAP SC5 for Phase 40 is 'A renown rank-up enqueues a valid job'; the executor that sends it is Phase 41. The Phase 40 seam test drives it end to end through a reference driver."
human_verification: []
---

# Phase 40: Claude Request Layer and Job Seam Verification Report

**Phase Goal:** Every Claude call in the codebase is built, parsed, queued and applied through one tested, executor-agnostic layer with private job storage, so the executor phase only has to plug in a way to send the request.
**Verified:** 2026-09-30
**Status:** passed
**Re-verification:** No, initial verification

## Independent Evidence Gathered This Session

| Check | Command | Result |
| ----- | ------- | ------ |
| Full unit suite | `CI=true pnpm --dir spacetimedb exec vitest run --maxWorkers=1` | 34 files, 1454 tests, all passed (re-run by the verifier) |
| Module build | `spacetime build -p spacetimedb` | "Build finished successfully" |
| Toolchain privacy (SEC-01) | `spacetime generate --lang typescript --out-dir <tmp> -p spacetimedb`, then list `*llm*` | Produces `llm_task_table.ts`, `my_llm_jobs_table.ts` and reducer bindings. Does NOT produce `llm_job_table.ts`, `llm_call_log_table.ts` or `llm_config_table.ts`. Tmp dir deleted. |
| Committed bindings | `ls src/module_bindings | grep llm`; commit fdbe37e6 | `my_llm_jobs_table.ts` present; no `llm_job`/`llm_call_log`/`llm_config` table binding |
| Typecheck gate | `npx tsc --noEmit --pretty false -p spacetimedb` | 237 output lines. Zero errors in any file created or modified by this phase except `src/index.ts`, which has exactly 11 errors (at the limit; the two lines touching this phase's area, 351 `sweep_llm_errors` and 908 `submit_llm_result`, are the reducer-options typing pattern that existed before) |
| Debt markers | grep `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` over phase files | None found |
| Existing validators untouched | `git diff 61421c00..HEAD -- helpers/skill_gen.ts helpers/world_gen.ts data/llm_prompts.ts` | Empty diff (validators and legacy prompts unchanged) |
| Secrets | `.env.local` not read; `git ls-files | grep env.local` | 0 tracked |

The local publish (plan 40-09) could not be re-run: the local server is stopped and the task forbids publishing. It is evidenced by 40-09-SUMMARY (publish output showed `Created` for `llm_job`, `llm_call_log`, `my_llm_jobs`; no `--clear-database`, no maincloud) and by the committed regenerated bindings, which the verifier confirmed match an offline regeneration.

## Goal Achievement: ROADMAP Success Criteria

| # | Success criterion | Status | Evidence |
| - | ----------------- | ------ | -------- |
| 1 | One model constant (`claude-sonnet-5-5`); effort, `max_tokens`, timeout, schema from one route table; pure builder produces valid bodies for every route (explicit effort, required `max_tokens`, no forbidden params); parser reads first `text` block and treats `max_tokens` and `refusal` as failures; tests fail on any other model ID, unset effort or forbidden parameter | VERIFIED | `data/llm_models.ts` is the only non-test file containing `claude-sonnet-5-5` (repo grep). `data/llm_routes.ts`: 8 routes, `LLM_ROUTES` deep-frozen, `effort: 'low'`, locked `maxTokens` (8192 / 4096 x3 / 2048 / 1024 x2 / 256), `timeoutMs` at most 150 s (< 180 s cap), `validateRoutes` checks model, effort, maxTokens, timeout, json-needs-schema, cache flags. `helpers/claude_request.ts`: `buildClaudeRequest` builds a fresh body in fixed key order (`model, max_tokens, system, messages, output_config`) and calls `assertValidClaudeBody`, which rejects any non-allowlisted top-level key, all 11 `FORBIDDEN_BODY_KEYS` (temperature, top_p, top_k, thinking, budget_tokens, tool_choice, tools, ...) at any depth outside the schema payload, a wrong model, a missing effort or max_tokens, an assistant message (prefill), more than 4 cache breakpoints. `classifyClaudeResponse` uses `findFirstTextBlock` (first block by type, not `content[0]`), maps `max_tokens` to `truncated`, `refusal` to `refusal`, any non-`end_turn` stop to `unexpected_stop`, and covers auth, billing (both spend-cap forms), rate_limit with `retry-after`, overloaded, server, bad_request, timeout, network, empty_output, invalid_json, schema_mismatch; all four usage fields and request-id extracted. Guard test `data/model_literals.test.ts` passes on the real repo with the pinned legacy allowlist. All in the 1454-test green run. |
| 2 | Every JSON route uses `output_config.format` with a schema that passes the subset linter (region included); v2.0 validators still reject out-of-range and over-budget model output | VERIFIED | `buildClaudeRequest` emits `output_config.format = { type: 'json_schema', schema }` for json routes (creation_race, creation_class, world_gen, skill_gen, renown_perk_gen) and effort only for text routes; `assertValidClaudeBody` throws if a json route lacks the format or a text route carries one. `helpers/schema_lint.ts` (additionalProperties, anyOf, forbidden keywords, 24 optional / 16 union limits) is run over all five frozen schemas in `data/llm_schemas.test.ts` including `REGION_GENERATION_SCHEMA`. Validators: `helpers/skill_gen.ts`, `helpers/world_gen.ts` and the legacy prompts have an empty diff over the phase; `submit_llm_result.characterization.test.ts` pins clamp-to-budget, unknown kind to damage, mana cast floor, dot duration floor, enemy level band clamp, retry on missing locations, and a Claude-shaped skill reply with explicit nulls. |
| 3 | Prompts layered into a stable cacheable prefix (Keeper Bible plus route block) then a volatile tail; player text only inside delimiter tags, including injection-style input | VERIFIED | `system = [KEEPER_BIBLE, routeBlock]`, each with `cache_control: ephemeral`; the only per-call text is the single user message. `data/llm_layers.ts`: `wrapPlayerInput` / `wrapPlayerName` truncate by code points, replace lone surrogates and escape every `<` and `>` so no `<player_input>` variant can be forged (`PLAYER_INPUT_TAG_PATTERN` used in tests); creation_race description, NPC message and character names are the tagged fields; world data goes through `sanitizeWorldData` (angle-escaped, never tagged). `ROUTE_BLOCKS` is a frozen static record. Keeper Bible is 7,421 chars (about 2,283 tokens) with the `<player_input>` rule and banned phrases. `llm_layers.test.ts` and `keeper_bible.test.ts` cover the injection matrix and byte-stability; `claude_request.test.ts` asserts `system` and `output_config` byte-identical across hostile volatile inputs. |
| 4 | Job, prompt, config and call-log tables private (test asserts none `public: true`); player job-status view returns only own jobs, no prompt or output text; enqueueing the same action twice for one identity yields exactly one job | VERIFIED | `schema/tables.ts`: `LlmConfig` (no `public`), `LlmJob` and `LlmCallLog` (no `public`, indexes declared in OPTIONS with `algorithm: 'btree'`). `schema/llm_privacy.test.ts` asserts the recorded tables are private and that the public `llm_*` set is exactly `['llm_task']` (legacy, removed in Phase 42 per CONTEXT). No prompt table exists by design (built prompts are never stored; CONTEXT correction). `views/llm.ts`: `my_llm_jobs` is `ctx.db.llm_job.by_player.filter(ctx.sender)` (no `.iter()`), projected to exactly six keys (`id, route, status, createdAt, errorCode, userMessage`), `errorCode` reduced to a coarse bucket (review fix WR-01). Toolchain check above confirms clients get only `my_llm_jobs_table.ts`. `helpers/llm_queue.ts` `enqueueLlmJob`: looks up `by_dedupe_key` (JSON array key `[playerHex, route, sourceKey]`), returns the existing job (`created: false`) when its status is pending, in_flight or received; terminal jobs allow a new one; `llm_queue.test.ts` covers two distinct identity objects with the same hex, different key/route/identity, terminal-status reuse and the 64,000/64,001 size boundary. |
| 5 | A renown rank-up enqueues a valid job instead of hitting the swallowed insert error (regression test fails on the old shape); LLM paths run offline via a mock procedure context with fake `ctx.http` and a `withTx` that rejects promises and can be re-invoked | VERIFIED | `helpers/renown.ts` `triggerRenownPerkGeneration` now calls `enqueueLlmJob` (route `renown_perk_gen`, `SOURCE_KEYS.renownPerk(characterId, rank)`), with no `llm_task` reference and no swallowing try/catch; the old code (`git show 2e42e309^`) inserted `llm_task` with non-columns `completedAt`, `resultText`, `errorMessage` and read the nonexistent `character.raceName`, inside a try/catch that fell back silently. The RED commit 2e42e309 added the regression test before the fix (RED run recorded in 40-07-SUMMARY); `renown_llm.test.ts` asserts one valid pending job, no legacy task row, per-rank idempotency, and the static-pool fallback only when no identity resolves. `helpers/test-utils.ts` `createMockProcCtx`: no `ctx.db`, scripted FIFO `http.fetch` (throws a "timed out" error for `{ throw: 'timeout' }` and a clear error when the script is exhausted), `withTx` that throws if the callback returns a Promise, rolls back on throw, and re-invokes `1 + withTxReinvoke` times with table state restored between runs, controllable clock, module-identity sender. `helpers/llm_seam.test.ts` drives a renown job through a reference driver (read job and key in one `withTx`, fetch outside any transaction, persist in a second, apply in a third) and asserts three perks (not six under re-invoke), one fetch, `timeout`/`rate_limit`(`retryAfterSeconds` 7)/`refusal`/`truncated` paths, and zero key leaks in any table. |

**Score:** 5/5 roadmap success criteria verified.

## Plan must_haves cross-check (spot-verified against code, not SUMMARY)

| Plan | Key must_have | Status | Evidence |
| ---- | ------------- | ------ | -------- |
| 40-01 | `createMockProcCtx` shape, sync-only `withTx`, rollback, re-invoke; schema recorder | VERIFIED | `test-utils.ts:232-` read in full; `schema_recorder.ts` present with tests |
| 40-02 | single model constant, 8 routes, locked values, 5 linted schemas, literal guard | VERIFIED | `llm_models.ts`, `llm_routes.ts`, `llm_schemas.ts`, `schema_lint.ts`, `model_literals.test.ts` |
| 40-03 | Keeper Bible, neutralizer, route blocks, volatile builders | VERIFIED | `keeper_bible.ts` (9,184 bytes source), `llm_layers.ts` |
| 40-04 | private tables, `enqueueLlmJob` dedupe, `logLlmCall` | VERIFIED | `tables.ts:2132-2190`, `llm_queue.ts` |
| 40-05 | characterization of unchanged `submit_llm_result`, validator retention | VERIFIED | `submit_llm_result.characterization.test.ts` plus snapshot pass unmodified (CI=true) after extraction |
| 40-06 | builder, parser, classifier, fixtures | VERIFIED | `claude_request.ts`, fixtures dir including WR-02 fixture |
| 40-07 | `my_llm_jobs`, `keeperMessageForJob`, renown fix | VERIFIED | `views/llm.ts`, `views/index.ts` registers `registerLlmViews`, `llm_status.ts`, `renown.ts` |
| 40-08 | `llm_apply.ts` extraction; wrapper at most 30 lines; no sender read | VERIFIED | `index.ts:908-929` is 22 lines (find task, 3 `SenderError` guards, status update, `applyLlmFailure` / `applyLlmResult`); `grep sender llm_apply.ts` matches only the doc comment (line 7); `applyLlmResult` ignores unknown domains such as `smoke_test`; `toApplyJob` maps both row shapes |
| 40-09 | reference-driver seam test, phase gate, local publish, bindings | VERIFIED (publish by evidence) | 14 seam tests; build and generate re-run offline; bindings committed in fdbe37e6 |
| 40-10 | user approval of Keeper Bible tone, no auto-approval | VERIFIED | 40-10-SUMMARY records verbatim reply "Approved"; `keeper_bible.ts` has a single commit (c5187b27) so it is byte-identical to the approved draft; the orchestrator confirms the user's explicit reply on 2026-09-30 |

### Prohibition (40-10, judgment-tier)

"MUST NOT treat the tone sign-off as given without an explicit user reply." Verdict: not violated. This is a judgment-tier item, so my verdict is non-authoritative, but it is backed by a recorded verbatim user reply ("Approved") and the orchestrator's independent confirmation. Flag for the record: `unverified-prohibition` does not apply (resolved by human reply); no residual review needed.

## Requirements Coverage

All 8 IDs appear in the PLAN frontmatter `requirements:` fields and in REQUIREMENTS.md (traceability table rows for Phase 40). No orphaned Phase 40 requirements in REQUIREMENTS.md.

| Requirement | Source plans | Status | Evidence |
| ----------- | ------------ | ------ | -------- |
| CLAUDE-01 (one model constant, one route table) | 40-02 | SATISFIED | `llm_models.ts`, `llm_routes.ts`, literal guard. Legacy `gpt-*` call sites intentionally remain until Phase 41 cutover (deferred, allowlisted and pinned) |
| CLAUDE-02 (pure builder and parser) | 40-06 | SATISFIED | `claude_request.ts`; `claude_request.test.ts` with 14 response classes |
| CLAUDE-03 (structured outputs with linted schemas, validators retained) | 40-02, 40-05 | SATISFIED | five linted schemas, `output_config.format`, validator tests |
| CLAUDE-04 (layered prompts, tagged player text) | 40-03, 40-06, 40-10 | SATISFIED | see SC3; human tone sign-off recorded |
| PIPE-03 (two tabs, no duplicate call) | 40-04, 40-07 | SATISFIED for the queue seam | dedupe in `enqueueLlmJob`; legacy `llm_task` paths do not dedupe until each domain is cut over in Phase 41 |
| PIPE-08 (renown insert bug fixed, regression test) | 40-07, 40-09 | SATISFIED for the Phase 40 contract | valid job enqueued, regression test fails on old shape; the job reaching Claude needs the Phase 41 executor (deferred) |
| SEC-01 (private tables, own-status view) | 40-01, 40-04, 40-07, 40-08, 40-09 | SATISFIED for new tables | see SC4. The legacy public `llm_task` (prompts visible) is deliberately left for Phase 42 per CONTEXT and pinned by the privacy test as exactly `['llm_task']` |
| QUAL-04 (offline mock procedure context, tests) | 40-01, 40-05, 40-08, 40-09 | SATISFIED | `createMockProcCtx`, characterization, seam test; 1454 tests green |

REQUIREMENTS.md checkboxes for these eight IDs are still `[ ]` and the traceability status is "Pending". The orchestrator should mark them per its close-out process; PIPE-08 and SEC-01 carry the Phase 41/42 caveats above.

## Key Links

| From | To | Status | Details |
| ---- | -- | ------ | ------- |
| `llm_routes.ts` | `llm_schemas.ts` / `llm_models.ts` | WIRED | imports and uses `CLAUDE_MODEL` and the five schemas |
| `claude_request.ts` | `llm_routes` / `keeper_bible` / `measurement` | WIRED | `LLM_ROUTES[route]`, `KEEPER_BIBLE`, `redactSecrets` |
| `renown.ts` | `llm_queue.enqueueLlmJob` | WIRED | called in `triggerRenownPerkGeneration`; row validated against recorded columns in tests |
| `views/index.ts` | `views/llm.ts` | WIRED | `registerLlmViews` registered; generated `my_llm_jobs_table.ts` proves it compiles into the module |
| `index.ts submit_llm_result` | `llm_apply.ts` | WIRED | thin wrapper calling `toApplyJob`, `applyLlmFailure`, `applyLlmResult` |
| `llm_apply.applyRenownPerkResult` | `pending_renown_perk` | WIRED | proved by the seam test (three rows per rank) |
| Request layer | live call path | INTENTIONALLY NOT WIRED | Phase 41 executor consumes `buildClaudeRequest` / `classifyClaudeResponse` / `enqueueLlmJob`; CONTEXT locks "no live call path changes in Phase 40" |

## Data-Flow (Level 4)

Not applicable to UI. The one dynamic-data artifact, `my_llm_jobs`, reads real `llm_job` rows through the `by_player` index and projects them (`llm.test.ts` covers own-jobs-only, empty result, exact six keys). The client does not yet consume the view (Phase 42 `useLlmStatus`, deferred by CONTEXT).

## Anti-Patterns Found

None blocking. No `TBD`, `FIXME`, `XXX`, `TODO`, `HACK` or `PLACEHOLDER` in phase files. No stub returns in the new modules. Info items from 40-REVIEW (IN-01 to IN-12; for example IN-07 dedupe blocks forever on a stuck active job until the Phase 41 sweeper, IN-06 `resolveCharacterPlayerId` may pick a non-acting identity, IN-08 static-fallback duplication) are carried forward to Phase 41 as agreed and do not affect any Phase 40 success criterion.

## Notes for the Orchestrator

1. The local `uwr` database was published at plan 40-09. Review fixes WR-01 to WR-05 landed afterwards (view body logic, classifier, queue, test utils). None changed a table or view row type, so no schema publish is required; Phase 41's next local publish picks them up.
2. `spacetime build` printed "tsc not found in node_modules" as a warning, then finished successfully. This is environmental and was pre-existing.
3. Deferred, not gaps: legacy `gpt-*` literals and the public `llm_task` and proxy path (Phase 41 and 42); the executor that sends the renown job (Phase 41); client `useLlmStatus` wiring (Phase 42).

## Gaps Summary

No gaps. All five ROADMAP success criteria are met by code that exists, is wired, and is exercised by passing tests (re-run by the verifier: 34 files, 1454 tests), the module builds, the toolchain-generated client bindings expose only `my_llm_jobs` (not `llm_job`, `llm_call_log` or `llm_config`), the typecheck gate holds, and the Keeper Bible tone has a recorded explicit human approval.

---

_Verified: 2026-09-30_
_Verifier: Claude (gsd-verifier)_
