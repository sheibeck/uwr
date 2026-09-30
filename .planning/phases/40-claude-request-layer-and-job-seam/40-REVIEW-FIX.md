---
phase: 40-claude-request-layer-and-job-seam
fixed_at: 2026-09-30T06:30:00Z
review_path: .planning/phases/40-claude-request-layer-and-job-seam/40-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 40: Code Review Fix Report

**Fixed at:** 2026-09-30
**Source review:** .planning/phases/40-claude-request-layer-and-job-seam/40-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (WR-01 to WR-05; Info items excluded)
- Fixed: 5
- Skipped: 0

Full suite: `CI=true pnpm --dir spacetimedb exec vitest run --maxWorkers=1` gives 34 files, 1454 tests, all passing (1402 before, plus 52 new). `llm_apply.ts`, `submit_llm_result.characterization.test.ts` and its `.snap` are untouched. `tsc` shows no errors in any touched file. No schema or view row-type change, so no publish is needed.

## Fixed Issues

### WR-01: `my_llm_jobs` exposes the raw failure class to every player

**Files modified:** `spacetimedb/src/helpers/llm_status.ts`, `spacetimedb/src/views/llm.ts`, `spacetimedb/src/views/llm.test.ts`
**Commit:** f116a1bd
**Status:** fixed: requires human verification (security-relevant logic, please confirm the bucket mapping)
**Applied fix:** Added `publicErrorBucket()` (transient for rate_limit, overloaded, server, timeout and network; unavailable for auth and billing; declined for refusal; failed otherwise; undefined when there is no error). `projectMyLlmJob` now sets `errorCode` to the bucket. `userMessage` is still derived from the raw class on the server. The view keeps six fields, the same `string | undefined` type and the index-only lookup, so there is no row-type change. Tests: bucket mapping, no raw class ever appears for all 14 failure classes, and the old assertion that pinned the leak now asserts the bucket. Confirmed that the new view tests fail without the fix.

Note: the client bindings type `errorCode` as an optional string, and nothing in `src/` reads it yet. Phase 41 UI code should treat it as one of `transient`, `unavailable`, `declined` or `failed`.

### WR-02: An unknown `stop_reason` on a 200 is treated as success

**Files modified:** `spacetimedb/src/helpers/claude_request.ts`, `spacetimedb/src/helpers/claude_request.test.ts`, `spacetimedb/src/helpers/__fixtures__/claude/model_context_window_exceeded.json` (new fixture)
**Commit:** 1ca71996
**Status:** fixed: requires human verification (classification logic)
**Applied fix:** After the `refusal` and `max_tokens` branches, any `stop_reason` other than `end_turn` is now `unexpected_stop`, keeping `stopReason`, `usage` and `requestId`. Decision on a missing or non-string `stop_reason`: it is also `unexpected_stop` with the message "response had no stop_reason", because a non-streaming 200 always carries one and its absence means the text cannot be trusted as complete. The old `?? 'end_turn'` default is gone. Tests: new fixture and CASES entry (text and JSON routes), an allowlist test with `some_future_reason`, `END_TURN` and an empty string, and a missing, null or non-string case. Five new tests fail without the fix.

### WR-03: `logLlmCall` throws on a non-finite counter

**Files modified:** `spacetimedb/src/helpers/llm_queue.ts`, `spacetimedb/src/helpers/llm_queue.test.ts`
**Commit:** ea7d28ef
**Applied fix:** `toU64` maps any non-finite input to 0 before `BigInt`. It also clamps huge finite values to `Number.MAX_SAFE_INTEGER`, since `BigInt(1e300)` would exceed u64 in a real insert. Tests cover `NaN`, `Infinity`, `-Infinity`, a negative value and a huge finite value. `NaN`, `Infinity` and the huge-value case fail without the fix. `-Infinity` already passed, because `Math.max(0, -Infinity)` is 0.

### WR-04: `createMockDb` accepts any index name and silently no-ops on missing rows

**Files modified:** `spacetimedb/src/helpers/test-utils.ts`, `spacetimedb/src/helpers/schema_recorder.ts`, `spacetimedb/src/helpers/llm_queue.test.ts`, `spacetimedb/src/helpers/llm_seam.test.ts`, `spacetimedb/src/helpers/renown_llm.test.ts`, `spacetimedb/src/views/llm.test.ts`, `spacetimedb/src/helpers/test-utils.strict.test.ts` (new)
**Commit:** b3cac1dd
**Applied fix:** Opt-in strict mode, default OFF. Use `createMockDb(seed, { strict: true })`, `createMockCtx({ strict: true })` or `createMockProcCtx({ strict: true })`.
- `schema_recorder.ts` gains `strictTableSpec(table)`, which builds the accessor allowlist from the recorded `opts.indexes` (accessor to first column) plus primary-key and unique columns.
- In strict mode, an unknown table or an unknown accessor throws, and an index `update` that matches no row throws. `delete` of a missing row stays a no-op, matching the real return-false behavior. The strict index accessors also use the real declared column rather than the `<X>Id` guess.
- The lenient default is unchanged. Symbol-property handling was added only inside strict mode.
- `llm_queue`, `llm_seam`, `renown_llm` and `views/llm` tests are opted in. Each loads `../schema/tables` in `beforeAll` so the recorder has the schema.
- New `test-utils.strict.test.ts` (14 tests) proves that strict mode rejects an unknown accessor, an accessor from another table, a non-key column, an unknown table and a missing-row update. It also proves the lenient defaults are unchanged. As a sanity check, temporarily changing `by_player` to `by_playerz` in `views/llm.ts` made 7 view tests fail with a clear message. The file was restored.
- Result: all four opted-in suites passed under strict mode, so no production bug (wrong index name and so on) was exposed in Phase 40 files.

### WR-05: One test cannot fail; two guards are weak

**Files modified:** `spacetimedb/src/helpers/claude_request.test.ts`, `spacetimedb/src/data/model_literals.test.ts`, `spacetimedb/src/helpers/llm_apply.test.ts`
**Commit:** 7afbc65a
**Applied fix:**
- The vacuous "body never contains the key" test now also asserts that the headers carry the key, then that the body has neither the key nor `x-api-key`. A small control test was added.
- The `http.fetch(` guard is now `usesFetch()`, which matches `\bfetch\s*\(`, `["fetch"]` bracket access, `ctx.http` or `ctx["http"]` access, and `{ http } = ctx` destructuring. It runs over all non-test production files under `spacetimedb/src`, exempting only `helpers/test-utils.ts` (the fake fetch). It has synthetic flag and no-flag cases. The real repository scan is still clean.
- The sender guard is now `readsSender()`. It catches `ctx.sender`, `ctx["sender"]` and `{ sender } = ctx` or `tx`, including multi-line destructuring, with synthetic cases. `llm_apply.ts` itself is unchanged and still clean.

## Deviations and notes

- **No worktree.** The agent spec asks for an isolated worktree. I worked in the main tree instead, because `spacetimedb/node_modules` is gitignored and a fresh worktree could not run vitest or tsc. Each commit staged explicit paths only. `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` were never staged and remain uncommitted.
- **Full-suite OOM.** Two of four full-suite runs died with a V8 "Fatal process out of memory: Zone" error (the machine is low on virtual memory). The third full run passed in full. Every test file also passed when run individually and by directory, and the per-file totals sum to 1454.
- **Info findings not touched.** IN-01 through IN-10 are out of scope, as instructed.

---

_Fixed: 2026-09-30_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
