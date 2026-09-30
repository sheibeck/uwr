# Phase 42: Client Cutover and Legacy Removal - Research

**Researched:** 2026-09-30
**Domain:** SpacetimeDB 2.10.1 schema removal, Vue 3 client cutover, deletion blast radius, build-output credential guard
**Confidence:** HIGH (table-removal behavior proven on a scratch database with the installed CLI; inventory from `git grep` on the working tree)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Legacy removal and publishing
- **Local clear policy (overrides roadmap criterion 4):** try the table removal without `--clear-database`. If the LOCAL publish refuses, run a local `--clear-database -y`, re-run `node scripts/llm/set-key.mjs` and the admin smoke test, and record the exact publish line. Do not stop and ask. Reword roadmap criterion 4 to match. The user's greenfield rule of 2026-09-30 allows a local clear when the schema needs it. Maincloud is never cleared and never published by Claude.
- **Two local publishes.**
  - Publish 1 removes every reader and writer on the server plus every client subscription and binding use of `llm_task` and `llm_request`.
  - Publish 2 drops the tables.
  - This rehearses the safe order for the user's later maincloud publish.
- **Delete everything the executor does not use:**
  - the `llm_task`, `llm_request` and legacy `llm_budget` tables
  - `submit_llm_result`, `validate_llm_request` and the `llm_task` error sweep with its scheduled table
  - the `submit_llm_result` characterization test and its snapshot, whose behavior is covered by the `llm_apply` tests
  - the leftover `LEGACY_MODEL_LITERALS` allowlist entries that exist only for these paths
  - Check what Phase 41-15 already purged and do not redo it.
- **`llm-proxy/`:** delete the directory from the repo. The plan writes a short user checklist to `wrangler delete` the deployed Worker and revoke the OpenAI key it holds. Claude never runs wrangler against the user's Cloudflare account.

#### Player-facing status (`useLlmStatus`)
- **Indicator source:** a new `useLlmStatus` composable reads ONLY the `my_llm_jobs` view. The "Keeper is working" indicator is on when any of the player's jobs is `pending`, `in_flight` or `received`, except `combat_narration`, which stays silent and never looks like waiting.
- **Input locking:** only character creation and world generation lock the narrative input, as they do today through their own state rows. NPC replies, skill offers and renown perks run in the background while the player keeps playing. A duplicate request gets the server's in-voice "already considering" line.
- **Failures:** the server already posts an in-voice Keeper line to the player's log (`applyLlmFailure`), so the client only clears the indicator. There is no error chip, and the coarse `errorCode` bucket is not shown in the UI.
- **Wording:** one short in-voice line per route, for example NPC "…leans in to listen" and skill "…weighs what you might become". Keep the lines in a shared data table on the server data side, per the project rule that the server is the source of truth for constants. They must follow the in-game pronoun rule (see Specific Ideas).
- No subscription to `llm_task` or `llm_request` remains anywhere in the client.

#### Credential cleanup and guards
- **`llm_proxy_secret`:** call `localStorage.removeItem('llm_proxy_secret')` on every app load, wrapped in try/catch. It is idempotent, so no flag is needed. A unit test pins it.
- **Bundle guard:** add `scripts/check-bundle.mjs`. It runs after `pnpm build` and fails if `dist/` contains any of:
  - `llm_proxy_secret`
  - `VITE_LLM_PROXY`
  - the proxy URL or host
  - `PROXY_SECRET`
  - a key-shaped string (`sk-ant-`, `sk-`)

  It runs in the plan verification and the phase verification. It is not added to the GitHub workflow.
- **Env vars:** the user removes the `VITE_LLM_PROXY_URL` and `VITE_LLM_PROXY_SECRET` lines from the root `.env.local` and from the hosting provider's dashboard. Claude never reads env files, and once the code stops referencing the vars they are inert. The user checklist lists both places.
- **Docs:** README and `.claude/skills/run-local/SKILL.md` drop the proxy step, so the stack goes from four processes to three, and point to `docs/runbooks/llm-key.md` for the key. The skill's stop script no longer looks for wrangler or `llm-proxy`.

### Claude's Discretion
- How `useLlmStatus` maps job rows to UI state (a pure mapping function, unit-tested), and where it plugs into `App.vue` and `NarrativeConsole.vue`.
- The exact removal order across the two publishes, as long as each publish leaves the game runnable and the client builds.

### Deferred Ideas (OUT OF SCOPE)
- A GitHub workflow step that runs the bundle guard on every push. The user chose local and phase verification only for now.
- A visible error chip that shows the job's error bucket. Not wanted, because the server's in-voice line covers failures.

### Specific Ideas (pronoun rule, from CONTEXT)
- The Keeper is male (he/his, never it/its/they). Every NPC or humanoid person is male or female (he or she). The player's own character is always addressed as "you". Beasts and monsters may be "it". Every new indicator line or player-facing string in this phase must follow this.
- The user's uncommitted local files are never staged: `.claude/settings.local.json`, `public/assets/logo.png`, `public/assets/logo_old.png`. Publishes are local only. No pushes to master.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-02 | No client can submit or forge LLM results (`submit_llm_result` removed). | Delete the reducer in publish 1 (index.ts:587-608), regenerate bindings, pin absence with a recorder test plus a bindings scan. `validate_llm_request` goes with it. Inventory in "Deletion Inventory". |
| SEC-03 | No LLM credential exists in the browser. | Delete `useLlmProxy.ts`, `useLlm.ts`, `llm-proxy/`; one-time `removeItem('llm_proxy_secret')`; `scripts/check-bundle.mjs`. Current `dist/` still contains the `llm_proxy_secret` read, `localhost:8787`, `/api/llm` and an inlined `VITE_LLM_PROXY_SECRET` fallback literal, so the guard is load-bearing. |
| SEC-05 | Old `llm_task`/`llm_request` tables and dead v2.0 pipeline code removed via two-publish removal. | Verified empirically: empty tables (plain, public, scheduled with their reducer) drop under `--break-clients` with no clear; a non-empty table is refused by the server. Local state: only `llm_cleanup_tick` holds a row. Plan = publish 1, purge, publish 2. |
</phase_requirements>

## Summary

The server can drop the legacy tables without `--clear-database`, but only if they are empty and only with `--break-clients`. I proved this on a throwaway database with the installed CLI (2.10.1) on an isolated server: removing an empty plain table, an empty public indexed table and an empty scheduled table together with its reducer succeeded and left another table's rows intact; removing a table that still held a row (plain or scheduled) was refused by the server with "Cannot remove table `X`: table contains data. Clear the table's rows (e.g. via a reducer) before removing it from your schema." The official docs list "Removing tables" as forbidden for automatic migration, so the docs are stale or conservative relative to 2.10.1 behavior. The local `uwr` database right now has `llm_task`=0, `llm_request`=0, `llm_budget`=0 and `llm_cleanup_tick`=1 (the recurring 5-minute sweep row), key set with length 108. So the key survives if publish 1 stops the cleanup tick from re-arming, a purge reducer empties the four legacy tables, and publish 2 removes them.

The client side is small and mechanical: one subscription (`llm_task`) in `useCoreData.ts`, one composable (`useLlmProxy.ts`, plus a dead `useLlm.ts` that calls `validateLlmRequest`), and the `isLlmProxyProcessing` wiring in `App.vue`, including two input guards (lines 1170, 1244) and the second `NarrativeConsole` instance, which today locks only on the proxy flag. The new `useLlmStatus` reads `my_llm_jobs` (per-sender view, no primary key in the binding, so use insert+delete rebinding). There is no DOM test infrastructure, so all behavior must live in pure functions, with static source guards for component wiring (existing project pattern).

Three findings need planner attention beyond the CONTEXT: (1) the `submit_llm_result` characterization test (1,638 lines, 10,947-line snapshot) is the ONLY coverage of NPC-conversation apply effects (quest offers), combat-narration apply, and most world-gen/creation/skill success paths, so CONTEXT's premise "covered by the llm_apply tests" is not true; convert it instead of deleting. (2) The CONTEXT bundle guard forbids `llm_proxy_secret`, but the required one-time cleanup necessarily puts that literal in `dist/`; the guard must allow exactly that `removeItem(...)` use. (3) Vite inlines `import.meta.env.VITE_*` values at build time, so every previously built bundle carries the proxy secret value; the user checklist must treat the secret as burned and redeploy.

