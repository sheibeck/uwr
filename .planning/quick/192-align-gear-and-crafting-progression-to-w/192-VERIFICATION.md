---
phase: quick-192
verified: 2026-02-18T00:00:00Z
status: gaps_found
score: 5/6 must-haves verified
gaps:
  - truth: "All probability thresholds are named constants in items.ts config block — no inline magic numbers in rollQualityTier"
    status: partial
    reason: "The T1 special-case branch in rollQualityTier (lines 128-134) and the dangerBonus computation (line 124) use inline numeric literals that are not extracted into named constants. Specifically: danger threshold 120, max danger bonus 10, level multiplier 5, max levelPct 30, max uncommonChance 35, and the alternative danger divisor 10 and 15. These values appear in the function body, not in TIER_RARITY_WEIGHTS or any other named config constant."
    artifacts:
      - path: "spacetimedb/src/helpers/items.ts"
        issue: "Lines 123-135: dangerBonus = Math.min(10, ...(danger - 120) / 15); T1 branch uses level * 5, Math.min(30, ...), (danger - 120) / 10, Math.min(35, ...) — all inline literals not in named constants"
    missing:
      - "Extract T1 level-scaling constants into named config: T1_LEVEL_PCT_PER_LEVEL (5), T1_MAX_LEVEL_PCT (30), T1_MAX_UNCOMMON_CHANCE (35), DANGER_THRESHOLD (120), DANGER_DIVISOR_T1 (10)"
      - "Extract danger bonus constants into named config: DANGER_THRESHOLD (120), DANGER_MAX_BONUS (10), DANGER_DIVISOR (15)"
      - "Consolidate into a named object (e.g., DANGER_BONUS_CONFIG) or add constants alongside TIER_RARITY_WEIGHTS"
---

# Phase quick-192: Align Gear and Crafting Progression to World-Tier System — Verification Report

**Phase Goal:** Align gear and crafting progression to world-tier system: rarity+quality rolled independently per enemy level band, tunable config values
**Verified:** 2026-02-18
**Status:** gaps_found — 1 gap found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                  | Status      | Evidence                                                                                                                                                                                         |
|-----|--------------------------------------------------------------------------------------------------------|-------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1   | Dropped gear has both rarity AND quality rolled independently based on enemy level band               | VERIFIED    | `rollQualityTier` and `rollQualityForDrop` both called in `generateLootTemplates` (combat.ts:624-625) with same `seedBase` but different offsets (53n vs 67n); both written to CombatLoot.craftQuality |
| 2   | All probability thresholds are named constants in items.ts config block — no inline magic numbers in rollQualityTier | PARTIAL GAP | T1 special-case branch (items.ts:128-134) and dangerBonus computation (line 124) use inline literals: 120, 10, 15, 30, 5, 35 — not in named config constants |
| 3   | T5 (L41-50) exists as a distinct tier with its own rarity and quality weight tables                   | VERIFIED    | `getWorldTier` returns 5 for level > 40n; `TIER_RARITY_WEIGHTS` and `TIER_QUALITY_WEIGHTS` each have 5 entries including key 5: [10,20,40,30] and [15,45,40] |
| 4   | Equipping gear does NOT check character.level against template.requiredLevel                          | VERIFIED    | items.ts:469-471: check commented out with comment "REMOVED per world-tier spec: gear availability is world-driven, not character-level-gated" |
| 5   | Crafting quality is probability-weighted by material tier                                             | VERIFIED    | `CRAFT_QUALITY_PROBS` constant in crafting_materials.ts:167-171; `materialTierToCraftQuality` uses probabilistic roll when seed provided; `craft_recipe` passes `craftSeed = ctx.timestamp.microsSinceUnixEpoch + character.id` |
| 6   | craftQuality rolled at drop time is preserved through take_loot onto the ItemInstance               | VERIFIED    | Non-common items: items.ts:318 sets `craftQuality: loot.craftQuality ?? undefined`; common items: items.ts:323-332 has explicit craftQuality propagation block; CombatLoot schema has `craftQuality: t.string().optional()` column (tables.ts:542) |

**Score:** 5/6 truths verified

### Required Artifacts

| Artifact                                         | Expected                                                                   | Status      | Details                                                                                           |
|--------------------------------------------------|----------------------------------------------------------------------------|-------------|---------------------------------------------------------------------------------------------------|
| `spacetimedb/src/schema/tables.ts`               | CombatLoot table gains craftQuality: t.string().optional() column          | VERIFIED    | Line 542: `craftQuality: t.string().optional(),   // rolled craftsmanship quality, e.g., 'reinforced'` |
| `spacetimedb/src/helpers/items.ts`               | TIER_RARITY_WEIGHTS, TIER_QUALITY_WEIGHTS config constants; rollQualityTier rewritten; rollQualityForDrop new function; getWorldTier with T5 | PARTIAL     | All exports present and substantive; T1 special-case in rollQualityTier retains inline magic numbers |
| `spacetimedb/src/reducers/combat.ts`             | generateLootTemplates calls rollQualityForDrop and sets craftQuality on CombatLoot rows | VERIFIED    | Line 10: import includes rollQualityForDrop; line 625: `const craftQual = rollQualityForDrop(...)`; lines 635,637: craftQuality passed in push; line 2316: inserted into CombatLoot |
| `spacetimedb/src/reducers/items.ts`              | equip_item level check removed; take_loot copies craftQuality to ItemInstance | VERIFIED    | Level gate commented out at line 471; craftQuality propagated at lines 318, 330, 411, 423 |
| `spacetimedb/src/data/crafting_materials.ts`     | materialTierToCraftQuality probability-weighted; CRAFT_QUALITY_PROBS constant added | VERIFIED    | CRAFT_QUALITY_PROBS at lines 167-171; materialTierToCraftQuality at lines 179-196 uses probabilistic roll |

