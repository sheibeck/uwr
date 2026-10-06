---
phase: quick-261006-a0i
plan: 01
subsystem: client-console-rails
tags: [combat, nearby, keywords, start_pull, client-only]
requires: [Phase 47 Nearby and keywords, Phase 48 con colors]
provides: [enemy rows in Nearby, ConsoleApi.pull, enemy keyword kind, enemiesHere and enemyTemplatesHere]
affects: [src/rails/NearbyList.vue, src/console/useConsole.ts, src/console/keywords.ts, src/game/gameData.ts]
key-files:
  created: [src/rails/enemies.ts, src/rails/enemies.test.ts]
  modified:
    - src/game/queries.ts
    - src/game/gameData.ts
    - src/game/context.ts
    - src/console/useConsole.ts
    - src/console/keywords.ts
    - src/console/keywordLabel.ts
    - src/console/FeedView.vue
    - src/rails/NearbyList.vue
decisions:
  - Keyword click on an enemy name is a careful pull
  - pull_state is not subscribed
  - Enemies lead the Nearby list
  - One Pull icon button per available enemy (owner decision, replaces two buttons)
metrics:
  completed: 2026-10-06
status: complete
---

# Phase quick-261006-a0i Plan 01: Nearby enemies with pull actions Summary

Players can now start fights from the v3.0 client: enemies at the location show in Nearby (desktop rail and mobile Map sheet) with a con-colored name, level, group count and state, and one Pull button (or a click on the enemy name in the feed) calls `start_pull`.

## What was built

- `src/rails/enemies.ts`: pure `enemyStatus`, `enemyRows`, `pullableSpawns` (con color via `conFor`, hints joined with a middle dot).
- `enemy_spawn` subscribed by location (`queries.enemySpawnsAt`), plus a separate by-id-list binding of the spawns' enemy templates (`enemyTemplatesHere`). The Phase 48 fight `enemyTemplates` binding is untouched. Both are in `keyedAll`, so reset disposes them.
- `ConsoleApi.pull(enemy, pullType)` and `GameReducers.startPull`; no-op offline and while `game.combat.active`.
- Enemy keyword kind (priority npc, enemy, place, node, player). No enemy keywords while in a fight, and only for `available` spawns.
- Enemy rows in `NearbyList.vue` (shared by `ContextContent`, hence the mobile Map sheet). No new section, tokens or sizes.

## Decisions

- **Keyword click is a careful pull.** One click is one action like every other keyword; careful is the cautious choice.
- **`pull_state` is not subscribed.** The spawn's own `pulling` state carries "Being pulled", and the server refuses a second pull with its own line.
- **Enemies lead the Nearby list**, ahead of NPCs, nodes and players, because they are the actionable threat the owner could not find.
- **OWNER DECISION (mid-run, from chat): one button, not two.** The planned Careful pull and Body pull icon buttons (PhFootprints and PhSword) were replaced by a single Pull button (PhSword) with aria-label and title "Pull {name}". It always sends `pullType: 'careful'`, as the keyword click does. The feed keyword label is also "Pull {name}". `ConsoleApi.pull` keeps its `pullType` parameter, but only 'careful' is wired to the UI. Body pull is not reachable from the UI. `routeInput` has no pull command today (grep found none), and no typed command was added, so a typed body pull would only work if the server's intent or command handling accepts it. Disabled rules are unchanged: in a fight, offline, or the enemy not available (no button on pulling and engaged rows).

## Commits

- 94441144 feat: subscribe enemy spawns here and derive enemy rows (Task 1)
- 3bcdac12 feat: pull action and enemy feed keywords (Task 2; its keyword label was "Careful pull")
- a5b70a7e feat: enemy rows in Nearby with one Pull button (Task 3, written as one button from the start)
- a01bf4db feat: label the enemy keyword Pull (follow-up for the owner decision; no history rewritten)

## Deviations from Plan

- **[Owner change] Two pull buttons became one**, and the keyword label became "Pull {name}" (see Decisions). Task 2 was committed with the "Careful pull" label before the change arrived, so the label was fixed in a follow-up commit.
- Otherwise the plan ran as written. No server change, no edits to `src/module_bindings`.

## Gate results

- `pnpm exec vitest run --dir src --maxWorkers=2`: 96 files, 1911 tests passed.
- `pnpm exec vue-tsc -b`: clean.
- `pnpm build`: succeeded (only the existing chunk-size warning; bundle clean).
- No file under `spacetimedb/` or `src/module_bindings` changed.

## Known Stubs

None.

## Threat Flags

None. Enemy names are text-interpolated and attribute-bound only; the img-onerror payload tests are in `ContextContent.test.ts` and `FeedView.test.ts`.

## Self-Check: PASSED

Files `src/rails/enemies.ts` and `src/rails/enemies.test.ts` exist, and commits 94441144, 3bcdac12, a5b70a7e and a01bf4db are in `git log`.