**Primary recommendation:** Publish 1 = remove all readers and writers (reducers, `incrementBudget`, cleanup re-arm, client subscription and proxy) plus a generalized admin purge reducer; run the purge via the CLI identity; Publish 2 = remove the four tables, the drained sweep reducer and the purge reducer with `spacetime publish uwr --server local --break-clients` (never `-y`, never `--delete-data`); regenerate bindings after each.

## Project Constraints (from CLAUDE.md)

- SpacetimeDB TS rules apply: reducers deterministic, object-syntax reducer calls, never hand-edit `src/module_bindings/` (regenerate), import `DbConnection` from `./module_bindings`, views need explicit subscription SQL, `ctx.withTx` in procedures.
- Make the smallest change necessary; do not touch unrelated files, configs or dependencies; do not invent SpacetimeDB APIs.
- Commands: local publish only (`spacetime publish uwr --server local`, flag `-p` for module path); `spacetime generate` to regenerate bindings; maincloud is the default-server concept in CLAUDE.md but project memory and CONTEXT override: NEVER publish to maincloud automatically.
- Memory rules (treat as locked): prefer `fail()` over `SenderError` where character context exists; server is source of truth for constants (client imports from `spacetimedb/src/data/`); greenfield (no backups, no compat shims, go straight to new architecture); never `--clear-database` unless a schema change requires it; all phases MUST include unit tests that enforce the rules implemented; scheduled tables use `scheduledId` as primary key.
- Task constraints: never read `.env*` or print keys; single-worker vitest (`--maxWorkers=1`); stage by explicit path, never `.claude/settings.local.json`, `public/assets/logo.png`, `public/assets/logo_old.png`; pronoun rule for any player-facing string.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Run LLM calls, hold the key | API / Backend (SpacetimeDB scheduled procedure `llm_run`) | — | Phase 41; key lives only in private `llm_config`. The browser never calls a provider. |
| Apply results, post failure line | API / Backend (`applyLlmResult` / `applyLlmFailure` inside executor tx) | — | Client-trusted `submit_llm_result` is deleted; nothing else accepts LLM output. |
| Own-job status for the player | Database / Storage (`my_llm_jobs` per-sender view) | Browser (subscribe + map) | View projects 6 fields from private `llm_job` by `ctx.sender`; no prompt, key or output leaves the server. |
| Indicator line strings | API / Backend data module (`spacetimedb/src/data/llm_indicator_lines.ts`) | Browser (imports it) | Server is source of truth for constants; module must be import-free so the client bundle stays free of schemas and model ids. |
| State mapping (active job, priority, displayed line) | Browser (pure functions in `useLlmStatus`) | — | Presentation-only derivation of the view rows; unit-tested in node. |
| Input locking | Browser (`isCreationLlmProcessing`, `isWorldGenProcessing` from own state rows) | — | Unchanged; `useLlmStatus` must never feed `NarrativeInput.disabled`. |
| Legacy credential cleanup | Browser (`localStorage.removeItem` on load) | — | Only place a stale secret can exist. |
| Legacy table removal, purge | Database (two publishes plus admin purge reducer) | CLI operator | Server refuses non-empty table removal; data must be emptied by a reducer first. |
| Bundle credential guard | Build/CI-local (`scripts/check-bundle.mjs`) | — | Static scan of `dist/` after `pnpm build`; not in GitHub workflow (deferred). |

## Standard Stack

No new runtime packages are added by this phase. Everything uses what is installed. [VERIFIED: package.json, node_modules]

### Core (existing, used as-is)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| spacetimedb (npm SDK) | 2.10.1 installed (range ^2.10.1) | client subscription, `toSql`, generated bindings | project SDK; `node_modules/spacetimedb/package.json` reports 2.10.1 [VERIFIED: node_modules] |
| spacetime CLI | 2.10.1 (commit 3d76070) | publish, generate, call, sql | `spacetime --version` [VERIFIED: CLI] |
| vue | ^3.5.43 | composable, `computed`/`shallowRef` (work in node, no DOM needed) | project framework |
| vitest | ^5.0.2 (root and `spacetimedb/`) | unit tests, `.test.ts` and `.test.mjs`, node environment | project standard; no jsdom, no `@vue/test-utils` installed [VERIFIED: node_modules listing] |
| vite | ^8.3.1 | `pnpm build` = `vue-tsc -b && vite build` | project standard |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure functions plus static source guards for the component | jsdom + `@vue/test-utils` | Adds two dev dependencies and a test environment for one indicator; contradicts "smallest change". Not recommended. |
| Allow-one-`removeItem`-occurrence in the bundle guard | Build the key name from fragments at runtime | Fragment tricks can be constant-folded by the minifier and obscure intent; an exact-context allowlist is deterministic and testable. |

**Installation:** none. **Version verification:** `spacetime --version` -> 2.10.1; `node -p "require('./node_modules/spacetimedb/package.json').version"` -> 2.10.1 (run 2026-09-30).

## Package Legitimacy Audit

No external packages are installed by this phase. Nothing to audit. (A scratch probe under the session scratchpad installed `spacetimedb@2.10.1` only to test migration behavior; it is outside the repo and not part of any plan.)

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
Note: deleting `llm-proxy/` removes its own dependency set (hono, openai, wrangler, workers-types) from the repo; the root lockfile has no reference to it (standalone pnpm project). [VERIFIED: `git grep llm-proxy -- pnpm-lock.yaml package.json` returned nothing]

## Architecture Patterns

### System Architecture Diagram

```
                    PLAYER ACTION (explore / talk / level-up / renown / combat / creation)
                                      |
                                      v
   Browser --- reducer call ---> SpacetimeDB reducer --- enqueueLlmJob (same tx) --> llm_job (private) + llm_dispatch
                                                                                        |
   Browser subscribes (toSql)                                                           v
   SELECT * FROM my_llm_jobs  <----- view projects 6 fields (by ctx.sender) <----  llm_run procedure (server-side Claude call, key in llm_config)
        |                                                                               |
        v                                                                               v
   useCoreData.llmJobs (shallowRef, rebind on insert/delete)                      applyLlmResult / applyLlmFailure (tx3, job.playerId)
        |                                                                               |
        v                                                                               v
   useLlmStatus: selectLlmIndicator(rows) -> { active, route, indicatorLine }     domain tables + in-voice log line (event_private)
        |
        v
   resolveDisplayedLine(statusLine, isInputLocked) -> NarrativeConsole indicator div (role="status")

   Input lock (unchanged): isCreationLlmProcessing || isWorldGenProcessing -> NarrativeInput.disabled

   REMOVED: Browser -> fetch proxy (Cloudflare Worker) -> OpenAI; Browser -> submit_llm_result; llm_task / llm_request / llm_budget; llm_cleanup_tick + sweep_llm_errors
```

### Recommended Structure of the change
```
spacetimedb/src/
  data/llm_indicator_lines.ts        # NEW, import-free: LLM_INDICATOR_LINES, LLM_INDICATOR_FALLBACK_LINE, LLM_INDICATOR_PRIORITY, LLM_SILENT_ROUTES
  data/llm_indicator_lines.test.ts   # NEW: keys == LLM_ROUTE_NAMES, voice/pronoun/banned-phrase/ellipsis checks
  reducers/llm.ts                    # purge_llm_tasks -> generalized purge (P1), deleted (P2); validate_llm_request deleted (P1)
src/
  composables/useLlmStatus.ts        # NEW: selectLlmIndicator, resolveDisplayedLine, useLlmStatus({ llmJobs })
  composables/useLlmStatus.test.ts   # NEW
  legacyCredentials.ts               # NEW: clearLegacyLlmCredential(storage?) called from main.ts before mount
  legacyCredentials.test.ts          # NEW
scripts/
  check-bundle.mjs                   # NEW: exports auditBundle(files) + CLI entry
  check-bundle.test.mjs              # NEW
```

