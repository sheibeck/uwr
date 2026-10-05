# Phase 43: Orchestrator resolutions for the planner (2026-09-30)

These answer the Open Questions in 43-RESEARCH.md. Pass this file to the gsd-planner along with CONTEXT, RESEARCH and 43-EDGE-COVERAGE.md. Where they differ, these resolutions override RESEARCH and CONTEXT. No UI-SPEC exists by user decision (see the "UI scope" section of 43-CONTEXT.md).

1. **`/llm stats` is a reducer, not a view.**
   - Views cannot `.iter()`, and `llm_call_log` has no route or time index.
   - The reducer runs `requireAdmin` first, scans `llm_call_log`, and writes one plain-text `system` event to the admin's console.
   - The output must contain no `[` or `<`, because `NarrativeMessage` uses `v-html` and would turn `[x]` into a link.
   - Record this as the interpretation of CONTEXT's word "view".
2. **Kill-switch and ceiling refusals reuse the `failed` status at claim time.**
   - They go through the existing `failAtClaim` refund-and-notify path, using new codes `halted` and `ceiling`.
   - The domain lock releases in the same transaction.
   - Both refusals share one in-voice "the Keeper is resting" line, with no numbers.
   - Record this as the interpretation of CONTEXT's "expire with refunds".
3. **The measurements file lives at `spacetimedb/src/data/llm_measurements.json`, not in the phase directory.**
   - Milestone archiving moves `.planning/phases/`, which would break the traceability test.
   - `data/llm_tuning.ts` holds the tuned per-route effort and `max_tokens`. A unit test proves every tuned value traces to an entry in that JSON.
   - Any route without enough samples keeps its current values and is marked "insufficient data" (see 43-EDGE-COVERAGE.md).
4. **The paid sweep is a `checkpoint:human-verify` plan with explicit cost approval.**
   - The user deferred the earlier live proofs, so execution stops at the checkpoint before any real Anthropic call.
   - The checkpoint shows the estimated cost (about $0.9, range $0.5–1.5) and confirms the key is present (`key_set` true via `admin_llm_status`; never print the key).
   - It must not run until the user answers.
   - Plans before the sweep must not depend on its results: code, harness, ceiling, kill switch, staging and stats all ship and test offline.
   - The plan that applies tuned values comes after the sweep.
   - If the user declines or defers the sweep, the phase still completes. Every route keeps its current values, marked "insufficient data", and LAT-01/LAT-02 live evidence is deferred to Phase 44, the same way Phase 41's live proof was.
   - The harness calls `buildClaudeRequest` directly, overriding only effort and `max_tokens`, as research recommends. It must stay within the existing per-run cost guard and print no key material.
5. **`/llm` is handled in `submit_command` only.** Parity in `submit_intent` is out of scope.
6. **Retiring the $2 phase cap is deliberate and explicit.**
   - It affects the smoke test, the `phaseCapMicroUsd` field of `admin_llm_status`, `scripts/llm/proof_rules.mjs`, and the pinned tests research lists.
   - Each pinned test is flipped on purpose, with the reason written into the plan.
   - The `llm_spend` ledger stays as the all-time record.
   - Changing a view's row type is allowed: research's scratch probe showed view add and change publish without a clear.
7. **Schema changes must publish without `--clear-database`.**
   - Only additive changes research proved safe: new tables, new btree indexes, and new columns with `.default(...)`.
   - No `.optional()` column without a default. No dropped columns. No changed column types.
   - The user's real Anthropic key is stored locally and a clear would wipe it.
   - The local publish uses `pnpm spacetime:publish` (= `--server local`) with `--break-clients` only if the CLI asks, never `-y`, `--delete-data` or `--clear-database`.
   - If a publish is refused, execution stops and returns to the user.
   - Never maincloud.
8. **LAT-06 (parallel archetype classes) follows a decision rule.**
   - Implement it only if the recorded post-staging class-reveal p50 is over 10 s.
   - If the sweep is declined, or the p50 is 10 s or less, record the decision and its number in the measurements file and leave parallel generation out.
   - Research predicts about 3–5 s, so the default plan path is "measured and left out".
9. **The shared test mock needs a seeded default state row.**
   - A missing kill-switch/ceiling row fails closed, so seed a default row in the shared mock.
   - Otherwise every existing enqueue test breaks.
