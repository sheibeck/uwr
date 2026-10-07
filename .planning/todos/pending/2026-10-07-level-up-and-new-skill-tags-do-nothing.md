---
created: 2026-10-07T00:00:00Z
title: Level up and New skill tags do nothing, so players cannot level up
area: ui
files:
  - src/frame/HeaderBar.vue:48-49
  - src/frame/VitalsStrip.vue:130
  - src/stats/StatsScreen.vue:87-90
  - src/session/frameView.ts:98-99
  - spacetimedb/src/index.ts:476 (choose_skill)
  - spacetimedb/src/index.ts:574 (apply_level_up)
  - spacetimedb/src/reducers/combat.ts:2187,2206 ("Click [Level Up] when ready.")
---

## Problem

The owner, 2026-10-07 (verbatim): "the level up chit isn't clickable, so I can't level up."

Root cause (code read 2026-10-07):
- The server keeps levels pending (`character.pendingLevels`) and applies one per `apply_level_up({ characterId })` call (`index.ts:574`), which also starts the new-skill generation. The binding `applyLevelUp` exists in `src/module_bindings`.
- No client code calls it. The old UI's level-up button (quick-398, `ae296aa6`) was deleted with the old client in 45-01 (`d86ad950`).
- The new client's "Level up" tags are display-only `<span>`s in `HeaderBar.vue`, `VitalsStrip.vue` and `StatsScreen.vue` ("Level up available"). Each UI-SPEC deferred the flow to a later phase: 45 → 47 (A11) → 50 (A17: "the level-up flow is not part of this phase"). No phase owns it, so it was never built.
- The "New skill" tag has the same gap: `choose_skill({ pendingSkillId })` (`index.ts:476`) has no client caller, so a player cannot pick the generated skill either.
- The server's feed line says "Click [Level Up] when ready.", but nothing on the client answers it.

## Solution

Build the flow (client; the reducers exist):
1. The Level up tag becomes a button (header, mobile vitals strip, Stats meta). It opens a confirm ("Advance to level {n}?", with what changes if the server data allows) and calls `applyLevelUp({ characterId })` through an action runner, with pending, offline and refusal states. Disabled in combat if the server refuses there.
2. The New skill tag opens the pending skill choice: the generated options from `pending_skill` (name, description, cost, cooldown) and a Choose button calling `chooseSkill({ pendingSkillId })`.
3. Make the "[Level Up]" text in the feed a keyword link that opens the same flow, or reword the server line (server text, no prompt).
4. Tests for each entry point, the confirm, the reducer call with object args, and the skill choice.
Note: `apply_level_up` starts a skill-generation LLM call; that is normal play, but tests must not make paid calls.
