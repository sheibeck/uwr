---
phase: 22
plan: 03
subsystem: combat
tags: [spacetimedb, typescript, abilities, bard, summoner, monk, druid, warrior, cleric, wizard, rogue, ranger, paladin, shaman, necromancer, enchanter, reaver, spellblade, beastmaster]

# Dependency graph
requires:
  - phase: 22-01
    provides: ActiveBardSong and BardSongTick schema tables, ownerCharacterId on CombatEnemyEffect, isTemporary on ItemInstance
  - phase: 22-02
    provides: new ability key definitions in class data files
provides:
  - Full executeAbility switch coverage for all new ability keys from all 16 classes
  - Bard song system: 5 songs + finale with ActiveBardSong insert and BardSongTick scheduling
  - tick_bard_songs scheduled reducer firing every 6s with per-song AoE/heal/mana effects
  - Wither life drain with ownerCharacterId for per-tick heals on caster
  - Summoner conjure equipment creating isTemporary items
  - Temp item cleanup on character logout
affects:
  - Phase 22-04 (any remaining combat system integration)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Bard song system uses ActiveBardSong table as single-row-per-bard tracker, BardSongTick for 6s scheduled loop
    - Song switching: delete old row and insert new; tick continues rescheduling itself
    - Life drain DoTs use ownerCharacterId on CombatEnemyEffect to trigger heals in the tick loop
    - isTemporary items are deleted on character_logout reducer execution

key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/characters.ts

key-decisions:
  - "Bard song switch deletes previous song row immediately rather than keeping isFading alive for a grace tick — the tick loop continues from previously scheduled tick"
  - "monk_centering changed from stamina_free effect to direct stamina restore (+15) per plan"
  - "monk_inner_focus changed from ac_bonus to damage_up to fit new class role"
  - "reaver_dread_aura changed from single-target debuff to AoE all enemies"
  - "shaman_hex changed from damage_down debuff to ac_bonus debuff per plan"
  - "addCharacterEffect imported directly in reducers/combat.ts for use in tick_bard_songs"

patterns-established:
  - "Bard song pattern: filter by_bard for existing song, delete old, insert new, schedule tick if first song"
  - "tick_bard_songs: apply effect per-tick, reschedule if not fading, clean up if combat over"
  - "Summoner conjure equipment: isTemporary=true on insert, deleted on logout via by_owner index"

requirements-completed: []

# Metrics
duration: 35min
completed: 2026-02-20
---

# Phase 22 Plan 03: executeAbility Switch Cases for All New Abilities Summary

**Complete executeAbility coverage for all 16 classes: bard song system (5 songs + finale + tick reducer), necromancer life drain, summoner conjure equipment with logout cleanup, and 40+ new/updated ability cases removing all retired keys**

## Performance

- **Duration:** 35 min
- **Started:** 2026-02-20T00:00:00Z
- **Completed:** 2026-02-20T00:35:00Z
- **Tasks:** 3 (combined into 1 commit)
- **Files modified:** 3

## Accomplishments
- Removed 21 retired ability cases from executeAbility switch and replaced with new implementations
- Added full bard song system: 5 songs (discordant_note, melody_of_mending, chorus_of_vigor, march_of_wayfarers, battle_hymn) plus finale all use ActiveBardSong table and BardSongTick scheduling
- Implemented tick_bard_songs reducer with per-song group effects (AoE damage, HP regen, mana regen, travel discount) that reschedules every 6 seconds
- Added 40+ new ability cases across all 16 classes including stances (berserker_rage, shapeshifter_form, plague_lord_form, deaths_embrace), pets (elementals, charmed enemy), and conjured items
- Added temp item logout cleanup: isTemporary items deleted when character logs out

## Task Commits

All tasks committed atomically:

1. **Tasks 1-3: All ability cases + tick reducer + logout cleanup** - `1c43a99` (feat)

## Files Created/Modified
- `spacetimedb/src/helpers/combat.ts` - executeAbility switch: removed 21 retired cases, added 40+ new cases for all 16 classes including full bard song system
- `spacetimedb/src/reducers/combat.ts` - Replaced placeholder tick_bard_songs with full implementation; imported addCharacterEffect
- `spacetimedb/src/reducers/characters.ts` - Added isTemporary item deletion loop in character_logout reducer

## Decisions Made
- Bard song switch deletes previous row immediately (rather than keeping isFading alive for a grace tick) — the tick loop was already scheduled and continues rescheduling itself
- monk_centering: changed from stamina_free effect to direct stamina restore (+15) per plan spec
- monk_inner_focus: changed from ac_bonus to damage_up per new class role
- reaver_dread_aura: changed from single-target debuff via applyDamage to AoE explicit loop over all enemies
- shaman_hex: changed from damage_down to ac_bonus debuff type per plan
- addCharacterEffect imported directly in reducers/combat.ts (not in deps) for use inside tick_bard_songs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] cleric_sanctify changed from single-target cleanse to group buff**
- **Found during:** Task 1
- **Issue:** Plan says cleric_sanctify is now "Group AC + HP regen buff ~45min" replacing the old cleanse behavior
- **Fix:** Replaced old targetCharacter cleanse logic with applyPartyEffect for ac_bonus and regen
- **Files modified:** spacetimedb/src/helpers/combat.ts
- **Committed in:** 1c43a99

---

**Total deviations:** 1 auto-fixed (1 bug - changed ability behavior per plan spec)
**Impact on plan:** All auto-fixes necessary for plan correctness. No scope creep.

## Issues Encountered
- addCharacterEffect not in registerCombatReducers deps — added direct import from helpers/combat.ts in reducers/combat.ts

## Next Phase Readiness
- All new ability keys from plans 22-01 and 22-02 now have switch cases
- Bard song system fully operational with scheduled tick reducer
- Temp item cleanup wired up for logout
- Ready for phase 22-04 (any remaining integration or data seeding)

---
*Phase: 22*
*Completed: 2026-02-20*

## Self-Check: PASSED

Files verified:
- spacetimedb/src/helpers/combat.ts - exists, contains bard song cases, enchanter charm, summoner elementals
- spacetimedb/src/reducers/combat.ts - exists, contains full tick_bard_songs implementation
- spacetimedb/src/reducers/characters.ts - exists, contains isTemporary deletion loop

Commits verified:
- 1c43a99 - feat(22-03): add executeAbility cases for all new abilities and bard song tick reducer
