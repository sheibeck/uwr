---
quick_id: 261006-hky
type: quick
autonomous: true
files_modified:
  - spacetimedb/src/reducers/quests.ts
  - spacetimedb/src/reducers/commands.ts
  - spacetimedb/src/reducers/intent.ts
  - spacetimedb/src/reducers/quest_hail_turn_in.test.ts
---

# Quick 261006-hky: route the hail auto-turn-in and delivery completion through the shared turn-in helper

## Goal

Every quest turn-in path (turn_in_quest reducer, "turn in <quest>" intent, hailing an NPC) gives the same
rewards and side effects through `turnInCompletedQuest` and leaves the quest instance in the same state
(deleted). Reward formula unchanged (999.12 is separate).

## Findings (quest completion / reward paths)

1. `turn_in_quest` reducer (quests.ts) -> `turnInCompletedQuest` (shared).
2. `submit_intent` "turn in <quest>" (intent.ts) -> `turnInCompletedQuest` (shared).
3. `hailNpc` auto-turn-in (commands.ts): xp + 10 affinity only, kill-only wording, sets `completedAt`
   and keeps the instance (no gold, no item, no NPC memory). The kept row stays `completed: true`, so
   turn_in_quest would pay it a second time.
4. `hailNpc` delivery completion (commands.ts): hailing a delivery quest's `targetNpcId` NPC completes
   and rewards an instance that is NOT yet completed (package never picked up): xp + 15 affinity only,
   sets `completedAt`, keeps the instance.
5. Progress-only (mark `completed`, no rewards): combat.ts kill progress, loot_quest_item (quests.ts),
   intent "loot <item>". These say "Return to <giver>", which is wrong for a delivery with a recipient.
6. Not completion: llm_apply.ts creates quest_template + quest_instance; abandon paths; character delete.

## Tasks

### Task 1: helper + hail + delivery routing
- quests.ts: `questTurnInNpcId(qt)` = delivery quest with `targetNpcId` -> recipient, else giver.
  `turnInCompletedQuest` checks the location of, names, and gives affinity to the turn-in NPC; records
  the quest in the giver's memory and, when different, the recipient's.
- commands.ts `hailNpc`: for each of the character's completed instances whose turn-in NPC is the hailed
  NPC, call `turnInCompletedQuest`. Any turned in -> stop (turn-in takes priority over the greeting, as
  before). Refused (full bags) -> the helper's in-voice refusal is shown, the quest stays, and the
  greeting still runs. Remove the separate delivery block (it rewarded without the package).
- loot messages (quests.ts loot_quest_item, intent.ts loot) and the intent quest list name the turn-in NPC.

### Task 2: tests (`quest_hail_turn_in.test.ts`), strict mock DB, real handlers
hail auto-turn-in and delivery-at-recipient: gold, xp (incl. level-up crossing), item, memory, affinity
equal the turn_in_quest path; full bags refuse with no side effects and the greeting still happens; the
instance ends deleted like the other paths; xp/gold-only quest; delivery not yet picked up is not paid.
Show the tests fail on the pre-fix code.

## Verify
`pnpm vitest run --pool=forks --poolOptions.forks.singleFork` (server suite); only the known
measurement.results.test.ts failures (and any other session's scratch test) may fail.
