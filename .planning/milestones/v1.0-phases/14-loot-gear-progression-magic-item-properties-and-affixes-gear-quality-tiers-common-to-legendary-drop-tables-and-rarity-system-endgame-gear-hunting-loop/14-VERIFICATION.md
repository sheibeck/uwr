---
phase: 14-loot-gear-progression
verified: 2026-02-17T12:48:02Z
status: passed
score: 13/13 must-haves verified
human_verification:
  - test: Kill enemies in Tier 1 region and inspect loot panel quality colors
    expected: Common drops show white names, Uncommon drops show green names with 1 affix stat line in tooltip
    why_human: Requires running game, fighting enemies, observing UI rendering
  - test: Equip an affixed item and check character stats panel
    expected: Affix stat bonus (e.g. +2 STR) appears in character stats
    why_human: Requires live game state and visual inspection of stats panel
  - test: Right-click an unequipped gear item in inventory
    expected: Salvage option appears; confirming it grants gold and removes item
    why_human: Requires interactive game session
  - test: Fight high-level enemies (21-30) for Epic drops
    expected: Epic drops show purple names with 3 affix lines and flash animation
    why_human: Flash animation and color rendering require visual confirmation
  - test: Fight Fen Witch, Cinder Sentinel, Hexbinder, or Basalt Brute and win
    expected: Legendary item announced in group log; appears in loot panel with orange color
    why_human: Requires targeting specific enemy templates in game, observing UI
---

# Phase 14: Loot and Gear Progression Verification Report

