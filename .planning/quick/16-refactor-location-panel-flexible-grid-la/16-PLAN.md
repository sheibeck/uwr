---
phase: 16-refactor-location-panel
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ContextMenu.vue
  - src/components/LocationGrid.vue
  - src/components/CombatPanel.vue
  - src/App.vue
  - src/ui/styles.ts
autonomous: true
must_haves:
  truths:
    - "Right-clicking an enemy group opens a context menu with pull options (Careful Pull, Body Pull) and enemy info (members, faction, level)"
    - "Right-clicking a resource node opens a context menu with Gather action and resource info"
    - "Right-clicking an NPC opens a context menu with Talk/Open Store actions and NPC description"
    - "Right-clicking a character opens a context menu that triggers character actions panel"
    - "Left-clicking an enemy group selects it (visual highlight)"
    - "Location content (enemies, resources, NPCs, characters) displays as a compact grid of tiles instead of stacked accordions"
    - "Combat mode still works identically — active combat UI is unchanged"
    - "Context menu closes when clicking elsewhere or pressing Escape"
  artifacts:
    - path: "src/components/ContextMenu.vue"
      provides: "Reusable right-click context menu component"
      min_lines: 40
    - path: "src/components/LocationGrid.vue"
      provides: "Grid layout for location items with context menu integration"
      min_lines: 80
  key_links:
    - from: "src/components/LocationGrid.vue"
      to: "src/components/ContextMenu.vue"
      via: "import and template usage"
      pattern: "ContextMenu"
    - from: "src/App.vue"
      to: "src/components/LocationGrid.vue"
      via: "import replacing CombatPanel for out-of-combat view"
      pattern: "LocationGrid"
---

<objective>
Refactor the Location panel from a scrolling accordion list with action buttons into a flexible grid layout with right-click context menus. Enemy groups, resources, NPCs, and characters display as compact tiles in a wrapped grid. All actions (pull, gather, talk, trade) move from inline buttons to context menus triggered by right-click. Left-click selects items (e.g., enemy groups). Combat mode remains unchanged.

Purpose: Clean up the cluttered button-heavy UI into a more game-like interaction pattern. All location info stays visible without scrolling through accordions.
Output: ContextMenu.vue, LocationGrid.vue, updated CombatPanel.vue (combat-only), updated App.vue and styles.ts
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@src/components/CombatPanel.vue
@src/components/CharacterActionsPanel.vue
@src/App.vue
@src/ui/styles.ts
@src/composables/usePanelManager.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create ContextMenu component and LocationGrid component</name>
  <files>
    src/components/ContextMenu.vue
    src/components/LocationGrid.vue
    src/ui/styles.ts
  </files>
  <action>
**1. Create `src/components/ContextMenu.vue`** — a reusable context menu component.

Props:
- `visible: boolean` — controls show/hide
- `x: number` — left position (from contextmenu event clientX)
- `y: number` — top position (from contextmenu event clientY)
- `title: string` — header text (e.g., enemy name, NPC name)
- `subtitle?: string` — secondary info line (e.g., "L5 x3 · Iron Compact")
- `items: Array<{ label: string; disabled?: boolean; action: () => void }>` — menu items
- `styles: Record<string, any>` — global styles object

Emits: `close` (when clicking outside, pressing Escape, or clicking a menu item)

Implementation:
- Render as a fixed-position div at (x, y) with high z-index (9999)
- Clamp position so menu stays within viewport (check if x + menuWidth > window.innerWidth, same for y)
- Title bar at top with subtitle below if provided
- List of clickable items below, each calling its action() then emitting `close`
- Disabled items get muted style and no click handler
- On mount: add `mousedown` listener on document to detect outside clicks and emit `close`; add `keydown` listener for Escape
- On unmount: remove both listeners
- Use Teleport to `body` so the menu isn't clipped by overflow:hidden parents

**2. Create `src/components/LocationGrid.vue`** — the out-of-combat location content as a grid.

Props (same data CombatPanel currently receives for out-of-combat, MINUS combat-specific ones):
- `styles: Record<string, any>`
- `connActive: boolean`
- `selectedCharacter: CharacterRow | null`
- `charactersHere: { character: CharacterRow; disconnected: boolean }[]`
- `npcsHere: NpcRow[]`
- `enemySpawns: EnemySummary[]` (same type as CombatPanel)
- `resourceNodes: Array<{ id: bigint; name: string; quantity: bigint; state: string; timeOfDay: string; isGathering: boolean; progress: number; respawnSeconds: number | null }>`
- `canEngage: boolean`