### Pattern 1: Pure mapping + thin composable (matches repo: `NarrativeMessage.colors.ts`, `connectionLogging.ts`)
**What:** All behavior in exported pure functions, the composable only wraps `computed`. **When:** any client logic that needs a unit test, because the suite runs in node without a DOM.
```typescript
// Source: UI-SPEC "useLlmStatus mapping" + repo patterns
import { computed, type Ref } from 'vue';
import { LLM_INDICATOR_LINES, LLM_INDICATOR_FALLBACK_LINE, LLM_INDICATOR_PRIORITY } from '../../spacetimedb/src/data/llm_indicator_lines';

const ACTIVE = new Set(['pending', 'in_flight', 'received']);

export function selectLlmIndicator(rows: readonly any[]) {
  let best: any = null, bestRank = Infinity;
  for (const r of rows) {
    if (!ACTIVE.has(r.status)) continue;
    const line = r.route in LLM_INDICATOR_LINES ? LLM_INDICATOR_LINES[r.route] : LLM_INDICATOR_FALLBACK_LINE;
    if (line === null) continue;                       // silent routes: combat_narration, smoke_test
    const rank = LLM_INDICATOR_PRIORITY.indexOf(r.route); // -1 => unknown route => after all known
    const effective = rank === -1 ? LLM_INDICATOR_PRIORITY.length : rank;
    const created = BigInt(r.createdAt?.microsSinceUnixEpoch ?? 0n);
    // pick lowest effective rank, then oldest createdAt, then lowest id (all bigint compares)
    /* ...compare and keep best... */
  }
  return best ? { active: true, route: best.route, indicatorLine: /* line */ '' } : { active: false, route: null, indicatorLine: null };
}
export const resolveDisplayedLine = (statusLine: string | null, locked: boolean) =>
  statusLine ?? (locked ? LLM_INDICATOR_FALLBACK_LINE : null);
export const useLlmStatus = ({ llmJobs }: { llmJobs: Ref<readonly any[]> }) =>
  ({ status: computed(() => selectLlmIndicator(llmJobs.value)) });
```

### Pattern 2: Explicit view subscription + insert/delete rebinding
**What:** add `toSql(tables.my_llm_jobs)` to the existing `subscribe([...])` array in `useCoreData.ts`, hold rows in a `shallowRef`, rebuild on insert/update/delete (same as `my_bank_slots`). **Why both delete and insert:** the view binding declares no primary key, so a status change arrives as delete+insert; the existing `rebind` helper registers all three callbacks. [VERIFIED: `src/module_bindings/index.ts:1753-1759` (no constraints), `node_modules/spacetimedb/dist/index.mjs:4849` (`onUpdate` exists on every table cache), `useCoreData.ts` `rebind`]
```typescript
// useCoreData.ts (additions; remove every llmTasks line)
const llmJobs = shallowRef<any[]>([]);
// refresh(): llmJobs.value = [...dbConn.db.my_llm_jobs.iter()];
// subscribe([... toSql(tables.my_llm_jobs) ...])
// rebind(dbConn.db.my_llm_jobs, llmJobs, () => dbConn.db.my_llm_jobs.iter());
// return { ..., llmJobs }
```
The generated row type: `{ id: u64, route, status, createdAt (Timestamp), errorCode?: string, userMessage }` [VERIFIED: `src/module_bindings/my_llm_jobs_table.ts`]. `createdAt.microsSinceUnixEpoch` is a bigint. Subscription is all-or-nothing per `subscribe([...])` batch: if ANY query names a table that no longer exists the whole batch fails. That is why the client must drop the `llm_task` query BEFORE publish 2.

### Pattern 3: Two-publish removal (verified)
1. Publish 1 (code-only for the schema: all tables still defined): remove every reader and writer; make the scheduled `sweep_llm_errors` reducer a drain that does NOT re-insert its tick; stop `ensureLlmCleanupScheduled` from being called anywhere (clientConnected, `initScheduledTables`); replace `purge_llm_tasks` with an admin purge that deletes all rows of `llm_task`, `llm_request`, `llm_budget`, `llm_cleanup_tick` and logs only counts.
2. Run the purge as the CLI identity (`spacetime call --server local uwr <purge reducer>`), then check each count with `spacetime sql --server local uwr "SELECT COUNT(*) AS n FROM <table>"` (never `llm_config`).
3. Publish 2: remove the four table definitions, their `schema({...})` entries, `LlmCleanupTick` from `scheduled_tables.ts`, the `sweep_llm_errors` reducer, and the purge reducer; `spacetime publish uwr --server local --break-clients`; regenerate bindings.

### Anti-Patterns to Avoid
- **Dropping the tables in publish 1.** A client still subscribing to `llm_task` would break the whole subscription batch; and the rehearsal for maincloud would not show the safe order.
- **Leaving `ensureLlmCleanupScheduled` callable.** `clientConnected` (index.ts:649) and `initScheduledTables` re-insert a `llm_cleanup_tick` row whenever the table is empty, refilling it right after the purge and blocking publish 2.
- **`-y` / `--yes=all` / `--delete-data` on publish 2.** Use `--break-clients` only; the server then refuses to delete data instead of silently wiping it (this is exactly the protection that keeps `llm_config`).
- **Feeding `useLlmStatus` into `NarrativeInput.disabled`.** Only creation and world-gen state rows lock input.
- **Importing `llm_routes.ts` (or `llm_models.ts`) from the client indicator module.** It drags schemas, the Claude model id and prompt-adjacent data into the browser bundle. Keep `llm_indicator_lines.ts` import-free and pin key parity with a server test.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Explicit view subscription | custom SQL strings | `toSql(tables.my_llm_jobs)` + existing `rebind` | Same as `my_bank_slots`; handles view-without-PK delete+insert. |
| Active status set | re-declare statuses in the client | mirror `LLM_ACTIVE_JOB_STATUSES` (`pending,in_flight,received`) and pin parity with a test that reads `helpers/llm_queue.ts` | Status drift would silently show a stuck indicator. |
| Stuck-row handling | client staleness timer | Phase 41 sweeper (`llm_sweep`, 30 s) expires stuck jobs; the row leaves the active set | UI-SPEC: no client cutoff. |
| Failure UI | error chip | server `applyLlmFailure` log line | Deferred idea; out of scope. |
| Bundle scan | grep one-liner in the plan | `scripts/check-bundle.mjs` with an exported pure `auditBundle(files)` | Testable, deterministic, reused by plan and phase verification. |
| Key-name obfuscation | string concat tricks | exact-context allowlist for `removeItem("llm_proxy_secret")` | Minifier may fold concatenation; allowlist is precise. |

**Key insight:** every behavior here is either a deletion (verify absence) or a pure mapping; there is no new infrastructure to build, so the risk is in ordering and in tests that silently go vacuous when a table disappears.

## Runtime State Inventory