**Phase Goal:** Dropped gear has quality tiers (Common through Legendary) with prefix/suffix affixes that create emergent item identities, level-gated quality unlocks per region tier, named Legendary uniques from boss enemies, and a complete gear lifecycle of drop-equip-outgrow-salvage.
**Verified:** 2026-02-17T12:48:02Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ItemAffix table exists with by_instance btree index | VERIFIED | tables.ts:357-372 - table named item_affix with single-column btree index on itemInstanceId |
| 2 | ItemInstance has qualityTier, displayName, isNamed optional fields | VERIFIED | tables.ts:351-353 - three optional fields appended at end of column list |
| 3 | CombatLoot has qualityTier, affixDataJson, isNamed optional fields | VERIFIED | tables.ts:535-537 - three optional fields appended at end of column list |
| 4 | Affix catalog has 12 prefixes, 11 suffixes, 4 legendary definitions | VERIFIED | affix_catalog.ts - PREFIXES (12), SUFFIXES (11), LEGENDARIES (4) all substantive |
| 5 | Enemy kills roll quality tier based on creature level (level-gated) | VERIFIED | helpers/items.ts:73-97 - rollQualityTier uses seed+31n; lvl<=10=uncommon only, lvl<=20 adds rare, lvl<=30 adds epic |
| 6 | CombatLoot rows include qualityTier and affixDataJson for non-Common gear | VERIFIED | combat.ts:618-624 rolls quality in generateLootTemplates; combat.ts:2194-2196 passes to combatLoot.insert |
| 7 | Taking loot creates ItemAffix rows and sets qualityTier/displayName on ItemInstance | VERIFIED | items.ts:243-271 - take_loot parses affixDataJson, inserts ItemAffix rows, updates ItemInstance |
| 8 | Equipped affix bonuses included in getEquippedBonuses stat totals | VERIFIED | helpers/items.ts:203-217 - iterates itemAffix.by_instance.filter; sums 9 stat types |
| 9 | Named boss kills drop Legendary with fixed affixes (single CombatLoot row) | VERIFIED | combat.ts:2255-2301 - LEGENDARIES.find by enemyTemplateName; single insert for first alive participant |
| 10 | Salvaging gear destroys item and grants gold scaled by tier+quality | VERIFIED | items.ts:1373-1417 - salvage_item deletes ItemAffix rows, deletes ItemInstance, grants gold |
| 11 | Loot panel shows quality-colored names and affix lines | VERIFIED | LootPanel.vue:12-34 - rarityStyle, qualityBorderStyle, flashStyle; affix stats in v-for loop |
| 12 | Inventory items show colored borders and affix tooltip lines | VERIFIED | InventoryPanel.vue:61,69,161-172,233-240 - qualityBorderStyle, affixStats rendered, Salvage context menu |
| 13 | ItemAffix table subscribed and wired in client | VERIFIED | useGameData.ts:74 useTable(tables.itemAffix); useInventory.ts:190-215 reads affixes; useCombat.ts:262-314 parses |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| spacetimedb/src/schema/tables.ts | ItemAffix table, extended ItemInstance/CombatLoot | VERIFIED | ItemAffix at line 357 with by_instance index; in schema export at line 1535 |
| spacetimedb/src/data/affix_catalog.ts | PREFIXES, SUFFIXES, LEGENDARIES arrays | VERIFIED | 12 prefixes, 11 suffixes, 4 legendaries; AffixDef/LegendaryDef types; all quality constants |
| spacetimedb/src/helpers/items.ts | generateAffixData, buildDisplayName, getEquippedBonuses with affix support | VERIFIED | All functions at lines 66-229; getEquippedBonuses reads ItemAffix rows at line 203 |
| spacetimedb/src/reducers/combat.ts | Quality tier rolling and legendary drop path | VERIFIED | rollQualityTier called at line 618; legendary block at lines 2254-2302 |
| spacetimedb/src/reducers/items.ts | take_loot creates ItemAffix rows, salvage_item reducer | VERIFIED | take_loot affix handling at lines 243-271; salvage_item at lines 1373-1417 |
| src/module_bindings/item_affix_table.ts | Generated binding for ItemAffix table | VERIFIED | File exists; imported in module_bindings/index.ts at line 335 |
| src/module_bindings/salvage_item_reducer.ts | Generated binding for salvage_item | VERIFIED | File exists |
| src/composables/useCombat.ts | pendingLoot includes qualityTier and affix stats | VERIFIED | formatAffixStatKey at line 81; qualityTier/affixStats built at lines 262-314 |
| src/composables/useInventory.ts | ItemAffixRow integration, salvageItem reducer call | VERIFIED | affixStats built at lines 190-215; salvageItem at lines 312-314 |
| src/components/LootPanel.vue | Quality colors, affix lines, Epic/Legendary flash | VERIFIED | rarityStyle, qualityBorderStyle, flashStyle; @keyframes lootFlash and lootFlashLegendary in style block |
| src/components/InventoryPanel.vue | Quality borders, affix tooltip, Salvage context menu | VERIFIED | qualityBorderStyle at line 61; Salvage menu at lines 233-240 with window.confirm |
| src/ui/styles.ts | lootFlash styles, qualityBorder styles | VERIFIED | lootFlashEpic, lootFlashLegendary, qualityBorderCommon through qualityBorderLegendary at lines 1304-1314 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| combat.ts | helpers/items.ts | generateAffixData() called from generateLootTemplates | WIRED | combat.ts:7 imports; combat.ts:620 calls generateAffixData(template.slot, quality, seedBase) |
| items.ts | schema/tables.ts | ItemAffix row creation in take_loot | WIRED | items.ts:258 - ctx.db.itemAffix.insert in take_loot affix loop |
| helpers/items.ts | schema/tables.ts | getEquippedBonuses reads ItemAffix via by_instance index | WIRED | helpers/items.ts:203 - ctx.db.itemAffix.by_instance.filter(instance.id) |
| combat.ts | data/affix_catalog.ts | LEGENDARIES lookup by enemy template name | WIRED | combat.ts:8 imports LEGENDARIES; combat.ts:2256 LEGENDARIES.find by enemyTemplateName |
| items.ts | schema/tables.ts | ItemAffix deletion on salvage | WIRED | items.ts:1401-1402 - ctx.db.itemAffix.by_instance.filter + delete loop |
| useCombat.ts | module_bindings | CombatLoot.qualityTier and affixDataJson | WIRED | useCombat.ts:262 reads row.qualityTier; line 264 parses affixDataJson |
| InventoryPanel.vue | useInventory.ts | Salvage context menu calls salvageItem | WIRED | InventoryPanel.vue:239 emits salvage-item; App.vue:1589 wires salvageItem; CharacterInfoPanel.vue:54 forwards |
| useGameData.ts | module_bindings | ItemAffix table subscription | WIRED | useGameData.ts:74 - const [itemAffixes] = useTable(tables.itemAffix) |

