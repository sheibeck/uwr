---
phase: quick-291
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/FloatingPanel.vue
  - src/composables/useCharacterScope.ts
  - src/composables/useTooltip.ts
  - src/composables/useAudio.ts
  - src/App.vue
autonomous: true
requirements: [REFACTOR-01]
must_haves:
  truths:
    - "All existing floating panels render identically to before (same styles, drag, resize, close behavior)"
    - "All game behavior is unchanged -- zero functional regressions"
    - "App.vue is significantly shorter (target: ~1800 lines, down from 2670)"
  artifacts:
    - path: "src/components/FloatingPanel.vue"
      provides: "Reusable floating panel wrapper with drag/resize/close"
    - path: "src/composables/useCharacterScope.ts"
      provides: "Character-scoped computed property factories"
    - path: "src/composables/useTooltip.ts"
      provides: "Tooltip state management extracted from App.vue"
    - path: "src/composables/useAudio.ts"
      provides: "Sound effects and audio context management"
  key_links:
    - from: "src/App.vue"
      to: "src/components/FloatingPanel.vue"
      via: "component usage replacing inline panel wrappers"
    - from: "src/App.vue"
      to: "src/composables/useCharacterScope.ts"
      via: "composable import"
---

<objective>
Reduce duplication and file size in the frontend `src/` directory. The primary target is App.vue (2670 lines) which contains massive repeated template boilerplate for 14+ floating panels, ~10 nearly-identical character-scoped computed properties, inline audio/tooltip/idle logic, and many single-use reducer wrappers. Extract shared patterns into reusable components and composables. Zero behavior changes.

Purpose: Improve maintainability -- every new panel currently requires copy-pasting ~15 lines of identical wrapper code. Character filtering is repeated ad nauseam. Audio, tooltip, and idle logic clutter the main component.
Output: App.vue reduced by ~800-900 lines through extraction of a FloatingPanel component, a useCharacterScope composable, a useTooltip composable, and a useAudio composable.
</objective>

<context>
@src/App.vue
@src/composables/usePanelManager.ts
@src/ui/styles.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract FloatingPanel wrapper component and useCharacterScope composable</name>
  <files>
    src/components/FloatingPanel.vue
    src/composables/useCharacterScope.ts
    src/App.vue
  </files>
  <action>
**FloatingPanel.vue** -- Create a reusable wrapper component that encapsulates the repeated floating panel pattern. Currently each of the ~14 panels in App.vue repeats this exact structure:

```
<div v-if="panels.X && panels.X.open" data-panel-id="X"
     :style="{ ...styles.floatingPanel, ...(panelStyle('X').value || {}) }"
     @mousedown="bringToFront('X')">
  <div :style="styles.floatingPanelHeader" @mousedown="startDrag('X', $event)">
    <div>Title</div>
    <button :style="styles.panelClose" @click="closePanelById('X')">x</button>
  </div>
  <div :style="styles.floatingPanelBody">
    <!-- actual content via slot -->
  </div>
  <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('X', $event, { right: true })" />
  <div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('X', $event, { bottom: true })" />
  <div :style="styles.resizeHandle" @mousedown.stop="startResize('X', $event, { right: true, bottom: true })" />
</div>
```

