---
phase: 22-class-ability-balancing
plan: "02"
subsystem: game-data
tags: [abilities, classes, balance, progression, spacetimedb]

# Dependency graph
requires:
  - phase: 22-01
    provides: schema columns for new ability fields (dotPowerSplit, dotDuration, hotPowerSplit, hotDuration, combatState, aoeTargets, debuffType, debuffMagnitude, debuffDuration)
provides:
  - All 16 class ability data files rewritten with locked 6-ability L1/3/5/7/9/10 progression
  - Power and cooldown values normalized against per-level target ranges
  - Unique class identities established through ability set design
affects:
  - 22-03 (ability implementation/seeding reads these data files)
  - ability_catalog.ts (data files consume AbilityMetadata type)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "6-ability progression pattern: L1 starter, L3 utility/CC, L5 mid-tier damage, L7 support/buff, L9 advanced, L10 capstone with long cooldown"
    - "Power normalization: AoE and pure-DoT abilities receive 1-point reduction below midpoint"
    - "Capstone pattern: L10 abilities use 120-300s cooldowns, power 8-12 for damage capstones"

key-files:
  created: []
  modified:
    - spacetimedb/src/data/abilities/warrior_abilities.ts
    - spacetimedb/src/data/abilities/cleric_abilities.ts
    - spacetimedb/src/data/abilities/wizard_abilities.ts
    - spacetimedb/src/data/abilities/rogue_abilities.ts
    - spacetimedb/src/data/abilities/ranger_abilities.ts
    - spacetimedb/src/data/abilities/druid_abilities.ts
    - spacetimedb/src/data/abilities/bard_abilities.ts
    - spacetimedb/src/data/abilities/monk_abilities.ts
    - spacetimedb/src/data/abilities/paladin_abilities.ts
    - spacetimedb/src/data/abilities/shaman_abilities.ts
    - spacetimedb/src/data/abilities/necromancer_abilities.ts
    - spacetimedb/src/data/abilities/beastmaster_abilities.ts
    - spacetimedb/src/data/abilities/enchanter_abilities.ts
    - spacetimedb/src/data/abilities/reaver_abilities.ts
    - spacetimedb/src/data/abilities/spellblade_abilities.ts
    - spacetimedb/src/data/abilities/summoner_abilities.ts

key-decisions:
  - "Ability levels locked to 1n, 3n, 5n, 7n, 9n, 10n only — no even levels permitted"
  - "Bard songs all use 1-second cooldown (effectively instant) since songs replace each other, not traditional cooldown gating"
  - "Shaman hex and stormcall corrected from 0-cd to 6n during Task 2 write (pre-emptive normalization)"
  - "Necromancer wither power bumped to 5n (L5 floor), soul_rot to 6n (L7 floor) — DoT split warrants floor not ceiling"
  - "Ranger rapid_shot corrected from 5n to 8n — L9 ability had regressed below L5 range"

patterns-established:
  - "Class identity through ability set: each class has a narrative identity sentence defining resource, role, and playstyle"
  - "Normalization pass: after writing all data, apply targeted corrections for outliers vs per-level power/cooldown ranges"

requirements-completed: []

# Metrics
duration: 14min
completed: 2026-02-20
---

# Phase 22 Plan 02: Rewrite All 16 Class Ability Data Files Summary

**All 16 class ability files rewritten with locked 6-ability L1/3/5/7/9/10 progression, unique class identities, and power/cooldown normalization pass**

## Performance

- **Duration:** 14 min
- **Started:** 2026-02-20T17:06:15Z
- **Completed:** 2026-02-20T17:19:47Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments

