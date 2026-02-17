---
phase: 20-perk-variety-expansion
verified: 2026-02-17T18:42:51Z
status: gaps_found
score: 8/11 must-haves verified
re_verification: false
gaps:
  - truth: Crafting/gathering perks increase resource yields and quality when gathering or crafting
    status: partial
    reason: gatherDoubleChance and rareGatherChance are wired in finish_gather. gatherSpeedBonus is now wired in start_gather_resource (quick-148) — reduces the 8-second gather cast duration proportionally with 500ms minimum. craftQualityBonus is defined and accumulated but has zero integration points in any crafting reducer.
    artifacts:
      - path: spacetimedb/src/reducers/items.ts
        issue: craftQualityBonus never read in items.ts. gatherSpeedBonus now applied to gather cast duration (quick-148 resolved).
      - path: spacetimedb/src/helpers/renown.ts
        issue: getAllPerkEffects accumulates craftQualityBonus but no consumer reads this field.
    missing:
      - craftQualityBonus: integrate into craft_item reducer to affect item stats, or document as deferred
  - truth: undying_fury proc (rank 11 combat) applies its intended effect when triggered
    status: failed
    reason: undying_fury has procType on_damage_taken and procChance 3 but its effect object contains only a description string. applyPerkProcs handles procDamageMultiplier, procHealPercent, and procBonusDamage -- none present on undying_fury. The proc rolls correctly but executes no effect.
    artifacts:
      - path: spacetimedb/src/data/renown_data.ts
        issue: undying_fury effect only has procType, procChance, and description. Missing buffType/buffMagnitude/buffDurationSeconds for the intended +50% damage for 10s buff.
      - path: spacetimedb/src/helpers/combat.ts
        issue: applyPerkProcs has no branch for buffType on proc trigger - only handles procDamageMultiplier, procHealPercent, procBonusDamage.
    missing:
      - Add buffType/buffMagnitude/buffDurationSeconds to undying_fury effect in renown_data.ts
      - Add buffType branch in applyPerkProcs that calls addCharacterEffect when a proc triggers a buff
  - truth: Wrath of the Fallen grants a damage buff consumed by the combat loop
    status: partial
    reason: Wrath of the Fallen correctly stores a damage_boost CharacterEffect via addCharacterEffect. However this buff type is NOT consumed by the combat damage calculation loop. Per plan 03 decisions this is a documented deferral (decision 106).
    artifacts:
      - path: spacetimedb/src/helpers/combat.ts
        issue: executePerkAbility stores damage_boost CharacterEffect but combat damage calculation does not read damage_boost to increase damage output.
    missing:
      - Wire damage_boost CharacterEffect type into the combat damage multiplier in reducers/combat.ts
human_verification:
  - test: Grant test renown to rank 5, choose Savage Strikes, enter combat, observe 20+ crit hits
    expected: Approximately 1 in 20 crits triggers proc message in combat log
    why_human: Statistical proc rate verification requires live combat observation
  - test: Choose Second Wind perk (rank 6), use from hotbar outside combat, then try immediately again
    expected: First use heals 20% max HP. Second use shows cooldown remaining message.
    why_human: Real-time cooldown enforcement requires live timestamp-based testing
  - test: Gather resources with Keen Eye perk (rank 2 crafting) approximately 20 times
    expected: Approximately 2 of 20 gathers trigger double yield message
    why_human: Statistical verification of 10% double-gather chance in live environment
  - test: Visit vendor with Shrewd Bargainer perk (rank 3 social), compare prices vs without perk
    expected: Purchase prices 5% lower with discount message. Sell prices 5% higher with bonus message.
    why_human: UI price display requires visual confirmation
---

# Phase 20: Perk Variety Expansion Verification Report

