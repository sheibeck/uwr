---
created: 2026-10-06T23:40:00Z
title: Nearby NPC rows use a chat bubble icon instead of the word "hail"
area: ui
files:
  - src/rails/nearby.ts:70
  - src/rails/NearbyList.vue:87-95
  - src/console/keywordLabel.ts:6
---

## Problem

On 2026-10-06 the owner asked to replace the word "hail" on NPC rows in the Nearby list with a chat bubble icon. In the owner's words: "Hail essentially means chat with for an NPC." Today an NPC row reads `NPC · hail` (`src/rails/nearby.ts:70`). Clicking the row hails the NPC (`NearbyList.vue:95`, `consoleApi.hail`).

## Solution

This is part of Phase 51, which reworks the Nearby rows: it adds the Examine eye, context menus and the bind stone row.

- **The icon.**
  - NPC rows get a chat bubble icon button (Phosphor, for example `PhChatCircle` or `PhChatCircleDots`). It does what the hail does today: `consoleApi.hail`, which turns in quests and opens the conversation.
  - Its accessible label and title read "Talk to {name}".
- **Remove the word "hail".** It goes from the row hint; the hint keeps only `NPC`.
- **Keep it consistent.** Decide in the UI-SPEC whether the NPC keyword buttons in the feed (`keywordLabel.ts`, "Hail {name}") also change to "Talk to {name}". The owner's request covers the Nearby menu; the feed label is a consistency call.
- **Tests:**
  - The NPC row shows the chat icon button with "Talk to {name}".
  - Clicking it hails the NPC.
  - The word "hail" no longer appears in Nearby.
