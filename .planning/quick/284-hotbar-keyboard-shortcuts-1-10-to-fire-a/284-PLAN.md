---
phase: quick
plan: 284
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
autonomous: true
requirements:
  - QUICK-284
must_haves:
  truths:
    - "Pressing 1-9 fires hotbar slots 1-9 respectively"
    - "Pressing 0 fires hotbar slot 10"
    - "Keypresses are ignored when any text input or textarea has focus"
    - "The same onHotbarClick logic (cooldown, cast guards, resource checks) applies"
  artifacts:
    - path: "src/App.vue"
      provides: "Global keydown listener wired to onHotbarClick"
      contains: "handleHotbarKeydown"
  key_links:
    - from: "handleHotbarKeydown"
      to: "onHotbarClick"
      via: "hotbarDisplay[slotIndex - 1]"
      pattern: "onHotbarClick\\(hotbarDisplay"
---

<objective>
Add keyboard shortcuts so pressing 1–9 fires hotbar slots 1–9 and pressing 0 fires hotbar slot 10. The handler skips when a text input or textarea is focused (e.g. command bar).

Purpose: Quality-of-life improvement — players can fire abilities with number keys without leaving the keyboard.
Output: Modified src/App.vue with a document-level keydown listener added in onMounted/removed in onBeforeUnmount.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add global hotbar keyboard shortcut listener to App.vue</name>
  <files>src/App.vue</files>
  <action>
In the `<script setup>` section of App.vue, define a handler function `handleHotbarKeydown` near the other event handler functions (e.g. near `onPanelMouseMove`):

```typescript
const handleHotbarKeydown = (e: KeyboardEvent) => {
  // Skip if any text input or textarea has focus
  const target = e.target as HTMLElement;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

  // Map key to hotbar slot index (1-9 → slots 1-9, 0 → slot 10)
  let slotIndex: number | null = null;
  if (e.key >= '1' && e.key <= '9') {
    slotIndex = Number(e.key);
  } else if (e.key === '0') {
    slotIndex = 10;
  }
  if (slotIndex === null) return;

  const slot = hotbarDisplay.value[slotIndex - 1];
  if (!slot?.abilityKey) return;
  onHotbarClick(slot);
};
```

Then in `onMounted`, add:
```typescript
document.addEventListener('keydown', handleHotbarKeydown);
```

And in `onBeforeUnmount`, add:
```typescript
document.removeEventListener('keydown', handleHotbarKeydown);
```

Both `onMounted` and `onBeforeUnmount` already exist in App.vue — append to their existing bodies. Do not create new lifecycle hooks.

Note: `hotbarDisplay` is already in scope (returned from `useHotbar`). `onHotbarClick` is already in scope. No new imports are needed.
  </action>
  <verify>
1. Open the app in a browser with a character selected that has abilities on the hotbar.
2. Press `1` — the ability in slot 1 should fire (same effect as clicking it).
3. Press `0` — the ability in slot 10 should fire.
4. Click into a text input (e.g. command bar), type `1` — no ability should fire, the character `1` should appear in the input.
5. Press Escape to blur the input, then press `1` again — ability fires.
  </verify>
  <done>Keys 1-9 fire hotbar slots 1-9; key 0 fires slot 10; keypresses inside text inputs are ignored; all existing onHotbarClick guards (casting, cooldown, combat state, resources) still apply.</done>
</task>

</tasks>

<verification>
- `document.addEventListener('keydown', handleHotbarKeydown)` present in onMounted block
- `document.removeEventListener('keydown', handleHotbarKeydown)` present in onBeforeUnmount block
- `handleHotbarKeydown` checks `tagName === 'INPUT'`, `tagName === 'TEXTAREA'`, and `isContentEditable`
- Slot index maps key `'0'` to slotIndex `10` (not 0)
- `hotbarDisplay.value[slotIndex - 1]` used to get the correct slot object
</verification>

<success_criteria>
Pressing number keys 1-9 and 0 fires the corresponding hotbar slot ability using the existing onHotbarClick path, with no effect when a text input is focused.
</success_criteria>

<output>
After completion, create `.planning/quick/284-hotbar-keyboard-shortcuts-1-10-to-fire-a/284-SUMMARY.md`
</output>