**Phase Goal:** Expand renown perk pools (ranks 2-11) with diverse effect types across three domains: combat procs, crafting/gathering bonuses, and social/utility modifiers. 3 meaningful choices per rank with domain-based differentiation. Active ability perks with hotbar integration.
**Verified:** 2026-02-17T18:42:51Z
**Status:** gaps_found
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | PerkEffect type supports proc triggers, crafting bonuses, social bonuses, and scaling fields | VERIFIED | renown_data.ts lines 36-82, all 16+ new optional fields present |
| 2 | Ranks 2-11 each have exactly 3 perks: one combat, one crafting, one social/utility | VERIFIED | RENOWN_PERK_POOLS ranks 2-11 each contain exactly 3 entries with domain field |
| 3 | Backend and frontend perk definitions are in sync | VERIFIED | RenownPanel.vue RENOWN_PERK_POOLS keys match backend; domain tags and colors present |
| 4 | Existing passive stat bonus perks still work unchanged | VERIFIED | calculatePerkBonuses in renown.ts unchanged, ranks 12-15 intact |
| 5 | Perk descriptions clearly explain each perk | VERIFIED | All 30 perks have descriptive text; frontend adds [Domain] prefix tags |
| 6 | Combat proc perks trigger at correct rates during combat | VERIFIED | applyPerkProcs wired at on_hit/on_crit/on_kill/on_damage_taken in reducers/combat.ts |
| 7 | Crafting/gathering perks increase resource yields and quality | PARTIAL | gatherDoubleChance/rareGatherChance wired; gatherSpeedBonus now wired to gather cast duration (quick-148); craftQualityBonus has no integration point |
| 8 | Social/utility perks improve NPC affinity, vendor prices, travel cooldowns, gold, XP | VERIFIED | All five social bonus fields wired in their respective systems |
| 9 | undying_fury proc (rank 11 combat) applies its intended +50% damage buff | FAILED | Proc rolls correctly but applies no effect -- missing buffType fields and buff-on-proc branch |
| 10 | Active ability perks auto-assign to hotbar when chosen | VERIFIED | choose_perk reducer inserts HotbarSlot on active perk with perkAbilityKey |
| 11 | Active abilities cast with effects and cooldowns enforced | PARTIAL | Second Wind and Thunderous Blow fully functional; Wrath of the Fallen stores buff but damage_boost not consumed by combat loop |

