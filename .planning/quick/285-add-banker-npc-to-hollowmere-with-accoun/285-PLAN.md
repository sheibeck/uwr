---
phase: 285-bank
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/reducers/bank.ts
  - spacetimedb/src/reducers/index.ts
  - spacetimedb/src/seeding/ensure_world.ts
autonomous: true
requirements: [BANK-01, BANK-02, BANK-03, BANK-04]

must_haves:
  truths:
    - "BankSlot table exists with ownerUserId (u64), slot (u64 0-39), itemInstanceId (u64)"
    - "deposit_to_bank reducer moves item from character inventory to bank"
    - "withdraw_from_bank reducer moves item from bank to character inventory"
    - "Thurwick banker NPC exists at Hollowmere with npcType 'banker'"
  artifacts:
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "BankSlot table definition + schema export"
      contains: "BankSlot"
    - path: "spacetimedb/src/reducers/bank.ts"
      provides: "deposit_to_bank and withdraw_from_bank reducers"
      exports: ["registerBankReducers"]
    - path: "spacetimedb/src/reducers/index.ts"
      provides: "registerBankReducers called"
      contains: "registerBankReducers"
    - path: "spacetimedb/src/seeding/ensure_world.ts"
      provides: "Thurwick NPC seeded at Hollowmere"
      contains: "Thurwick"
  key_links:
    - from: "deposit_to_bank reducer"
      to: "ctx.db.bankSlot.insert"
      via: "after deleting from itemInstance or nulling equippedSlot"
      pattern: "bankSlot.*insert"
    - from: "withdraw_from_bank reducer"
      to: "itemInstance update (ownerCharacterId)"
      via: "hasInventorySpace check before transfer"
      pattern: "itemInstance.*update"
---

<objective>
Add BankSlot table, bank reducers, and Thurwick banker NPC to the backend.

Purpose: Establish the server-side infrastructure for the account-wide bank vault feature. The BankSlot table is private-with-view so only the owning user sees their slots.
Output: Published SpacetimeDB module with bank table, two reducers, and Thurwick NPC in Hollowmere.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/schema/tables.ts
@spacetimedb/src/reducers/index.ts
@spacetimedb/src/seeding/ensure_world.ts
@spacetimedb/src/helpers/items.ts
@spacetimedb/src/helpers/events.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: BankSlot table + view in schema</name>
  <files>spacetimedb/src/schema/tables.ts</files>
  <action>
Add BankSlot table and its view just before the `export const spacetimedb = schema(...)` line at the bottom of tables.ts.

BankSlot table definition:
```typescript
export const BankSlot = table(
  {
    name: 'bank_slot',
    indexes: [
      { name: 'by_owner', algorithm: 'btree', columns: ['ownerUserId'] },
      { name: 'by_item', algorithm: 'btree', columns: ['itemInstanceId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    ownerUserId: t.u64(),
    slot: t.u64(),         // 0-39 bank slot index
    itemInstanceId: t.u64(),
  }
);
```

Note: The table is NOT public. Visibility is via a view scoped to the calling user:
```typescript
spacetimedb.view(
  { name: 'my_bank_slots', public: true },
  t.array(BankSlot.rowType),
  (ctx) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player || player.userId == null) return [];
    return [...ctx.db.bankSlot.by_owner.filter(player.userId)];
  }
);
```

Add `BankSlot` to the schema export list (the `schema(...)` call at the bottom of the file).

IMPORTANT: Add the view definition AFTER the `export const spacetimedb = schema(...)` line (views are registered on the spacetimedb object, not passed to schema). The view call should be placed after the schema export, e.g.:
```typescript
export const spacetimedb = schema(
  // ... existing tables ...,
  BankSlot,
);

spacetimedb.view(
  { name: 'my_bank_slots', public: true },
  t.array(BankSlot.rowType),
  (ctx) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player || player.userId == null) return [];
    return [...ctx.db.bankSlot.by_owner.filter(player.userId)];
  }
);
```
  </action>
  <verify>Check that BankSlot appears in schema export and view is defined. No TypeScript errors (run: cd C:/projects/uwr/spacetimedb && npx tsc --noEmit 2>&1 | head -30).</verify>
  <done>BankSlot table defined with ownerUserId/slot/itemInstanceId columns. my_bank_slots view filters by ctx.sender's userId. Both compile without errors.</done>
