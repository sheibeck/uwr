---
phase: 280-ability-right-click-shows-description-th
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/CharacterInfoPanel.vue
  - src/App.vue
autonomous: true
requirements: [QUICK-280]

must_haves:
  truths:
    - "Right-clicking an ability in the Abilities tab shows the description text inline at the top of the context menu popup, not as a separate button"
    - "Right-clicking a filled hotbar slot shows a context menu with the ability description at top and a 'Remove from Hotbar' action"
    - "Clicking 'Remove from Hotbar' clears the slot (calls setHotbarSlot with empty string)"
    - "No 'What does this do?' menu item appears in either context menu"
  artifacts:
    - path: "src/components/CharacterInfoPanel.vue"
      provides: "Abilities tab context menu with inline description"
    - path: "src/App.vue"
      provides: "Hotbar slot context menu with description + remove action"
  key_links:
    - from: "CharacterInfoPanel.vue contextMenu popup"
      to: "contextMenu.value.description"
      via: "inline text div above Add to Hotbar button"
    - from: "App.vue hotbar @contextmenu.prevent"
      to: "hotbarContextMenu ref"
      via: "shows local context menu instead of calling showAbilityPopup directly"
    - from: "Remove from Hotbar button"
      to: "setHotbarSlot(slot.slot, '')"
      via: "click handler in hotbar context menu"
---

<objective>
Overhaul right-click context menus for ability list and hotbar slots so that description text is shown inline at the top of each popup, with action buttons below. Remove the "What does this do?" menu item from both.

Purpose: Surfaces ability descriptions without an extra click; keeps the UI tight.
Output: Updated CharacterInfoPanel.vue (abilities tab) and App.vue (hotbar slot) context menus.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/CharacterInfoPanel.vue
@src/App.vue
@src/composables/useHotbar.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Overhaul Abilities tab context menu in CharacterInfoPanel</name>
  <files>src/components/CharacterInfoPanel.vue</files>
  <action>
In the context menu overlay (lines 148-167), replace the two-button layout with:
1. Remove the "What does this do?" button entirely (remove the `onShowDescription` button and handler).
2. At the top of the popup div, add a non-interactive description section before the "Add to Hotbar" button:

```html
<!-- Description block at top -->
<div
  v-if="contextMenu.description"
  :style="{
    padding: '8px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    color: '#9ca3af',
    fontSize: '0.8rem',
    lineHeight: '1.4',
    maxWidth: '220px',
    whiteSpace: 'normal',
  }"
>{{ contextMenu.description }}</div>
```

Keep only the "Add to Hotbar" button below it. The popup div already has `minWidth: '160px'` — increase to `minWidth: '200px'` so the description has room.

Also delete the `onShowDescription` function from the `<script setup>` block and the `show-ability-popup` emit from the emits definition (only if it is no longer needed — verify it is only used by `onShowDescription` before removing).

The `showContextMenu` call signature already passes `description` (line 120 and 137 in the template). The `contextMenu` ref already stores it. No data flow changes needed.

Note: The renown perks call `showContextMenu($event, perk.perkKey, perk.perkKey, '')` so they will show an empty description block — wrap the description div with `v-if="contextMenu.description"` (already shown above) to hide it when blank.
  </action>
  <verify>Open Character panel, go to Abilities tab. Right-click an ability. Popup should show the description text at the top (in muted grey), then "Add to Hotbar" below it. No "What does this do?" button present. Right-clicking a renown perk should only show "Add to Hotbar" (no description block since description is empty).</verify>
  <done>Abilities tab context menu shows description inline; single "Add to Hotbar" action; "What does this do?" is gone.</done>
</task>

<task type="auto">
  <name>Task 2: Overhaul hotbar slot right-click in App.vue</name>
  <files>src/App.vue</files>
  <action>
Currently the hotbar button's `@contextmenu.prevent` (around line 125) calls `showAbilityPopup(...)` directly. Replace with a local context menu approach:

**Step 1 — Add a reactive ref for the hotbar context menu** near other popup refs (around line 2251 where `abilityPopup` is defined):

