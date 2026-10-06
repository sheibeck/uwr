---
created: 2026-10-06T17:05:00Z
title: Add a visible quest turn-in action to the new client
area: ui
files:
  - src/input/routeInput.ts
  - src/rails/NearbyList.vue
  - src/rails/ContextContent.vue
  - spacetimedb/src/reducers/quests.ts (turnInCompletedQuest, questTurnInNpcId)
---

## Problem

On 2026-10-06 the owner reported: "I have a completed quest called Thinning the Ebb Line, but I can't seem to turn it in."

Checked against the local database (read-only):
- `quest_instance` 4097: progress 4 of 4, `completed` true. It is a kill quest that rewards 40 gold.
- The character Elfansworth is at location 4097, the same location as the giver, Odalys Brannoch (npc 4097).
- So the server-side state is fine.

Two causes:
1. **The fixes are not live.** The local server runs a build from before session uwr-7b's fixes (quick 261006-gy6 and 261006-hky). That build only turns in delivery quests on a hail. The fixes are committed but not yet published; the next local publish carries them.
2. **The new client has no turn-in affordance.** The only path is typing `turn in <quest>`, which reaches the server through routeInput and `submit_intent`. Nothing on screen shows that a completed quest can be handed in, or where.

## Solution

- When a tracked or active quest is completed and the active character is at its turn-in NPC, show a "Turn in" action. The turn-in NPC is `questTurnInNpcId`: the recipient for deliveries, otherwise the giver.
- Show it on that NPC's Nearby row and in the context rail's quest or event card.
- It calls the existing `turn_in_quest` reducer with object syntax.
- Optionally, make the quest name in the feed a keyword whose click runs the turn-in when it is available.
- When the quest is complete but the player is not at the turn-in NPC, show where to go ("Return to Odalys Brannoch").
- Add tests:
  - when the button shows
  - that the delivery recipient is chosen over the giver
  - that the button is disabled offline and in combat
  - the escape test
- Phase 51 (Social, World events) or a quick task is a natural home for this. The data is already public.
