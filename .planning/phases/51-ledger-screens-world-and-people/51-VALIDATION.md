---
phase: 51
slug: ledger-screens-world-and-people
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: true
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

Per-task map (plans 51-01 to 51-11, one row per task). Every command was green in the 51-11 phase gate run of 2026-10-07: the full `src` suite (187 files, 4208 tests), the full module suite (126 files, 4896 tests), `vue-tsc -b`, and the guard run (9 files, 236 tests) cover each vitest command listed here; the 51-03-T3 checks were re-run on their own.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 51-01-T1 | 51-01 | 1 | LDG-04, LDG-05 | server unit + alias | `cd spacetimedb && pnpm exec vitest run src/data/travel_config.test.ts --maxWorkers=1 && cd .. && pnpm exec vitest run src/gameDataAlias.test.ts --maxWorkers=1` | ✅ | ✅ green |
| 51-01-T2 | 51-01 | 1 | LDG-04, LDG-05 | server real-handler | `cd spacetimedb && pnpm exec vitest run src/helpers/visited.test.ts src/views/visited.test.ts src/reducers/travel_visited.integration.test.ts src/views/vendor_buyback.test.ts src/reducers/look_intent.test.ts --maxWorkers=1` | ✅ | ✅ green |
| 51-01-T3 | 51-01 | 1 | LDG-04, LDG-05 | server real-handler | `cd spacetimedb && pnpm exec vitest run src/helpers/examine.test.ts src/reducers/look_intent.test.ts --maxWorkers=1` | ✅ | ✅ green |
| 51-02-T1 | 51-02 | 1 | LDG-04 | guard + unit | `pnpm exec vitest run src/map src/styles/designContract.test.ts src/frame/frameContract.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 51-02-T2 | 51-02 | 1 | LDG-04 | unit | `pnpm exec vitest run src/map --maxWorkers=2` | ✅ | ✅ green |
| 51-03-T1 | 51-03 | 2 | LDG-04 | server real-handler | `cd spacetimedb && pnpm exec vitest run src/helpers/passages.test.ts src/reducers/travel_passage.integration.test.ts src/reducers/travel_visited.integration.test.ts --maxWorkers=1` | ✅ | ✅ green |
| 51-03-T2 | 51-03 | 2 | LDG-04 | server real-handler | `cd spacetimedb && pnpm exec vitest run src/reducers/passage_sweep.integration.test.ts src/reducers/scheduled_guard.integration.test.ts src/helpers/passages.test.ts --maxWorkers=1 && pnpm exec vitest run --maxWorkers=1 --exclude "**/measurement.results.test.ts"` | ✅ | ✅ green |
| 51-03-T3 | 51-03 | 2 | LDG-04 | publish check | `git status` clean for `spacetimedb/src`, key 108 before and after the local publish (`spacetime sql --server local uwr "SELECT key_set, key_length FROM admin_llm_status"`), no panic in the last 80 log lines, `myVisitedLocations` in `src/module_bindings/index.ts`, `pnpm exec vue-tsc -b` | ✅ | ✅ green |
| 51-04-T1 | 51-04 | 2 | LDG-04 | unit | `pnpm exec vitest run src/map/graphLayout.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 51-04-T2 | 51-04 | 2 | LDG-04 | unit + type check | `pnpm exec vitest run src/map --maxWorkers=2 && pnpm exec vue-tsc -b` | ✅ | ✅ green |
| 51-05-T1 | 51-05 | 2 | LDG-05 | unit | `pnpm exec vitest run src/map/travelChecks.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 51-05-T2 | 51-05 | 2 | LDG-05 | unit + type check | `pnpm exec vitest run src/map --maxWorkers=2 && pnpm exec vue-tsc -b` | ✅ | ✅ green |
| 51-06-T1 | 51-06 | 2 | LDG-05 | unit + type check | `pnpm exec vitest run src/console src/rails/nearby.test.ts src/combat/effectChipsGuards.test.ts --maxWorkers=2 && pnpm exec vue-tsc -b` | ✅ | ✅ green |
| 51-06-T2 | 51-06 | 2 | LDG-05 | component + guard | `pnpm exec vitest run src/rails src/combat src/frame/AppFrame.populated.test.ts src/frame/ContextRail.test.ts --maxWorkers=2 && pnpm exec vitest run src/styles --maxWorkers=2` | ✅ | ✅ green |
| 51-06-T3 | 51-06 | 2 | LDG-05 | component + type check | `pnpm exec vitest run src/rails/party.test.ts src/rails/PartyBlock.test.ts src/frame/VitalsRail.test.ts src/styles --maxWorkers=2 && pnpm exec vue-tsc -b` | ✅ | ✅ green |
| 51-07-T1 | 51-07 | 3 | LDG-04, LDG-05 | unit + type check | `pnpm exec vitest run src/map --maxWorkers=2 && pnpm exec vue-tsc -b` | ✅ | ✅ green |
| 51-07-T2 | 51-07 | 3 | LDG-04, LDG-05 | integration + type check | `pnpm exec vitest run src/session src/App.test.ts src/map --maxWorkers=2 && pnpm exec vue-tsc -b` | ✅ | ✅ green |
| 51-08-T1 | 51-08 | 4 | LDG-04 | component + guard | `pnpm exec vitest run src/map/GraphPlane.test.ts src/styles src/map/mapGuards.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 51-08-T2 | 51-08 | 4 | LDG-04 | component + guard | `pnpm exec vitest run src/map/MapLegend.test.ts src/styles --maxWorkers=2` (the List view and its `GraphList.test.ts` were removed in 51-13) | ✅ | ✅ green |
| 51-08-T3 | 51-08 | 4 | LDG-04 | component + guard + type check | `pnpm exec vitest run src/map src/screens src/frame --maxWorkers=2 && pnpm exec vitest run src/styles --maxWorkers=2 && pnpm exec vue-tsc -b` | ✅ | ✅ green |
| 51-09-T1 | 51-09 | 5 | LDG-04, LDG-05 | component + guard | `pnpm exec vitest run src/map/useDestination.test.ts src/map/DetailPanel.test.ts src/styles src/map/mapGuards.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 51-09-T2 | 51-09 | 5 | LDG-04, LDG-05 | component + guard | `pnpm exec vitest run src/map --maxWorkers=2 && pnpm exec vitest run src/styles src/frame/frameContract.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 51-09-T3 | 51-09 | 5 | LDG-04, LDG-05 | component + guard + type check | `pnpm exec vitest run src/map src/screens src/frame --maxWorkers=2 && pnpm exec vitest run src/styles --maxWorkers=2 && pnpm exec vue-tsc -b` | ✅ | ✅ green |
| 51-10-T1 | 51-10 | 5 | LDG-05 | unit | `pnpm exec vitest run src/rails/exits.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 51-10-T2 | 51-10 | 5 | LDG-05 | component + guard | `pnpm exec vitest run src/rails src/frame --maxWorkers=2 && pnpm exec vitest run src/styles --maxWorkers=2` | ✅ | ✅ green |
| 51-10-T3 | 51-10 | 5 | LDG-05 | component + guard + type check | `pnpm exec vitest run src/frame src/rails --maxWorkers=2 && pnpm exec vitest run src/styles --maxWorkers=2 && pnpm exec vue-tsc -b` | ✅ | ✅ green |
| 51-11-T1 | 51-11 | 6 | LDG-04, LDG-05 | component + guard + type check | `pnpm exec vitest run src/map --maxWorkers=2 && pnpm exec vitest run src/styles --maxWorkers=2 && pnpm exec vue-tsc -b` | ✅ | ✅ green |
| 51-11-T2 | 51-11 | 6 | LDG-05 | frame flow + source | `pnpm exec vitest run src/frame/AppFrame.screens.test.ts src/map/mobileTargets.test.ts --maxWorkers=2 && grep -q "one Travel button" .planning/REQUIREMENTS.md` | ✅ | ✅ green |
| 51-11-T3 | 51-11 | 6 | LDG-04, LDG-05 | phase gate | `pnpm exec vue-tsc -b && pnpm exec vitest run src/styles src/frame/frameContract.test.ts src/legacyClientRemoval.test.ts src/map/mapGuards.test.ts --maxWorkers=2`, then the frontmatter flags and the 29-row count greps | ✅ | ✅ green |
| 51-12-T1 | 51-12 | 7 | LDG-04 | unit (TDD) | `npx vitest run src/map/graphLayout.test.ts src/map/order.test.ts src/map/mapGuards.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 51-12-T2 | 51-12 | 7 | LDG-04 | unit + component (TDD) | `npx vitest run src/map/nodeView.test.ts src/map/GraphPlane.test.ts src/map/graphLayout.test.ts src/map/mobileTargets.test.ts --maxWorkers=2 && npx vitest run src/styles --maxWorkers=2` | ✅ | ✅ green |
| 51-12-T3 | 51-12 | 7 | LDG-04 | component + guard + type check (TDD) | `npx vitest run src/map src/frame --maxWorkers=2 && npx vitest run src/styles --maxWorkers=2 && npx vue-tsc -b` | ✅ | ✅ green |

