---
phase: quick-110
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/CharacterInfoPanel.vue
  - src/components/ActionBar.vue
  - src/components/RenownPanel.vue
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "A single 'Character' button in the action bar opens a tabbed panel with Inventory and Stats tabs"
    - "Separate 'Inventory' and 'Stats' buttons no longer appear in the action bar"
    - "Inventory tab shows the existing InventoryPanel content (equipment grid, bag slots, context menus)"
    - "Stats tab shows the existing StatsPanel content (core stats, base stats, combat stats)"
    - "Renown panel tabs use the same underline tab-bar style as the Journal panel"
  artifacts:
    - path: "src/components/CharacterInfoPanel.vue"
      provides: "Tabbed wrapper rendering InventoryPanel and StatsPanel as tab content"
    - path: "src/components/ActionBar.vue"
      provides: "Character button replacing Inventory and Stats buttons"
    - path: "src/components/RenownPanel.vue"
      provides: "Updated tab styling matching Journal panel pattern"
    - path: "src/App.vue"
      provides: "Single characterInfo panel replacing inventory and stats panels"
  key_links:
    - from: "src/components/ActionBar.vue"
      to: "src/App.vue"
      via: "emit('toggle', 'characterInfo')"
      pattern: "toggle.*characterInfo"
    - from: "src/components/CharacterInfoPanel.vue"
      to: "src/components/InventoryPanel.vue"
      via: "v-if activeTab === 'inventory'"
      pattern: "activeTab.*inventory"
    - from: "src/components/CharacterInfoPanel.vue"
      to: "src/components/StatsPanel.vue"
      via: "v-if activeTab === 'stats'"
      pattern: "activeTab.*stats"
---

<objective>
Combine Inventory and Stats panels into a single tabbed "Character" panel, remove separate action bar buttons, and update Renown panel tabs to match Journal tab styling.

Purpose: Reduce action bar clutter by consolidating two related panels into one tabbed interface, and achieve visual consistency across all tabbed panels.
Output: CharacterInfoPanel.vue (new), updated ActionBar.vue, updated RenownPanel.vue, updated App.vue
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/NpcDialogPanel.vue (tab-bar pattern reference — lines 2-32)
@src/components/ActionBar.vue
@src/components/InventoryPanel.vue
@src/components/StatsPanel.vue
@src/components/RenownPanel.vue
@src/App.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create CharacterInfoPanel with Inventory/Stats tabs and update ActionBar + App.vue</name>
  <files>
    src/components/CharacterInfoPanel.vue
    src/components/ActionBar.vue
    src/App.vue
  </files>
  <action>
Create `src/components/CharacterInfoPanel.vue` — a thin wrapper component with two tabs (Inventory / Stats) that renders the existing InventoryPanel and StatsPanel as tab content.

**Tab bar:** Copy the EXACT tab-bar pattern from NpcDialogPanel.vue lines 2-32. Use the same inline styles:
- Container: `display: 'flex', gap: '0', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '8px'`
- Active tab: `background: 'rgba(255,255,255,0.08)' + borderBottom: '2px solid #60a5fa'` + `color: '#fff'`
- Inactive tab: `background: 'transparent'` + `borderBottom: '2px solid transparent'` + `color: '#d1d5db'`
- Shared: `padding: '8px 16px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, border: 'none', outline: 'none'`

**State:** `const activeTab = ref<'inventory' | 'stats'>('inventory');` — default to Inventory tab.

**Tab content:**
- `v-if="activeTab === 'inventory'"` renders `<InventoryPanel>` with ALL the same props and events currently passed in App.vue line 164. Forward them all through.
- `v-else-if="activeTab === 'stats'"` renders `<StatsPanel>` with ALL the same props currently passed in App.vue line 186. Forward them through.