</task>

<task type="auto">
  <name>Task 2: Bank reducers + register + Thurwick NPC</name>
  <files>
    spacetimedb/src/reducers/bank.ts
    spacetimedb/src/reducers/index.ts
    spacetimedb/src/seeding/ensure_world.ts
  </files>
  <action>
**Create spacetimedb/src/reducers/bank.ts:**

```typescript
export const registerBankReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    requirePlayerUserId,
    requireCharacterOwnedBy,
    appendPrivateEvent,
    hasInventorySpace,
    MAX_INVENTORY_SLOTS,
    getInventorySlotCount,
    fail,
  } = deps;

  const MAX_BANK_SLOTS = 40n;

  const failBank = (ctx: any, character: any, message: string) =>
    fail(ctx, character, message, 'system');

  spacetimedb.reducer(
    'deposit_to_bank',
    { characterId: t.u64(), instanceId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const userId = requirePlayerUserId(ctx);

      const instance = ctx.db.itemInstance.id.find(args.instanceId);
      if (!instance) return failBank(ctx, character, 'Item not found');
      if (instance.ownerCharacterId !== character.id) {
        return failBank(ctx, character, 'Item does not belong to your character');
      }
      if (instance.equippedSlot) {
        return failBank(ctx, character, 'Unequip the item before depositing');
      }

      // Count existing bank slots for this user
      const existingSlots = [...ctx.db.bankSlot.by_owner.filter(userId)];
      if (BigInt(existingSlots.length) >= MAX_BANK_SLOTS) {
        return failBank(ctx, character, 'Bank is full (40 slots maximum)');
      }

      // Find first free slot index (0-39)
      const usedSlots = new Set(existingSlots.map((s: any) => Number(s.slot)));
      let freeSlot = -1;
      for (let i = 0; i < 40; i++) {
        if (!usedSlots.has(i)) { freeSlot = i; break; }
      }
      if (freeSlot === -1) return failBank(ctx, character, 'Bank is full');

      // Remove from character inventory (set ownerCharacterId to 0 as sentinel — row stays)
      // Actually: we keep the ItemInstance row but orphan it from the character.
      // Use ownerCharacterId = 0n as the "in bank" sentinel — no character owns it.
      ctx.db.itemInstance.id.update({
        ...instance,
        ownerCharacterId: 0n,
        equippedSlot: undefined,
      });

      ctx.db.bankSlot.insert({
        id: 0n,
        ownerUserId: userId,
        slot: BigInt(freeSlot),
        itemInstanceId: instance.id,
      });

      const template = ctx.db.itemTemplate.id.find(instance.templateId);
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        `You deposit ${template?.name ?? 'item'} into the bank.`
      );
    }
  );

  spacetimedb.reducer(
    'withdraw_from_bank',
    { characterId: t.u64(), bankSlotId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const userId = requirePlayerUserId(ctx);

      const bankSlot = ctx.db.bankSlot.id.find(args.bankSlotId);
      if (!bankSlot) return failBank(ctx, character, 'Bank slot not found');
      if (bankSlot.ownerUserId !== userId) {
        return failBank(ctx, character, 'This is not your bank slot');
      }

      const instance = ctx.db.itemInstance.id.find(bankSlot.itemInstanceId);
      if (!instance) {
        // Orphaned bank slot — clean it up
        ctx.db.bankSlot.id.delete(bankSlot.id);
        return failBank(ctx, character, 'Item not found in bank');
      }

      // Check inventory space
      const template = ctx.db.itemTemplate.id.find(instance.templateId);
      if (!template) return failBank(ctx, character, 'Item template missing');

      const hasStack = template.stackable &&
        [...ctx.db.itemInstance.by_owner.filter(character.id)].some(
          (row: any) => row.templateId === template.id && !row.equippedSlot
        );
      const slotCount = getInventorySlotCount(ctx, character.id);
      if (!hasStack && slotCount >= MAX_INVENTORY_SLOTS) {
        return failBank(ctx, character, 'Backpack is full');
      }

      // Transfer item back to character
      ctx.db.itemInstance.id.update({
        ...instance,
        ownerCharacterId: character.id,
        equippedSlot: undefined,
      });

      ctx.db.bankSlot.id.delete(bankSlot.id);

      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        `You withdraw ${template.name} from the bank.`
      );
    }
  );
};
```

