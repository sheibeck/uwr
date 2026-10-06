---
phase: 47-console-rails-hotbar-and-input
plan: 06
subsystem: client-data-layer
tags: [spacetimedb, subscriptions, provide-inject, session, tdd]
requires: ["47-02", "47-04", "47-05"]
provides:
  - "GAME_KEY / FRAME_KEY / CONSOLE_KEY and the GameData, GameReducers, FrameControls, ConsoleApi, ConversationTarget, SubmitResult contracts"
  - "createInertGame / createInertFrame / createInertConsole"
  - "createGameData / GameConn / GameInput / GameDeps"
  - "Session.game and SessionDeps.game"
affects: [47-07, 47-08, 47-09, 47-10, 47-11, 47-12]
tech-stack:
  added: []
  patterns: ["provide/inject with inert defaults", "keyed subscriptions with filter equal to query", "optional factory dep for the session hub"]
key-files:
  created:
    - src/game/context.ts
    - src/game/gameData.ts
    - src/game/gameData.test.ts
    - src/frame/frameControls.test.ts
  modified:
    - src/session/useSession.ts
    - src/session/useSession.test.ts
    - src/App.vue
    - src/App.test.ts
    - src/frame/AppFrame.vue
key-decisions:
  - "View row lists use the underlying row types (QuestInstance, CharacterEffect, GroupInvite, FactionStanding, MyLlmJob) because the generated MyQuests, MyCharacterEffects, MyLlmJobs, MyGroupInvites and MyFactionStandings types are empty objects."
  - "The hub's static bindings (7 tables/views plus event_world) share one conn watcher; keyed bindings own their conn watchers through createKeyed."
  - "Event bindings swap immediately; every table binding uses swap-on-applied and a filter equal to its query."
  - "partyKey excludes the active character, so knownCharacters holds only other party members and pending inviters."
requirements-completed: [CON-01, CON-03, CON-04, CON-05, CON-06]
status: complete
duration: 25min
completed: 2026-10-05
---

# Phase 47 Plan 06: Game data hub and injection contracts Summary

One hub (`createGameData`) owns every Phase 47 subscription and feeds the four event tables into the feed store and the server clock; `GAME_KEY`, `FRAME_KEY` and `CONSOLE_KEY` define what 47-07 to 47-12 inject, each with an inert default so the Phase 45 shells still mount bare.

