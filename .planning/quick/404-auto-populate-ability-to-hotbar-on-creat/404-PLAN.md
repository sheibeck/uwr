---
phase: quick-404
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/creation.ts
autonomous: true
requirements: [HOTBAR-AUTOPOP, WELCOME-MSG]
must_haves:
  truths:
    - "New character's starter ability appears in hotbar slot 1 immediately after creation"
    - "Welcome message after character creation covers key mechanics in sardonic tone"
    - "Welcome message mentions: opening bag, equipping gear, hotbar usage, finding NPCs, world navigation"
  artifacts:
    - path: "spacetimedb/src/reducers/creation.ts"
      provides: "Updated welcome/intro messages in finalizeCharacter"
      contains: "bag"
  key_links:
    - from: "spacetimedb/src/reducers/creation.ts"
      to: "appendPrivateEvent"
      via: "welcome message after character finalization"
      pattern: "appendPrivateEvent.*system"
---

<objective>
Rewrite the post-creation welcome message to be a sardonic mechanics introduction, and verify the hotbar auto-populate (already implemented) works correctly.

Purpose: New players need to know how to play the game immediately after creation. The current welcome messages are too vague ("Try not to die immediately" + "The world stirs...") and don't teach any mechanics.
Output: Updated welcome/intro messages in creation.ts
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/reducers/creation.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite welcome messages with sardonic mechanics intro</name>
  <files>spacetimedb/src/reducers/creation.ts</files>
  <action>
In `finalizeCharacter` (around lines 259-261), replace both post-creation messages with a single, comprehensive welcome message that:

1. Replace the `appendCreationEvent` on line 259 ("Welcome to the world...") -- keep it short, this is the Keeper's farewell. Something like a brief sardonic dismissal from the Keeper.

2. Replace the `appendPrivateEvent` on lines 260-261 ("The world stirs...") with a sardonic mechanics intro message. This is the main tutorial message. It should:
   - Be narratively written, NOT a dry tutorial list
   - Sardonic/dark humor tone ("it won't matter anyway because you're just going to die" energy)
   - Cover these mechanics concisely:
     a. Open your bag (type "bag") and equip your starter gear -- you'll need it
     b. Your hotbar has your starting ability -- click it or type its name in combat
     c. Find NPCs to talk to (type "look" to see who's around, "hail <name>" to speak)
     d. NPCs may offer quests, training, or items as they warm to you
     e. Type "look" to see where you are and what paths lead elsewhere
     f. Type "flee" if combat goes sideways -- no shame in living
   - Keep it to one paragraph, maybe two short ones. Not a wall of text
   - Use bracket-highlight syntax for commands: [bag], [look], [hail], [flee], [hotbar]

NOTE: The hotbar auto-populate is already implemented (lines 236-244 insert the chosen ability into slot 0 of the 'main' hotbar). Do NOT modify that code. Just update the messages.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && grep -n "bag\|hotbar\|flee\|look\|hail" spacetimedb/src/reducers/creation.ts | grep -i "append.*Event"</automated>
  </verify>
  <done>Welcome messages rewritten: Keeper farewell is brief and sardonic, system intro message covers bag/equip, hotbar, NPCs/hail, look/navigation, and flee -- all in narrative voice with dark humor tone, using [bracket] syntax for commands</done>
</task>

</tasks>

<verification>
- Read the updated messages in creation.ts and confirm they cover all required mechanics
- Confirm hotbar auto-populate code (lines 236-244) is untouched
- Publish to local SpacetimeDB: `spacetime publish uwr -p spacetimedb`
</verification>

<success_criteria>
- Post-creation messages teach all key mechanics: bag/equip, hotbar, look, hail NPCs, flee
- Tone is sardonic/dark humor, narratively written (not a bulleted tutorial)
- Commands use [bracket] highlighting for clickability
- Hotbar auto-populate code remains intact
- Module publishes without errors
</success_criteria>

<output>
After completion, create `.planning/quick/404-auto-populate-ability-to-hotbar-on-creat/404-SUMMARY.md`
</output>
