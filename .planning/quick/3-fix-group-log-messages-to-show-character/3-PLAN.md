---
phase: quick-3
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
autonomous: true
must_haves:
  truths:
    - "Group log messages show character names (e.g., 'Bob gained 15 XP') instead of 'You'"
    - "Private log messages still show 'You' as before"
    - "All reward/system group messages use character.name"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Fixed logGroupEvent calls with character names"
      contains: "character.name"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "spacetimedb/src/index.ts::appendGroupEvent"
      via: "logGroupEvent helper"
      pattern: "logGroupEvent.*character\\.name"
---

<objective>
Fix group log messages in combat rewards to show character names instead of "You".

Purpose: When a group completes combat, each member's reward/system messages are sent to the group log verbatim as "You gain 15 XP", "You reached level 5", etc. Since all group members see the group log, this results in confusing duplicate "You" messages. The group log should show "Bob gained 15 XP", "Alice reached level 5", etc.

Output: Updated combat.ts with character-name-based group log messages.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/index.ts (appendGroupEvent, logPrivateAndGroup functions)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace "You" with character.name in group log messages</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In the combat reward distribution section (around lines 1886-2017), there are 6 `logGroupEvent` calls that pass "You gain/lose/reached" messages identical to the private log. Update each one to use `character.name` instead of "You" and past tense for third-person grammar:

1. Line ~1898-1904: Gold reward
   - Private (keep): `You gain ${goldReward} gold.`
   - Group (change to): `${character.name} gained ${goldReward} gold.`

2. Line ~1928-1934: Death XP loss
   - Private (keep): `You lose ${loss} XP from the defeat.`
   - Group (change to): `${character.name} lost ${loss} XP from the defeat.`

3. Line ~1958-1964: XP reward (reduced for defeat)
   - Private (keep): `You gain ${reward.xpGained} XP (reduced for defeat).`
   - Group (change to): `${character.name} gained ${reward.xpGained} XP (reduced for defeat).`

4. Line ~1974-1980: Level up (dead character)
   - Private (keep): `You reached level ${reward.newLevel}.`
   - Group (change to): `${character.name} reached level ${reward.newLevel}.`

5. Line ~1993-1999: XP reward (normal victory)
   - Private (keep): `You gain ${reward.xpGained} XP.`
   - Group (change to): `${character.name} gained ${reward.xpGained} XP.`

6. Line ~2009-2015: Level up (alive character)
   - Private (keep): `You reached level ${reward.newLevel}.`
   - Group (change to): `${character.name} reached level ${reward.newLevel}.`

Do NOT modify:
- Any `appendPrivateEvent` calls (these correctly say "You")
- The `logGroupEvent` at line ~2058 (enemy stagger message, already correct)
- Any other files

The `character` variable is already in scope at all 6 locations (loaded from `ctx.db.character.id.find(p.characterId)`).
  </action>
  <verify>
Run `spacetime publish uwr --clear-database -y --project-path spacetimedb` to verify the module compiles and publishes successfully. Then search combat.ts for remaining "You gain" or "You lose" or "You reached" strings inside logGroupEvent calls -- there should be zero.
  </verify>
  <done>
All 6 logGroupEvent calls in the combat reward section use `character.name` instead of "You". Private event messages remain unchanged with "You" phrasing. Module compiles and publishes without errors.
  </done>
</task>

</tasks>

<verification>
- grep for `logGroupEvent` calls containing "You " in combat.ts returns zero matches
- grep for `appendPrivateEvent` calls containing "You " in combat.ts still returns matches (unchanged)
- Module publishes successfully with `spacetime publish`
</verification>

<success_criteria>
Group log messages display character names (e.g., "Bob gained 15 XP") while private log messages retain "You" phrasing. No compilation errors.
</success_criteria>

<output>
After completion, create `.planning/quick/3-fix-group-log-messages-to-show-character/3-SUMMARY.md`
</output>
