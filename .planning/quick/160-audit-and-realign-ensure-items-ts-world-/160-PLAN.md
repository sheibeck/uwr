---
phase: quick-160
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/seeding/ensure_items.ts
autonomous: true
must_haves:
  truths:
    - "T2 world-drop weapons have 5 base / 7 dps (not old inflated values)"
    - "T2 world-drop armor exists for all 4 armor types across chest/legs/boots at correct AC values"
    - "Every armor type (cloth/leather/chain/plate) has base templates for head, wrists, hands, and belt at correct T1 AC values"
    - "Silken Robe (T2 cloth chest) has AC=4, Ranger Jerkin (T2 leather chest) has AC=5"
  artifacts:
    - path: "spacetimedb/src/seeding/ensure_items.ts"
      provides: "All world-drop gear templates with correct AC/damage progression"
  key_links:
    - from: "spacetimedb/src/seeding/ensure_items.ts"
      to: "spacetimedb/src/helpers/items.ts"
      via: "STARTER_ARMOR/STARTER_WEAPONS imports"
      pattern: "STARTER_ARMOR|STARTER_WEAPONS"
---

<objective>
Audit and realign all world-drop gear in ensure_items.ts against the AC/weapon damage progression established in quick-156 and quick-158. Fix T2 weapon values, fix T2 armor AC values, add missing T2 armor templates (legs/boots for cloth/leather, full set for chain/plate), and add missing per-armor-type base templates for head/wrists/hands/belt slots.

Purpose: Consistent gear progression across all tiers and armor types
Output: Corrected ensure_items.ts with full T1/T2 armor coverage and correct stat values
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/seeding/ensure_items.ts
@spacetimedb/src/helpers/items.ts (STARTER_ARMOR AC values, EQUIPMENT_SLOTS)
@spacetimedb/src/data/combat_constants.ts (STARTER_ITEM_NAMES)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix T2 world-drop weapons and T2 armor AC values</name>
  <files>spacetimedb/src/seeding/ensure_items.ts</files>
  <action>
In ensureWorldDropGearTemplates, fix the three T2 weapons to match the established progression (T2 = 5 base / 7 dps):
- Steel Longsword: weaponBaseDamage 9n -> 5n, weaponDps 13n -> 7n
- Yew Bow: weaponBaseDamage 8n -> 5n, weaponDps 12n -> 7n
- Oak Staff: weaponBaseDamage 7n -> 5n, weaponDps 11n -> 7n

Fix T2 armor AC values to match T2 spec (T1 + 1 on every slot):
- Silken Robe (T2 cloth chest): armorClassBonus 5n -> 4n (T2 cloth chest = 4)
- Ranger Jerkin (T2 leather chest): armorClassBonus 6n -> 5n (T2 leather chest = 5)

Also remove the intBonus: 1n from Silken Robe and dexBonus: 1n from Ranger Jerkin — T2 world-drop base templates should have 0 stat bonuses (affixes handle stats). This keeps them consistent with all other world-drop armor templates which have 0 stat bonuses.
  </action>
  <verify>Read the file and confirm all T2 weapon values are 5n/7n and T2 armor AC values match the spec.</verify>
  <done>T2 weapons: Steel Longsword/Yew Bow/Oak Staff all 5/7. T2 armor: Silken Robe AC=4, Ranger Jerkin AC=5. No spurious stat bonuses on T2 base templates.</done>
</task>

<task type="auto">
  <name>Task 2: Add missing T2 armor templates and missing per-armor-type other-slot templates</name>
  <files>spacetimedb/src/seeding/ensure_items.ts</files>
  <action>
**A. Add missing T2 world-drop armor in ensureWorldDropGearTemplates.**

Currently only T2 cloth chest and T2 leather chest exist. Add the rest:

T2 ARMOR AC SPEC (T1+1):
- Cloth:   chest=4, legs=3, boots=3
- Leather: chest=5, legs=4, boots=4
- Chain:   chest=6, legs=5, boots=4
- Plate:   chest=7, legs=6, boots=5

