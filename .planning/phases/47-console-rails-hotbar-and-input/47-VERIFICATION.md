---
phase: 47-console-rails-hotbar-and-input
verified: 2026-10-05T23:59:00Z
status: human_needed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "The active world event with its faction split (ROADMAP SC2, CON-04)"
    reason: "Owner decision after research (47-CONTEXT): the server has only success/failure counters and nothing in normal play moves them. The card shows real objective progress from event_objective instead; a For/Against bar appears only when a counter is non-zero. Client-only."
    accepted_by: "owner (47-CONTEXT 'Owner decisions after research', 2026-10-05)"
    accepted_at: "2026-10-05T00:00:00Z"
re_verification: false
gaps: []
deferred: []
human_verification:
  - test: "Keyboard-open compaction on a real phone"
    expected: "With the on-screen keyboard open the vitals strip collapses to its compact row, the location row hides, the feed keeps room, and both return on blur."
    why_human: "Needs a real software keyboard and visualViewport behavior; the unit test only simulates a viewport shrink. Owner deferred to the end-of-milestone pass."
  - test: "iOS 14px input zoom"
    expected: "Focusing the composer input on iOS Safari does not zoom the page."
    why_human: "Browser-specific behavior that cannot be exercised in happy-dom. Deferred by the owner."
  - test: "Real-phone layout at roughly 390x844"
    expected: "Feed, keywords, hotbar (sideways scroll) and input are usable. Vitals, routes, Nearby, quests and the active event are reachable from the compact strip and the Map / Party tabs."
    why_human: "Visual and touch layout on a physical device. Deferred by the owner."
  - test: "Route level rule confirmation"
    expected: "The level ranges shown on routes (floor(dangerMultiplier/100) + the destination's levelOffset; one level either side when the offset is not 0) match the owner's intent against real locations."
    why_human: "The owner must confirm the rule against live world data (the choice between a per-location and a region-wide range is recorded in levelRange.ts). Deferred by the owner."
  - test: "Effect time shown in combat only"
    expected: "Active effects show their time remaining in rounds only while in combat, and no time otherwise."
    why_human: "Depends on the live round engine (Phase 46.1 / 48). Accepted data limit; owner confirmation deferred."
  - test: "Follow-up fixes on the running client (dark scrollbars, full-width desktop feed)"
    expected: "Scrollbars are dark on every scrollable surface and the desktop feed and composer fill the center column."
    why_human: "Visual check on the running client. The CSS rule and a static test exist, but the owner has not re-looked since the fixes. Deferred by the owner."
---

# Phase 47: Console, Rails, Hotbar and Input Verification Report

