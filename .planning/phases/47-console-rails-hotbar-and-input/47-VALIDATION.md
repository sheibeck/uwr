---
phase: 47
slug: console-rails-hotbar-and-input
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-05
---

# Phase 47 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 47-RESEARCH.md "## Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 (root `vite.config.ts`, no separate Vitest config) + `@vue/test-utils` + happy-dom via a per-file `// @vitest-environment happy-dom` docblock (never global) + postcss static CSS contracts |
| **Config file** | none; the `@game-data` alias comes from `vite.config.ts` |
| **Quick run command** | `pnpm exec vitest run src/<dir>/<file>.test.ts` (about 5 s per file) |
| **Full suite command** | `pnpm exec vitest run --dir src --maxWorkers=2` and `pnpm exec vue-tsc -b` |
| **Build gate** | `pnpm build` (`vue-tsc -b && vite build && node scripts/check-bundle.mjs`) |
| **Estimated runtime** | ~5 s quick, ~70–90 s client suite |

**Baseline, pre-existing and unrelated:** in the root-wide suite only these 3 files fail:
- `scripts/llm/call_log_report.test.mjs`
- `scripts/llm/proof_rules.test.mjs`
- `spacetimedb/src/helpers/measurement.results.test.ts`

The client suite (`--dir src`) is fully green: 35 files, 469 tests. The gate is "no new failures".

---

## Sampling Rate

- **After every task commit:** the quick command for the touched module, plus `pnpm exec vitest run src/styles` when a `.vue` or `.css` file changed
- **After every plan wave:** `pnpm exec vitest run --dir src --maxWorkers=2` and `pnpm exec vue-tsc -b`
- **Before `/gsd-verify-work`:** full root suite with no new failures, plus `pnpm build` green
- **Max feedback latency:** 90 seconds

---

## Per-Requirement Verification Map

Task IDs are assigned by the planner; each plan's tasks reference the rows below.

