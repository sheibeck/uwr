---
phase: quick-360
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/intent.ts
  - src/App.vue
autonomous: true
requirements: [NARR-STATS, NARR-BANK, NARR-VENDOR, NARR-CRAFT, NARR-GATHER, NARR-LOOT]
must_haves:
  truths:
    - "Player can type 'stats' and see full character stats inline in narrative"
    - "Player can type 'bank' and see bank contents inline with clickable withdraw links"
    - "Player can type 'shop' or click a vendor NPC and see vendor inventory inline with clickable buy links"
    - "Player can type 'craft' and see discovered recipes inline with clickable craft links"
    - "Player can click resource names in look output to start gathering"
    - "Player can type 'loot' to see corpse loot at their location"
    - "Player can type 'deposit [item]' to deposit a backpack item to bank"
    - "Player can type 'sell [item]' near a vendor to sell an item"
  artifacts:
    - path: "spacetimedb/src/reducers/intent.ts"
      provides: "All narrative command handlers (stats, bank, shop, craft, loot, deposit, sell, gather)"
    - path: "src/App.vue"
      provides: "Client-side keyword routing for withdraw, buy, craft, gather clicks"
  key_links:
    - from: "spacetimedb/src/reducers/intent.ts"
      to: "appendPrivateEvent"
      via: "Narrative output with clickable bracket links"
      pattern: "appendPrivateEvent.*color.*\\["
    - from: "src/App.vue clickNpcKeyword"
      to: "reducers (withdrawFromBank, buyItem, startGatherResource, craftRecipe)"
      via: "Keyword matching in window.clickNpcKeyword handler"
      pattern: "kwLower.*startsWith.*withdraw|buy|craft|gather"
---

<objective>
Convert remaining game systems (stats, bank, vendor, crafting, resource gathering, loot) to inline narrative UI by adding server-side intent commands that render rich clickable output, and client-side keyword routing that wires clicks to the appropriate reducers.

Purpose: Eliminate floating panels for bank/vendor/crafting — everything happens in the narrative console via typed commands and clickable links.
Output: Full inline narrative experience for all game systems.
</objective>

<context>
@spacetimedb/src/reducers/intent.ts (main intent handler — add new command cases)
@src/App.vue (clickNpcKeyword handler — add keyword routing)
@spacetimedb/src/reducers/bank.ts (existing deposit_to_bank, withdraw_from_bank reducers)
@spacetimedb/src/reducers/items.ts (existing buy_item, sell_item reducers)
@spacetimedb/src/reducers/items_crafting.ts (existing craft_recipe, research_recipes reducers)
@spacetimedb/src/reducers/items_gathering.ts (existing start_gather_resource reducer)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add narrative commands to server-side intent handler</name>
  <files>spacetimedb/src/reducers/intent.ts</files>
  <action>
Add the following command cases to the `submit_intent` reducer in intent.ts, placed BEFORE the sardonic fallback. Each command generates inline narrative output with clickable `{{color:#HEX}}[text]{{/color}}` bracket links. Follow the exact pattern used by the existing `inventory` and `backpack` commands.

**1. `stats` command** — Replace the stub "You reflect on your capabilities." with full character stats display:
```
Character Stats: {name}, Level {level} {race} {className}
  HP: {hp}/{maxHp}  Mana: {mana}/{maxMana}  Stamina: {stamina}/{maxStamina}
  XP: {xp}  Gold: {gold}

  Base Stats:
    STR {str}  DEX {dex}  INT {int}  WIS {wis}  CHA {cha}

  Combat:
    Armor Class: {armorClass}  Magic Resist: {magicResistance}
    Attack Power: {attackPower}  Spell Power: {spellPower}
```
Use kind 'look' for the event so it renders in the readable gray-white color.

**2. `bank` command** — When character is at a location with a banker NPC (npcType === 'banker'), show bank contents inline:
- Check `ctx.db.npc.by_location.filter(character.locationId)` for any NPC with `npcType === 'banker'`
- If no banker: fail with "There is no bank here."
- Load bank slots: `[...ctx.db.bank_slot.by_owner.filter(requirePlayerUserId(ctx))]`
- For each bank slot, find the item_instance and item_template
- Display: `Bank Vault ({count}/{MAX_BANK_SLOTS}):`
- Each item as: `  {{color:{rarityColor}}}[Withdraw {itemName}]{{/color}}` with stats summary (same format as backpack)
- If bank is empty: `  Your vault is empty.`
- Use RARITY_COLORS constant (same as inventory/backpack commands)

