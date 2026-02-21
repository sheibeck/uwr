---
phase: 241-loot-window-border-pulse-glow-when-updat
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
autonomous: true
requirements: [LOOT-PULSE-01]

must_haves:
  truths:
    - "When pendingLoot gains new items, the loot panel border glows amber/gold"
    - "The glow pulses for ~3-4 seconds then stops automatically"
    - "The glow does not reactivate if items are merely taken (count decreasing)"
    - "The panel header text 'Loot' is visible and unaffected by the animation"
  artifacts:
    - path: "src/App.vue"
      provides: "lootPanelPulsing ref, watcher trigger, CSS keyframe, conditional class on loot panel div"
      contains: "lootBorderPulse"
  key_links:
    - from: "pendingLoot watcher (App.vue)"
      to: "lootPanelPulsing ref"
      via: "watch on pendingLoot.value.length with prevCount guard"
      pattern: "lootPanelPulsing\\.value = true"
    - from: "loot panel outer div"
      to: "CSS animation"
      via: "conditional class binding"
      pattern: "loot-panel-pulse"
---

<objective>
Add a glowing amber/gold border pulse animation to the loot panel that fires whenever new loot arrives after combat.

Purpose: Draw the player's attention to the loot panel so they notice new items without having to watch it passively.
Output: A ref-driven CSS animation class applied to the loot panel's outer div in App.vue.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/App.vue
@src/components/LootPanel.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add lootPanelPulsing ref and watcher trigger in App.vue</name>
  <files>src/App.vue</files>
  <action>
In the `<script setup>` block of `src/App.vue`, add a reactive ref and update the existing loot watcher:

1. Near the other reactive refs (around line 1292 where the loot watcher exists), add:
   ```ts
   const lootPanelPulsing = ref(false);
   let lootPulseTimer: ReturnType<typeof setTimeout> | null = null;
   ```

2. Update the existing loot watcher (the one at ~line 1293 that watches `pendingLoot.value.length`) to also trigger the pulse when count *increases*:
   ```ts
   watch(
     () => pendingLoot.value.length,
     (count, prevCount) => {
       console.log('[LOOT DEBUG] pendingLoot changed:', prevCount, '->', count);
       if (count > 0 && (prevCount === 0 || prevCount === undefined)) {
         openPanel('loot');
       }
       // Pulse when new items arrive (count increased)
       if (count > (prevCount ?? 0)) {
         if (lootPulseTimer !== null) clearTimeout(lootPulseTimer);
         lootPanelPulsing.value = true;
         lootPulseTimer = setTimeout(() => {
           lootPanelPulsing.value = false;
           lootPulseTimer = null;
         }, 3500);
       }
     }
   );
   ```

Do NOT create a new watcher — merge the pulse logic into the existing one.
  </action>
  <verify>No TypeScript errors: run `npm run type-check` or confirm the Vue dev server compiles cleanly.</verify>
  <done>lootPanelPulsing ref exists, pulse timer sets it true on count increase and auto-clears after 3.5 seconds, existing openPanel behavior preserved.</done>
</task>

<task type="auto">
  <name>Task 2: Apply pulse class to loot panel div and add CSS keyframe</name>
  <files>src/App.vue</files>
  <action>
Two changes in `src/App.vue`:

**A. Template (line ~226) — add conditional class to the loot panel outer div:**

The current loot panel outer div is:
```html
<div v-if="panels.loot && panels.loot.open" data-panel-id="loot" :style="{ ...styles.floatingPanel, ...(panelStyle('loot').value || {}) }" @mousedown="bringToFront('loot')">
```

Add `:class="{ 'loot-panel-pulse': lootPanelPulsing }"` to it:
```html
<div v-if="panels.loot && panels.loot.open" data-panel-id="loot" :class="{ 'loot-panel-pulse': lootPanelPulsing }" :style="{ ...styles.floatingPanel, ...(panelStyle('loot').value || {}) }" @mousedown="bringToFront('loot')">
```

**B. `<style>` block (at the bottom of the file) — add the keyframe and class:**

Add inside the existing `<style>` block alongside `combatPulse` and `loadingPulse`:
```css
@keyframes lootBorderPulse {
  0%   { box-shadow: 0 0 4px 2px rgba(255, 180, 40, 0.0),  border-color: rgba(255, 255, 255, 0.10); }
  20%  { box-shadow: 0 0 12px 5px rgba(255, 180, 40, 0.75), border-color: rgba(255, 190, 60, 0.90); }
  50%  { box-shadow: 0 0 20px 8px rgba(255, 160, 20, 0.55), border-color: rgba(255, 200, 80, 0.80); }
  80%  { box-shadow: 0 0 12px 5px rgba(255, 180, 40, 0.40), border-color: rgba(255, 190, 60, 0.60); }
  100% { box-shadow: 0 0 4px 2px rgba(255, 180, 40, 0.0),  border-color: rgba(255, 255, 255, 0.10); }
}

.loot-panel-pulse {
  animation: lootBorderPulse 0.9s ease-in-out 4;
  border: 1px solid rgba(255, 190, 60, 0.70) !important;
}
```

The animation runs 4 cycles × 0.9s = 3.6 seconds total, matching the 3.5s ref timer.
  </action>
  <verify>
1. Start the dev server (`npm run dev`).
2. Complete a combat encounter so loot appears.
3. The loot panel border should glow amber/gold with a pulsing animation for ~3-4 seconds, then return to the normal panel border style.
4. If loot was already present and more is added, the animation should restart.
  </verify>
  <done>
- Loot panel border pulses amber/gold for ~3.5 seconds whenever new items are added to pendingLoot.
- Animation stops cleanly after 3-4 cycles with no lingering glow.
- No visual regression on other panels.
  </done>
</task>

</tasks>

<verification>
After both tasks:
- `npm run type-check` or dev server compiles without errors.
- Triggering loot (combat completion) causes the loot panel border to glow amber/gold for ~3.5 seconds.
- Taking items from loot (decreasing count) does NOT re-trigger the pulse.
- Panel drag, resize, close, and all other interactions work normally during and after animation.
</verification>

<success_criteria>
The loot panel border pulses with an amber/gold glow for approximately 3.5 seconds whenever `pendingLoot` gains new items. The animation is purely CSS-driven once the class is applied and does not cause any reactive re-renders after the initial class toggle.
</success_criteria>

<output>
After completion, create `.planning/quick/241-loot-window-border-pulse-glow-when-updat/241-SUMMARY.md` using the standard summary template.
</output>
