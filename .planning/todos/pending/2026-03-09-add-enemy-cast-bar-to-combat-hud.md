---
created: 2026-03-09T23:34:37.232Z
title: Add enemy cast bar to combat HUD
area: ui
files:
  - src/components/EnemyHud.vue
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/reducers/combat.ts
---

## Problem

During combat, players cannot see when enemies are casting abilities. There is no visual indicator of what ability an enemy is preparing or how long until it fires. This makes combat feel less tactical — players can't time interrupts, dodges, or defensive cooldowns.

Enemies should rarely have instant-cast abilities. Most enemy abilities should have visible cast times so players can react.

## Solution

- Add a cast bar component to EnemyHud.vue showing the ability name and cast progress
- Ensure enemy ability data includes cast times (the MANA_MIN_CAST_SECONDS floor from 33-01 helps but may need further tuning for enemies specifically)
- Review enemy ability generation to bias toward non-instant cast times
- Fits naturally in phase 33 (combat improvements) as a follow-up plan
