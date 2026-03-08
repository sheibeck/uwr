---
phase: quick-367
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
  - src/components/NarrativeConsole.vue
autonomous: true
requirements: [QUICK-367]
must_haves:
  truths:
    - "When gathering starts, a live-updating text block progress bar appears in the narrative console"
    - "The narrative gathering bar shows the resource name and fills from empty to full over 8 seconds"
    - "When gathering completes, the bar disappears and a completion message appears in the narrative"
    - "Clicking [gather Resource] from look output correctly shows the progress bar (keyword gather bug fix)"
    - "Quest item looting shows a similar live progress bar in the narrative console"
  artifacts:
    - path: "src/components/NarrativeConsole.vue"
      provides: "Gathering and quest item progress bar display in narrative stream"
    - path: "src/App.vue"
      provides: "Gathering state props, keyword gather bug fix, narrative events"
  key_links:
    - from: "src/App.vue"
      to: "src/components/NarrativeConsole.vue"
      via: "gatheringState and questItemCastState props"
      pattern: "gathering-state|quest-item-cast-state"
---

<objective>
Add live-updating text block progress bars in the narrative console for resource gathering and quest item looting. Currently, progress bars only show in the LocationGrid side panel. This adds matching feedback directly in the narrative stream where the player's focus is.

Also fixes a bug where clicking [gather Resource] from the look output does not set localGather, resulting in no progress bar showing in LocationGrid.

Purpose: Give players visible gathering/looting feedback in the main narrative area.
Output: Updated NarrativeConsole.vue and App.vue with inline gathering progress bars.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/NarrativeConsole.vue
@src/components/LocationGrid.vue
@src/App.vue (lines 59-78 for NarrativeConsole usage, lines 1670-1690 for keyword gather, lines 2206-2257 for resourceNodesHere and startGather, lines 2659-2736 for localGather)

<interfaces>
From src/components/NarrativeConsole.vue (existing props):
```typescript
const props = defineProps<{
  combinedEvents: EventItem[];
  selectedCharacter: Character | null;
  activeCombat: any | null;
  connActive: boolean;
  contextActions: ContextAction[];
  isLlmProcessing: boolean;
  formatTimestamp: (ts: { microsSinceUnixEpoch: bigint }) => string;
  creationMode?: boolean;
  hasPendingSkills?: boolean;
  isInCombat?: boolean;
  combatAbilities?: any[];
  combatEnemies?: any[];
  castingAbilityId?: bigint | null;
  castProgress?: number;
}>();
```

