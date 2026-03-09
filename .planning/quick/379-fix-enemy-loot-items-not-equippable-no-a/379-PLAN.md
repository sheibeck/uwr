---
phase: quick-379
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
  - src/composables/useInventory.ts
autonomous: true
requirements: [fix-enemy-loot-no-actions]
must_haves:
  truths:
    - "Clicking a gear item in backpack narrative always shows at least Equip and Salvage options"
    - "Gear items dropped by enemies with matching armor proficiency show Equip action"
    - "Gear items without matching proficiency still show Salvage option"
  artifacts:
    - path: "src/App.vue"
      provides: "Expanded backpack click handler with gear actions"
  key_links:
    - from: "src/App.vue"
      to: "src/composables/useInventory.ts"
      via: "inventoryItems computed property"
      pattern: "clickedBackpack"
---

<objective>
Fix "no actions available" for enemy-dropped gear items clicked in backpack narrative output.

Purpose: The backpack click handler (section 7 in onNarrativeSubmit keyword handler) only checks equipable, banker, and usable/eatable. Gear items that fail the equipable check (e.g., wrong armor proficiency) AND have no banker nearby show "no actions available" even though Salvage, Sell, etc. should be available. Additionally, investigate whether armor proficiency checks on the client correctly handle the full range of dynamically-generated class proficiencies.

Output: Gear items always show relevant actions (Equip if allowed, Salvage always for gear, Sell if vendor present).
</objective>

<context>
@src/App.vue (lines ~1596-1618: backpack click handler; lines ~1549-1555: equip keyword handler)
@src/composables/useInventory.ts (equipable logic at lines ~101-132, EQUIPMENT_SLOTS, InventoryItem type)
@src/components/InventoryPanel.vue (reference for complete action set: equip, salvage, delete)
@spacetimedb/src/reducers/intent.ts (backpack display at lines ~321-375)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Expand backpack click handler with gear actions (Salvage, Sell)</name>
  <files>src/App.vue</files>
  <action>
In the backpack item click handler (section 7, around line 1596-1618 in onNarrativeSubmit), expand the options list:

1. After the existing `equipable` check, add a Salvage option for gear items:
   ```
   const GEAR_SLOTS = new Set(['head','chest','wrists','hands','belt','legs','boots','earrings','neck','cloak','mainHand','offHand']);
   if (GEAR_SLOTS.has(clickedBackpack.slot) && !clickedBackpack.isJunk) {
     options.push(`[Salvage ${clickedBackpack.name}]`);
   }
   ```

2. Add a Sell option when a vendor NPC is at the current location (mirrors banker check pattern):
   ```
   const hasVendor = npcsHere.value?.some((npc: any) => npc.npcType === 'vendor');
   if (hasVendor) {
     options.push(`[Sell ${clickedBackpack.name}]`);
   }
   ```

3. Add "Salvage" keyword handler in the keyword processing section (near section 5, around line 1537). When `kwLower.startsWith('salvage ')`:
   - Find item by name in inventoryItems
   - Call `salvageItem(item.instanceId)`
   - Show message "You salvage {name}."

4. Add "Sell" keyword handler: When `kwLower.startsWith('sell ')` AND the text came from a backpack click (not already handled by the existing sell handler further down):
   - The existing sell handler at ~line 835 already handles `sell <item>` from typed commands
   - But the keyword handler section processes BEFORE the intent submit. Check if `kwLower.startsWith('sell ')` is already handled in the keyword section.
   - If not, no additional handler needed since the text "Sell ItemName" will fall through to the normal command processing which includes `sell`.

NOTE: The existing sell command at intent.ts line 835 uses the full typed command path. The keyword click path should work because after keyword processing falls through, the text is submitted as an intent. Verify this path works.

The key fix is items 1-2: adding Salvage and Sell options to the click menu so gear items ALWAYS have available actions even when not equippable.
  </action>
  <verify>
    Build succeeds: cd C:/projects/uwr && npm run build 2>&1 | tail -5
    Manual: Type "backpack", click a gear item name, verify Equip/Salvage/Sell options appear (Sell only if vendor present)
  </verify>
  <done>Gear items clicked in backpack narrative always show at least one action (Salvage for gear, Sell if vendor, Equip if proficiency matches). No more "no actions available" for lootable gear.</done>
</task>

<task type="auto">
  <name>Task 2: Add proficiency hint when item is not equippable</name>
  <files>src/App.vue</files>
  <action>
When a gear item is NOT equipable due to proficiency mismatch, show a hint so the user understands WHY they can't equip it.

In the backpack click handler (section 7), after building the options list, if the item is in a GEAR_SLOT but `equipable` is false, add an informational line:

```typescript
if (GEAR_SLOTS.has(clickedBackpack.slot) && !clickedBackpack.equipable && !clickedBackpack.isJunk) {
  // Show proficiency hint
  const armorType = clickedBackpack.armorType;
  if (armorType && armorType !== 'none') {
    options.unshift(`(Requires ${armorType} proficiency)`);
  }
}
```

This displays BEFORE the action options, e.g.:
```
Scorchfang's Leggings: (Requires leather proficiency)  [Salvage Scorchfang's Leggings]
```

Also add the `slot` property to the InventoryItem type's inclusion in the options check. The slot is already available from buildItemTooltipData (it returns `slot`), which is spread into the InventoryItem via `...tooltipData`. Verify this is the case by checking that `clickedBackpack.slot` is accessible.

The `armorType` field is also already available from buildItemTooltipData (line 191 of useItemTooltip.ts: `armorType: template?.armorType ?? 'none'`).
  </action>
  <verify>
    Build succeeds: cd C:/projects/uwr && npm run build 2>&1 | tail -5
  </verify>
  <done>Non-equippable gear items show a proficiency requirement hint alongside available actions (Salvage, Sell, Bank).</done>
</task>

</tasks>

<verification>
- Build passes without errors
- Backpack click on any gear item shows action options (never "no actions available" for gear)
- Equippable items show [Equip], [Salvage], and optionally [Sell]/[Bank]
- Non-equippable items show proficiency hint + [Salvage] and optionally [Sell]/[Bank]
- Clicking [Salvage ItemName] triggers salvage reducer
- Clicking [Equip ItemName] still works as before
</verification>

<success_criteria>
Enemy-dropped gear items always show actionable options when clicked in backpack narrative. Proficiency restrictions are communicated clearly. No regression in existing equip/bank/use functionality.
</success_criteria>

<output>
After completion, create `.planning/quick/379-fix-enemy-loot-items-not-equippable-no-a/379-SUMMARY.md`
</output>