(This phase is a removal/migration phase, so all five categories are answered.)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Local `uwr` DB (queried 2026-09-30): `llm_task` 0, `llm_request` 0, `llm_budget` 0, `llm_cleanup_tick` **1** (recurring scheduled row), `llm_job` 0, `llm_sweep_tick` 1, `llm_config` key set length 108, `keyValid` false (smoke test never ran). Maincloud: unknown, real v2.0 rows likely in `llm_task`, `llm_request`, `llm_budget`. Browser: `localStorage.llm_proxy_secret` on returning players' machines. | Purge reducer empties the four tables (data action, not just code). Client `removeItem` on load (client data cleanup). User runs the same purge on maincloud before their publish 2. |
| Live service config | Deployed Cloudflare Worker (name in `llm-proxy/wrangler.toml`: `uwr-llm-proxy`) holds secrets `OPENAI_API_KEY` and `PROXY_SECRET`; hosting provider dashboard holds `VITE_LLM_PROXY_URL` / `VITE_LLM_PROXY_SECRET`. | User checklist only: `wrangler delete uwr-llm-proxy`, revoke the OpenAI key, remove both dashboard vars, redeploy the client. Claude runs no wrangler against the account. |
| OS-registered state | None in repo. Runtime processes from the run-local skill: `workerd.exe`, wrangler `node.exe` on port 8787. | Update the skill's start and stop steps; no persistent registrations exist. Ports confirmed free at research time (3000, 3010, 5173, 8787). |
| Secrets/env vars | `VITE_LLM_PROXY_URL`, `VITE_LLM_PROXY_SECRET` (root `.env.local`, not read), `llm-proxy/.dev.vars` (`OPENAI_API_KEY`, `PROXY_SECRET`, untracked). **Vite inlines referenced `VITE_*` values at build time**: the current `dist/` has the `VITE_LLM_PROXY_SECRET` value as a fallback literal next to the `llm_proxy_secret` read (value deliberately not reproduced here), so every past build and deploy carries it. | Code stops referencing the vars (then inert). Treat the proxy secret as exposed: Worker deletion plus OpenAI key revocation resolves it; add to checklist. Do not `rm` `llm-proxy/.dev.vars` (user's file). |
| Build artifacts / installed packages | `dist/` (ignored, stale, contains the forbidden strings now); `llm-proxy/node_modules`, `.wrangler/`, `dist/`, `.dev.vars` are ignored leftovers that remain on disk after `git rm -r llm-proxy`; `client/src/module_bindings/` (493 tracked files, last touched in Phase 22, nothing imports it, still contains `submit_llm_result` and `llm_task`); `src/module_bindings/` (generated, regenerate after each publish). | `pnpm build` regenerates `dist/` before the guard. Remove `client/` with `git rm -r` after an import proof. Leave ignored `llm-proxy` leftovers to the user or delete only `node_modules`, `.wrangler`, `dist` (not `.dev.vars`). |

## Deletion Inventory (verified by `git grep` on tracked files, 2026-09-30)

### Server production code
| File | What | Publish |
|------|------|---------|
| `spacetimedb/src/index.ts:587-608` | reducer `submit_llm_result` (+ its `toApplyJob`/`applyLlmResult`/`applyLlmFailure` import on line 6 if unused after) | 1 |
| `spacetimedb/src/index.ts:334-357` | `sweep_llm_errors` scheduled reducer, consts `LLM_CLEANUP_INTERVAL_MICROS`, `LLM_ERROR_TTL_MICROS`; reads `llm_request` | 1: drain-only (no reschedule, no `llm_request` read); 2: delete |
| `spacetimedb/src/index.ts:30, 226, 649` | `LlmCleanupTick` import, `ensureLlmCleanupScheduled` import and call in `clientConnected` | 1 (calls/imports), 2 (`LlmCleanupTick` import) |
| `spacetimedb/src/helpers/scheduling.ts:67-75, 87` | `ensureLlmCleanupScheduled` and its call in `initScheduledTables` | 1 |
| `spacetimedb/src/reducers/llm.ts:1, 115-168` | `validate_llm_request` (contains `gpt-5.4`, `gpt-5-mini`), `checkBudget` import, `fail` destructure if then unused | 1 |
| `spacetimedb/src/reducers/llm.ts:103-113` | `purge_llm_tasks` | 1: generalize to all four legacy tables; 2: delete |
| `spacetimedb/src/helpers/llm.ts` | `checkBudget`, `incrementBudget`, `DAILY_LLM_BUDGET`. **Keep `utcDateString`**: `helpers/llm_budget.ts:32,49` imports it. Move it into `llm_budget.ts` and delete `helpers/llm.ts`. | 1 |
| `spacetimedb/src/helpers/llm_apply.ts:19, 190, 405, 434, 732, 836, 870` | `incrementBudget` import and 6 call sites (writes dead `LlmBudget`; closes review IN-B02) | 1 |
| `spacetimedb/src/helpers/llm_apply.ts:46-58` | `toApplyJob` legacy `llm_task` shape branch; doc comments at 4, 46, 99 mention `llm_task`/`submit_llm_result` | 1 (optional: drop branch, update comments). **Keep** `creationStateForJob`'s no-`creationStateId` fallback unless its tests are deliberately rewritten (tests call `job('creation_race')` without context). |
| `spacetimedb/src/schema/tables.ts:1901-1934, 1936-1945, 2108-2126, 2378-2385, 2230` | `LlmRequest`, `LlmBudget`, `LlmCleanupTick`, `LlmTask` definitions, their `schema({...})` entries, stale comment "stays as dead code until Phase 42" | 2 (comment may be fixed in 1) |
| `spacetimedb/src/schema/scheduled_tables.ts:16` | re-export of `LlmCleanupTick` | 2 |
| `spacetimedb/src/data/llm_prompts.ts` (795 lines) | Dead: production imports none (only `llm_prompts.test.ts` and one equivalence test in `llm_schemas.test.ts`); comments in `llm_layers.ts:516`, `llm_schemas.ts:17` | 1 (delete file + `llm_prompts.test.ts`; in `llm_schemas.test.ts` remove the import on line 24, the `describe('legacy skill schema equivalence')` at ~189-194 and the `normalize` helper if unused) |

Leave alone (pinned by a test or out of scope): `sendNarrationSkippedMessage` (`combat_narration.test.ts:298` requires it to exist; review IN-B01), `choose_perk` (IN-B11 suggests Phase 42 but it is a perk-system reducer, not the LLM pipeline), `request_skill_offer`, `llm_limits.ts: LLM_BUDGET_RETENTION_DAYS` (used by `llm_player_budget`).

### Client
| File | What | Publish |
|------|------|---------|
| `src/composables/useLlmProxy.ts` | delete (proxy `fetch`, `llm_proxy_secret` read, `VITE_LLM_PROXY_URL/SECRET`, `submitLlmResult`) | 1 |
| `src/composables/useLlm.ts` | delete (dead, no importers, calls `conn.reducers.validateLlmRequest`, holds 2 model literals) | 1 |
| `src/composables/data/useCoreData.ts:37,70,113,154,190` | `llmTasks` ref, refresh, `toSql(tables.llm_task)`, `rebind`, return | 1 (replace with `llmJobs` over `my_llm_jobs`) |
| `src/App.vue:40,64,465,562,737-741,1152,1170,1244` | remove `useLlmProxy` import/use and `llmTasks`; `isNarrativeLlmProcessing` becomes the real lock (see Pitfall 4); add `useLlmStatus` | 1 |
| `src/composables/useNpcConversation.ts:7-8,25` | comments describe the proxy flow; rewrite to executor flow (file appears to have no importers) | 1 |
| `src/components/NarrativeConsole.vue:92-94,107,271,306-311,330-334` | indicator text from `llmIndicatorLine`, `role="status"`, reduced-motion rule | 1 |
| `src/main.ts` | call `clearLegacyLlmCredential()` before `createApp` | 1 |
| `src/module_bindings/**` | regenerate after each publish (`pnpm spacetime:generate -y`); never hand-edit | after 1 and after 2 |
| `client/` (whole tree, 493 tracked files) | stale second copy of bindings containing `submit_llm_result`, `llm_task`; no `tsconfig`/vite/test references (`git grep` for `client/` only hits CLAUDE.md-style docs) | 1 (`git rm -r client`; proves the repo-wide absence scan can be strict) |
| `env.d.ts` | has no `VITE_LLM_PROXY_*` typing; nothing to remove | - |

### Repo housekeeping
| File | What |
|------|------|
| `llm-proxy/` (tracked: `.gitignore`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `scripts/smoke.sh`, `src/index.ts`, `tsconfig.json`, `wrangler.toml`) | `git rm -r llm-proxy`. No root workspace file references it (`pnpm-workspace.yaml` exists only inside `llm-proxy/` and `spacetimedb/`), no root script, no GitHub workflow (`claude.yml`, `claude-code-review.yml` do not mention it). |
| `README.md:67, 115-123` | drop `pnpm --dir llm-proxy install` and "### 6. Start the LLM proxy" (renumber step 7), point LLM key setup to `docs/runbooks/llm-key.md` |
| `.claude/skills/run-local/SKILL.md` | description (line 3), intro "Three long-lived processes", table row 3 (proxy), "Before starting" ports `8787` and `llm-proxy/` install, Notes bullet on `.dev.vars`/`localStorage`, "When all four are up", Stopping (`workerd.exe`, wrangler), netstat port list. Also reword "Needing `--clear-database` is a stop-and-ask" to match the greenfield rule (local clear allowed, then re-run set-key). Stack becomes 3 processes: SpacetimeDB, publish (one-shot), Vite. |
| `spacetimedb/src/data/model_literals.test.ts:21-25, 86` | `LEGACY_MODEL_LITERALS` entries `reducers/llm.ts` (2), `schema/tables.ts` (1), `src/composables/useLlm.ts` (2) all reach zero; the allowlist becomes empty; remove `'llm-proxy/src'` from `SCAN_ROOTS`. **Keep the literal multi-line form `= {\n};`**, because `llm_cutover.test.ts:1726` parses it with `/const LEGACY_MODEL_LITERALS[^{]*\{([\s\S]*?)\n\};/`, which does not match a one-line `{}`; update that test (lines 1724-1732) to assert the list is empty. |
| `.planning/ROADMAP.md` (criterion 4), `.planning/REQUIREMENTS.md` (SEC-05 text "without `--clear-database`") | reword to the CONTEXT policy (try no-clear; a local clear is allowed and recorded). |

### Tests that reference the legacy names (update deliberately; do not delete blindly)
| File:lines | Reference | Action |
|------------|-----------|--------|
| `spacetimedb/src/helpers/submit_llm_result.characterization.test.ts` (1,638 lines) + `__snapshots__/...snap` (10,947 lines) | drives the reducer wrapper `handler` (`capturedReducer('submit_llm_result')`), seeds `llm_task`, snapshots `llm_budget` | **Recommended: convert, do not delete** (see Open Question 1). Rename to `llm_apply.characterization.test.ts`, replace `callSubmit`/`exec` with a helper that calls `applyLlmResult(ctx, {domain, playerId, contextJson}, text)` / `applyLlmFailure`, delete the `submit_llm_result wrapper` describe (lines 286-335: not found / not yours / already processed), re-record the snapshot once and review that the only diffs are the missing `llm_task` status and `llm_budget` rows. |
| `helpers/llm_apply.test.ts:5-9, 82-86, 173, 184, 194, 222, 240, 246, 398, 421, 250-266, 571-591` | `expectBudgetOnlyForAlice`, `rows(ctx,'llm_budget')`, legacy `toApplyJob` test, `submit_llm_result in index.ts is a thin wrapper` | drop the budget assertions (other assertions in the same tests still prove "effects land on job.playerId": states, events, call log); toApplyJob tests keep only the `llm_job` shape; delete the thin-wrapper test; update header comment; check `TODAY` still used. |
| `helpers/llm_seam.test.ts:345-347, 382-383, 423` | `llm_budget` rows | re-point "acts for the requester" to `llm_player_budget` row for `alice` (the enqueue reservation), delete the `callCount` assertions. |
| `schema/llm_privacy.test.ts:125-149` | public llm_* set equals `['llm_task']`; "other than the legacy `llm_task` is private"; defs contain `llm_task` | P1: unchanged. P2: public set equals `[]` (the title already says "Phase 42 tightens it to []"), no exception, `llm_task`/`llm_request`/`llm_budget`/`llm_cleanup_tick` absent from `__defs`; adjust the `>= 12` guard. |
| `helpers/schema_recorder.test.ts:28-44, 46-85, 94` | `llm_task` options, `rowColumnProblems('llm_task', ...)`, `capturedReducer('submit_llm_result')` | repoint the recorder self-tests at a live table (`llm_job`) with an equivalent unknown-column fixture; replace the reducer capture with `request_skill_offer` only (already on the next line); add absence assertions. |
| `reducers/llm_admin.test.ts:342-375` | purge_llm_tasks tests | P1: rewrite for the generalized purge (all four tables, counts-only log line, admin only, idempotent); P2: delete the describe. |
| `reducers/llm_cutover.test.ts:4, 87, 98, 108, 295, 386-387, 1020, 1724-1732` | "no llm_task row" assertions, static guards, allowlist pin | the `rows(ctx,'llm_task')` assertions become vacuous (the mock returns an empty array for unknown tables): remove them; the static `not.toMatch(/llm_task/)` guards stay; allowlist pin asserts empty. |
| `helpers/combat_narration.test.ts:105`, `creation_generation.test.ts:72`, `renown_llm.test.ts:103`, `skill_offer.test.ts:187`, `world_gen.test.ts:360, 391` | `rows(ctx,'llm_task')).toHaveLength(0)` | remove (vacuous after P2); coverage moves to the new absence test. Keep `import { utcDay } from './llm_budget'` (still exported). |
| `data/model_literals.test.ts`, `data/llm_schemas.test.ts`, `data/llm_prompts.test.ts` | see above | as above |
| `llm_limits.test.ts:29` | `LLM_BUDGET_RETENTION_DAYS` | unrelated (`llm_player_budget`); keep. |

## Common Pitfalls

### Pitfall 1: The cleanup tick refills the table after the purge
**What goes wrong:** publish 2 is refused with "Cannot remove table `llm_cleanup_tick`: table contains data".
**Why:** `clientConnected` and `initScheduledTables` call `ensureLlmCleanupScheduled`, and the `sweep_llm_errors` body re-inserts its own tick every 5 minutes.
**How to avoid:** in publish 1 remove both call sites and make the reducer body a no-op that does not re-insert; purge; verify `SELECT COUNT(*) FROM llm_cleanup_tick` is 0 immediately before publish 2.
**Warning signs:** count goes back to 1 after a client connects.

### Pitfall 2: Expecting `-y` to be safe for removal
**What goes wrong:** `-y` equals `--yes=all`, which also skips the destructive-data confirmation.
**How to avoid:** publish 2 uses `--break-clients` only. With it the server refuses any removal that would delete data (proven), so the `llm_config` key cannot be wiped by accident.

### Pitfall 3: Old client subscribes to a dropped table
**What goes wrong:** a stale browser tab subscribing to `SELECT * FROM llm_task` makes the whole subscription batch fail after publish 2.
**How to avoid:** client change ships and is reloaded before publish 2; the app already has an `app_version` reload prompt. For maincloud the user deploys the client first, then runs the purge, then publish 2.

### Pitfall 4: `isNarrativeLlmProcessing` silently loses its meaning
**What goes wrong:** `App.vue:1152` defines `isNarrativeLlmProcessing = isLlmProxyProcessing` and it gates `onNarrativeSubmit` (1170), `clickNpcKeyword` (1244) and the **game-world** `NarrativeConsole` lock (line 64). The game-world console never received `isWorldGenProcessing` (only the creation console did). Deleting the proxy ref leaves an undefined identifier (vue-tsc error) or, if replaced by `false`, unlocks input during `[explore]` world generation.
**How to avoid:** define one `isLlmInputLocked = computed(() => isCreationLlmProcessing.value || isWorldGenProcessing.value)` and use it for both consoles and both guards. NPC, skill and renown jobs must not lock.

### Pitfall 5: Inline style beats the reduced-motion rule
**What goes wrong:** `consideringStyle` sets `animation` inline, so a stylesheet `@media (prefers-reduced-motion: reduce)` rule has no effect.
**How to avoid:** give the indicator div a class (for example `llm-indicator`) and use `animation: none !important` in the `@media` block next to `@keyframes narrativePulse` (non-scoped `<style>` at NarrativeConsole.vue:330).

### Pitfall 6: Vacuous tests after a table disappears
**What goes wrong:** `rows(ctx,'llm_task')` returns `[]` for any unknown table in the default mock, so `toHaveLength(0)` keeps passing forever and proves nothing.
**How to avoid:** replace with schema-level absence tests (`strictTableSpec('llm_task')` is `undefined`, `recordedTables()` has no legacy names, `capturedReducer(name)` undefined) and keep the static source greps.

### Pitfall 7: Bundle guard false positives and the cleanup literal
**What goes wrong:** `sk-` unanchored matches words ending in "sk" followed by a dash (none in the current bundle, but fragile); `llm_proxy_secret` is required in `dist/` by the cleanup.
**How to avoid:** see "Bundle Guard Specification".

### Pitfall 8: Conversion of the characterization snapshot hides a regression
**What goes wrong:** re-recording a 10,947-line snapshot with `-u` wholesale.
**How to avoid:** first run the converted file without `-u`; only entries whose content includes `llm_task`/`llm_budget` may fail; review each diff; then update. (Same discipline 41-18 used.)

### Pitfall 9: Publish flag forwarding and server lifetime on Windows
**What goes wrong:** `pnpm spacetime:publish` forwards extra args, but if in doubt use the raw command; child processes (`spacetimedb-standalone.exe`) survive TaskStop.
**How to avoid:** executor starts the server per the run-local skill (`spacetime start --non-interactive --listen-addr 127.0.0.1:3000`), and stops it with `taskkill` on the listener PID; confirm with `netstat` that no port is listening.

## Bundle Guard Specification (`scripts/check-bundle.mjs`)

Scan every text file under `dist/` (`.js`, `.mjs`, `.html`, `.css`, `.json`, `.map`; skip images). Fail if `dist/` is missing or has no `.js`. Export a pure `auditBundle(files: Record<string,string>): string[]` (problems) and run it from a `process.argv[1]`-guarded CLI entry, following `scripts/llm/*.mjs`. Print only rule names and file paths, never the matched text (a match could be a real secret).

| Rule | Pattern | Notes |
|------|---------|-------|
| proxy secret key name | `llm_proxy_secret` | **Allow only** occurrences inside `removeItem(` + quote + `llm_proxy_secret` + quote + `)`; fail on any other occurrence (`getItem`, `setItem`, bare) and on more than one occurrence overall. Minified quotes can be `"`, `'` or a backtick (the current bundle uses a backtick template). |
| env var names | `/VITE_LLM_PROXY/`, `/PROXY_SECRET/` | currently 0 hits in `dist/`; keep as regressions |
| proxy-like secret values | `/proxy[-_]?secret/i` (outside the allowed `removeItem`) | catches a build-inlined literal such as the current fallback; the literal's own value is not needed |
| proxy URL / host | `localhost:8787`, `127.0.0.1:8787`, `/api/llm`, `uwr-llm-proxy`, `workers.dev` | the deployed host is not in code or config (only the worker name `uwr-llm-proxy`), so forbid `workers.dev` wholesale (0 hits now) |
| provider hosts / key names | `api.anthropic.com`, `api.openai.com`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `x-api-key` | the browser must never hold or use them (`api.anthropic.com` is also the Phase 41 network-tab expectation) |
| key-shaped strings | `sk-ant-` (any occurrence) and `/(?<![A-Za-z0-9_])sk-[A-Za-z0-9_-]{20,}/` | the length plus left boundary removes false positives like `task-...`; `sk-ant-` alone is distinctive enough to forbid unconditionally. Current bundle: 0 hits for `sk-[A-Za-z0-9_-]{3,}`. |

Current `dist/` (built today, pre-cutover) for calibration: `llm_proxy_secret` 1 file, `localhost:8787` 1, `/api/llm` 1, `8787` 1; `VITE_LLM_PROXY`, `PROXY_SECRET`, `workers.dev`, `sk-ant-`, `api.anthropic.com` all 0. After the cutover the only allowed hit is the single `removeItem` call. `pnpm build` empties and rewrites `dist/`, so run the guard right after a fresh build; a stale `dist/` from before the change would fail it (correctly).

Why the guard cannot compare against the actual secret value: it would require reading `.env.local`, which is forbidden. The mitigation is at the code level: after deletion no `import.meta.env.VITE_LLM_PROXY_*` reference exists, so Vite inlines nothing; pin that with a source test (no non-binding file under `src/` names `VITE_LLM_PROXY`, and no dynamic `import.meta.env` use: `grep` showed only static `VITE_*` accesses today). A whole-object `import.meta.env` use would inline every `VITE_*` value.

## Code Examples

### One-time credential cleanup (pure, injectable, never throws)
```typescript
// src/legacyCredentials.ts  (called from main.ts before createApp)
export const LEGACY_LLM_SECRET_KEY = 'llm_proxy_secret';
export function clearLegacyLlmCredential(storage?: Pick<Storage, 'removeItem'>): void {
  try {
    (storage ?? localStorage).removeItem('llm_proxy_secret'); // keep the literal inside removeItem(...) so the bundle guard's allowlist matches
  } catch {
    // storage blocked (private mode, disabled): nothing to clear
  }
}
```
Keep the string literal directly inside the `removeItem(...)` call (a `const` holding it may be inlined by the minifier, but do not rely on it); the bundle guard's allowlist keys on that shape. Test with a fake storage: called once with the exact key; does not throw when `removeItem` throws; does not throw when `localStorage` is undefined (node).

### Indicator data module (import-free, server side)
```typescript
// spacetimedb/src/data/llm_indicator_lines.ts  (copy lines from UI-SPEC Copywriting Contract)
export const LLM_INDICATOR_FALLBACK_LINE = 'The Keeper is considering your fate...';
export const LLM_INDICATOR_LINES: Record<string, string | null> = {
  creation_race: 'The Keeper is considering your fate...',
  creation_class: 'The Keeper is deciding what you are good for...',
  world_gen: 'The Keeper is unrolling a map, with visible reluctance...',
  skill_gen: 'The Keeper is weighing what you might become...',
  renown_perk_gen: 'The Keeper is tallying what your name is worth...',
  npc_conversation: 'The Keeper leans in to listen...',
  combat_narration: null,
  smoke_test: null,
};
export const LLM_INDICATOR_PRIORITY = ['world_gen','creation_race','creation_class','skill_gen','renown_perk_gen','npc_conversation'] as const;
```
Server tests: `Object.keys(LLM_INDICATOR_LINES)` equals `LLM_ROUTE_NAMES` (sorted); every non-null line ends with `...` (three ASCII dots), has no `!`, contains none of `KEEPER_BANNED_PHRASES`, matches no `KEEPER_IT_OR_THEY`; priority contains exactly the non-silent routes in the UI-SPEC order; fallback line equals the creation_race line. (`pronoun_rules.test.ts` already scans this directory automatically.)

### Purge reducer for publish 1 (counts only, admin only, idempotent)
```typescript
spacetimedb.reducer('purge_legacy_llm', {}, (ctx: any) => {
  requireAdmin(ctx);
  const counts: Record<string, number> = {};
  for (const name of ['llm_task', 'llm_request', 'llm_budget', 'llm_cleanup_tick'] as const) {
    const ids: bigint[] = [];
    const pk = name === 'llm_cleanup_tick' ? 'scheduledId' : 'id';   // scheduled tables use scheduledId (project memory)
    for (const row of ctx.db[name].iter()) ids.push(row[pk]);
    for (const id of ids) ctx.db[name][pk].delete(id);
    counts[name] = ids.length;
  }
  console.log(`legacy llm purge: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')}`);
});
```
(The recorder/strict mock must be able to serve these accessors; write the test first. Do not access `ctx.db.llm_*` in publish 2.) The CLI identity is in the admin set (Plan 41-15, A1 settled locally).

### Verified publish commands (local only)
```
# publish 1: no table removal, expect "Updated database with name: uwr" (add --break-clients only if it prompts)
spacetime publish uwr --server local
pnpm spacetime:generate -y
spacetime call --server local uwr purge_legacy_llm
spacetime sql --server local uwr "SELECT COUNT(*) AS n FROM llm_cleanup_tick"      # repeat for llm_task, llm_request, llm_budget
# publish 2: expect "Removed table: llm_task / llm_request / llm_budget / llm_cleanup_tick" then "Updated database"
spacetime publish uwr --server local --break-clients
pnpm spacetime:generate -y
spacetime sql --server local uwr "SELECT key_set, key_length FROM admin_llm_status"   # expect true, 108
```
Fallback only if publish 2 is refused (not expected): `spacetime publish uwr --server local --delete-data=always -y` (local only), then the USER runs `node scripts/llm/set-key.mjs`, then the admin smoke test; record the exact line.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Browser calls Cloudflare Worker proxy, submits `submit_llm_result` | Server-side scheduled procedure calls Claude, applies result in its own tx | Phase 41 | Phase 42 deletes the now-idle client half. |
| Docs: "Removing tables" forbidden in automatic migration | 2.10.1 CLI/server: empty tables removable with `--break-clients`; non-empty refused unless data is cleared first | observed 2026-09-30 | Drives the purge-then-drop sequence; docs page at spacetimedb.com/docs/databases/automatic-migrations still lists removal as forbidden. |
| `llm_budget` daily call counter | `llm_player_budget` (cost-weighted, per UTC day) + `llm_spend` ledger | Phase 41 | `incrementBudget` writes are pure dead weight. |

**Deprecated/outdated:** `withModuleName` (CLAUDE.md) does not exist in SDK 2.10; the app uses `withDatabaseName('uwr')` [VERIFIED: 41-15 summary, `src/main.ts`]. Generated snake_case table handles (`dbConn.db.my_bank_slots`) are deprecated aliases of camelCase (`myBankSlots`); both work, and `useCoreData.ts` uses the snake_case style throughout, so match the file unless the planner prefers camelCase for the new line.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The deployed Worker name is `uwr-llm-proxy` (taken from `wrangler.toml`); the user may have deployed under another name/account | Runtime State, user checklist | Checklist command targets the wrong worker; mitigate by telling the user to run `wrangler list`/check the Cloudflare dashboard. |
| A2 | Maincloud holds real rows in `llm_task`/`llm_request`/`llm_budget` (v2.0 usage) and possibly many | Runtime State | The user's maincloud purge reducer call may need batching if row counts are large; single-tx delete is fine for modest counts. |
| A3 | The hosting provider's built bundle includes the proxy secret value the same way the local `dist/` does | Runtime State | If the host builds without the var, exposure is smaller; checklist action is the same. |
| A4 | A subscription with a `WHERE status ...` filter on `my_llm_jobs` would work and bound row growth (not tested; `llm_job` rows are never pruned, so the view grows per player forever) | Pattern 2 / Open Question 3 | If wrong, stick with the plain view subscription (correct, just larger). Recommended default is the plain subscription. |
| A5 | `--break-clients` alone (without `-y`) is sufficient for publish 2 and will not hang on another prompt when stdin is closed | Commands | Observed in the probe (no other prompt). If a prompt appears, answer interactively or add `--yes=migrate`, not `--yes=all`. |

## Open Questions (RESOLVED)

All six are resolved in 42-PLANNING-NOTES.md (items 1-6); the plans follow those resolutions.

1. **RESOLVED: Delete or convert the `submit_llm_result` characterization test?** (convert (planning note 1))
   - What we know: CONTEXT says delete it "because its behavior is covered by the `llm_apply` tests". I checked: `llm_apply.test.ts` (681 lines) covers sender independence, creation state checks, renown validation, number-safety and world-gen failure routing, but NOT NPC-conversation success effects (about 20 cases: quest offers of every type, caps, memory, affinity), combat-narration apply (8 cases), world-gen success writes (starter, non-starter, clamp), creation/skill success happy paths. A grep of the other test files finds no equivalent coverage.
   - What's unclear: whether the user knowingly accepts losing that coverage.
   - Recommendation: convert (keep ~90 tests, drop the wrapper block and budget/task-status rows). This still satisfies success criterion 1 and "unit tests for every behavior". If the user insists on deletion, the planner should say so in the plan and move the NPC and world-gen cases into `llm_apply.test.ts` first. Flag this for plan-checker review.
2. **RESOLVED: Bundle guard vs required cleanup literal.** (allow exactly one removeItem (planning note 2)) Criterion 2 says "no ... key name" in `dist/`, yet the cleanup must contain `llm_proxy_secret`. Recommendation: exact-context allowlist (one `removeItem` occurrence), documented in the script and the roadmap wording ("no proxy secret value, URL or credential read").
3. **RESOLVED: Unbounded `my_llm_jobs` growth.** (accept; retention todo (planning note 3)) `llm_job` rows are never deleted (no retention in the sweeper), so each player's view and subscription grow forever and the mapping scans them all. Recommendation: accept for Phase 42 (correctness unaffected, mapping is linear), note a retention follow-up for Phase 43 or a backlog item; optionally test a filtered subscription on a scratch module (A4).
4. **RESOLVED: Generalize `purge_llm_tasks` or add a new reducer name?** (add purge_legacy_llm (planning note 4)) Recommendation: add `purge_legacy_llm` and delete `purge_llm_tasks` in publish 1, so the log and tests say what it purges (the old name and test strings name only `llm_task`). Either works; the plan must update `llm_admin.test.ts` accordingly.
5. **RESOLVED: `client/` deletion.** (git rm -r client (planning note 5)) Not named in CONTEXT, but it holds the forbidden reducer name and table in 493 tracked files that nothing imports. Recommendation: `git rm -r client` in publish 1 so a repo-wide absence check can be strict; if the planner prefers smallest change, exclude `client/` from the absence scan instead.
6. **RESOLVED: Local `keyValid` is false** (key_set true, length 108 (planning note 6)) (smoke test never ran). Not a blocker for criterion 4 ("local Anthropic key is still set" = `key_set true`, length 108), but the plan should say "set", not "proven", unless the user runs the smoke test.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| spacetime CLI | publish, generate, call, sql | yes | 2.10.1 | - |
| Local SpacetimeDB server | two publishes, purge | installed; **not running** at research time (I started it to read counts, then stopped it; ports 3000/3010/5173/8787 free) | 2.10.1 | executor starts it per run-local skill |
| Node / pnpm | tests, build | yes | pnpm 11.23.0; Node >=22.12 | - |
| vitest | tests | yes | 5.0.2 | - |
| wrangler (inside `llm-proxy/node_modules`) | none for Claude (user-run only) | present but must not be used against the account | 4.x (`wrangler delete [name]` exists, `--dry-run` supported) | user runs `npx wrangler delete uwr-llm-proxy` |
| jsdom / `@vue/test-utils` | component tests | no | - | pure functions + static source guards (project pattern) |

**Missing with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 (root for `src/` and `scripts/`; `spacetimedb/` for server), node environment, no config file (defaults) |
| Config file | none (root `vite.config.ts` only defines the Vue plugin); `scripts/llm/vitest.live.config.ts` is live-only and excluded from default runs |
| Quick run command | `pnpm exec vitest run --maxWorkers=1 <paths>` (root) or `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 <paths>` |
| Full suite command | `CI=true pnpm exec vitest run --maxWorkers=1` (root run also collects the 52 server files); baseline per 41-VERIFICATION: root 57 files / 2245 tests; server alone 52 files / 2161 tests |
| Other gates | `spacetime build -p spacetimedb`; `pnpm build` (vue-tsc + vite); `node scripts/check-bundle.mjs` (after `pnpm build`); `pnpm spacetime:generate -y` then absence scan of bindings |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-02 | `submit_llm_result`, `validate_llm_request`, `purge_*llm*`, `sweep_llm_errors` are not captured reducers after loading `index.ts` | unit (recorder) | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/schema/llm_absence.test.ts` | no, Wave 0 |
| SEC-02 | regenerated bindings contain no `submit_llm_result`/`validate_llm_request`/`purge` reducer files and no reducer param named `resultText` | unit (file scan of `src/module_bindings`) | `pnpm exec vitest run --maxWorkers=1 src/legacyLlmRemoval.test.ts` | no, Wave 0 |
| SEC-02 | apply behavior preserved after wrapper removal | unit (converted characterization) | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/helpers/llm_apply.characterization.test.ts src/helpers/llm_apply.test.ts` | convert existing |
| SEC-03 | `clearLegacyLlmCredential`: removes the exact key, never throws (throwing storage, missing storage), idempotent; `main.ts` calls it before `createApp` (source guard) | unit | `pnpm exec vitest run --maxWorkers=1 src/legacyCredentials.test.ts` | no, Wave 0 |
| SEC-03 | no non-binding file under `src/` or `scripts/` names `VITE_LLM_PROXY`, `useLlmProxy`, `localhost:8787`, `/api/llm`, `submitLlmResult`, `validateLlmRequest`; `llm-proxy/` does not exist; no dynamic `import.meta.env` use | unit (source scan) | `pnpm exec vitest run --maxWorkers=1 src/legacyLlmRemoval.test.ts` | no, Wave 0 |
| SEC-03 | `auditBundle`: flags each forbidden class, allows exactly one `removeItem("llm_proxy_secret")`, rejects `getItem`/`setItem` uses, no false positive on `task-list`, key-shaped positives, missing-dist behavior | unit | `pnpm exec vitest run --maxWorkers=1 scripts/check-bundle.test.mjs` | no, Wave 0 |
| SEC-03 | real built bundle is clean | build + script | `pnpm build && node scripts/check-bundle.mjs` | script is Wave 0 |
| SEC-03 (criterion 3) | `selectLlmIndicator`: active statuses only; silent routes never active (even alone); priority order; tie-break by oldest `createdAt` then lowest `id`; unknown route uses fallback at lowest priority; terminal statuses never active; empty list gives `{active:false,route:null,indicatorLine:null}`; `resolveDisplayedLine` fallback only when locked and no status line | unit | `pnpm exec vitest run --maxWorkers=1 src/composables/useLlmStatus.test.ts` | no, Wave 0 |
| SEC-03 | status set parity with `LLM_ACTIVE_JOB_STATUSES`; indicator keys equal `LLM_ROUTE_NAMES`; voice rules (ellipsis, no `!`, banned phrases, pronoun guard) | unit (server data) | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/data/llm_indicator_lines.test.ts src/data/pronoun_rules.test.ts` | no, Wave 0 (+existing) |
| SEC-03 | client wiring: `useCoreData.ts` subscribes `my_llm_jobs`, no `llm_task`; `App.vue` passes `:llm-indicator-line`, has no `useLlmProxy`; `NarrativeConsole.vue` indicator has `role="status"`, no hard-coded indicator string, reduced-motion rule present; `useLlmStatus.ts` never referenced by `NarrativeInput`'s `disabled` expression | unit (source guards) | `pnpm exec vitest run --maxWorkers=1 src/legacyLlmRemoval.test.ts` | no, Wave 0 |
| SEC-05 | recorder: no tables `llm_task`, `llm_request`, `llm_budget`, `llm_cleanup_tick` (`strictTableSpec(...)` undefined, absent from `__defs`); public `llm_*` set is `[]`; no scheduled reducer `sweep_llm_errors`; `ensureLlmCleanupScheduled` gone | unit | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/schema/llm_privacy.test.ts src/schema/llm_absence.test.ts` | extend + new |
| SEC-05 | purge reducer (P1): admin only (`Admin only` thrown for non-admin, nothing deleted), empties all four tables, counts-only log, idempotent; scheduled table uses `scheduledId` | unit | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/reducers/llm_admin.test.ts` | rewrite existing |
| SEC-05 | `clientConnected` and `initScheduledTables` no longer insert a `llm_cleanup_tick` row | unit (recorder/mock ctx) | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/helpers/llm_absence.test.ts` (or same file) | no, Wave 0 |
| SEC-05 | model-literal allowlist is empty and `llm-proxy/src` not scanned | unit | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/data/model_literals.test.ts src/reducers/llm_cutover.test.ts` | update |
| SEC-05 | two real publishes behave as researched; key survives | manual/scripted (local server) | commands in "Verified publish commands"; capture output lines in the SUMMARY | human-run by executor |

