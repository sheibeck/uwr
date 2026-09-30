# Phase 42: Edge Coverage from the spec-less probe fallback

Phase 42 has no SPEC, so plan-phase step 7.95 ran the deterministic edge probe (`edge-probe.cjs`) over SEC-02, SEC-03 and SEC-05. It found 7 applicable edges. The orchestrator resolved each one in auto mode:
- **covered** means the edge goes into the planner's `must_haves.truths`.
- **backstop** means it goes in as `{ statement, verification: backstop }`.

The probe also found no `## Prohibitions` section (PROHIB_ABSENT). The planner therefore runs prohibition recall in its own prompt and writes each result descriptor-less into `must_haves.prohibitions`, per `references/specless-probe-fallback.md` §B/§C.

| Req | Category | Resolution | Truth to author |
|-----|----------|------------|-----------------|
| SEC-02 | idempotency | covered | Re-running either removal publish after it succeeded is a no-op: no migration prompt, no data change. Regenerating the bindings a second time produces no diff. |
| SEC-02 | concurrency | covered | A client still on pre-removal bindings that calls `submit_llm_result` or `validate_llm_request` after publish 1 gets a SpacetimeDB "no such reducer" error. No table changes and no LLM output is applied. |
| SEC-03 | empty | covered | The `llm_proxy_secret` cleanup is a no-op when the key is absent. The app still loads when `localStorage` access throws (the cleanup is in try/catch). A unit test covers the key present, the key absent and storage throwing. |
| SEC-03 | encoding | covered | `scripts/check-bundle.mjs` reads every file under `dist/` (js, css, html, map) as UTF-8 text. It fails on any forbidden token: `llm_proxy_secret`, `VITE_LLM_PROXY`, `PROXY_SECRET`, the proxy host, or a key-shaped string. Its own unit test proves a planted token fails and a clean dist passes. |
| SEC-05 | adjacency | covered | Between publish 1 and publish 2, the legacy tables still exist but no server reader or writer and no client subscription touches them. The game runs and `pnpm build` passes in that intermediate state. |
| SEC-05 | empty | backstop | Dropping the legacy tables works whether they are empty or hold rows. If the local publish refuses the drop, the recorded fallback is a local `--clear-database`, after which the user re-runs `node scripts/llm/set-key.mjs` and the smoke test. |
| SEC-05 | ordering | covered | Publish 1 (remove every reader, writer and subscription, then regenerate bindings) always comes before publish 2 (drop the tables, then regenerate bindings). After publish 2, `spacetime describe` lists no `llm_task`, `llm_request` or `llm_budget` table. |