**Edit spacetimedb/src/reducers/index.ts:**
Add at the top:
```typescript
import { registerBankReducers } from './bank';
```
Add inside `registerReducers`:
```typescript
registerBankReducers(deps);
```

**Edit spacetimedb/src/seeding/ensure_world.ts:**
After the `upsertNpcByName` call for 'Quartermaster Jyn' (around line 89-98), add Thurwick:
```typescript
  upsertNpcByName({
    name: 'Thurwick',
    npcType: 'banker',
    locationName: 'Hollowmere',
    description: 'A meticulous record-keeper who manages the town vault with quiet precision.',
    greeting: 'Your valuables are safe with me. The vault has never been breached.',
    baseMood: 'composed',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.shrewd_trader),
  });
```
  </action>
  <verify>
1. Run: cd C:/projects/uwr/spacetimedb && npx tsc --noEmit 2>&1 | head -40
2. Verify registerBankReducers is imported and called in reducers/index.ts
3. Verify Thurwick appears in ensure_world.ts with npcType 'banker'
4. Publish to local: spacetime publish uwr --project-path C:/projects/uwr/spacetimedb
5. Check logs: spacetime logs uwr 2>&1 | tail -20
  </verify>
  <done>Module publishes without errors. deposit_to_bank and withdraw_from_bank reducers exist. Thurwick NPC seeds at Hollowmere with npcType 'banker'.</done>
</task>

</tasks>

<verification>
1. `spacetime logs uwr` shows no panics or reducer registration errors
2. TypeScript compiles: `npx tsc --noEmit` exits 0
3. Thurwick appears in npc table at Hollowmere location (check via spacetime sql or client)
4. BankSlot table exists in module schema
</verification>

<success_criteria>
- BankSlot table in schema with ownerUserId (u64), slot (u64), itemInstanceId (u64) and by_owner index
- my_bank_slots view returns only the calling user's slots
- deposit_to_bank: validates ownership, checks bank capacity (40 slots), moves item (ownerCharacterId=0n), inserts BankSlot row
- withdraw_from_bank: validates ownership, checks inventory space, restores item ownerCharacterId, deletes BankSlot row
- Both reducers log private events on success and use fail() on error
- Thurwick NPC at Hollowmere, npcType='banker'
- Module publishes to local without errors
</success_criteria>

<output>
After completion, create `.planning/quick/285-add-banker-npc-to-hollowmere-with-accoun/285-01-SUMMARY.md`
</output>

---
phase: 285-bank
plan: 02
type: execute
wave: 2
depends_on: [285-01]
files_modified:
  - src/composables/useGameData.ts
  - src/components/BankPanel.vue
  - src/components/LocationGrid.vue
  - src/App.vue
autonomous: true
requirements: [BANK-05, BANK-06, BANK-07, BANK-08]

must_haves:
  truths:
    - "BankPanel shows 40 slots with bank contents using same visual style as inventory bagGrid"
    - "Double-clicking an inventory slot (when bank open) calls depositToBank reducer"
    - "Double-clicking a bank slot calls withdrawFromBank reducer"
    - "Right-clicking a banker NPC shows 'Access Bank' option in context menu"
    - "Failed deposit (bank full) and failed withdraw (inventory full) appear in event log"
  artifacts:
    - path: "src/components/BankPanel.vue"
      provides: "40-slot bank grid component"
      min_lines: 80
    - path: "src/composables/useGameData.ts"
      provides: "bankSlots from useTable(tables.myBankSlots)"
      contains: "myBankSlots"
    - path: "src/components/LocationGrid.vue"
      provides: "open-bank emit on banker NPC context menu"
      contains: "open-bank"
    - path: "src/App.vue"
      provides: "BankPanel rendered in panel system, openBank handler, depositToBank/withdrawFromBank wired"
      contains: "BankPanel"
  key_links:
    - from: "src/components/BankPanel.vue"
      to: "conn.reducers.withdrawFromBank"
      via: "dblclick on bank slot"
      pattern: "withdrawFromBank"
    - from: "src/App.vue InventoryPanel double-click"
      to: "conn.reducers.depositToBank"
      via: "bankPanelOpen check + dblclick emit"
      pattern: "depositToBank"
    - from: "LocationGrid.vue banker NPC"
      to: "open-bank emit"
      via: "npcType === 'banker' check in openNpcContextMenu"
      pattern: "open-bank"
