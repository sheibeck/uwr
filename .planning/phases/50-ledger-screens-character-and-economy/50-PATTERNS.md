# Phase 50: Ledger Screens: Character and Economy - Pattern Map

**Mapped:** 2026-10-06
**Files analyzed:** 46 new or modified (grouped below)
**Analogs found:** 43 / 46 (tables, ARIA tabs and the notice line have no direct analog)

Line numbers are from the tree at `39196415` (clean, after the World-event rename commits `a7bdf561`, `4269d5a1`, `7aa34027`). Re-read `reducers/intent.ts` before editing it.

**Ownership:** every file below is editable by Phase 50. Nobody else owns them now. Two exceptions: never hand-edit `src/module_bindings/**` (regenerate it), and `spacetimedb/src/data/no_ripple_word.test.ts` is a guard to obey, not a file to edit. The banned word must not appear in any new source file, comment, CSS class or string.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `spacetimedb/src/schema/tables.ts` (+`VendorBuyback`, add to `schema({...})` near line 2327) | model | CRUD | `FactionStanding` table, tables.ts:1455 | exact |
| `spacetimedb/src/views/vendor_buyback.ts` (NEW) | view | request-response (per sender) | `views/faction.ts` (whole file) | exact |
| `spacetimedb/src/views/types.ts`, `views/index.ts`, `index.ts:336` `registerViews({...})` | config | - | `FactionStanding: any` in ViewDeps | exact |
| `spacetimedb/src/helpers/vendor_sale.ts` (NEW: `sellInstanceToVendor`, snapshot, restore) | service | CRUD | `sell_item` body, reducers/items.ts:154-217 | exact (extract) |
| `spacetimedb/src/reducers/items.ts` (`sell_item` delegates, NEW `buyback_last_sale`) | controller | request-response | `buy_item` items.ts:105-152 | exact |
| `spacetimedb/src/reducers/intent.ts` (three NL sell paths) | controller | request-response | itself, lines 947-1113 | self |
| `spacetimedb/src/reducers/items_crafting.ts` (`craft_recipe` reorder) | controller | request-response | itself, lines 103-240 | self |
| `spacetimedb/src/reducers/characters.ts` (`delete_character` cleanup) | controller | CRUD | corpse cleanup, characters.ts:260-268 | exact |
| `spacetimedb/src/data/item_stats.ts` (NEW) | utility | transform | `helpers/examine.ts:161-184` + `data/race_bonuses.ts` header | exact |
| `spacetimedb/src/data/vendor_pricing.ts` (NEW) | utility | transform | `helpers/economy.ts:10-15`, `items.ts:124-137`, `167-177` | exact |
| `spacetimedb/src/data/perk_rules.ts` (NEW) | utility | transform | `helpers/renown.ts:365-389` | role-match |
| `spacetimedb/src/data/item_usability.ts` (NEW) | utility | transform | `helpers/character.ts:156-165` + `equip_item` items.ts:453-485 | exact |
| `spacetimedb/src/data/item_rules.ts` (NEW) | utility | transform | `nonSalvageSlots` items_crafting.ts:~362 | role-match |
| `spacetimedb/src/data/faction_rules.ts` (+`factionTier`) | utility | transform | `src/input/infoCommands.ts:18-28` | exact |
| `spacetimedb/src/data/inventory_rules.ts` (NEW) | utility | transform | `helpers/items.ts:390-407` | exact |
| `spacetimedb/src/data/crafting_rules.ts` (+quality lookup, hint, `itemKeyFromName`, `isGearRecipe`) | utility | transform | items_crafting.ts:162-171 | exact |
| `spacetimedb/src/data/*.test.ts` (one per helper) | test | - | `data/race_bonuses.test.ts` | exact |
| `spacetimedb/src/reducers/vendor_buyback.test.ts`, `craft_recipe_order.test.ts`, NL sell cases | test | - | `reducers/creation_finalize.test.ts:1-70`, `character_info_intent.test.ts:19-27` | exact |
| `spacetimedb/src/views/vendor_buyback.test.ts` | test | - | `views/combat.test.ts` | exact |
| `src/gameDataAlias.test.ts` (extend) | test | - | its own race_bonuses block, lines 63-83 | self |
| `src/ledger/ledgerContext.ts` (NEW: `LedgerData`, `LEDGER_KEY`, `createInertLedger`) | provider | - | `src/creation/creationContext.ts` | exact |
| `src/ledger/ledgerData.ts` (NEW hub) | store | streaming (subscriptions) | `src/creation/creationData.ts` + `game/gameData.ts:239-270` | exact |
| `src/ledger/queries.ts` (NEW) | config | - | `src/creation/queries.ts` | exact |
| `src/session/useSession.ts`, `src/App.vue` | provider | - | `creation` factory, useSession.ts:85-86, 150-154, 404-417; App.vue:19-21 | exact |
| `src/screens/screens.ts` (`meta?`, vendor title `Trade`, real components) | config | - | itself | self |
| `src/game/context.ts` (`FrameControls.openScreen(id, args?)`, `screenArgs`, inert frame) | provider | - | itself, lines 201-207, 354-361 | self |
| `src/frame/AppFrame.vue` (`#meta`, `screenArgs`) | component | event-driven | encounter sheet `#meta`, AppFrame.vue:181-191 | exact |
| `src/console/useConsole.ts` (`trade(npc?)`) | service | event-driven | itself, lines 437-441 | self |
| `src/rails/NearbyList.vue` (pass the row) | component | event-driven | itself, lines 92-95, 168 | self |
| `src/screens/InventoryScreen.vue`, `StatsScreen.vue`, `VendorScreen.vue`, `CraftingScreen.vue` (replace placeholders) | component | request-response | `src/combat/EncounterPanel.vue` | role-match |
| `src/inventory/`, `src/stats/`, `src/vendor/`, `src/crafting/` pure models (`*Model.ts`) | utility | transform | `src/combat/hostiles.ts`, `src/creation/sheetModel.ts` | exact |
| `src/ledger/*.vue` shared parts (ItemTile, GoldAmount, FilterChips, SegTabs, InlineConfirm, NoticeLine) | component | - | `CreationComposer.vue` (confirm), `TabBar.vue` (pressed), `EmptyState.vue` | role-match |
| `src/stats/format.ts` (`formatPermille`) | utility | transform | none in tree (behavior ref `git show v2.2-client:src/components/StatsPanel.vue:166`) | none |
| Screen and model tests | test | - | `src/combat/EncounterPanel.test.ts`, `src/creation/CreationSheet.test.ts` | exact |
| Existing tests to update (screens, AppFrame.screens, frameControls, useConsole, ContextContent, infoCommands, App, useSession) | test | - | RESEARCH Q10 table | self |

