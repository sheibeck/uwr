---
created: 2026-03-09T23:45:00.000Z
title: Show cast times in ability descriptions
area: ui
files:
  - src/components/CharacterCreation.vue
  - src/components/LevelUp.vue
---

## Problem

With the ability balance pass in phase 33 (ABILITY_DAMAGE_SCALER, MANA_COST_MULTIPLIER, MANA_MIN_CAST_SECONDS), cast times are now a meaningful part of ability selection. But ability descriptions during character creation and level up don't show cast time, mana cost, or cooldown — making it hard for players to make informed choices.

## Solution

- Add cast time, mana cost, and cooldown to ability description cards shown during character creation and level-up ability picking
- Format like the hotbar tooltip already does (added in quick-233-01)
