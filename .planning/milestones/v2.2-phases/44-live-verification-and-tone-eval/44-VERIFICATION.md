---
phase: 44-live-verification-and-tone-eval
verified: 2026-10-05T14:00:00Z
status: human_needed
score: 3/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps: []
deferred: []
human_verification:
  - test: "Owner decision on 44-TONE-FIXES.md, tone re-run, skl-02 verdict, overall approve (QUAL-01)"
    expected: "Owner approves, in writing, which route-block fixes to apply; a gap-closure plan applies them offline with tests; a fresh cost checkpoint is shown; GOLDEN_LIVE_RUN=rerun GOLDEN_ONLY=<ids> is run with owner spend approval; owner reviews the re-run items, gives skl-02 its first verdict, and records an overall approve (approved: true, approvedBy set) in 44-golden-verdicts.json"
    why_human: "Tone approval is the owner's alone. Current record is status needs_fixes, approved false, 12 fails, 14 passes, skl-02 unrated. Live re-run is operator-approved spend."
  - test: "Paid end-to-end run (44-09), then re-apply the streaming rule (QUAL-02)"
    expected: "Staged harness (prove-live.live.ts) runs all 13 steps on uwr-verify with a real Claude call; 7 domains each get a live verdict; per-route p50/p95/p99 table exists; pronoun and tone check on real replies; streaming rule re-applied to at least 20 ok NPC-chat calls (p95 over 6000 ms makes STREAM-01 a next-milestone candidate)"
    why_human: "Paid live run needs the operator's cost approval and a real key. The owner deferred it. 44-live-results.json is status deferred, 13 of 13 steps not_run, 7 of 7 domains not_run, requirementStatus human_needed."
  - test: "Console token reconciliation (QUAL-02)"
    expected: "User supplies Anthropic Console token totals as text for the golden window (2026-10-05T08:29:21Z to 08:32:10Z) and, once it exists, the end-to-end window; log totals agree within plus or minus 2 percent per category and for the sum"
    why_human: "Only the user can read the Anthropic Console. The owner answered defer. 44-live-reconciliation.json is status deferred for both windows; nothing was compared."
  - test: "Maincloud run from 44-MAINCLOUD-CHECKLIST.md (QUAL-02 maincloud half)"
    expected: "User publishes (two-publish sequence), sets the key with --target maincloud --confirm-maincloud, runs the eight-route smoke test, one call per domain, and the Phase 39 gate re-check, and records the result"
    why_human: "Maincloud actions are user-only by standing rule and the user decided they wait until the end of the milestone. Claude never ran any hosted command."
  - test: "User-eyes and acceptance items in 44-USER-CHECKLIST.md"
    expected: "Section A (Keeper line rotation, browser network tab, staged entry feel, /llm admin commands) and section B (Phase 43 UAT 5 late-reply money logic, UAT 6 max_tokens headroom and stage-2 cap exemption) are checked off by the user"
    why_human: "Visual, feel and acceptance items Claude cannot observe."
---

# Phase 44: Live Verification and Tone Eval - Verification Report

**Phase Goal:** Every domain is proven working with real Claude, every failure class shows the right player-facing behavior, and the owner has signed off on the Keeper's tone
**Verified:** 2026-10-05
**Status:** human_needed
**Re-verification:** No, initial verification

## Verdict in one paragraph

The phase goal is only partly achieved, and the summaries do not hide that. One of three requirements (QUAL-03, failure drills) is proven by evidence I re-checked. The owner explicitly did not approve the tone (QUAL-01), and explicitly deferred the paid end-to-end run, the Console reconciliation and the maincloud leg (QUAL-02). Those are owner decisions, not missing or broken code, so they are recorded as outstanding human items and not as gaps. Nothing deferred, skipped, not run or unmeasured is reported here as passed. Phase 44 must not be closed as complete; REQUIREMENTS.md already says so (QUAL-01 In Progress, QUAL-02 Pending, QUAL-03 Complete), and I agree with that traceability.

## Goal Achievement

