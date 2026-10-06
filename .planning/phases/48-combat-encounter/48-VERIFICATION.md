---
phase: 48-combat-encounter
verified: 2026-10-06T07:05:00Z
status: human_needed
score: 6/6 must-haves verified (code-level); live behavior deferred to end-of-milestone UAT
behavior_unverified: 3
overrides_applied: 0
re_verification: false
behavior_unverified_items:
  - truth: "The round timer counts down on the hotbar and never reads as expired on a client whose clock runs ahead of the server (server-clock sampling from live round rows only; WR-03/04/05/06)"
    test: "Start a fight on the local server, then reload mid-fight and reconnect; watch the round row timer"
    expected: "Timer counts 10s down to 1s, then 'Resolving...' with an empty bar (never '0s'); after a reload the timer does not run biased or lock Ready/Flee early"
    why_human: "Clock-sampling is a runtime ordering invariant (snapshot vs live row); unit tests cover the rules with fake timers but nobody has watched a real round"
  - truth: "Enemy wind-up warning appears once per cast (one feed block, not replayed on reload) and the rail row count falls each round"
    test: "Fight an enemy with a wind-up ability; reload mid-fight"
    expected: "Amber hourglass row on the card with 'lands in N rounds' falling each round; exactly one amber feed block per cast; no replay after reload"
    why_human: "Snapshot-vs-live subscription ordering (castsApplied) can only be seen against a real SpacetimeDB subscription"
  - truth: "Chosen action reflects the server echo (no optimistic UI): chip, chosen-slot ring and Flee state update only when combat_action echoes"
    test: "In a live fight press Ready, an ability slot, and Flee in turn"
    expected: "Chip and slot ring appear after the echo, clear next round; Flee shows 'Flee chosen' and an ability replaces it"
    why_human: "Depends on real reducer round trip and per-round reset"
human_verification:
  - test: "A. Live combat at 1280x800 and 390x844 (48-14-SUMMARY 'Deferred owner verification' items A1-A14: encounter rail, Tab/Shift+Tab/Esc keyboard, threat order, wind-up, round headers, round row and timer, Ready/Flee/chosen, rounds cooldowns, ally heals in a party, damage flash incl. reduce-motion, header tag and locked buttons, mobile strip and sheet, mobile vitals strip, Log out from the strip)"
    expected: "Each behaves as written in the 48-14 checklist, on the local server only"
    why_human: "Real fight, visual and interaction feel; owner instruction 2026-10-05 defers hands-on testing to the end of the milestone"
  - test: "B. Deviations A1 (Ready/Flee in a round row above the slots), A4 (Tab scoping, desktop focus starts in input), A5 (tab bar hidden in mobile combat, account button on strip), A8 (threat percent relative to top entry), A26 (dead/departed ally not sent as target); plus ally chip tap height (~37px), glow clipping, copy of server refusal lines, ally button accessible names"
    expected: "Owner accepts or redirects each judgment call"
    why_human: "Design judgment; deviations from the approved UI contract"
  - test: "C. UI backstops: round row at 900px and at 390 with long names (ResizeObserver stack at 520px), mobile strip with 6+ chips, vitals chip row with 5 allies/6 effects, encounter sheet with 8 hostiles, desktop panel with 8 hostiles/5 threat rows/3 wind-ups"
    expected: "No overflow, sideways scroll where specified, scroll inside panels"
    why_human: "Visual layout, not unit-testable"
  - test: "D1. Late-narration round tag ('The Keeper . Round M' in muted text) on a Keeper narration that lands after its round resolved"
    expected: "Tag shows only on a createdAt+text match to a combat_narrative row"
    why_human: "Needs a paid LLM call (not made in this phase)"
  - test: "D2. Maincloud publish at end of milestone with --break-clients for the additive my_combat_aggro view (no clear); check admin_llm_status key_length 108 before and after"
    expected: "Publish succeeds, key length unchanged, bindings already in repo"
    why_human: "Owner-only action (never automatic to maincloud)"
---

# Phase 48: Combat Encounter Verification Report

**Phase Goal:** Round-based combat plays out in the new client: the right rail becomes the encounter, the round timer sits on the hotbar, and the feed groups events by round.
**Verified:** 2026-10-06
**Status:** human_needed
**Re-verification:** No, initial verification

