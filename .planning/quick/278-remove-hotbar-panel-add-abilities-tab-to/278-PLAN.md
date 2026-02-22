---
phase: quick-278
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ActionBar.vue
  - src/components/CharacterInfoPanel.vue
  - src/App.vue
autonomous: true
requirements: [278]

must_haves:
  truths:
    - "The 'Hotbar' button no longer appears in the ActionBar"
    - "The HotbarPanel floating panel is gone from the UI"
    - "The Character panel has an 'Abilities' tab alongside Inventory / Stats / Race"
    - "The Abilities tab lists all class abilities unlocked at character level, then all active renown perks"
    - "Right-clicking an item on the Abilities tab shows a context menu with 'What does this do?' and 'Add to Hotbar'"
    - "'What does this do?' shows the description in an inline tooltip or popup (same showAbilityPopup pattern as hotbar slots)"
    - "'Add to Hotbar' prompts for a slot number 1-10 and calls setHotbarSlot with the ability key or perk key"
    - "The onboarding guide says 'open Character > Abilities tab' instead of 'open Hotbar'"
  artifacts:
    - path: "src/components/ActionBar.vue"
      provides: "ActionBar without Hotbar button"
    - path: "src/components/CharacterInfoPanel.vue"
      provides: "Character panel with Abilities tab"
    - path: "src/App.vue"
      provides: "Wired availableAbilities + characterRenownPerks into CharacterInfoPanel; updated onboarding; add-ability-to-hotbar handler"
  key_links:
    - from: "CharacterInfoPanel.vue Abilities tab"
      to: "App.vue onAddAbilityToHotbar handler"
      via: "emit('add-ability-to-hotbar', abilityKey, name)"
    - from: "App.vue"
      to: "CharacterInfoPanel"
      via: ":available-abilities and :renown-perks props"
---

<objective>
Remove the dedicated Hotbar panel button from the action bar and hide the HotbarPanel UI. Add an "Abilities" tab to the Character panel that lists class abilities and active renown perks, with right-click context menus supporting description viewing and hotbar assignment.

Purpose: Consolidate ability management into the Character panel rather than a separate panel; the physical hotbar slots remain fully functional.
Output: ActionBar without Hotbar button; CharacterInfoPanel with Abilities tab; updated onboarding text.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove Hotbar button from ActionBar and HotbarPanel from App.vue</name>
  <files>src/components/ActionBar.vue, src/App.vue</files>
  <action>
**ActionBar.vue:**
- Remove the entire `<button>` block that emits `toggle('hotbarPanel')` (the "Hotbar" button, currently lines 24-30).
- Remove `'hotbarPanel'` from the `PanelKey` union type in the script.
- Remove the `highlight-hotbar` prop and its usage in `actionStyle()` — `highlightHotbar` prop and the `hotbarPanel` highlight branch in `actionStyle`.

**App.vue:**
- Remove the `<!-- Hotbar Panel -->` floating panel div (the `v-if="panels.hotbarPanel && panels.hotbarPanel.open"` block).
- The `HotbarPanel` component import can remain since the panel is still togglable via keyboard shortcuts; just remove the dedicated button and the floating panel wrapper. Actually, the panel IS the wrapper — since the button drives the panel, remove both. Also remove the `HotbarPanel` import from App.vue's import list since it's no longer used.
- In the onboarding logic:
  - Change `onboardingStep` type from `'inventory' | 'hotbar' | null` to `'inventory' | 'abilities' | null`.
  - Change the `'hotbar'` hint to: `'Next, open Character > Abilities tab to assign your abilities to the hotbar.'`
  - Change the `highlightHotbar` computed to always return `false` (or remove it entirely since ActionBar no longer uses it — but keep the prop passed to ActionBar as `false` for safety, or remove `:highlight-hotbar` from ActionBar usage in App.vue).
  - Update the `openPanels` watcher: the `onboardingStep === 'hotbar'` branch that watches for `hotbarPanel` should instead watch for `characterInfo` when step is `'abilities'` (i.e., when characterInfo opens during the abilities step, clear onboarding to null).
  - Update the watcher: when `onboardingStep === 'inventory'` and characterInfo panel opens → set step to `'abilities'`. When `onboardingStep === 'abilities'` and characterInfo panel opens again (it was already open), dismiss (set null). Simplest approach: when inventory step completes (characterInfo opens), advance to `'abilities'`; then immediately set to null since the user has already opened characterInfo — OR just set to null after inventory step since the Abilities tab is within the same panel they just opened.

  Simplest correct behavior: when `onboardingStep === 'inventory'` and `'characterInfo'` panel opens → set `onboardingStep.value = null` (the guide is done, the abilities tab is right there in the same panel).

