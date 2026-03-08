---
phase: quick-364
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/LocationGrid.vue
autonomous: true
requirements: [QUICK-364]
must_haves:
  truths:
    - "Resource gathering shows a text block progress bar (filled/empty blocks) instead of thin CSS bar"
    - "Quest item looting shows a text block progress bar instead of thin CSS bar"
    - "Enemy pull still shows its existing thin CSS bar (not changed)"
  artifacts:
    - path: "src/components/LocationGrid.vue"
      provides: "Text-based progress bars for gathering and quest item looting"
  key_links: []
---

<objective>
Replace thin CSS progress bars for resource gathering and quest item looting with text-based block character progress bars using filled (U+2588) and empty (U+2591) characters.

Purpose: Give players a more visible, retro-styled activity indicator during gathering and looting.
Output: Updated LocationGrid.vue with text progress bars.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/LocationGrid.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace CSS progress bars with text block bars</name>
  <files>src/components/LocationGrid.vue</files>
  <action>
    1. Add a helper function in the script section that converts a 0-1 progress float to a text bar string:
       ```
       const progressBar = (progress: number, width = 20): string => {
         const filled = Math.round(progress * width);
         return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
       };
       ```

    2. Replace the RESOURCE GATHERING CSS bar (lines 77-95, the div with height:3px and blue background) with a text span:
       ```
       <div v-if="node.isGathering && node.progress > 0"
         :style="{ fontSize: '0.7rem', color: 'rgba(76, 125, 240, 0.9)', fontFamily: 'monospace', marginTop: '0.15rem', letterSpacing: '-1px' }">
         {{ progressBar(node.progress) }}
       </div>
       ```

    3. Replace the QUEST ITEM LOOTING CSS bar (lines 117-135, the div with height:3px and gold background) with the same pattern but gold color:
       ```
       <div v-if="questItemCast?.id?.toString() === qi.id.toString() && questItemCast.progress > 0"
         :style="{ fontSize: '0.7rem', color: 'rgba(251, 191, 36, 0.9)', fontFamily: 'monospace', marginTop: '0.15rem', letterSpacing: '-1px' }">
         {{ progressBar(questItemCast.progress) }}
       </div>
       ```

    4. Do NOT change the enemy pull progress bar (lines 40-57) -- leave that thin CSS bar as-is.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit --pretty 2>&1 | head -20</automated>
  </verify>
  <done>Resource gathering and quest item looting show text-based block progress bars. Enemy pull bar unchanged.</done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- Visual: resource gathering shows blue block text bar that fills left-to-right
- Visual: quest item looting shows gold block text bar that fills left-to-right
- Enemy pull still shows original thin CSS bar
</verification>

<success_criteria>
Both gathering and looting progress bars display as text block characters instead of thin CSS bars.
</success_criteria>

<output>
After completion, create `.planning/quick/364-when-gathering-resources-show-a-progress/364-SUMMARY.md`
</output>
