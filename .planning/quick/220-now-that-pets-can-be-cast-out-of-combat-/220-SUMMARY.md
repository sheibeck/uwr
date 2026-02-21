---
phase: quick-220
plan: "01"
subsystem: ability-data
tags: [pets, casting, mana-cost, combat-state, beastmaster, necromancer, summoner]
dependency_graph:
  requires: []
  provides: [pet-summon-cast-times, pet-summon-mana-costs, out-of-combat-pet-summons]
  affects: [ability_catalog, use_ability, characterCast, abilityTemplate]
tech_stack:
  added: []
  patterns: [ability-data-constants, combatOnlyKeys-seeding]
key_files:
  modified:
    - spacetimedb/src/data/abilities/beastmaster_abilities.ts
    - spacetimedb/src/data/abilities/necromancer_abilities.ts
    - spacetimedb/src/data/abilities/summoner_abilities.ts
    - spacetimedb/src/seeding/ensure_items.ts
decisions:
  - "Beastmaster cast time only (no mana change) — uses stamina, not mana; user clarified power stays at 3n"
  - "Shaman excluded entirely per user clarification — shaman_spirit_wolf not modified"
  - "necromancer_bone_servant and beastmaster_call_beast removed from combatOnlyKeys; shaman_spirit_wolf left in"
metrics:
  duration: "~5 minutes"
  completed: "2026-02-21"
  tasks_completed: 2
  files_modified: 4
---

# Phase quick-220 Plan 01: Pet Summons Out-of-Combat Summary

5-second cast time added to beastmaster, necromancer, and summoner pet summon abilities; necromancer and summoner pet mana costs tripled; pet summons removed from combatOnlyKeys so they can be cast out of combat.

## What Was Done

### Task 1: Update pet summon ability data

Updated castSeconds and power values for pet summoning abilities across three class files:

**beastmaster_abilities.ts — beastmaster_call_beast:**
- `castSeconds`: 1n -> 5n
- `power`: 3n (unchanged — uses stamina; user clarified no mana change for beastmaster)

**necromancer_abilities.ts — necromancer_bone_servant:**
- `castSeconds`: 1n -> 5n
- `power`: 4n -> 32n (original mana cost 14, 3x = 42, new power = 42-4-6 = 32)

**summoner_abilities.ts — all summoner pet summons:**
- `summoner_earth_elemental`: castSeconds 1n -> 5n, power 4n -> 24n (3x mana: 30)
- `summoner_fire_elemental`: castSeconds 1n -> 5n, power 5n -> 43n (3x mana: 57)
- `summoner_water_elemental`: castSeconds 1n -> 5n, power 4n -> 48n (3x mana: 66)
- `summoner_primal_titan`: castSeconds 2n -> 5n, power 10n -> 78n (3x mana: 102)

Non-pet summoner abilities (conjure_sustenance, conjure_equipment) were not modified.

### Task 2: Remove pet summons from combatOnlyKeys + publish

Removed `necromancer_bone_servant` and `beastmaster_call_beast` from the `combatOnlyKeys` Set in `ensure_items.ts`. `shaman_spirit_wolf` and `summoner_earth_familiar` remain in the set (shaman excluded from task; summoner_earth_familiar is a legacy key with no matching ability).

Published to local SpacetimeDB successfully — module accepted with no breaking changes.

## Deviations from Plan

### User-clarified overrides (not auto-deviations)

**1. Shaman excluded**
- Plan included shaman_spirit_wolf changes; user clarified shaman is excluded entirely.
- No changes made to shaman_abilities.ts.

**2. Beastmaster: cast time only, no mana change**
- Plan specified power 3n -> 29n for beastmaster_call_beast.
- User clarified: add castSeconds only, leave power at 3n (beastmaster uses stamina not mana).

**3. combatOnlyKeys: shaman_spirit_wolf left in**
- Plan said remove shaman_spirit_wolf; user clarified shaman is excluded from this task.
- Only necromancer_bone_servant and beastmaster_call_beast were removed.

## Post-Publish Action Required

After publish, call `sync_ability_templates` from the in-game admin panel to apply the updated `castSeconds` and `power` values to the `abilityTemplate` DB table. Until this reducer is called, the live DB still has the old cast times and mana costs.

## Self-Check: PASSED

Files verified:
- `beastmaster_abilities.ts`: beastmaster_call_beast castSeconds=5n, power=3n (unchanged)
- `necromancer_abilities.ts`: necromancer_bone_servant castSeconds=5n, power=32n
- `summoner_abilities.ts`: all four pet summons castSeconds=5n, power values tripled
- `ensure_items.ts`: combatOnlyKeys no longer contains necromancer_bone_servant or beastmaster_call_beast

Commits verified:
- d1ae5c6: feat(quick-220): add 5s cast time to pet summon abilities, triple mana for necro/summoner
- 7329b67: feat(quick-220): remove necromancer_bone_servant and beastmaster_call_beast from combatOnlyKeys

Publish: exit 0, "Updated database with name: uwr"
