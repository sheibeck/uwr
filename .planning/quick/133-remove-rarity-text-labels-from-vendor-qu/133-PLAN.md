---
phase: quick-133
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/VendorPanel.vue
  - src/components/InventoryPanel.vue
autonomous: true

must_haves:
  truths:
    - "Item names in vendor/quartermaster window show no parenthetical rarity text"
    - "Item names in backpack (sell panel) show no parenthetical rarity text"
    - "Context menu subtitle for inventory items shows no rarity/quality prefix"
    - "Item name color in all locations still reflects quality tier"
  artifacts:
    - path: "src/components/VendorPanel.vue"
      provides: "Vendor and backpack item list without rarity text labels"
    - path: "src/components/InventoryPanel.vue"
      provides: "Inventory context menu subtitle without rarity prefix"
  key_links:
    - from: "VendorPanel.vue line 19"
      to: "removed"
      via: "delete ({{ item.rarity }}) text node"
      pattern: "\\(\\{\\{ item\\.rarity \\}\\}\\)"
    - from: "VendorPanel.vue line 66"
      to: "removed"
      via: "delete ({{ item.rarity }}) text node"
      pattern: "\\(\\{\\{ item\\.rarity \\}\\}\\)"
    - from: "InventoryPanel.vue line 258"
      to: "slot only"
      via: "remove qualityTier prefix from subtitle"
      pattern: "qualityTier.*slot"
---

<objective>
Remove all parenthetical rarity/quality text labels from the UI wherever item names are displayed. Quality is already communicated visually through name color — the text "(common)", "(uncommon)", etc. is redundant clutter.

Purpose: Cleaner item name display without duplicating information already conveyed by color.
Output: VendorPanel and InventoryPanel updated with rarity text removed.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove rarity text from VendorPanel item lists</name>
  <files>src/components/VendorPanel.vue</files>
  <action>
    In VendorPanel.vue, remove the two occurrences of the raw rarity text label. Both appear on lines 19 and 66 as a standalone text node immediately after the colored name span:

    Line 19: delete the line `({{ item.rarity }})` (inside the vendor inventory list item div)
    Line 66: delete the line `({{ item.rarity }})` (inside the backpack/sell list item div)

    The colored `<span :style="rarityStyle(item.rarity)">{{ item.name }}</span>` immediately above each deleted line must remain untouched — it provides the color. Only the plain text label is removed.

    No changes to the `rarityStyle` function or any other logic.
  </action>
  <verify>
    Search for `item.rarity }}` in VendorPanel.vue — should return zero results after the edit.
    The `rarityStyle` function references and the span using it must still be present.
  </verify>
  <done>
    Vendor inventory and backpack sell lists show item names with quality color only — no "(common)", "(uncommon)" etc. suffix text.
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove rarity prefix from InventoryPanel context menu subtitle</name>
  <files>src/components/InventoryPanel.vue</files>
  <action>
    In InventoryPanel.vue, find the context menu construction around line 258:

    ```
    subtitle: `${item.qualityTier} ${item.slot}`,
    ```

    Change it to:

    ```
    subtitle: item.slot,
    ```

    This removes the quality tier prefix from the context menu subtitle. The slot type alone is sufficient as the subtitle (e.g. "weapon" instead of "uncommon weapon").

    No other changes — the `rarityStyle`, `qualityBorderStyle` functions and all colored displays in the template remain untouched.
  </action>
  <verify>
    Search for `qualityTier` in InventoryPanel.vue — should still appear in the template (for color/border styling) but NOT in the context menu subtitle construction.
  </verify>
  <done>
    Right-clicking an inventory item shows a context menu with subtitle showing only the slot type (e.g. "weapon"), not a rarity prefix.
  </done>
</task>

</tasks>

<verification>
- `grep "item.rarity }}" src/components/VendorPanel.vue` returns no output
- `grep "qualityTier.*slot" src/components/InventoryPanel.vue` returns no output
- VendorPanel still has `rarityStyle` function and colored name spans intact
- InventoryPanel still has `rarityStyle` and `qualityBorderStyle` functions intact (color/border still work)
</verification>

<success_criteria>
- Vendor/quartermaster window: item names display with quality color, no parenthetical text
- Backpack (sell side of vendor): item names display with quality color, no parenthetical text
- Inventory context menu: subtitle shows slot only, no quality prefix
- Inventory grid item tiles: unchanged (were already color-only, no text label)
- Equipped slots: unchanged (were already color-only, no text label)
</success_criteria>

<output>
After completion, create `.planning/quick/133-remove-rarity-text-labels-from-vendor-qu/133-SUMMARY.md`
</output>