- Replaced 16 class ability files: each now exports exactly 6 abilities at levels 1n, 3n, 5n, 7n, 9n, 10n — zero even-level entries across all files
- Established unique narrative identities per class: warrior (stamina tank), cleric (group sustain), wizard (mana burst), rogue (DoT stacker), ranger (hybrid), druid (nature caster), bard (song AoE), monk (martial), paladin (holy warrior), shaman (spirit caller), necromancer (DoT/life drain), beastmaster (beast commander), enchanter (CC/support), reaver (dark hybrid), spellblade (elemental hybrid), summoner (elemental pets)
- Applied 7 targeted normalization corrections: shaman 0-cd spam fixed, necromancer DoT powers raised to L5/L7 floor, ranger rapid_shot fixed from regression, monk tiger_flurry bumped to midpoint

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite ability files for classes 1-8 (Warrior through Monk)** - `cd392cf` (feat)
2. **Task 2: Rewrite ability files for classes 9-16 (Paladin through Summoner)** - `4ce433d` (feat)
3. **Task 3: Power/cooldown normalization pass** - `2114762` (feat)

## Files Created/Modified

- `spacetimedb/src/data/abilities/warrior_abilities.ts` - 6 abilities L1-10, berserker rage capstone
- `spacetimedb/src/data/abilities/cleric_abilities.ts` - 6 abilities L1-10, holy nova capstone (corrected damageType to 'none' on mend/heal — they are heals not magic damage)
- `spacetimedb/src/data/abilities/wizard_abilities.ts` - 6 abilities L1-10, arcane explosion capstone
- `spacetimedb/src/data/abilities/rogue_abilities.ts` - 6 abilities L1-10, death mark capstone
- `spacetimedb/src/data/abilities/ranger_abilities.ts` - 6 abilities L1-10, rain of arrows capstone
- `spacetimedb/src/data/abilities/druid_abilities.ts` - 6 abilities L1-10, shapeshifter form capstone
- `spacetimedb/src/data/abilities/bard_abilities.ts` - 6 song abilities L1-10, finale capstone
- `spacetimedb/src/data/abilities/monk_abilities.ts` - 6 abilities L1-10, hundred fists capstone
- `spacetimedb/src/data/abilities/paladin_abilities.ts` - 6 abilities L1-10, consecrated ground capstone
- `spacetimedb/src/data/abilities/shaman_abilities.ts` - 6 abilities L1-10, earthquake capstone
- `spacetimedb/src/data/abilities/necromancer_abilities.ts` - 6 abilities L1-10, plague lord form capstone
- `spacetimedb/src/data/abilities/beastmaster_abilities.ts` - 6 abilities L1-10, wild hunt capstone
- `spacetimedb/src/data/abilities/enchanter_abilities.ts` - 6 abilities L1-10, charm capstone
- `spacetimedb/src/data/abilities/reaver_abilities.ts` - 6 abilities L1-10, death's embrace capstone
- `spacetimedb/src/data/abilities/spellblade_abilities.ts` - 6 abilities L1-10, elemental surge capstone
- `spacetimedb/src/data/abilities/summoner_abilities.ts` - 6 abilities L1-10, primal titan capstone

## Decisions Made

- Ability levels locked to 1n, 3n, 5n, 7n, 9n, 10n only — no even levels permitted in any class file
- Bard songs use 1-second cooldowns (cooldownSeconds: 1n) since songs replace each other on activation — traditional cooldown gating doesn't apply to the song system
- Shaman hex and stormcall corrected from 0-cd to 6n cooldown during the Task 2 write itself (pre-emptive normalization, no separate edit required)
- Necromancer pure-DoT abilities (wither, soul_rot) raised to L5 and L7 floor respectively — DoT split means lower per-cast damage is expected, so floor not ceiling applies
- Ranger rapid_shot corrected from 5n to 8n — had regressed to below even L5 range which was clearly unintentional

## Deviations from Plan

None - plan executed exactly as written. The shaman cooldown corrections (hex and stormcall) were applied inline during Task 2 write rather than as a separate Task 3 edit since the values were known at write time.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 16 ability data files are in final form, ready for Plan 22-03 which will wire up the executeAbility switch cases for these ability keys
- The seeding system that reads these files will produce correct L1/3/5/7/9/10 abilities when the module is published after Plan 22-03

---
*Phase: 22-class-ability-balancing*
*Completed: 2026-02-20*

## Self-Check: PASSED

- All 16 class ability files exist at `spacetimedb/src/data/abilities/`
- Task commits verified: cd392cf, 4ce433d, 2114762
- Zero even-level entries across all files (verified via grep)
- All 16 files have exactly 6 abilities (96 total className occurrences)
