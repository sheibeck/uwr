---
phase: quick-234
plan: 01
subsystem: combat
tags: [enemy-abilities, combat-ai, spacetimedb, typescript]

# Dependency graph
requires: []
provides:
  - frost_mend and ember_mend heal abilities for Frostbone Acolyte and Ember Priest
  - ember_daze, dust_cloud, wisp_drain, soot_pulse debuff abilities for support enemies
  - ENEMY_TEMPLATE_ABILITIES mappings for 8 healer/support templates
  - explicit all_allies case in pickEnemyTarget removing silent aggro fallthrough
affects: [combat, enemy-ai, seeding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Enemy heal abilities use targetRule: 'lowest_hp' as a non-null placeholder; executeAbilityAction independently selects lowest-HP enemy ally"
    - "all_allies targetRule returns activeParticipants[0] as placeholder; buff execution loops combatEnemy.by_combat independently"

key-files:
  created: []
  modified:
    - spacetimedb/src/data/abilities/enemy_abilities.ts
    - spacetimedb/src/reducers/combat.ts

key-decisions:
  - "frost_mend and ember_mend use targetRule: 'lowest_hp' matching existing shaman_heal/dark_mend pattern — pickEnemyTarget returns player placeholder, heal execution in executeAbilityAction independently selects lowest-HP enemy ally from combatEnemy table"
  - "all_allies explicit case added before aggro fallthrough in pickEnemyTarget — removes reliance on accidental fallthrough for warchief_rally and bolster_defenses"
  - "Dust Hare gets dust_cloud for all role variants (dps + scout) — thematically consistent, scout is the support variant"
  - "Dusk Moth and Gloomwing Bat mapped to already-defined moth_dust and sonic_screech respectively"

patterns-established:
  - "Enemy healer ability pattern: targetRule 'lowest_hp' = player placeholder for cast scheduling gate; actual heal logic ignores targetId and finds lowest enemy ally HP"
  - "Enemy buff ability pattern: targetRule 'all_allies' = any active participant placeholder; actual buff logic loops all combatEnemy rows"

requirements-completed: [QUICK-234]

# Metrics
duration: 15min
completed: 2026-02-21
---

# Quick-234: Healer and Support Enemy Abilities Summary

**Six new enemy abilities (frost_mend, ember_mend, ember_daze, dust_cloud, wisp_drain, soot_pulse) fulfill healer/support contracts for 8 enemy templates, plus explicit all_allies case in pickEnemyTarget removes silent buff fallthrough**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-21T17:33:00Z
- **Completed:** 2026-02-21T17:47:58Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added frost_mend (Frostbone Acolyte) and ember_mend (Ember Priest) heal abilities — both use existing `lowest_hp` + `heal` kind pattern where executeAbilityAction selects the lowest-HP enemy ally regardless of targetCharacterId
- Added four support debuff abilities (ember_daze, dust_cloud, wisp_drain, soot_pulse) giving meaningful non-DoT abilities to Emberling, Dust Hare, Ember Wisp, and Sootbound Sentry
- Mapped Dusk Moth to already-defined moth_dust and Gloomwing Bat to sonic_screech — these abilities existed but had no template mapping
- Added explicit `all_allies` branch in pickEnemyTarget before aggro fallthrough — warchief_rally and bolster_defenses now have a clear, non-accidental execution path

## Task Commits

Each task was committed atomically:

1. **Task 1: Add heal/debuff abilities and update ENEMY_TEMPLATE_ABILITIES** - `6662ff4` (feat)
2. **Task 2: Fix all_allies case in pickEnemyTarget** - `14c77f9` (feat)

## Files Created/Modified
- `spacetimedb/src/data/abilities/enemy_abilities.ts` - Added 6 new abilities (frost_mend, ember_mend, ember_daze, dust_cloud, wisp_drain, soot_pulse); updated ENEMY_TEMPLATE_ABILITIES for 8 templates
- `spacetimedb/src/reducers/combat.ts` - Added explicit all_allies case in pickEnemyTarget

## Decisions Made
- Heal abilities use `targetRule: 'lowest_hp'` as a placeholder — investigated the existing shaman_heal and dark_mend pattern and confirmed executeAbilityAction's heal branch (lines 1985-2013 in helpers/combat.ts) independently selects the lowest-HP enemy ally from combatEnemy.by_combat, ignoring targetCharacterId entirely. The targetId only matters to prevent the `if (!targetId) continue` gate from skipping the cast.
- all_allies case placed BEFORE aggro fallthrough to make intent explicit and prevent any future regression if aggro lookup returns undefined
- Ember Wisp entry changed from `['ember_burn']` to `['ember_burn', 'wisp_drain']` so the ember_wisp_spark (support role variant) has a true support ability while the base wisp retains its DoT

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. The important_note about heal targeting was critical — confirmed that `lowest_hp` with `kind: 'heal'` is correct because executeAbilityAction's heal branch ignores targetCharacterId and independently finds the lowest-HP enemy ally. No new targetRule needed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All healer-role enemies (Frostbone Acolyte, Ember Priest) now have heal abilities
- All support-role enemies (Emberling, Dust Hare, Ember Wisp Spark, Sootbound Sentry Watcher, Dusk Moth Glimmer, Gloomwing Bat Elder) now have non-DoT support abilities
- all_allies buff path is explicit and safe
- Module published to local without errors

---
*Phase: quick-234*
*Completed: 2026-02-21*

## Self-Check: PASSED
