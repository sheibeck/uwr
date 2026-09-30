---
phase: 40-claude-request-layer-and-job-seam
reviewed: 2026-09-30T00:00:00Z
depth: standard
files_reviewed: 35
diff_base: bfb388d3
findings:
  critical: 0
  warning: 5
  info: 10
  total: 15
status: issues_found
---

# Phase 40: Code Review Report

**Depth:** standard. **Scope:** 35 files from `git diff bfb388d3..HEAD`. Generated bindings, fixtures and snapshots are excluded.

Targeted suites were run with `--maxWorkers=1` (20 files, 710 tests), and all passed.

## Summary

The security-critical points hold.

- **Own-rows view:** `my_llm_jobs` looks up rows by index only (`by_player.filter(ctx.sender)`) and projects six columns with no payload.
- **Private tables:** `llm_job` and `llm_call_log` are private, and a test guards this.
- **API key:** it appears only as the argument to `buildClaudeHeaders`. There are no key-shaped literals, and test keys are built from fragments.
- **Player input:** `<` and `>` are escaped after truncation, so `<player_input>` tags cannot be forged.
- **Request body:** it follows the Sonnet 5.5 rules (explicit effort and `max_tokens`, no sampling, thinking, prefill or forced tool choice). Schemas are deep-frozen and key order is fixed.
- **`llm_apply.ts`:** the move preserves behavior. Every `ctx.sender` became `job.playerId`. The wrapper still checks `task.playerId === ctx.sender`. No statement was lost and no import is left dangling.

The findings are robustness gaps, one design contradiction in the status view, and weaknesses in the test infrastructure.

## Critical Issues

None.

## Warnings

### WR-01: `my_llm_jobs` exposes the raw failure class to every player

**File:** `spacetimedb/src/views/llm.ts:22-31` (with `spacetimedb/src/helpers/llm_status.ts:11-13`)

**Issue:** `projectMyLlmJob` returns `errorCode: job.errorCode` unchanged. In Phase 41 this field holds the classifier class (`auth`, `billing`, `rate_limit`, `schema_mismatch`).

`llm_status.ts` says account-side failures are "phrased without revealing what is wrong". Yet the `errorCode` field next to that message tells any player that the operator's key was rejected (`auth`) or the account is out of money (`billing`). The test at `views/llm.test.ts:183` pins this leak.

**Fix:** Project a coarse public bucket instead of the raw class:
- `transient` for retryable classes
- `unavailable` for account classes (`auth`, `billing`)
- `declined` for `refusal`
- `failed` otherwise
- undefined when there is no error

Update `views/llm.test.ts:183` to assert the bucket, and assert that no raw class ever appears.

### WR-02: An unknown `stop_reason` on a 200 is treated as success

**File:** `spacetimedb/src/helpers/claude_request.ts:410-440`

**Issue:** Only `refusal`, `max_tokens`, `tool_use`, `pause_turn` and `stop_sequence` are rejected. Anything else falls through.

For example, `model_context_window_exceeded` continues to `findFirstTextBlock`, so on text routes possibly truncated text comes back as `ok: true`. A missing `stop_reason` is silently relabelled `end_turn` (line 437). On JSON routes, truncated output fails as `invalid_json`, which has the wrong retry and billing semantics.

**Fix:** Use an allowlist. Any `stop_reason` other than `end_turn` becomes `unexpected_stop`, keeping `stopReason`, `usage` and `requestId`, except the classes already mapped (`max_tokens` → `truncated`, `refusal` → `refusal`). Decide explicitly how a missing `stop_reason` is handled and test it. Add a fixture and a test case for `model_context_window_exceeded`.

### WR-03: `logLlmCall` throws on a non-finite counter, rolling back the caller's transaction

**File:** `spacetimedb/src/helpers/llm_queue.ts:161` (used at lines 173-178)