- Remove `:highlight-hotbar="highlightHotbar"` from the `<ActionBar>` usage in the template (or pass `:highlight-hotbar="false"`). Since ActionBar prop is being removed, just remove the prop binding.
  </action>
  <verify>
    - `grep -n "hotbarPanel\|HotbarPanel\|highlight-hotbar" src/components/ActionBar.vue` returns no results
    - `grep -n "HotbarPanel" src/App.vue` returns no results (import and panel div gone)
    - `grep -n "onboardingStep" src/App.vue` shows updated messages referencing "Abilities tab" instead of "Hotbar"
  </verify>
  <done>
    No "Hotbar" button in ActionBar. No HotbarPanel floating panel div in App.vue. Onboarding hint references Character > Abilities tab. App compiles without TypeScript errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Abilities tab to CharacterInfoPanel and wire it up in App.vue</name>
  <files>src/components/CharacterInfoPanel.vue, src/App.vue</files>
  <action>
**CharacterInfoPanel.vue:**

Add props for `availableAbilities` (array of `AbilityTemplateRow`) and `renownPerks` (array of `RenownPerkRow`), plus a new emit `add-ability-to-hotbar` and `show-ability-popup`.

Import types at top of script:
```ts
import type { AbilityTemplateRow, RenownPerkRow } from '../module_bindings';
```

Add to `defineProps`:
```ts
availableAbilities: AbilityTemplateRow[];
renownPerks: RenownPerkRow[];
```

Add to `defineEmits`:
```ts
(e: 'add-ability-to-hotbar', abilityKey: string, name: string): void;
(e: 'show-ability-popup', payload: { name: string; description: string; x: number; y: number }): void;
```

Change `activeTab` type to include `'abilities'`:
```ts
const activeTab = ref<'inventory' | 'stats' | 'race' | 'abilities'>('inventory');
```

Add a 4th tab button in the tab bar (after Race):
```html
<button
  type="button"
  @click="activeTab = 'abilities'"
  :style="{
    background: activeTab === 'abilities' ? 'rgba(255,255,255,0.08)' : 'transparent',
    borderBottom: activeTab === 'abilities' ? '2px solid #60a5fa' : '2px solid transparent',
    padding: '8px 16px',
    cursor: 'pointer',
    color: activeTab === 'abilities' ? '#fff' : '#d1d5db',
    fontSize: '0.85rem',
    fontWeight: 600,
    border: 'none',
    outline: 'none',
  }"
>Abilities</button>
```

Add the Abilities tab content panel (after the Race `v-else-if` block):
```html
<div v-else-if="activeTab === 'abilities'" :style="{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '4px 0' }">
  <!-- Class abilities section -->
  <div :style="{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }">
    Class Abilities
  </div>
  <div
    v-for="ability in availableAbilities"
    :key="ability.key"
    :style="{ background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '6px 10px', cursor: 'context-menu' }"
    @contextmenu.prevent="showContextMenu($event, ability.key, ability.name, ability.description)"
  >
    <div :style="{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }">
      <span :style="{ fontWeight: 600, fontSize: '0.85rem' }">{{ ability.name }}</span>
      <span :style="{ fontSize: '0.75rem', color: '#9ca3af' }">Lv{{ ability.level }}</span>
    </div>
    <div :style="{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }">{{ ability.resource }} &bull; {{ ability.kind }}</div>
  </div>

  <!-- Renown perks section -->
  <div v-if="renownPerks.length > 0" :style="{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '8px', marginBottom: '2px' }">
    Active Renown Perks
  </div>
  <div
    v-for="perk in renownPerks"
    :key="String(perk.id)"
    :style="{ background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '6px 10px', cursor: 'context-menu' }"
    @contextmenu.prevent="showContextMenu($event, perk.perkKey, perk.perkKey, '')"
  >
    <span :style="{ fontWeight: 600, fontSize: '0.85rem' }">{{ perk.perkKey }}</span>
  </div>

  <div v-if="availableAbilities.length === 0" :style="{ color: '#6b7280', fontSize: '0.85rem' }">
    No abilities unlocked yet.
  </div>
</div>
```

Add context menu state and logic in `<script setup>`:
```ts
import { ref, computed } from 'vue';

const contextMenu = ref<{ visible: boolean; x: number; y: number; abilityKey: string; name: string; description: string }>({
  visible: false, x: 0, y: 0, abilityKey: '', name: '', description: '',
});

const showContextMenu = (event: MouseEvent, abilityKey: string, name: string, description: string) => {
  contextMenu.value = { visible: true, x: event.clientX, y: event.clientY, abilityKey, name, description };
};

const hideContextMenu = () => {
  contextMenu.value.visible = false;
};

const onShowDescription = () => {
  emit('show-ability-popup', {
    name: contextMenu.value.name,
    description: contextMenu.value.description || '(No description available)',
    x: contextMenu.value.x + 12,
    y: contextMenu.value.y,
  });
  hideContextMenu();
};

const onAddToHotbar = () => {
  emit('add-ability-to-hotbar', contextMenu.value.abilityKey, contextMenu.value.name);
  hideContextMenu();
};
```