### Key Link Verification

| From                                     | To                                        | Via                                       | Status     | Details                                                                                     |
|------------------------------------------|-------------------------------------------|-------------------------------------------|------------|---------------------------------------------------------------------------------------------|
| spacetimedb/src/reducers/combat.ts       | spacetimedb/src/helpers/items.ts          | import rollQualityForDrop                 | WIRED      | combat.ts line 10 imports `rollQualityForDrop`; used at line 625                           |
| generateLootTemplates in combat.ts       | CombatLoot insert                         | craftQuality field set from rollQualityForDrop result | WIRED | craftQual stored (line 625), passed to lootItems array (lines 635,637), inserted at line 2316 |
| take_loot in items.ts                    | CombatLoot.craftQuality                   | loot.craftQuality read and passed to ItemInstance id.update | WIRED | Lines 318, 330, 411, 423 all propagate craftQuality from loot row |
| spacetimedb/src/reducers/items.ts craft_recipe | spacetimedb/src/data/crafting_materials.ts | materialTierToCraftQuality call          | WIRED      | Line 1141: `const craftQuality = materialTierToCraftQuality(materialTier, craftSeed)`       |

### Requirements Coverage

| Requirement   | Source Plan | Description                                      | Status      | Evidence                                                                 |
|---------------|-------------|--------------------------------------------------|-------------|--------------------------------------------------------------------------|
| GEAR-PROG-01  | 192-PLAN.md | Rarity+quality rolled independently per level band | SATISFIED  | Both axes rolled in generateLootTemplates; stored independently          |
| GEAR-PROG-02  | 192-PLAN.md | All probability curves in tunable config constants | PARTIAL    | TIER_RARITY_WEIGHTS/TIER_QUALITY_WEIGHTS/CRAFT_QUALITY_PROBS defined; T1 special-case in rollQualityTier still has inline numbers |
| GEAR-PROG-03  | 192-PLAN.md | T5 tier added; equip level gate removed          | SATISFIED   | getWorldTier returns 5 for L41-50; equip gate commented out             |
| GEAR-PROG-04  | 192-PLAN.md | craftQuality flows from drop through take_loot to ItemInstance | SATISFIED | CombatLoot schema column + propagation in both common and non-common branches |

### Anti-Patterns Found

| File                                       | Line    | Pattern                                                        | Severity | Impact                                              |
|--------------------------------------------|---------|----------------------------------------------------------------|----------|-----------------------------------------------------|
| spacetimedb/src/helpers/items.ts           | 124     | `Math.min(10, Math.max(0, Math.floor((Number(dangerMultiplier) - 120) / 15)))` — inline literals 10, 120, 15 | Warning | dangerBonus computation uses unlabeled magic numbers |
| spacetimedb/src/helpers/items.ts           | 128-134 | T1 special-case branch uses inline literals 30, 5, 120, 10, 35 | Warning  | Probability thresholds for T1 level-scaling not in named config |

### Human Verification Required

None required — all goal-critical behaviors are verifiable from static code analysis.

### Gaps Summary

**One gap found** affecting Must-Have #2: "All probability thresholds are named constants — no inline magic numbers in rollQualityTier."

The T1 special-case branch in `rollQualityTier` (items.ts lines 128-134) was retained from the pre-task implementation. It uses inline numeric literals for:
- Level-to-uncommon-chance multiplier: `5` (per level)
- Maximum level percent cap: `30`
- Maximum uncommon chance cap: `35`
- Danger threshold: `120`
- Danger divisor for T1: `10`

Additionally, the `dangerBonus` computation at line 124 uses inline `10`, `120`, and `15` as the cap, threshold, and divisor.

The plan specified "no inline magic numbers in rollQualityTier" and instructed replacing the old fallback logic with a single clean codepath using TIER_RARITY_WEIGHTS. Instead, the T1 level-scaling path was preserved alongside the new TIER_RARITY_WEIGHTS path. This means T1 drops do NOT use TIER_RARITY_WEIGHTS[1] when `dangerMultiplier` is provided — the T1 special case bypasses the named constants entirely.

This is a warning-level gap: it does not prevent the system from functioning, and five of six must-haves are fully achieved. However, the tunable-config goal is not fully met for T1 drops under danger conditions.

---

_Verified: 2026-02-18_
_Verifier: Claude (gsd-verifier)_
