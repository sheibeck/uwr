---
phase: quick
plan: 261006-hky
subsystem: server
tags: [quests, turn-in, hail, delivery, rewards]
status: complete
key-files:
  created:
    - spacetimedb/src/reducers/quest_hail_turn_in.test.ts
  modified:
    - spacetimedb/src/reducers/quests.ts
    - spacetimedb/src/reducers/commands.ts
    - spacetimedb/src/reducers/intent.ts
commits:
  - dc1be40a fix(quick-261006-hky): hail turn-in and delivery completion use the shared quest turn-in
---

# Quick Task 261006-hky: hail turn-in and delivery completion use the shared quest turn-in

## Quest completion / reward paths found

| Path | Where | Before | Now |
|------|-------|--------|-----|
| `turn_in_quest` reducer | quests.ts | `turnInCompletedQuest` | unchanged |
| "turn in <quest>" intent | intent.ts | `turnInCompletedQuest` | unchanged |
| hail auto-turn-in | commands.ts `hailNpc` | xp + 10 affinity, kill-only wording, set `completedAt`, kept the instance (still `completed`, so `turn_in_quest` could pay it again) | `turnInCompletedQuest` |
| hail delivery completion | commands.ts `hailNpc` | paid xp + 15 affinity on hailing the recipient while the instance was NOT complete (package never picked up), set `completedAt`, kept the instance | removed; a delivery is turned in to its recipient through `turnInCompletedQuest` once picked up |
| progress only (no rewards) | combat.ts kill progress, `loot_quest_item` (quests.ts), "loot <item>" intent | mark `completed` | loot messages name the turn-in NPC |
| not completion | llm_apply.ts (creates template + instance), abandon (reducer + intent), character delete | - | - |

## Changes

- `questTurnInNpcId(qt)` (quests.ts): a delivery quest's recipient (`targetNpcId`) when set, else the giver.
- `turnInCompletedQuest`: location check, refusal wording, "present" message and the 10 affinity use the
  turn-in NPC; NPC memory records the quest with the giver and, when different, the recipient.
- `hailNpc`: turns in every completed instance whose turn-in NPC is the hailed NPC through the helper.
  Any turned in -> no greeting (turn-in priority, as before). Refused (full bags) -> the helper's in-voice
  message, nothing applied, quest stays ready, and the greeting runs.
- intent.ts quest list "Return to [X] at <loc>" and both loot messages name the turn-in NPC.
- Reward formula untouched (999.12).

## Decisions

- **Delivery target:** the recipient accepts the delivery: their location, their affinity (as the old
  hail block did), and the turn_in_quest / "turn in" paths now accept it there too. The giver still
  remembers the quest (follow-up chains come from the giver); the recipient remembers it as well.
- **Delivery needs the package:** the old block paid without the pickup; now the instance must be
  `completed`, which the loot flow sets. Delivery without a recipient is turned in to the giver.
- **Affinity amount:** 10 on every path (the old delivery hail gave 15).

## Tests

`quest_hail_turn_in.test.ts`, 15 tests, strict mock DB, real `hail_npc` / `turn_in_quest` handlers.
Pre-fix: 13 failed, 2 passed. Post-fix: 15 passed. Full server suite: 4043 passed, 2 failed (the known
`measurement.results.test.ts` missing `.planning/phases/39-*` folder).