**Issue:** `toU64` is `BigInt(Math.max(0, Math.round(n ?? 0)))`. `NaN` and `Infinity` pass through `Math.max` and `Math.round` unchanged, and then `BigInt` throws a `RangeError`. `httpStatus` and `latencyMs` come from callers, and in Phase 41's persist transaction that throw would roll back the job outcome.

**Fix:** Map any non-finite number to 0 before `BigInt`. Add `NaN`, `Infinity` and `-Infinity` cases to `llm_queue.test.ts`.

### WR-04: `createMockDb` accepts any index name and silently no-ops on missing rows

**File:** `spacetimedb/src/helpers/test-utils.ts:41-50` and `99-113`

**Issue:** The mock accepts any `by_*` accessor. Unknown names fall back to a guessed `<X>Id` column (lines 104-105), and any other property returns an index accessor (line 112). A production typo such as `ctx.db.llm_job.by_playerz` passes against the mock and fails at runtime.

`update` and `delete` on a missing row do nothing, whereas real SpacetimeDB `update` throws. The recorder already knows the real index accessors, but `rowColumnProblems` only guards inserts. That leaves the PIPE-08 wrong-name bug class open for reads and updates.

**Fix:** Add an opt-in strict mode to `createMockDb`. Give it a per-table allowlist of accessors, built from the recorder's `recordedTable(name).opts.indexes` plus the primary key, and throw on any other accessor. Make `update` throw when no row matches.

Keep the default behavior for the roughly 20 existing test files, so nothing is broken en masse. Opt the new Phase 40 LLM tests (`llm_queue`, `llm_seam`, `renown_llm`, `views/llm`) into strict mode, and add tests proving that strict mode rejects an unknown accessor and a missing-row update.

### WR-05: One test cannot fail; two guards are weak

**Files:**
- `spacetimedb/src/helpers/claude_request.test.ts:397-403`
- `spacetimedb/src/data/model_literals.test.ts:141-147`
- `spacetimedb/src/helpers/llm_apply.test.ts:230-234`

**Issue:**
- **"the body never contains the key"** calls `buildClaudeHeaders(key)`, then asserts that a body built without the key does not contain it. Nothing links the two, so it cannot fail. The `not.toContain('x-api-key')` half is meaningful. The seam test (`llm_seam.test.ts:357-362`) is the real check.
- **The `http.fetch(` guard** matches only that literal. `const { http } = ctx; http.fetch (`, `ctx["http"].fetch(` and a global `fetch(` all evade it. This is a spend-safety guard.
- **The `ctx.sender` guard regex** `\b(ctx|tx)\s*\.\s*sender\b` misses `const { sender } = ctx` and `ctx['sender']`.

**Fix:**
- Replace the vacuous test with a meaningful one: the body contains neither `x-api-key` nor the key, and the headers contain the key.
- Harden the fetch guard to a `\bfetch\s*\(` pattern over non-test production files.
- Extend the sender guard to catch `{ sender }` destructuring and bracket access.

## Info

These are recorded for Phase 41 and later. Do not fix them in Phase 40 unless trivial.

### IN-01: Pinned pre-existing quirks in `llm_apply.ts` (scheduled for Phase 41)

**File:** `spacetimedb/src/helpers/llm_apply.ts:137-186, 472, 475, 481, 659, 708, 711`

The code was moved verbatim, so these are not regressions:
- **Renown static pool:** `JSON.stringify(perk.effect)` at line 711 throws on bigint, and `BigInt(perk.effect.cooldownSeconds ?? 300)` at line 708 is fragile.
- **Creation replies:** not clamped or checked against the vocabulary (lines 137-186).
- **Quest fields:** `BigInt(effect.targetCount || 1)`, `BigInt(effect.rewardXp ...)` and `BigInt(effect.rewardGold)` throw a `RangeError` on a fractional or non-numeric model value, so the apply rolls back. This is more likely now that NPC is a text route.
- **NPC budget:** `applyNpcConversationResult` charges the budget again at result time (line 659).

**Fix in Phase 41:** use a shared bigint-safe serializer and a clamping `toBigIntSafe`, and deliberately update the pinned snapshots.

