---
created: 2026-10-09T16:00:00.000Z
title: Travel abilities with no effect type give a damage buff (Whisper Network), and ability cards hide what they do
area: general
files:
  - spacetimedb/src/helpers/combat.ts (~L1120-1132, kind 'travel': effectType defaults to 'damage_up')
  - spacetimedb/src/data/travel_config.ts (travel_discount lowers travel stamina only)
  - spacetimedb/src/helpers/travel.ts (~L242-262, stamina and the cross-region cooldown)
  - ability generation validation (effectType for kind 'travel')
  - the client ability card / tooltip
---

## Problem

Owner, 2026-10-09, playing Elfansworth: "I just got the ability 'Whisper Network' ... I activated it and then I travelled to Tessarine Shelf. I'm not sure how this ability actually works. What does it do? Does it reduce cooldown time of travel? Travel doesn't literally take 'time', so I'm trying to understand how to test the ability. This also makes me think that abilities might need more information." The card shows only:

    Renown Whisper Network (Lv 1)
      A word in the right ear, and the roads remember you kindly. Your next stretch of travel passes faster than strictly seems fair, since several people have decided to be helpful.
      travel — mana: 15 — Cast: 2s — CD: 120s

Found (local DB, read-only): the ability row is `kind 'travel'`, `effect_type` none, `effect_magnitude` 6, `effect_duration` none. The travel branch in `combat.ts` falls back to `effectType ?? 'damage_up'` and duration 30 s, so casting Whisper Network gives a damage buff of 6 and does nothing for travel. Travel has no time to shorten: the only travel levers are the stamina cost (`travel_discount` effects, `travelStaminaCost`) and the 5-minute cross-region cooldown (reduced only by the passive perk field `travelCooldownReduction`).

## Solution

1. Bug: a `travel` ability must default to `travel_discount` (never `damage_up`), and generation validation should require or force a travel effect for kind `travel` (same check for `craft_boost`/`gather_boost` defaults). Decide what "travel faster" means mechanically: stamina discount on the next trip(s), and/or a shorter cross-region cooldown; the description should match. Check that a travel_discount effect timed in rounds actually lasts out of combat until the next trip (rounds may only tick in combat).
2. Repair existing rows: a one-time fix for abilities already generated with kind `travel` and no effect type (Whisper Network on the owner's local world), or accept until the world is regenerated.
3. UX: ability cards and tooltips show the mechanical effect in plain words (for example "Next trip costs 6 less stamina, for 30 s"), not only the flavour text. Candidate home: Phase 51.5 (Character, Level Up and New Skill) for the card; the bug can be a quick task or ride with 51.3.2 (abilities in rounds).
