---
phase: 49
slug: character-creation-interview
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-06
---

# Phase 49 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 49-RESEARCH.md "## Validation Architecture". D1 (owner, 2026-10-06): the race bonus survives level-up, so the level-up sites need pin tests too.

(`workflow.nyquist_validation` is `true` in `.planning/config.json`.)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 5.0.2 (root, happy-dom per file via `// @vitest-environment happy-dom`; server tests run in node under `spacetimedb/`) |
| Config file | none (root uses `vite.config.ts`; `@game-data` alias already defined there) |
| Quick run command | `pnpm exec vitest run src/creation src/session --maxWorkers=1` and `cd spacetimedb && pnpm exec vitest run src/data/race_bonuses.test.ts src/reducers/creation_finalize.test.ts --maxWorkers=1` |
| Full suite command | `pnpm exec vitest run --maxWorkers=1` (root run also picks up the 76 `spacetimedb/src` test files) plus `pnpm exec vue-tsc -b`. Baseline failures to ignore: `scripts/llm/call_log_report.test.mjs`, `scripts/llm/proof_rules.test.mjs`, `spacetimedb/src/helpers/measurement.results.test.ts` |

Measured this session: `deriveScreen.test.ts` plus `feedStore.test.ts` (69 tests) run in about 1.2 s; a server test file about 0.8 s plus a first import of `index.ts` of about 4 s.

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CRE-01 | one position/marker/working row per server step incl. CONFIRMING_GO_BACK each `previousStep`, COMPLETE with and without job, no row, unknown; no "First words" in source | unit | `pnpm exec vitest run src/creation/creationSteps.test.ts` | no, Wave 0 |
| CRE-01 | controls matrix per step (quick row, decision row, placeholder, lock); `Go back` only at AWAITING_ARCHETYPE, CLASS_REVEALED, CLASS_FILL_ERROR; `Retry` sends `retry` / `explore`; `Yes, go back` sends `yes`, `Keep my choices` sends `no`; Start over needs confirmation | unit | `pnpm exec vitest run src/creation/creationControls.test.ts` | no, Wave 0 |
| CRE-01 | classification: kind first, segments, `**` stripped, brackets unwrapped, warning flag, echo, newlines kept, text nodes | unit + component | `pnpm exec vitest run src/creation/creationLines.test.ts src/creation/CreationFeed.test.ts` | no, Wave 0 |
| CRE-01 | hub: start once per mount, only with zero characters, gated on applied, rejection -> Error line + Retry; send paths echo then `submit_creation_input`; empty text never sent; lines survive remount | unit | `pnpm exec vitest run src/creation/creationData.test.ts` | no, Wave 0 |
| CRE-01 | `deriveScreen`: `creation` for zero characters and for unplaced active; picker unchanged (no New character button); frame for placed; no `noCharacters` kind remains; `useSession` and `App` wiring | unit | `pnpm exec vitest run src/session src/App.test.ts` | exists, update (see blast radius) |
| CRE-01 | step bar render, mobile text `Step 2 of 5 · Archetype`, `aria-current`, hidden status line | component | `pnpm exec vitest run src/creation/StepBar.test.ts` | no, Wave 0 |
| CRE-01 | enter the realm hold while unplaced, frame swap when `locationId != 0` | component | `pnpm exec vitest run src/creation/CreationView.test.ts` | no, Wave 0 |
| CRE-01 | design guards over the new files (no new token, no literal color, spacing scale, Phosphor only, no v-html, headings h4/h6) | static | `pnpm exec vitest run src/styles` | exists; scans new files automatically |
| CRE-02 | sheet model per step (before any choice, after race projection, archetype, class reveal, class fill, ability, name), cleared fields after go-back, malformed JSON tolerated, raw `<b>` literal | unit | `pnpm exec vitest run src/creation/sheetModel.test.ts src/creation/CreationSheet.test.ts` | no, Wave 0 |
| CRE-02 | sheet imports the shared helper (source pin) and equals `computeCreationStats` for the same fixtures | unit | same | no, Wave 0 |
| CRE-02 | helper purity, normalisation, clamps, unknown stat dropped, projection | unit (server) | `cd spacetimedb && pnpm exec vitest run src/data/race_bonuses.test.ts` | no, Wave 0 |
| CRE-02 | finalized stats = class base + race bonus; `'none'` secondary no longer throws; no `raceBonuses` = class base only; maxHp reflects STR; existing character stats unchanged by `set_active_character` | integration (real handler) | `cd spacetimedb && pnpm exec vitest run src/reducers/creation_finalize.test.ts` | no, Wave 0 |
| CRE-02 | held private rows replayed on `setCharacter`, others dropped, cap 50, `clear()` empties | unit | `pnpm exec vitest run src/console/feedStore.test.ts` | exists, extend |
| CRE-02 | mobile Sheet chip opens the same content, Esc and close dismiss and return focus, keyboard-open compaction | component | `pnpm exec vitest run src/creation/CreationView.mobile.test.ts` | no, Wave 0 |
| CRE-03 | newest-3 rule (ties by larger id), fewer than 3, none (note line), not applied (nothing), tags incl. missing/malformed/unknown stat, description fallback, card click sends the name, `Surprise me` sends exactly `Surprise me.`, free text as typed | unit + component | `pnpm exec vitest run src/creation/raceCards.test.ts src/creation/ChoiceBlock.test.ts` | no, Wave 0 |
| CRE-01/03 | archetype and ability cards send `Warrior`/`Mystic`/ability name; unparseable `abilities` shows no cards; block inert while sending and re-enabled on rejection | component | `pnpm exec vitest run src/creation/ChoiceBlock.test.ts` | no, Wave 0 |
| CRE-01 | button text pins (`retry`, `go back`, `yes`, `no`, `start over`, `Confirm`, `explore`, `Surprise me.`) against the server's matching rules; the go-back-phrase check over fixture ability names | unit | `pnpm exec vitest run src/creation/serverWords.test.ts` | no, Wave 0 (imports the phrase list through a source-text read of `creation.ts`, like `Composer.test.ts` does for the length limit) |
| all | `@game-data` alias exposes `class_stats` and `race_bonuses`, which import nothing but each other | unit | `pnpm exec vitest run src/gameDataAlias.test.ts` | exists, extend |

