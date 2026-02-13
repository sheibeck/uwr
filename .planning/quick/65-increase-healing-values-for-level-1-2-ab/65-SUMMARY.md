---
phase: quick-65
plan: 01
subsystem: combat-balance
tags: [healing, combat-balance, hp-scaling]
dependency-graph:
  requires: [quick-56]
  provides: [proportional-healing-post-hp-increase]
  affects: [combat-healing-effectiveness]
tech-stack:
  patterns: [hardcoded-ability-values]
key-files:
  modified:
    - spacetimedb/src/index.ts
decisions:
  - Doubled flat healing values for level 1-2 abilities to match ~1.8x HP pool increase from quick-56
  - Left percentage-based abilities unchanged (Lay on Hands, Blood Rend)
  - Scaled higher-level HoT/buff abilities for consistency (Nature's Balm, Nature's Gift)
metrics:
  duration: ~2 minutes
  completed: 2026-02-13T13:54:00Z
---

# Quick Task 65: Increase Healing Values for Level 1-2 Abilities

**One-liner:** Doubled flat healing values (~2x) for level 1-2 abilities to restore proportional effectiveness after HP pool increase from ~80 to ~146 (quick-56).

## Context

Quick-56 increased HP pools significantly (BASE_HP 20→50, HP_STR_MULTIPLIER 5→8, roughly ~1.8x increase from ~80 to ~146 HP). However, healing abilities retained their original flat values, making them feel weak. A Cleric Mend healing 10 HP was 12.5% of 80 max HP, but only 6.8% of 146 max HP post-quick-56.

## Changes Made

### Healing Value Increases

All flat healing amounts scaled ~2x to maintain proportional HP restoration:

**Level 1-2 Core Abilities:**
- **Shaman Spirit Mender (L1)**: 6n → 12n direct heal, 3n → 5n per-tick HoT (total: 12 → 22)
- **Cleric Mend (L1)**: 10n → 18n direct heal
- **Necromancer Plague Spark (L1)**: 2n → 4n lifetap self-heal
- **Druid Thorn Lash (L1)**: 3n → 6n lifetap self-heal

**Higher-Level Consistency:**
- **Ranger Nature's Balm (L4)**: 4n → 7n per-tick HoT (total: 12 → 21 over 3 rounds)
- **Druid Nature's Gift (L4)**: 8n → 15n temp HP per party member

**Unchanged (Already Proportional):**
- **Paladin Lay on Hands (L2)**: Heals missing HP (already scales with max HP)
- **Reaver Blood Rend (L1)**: Heals 30% of damage dealt (already scales with damage)

### Example: Cleric Mend Effectiveness

| Metric | Pre-quick-56 | Post-quick-56 (Before fix) | Post-quick-65 (After fix) |
|--------|--------------|----------------------------|---------------------------|
| Max HP | ~80 | ~146 | ~146 |
| Heal amount | 10 | 10 | 18 |
| % of max HP | 12.5% | 6.8% | 12.3% |

## Verification

- Build succeeded without errors
- All healing values match specified new amounts:
  - Spirit Mender: 12n direct + 5n/tick HoT ✓
  - Mend: 18n ✓
  - Plague Spark: 4n ✓
  - Thorn Lash: 6n ✓
  - Nature's Balm: 7n/tick HoT ✓
  - Nature's Gift: 15n temp HP ✓
- Percentage-based abilities (Lay on Hands, Blood Rend) unchanged ✓
- No unintended changes to other abilities ✓

## Commits

| Task | Commit | Files | Description |
|------|--------|-------|-------------|
| 1 | a21d2ae | spacetimedb/src/index.ts | Scale healing values ~2x to match HP pool increase |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

### Files Verified
```
FOUND: spacetimedb/src/index.ts
```

### Commits Verified
```
FOUND: a21d2ae
```

## Impact

Healing abilities now restore proportionally meaningful HP relative to the new ~146 HP pools, maintaining the pre-quick-56 effectiveness percentages. Healers will feel appropriately impactful in combat again.
