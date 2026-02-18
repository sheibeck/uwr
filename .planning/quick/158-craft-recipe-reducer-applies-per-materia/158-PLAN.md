---
phase: quick-158
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/crafting_materials.ts
  - spacetimedb/src/reducers/items.ts
  - spacetimedb/src/helpers/items.ts
  - src/composables/useInventory.ts
  - src/composables/useCombat.ts
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "Crafting with tier 1 material (standard) produces gear with unchanged base stats from template"
    - "Crafting with tier 2 material (reinforced) produces gear with +1 AC for armor or +1/+1 baseDamage/dps for weapons on top of template base"
    - "Crafting with tier 3 material (exquisite) produces gear with +2 AC for armor or +2/+2 baseDamage/dps for weapons on top of template base"
    - "Weapon damage bonus from craft quality is reflected in combat auto-attack calculations"
    - "Armor class bonus from craft quality is reflected in character derived stats"
    - "Client tooltips show effective base stats inclusive of craft quality bonus"
  artifacts:
    - path: "spacetimedb/src/data/crafting_materials.ts"
      provides: "getCraftQualityStatBonus helper function"
      contains: "getCraftQualityStatBonus"
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "craft_recipe reducer applying stat bonus affixes"
      contains: "getCraftQualityStatBonus"
    - path: "spacetimedb/src/helpers/items.ts"
      provides: "getEquippedWeaponStats summing weapon affix bonuses"
      contains: "weaponBaseDamage"
  key_links:
    - from: "spacetimedb/src/reducers/items.ts"
      to: "spacetimedb/src/data/crafting_materials.ts"
      via: "getCraftQualityStatBonus import"
      pattern: "getCraftQualityStatBonus"
    - from: "spacetimedb/src/helpers/items.ts"
      to: "item_affix table"
      via: "affix lookup in getEquippedWeaponStats"
      pattern: "itemAffix\\.by_instance\\.filter"
---

<objective>
Apply per-material-quality stat bonuses to crafted gear in the craft_recipe reducer. Currently crafted items use the item template's base armorClassBonus and weaponBaseDamage/weaponDps unchanged regardless of material quality. After this change, higher-tier materials produce gear with better base stats:

- standard (tier 1): +0 bonus (no change)
- reinforced (tier 2): +1 AC (armor) or +1/+1 baseDamage/dps (weapons)
- exquisite (tier 3): +2 AC (armor) or +2/+2 baseDamage/dps (weapons)

These bonuses are applied as ItemAffix rows so they stack naturally with the existing material-specific affixes and flow through getEquippedBonuses/getEquippedWeaponStats into combat.

Purpose: Make crafting material tier meaningfully affect gear power beyond affix stats.
Output: Updated craft_recipe reducer, weapon stat helper, and client tooltips showing effective values.
</objective>

<execution_context>
@C:/projects/uwr/.planning/quick/158-craft-recipe-reducer-applies-per-materia/158-PLAN.md
</execution_context>

<context>
@spacetimedb/src/data/crafting_materials.ts (materialTierToCraftQuality, getCraftedAffixes, MATERIAL_AFFIX_MAP)
@spacetimedb/src/reducers/items.ts (craft_recipe reducer, addItemToInventory, take_loot)
@spacetimedb/src/helpers/items.ts (getEquippedWeaponStats, getEquippedBonuses)
@spacetimedb/src/schema/tables.ts (ItemInstance, ItemTemplate, ItemAffix table definitions)
@src/composables/useInventory.ts (tooltip stat display)
@src/composables/useCombat.ts (tooltip stat display in combat loot)
@src/App.vue (tooltip stat display)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add craft quality stat bonus helper and apply in craft_recipe reducer</name>
  <files>
    spacetimedb/src/data/crafting_materials.ts
    spacetimedb/src/reducers/items.ts
  </files>
  <action>
1. In `spacetimedb/src/data/crafting_materials.ts`, add a new exported function `getCraftQualityStatBonus(craftQuality: string)` that returns a numeric bonus:
   - 'dented' => 0n (or -1n if we want penalty -- use 0n for simplicity, dented is not achievable via basic crafting anyway)
   - 'standard' => 0n
   - 'reinforced' => 1n
   - 'exquisite' => 2n
   - 'mastercraft' => 3n
   - default => 0n

