---
quick_id: 261006-kpj
type: quick
autonomous: true
files_modified:
  - spacetimedb/src/reducers/quests.ts
  - spacetimedb/src/reducers/commands.ts
  - spacetimedb/src/reducers/intent.ts
  - spacetimedb/src/reducers/quest_hail_intent.test.ts
---

# Quick 261006-kpj: typed "hail/talk/speak <npc>" turns in completed quests

## Bug

The new client sends `hail <name>` through `submit_intent`. The intent HAIL/TALK/SPEAK branch only
printed the NPC greeting; the turn-in lived in `hailNpc` (commands.ts, `hail_npc` reducer), which the new
client never calls. A completed quest (quest_instance 4097) could not be turned in by talking to its giver.

## Tasks

### Task 1: shared helper
- quests.ts: `turnInQuestsAtNpc(ctx, character, npc, appendPrivateEvent, fail): boolean` turns in every
  completed, not-yet-turned-in quest of the character whose turn-in NPC (`questTurnInNpcId`) is `npc`,
  through `turnInCompletedQuest`; returns whether any was turned in.
- commands.ts `hailNpc`: call the helper in place of the inline block (same behavior: a turn-in replaces
  the greeting; a refused one still greets).
- intent.ts HAIL/TALK/SPEAK: call the helper after the exact-name match; turned in -> return, else greet
  as today. Name matching is unchanged in both paths.

### Task 2: tests (`quest_hail_intent.test.ts`), real handlers, strict mock DB
`submit_intent` "hail X" / "talk to X" / "speak to X" turn in a completed quest at its giver; a delivery
turns in at its recipient; a second hail pays nothing; no completed quest -> greeting only; an NPC
elsewhere does nothing; `hail_npc` reducer unchanged.

## Verify
Touched quest and intent tests; full spacetimedb suite excluding measurement.results.test.ts.