### Anti-Patterns Found

| File | Location | Pattern | Severity | Impact |
|------|----------|---------|----------|--------|
| affix_catalog.ts | Lines 278,300,323,347 | baseTemplateName uses starter training items | Warning | Legendary items drop as weak starter gear; acknowledged placeholder pending better item templates |
| affix_catalog.ts | Lines 295,318,341,364 | enemyTemplateName marked placeholder until World Bosses added | Info | Legendary triggers on any kill of these enemy types, not just named boss encounters |
| combat.ts | Line 2260 | ctx.db.itemTemplate.iter() full table scan in legendary drop path | Info | Performance concern only; acceptable for rare boss kill events |

No blockers. Warning items are acknowledged design placeholders documented in SUMMARYs.

### Human Verification Required

#### 1. Quality Color Rendering in Loot Panel

**Test:** Kill enemies in a Tier 1 region (level 1-10) and observe loot panel
**Expected:** Common drops show white names; Uncommon drops show green names with 1 affix stat line; tile border matches quality color
**Why human:** Requires running game and visual inspection of UI rendering

#### 2. Affix Bonus in Character Stats

**Test:** Pick up and equip an Uncommon item with an affix; open character stats panel
**Expected:** The affix stat bonus (e.g. +2 STR from Mighty) appears in character stats total
**Why human:** Requires live game state and stats panel visual inspection

#### 3. Salvage Context Menu

**Test:** Right-click an unequipped gear item (not consumable/food/resource) in inventory
**Expected:** Salvage appears in context menu; clicking shows confirmation dialog; confirming removes item and grants gold
**Why human:** Requires interactive game session; UI interaction cannot be verified programmatically

#### 4. Epic Drop Flash Animation

**Test:** Obtain an Epic or Legendary quality drop (fight enemies level 21+ or use test commands)
**Expected:** Purple (Epic) or orange (Legendary) animated flash plays on the loot panel row when the item appears
**Why human:** CSS animation playback and visual timing require visual confirmation

#### 5. Legendary Drop Announcement

**Test:** Fight a Fen Witch, Cinder Sentinel, Hexbinder, or Basalt Brute enemy type and win
**Expected:** Group log shows LegendaryName has dropped for CharName; legendary item appears in loot panel with orange color
**Why human:** Requires targeting specific enemy types in game and observing both log and loot panel

### Gaps Summary

No functional gaps found. All 13 observable truths verified. The phase goal is fully implemented:

- Quality tiers Common through Legendary: 5 tiers with distinct colors (#ffffff, #00ff00, #4488ff, #aa44ff, #ff8800), affix counts (0, 1, 2, 3, 0-fixed), and deterministic drop probabilities
- Prefix/suffix affixes creating emergent item identities: 12 prefixes + 11 suffixes; displayName built as prefix + base + suffix
- Level-gated quality unlocks: rollQualityTier caps by creature level (Tier 1=common/uncommon only; Tier 2 adds rare; Tier 3 adds epic; Tier 4+ allows all non-legendary)
- Named Legendary uniques from boss enemies: 4 legendaries with fixed affixes matched by enemy template name, single drop for first participant
- Gear lifecycle drop-equip-outgrow-salvage: full path across combat.ts (drop), take_loot (equip), salvage_item (recycle)

Two acknowledged design placeholders exist but are not blockers: legendary items use starter gear as base templates (pending better loot tables), and legendary drops trigger on any kill of the named enemy type rather than a dedicated boss encounter system (pending Phase 17 World Bosses).

---

_Verified: 2026-02-17T12:48:02Z_
_Verifier: Claude (gsd-verifier)_