```ts
const hotbarContextMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  slot: number;
  name: string;
  description: string;
}>({ visible: false, x: 0, y: 0, slot: 0, name: '', description: '' });
```

**Step 2 — Add show/hide helpers** near the `showAbilityPopup` / `hideAbilityPopup` functions:

```ts
const showHotbarContextMenu = (slot: any, x: number, y: number) => {
  hotbarContextMenu.value = {
    visible: true,
    x,
    y,
    slot: slot.slot,
    name: slot.name || slot.abilityKey,
    description: hotbarAbilityDescription(slot),
  };
};

const hideHotbarContextMenu = () => {
  hotbarContextMenu.value.visible = false;
};
```

**Step 3 — Update the hotbar button's `@contextmenu.prevent` handler** (lines 125-134). Replace the entire `showAbilityPopup({...})` call with:

```
slot.abilityKey &&
showHotbarContextMenu(
  slot,
  ($event.currentTarget?.getBoundingClientRect().right ?? $event.clientX) + 4,
  ($event.currentTarget?.getBoundingClientRect().top ?? $event.clientY)
)
```

**Step 4 — Add the context menu popup element** in the template. Place it alongside other overlay popups (near the `abilityPopup` div, around line 550). Use the same styling pattern as CharacterInfoPanel's context menu:

```html
<!-- Hotbar slot context menu -->
<div
  v-if="hotbarContextMenu.visible"
  :style="{
    position: 'fixed',
    left: hotbarContextMenu.x + 'px',
    top: hotbarContextMenu.y + 'px',
    background: '#1f2937',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px',
    zIndex: 9999,
    minWidth: '200px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  }"
  @mouseleave="hideHotbarContextMenu"
>
  <div
    v-if="hotbarContextMenu.description"
    :style="{
      padding: '8px 14px',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      color: '#9ca3af',
      fontSize: '0.8rem',
      lineHeight: '1.4',
      maxWidth: '220px',
      whiteSpace: 'normal',
    }"
  >{{ hotbarContextMenu.description }}</div>
  <button
    type="button"
    :style="{
      display: 'block',
      width: '100%',
      padding: '8px 14px',
      background: 'transparent',
      border: 'none',
      color: '#e5e7eb',
      fontSize: '0.85rem',
      cursor: 'pointer',
      textAlign: 'left',
    }"
    @click="setHotbarSlot(hotbarContextMenu.slot, ''); hideHotbarContextMenu()"
  >Remove from Hotbar</button>
</div>
```

`setHotbarSlot` is already destructured from `useHotbar` in App.vue (line 1919). Passing `''` as `abilityKey` clears the slot (the reducer accepts an empty string to clear).
  </action>
  <verify>Right-click a filled hotbar slot. A context menu appears with the ability description at the top (grey text) and "Remove from Hotbar" below. Clicking "Remove from Hotbar" clears the slot. Right-clicking an empty slot does nothing (guarded by `slot.abilityKey &&`).</verify>
  <done>Hotbar right-click shows description + "Remove from Hotbar". Clicking remove clears the slot. Empty slots produce no menu.</done>
</task>

</tasks>

<verification>
- No TypeScript compile errors (`npm run build` or `npx tsc --noEmit`)
- CharacterInfoPanel abilities tab: right-click shows description inline, single action "Add to Hotbar", no "What does this do?"
- CharacterInfoPanel renown perks: right-click shows only "Add to Hotbar" (description div is hidden when empty)
- Hotbar: right-click filled slot shows description + "Remove from Hotbar"
- Hotbar: clicking "Remove from Hotbar" empties the slot
- Hotbar: right-click empty slot shows nothing
</verification>

<success_criteria>
Both context menus show ability description inline at top with action(s) below. "What does this do?" is gone from both. Hotbar slot can be cleared via right-click menu.
</success_criteria>

<output>
After completion, create `.planning/quick/280-ability-right-click-shows-description-th/280-SUMMARY.md`
</output>