2. In `spacetimedb/src/reducers/items.ts`, in the `craft_recipe` reducer, after the existing affix insertion block (around line 1010-1024) and before the ItemInstance update (line 1027), add logic to insert craft quality base stat bonus affixes:
   - Import `getCraftQualityStatBonus` from crafting_materials.ts
   - Compute `const statBonus = getCraftQualityStatBonus(craftQuality);`
   - Only proceed if `statBonus > 0n` (standard tier gets no bonus, so nothing changes for tier 1)
   - Check if the output template is armor (armorClassBonus > 0n) or weapon (weaponBaseDamage > 0n):
     - For armor: insert an ItemAffix with `affixKey: 'craft_quality_ac'`, `affixName: 'Quality'`, `affixType: 'prefix'`, `statKey: 'armorClassBonus'`, `magnitude: statBonus`
     - For weapons: insert TWO ItemAffix rows:
       - `affixKey: 'craft_quality_dmg'`, `affixName: 'Quality'`, `affixType: 'prefix'`, `statKey: 'weaponBaseDamage'`, `magnitude: statBonus`
       - `affixKey: 'craft_quality_dps'`, `affixName: 'Quality'`, `affixType: 'prefix'`, `statKey: 'weaponDps'`, `magnitude: statBonus`
   - These are "hidden" quality affixes -- they use `affixType: 'implicit'` (not prefix/suffix) so buildDisplayName does not pick them up. Wait -- buildDisplayName only reads prefix/suffix affixes. Use affixType `'implicit'` to distinguish them from visible affixes.
   - Actually, buildDisplayName iterates craftedAffixes passed to it, not ItemAffix rows. The affixes are inserted separately. So just use affixType 'implicit' to mark these as non-display quality bonuses. The getEquippedBonuses and getEquippedWeaponStats read ALL affix rows regardless of affixType, so the bonus will apply.

IMPORTANT: The `output` variable (ItemTemplate row) is already available at this point in the reducer. Use `output.armorClassBonus > 0n` to detect armor and `output.weaponBaseDamage > 0n` to detect weapons. Some items could be both (unlikely but safe to handle -- apply both).

NOTE: The affixKey naming ('craft_quality_ac', 'craft_quality_dmg', 'craft_quality_dps') makes these distinguishable from material affixes for future display/filtering if needed.
  </action>
  <verify>
    Read the modified files and confirm:
    - getCraftQualityStatBonus exists and returns correct values
    - craft_recipe inserts implicit affix rows for reinforced/exquisite craft quality
    - Standard quality crafting inserts no bonus affixes (statBonus === 0n check)
  </verify>
  <done>
    craft_recipe reducer inserts implicit ItemAffix rows for armorClassBonus and/or weaponBaseDamage/weaponDps when crafting with tier 2+ materials. Standard (tier 1) crafting behavior is unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update getEquippedWeaponStats to include affix bonuses and update client tooltips</name>
  <files>
    spacetimedb/src/helpers/items.ts
    src/composables/useInventory.ts
    src/composables/useCombat.ts
    src/App.vue
  </files>
  <action>
1. In `spacetimedb/src/helpers/items.ts`, modify `getEquippedWeaponStats` to sum weapon affix bonuses on top of template base values. Currently it returns `template.weaponBaseDamage` and `template.weaponDps` directly. Change it to:
   - After finding the mainHand instance and template, iterate `ctx.db.itemAffix.by_instance.filter(instance.id)`
   - Sum any affix with `statKey === 'weaponBaseDamage'` into a `bonusDamage` accumulator
   - Sum any affix with `statKey === 'weaponDps'` into a `bonusDps` accumulator
   - Return `baseDamage: template.weaponBaseDamage + bonusDamage` and `dps: template.weaponDps + bonusDps`
   - This makes weapon craft quality bonuses flow into combat damage automatically via the existing `weapon.baseDamage` and `weapon.dps` usage in combat.ts

