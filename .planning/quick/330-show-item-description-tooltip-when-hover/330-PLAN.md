---
phase: quick-330
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/BankPanel.vue
  - src/App.vue
autonomous: true
requirements: [TOOLTIP-01]

must_haves:
  truths:
    - "Hovering over a banked item shows the full item tooltip with description, stats, affix stats, armor type, allowed classes, and craft quality"
    - "Bank item tooltips match the same format and richness as inventory item tooltips"
  artifacts:
    - path: "src/components/BankPanel.vue"
      provides: "Enriched bank slot data using buildItemTooltipData"
    - path: "src/App.vue"
      provides: "Passes itemAffixes and characterLevel to BankPanel"
  key_links:
    - from: "src/components/BankPanel.vue"
      to: "src/composables/useItemTooltip.ts"
      via: "buildItemTooltipData import and call"
      pattern: "buildItemTooltipData"
---

<objective>
Show full item description tooltips when hovering over banked items, matching the tooltip richness of inventory items.

Purpose: Bank items currently emit a minimal `ResolvedSlot` object (only name, qualityTier, templateSlot, quantity) as the tooltip item. The tooltip renderer in App.vue expects rich data (description, stats, affixStats, armorType, allowedClasses, craftQuality) produced by `buildItemTooltipData`. Bank tooltips appear empty/minimal because the data is missing.

Output: BankPanel enriches each resolved slot with full tooltip data via `buildItemTooltipData`, and App.vue passes the additional props (itemAffixes, selected character level) needed for that enrichment.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/BankPanel.vue
@src/components/InventoryPanel.vue
@src/composables/useItemTooltip.ts
@src/composables/useInventory.ts (lines 73-140 for inventoryItems pattern)
@src/App.vue (line 196 for BankPanel usage, lines 458-495 for tooltip template)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Enrich BankPanel resolved slots with full tooltip data</name>
  <files>src/components/BankPanel.vue, src/App.vue</files>
  <action>
**In `src/App.vue`** (line ~196, the BankPanel usage):
- Add `:item-affixes="itemAffixes"` prop to the BankPanel component. The `itemAffixes` ref is already available in App.vue (from `useGameData`).
- No need to pass characterLevel separately; selectedCharacter already has `.level`.

**In `src/components/BankPanel.vue`:**

1. Add import at top of script:
   ```typescript
   import { buildItemTooltipData } from '../composables/useItemTooltip';
   import type { ItemAffix } from '../module_bindings/types';
   ```

2. Add `itemAffixes` to props interface:
   ```typescript
   itemAffixes: ItemAffix[];
   ```

3. Update the `selectedCharacter` prop type to include `level`:
   ```typescript
   selectedCharacter: { id: bigint; level?: bigint } | null;
   ```

4. Expand the `ResolvedSlot` interface to include tooltip fields. Add these optional fields:
   ```typescript
   description: string;
   armorType: string;
   rarity: string;
   stats: { label: string; value: string }[];
   affixStats: { label: string; value: string; affixName: string }[];
   allowedClasses: string;
   craftQuality?: string;
   tier: bigint;
   isNamed: boolean;
   ```

5. In the `resolvedSlots` computed, after finding template and instance, call `buildItemTooltipData` to enrich each slot. Follow the same pattern as `useInventory.ts` lines 86-99:
   ```typescript
   const instanceAffixes = props.itemAffixes.filter(
     (a) => a.itemInstanceId.toString() === instance.id.toString()
   );
   const tooltipData = buildItemTooltipData({
     template,
     instance: {
       id: instance.id,
       qualityTier: instance.qualityTier,
       craftQuality: instance.craftQuality,
       displayName: instance.displayName,
       isNamed: instance.isNamed,
       quantity: instance.quantity,
     },
     affixes: instanceAffixes,
     characterLevel: props.selectedCharacter?.level ?? 1n,
   });
   ```

6. Spread `tooltipData` into each `ResolvedSlot` push, so the emitted slot object now has `description`, `stats`, `affixStats`, `armorType`, `allowedClasses`, `craftQuality`, `tier`, `isNamed`, `rarity`, `qualityTier` (from tooltipData).

   The result.push should look like:
   ```typescript
   result.push({
     bankSlotId: bs.id,
     slotIndex: i,
     itemInstanceId: bs.itemInstanceId,
     name: tooltipData.name,
     templateSlot: template.slot,
     qualityTier: tooltipData.qualityTier,
     stackable: template.stackable,
     quantity: instance.quantity,
     ...tooltipData,
   });
   ```

7. Update the `ItemInstanceRow` interface to include `craftQuality` and `displayName` and `isNamed` fields if not already present (they are already present -- verify at lines 57-59).

Do NOT change the mouseenter/mousemove/mouseleave event handlers in the template -- they already correctly emit the slot as the tooltip item. The fix is entirely about enriching the slot data.
  </action>
  <verify>
    Run `npx vue-tsc --noEmit` or check that the app builds without type errors.
    Open the app, deposit an item to the bank, hover over it -- the tooltip should now show the full description, stats, affix stats, armor type, and other details identical to hovering over the same item in the inventory backpack.
  </verify>
  <done>
    Hovering over any banked item displays the same rich tooltip (description, stats, affixes, armor type, allowed classes, craft quality) as hovering over the same item in the inventory panel.
  </done>
</task>

</tasks>

<verification>
- Hover over a banked gear item (e.g., a sword) -- tooltip shows name, description, damage stats, affix bonuses, armor type, allowed classes
- Hover over a banked consumable/food item -- tooltip shows name, description
- Hover over a banked item with affixes -- tooltip shows affix stat lines in green
- Hover over a banked named item -- tooltip shows the named item's display name
- Compare side by side: same item in inventory vs in bank should produce identical tooltip content
</verification>

<success_criteria>
Bank item tooltips display the same rich information as inventory item tooltips, including description, base stats, affix stats, armor type, allowed classes, and craft quality.
</success_criteria>

<output>
After completion, create `.planning/quick/330-show-item-description-tooltip-when-hover/330-SUMMARY.md`
</output>
