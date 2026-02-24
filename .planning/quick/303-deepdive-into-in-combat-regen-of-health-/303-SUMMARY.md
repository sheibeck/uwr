---
phase: quick-303
plan: 01
subsystem: combat
tags: [regen, healing, combat, audit, diagnostics]

# Dependency graph
requires:
  - phase: 3.1
    provides: combat balance system with regen_health and tick_hot reducers
provides:
  - comprehensive audit of all 10+ in-combat HP healing pathways
  - confirmed root cause of perceived "large healing ticks" on Level 1 Goblin Enchanter
  - documentation of regen rate disparity between in-combat and out-of-combat states
affects: [combat-balance, regen-tuning]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/quick/303-deepdive-into-in-combat-regen-of-health-/303-DIAGNOSTIC-REPORT.md
  modified: []

key-decisions:
  - "No code changes needed -- observed behavior is working as designed"
  - "Out-of-combat regen rate (maxHp/15 per 8s) vs in-combat rate (2 HP per 16s) is a 7x difference, which is intentional"
  - "Instant combat-exit on victory (clearCombatArtifacts deletes combatParticipant rows) causes out-of-combat rate to apply between sequential fights"

patterns-established:
  - "regen_health uses halfTick gate: in-combat characters only regen every OTHER 8s tick (every 16s)"
  - "tick_hot has NO combat awareness -- processes regen/dot CharacterEffects every 3s regardless of state"
  - "addCharacterEffect applies immediate first tick for regen/dot effects on creation"

requirements-completed: [QUICK-303]

# Metrics
duration: 12min
completed: 2026-02-24
---

# Quick 303: In-Combat HP Regen Deep-Dive Summary

**Full audit of 10+ in-combat healing pathways; confirmed root cause is intentional 7x regen rate gap between out-of-combat (maxHp/15 per 8s) and in-combat (2 HP per 16s) states during sequential fights**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-24T02:47:33Z
- **Completed:** 2026-02-24T03:00:00Z
- **Tasks:** 2 (1 auto + 1 checkpoint, both complete)
- **Files modified:** 1 (diagnostic report created)

## Accomplishments

- Traced and documented every code path that can increase a character's HP during combat: `regen_health`, `tick_hot`, `addCharacterEffect` immediate tick, `applyHeal`, perk procs, pet healing, bard songs, life-drain DoTs, `lifeOnHit` gear stat
- Calculated exact expected healing values for Level 1 Goblin Enchanter baseline (CHA=12, STR=8, DEX=7, WIS=8, INT=8, maxHp=114)
- Identified confirmed root cause through user verification: the +7 HP ticks are out-of-combat regen (maxHp/15=7) between sequential fights; +2 HP ticks are in-combat regen (HP_REGEN_IN=2)
- Documented that `lifeOnHit` gear stat is accumulated by `getEquippedBonuses` but never consumed by combat code (missing feature, not a bug)

## Task Commits

Each task was committed atomically:

1. **Task 1: Comprehensive audit of all in-combat HP healing pathways** - `8e295dc` (docs)
2. **Task 2: Human verification checkpoint** - approved, no code changes

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `.planning/quick/303-deepdive-into-in-combat-regen-of-health-/303-DIAGNOSTIC-REPORT.md` - Full diagnostic report with all 10+ healing sources traced, quantified, and ranked by likelihood; updated with confirmed root cause post-verification

## Decisions Made

- **No code changes needed:** The observed behavior (7 HP and 2 HP ticks) is the intended design of the regen system. The regen_health reducer correctly distinguishes combat state via combatParticipant row presence.
- **Out-of-combat rate is intentionally generous:** maxHp/15 per 8s tick allows rapid recovery between fights, matching MMO design conventions.
- **Instant combat-exit is by design:** clearCombatArtifacts removing combatParticipant rows on victory means the character transitions to out-of-combat rate immediately, which is the intended behavior.

## Deviations from Plan

None - plan executed exactly as written. The audit was purely investigative and the checkpoint confirmed the analysis.

## Confirmed Root Cause

The user observed two distinct heal tick magnitudes on a Level 1 Goblin Enchanter:

| Tick | Amount | Source | Frequency |
|------|--------|--------|-----------|
| +7 HP | 51->58, 56->63, 54->61 | Out-of-combat: `maxHp/15 = 114/15 = 7` | Every 8s |
| +2 HP | 61->63 | In-combat: `HP_REGEN_IN = 2n` | Every 16s (halfTick gate) |

**Mechanism:** When `handleVictory` fires, `clearCombatArtifacts` immediately deletes all `combatParticipant` rows. The character is instantly "out of combat." With no auto-aggro system, there is always a gap between sequential kills where the out-of-combat regen rate (7x higher) applies.

**Verdict:** Working as designed. No bugs found in the healing pipeline.

## Notable Findings (for future reference)

1. **Sanctify duration is extreme:** If a Cleric casts Sanctify on party members, the regen effect (4 HP/3s, 450 rounds = 22.5 min) makes low-level characters nearly unkillable. Worth monitoring.
2. **tick_hot has no combat gate:** All `regen` CharacterEffects tick every 3 seconds regardless of combat state. This is intentional for in-combat HoTs (Nature's Balm, Consecrated Ground) but means pre-combat buffs also tick at full rate during combat.
3. **lifeOnHit is a dead stat:** Accumulated from Vampiric affixes via `getEquippedBonuses` but never applied in auto-attack or ability code. This is a missing feature to implement later.

## Issues Encountered

None - the audit was straightforward code tracing with no blockers.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Audit complete, no action items
- If desired in future: tune Sanctify duration, implement lifeOnHit consumption, or add post-combat regen cooldown

---
*Phase: quick-303*
*Completed: 2026-02-24*