**3. `shop` / `vendor` command** — Show vendor inventory for a vendor NPC at the current location:
- Match: `lower === 'shop' || lower === 'vendor' || lower === 'store'`
- Find first vendor NPC at location: `ctx.db.npc.by_location.filter(character.locationId)` where `npcType === 'vendor'`
- If no vendor: fail with "There is no shop here."
- Load vendor inventory: `[...ctx.db.vendor_inventory.by_vendor.filter(vendorNpc.id)]`
- Display: `{npcName}'s Wares:`
- Each item as: `  {{color:{rarityColor}}}[Buy {itemName}]{{/color}} — {price} gold` with brief stats
- Show character's gold at bottom: `\nYour gold: {character.gold}`

**4. `craft` / `recipes` command** — Show discovered recipes when at a crafting station:
- Match: `lower === 'craft' || lower === 'recipes'`
- Check `location.craftingAvailable` — if false: "There is no crafting station here."
- Load discovered recipes: `[...ctx.db.recipe_discovered.by_character.filter(character.id)]`
- For each, load recipe_template and check materials in inventory
- Display: `Crafting Station — Known Recipes:`
- Each recipe as: `  {{color:#f59e0b}}[Craft {recipeName}]{{/color}} — requires: {req1Name} x{req1Count}, {req2Name} x{req2Count}` with "(ready)" or "(missing materials)" suffix based on current inventory
- Also add `  {{color:#f59e0b}}[Research Recipes]{{/color}} — discover new recipes from your materials` at the bottom

**5. `loot` command** — Show lootable corpses at the character's location:
- Match: `lower === 'loot'`
- Find corpses: `[...ctx.db.corpse.by_location.filter(character.locationId)]` (check if corpse table has location index; if not, iterate)
- For each corpse, load corpse_items
- Display: `Loot nearby:`
- Each corpse: `{corpseName}:` then items as `  {{color:{rarityColor}}}[Take {itemName}]{{/color}}`
- If no corpses: "There is nothing to loot here."

**6. `deposit [item]` command** — Deposit a backpack item to bank:
- Match: `lower.startsWith('deposit ')`
- Extract item name from text after "deposit "
- Check banker NPC is at location
- Find matching unequipped item in character inventory by name (case-insensitive)
- If found, call the deposit logic directly: same as existing deposit_to_bank reducer logic (look up the item, call `ctx.db.bank_slot.insert(...)`, update ownership)
- IMPORTANT: Don't call a reducer from within a reducer. Instead, inline the deposit logic from bank.ts directly (find item, check not equipped, check bank space, move to bank). The appendPrivateEvent already exists in bank.ts — replicate the same messages.

**7. `sell [item]` command** — Sell a backpack item to a vendor:
- Match: `lower.startsWith('sell ')`
- Extract item name
- Check vendor NPC is at location
- Find matching unequipped item in character inventory by name
- Inline the sell logic from items.ts sell_item reducer (find item, compute price with vendorBuyMod, delete item, add gold, add to vendor_inventory)
- Show sell confirmation message

**8. Resources as clickable links in `look`** — In the existing resources section (section 7), change from plain text to clickable:
- Currently: `resourceParts.push(count > 1 ? \`${name} x${count}\` : name);`
- Change to: For each individual resource node, output `{{color:#22c55e}}[Gather {name}]{{/color}}` (green, like uncommon items)
- Include the node count: `{{color:#22c55e}}[Gather {name}]{{/color}} x{count}` if count > 1

**9. Bank link in `look`** — In the existing NPC section (section 4), if any NPC has npcType 'banker', add a line after NPCs: `A {{color:#ffd43b}}[bank]{{/color}} is available here.`

**10. Vendor hint in `look`** — If any NPC has npcType 'vendor', add: `A {{color:#f59e0b}}[shop]{{/color}} is available here.`

**11. Update help text** — Add new commands to the help listing:
```
  [stats] — View your character stats.
  [bank] — Access your bank vault (at locations with a banker).
  [shop] — Browse a vendor's wares (at locations with a vendor).
  [craft] — View and craft known recipes (at crafting stations).
  [loot] — Check for lootable remains nearby.
  deposit <item> — Deposit an item to your bank.
  sell <item> — Sell an item to a vendor.
```

