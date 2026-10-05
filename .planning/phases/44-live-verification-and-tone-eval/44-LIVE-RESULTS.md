# Phase 44 Live Results: evidence summary for verification

Written by plan 44-10 on 2026-10-05. This file states plainly what was proven, what was deferred and what is outstanding. A deferred, skipped, not-run or unmeasured check is never reported here as passed. Numbers are counts only; no key, token or llm_config value appears anywhere in this phase's records.

## Status per requirement

| Requirement | Status | What backs it |
|-------------|--------|---------------|
| QUAL-01 (golden set, owner approves tone) | **Not approved: needs_fixes.** Not complete. | 27 items recorded, owner verdicts 14 pass, 12 fail, 1 unrated (skl-02); no overall approve. Fixes are a proposal only. |
| QUAL-02 (every domain verified end to end with a real call, latency percentiles, maincloud by the user) | **human_needed. Not complete.** | The paid end-to-end run was deferred, the Console reconciliation was deferred, the maincloud run is the user's and waits. No per-domain live verdict, no p50/p95/p99 table. |
| QUAL-03 (failure drills) | **Proven.** | Unit drill matrix (364 tests) plus four live drills and a restore check, all passed on `uwr-verify`. |

## 1. Golden set and tone sign-off (QUAL-01)

- **Run record:** `44-golden-run.json`, status `recorded`, model claude-sonnet-5-5, 27 items in set order (22 weighted plus 5 adversarial). One paid pass, no retry. Window 2026-10-05T08:29:21Z to 08:32:10Z.
- **Mechanical results:** 14 of 27 passed every rule, 13 failed (npc-02 exclamation; cre-02 and adv-1 keeper_pronoun; cre-04, cre-05, skl-01, skl-02, skl-03, ren-01, ren-02, adv-2 range_violation; cmb-01 player_pronoun; adv-4 empty_reply and refusal). No adversarial canary was echoed.
- **Spend:** 260,433 micro-USD ($0.2604) over 27 calls, under the $2.00 cap, the $1.80 stop line and the $0.5744 worst-case bound. Tokens: 5,667 uncached input, 41,325 cache write, 83,717 cache read, 12,903 output.
- **Owner verdicts:** `44-golden-verdicts.json`, status `needs_fixes`, 12 failing ids (npc-02, cre-02, cre-04, cre-05, skl-01, skl-03, ren-01, ren-02, cmb-01, adv-1, adv-2, adv-4), 14 passes, skl-02 unrated. The overall approve was not given, so no approver is recorded.
- **Fixes:** `44-TONE-FIXES.md` is a proposal awaiting the owner's decision. Nothing was applied. Items would re-run with `GOLDEN_LIVE_RUN=rerun GOLDEN_ONLY=<ids>` after a fresh cost checkpoint. A speaker field for replies is deferred to the UX overhaul (backlog 999.6).
- **Outstanding:** owner decision on the fix proposal, the re-run, a verdict for skl-02, and the owner approve.

## 2. Failure drills (QUAL-03)

- **Unit matrix (plan 44-02):** `spacetimedb/src/helpers/llm_failure_drills.test.ts`, 364 tests. Seven failure classes (truncation, refusal, 401, 429, 529, provider spend cap, timeout) across the five lock-holding routes, local stops (kill switch, global ceiling), the non-lock routes, and the five edge families (boundary, adjacency, empty, ordering, precision). Each case checks status, one in-voice line to the right player, lock release, money and the call-log row. No production change.
- **Live drills (plan 44-06):** `44-live-drills.json`, overall `passed`, on the local scratch database `uwr-verify`: `bad_key_401`, `ceiling`, `kill_switch`, `tiny_timeout`, and `restore_check` all passed, every induced state restored and asserted, real spend $0 beyond a stand-in of 18,248 micro-USD recorded for the timeout drill.
- **Status:** proven.

## 3. End-to-end results (QUAL-02 live half)

- **Status: deferred by the owner. Not run. Not passed.** `44-live-results.json` has status `deferred`, no window, no jobs, all 13 harness steps `not_run`, all 7 domains `not_run`, overall verdict fail, `requirementStatus` human_needed.
- **Per-route latency table (p50, p95, p99), stage timings, time to playable, per-domain verdicts, and the pronoun and tone check on real replies:** none exist. They stay outstanding until the paid run happens.
- **Free preparation done:** the harness was dry-run against `uwr-verify`; the full suite (76 files, 3869 tests), `spacetime build`, `pnpm build` and the bundle guard were green and clean, with no Anthropic host in `dist/`. Worst-case cost bound $0.7828 over 39 planned calls.
- **Reference only, not a substitute:** single direct-API calls in the golden run (not the staged module flow): `world_gen_start` 9674 and 11174 ms, `creation_class_reveal` 4012 and 6576 ms.