**Props for CharacterInfoPanel:** Accept ALL props needed by both child panels. This means:
- From InventoryPanel: `styles`, `connActive`, `selectedCharacter`, `equippedSlots`, `inventoryItems`, `inventoryCount`, `maxInventorySlots`, `combatLocked`
- From StatsPanel: `styles`, `selectedCharacter`, `statBonuses`, `locations`, `regions`
- Deduplicate shared props (styles, selectedCharacter)
- Total unique props: styles, connActive, selectedCharacter, equippedSlots, inventoryItems, inventoryCount, maxInventorySlots, combatLocked, statBonuses, locations, regions

**Events:** Forward all InventoryPanel events: `equip`, `unequip`, `use-item`, `eat-food`, `delete-item`, `split-stack`, `organize`, `show-tooltip`, `move-tooltip`, `hide-tooltip`

Import both InventoryPanel and StatsPanel components.

**ActionBar.vue changes:**
1. Remove the Inventory button (lines 24-29 — the `@click="emit('toggle', 'inventory')"` button)
2. Remove the Stats button (lines 37-43 — the `@click="emit('toggle', 'stats')"` button)
3. Add a new "Character" button in their place (put it where Inventory was, before Hotbar):
   ```
   <button @click="emit('toggle', 'characterInfo')" :style="actionStyle('characterInfo')" :disabled="isLocked('characterInfo')">Character</button>
   ```
4. Update the PanelKey type: remove `'inventory'` and `'stats'` (if they were there), ensure `'character'` or the toggle key works. (Note: PanelKey is local typing only, not enforced — just keep it reasonable.)
5. Update the `highlightInventory` check in `actionStyle` to use `panel === 'characterInfo'` instead of `panel === 'inventory'`.

**App.vue changes:**
1. Add `import CharacterInfoPanel from './components/CharacterInfoPanel.vue';`
2. Remove the entire Inventory Panel block (the `div` with `data-panel-id="inventory"`, lines ~162-166)
3. Remove the entire Stats Panel block (the `div` with `data-panel-id="stats"`, lines ~184-188)
4. Add a new Character Info Panel block (wide panel) in their place:
   ```html
   <div v-if="panels.characterInfo && panels.characterInfo.open" data-panel-id="characterInfo" :style="{ ...styles.floatingPanel, ...styles.floatingPanelWide, ...(panelStyle('characterInfo').value || {}) }" @mousedown="bringToFront('characterInfo')">
     <div :style="styles.floatingPanelHeader" @mousedown="startDrag('characterInfo', $event)"><div>Character</div><button type="button" :style="styles.panelClose" @click="closePanelById('characterInfo')">x</button></div>
     <div :style="styles.floatingPanelBody"><CharacterInfoPanel :styles="styles" :conn-active="conn.isActive" :selected-character="selectedCharacter" :equipped-slots="equippedSlots" :inventory-items="inventoryItems" :inventory-count="inventoryCount" :max-inventory-slots="maxInventorySlots" :combat-locked="lockInventoryEdits" :stat-bonuses="equippedStatBonuses" :locations="locations" :regions="regions" @equip="equipItem" @unequip="unequipItem" @use-item="useItem" @eat-food="eatFood" @delete-item="deleteItem" @split-stack="(id: bigint, qty: bigint) => splitStack(id, qty)" @organize="organizeInventory" @show-tooltip="showTooltip" @move-tooltip="moveTooltip" @hide-tooltip="hideTooltip" /></div>
     <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('characterInfo', $event, { right: true })" /><div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('characterInfo', $event, { bottom: true })" /><div :style="styles.resizeHandle" @mousedown.stop="startResize('characterInfo', $event, { right: true, bottom: true })" />
   </div>
   ```
5. In the `usePanelManager` defaults object (~line 1791):
   - Remove `inventory: { x: 600, y: 140 }` and `stats: { x: 600, y: 140 }`
   - Add `characterInfo: { x: 600, y: 140 }`
6. Update the onboarding watcher (~line 1861): change `panels.includes('inventory')` to `panels.includes('characterInfo')`
7. Remove imports for InventoryPanel and StatsPanel from App.vue since they are no longer directly used there (they are imported by CharacterInfoPanel instead). Keep them if other code references them directly.