Emits:
- `pull: { enemyId: bigint; pullType: 'careful' | 'body' }`
- `gather-resource: bigint`
- `hail: string`
- `open-vendor: bigint`
- `character-action: bigint`

Internal state:
- `selectedEnemyId: bigint | null` — which enemy group is left-click selected (yellow border highlight)
- `contextMenu: { visible: boolean; x: number; y: number; title: string; subtitle: string; items: Array<...> }` — state for ContextMenu

Template layout:
- Section labels as small uppercase headers: "ENEMIES", "RESOURCES", "CHARACTERS", "NPCS" — only shown if that section has items
- Each section's items render in a flex-wrap grid (CSS `display: flex; flex-wrap: wrap; gap: 0.4rem`)
- Each item is a compact tile using a new `gridTile` style (see styles below)

**Enemy tiles:**
- Show: `{{ enemy.name }} (L{{ enemy.level }})` with con color class from `styles[enemy.conClass]`
- Show group count badge if > 1: `x{{ enemy.groupCount }}`
- Left-click (`@click`): sets `selectedEnemyId` to this enemy's id (toggle off if already selected)
- Selected tile gets yellow border highlight (using `rosterTagActive`-like style)
- Right-click (`@contextmenu.prevent`): opens context menu with:
  - Title: enemy.name
  - Subtitle: `L${enemy.level}${enemy.groupCount > 1n ? ' x' + enemy.groupCount : ''} · ${enemy.factionName}`
  - Items: `[{ label: 'Careful Pull', disabled: !canEngage, action: () => emit('pull', { enemyId: enemy.id, pullType: 'careful' }) }, { label: 'Body Pull', disabled: !canEngage, action: () => emit('pull', { enemyId: enemy.id, pullType: 'body' }) }]`
  - If enemy has memberNames, add a disabled info item: `{ label: 'Members: ' + enemy.memberNames.join(', '), disabled: true }`

**Resource tiles:**
- Show: `{{ node.name }}` with state indicator (depleted = muted, harvesting = progress bar)
- Right-click: context menu with title=node.name, items: `[{ label: node.state === 'harvesting' ? 'Gathering...' : 'Gather', disabled: !connActive || node.state !== 'available', action: () => emit('gather-resource', node.id) }]`
- If depleted, show disabled info item: `{ label: 'Respawns in ${node.respawnSeconds}s', disabled: true }`

**Character tiles:**
- Show: `{{ entry.character.name }}` with disconnected dot if `entry.disconnected`
- Left-click AND right-click both: `emit('character-action', entry.character.id)` (opens the existing CharacterActionsPanel)

**NPC tiles:**
- Show: `{{ npc.name }}` with subtle description below if exists
- Right-click: context menu with title=npc.name, subtitle=npc.description, items: vendor NPCs get `[{ label: 'Talk', action: () => emit('hail', npc.name) }, { label: 'Open Store', action: () => { emit('hail', npc.name); emit('open-vendor', npc.id) } }]`, non-vendor NPCs get `[{ label: 'Talk', action: () => emit('hail', npc.name) }]`

**Empty state:** If no enemies, resources, characters, or NPCs, show "Nothing of interest here." in subtle style.

**3. Add styles to `src/ui/styles.ts`:**

Add these new style entries:

