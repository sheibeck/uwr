---
phase: quick-229
plan: 01
subsystem: combat-classes
tags: [paladin, reaver, ranger, hybrid, mana, stamina, abilities, class-stats]
dependency_graph:
  requires: []
  provides: [hybrid-mana-pools, paladin-stamina-abilities, reaver-stamina-abilities, cast-time-rules]
  affects: [character-derived-stats, ability-templates, all-mana-classes]
tech_stack:
  added: []
  patterns: [conditional-multiplier, hybrid-resource-split]
key_files:
  modified:
    - spacetimedb/src/data/class_stats.ts
    - spacetimedb/src/helpers/character.ts
    - spacetimedb/src/data/abilities/paladin_abilities.ts
    - spacetimedb/src/data/abilities/reaver_abilities.ts
    - spacetimedb/src/data/abilities/cleric_abilities.ts
    - spacetimedb/src/data/abilities/wizard_abilities.ts
    - spacetimedb/src/data/abilities/druid_abilities.ts
    - spacetimedb/src/data/abilities/bard_abilities.ts
    - spacetimedb/src/data/abilities/enchanter_abilities.ts
    - spacetimedb/src/data/abilities/spellblade_abilities.ts
    - spacetimedb/src/data/abilities/ranger_abilities.ts
    - spacetimedb/src/data/abilities/shaman_abilities.ts
    - spacetimedb/src/data/abilities/necromancer_abilities.ts
    - spacetimedb/src/data/abilities/beastmaster_abilities.ts
decisions:
  - "HYBRID_MANA_MULTIPLIER=4n vs MANA_MULTIPLIER=6n gives hybrids ~33% less mana per mana stat point"
  - "Paladin gains secondary 'str' so manaStatForClass blends WIS 70% + STR 30%, further reducing raw mana stat vs pure WIS casters"
  - "Bard and spellblade excluded from HYBRID_MANA_CLASSES — bard is all-mana, spellblade is full arcane thematically"
  - "Stamina abilities must always have castSeconds=0n — physical exertion is instant"
  - "Mana abilities must always have castSeconds>=1n — magic requires focus/channeling"
metrics:
  duration: "~15 minutes"
  completed: "2026-02-21"
  tasks_completed: 4
  tasks_total: 4
  files_modified: 14
---

# Phase quick-229 Plan 01: Paladin Hybrid Mana/Stamina Pools + Reaver Summary

**One-liner:** Paladin and reaver get stamina-costed physical melee abilities and reduced mana pools via a 4n hybrid multiplier (vs 6n for full casters), enforced with strict cast time rules across all mana/stamina abilities.

## What Was Built

Hybrid class identity for paladin, ranger, and reaver through two levers:

**Lever 1 — Smaller mana pools (class_stats.ts + character.ts):**
- Added `MANA_MULTIPLIER=6n` (full casters) and `HYBRID_MANA_MULTIPLIER=4n` (hybrids) constants
- Added `HYBRID_MANA_CLASSES` set: paladin, ranger, reaver
- Paladin gains `secondary: 'str'` in CLASS_CONFIG, causing `manaStatForClass` to blend WIS(70%) + STR(30%), naturally yielding less raw mana stat
- `maxMana` formula in character.ts now branches: hybrids use 4n multiplier, full casters use 6n

At level 10 example:
- Wizard (INT only): manaStat=39, maxMana = 10 + 39*6 = 244
- Paladin (WIS+STR blend): manaStat ~30, maxMana = 10 + 30*4 = 130
- Paladin has ~53% of wizard mana — appropriate for a hybrid

**Lever 2 — Stamina-costed physical melee (ability files):**
- `paladin_holy_strike`: mana -> stamina (instant physical weapon strike)
- `paladin_radiant_smite`: mana -> stamina (physical weapon attack with holy charge)
- `reaver_blood_rend`: mana -> stamina (flesh-rending physical self-leeching attack)

Result: paladin = 2 stamina / 4 mana abilities; reaver = 2 stamina / 4 mana abilities

**Lever 3 — Cast time rules enforced system-wide:**
All mana abilities brought to castSeconds >= 1n. All stamina abilities confirmed at castSeconds = 0n.

Changes by file:
- cleric: blessing_of_might, sanctify, holy_nova (0n -> 1n)
- wizard: mana_shield (0n -> 1n)
- druid: natures_mark, natures_gift, shapeshifter_form (0n -> 1n)
- bard: all 6 abilities (0n -> 1n)
- paladin: shield_of_faith, lay_on_hands, devotion, consecrated_ground (0n -> 1n); radiant_smite (1n -> 0n, stamina)
- enchanter: clarity, haste, bewilderment (0n -> 1n)
- reaver: soul_rend, dread_aura, deaths_embrace (0n -> 1n)
- spellblade: frost_armor, stone_skin, magma_shield (0n -> 1n)
- ranger: track, natures_balm (0n -> 1n)
- shaman: ancestral_ward, earthquake (0n -> 1n)
- necromancer: plague_lord_form (0n -> 1n)
- beastmaster: call_beast (5n -> 0n, stamina)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | a4bf4c1 | feat(quick-229-01): add HYBRID_MANA_CLASSES, MANA_MULTIPLIER constants, paladin secondary str |
| 2 | e0b0af8 | feat(quick-229-01): apply HYBRID_MANA_MULTIPLIER in character.ts maxMana formula |
| 3 | 587d37f | feat(quick-229-01): convert physical melee abilities to stamina resource |
| 4 | dfc88fc | feat(quick-229-01): enforce cast time rules — mana >= 1s, stamina = 0s |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- spacetimedb/src/data/class_stats.ts: FOUND (paladin secondary str, MANA_MULTIPLIER, HYBRID_MANA_MULTIPLIER, HYBRID_MANA_CLASSES)
- spacetimedb/src/helpers/character.ts: FOUND (manaMultiplier conditional, HYBRID_MANA_CLASSES import)
- Module publishes cleanly to local SpacetimeDB
- Commits a4bf4c1, e0b0af8, 587d37f, dfc88fc: all present in git log
