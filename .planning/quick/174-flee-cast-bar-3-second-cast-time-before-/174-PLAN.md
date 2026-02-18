---
phase: quick-174
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
  - src/components/CombatPanel.vue
autonomous: true
must_haves:
  truths:
    - "Clicking Flee starts a 3-second cast bar visible in the combat panel"
    - "The flee reducer only fires after the 3-second cast completes"
    - "If combat ends during the cast, the flee cast is cancelled"
    - "The cast bar shows visual progress filling left to right"
  artifacts:
    - path: "src/App.vue"
      provides: "localFlee ref, handleFlee wrapper, fleeProgress computed, watchers"
      contains: "localFlee"
    - path: "src/components/CombatPanel.vue"
      provides: "Flee cast bar display with progress"
      contains: "fleeProgress"
  key_links:
    - from: "src/App.vue"
      to: "src/components/CombatPanel.vue"
      via: "isFleeCasting and fleeProgress props"
      pattern: "flee-progress"
---

<objective>
Add a 3-second client-side cast bar to the Flee button in combat, matching the visual style of existing gather/pull cast bars.

Purpose: Fleeing should feel like a deliberate action with counterplay potential, not an instant escape. The cast bar communicates the delay visually.
Output: Flee button triggers a 3-second cast bar; reducer fires only after cast completes; combat ending cancels the cast.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.vue
@src/components/CombatPanel.vue
@src/composables/useCombat.ts
@src/ui/styles.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add localFlee ref, handleFlee wrapper, and watchers in App.vue</name>
  <files>src/App.vue</files>
  <action>
1. Near the existing `localGather` ref (~line 2036), add a new ref following the same pattern:
   ```
   const localFlee = ref<{ startMicros: number; durationMicros: number; timer: number } | null>(null);
   ```

2. Add computed properties for the cast bar state:
   ```
   const isFleeCasting = computed(() => localFlee.value !== null);
   const fleeProgress = computed(() => {
     if (!localFlee.value) return 0;
     return Math.min(1, Math.max(0, (nowMicros.value - localFlee.value.startMicros) / localFlee.value.durationMicros));
   });
   ```

3. Create `handleFlee()` function that replaces the direct `flee` call:
   ```
   const handleFlee = () => {
     if (!selectedCharacter.value || !conn.isActive || !activeCombat.value) return;
     // If already casting flee, cancel it
     if (localFlee.value) {
       clearTimeout(localFlee.value.timer);
       localFlee.value = null;
       return;
     }
     const timer = window.setTimeout(() => {
       flee();
       localFlee.value = null;
     }, 3000);
     localFlee.value = {
       startMicros: nowMicros.value,
       durationMicros: 3_000_000,
       timer,
     };
   };
   ```

4. Add a watcher to clear localFlee when combat ends (same pattern as the localGather combat-start watcher ~line 2079):
   ```
   watch(
     () => activeCombat.value,
     (newVal, oldVal) => {
       if (!newVal && localFlee.value) {
         clearTimeout(localFlee.value.timer);
         localFlee.value = null;
       }
     }
   );
   ```

5. In the template, change `@flee="flee"` (line ~304) to `@flee="handleFlee"`.

6. Pass two new props to the CombatPanel component (add after `:accordion-state`):
   ```
   :is-flee-casting="isFleeCasting"
   :flee-progress="fleeProgress"
   ```
  </action>
  <verify>TypeScript compilation passes with no errors. Search for `localFlee` in App.vue confirms ref, computed, handler, watcher, and prop passing all present.</verify>
  <done>handleFlee replaces direct flee call; localFlee ref tracks cast state; fleeProgress computed drives bar; watcher clears on combat end; isFleeCasting and fleeProgress passed as props to CombatPanel.</done>
</task>

<task type="auto">
  <name>Task 2: Show flee cast bar in CombatPanel with progress fill</name>
  <files>src/components/CombatPanel.vue</files>
  <action>
1. Add `isFleeCasting` (boolean) and `fleeProgress` (number) to the props interface (~line 105):
   ```
   isFleeCasting: boolean;
   fleeProgress: number;
   ```

2. Replace the existing Flee button block (lines ~82-91) with a flee section that includes both the button and a cast bar:
   ```html
   <div :style="styles.panelFormInline">
     <button
       type="button"
       :disabled="!connActive || !canAct"
       :style="styles.ghostButton"
       @click="$emit('flee')"
     >
       {{ isFleeCasting ? 'Cancel' : 'Flee' }}
     </button>
   </div>
   <div v-if="isFleeCasting" :style="styles.enemyCastBar">
     <div
       :style="{
         ...styles.enemyCastFill,
         width: `${Math.round(fleeProgress * 100)}%`,
         background: 'linear-gradient(90deg, rgba(255,180,60,0.6), rgba(255,120,30,0.9))',
       }"
     ></div>
     <span :style="styles.barText">Fleeing...</span>
   </div>
   ```

   Key details:
   - Button text changes to "Cancel" when flee cast is active (clicking emits same 'flee' event, which App.vue handleFlee interprets as cancel)
   - Cast bar uses `styles.enemyCastBar` and `styles.enemyCastFill` for structure but overrides the fill gradient to an amber/orange color to distinguish from enemy blue casts
   - `styles.barText` is the same centered text style used on HP bars and enemy cast bars
   - The bar is placed directly below the button, inside the combat block
   - Do NOT disable the button while fleeCasting -- the click-to-cancel behavior needs it enabled
  </action>
  <verify>No TypeScript errors. The CombatPanel template renders flee cast bar when isFleeCasting is true and hides it when false. Button shows "Cancel" text during cast.</verify>
  <done>CombatPanel shows an amber-tinted cast bar filling over 3 seconds when flee is initiated; bar shows "Fleeing..." label; button text toggles between "Flee" and "Cancel"; bar disappears when cast completes or is cancelled.</done>
</task>

</tasks>

<verification>
1. Start the dev server, enter combat, click Flee -- a 3-second amber cast bar appears below the button
2. Wait 3 seconds -- the flee reducer fires, combat flee logic executes
3. Click Flee then click Cancel before 3 seconds -- cast bar disappears, no flee reducer fires
4. Click Flee then kill the enemy before 3 seconds -- combat ends, cast bar clears automatically
5. Button shows "Cancel" during cast, "Flee" otherwise
</verification>

<success_criteria>
- Flee button triggers a 3-second cast bar identical in shape to enemy cast bars but amber-colored
- The flee_combat reducer fires only after the 3-second timer completes
- Clicking the button during cast cancels it
- Combat ending clears the cast bar and timer
- No server-side changes required
</success_criteria>

<output>
After completion, create `.planning/quick/174-flee-cast-bar-3-second-cast-time-before-/174-SUMMARY.md`
</output>