### Observable Truths (ROADMAP success criteria plus plan must-haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1a: A golden set of about 25 prompts (5 adversarial) runs with mechanical assertions, and the live run happened only with operator approval | VERIFIED | `scripts/llm/golden_set.mjs`, `golden_rules.mjs`, `golden_run.mjs`, `golden.live.ts` exist. `44-golden-run.json` status `recorded`, 27 items. I ran `golden_rules.test.mjs` (92 passed) and `golden_run.test.mjs` (65 passed). Mechanical result recorded honestly as 14 of 27 passing every rule, 13 failing; no adversarial canary echoed. Spend $0.2604 under the $2.00 cap. |
| 2 | SC1b: The owner reviews live outputs and approves the tone | HUMAN NEEDED (not approved) | `44-golden-verdicts.json`: status `needs_fixes`, `overall.approved` false, `approvedBy` null, 12 failing ids (npc-02, cre-02, cre-04, cre-05, skl-01, skl-03, ren-01, ren-02, cmb-01, adv-1, adv-2, adv-4), 14 passes, skl-02 has no verdict. The owner reviewed, so the review step happened; the approval did not. `44-TONE-FIXES.md` is a proposal only, nothing applied (no route-block change in git). |
| 3 | SC2a: Every domain (creation, world gen, skills, NPC chat, combat narration, renown) is verified end to end locally with a real Claude call | HUMAN NEEDED (deferred, not run) | `44-live-results.json`: status `deferred`, window null, jobs empty, all 13 steps `not_run`, all 7 domains `not_run`, verdict fail, `requirementStatus: human_needed`. The harness exists and was dry-run (44-05, 44-09 preparation), but no domain has a live end-to-end verdict. Single direct-API calls in the golden run are explicitly not a substitute. |
| 4 | SC2b: Per-route latency percentiles are recorded | HUMAN NEEDED (do not exist) | No p50/p95/p99 table exists; `44-live-results.json` `stages` and `timeToPlayableMs` null. The report math (`scripts/llm/call_log_report.mjs`, 43 tests passed) exists, but has no live data to run on. |
| 5 | SC2c: Recorded token totals reconcile with the Anthropic Console | HUMAN NEEDED (deferred, nothing compared) | `44-live-reconciliation.json` status `deferred`; the golden window and the end-to-end window both deferred. Reconcile math (BigInt exact, 2.00 percent passes) is built and tested; no Console numbers supplied. |
| 6 | SC2d: The maincloud run is a manual user action recorded as a user-supplied result | HUMAN NEEDED (user-only, not run) | `44-MAINCLOUD-CHECKLIST.md` exists (102 lines) and is written for the user. No hosted command was run. No user-supplied result recorded yet. |
| 7 | SC3: Failure drills for truncation, refusal, 401, 429, 529, spend cap and timeout each produce the correct player-facing behavior (in-voice message, lock released, budget refunded, no unwanted auto-retry) | VERIFIED | I ran `spacetimedb/src/helpers/llm_failure_drills.test.ts`: 364 passed (7 classes across the five lock-holding routes, local stops, non-lock routes, five edge families). `scripts/llm/drill_rules.test.mjs` 81 passed. `44-live-drills.json` overall `passed`: `bad_key_401`, `ceiling`, `kill_switch`, `tiny_timeout`, `restore_check` all `passed` on `uwr-verify`, each induced state restored. Drill matrix runs through the real failure apply (no production change). |
| 8 | Also recorded: the streaming decision is written into PROJECT.md | VERIFIED (as indicative only) | `.planning/PROJECT.md` lines 73, 149, 187 record the decision, the metric, the rule (at least 20 ok NPC-chat calls, p95 over 6000 ms), and "Measured: n=0". It does not claim an outcome and marks itself pending until the live run. The decision is honest, but it is not data-backed. |

**Score:** 3/8 truths verified (1, 7, 8). Truths 2 through 6 are owner or user deferred items, not failures of code. 0 present-but-behavior-unverified.

### Why these are human_needed and not gaps_found

