---
quick_id: 261006-gy6
status: complete
date: 2026-10-06
commits: [9d263c50, a660736d, 963b6207, bfd908a4, 7b38a16f]
---

# Quick Task 261006-gy6 Summary: quest turn-in follow-ups

Follow-up to 261006-g12. Both turn-in paths (`turn_in_quest` and the "turn in <quest>" intent players use) now call one helper, `turnInCompletedQuest` in `spacetimedb/src/reducers/quests.ts`, so they behave identically. Reward formula unchanged (backlog 999.12). No schema change, no publish.

## Changes

- 9d263c50: shared `turnInCompletedQuest` (present line, xp, gold, item, affinity, NPC memory, quest removal). The intent path now calls `recordQuestCompletion`, as `turn_in_quest` did. `turn_in_quest` gains the "You present your completed quest" line.
- a660736d: an item-reward quest needs one free bag slot (`getInventorySlotCount < MAX_INVENTORY_SLOTS`, the take_loot rule for a non-stackable item), checked before anything is applied. Full bags: `fail()` with "Hesk Varrow holds out your reward for "X", but your pack is full and you cannot take it. Free a space in your pack and turn the quest in again." Nothing is awarded and the quest stays ready. Quests without an item need no space.
- 963b6207: quest xp goes through `awardQuestXp` -> `awardXp(ctx, character, character.level, xp)`. Level diff 0 is the 100% modifier, so the promised amount is unchanged (same call as the hail auto-turn-in in commands.ts). A crossed threshold raises `pendingLevels` and shows the combat prompt ("You can advance to level N! Click [Level Up] when ready." / pending-levels variant); the level_up reducer applies it and queues the skill offer. At MAX_LEVEL awardXp grants 0, so the helper adds the promised xp directly there (no level-up possible), as before.
- bfd908a4: `questRewardItemName`: the reward keeps the quest's item name unless an item_template already has it (case-insensitive, like `findItemTemplateByName`); then "<Giver>'s <name>" (number appended if taken, "Quest-won <name>" with no giver). Starter templates exist from init, so a reward can no longer be overwritten by the starter upsert-by-name or handed out by `grantStarterItems` / crafting lookups. The starter upsert is unchanged (a row-identity fix would need a schema column).
- 7b38a16f (small extra found while sharing): the giver-location check moved from the intent branch into the helper; `turn_in_quest` let a direct reducer call turn in from anywhere.

## Tests

`spacetimedb/src/reducers/quest_turn_in.test.ts`, 30 tests, real `turn_in_quest` and `submit_intent` handlers on the strict mock db, each case on both paths: NPC memory; full bags refuse with no side effects, freed slot succeeds, 49/50 ok, xp/gold quest unaffected; one and two thresholds crossed, below threshold, max level; starter-name clash (exact, lowercase, upsert re-run with the reward iterated first, second clash, no clash); away from the giver. Mutation checks (production files stashed): memory 1 fail (intent), inventory 4, xp 4, name clash 8, location 1 (turn_in_quest).

## Verification

- Server vitest (single worker): 4026 passed, 2 failed (pre-existing `measurement.results.test.ts`, missing `.planning/phases/39-*`).
- `tsc --noEmit`: no new errors; the pre-existing `intent.ts` bigint errors moved from ~965 to 938.

## Not fixed (reported)

- A starter name added in a future publish that equals an already-granted reward name would still be overwritten by the upsert (needs a template-origin column).
- Any name clash renames, including two rewards that share an LLM name; harmless but the item may not carry exactly the promised name.
- The hail auto-turn-in in `commands.ts` (`completedAt` path, delivery quests) is a third reward path that does not use the shared helper (no item reward, no gold, no NPC memory, different affinity).
