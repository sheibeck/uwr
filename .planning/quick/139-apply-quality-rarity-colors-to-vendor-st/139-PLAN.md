---
phase: quick-139
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/VendorPanel.vue
autonomous: true
must_haves:
  truths:
    - "Vendor for-sale items display name in quality/rarity color (common=white, uncommon=green, rare=blue, epic=purple, legendary=orange)"
    - "Backpack items in vendor panel display name in per-instance quality color matching their actual quality tier, not the template base rarity"
  artifacts:
    - path: "src/components/VendorPanel.vue"
      provides: "Quality-colored item names in both vendor and backpack sections"
      contains: "qualityTier"
  key_links:
    - from: "src/components/VendorPanel.vue"
      to: "src/ui/styles.ts"
      via: "rarityStyle function mapping to rarityCommon/rarityUncommon/rarityRare/rarityEpic/rarityLegendary style keys"
      pattern: "rarityStyle"
---

<objective>
Fix backpack items in VendorPanel to use per-instance quality tier colors instead of template base rarity.

Purpose: Backpack items in the vendor/store panel currently use `item.rarity` (template base rarity) for coloring, while InventoryPanel correctly uses `item.qualityTier` (per-instance rolled quality). An uncommon-rolled sword from a common template shows white in the vendor backpack but green in inventory. This inconsistency needs fixing.

Note: Vendor for-sale items already correctly use template rarity since they are template-based (not instances). The vendor-side coloring already works.

Output: VendorPanel.vue with consistent quality coloring on both sections.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/VendorPanel.vue
@src/ui/styles.ts (lines 1289-1303 for rarity color styles)
@src/composables/useInventory.ts (lines 199-224 for qualityTier vs rarity fields)
@src/components/InventoryPanel.vue (reference for correct qualityTier usage)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Use qualityTier for backpack item colors in VendorPanel</name>
  <files>src/components/VendorPanel.vue</files>
  <action>
In VendorPanel.vue, make these changes:

1. Add `qualityTier: string;` to the `inventoryItems` prop type (around line 105-119), alongside the existing `rarity: string;` field. The inventoryItems from useInventory already includes qualityTier in the actual data — VendorPanel's type declaration just needs to accept it.

2. Change the backpack section item name span (line 64) from:
   `<span :style="rarityStyle(item.rarity)">{{ item.name }}</span>`
   to:
   `<span :style="rarityStyle(item.qualityTier)">{{ item.name }}</span>`

Do NOT change the vendor for-sale section (line 18) — vendor items are template-based and `item.rarity` is correct there since VendorInventory rows don't have per-instance quality.

The rarityStyle function (lines 122-132) already handles the mapping correctly with toLowerCase() normalization, so no changes needed there.
  </action>
  <verify>
Run `npx vue-tsc --noEmit 2>&1 | head -20` to confirm no TypeScript errors. Visually inspect that VendorPanel.vue line 64 now uses `item.qualityTier` and the inventoryItems type includes `qualityTier: string`.
  </verify>
  <done>Backpack items in vendor panel show per-instance quality colors (qualityTier) matching InventoryPanel behavior. Vendor for-sale items continue using template rarity. No type errors.</done>
</task>

</tasks>

<verification>
- VendorPanel.vue backpack section uses `rarityStyle(item.qualityTier)` for item name coloring
- VendorPanel.vue vendor section still uses `rarityStyle(item.rarity)` for item name coloring
- inventoryItems prop type includes `qualityTier: string`
- TypeScript compiles without errors
</verification>

<success_criteria>
- Backpack items in vendor panel display names colored by their actual per-instance quality tier
- Vendor for-sale items display names colored by template rarity
- Colors match the existing system: common=white (#ffffff), uncommon=green (#22c55e), rare=blue (#3b82f6), epic=purple (#aa44ff), legendary=orange (#ff8800)
</success_criteria>

<output>
After completion, create `.planning/quick/139-apply-quality-rarity-colors-to-vendor-st/139-SUMMARY.md`
</output>
