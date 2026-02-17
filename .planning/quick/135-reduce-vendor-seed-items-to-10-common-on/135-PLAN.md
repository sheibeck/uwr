---
phase: quick-135
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/seeding/ensure_enemies.ts
  - spacetimedb/src/reducers/items.ts
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "Vendors seed with at most 10 items, all common-quality only"
    - "When a player sells an item to a vendor, that item appears in the vendor's inventory for other players to buy"
    - "Sold items are priced at a reasonable markup from what the vendor paid"
  artifacts:
    - path: "spacetimedb/src/seeding/ensure_enemies.ts"
      provides: "Capped vendor seed at 10 items, common-only filter"
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "sell_item reducer adds sold item to vendor inventory"
    - path: "src/App.vue"
      provides: "Client passes npcId to sell_item reducer"
  key_links:
    - from: "src/App.vue"
      to: "sell_item reducer"
      via: "sellReducer call with npcId"
      pattern: "sellReducer.*npcId"
    - from: "spacetimedb/src/reducers/items.ts"
      to: "ctx.db.vendorInventory"
      via: "insert in sell_item"
      pattern: "vendorInventory\\.insert"
---

<objective>
Reduce vendor seed inventories to 10 common-only items and make player-sold items appear in vendor shops for other players to buy.

Purpose: Vendor inventories should start small and grow organically as players sell items. This creates a player-driven economy where selling drives what others can buy.
Output: Modified vendor seeding (10 common-only cap), sell_item reducer adds items to vendor inventory, client passes vendor npcId on sell.
</objective>

<context>
@.planning/STATE.md
@spacetimedb/src/seeding/ensure_enemies.ts (ensureVendorInventory function, lines 96-190)
@spacetimedb/src/reducers/items.ts (sell_item reducer, lines 165-196; buy_item reducer, lines 130-163)
@spacetimedb/src/schema/tables.ts (VendorInventory table, lines 748-760)
@src/App.vue (sellItem function, lines 1317-1323; activeVendorId ref)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Cap vendor seed to 10 common-only items and add sold items to vendor inventory</name>
  <files>
    spacetimedb/src/seeding/ensure_enemies.ts
    spacetimedb/src/reducers/items.ts
  </files>
  <action>
**In `spacetimedb/src/seeding/ensure_enemies.ts` - `ensureVendorInventory` function:**

1. Add a `rarity === 'common'` filter to `allEligible` (line 123-125). The filter currently checks `!row.isJunk && row.slot !== 'resource' && row.tier <= BigInt(vendorTier) && !STARTER_ITEM_NAMES.has(row.name)`. Add `&& row.rarity === 'common'` to exclude uncommon/rare/epic/legendary items from seeding.

2. Reduce the category pick counts to fit within a total of 10:
   - Change `pickN(armor, 4, vendor.id)` to `pickN(armor, 3, vendor.id)`
   - Change `pickN(weapons, 3, vendor.id)` to `pickN(weapons, 3, vendor.id)` (keep at 3)
   - Change `pickN(accessories, 2, vendor.id)` to `pickN(accessories, 2, vendor.id)` (keep at 2)
   - Change `const selectedConsumables = consumables;` to `const selectedConsumables = pickN(consumables, 2, vendor.id + 11n);` (cap consumables at 2)
   This gives 3+3+2+2 = 10 max seeded items.

3. IMPORTANT: In the "Remove stale vendor items" loop (lines 182-188), change the logic so it does NOT remove items that were NOT in the seed selection. Currently it deletes any vendorInventory row whose itemTemplateId is not in `selectedItemIds`. This would remove player-sold items on every sync. Instead, only remove items whose itemTemplateId is in a set of "stale seed items" - items that WERE previously seeded but are no longer selected. The simplest approach: skip the stale removal entirely (delete the loop at lines 182-188). Player-sold items accumulate, seed items get upserted idempotently. The seed function only adds/updates, never removes.

**In `spacetimedb/src/reducers/items.ts` - `sell_item` reducer:**

1. Add `npcId: t.u64()` parameter to the sell_item reducer signature (line 167). The reducer currently takes `{ characterId: t.u64(), itemInstanceId: t.u64() }`. Change to `{ characterId: t.u64(), itemInstanceId: t.u64(), npcId: t.u64() }`.

