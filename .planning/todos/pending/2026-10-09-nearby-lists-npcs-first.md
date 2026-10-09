---
created: 2026-10-09T17:20:00.000Z
title: Nearby lists NPCs first (they are the quest hooks)
area: ui
files:
  - src/rails/NearbyList.vue:36-47 (group order comment) and the template sections (~L417-558)
  - src/rails/pools.ts:399-440 (nearbyGroups: creatures, named, resources, then 'Also here')
  - .planning/phases/51.3.1.1-density-pools/51.3.1.1-UI-SPEC.md (Nearby sections; group order test at ~L778)
---

## Problem

Owner, 2026-10-09: "NPCs should be listed first in the nearby list. Those are quest hooks and should be most visible."

Today the Nearby rail groups run, in order: Creatures (one card per family), Named and quest targets, Resources, then "Also here" (NPCs, bind stone, objects, players). At a busy place the NPC rows sit at the bottom, below a long run of creature and resource cards, so the people who give quests are the hardest to see. The rail width todo (51.5.1) helps but does not fix the order.

## Solution

- Move the NPC rows to the top of Nearby, before Creatures, as their own group (label to settle with the owner, for example "People"; follow the existing label rule: shown only when another group renders).
- Keep the rest of "Also here" (bind stone, objects, players) where it is, unless the owner wants players up top with the NPCs (ask).
- Order within NPCs: those with a quest to offer (or a tracked quest's NPC) first, if that signal is available on the client; otherwise the current order.
- Update `nearbyGroups` (or the template order), the NearbyList comment, the 51.3.1.1 UI-SPEC Nearby section, and the group-order tests; check the mobile Map sheet, which reuses ContextContent.
- Client only; no server change.
Decided (owner, 2026-10-09): "put it in 51.5.1". Pulled into Phase 51.5.1 Motion and Polish (success criterion 5).
