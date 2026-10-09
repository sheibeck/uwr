---
created: 2026-10-09T16:00:00.000Z
title: Ability vocabulary contract - category fallbacks, no AI choices without a working system (found via Whisper Network)
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

## Owner follow-up (2026-10-09)

"we should make sure that any ability that doesn't have an effect has a fallback of the same category: attack abilities should fallback to an attack effect, a buff should fallback to a combat effect?, etc. My biggeer question is ... how does the AI know how to wire in effects when it creates new skills. How do we handle future skill/abilitiy choices if those choices have no system yet?"

Findings (code read 2026-10-09):
- The AI's menu is `spacetimedb/src/data/mechanical_vocabulary.ts`: the prompt lists `ABILITY_KINDS` and `EFFECT_TYPES`; the reply schema forces `kind` to be one of ABILITY_KINDS; `effectType` is free text, and validators replace an unknown one with `damage_up` (`renown_perk_validate.ts` sanitizeEffectType, `skill_budget.ts`, `creation_validate.ts`). The engine then dispatches on kind with its own defaults (`combat.ts`).
- Gap: `travel` is offered as "Movement speed boost or location reveal", but no speed or reveal system exists, and `travel_discount` (the one travel effect the engine reads) is NOT in EFFECT_TYPES, so the AI cannot even pick it. Other kinds and effects may have the same gap (audit needed).

Proposed rule (for discuss):
1. **A per-kind contract.** Each ability kind declares the effect types it may use and a same-category default (damage kinds -> a damage effect, buff -> a combat buff, travel -> travel_discount, gather_boost/craft_boost -> their boosts). Validators coerce to that kind's default, never to a global `damage_up`.
2. **No menu item without a system.** A kind or effect is offered to the AI only if the engine handles it, proven by a contract test (every offered kind has a handler and a test; every offered effect is read somewhere). Kinds without a system are removed from the menu until their phase adds them (the phase that builds a system adds its kinds/effects to the vocabulary).
3. **Existing rows.** A rule pass remaps already-generated abilities whose kind/effect has no system to the nearest supported one (or accept until the world is regenerated).
Candidate home: Phase 51.3.2 (Wind-Up, abilities in rounds) as added scope, since it reworks ability mechanics; the card wording part goes to 51.5.
