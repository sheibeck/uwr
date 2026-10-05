---
phase: 44
slug: live-verification-and-tone-eval
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-01
---

# Phase 44 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2, at the root (`scripts/**/*.test.mjs`, client) and in `spacetimedb/`. Live files `*.live.ts` run only through `scripts/llm/vitest.live.config.ts` |
| **Quick run command** | `CI=true pnpm exec vitest run --maxWorkers=1 <paths>` (root) / `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 <paths>` (server) |
| **Full suite command** | `CI=true pnpm exec vitest run --maxWorkers=1`. The baseline after Phase 43 is 69 files / 3148 tests |
| **Other gates** | Dry mode of every live harness (no spend); `spacetime build -p spacetimedb`; `pnpm build` (includes the bundle guard) |

Always run a single worker (`--maxWorkers=1`).

## Sampling Rate

- **After every task commit:** run the quick command for the touched files.
- **After every wave:** run the full suite and `spacetime build -p spacetimedb`.
- **Paid or live steps:** run each only after its user-approved checkpoint, and only on the scratch DB `uwr-verify` (44-PLANNING-NOTES item 1).
- **Before verify:** the full suite is green and every dry mode is green. The live checkpoints are recorded as passed, or explicitly deferred by the user.

## Per-Task Verification Map

The planner fills in the task IDs. The map comes from 44-RESEARCH.md §Validation Architecture.

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| QUAL-01 | 27 golden items, with the weights and 5 adversarial items carrying canaries. Requests are valid and byte-stable | unit | `CI=true pnpm exec vitest run --maxWorkers=1 scripts/llm/golden_rules.test.mjs` | ❌ W0 | ⬜ pending |
| QUAL-01 | Each mechanical rule fires on a violation and stays silent on a good reply. The rules cover schema, range, pronouns, injection, leak, out-of-voice refusal and meta-commentary | unit (mutation) | same | ❌ W0 | ⬜ pending |
| QUAL-01 | A recorded run replays clean and passes hygiene. The review page escapes hostile text | unit | same | ❌ W0 | ⬜ pending |
| QUAL-01 | Live golden run, owner tone review and approval | live + manual checkpoint | `GOLDEN_LIVE_RUN=run pnpm exec vitest run --config scripts/llm/vitest.live.config.ts golden` | ❌ W0 | ⬜ pending |
| QUAL-02 | Percentile and reconciliation math (±2%, integer), SQL row mapping, job-id filter | unit | `CI=true pnpm exec vitest run --maxWorkers=1 scripts/llm/call_log_report.test.mjs` | ❌ W0 | ⬜ pending |
| QUAL-02 | Proof steps cover staged routes and `LLM_SMOKE_ROUTES`, the DB allowlist is local-only, and a skipped step counts as a failure | unit | `CI=true pnpm exec vitest run --maxWorkers=1 scripts/llm/proof_rules.test.mjs scripts/llm/cli.test.mjs` | ✅ update | ⬜ pending |
| QUAL-02 | Every domain runs end to end with real Claude on `uwr-verify`, percentiles are recorded, and reconciliation is within ±2% | live + manual checkpoints | `pnpm exec vitest run --config scripts/llm/vitest.live.config.ts prove-live` | ✅ update | ⬜ pending |
| QUAL-03 | 7 classes × lock routes: the in-voice line, lock released, budget refunded, no unwanted retry, no leaked provider words | unit | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/helpers/llm_failure_drills.test.ts` | ❌ W0 | ⬜ pending |
| QUAL-03 | Live drills on `uwr-verify`: 401 with a fake key, ceiling, kill switch, timeout. Each restores state | live checkpoint (free) | `pnpm exec vitest run --config scripts/llm/vitest.live.config.ts drills` | ❌ W0 | ⬜ pending |

## Manual-Only Verifications

| Behavior | Requirement | Why Manual |
|----------|-------------|------------|
| Tone review and overall approval | QUAL-01 | Owner judgment |
| Anthropic Console token totals | QUAL-02 | Only the user can read the Console |
| Maincloud run | QUAL-02 | Maincloud is user-only, and the user deferred it to the end of the milestone |
| Line rotation on screen and the browser network tab | carried over | Need the user's browser |

**Approval:** pending
