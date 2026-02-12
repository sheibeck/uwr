---
phase: quick-29
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/LootPanel.vue
  - src/components/CombatPanel.vue
  - src/components/ActionBar.vue
  - src/composables/useCombat.ts
  - src/composables/useCombatLock.ts
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "After combat ends, Victory or Defeat is posted to the event log as a message, not shown in a blocking modal"
    - "When loot drops from combat, a floating Loot panel auto-opens showing claimable items"
    - "Loot accumulates across multiple combats up to 10 items in the loot window"
    - "A Loot button in the action bar toggles the loot panel open/closed"
    - "The travel panel returns to normal location view immediately after combat ends (no more result blocking)"
    - "Combat results are auto-dismissed after loot is captured to local state"
    - "Taking loot still calls the takeLoot reducer to move items to inventory"
  artifacts:
    - path: "src/components/LootPanel.vue"
      provides: "Floating loot window showing accumulated loot items with Take buttons and tooltips"
    - path: "src/App.vue"
      provides: "LootPanel wired as floating panel, auto-open on loot, log posting for Victory/Defeat"
    - path: "src/composables/useCombat.ts"
      provides: "pendingLoot accumulator computed from combatLoot table rows"
  key_links:
    - from: "src/App.vue"
      to: "src/composables/useCombat.ts"
      via: "pendingLoot computed, auto-dismiss watcher"
      pattern: "pendingLoot|activeLoot"
    - from: "src/App.vue"
      to: "src/components/LootPanel.vue"
      via: "floating panel with loot items prop"
      pattern: "LootPanel"
    - from: "src/components/ActionBar.vue"
      to: "src/App.vue"
      via: "toggle loot panel event"
      pattern: "toggle.*loot"
---

<objective>
Refactor the loot system to replace the blocking combat summary modal with a dedicated floating loot window. Victory/Defeat outcomes are posted to the event log instead. Loot accumulates from multiple combats (up to 10 items) in a persistent floating panel that auto-opens when items are available. A Loot button in the action bar provides manual access.

Purpose: The current combat summary blocks the entire travel/location panel until dismissed, preventing movement, new engagements, and normal gameplay. This refactor decouples loot from the combat result lifecycle so players can keep playing while reviewing and claiming loot.
Output: New LootPanel.vue component, modified App.vue/useCombat/CombatPanel/ActionBar/useCombatLock.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/composables/useCombat.ts
@src/components/CombatPanel.vue
@src/components/ActionBar.vue
@src/composables/useCombatLock.ts
@src/composables/usePanelManager.ts
@src/App.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create LootPanel component and refactor useCombat to support loot accumulation</name>
  <files>
    src/components/LootPanel.vue
    src/composables/useCombat.ts
  </files>
  <action>
**useCombat.ts changes:**

