---
phase: quick-388
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/NarrativeHud.vue
autonomous: true
requirements: [QUICK-388]
must_haves:
  truths:
    - "HP/Mana/Stamina bars no longer appear in the top HUD bar"
    - "Character name, level, combat indicator, pending skills, and panel buttons remain in the HUD"
    - "GroupMemberBar continues showing all resource bars as before"
  artifacts:
    - path: "src/components/NarrativeHud.vue"
      provides: "Top HUD bar without resource bars"
  key_links: []
---

<objective>
Remove the HP, Mana, and Stamina bars from the NarrativeHud component since they are now redundant with the GroupMemberBar that sits directly below it and already shows all resource bars for the player and group members.

Purpose: Eliminate duplicate UI elements -- resource bars are shown in GroupMemberBar/GroupPanel, so the top HUD bar no longer needs them.
Output: Cleaned NarrativeHud showing only name/level, combat indicator, pending skills indicator, and panel buttons.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/NarrativeHud.vue
@src/components/GroupMemberBar.vue
@src/components/NarrativeConsole.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove HP/Mana/Stamina bars from NarrativeHud</name>
  <files>src/components/NarrativeHud.vue</files>
  <action>
In NarrativeHud.vue:

1. Remove the entire "Center: HP + Mana bars" div (lines 10-26 in template) which contains:
   - The HP bar div
   - The Mana bar div (v-if maxMana > 0n)
   - The Stamina bar div (v-if maxStamina > 0n)

2. Remove the associated computed properties that are no longer needed:
   - `hpPercent`
   - `manaPercent`
   - `staminaPercent`

3. Remove the style constants that are no longer needed:
   - `barContainer`
   - `barFill`
   - `barLabel`

4. Keep everything else intact:
   - Left section: character name + level display
   - Right section: combat indicator, pending skills indicator, panel buttons (Map, Quests, Social, Travel)
   - `hudStyle`, `panelBtnStyle`, `combatDotStyle`, `skillIndicatorStyle`
   - The `@keyframes skillPulse` style block

5. Adjust the HUD height if it looks too tall without bars -- reduce from 44px to 36px since the bars took up significant vertical space. The remaining content (name + buttons) is smaller.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit --pretty 2>&1 | head -20</automated>
  </verify>
  <done>NarrativeHud no longer renders HP/Mana/Stamina bars. Only name/level, combat indicator, pending skills, and panel buttons remain. No TypeScript errors.</done>
</task>

</tasks>

<verification>
- Open the game UI and confirm the top HUD bar shows only character name/level, combat status, and panel buttons
- Confirm HP/Mana/Stamina bars are visible in the GroupMemberBar below the HUD
- No duplicate resource bar display
</verification>

<success_criteria>
- HP, Mana, Stamina bars removed from top HUD
- Name, level, combat indicator, pending skills, panel buttons still functional
- No TypeScript compilation errors
- GroupMemberBar unaffected
</success_criteria>

<output>
After completion, create `.planning/quick/388-remove-character-bars-from-top-since-the/388-SUMMARY.md`
</output>