## What was built
- `src/game/context.ts`: the interfaces from the plan (`GameReducers`, `GameData`, `FrameControls`, `ConsoleApi`, `ConversationTarget`, `SubmitResult`), three Symbol-backed `InjectionKey`s and three inert factories. The inert game has empty lists, null character, `connected` false, `reducers` null, a real empty feed store and clock. The inert console's `submit()` returns `'offline'`; the inert frame has `isDesktop` true and no-op methods.
- `src/game/gameData.ts`: `createGameData(deps, input)`.
  - Once per connection: `my_character_effects`, `my_quests`, `my_llm_jobs`, `my_group_invites`, `my_faction_standings`, `faction`, active `world_event` (filter `status === 'active'`) and `event_world`.
  - By user: `event_private`. By location: `event_location`, `npc`, `resource_node`, `character`, `location_connection`. By character: `hotbar`, `hotbar_slot`, `ability_template`, `ability_cooldown`, `event_contribution`, `renown`, `renown_perk`. By group: `group`, `group_member`, `event_group`. By id list: party and inviter characters, quest templates (by quests' template ids), event objectives (by active event ids).
  - Every keyed table binding passes `filter` equal to its query (key match, or id-set membership parsed from the key). Event rows call `clock.sample(createdAt)` then `feed.ingest(source, row)`.
  - Derived: `connected`, `inCombat` (`combatTargetEnemyId != null`), `playersHere` (without the active character), `group`, `reducers` (null unless connected), `privateEventsApplied`. `feed.setCharacter` follows the active character id. `reset()`/`dispose()` dispose static and keyed bindings and clear the feed.
- `src/session/useSession.ts`: optional `deps.game` factory, `Session.game` (inert when no factory), `game.reset()` right after `disposeBindings()` in `logout()`, `game.dispose()` in `dispose()`. `createDefaultSession` is now `createSession<SessionConn & GameConn>` with a factory calling `createGameData({ bind: bindTable, bindEvent: bindEventTable, queries: gameQueries() }, input)`.
- `src/App.vue`: `provide(GAME_KEY, session.game ?? createInertGame())`.
- `src/frame/AppFrame.vue`: `provide(FRAME_KEY, frameControls)`; the controls object is built once. `openScreen` uses the focused element as the opener; `closeScreen` closes only when a screen is open.

## Verification
- `pnpm exec vitest run --dir src --maxWorkers=2`: 61 files, 1055 tests pass (was 59 files, 1020 tests; 35 new tests: gameData 24, useSession 4, App 2, frameControls 5).
- `pnpm exec vue-tsc -b`: exits 0 (including the real-connection assignment `createSession<SessionConn & GameConn>` in `createDefaultSession`).
- `pnpm build`: passes, "bundle clean: 4 files scanned".
- `git status --porcelain spacetimedb src/module_bindings`: empty.

## Existing assertions changed
None. All Phase 45 session, App and AppFrame tests pass unchanged; the useSession test harness gained an optional `game` option that passes through to deps (additive), and App.test.ts / useSession.test.ts only gained new tests and imports.

## Deviations from Plan
**1. [Rule 1 - Type bug] View row types in `GameData` and `GameConn`**
- **Found during:** Task 1 (reading the generated bindings)
- **Issue:** The plan's interface lists `MyQuests`, `MyCharacterEffects`, `MyLlmJobs`, `MyGroupInvites` and `MyFactionStandings` as row types. In `src/module_bindings/types.ts` these are empty objects (`__t.object("MyQuests", {})`), so consumers could not read any field.
- **Fix:** Use the row types the views actually return: `QuestInstance`, `CharacterEffect`, `MyLlmJob`, `GroupInvite`, `FactionStanding` (field lists checked equal to the view table files). Same approach the session already uses for `my_player` (`Player`).
- **Files modified:** src/game/context.ts, src/game/gameData.ts
- **Commit:** f3f5eb91
- Impact for 47-07 and later: import those five row types, not the `My*` names.

**2. Process:** as in 47-01 to 47-05, tests and implementation were committed once per task, not as separate RED/GREEN commits. The plan type is `execute`, so no TDD gate section applies.

Minor, no behavior change: Task 3's probe stubs `FeedShell` (rendered in both layouts) instead of `ContextRail` (desktop only), so one probe covers the desktop and mobile cases.

## Threat model
- T-47-04a mitigated: only the filtered queries from 47-05 are used; gameData.test.ts asserts the sql for each key and each filter rejecting a row from another key; the feed store re-checks ownership.
- T-47-04b transferred as planned (server tables stay public).
- T-47-05 accepted: the hub forwards only object-syntax reducer calls; the active character id is the caller's job (47-09).
- T-47-13 mitigated: `logout()` calls `game.reset()` after the bindings are disposed (tested for order); `dispose()` disposes the hub.

## Known Stubs
None. `createInertGame`, `createInertFrame` and `createInertConsole` are intentional defaults for bare mounts, not unwired data; `ConsoleApi` is an interface here and is implemented in 47-09.

## Threat Flags
None.

## Deferred owner verification
None (no checkpoint tasks in this plan). Not tested against a live server (owner constraint): the SQL text of every subscription is covered by 47-05's queries test, but server acceptance and the live event flow into the feed first run when the owner tries the client.

## Commits
- f3f5eb91 feat(47-06): injection contracts and the game data hub
- 717872ce feat(47-06): session owns the game hub and App provides it
- 38a072a1 feat(47-06): AppFrame provides frame controls

## Self-Check: PASSED
