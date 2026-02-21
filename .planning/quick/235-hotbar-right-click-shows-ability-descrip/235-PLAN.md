---
phase: quick-235
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useHotbar.ts
  - src/App.vue
autonomous: true
requirements: [QUICK-235]

must_haves:
  truths:
    - "Hovering a hotbar ability shows name + stats only (no description)"
    - "Right-clicking a hotbar ability shows a persistent popup with name + description"
    - "The popup stays visible after the mouse leaves the button"
    - "Clicking anywhere on the page dismisses the popup"
    - "Only one popup is visible at a time (right-clicking another replaces it)"
  artifacts:
    - path: "src/composables/useHotbar.ts"
      provides: "hotbarTooltipItem without description field"
    - path: "src/App.vue"
      provides: "abilityPopup ref, showAbilityPopup, hideAbilityPopup, @contextmenu.prevent handler, popup template"
  key_links:
    - from: "hotbar button @contextmenu.prevent"
      to: "showAbilityPopup()"
      via: "inline handler passing slot data + button BoundingClientRect"
    - from: "abilityPopup template"
      to: "abilityPopup ref"
      via: "v-if='abilityPopup.visible'"
    - from: "document click listener"
      to: "hideAbilityPopup()"
      via: "onMounted addEventListener + onBeforeUnmount removeEventListener"
---

<objective>
Change hotbar ability interaction: hover shows stats-only tooltip (no description); right-click shows a persistent description popup that stays until dismissed.

Purpose: Separates quick stat reference (hover) from intentional ability inspection (right-click popup), reducing cognitive clutter on the hotbar.
Output: Modified useHotbar.ts and App.vue with new popup state, handlers, and template.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove description from hotbarTooltipItem</name>
  <files>src/composables/useHotbar.ts</files>
  <action>
In `hotbarTooltipItem` (line ~264), remove the `description` field from the returned object. The function currently returns `{ name, description, stats }` — change it to return `{ name, stats }` only.

Specifically:
- Remove the `const description = ...` line (~line 267) since it is no longer used in the return value.
- Remove `description` from the return object at line ~298.

Do NOT remove the `description` variable if it is referenced anywhere else inside this function — but it is only used in the return, so removal is safe. The `liveAbility?.description` data still exists on the ability object and will be read separately by the popup code in App.vue.
  </action>
  <verify>Grep for `description` inside the `hotbarTooltipItem` function body — it should not appear in the return object.</verify>
  <done>hotbarTooltipItem returns `{ name, stats }` with no `description` field.</done>
</task>

<task type="auto">
  <name>Task 2: Add ability popup state, handlers, right-click wiring, and template in App.vue</name>
  <files>src/App.vue</files>
  <action>
Four changes to App.vue:

**A. Add abilityPopup ref** near the `tooltip` ref (around line 2168):
```ts
const abilityPopup = ref<{
  visible: boolean;
  x: number;
  y: number;
  name: string;
  description: string;
}>({
  visible: false,
  x: 0,
  y: 0,
  name: '',
  description: '',
});
```

**B. Add showAbilityPopup / hideAbilityPopup functions** after `hideTooltip` (~line 2213):
```ts
const showAbilityPopup = (payload: { name: string; description: string; x: number; y: number }) => {
  abilityPopup.value = { visible: true, ...payload };
};

const hideAbilityPopup = () => {
  abilityPopup.value = { visible: false, x: 0, y: 0, name: '', description: '' };
};
```

**C. Add document click listener** to dismiss popup on any click. Hook into the existing `onMounted` / `onBeforeUnmount` blocks. Add:
```ts
// In onMounted:
document.addEventListener('click', hideAbilityPopup);

// In onBeforeUnmount:
document.removeEventListener('click', hideAbilityPopup);
```
If separate `onMounted` / `onBeforeUnmount` blocks already exist (they do for hotbar pulse etc.), add these lines inside those existing blocks — do not create new lifecycle hooks.

