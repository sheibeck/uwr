---
phase: 51
slug: ledger-screens-world-and-people
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-07
---

# Phase 51 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 51-RESEARCH.md "Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 5.0.2 (client and server in the root run), @vue/test-utils 2.5.1, happy-dom 20.14.5 |
| **Config file** | `vite.config.ts` (alias `@game-data`); per-file `// @vitest-environment happy-dom` |
| **Quick run command** | `npx vitest run <touched test files>` (for example `npx vitest run src/map/graphLayout.test.ts`) |
| **Full suite command** | `npx vitest run` plus `npx vue-tsc -b` (ignore the baseline failures `scripts/llm/call_log_report.test.mjs`, `scripts/llm/proof_rules.test.mjs`, `spacetimedb/src/helpers/measurement.results.test.ts`) |
| **Estimated runtime** | ~180 seconds (full), ~10 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** Run the quick command scoped to the touched test files
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite must be green apart from the baseline failures
- **Max feedback latency:** 30 seconds (quick)

---

## Per-Task Verification Map

Filled in by the planner and executors per plan. Requirement-level map:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| LDG-04 | Visited upsert, from-location, my view only the active character's rows | server unit | `npx vitest run spacetimedb/src/helpers/visited.test.ts spacetimedb/src/views/visited.test.ts` | ❌ W0 | ⬜ pending |
| LDG-04 | Known places (visited, current, heard-of neighbours, known regions) | unit | `npx vitest run src/map/knownPlaces.test.ts` | ❌ W0 | ⬜ pending |
| LDG-04 | Deterministic graph layout, borders, gates, SVG endpoints | unit | `npx vitest run src/map/graphLayout.test.ts` | ❌ W0 | ⬜ pending |
| LDG-04 | Node states, legend, danger bands, list view, roving tabindex | unit + component | `npx vitest run src/map/danger.test.ts src/map/MapScreen.test.ts` | ❌ W0 | ⬜ pending |
| LDG-04 | Region chips, timer locks from the server row only | unit + component | `npx vitest run src/map/regionChips.test.ts src/map/travelTimer.test.ts` | ❌ W0 | ⬜ pending |
| LDG-04 | Passage node redraw after collapse | component | `npx vitest run src/map/passageRedraw.test.ts` | ❌ W0 | ⬜ pending |
| LDG-04 | Passage collapse and guarded sweep | server real-handler | `npx vitest run spacetimedb/src/helpers/passages.test.ts spacetimedb/src/reducers/passage_sweep.integration.test.ts spacetimedb/src/reducers/scheduled_guard.integration.test.ts` | ❌ W0 / extend | ⬜ pending |
| LDG-05 | Shared travel cost helper equals performTravel; client import via `@game-data` | server + alias | `npx vitest run spacetimedb/src/data/travel_config.test.ts src/gameDataAlias.test.ts` | ❌ W0 / extend | ⬜ pending |
| LDG-05 | Detail model and travel checks, one Travel button, far places path only | unit | `npx vitest run src/map/detailModel.test.ts src/map/travelChecks.test.ts` | ❌ W0 | ⬜ pending |
| LDG-05 | Travel via moveCharacter and the action runner; after-travel state | component | `npx vitest run src/map/DetailPanel.test.ts` | ❌ W0 | ⬜ pending |
| LDG-05 | Look at a neighbour place and the bind stone | server real-handler | `npx vitest run spacetimedb/src/reducers/look_intent.test.ts spacetimedb/src/helpers/examine.test.ts` | extend | ⬜ pending |
| LDG-05 | Rail exits panel, rail rows (Examine eye, Talk, bind row), party stamina | component | `npx vitest run src/rails src/frame/LocationRow.test.ts` | ❌ W0 / extend | ⬜ pending |
| LDG-04/05 | Mobile Map sheet with Map and Here tabs, 44px targets | component + source | `npx vitest run src/map/MapSheet.test.ts src/frame/AppFrame.screens.test.ts` | ❌ W0 / extend | ⬜ pending |
| LDG-04/05 | Design guards (tokens, `<svg` only in src/map/, scale, Phosphor, no v-html, escape, banned word) | guard | `npx vitest run src/styles src/frame/frameContract.test.ts spacetimedb/src/data/no_ripple_word.test.ts` | extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Server test files: `visited.test.ts`, `views/visited.test.ts`, `passages.test.ts`, `passage_sweep.integration.test.ts`, `travel_config.test.ts`
- [ ] `src/map/*.test.ts` for every pure helper and component
- [ ] Update `scheduled_guard.integration.test.ts`, `designContract.test.ts`, `frameContract.test.ts`, `gameDataAlias.test.ts`, `screens.test.ts`, `AppFrame.screens.test.ts`, `railsShell.test.ts`, `nearby.test.ts`, `keywords.test.ts`
- Framework install: none (vitest present)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Map reads well at 1280 and 390×844 | LDG-04 | visual layout | Deferred to the end-of-milestone UAT: open the Map, pick places, travel, cross a border |
| Passage collapses in a live world | LDG-04 | needs a real uncharted crossing (paid LLM call) | Deferred UAT with owner go-ahead |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