## Pattern Assignments

### `spacetimedb/src/schema/tables.ts` + `views/vendor_buyback.ts` (model + per-sender view)

**Analog:** `spacetimedb/src/views/faction.ts` (whole file, 13 lines):
```typescript
import type { ViewDeps } from './types';

export const registerFactionViews = ({ spacetimedb, t, FactionStanding }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_faction_standings', public: true },
    t.array(FactionStanding.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player?.activeCharacterId) return [];
      return [...ctx.db.faction_standing.by_character.filter(player.activeCharacterId)];
    }
  );
};
```
Copy it as `registerVendorBuybackViews({ spacetimedb, t, VendorBuyback })`, replacing the filter with `const row = ctx.db.vendor_buyback.characterId.find(player.activeCharacterId); return row ? [row] : [];`. No `.iter()`.

**Wiring:** add `VendorBuyback: any;` to `ViewDeps` (`views/types.ts`, list ends with `UiPanelLayout: any;`), call the register function from `views/index.ts`, and pass `VendorBuyback` in `registerViews({...})` at `index.ts:336`. Table: two-argument `table({ name: 'vendor_buyback' }, {...})` with NO `public: true`, `characterId: t.u64().primaryKey()` (no autoInc, so no `0n` placeholder), plus the columns from RESEARCH Q2. Register it in `schema({...})` as `vendor_buyback: VendorBuyback` next to `faction_standing: FactionStanding` (tables.ts:2327).

**Test analog:** `views/combat.test.ts` tests `myCombatAggroRows(ctx)` directly. For a direct unit test, export a `myVendorBuybackRows(ctx)` function the same way `views/combat.ts:14-46` does. Cases: no player, no active character, another character's row is not returned.