### Sampling Rate
- **Per task commit:** the quick run command for the touched slice.
- **Per wave merge:** root full suite with `--maxWorkers=1` plus `pnpm exec vue-tsc -b`.
- **Phase gate:** full suite green (ignoring the three baseline failures) and `pnpm build` (includes `scripts/check-bundle.mjs`) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `spacetimedb/src/data/race_bonuses.ts` and `race_bonuses.test.ts` (helper first: everything else imports it)
- [ ] `spacetimedb/src/reducers/creation_finalize.test.ts` (real-handler harness copied from `llm_cutover.test.ts`: `capturedReducer`, `createMockCtx({ strict: true })`)
- [ ] `src/creation/creationSteps.test.ts`, `creationControls.test.ts`, `raceCards.test.ts`, `sheetModel.test.ts`, `creationLines.test.ts`, `creationData.test.ts`, `serverWords.test.ts`
- [ ] Component tests: `StepBar`, `CreationFeed`, `ChoiceBlock`, `CreationComposer`, `CreationSheet`, `CreationView` (desktop and mobile)
- [ ] Framework install: none

### Test blast radius (Q8)
Existing tests that must change (all because of `ScreenInput`/`AppScreen`/`noCharacters` removal):
- `src/session/deriveScreen.test.ts`: `base` gets `activeCharacterPlaced`; the `noCharacters` rows become `creation`; add rows for unplaced active (`creation`), placed active (`frame`), unplaced active but not loaded (`signingIn`).
- `src/session/useSession.test.ts` line ~441 ("shows the no-characters note with zero rows") becomes `creation`; `makeCharacter` has `locationId: 10n`, so every existing frame test stays `frame`.
- `src/App.test.ts`: the `NoCharactersNote` import and the `noCharacters` test (lines 8, 109, 134-139) become a `CreationView` case; `fakeSession` gains the `creation` hub.
- `src/session/CharacterPicker.test.ts`: delete the `NoCharactersNote` import and `describe('NoCharactersNote')` (lines 7, 136-152) together with `NoCharactersNote.vue`. The picker tests themselves are unchanged (no New character button).
- `src/console/feedStore.test.ts`: additive (held rows); the two "accepts nothing" tests stay valid.
- Unaffected if the recommendation is followed: Phase 47 `Composer`, `FeedView`, `useConsole`, hotbar, `gameData`, rails and Phase 48 combat tests (none of those files change).
- Auto-scanned guards that the new files must satisfy: `designContract.test.ts` (type scale 10/12/14/20, weights 400/500, spacing 0/4/8/16/24/32/48/64 for padding, margin and gap, only h4/h6, Phosphor only, no inline svg, no `v-html`, focus ring never removed), `colors.guard.test.ts`, `tokens.client.test.ts` (23 tokens), `scrollbars.test.ts` (dark scrollbar rule on scrollable surfaces), and the bundle guard in `pnpm build`.
- Server: `llm_cutover.test.ts` confirm tests (lines ~1560-1600 and ~2046-2150) use `confirmSeed` with no `classStats`; they do not assert stats, so they stay green; run them as the regression check for the finalize edit. `creation_validate.test.ts` is unaffected (the helper does not touch it).

### Parallel quick tasks (planning-relevant overlap)
Untracked plans seen in `.planning/quick/`: `261006-a0i` (Nearby enemies with pull actions) edits `src/game/{queries,gameData,context}.ts` (+ tests), `src/rails/enemies.ts`, `src/console/{useConsole,keywords,keywordLabel,FeedView.vue}` (+ `FeedLine.test.ts`, `FeedView.test.ts`), `src/rails/NearbyList.vue`, `ContextContent.test.ts`; `261006-a13` (action progress bar) edits `src/action/*`, `src/game/{queries,gameData,context}.ts`, `src/frame/FeedShell.vue`. Rules for this phase: never edit those files; keep the creation hub, queries, injection key and tests in `src/creation/`; import `abilityIcon` from `hotbar/hotbar.ts` and read `game.llmJobs` read-only; the files this phase does edit (`useSession.ts`, `deriveScreen.ts`, `App.vue`, `feedStore.ts`, `CharacterPicker.test.ts`) are not on either list. If the warning icon is added to `FeedLine.vue`/`lines.ts`, schedule it after the quick tasks land or use the wrapper in Open Question 2.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Local publish of the race-bonus server change (finalize and level-up) with `--break-clients` and no clear; the stored key is unchanged | CRE-02 | Needs the owner's running local server (never maincloud) | Run `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null`. Check that `admin_llm_status` key_length is 108 before and after. Then run `pnpm spacetime:generate -y` and expect no binding diff. |
| Live creation interview: race cards, Surprise me, archetype cards, class reveal, name, entering the realm, and mobile at 390×844 | CRE-01..03 | Needs paid LLM calls on a real server | Deferred to the end-of-milestone UAT |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
