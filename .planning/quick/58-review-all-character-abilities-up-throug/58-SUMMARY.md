---
phase: quick-58
plan: 01
subsystem: combat
tags: [abilities, balance, level-1-2, ranger]
dependency_graph:
  requires: []
  provides: [ranger_track_implementation]
  affects: [combat_balance, early_game_experience]
tech_stack:
  added: []
  patterns: [ability_scouting, location_enemy_tracking]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/ability_catalog.ts
    - spacetimedb/src/index.ts
decisions:
  - slug: ranger-track-scouting-implementation
    summary: "Implemented ranger_track as enemy scouting ability that reveals enemy names and levels at current location"
    rationale: "ranger_track was a complete no-op (just logged text). As the ranger's only level 2 ability, it needed a meaningful mechanical effect. Scouting fits ranger class fantasy and provides tactical value."
  - slug: ranger-track-cooldown-reduction
    summary: "Reduced ranger_track cooldown from 600s (10min) to 120s (2min)"
    rationale: "600s cooldown was excessive for a scouting utility. 120s makes it usable multiple times per play session while maintaining value as a tactical tool."
  - slug: tracking-effect-cosmetic
    summary: "Added cosmetic 'tracking' character effect (6 ticks = 18s) to signal ability activation"
    rationale: "Visual indicator that ability fired successfully. Effect is cosmetic - real value is the enemy information logged to player."
metrics:
  duration: "2min"
  completed: "2026-02-13T05:39:45Z"
  tasks: 2
  files: 2
---

# Quick Task 58: Review all character abilities up through level 2

**One-liner:** Fixed ranger_track from no-op to functional enemy scouting ability (reveals names/levels), reduced cooldown from 600s to 120s

## What Was Done

### Task 1: Audit level 1-2 abilities and update catalog
**Files:** `spacetimedb/src/data/ability_catalog.ts`

Audited all 15 classes' level 1-2 abilities (30 abilities total) for balance and implementation:

**Balance audit findings:**
- Level 1 power distribution appropriate (2-4 power range based on effects)
- Abilities with extra effects (DoT/debuff/buff) have lower power (2-3)
- Pure damage abilities have higher power (4)
- Level 2 cooldowns varied but reasonable (except ranger_track)

**Implementation issues found:**
1. **ranger_track (CRITICAL):** Complete no-op - just logs "You study the tracks in the area." with zero mechanical effect. This is the ranger's only level 2 ability.
2. **druid_natures_mark:** VERIFIED WORKING - gathers resources out of combat (lines 2898-2948)

**Changes made:**
- `ranger_track` cooldown: 600n → 120n (10min → 2min)

### Task 2: Implement ranger_track as enemy scouting ability
**Files:** `spacetimedb/src/index.ts`

Replaced no-op implementation with functional scouting mechanic:

**Implementation:**
- Get all `EnemySpawn` rows at character's location using `by_location` index
- For each spawn, resolve `EnemyTemplate` and log: `"Tracks reveal: {name} (Level {level})"`
- Add cosmetic `tracking` character effect (magnitude 1n, duration 6n = 18 seconds)
- Handle empty location case: `"You find no tracks worth following."`

**Technical details:**
- Uses existing `LocationEnemyTemplate` and `EnemySpawn` tables
- Filters by `character.locationId` for location-specific tracking
- Provides tactical information without combat advantages (scouting, not combat buff)

### Verification
All level 1-2 abilities across 15 classes now have meaningful mechanical implementations:
- 15 level 1 abilities: All functional (damage/heal/buff/debuff/summon)
- 15 level 2 abilities: All functional (after ranger_track fix)

**Power/cooldown balance confirmed:**
- Level 1 abilities: 2-4 power, 0-8s cooldown
- Level 2 abilities: 1-4 power, 20-120s cooldown (utility focused)

Module publishes successfully with no compilation errors.

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written.

## Testing Notes

**ranger_track behavior:**
- In location with enemies: Logs each enemy template with name and level
- In empty location: Logs "You find no tracks worth following."
- Always applies 18s cosmetic tracking effect when activated
- 120s cooldown allows reuse in exploration gameplay

**Example output:**
```
Tracks reveal: Feral Wolf (Level 2)
Tracks reveal: Forest Spider (Level 3)
```

## Impact

**Before:** ranger_track was a wasted ability slot - rangers had no level 2 ability
**After:** rangers have tactical scouting tool that reveals enemy information

**User experience:** Early game (level 1-2) now has 30 fully functional abilities across all classes. No dead buttons.

## Related Work

- Combat balance audits: Phase 3.1, 3.1.1, 3.1.2
- Ability power/cooldown tuning: 3.1-04, 3.1-05
- Class stat scaling: quick-57

## Self-Check: PASSED

**Files verified:**
```
FOUND: spacetimedb/src/data/ability_catalog.ts (modified)
FOUND: spacetimedb/src/index.ts (modified)
```

**Commits verified:**
```
FOUND: a4a2442 (chore: ranger_track cooldown reduction)
FOUND: e307bac (feat: ranger_track implementation)
```

**Implementation verified:**
- ranger_track cooldown = 120n in ability_catalog.ts ✓
- ranger_track case block contains enemy tracking logic (not just log) ✓
- druid_natures_mark still has resource gathering logic ✓
- Module published successfully ✓
