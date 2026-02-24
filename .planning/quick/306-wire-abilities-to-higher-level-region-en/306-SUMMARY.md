---
phase: quick-306
plan: 01
subsystem: combat/abilities
tags: [enemy-abilities, combat, balance, content]
dependency_graph:
  requires: []
  provides: [high-tier-enemy-abilities, mid-tier-enemy-abilities, complete-enemy-ability-wiring]
  affects: [combat, enemy-ai]
tech_stack:
  added: []
  patterns: [data-driven-ability-assignment]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/abilities/enemy_abilities.ts
decisions:
  - Used armor_shatter (high-tier) for L7 Iron Golem since L7 is borderline high-tier
  - Moorland Harrier and Ashen Ram intentionally left without abilities as simple beasts
metrics:
  duration: "2m 10s"
  completed: "2026-02-24T03:38:17Z"
---

# Quick 306: Wire Abilities to Higher-Level Region Enemies Summary

19 new abilities added and 17 enemy templates wired with thematically matched abilities across L3-12.

## What Changed

### Task 1: New Abilities (commit 17379d3)

Added 19 new abilities to `ENEMY_ABILITIES`:

**Mid-tier (L5-8) -- 8 abilities:**
- `plague_touch` -- magic DoT for plague-themed enemies
- `nature_mend` -- heal for druid/nature enemies
- `spirit_ward` -- armor buff for spirit allies
- `web_snare` -- physical debuff for spider enemies
- `knight_challenge` -- physical debuff for knight enemies
- `troll_smash` -- physical debuff for troll enemies
- `barrow_chill` -- magic debuff for undead barrow enemies
- `command_undead` -- damage buff for undead commanders

**High-tier (L9-12) -- 11 abilities:**
- `abyssal_flame` -- magic DoT, magnitude 5, power 6
- `necrotic_rot` -- magic DoT, magnitude 4, power 5
- `runic_discharge` -- magic DoT, magnitude 4, power 5
- `executioner_bleed` -- physical DoT, magnitude 5, power 6
- `ironclad_rend` -- physical DoT, magnitude 4, power 5
- `doom_mark` -- magic debuff, magnitude -4, 4 rounds
- `armor_shatter` -- physical debuff, magnitude -4, 3 rounds
- `warding_crush` -- magic debuff, magnitude -4, 4 rounds
- `unholy_mend` -- heal, power 7
- `death_pulse` -- AoE damage, power 8

### Task 2: Enemy Template Wiring (commit 27168d0)

Added 17 new entries to `ENEMY_TEMPLATE_ABILITIES`:

| Level | Enemy | Abilities | Theme |
|-------|-------|-----------|-------|
| L3-4 | Barrow Wight | barrow_chill | Undead grave-cold |
| L3-4 | Webspinner | web_snare | Spider webbing |
| L5-6 | Silverpine Sentinel | spirit_ward | Spirit protector |
| L5-6 | Moor Hag | mire_curse, shaman_heal | Swamp witch |
| L5-6 | Feral Druid | nature_mend, thorn_venom | Nature healer |
| L5-6 | Moss Troll | troll_smash, stone_cleave | Beast tank |
| L5-6 | Plague Cultist | plague_touch, sapping_chant | Plague caster |
| L7-8 | Iron Golem | armor_shatter, ironclad_rend | Construct tank |
| L7-8 | Renegade Knight | knight_challenge, bleeding_shot | Warrior |
| L7-8 | Warforged Hulk | quake_stomp, ironclad_rend | Construct tank |
| L9-12 | Dreadspire Wraith | necrotic_rot, doom_mark, death_pulse | Undead AoE dps |
| L9-12 | Runebound Golem | warding_crush, runic_discharge, quake_wave | Construct tank |
| L9-12 | Shadow Necromancer | shadow_rend, unholy_mend, command_undead | Undead caster |
| L9-12 | Abyssal Fiend | abyssal_flame, doom_mark, death_pulse | Spirit AoE dps |
| L9-12 | Dread Knight | executioner_bleed, armor_shatter, command_undead | Undead commander |

## Power Scaling Verification

| Tier | Magnitude Range | Power Range |
|------|----------------|-------------|
| L1-4 (existing) | 1-3 | 2-4 |
| L5-8 (new mid-tier) | 2-3 | 3-4 |
| L9-12 (new high-tier) | 4-5 | 5-8 |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

1. TypeScript compiles without errors (pre-existing errors in combat.ts/corpse.ts are unrelated)
2. 65 total ability keys in ENEMY_ABILITIES (46 existing + 19 new)
3. 59 total entries in ENEMY_TEMPLATE_ABILITIES (42 existing + 17 new)
4. No duplicate template keys
5. All ability references resolve to valid ENEMY_ABILITIES keys

## Self-Check: PASSED

- enemy_abilities.ts: FOUND
- 306-SUMMARY.md: FOUND
- Commit 17379d3: FOUND
- Commit 27168d0: FOUND