### IN-02: `buildClaudeRequest` trusts caller-supplied layers

**File:** `claude_request.ts:176-198`, `110-168`

Nothing checks that `layers.routeBlock === ROUTE_BLOCKS[route]`, that `system[0].text === KEEPER_BIBLE`, or that the user content is a non-empty string. The API rejects empty text blocks that carry `cache_control`.

**Fix:** Derive the route block in the builder, or assert it in a wrapper, and reject empty content.

### IN-03: `classifyClaudeResponse` claims it never throws but calls `res.text()` unguarded

**File:** `claude_request.ts:394-395` (docstring at line 391)

**Fix:** Wrap the call, and classify a read failure as `server`/`network`.

### IN-04: `redactSecrets` in the classifier has no needle parameter

**File:** `claude_request.ts:270-273`

Only `sk-ant-<20+>` shapes are redacted. A key in another format survives in `errorMessage`.

**Fix:** Add an optional `needles` parameter, and pass `[apiKey]` from the Phase 41 executor.

### IN-05: Non-message `llm_call_log` fields are stored unredacted and uncapped

**File:** `llm_queue.ts:181-183`

`outcome`, `stopReason` and `requestId` are stored as given. The risk is low.

**Fix:** Cap at 200 characters and redact.

### IN-06: `resolveCharacterPlayerId` can select a non-acting identity

**File:** `llm_queue.ts:136-144`

If no player has `activeCharacterId === character.id`, it falls back to the first player with the same `userId`. With multiple device identities, the wrong identity may be charged or shown the job.

**Fix:** Document the fallback, and prefer the actor identity when the caller has it.

### IN-07: Dedupe blocks forever on a stuck active job

**File:** `llm_queue.ts:31, 109-111`

`in_flight` and `received` count as active, so a job stuck after an executor crash blocks its source key permanently.

**Fix:** The Phase 41 sweeper must expire stale jobs, and a Phase 41 test should cover it.

### IN-08: The renown static fallback duplicates `llm_apply` logic and is not idempotent

**File:** `renown.ts:117-143` vs `llm_apply.ts:690-720`

`serializePerkEffect` is private to `renown.ts`, so the copy in `llm_apply.ts` still throws. The static path inserts three rows on every call with no existence check. `awardRenown` only triggers on a rank increase, so this is unlikely in practice.

**Fix:** Export and share the serializer, and add an "already pending for this rank" check.

### IN-09: The schema linter does not traverse every schema container

**File:** `schema_lint.ts:51-70`

`allOf`, `oneOf`, `not`, `prefixItems`, `additionalProperties`-as-schema and `if/then/else` are skipped. The current schemas don't use them.

**Fix:** Traverse them too.

### IN-10: Small test-infrastructure and hygiene notes

- `PLAYER_INPUT_TAG_PATTERN` (`llm_layers.ts:50`) is exported with the `g` flag, which makes `.test()` stateful.
- The module-level `recorded` array in `schema_recorder.ts` (lines 40, 113) accumulates duplicates after `vi.resetModules`.
- `skill_gen.ts:33` keeps a private duplicate of `extractJson`.
- The seam test's reference driver never calls `applyLlmFailure`, so failure application is untested through the seam. Add this when Phase 41 promotes the driver.

## Verified-clean checks

- None of the imports removed from `index.ts` are still referenced there.
- `handleCombatNarrationResult` reads only `task.contextJson`, so it is safe with `ApplyJob`.
- The wrapper keeps its owner and pending-status checks.
- All five schemas lint clean, with at most 6 unions and 0 optional fields.
- The privacy tests assert that `llm_job`, `llm_call_log` and `llm_config` are non-public.
- Fixtures and snapshots contain no key-shaped strings.

---

_Reviewed: 2026-09-30 · Reviewer: gsd-code-reviewer (sonnet) · Depth: standard · Saved by the orchestrator from the reviewer's inline report._
