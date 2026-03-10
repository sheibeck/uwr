---
phase: quick-402
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/NarrativeHud.vue
  - src/App.vue
autonomous: true
requirements: [QUICK-402]

must_haves:
  truths:
    - "When pendingLevels > 0, a clickable [level up] link appears in the HUD header next to the character name/level text"
    - "After confirming and completing one level-up, if more pending levels remain, a new level-up prompt automatically appears"
    - "The process repeats until all pending levels are consumed"
  artifacts:
    - path: "src/components/NarrativeHud.vue"
      provides: "Inline [level up] link next to character name"
    - path: "src/App.vue"
      provides: "Watch on pendingLevels to re-prompt after each level-up"
  key_links:
    - from: "src/components/NarrativeHud.vue"
      to: "src/App.vue"
      via: "level-up-click emit"
      pattern: "emit.*level-up-click"
    - from: "src/App.vue"
      to: "useSkillChoice.pendingLevels"
      via: "watch triggers re-prompt"
      pattern: "watch.*pendingLevels"
---

<objective>
Add a [level up] link inline in the HUD header next to the character name when pending levels exist, and implement automatic re-prompting so multi-level characters walk through one level at a time until fully leveled.

Purpose: Make level-up more discoverable (right next to name) and ensure multi-level scenarios don't require repeated manual clicking of the LEVEL UP indicator.
Output: Updated NarrativeHud.vue with inline link, updated App.vue with level-up re-prompt watcher.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/NarrativeHud.vue
@src/App.vue
@src/composables/useSkillChoice.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add inline [level up] link in HUD header</name>
  <files>src/components/NarrativeHud.vue</files>
  <action>
In NarrativeHud.vue, modify the left section (character name/level display) to append a clickable "[level up]" link when `pendingLevels > 0`.

Current left section (line 5-7):
```
{{ character.name }} Lv {{ character.level }} - {{ character.race }} {{ character.className }}
```

Change to show an inline clickable link after the name/level text:
```html
{{ character.name }} Lv {{ character.level }} - {{ character.race }} {{ character.className }}
<span
  v-if="(pendingLevels ?? 0) > 0"
  :style="levelUpLinkStyle"
  @click="$emit('level-up-click')"
>[level up{{ (pendingLevels ?? 0) > 1 ? ` x${pendingLevels}` : '' }}]</span>
```

Add `levelUpLinkStyle` constant:
```typescript
const levelUpLinkStyle = {
  color: '#ffa500',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
  marginLeft: '8px',
};
```

Keep the existing LEVEL UP indicator on the right side as-is (it serves as a secondary reminder). The inline link is the primary discovery mechanism.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit --pretty 2>&1 | head -20</automated>
  </verify>
  <done>When pendingLevels > 0, a clickable "[level up]" (or "[level up x3]" for multiple) appears inline next to the character name in the HUD header bar.</done>
</task>

<task type="auto">
  <name>Task 2: Auto re-prompt for remaining pending levels after each level-up</name>
  <files>src/App.vue</files>
  <action>
In App.vue, add a Vue `watch` on `pendingLevels` that detects when a level-up has been processed (value decreases but is still > 0) and automatically shows the next level-up prompt after a short delay.

Add this watch near the existing level-up handling code (around line 1744):

```typescript
// Auto re-prompt when pending levels remain after a level-up completes
let prevPendingLevels = pendingLevels.value;
watch(pendingLevels, (newVal, oldVal) => {
  // Detect: value decreased (level was applied) but still > 0 (more remain)
  if (newVal > 0n && oldVal !== undefined && newVal < oldVal) {
    // Delay to let the skill choice / narration from current level settle
    setTimeout(() => {
      // Re-check in case user leveled up again in the meantime
      if (pendingLevels.value > 0n) {
        const remaining = Number(pendingLevels.value);
        const pendingText = remaining > 1 ? `${remaining} levels pending` : '1 level pending';
        addLocalEvent('narrative',
          `You have more levels to apply! (${pendingText}) Click [Confirm Level Up] to continue.`,
          'private'
        );
      }
    }, 2000); // 2s delay to let current level-up narration appear first
  }
});
```

Import `watch` if not already imported (it likely is since App.vue uses reactive features extensively).

This ensures that after each level-up confirmation + server processing, the player automatically gets prompted for the next one without having to click the LEVEL UP indicator again.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit --pretty 2>&1 | head -20</automated>
  </verify>
  <done>After completing one level-up, if pendingLevels is still > 0, a new prompt automatically appears in the narrative console after 2s delay inviting the player to continue leveling.</done>
</task>

</tasks>

<verification>
1. Type check passes: `npx vue-tsc --noEmit`
2. With a character that has pendingLevels > 0, the HUD header shows "[level up]" next to the name
3. Clicking "[level up]" shows the confirmation prompt
4. After confirming and completing one level, if more levels remain, a new prompt appears automatically
</verification>

<success_criteria>
- [level up] link visible in HUD header when pendingLevels > 0, showing count when > 1
- Clicking the link triggers the same confirmation flow as the existing LEVEL UP indicator
- After each level-up completes, remaining levels auto-prompt with a 2s delay
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/402-level-up-header-link-and-multi-level/402-SUMMARY.md`
</output>
