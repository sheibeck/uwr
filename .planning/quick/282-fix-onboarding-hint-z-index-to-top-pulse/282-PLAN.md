---
phase: quick
plan: 282
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ui/styles.ts
  - src/App.vue
  - src/components/ActionBar.vue
  - src/components/CharacterInfoPanel.vue
autonomous: true
requirements: [QUICK-282]

must_haves:
  truths:
    - "Onboarding hint renders above all floating panels and most UI elements"
    - "Character button in ActionBar pulses with orange glow while onboarding is active"
    - "Inventory and Abilities tabs in CharacterInfoPanel pulse with orange glow while onboarding is active"
    - "Onboarding hint auto-dismisses only when the Abilities tab is opened"
    - "Dismiss button still manually closes the hint"
  artifacts:
    - path: "src/ui/styles.ts"
      provides: "Updated onboardingHint z-index (9000)"
    - path: "src/App.vue"
      provides: "Corrected dismiss watch, onboardingStep prop passed to CharacterInfoPanel"
    - path: "src/components/ActionBar.vue"
      provides: "Pulse class/animation on Character button when highlightInventory is true"
    - path: "src/components/CharacterInfoPanel.vue"
      provides: "Pulse on Inventory and Abilities tab buttons when onboarding prop is true, emits tab-change event"
  key_links:
    - from: "src/App.vue"
      to: "src/components/CharacterInfoPanel.vue"
      via: ":onboarding prop and @tab-change event"
    - from: "src/App.vue (watch)"
      to: "onboardingStep.value = null"
      via: "tab-change event only when tab === 'abilities'"
---

<objective>
Fix the new-character onboarding guide UX: raise its z-index to sit above all panels, add pulsing orange glow to the Character ActionBar button and to the Inventory/Abilities tabs inside CharacterInfoPanel, and change the auto-dismiss trigger from "character panel opens" to "Abilities tab is opened".

Purpose: Guide new players visually to the right steps without being obscured by other panels.
Output: Four files updated — styles.ts, App.vue, ActionBar.vue, CharacterInfoPanel.vue.
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
  <name>Task 1: Raise onboarding hint z-index and add CSS pulse animation</name>
  <files>src/ui/styles.ts, src/App.vue</files>
  <action>
**src/ui/styles.ts — raise z-index:**

Find `onboardingHint` style object (currently `zIndex: 500`). Change to `zIndex: 9000`. This places it above floating panels (zIndex 6), above the command bar (zIndex 100), but below the death screen overlay (zIndex 9999).

**src/App.vue — add keyframe + CSS class for orange button pulse:**

In the `<style>` block at the bottom of App.vue, add a new keyframe and class for the onboarding button pulse (reuse the orange color already used for lootBorderPulse — rgba(255, 180, 40, ...)):

```css
@keyframes onboardingButtonPulse {
  0%   { box-shadow: 0 0 0 0 rgba(255, 165, 0, 0.0);   border-color: rgba(255,255,255,0.15); }
  40%  { box-shadow: 0 0 0 6px rgba(255, 165, 0, 0.55); border-color: rgba(255, 165, 0, 0.90); }
  70%  { box-shadow: 0 0 0 3px rgba(255, 165, 0, 0.30); border-color: rgba(255, 165, 0, 0.60); }
  100% { box-shadow: 0 0 0 0 rgba(255, 165, 0, 0.0);   border-color: rgba(255,255,255,0.15); }
}

.onboarding-pulse {
  animation: onboardingButtonPulse 1.4s ease-in-out infinite;
  border: 1px solid rgba(255, 165, 0, 0.80) !important;
}
```

**src/App.vue — fix auto-dismiss watch:**

The existing watch at line ~2144 dismisses when `characterInfo` panel opens (wrong). Replace it with a watch on a new `@tab-change` event from CharacterInfoPanel (wired in Task 2). Remove the old `openPanels` watch that clears `onboardingStep`.

Add a handler function:
```typescript
const onCharacterTabChange = (tab: string) => {
  if (onboardingStep.value !== null && tab === 'abilities') {
    onboardingStep.value = null;
  }
};
```

Wire it to CharacterInfoPanel in the template:
`@tab-change="onCharacterTabChange"`

Remove the old watch block:
```typescript
// DELETE THIS:
watch(
  () => [...openPanels.value],
  (panels) => {
    if (onboardingStep.value === 'inventory' && panels.includes('characterInfo')) {
      onboardingStep.value = null;
    }
  }
);
```
  </action>
  <verify>Open browser, create new character — onboarding hint should appear on top of any open panel. Verify the hint is not clipped by floating panels. Check browser console for no errors.</verify>
  <done>onboardingHint z-index is 9000 in styles.ts; onboardingButtonPulse keyframe and .onboarding-pulse class exist in App.vue style block; old openPanels watch removed; onCharacterTabChange handler added and wired to CharacterInfoPanel.</done>