---

### `spacetimedb/src/helpers/vendor_sale.ts` (NEW service) and `sell_item`

**Analog:** `reducers/items.ts:154-217` (`sell_item`). Extract in this order: guards (157-165), the payout (166-177, to be replaced by `sellPayout` from `data/vendor_pricing.ts`), the capture before deletion (178-182), the affix and instance delete (183-186), gold (187-190), the resale listing (191-208) and the reward line (209-215).

Current delete and listing block to keep (items.ts:182-208):
```typescript
      // Clean up any affixes before deleting the item instance
      for (const affix of ctx.db.item_affix.by_instance.filter(instance.id)) {
        ctx.db.item_affix.id.delete(affix.id);
      }
      ctx.db.item_instance.id.delete(instance.id);
      ctx.db.character.id.update({ ...character, gold: (character.gold ?? 0n) + value });
      const npc = ctx.db.npc.id.find(args.npcId);
      if (npc && npc.npcType === 'vendor') {
        const alreadyListed = [...ctx.db.vendor_inventory.by_vendor.filter(args.npcId)].find(
          (row) => row.itemTemplateId === soldTemplateId && (row.qualityTier ?? undefined) === soldQualityTier
        );
        if (!alreadyListed) {
          const resalePrice = soldVendorValue > 0n ? soldVendorValue * 2n : 10n;
          ctx.db.vendor_inventory.insert({ id: 0n, npcId: args.npcId, itemTemplateId: soldTemplateId, price: resalePrice, qualityTier: soldQualityTier });
        }
      }
```
Changes:
- Refuse quest templates FIRST, with `isQuestItemTemplate(template)` and the line `Quest items can't be sold.`.
- Snapshot the affixes BEFORE the delete loop. Store magnitudes as decimal strings, because `JSON.stringify` throws on bigint.
- Keep `const listing = ctx.db.vendor_inventory.insert(...)` and use `listing.id` (`insert` returns the ROW).
- When `record` is set, upsert: `ctx.db.vendor_buyback.characterId.find(...)` then `.update(...)`, otherwise `.insert(...)`.

