---
phase: 51-ledger-screens-world-and-people
plan: 06
subsystem: ui
tags: [vue, rails, nearby, examine, talk, bind-stone, party-stamina, client]
status: complete

requires:
  - phase: 51-ledger-screens-world-and-people
    provides: "51-01 travelStaminaCost and travelEffectDiscount (@game-data/travel_config), look at bind stone on the server; 51-03 regenerated bindings (bind_location)"
provides:
  - "ConsoleApi.look() and GameReducers.bindLocation (inert versions carry both)"
  - "Nearby rows with an Examine eye on every row, a Talk chat bubble on NPCs and a bind stone row with Bind"
  - "Examine eye beside each HostileCard in the encounter list"
  - "Party member stamina text and the low-stamina mark on the vitals rail"
  - "Feed keyword label 'Talk to {name}' for NPC names"
affects: [51-10, 51-11, 51.1]

tech-stack:
  added: []
  patterns:
    - "Row action cluster: span.row-actions holds the row's own actions then the eye; the main part stays static or a single gather button"
    - "Reducer call through createActionRunner (inert while pending, aria-disabled offline), results in the feed"

key-files:
  created:
    - src/rails/NearbyList.test.ts
  modified:
    - src/game/context.ts
    - src/console/useConsole.ts
    - src/console/useConsole.test.ts
    - src/console/keywordLabel.ts
    - src/console/FeedLine.test.ts
    - src/console/FeedView.test.ts
    - src/rails/nearby.ts
    - src/rails/nearby.test.ts
    - src/rails/NearbyList.vue
    - src/rails/ContextContent.test.ts
    - src/frame/AppFrame.populated.test.ts
    - src/combat/EncounterPanel.vue
    - src/combat/EncounterPanel.test.ts
    - src/rails/party.ts
    - src/rails/party.test.ts
    - src/rails/PartyBlock.vue
    - src/rails/PartyBlock.test.ts

key-decisions:
  - "The bind stone row id is 0n (one row per place) and its eye sends 'bind stone' (lowercase) with the aria-label 'Examine bind stone'; every other eye is 'Examine {name}'"
  - "Focus after Bind moves to the row's Examine eye once both the bind promise resolved and the character row says bound, in either order"
  - "The party stamina part is aria-hidden; a sibling .sr-only span carries 'Stamina {s} of {max}' (plus ', too low to travel') so a screen reader does not hear it twice"
  - "selfCardView carries stamina but lowStamina false: the self card is only drawn in combat, where no stamina text shows"

patterns-established:
  - "Eye buttons carry class btn-eye; the Nearby list finds the bind row's eye through .kind-bindStone .btn-eye for focus"

requirements-completed: [LDG-05]

coverage:
  - id: D1
    description: "ConsoleApi.look sends a bare look intent; GameReducers.bindLocation typed; npc keyword reads Talk to; Nearby model has the bind stone row and the NPC hint"
    requirement: "LDG-05"
    verification:
      - kind: unit
        ref: "src/console/useConsole.test.ts (look online/offline), src/console/FeedLine.test.ts, src/console/FeedView.test.ts, src/rails/nearby.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every Nearby row has an Examine eye outside the main part; NPC Talk and Trade; bind stone row with Bind, pending, offline, bound and focus; eye beside each HostileCard"
    requirement: "LDG-05"
    verification:
      - kind: unit
        ref: "src/rails/NearbyList.test.ts (17), src/rails/ContextContent.test.ts, src/frame/AppFrame.populated.test.ts, src/combat/EncounterPanel.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Party member cards show 'Lv n · s st' with the low mark from the shared stamina rule"
    requirement: "LDG-05"
    verification:
      - kind: unit
        ref: "src/rails/party.test.ts, src/rails/PartyBlock.test.ts (incl. source guard on @game-data/travel_config)"
        status: pass
    human_judgment: false

duration: ~55min
completed: 2026-10-07
---

# Phase 51 Plan 06: Rail rows (Examine, Talk, bind stone, party stamina) Summary

**Every rail row can be examined from an eye beside it, NPCs are talked to from a chat bubble, a bind stone row offers Bind, enemy cards get an eye beside them, and party cards show stamina with a too-low-to-travel mark from the shared rule.**

## Commits

| Task | Commit |
|------|--------|
| 1 look(), bindLocation, Talk to label, Nearby model with bind stone | e22e6fc0 |
| 2 Nearby rows (eye, Talk, Bind) and the hostile-row eye | bf9ef78d |
| 3 Party stamina text and low mark | 506c25d2 |
| Fix: drop the container query the frame contract forbids | fed789d7 |