**Phase Goal:** A player explores the world through the new client: they read a labelled feed, act on keywords and rails, use the hotbar, and type natural sentences without command words hijacking them.
**Verified:** 2026-10-05
**Status:** human_needed (all automated and code-level checks pass; only the owner's deferred device and visual checks remain)
**Re-verification:** No, initial verification

## Goal Achievement

### Observable Truths (ROADMAP success criteria, the contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The feed shows labelled lines by kind; an NPC reply appears as separate narration and dialogue lines; NPCs, places and objects show as soft accent keywords that hail, examine or travel; Keeper progress lines show while an LLM job runs; staged reveals land in the feed. | VERIFIED | `src/console/lines.ts` classifies rows (`keeper`, `npc`, `whisper`, `party`, `system`, `quest`, `ripple`, `worldEvent`, `scene`, `echo` and so on) and emits one line per segment. `FeedLine.vue` renders labels, "X says, “…”", whisper and party forms, and keyword `<button>`s, all as text nodes (no `v-html` anywhere in the phase files). `useConsole.actOnKeyword` dispatches npc to `hail`, place to `travel` (`moveCharacter`), node to `examine` (`look at <name>`), player to a whisper pre-fill. `KeeperProgress.vue` is mounted in `FeedView.vue` from `selectLlmIndicator` over `my_llm_jobs`. Reveals from `event_private`, `event_location` and `event_world` flow through `feedStore.ingest`. |
| 2 | The vitals rail shows HP, MP, SP and XP bars, active effects with time remaining, party members with health and an Invite button; the context rail shows routes out (level ranges or "safe"), Nearby with one-click actions, tracked quests with progress, and the active world event. | VERIFIED (override for the faction split) | `VitalsRail.vue` renders three bars, the XP bar (`xpProgress`), `EffectChips` (`effectViews` over `my_character_effects`), and `PartyBlock`. `ContextRail.vue` mounts `ContextContent` = `HereCard`, `NearbyList`, `TrackingList`, `WorldEventCard`. `levelRange.ts` returns `safe` or `Lv a–b`. `NearbyList` rows come from `nearbyRows` with hail, gather, whisper and invite actions. The faction split is replaced by objective progress (owner decision in 47-CONTEXT); the For/Against bar shows only when a counter is non-zero. Nearby `objects` is an empty list (no server source; accepted limit). |
| 3 | The hotbar shows iconed ability slots with cooldowns, and the player can switch hotbars. | VERIFIED | `HotbarRow.vue` renders ten slots from `hotbar` / `hotbar_slot` / `ability_template`, computes cooldown sweeps and a seconds label from `ability_cooldown` plus the server clock (`useCooldownTicker`), handles number keys 1-0 (guarded for text fields and open screens) and calls `useAbility({characterId, abilityTemplateId})`. `HotbarSelector.vue` calls `switchHotbar({characterId, hotbarName})`. Argument names match the generated bindings. |
| 4 | A natural sentence starting with a command word reaches the conversation or intent path; exact forms (`who`, `/who`, `invite <name>`) still run the command. | VERIFIED | `src/input/routeInput.ts` implements the fixed precedence: slash is always a command; a command word runs only in its exact shape (`COMMAND_SHAPES`: bare, name, nameAndMessage), otherwise it falls to say, hail, conversation or intent. "Who is that over there?", "Leave him alone", "End this now" and "Accept my apology" all fall through (token counts do not match the exact shapes). `routeInput.test.ts` has an INP-02 matrix over every `COMMAND_WORDS` entry in exact, sentence and in-conversation forms. `useConsole.submit` dispatches strictly from the route descriptor. `AppFrame.populated.test.ts` drives the real composer: "Accept my apology" calls `submit_intent`, "invite Bob" calls `invite_to_group({targetName:'Bob'})`, "/who" calls `submit_intent('who')`. |
| 5 | At 390x844 the feed, keywords, hotbar and input are usable, and vitals, routes, Nearby, quests and the active event are reachable from the compact strip and tab bar. | VERIFIED in code and tests; device check deferred (see human_verification) | `AppFrame.vue` mobile branch: `VitalsStrip` (compact while a sheet or the keyboard is open), `FeedShell compact` (feed, hotbar and composer), `TabBar`. The Map tab opens `MapScreen`, which hosts `ContextContent` (Here, Nearby, Tracking, event). The Party tab opens `SocialScreen`, which hosts `PartyBlock`. Strip chips open the Social sheet. `useKeyboardOpen` drives the compaction. Real-phone behavior is on the owner's deferred list. |

**Score:** 5/5 truths verified (1 via accepted owner decision), 0 present-but-behavior-unverified. State-transition and ordering invariants (narrative queue, WR-02 token, WR-03 refusal guard, WR-06 queued-NPC rule, conversation lifecycle) are exercised by passing behavioral tests in `useConsole.test.ts` and `narrativeQueue.test.ts`.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/input/routeInput.ts`, `commands.ts`, `conversation.ts`, `history.ts`, `infoCommands.ts`, `narrativeQueue.ts` | Pure input routing, queue, info formatters | VERIFIED | Substantive and imported by `useConsole.ts`. |
| `src/console/{lines,keywords,cleanServerText,whisper,feedStore,indicator,pinning,useConsole}.ts`, `FeedView.vue`, `FeedLine.vue`, `KeeperProgress.vue` | Feed pipeline and controller | VERIFIED | FeedView/FeedLine/KeeperProgress are mounted through `FeedShell`; `createConsole` is provided by `AppFrame` via `CONSOLE_KEY`. |
| `src/game/{gameData,bindEventTable,keyedBinding,queries,serverClock,context}.ts` | Subscription hub and injection contracts | VERIFIED | `App.vue` provides `GAME_KEY` from `session.game`; filtered, keyed subscriptions per the plan. |
| `src/rails/*` (effects, xp, party, quests, nearby, levelRange, worldEvent plus components) | Rail derivations and views | VERIFIED | Used by `VitalsRail`, `VitalsStrip`, `ContextContent`, `SocialScreen`, `MapScreen`. |
| `src/hotbar/*` | Hotbar, selector, cooldown ticker | VERIFIED | Mounted in `FeedShell`; reducer calls match bindings. |
| `src/frame/useKeyboardOpen.ts`, `src/screens/MapScreen.vue`, `SocialScreen.vue` | Mobile reach | VERIFIED | Wired in `AppFrame.vue` and the screen registry. |
| `src/styles/frame.css` (dark scrollbars) and `FeedShell.vue` (full-width composer) | Owner try-out follow-ups | VERIFIED in code | Shared scrollbar rule using neutral tokens; composer fills the column. Visual re-check deferred. |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `App.vue` | `createGameData` hub | `provide(GAME_KEY, session.game)` | WIRED |
| `AppFrame.vue` | `createConsole` | `provide(CONSOLE_KEY)`, disposed on unmount | WIRED |
| `Composer.vue` | `routeInput` then reducers | `consoleApi.submit` | WIRED |
| `FeedLine` keyword buttons | `actOnKeyword` | `FeedView` keyword emit to `CONSOLE_KEY` | WIRED |
| `VitalsRail` / `VitalsStrip` / `SocialScreen` | effects, XP, party | `GAME_KEY` injection | WIRED |
| `NearbyList` / `HereCard` | hail, gather, travel, whisper, invite | `CONSOLE_KEY` | WIRED |
| `HotbarRow` | `use_ability`, `switch_hotbar` | `game.reducers` | WIRED |
| `useConsole` | `submit_intent` look on open | `privateEventsApplied` watch | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| `FeedView` | feed lines | `event_private` / `event_location` / `event_group` / `event_world` listeners plus local entries | Yes (filtered subscriptions, capped store) | FLOWING |
| `VitalsRail` | effects, party, XP | `my_character_effects`, `group_member` / `character`, character row | Yes | FLOWING |
| `ContextContent` | routes, Nearby, quests, event | `location_connection`, `npc`, `resource_node`, `character`, `my_quests`, `world_event`, `event_objective` | Yes. Nearby objects is `[]` by design (no server source). | FLOWING (accepted limit) |
| `HotbarRow` | slots and cooldowns | `hotbar`, `hotbar_slot`, `ability_template`, `ability_cooldown` | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase test directories pass | `npx vitest run src/input src/console src/rails src/hotbar src/game src/frame src/session` | 62 files, 1187 tests passed | PASS |
| Full root suite, build, `vue-tsc` | Run by the orchestrator (not re-run here) | 5332 tests pass, only the 3 known baseline files fail; build and `vue-tsc` clean | PASS (reported) |
| Prohibition and anti-pattern scan | `grep TBD/FIXME/XXX/TODO/HACK/v-html` over phase source dirs | No matches outside tests | PASS |

### Probe Execution

Step 7c: SKIPPED. The phase declares no probe scripts.

### Requirements Coverage

All eight IDs appear in PLAN frontmatter and in REQUIREMENTS.md (marked Complete, Phase 47). No orphaned requirements.

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| CON-01 labelled feed by kind | 47-02, 47-04, 47-05, 47-06, 47-07 | SATISFIED | `lines.ts`, `FeedLine.vue`, `feedStore.ts` |
| CON-02 keywords and click actions | 47-02, 47-07, 47-09, 47-10 | SATISFIED | `keywords.ts`, `actOnKeyword`, Nearby and Here actions |
| CON-03 vitals rail with XP, effects, party and Invite | 47-03, 47-05, 47-06, 47-08, 47-12 | SATISFIED | `VitalsRail.vue`, `EffectChips`, `PartyBlock` |
| CON-04 context rail | 47-03, 47-05, 47-06, 47-10, 47-12 | SATISFIED (override: objective progress instead of faction split; objects empty) | `ContextContent` and its cards |
| CON-05 hotbar and switching | 47-03, 47-06, 47-11, 47-12 | SATISFIED | `HotbarRow.vue`, `HotbarSelector.vue` |
| CON-06 progress lines and staged reveals | 47-04, 47-06, 47-07, 47-09 | SATISFIED | `indicator.ts`, `KeeperProgress.vue`, narrative queue gate |
| INP-01 sentences reach conversation or intent | 47-01, 47-09, 47-12 | SATISFIED | `routeInput.ts`, populated integration test |
| INP-02 exact forms run, every command word tested | 47-01, 47-04, 47-09, 47-12 | SATISFIED | `routeInput.test.ts` matrix |

### Anti-Patterns Found

None blocking. `47-REVIEW.md` (iteration 3) is clean: 0 critical, 0 warning, 7 info items carried forward (IN-01 to IN-07). Notable ones, none of which block the goal:

| Item | Severity | Impact |
|------|----------|--------|
| IN-01: bare `accept` / `decline` inside an NPC conversation goes to the group-invite reducer | Info | Matches the written CONTEXT rule; a possible UX trap to revisit |
| IN-02 / IN-03: Safari IME Enter commit; AZERTY number keys use `event.key` | Info | Edge-case input handling |
| IN-05: place keyword travels with no confirm; generic player names can become keywords | Info | Cosmetic and design-bounded |
| IN-06 / IN-07: no timeout on an in-flight reducer promise; clock skew starts at 0 | Info | Edge cases |
| Pending todo `2026-10-05-event-tables-public-read.md` (T-47-04b) | Info, server-side | Event tables are public, so a modified client could read other players' lines. Client filtering is noise reduction only. Recorded for a server hardening phase; the phase is client-only by design. |

### Human Verification Required

These are the owner's deferred end-of-milestone checks (see frontmatter `human_verification`). They are not gaps.

1. **Keyboard-open compaction on a real phone.** Open the input on a phone; the strip and location row compact and return on blur.
2. **iOS 14px input zoom.** Focus the composer on iOS Safari; the page must not zoom.
3. **Real-phone layout at about 390x844.** Feed, hotbar, input and the tab-bar sheets are usable.
4. **Route level rule confirmation.** The owner confirms the per-location level range rule against live data.
5. **Effect time in combat only.** Effects show rounds remaining only while in combat.
6. **Follow-up fixes on the running client.** Dark scrollbars and a full-width desktop feed.

### Gaps Summary

No gaps. Every ROADMAP success criterion and all eight requirement IDs are backed by substantive, wired, data-flowing code, and the phase test directories pass when re-run here (1187 tests). The accepted data limits (empty Nearby objects, effect time in rounds in combat only, unused `item_cooldown`, objective progress instead of a faction split) are documented owner decisions. The status is `human_needed` only because the owner chose to defer the device and visual checks listed above.

---

_Verified: 2026-10-05_
_Verifier: Claude (gsd-verifier)_