All six roadmap success criteria are implemented, wired to real subscribed data, and covered by passing tests. No gaps were found. The status is `human_needed` rather than `passed` because the live-play items the owner deferred to the milestone-end UAT are the only remaining evidence for the behavior-dependent truths (clock sampling, per-round reset, snapshot-vs-live wind-up).

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Combat start: header "In combat", rail becomes the encounter (hostiles with health, boss tag, difficulty color); click targets, Tab cycles | VERIFIED | `AppFrame.vue` passes `game.combat.active` / `roundNumber` to `HeaderBar` (renders `InCombatTag`, locks screen buttons via `aria-disabled`). `ContextRail.vue` swaps `ContextContent` for `EncounterPanel` while `combat.active`. `HostileCard.vue` renders name, difficulty, HP, `Boss` tag from `hostile.isBoss` (`hostiles.ts` reads `template.isBoss`). `useCombatController.ts` sends `setCombatTarget` on click and on Tab/Shift+Tab (`cycle`, scoped keydown listener). `AppFrame.combat.test.ts` asserts all of this at 1280 and 390. |
| 2 | Threat order on the current target and enemy wind-up warning before the ability lands | VERIFIED | Server: `spacetimedb/src/views/combat.ts` `my_combat_aggro` per-sender view (chained index lookups, pet rows dropped, no scan). Client: `queries.ts`/`gameData.ts` subscribe to it statically; `ThreatBlock.vue` via `threat.ts`; wind-up rows on `HostileCard.vue` from `combat_enemy_cast` (`windup.ts`) and one feed block per cast via `combatFeed.ts`. Tests pass. |
| 3 | Feed groups events by round under round headers; effects and cooldowns show rounds remaining | VERIFIED | `combatFeed.ts` turns each `action_select` round into `feed.addRoundHeader`; `feedStore.ts` / `FeedLine.vue` / `FeedView.vue` render the `.line-round` header (current in accent). `HotbarRow.vue` uses `roundCooldownView` so in combat a slot shows "N rounds"; `useScreens`/`lines.ts` classify header kinds. |
| 4 | Click party members to target heals; Flee on hotbar; damage taken flashes on vitals | VERIFIED | `PartyBlock.vue` / `party.ts` select allies via `controller.selectAlly`; `HotbarRow.allyArgFor` carries the ally into single-ally abilities. `RoundRow.vue` (mounted in `FeedShell.vue` above `HotbarRow`) has Flee calling `reducers.fleeCombat` (server reducer `flee_combat` exists). `useDamageFlash` is used in `VitalsRail.vue` and `VitalsStrip.vue`. |
| 5 | At 390x844 encounter, targeting, hotbar and Flee usable; combat feed readable | VERIFIED (code) / human for feel | `AppFrame.vue` mobile branch: `EncounterStrip` before the feed, Encounter `Sheet` with `EncounterPanel variant="sheet"`, tab bar hidden, More sheet reduced to Log out. `AppFrame.combat.test.ts` mobile cases pass. Visual usability deferred to UAT (checklist A12-A14, C). |
| 6 | Round timer counts down on the hotbar; chosen action shown; with no choice shows auto-attack | VERIFIED (code) / behavior unverified live | `RoundRow.vue` renders `progressbar` timer with `{{ timer.seconds }}s` / "Resolving...", chip from `choice.ts` `choiceChip` (no `combat_action` row yields "Auto-attack -> {target}"; ability/flee/auto_attack rows mapped), Ready calls `submitCombatAction`. `roundClock.ts` + controller's ticker. No optimistic state. See behavior_unverified_items. |