Add a context menu overlay at the bottom of `<template>` (before the closing tag):
```html
<div
  v-if="contextMenu.visible"
  :style="{
    position: 'fixed', left: contextMenu.x + 'px', top: contextMenu.y + 'px',
    background: '#1f2937', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px',
    zIndex: 9999, minWidth: '160px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  }"
  @mouseleave="hideContextMenu"
>
  <button
    type="button"
    :style="{ display: 'block', width: '100%', padding: '8px 14px', background: 'transparent', border: 'none', color: '#e5e7eb', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }"
    @click="onShowDescription"
  >What does this do?</button>
  <button
    type="button"
    :style="{ display: 'block', width: '100%', padding: '8px 14px', background: 'transparent', border: 'none', color: '#e5e7eb', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }"
    @click="onAddToHotbar"
  >Add to Hotbar</button>
</div>
```

**App.vue:**

In the `<CharacterInfoPanel>` usage (line ~171), add the new props and event handlers:
- `:available-abilities="availableAbilities"`
- `:renown-perks="characterRenownPerks"`
- `@add-ability-to-hotbar="onAddAbilityToHotbar"`
- `@show-ability-popup="onShowAbilityPopupFromPanel"`

Add handlers in App.vue script:
```ts
const onAddAbilityToHotbar = (abilityKey: string, name: string) => {
  const input = window.prompt(`Assign "${name}" to hotbar slot (1-10):`);
  if (input === null) return;
  const slotNum = parseInt(input, 10);
  if (isNaN(slotNum) || slotNum < 1 || slotNum > 10) return;
  setHotbarSlot(slotNum, abilityKey);
};

const onShowAbilityPopupFromPanel = (payload: { name: string; description: string; x: number; y: number }) => {
  showAbilityPopup(payload);
};
```

Note: `showAbilityPopup` already exists in App.vue (used by the hotbar slots' right-click). Reuse it here.

For renown perk display names in the Abilities tab: `perk.perkKey` is a raw key string like `'iron_will'`. The RENOWN_PERK_POOLS lookup lives in RenownPanel.vue — do NOT duplicate it. Instead, pass the perk's perkKey as-is for now; the description fallback will be `'(No description available)'` since we don't have the lookup in CharacterInfoPanel. This is acceptable for the MVP — the context menu description shows whatever is available.

If desired (and simple), import the RENOWN_PERK_POOLS constant from RenownPanel or extract it to a shared file. Since it is currently embedded in RenownPanel.vue as a local `const`, the simplest approach without refactoring is to just display the raw `perkKey` and note that a future task can extract RENOWN_PERK_POOLS to a shared data file for proper name/description display.
  </action>
  <verify>
    - Character panel shows 4 tabs: Inventory, Stats, Race, Abilities
    - Clicking Abilities tab shows class abilities and renown perks
    - Right-clicking an ability shows a context menu with "What does this do?" and "Add to Hotbar"
    - "What does this do?" fires showAbilityPopup with name + description
    - "Add to Hotbar" prompts for slot and calls setHotbarSlot
    - `npm run build` (or `npm run typecheck`) completes without TypeScript errors
  </verify>
  <done>
    CharacterInfoPanel has an Abilities tab listing class abilities (filtered by level) and renown perks. Right-click context menu on each row works. App.vue passes the correct props and handles both new emits. Build is error-free.
  </done>
</task>

</tasks>

<verification>
1. Open the game — the ActionBar footer has no "Hotbar" button
2. Create a new character — onboarding hint says "open Character > Abilities tab" (not "open Hotbar")
3. Open Character panel — 4 tabs visible: Inventory, Stats, Race, Abilities
4. Click Abilities tab — see list of class abilities at/below character level, and renown perks section below
5. Right-click any ability row — context menu appears with "What does this do?" and "Add to Hotbar"
6. "What does this do?" shows the ability description popup
7. "Add to Hotbar" prompts for slot, entering a valid number assigns it to the hotbar slots panel
8. The physical hotbar (top-left floating bar) still works correctly and reflects the new assignment
</verification>

<success_criteria>
- Hotbar button removed from ActionBar; HotbarPanel floating panel removed from App.vue
- CharacterInfoPanel "Abilities" tab renders availableAbilities (class + level filtered) and characterRenownPerks
- Right-click context menu on each ability row has both "What does this do?" (description) and "Add to Hotbar" (slot prompt -> setHotbarSlot)
- Onboarding text updated to reference Character > Abilities tab
- No TypeScript build errors
</success_criteria>

<output>
After completion, create `.planning/quick/278-remove-hotbar-panel-add-abilities-tab-to/278-SUMMARY.md`
</output>
