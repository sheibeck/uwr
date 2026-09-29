---
phase: 38-platform-upgrade
verified: 2026-09-29T13:40:00Z
status: passed
score: 7/7 must-haves verified (1 via user-accepted override)
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "llm-proxy upgraded (hono, openai 7, wrangler, workers-types) and a `/api/llm` call succeeds under `wrangler dev`"
    reason: "Upgraded proxy was proven to reach OpenAI (real chat.completions call, provider answered 429 'no credits remaining', proxy returned its documented 502 envelope, no worker exception). The 200 is blocked only by the OpenAI account having no credits, an external account issue. User explicitly moved LLM issues (credits/provider/llm-proxy architecture) to a NEW MILESTONE after v2.1."
    accepted_by: "user (sheibeck) via 38-08 checkpoint: 'Approved. I want a new milestone to address the LLM issues.'"
    accepted_at: "2026-09-29"
deferred:
  - truth: "A real `/api/llm` call returns 200 with ok:true under wrangler dev"
    addressed_in: "New LLM-reliability milestone (after v2.1)"
    evidence: ".planning/todos/pending/2026-09-29-new-milestone-llm-reliability.md (seed); related: 2026-09-29-spike-procedure-http-to-retire-llm-proxy.md. Not yet a ROADMAP phase, so recorded as a user-accepted deferral, not a roadmap-matched deferral."
human_verification: []
---

# Phase 38: Platform Upgrade Verification Report

**Phase Goal:** The project runs on current, supported versions of SpacetimeDB and all frameworks, with no behaviour regressions, before further feature work
**Verified:** 2026-09-29
**Status:** passed (SC-4 carried by a user-accepted override, see below)
**Re-verification:** No, initial verification

I did not rely on SUMMARY claims. Installed versions, lockfiles, source, CLAUDE.md, and the build and both test suites were checked directly in this session.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | SpacetimeDB CLI, server SDK, client SDK on 2.10.x; bindings regenerated; publishes locally without `--clear-database` | VERIFIED | `spacetime --version` reports tool and lib 2.10.1. `node_modules/spacetimedb` is 2.10.1 in both root and `spacetimedb/`. `src/module_bindings/index.ts` header says "generated using spacetimedb cli version 2.10.1 (commit 3d760708...)". 38-03 published with `--break-clients` only, no data-deleting flag, and 38-08 shows a no-op publish exit 0 with an empty migration plan. Existing characters survived the migration (human-approved, step 2). |
| SC-2 | Connection error handling works under the 2.10 `onDisconnect`/`onConnectError` change; scheduled-table logic does not rely on strict execution order | VERIFIED | `src/main.ts:33-34` wires `.onDisconnect((_ctx, err) => logDisconnect(err))` and `.onConnectError((_ctx, err) => logConnectError(err))`. `src/connectionLogging.ts` routes an established-connection error (now delivered to `onDisconnect` in 2.10) to `console.warn` with the error, and pre-connect errors to `onConnectError`. Nothing else in `src/` relied on `onConnectError` (grep, only `main.ts`). `src/connectionLogging.test.ts` covers the helpers (3 behavioural tests, passing in the root run). Scheduled-table audit: 16 `scheduled: () =>` tables in `tables.ts`, 16 audit rows in 38-04-SUMMARY, 0 `ScheduleAt.interval`, 0 procedures. I spot-checked `tick_day_night`, `resolve_pull`, and `disconnect_logout` in source. Each is state- or timestamp-guarded and idempotent, matching the audit. Note: the audit is a source audit, not a concurrent-run test. This is proportionate here, since no source change was needed. |
| SC-3 | TypeScript ~6.0 (not 7), vue-tsc 3, Vite 8, plugin-vue 6, Vitest 5 (root and `spacetimedb/`), Vue 3.5 latest | VERIFIED | Installed: typescript 6.0.3, vue-tsc 3.3.11, vite 8.3.1, @vitejs/plugin-vue 6.0.9, vitest 5.0.2 (root and `spacetimedb/`), vue 3.5.43. `package.json` pins `"typescript": "~6.0.3"`. |
| SC-4 | llm-proxy upgraded (hono, openai 7, wrangler, workers-types) and a `/api/llm` call succeeds under `wrangler dev` | PASSED (override) | Upgrade half VERIFIED: hono 4.13.10, openai 7.23.0, wrangler 4.143.0, workers-types 5.20260928.1 installed in `llm-proxy/node_modules`; `llm-proxy/tsc --noEmit` 0 errors; smoke `health 200`, `auth-required 401`, `validation 400` pass on the upgraded stack (`llm-proxy/scripts/smoke.sh`). The "call succeeds (200)" half is not literally met. The real call reached OpenAI through openai 7 and got 429 "no credits remaining", which the proxy surfaced as its 502 envelope with no worker exception. The user explicitly accepted this and moved LLM issues to a new milestone (seed todo exists). This is an external account issue, not a code gap. Recorded here as an override, not silently passed. |
| SC-5 | pnpm is the single package manager: `pnpm-lock.yaml` regenerated, stray root `package-lock.json` removed, `engines.node >=22.12` declared | VERIFIED | `git ls-files '*package-lock.json'` returns nothing and no `package-lock.json` on disk. `pnpm-lock.yaml` tracked in root, `spacetimedb/`, and `llm-proxy/`. `pnpm install --frozen-lockfile` exits 0 in all three (run by me). `engines.node: ">=22.12"` in all three `package.json` files. |
| SC-6 | `pnpm build` and all test suites pass; the game runs locally end to end | VERIFIED | `pnpm run build` (vue-tsc -b && vite build) exit 0. Root `pnpm test`: 19 files, 512/512 (was 513 before WR-03 deliberately removed one source-text test). `pnpm --dir spacetimedb test`: 478/478 on Vitest 5.0.2. End-to-end live run was human-verified and approved in 38-08 (app load, login with existing characters, look, travel, combat and number-key hotbar, `my_*` view panels, html2canvas screenshot under Vite 8). Step 9 (server stop/start disconnect logging) was not reported, and it does not block the criterion. |
| SC-7 | Stale SpacetimeDB rules in CLAUDE.md (tested-with 1.11.x, index `name:`, multi-column warning) updated to 2.10 | VERIFIED | `CLAUDE.md:95` "Tested with: SpacetimeDB runtime 2.10.x, npm spacetimedb 2.10.x". Index literals use `accessor:` (lines 184, 191, 245, 405). The multi-column section is now "Multi-column indexes (fixed in 2.7 / 2.8)" and the errors-table row says pre-2.7 only. Line 511 shows `^2.10.1`. `grep 1.11` returns nothing. `AGENTS.md` is byte-identical to `CLAUDE.md` (`cmp` exit 0). The module schema itself uses `accessor:` indexes (`spacetimedb/src/schema/tables.ts`, no `name:`-style indexes remain). |

