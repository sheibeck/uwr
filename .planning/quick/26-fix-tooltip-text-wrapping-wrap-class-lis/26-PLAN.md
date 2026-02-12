---
phase: quick-26
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ui/styles.ts
autonomous: true
must_haves:
  truths:
    - "Tooltip class list text wraps within the tooltip boundary instead of stretching outside"
    - "Long text in any tooltip line wraps properly within maxWidth"
  artifacts:
    - path: "src/ui/styles.ts"
      provides: "Tooltip word-wrap CSS fix"
      contains: "wordWrap"
  key_links: []
---

<objective>
Fix tooltip text wrapping so that long content (especially the "Classes: ..." line listing allowed classes) wraps within the tooltip's maxWidth boundary instead of overflowing.

Purpose: The tooltip has `maxWidth: 240px` but no word-wrap property, causing long class restriction lists to stretch outside the tooltip bounds.
Output: Updated tooltip style with proper word-wrap behavior.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/ui/styles.ts (tooltip style at ~line 1242)
@src/App.vue (tooltip rendering at ~line 401-433, specifically the allowedClasses line at 418-419)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add word-wrap to tooltip style</name>
  <files>src/ui/styles.ts</files>
  <action>
In `src/ui/styles.ts`, find the `tooltip` style object (around line 1242). Add `overflowWrap: 'break-word'` to ensure text wraps within the `maxWidth: '240px'` boundary. This single CSS property handles the wrapping for all tooltip content including the "Classes: Warrior, Mage, Priest, Ranger" line.

The property should be added alongside the existing maxWidth property. Use `overflowWrap` (the modern standard) rather than `wordWrap` (the legacy alias), though both work identically in all browsers.
  </action>
  <verify>
Visually inspect the tooltip on a bag slot item that has class restrictions (e.g., a weapon with `allowedClasses` set to multiple classes). The class list text should wrap within the tooltip boundary, not extend past the right edge.

Also confirm no other tooltip content (title, description, stats, armor type) is visually broken by the change.
  </verify>
  <done>Tooltip text wraps properly within the 240px max-width boundary. No text overflows or stretches outside the tooltip container.</done>
</task>

</tasks>

<verification>
- Open the game and hover over a bag slot item that has class restrictions
- The "Classes: ..." line wraps within the tooltip instead of overflowing
- Other tooltip content (title, description, stats, armor) renders correctly
</verification>

<success_criteria>
All tooltip text content respects the maxWidth boundary and wraps to new lines instead of overflowing horizontally.
</success_criteria>

<output>
After completion, create `.planning/quick/26-fix-tooltip-text-wrapping-wrap-class-lis/26-SUMMARY.md`
</output>
