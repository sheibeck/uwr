---
phase: 42
slug: client-cutover-and-legacy-removal
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-30
---

# Phase 42 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2: the root run covers `src/` and `scripts/`, and `spacetimedb/` covers the server. Node environment, no DOM test setup |
| **Config file** | none (defaults). `scripts/llm/vitest.live.config.ts` is for live runs only and is excluded from default runs |
| **Quick run command** | `pnpm exec vitest run --maxWorkers=1 <paths>` (root) or `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 <paths>` (server) |
| **Full suite command** | `CI=true pnpm exec vitest run --maxWorkers=1`. The root run also collects the server files. Baseline: root 57 files / 2245 tests; server alone 52 files / 2161 tests |
| **Other gates** | `spacetime build -p spacetimedb`; `pnpm build` (vue-tsc + vite); `node scripts/check-bundle.mjs` after `pnpm build`; `pnpm spacetime:generate -y`, then an absence scan of `src/module_bindings/` |
| **Estimated runtime** | about 25 s for the server suite, about 40 s for the root suite, plus about 35 s per client build |

Always run a single worker (`--maxWorkers=1`). This host exhausts memory with parallel workers.

---

## Sampling Rate

- **After every task commit:** run the quick command for the files the task touched.
- **After every plan wave:** run the full suite (single worker) and `spacetime build -p spacetimedb`.
- **After each local publish:** run `pnpm spacetime:generate -y`, then `pnpm build`. After the final client task, also run `node scripts/check-bundle.mjs`.
- **Before `/gsd-verify-work`, all of these must hold:**
  - The full suite, `pnpm build` and the bundle guard are all green.
  - Both local publishes are recorded in the SUMMARY, each with its command and output lines.
  - `SELECT key_set, key_length FROM admin_llm_status` returns `true` and `108` after publish 2.
  - `spacetime describe` lists no `llm_task`, `llm_request`, `llm_budget` or `llm_cleanup_tick`.
  - `git status` shows none of the protected local files staged (`.claude/settings.local.json`, `public/assets/logo.png`, `public/assets/logo_old.png`).
- **Max feedback latency:** 30 seconds per task, about 75 seconds including a client build.

---

## Per-Task Verification Map