Requirement-level map:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| LDG-04 | Visited upsert, from-location, my view only the active character's rows | server unit | `npx vitest run spacetimedb/src/helpers/visited.test.ts spacetimedb/src/views/visited.test.ts` | ✅ | ✅ green |
| LDG-04 | Known places (visited, current, heard-of neighbours, known regions) | unit | `npx vitest run src/map/knownPlaces.test.ts` | ✅ | ✅ green |
| LDG-04 | Deterministic graph layout, borders, gates, SVG endpoints | unit | `npx vitest run src/map/graphLayout.test.ts` | ✅ | ✅ green |
| LDG-04 | Node states, legend, danger bands, roving tabindex, every drawn place keyboard-reachable with its full aria-label (no List view, 51-13) | unit + component | `npx vitest run src/map/danger.test.ts src/map/MapScreen.test.ts src/map/GraphPlane.test.ts` | ✅ | ✅ green |
| LDG-04 | Region chips, timer locks from the server row only | unit + component | `npx vitest run src/map/regionChips.test.ts src/map/travelTimer.test.ts` | ✅ | ✅ green |
| LDG-04 | Passage node redraw after collapse | component | `npx vitest run src/map/passageRedraw.test.ts` | ✅ | ✅ green |
| LDG-04 | Passage collapse and guarded sweep | server real-handler | `npx vitest run spacetimedb/src/helpers/passages.test.ts spacetimedb/src/reducers/passage_sweep.integration.test.ts spacetimedb/src/reducers/scheduled_guard.integration.test.ts` | ✅ | ✅ green |
| LDG-05 | Shared travel cost helper equals performTravel; client import via `@game-data` | server + alias | `npx vitest run spacetimedb/src/data/travel_config.test.ts src/gameDataAlias.test.ts` | ✅ | ✅ green |
| LDG-05 | Detail model and travel checks, one Travel button, far places path only | unit | `npx vitest run src/map/detailModel.test.ts src/map/travelChecks.test.ts` | ✅ | ✅ green |
| LDG-05 | Travel via moveCharacter and the action runner; after-travel state | component | `npx vitest run src/map/DetailPanel.test.ts` | ✅ | ✅ green |
| LDG-05 | Look at a neighbour place and the bind stone | server real-handler | `npx vitest run spacetimedb/src/reducers/look_intent.test.ts spacetimedb/src/helpers/examine.test.ts` | ✅ | ✅ green |
| LDG-05 | Rail exits panel, rail rows (Examine eye, Talk, bind row), party stamina | component | `npx vitest run src/rails src/frame/LocationRow.test.ts` | ✅ | ✅ green |
| LDG-04/05 | Mobile Map sheet with Map and Here tabs, 44px targets | component + source | `npx vitest run src/map/MapSheet.test.ts src/map/MapDock.test.ts src/map/RegionsListbox.test.ts src/map/mobileTargets.test.ts src/frame/AppFrame.screens.test.ts` | ✅ | ✅ green |
| LDG-04/05 | Design guards (tokens, `<svg` only in src/map/, scale, Phosphor, no v-html, escape, banned word) | guard | `npx vitest run src/styles src/frame/frameContract.test.ts spacetimedb/src/data/no_ripple_word.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Server test files: `visited.test.ts`, `views/visited.test.ts`, `passages.test.ts`, `passage_sweep.integration.test.ts`, `travel_config.test.ts`
- [x] `src/map/*.test.ts` for every pure helper and component
- [x] Update `scheduled_guard.integration.test.ts`, `designContract.test.ts`, `frameContract.test.ts`, `gameDataAlias.test.ts`, `screens.test.ts`, `AppFrame.screens.test.ts`, `railsShell.test.ts`, `nearby.test.ts`, `keywords.test.ts`
- Framework install: none (vitest present)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Map reads well at 1280 and 390×844 | LDG-04 | visual layout | Deferred to the end-of-milestone UAT: open the Map, pick places, travel, cross a border |
| Passage collapses in a live world | LDG-04 | needs a real uncharted crossing (paid LLM call) | Deferred UAT with owner go-ahead |
| Map spacing (owner play-test 2026-10-07, plan 51-12): Sennet Basin, Tessarine Shelf and Orrowmere Teeth spread out in two dimensions, other regions outside the outline on the facing side, pills clear of places | LDG-04 | visual layout | Deferred to the end-of-milestone UAT: at 1280x800 open the Map on each region; at 390x844 open the same regions in the mobile sheet |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s (single-file quick runs; the whole `src/map` directory run takes about a minute on this host)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-07 (51-11 phase gate)
