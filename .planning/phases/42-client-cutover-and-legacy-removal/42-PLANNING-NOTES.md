# Phase 42: Orchestrator resolutions for the planner (2026-09-30)

These answer the Open Questions in 42-RESEARCH.md. Pass this file to the gsd-planner along with CONTEXT, RESEARCH, UI-SPEC and 42-EDGE-COVERAGE.md.

1. **Characterization test: convert it, don't delete it.**
   - CONTEXT assumed the llm_apply tests cover this behavior. Research found they don't: this test is the only coverage for NPC-conversation apply, combat-narration apply and most success paths.
   - Convert `submit_llm_result.characterization.test.ts` to drive `applyLlmResult` / `applyLlmFailure` directly.
   - Drop the wrapper describe block and the `llm_budget` / task-status rows.
   - Re-record the snapshot and list the entries that changed in the SUMMARY.
   - This follows the intent of CONTEXT (remove the client-trusted path) while keeping the coverage.
2. **Bundle guard:** allow exactly one `llm_proxy_secret` occurrence, and only inside `localStorage.removeItem(...)`. Every other occurrence fails.
3. **`my_llm_jobs` growth:** accept it for this phase. Add a pending todo for `llm_job` retention and pruning.
4. **Legacy purge:** add a new admin reducer, `purge_legacy_llm`. It clears `llm_task`, `llm_request`, `llm_budget` and `llm_cleanup_tick` and replaces `purge_llm_tasks`. Publish 2 deletes it.
5. **`client/`:** run `git rm -r client`. It holds 493 stale binding files that nothing imports.
6. **Criterion 4 ("the key is still set"):** this means `key_set=true` with `key_length=108` in `llm_admin_state`. `keyValid` is not required, because the user deferred the live proof.
7. **Publishes:** publish locally with `--break-clients` only. Never pass `-y` or `--delete-data`.
   - Purge through the CLI admin identity, then confirm every legacy table's COUNT is 0 before publish 2.
   - Research proved that dropping empty tables succeeds without a clear. A non-empty table is refused.
8. **User checklist:**
   - `wrangler delete uwr-llm-proxy` (the Worker name comes from `llm-proxy/wrangler.toml`; research assumption A1).
   - Revoke the OpenAI key.
   - Remove the `VITE_LLM_PROXY_*` lines from the root `.env.local` and the hosting dashboard.
   - Rebuild and redeploy.
   - Note that the proxy secret was inlined in every past build, so treat it as burned.