2. After the character gets gold (line 187) and before the appendPrivateEvent (line 188), add logic to insert the sold item into the vendor's inventory:
   - Verify the npc exists and is a vendor: `const npc = ctx.db.npc.id.find(args.npcId); if (npc && npc.npcType === 'vendor') { ... }`
   - Check if the vendor already sells this template: `const existingVendorItem = [...ctx.db.vendorInventory.by_vendor.filter(args.npcId)].find(row => row.itemTemplateId === instance.templateId);`
   - If NOT already in vendor inventory, insert a new VendorInventory row: `ctx.db.vendorInventory.insert({ id: 0n, npcId: args.npcId, itemTemplateId: instance.templateId, price: value > 0n ? value * 2n : template.vendorValue > 0n ? template.vendorValue * 6n : 10n })` -- price is 2x what the vendor paid (the `value` variable, which is vendorValue * quantity). For single items, this means vendorValue * 2. Use `template.vendorValue * 6n` as fallback (matching seed pricing) if value is 0.
   - If already in vendor inventory, do nothing (no duplicate listings).
   - Note: Read `instance.templateId` BEFORE the `ctx.db.itemInstance.id.delete(instance.id)` call on line 183. The current code deletes the instance on line 183 and then reads template info. We need to capture `instance.templateId` before deletion. Actually, looking more carefully, `instance` is already read on line 170 and `template` on line 176, both before the delete. So we can safely use them after the delete. Just add the vendor inventory insert after line 187 (gold update) and before line 188 (event).

IMPORTANT: The `value` variable (line 178) is `vendorValue * quantity`. For the vendor resale price, use `template.vendorValue * 2n` (not `value * 2n`) so quantity doesn't inflate the per-unit resale price.
  </action>
  <verify>
Run `cd C:/projects/uwr && npx tsc --noEmit --project spacetimedb/tsconfig.json` to verify no type errors. Check that ensureVendorInventory filters by rarity=common, caps at 10 total items, and does not remove non-seed items. Check that sell_item accepts npcId and inserts into vendorInventory.
  </verify>
  <done>
Vendor seed limited to 10 common-only items (3 armor + 3 weapons + 2 accessories + 2 consumables). sell_item reducer adds sold item template to vendor's VendorInventory at 2x vendorValue markup. Stale removal loop removed so player-sold items persist.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update client to pass npcId when selling items</name>
  <files>
    src/App.vue
  </files>
  <action>
**In `src/App.vue`:**

1. Update the `sellItem` function (lines 1317-1323) to accept and pass `npcId`. Currently:
```typescript
const sellItem = (itemInstanceId: bigint) => {
  if (!conn.isActive || !selectedCharacter.value) return;
  sellReducer({
    characterId: selectedCharacter.value.id,
    itemInstanceId,
  });
};
```
Change to include the `activeVendorId`:
```typescript
const sellItem = (itemInstanceId: bigint) => {
  if (!conn.isActive || !selectedCharacter.value || !activeVendorId.value) return;
  sellReducer({
    characterId: selectedCharacter.value.id,
    itemInstanceId,
    npcId: activeVendorId.value,
  });
};
```

2. After modifying the backend, regenerate client bindings:
```bash
spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb
```

3. Publish the module:
```bash
spacetime publish --clear-database -y --project-path spacetimedb uwr
```
Note: --clear-database is needed because the sell_item reducer signature changed (new parameter).

4. Re-generate bindings again after publish to ensure they match the deployed module:
```bash
spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb
```
  </action>
  <verify>
Run `cd C:/projects/uwr && npx vue-tsc --noEmit` (or equivalent client type check) to verify no type errors. Verify `sellReducer` call includes `npcId` parameter. Check `spacetime logs uwr` for any errors after publish.
  </verify>
  <done>
Client passes activeVendorId as npcId to sell_item reducer. Module published with clear-database. Bindings regenerated. When a player sells an item at a vendor, the item template appears in that vendor's shop listing at 2x vendorValue for other players to purchase.
  </done>
</task>

</tasks>

<verification>
1. Vendor seed inventory has at most 10 items per vendor, all common rarity
2. sell_item reducer accepts npcId and inserts sold item into VendorInventory
3. Player-sold items persist in vendor inventory across sync_equipment_tables calls
4. No type errors in backend or client
5. Module publishes and runs without errors
</verification>

<success_criteria>
- ensureVendorInventory filters rarity === 'common' and caps total at 10 items
- sell_item reducer creates VendorInventory row with price = template.vendorValue * 2n
- Client passes npcId when selling
- Module published, no server errors in spacetime logs
</success_criteria>

<output>
After completion, create `.planning/quick/135-reduce-vendor-seed-items-to-10-common-on/135-SUMMARY.md`
</output>
