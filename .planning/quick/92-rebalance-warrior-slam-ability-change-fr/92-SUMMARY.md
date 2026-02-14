---
phase: quick-92
plan: 01
subsystem: Combat
tags: [ability-balance, warrior, debuff]

dependency_graph:
  requires: [AbilityTemplate database, ability seeding pipeline]
  provides: [Warrior AC debuff utility]
  affects: [warrior_abilities.ts, Warrior combat role]

tech_stack:
  added: []
  patterns: [debuff configuration matching Shaman Hex pattern]

key_files:
  created: []
  modified:
    - path: spacetimedb/src/data/abilities/warrior_abilities.ts
      role: Warrior ability metadata with Slam debuff configuration
      lines: 4

decisions:
  - what: AC debuff magnitude and duration
    why: -5 AC for 7 seconds balances utility without overshadowing Shaman Hex (-2 AC for 3 seconds)
    impact: Warriors gain unique tactical role in group combat
    alternatives: [Different magnitude/duration ratios, damage + debuff hybrid]
    selected: Pure AC debuff with moderate magnitude and duration

  - what: Keep power at 3n
    why: Maintains consistency with original ability resource cost
    impact: 25% debuff power budget allocation matches combat scaling decision #38
    alternatives: [Reduce power since no damage, increase power for stronger debuff]
    selected: Keep power unchanged

metrics:
  duration: 48s
  completed_date: 2026-02-14
---

# Quick Task 92: Rebalance Warrior Slam Ability

**One-liner:** Converted Warrior Slam from damage-dealing physical attack to AC debuff ability (AC -5 for 7 seconds), shifting Warrior class identity toward tactical threat management.

## Summary

Rebalanced the Warrior's level 1 Slam ability from a damage-dealing move to an armor class debuff ability. This change gives Warriors a unique tactical utility role in group combat, allowing them to reduce enemy defenses and create opportunities for damage dealers.

**Changed fields:**
- `description`: Updated to "Slams the target with a powerful blow, reducing their armor class by 5 for 7 seconds."
- `debuffType`: Added 'ac_bonus'
- `debuffMagnitude`: Added -5n
- `debuffDuration`: Added 7n

**Unchanged fields:**
- `power`: 3n (maintains resource cost consistency)
- `cooldownSeconds`: 6n (existing tuning appropriate for debuff)
- `damageType`: 'physical' (kept for consistency, though no damage dealt)

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Convert Warrior Slam to AC debuff ability | cc2cf59 | warrior_abilities.ts |

## Implementation Details

### Debuff Configuration

Followed the pattern established by Shaman Hex (shaman_hex):
- Used same debuff type: `ac_bonus`
- Negative magnitude for AC reduction: `-5n` (stronger than Shaman's -2n)
- Longer duration for utility role: `7n` seconds (vs Shaman's 3n)
- Power level maintained at `3n` for 25% debuff power budget per combat scaling decision #38

### Combat Role Impact

Warriors now have:
- **Before:** Pure damage dealer with physical attack (power: 3n)
- **After:** Tactical debuffer reducing enemy AC by 5 for 7 seconds
- **Role shift:** From offensive damage to defensive utility and threat management

The -5 AC reduction is significant enough to be impactful (2.5x stronger than Shaman Hex) while the 7-second duration allows Warriors to maintain consistent debuff uptime with the 6-second cooldown.

## Verification

1. Verified debuff fields in warrior_abilities.ts:
   ```
   debuffType: 'ac_bonus'
   debuffMagnitude: -5n
   debuffDuration: 7n
   ```

2. TypeScript compilation successful: `npm run build` passed
3. Pattern matches shaman_hex reference implementation
4. No breaking changes to other abilities or systems

## Deviations from Plan

None - plan executed exactly as written.

## Technical Notes

- Ability metadata will seed to AbilityTemplate table on next module publish or /synccontent command
- Combat scaling will apply 25% debuff power budget (decision #38 from STATE.md)
- debuffType='ac_bonus' with negative magnitude reduces target's armor class
- Warriors can now contribute to group combat beyond raw damage output

## Self-Check: PASSED

Files verified:
- FOUND: C:\projects\uwr\spacetimedb\src\data\abilities\warrior_abilities.ts

Commits verified:
- FOUND: cc2cf59

Changes verified:
- warrior_slam contains debuffType: 'ac_bonus'
- warrior_slam contains debuffMagnitude: -5n
- warrior_slam contains debuffDuration: 7n
- description updated to mention armor class reduction
- TypeScript build successful
