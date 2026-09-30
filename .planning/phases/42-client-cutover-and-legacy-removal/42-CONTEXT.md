# Phase 42: Client Cutover and Legacy Removal - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning

<domain>
## Phase Boundary

When this phase is done, the browser holds no LLM credential and no LLM plumbing, and the client reads only its own job status through `my_llm_jobs`. The old v2.0 pipeline is gone: the `llm_task` and `llm_request` tables, the `submit_llm_result` reducer (which trusted client-supplied results), `validate_llm_request`, the `llm-proxy/` Cloudflare Worker and `useLlmProxy`.

The executor-side work is already in place from Phase 41, where every domain runs on the scheduled `llm_run` procedure. This phase handles the client cutover, the deletions and the guards. Requirements: SEC-02, SEC-03, SEC-05.

</domain>

<decisions>
## Implementation Decisions

### Legacy removal and publishing
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

### Player-facing status (`useLlmStatus`)
- **Indicator source:** a new `useLlmStatus` composable reads ONLY the `my_llm_jobs` view. The "Keeper is working" indicator is on when any of the player's jobs is `pending`, `in_flight` or `received`, except `combat_narration`, which stays silent and never looks like waiting.
- **Input locking:** only character creation and world generation lock the narrative input, as they do today through their own state rows. NPC replies, skill offers and renown perks run in the background while the player keeps playing. A duplicate request gets the server's in-voice "already considering" line.
- **Failures:** the server already posts an in-voice Keeper line to the player's log (`applyLlmFailure`), so the client only clears the indicator. There is no error chip, and the coarse `errorCode` bucket is not shown in the UI.
- **Wording:** one short in-voice line per route, for example NPC "…leans in to listen" and skill "…weighs what you might become". Keep the lines in a shared data table on the server data side, per the project rule that the server is the source of truth for constants. They must follow the in-game pronoun rule (see Specific Ideas).
- No subscription to `llm_task` or `llm_request` remains anywhere in the client.

### Credential cleanup and guards
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

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- The `my_llm_jobs` view (Phase 40, `spacetimedb/src/views/llm.ts`) returns 6 fields per job, with `errorCode` as a coarse bucket. Its client binding `my_llm_jobs_table.ts` already exists.
- `spacetimedb/src/helpers/llm_status.ts` has `keeperMessageForJob` and `publicErrorBucket`, the server-side wording that per-route indicator lines can sit next to.
- Phase 41 added `docs/runbooks/llm-key.md` (key runbook) and `scripts/llm/set-key.mjs` (key setup over HTTP).

### Established Patterns
- Client data comes from `src/composables/data/useCoreData.ts`, through `subscriptionBuilder` SQL plus `rebind(dbConn.db.<table>, ref, iter)`. `llm_task` is subscribed there today at lines 37, 70, 113 and 154.
- `App.vue` wires `useLlmProxy({ llmTasks, ... })` at lines 737–740. Line 40 computes `isLlmProxyProcessing`, and it feeds `NarrativeConsole`'s `is-llm-processing` prop (lines 40, 64, 1152, 1170, 1244).
- `NarrativeConsole.vue` shows "The Keeper is considering your fate..." when `isLlmProcessing` is true (lines 92–94) and disables `NarrativeInput` (line 107).
- `useCharacterCreation` (`isCreationLlmProcessing`) and `useWorldGeneration` (`isWorldGenProcessing`) derive their busy state from their own state rows. Keep those as the input locks.
- `useNpcConversation.ts` comments still describe the proxy flow (lines 7–8, 25). Update them.

### Integration Points
- Server: `spacetimedb/src/schema/tables.ts`
  - `LlmRequest` (line ~1899) and `llm_task` (line ~2108), with schema export lines ~2373 onward.
  - `spacetimedb/src/index.ts:357` iterates `llm_request` in a cleanup.
  - `spacetimedb/src/reducers/llm.ts:105` defines `validate_llm_request`.
- Tests that reference the legacy tables: `llm_privacy.test.ts`, `schema_recorder.test.ts`, `llm_apply.test.ts`, `renown_llm.test.ts`, `combat_narration.test.ts`, `llm_cutover.test.ts` and the characterization test. Each must be updated to assert absence, not deleted blindly.
- Client files: `src/App.vue`, `src/composables/data/useCoreData.ts`, `src/composables/useLlmProxy.ts` (delete) and `src/composables/useNpcConversation.ts`.
- Bindings are regenerated with `pnpm spacetime:generate -y` after each publish. Success criterion 1 requires that the bindings contain no `submit_llm_result`.

</code_context>

<specifics>
## Specific Ideas

- **In-game pronoun rule (user, 2026-09-30):**
  - The Keeper is male (he/his, never it/its/they).
  - Every NPC or humanoid person is male or female (he or she).
  - The player's own character is always addressed as "you".
  - Beasts and monsters may be "it".
  - Every new indicator line or player-facing string in this phase must follow this. Phase 41 plan 41-18 does the main sweep.
- The user's uncommitted local files are never staged: `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png`.
- Publishes are local only. No pushes to master.

</specifics>

<deferred>
## Deferred Ideas

- A GitHub workflow step that runs the bundle guard on every push. The user chose local and phase verification only for now.
- A visible error chip that shows the job's error bucket. Not wanted, because the server's in-voice line covers failures.

</deferred>