### Sampling Rate
- **Per task commit:** quick command on the touched files (single worker).
- **Per wave merge:** `CI=true pnpm exec vitest run --maxWorkers=1` plus `spacetime build -p spacetimedb`.
- **After each publish:** `pnpm spacetime:generate -y` then `pnpm build`; after the final client task also `node scripts/check-bundle.mjs`.
- **Phase gate:** full suite green, `pnpm build` green, bundle guard green, both publishes recorded, `SELECT key_set, key_length FROM admin_llm_status` shows `true`, `108`, `git status` shows none of the three protected local files staged.

### Wave 0 Gaps
- [ ] `spacetimedb/src/schema/llm_absence.test.ts` (recorder-based absence of tables, reducers, scheduled reducer, cleanup re-arm) - SEC-02, SEC-05
- [ ] `spacetimedb/src/data/llm_indicator_lines.test.ts` and the data module itself - SEC-03 criterion 3
- [ ] `src/composables/useLlmStatus.test.ts` - SEC-03 criterion 3
- [ ] `src/legacyCredentials.test.ts` - SEC-03
- [ ] `src/legacyLlmRemoval.test.ts` (source/bindings scans; reads files with `node:fs` and `@ts-ignore` like `model_literals.test.ts`) - SEC-02, SEC-03
- [ ] `scripts/check-bundle.mjs` and `scripts/check-bundle.test.mjs` - SEC-03
- [ ] Converted `llm_apply.characterization.test.ts` (or an explicit decision to delete) - SEC-02
- Framework install: none (vitest present).

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged) | SpacetimeAuth OIDC, unchanged |
| V3 Session Management | no | - |
| V4 Access Control | yes | admin-only purge via `requireAdmin` (CLI identity in the admin set); `my_llm_jobs` filters by `ctx.sender` via the `by_player` index; no client reducer accepts LLM output after `submit_llm_result` removal |
| V5 Input Validation | low | no new client input; purge takes no arguments |
| V6 Cryptography | yes (secrets) | no credential in the browser; key only in private `llm_config`; never hand-roll; bundle guard plus source scans; treat the proxy secret as burned (it was inlined into past bundles) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged LLM result via `submit_llm_result` (client-trusted apply) | Tampering | delete the reducer; absence tests (recorder and bindings) |
| Credential baked into the JS bundle by Vite env inlining | Information disclosure | no `import.meta.env.VITE_LLM_PROXY_*` reference; `check-bundle.mjs`; rotate/revoke via Worker delete and OpenAI key revocation |
| Stale `localStorage` secret remains on players' machines | Information disclosure | one-time `removeItem` on every load, never throws |
| Purge reducer used to wipe data | Tampering / Elevation | `requireAdmin` first; removed in publish 2; counts-only logging; never logs `llm_config` |
| Subscription leak of other players' jobs | Information disclosure | view is per-sender and projects 6 fields (Phase 40); client maps only `id, route, status, createdAt`; never renders `userMessage`/`errorCode` |
| Accidental key wipe via clear | Denial of service | `--break-clients` only; server refuses data deletion (proven); runbook recovery if a local clear is ever needed |

