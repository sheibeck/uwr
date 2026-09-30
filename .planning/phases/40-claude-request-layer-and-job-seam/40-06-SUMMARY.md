---
phase: 40-claude-request-layer-and-job-seam
plan: 06
subsystem: llm
tags: [anthropic, sonnet-5-5, request-builder, response-classifier, prompt-caching, structured-outputs, vitest, fixtures]
requires:
  - phase: 40-02
    provides: CLAUDE_MODEL / ANTHROPIC_VERSION, LLM_ROUTES (max_tokens, effort, timeout, schema)
  - phase: 40-03
    provides: KEEPER_BIBLE, ROUTE_BLOCKS, buildRouteLayers (volatile tail)
  - phase: 40-01
    provides: makeSyncResponse (fixtures become responses), schema_recorder conventions
provides:
  - buildClaudeRequest(route, { routeBlock, volatile }) -> { body, bodyText, timeoutMs }
  - buildClaudeHeaders(apiKey) (the only use of the key)
  - assertValidClaudeBody, ALLOWED_TOP_LEVEL_KEYS, FORBIDDEN_BODY_KEYS, MAX_CACHE_BREAKPOINTS
  - classifyClaudeResponse, classifyClaudeError, findFirstTextBlock, extractUsage, RETRYABLE_CLASSES, CLAUDE_MESSAGE_MAX_CHARS
  - 31 docs-derived response fixtures under helpers/__fixtures__/claude/
affects: [40-07, 40-08, 40-09, 40-10, 41, 43, 44]
tech-stack:
  added: []
  patterns:
    - "Pure builder constructs a FRESH body in a fixed key order, then runs a runtime guard before returning"
    - "Forbidden-key deep scan that skips output_config.format.schema (schemas are data)"
    - "Redact first, then cap by code point, so a cut can never leave half a key"
    - "Classifier never throws: every unexpected shape maps to a failure class"
key-files:
  created:
    - spacetimedb/src/helpers/claude_request.ts
    - spacetimedb/src/helpers/claude_request.test.ts
    - spacetimedb/src/helpers/__snapshots__/claude_request.test.ts.snap
    - spacetimedb/src/helpers/__fixtures__/claude/ (31 JSON files)
  modified: []
key-decisions:
  - "RETRYABLE_CLASSES is a frozen array (not a Set) so it is genuinely immutable; membership via includes"
  - "retryAfterSeconds is only populated for retryable classes (rate_limit, overloaded, server) and only from a numeric retry-after; an HTTP-date form is treated as absent"
  - "The spend-cap 429 is recognised by error.details.error_code alone (enforced_spend_limit_reached); absence of retry-after is descriptive, not required"
  - "An unknown or absent stop_reason on a 200 is not a failure by itself: the text block decides (stopReason reported as end_turn when absent)"
  - "HTML error bodies (502) are never echoed into the message; the message carries status and error type/message only"
  - "Lone surrogates in a message are replaced with U+FFFD before the code-point cap"
patterns-established:
  - "Phase 41's executor: buildClaudeRequest + buildClaudeHeaders to call, classifyClaudeResponse on a response, classifyClaudeError on a throw; retry only when result.retryable"
requirements-completed: []
duration: 15min
completed: 2026-09-29
status: complete
---

# Phase 40 Plan 06: Claude Request Builder and Response Classifier Summary

