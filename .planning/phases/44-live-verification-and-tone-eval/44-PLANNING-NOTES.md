# Phase 44: Orchestrator resolutions for the planner (2026-10-01)

These answer the Open Questions in 44-RESEARCH.md and override RESEARCH and CONTEXT where they differ. Pass this file to the planner along with CONTEXT, RESEARCH and 44-EDGE-COVERAGE.md.

1. **Scratch DB.** The user chose this on 2026-10-01. Every live run and drill uses a separate local database named `uwr-verify`, never `uwr`.
   - Publish the module to it locally.
   - `set-key.mjs` gets an allowlisted, local-only `--db` option. The allowlist is `uwr` and `uwr-verify`, and the server is always `local`.
   - The real key goes into `uwr-verify` by the script, reading `spacetimedb/.env.local` in-process. Never print the key.
   - The 401 drill uses a fake key on `uwr-verify` only. The user's `uwr` key, ceiling, kill switch and characters are never touched.
   - A clear of `uwr-verify` only is allowed, if a drill or the timeout publish needs one.
2. **Golden set size.** Keep 27 items: the 22 weighted items plus 5 adversarial. Show the table at the first checkpoint.
3. **Streaming metric.** `llm_call_log.latency_ms` decides, matching `/llm stats` and Phase 43. Job end-to-end time is reported alongside. Collect at least 20 NPC turns. If the NPC-chat p95 is over about 6 s, record streaming in PROJECT.md as a next-milestone candidate, with the numbers. Build nothing.
4. **Console access.** At the Console checkpoint, the user pastes the totals for the four token fields over the run windows, waiting at least 10 minutes after the run first. If the user defers, reconciliation is recorded as deferred, not passed.
5. **Tone fixes.** Prefer route-block edits. Do NOT edit the Keeper Bible (`keeper_bible.ts`) unless the user explicitly approves at the tone checkpoint; the user approved it verbatim in Phase 40, and editing it changes the cache prefix. After fixes, re-run only the failed items, and only with approval.
6. **Browser-only items.** UAT 3 (line rotation on screen) and the browser network-tab check are listed in the user checklist as user-eyes items. They do not block the plans.
7. **Review page.** The executor writes a self-contained HTML file plus scrubbed data, using `textContent` only.
   - Executors do NOT have the Artifact tool. The plan must hand off at a checkpoint: "orchestrator publishes `<path>` with `capabilities: {db: {}}` and reads back the verdicts".
   - The page writes `verdicts/<id>` and `verdicts/overall` docs, and has a "Copy verdict JSON" paste fallback.
   - The checkpoint then records the verdicts into a committed file.
8. **Spend.**
   - Every paid step is its own `checkpoint:human-verify` with cost shown, and runs only after the user approves.
   - The per-run cap is $2, with a stop at $1.80.
   - Total expected spend is about $0.7–1.5.
   - Paid harnesses default to dry mode.
9. **Phase 41 and 43 deferred items absorbed.**
   - The Phase 41 local live proof and the pronoun check on real replies are absorbed.
   - Phase 43 UAT 1–2 timing comes from the harness.
   - Phase 43 UAT 5–6 become acceptance items recorded in the verification.
   - Maincloud (Phase 41 checklist, Phase 42 E, Phase 43 checklist) stays user-only. It is deferred to the end of the milestone by the user.
10. **Speed.** The user asked to speed things up.
    - Keep the plan count lean: merge small Wave 0 pieces where files don't conflict.
    - The pattern-mapper step is skipped. Research's reuse map is the analog source.