## Accomplishments

- `ConsoleApi.look()` closes the open screen, clears the conversation and sends `look` as an intent with echo `look` (offline sends nothing). `GameReducers.bindLocation({ characterId })` is typed (generated binding `bind_location`, `conn.reducers.bindLocation`).
- `keywordActionLabel` for NPC entries reads `Talk to {name}`; the typed `hail` command and its routes are untouched.
- `nearbyRows` order is NPCs, bind stone, objects, nodes, players; NPC hint `NPC`, object hint empty, bind stone hint `Bound here` when bound; `NearbyRow.bound` added.
- `NearbyList.vue`: every row is `[icon][name ... hint][span.row-actions]` with the eye last (PhEye 16, 28px, 44px under 899px). NPC and object rows are static; a gatherable node keeps its gather click. NPC cluster: Talk (PhChatCircleDots), Trade (vendors), Examine. Bind stone row (PhCastleTurret): `Bind` (`aria-label` `Bind to {place}`, title `Respawn here after defeat`) runs `bindLocation` through `createActionRunner` key `bind`; bound shows `Bound here` in accent-300 and no button; focus moves to the row's eye after a successful bind.
- `EncounterPanel.vue`: each `HostileCard` sits in `div.hostile-row` with an Examine eye as its sibling; `HostileCard.vue` is unchanged.
- `partyMembers` now carries `stamina`, `maxStamina`, `lowStamina` (cost from `travelStaminaCost({ crossRegion: false, ... })` and the member's own `travelEffectDiscount`); `PartyBlock.vue` shows `Lv n · s st` out of combat with title and `.sr-only` text, and the red mark with PhWarningCircle when low.

## Verification

- Touched suites: console, rails, combat, frame, styles all pass.
- `npx vue-tsc -b`: exit 0.
- Full `npx vitest run` from the repo root: 299 files pass; only the three baseline failures (scripts/llm/call_log_report.test.mjs, scripts/llm/proof_rules.test.mjs, spacetimedb/src/helpers/measurement.results.test.ts).
- No publish, no bindings change, no server change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Hint hiding without a container query**
- **Found during:** full-suite run after Task 3
- **Issue:** the first Nearby CSS used `@container (max-width: 200px)` to hide the hint; `frameContract.test.ts` allows only one container query (HeaderBar.vue).
- **Fix:** removed the container query; the hint now has `flex-shrink: 100; min-width: 0; overflow: hidden`, so it gives way before the name (the UI-SPEC's literal `min-width: 0` and `overflow: hidden`). The hint can clip partially instead of vanishing at a fixed 120px of name; the name still ellipsizes after it.
- **Files modified:** src/rails/NearbyList.vue
- **Commit:** fed789d7

**2. [Process] Test order**
- Task 1 tests were written first and failed; Tasks 2 and 3 were implemented and then tested in the same pass (no separate RED commit). The plan has no `type: tdd` plan-level gate, only task flags.

### Plan wording kept

- Player rows keep the hint `Lv {n}` (the UI-SPEC's `In your party` variant is not in this plan's interfaces).

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None. T-51-24: names render as text nodes (NearbyList.test.ts renders an img-onerror name as text); T-51-27: the action runner ignores a second Bind while pending (tested). T-51-25 and T-51-26 accepted as planned.

## Exports for later plans

- `src/game/context.ts`: `ConsoleApi.look(): void` (use for the Here card title eye, 51-10), `GameReducers.bindLocation`, inert `look() {}`.
- `src/console/useConsole.ts`: `look` is in the returned object.
- `src/rails/nearby.ts`: `NearbyKind` adds `'bindStone'`; `NearbyRow.bound`; `nearbyRows({ ..., bindStone?: { placeName, bound } | null })`.
- `src/rails/NearbyList.vue`: eye buttons have class `btn-eye`; the cluster is `span.row-actions`; the bind runner is local to the component.
- `src/combat/EncounterPanel.vue`: `.hostile-row`.
- `src/rails/party.ts`: `PartyMemberView.stamina`, `maxStamina`, `lowStamina`; `partyMembers({ ..., effects })` takes `game.effects` rows; 51.1's leader warning line can read `lowStamina` per member.
- Tests that pinned row-click hail, `NPC · hail` and the `Hail` label were moved to the new behaviour; ContextContent/AppFrame tests that count buttons per row must now include the Examine eye.

## Self-Check: PASSED

- src/rails/NearbyList.test.ts exists.
- Commits e22e6fc0, bf9ef78d, 506c25d2, fed789d7 exist.
