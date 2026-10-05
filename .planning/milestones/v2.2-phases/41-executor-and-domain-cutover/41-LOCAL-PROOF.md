# Phase 41 Local Live Proof

Status: deferred by user (human_needed)

Date: 2026-09-30

## Summary

The local live proof against real Claude has NOT been run. It is not passed and not failed; it is outstanding. The user decided on 2026-09-30, verbatim: "we can skip the live proof for now".

What was done: Plan 41-16 Task 1 (the user sets the Anthropic key locally) is complete. Nothing after it ran. No Claude call, no live harness run and no smoke test were made. The key is stored in the local module, so the state is "key set, nothing proven".

## Key status

Read from `llm_admin_state` only (it holds no key), checked by the orchestrator after the user ran `node scripts/llm/set-key.mjs`:

| Field | Value |
|---|---|
| keySet | true |
| keyLength | 108 |
| keyValid | false (unverified; only a passing `smoke_test` route sets it) |
| last smoke | none |

The key script printed `set_api_key: HTTP 200 (positional arguments)` and `key stored: yes (len 108)`.

Spend state at the time of the decision: `llm_job` empty, `llm_call_log` count 0, `llm_spend` empty. Zero spend so far.

## Smoke results

Not run.

## Domain results

Not run. The seven steps (creation race, creation class, world gen with the tab-close check, NPC conversation, combat narration, renown perk, skill offer) and the Plan 41-18 pronoun check on real replies are all outstanding.

## Usage and cost

Not measured. No paid call has been made. The module caps still apply once play starts: $1.00 and 200 calls per player per UTC day, 3 active jobs per player and a $2.00 phase ledger.

## Dispatch and latency

Not measured.

## Bundle check

Not run in this plan.

## Anomalies

- The key stays stored in the local module. Local play will make real Claude calls, inside the module caps above.
- Cosmetic follow-up: running `set-key.mjs` printed Node warning `[MODULE_TYPELESS_PACKAGE_JSON]` for `spacetimedb/src/helpers/measurement.ts`, suggesting `"type": "module"` in `spacetimedb/package.json`. Not acted on (changing the module package type is outside this plan).

## How to resume later

From the repo root, with the local server running and the module published:

1. Optional re-check of key status: `spacetime sql --server local uwr "SELECT * FROM llm_admin_state"`.
2. Smoke test: `spacetime call uwr llm_smoke_test --server local`, wait about a minute, then read `lastSmokeJson` from `llm_admin_state`. Expect six `ok` entries and `keyValid` true.
3. Paid harness, with `PROVE_LIVE_DRY` unset: `pnpm exec vitest run --config scripts/llm/vitest.live.config.ts`. At most two paid runs in total.
4. Read `SELECT * FROM llm_call_log`, `SELECT * FROM llm_admin_state` and `SELECT * FROM llm_spend` and check the ledger stays under 2,000,000 micro-USD.
5. `pnpm build`, then confirm `grep -rc "api.anthropic.com" dist/ | grep -v ":0"` prints nothing.
6. Record the redacted results here and in `41-live-results.json`.

Never read `spacetimedb/.env.local`, print the key or the CLI token, or query `llm_config`.