**D. Add @contextmenu.prevent handler on hotbar buttons** (around line 122-133). After the existing `@mouseleave` handler, add:
```vue
@contextmenu.prevent="
  slot.abilityKey &&
  showAbilityPopup({
    name: slot.name || slot.abilityKey,
    description: (() => {
      const a = abilityLookup?.get ? abilityLookup.get(slot.abilityKey) : null;
      return (a?.description?.trim()) || slot.description || `${slot.name} ability.`;
    })(),
    x: ($event.currentTarget?.getBoundingClientRect().right ?? $event.clientX) + 12,
    y: ($event.currentTarget?.getBoundingClientRect().top ?? $event.clientY),
  })
"
```

Note: `abilityLookup` is imported from `useHotbar` as `abilityLookup` (it is a ComputedRef<Map>). Access it as `abilityLookup.value.get(slot.abilityKey)` inside the script, but in the template the `.value` is unwrapped automatically. Use `abilityLookup?.get(slot.abilityKey)` in the template expression. If accessing `.value` in the template is needed due to how abilityLookup is exposed, check current template usage patterns — the inline IIFE approach avoids this by using script-scope access. A cleaner approach: derive description in a computed helper instead of the inline IIFE.

**Cleaner approach for D** — add a small helper function in the script section alongside `showAbilityPopup`:
```ts
const hotbarAbilityDescription = (slot: HotbarDisplaySlot): string => {
  const liveAbility = abilityLookup.value.get(slot.abilityKey ?? '');
  return liveAbility?.description?.trim() || slot.description || `${slot.name} ability.`;
};
```
Then simplify the template handler:
```vue
@contextmenu.prevent="
  slot.abilityKey &&
  showAbilityPopup({
    name: slot.name || slot.abilityKey,
    description: hotbarAbilityDescription(slot),
    x: ($event.currentTarget?.getBoundingClientRect().right ?? $event.clientX) + 12,
    y: ($event.currentTarget?.getBoundingClientRect().top ?? $event.clientY),
  })
"
```

`HotbarDisplaySlot` type is already imported via the useHotbar composable — use the same type the other handlers use or use `any` if needed.

**E. Add popup template div** in the template section, just before the closing `</div>` of the root (around line 549, after the tooltip div):
```vue
<div
  v-if="abilityPopup.visible"
  :style="{
    ...styles.tooltip,
    left: `${abilityPopup.x}px`,
    top: `${abilityPopup.y}px`,
    pointerEvents: 'auto',
    maxWidth: '280px',
  }"
  @click.stop
>
  <div :style="styles.tooltipTitle">{{ abilityPopup.name }}</div>
  <div v-if="abilityPopup.description" :style="styles.tooltipLine">{{ abilityPopup.description }}</div>
</div>
```

The `@click.stop` prevents the document click listener from immediately closing the popup when the user right-clicks (since contextmenu fires separately, but any subsequent click on the popup itself should not propagate and close it).

Note on document listener timing: `@contextmenu.prevent` fires on right-click and does not trigger the `click` event, so the document `click` listener won't fire on the same right-click that opens the popup. Left-click anywhere (including a different hotbar button) will dismiss the popup via the document listener.
  </action>
  <verify>
1. Open app in browser
2. Hover a hotbar ability — tooltip should show name + stats, NO description text
3. Right-click a hotbar ability — a popup appears to the right of the button with the ability name and description text
4. Move mouse away from the button — popup stays visible
5. Left-click anywhere on the page — popup disappears
6. Right-click another hotbar ability while popup is open — old popup replaced by new one
  </verify>
  <done>
- Hover tooltip shows name + stats only (no description)
- Right-click shows persistent name + description popup
- Popup dismisses on any page click
- No console errors
  </done>
</task>

</tasks>

<verification>
Run `npm run build` (or `npm run dev` for dev check) — no TypeScript errors.

In the running app:
- Hover hotbar ability: tooltip visible, no description line
- Right-click hotbar ability: popup appears with description
- Click elsewhere: popup gone
- Right-click second ability: popup swaps to new one
</verification>

<success_criteria>
Hotbar hover tooltip shows stats only. Right-click on any hotbar ability with a description shows a persistent popup anchored to the right of the button. Popup dismisses on any left-click.
</success_criteria>

<output>
After completion, create `.planning/quick/235-hotbar-right-click-shows-ability-descrip/235-SUMMARY.md`
</output>
