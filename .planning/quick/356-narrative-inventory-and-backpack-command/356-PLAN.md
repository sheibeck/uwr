---
phase: quick-356
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/intent.ts
  - src/App.vue
autonomous: true
---

<objective>
Add narrative `inventory` and `backpack` commands that render rich text with clickable [bracket links] in the narrative console, following the same pattern as `look`.

- `inventory` / `inv` / `i` — Shows equipped items across all slots with stats and rarity-colored [names]. Clicking an equipped item name triggers unequip confirmation.
- `backpack` / `bp` / `bag` — Shows unequipped items with descriptions. Clicking a backpack item name presents context-aware options (equip, bank, use, hotbar).

Purpose: Replace the current stub "You rummage through your pack." with a full narrative inventory experience using the existing bracket-link click system.
Output: Server-side narrative rendering in intent.ts + client-side click routing in App.vue
</objective>

<context>
@spacetimedb/src/reducers/intent.ts (command handler — add inventory/backpack alongside look/bind)
@spacetimedb/src/schema/tables.ts (ItemTemplate, ItemInstance, ItemAffix, Location, Npc schemas)
@src/App.vue (clickNpcKeyword handler — add inventory click routing)
@src/composables/useInventory.ts (existing equip/unequip/useItem logic to call from click handler)
@src/ui/colors.ts (RARITY_COLORS: common=#ffffff, uncommon=#22c55e, rare=#3b82f6, epic=#aa44ff, legendary=#ff8800)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Server-side inventory and backpack narrative commands</name>
  <files>spacetimedb/src/reducers/intent.ts</files>
  <action>
Replace the stub `inventory` handler (lines ~229-233) and add a new `backpack` handler in the intent reducer.

**INVENTORY command** (`inventory`, `inv`, `i`):
Build a narrative string showing all 12 equipment slots with their contents. For each slot:
- Look up `item_instance` rows for this character where `equippedSlot` matches
- Look up corresponding `item_template` for stats
- Format: `SlotName: {{color:RARITY_HEX}}[ItemDisplayName]{{/color}} — Stats`
- Empty slots: `SlotName: (empty)`
- Stats to show: any non-zero stat bonuses (STR +X, DEX +X, etc.), weaponBaseDamage if weapon, armorClassBonus if armor
- Use rarity colors: common=#ffffff, uncommon=#22c55e, rare=#3b82f6, epic=#aa44ff, legendary=#ff8800
- Use `instance.displayName || template.name` for the item name
- Header: "Equipment:" followed by slot lines
- Footer: gold amount

Equipment slot display order and labels:
```
Head, Chest, Wrists, Hands, Belt, Legs, Boots, Earrings, Neck, Cloak, Main Hand, Off Hand
```

Map camelCase slot keys to display labels: mainHand -> "Main Hand", offHand -> "Off Hand", etc.

**BACKPACK command** (`backpack`, `bp`, `bag`):
Build a narrative string showing unequipped items. For each item:
- Filter `item_instance` by `ownerCharacterId` where `equippedSlot` is falsy (null/undefined/empty string)
- Look up `item_template` for each
- Format: `{{color:RARITY_HEX}}[ItemDisplayName]{{/color}} — SlotType — Stats`
- If quantity > 1: append ` x{quantity}`
- If template.description exists, append it on a new line indented
- Show item count: "Backpack ({count}/{MAX_SLOTS}):" as header (MAX_SLOTS = 50)
- Sort by rarity (legendary first) then name alphabetically

For both commands: use `appendPrivateEvent` with kind `'look'` (reuses the same styling as location look — neutral info display).
  </action>
  <verify>
Publish to local SpacetimeDB: `spacetime publish uwr -p spacetimedb`
Check server logs for no errors: `spacetime logs uwr --num-lines 20`
  </verify>
  <done>
Typing `inventory` shows all 12 equipment slots with rarity-colored clickable item names and stat summaries. Typing `backpack` shows unequipped items with rarity colors, stats, and descriptions. Both display in the narrative console.
  </done>
</task>

<task type="auto">
  <name>Task 2: Client-side click routing for inventory/backpack bracket links</name>
  <files>src/App.vue</files>
  <action>
In the `clickNpcKeyword` handler in App.vue, add routing for inventory/backpack item clicks. The bracket links from Task 1 will produce clicks with item names as keywords.

Add these handlers BEFORE the "Everything else" fallback (line ~1522), after the loot keyword block:

**Unequip flow** (clicking an equipped item name from `inventory` output):
When a keyword matches an equipped item's display name:
1. Find the item in `equippedSlots` (from useInventory) by matching name (case-insensitive)
2. If found, show an unequip confirmation prompt via `addLocalEvent`:
   `Unequip [ItemName]? Click [Unequip ItemName] to confirm.`
3. Add a second check: if keyword starts with "Unequip " — extract the item name, find the slot, and call `unequipItem(slot)`.

**Backpack item flow** (clicking an unequipped item name from `backpack` output):
When a keyword matches a backpack item's display name:
1. Find the item in `inventoryItems` (from useInventory) by matching name (case-insensitive)
2. Build context-aware options as a narrative event with clickable bracket links:
   - Always show: `[Equip ItemName]` if item.equipable is true
   - Show `[Bank ItemName]` only if a banker NPC is at the current location (check npcsHere for npcType === 'banker')
   - Show `[Use ItemName]` if item.usable or item.eatable
   - Show `[Hotbar ItemName]` if item.usable or item.eatable
3. Display via `addLocalEvent('system', optionsText)`

**Action keywords** (from the options above):
- "Equip {name}" — find item in inventoryItems by name, call `equipItem(item.instanceId)`
- "Bank {name}" — find item, call `depositToBank(item.id)` (already wired)
- "Use {name}" — find item, call `useItem(item.instanceId)` for usable, or call `eatFood(item.id)` for eatable
- "Hotbar {name}" — find item, call `onAddItemToHotbar(item.templateId, item.name)`
- "Unequip {name}" — find equipped slot by name, call `unequipItem(slot)`

To access useInventory data, use the existing destructured values already available in App.vue scope: `equippedSlots`, `inventoryItems`, `equipItem`, `unequipItem`, `useItem`.

For the banker NPC check, use the existing `npcsHere` ref and check `npc.npcType === 'banker'`.

Important: Match item names case-insensitively. Items may have display names with mixed casing.
  </action>
  <verify>
Run the dev server: `cd C:/projects/uwr && npm run dev` (verify no build errors).
  </verify>
  <done>
Clicking an equipped item name from `inventory` output prompts to unequip with a clickable confirmation link. Clicking a backpack item name from `backpack` output shows context-aware action options (Equip/Bank/Use/Hotbar) as clickable bracket links. Clicking those action links executes the corresponding reducer.
  </done>
</task>

</tasks>

<verification>
1. Type `inventory` — see all 12 equipment slots with rarity-colored clickable names
2. Click an equipped item name — see unequip confirmation prompt
3. Click `[Unequip ItemName]` — item moves to backpack
4. Type `backpack` — see unequipped items with colors and stats
5. Click a backpack item name — see context-aware options
6. Click `[Equip ItemName]` — item equips to appropriate slot
</verification>

<success_criteria>
- `inventory`/`inv`/`i` renders equipped gear with rarity colors and stats in narrative
- `backpack`/`bp`/`bag` renders unequipped items with rarity colors and stats in narrative
- All item names are clickable [bracket links] that route through the unified command system
- Clicking equipped items offers unequip; clicking backpack items offers equip/bank/use/hotbar based on context
- No new server tables or reducers needed — purely uses existing equip/unequip/useItem reducers
</success_criteria>