For the deposit/sell inline logic, you need additional deps. Add to the destructured deps at the top of registerIntentReducers:
- From the existing deps object, you'll need the same helpers used in bank.ts and items.ts. Since these reducers are registered separately, the simplest approach is to NOT inline the full logic but instead just route the text through to the existing reducers by inserting the appropriate db operations directly. Check what's available in `deps` — the intent handler already has access to `ctx.db` which is all you need for direct table manipulation.

IMPORTANT: Do NOT add `getItemCount`, `removeItemFromInventory`, `addItemToInventory` to intent deps unless they're already there. For deposit/sell, work directly with `ctx.db` table operations (find, update, insert, delete) since the logic is straightforward. Model after how bank.ts does it.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>
All narrative commands (stats, bank, shop, craft, loot, deposit, sell) are handled in the intent reducer. Resources and bank/vendor links appear as clickable in look output. Help text updated. TypeScript compiles without errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire client-side keyword routing for narrative clicks</name>
  <files>src/App.vue</files>
  <action>
Update the `clickNpcKeyword` handler in App.vue to route clicked narrative keywords to the correct actions. Also remove the client-side `craft` panel-open intercept in `onNarrativeSubmit`.

**1. Remove craft panel intercept** — In `onNarrativeSubmit` (around line 1377), remove:
```typescript
if (lower === 'craft') {
  openPanel('crafting');
  return;
}
```
This will let 'craft' fall through to `submitIntentReducer` which now handles it server-side.

**2. Add keyword handlers in `clickNpcKeyword`** — Add these BEFORE the final `onNarrativeSubmit(keyword)` fallthrough (around line 1605):

**Withdraw keyword** (from bank display):
```typescript
if (kwLower.startsWith('withdraw ')) {
  const itemName = kw.substring(9).trim();
  // Find matching bank slot by item name
  const userId = window.__my_identity;
  if (userId) {
    const bankSlots = [...(window.__db_conn?.db?.bankSlot?.iter() ?? [])];
    for (const slot of bankSlots) {
      if (slot.ownerUserId?.toHexString() !== userId.toHexString()) continue;
      const instance = window.__db_conn?.db?.itemInstance?.id?.find(slot.itemInstanceId);
      if (!instance) continue;
      const template = window.__db_conn?.db?.itemTemplate?.id?.find(instance.templateId);
      if (!template) continue;
      const name = (instance.displayName || template.name);
      if (name.toLowerCase() === itemName.toLowerCase()) {
        withdrawFromBank(slot.id);
        addLocalEvent('system', `Withdrawing ${name} from bank...`, 'private');
        return;
      }
    }
  }
  addLocalEvent('system', `Could not find "${itemName}" in your bank.`, 'private');
  return;
}
```

**Buy keyword** (from vendor display):
```typescript
if (kwLower.startsWith('buy ')) {
  const itemName = kw.substring(4).trim();
  // Find vendor NPC at location
  const vendorNpc = npcsHere.value?.find((npc: any) => npc.npcType === 'vendor');
  if (!vendorNpc) {
    addLocalEvent('system', 'No vendor here.', 'private');
    return;
  }
  // Find matching vendor inventory item
  const vendorInv = [...(window.__db_conn?.db?.vendorInventory?.byVendor?.filter(vendorNpc.id) ?? [])];
  for (const vi of vendorInv) {
    const template = window.__db_conn?.db?.itemTemplate?.id?.find(vi.itemTemplateId);
    if (template && template.name.toLowerCase() === itemName.toLowerCase()) {
      activeVendorId.value = vendorNpc.id;
      buyItem(vi.itemTemplateId);
      return;
    }
  }
  addLocalEvent('system', `"${itemName}" is not for sale here.`, 'private');
  return;
}
```