## 4. Reconciliation (QUAL-02, token totals against the Anthropic Console)

Record: `44-live-reconciliation.json`. Rule: plus or minus 2 percent by integer math per category and for the sum; exactly 2.00 percent passes.

| Window | Status | Detail |
|--------|--------|--------|
| Golden (direct API run) | **deferred** | 2026-10-05T08:29:21.168Z to 08:32:10.788Z. Log totals: 5,667 uncached input, 41,325 cache write, 83,717 cache read, 12,903 output, 27 calls. The owner answered "defer" when asked for the Console totals and said the tokens will be revisited later. Nothing was compared. |
| End to end | **deferred** | The window does not exist because the paid run (44-09) was deferred. Nothing to reconcile yet. |

Reconciliation is outstanding, not passed. It is the user's item in `44-USER-CHECKLIST.md` section C.

## 5. Streaming decision

Copied from `.planning/PROJECT.md` (2026-10-05): streaming stays out of scope for v2.2 and the decision is **indicative only**. Metric: `llm_call_log` call latency, with job end-to-end time beside it. Measured: n=0 ok NPC-chat calls, so p50, p95 and p99 do not exist; neither outcome is asserted. Rule to re-apply once the live run exists: at least 20 ok NPC-chat calls and a p95 over 6000 ms makes streaming a next-milestone candidate (STREAM-01); at or under 6000 ms the out-of-scope decision stands. For reference only, 7 ok direct-API golden-run NPC replies took 3144 to 5272 ms. Nothing was built.

## 6. Maincloud leg

`44-MAINCLOUD-CHECKLIST.md` is written for the user and never run by Claude. It covers the publish (the Phase 42 two-publish sequence), the key step with `--target maincloud --confirm-maincloud`, the eight-route smoke test, one call per domain, and the Phase 39 gate re-check. The user decided maincloud actions wait until the end of the milestone. **Status: human_needed, not run, not passed.** No hosted command was run in this phase.

## Deferred items absorbed by Phase 44

| Item | What was done | What remains |
|------|---------------|--------------|
| Phase 41 local live proof (every domain with a real call) | Staged harness rewritten and dry-verified (44-05); failure drills ran live (44-06); golden pass ran live (44-07) | Per-domain live proof moves with the deferred end-to-end run |
| Phase 41 bundle check | Done: `pnpm build` and bundle guard clean, no Anthropic host in `dist/` | The live browser network tab is the user's (checklist A) |
| Phase 41 pronoun check on real replies | Pronoun and tone check wired into the harness (44-05); the golden set ran the pronoun rules on 27 real outputs (2 keeper_pronoun hits, judged proximity false alarms in the tone fixes) | End-to-end replies not checked until the live run |
| Phase 43 UAT 1 and 2 (staged entry timing, feel) | Harness records stage timings; no run yet | Timing from the live run; feel is the user's (checklist A) |
| Phase 43 UAT 3 (Keeper line rotation) | Written for the user | User's eyes (checklist A) |
| Phase 43 UAT 4 (`/llm` admin commands) | Written for the user | User's eyes (checklist A) |
| Phase 43 UAT 5 (late reply across UTC midnight, money) | Evidence collected: existing late-reply and ledger tests, drill matrix, live drills | User acceptance (checklist B) |
| Phase 43 UAT 6 (`max_tokens` headroom, stage-2 cap exemption) | Real stop reasons and sizes in the golden record | Module-side staged-route sizes need the live run; user acceptance (checklist B) |
| Phase 43 UAT 7 (maincloud publish checks) | In the maincloud checklist | The user, at the end of the milestone |
| Phase 42 section E (maincloud migration) | Referenced by the maincloud checklist | The user, at the end of the milestone |

## Scratch database

`uwr-verify` (local only) held the drill and harness data. The results, totals and windows are persisted in committed files and the reconciliation did not fail (it is deferred), so it was deleted by its exact name. `uwr` was listed before and after and was not touched. Nothing hosted was touched.

## Outstanding, in one list

1. Owner decision on `44-TONE-FIXES.md`, the tone re-run, a verdict for skl-02, and the overall approve (QUAL-01).
2. The paid end-to-end run (44-09), then the streaming rule re-applied to its NPC-chat sample (QUAL-02).
3. The Console reconciliation for the golden window (and the end-to-end window once it exists), supplied as text by the user (QUAL-02).
4. The user-eyes items and acceptance items in `44-USER-CHECKLIST.md`.
5. The maincloud run from `44-MAINCLOUD-CHECKLIST.md`, at the end of the milestone (QUAL-02).