The orchestrator context, the plan summaries and the run records agree: the owner said no to the tone (needs_fixes), and said defer to the paid run (44-09), the Console reconciliation (44-10) and, by standing rule, maincloud. I looked for evidence that code is missing or broken behind any of them and found none: the harnesses, record schemas, report math, review page and checklists all exist and their tests pass. What is missing is the owner's decision, the owner's spend approval and user-only actions. The one place a code change is pending (route-block edits for tone) is explicitly awaiting the owner's written approval; applying it unprompted would violate the Keeper Bible and tone-approval rules.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/llm/golden_set.mjs`, `golden_rules.mjs` (+ test) | 27 frozen items, mechanical rules | VERIFIED | Present; 92 tests pass |
| `scripts/llm/golden_run.mjs`, `golden_review.mjs`, `golden.live.ts` (+ tests) | Run record, review page, dry-by-default harness | VERIFIED | Present; 65 tests pass; record `recorded` |
| `spacetimedb/src/helpers/llm_failure_drills.test.ts` | Unified drill matrix | VERIFIED | 364 tests pass |
| `scripts/llm/drill_rules.mjs`, `drills.live.ts` | Live drill rules and harness | VERIFIED | 81 tests pass; live record `passed` |
| `scripts/llm/call_log_report.mjs` (+ test) | Percentiles, reconciliation, streaming verdict | VERIFIED (code) | 43 tests pass; no live data yet |
| `scripts/llm/proof_rules.mjs`, `proof_observed.mjs`, `prove-live.live.ts` | Staged live-proof harness | VERIFIED (code only) | Present with tests; never run live |
| `44-golden-run.json` | Golden run record | VERIFIED | status recorded, 27 items |
| `44-golden-verdicts.json` | Owner verdicts | VERIFIED as a record of needs_fixes | Not an approval |
| `44-live-drills.json` | Live drill record | VERIFIED | overall passed |
| `44-live-results.json` | End-to-end record | HONEST DEFERRAL | status deferred, nothing passed |
| `44-live-reconciliation.json` | Console reconciliation | HONEST DEFERRAL | deferred |
| `44-LIVE-RESULTS.md`, `44-TONE-FIXES.md`, `44-USER-CHECKLIST.md`, `44-MAINCLOUD-CHECKLIST.md` | Evidence summary, proposal, user lists | VERIFIED | Present and consistent with the JSON records |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Golden harness | route layers / request builder | `buildRouteLayers`, `buildClaudeRequest`, `assertValidClaudeBody` | WIRED | Pinned by golden_run and golden_rules tests (passing) |
| Failure drill matrix | production failure apply | real `applyLlmFailure` | WIRED | Matrix test runs against the real apply; four inline lines pinned against `llm_apply.ts` source |
| Streaming decision | PROJECT.md | Key Decisions row | WIRED | Row present, marked pending |
| Owner verdict | QUAL-01 closure | `approved: true` in verdicts | NOT WIRED (by owner choice) | `approved` is false |
| Live run | per-domain verdicts, latency table, reconciliation | `44-live-results.json` | NOT RUN | deferred |

### Data-Flow Trace (Level 4)

Not applicable to this phase (no UI components rendering dynamic data). The live-data side (percentile table, reconciliation) has no data source yet because the paid run was deferred; recorded as human item 2.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Failure drill matrix | `npx vitest run spacetimedb/src/helpers/llm_failure_drills.test.ts --maxWorkers=1` | 364 passed | PASS |
| Golden rules (mutation, boundaries, pronouns) | `npx vitest run scripts/llm/golden_rules.test.mjs --maxWorkers=1` | 92 passed | PASS |
| Golden run, record, hygiene | `npx vitest run scripts/llm/golden_run.test.mjs --maxWorkers=1` | 65 passed | PASS |
| Drill rules | `npx vitest run scripts/llm/drill_rules.test.mjs --maxWorkers=1` | 81 passed | PASS |
| Call-log report math | `npx vitest run scripts/llm/call_log_report.test.mjs --maxWorkers=1` | 43 passed | PASS |
| Full suite | not re-run by me (host is memory-constrained) | Orchestrator reports 76 files / 3888 tests green with `--maxWorkers=1` | Reported, not independently confirmed |

### Probe Execution

Step 7c: no `scripts/*/tests/probe-*.sh` probes are declared or exist for this phase. SKIPPED.

### Requirements Coverage

Every requirement ID in the PLAN frontmatter is accounted for, and no ID mapped to Phase 44 in REQUIREMENTS.md is orphaned.

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| QUAL-01 | 44-01, 44-04, 44-07, 44-08 | Golden set (~25, 5 adversarial) with mechanical assertions; live runs operator-approved; owner approves tone | NOT SATISFIED, needs human (owner) | Set, rules, run and review page all built and tested; run recorded. Owner verdict needs_fixes, approved false, skl-02 unrated. REQUIREMENTS.md: unchecked, "In Progress" (correct). |
| QUAL-02 | 44-03, 44-05, 44-09, 44-10 | Every domain verified end to end with a real Claude call locally, per-route latency percentiles, maincloud run manual by the user | NOT SATISFIED, needs human (owner/user) | Tooling built and dry-verified; paid run deferred; no latency table; reconciliation deferred; maincloud not run. REQUIREMENTS.md: unchecked, "Pending" (correct). |
| QUAL-03 | 44-02, 44-06 | Failure drills (7 classes) each produce the correct player-facing behavior | SATISFIED | Unit matrix (364) re-run and passing; live drills record `passed`. REQUIREMENTS.md: checked, "Complete" (correct). |