From src/components/LocationGrid.vue (existing progressBar helper):
```typescript
const progressBar = (progress: number, width = 20): string => {
  const filled = Math.round(progress * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
};
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pass gathering/looting state to NarrativeConsole and fix keyword gather bug</name>
  <files>src/App.vue</files>
  <action>
    1. **Fix keyword gather bug (line ~1681):** The keyword-based gather handler calls `startGatherReducer` but does NOT set `localGather`, so no progress bar shows. After line 1680 (`if (node && selectedCharacter.value && conn.isActive) {`), add the localGather assignment before the reducer call:
       ```typescript
       localGather.value = {
         nodeId: (node as any).id,
         startMicros: nowMicros.value,
         durationMicros: 8_000_000,
       };
       ```

    2. **Create a computed for active gathering info** (near the existing `resourceNodesHere` computed, around line 2247):
       ```typescript
       const activeGatheringInfo = computed(() => {
         if (!localGather.value) return null;
         const nodeId = localGather.value.nodeId;
         const node = resourceNodesHere.value.find(n => n.id.toString() === nodeId.toString());
         if (!node) return null;
         return {
           name: node.name,
           progress: node.progress,
         };
       });
       ```

    3. **Create a computed for quest item cast info** that mirrors the LocationGrid's questItemCast but is available at App level. Look for where `questItemCast` is used -- it lives inside LocationGrid, not App. Instead, pass the quest item cast state UP from LocationGrid or compute it in App.

       Actually, the quest item cast timer lives entirely inside LocationGrid.vue. The simplest approach: expose a reactive `activeQuestItemCast` from LocationGrid via defineExpose or emit. BUT -- to avoid refactoring LocationGrid, instead create a parallel quest-item-cast tracker in App.vue similar to how localGather works. Add near localGather:
       ```typescript
       const localQuestItemCast = ref<{ name: string; progress: number } | null>(null);
       ```

       Then add a handler that LocationGrid can call:
       ```typescript
       const onQuestItemCastUpdate = (name: string, progress: number) => {
         if (progress >= 1 || progress < 0) {
           localQuestItemCast.value = null;
         } else {
           localQuestItemCast.value = { name, progress };
         }
       };
       ```

       Add a new emit handler on the LocationGrid component in template: `@quest-item-cast-update="onQuestItemCastUpdate"`.

    4. **Pass both states as new props to the game NarrativeConsole** (line ~59):
       ```
       :gathering-state="activeGatheringInfo"
       :quest-item-cast-state="localQuestItemCast"
       ```

    5. **Add narrative events for gather start and completion.** In the `startGather` function (line ~2249), after setting localGather:
       ```typescript
       const nodeName = resourceNodesHere.value.find(n => n.id.toString() === nodeId.toString())?.name ?? 'resource';
       addLocalEvent('system', `You begin gathering ${nodeName}...`, 'private');
       ```

       Also for keyword gather (line ~1681), add the same event after setting localGather:
       ```typescript
       addLocalEvent('system', `You begin gathering ${resourceName}...`, 'private');
       ```

       For gather completion, in the watch on nowMicros (line ~2700), when localGather completes (progress >= duration), add before clearing:
       ```typescript
       if (localGather.value && now - localGather.value.startMicros >= localGather.value.durationMicros) {
         const nodeName = resourceNodesHere.value.find(n => n.id.toString() === localGather.value!.nodeId.toString())?.name ?? 'resource';
         addLocalEvent('reward', `You gathered ${nodeName}.`, 'private');
         localGather.value = null;
       }
       ```
       Remove the duplicate/orphan safety check that follows (it duplicates the first check).
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>Keyword gather sets localGather. Gathering state and quest item cast state are passed to NarrativeConsole. Narrative events fire on gather start/end.</done>
</task>

<task type="auto">
  <name>Task 2: Add gathering/looting progress bars to NarrativeConsole and LocationGrid emit</name>
  <files>src/components/NarrativeConsole.vue, src/components/LocationGrid.vue</files>
  <action>
    **NarrativeConsole.vue changes:**

    1. Add new optional props:
       ```typescript
       gatheringState?: { name: string; progress: number } | null;
       questItemCastState?: { name: string; progress: number } | null;
       ```
       With defaults of `null` in withDefaults (if using) or via optional `?`.

    2. Add the progressBar helper (same as LocationGrid):
       ```typescript
       const progressBar = (progress: number, width = 20): string => {
         const filled = Math.round(progress * width);
         return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
       };
       ```

    3. In the template, right before the LLM processing indicator (`<!-- LLM processing indicator -->`), add gathering and quest item cast progress bars:
       ```html
       <!-- Gathering progress bar -->
       <div v-if="gatheringState && gatheringState.progress > 0 && gatheringState.progress < 1"
         :style="{ marginBottom: '2px', lineHeight: '1.5', fontSize: '0.9rem', color: '#adb5bd' }">
         <span>Gathering {{ gatheringState.name }}...</span>
         <div :style="{ fontSize: '0.75rem', color: 'rgba(76, 125, 240, 0.9)', fontFamily: 'monospace', letterSpacing: '-1px' }">
           {{ progressBar(gatheringState.progress) }}
         </div>
       </div>

       <!-- Quest item looting progress bar -->
       <div v-if="questItemCastState && questItemCastState.progress > 0 && questItemCastState.progress < 1"
         :style="{ marginBottom: '2px', lineHeight: '1.5', fontSize: '0.9rem', color: '#adb5bd' }">
         <span>Looting {{ questItemCastState.name }}...</span>
         <div :style="{ fontSize: '0.75rem', color: 'rgba(251, 191, 36, 0.9)', fontFamily: 'monospace', letterSpacing: '-1px' }">
           {{ progressBar(questItemCastState.progress) }}
         </div>
       </div>
       ```

    **LocationGrid.vue changes:**

    4. Add a new emit for quest item cast progress:
       ```typescript
       (e: 'quest-item-cast-update', name: string, progress: number): void;
       ```

    5. In the `startQuestItemCast` function's setInterval callback, emit the progress update:
       ```typescript
       emit('quest-item-cast-update', qi.name, progress);
       ```
       Also emit when cast completes (progress >= 1) with progress -1 to signal completion:
       ```typescript
       if (progress >= 1) {
         emit('quest-item-cast-update', qi.name, -1);
         // ... existing cleanup
       }
       ```

    6. In the watch that clears quest item cast when item disappears, also emit:
       ```typescript
       emit('quest-item-cast-update', '', -1);
       ```
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>NarrativeConsole shows live-updating text block progress bars for gathering (blue) and quest item looting (gold). LocationGrid emits cast progress updates to App.</done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- When gathering a resource (via context menu or [gather X] keyword), narrative console shows "Gathering X..." with a blue text bar filling over 8 seconds
- When gathering completes, bar disappears and "You gathered X." message appears in gold
- When looting a quest item, narrative console shows "Looting X..." with a gold text bar filling over 3 seconds
- LocationGrid progress bars still work as before
</verification>

<success_criteria>
Gathering and quest item looting show live text block progress bars in the narrative console. Keyword-based gather works identically to context-menu gather.
</success_criteria>

<output>
After completion, create `.planning/quick/367-add-gathering-timer-bar-for-gatherables-/367-SUMMARY.md`
</output>