## Sources

### Primary (HIGH confidence)
- Local empirical probe (2026-09-30): isolated SpacetimeDB 2.10.1 server on 127.0.0.1:3010 with its own data dir and config file, scratch module published under a scratch name; removals of empty plain/public-indexed/scheduled tables succeeded with `--break-clients`; removal of non-empty plain and scheduled tables refused with "Cannot remove table `X`: table contains data..."; other table data survived. Server stopped afterward. The user's `uwr` database and config were not touched by the probe.
- Local `uwr` read-only counts (2026-09-30, server started then stopped): `SELECT COUNT(*)` on `llm_task`, `llm_request`, `llm_budget`, `llm_cleanup_tick`, `llm_job`, `llm_player_budget`, `llm_dispatch`, `llm_sweep_tick`; `admin_llm_status` (`key_set true, key_length 108, key_valid false`). `llm_config` never queried.
- Codebase: `git grep` inventory, `spacetimedb/src/index.ts`, `reducers/llm.ts`, `helpers/llm.ts`, `helpers/llm_apply.ts`, `schema/tables.ts`, `views/llm.ts`, `src/App.vue`, `src/composables/data/useCoreData.ts`, `src/composables/useLlmProxy.ts`, `src/components/NarrativeConsole.vue`, `src/module_bindings/my_llm_jobs_table.ts`, `node_modules/spacetimedb/dist/index.mjs` (`onUpdate`).
- `spacetime publish --help` (2.10.1): `--break-clients` "will NOT force publish if it would cause deletion of any data"; `--yes` values `all, remote, migrate, break-clients, skip-login, delete-data`; `-c/--delete-data[=always|on-conflict|never]`.
- Phase 41 artifacts: 41-15-SUMMARY, 41-18-SUMMARY, 41-REVIEW (Info items), 41-VERIFICATION, 41-VALIDATION.
- `dist/` bundle grep (built 2026-09-30 pre-cutover) for calibration of the guard.

### Secondary (MEDIUM confidence)
- SpacetimeDB docs "Automatic Migrations" (https://spacetimedb.com/docs/databases/automatic-migrations): lists "Removing tables" and "Changing whether a table is used for scheduling" under forbidden changes; contradicted in part by the 2.10.1 behavior observed above (treat the behavior observed on the installed CLI as authoritative for this repo; re-verify if the CLI is upgraded before the maincloud publish).

### Tertiary (LOW confidence)
- Filtered `my_llm_jobs` subscription (A4) and the deployed Worker's name/account (A1).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, nothing new; versions read from node_modules and CLI.
- Architecture (two-publish sequence): HIGH, reproduced on a scratch database with the installed CLI; local data counts read directly.
- Deletion inventory: HIGH for tracked code; MEDIUM for maincloud data and the deployed Worker (not observable).
- Pitfalls: HIGH (each traced to a line of code or a probe result).
- Bundle guard patterns: MEDIUM-HIGH (calibrated on today's `dist/`; real post-cutover output still to be scanned).

**Research date:** 2026-09-30
**Valid until:** 30 days, or until the `spacetime` CLI/SDK is upgraded (re-run the scratch probe before the user's maincloud publish).