1. Add a new computed `pendingLoot` that shows ALL unclaimed loot for the selected character across ALL combats (not just the active result's combat). This replaces `activeLoot` which was scoped to a single combat result:

```typescript
const pendingLoot = computed(() => {
  if (!selectedCharacter.value) return [];
  const characterId = selectedCharacter.value.id.toString();
  return combatLoot.value
    .filter((row) => row.characterId.toString() === characterId)
    .slice(0, 10)  // Cap at 10 items
    .map((row) => {
      const template = itemTemplates.value.find(
        (item) => item.id.toString() === row.itemTemplateId.toString()
      );
      const description = [
        template?.rarity,
        template?.armorType,
        template?.slot,
        template?.tier ? `Tier ${template.tier}` : null,
      ].filter((value) => value && value.length > 0).join(' . ') ?? '';
      const stats = [
        template?.armorClassBonus ? { label: 'Armor Class', value: `+${template.armorClassBonus}` } : null,
        template?.weaponBaseDamage ? { label: 'Weapon Damage', value: `${template.weaponBaseDamage}` } : null,
        template?.weaponDps ? { label: 'Weapon DPS', value: `${template.weaponDps}` } : null,
        template?.strBonus ? { label: 'STR', value: `+${template.strBonus}` } : null,
        template?.dexBonus ? { label: 'DEX', value: `+${template.dexBonus}` } : null,
        template?.chaBonus ? { label: 'CHA', value: `+${template.chaBonus}` } : null,
        template?.wisBonus ? { label: 'WIS', value: `+${template.wisBonus}` } : null,
        template?.intBonus ? { label: 'INT', value: `+${template.intBonus}` } : null,
        template?.hpBonus ? { label: 'HP', value: `+${template.hpBonus}` } : null,
        template?.manaBonus ? { label: 'Mana', value: `+${template.manaBonus}` } : null,
        template?.vendorValue ? { label: 'Value', value: `${template.vendorValue} gold` } : null,
      ].filter(Boolean) as { label: string; value: string }[];
      return {
        id: row.id,
        name: template?.name ?? 'Unknown',
        rarity: template?.rarity ?? 'Common',
        tier: template?.tier ?? 1n,
        allowedClasses: template?.allowedClasses ?? 'any',
        armorType: template?.armorType ?? 'none',
        description,
        stats,
      };
    });
});
```

2. Keep `activeLoot` and `lootForResult` and `hasAnyLootForResult` and `hasOtherLootForResult` as they still serve the dismiss logic. But also export `pendingLoot` in the return object.

3. Add `pendingLoot` to the return statement alongside the existing exports.

**LootPanel.vue** -- new file:

Create a new Vue component following the exact pattern of other panels (e.g., VendorPanel, InventoryPanel). Props:
- `styles: Record<string, Record<string, string | number>>`
- `lootItems: Array<{ id: bigint; name: string; rarity: string; tier: bigint; allowedClasses: string; armorType: string; description: string; stats: { label: string; value: string }[] }>`
- `connActive: boolean`

Emits:
- `take-loot` with loot id (bigint)
- `show-tooltip`, `move-tooltip`, `hide-tooltip` (same pattern as CombatPanel/InventoryPanel)

Template structure:
- If `lootItems.length === 0`: show subtle text "No unclaimed loot."
- Otherwise: render a vertical list of loot items, each showing:
  - Item name styled with rarity color (use the same `rarityStyle` helper as CombatPanel)
  - Subtitle line: `{{ item.rarity }} . Tier {{ item.tier }}`
  - A "Take" button (ghostButton style) that emits `take-loot` with the item id
  - Tooltip on mouseenter/mousemove/mouseleave (same pattern as CombatPanel loot section)
- Use `styles.rosterClickable` for each item row (same as CombatPanel loot items)
- Use `styles.ghostButton` for the Take button
- Use `styles.subtleSmall` for the subtitle line

Keep the component simple. No dismiss button needed -- items disappear from the list automatically when taken (the combatLoot row is deleted server-side by the take_loot reducer).
  </action>
  <verify>
1. Verify LootPanel.vue exists and has proper props/emits defined
2. Verify useCombat.ts exports `pendingLoot` in its return object
3. Run `npx vue-tsc --noEmit` to check for TypeScript errors (may have some from App.vue not yet wired -- that's expected, will be fixed in Task 2)
  </verify>
  <done>
LootPanel.vue component exists with loot item rendering, Take buttons, and tooltip support. useCombat.ts exports `pendingLoot` computed that returns up to 10 unclaimed loot items for the selected character across all combats.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire LootPanel into App.vue, add Loot button to ActionBar, auto-dismiss results, post Victory/Defeat to log</name>
  <files>
    src/App.vue
    src/components/ActionBar.vue
    src/components/CombatPanel.vue
    src/composables/useCombatLock.ts
  </files>
  <action>
**ActionBar.vue changes:**

1. Add `'loot'` to the PanelKey type union.
2. Add a Loot button in the `v-if="hasActiveCharacter"` template section, placed after the Renown button and before the Friends button:
```html
<button
  @click="emit('toggle', 'loot')"
  :style="actionStyle('loot')"
>
  Loot
</button>
```
No special locking needed for the loot button -- it should always be accessible.

**CombatPanel.vue changes:**

Remove the entire `activeResult` display block (lines 7-67 in the current template -- the `<div v-if="activeResult">` section with resultCard, resultHeading, resultSummary, fallen list, loot items, and Dismiss button). The CombatPanel should now ONLY show the active combat enemies section (the `<details>` accordion). The `v-else` on the `<details>` tag should be removed since there is no more `v-if="activeResult"` preceding it.

Specifically, the template should become:
```html
<template>
  <div>
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to view location.
    </div>
    <div v-else>
      <details
        :style="activeCombat ? styles.accordionCombat : styles.accordion"
        :open="accordionState.enemies"
        @toggle="...existing toggle handler..."
      >
        ...existing enemies accordion content (unchanged)...
      </details>
    </div>
  </div>
</template>
```

Remove these props that are no longer needed:
- `activeLoot`
- `activeResult`
- `canDismissResults`

Remove these emits that are no longer needed:
- `dismiss-results`
- `take-loot`
- `show-tooltip`, `move-tooltip`, `hide-tooltip`

Remove the `rarityStyle`, `fallenList`, `stripFallen`, `resultOutcome` helper functions.

Remove the CombatResultRow import.

**App.vue changes:**

1. Import LootPanel:
```typescript
import LootPanel from './components/LootPanel.vue';
```

2. Add `pendingLoot` to the useCombat destructure (alongside existing activeLoot etc.).

3. Register `loot` panel in usePanelManager defaults:
```typescript
loot: { x: 600, y: 200 },
```

4. Add the floating Loot panel in the template (same pattern as other floating panels like vendor/inventory):
```html
<!-- Loot Panel -->
<div v-if="panels.loot && panels.loot.open" data-panel-id="loot" :style="{ ...styles.floatingPanel, ...(panelStyle('loot').value || {}) }" @mousedown="bringToFront('loot')">
  <div :style="styles.floatingPanelHeader" @mousedown="startDrag('loot', $event)">
    <div>Loot</div>
    <button type="button" :style="styles.panelClose" @click="closePanelById('loot')">x</button>
  </div>
  <div :style="styles.floatingPanelBody">
    <LootPanel
      :styles="styles"
      :conn-active="conn.isActive"
      :loot-items="pendingLoot"
      @take-loot="takeLoot"
      @show-tooltip="showTooltip"
      @move-tooltip="moveTooltip"
      @hide-tooltip="hideTooltip"
    />
  </div>
  <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('loot', $event, { right: true })" />
  <div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('loot', $event, { bottom: true })" />
  <div :style="styles.resizeHandle" @mousedown.stop="startResize('loot', $event, { right: true, bottom: true })" />
</div>
```

5. Remove the props and event handlers on CombatPanel that no longer exist:
   - Remove `:active-loot="activeLoot"`
   - Remove `:active-result="activeResult"`
   - Remove `:can-dismiss-results="canDismissResults"`
   - Remove `@dismiss-results="dismissResults"`
   - Remove `@take-loot="takeLoot"`
   - Remove `@show-tooltip="showTooltip"` `@move-tooltip="moveTooltip"` `@hide-tooltip="hideTooltip"` from CombatPanel (keep them on LootPanel)

6. Change the CombatPanel visibility condition. Currently the travel panel body switches between CombatPanel and TravelPanel+LocationGrid based on `activeCombat || activeResult`. Change this to ONLY `activeCombat`:
```html
<div :style="activeCombat ? styles.floatingPanelBodyCombat : styles.floatingPanelBody">
  <template v-if="activeCombat">
    <CombatPanel ... />
  </template>
  <template v-else>
    <TravelPanel ... />
    <LocationGrid ... />
  </template>
</div>
```

7. Add a watcher that auto-opens the loot panel when new loot appears, and auto-dismisses combat results after posting Victory/Defeat to the log. This replaces the old combat summary modal flow:

```typescript
// Track which result IDs we've already processed (to avoid re-posting to log)
const processedResultIds = ref<Set<string>>(new Set());

watch(
  () => activeResult.value,
  (result) => {
    if (!result) return;
    const id = result.id.toString();
    if (processedResultIds.value.has(id)) return;
    processedResultIds.value.add(id);

    // Post Victory/Defeat to the event log
    const summary = result.summary ?? '';
    const outcome = summary.toLowerCase().startsWith('victory') ? 'Victory' :
                    summary.toLowerCase().startsWith('defeat') ? 'Defeat' : 'Combat Ended';
    // Strip the "Victory! " or "Defeat! " prefix if present, use the rest as detail
    const detail = summary.replace(/^(victory|defeat)[!.:]*\s*/i, '').trim();
    const logMessage = detail ? `${outcome}! ${detail}` : `${outcome}!`;
    addLocalEvent({ kind: 'combat', message: logMessage });

    // Auto-dismiss results after a short delay to let loot data arrive
    setTimeout(() => {
      dismissResults();
    }, 500);
  }
);

// Keep processedResultIds from growing unbounded
watch(
  () => processedResultIds.value.size,
  (size) => {
    if (size > 50) {
      const entries = [...processedResultIds.value];
      processedResultIds.value = new Set(entries.slice(-20));
    }
  }
);
```

8. Add a watcher that auto-opens the loot panel when pendingLoot goes from empty to non-empty:
```typescript
watch(
  () => pendingLoot.value.length,
  (count, prevCount) => {
    if (count > 0 && (prevCount === 0 || prevCount === undefined)) {
      openPanel('loot');
    }
  }
);
```

9. Remove the `canDismissResults` computed since it is no longer used in the template (results are auto-dismissed). HOWEVER, it is still needed by the `dismissResults` function in useCombat which checks group leader status. Check if it's used anywhere else in App.vue besides the removed CombatPanel prop. If only used as a CombatPanel prop, remove it. The `dismissResults` function in useCombat.ts handles the group check internally.

10. The existing victory/defeat sound watcher (watching `activeResult`) should remain -- it plays the sound when a result appears, which is still the desired behavior.

**useCombatLock.ts changes:**

Remove `activeResult` from the `combatLocked` computed. Currently:
```typescript
const combatLocked = computed(() => Boolean(activeCombat.value || activeResult.value));
```
Change to:
```typescript
const combatLocked = computed(() => Boolean(activeCombat.value));
```

This is critical: with the old behavior, `activeResult` kept inventory/hotbar locked until dismissed. Now that results are auto-dismissed, `combatLocked` should only depend on active combat. This means players can equip loot from the loot window immediately after combat ends.

Also remove the `activeResult` parameter from the `UseCombatLockArgs` type since it is no longer used.

Then in App.vue, remove `activeResult` from the useCombatLock call arguments.

**Important:** The `addLocalEvent` function (from useEvents) is already available in App.vue -- it was set up in quick-10 for blocked ability feedback. Verify it exists in the useEvents destructure. If the function signature is `addLocalEvent({ kind: string, message: string })`, use it directly. If it expects different args, match its interface.
  </action>
  <verify>
1. Run `npx vue-tsc --noEmit` from project root -- should compile with zero errors
2. Verify CombatPanel.vue no longer has activeResult, activeLoot, canDismissResults props
3. Verify ActionBar.vue has the Loot button
4. Verify App.vue has the LootPanel floating panel section
5. Verify useCombatLock.ts no longer references activeResult
6. Search for `canDismissResults` in App.vue -- should only appear if still needed by dismissResults logic
7. Verify the `loot` panel is registered in usePanelManager defaults
  </verify>
  <done>
Combat summary modal is fully replaced. After combat: Victory/Defeat posted to log, results auto-dismissed, loot panel auto-opens if items dropped. Loot button in action bar provides manual access. Loot accumulates across combats (up to 10). Travel panel returns to normal immediately after combat ends. Inventory/hotbar unlock immediately after combat (no longer blocked by result screen). TypeScript compiles cleanly.
  </done>
</task>

</tasks>

<verification>
1. `npx vue-tsc --noEmit` compiles with zero errors
2. After combat victory with loot: Victory message appears in log, loot panel auto-opens with items, travel panel shows location/enemies normally
3. After combat victory without loot: Victory message appears in log, travel panel returns to normal, no loot panel opens
4. After combat defeat: Defeat message appears in log, travel panel returns to normal
5. Loot button in action bar toggles the loot panel
6. Taking loot removes items from the loot panel list
7. Multiple combats accumulate loot (items from combat 1 and combat 2 both visible)
8. Victory/defeat sounds still play when combat ends
9. Inventory and hotbar edits are unlocked immediately after combat ends (not waiting for dismiss)
</verification>

<success_criteria>
The combat summary blocking modal is replaced by: (1) Victory/Defeat log messages, (2) a dedicated floating loot panel that auto-opens when items are available, and (3) a Loot button in the action bar. The travel panel returns to normal view immediately after combat ends. Loot accumulates across combats up to 10 items. TypeScript compiles cleanly.
</success_criteria>

<output>
After completion, create `.planning/quick/29-refactor-loot-system-replace-combat-summ/29-SUMMARY.md`
</output>