**Score:** 8/11 truths verified (2 partial, 1 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| spacetimedb/src/data/renown_data.ts | Extended PerkEffect type and 30 new perk definitions for ranks 2-11 | VERIFIED | All types and perks present; undying_fury missing buff fields for proc |
| src/components/RenownPanel.vue | Matching client-side perk display data for ranks 2-11 with domain field | VERIFIED | 30 perks synced, DOMAIN_COLORS, getDomainColor, border-left styling applied |
| spacetimedb/src/helpers/renown.ts | getPerkProcs and getPerkBonusByField helper functions | VERIFIED | Both functions present and substantive; getAllPerkEffects also present |
| spacetimedb/src/helpers/combat.ts | applyPerkProcs and executePerkAbility functions | VERIFIED | Both present and wired; undying_fury proc triggers but has no executable effect |
| spacetimedb/src/reducers/items.ts | Gathering perk bonus application | PARTIAL | gatherDoubleChance/rareGatherChance/gatherSpeedBonus wired; craftQualityBonus not wired |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| spacetimedb/src/data/renown_data.ts | spacetimedb/src/helpers/renown.ts | RENOWN_PERK_POOLS import | WIRED | renown.ts line 1 imports RENOWN_PERK_POOLS, used in getPerkProcs/getPerkBonusByField |
| src/components/RenownPanel.vue | spacetimedb/src/data/renown_data.ts | mirrored perk key names | WIRED | All 30 perk keys match exactly between backend and frontend |
| spacetimedb/src/helpers/combat.ts | spacetimedb/src/helpers/renown.ts | getPerkProcs import | WIRED | combat.ts line 3 imports getPerkProcs, used in applyPerkProcs |
| spacetimedb/src/reducers/items.ts | spacetimedb/src/helpers/renown.ts | getPerkBonusByField import | WIRED | items.ts line 3 imports getPerkBonusByField, used for vendor and gathering |
| spacetimedb/src/helpers/npc_affinity.ts | spacetimedb/src/helpers/renown.ts | npcAffinityGainBonus | WIRED | npc_affinity.ts line 3 imports getPerkBonusByField, line 46 applies bonus |
| spacetimedb/src/reducers/renown.ts | hotbarSlot table | hotbarSlot.insert for perk abilities | WIRED | renown.ts lines 57-75 insert HotbarSlot on active perk choice |
| spacetimedb/src/helpers/combat.ts | spacetimedb/src/data/renown_data.ts | RENOWN_PERK_POOLS lookup | WIRED | combat.ts imports RENOWN_PERK_POOLS, findPerkByKey uses it |
| spacetimedb/src/reducers/movement.ts | spacetimedb/src/helpers/renown.ts | travelCooldownReduction | WIRED | movement.ts line 3 imports getPerkBonusByField, line 109 applies reduction |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| spacetimedb/src/data/renown_data.ts | 362 | undying_fury effect has only description string, no executable effect fields | Blocker | Rank 11 combat perk proc triggers but applies no effect |
| spacetimedb/src/helpers/renown.ts | 184-196 | craftQualityBonus accumulated with no consumer | Warning | Perks grant craftQualityBonus but it has zero gameplay effect. gatherSpeedBonus resolved (quick-148). |
| spacetimedb/src/helpers/combat.ts | 2149-2163 | damage_boost CharacterEffect stored but not consumed by combat damage calculation | Warning | Wrath of the Fallen appears to activate but provides no actual damage increase |

### Human Verification Required

#### 1. Combat Proc Rate Verification

**Test:** Grant test renown to rank 5, choose Savage Strikes, enter combat, observe 20+ crit hits.
**Expected:** Approximately 1 in 20 crits should trigger a proc message in the combat log.
**Why human:** Statistical proc rate verification requires live combat with observed attack sequences.

#### 2. Active Perk Casting and Cooldown

**Test:** Choose Second Wind perk (rank 6), use it from hotbar outside combat, then try to use it again immediately.
**Expected:** First use heals 20% of max HP. Second use returns a cooldown remaining message.
**Why human:** Real-time cooldown enforcement requires live timestamp-based testing.

#### 3. Gathering Double Yield Rate

**Test:** Gather resources with Keen Eye perk (rank 2 crafting) approximately 20 times.
**Expected:** Approximately 2 of 20 gathers show the double yield trigger message.
**Why human:** Statistical verification of 10% double-gather chance in live environment.

#### 4. Vendor Discount Display

**Test:** Visit vendor with Shrewd Bargainer perk (rank 3 social), compare buy and sell prices vs without perk.
**Expected:** Purchase prices 5% lower with perk discount message. Sell prices 5% higher with perk bonus message.
**Why human:** UI price display requires visual confirmation and discount messaging observation.


### Gaps Summary

Three gaps block full goal achievement, sharing a root cause: effect types are defined in data but the execution layer does not handle all of them.

**Gap 1a - gatherSpeedBonus (RESOLVED - quick-148).** gatherSpeedBonus was accumulated but not applied to any gather timer. Gathering uses an 8-second scheduled cast (RESOURCE_GATHER_CAST_MICROS). quick-148 wired gatherSpeedBonus in start_gather_resource to reduce the cast duration proportionally with a 500ms minimum. Perks now functional: Efficient Hands (rank 3, +15%), Master Harvester (rank 5, +10%), Resourceful (rank 8, +20%).

**Gap 1b - craftQualityBonus is a no-op.** Defined in PerkEffect, present in perk data, accumulated in getAllPerkEffects but no game system reads it at runtime. The crafting system creates items with fixed stats and no quality variance, so craftQualityBonus has no integration point. Perks affected: Artisan Touch (rank 6), Resourceful (rank 8), Masterwork (rank 9), Golden Touch (rank 10), Grand Artisan (rank 11) grant craftQualityBonus. Silently non-functional pending Phase 13 Crafting System.

**Gap 2 - undying_fury proc fires but applies no effect.** Rank 11 combat perk Undying Fury is defined with procType on_damage_taken and procChance 3 -- the proc rolls correctly in applyPerkProcs. However its effect object contains only a description field. applyPerkProcs handles three effect types (procDamageMultiplier, procHealPercent, procBonusDamage). The intended +50% damage for 10s buff requires buffType/buffMagnitude/buffDurationSeconds fields in the effect plus a buff-application branch in applyPerkProcs. Neither exists.

**Gap 3 - Wrath of the Fallen buff is stored but not consumed.** The rank 10 active ability stores a damage_boost CharacterEffect correctly. However the combat damage calculation in reducers/combat.ts does not read damage_boost effect type when computing final damage. Per plan 03 this is a documented deferral -- the ability shows no error and displays a message, but provides zero gameplay benefit. A gap-closure plan should wire damage_boost into the combat damage multiplier alongside existing character effect types.

---

_Verified: 2026-02-17T18:42:51Z_
_Verifier: Claude (gsd-verifier)_
