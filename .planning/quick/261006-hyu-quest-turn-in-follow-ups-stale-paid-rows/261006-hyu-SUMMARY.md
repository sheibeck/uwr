---
phase: quick
plan: 261006-hyu
subsystem: server
tags: [quests, turn-in, journal, quest-history, loot]
status: complete
key-files:
  created:
    - spacetimedb/src/reducers/quest_turn_in_history.test.ts
    - spacetimedb/src/reducers/quest_item_pickup.test.ts
  modified:
    - spacetimedb/src/reducers/quests.ts
    - spacetimedb/src/reducers/intent.ts
    - spacetimedb/src/reducers/commands.ts
    - spacetimedb/src/reducers/quest_hail_turn_in.test.ts
    - spacetimedb/src/reducers/quest_turn_in.test.ts
    - spacetimedb/src/reducers/quest_reward.test.ts
commits:
  - fa0a050a fix(quick-261006-hyu): turned-in quests stay as history, journal line on turn-in, one package pickup helper
  - 2a64fdd0 test(quick-261006-hyu): turn-in history, journal wording per quest type, package cleanup, say wording
  - a05f628b test(quick-261006-hyu): reducer and intent package pickup behave the same, aggro roll boundary
---

# Quick Task 261006-hyu: quest turn-in follow-ups

Owner confirmed four quest fixes on 2026-10-06. Fix 1 changed twice during the run (see below); the final
design is the owner's: keep a history of completed quests instead of deleting them.

## Fix 1: turned-in quests stay as history (no schema change)

History of the decision:
1. First draft: a guard treating `completedAt` set as already paid (a shim for stale rows). Dropped by the
   coordinator (greenfield rule, no shim). It was never committed.
2. Then: "no code, every path deletes the instance". Never committed either.
3. Final, owner decision: "keep a history of completed quests, mark it complete, not just delete".

`completedAt` already meant "turned in" everywhere: it was only ever set at turn-in (combat.ts comment
"only when turning in to NPC"), and the client's `rails/quests.ts` already drops rows with it set. So the
existing columns are enough; no new column.

- `turnInCompletedQuest` no longer deletes the row. It sets `completedAt = ctx.timestamp` and keeps it.
  (This reverses what dc1be40a / quick hky did.)
- A row with `completedAt` set is refused by every path (`turn_in_quest`, "turn in <quest>", hail via the
  helper): "You've already turned in {quest}." Nothing is paid, no journal line, no memory write.
  The helper re-reads the row, so a stale `qi` argument cannot double pay. Hail only turns in rows that are
  `completed` and not turned in, so it never prints the refusal; it greets as usual.
- Turned-in rows are not active:
  - quests command: list and `n/4` count skip them; "no active quests" when only history exists
  - abandon: `abandon_quest` reducer, "abandon" and "confirm abandon" intents refuse
    ("You've already turned in {quest}; it cannot be abandoned.") and keep the row
  - active counts (`getActiveQuestCount`, `getActiveQuestCountForNpc`, so `MAX_ACTIVE_QUESTS` in
    llm_apply and npc_interaction), kill / loot / explore / search progress: already skip `completed` rows,
    which turned-in rows still are. Unchanged, now pinned by tests.
  - duplicate accept: the say-reducer offer sees any instance of the template (including a turned-in one)
    and does not re-accept; llm_apply dedupes on template name. Unchanged.
  - client: `src/rails/quests.ts` `trackedQuests` already filters `completedAt`; no client file touched.
    The only client reader of `quest_instance` rows is `game.quests` -> `TrackingList.vue`.
- A completed-history section in the quests command was optional and is not added.

## Fix 2: NPC Journal entry on turn-in

`turnInCompletedQuest` writes `appendNpcDialog` (the Journal, `npc_dialog`) for the turn-in NPC (the
recipient for a delivery with one). The old hail path wrote a kill line and a delivery line; those are the
base wording (`questTurnInJournalLine`). One line per type:

| type | line (after "{NPC} says,") |
|------|------|
| kill | Well done! You have slain N {enemy}(s). |
| kill_loot | Well done! You have brought me N {item}(s). |
| boss_kill | It is done, then. {name} is dead. Well done! |
| explore | So you found your way to {location}. Well done! |
| delivery | Ah, you've brought {item}. Thank you. (no item name: "Ah, you've brought it. Thank you.") |
| gather | You have gathered N {item}(s). Well done! |
| escort | You saw the journey through. Thank you. |
| interact | You've seen to it. Thank you. |
| discover | You found {item or location}, then. Well done! |
| unknown | Well done! "{quest}" is finished. |

Tests cover every type through `turn_in_quest`, and the kill line through all three paths.

## Fix 3: one package pickup helper

`pickUpQuestItem(ctx, character, questItem, appendPrivateEvent, aggro)` in quests.ts: mark looted, complete
the matching unfinished instance (progress 1), messages, then the 30% aggro roll. `loot_quest_item` and
the "loot <item>" intent both call it, so the intent now also rolls aggro (it had none). Randomness is the
same deterministic `(characterId ^ ctx.timestamp) % 100 < 30` the reducer used; no `Math.random`. The
reducer still validates ownership / discovered / looted; the intent still matches by name at the location.
The intent passes `deps.ensureSpawnsForLocation`, `deps.effectiveGroupId`, `deps.startCombatForSpawn`.
Tests: both paths leave identical rows and messages with and without aggro, combat starts at roll < 30
only, boundary at 29 / 30 with stubs, a failing aggro is swallowed, turned-in and complete instances are
never touched.

## Fix 4: leftovers

- Turn-in deletes the quest's `quest_item` rows for that character (the package). Other quests' rows and
  other characters' rows stay; a refused turn-in keeps the package. It applies to every quest type (they are
  all spent progress markers), not only delivery.
- The say reducer's deprecated dialogue-tree auto-accept used "Slay N X(s)" for every quest. It now uses
  `questObjectiveText` (Slay / Hunt and collect / Explore / Deliver / Defeat / Gather / Escort / Interact /
  Discover, the verbs the quests list already uses). Kill wording is unchanged.

## Deviations from Plan

- Fix 1 design changed twice by coordinator / owner messages (above); no code from the earlier designs was
  committed.
- Existing suites updated, as the owner design requires: `quest_hail_turn_in`, `quest_turn_in` and
  `quest_reward` asserted "instance deleted"; they now assert the row is kept with `completedAt` set.
- STATE.md not edited (the coordinator merges; the quick-task table rows of parallel tasks would conflict).

## Gates

- Touched quest suites (hail turn-in, turn-in, reward, history, pickup): pass.
- Full spacetimedb suite excluding `measurement.results.test.ts`: 90 files, 4008 tests, all pass.
- `pnpm exec vue-tsc -b` at the repo root: exit 0 (the first run installed missing node_modules in the
  worktree).
- No schema change, no bindings change, no publish, no `--clear-database`, no prompt / Keeper Bible / route
  text changes. The word "ripple" does not appear (the repo's banned-word test passes).

## Self-Check: PASSED
