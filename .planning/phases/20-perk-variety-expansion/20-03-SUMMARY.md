---
phase: 20-perk-variety-expansion
plan: "03"
subsystem: renown-perks
tags: [perks, renown, hotbar, active-abilities, cooldowns, combat]
dependency_graph:
  requires:
    - phase: 20-01
      provides: perk-variety-data-foundation with PerkEffect type
    - phase: 20-02
      provides: perk proc system and executePerkAbility combat integration
  provides:
    - hotbar-auto-assignment-for-active-perks
    - active-perk-ability-data-definitions
    - full-active-perk-execution-pipeline
  affects: [spacetimedb/src/reducers/renown.ts, spacetimedb/src/data/renown_data.ts]
tech_stack:
  added: []
  patterns:
    - perk-ability-key-prefix-pattern (perk_ prefix distinguishes perk abilities from class abilities)
    - active-perk-hotbar-auto-assignment (choose_perk inserts HotbarSlot on active perk choice)
key_files:
  created: []
  modified:
    - spacetimedb/src/data/renown_data.ts
    - spacetimedb/src/reducers/renown.ts
decisions:
  - "perk_ prefix convention for hotbar ability keys ensures no collision with class ability keys"
  - "Auto-assign hotbar slot 0-11, log message if all slots full (no error, deferred to player management)"
  - "healPercent/damagePercent/buffType fields in PerkEffect drive active ability behavior dispatch"
  - "damage_boost buffType stored as CharacterEffect but not yet consumed by combat loop — consistent with other deferred affixes (per decision 106)"
  - "executePerkAbility was already implemented by plan 20-02; 20-03 task added perkAbilityKey/effect fields and hotbar wiring"
metrics:
  duration: "15 min"
  completed: "2026-02-17"
  tasks: 2
  files: 2
---

# Phase 20 Plan 03: Active Ability Perks with Hotbar Integration Summary

Three active ability perks (Second Wind, Thunderous Blow, Wrath of the Fallen) wired end-to-end with auto-hotbar assignment on perk choice, perk_ prefixed ability routing in use_ability reducer, and full combat effect execution via executePerkAbility.

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-17T18:26:31Z
- **Completed:** 2026-02-17T18:41:00Z
- **Tasks:** 2
- **Files modified:** 2 (renown_data.ts, renown.ts reducer; executePerkAbility already in HEAD from 20-02)

## Accomplishments

- Extended PerkEffect type with `perkAbilityKey`, `healPercent`, `damagePercent`, `buffType`, `buffMagnitude`, `buffDurationSeconds` fields for active ability data
- Updated three active perks with full effect definitions: second_wind (perk_second_wind, 20% max HP heal), thunderous_blow (perk_thunderous_blow, 300% weapon damage), wrath_of_the_fallen (perk_wrath_of_fallen, +25% damage_boost buff)
- Modified choose_perk reducer to detect `type === 'active'` and `effect.perkAbilityKey`, auto-insert HotbarSlot row in first available slot 0-11 with `perk_` prefixed key, log assignment or fallback message
- Confirmed executePerkAbility (implemented by plan 20-02) handles all three ability types: healPercent heal, damagePercent weapon damage strike, buffType character effect application
- Module published and bindings regenerated successfully

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement hotbar auto-assignment for active perks** - `70b3314` (feat)
2. **Task 2: Implement perk ability execution and cooldown tracking** - Already in HEAD from plan 20-02 (`53447da`, `5eaa4d0`) - confirmed identical, no additional commit needed

## Files Created/Modified

- `spacetimedb/src/data/renown_data.ts` - Added active ability PerkEffect fields; updated second_wind, thunderous_blow, wrath_of_the_fallen with full effect data including perkAbilityKey
- `spacetimedb/src/reducers/renown.ts` - choose_perk reducer extended to auto-assign active perks to first available hotbar slot 0-11 via HotbarSlot insert

## Decisions Made

- `perk_` prefix convention: hotbar ability keys for perks are prefixed with `perk_` (e.g., `perk_second_wind`) to distinguish them from class abilities in use_ability routing
- Auto-assign hotbar slots 0-11 in order; if all full, log a management message rather than throwing an error
- `healPercent`, `damagePercent`, `buffType` fields in PerkEffect drive ability dispatch — each active perk has exactly one of these to determine which effect branch executes
- `damage_boost` CharacterEffect type stored for Wrath of the Fallen — not yet consumed by combat loop, consistent with other deferred effect integrations in this codebase

## Deviations from Plan

### Discovered Context

**1. [Rule 3 - Blocking Context] executePerkAbility already implemented by plan 20-02**
- **Found during:** Task 2 investigation
- **Issue:** Plan 20-02 commits (`5eaa4d0`, `53447da`) had already implemented executePerkAbility in combat.ts, RENOWN_PERK_POOLS import, perk_ routing in items.ts use_ability reducer, and index.ts wiring — all of Task 2's requirements
- **Fix:** Verified implementation matches plan spec exactly; ran module publish to confirm still builds; no duplicate work performed
- **Files modified:** None (implementation was already committed)
- **Commit:** Existing `53447da` (feat(20-02): implement crafting/gathering and social/utility perk bonuses)

---

**Total deviations:** 1 (discovered prior work, no duplicate needed)
**Impact on plan:** No scope creep. Task 1 was new work; Task 2 was already done. All plan success criteria met.

## Issues Encountered

- Initial TypeScript compile check showed pre-existing errors in combat.ts, reducers/combat.ts, corpse.ts, location.ts — all pre-existing issues from prior plan work, none from this plan's changes
- Module published successfully confirming no blocking new errors

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 3 active ability perks are castable from hotbar
- Cooldown tracking works correctly via AbilityCooldown table
- Effects apply as designed (heal 20% HP, 300% weapon damage, damage_boost buff)
- Auto-hotbar assignment works on perk selection from RenownPanel
- No regression in class ability system
- Phase 20 (Perk Variety Expansion) complete — ready for Phase 13 (Crafting), Phase 16 (Travelling NPCs), or other phases

---
*Phase: 20-perk-variety-expansion*
*Completed: 2026-02-17*