The helper takes `fail` from its caller (the reducers' `failItem` at items.ts:31, `fail` in intent.ts). Low-level throws only use `SenderError` (memory rule: prefer `fail()`).

### `buyback_last_sale` reducer (in `registerItemReducers`, reducers/items.ts)

**Analog:** `buy_item`, items.ts:105-152. It uses the same deps destructure (lines 6-31), `requireCharacterOwnedBy`, `failItem`, the gold debit `ctx.db.character.id.update({ ...character, gold: (character.gold ?? 0n) - finalPrice })`, `addItemToInventory`, and the `appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward', ...)` line. The bag check is `hasInventorySpace(ctx, characterId, templateId)` (helpers/items.ts:397-407) rather than the inline count at 117-123. Refusal order and copy are in RESEARCH Q2. Arguments are `{ characterId: t.u64() }` only.

### `reducers/intent.ts` (three NL sell paths)

The current lines, re-read after the rename:
- `sell ` block: 947-1113. Vendor lookup: 952-954 (`vendorNpc`).
- **sell junk:** 957-987. Junk templates only, so add a quest skip for symmetry. NO record.
- **sell N:** 989-1049. Add `if (isQuestItemTemplate(tmpl)) continue` (or refuse with the same line) in the 997-1005 match loop. Replace the price math at 1015-1019 with `sellPayout`. NO record.
- **sell <item> (single):** 1051-1112. Replace 1072-1109 with a call to `sellInstanceToVendor(ctx, character, matchedInstance, matchedTemplate, vendorNpc.id, { record: true, fail })`. Keep the not-found line at 1069-1071.

The import is at intent.ts:6 (`import { computeSellValue } from '../helpers/economy';`). Keep `helpers/economy.ts` re-exporting `computeSellValue` from `../data/vendor_pricing`, so that `index.ts:198` and this import stay valid.

### `sell_all_junk` (items.ts:219-250)

Keep the behavior. Swap the per-instance math (lines 227-232) for `sellPayout(template.vendorValue ?? 0n, instance.quantity ?? 1n, vendorSellBonus, character.vendorSellMod ?? 0n)`. It must not touch `vendor_buyback`.

### `craft_recipe` validate-before-mutate (reducers/items_crafting.ts:103-240)

These mutations happen before the refusals:
- `removeItemFromInventory` x3 at 152-156.
- `addItemToInventory` at 157.
- catalyst `removeItemFromInventory` at ~200.
- modifier removes at ~215.

These refusals currently commit after consuming:
- `Essence tier too low...`: `if (!allowedQualities.includes(craftQuality)) return failItem(...)` (~192-194)
- `Missing catalyst (Essence)` (~196)
- `Missing modifier: X` (~212-214)
- `Must provide at least one reagent when using an Essence` (~228-230)

**Reorder plan:**
1. Compute `isGearRecipe`, `craftQuality` (via the new `craftQualityForMaterialName(req1Template.name)`, replacing 165-171), `catalystKey`, `allowedQualities` and the modifier list first.
2. Run every check.
3. Only then remove inputs, add the output and insert affixes. Keep the quirk that reagents without an essence are ignored and not consumed.

Keep `appendPrivateEvent(... 'system', 'Missing materials to craft this recipe.')` as it is (lines 142-149).

Test pattern: for each refusal, assert that `rows(ctx,'item_instance')` and their quantities are unchanged.

### `delete_character` cleanup (reducers/characters.ts:139-271)

Next to the corpse block at 260-268, add `ctx.db.vendor_buyback.characterId.delete(characterId);`.

---

### Import-free `@game-data` helpers (`spacetimedb/src/data/*.ts`)

**Analog:** `spacetimedb/src/data/race_bonuses.ts` header, lines 1-9:
```typescript
// Race stat bonuses: one pure rule shared by finalizeCharacter, both level-up sites
// (apply_level_up and the admin level_character) and the client character sheet, so the
// projection the player sees and the stats the server stores can never drift.
// Imports only ./class_stats so the client can reach it through @game-data. Browser-safe,
// ES2020 only, never throws.
import { BASE_STAT, computeBaseStatsForGenerated, detectPrimarySecondary } from './class_stats';
```
Each new file gets a header comment naming its server and client callers, imports nothing (or only sibling `data/` files) and uses no `replaceAll`, `.at` or `Object.hasOwn`. The membership idiom from race_bonuses is `(LIST as readonly string[]).indexOf(v) !== -1`.

| Helper file | Source to extract (cite in plan) | Server caller after change |
|---|---|---|
| `item_stats.ts` (`ITEM_STAT_KEYS`, `sumItemStats`) | `helpers/examine.ts:161-172` (big(), totals, affix add) | `examine.ts` calls it; `examine.test.ts` stays green unchanged. Add a differential test against `getEquippedBonuses` (helpers/items.ts:269-320) and do not rewrite that function |
| `vendor_pricing.ts` (`computeSellValue`, `sellPayout`, `buyPrice`) | `helpers/economy.ts:10-15`; `items.ts:124-137` (buy); `items.ts:166-177` (sell) | `buy_item`, `sell_item`, `sell_all_junk`, intent paths; `economy.ts` re-exports |
| `perk_rules.ts` (`perkBonusByField`, `perkDisplayName`) | `helpers/renown.ts:365-389` (`getPerkBonusByField`, which then delegates) | renown.ts. Do NOT fix the `renown_rank{N}_` key mismatch (owner todo) |
| `item_usability.ts` (`isClassAllowed`, `canEquipItem`, informational `levelShort`) | `helpers/character.ts:156-165` (shown below); `equip_item` items.ts:453-485 | `equip_item`; `helpers/character.ts` re-exports `isClassAllowed`. `normalizeClassName` comes from `./class_stats` |
| `item_rules.ts` (`isQuestItemTemplate` = `slot === 'quest'`, `USABLE_ITEM_KEYS`) | `nonSalvageSlots` items_crafting.ts:~362; use_item key set items.ts:897-1060 | `vendor_sale.ts`, intent sell-N, `use_item` |
| `faction_rules.ts` (+`factionTier`) | `FACTION_STANDING_THRESHOLDS` mechanical_vocabulary.ts:601-610; `standingLabel` src/input/infoCommands.ts:18-28 | client `standingLabel` re-pointed (update `infoCommands.test.ts` for the -1..-24 and -26..-99 bands) |
| `inventory_rules.ts` (`MAX_INVENTORY_SLOTS`, `backpackSlotCount`) | `helpers/items.ts:390-395` | `helpers/items.ts` re-exports |
| `crafting_rules.ts` (+`itemKeyFromName`, `craftQualityForMaterialName`, `nextCraftQuality`, `isGearRecipe`) | items_crafting.ts:162 and 165-171; `materialTierToCraftQuality` (line 161); `CRAFT_QUALITY_LEVELS` (169) | `craft_recipe` |

`isClassAllowed` to move verbatim (helpers/character.ts:156-165):
```typescript
export function isClassAllowed(allowedClasses: string, className: string) {
  if (!allowedClasses || allowedClasses.trim().length === 0) return true;
  const normalized = normalizeClassName(className);
  const allowed = allowedClasses.split(',').map((entry) => normalizeClassName(entry)).filter((entry) => entry.length > 0);
  if (allowed.includes('any')) return true;
  return allowed.includes(normalized);
}
```

**Alias test analog:** `src/gameDataAlias.test.ts:63-83`. It has an alias-vs-relative equality test and a `specifiers(file)` regex over `from '...'` that asserts the import set. Add one `describe('@game-data <name>')` per new module, for example `expect(specifiers('item_stats.ts')).toEqual([])`.

---

### Real-handler server tests

**Analog:** `spacetimedb/src/reducers/creation_finalize.test.ts:7-55`:
```typescript
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);
const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };   // one shared object: the mock compares with ===
beforeAll(async () => {
  await import('../index');
  const h = capturedReducer('sell_item');
  if (typeof h !== 'function') throw new Error("capturedReducer('sell_item') is not a function: STOP and report; never edit production code to fix this.");
  sellItem = h;
}, 120_000);
function newCtx(seed: Record<string, any[]>) {
  return createMockCtx({ seed, sender: alice, timestampMicros: T0, strict: true });
}
function rows(ctx: any, table: string): any[] { return ctx.db._tables[table] ?? []; }
```
NL sell cases capture `submit_intent` the same way (`character_info_intent.test.ts:19-27`). `llm_cutover.test.ts` is the second precedent for the same harness. Because the mock is strict, seed every touched table (`player`, `character`, `item_template`, `item_instance`, `item_affix`, `npc`, `vendor_inventory: []`, `vendor_buyback: []`, `location`, `recipe_template`, `recipe_discovered`).

---

### `src/ledger/ledgerContext.ts` (provider)

**Analog:** `src/creation/creationContext.ts` (93 lines). Copy its structure:
- the `type List<T> = Readonly<Ref<readonly T[]>>` interface of readonly refs plus methods;
- `export const LEDGER_KEY: InjectionKey<LedgerData> = Symbol('uwr.ledger')`;
- the private `constant()` and `empty()` helpers (lines 61-68: `computed(() => value)`);
- `createInertLedger()`, which returns `constant(false)`, `empty<...>()`, and no-op methods with `() => Promise.resolve(...)`.

The inert default is what keeps the bare mounts in `screens.test.ts`, `frameControls.test.ts` and `AppFrame.screens.test.ts` working.

### `src/ledger/ledgerData.ts` (store, subscriptions)

**Analog:** `src/creation/creationData.ts:1-130`. Copy these parts:
- the imports (lines 1-21: `effectScope`, `createKeyed` from `../game/keyedBinding`, the `BindTableOptions`/`TableLike` types from `../net/bindTable`);
- the `CreationConn extends ConnLike { db: {...}; reducers: {...} }` shape (lines 38-50), which becomes `LedgerConn` with the 12 reducer signatures in object-arg form, for example `sellItem(args: { characterId: bigint; itemInstanceId: bigint; npcId: bigint }): Promise<void>`;
- `CreationInput`/`CreationDeps` (52-68) and the `scope = effectScope()` plus `scope.run(...)` body (78-111).

Copy the keyed helpers privately from `src/game/gameData.ts:240-270` (`keyedTable`, `keyedIdList` with `parseIdListKey`/`idListKey`). Do not export them from gameData. Each keyed binding passes a `filter` that matches its SQL, because the cache is shared per table.

The text constant `SEND_ERROR_TEXT = "Couldn't send that. Try again."` (creationData.ts:36) is the client-rejection copy. Do not use optimistic state.

### `src/ledger/queries.ts`

**Analog:** `src/creation/queries.ts` (26 lines): `import { toSql } from 'spacetimedb'; import { tables } from '../module_bindings';`, an interface plus a factory returning `toSql(tables.x.where((r) => r.col.eq(v)))`. Use the RESEARCH "Ledger subscription SQL" example. Refuse empty id lists like `requireIds` in `src/game/queries.ts:62-64`. `tables.myVendorBuyback` exists only after `pnpm spacetime:generate -y`.

### `src/session/useSession.ts` + `src/App.vue`

**Analog:** the `creation` wiring:
- deps type: useSession.ts:85-86 `creation?: (input: CreationInput<C>) => CreationData;`
- session field: 106-107
- default factory: 150-154 `creation: (input) => createCreationData({ bind: bindTable, bindEvent: bindEventTable, queries: creationQueries() }, input)`
- construction: 404-417 `deps.creation ? deps.creation({...}) : createInertCreation()`
- logout reset: 512
- return value: 531
- dispose: 548

Add `ledger` in the same seven places. Its input is `conn`, `status`, `activeCharacterId`, `activeCharacter` and `game` refs.

`App.vue:21`: `provide(CREATION_KEY, session.creation ?? createInertCreation());` becomes the same line for `LEDGER_KEY`/`createInertLedger`. Update `fakeSession` in `App.test.ts` and the factory tests in `useSession.test.ts` additively.

---

### `src/screens/screens.ts` (`ScreenDef.meta`, vendor title)

Current interface (lines 21-33) and the vendor entry (line 47):
```typescript
  { id: 'vendor', title: 'Vendor', label: 'Vendor', icon: PhStorefront, component: VendorScreen, inHeader: false },
```
Add `/** Header meta (slots, gold, station). */ meta?: Component;`. Set the vendor `title: 'Trade'` and keep `label: 'Vendor'` (MoreSheet.vue:11-16 hard-codes Vendor). Point the four imports at the real screen components, or keep the file names and replace their bodies.

### `src/game/context.ts` (`FrameControls`) and `src/frame/AppFrame.vue`

Current code (context.ts:201-207; AppFrame.vue:45-56):
```typescript
export interface FrameControls {
  readonly isDesktop: Readonly<Ref<boolean>>;
  readonly activeScreen: Readonly<Ref<ActiveScreen>>;
  openScreen(id: ScreenId | 'encounter'): void;
  closeScreen(): void;
}
// AppFrame
const frameControls: FrameControls = {
  isDesktop,
  activeScreen: screens.active,
  openScreen(id: ScreenId | 'encounter') {
    const focused = document.activeElement;
    screens.open(id, focused instanceof HTMLElement ? focused : null);
  },
  closeScreen() { if (screens.active.value !== null) screens.close(); },
};
```
Changes:
- Add `readonly screenArgs: Readonly<Ref<ScreenArgs | null>>` and `openScreen(id, args?: { npcId?: bigint; npcName?: string })`.
- In AppFrame, hold a `ref` that is set in `openScreen` and cleared in `closeScreen`. Also clear it in the `openFromMore` path (useScreens.ts:54) and on any `screens.close()` call site (AppFrame lines 133, 179, 185, 192).
- `createInertFrame()` (context.ts:354-361) gains `screenArgs: constant(null)`.

**Meta slot analog:** the encounter sheet, AppFrame.vue:181-191:
```vue
      <Sheet v-else-if="screens.active.value === 'encounter'" title="Encounter" ... @close="screens.close()">
        <template #meta>
          <span class="sheet-meta">{{ encounterMeta }}</span>
        </template>
        <EncounterPanel variant="sheet" />
      </Sheet>
```
Apply it to the Drawer at 133-135 and the Sheet at 192-194: `<template v-if="activeDef.meta" #meta><component :is="activeDef.meta" /></template>`. Both shells already declare the slot (Drawer.vue:40, Sheet.vue:41). Keep `:key="activeDef.id"`. The vendor screen must `watch(frame.screenArgs)`, because a second Trade does not remount it (Pitfall 5).

### `src/console/useConsole.ts:437-441` and `src/rails/NearbyList.vue:92-95,168`

```typescript
  function trade(): void {
    if (!ready()) return;
    frame.closeScreen();
    frame.openScreen('vendor');
  }
```
This becomes `trade(npc?: { id: bigint; name: string })` and calls `frame.openScreen('vendor', npc ? { npcId: npc.id, npcName: npc.name } : undefined)`. Update the `ConsoleApi` type. NearbyList's local `trade()` (line 92) takes the row, and the template click at 168 becomes `@click="trade(row)"`. The row id is the NPC id (rails/nearby.ts:19-22). Tests to update: `useConsole.test.ts` 839-847 and ~916, and `ContextContent.test.ts` 212-219.

---

### Four screens (`InventoryScreen`, `StatsScreen`, `VendorScreen`, `CraftingScreen`)

**Placeholder being replaced** (`src/screens/InventoryScreen.vue`, whole file):
```vue
<script setup lang="ts">
import { PhBackpack } from '@phosphor-icons/vue';
import EmptyState from './EmptyState.vue';
</script>
<template>
  <EmptyState :icon="PhBackpack" title="Your bag is empty." body="This screen is still being built." />
</template>
```
Keep `EmptyState` for the no-character, empty and no-vendor states, so the frame tests keep a stable line.

**Component analog:** `src/combat/EncounterPanel.vue:1-40`. It injects and computes from a pure model:
```typescript
import { computed, inject } from 'vue';
import { COMBAT_KEY, GAME_KEY, createInertCombat, createInertGame } from '../game/context';
import { encounterHeading, hostileViews, livingHostileIds } from './hostiles';
withDefaults(defineProps<{ variant?: 'rail' | 'sheet' }>(), { variant: 'rail' });
const game = inject(GAME_KEY, createInertGame());
const hostiles = computed(() => hostileViews({ enemies: combat.enemies.value, /* ... */ playerLevel: game.character.value?.level ?? 0n }));
```
Screens inject `GAME_KEY`, `LEDGER_KEY` and `FRAME_KEY` with inert fallbacks, and pass refs into a pure `*Model.ts`. Use `FRAME_KEY` → `isDesktop` for the drawer and sheet split, like the `variant` prop. Use `src/creation/CreationSheet.vue` and `CreationView.vue` (Phase 49) for the desktop and mobile split, the `sheetModel.ts` pure model and the `CreationView.mobile.test.ts` mobile test.

**Model analog:** `src/combat/hostiles.ts` and `src/creation/sheetModel.ts`. These are pure functions over plain rows with no Vue import, each with a `*.test.ts`. Put all `@game-data` calls in the models, never in templates.

**Test analog:** `src/combat/EncounterPanel.test.ts:1-45`:
```typescript
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { COMBAT_KEY, GAME_KEY, createInertCombat, createInertCombatData, createInertGame } from '../game/context';
const XSS = '<img src=x onerror=alert(1)>';
let wrapper: VueWrapper | null = null;
afterEach(() => { wrapper?.unmount(); wrapper = null; });
```
Build the game as `{ ...createInertGame(), character: ref(...) }`. Provide `LEDGER_KEY` with `{ ...createInertLedger(), items: ref([...]), reducers: ref({ sellItem: vi.fn(() => Promise.resolve()) }) }`. Assert reducer object args, text nodes (the XSS string renders literally) and disabled-until-settled behavior.

### Confirmation pattern (salvage above common or equipped, Sell all junk)

**Analog:** `src/creation/CreationComposer.vue:25, 35-38, 101-116, 137-153`, with the constants in `creationControls.ts:123`:
```vue
const confirmingStartOver = ref(false);
// The confirmation belongs to one step: it closes when the decision set changes.
<template v-if="confirmingStartOver">
  <span class="confirm-prompt">{{ START_OVER_CONFIRMATION.prompt }}</span>
  <button type="button" class="btn btn-secondary decision-btn danger" :disabled="buttonsDisabled" @click="runDecision(START_OVER_CONFIRMATION.yes)">{{ START_OVER_CONFIRMATION.yes.label }}</button>
  <button type="button" class="btn btn-primary decision-btn" @click="runDecision(START_OVER_CONFIRMATION.keep)">{{ START_OVER_CONFIRMATION.keep.label }}</button>
</template>
```
Build `InlineConfirm.vue` from it: a prompt span, a danger confirm button, a primary keep button and a local `ref` that resets on a selection change (a `watch` on the selected id, like line 35-38). Copy the `.confirm-prompt` styles from line 275.

### Tables and ARIA tabs (no direct analog)

The tree has no `<table>`, `role="tablist"` or `aria-selected`. The closest pattern is the pressed-state toggle in `src/frame/TabBar.vue:21` and `HeaderBar.vue:60`:
```vue
:aria-pressed="props.activeTab === tab.id ? 'true' : 'false'"
```
- Filter chips (All, Gear, Materials, Food): use this `aria-pressed` toggle.
- Vendor Buy/Sell segment (`SegTabs.vue`): use the WAI-ARIA tabs pattern from RESEARCH and the UI-SPEC. That is `role="tablist"`, `role="tab"` with `aria-selected` and `aria-controls`, roving `tabindex`, and arrow keys with `preventDefault()`. The shells check `defaultPrevented` for Esc.
- Tables: use a native `<table>` with `<th scope="col">`. Each row's `Buy`/`Sell` button carries an `aria-label` that names the item and price (UI-SPEC checker note).

### Notice line (`src/ledger/NoticeLine.vue`)

There is no analog. Use RESEARCH Pattern 4: snapshot `game.feed.entries` keys at mount, mirror only `system`, `reward` and `heal` from `source === 'private'`, use `cleanServerText` and `role="status"`, and loop backwards with an index (no `.at`). Icons: `PhInfo` for system, `PhCheckCircle` for reward and heal, and `PhWarningCircle` only for client rejections.

## Shared Patterns

### Server refusal and event lines
**Source:** `reducers/items.ts:31` `failItem` (wraps `fail`, which is `appendPrivateEvent(..., 'system', msg)`, helpers/events.ts:123-125). Success lines use `appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward', ...)`.
**Apply to:** `buyback_last_sale`, `vendor_sale.ts`, the quest refusal and the craft reorder. `fail` does not throw and the transaction commits, so put every check before the first mutation.

### Ownership
**Source:** `requireCharacterOwnedBy(ctx, args.characterId)` (helpers/events.ts:25-39), the first line of every reducer. It throws `SenderError`.

### Design guards (all new `.vue` and `.ts` under `src/`)
**Source:** `src/styles/designContract.test.ts`, `colors.guard.test.ts`, `tokens.client.test.ts`, `scrollbars.test.ts`, `frame/frameContract.test.ts`, and the scanner `styles/cssContract.ts:48` `listClientFiles`. The rules:
- Font sizes 10/12/14/20 only; weights 400/500 only.
- Padding, margin and gap only on 0/4/8/16/24/32/48/64.
- `h4`/`h6` only.
- Phosphor only; no inline `<svg`, no `v-html`.
- No literal colors (including inside `color-mix`).
- Existing tokens only (the pin stays at 23).
- No `replaceAll`, `.at` or `Object.hasOwn`.

These run against new files on the first test run.

### Banned word
**Source:** `spacetimedb/src/data/no_ripple_word.test.ts`. Do not write it in any case in new source, comments, CSS classes or strings. Use "World event".

### Data flow
The server is the source of truth. Use no optimistic UI. Every number shown (price, payout, tier, quality, capacity) comes from a `@game-data` function also used by the server, and each has a test pinning it.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/ledger/SegTabs.vue` (and table markup) | component | event-driven | No `role="tablist"` or `<table>` in the client yet; use WAI-ARIA tabs from RESEARCH and the UI-SPEC |
| `src/ledger/NoticeLine.vue` | component | streaming | No feed-mirror component exists; use RESEARCH Pattern 4 |
| `src/stats/format.ts` (`formatPermille`) | utility | transform | Only the v2.2 tag has it (`git show v2.2-client:src/components/StatsPanel.vue:166`) |

## Metadata

**Analog search scope:** `spacetimedb/src/{views,reducers,helpers,data,schema}`, `src/{creation,combat,frame,screens,game,session,console,rails,styles,input}`, `src/App.vue`, `src/gameDataAlias.test.ts`
**Files scanned:** about 45
**Pattern extraction date:** 2026-10-06