The FloatingPanel component should accept these props:
- `panelId: string` (required) -- the panel key (e.g. 'friends', 'crafting')
- `title: string` (required) -- displayed in the header
- `panels: object` (required) -- the panels reactive object from usePanelManager
- `panelStyle: Function` (required) -- the panelStyle function from usePanelManager
- `bringToFront: Function` (required)
- `startDrag: Function` (required)
- `startResize: Function` (required)
- `closePanelById: Function` (required)
- `wide: boolean` (optional, default false) -- adds `styles.floatingPanelWide`
- `compact: boolean` (optional, default false) -- adds `styles.floatingPanelCompact`
- `bodyStyle: object` (optional) -- override the body style (for combat panel's `floatingPanelBodyCombat`)
- `closable: boolean` (optional, default true) -- show the close button
- `headerSlot` -- named slot for custom header content (used by the travel/location panel)

Use a default `<slot>` for the panel body content. The component uses `v-if="panels[panelId]?.open"` internally, so the parent doesn't need to.

IMPORTANT: Some panels DON'T use the standard v-if guard (log, hotbar, travel, group are always-visible). For those, add a prop `alwaysOpen: boolean` (default false) that skips the v-if check.

Then update App.vue to use `<FloatingPanel>` for ALL panel instances. This should eliminate ~200 lines of template boilerplate. Each panel goes from ~6-8 lines of wrapper to ~1-2 lines:

```vue
<FloatingPanel panel-id="friends" title="Friends" :panels="panels" :panel-style="panelStyle"
  :bring-to-front="bringToFront" :start-drag="startDrag" :start-resize="startResize"
  :close-panel-by-id="closePanelById">
  <FriendsPanel ... />
</FloatingPanel>
```

To avoid repeating the panel manager functions on every FloatingPanel, use Vue's provide/inject pattern:
1. In App.vue, `provide('panelManager', { panels, panelStyle, bringToFront, startDrag, startResize, closePanelById })` once.
2. In FloatingPanel.vue, `inject('panelManager')` and use those functions.
3. Then each FloatingPanel usage only needs `panel-id`, `title`, and optional `wide`/`compact`/`always-open`.

**useCharacterScope.ts** -- Extract the ~10 computed properties that follow the pattern "guard on selectedCharacter, filter array by characterId" into a composable. These are:

1. `characterNpcDialogs` (line 1175)
2. `characterQuests` (line 1183)
3. `characterQuestItems` (line 1191)
4. `characterNamedEnemies` (line 1197)
5. `characterSearchResult` (line 1203) -- find instead of filter
6. `characterFactionStandings` (line 1239)
7. `characterRenown` (line 1247) -- find instead of filter
8. `characterRenownPerks` (line 1252)
9. `characterPanelLayouts` (line 1276)

The composable should accept `selectedCharacter` ref and the relevant table refs, and return all these computed values. Signature:

```ts
export function useCharacterScope(opts: {
  selectedCharacter: Ref<any>;
  npcDialogs: Ref<any[]>;
  questInstances: Ref<any[]>;
  questItems: Ref<any[]>;
  namedEnemies: Ref<any[]>;
  searchResults: Ref<any[]>;
  factionStandings: Ref<any[]>;
  renownRows: Ref<any[]>;
  renownPerks: Ref<any[]>;
  panelLayouts: Ref<any[]>;
})
```

This eliminates ~60 lines of repetitive computed boilerplate from App.vue.

Also extract `locationQuestItems` and `locationNamedEnemies` into the same composable since they derive from the character-scoped computeds above.
  </action>
  <verify>
Run `npx vue-tsc --noEmit` to confirm no type errors. Visually confirm the app loads, open several panels (friends, crafting, loot, vendor), verify drag/resize/close all work identically. Open and close the character info panel with keyboard shortcut 'I'. Verify the travel/group panels (always-visible) still render.
  </verify>
  <done>
App.vue template section is ~200 lines shorter. All 14+ floating panels use the FloatingPanel wrapper. Character-scoped computed properties are in useCharacterScope.ts and imported into App.vue. All panel interactions (drag, resize, close, keyboard shortcuts) work exactly as before.
  </done>
</task>

<task type="auto">
  <name>Task 2: Extract useTooltip and useAudio composables from App.vue</name>
  <files>
    src/composables/useTooltip.ts
    src/composables/useAudio.ts
    src/App.vue
  </files>
  <action>
**useTooltip.ts** -- Extract the tooltip state and handlers from App.vue (lines 2450-2557). This includes:

1. `tooltip` ref (item tooltip state: visible, x, y, item, anchor)
2. `abilityPopup` ref (ability popup state: visible, x, y, name, description, stats)
3. `hotbarContextMenu` ref (context menu state)
4. `tooltipRarityColor()` function
5. `showTooltip()`, `moveTooltip()`, `hideTooltip()` functions
6. `showAbilityPopup()`, `hideAbilityPopup()` functions
7. `showHotbarContextMenu()`, `hideHotbarContextMenu()` functions
8. `hotbarAbilityDescription()` helper

The composable should accept `abilityLookup` ref (from useHotbar) as its only dependency. It returns all the above refs and functions.

Import `rarityColor` and `craftQualityColor` inside the composable (from `../ui/colors`).

**useAudio.ts** -- Extract the audio/sound logic from App.vue (lines 1285-1379). This includes:

1. `audioCtxRef` ref
2. `getAudioContext()` function
3. `playTone()` function
4. `playVictorySound()`, `playDefeatSound()`, `playLevelUpSound()` functions
5. The two watchers on `combinedEvents` that trigger victory/defeat/level-up sounds
6. The `onBeforeUnmount` cleanup for audio context

The composable should accept `combinedEvents` ref as its dependency and manage its own watchers + cleanup internally. Signature:

```ts
export function useAudio(opts: { combinedEvents: Ref<any[]> })
```

After extraction, update App.vue to:
1. Import and call `useTooltip({ abilityLookup })` -- destructure all the returned refs/functions
2. Import and call `useAudio({ combinedEvents })` -- no return values needed, it manages itself
3. Remove the extracted code blocks from App.vue
4. The template bindings for tooltip/popup/context-menu remain unchanged since they reference the same variable names

This should eliminate ~150 lines from App.vue's script section.

IMPORTANT: The `craftQualityColor` function is used in the template (line 544) -- make sure it stays imported in App.vue (or re-exported from useTooltip if appropriate). Actually, keep the `craftQualityColor` import in App.vue since it's used directly in template, not through the composable.
  </action>
  <verify>
Run `npx vue-tsc --noEmit` to confirm no type errors. Test in browser: hover over items in inventory/vendor/loot to verify tooltips appear correctly with proper rarity colors and positioning. Right-click a hotbar slot to verify context menu appears. Win a combat to verify victory sound plays. Lose a combat to verify defeat sound plays.
  </verify>
  <done>
useTooltip.ts and useAudio.ts exist as standalone composables. App.vue imports and uses them. All tooltip, popup, context menu, and sound behaviors are unchanged. App.vue is ~150 lines shorter in the script section. Combined with Task 1, App.vue is ~800-900 lines shorter total (from 2670 to ~1800).
  </done>
</task>

</tasks>

<verification>
1. `npx vue-tsc --noEmit` passes with no errors
2. App loads, character can be selected, all panels open/close/drag/resize correctly
3. Hotbar keyboard shortcuts (1-9, 0) still fire abilities
4. Panel keyboard shortcuts (I, J, C, R, E, Q, T, L, M) still toggle panels
5. Item tooltips display on hover with correct rarity colors, affix stats, craft quality
6. Hotbar right-click context menu displays ability stats and "Remove from Hotbar" option
7. Victory/defeat/level-up sounds play at correct moments
8. `wc -l src/App.vue` shows ~1700-1900 lines (down from 2670)
</verification>

<success_criteria>
- App.vue reduced by 700-900 lines through extraction (no inlined logic moved to other existing files)
- 4 new files created: FloatingPanel.vue, useCharacterScope.ts, useTooltip.ts, useAudio.ts
- Zero behavior changes -- every panel, tooltip, sound, and keyboard shortcut works identically
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/291-reorganize-frontend-src-reduce-duplicate/291-SUMMARY.md`
</output>