---

<objective>
Add BankPanel.vue client UI, wire bank open/close via NPC context menu, and connect deposit/withdraw interactions.

Purpose: Complete the bank feature end-to-end. Players can right-click Thurwick to open the bank, then double-click inventory items to deposit or double-click bank items to withdraw.
Output: BankPanel component, updated LocationGrid, updated App.vue with bank panel management.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/composables/useGameData.ts
@src/components/InventoryPanel.vue
@src/components/LocationGrid.vue
@src/App.vue
@.planning/quick/285-add-banker-npc-to-hollowmere-with-accoun/285-01-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Generate bindings + useGameData bankSlots</name>
  <files>
    src/composables/useGameData.ts
  </files>
  <action>
First, regenerate client bindings so the new table/view/reducers exist:
```bash
spacetime generate --lang typescript --out-dir C:/projects/uwr/src/module_bindings --project-path C:/projects/uwr/spacetimedb
```

Then update `src/composables/useGameData.ts`:

Add after the existing `useTable` calls (e.g., after `activeBardSongs`):
```typescript
const [bankSlots] = useTable(tables.myBankSlots);
```

Add `bankSlots` to the return object.

NOTE: The generated bindings will export `tables.myBankSlots` (camelCase of `my_bank_slots` view). If the key differs in the generated bindings, use whatever the generated file exports for the view.
  </action>
  <verify>
1. Check src/module_bindings/ was regenerated (recent timestamp)
2. Check tables.myBankSlots exists in module_bindings
3. `bankSlots` returned from useGameData
4. No TypeScript errors: cd C:/projects/uwr && npx tsc --noEmit 2>&1 | head -20
  </verify>
  <done>Bindings regenerated. useGameData exports bankSlots as a reactive ref containing the user's bank slot rows.</done>
</task>

<task type="auto">
  <name>Task 2: BankPanel.vue + LocationGrid + App.vue wiring</name>
  <files>
    src/components/BankPanel.vue
    src/components/LocationGrid.vue
    src/App.vue
  </files>
  <action>
**Create src/components/BankPanel.vue:**

A 40-slot grid matching the InventoryPanel `bagGrid` / `bagSlot` visual style. Props:
- `styles`: same styles prop as other panels
- `bankSlots`: the my_bank_slots rows from useGameData (array of `{ id, ownerUserId, slot, itemInstanceId }`)
- `itemTemplates`: array of item templates (for resolving name/slot/quality from templateId)
- `itemInstances`: array of all item instances (to look up instance by itemInstanceId)
- `selectedCharacter`: the active character row

Emits:
- `withdraw`: (bankSlotId: bigint) — when user double-clicks a bank slot
- `show-tooltip`, `move-tooltip`, `hide-tooltip`