**IMPORTANT:** The `highlightInventory` prop on ActionBar should now highlight the "Character" button. In ActionBar's `actionStyle`, change `panel === 'inventory'` to `panel === 'characterInfo'`.
  </action>
  <verify>
Run `npx vue-tsc --noEmit 2>&1 | head -40` to check for TypeScript errors (pre-existing errors are acceptable, no NEW errors should appear).
Visually confirm: Action bar shows "Character" button where "Inventory" and "Stats" used to be. Clicking it toggles a tabbed panel with Inventory/Stats tabs.
  </verify>
  <done>
Action bar shows a single "Character" button. Clicking it opens a floating panel titled "Character" with two tabs: Inventory (default active, showing equipment grid + bag) and Stats (showing character stats). The separate Inventory and Stats buttons are gone from the action bar. Onboarding highlight works on the Character button.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update Renown panel tab styling to match Journal tab-bar pattern</name>
  <files>src/components/RenownPanel.vue</files>
  <action>
Replace the Renown panel's tab bar (lines 4-26 of RenownPanel.vue) to match the EXACT same tab-bar inline styles used in NpcDialogPanel.vue (and now CharacterInfoPanel.vue).

**Current Renown tab styling** uses `actionButton`/`actionButtonActive` style spreads from the styles prop, with 8px gap and paddingBottom. This looks different from the Journal tabs.

**Replace with the NpcDialogPanel pattern:**
- Tab bar container: `{ display: 'flex', gap: '0', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '8px' }`
- Each tab button uses inline styles (NOT styles.actionButton):
  ```
  :style="{
    background: activeTab === 'factions' ? 'rgba(255,255,255,0.08)' : 'transparent',
    borderBottom: activeTab === 'factions' ? '2px solid #60a5fa' : '2px solid transparent',
    padding: '8px 16px',
    cursor: 'pointer',
    color: activeTab === 'factions' ? '#fff' : '#d1d5db',
    fontSize: '0.85rem',
    fontWeight: 600,
    border: 'none',
    outline: 'none',
  }"
  ```
- Repeat for each of the three tabs (factions, renown, leaderboard), replacing the tab key in the ternary.

Keep the `type="button"` attribute on each tab button. The tab content below (Factions/Renown/Leaderboard sections) stays unchanged.
  </action>
  <verify>
Visual inspection: Renown panel tabs should now look identical to Journal panel tabs (underline-style with blue active indicator) rather than the old button-style tabs.
  </verify>
  <done>
Renown panel's three tabs (Factions, Renown, Leaderboard) use the same visual tab-bar style as the Journal panel — transparent background, blue underline on active tab, consistent font sizing and colors.
  </done>
</task>

</tasks>

<verification>
1. Action bar shows: Log, Help, Camp, **Character**, Hotbar, Crafting, Journal, Renown, Travel, Loot, Friends (Inventory and Stats buttons removed)
2. Clicking "Character" opens a tabbed panel defaulting to the Inventory tab
3. Switching to Stats tab shows character stats
4. Tab bar styling in Character panel matches Journal panel styling exactly
5. Renown panel tabs now match Journal panel tab styling (underline style, not button style)
6. Onboarding highlight works on the Character button
7. No TypeScript compilation errors introduced
</verification>

<success_criteria>
- Single "Character" button replaces Inventory + Stats in action bar
- Character panel has two functional tabs: Inventory (default) and Stats
- All InventoryPanel functionality works within the Inventory tab (equip, unequip, use, eat, delete, split, organize, tooltips)
- All StatsPanel functionality works within the Stats tab
- Renown panel tabs visually match Journal panel tab styling
- No regressions in panel drag/resize/close behavior
</success_criteria>

<output>
After completion, create `.planning/quick/110-combine-inventory-and-stats-panels-into-/110-SUMMARY.md`
</output>