| Requirement | Behavior | Threat Ref | Test Type | Automated Command | File Exists | Status |
|-------------|----------|------------|-----------|-------------------|-------------|--------|
| CON-01 | Classify lines by kind. Covers segments (narration label, dialogue quotes, `speakerNpcId` present or absent), kinds without segments, unknown kinds, and whisper and chat parsing. Markup inside segment text (`<b>`, `{{color:#fff}}`) stays literal. `cleanServerText` cleans server lines. `say` is not keyword-eligible. | markup or script injection via model or player text | unit | `pnpm exec vitest run src/console/lines.test.ts src/console/cleanServerText.test.ts src/console/whisper.test.ts` | ❌ W0 | ⬜ pending |
| CON-01 | Feed store: 300-line cap, dedupe on `(table,id)`, sort within a batch, clear on character change, drop own group rows | — | unit | `pnpm exec vitest run src/console/feedStore.test.ts` | ❌ W0 | ⬜ pending |
| CON-01 | Event-table binding: attach and detach, `onInsert` only, the same listener reference is removed, applied flag, re-attach on reconnect, no `iter()` | cross-user row exposure (filtered subscription) | unit (fake conn) | `pnpm exec vitest run src/game/bindEventTable.test.ts` | ❌ W0 | ⬜ pending |
| CON-01 | Feed component: pinned vs unpinned, New lines pill, sending re-pins, progress line, no `v-html`, `role="log"` | XSS (no `v-html`) | component | `pnpm exec vitest run src/console/FeedView.test.ts` | ❌ W0 | ⬜ pending |
| CON-02 | Keyword matcher and click actions: whole word, case-insensitive, longest match, no overlaps, Unicode boundaries, apostrophe fold, hostile or empty input, scope exclusions, one action per kind | hostile names (ReDoS / regex metacharacters) | unit + component | `pnpm exec vitest run src/console/keywords.test.ts src/console/FeedLine.test.ts` | ❌ W0 | ⬜ pending |
| CON-03 | Effects (polarity, chip text, overflow, time shown only in combat, filtered to own character), XP progress, party derivation | — | unit | `pnpm exec vitest run src/rails/effects.test.ts src/rails/xp.test.ts src/rails/party.test.ts` | ❌ W0 | ⬜ pending |
| CON-03 | Rails render: bars, chips, party cards, Invite pre-fill, mobile strip | — | component | `pnpm exec vitest run src/frame/VitalsRail.test.ts src/frame/VitalsStrip.test.ts` | ✅ (extend) | ⬜ pending |
| CON-04 | `routeLevelRange` and "safe", Nearby ordering and actions, quest progress, world event card showing objective progress (owner decision) with the For/Against bar only when counters are non-zero | — | unit | `pnpm exec vitest run src/rails/levelRange.test.ts src/rails/nearby.test.ts src/rails/quests.test.ts src/rails/worldEvent.test.ts` | ❌ W0 | ⬜ pending |
| CON-04 | Mobile: the Map sheet holds Here, Nearby, Tracking and the event; the Social sheet holds Party; actions close the sheet | — | component | `pnpm exec vitest run src/frame/AppFrame.screens.test.ts src/frame/railsShell.test.ts` | ✅ (extend) | ⬜ pending |
| CON-05 | Hotbar: ten slots in key order, kind-to-icon mapping, cooldown math and labels, clicks ignored while cooling, number keys only when no field is focused and no screen is open, selector, `use_ability` arguments | — | unit + component | `pnpm exec vitest run src/hotbar/hotbar.test.ts src/hotbar/HotbarRow.test.ts` | ❌ W0 | ⬜ pending |
| CON-06 | Indicator selection ported from the old client (priority, silent routes, scope, pool rotation), progress line, queue gating, queue FIFO, route decided at release, 4th queued line refused, queue dropped on disconnect | — | unit | `pnpm exec vitest run src/console/indicator.test.ts src/input/narrativeQueue.test.ts` | ❌ W0 | ⬜ pending |
| INP-01 | Sentence forms reach intent for every command word, including "Who is that over there?", "Leave him alone", "End this now" and "Accept my apology" | command hijack | unit (table) | `pnpm exec vitest run src/input/routeInput.test.ts` | ❌ W0 | ⬜ pending |
| INP-02 | Exact and slash forms reach the right reducer with the right argument names. Covers precedence in conversation mode, `accept <inviter>`, and the info-command formatters (`renown`, `factions`, `faction <name>`, `events`, `group`) per owner decision | — | unit (table) | `pnpm exec vitest run src/input/routeInput.test.ts src/input/infoCommands.test.ts` | ❌ W0 | ⬜ pending |
| INP | Input history (50, draft restore, dedupe), IME Enter, pre-fill, placeholders, disabled while offline | — | unit + component | `pnpm exec vitest run src/input/history.test.ts src/input/Composer.test.ts` | ❌ W0 | ⬜ pending |
| All | Design guards (no literal colors, spacing scale, Phosphor only, Inter only, 23 tokens, no `v-html`) | — | static | `pnpm exec vitest run src/styles` | ✅ (`tokens.client.test.ts` changes to 23) | ⬜ pending |
| All | Client literals match the server (`'dialogue'`, `maxlength` 1000) | — | unit | `pnpm exec vitest run src/console/serverParity.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/game/bindEventTable.test.ts`, `keyedBinding.test.ts` and `gameData.test.ts`, using a fake `bind` injection like `useSession.test.ts`
- [ ] `src/console/{lines,cleanServerText,whisper,keywords,feedStore,indicator,serverParity}.test.ts`, plus `FeedView.test.ts` and `FeedLine.test.ts`
- [ ] `src/input/{routeInput,narrativeQueue,history,infoCommands}.test.ts` and `Composer.test.ts`
- [ ] `src/hotbar/hotbar.test.ts` and `HotbarRow.test.ts`
- [ ] `src/rails/{effects,xp,party,levelRange,nearby,quests,worldEvent}.test.ts`
- [ ] Update these existing tests: `tokens.client.test.ts` (23 tokens), `railsShell.test.ts`, `VitalsRail.test.ts`, `VitalsStrip.test.ts`, `AppFrame.layout.test.ts`, `AppFrame.screens.test.ts`, `frameContract.test.ts`
- [ ] Shared fixtures (kept inside the test files):
  - a row builder that produces bigint ids and a `Timestamp`-shaped `createdAt`
  - a fake connection with event-table listeners
- [ ] Framework install: none

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Playable exploring session in the new UX | CON-01..06, INP-01..02 | Real server, real character, real LLM replies | Owner try-out pause after Phase 47 (owner decision 2026-10-05): sign in, read the feed, click keywords, use the rails, the hotbar and the input |
| 900px and 390×844 layouts, keyboard-open mobile | CON-01..05 | Visual layout on real devices | Deferred to the end-of-milestone UAT, apart from the owner's try-out |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