</task>

<task type="auto">
  <name>Task 2: Pulse Character button in ActionBar; pulse tabs and emit tab-change in CharacterInfoPanel</name>
  <files>src/components/ActionBar.vue, src/components/CharacterInfoPanel.vue</files>
  <action>
**src/components/ActionBar.vue — add pulse class to Character button:**

The Character button (line ~17-23) currently uses `:style="actionStyle('characterInfo')"`. Add a `:class` binding so it also gets the `onboarding-pulse` CSS class when `highlightInventory` is true:

```html
<button
  @click="emit('toggle', 'characterInfo')"
  :style="actionStyle('characterInfo')"
  :class="{ 'onboarding-pulse': props.highlightInventory }"
  :disabled="isLocked('characterInfo')"
>
  Character
</button>
```

No other changes to ActionBar.vue needed — `highlightInventory` prop already exists.

**src/components/CharacterInfoPanel.vue — add `onboarding` prop, emit `tab-change`, pulse tab buttons:**

1. Add prop `onboarding: boolean` to defineProps (default false is fine via optional `?`):
```typescript
defineProps<{
  // ... existing props ...
  onboarding?: boolean;
}>();
```

2. Add `tab-change` to defineEmits:
```typescript
defineEmits<{
  // ... existing emits ...
  (e: 'tab-change', tab: string): void;
}>();
```

3. Wrap all tab click handlers to also emit `tab-change`. Create a helper:
```typescript
const setTab = (tab: 'inventory' | 'stats' | 'race' | 'abilities') => {
  activeTab.value = tab;
  emit('tab-change', tab);
};
```
Replace all `@click="activeTab = 'inventory'"` etc. with `@click="setTab('inventory')"` etc. (four tab buttons total).

4. Add orange pulse style to Inventory and Abilities tab buttons when `onboarding` is true. In the `:style` binding for the Inventory tab button, merge an additional conditional style:
```typescript
// Add to Inventory tab button :style (merged):
...(props.onboarding ? { boxShadow: '0 0 0 2px rgba(255,165,0,0.7)', borderBottom: '2px solid rgba(255,165,0,0.9)', color: '#ffa500' } : {})
```
Same for Abilities tab button. Stats and Race tabs do NOT get the pulse treatment.

Note: The existing borderBottom style already handles active/inactive state — the orange override should only apply when `props.onboarding` is true AND the tab is not already active (to avoid fighting the active blue underline). Keep it simple: apply the orange when `props.onboarding` is true regardless; the visual guidance benefit outweighs the style conflict on the active tab.
  </action>
  <verify>
1. Create new character — Character button in ActionBar should pulse orange continuously.
2. Open Character panel — Inventory and Abilities tabs should have orange glow/underline.
3. Click Inventory tab — hint stays, onboarding NOT dismissed.
4. Click Abilities tab — hint dismisses, pulse stops on Character button and tabs.
5. Click Dismiss button on hint — same result (hint gone, pulse stops).
  </verify>
  <done>Character button has :class="{ 'onboarding-pulse': props.highlightInventory }"; CharacterInfoPanel has onboarding prop, tab-change emit, setTab helper used by all four tab buttons, and orange pulse style on Inventory and Abilities tab buttons when onboarding is true.</done>
</task>

</tasks>

<verification>
After both tasks:
- `src/ui/styles.ts`: `onboardingHint.zIndex` === 9000
- `src/App.vue`: `.onboarding-pulse` CSS class present, `onCharacterTabChange` function exists, old `openPanels` watch for onboarding is removed, `@tab-change="onCharacterTabChange"` on CharacterInfoPanel usage
- `src/components/ActionBar.vue`: Character button has `:class="{ 'onboarding-pulse': props.highlightInventory }"`
- `src/components/CharacterInfoPanel.vue`: `onboarding` prop, `tab-change` emit, `setTab` helper, orange pulse on Inventory + Abilities tabs
</verification>

<success_criteria>
- Onboarding hint renders above all floating panels (z-index 9000)
- Character button in ActionBar pulses orange while hint is active
- Inventory and Abilities tabs pulse orange while hint is active
- Opening Inventory tab does NOT dismiss the hint
- Opening Abilities tab DOES dismiss the hint
- Dismiss button still works
- No TypeScript errors, no console errors
</success_criteria>

<output>
After completion, create `.planning/quick/282-fix-onboarding-hint-z-index-to-top-pulse/282-SUMMARY.md`
</output>