**Score:** 7/7 truths verified (SC-4 via override), 0 present-but-behavior-unverified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/connectionLogging.ts` and `.test.ts` | 2.10 connection logging helpers and tests | VERIFIED | Substantive, imported and used in `src/main.ts`. |
| `llm-proxy/scripts/smoke.sh` | Smoke script (health/auth/validation/optional real call) | VERIFIED | Present. Review fixes WR-01/02 applied (38-REVIEW status: clean). |
| `pnpm-lock.yaml` x3 | Lockfiles in root, `spacetimedb/`, `llm-proxy/` | VERIFIED | Frozen install passes in all three. |
| `src/module_bindings/` | Regenerated by CLI 2.10.1 | VERIFIED | Generator header confirms 2.10.1. |
| `CLAUDE.md` / `AGENTS.md` | Updated rules, in parity | VERIFIED | See SC-7. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/main.ts` | `src/connectionLogging.ts` | inline lambdas in `.onDisconnect` / `.onConnectError` | WIRED | Confirmed at `main.ts:33-34`. |
| root and `spacetimedb/` `package.json` | lockfiles | pnpm frozen install | WIRED | All three exit 0. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build | `pnpm run build` | exit 0 (only a chunk-size warning) | PASS |
| Root tests | `pnpm test` | 512/512 | PASS |
| Module tests | `pnpm --dir spacetimedb test` | 478/478 | PASS |
| Lockfiles in sync | `pnpm install --frozen-lockfile` x3 | exit 0 each, "Already up to date" | PASS |
| CLI version | `spacetime --version` | 2.10.1 | PASS |

Probes: none declared for this phase (Step 7c skipped). `llm-proxy` smoke was not re-run, since it needs a running `wrangler dev` and I did not start servers. The 38-05 and 38-08 records of it are not independently re-checked.

### Requirements Coverage

No requirement IDs are mapped in REQUIREMENTS.md (ROADMAP "Requirements: TBD"). The contract is SC-1..SC-7 above, and all are accounted for. No orphaned requirements.

### Anti-Patterns Found

None. No `TBD`, `FIXME`, or `XXX` in the source files changed by this phase. Code-review status is clean after 3 fixes (WR-01..WR-03).

### Deviations worth recording (not gaps)

- Backup of local SpacetimeDB data was skipped on explicit user instruction (greenfield project). Not a gap.
- 38-02 made two accepted behaviour changes: number-key hotbar shortcuts restored, and a dead `ranger_track` `useAbility` call removed. Both were approved in 38-08.
- Carried-forward follow-ups (not blockers): first maincloud publish will need `--break-clients` for the 14 view re-creations. Check the external host's package-manager detection before the next push. `client/src/module_bindings/` is stale. The orphaned CharacterInfoPanel cluster is a candidate for deletion. `ranger_track` / TrackPanel needs follow-up.

### Human Verification Required

None outstanding. Live end-to-end verification was performed and approved by the user on 2026-09-29 (38-08).

### Gaps Summary

No gaps. The phase goal is achieved: the stack is on SpacetimeDB 2.10.1 and the current toolchain, with build and 990 tests passing, and the game human-verified end to end. The one literal shortfall, a 200 from `/api/llm`, is an external OpenAI-credit issue that the user knowingly deferred to a new LLM milestone. It is recorded as an override so the deferral stays visible.

---

_Verified: 2026-09-29_
_Verifier: Claude (gsd-verifier)_
