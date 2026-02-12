---
phase: quick-3
plan: 01
subsystem: combat-rewards
tags: [ux, group-log, messaging]
dependency-graph:
  requires: []
  provides:
    - "Character-name-based group log messages for combat rewards"
  affects:
    - spacetimedb/src/reducers/combat.ts
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - path: spacetimedb/src/reducers/combat.ts
      provides: "Updated 6 logGroupEvent calls to use character.name instead of 'You'"
decisions:
  - summary: "Past tense grammar for third-person messages"
    options: ["gained/lost/reached vs gain/lose/reach"]
    choice: "gained/lost/reached"
    reasoning: "Grammatically correct third-person past tense for completed actions"
metrics:
  duration: "55 seconds"
  completed: 2026-02-12
---

# Quick Task 3: Fix Group Log Messages to Show Character Names

**One-liner:** Group combat reward messages now display character names (e.g., "Bob gained 15 XP") instead of confusing duplicate "You" messages.

---

## Overview

Fixed group log messages in combat rewards to show character names instead of "You". When a group completes combat, each member's reward/system messages are sent to the group log. Previously these used "You" phrasing identical to private messages, resulting in confusing duplicate "You gain 15 XP" messages visible to all group members. Now the group log correctly shows "Bob gained 15 XP", "Alice reached level 5", etc.

---

## What Was Done

### Task 1: Replace "You" with character.name in group log messages

**Files modified:**
- `spacetimedb/src/reducers/combat.ts`

**Changes:**
Updated 6 `logGroupEvent` calls in the combat reward distribution section (lines 1898-2015):

1. **Gold reward (line ~1898):**
   - Private: `You gain ${goldReward} gold.` (unchanged)
   - Group: `${character.name} gained ${goldReward} gold.` (changed)

2. **Death XP loss (line ~1928):**
   - Private: `You lose ${loss} XP from the defeat.` (unchanged)
   - Group: `${character.name} lost ${loss} XP from the defeat.` (changed)

3. **XP reward reduced for defeat (line ~1958):**
   - Private: `You gain ${reward.xpGained} XP (reduced for defeat).` (unchanged)
   - Group: `${character.name} gained ${reward.xpGained} XP (reduced for defeat).` (changed)

4. **Level up while dead (line ~1974):**
   - Private: `You reached level ${reward.newLevel}.` (unchanged)
   - Group: `${character.name} reached level ${reward.newLevel}.` (changed)

5. **Normal XP reward (line ~1993):**
   - Private: `You gain ${reward.xpGained} XP.` (unchanged)
   - Group: `${character.name} gained ${reward.xpGained} XP.` (changed)

6. **Level up while alive (line ~2009):**
   - Private: `You reached level ${reward.newLevel}.` (unchanged)
   - Group: `${character.name} reached level ${reward.newLevel}.` (changed)

**Grammar consistency:**
- Used past tense for third-person messages: "gained", "lost", "reached"
- Private messages retain present tense "You" phrasing as before

**Verification:**
- Module compiled and published successfully
- Grep confirmed zero `logGroupEvent` calls with "You gain/lose/reached" patterns
- Private event messages still correctly use "You" (6 instances preserved)

**Status:** Complete and verified

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Decisions Made

1. **Past tense grammar for third-person messages**
   - Used "gained", "lost", "reached" instead of "gain", "lose", "reach"
   - Reasoning: Grammatically correct third-person past tense for completed actions
   - More natural for broadcast messages ("Bob gained XP" vs "Bob gain XP")

---

## Key Learnings

1. **logGroupEvent vs appendPrivateEvent separation:** The codebase already had proper separation between private and group messages, making this fix surgical - only group messages needed updating
2. **Grammar matters in broadcast messages:** Third-person messages require past tense verbs for natural reading
3. **Character scope:** The `character` variable was already loaded at all 6 locations, making the refactor trivial

---

## Self-Check: PASSED

**Created files:**
- FOUND: .planning/quick/3-fix-group-log-messages-to-show-character/3-SUMMARY.md

**Modified files:**
- FOUND: spacetimedb/src/reducers/combat.ts

**Commits:**
- FOUND: a2ece2f (fix(quick-3): use character names in group log messages)

**Verification:**
- Module published successfully
- Zero "You" messages remaining in logGroupEvent calls
- Private event messages preserved with "You" phrasing

---

## Impact

**User experience:** Group members now see clear attribution of rewards and level-ups in the group log, eliminating confusion from duplicate "You" messages.

**Scope:** 6 group log messages updated, 6 private messages preserved unchanged.

**Risk:** None - changes are purely cosmetic text replacements.