Orphaned requirements: none (grep of REQUIREMENTS.md shows only QUAL-01 to QUAL-03 for Phase 44).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `scripts/llm/*`, `llm_failure_drills.test.ts` | - | TBD/FIXME/XXX debt markers | none found | Clean |
| Phase files | - | `sk-ant` string | Info | Hits are only negative assertions in hygiene tests (`not.toMatch(/sk-ant.../)`) and a description line in RESEARCH.md; no key-shaped string stored |
| Git working tree | - | Uncommitted changes | none | Clean |

### Human Verification Required

#### 1. Tone fixes, re-run, skl-02 verdict, owner approve (QUAL-01)

**Test:** Decide on `44-TONE-FIXES.md` (Fix 1 first-person Keeper voice and story-like prose; Fix 2 range violations: state budgets in route prompts, or accept the clamp; Fix 3 cmb-01 "a woman" and npc-02 exclamation; Fix 4 adv-4 refusal fallback wording). Have the approved route-block edits applied offline with tests, then approve the cost checkpoint and run `GOLDEN_LIVE_RUN=rerun GOLDEN_ONLY=<ids>`. Review the re-run items and give skl-02 its first verdict, then give the overall approve.
**Expected:** `44-golden-verdicts.json` shows `approved: true` with an approver recorded; 12 prior fails resolved or waived in writing by the owner.
**Why human:** Tone approval and spend approval belong to the owner. Note the fixes are only proposed; nothing in `llm_layers.ts` was changed.

#### 2. Paid end-to-end run and streaming rule (QUAL-02)

**Test:** After a fresh cost checkpoint (worst-case bound recorded as $0.7828 over 39 planned calls), run the staged harness on `uwr-verify`.
**Expected:** 13 steps recorded, 7 domain verdicts, per-route p50/p95/p99, stage timings and time to playable, pronoun and tone check on real replies; then re-apply the streaming rule (at least 20 ok NPC-chat calls; p95 over 6000 ms opens STREAM-01) and update the PROJECT.md row.
**Why human:** Paid call, operator approval, and the owner deferred it.

#### 3. Console reconciliation (QUAL-02)

**Test:** Paste Console token totals as text for the golden window and the end-to-end window.
**Expected:** Within plus or minus 2 percent per category and for the sum.
**Why human:** Only the user can read the Console.

#### 4. Maincloud (QUAL-02)

**Test:** Follow `44-MAINCLOUD-CHECKLIST.md` at the end of the milestone and report results.
**Expected:** Publish, key step, eight-route smoke, one call per domain, Phase 39 gate re-check all pass.
**Why human:** Maincloud is user-only.

#### 5. User checklist (`44-USER-CHECKLIST.md`)

**Test:** Sections A (Keeper line rotation, browser network tab, staged-entry feel, `/llm` admin commands) and B (Phase 43 UAT 5 and 6 acceptance).
**Expected:** Checked off by the user.
**Why human:** Visual, feel and acceptance items.

### Gaps Summary

No code gaps. Everything built (golden set and rules, run and review tooling, drill matrix, live-drill harness, staged proof harness, report and reconciliation math, checklists) exists, is wired and passes the tests I re-ran. The phase goal is not yet achieved, because three of its four claims depend on owner and user actions that have not happened:

- Tone is not signed off (QUAL-01): needs_fixes, 12 fails, skl-02 unrated, fixes proposed but unapplied, response shape deferred to the UX overhaul (backlog 999.6).
- "Every domain proven with real Claude" (QUAL-02): the paid end-to-end run was deferred; there is no per-domain live verdict and no latency percentile table. The streaming decision is indicative (n=0).
- Reconciliation and maincloud (QUAL-02): deferred and user-only respectively.

Only the failure-drill claim (QUAL-03) is fully proven.

One observation for the owner, not a gap: the mechanical result of the golden run (13 of 27 failing rules, 8 of them range_violation that the server clamp already neutralises) shows the model is not told the numeric budgets. That is Fix 2 in `44-TONE-FIXES.md` and awaits the owner's choice between stating the budgets, accepting the clamp, or both.

---

_Verified: 2026-10-05_
_Verifier: Claude (gsd-verifier)_