**Craft keyword** (from crafting display):
```typescript
if (kwLower.startsWith('craft ')) {
  const recipeName = kw.substring(6).trim();
  if (recipeName.toLowerCase() === 'research' || recipeName.toLowerCase() === 'research recipes') {
    // Research recipes
    if (selectedCharacter.value && conn.isActive) {
      window.__db_conn?.reducers.researchRecipes({ characterId: selectedCharacter.value.id });
    }
    return;
  }
  // Find recipe template by name
  const recipes = [...(window.__db_conn?.db?.recipeTemplate?.iter() ?? [])];
  const recipe = recipes.find((r: any) => r.name.toLowerCase() === recipeName.toLowerCase());
  if (recipe && selectedCharacter.value && conn.isActive) {
    window.__db_conn?.reducers.craftRecipe({
      characterId: selectedCharacter.value.id,
      recipeTemplateId: recipe.id,
    });
  } else {
    addLocalEvent('system', `Unknown recipe: "${recipeName}".`, 'private');
  }
  return;
}
```

**Research Recipes keyword**:
```typescript
if (kwLower === 'research recipes') {
  if (selectedCharacter.value && conn.isActive) {
    window.__db_conn?.reducers.researchRecipes({ characterId: selectedCharacter.value.id });
  }
  return;
}
```

**Gather keyword** (from look resource display):
```typescript
if (kwLower.startsWith('gather ')) {
  const resourceName = kw.substring(7).trim();
  // Find matching resource node at character's location
  const charLoc = selectedCharacter.value?.locationId;
  if (charLoc) {
    const nodes = [...(window.__db_conn?.db?.resourceNode?.byLocation?.filter(charLoc) ?? [])];
    const node = nodes.find((n: any) => n.name.toLowerCase() === resourceName.toLowerCase() && n.state === 'available');
    if (node && selectedCharacter.value && conn.isActive) {
      window.__db_conn?.reducers.startGatherResource({
        characterId: selectedCharacter.value.id,
        nodeId: node.id,
      });
      return;
    }
  }
  addLocalEvent('system', `No ${resourceName} available to gather here.`, 'private');
  return;
}
```

**Bank keyword routing** — The keyword "bank" should route to `onNarrativeSubmit('bank')` which will go to the server intent handler. This already works via the final fallthrough, so no change needed. BUT check if there's existing routing that opens the bank panel — the `openBank` function at line 1633 opens the panel. Remove any keyword match that calls `openBank` if one exists, or ensure 'bank' falls through to `onNarrativeSubmit`.

**Shop/vendor keyword** — Similarly, ensure clicking `[shop]` or typing 'shop' routes to `onNarrativeSubmit` which sends to the server. Check if there's existing panel-opening code for 'shop'/'vendor' in `onNarrativeSubmit` and remove it.

**IMPORTANT Notes:**
- The client-side db accessor names use camelCase (e.g., `bankSlot`, `itemInstance`, `itemTemplate`, `vendorInventory`, `resourceNode`, `recipeTemplate`). Use the correct generated binding names from `module_bindings/`.
- Check the actual table accessor names by looking at the generated bindings or using the pattern `window.__db_conn?.db?.{camelCaseName}`
- Table index accessors also use camelCase: `byVendor`, `byLocation`, `byOwner`
- If any accessor doesn't exist, use `.iter()` and filter manually
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
Clicking [Withdraw X], [Buy X], [Craft X], [Gather X], [Research Recipes] in narrative output triggers the correct reducer calls. The 'craft' typed command now routes to server-side intent handler instead of opening a panel. All keyword routing works through the existing clickNpcKeyword handler.
  </done>
</task>

</tasks>

<verification>
1. Publish module: `spacetime publish uwr -p spacetimedb`
2. Generate bindings: `spacetime generate --lang typescript --out-dir client/src/module_bindings -p spacetimedb`
3. Type `stats` — see full character stats inline
4. At a location with a banker NPC, type `bank` — see vault contents with clickable withdraw links
5. At a location with a vendor NPC, type `shop` — see vendor wares with clickable buy links
6. At a crafting station, type `craft` — see recipes with clickable craft links
7. Type `look` — resources appear as clickable [Gather X] links, bank/shop hints appear if NPCs present
8. Type `loot` — see lootable corpses if any exist
9. Type `help` — new commands listed
</verification>

<success_criteria>
All game systems accessible through narrative console commands with clickable inline links. No floating panels needed for bank/vendor/crafting interactions. Stats display is comprehensive. Resource gathering initiatable from look output clicks.
</success_criteria>

<output>
After completion, create `.planning/quick/360-convert-existing-systems-to-narrative-ui/360-SUMMARY.md`
</output>
