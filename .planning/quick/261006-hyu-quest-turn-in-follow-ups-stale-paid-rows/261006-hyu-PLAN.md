---
quick_id: 261006-hyu
type: quick
autonomous: true
files_modified:
  - spacetimedb/src/reducers/quests.ts
  - spacetimedb/src/reducers/intent.ts
  - spacetimedb/src/reducers/commands.ts
  - spacetimedb/src/reducers/quest_turn_in_followups.test.ts
  - spacetimedb/src/reducers/quest_hail_turn_in.test.ts
  - spacetimedb/src/reducers/quest_turn_in.test.ts
  - spacetimedb/src/reducers/quest_reward.test.ts
---

# Quick 261006-hyu: quest turn-in follow-ups

Owner confirmed four quest fixes in chat on 2026-10-06. Owner decision, same day: keep a history of completed
quests, "not just delete the quest, but mark it complete". That replaces the first draft of fix 1.

## Tasks

1. **Turned-in quests stay as history (no schema change).** `completedAt` already means "turned in" (set only at
   turn-in; the client's tracking list already hides rows with it). `turnInCompletedQuest` no longer deletes the
   instance: it sets `completedAt = ctx.timestamp`. Every turn-in path (turn_in_quest, "turn in", hail) refuses
   a row with `completedAt` set ("You've already turned in {quest}."), paying nothing. Turned-in rows are not
   active: the quests command, abandon (reducer and intent), hail's ready list; counts (`!completed`), kill /
   loot / explore progress (`completed` skipped), and duplicate accept checks already exclude them. Client:
   `rails/quests.ts` already filters on `completedAt`; no client change.
2. **NPC journal entry on turn-in.** `turnInCompletedQuest` writes an `appendNpcDialog` line for the turn-in NPC,
   wording by quest type (kill, kill_loot, explore, delivery, boss_kill, gather, escort, interact, discover,
   unknown). The old hail path wrote the kill and delivery lines; those are the base wording.
3. **One package pickup helper.** `pickUpQuestItem` in quests.ts: mark looted, complete the matching quest
   instance, messages, and the 30% deterministic aggro roll. `loot_quest_item` and the "loot <item>" intent
   both call it. Randomness stays `(characterId ^ ctx.timestamp) % 100`; no `Math.random`.
4. **Leftovers.** Turn-in deletes the quest's `quest_item` rows. The say-reducer dialogue-tree quest accept uses
   type-aware objective wording (`questObjectiveText`).

## Verify

Touched quest tests, full spacetimedb suite excluding `measurement.results.test.ts`, `pnpm exec vue-tsc -b`.
No schema change.
