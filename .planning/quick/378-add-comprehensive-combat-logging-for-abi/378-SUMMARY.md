---
phase: quick-378
plan: 01
subsystem: combat
tags: [combat, logging, narrative, UX]
dependency_graph:
  requires: []
  provides: [comprehensive-combat-logging]
  affects: [combat-helpers, combat-reducers]
tech_stack:
  added: []
  patterns: [enemy-actor-logging, effect-expiry-notifications]
key_files:
  created: []
  modified:
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/combat.ts
decisions:
  - Enemy buff/shield actions notify all combat participants (not just target)
  - Effect expiry skips food/travel/regen types to avoid log spam
  - Enemy effect fade notifications go to all participants
metrics:
  duration: 3min
  completed: 2026-03-08
---

# Quick Task 378: Add Comprehensive Combat Logging Summary

Enemy ability usage, DoT/HoT first ticks, buff/debuff application, and effect expiry now produce narrative log entries for affected players.

## What Changed

### Task 1: Enemy-actor logging in resolveAbility (70dd575)

Added else-if branches for `actor.type === 'enemy'` in 8 ability kinds:
- **damage**: Target player sees "{enemy}'s {ability} hits you for {N} damage."
- **dot**: Target player sees damage message + burning effect notification
- **buff**: All combat participants notified when enemy buffs itself
- **debuff**: Target player sees "{enemy}'s {ability} weakens you."
- **shield**: All participants see "{enemy} shields itself with {ability}."
- **cc**: Target player sees "{enemy}'s {ability} stuns you!"
- **drain**: Target player sees drain damage message
- **execute**: Target player sees damage with EXECUTE bonus if applicable

Also added first-tick logging in `addCharacterEffect`:
- HoT first tick: "{ability} heals you for {N}."
- DoT first tick: "{ability} burns you for {N} damage."

### Task 2: Effect expiry logging in tickEffectsForRound (b3b0c7e)

- Character effect expiry: "{ability} has worn off." for combat-relevant types only
- Logged types: regen, dot, damage_up, armor_up, ac_bonus, damage_shield, hp_bonus, magic_resist, stamina_free, stun, armor_down
- Skipped types: food_health_regen, food_mana_regen, food_stamina_regen, travel_discount
- Enemy stun expiry: All participants see "{ability} on {enemy} fades."
- Enemy non-stun effect expiry: All participants see "{ability} on {enemy} fades."

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 70dd575 | Enemy-actor logging in resolveAbility + first-tick DoT/HoT |
| 2 | b3b0c7e | Effect expiry and enemy effect fade logging |