Component logic:
- Compute `resolvedSlots`: 40-element array where index = slot number. For each bankSlot row, look up the ItemInstance by `bankSlot.itemInstanceId`, then the ItemTemplate by `instance.templateId`. Unfilled slots = null.
- Render the 40 slots using `bagGrid`/`bagSlot`/`bagSlotFilled` styles (copy exact pattern from InventoryPanel's bagGrid section).
- Double-click on a filled slot: emit `withdraw` with the bankSlot id.
- Right-click on a filled slot: show a simple context menu with "Withdraw" option (use same ContextMenu component pattern from InventoryPanel).
- Show item name and slot type label inside each filled slot, matching InventoryPanel.
- Include a header saying "Bank Vault — X / 40 slots used".

```vue
<template>
  <div :style="styles.panelBody">
    <div :style="styles.panelSectionTitle">
      Bank Vault — {{ usedSlots }} / 40 slots
    </div>
    <div :style="styles.bagGrid">
      <div
        v-for="(slot, idx) in resolvedSlots"
        :key="idx"
        :style="slot ? { ...styles.bagSlot, ...styles.bagSlotFilled, ...qualityBorderStyle(slot.qualityTier) } : styles.bagSlot"
        @dblclick="slot && $emit('withdraw', slot.bankSlotId)"
        @contextmenu.prevent="slot && openContextMenu($event, slot)"
        @mouseenter="slot && $emit('show-tooltip', { item: slot, x: $event.clientX, y: $event.clientY })"
        @mousemove="slot && $emit('move-tooltip', { x: $event.clientX, y: $event.clientY })"
        @mouseleave="slot && $emit('hide-tooltip')"
      >
        <template v-if="slot">
          <div :style="styles.bagSlotSlotLabel">{{ slot.slot }}</div>
          <div :style="[styles.bagSlotName, rarityStyle(slot.qualityTier)]">{{ slot.name }}</div>
          <span v-if="slot.stackable && slot.quantity > 1n" :style="styles.bagSlotQuantity">x{{ slot.quantity }}</span>
        </template>
      </div>
    </div>
    <ContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :title="contextMenu.title"
      :subtitle="contextMenu.subtitle"
      :items="contextMenu.items"
      :styles="styles"
      @close="contextMenu.visible = false"
    />
  </div>
</template>
```

Script setup: import `ref`, `computed` from vue, import ContextMenu. Compute `resolvedSlots` by iterating 0..39, finding bankSlot row with matching slot number, then looking up ItemInstance and ItemTemplate. `usedSlots` = bankSlots filtered to current user (they should all be the user's via view, so just .length).

**Edit src/components/LocationGrid.vue:**

In `openNpcContextMenu` (around line 555), after the `npc.npcType === 'vendor'` block, add:
```typescript
if (npc.npcType === 'banker') {
  items.push({
    label: 'Access Bank',
    action: () => emit('open-bank', npc.id),
  });
}
```

Add to the emits type definition:
```typescript
(e: 'open-bank', npcId: bigint): void;
```

**Edit src/App.vue:**

1. Import BankPanel at top of script (with other component imports).

2. Add `bankSlots` to the destructure from `useGameData()`.

3. Add `open-bank` handler on the LocationGrid element:
```
@open-bank="openBank"
```

4. Add `openBank` function in script:
```typescript
const bankPanelOpen = ref(false);

const openBank = (_npcId: bigint) => {
  openPanel('bank');
};

const depositToBank = (instanceId: bigint) => {
  if (!conn.isActive || !selectedCharacter.value) return;
  window.__db_conn?.reducers.depositToBank({
    characterId: selectedCharacter.value.id,
    instanceId,
  });
};

const withdrawFromBank = (bankSlotId: bigint) => {
  if (!conn.isActive || !selectedCharacter.value) return;
  window.__db_conn?.reducers.withdrawFromBank({
    characterId: selectedCharacter.value.id,
    bankSlotId,
  });
};
```

5. Add Bank Panel div in the template (alongside the Vendor Panel block, same floatingPanel + floatingPanelWide pattern):
```html
<!-- Bank Panel (wide) -->
<div v-if="panels.bank && panels.bank.open" data-panel-id="bank" :style="{ ...styles.floatingPanel, ...styles.floatingPanelWide, ...(panelStyle('bank').value || {}) }" @mousedown="bringToFront('bank')">
  <div :style="styles.floatingPanelHeader" @mousedown="startDrag('bank', $event)"><div>Bank Vault</div><button type="button" :style="styles.panelClose" @click="closePanelById('bank')">×</button></div>
  <div :style="styles.floatingPanelBody">
    <BankPanel
      :styles="styles"
      :bank-slots="bankSlots"
      :item-templates="itemTemplates"
      :item-instances="itemInstances"
      :selected-character="selectedCharacter"
      @withdraw="withdrawFromBank"
      @show-tooltip="showTooltip"
      @move-tooltip="moveTooltip"
      @hide-tooltip="hideTooltip"
    />
  </div>
  <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('bank', $event, { right: true })" /><div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('bank', $event, { bottom: true })" /><div :style="styles.resizeHandle" @mousedown.stop="startResize('bank', $event, { right: true, bottom: true })" />
</div>
```

6. For the double-click deposit: In InventoryPanel.vue's bagSlot div, add `@dblclick` that emits a new `deposit-to-bank` event. Then in App.vue wire it: when bank panel is open and inventory item is double-clicked, call depositToBank.

   Alternative simpler approach: In InventoryPanel's `openItemContextMenu`, when the bank panel is open (pass `bankOpen` prop), add a "Deposit to Bank" option. This avoids double-click complexity.

   Use the simpler context-menu approach:
   - Add `bankOpen: boolean` prop to InventoryPanel.vue
   - In `openItemContextMenu`, add:
     ```typescript
     if (props.bankOpen && !item.equipable) {
       items.unshift({
         label: 'Deposit to Bank',
         action: () => emit('deposit-to-bank', item.id),
       });
     }
     ```
   - Add `(e: 'deposit-to-bank', itemInstanceId: bigint): void` to emits
   - In App.vue, pass `:bank-open="panels.bank?.open ?? false"` to CharacterInfoPanel/InventoryPanel and handle `@deposit-to-bank="depositToBank"`

NOTE: CharacterInfoPanel wraps InventoryPanel — check if you need to thread the prop+event through CharacterInfoPanel or if App.vue passes directly to InventoryPanel. Look at how existing props flow and use the same pattern. If InventoryPanel is used directly inside CharacterInfoPanel.vue, thread through CharacterInfoPanel.

The event log (EventPrivate table) naturally shows deposit/withdraw messages from the server — no extra client work needed for error display.
  </action>
  <verify>
1. No TypeScript errors: cd C:/projects/uwr && npx tsc --noEmit 2>&1 | head -30
2. npm run dev starts without console errors
3. Visiting Hollowmere shows Thurwick NPC in LocationGrid
4. Right-clicking Thurwick shows "Talk", "Access Bank", "Give Gift" options
5. Clicking "Access Bank" opens the Bank Vault panel (40 empty slots)
6. Depositing an item (context menu -> Deposit to Bank) moves it to bank panel
7. Double-clicking a bank item returns it to inventory
8. Log panel shows "You deposit..." and "You withdraw..." messages
  </verify>
  <done>
BankPanel renders 40 slots matching inventory style. Thurwick's context menu has "Access Bank". Deposit via inventory context menu when bank is open. Withdraw via double-click in BankPanel. Server error messages (bank full, backpack full) appear in the log.
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles: `npx tsc --noEmit` exits 0
2. Dev server starts: `npm run dev` no console errors at startup
3. Thurwick appears at Hollowmere in LocationGrid
4. Right-click Thurwick -> "Access Bank" opens Bank Vault panel
5. Right-click inventory item with bank open -> "Deposit to Bank" appears
6. Item moves from inventory to bank panel after deposit
7. Double-click bank item -> item returns to inventory
8. Log shows server messages for deposit/withdraw
9. Bank full message appears in log if 40 slots used
10. Inventory full message appears in log if backpack is full on withdraw
</verification>

<success_criteria>
- BankPanel.vue: 40-slot grid, same bagGrid/bagSlot style as InventoryPanel, double-click withdraws
- LocationGrid.vue: npcType === 'banker' adds "Access Bank" option to NPC context menu
- App.vue: bank panel in floating panel system, openBank handler, depositToBank/withdrawFromBank wired
- InventoryPanel.vue: "Deposit to Bank" context menu option when bank panel is open
- useGameData.ts: bankSlots from myBankSlots view
- No TypeScript errors, no runtime errors on startup
</success_criteria>

<output>
After completion, create `.planning/quick/285-add-banker-npc-to-hollowmere-with-accoun/285-02-SUMMARY.md`
</output>
