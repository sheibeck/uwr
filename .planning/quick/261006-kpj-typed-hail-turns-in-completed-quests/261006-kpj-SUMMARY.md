---
quick_id: 261006-kpj
status: complete
completed: 2026-10-06
commits:
  - 05d3bbaf fix(quick-261006-kpj): typed hail/talk/speak turns in a completed quest at its giver or recipient
  - 4fd45c14 test(quick-261006-kpj): typed hail turn-in through submit_intent, plan
key-files:
  modified:
    - spacetimedb/src/reducers/quests.ts
    - spacetimedb/src/reducers/commands.ts
    - spacetimedb/src/reducers/intent.ts
  created:
    - spacetimedb/src/reducers/quest_hail_intent.test.ts
---

# Quick 261006-kpj: typed hail turns in completed quests

## Root cause

The new client's NPC talk sends `hail <name>` through `submit_intent`. The intent HAIL / TALK / SPEAK branch
only printed the greeting; the turn-in lived in `hailNpc` (`hail_npc` reducer), which the new client never calls.

## Fix

- `quests.ts`: new `turnInQuestsAtNpc(ctx, character, npc, appendPrivateEvent, fail)`, the turn-in block
  extracted from `hailNpc`. It turns in every completed, not-yet-turned-in quest the NPC accepts
  (`questTurnInNpcId`: giver, or a delivery's recipient) through `turnInCompletedQuest`, returns whether any
  was turned in.
- `commands.ts` `hailNpc`: calls the helper (behavior identical: a turn-in replaces the greeting, a refused
  one still greets).
- `intent.ts` HAIL / TALK / SPEAK: calls the helper after its existing exact case-insensitive name match;
  a turn-in returns (no greeting, same as `hailNpc`), otherwise the greeting prints as before.
- Matching semantics unchanged in both paths. Hyu rules hold since the shared path is used: history kept
  (`completedAt`), never paid twice, Journal line on turn-in.

## Tests

`quest_hail_intent.test.ts` (24 tests, real handlers, strict mock db): hail / talk to / speak to (and
uppercase) turn in at the giver with the same outcome as `turn_in_quest`; delivery turns in at the recipient
and not the giver; second hail pays nothing; no or unfinished quest means greeting only; NPC elsewhere does
nothing; full bags refuse in voice and still greet; `hail_npc` unchanged. 15 of them fail without the intent
change.

## Gates

- `quest_hail_intent.test.ts`: 24/24; full spacetimedb suite excluding `measurement.results.test.ts`:
  107 files, 4340 tests, all passed. Snapshot line-ending changes restored.

## Client path

The new client's NPC keyword click (`actOnKeyword` kind `npc`) and the Nearby "Talk" row (`NearbyList.vue`)
both call `consoleApi.hail()` in `src/console/useConsole.ts`, which sends `hail <name>` through
`submit_intent`. A typed `hail X` goes through the `hail` route and also `submit_intent`. All are fixed by the
server change; no client edits.

## Not changed

The implicit-hail fallback (bare NPC name typed with no verb, substring match) still only greets. It was out
of scope; the same helper can be added there if wanted.

## Deviations

None.
