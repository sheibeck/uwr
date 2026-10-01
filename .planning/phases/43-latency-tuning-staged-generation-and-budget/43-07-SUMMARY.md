---
phase: 43-latency-tuning-staged-generation-and-budget
plan: 07
subsystem: api
tags: [spacetimedb, llm, admin, slash-commands, stats, kill-switch, daily-ceiling, vitest]
status: complete

requires:
  - phase: 43-latency-tuning-staged-generation-and-budget
    provides: aggregateLlmStats, formatLlmStatsText, formatMicroUsd, LlmLedgerSummary (43-02); llmGate, setLlmEnabled, dailyCeilingProblem, setDailyCeiling, getPhaseLedger, ledgerDaySpent, utcDay (43-01); ten-route LLM_ROUTE_NAMES (43-04)
provides:
  - /llm stats, /llm on, /llm off and /llm ceiling <dollars> in the narrative input (admin only)
  - helpers/llm_admin_commands.ts (parseLlmCommand, parseDollarsToMicroUsd, buildLlmStatsText, handleLlmAdminCommand, LLM_ADMIN_REFUSAL_LINE, LLM_COMMAND_USAGE)
  - submit_command dispatch of /llm before the generic command insert
affects: [43-08, 43-15]

tech-stack:
  added: []
  patterns:
    - "Slash-path admin gate: ADMIN_IDENTITIES.has(ctx.sender.toHexString()) plus fail() refusal, never the throwing requireAdmin"
    - "Reducer scan (llm_call_log.iter once) instead of a view, because views cannot scan"

key-files:
  created:
    - spacetimedb/src/helpers/llm_admin_commands.ts
    - spacetimedb/src/helpers/llm_admin_commands.test.ts
    - spacetimedb/src/reducers/llm_commands.test.ts
  modified:
    - spacetimedb/src/reducers/commands.ts

key-decisions:
  - "A malformed /llm form (extra words, ceiling with no amount) is 'help' rather than null, so it never falls through to the generic command row"
  - "A ceiling that is not a strict decimal answers with the usage line; a well-formed one outside $0.01 to $1,000.00 answers with the dailyCeilingProblem text; both through fail() and neither writes"
  - "Admin is decided from ctx.sender only; character ownership is still enforced first by requireCharacterOwnedBy"

patterns-established:
  - "Stats text gets every row field it needs from llm_call_log columns route, outcome, latencyMs, costMicroUsd, createdAt only; identities, error text and request ids are never read"

requirements-completed: []  # OPS-02 and COST-03 console half delivered; standing rule: no requirements mark-complete

coverage:
  - id: D1
    description: "Admin /llm stats prints one plain system message with every route in order (zeros for empty routes), 24 h and all-time figures and the ledger line"
    requirement: OPS-02
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_admin_commands.test.ts#/llm stats"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/reducers/llm_commands.test.ts#/llm stats by the admin"
        status: pass
    human_judgment: false
  - id: D2
    description: "Admin /llm off, /llm on and /llm ceiling 12.50 flip the kill switch and set the ceiling (string math, $0.01 to $1,000.00); invalid amounts write nothing"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_admin_commands.test.ts#handleLlmAdminCommand: an admin"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/reducers/llm_commands.test.ts#/llm on and /llm ceiling work through the reducer"
        status: pass
    human_judgment: false
  - id: D3
    description: "Non-admin gets exactly 'The Keeper does not discuss his accounts with you.' through fail() for every verb and the admin state is unchanged"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_admin_commands.test.ts#handleLlmAdminCommand: a non-admin"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/reducers/llm_commands.test.ts#a non-admin owner of the character"
        status: pass
    human_judgment: false
  - id: D4
    description: "Output has no '[' or '<', no 64-hex identity, no error text or request id even when llm_call_log rows carry them; one llm_call_log scan, llm_config never touched"
    requirement: OPS-02
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_admin_commands.test.ts#/llm stats"
        status: pass
    human_judgment: false
  - id: D5
    description: "/llm is dispatched in submit_command before the command insert; ordinary slash text and /unlockrace behave as before; submit_intent untouched; full root suite green and module builds"
    requirement: OPS-02
    verification:
      - kind: unit
        ref: "CI=true pnpm exec vitest run --maxWorkers=1"
        status: pass
    human_judgment: false

duration: 14min
completed: 2026-10-01
---

# Phase 43 Plan 07: /llm admin console commands Summary

**Admins can type /llm stats, /llm on, /llm off and /llm ceiling 12.50 into the narrative input and get plain-text answers; everyone else hears the Keeper's refusal and nothing changes.**

## Accomplishments