Add these missing T2 templates (tier: 2n, requiredLevel: 11n, rarity: 'common', all stat bonuses 0n):

Cloth (allowedClasses: 'any'):
- "Silken Trousers" — slot: 'legs', armorType: 'cloth', armorClassBonus: 3n, vendorValue: 12n
- "Silken Slippers" — slot: 'boots', armorType: 'cloth', armorClassBonus: 3n, vendorValue: 10n

Leather (allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid'):
- "Ranger Leggings" — slot: 'legs', armorType: 'leather', armorClassBonus: 4n, vendorValue: 12n
- "Ranger Boots" — slot: 'boots', armorType: 'leather', armorClassBonus: 4n, vendorValue: 10n

Chain (allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver'):
- "Riveted Hauberk" — slot: 'chest', armorType: 'chain', armorClassBonus: 6n, vendorValue: 16n
- "Riveted Greaves" — slot: 'legs', armorType: 'chain', armorClassBonus: 5n, vendorValue: 14n
- "Riveted Sabatons" — slot: 'boots', armorType: 'chain', armorClassBonus: 4n, vendorValue: 12n

Plate (allowedClasses: 'warrior,paladin,bard,cleric'):
- "Forged Cuirass" — slot: 'chest', armorType: 'plate', armorClassBonus: 7n, vendorValue: 18n
- "Forged Greaves" — slot: 'legs', armorType: 'plate', armorClassBonus: 6n, vendorValue: 16n
- "Forged Boots" — slot: 'boots', armorType: 'plate', armorClassBonus: 5n, vendorValue: 14n

Also add the remaining missing T2 weapons (only sword/bow/staff exist currently):
- "Flanged Mace" — tier 2n, requiredLevel: 11n, weaponType: 'mace', allowedClasses: 'paladin,cleric', weaponBaseDamage: 5n, weaponDps: 7n, vendorValue: 12n
- "Hardened Axe" — tier 2n, requiredLevel: 11n, weaponType: 'axe', allowedClasses: 'beastmaster', weaponBaseDamage: 5n, weaponDps: 7n, vendorValue: 12n
- "Stiletto" — tier 2n, requiredLevel: 11n, weaponType: 'dagger', allowedClasses: 'rogue', weaponBaseDamage: 5n, weaponDps: 7n, vendorValue: 12n
- "Dueling Rapier" — tier 2n, requiredLevel: 11n, weaponType: 'rapier', allowedClasses: 'bard', weaponBaseDamage: 5n, weaponDps: 7n, vendorValue: 12n
- "Tempered Blade" — tier 2n, requiredLevel: 11n, weaponType: 'blade', allowedClasses: 'spellblade,reaver', weaponBaseDamage: 5n, weaponDps: 7n, vendorValue: 12n

**B. Add missing per-armor-type "other slot" (head/wrists/hands/belt) templates in ensureCraftingBaseGearTemplates.**

Currently only plate head (Iron Helm=4), leather wrists (Leather Bracers=3), plate hands (Iron Gauntlets=4), leather belt (Rough Girdle=3) exist.

T1 "other" AC spec:
- Cloth other=2
- Leather other=3  (already have wrists=3 and belt=3 -- need head and hands)
- Chain other=3
- Plate other=4  (already have head=4 and hands=4 -- need wrists and belt)

Add these T1 templates (tier: 1n, requiredLevel: 1n, rarity: 'common', all stat bonuses 0n):

Cloth (allowedClasses: 'any'):
- "Cloth Hood" — slot: 'head', armorType: 'cloth', armorClassBonus: 2n, vendorValue: 3n
- "Cloth Wraps" — slot: 'wrists', armorType: 'cloth', armorClassBonus: 2n, vendorValue: 2n
- "Cloth Gloves" — slot: 'hands', armorType: 'cloth', armorClassBonus: 2n, vendorValue: 2n
- "Cloth Sash" — slot: 'belt', armorType: 'cloth', armorClassBonus: 2n, vendorValue: 2n

Leather (allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid'):
- "Leather Cap" — slot: 'head', armorType: 'leather', armorClassBonus: 3n, vendorValue: 4n
- "Leather Gloves" — slot: 'hands', armorType: 'leather', armorClassBonus: 3n, vendorValue: 3n

Chain (allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver'):
- "Chain Coif" — slot: 'head', armorType: 'chain', armorClassBonus: 3n, vendorValue: 4n
- "Chain Bracers" — slot: 'wrists', armorType: 'chain', armorClassBonus: 3n, vendorValue: 3n
- "Chain Gauntlets" — slot: 'hands', armorType: 'chain', armorClassBonus: 3n, vendorValue: 3n
- "Chain Girdle" — slot: 'belt', armorType: 'chain', armorClassBonus: 3n, vendorValue: 3n

Plate (allowedClasses: 'warrior,paladin,bard,cleric'):
- "Plate Vambraces" — slot: 'wrists', armorType: 'plate', armorClassBonus: 4n, vendorValue: 4n
- "Plate Girdle" — slot: 'belt', armorType: 'plate', armorClassBonus: 4n, vendorValue: 4n

Use the same upsertByName pattern already in ensureCraftingBaseGearTemplates. Follow the single-line format already used in that function.

**C. Fix the AC values on existing crafting base items if wrong.**
Review: Iron Helm plate head=4n (T1 plate other=4) CORRECT. Leather Bracers leather wrists=3n (T1 leather other=3) CORRECT. Iron Gauntlets plate hands=4n (T1 plate other=4) CORRECT. Rough Girdle leather belt=3n (T1 leather other=3) CORRECT. No fixes needed on existing items.
  </action>
  <verify>
Read the updated file. Count: should have 4 armor types x 3 slots = 12 T1 world-drop armor sets + 4 armor types x 3 slots = 12 T2 world-drop armor sets + 8 T1 weapons + 8 T2 weapons. Verify all AC and damage values match the spec. Verify all 4 armor types have head/wrists/hands/belt templates.
  </verify>
  <done>
T2 armor: all 12 chest/legs/boots templates exist with correct AC values.
T2 weapons: all 8 weapon types exist with 5/7 base/dps.
Other slots: all 4 armor types have head/wrists/hands/belt with correct T1 AC values (cloth=2, leather=3, chain=3, plate=4).
  </done>
</task>

<task type="auto">
  <name>Task 3: Republish module via upsert</name>
  <files>spacetimedb/src/seeding/ensure_items.ts</files>
  <action>
Publish the SpacetimeDB module WITHOUT --clear-database (upsert mode). No new columns were added, only new rows and updated values on existing rows. The seeding functions all use upsert-by-name patterns.

Run: spacetime publish uwr --project-path spacetimedb

Verify server logs show no errors.
  </action>
  <verify>spacetime publish succeeds. spacetime logs uwr shows no errors in seeding output.</verify>
  <done>Module published successfully with all corrected gear templates live in database.</done>
</task>

</tasks>

<verification>
After all tasks complete:
1. T2 weapons (Steel Longsword, Yew Bow, Oak Staff, Flanged Mace, Hardened Axe, Stiletto, Dueling Rapier, Tempered Blade) all have weaponBaseDamage=5n, weaponDps=7n
2. T2 armor AC values: cloth 4/3/3, leather 5/4/4, chain 6/5/4, plate 7/6/5
3. T1 armor AC values: cloth 3/2/2, leather 4/3/3, chain 5/4/3, plate 6/5/4 (unchanged)
4. Other-slot coverage: all 4 armor types have head/wrists/hands/belt at cloth=2, leather=3, chain=3, plate=4
5. Module publishes cleanly via upsert
</verification>

<success_criteria>
- Every world-drop gear template matches the established progression from quick-156/158
- No armor type is missing templates for any equippable slot
- Module is live with corrected values
</success_criteria>

<output>
After completion, create `.planning/quick/160-audit-and-realign-ensure-items-ts-world-/160-SUMMARY.md`
</output>