```typescript
contextMenu: {
  position: 'fixed',
  zIndex: 9999,
  minWidth: '160px',
  maxWidth: '280px',
  background: 'rgba(12, 16, 24, 0.95)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: '10px',
  padding: '0.4rem 0',
  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  backdropFilter: 'blur(12px)',
},
contextMenuTitle: {
  padding: '0.4rem 0.75rem 0.15rem',
  fontWeight: 700,
  fontSize: '0.85rem',
  color: 'rgba(230,232,239,0.95)',
},
contextMenuSubtitle: {
  padding: '0 0.75rem 0.35rem',
  fontSize: '0.7rem',
  color: 'rgba(230,232,239,0.55)',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
},
contextMenuItem: {
  padding: '0.4rem 0.75rem',
  cursor: 'pointer',
  fontSize: '0.8rem',
  color: 'rgba(230,232,239,0.85)',
  transition: 'background 0.1s',
},
contextMenuItemDisabled: {
  padding: '0.4rem 0.75rem',
  fontSize: '0.75rem',
  color: 'rgba(230,232,239,0.4)',
  cursor: 'default',
  fontStyle: 'italic',
},
gridSectionLabel: {
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontSize: '0.65rem',
  color: 'rgba(230,232,239,0.5)',
  marginTop: '0.5rem',
  marginBottom: '0.25rem',
},
gridTile: {
  background: 'rgba(76, 125, 240, 0.1)',
  border: '1px solid rgba(76, 125, 240, 0.25)',
  padding: '0.35rem 0.55rem',
  borderRadius: '8px',
  fontSize: '0.78rem',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
  userSelect: 'none',
},
gridTileSelected: {
  background: 'rgba(255, 210, 90, 0.15)',
  border: '1px solid rgba(255, 210, 90, 0.6)',
  color: '#f7d97f',
},
gridTileDepleted: {
  background: 'rgba(76, 125, 240, 0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: 'rgba(230,232,239,0.4)',
},
gridTileNpc: {
  background: 'rgba(130, 200, 130, 0.1)',
  border: '1px solid rgba(130, 200, 130, 0.3)',
},
gridWrap: {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.4rem',
},
```

Also add a hover pseudo-class note: since we're using inline styles (not CSS classes), add a hover effect via `@mouseenter`/`@mouseleave` in the ContextMenu component that sets `background: 'rgba(76, 125, 240, 0.25)'` on the hovered menu item.
  </action>
  <verify>
    - `npx vue-tsc --noEmit` passes (or at minimum the new files have no TypeScript errors)
    - ContextMenu.vue exports properly and renders a positioned menu
    - LocationGrid.vue exports properly and accepts the expected props
    - New style entries exist in styles.ts
  </verify>
  <done>
    ContextMenu.vue and LocationGrid.vue exist with proper types, props, emits, and template structure. New context menu and grid styles added to styles.ts.
  </done>
</task>

<task type="auto">
  <name>Task 2: Strip out-of-combat content from CombatPanel, wire LocationGrid into App.vue</name>
  <files>
    src/components/CombatPanel.vue
    src/App.vue
  </files>
  <action>
**1. Refactor `src/components/CombatPanel.vue`** to be combat-only:

Remove from CombatPanel.vue:
- The entire `v-else` block after `</details>` for the enemies accordion (lines ~157-214) — the out-of-combat enemy list with pull buttons
- The `<template v-if="!activeCombat && !activeResult">` block (lines ~216-336) — resources, characters, NPCs accordions
- Remove props that are no longer needed: `enemySpawns`, `resourceNodes`, `canEngage`, `accordionState` (keep ONLY `enemies` accordion state for combat), `npcsHere`, `charactersHere`
- Remove emits that are no longer needed: `pull` (out-of-combat pulls), `gather-resource`, `hail`, `accordion-toggle` (for resources/characters/npcs), `character-action`, `open-vendor`

Keep in CombatPanel.vue:
- The `activeResult` block (combat results with loot)
- The `activeCombat` block (fighting enemies, flee button, hp bars, effects, casts)
- The `select-enemy` emit (for targeting during combat)
- The `flee` emit
- The `dismiss-results` and `take-loot` emits
- Tooltip emits (`show-tooltip`, `move-tooltip`, `hide-tooltip`)

The CombatPanel should now ONLY render when there is an active combat or active result. It no longer has an out-of-combat state.

**2. Update `src/App.vue`** — wire in LocationGrid for out-of-combat view:

Add import:
```typescript
import LocationGrid from './components/LocationGrid.vue';
```

Find the "travel" panel section (around lines 241-357). Currently the body has:
```html
<div :style="activeCombat || activeResult ? styles.floatingPanelBodyCombat : styles.floatingPanelBody">
  <template v-if="activeCombat || activeResult">
    <CombatPanel ... (combat mode) />
  </template>
  <template v-else>
    <details> Travel accordion </details>
    <CombatPanel ... (out-of-combat mode) />
  </template>
</div>
```

