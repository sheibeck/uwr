---
phase: quick-141
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/items.ts
autonomous: true
must_haves:
  truths:
    - "Selling any quality item (common, uncommon, rare, epic, legendary) to a vendor creates a VendorInventory entry if the template is not already listed"
    - "Selling an item whose template IS already listed on the vendor still succeeds (gold granted, item removed) even though no duplicate entry is created"
    - "Vendor seeding remains common-only (no change to ensureVendorInventory)"
  artifacts:
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "sell_item reducer with no rarity gate on VendorInventory insert"
  key_links:
    - from: "spacetimedb/src/reducers/items.ts"
      to: "vendor_inventory table"
      via: "ctx.db.vendorInventory.insert in sell_item"
      pattern: "vendorInventory\\.insert"
---

<objective>
Fix sell_item reducer so that selling a non-common quality item (uncommon, rare, epic, legendary) to a vendor correctly adds that item to the vendor's VendorInventory for other players to buy.

Purpose: Player-sold items of any quality should appear on vendor inventory at 2x vendorValue markup. The vendor seeding correctly stays common-only, but the sell path should accept any quality.
Output: Updated sell_item reducer in items.ts, republished module.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/reducers/items.ts (sell_item reducer, lines 165-216)
@spacetimedb/src/seeding/ensure_enemies.ts (ensureVendorInventory, lines 98-189)
@src/App.vue (vendorItems computed, lines 726-784)
@src/components/VendorPanel.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Investigate and fix sell_item VendorInventory insert path</name>
  <files>spacetimedb/src/reducers/items.ts</files>
  <action>
Investigation findings: The sell_item reducer (lines 191-206) has NO explicit rarity filter on the VendorInventory insert path. However, there is a potential issue:

1. The `alreadyListed` check at line 194 prevents adding a VendorInventory entry when the vendor already stocks the same `itemTemplateId`. Since vendors seed ~10 common templates from the same world-drop pool, a player selling a non-common quality version of an already-seeded template won't create a new entry. This is actually correct behavior (the item IS on the vendor, just at the seeded price).

2. For items whose template is NOT already on the vendor, the insert should work fine. If it doesn't, check:
   - Whether `npc.npcType === 'vendor'` check fails (inspect NPC types in ensure_world.ts)
   - Whether the `ctx.db.npc.id.find(args.npcId)` returns undefined (npcId mismatch)

The fix approach: Read the sell_item reducer in items.ts and trace the VendorInventory insert path. Check spacetime logs for any errors during sell. The issue is most likely that:
- The `alreadyListed` check at line 194 prevents duplicate entries. For items whose templates are already on the vendor, this is expected. For items whose templates are NOT on the vendor, the insert should work.
- If items still don't appear, check whether `vendorInventory.insert` is actually being reached by adding a log event or checking server logs.

Actions to take:
1. Read the sell_item reducer in items.ts (lines 165-216)
2. Check if the `alreadyListed` logic has any subtle issues (e.g., BigInt comparison, type mismatch on `soldTemplateId`)
3. Verify the insert path runs by checking server logs after a test sell
4. If the code looks correct, publish the module and test with `/createitem rare` then sell to vendor
5. If the item does appear after a fresh publish, the issue may have been a stale module. If it still doesn't appear, look deeper at the NPC type check or the VendorInventory subscription

Key file locations:
- sell_item reducer: spacetimedb/src/reducers/items.ts lines 165-216
- VendorInventory insert: lines 191-206 specifically
- ensureVendorInventory seeding: spacetimedb/src/seeding/ensure_enemies.ts lines 98-189
- Client vendorItems computed: src/App.vue lines 726-784

If the code is already correct and the bug was caused by stale state, simply republish the module with `spacetime publish uwr --clear-database -y --project-path spacetimedb` and verify. If a code change IS needed, the most likely fix is to the `alreadyListed` duplicate check or to ensure the NPC type check passes.

NOTE: The user suspects "a rarity filter somewhere in the sell_item VendorInventory insert path that incorrectly gates on rarity='common'." After thorough investigation, no such filter exists in the current code. The sell_item reducer at lines 191-206 has no rarity check. The only rarity filter is in ensureVendorInventory (seeding), which is correct per requirements. If the bug persists after a fresh publish, investigate whether the client subscription or reactivity is the issue.
  </action>
  <verify>
1. `spacetime publish uwr --project-path spacetimedb` succeeds without errors
2. In-game: Use `/createitem rare` to get a rare quality item
3. Open a vendor and sell the rare item
4. The item template appears in the vendor's inventory list
5. Check `spacetime logs uwr` for any errors during the sell
  </verify>
  <done>
Selling a non-common quality item to a vendor correctly adds that item's template to the vendor's VendorInventory at 2x vendorValue price. The item appears in the vendor's inventory list for purchase.
  </done>
</task>

</tasks>

<verification>
- Module publishes cleanly
- Selling a common item to vendor: item appears on vendor inventory (or is already listed from seeding)
- Selling an uncommon/rare/epic/legendary item to vendor: item template appears on vendor inventory at 2x vendorValue
- Vendor seeding still produces only common-rarity items (no change to ensureVendorInventory)
- No regressions: buying items from vendor still works, sell-all-junk still works
</verification>

<success_criteria>
Player can sell any quality item to a vendor and see that item's template listed on the vendor's inventory for other players to buy. The vendor's seeded inventory remains common-only.
</success_criteria>

<output>
After completion, create `.planning/quick/141-fix-sell-item-to-list-non-common-player-/141-SUMMARY.md`
</output>