A pure, executor-agnostic Sonnet 5.5 request builder (fixed-order bodies, cached Bible + route block, volatile tail only in the user message, runtime guard against every forbidden parameter) and a response/error classifier that reads the first text block by type, branches on stop_reason first, and maps every documented Anthropic response or thrown fetch error to one of fourteen failure classes with usage, request-id, and redacted, capped messages. No I/O, no network, nothing published.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Request builder, header builder and body guard | 4d6926d0 | helpers/claude_request.ts, helpers/claude_request.test.ts, helpers/__snapshots__/claude_request.test.ts.snap |
| 2 | Response parser, failure classifier and fixtures | 1e709506 | helpers/claude_request.ts, helpers/claude_request.test.ts, helpers/__fixtures__/claude/*.json (31) |

## Body shape (every route)

Key order `model, max_tokens, system, messages, output_config`. `system` is exactly `[KEEPER_BIBLE, ROUTE_BLOCKS[route]]`, each `{ type: 'text', text, cache_control: { type: 'ephemeral' } }` (no ttl, 2 of 4 breakpoints). `messages` is one user message (the volatile tail). `output_config` is `{ effort: 'low' }` for the three text routes and `{ effort: 'low', format: { type: 'json_schema', schema } }` for the five JSON routes. No temperature, top_p, top_k, thinking, budget_tokens, tool_choice, tools, output_format, response_format, stop_sequences, fallbacks, and no assistant message. `assertValidClaudeBody` enforces all of it (allowlisted top-level keys, deep forbidden-key scan outside the schema, model, positive integer max_tokens, effort in low/medium/high, two text system blocks, one user message, at most 4 cache breakpoints, format present exactly on JSON routes).

## Class-to-retryable table (for Phase 41)

| Class | Retryable | Trigger |
|-------|:---------:|---------|
| rate_limit | yes | 429 (not the spend cap); `retryAfterSeconds` from a numeric `retry-after`, undefined when absent |
| overloaded | yes | 529 |
| server | yes | 500, 502, 504, any other 5xx, a non-JSON 200 or non-JSON error body |
| timeout | yes | thrown error matching `/time(d)?\s?out/i` |
| network | yes | any other thrown value |
| auth | no | 401, 403 |
| billing | no | 402; 400 with the "You have reached your specified ... API usage limits" message; 429 with `error.details.error_code === 'enforced_spend_limit_reached'` |
| bad_request | no | 400, 404, 413, any other 4xx |
| truncated | no | 200 with stop_reason `max_tokens` (usage kept, billed) |
| refusal | no | 200 with stop_reason `refusal` (usage and `stopCategory` kept, billed) |
| unexpected_stop | no | stop_reason `tool_use`, `pause_turn` or `stop_sequence` (usage kept) |
| empty_output | no | no text block, or the first text block is empty or whitespace |
| invalid_json | no | JSON route, first text block is not strict JSON (for example fenced) |
| schema_mismatch | no | JSON route, parsed value is not an object or lacks a top-level `required` key |

Notes for Phase 41: `truncated`, `refusal`, `unexpected_stop`, `empty_output`, `invalid_json` and `schema_mismatch` carry `usage` when the call completed because they were billed; HTTP failures carry no usage. Text routes never JSON-parse (NPC apply keeps its tolerant extractor); `combat_narration` is plain prose.

## Verification

- `pnpm --dir spacetimedb exec vitest run src/helpers/claude_request.test.ts`: 224 passed, run twice, no snapshot written on the second run
- `pnpm --dir spacetimedb test`: 1336 passed across 29 files (baseline 1112)
- `npx tsc --noEmit -p spacetimedb`: no diagnostics in `helpers/claude_request`
- Snapshot has 8 per-route bodies with `<KEEPER_BIBLE>` placeholder; no Bible text in the `.snap`
- `grep -c "spacetimedb/server"` 0; `grep -c "x-api-key"` 1; `grep -c "content\[0\]"` 0; key-shaped grep over fixtures and the test file prints nothing; 31 fixture files
- Model-literal guard still green (no model ID in the new source or tests; fixtures live under the excluded `__fixtures__`)

## Deviations from Plan

**1. [Process] Task commits built from a staged split.** The full module was authored first; for the Task 1 commit the classifier half was temporarily removed so each commit contains only what its tests cover, then restored for Task 2. TDD RED/GREEN were not committed separately (tests run green before each commit), as in Plans 40-01 to 40-05.

**2. [Addition] smoke_test excluded from one assertion.** The hostile-vs-benign "user message differs" check skips `smoke_test` because that route has no per-call input (its volatile tail is constant). The system and output_config byte-identity assertion still runs for it.

No other deviations. No production file changed; nothing published; no network calls.

## Known Stubs

None.

## Threat Flags

None. T-40-03 mitigated (key only in `buildClaudeHeaders`, body never contains it, every classifier message redacted then capped, no key-shaped literal in fixtures or tests). T-40-01 mitigated (volatile tail only in the user message; system byte-identical across hostile and benign input). T-40-18 mitigated (first text block by type, stop_reason first, strict JSON plus required-key check, malformed bodies classify rather than throw). T-40-14 mitigated (allowlist plus deep forbidden-key scan, explicit effort on every route, per-route snapshots).

## Self-Check: PASSED

- FOUND: spacetimedb/src/helpers/claude_request.ts, claude_request.test.ts, __snapshots__/claude_request.test.ts.snap, __fixtures__/claude/ (31 files)
- FOUND commits: 4d6926d0, 1e709506
