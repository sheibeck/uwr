---
phase: quick-405
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/reducers/commands.ts
  - spacetimedb/src/index.ts
autonomous: true
requirements: [FIX-405]
must_haves:
  truths:
    - "Level-up pending text shows the target level number (e.g., 'Level 2 awaits') not just the count"
    - "Multiple pending levels show both count and next target level"
    - "All pending-level messages are consistent across combat, quests, HUD, and confirmation prompt"
  artifacts:
    - path: "src/App.vue"
      provides: "Client-side level-up confirmation and re-prompt text"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Combat reward level-up messages"
    - path: "spacetimedb/src/reducers/commands.ts"
      provides: "Quest reward level-up messages"
    - path: "spacetimedb/src/index.ts"
      provides: "apply_level_up reducer post-level messages"
  key_links:
    - from: "spacetimedb/src/helpers/combat_rewards.ts"
      to: "spacetimedb/src/reducers/combat.ts"
      via: "awardXp return value { pendingLevels }"
      pattern: "reward\\.pendingLevels"
---

<objective>
Fix the level-up pending text so it shows the correct target level number instead of just the pending count.

Purpose: When a player earns a level-up (e.g., going from level 1 to level 2), the pending notification should clearly indicate which level they will reach, not just say "1 level pending." This applies to combat rewards, quest rewards, the HUD confirmation prompt, and the post-level-up re-prompt.

Output: Updated messages across server reducers and client App.vue
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/combat_rewards.ts (awardXp returns { pendingLevels } — total pending count)
@spacetimedb/src/reducers/combat.ts (combat victory level-up messages around lines 2157-2181)
@spacetimedb/src/reducers/commands.ts (quest XP level-up messages around lines 130-175)
@spacetimedb/src/index.ts (apply_level_up reducer around lines 804-890)
@src/App.vue (onLevelUpClick and pendingLevels watch around lines 1750-1778)
@src/components/NarrativeHud.vue (HUD level-up indicator display)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix server-side level-up pending messages to show target level</name>
  <files>spacetimedb/src/reducers/combat.ts, spacetimedb/src/reducers/commands.ts</files>
  <action>
The current code shows "1 level pending" or "X level(s) pending" — just the count. The messages should also include the target level so players know WHICH level they will reach.

In combat.ts, there are TWO blocks of level-up messages (one for dead participants ~line 2157 and one for alive ~line 2175). In BOTH blocks:

1. Calculate the target level: `const targetLevel = character.level + 1n;` (character.level has NOT been updated yet — pendingLevels stores the count, level stays at current)
2. Update the group event text:
   - Single level: `${character.name} is ready to advance to level ${targetLevel}!`
   - Multiple: `${character.name} has ${pending} levels pending (next: level ${targetLevel})!`
3. Update the private event text:
   - Single: `You can advance to level ${targetLevel}! Click [Level Up] when ready.`
   - Multiple: `You have ${pending} levels pending (next: level ${targetLevel})! Click [Level Up] when ready.`

In commands.ts, there are TWO level-up message blocks (quest turn-in ~line 130 and delivery ~line 170). In BOTH blocks:

1. Calculate targetLevel the same way: `const targetLevel = character.level + 1n;` — BUT note that awardXp already updated the character row in the DB. We need the character's level BEFORE the XP award. Since `awardXp` only updates `xp` and `pendingLevels` (NOT `level`), `character.level` is still the pre-award level, so `character.level + 1n` is correct.
2. Update text to match the same pattern as combat.ts above.

Do NOT change the awardXp function or its return value. Only change the message text strings.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit --project spacetimedb/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>All server-side level-up notification messages include the target level number, not just the pending count</done>
</task>

<task type="auto">
  <name>Task 2: Fix client-side level-up confirmation and re-prompt text</name>
  <files>src/App.vue</files>
  <action>
In App.vue, update the onLevelUpClick function (~line 1751) and the pendingLevels watcher (~line 1762) to show target level:

1. In `onLevelUpClick` (~line 1751):
   - Get current character level: `const currentLevel = Number(selectedCharacter.value?.level ?? 0n);`
   - Calculate target: `const targetLevel = currentLevel + 1;`
   - Change pendingText:
     - Single: `"advance to level ${targetLevel}"`
     - Multiple: `"${pending} levels pending, next: level ${targetLevel}"`
   - Update the full message: `Ready to level up? (${pendingText}) The Keeper will guide you through ability selection. This involves narration and may take a moment. Click [Confirm Level Up] to proceed.`

2. In the `watch(pendingLevels, ...)` handler (~line 1762):
   - Inside the setTimeout callback, after re-checking pendingLevels > 0n:
   - Get current level from selectedCharacter: `const currentLevel = Number(selectedCharacter.value?.level ?? 0n);`
   - Calculate target: `const targetLevel = currentLevel + 1;`
   - Change pendingText:
     - Single: `"advance to level ${targetLevel}"`
     - Multiple: `"${remaining} levels pending, next: level ${targetLevel}"`
   - Update message: `You have more levels to apply! (${pendingText}) Click [Confirm Level Up] to continue.`

Do NOT change the NarrativeHud.vue display — the `[level up]` / `[level up x2]` / `LEVEL UP (2)` indicators are fine as-is since they are compact HUD elements.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>Client confirmation prompt and re-prompt messages show the target level number (e.g., "advance to level 2") instead of just the pending count</done>
</task>

</tasks>

<verification>
- Publish server module locally: `spacetime publish uwr -p spacetimedb`
- Create a level 1 character, defeat an enemy to earn enough XP for level 2
- Combat reward message should say "You can advance to level 2!" not "1 level pending"
- Click [Level Up] in HUD — confirmation should say "advance to level 2"
- After applying level-up, if more levels pending, re-prompt should show next target level
</verification>

<success_criteria>
All level-up pending messages across the codebase include the target level number. No message says just "1 level pending" without context of which level the player will reach.
</success_criteria>

<output>
After completion, create `.planning/quick/405-fix-level-up-pending-text-showing-wrong-/405-SUMMARY.md`
</output>