Change to:
```html
<div :style="activeCombat || activeResult ? styles.floatingPanelBodyCombat : styles.floatingPanelBody">
  <template v-if="activeCombat || activeResult">
    <CombatPanel
      :styles="styles"
      :conn-active="conn.isActive"
      :selected-character="selectedCharacter"
      :active-combat="activeCombat"
      :active-enemy-spawn="activeEnemySpawn"
      :active-loot="activeLoot"
      :combat-enemies="combatEnemiesList"
      :active-result="activeResult"
      :can-dismiss-results="canDismissResults"
      :can-act="canActInCombat"
      @select-enemy="setCombatTarget"
      @flee="flee"
      @dismiss-results="dismissResults"
      @take-loot="takeLoot"
      @show-tooltip="showTooltip"
      @move-tooltip="moveTooltip"
      @hide-tooltip="hideTooltip"
    />
  </template>
  <template v-else>
    <details
      :style="styles.accordion"
      :open="accordionState.travel"
      @toggle="onTravelAccordionToggle"
    >
      <summary :style="styles.accordionSummary">Travel</summary>
      <TravelPanel
        :styles="styles"
        :conn-active="conn.isActive"
        :selected-character="selectedCharacter"
        :locations="connectedLocations"
        :regions="regions"
        @move="moveTo"
      />
    </details>
    <LocationGrid
      :styles="styles"
      :conn-active="conn.isActive"
      :selected-character="selectedCharacter"
      :characters-here="charactersHere"
      :npcs-here="npcsHere"
      :enemy-spawns="availableEnemies"
      :resource-nodes="resourceNodesHere"
      :can-engage="!!selectedCharacter && (!selectedCharacter.groupId || pullerId === selectedCharacter.id)"
      @pull="(payload) => startPull(payload.enemyId, payload.pullType)"
      @gather-resource="startGather"
      @hail="hailNpc"
      @open-vendor="openVendor"
      @character-action="openCharacterActions"
    />
  </template>
</div>
```

Also update the CombatPanel props to remove the ones we stripped. The combat-mode CombatPanel in the `v-if="activeCombat || activeResult"` block should now only pass combat-relevant props. Remove: `:characters-here`, `:npcs-here`, `:enemy-spawns`, `:resource-nodes`, `:can-engage`, `:accordion-state`, and the emits: `@pull`, `@gather-resource`, `@hail`, `@open-vendor`, `@accordion-toggle`, `@character-action`.

Remove the accordion state keys that are no longer needed from AccordionKey type and accordionState reactive object. Keep `travel` and `enemies` (enemies is still used in CombatPanel for the combat enemies accordion). Remove `resources`, `characters`, `npcs` — those sections are now always visible in the grid (no accordion toggle needed).

Clean up the second CombatPanel instance (the one in the `v-else` block around lines 325-354) — this is now completely replaced by LocationGrid so delete it entirely.
  </action>
  <verify>
    - `npx vue-tsc --noEmit` passes
    - Open the app in browser: out-of-combat view shows grid tiles for enemies/resources/NPCs/characters instead of accordions
    - Right-click on an enemy tile shows context menu with Careful Pull and Body Pull options
    - Right-click on a resource shows Gather option
    - Right-click on NPC shows Talk (and Open Store for vendors)
    - Left-click on enemy tile highlights it with yellow border
    - Enter combat (pull an enemy) — CombatPanel renders identically to before with hp bars, flee button, etc.
    - Combat results with loot display correctly
    - Travel accordion still works
    - Context menu closes on outside click or Escape
  </verify>
  <done>
    CombatPanel is combat-only. LocationGrid renders all out-of-combat location content as a grid with context menus. All actions (pull, gather, hail, vendor, character actions) work via context menus instead of inline buttons. Combat mode is unchanged.
  </done>
</task>

</tasks>

<verification>
1. Out-of-combat: enemies, resources, NPCs, characters display as compact grid tiles (no accordions except Travel)
2. Right-click any tile opens appropriate context menu with correct actions
3. Left-click enemy tile toggles selection highlight
4. Context menu closes on outside click, Escape, or action selection
5. Pull actions work from context menu (both careful and body pull)
6. Gather action works from context menu
7. NPC Talk/Open Store actions work from context menu
8. Character actions open the existing CharacterActionsPanel
9. Combat mode is completely unchanged — hp bars, effects, flee, targeting, results, loot all work
10. No TypeScript errors
</verification>

<success_criteria>
The Location panel uses a grid of compact tiles for all location content. All interactions happen via right-click context menus instead of inline action buttons. Combat mode is unaffected. The UI is cleaner with less button clutter while maintaining full functionality.
</success_criteria>

<output>
After completion, create `.planning/quick/16-refactor-location-panel-flexible-grid-la/16-SUMMARY.md`
</output>