2. In `getEquippedBonuses` (same file), add handling for `weaponDps` affix statKey:
   - Add `weaponDps: 0n` to the bonuses object initialization (currently missing -- only weaponBaseDamage is there)
   - Add `else if (key === 'weaponDps') bonuses.weaponDps += affix.magnitude;` in the affix loop
   - This ensures weaponDps affixes are tracked even though getEquippedBonuses isn't the primary weapon stat path

3. On the CLIENT side, update tooltip stat display to show effective values (base + affix bonus) for crafted items. In these three files where stats arrays are built:
   - `src/composables/useInventory.ts` (two locations: inventory tooltip ~line 168 and vendor tooltip ~line 290)
   - `src/composables/useCombat.ts` (two locations: loot tooltip ~line 231 and equipped tooltip ~line 308)
   - `src/App.vue` (tooltip stat display ~line 786)

   For each location, where `template?.armorClassBonus`, `template?.weaponBaseDamage`, `template?.weaponDps` are read:
   - If the item has an `instance` (it's an ItemInstance, not just a template), look up the instance's ItemAffix rows from the `itemAffixes` data (already available in these composables as affix data)
   - Sum any affix magnitudes with matching statKey ('armorClassBonus', 'weaponBaseDamage', 'weaponDps') and add to the template base value for display
   - This way a reinforced crafted sword with template weaponBaseDamage=4 shows "Weapon Damage: 5" (4+1)

   APPROACH: The simplest approach is to compute a small helper inline or at the top of each tooltip builder that sums implicit affix bonuses for these three stat keys, then adds them to the template values in the stats array. The `itemAffixes` table data should already be available via `useTable(tables.itemAffix)` or equivalent in the composable scope.

   Check how affixes are currently accessed in useInventory/useCombat. The affixes for display are likely already loaded. Look for `itemAffix` or `affix` references to find the right data source. If affixes are iterated for display separately (as suffix/prefix labels), the implicit affixes with affixType='implicit' should be EXCLUDED from that display list so they don't show as visible stat lines (they're already reflected in the base stat number).
  </action>
  <verify>
    - Read getEquippedWeaponStats and confirm it sums weaponBaseDamage/weaponDps affixes on top of template values
    - Read client tooltip code to confirm effective values are displayed
    - Run `cd C:/projects/uwr && npm run build` (or `npx tsc --noEmit` if available) to check for TypeScript errors
  </verify>
  <done>
    - getEquippedWeaponStats returns base+affix weapon stats so combat auto-attack damage reflects craft quality bonus
    - armorClassBonus already flows through getEquippedBonuses affix summing (no change needed there, already handles armorClassBonus affix statKey)
    - Client tooltips show effective base stats (template base + craft quality affix bonus) for armor class, weapon damage, and weapon DPS
    - Implicit affixes do not appear as visible affix labels in tooltip
  </done>
</task>

</tasks>

<verification>
After both tasks complete:
1. Publish module: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb`
2. Generate bindings: `spacetime generate --lang typescript --out-dir C:/projects/uwr/src/module_bindings --project-path C:/projects/uwr/spacetimedb`
3. Build client: `cd C:/projects/uwr && npm run build`
4. Verify no TypeScript errors

Functional verification (manual):
- Craft a weapon with tier 1 material (copper_ore) -- weapon stats should match template exactly
- Craft a weapon with tier 2 material (iron_ore) -- weapon damage and DPS should each be +1 over template base
- Craft armor with tier 2 material -- armor class should be +1 over template base
- Craft armor with tier 3 material (darksteel_ore) -- armor class should be +2 over template base
- Equip crafted tier 2+ weapon and enter combat -- auto-attack damage should reflect the bonus
- Equip crafted tier 2+ armor -- character AC in stats panel should reflect the bonus
</verification>

<success_criteria>
- Crafted gear from tier 2+ materials has measurably higher base stats than template defaults
- Standard (tier 1) crafting produces identical stats to current behavior (no regression)
- Weapon stat bonuses flow through to combat damage calculations
- Armor class bonuses flow through to character derived stats
- Client tooltips accurately display effective stat values for crafted gear
- Module publishes without errors
- Client builds without TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/158-craft-recipe-reducer-applies-per-materia/158-SUMMARY.md`
</output>