The planner fills in the task IDs. The requirement-level map below comes from 42-RESEARCH.md §Validation Architecture. Server tests use the schema recorder and `createMockProcCtx`/mock reducer contexts unless noted. Client tests are pure-function or source-guard tests, since there is no DOM test setup.

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| SEC-02 | After loading `index.ts`, the captured reducers do not include `submit_llm_result`, `validate_llm_request`, any `purge_*llm*` reducer (after publish 2) or `sweep_llm_errors` | unit (recorder) | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/schema/llm_absence.test.ts` | ❌ W0 | ⬜ pending |
| SEC-02 | The regenerated bindings have no `submit_llm_result`, `validate_llm_request` or purge reducer files, and no reducer parameter named `resultText` | unit (scan of `src/module_bindings`) | `pnpm exec vitest run --maxWorkers=1 src/legacyLlmRemoval.test.ts` | ❌ W0 | ⬜ pending |
| SEC-02 | Apply behavior survives removing the wrapper. The characterization test is converted to drive `applyLlmResult`/`applyLlmFailure` directly, not deleted | unit (converted characterization) | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/helpers/llm_apply.characterization.test.ts src/helpers/llm_apply.test.ts` | ✅ convert | ⬜ pending |
| SEC-02 | Running either publish again after it succeeded changes nothing: no migration prompt and no data change. Regenerating the bindings a second time gives no diff | manual/scripted (local server) | re-run `pnpm spacetime:publish` and `pnpm spacetime:generate -y`, then `git diff --stat src/module_bindings` | n/a | ⬜ pending |
| SEC-03 | `clearLegacyLlmCredential` removes the exact key and is a no-op when the key is absent. It never throws, whether storage throws or is missing, and it can run repeatedly. `main.ts` calls it before `createApp` (source guard) | unit | `pnpm exec vitest run --maxWorkers=1 src/legacyCredentials.test.ts` | ❌ W0 | ⬜ pending |
| SEC-03 | No non-binding file under `src/` or `scripts/` names `VITE_LLM_PROXY`, `useLlmProxy`, `localhost:8787`, `/api/llm`, `submitLlmResult` or `validateLlmRequest`. `llm-proxy/` does not exist, and there is no dynamic `import.meta.env` use | unit (source scan) | `pnpm exec vitest run --maxWorkers=1 src/legacyLlmRemoval.test.ts` | ❌ W0 | ⬜ pending |
| SEC-03 | `auditBundle` flags each forbidden class and allows exactly one `removeItem("llm_proxy_secret")`, rejecting any `getItem`/`setItem` use. It has no false positive on `task-list`, catches key-shaped strings, and fails cleanly when `dist/` is missing. It reads js, css, html and map files as UTF-8 | unit | `pnpm exec vitest run --maxWorkers=1 scripts/check-bundle.test.mjs` | ❌ W0 | ⬜ pending |
| SEC-03 | The real built bundle is clean | build + script | `pnpm build && node scripts/check-bundle.mjs` | ❌ W0 (script) | ⬜ pending |
| SEC-03 (criterion 3) | `selectLlmIndicator`: <br>• only active statuses count; terminal statuses never do <br>• silent routes are never active, even when they are the only job <br>• priority order holds, with ties broken by oldest `createdAt`, then lowest `id` <br>• an unknown route uses the fallback line at the lowest priority <br>• an empty list gives `{active:false,route:null,indicatorLine:null}` <br>`resolveDisplayedLine` uses the fallback only when input is locked and there is no status line | unit | `pnpm exec vitest run --maxWorkers=1 src/composables/useLlmStatus.test.ts` | ❌ W0 | ⬜ pending |
| SEC-03 (criterion 3) | The status set matches `LLM_ACTIVE_JOB_STATUSES`, and the indicator keys equal `LLM_ROUTE_NAMES`. Voice rules: an ellipsis, no `!`, no banned phrases, and the pronoun guard (the Keeper is he/his, the player is "you") | unit (server data) | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/data/llm_indicator_lines.test.ts src/data/pronoun_rules.test.ts` | ❌ W0 (+ existing) | ⬜ pending |
| SEC-03 (criterion 3) | Client wiring: <br>• `useCoreData.ts` subscribes to `my_llm_jobs` and never to `llm_task` <br>• `App.vue` passes `:llm-indicator-line` and has no `useLlmProxy` <br>• the `NarrativeConsole.vue` indicator has `role="status"`, no hard-coded indicator string, and a reduced-motion rule <br>• `NarrativeInput`'s `disabled` expression is driven only by creation and world-gen processing | unit (source guards) | `pnpm exec vitest run --maxWorkers=1 src/legacyLlmRemoval.test.ts` | ❌ W0 | ⬜ pending |
| SEC-05 | The recorder shows no `llm_task`, `llm_request`, `llm_budget` or `llm_cleanup_tick` table: `strictTableSpec(...)` is undefined and the names are absent from `__defs`. The public `llm_*` set is `[]`. There is no scheduled reducer `sweep_llm_errors`, and `ensureLlmCleanupScheduled` is gone | unit | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/schema/llm_privacy.test.ts src/schema/llm_absence.test.ts` | ✅ extend + ❌ W0 | ⬜ pending |
| SEC-05 | Purge reducer (publish 1): <br>• admin only: a non-admin gets `Admin only` and nothing is deleted <br>• empties all four tables <br>• logs counts only <br>• can run repeatedly <br>• the scheduled table is deleted through `scheduledId` | unit | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/reducers/llm_admin.test.ts` | ✅ rewrite | ⬜ pending |
| SEC-05 | `clientConnected` and `initScheduledTables` no longer insert a `llm_cleanup_tick` row | unit (recorder or mock ctx) | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/schema/llm_absence.test.ts` | ❌ W0 | ⬜ pending |
| SEC-05 | The model-literal allowlist is empty, and `llm-proxy/src` is no longer scanned | unit | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/data/model_literals.test.ts src/reducers/llm_cutover.test.ts` | ✅ update | ⬜ pending |
| SEC-05 | Between publish 1 and publish 2, the legacy tables still exist, but no server reader or writer and no client subscription touches them. The game runs and `pnpm build` passes in that state | unit (source scan) + build | `pnpm exec vitest run --maxWorkers=1 src/legacyLlmRemoval.test.ts && pnpm build` | ❌ W0 | ⬜ pending |
| SEC-05 | Publish 1 always comes before publish 2, and after publish 2 `spacetime describe` lists none of the legacy tables. Both publishes use `--break-clients` only, never `-y` or `--delete-data`, and the key survives (`key_set true`, `key_length 108`) | manual/scripted (local server, run by the executor) | the publish commands in 42-RESEARCH.md "Verified publish commands"; paste the output lines into the SUMMARY | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Task mapping (filled by the planner, 2026-09-30)

| Behavior row (above) | Plan and task |
|----------------------|---------------|
| SEC-02 recorder absence of the removed reducers | 42-03 Tasks 1-3 (`llm_absence.test.ts`), 42-06 Task 1 (purge and sweep absent) |
| SEC-02 bindings scan (no removed reducer files, no `resultText` argument) | 42-05 Task 1 (after publish 1), 42-07 Task 1 (after publish 2) |
| SEC-02 characterization converted, not deleted | 42-01 Tasks 1-2 |
| SEC-02 re-publish and re-generate are no-ops | 42-05 Task 2 (publish 1), 42-07 Task 2 (publish 2) |
| SEC-03 `clearLegacyLlmCredential` and the `main.ts` guard | 42-02 Task 2 |
| SEC-03 client source scan, `llm-proxy/` and `client/` gone, no whole-object `import.meta.env` | 42-04 Task 2 |
| SEC-03 `auditBundle` unit tests | 42-02 Task 3 (plus the calibration run) |
| SEC-03 real built bundle is clean | 42-05 Task 2, 42-07 Task 2 |
| SEC-03 `selectLlmIndicator` and `resolveDisplayedLine` | 42-02 Task 2 |
| SEC-03 indicator lines: parity, voice, pronoun guard | 42-02 Task 1 |
| SEC-03 client wiring source guards | 42-04 Task 1 (docs guards: 42-04 Task 3) |
| SEC-05 recorder table absence, public `llm_*` set `[]` | 42-06 Tasks 1-2 |
| SEC-05 purge reducer (admin only, counts only, idempotent, `scheduledId`) | 42-03 Task 1 (deleted again in 42-06 Task 1) |
| SEC-05 no cleanup-tick re-arm | 42-03 Task 1 (strict re-check in 42-06 Task 1) |
| SEC-05 model-literal allowlist empty, `llm-proxy/src` not scanned | 42-03 Task 2 (one entry left), 42-06 Task 2 (empty) |
| SEC-05 intermediate state between the publishes | 42-03 Task 3 (server scan), 42-04 Task 2 (client scan), 42-05 Task 2 (gates) |
| SEC-05 publish order, describe, key survives, no clear | 42-05 Tasks 1-2, 42-07 Tasks 1-2 |

Note: a refused local publish stops the executor and goes to the user (orchestrator hard rule, which supersedes the CONTEXT clause that allowed a local clear).

---

## Wave 0 Requirements

- [ ] `spacetimedb/src/schema/llm_absence.test.ts`: recorder-based absence of the tables, reducers and scheduled reducer, and no cleanup re-arm (SEC-02, SEC-05)
- [ ] `spacetimedb/src/data/llm_indicator_lines.ts` and `spacetimedb/src/data/llm_indicator_lines.test.ts` (SEC-03 criterion 3)
- [ ] `src/composables/useLlmStatus.test.ts` (SEC-03 criterion 3)
- [ ] `src/legacyCredentials.test.ts` (SEC-03)
- [ ] `src/legacyLlmRemoval.test.ts`: source and bindings scans. It reads files with `node:fs` plus `@ts-ignore`, like `model_literals.test.ts` (SEC-02, SEC-03, SEC-05)
- [ ] `scripts/check-bundle.mjs` and `scripts/check-bundle.test.mjs` (SEC-03)
- [ ] Converted `spacetimedb/src/helpers/llm_apply.characterization.test.ts` (SEC-02)
- Framework install: none (Vitest is present)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| The two local publishes, with no clear, and the key surviving | SEC-05 | They need the running local SpacetimeDB server and change the user's local database | The executor starts the server (run-local skill) and runs publish 1 (`--break-clients`), the admin purge, publish 2 (`--break-clients`) and generate. It then runs `SELECT key_set, key_length FROM admin_llm_status`. If a publish refuses, stop: that decision goes to the user (a local clear wipes the key; the Phase 41 runbook covers recovery with `node scripts/llm/set-key.mjs`) |
| The in-progress indicator shows the Keeper line for each route and hides for silent routes | SEC-03 (criterion 3) | There is no DOM test setup; the pure selector is unit-tested but the rendered console is not | Start the dev server, create a character (creation line), trigger world gen, request a skill offer and talk to an NPC. Confirm each line matches 42-UI-SPEC.md, that combat narration shows no indicator, and that only creation and world gen lock input |
| A returning browser's stored `llm_proxy_secret` is cleared | SEC-03 | It needs a real browser profile with the old key set | In devtools, set `localStorage.llm_proxy_secret = "x"`, reload, and confirm the key is gone and the app loads normally |
| The retired proxy is shut down and the old secret revoked | SEC-03 | These are account actions outside the repo, owned by the user | The user runs `wrangler delete uwr-llm-proxy`, revokes the OpenAI key, removes the `VITE_LLM_PROXY_*` lines from `.env.local` and the hosting dashboard, and redeploys. The old proxy secret is treated as exposed, because it was inlined into past bundles |
| The maincloud version of the two-publish removal | SEC-05 | Maincloud deploys are manual and done only by the user | The user follows the checklist the phase writes. Claude never publishes to or calls maincloud |

---

## Validation Sign-Off

- [ ] Every task has an `<automated>` verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without an automated verify
- [ ] Wave 0 covers every MISSING reference
- [ ] No watch-mode flags
- [ ] Feedback latency < 75 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