- `helpers/llm_admin_commands.ts`: `parseLlmCommand` (null for non-/llm, `help` for any malformed /llm form), `parseDollarsToMicroUsd` (strict `^\d{1,4}(\.\d{1,2})?$`, bigint math), `buildLlmStatsText` (one `llm_call_log.iter()` scan, ledger from `llm_spend`, ceiling and switch from `llmGate`), and `handleLlmAdminCommand` (admin check on `ctx.sender`, `fail()` refusal for strangers, `setLlmEnabled`, `dailyCeilingProblem` + `setDailyCeiling`, one `system` event per command).
- `reducers/commands.ts`: one import and one line, `if (handleLlmAdminCommand(ctx, character, trimmed)) return;`, placed after the `/unlockrace` branch and before `ctx.db.command.insert`. `submit_intent` and `intent.ts` are untouched.
- Tests: 29 helper tests (parsing, bounds, non-admin for six forms, admin forms, stats content, markup and identity safety, single scan and no `llm_config` access) and 7 captured-reducer tests through the real `submit_command`.

## Sample `/llm stats` output (from a test fixture with a few calls and a seeded ledger)

```
LLM stats by route, last 24 h | all time:
creation_race: 0 calls, $0.0000, p50 0.0s, p95 0.0s, 0 errors, 0 truncated | all time: 0 calls, $0.0000, p50 0.0s, p95 0.0s, 0 errors, 0 truncated
creation_class_reveal: 0 calls, ... (zeros)
creation_class: 0 calls, ... (zeros)
world_gen_start: 3 calls, $0.0534, p50 5.0s, p95 5.2s, 1 errors, 1 truncated | all time: 3 calls, $0.0534, p50 5.0s, p95 5.2s, 1 errors, 1 truncated
world_gen: 0 calls, ... (zeros)
skill_gen: 0 calls, ... (zeros)
npc_conversation: 0 calls, ... (zeros)
combat_narration: 0 calls, ... (zeros)
renown_perk_gen: 0 calls, ... (zeros)
smoke_test: 0 calls, ... (zeros)
npc_reply: 0 calls, $0.0000, p50 0.0s, p95 0.0s, 0 errors, 0 truncated | all time: 1 calls, $0.0005, p50 2.0s, p95 2.0s, 0 errors, 0 truncated
Ledger: all time $0.2310 over 40 calls. Today $0.0712 spent and $0.0050 reserved of a $10.0000 daily ceiling. LLM calls are on.
```

(Zero rows abbreviated here with "... (zeros)"; the real output prints every figure. `npc_reply` is not one of the ten current routes, so it appears after them as an extra route seen in the log, sorted alphabetically.)

Other lines: `LLM calls are off. Players see the resting line; calls already in flight finish.`, `LLM calls are on.`, `Daily LLM ceiling set to $12.5000.`, `Usage: /llm stats, /llm on, /llm off, /llm ceiling 12.50`, `Daily ceiling must be between $0.01 and $1000.00.`, and for non-admins `The Keeper does not discuss his accounts with you.`

## Task Commits

1. **Task 1: /llm command helper** - `b0d1a0dd` (feat)
2. **Task 2: dispatch from submit_command and captured-reducer tests** - `9878daa2` (feat)

## Verification

- `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/helpers/llm_admin_commands.test.ts src/reducers/llm_commands.test.ts`: 36 tests pass.
- Full root suite `CI=true pnpm exec vitest run --maxWorkers=1`: 65 files, 2647 tests, all green.
- `spacetime build -p spacetimedb`: "Build finished successfully" (pre-existing "tsc not found" notice).
- Acceptance greps: 4 exports, 1 `ADMIN_IDENTITIES.has(ctx.sender.toHexString())`, 0 `requireAdmin`, 1 `llm_call_log.iter()`; the dispatch line (296) precedes `ctx.db.command.insert(` (298); `git diff --stat spacetimedb/src/reducers/intent.ts` prints nothing.
- No `spacetime publish`, `call` or `generate` was run; nothing touched the running local stack.

## Deviations from Plan

None in behavior. Process notes:

- **[Process] TDD order.** As in 43-01 and 43-02, tests were written with the implementation and each task is one `feat` commit rather than a test/feat pair.
- **[Process] Parser edge.** The plan sketch used a two-token regex, which would let "/llm a b c" return null and leak into the generic command row. The parser tokenizes instead, so any text starting with the /llm word is handled (help) and only "/llmx"-style text is null.
- **[Process] Test fixture.** `npc_reply` rows in the fixtures are a deliberately non-route name that exercises the "extra routes sorted after the ten" behavior of `aggregateLlmStats`.

## Known Stubs

None.

## Threat Flags

None. T-43-19 and T-43-20 (admin decided from `ctx.sender` only, strangers get the refusal with state proven unchanged for six verbs and through the real reducer), T-43-21 (no `[` or `<` even with hostile row text), T-43-22 (no identity hex, error text or request id; `llm_config` never accessed, asserted through a db access spy) and T-43-23 (strict decimal regex, bigint math, `dailyCeilingProblem` bounds) are mitigated and tested.

## Self-Check: PASSED

- `llm_admin_commands.ts`, `llm_admin_commands.test.ts` and `llm_commands.test.ts` exist and are committed; `commands.ts` is modified and committed.
- Commits `b0d1a0dd` and `9878daa2` exist on master; `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` were never staged.
