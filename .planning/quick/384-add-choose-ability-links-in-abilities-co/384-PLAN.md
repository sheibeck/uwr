---
phase: quick-384
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/intent.ts
  - src/App.vue
  - src/composables/useSkillChoice.ts
autonomous: true
requirements: [QUICK-384]

must_haves:
  truths:
    - "Abilities command shows [choose ability] link for each level where player missed an ability pick"
    - "Clicking [choose ability] triggers skill generation via prepare_skill_gen reducer"
    - "No [choose ability] link shown when pending skills already exist (generation in progress)"
    - "No [choose ability] link shown when player has abilities for all levels up to current"
  artifacts:
    - path: "spacetimedb/src/reducers/intent.ts"
      provides: "Missed ability detection and [choose ability] link in abilities command output"
    - path: "src/App.vue"
      provides: "Client-side keyword handler for 'choose ability' click"
    - path: "src/composables/useSkillChoice.ts"
      provides: "Exported requestSkillGen function for external callers"
  key_links:
    - from: "spacetimedb/src/reducers/intent.ts"
      to: "src/App.vue"
      via: "[choose ability] bracket keyword in event message"
      pattern: "\\[choose ability\\]"
    - from: "src/App.vue"
      to: "src/composables/useSkillChoice.ts"
      via: "requestSkillGen() call on keyword click"
      pattern: "requestSkillGen"
---

<objective>
Add [choose ability] clickable links in the "abilities" chat command output for missed level-up ability selections.

Purpose: When a player levels up multiple levels at once (e.g., from 1 to 3) and never chose their level 2 ability, the abilities command should show a clickable [choose ability] link so they can catch up on missed picks.

Output: Modified abilities command with missed-level detection and client-side click handler.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/intent.ts (abilities command handler, lines 412-429)
@src/App.vue (clickNpcKeyword handler, lines 1434-1762)
@src/composables/useSkillChoice.ts (skill choice composable with requestSkillGen)

<interfaces>
From spacetimedb/src/schema/tables.ts:
- AbilityTemplate table: has `characterId`, `levelRequired` fields, index `by_character`
- PendingSkill table: has `characterId` field, index `by_character`

From src/composables/useSkillChoice.ts:
```typescript
export function useSkillChoice({ selectedCharacter, pendingSkills, connActive }) {
  return { myPendingSkills, hasPendingSkills, chooseSkill, requestSkillGen };
}
```
- `requestSkillGen()` calls `conn.reducers.prepareSkillGen({ characterId })`

From src/App.vue (clickNpcKeyword routing):
- Skill choice keywords checked first (line 1438-1441)
- Falls through to `onNarrativeSubmit(keyword)` at line 1762 if no match
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add missed-ability detection to abilities command and client keyword handler</name>
  <files>spacetimedb/src/reducers/intent.ts, src/App.vue, src/composables/useSkillChoice.ts</files>
  <action>
**Server-side (spacetimedb/src/reducers/intent.ts):**

In the abilities command handler (the `if (lower === 'abilities' || lower === 'ab')` block around line 413), after building the abilities list and before calling `appendPrivateEvent`, add missed-ability detection:

1. Get existing abilities: already done as `abilities` array (filtered by character.id)
2. Get the set of levels that already have abilities: `const levelsWithAbilities = new Set(abilities.map((a: any) => Number(a.levelRequired)));`
3. Check for pending skills: `const hasPending = [...ctx.db.pending_skill.by_character.filter(character.id)].length > 0;`
4. Build missed levels list: iterate from 1 to `Number(character.level)`, collect levels NOT in `levelsWithAbilities`
5. If there are missed levels AND no pending skills:
   - Add a separator line to parts
   - Add: `Missed ability selections: Level ${missedLevels.join(', Level ')}`
   - Add: `[choose ability] — The Keeper will present new offerings`
6. If there are missed levels AND pending skills exist:
   - Add: `You have pending ability choices. Select one of the offered skills first.`

The [choose ability] text will be rendered as a clickable bracket keyword by the NarrativeMessage component.

Also handle the case where abilities list is empty but character level > 0: show the "no abilities yet" message PLUS the [choose ability] link if no pending skills.

**Client-side (src/App.vue):**

In the `clickNpcKeyword` handler, add a new case BEFORE the "Everything else" fallthrough (before line 1761). After the "Research Recipes" handler (around line 1720):

```typescript
// 10.5 Choose ability keyword (from abilities command)
if (kwLower === 'choose ability') {
  if (selectedCharacter.value && conn.isActive) {
    requestSkillGen();
  }
  return;
}
```

**Client-side (src/composables/useSkillChoice.ts):**

The `requestSkillGen` function is already returned from the composable. Verify it is destructured in App.vue from the `useSkillChoice` call. If not, add it to the destructuring.

Check App.vue line ~893: `const { myPendingSkills, hasPendingSkills, chooseSkill: chooseSkillByName } = useSkillChoice({...});`
Add `requestSkillGen` to the destructuring: `const { myPendingSkills, hasPendingSkills, chooseSkill: chooseSkillByName, requestSkillGen } = useSkillChoice({...});`
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit --project spacetimedb/tsconfig.json 2>&1 | head -20 && npx vue-tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
    - Abilities command shows "Missed ability selections: Level X, Level Y" with [choose ability] link when player has fewer abilities than their level
    - No link shown when pending skills exist (shows "select one of the offered skills" instead)
    - Clicking [choose ability] in narrative triggers prepareSkillGen reducer via client
    - TypeScript compiles without errors on both server and client
  </done>
</task>

</tasks>

<verification>
1. Publish server module: `spacetime publish uwr -p spacetimedb`
2. Test with a character that has missed ability levels (level > number of abilities)
3. Type "abilities" -- should see missed level indicators and [choose ability] link
4. Click [choose ability] -- should trigger LLM skill generation
5. After skills appear, abilities command should show "select one of the offered skills" instead of the link
6. After choosing a skill, abilities command should update the count and show link again if more levels are missed
</verification>

<success_criteria>
- Players can see which ability levels they missed in the abilities command output
- Clicking [choose ability] triggers skill generation for catch-up
- No duplicate skill generation when pending skills already exist
- Works for both zero-ability characters and partially-filled ones
</success_criteria>

<output>
After completion, create `.planning/quick/384-add-choose-ability-links-in-abilities-co/384-SUMMARY.md`
</output>