**Score:** 6/6 truths verified at code level; 3 behavior-dependent items (clock sampling, wind-up snapshot/live, per-round choice reset) have unit-test evidence but no live run, so they are reported as `behavior_unverified: 3` and routed to human verification.

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `spacetimedb/src/views/combat.ts` (`my_combat_aggro`) + test | VERIFIED | Substantive, index-only, registered; generated bindings present (`src/module_bindings/my_combat_aggro_table.ts`) |
| `src/combat/*` (EncounterPanel, EncounterStrip, HostileCard, ThreatBlock, RoundRow, InCombatTag, controller, pure modules) | VERIFIED | All exist, substantive, each with a test file; none orphaned |
| `src/game/gameData.ts` combat bindings | VERIFIED (Level 4 flowing) | Own participant by character -> combat id keys participants, enemies, rounds, casts, pets, narratives; templates/abilities by id list; `my_combat_aggro` static. Real `conn.db.*` tables, not static data. |
| `src/frame/{AppFrame,ContextRail,HeaderBar,FeedShell,VitalsRail,VitalsStrip,MoreSheet,useScreens}` | VERIFIED | Wired; combat state flows from `GAME_KEY` -> `session.game` (`App.vue`, `useSession.ts` `createGameData`) |
| `src/hotbar/HotbarRow.vue`, `src/rails/PartyBlock.vue` | VERIFIED | Combat mode (rounds cooldowns, inert while resolving, ally targeting) |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `App.vue` | `createGameData` | `provide(GAME_KEY, session.game)` | WIRED |
| `AppFrame` | `createCombatController` | `provide(COMBAT_KEY)`, disposed on unmount | WIRED |
| `FeedShell` | `RoundRow`, `HotbarRow` | direct mount in composer section | WIRED |
| `ContextRail` | `EncounterPanel` | `v-if="inCombat"` | WIRED |
| `gameData` | `wireCombatFeed` | called with combat, feed, clock, selfId | WIRED |
| `RoundRow` | `submit_combat_action`, `flee_combat` | `GameReducers` (server reducers exist) | WIRED |
| Controller | `set_combat_target` | `reducers.setCombatTarget` (server reducer exists) | WIRED |
| `queries.ts` | `my_combat_aggro` | `toSql(tables.myCombatAggro)`, static binding | WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Combat module, console and frame-integration tests, my_combat_aggro view test | `pnpm exec vitest run src/combat src/frame/AppFrame.combat.test.ts src/console spacetimedb/src/views/combat.test.ts` | 29 files, 604 tests passed | PASS |
| Full suite, vue-tsc, build (orchestrator-reported) | root vitest, `vue-tsc -b`, `pnpm build` | Only the 3 known baselines fail (`call_log_report`, `proof_rules`, `measurement.results`); typecheck and build clean | PASS (not re-run) |

No servers were started or stopped, nothing was published, no LLM call was made.

### Probe Execution

Step 7c: SKIPPED (no probes declared in the phase plans).

### Requirements Coverage

Every ID declared across the 14 PLAN frontmatters is in REQUIREMENTS.md (marked complete, mapped to Phase 48), and REQUIREMENTS.md maps no additional Phase 48 ID, so there are no orphans.

| Requirement | Source Plans | Status | Evidence |
|-------------|-------------|--------|----------|
| CMB-01 | 02, 04, 05, 08, 12, 14 | SATISFIED | Truth 1 |
| CMB-02 | 01, 02, 04, 08, 12, 14 | SATISFIED | Truth 2 (view + ThreatBlock) |
| CMB-03 | 02, 04, 06, 07, 08, 12, 14 | SATISFIED | Truths 2, 3 (wind-up row + feed block) |
| CMB-04 | 03, 04, 06, 07, 10, 14 | SATISFIED | Truth 3 (round headers, rounds cooldowns) |
| CMB-05 | 02, 03, 05, 09, 10, 11, 12, 13, 14 | SATISFIED | Truth 4 (tag, ally target, Flee, flash) |
| CMB-06 | 03, 04, 09, 10, 12, 14 | SATISFIED | Truth 6 (timer, chip, auto-attack default) |

### Anti-Patterns Found

TBD/FIXME/XXX/TODO/HACK scan across `src/combat`, `src/frame`, `src/hotbar`, console store/lines/FeedLine, `gameData.ts`, rails party files and the server view: none. No `v-html`/`innerHTML` in the touched client areas (`AppFrame.combat.test.ts` also asserts an img-onerror payload renders as text on every name surface at both widths). No stubs: all components render subscribed data.

Review state: `48-REVIEW-FIX.md` status `all_fixed` (WR-01..06). WR-03..06 (server-clock sampling) are marked "requires human verification (clock logic)", which is carried into `behavior_unverified_items`.

### Known and Accepted (not gaps)

- `isBoss` is never set server-side, so the Boss tag rarely shows (UI path implemented and tested).
- No enemy effect chips and no cast bar (deferred to backlog 999.1).
- Documented residual clock limits.
- Three baseline test failures unrelated to this phase.
- Deviations A1/A4/A5/A8/A26 are owner-review items (listed under human verification B).

### Deferred Items

None filtered (no later-phase coverage was needed; there are no gaps).

### Human Verification Required

See the `human_verification` frontmatter list: it mirrors the "Deferred owner verification" sections A to D of `48-14-SUMMARY.md` (live combat at 1280 and 390, deviations, UI backstops, late-narration tag needing a paid call, maincloud `--break-clients` publish). These are deferred by owner instruction to the end-of-milestone UAT and are not gaps.

### Gaps Summary

No gaps. The phase goal is achieved in code: combat state is bound from real tables, the rail, header, hotbar round row, feed round headers, ally targeting, Flee and damage flash are all mounted and wired, and the one server change (`my_combat_aggro`) is a per-sender, index-only view with bindings regenerated. Remaining evidence is live play, tracked as human verification.

---

_Verified: 2026-10-06_
_Verifier: Claude (gsd-verifier)_
