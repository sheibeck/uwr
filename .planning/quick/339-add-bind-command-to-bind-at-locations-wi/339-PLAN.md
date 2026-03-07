---
phase: quick-339
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/intent.ts
autonomous: true
requirements: [BIND-CMD]

must_haves:
  truths:
    - "Player typing 'bind' at a bindstone location gets bound to that location"
    - "Player typing 'bind' at a non-bindstone location gets an error message"
    - "Help text explains the bind command and its purpose"
  artifacts:
    - path: "spacetimedb/src/reducers/intent.ts"
      provides: "bind command handler and updated help text"
      contains: "bind"
  key_links:
    - from: "spacetimedb/src/reducers/intent.ts"
      to: "bind_location reducer"
      via: "inline logic mirroring bind_location reducer"
      pattern: "boundLocationId"
---

<objective>
Add a "bind" command to the narrative intent handler so players can bind at locations with bindstones by typing "bind". Also update the help text to explain what bind does.

Purpose: The `bind_location` reducer already exists but is only callable programmatically. Players need a text command to trigger it from the narrative console.
Output: Updated intent.ts with bind command and help entry.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/intent.ts
@spacetimedb/src/reducers/characters.ts (lines 319-334 for bind_location reducer reference)
@spacetimedb/src/schema/tables.ts (Location has bindStone: t.bool(), Character has boundLocationId: t.u64())
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add bind command and update help text in intent handler</name>
  <files>spacetimedb/src/reducers/intent.ts</files>
  <action>
Two changes to `spacetimedb/src/reducers/intent.ts`:

1. **Update help text** (around line 46-59): Add a new entry to the helpText array:
   `'  [bind] — Bind to this location's bindstone. You will respawn here on death.'`
   Place it after the "camp" entry and before the closing bracket.

2. **Add bind command handler**: Insert a new block after the "camp/rest" handler (after line 249) and before the "explore" handler. The block should:
   - Match `lower === 'bind'`
   - Check if character is in combat via `activeCombatIdForCharacter(ctx, character.id)` -- if so, `fail(ctx, character, 'You cannot bind while in combat.')`
   - Look up the current location: `const location = ctx.db.location.id.find(character.locationId)`
   - If `!location || !location.bindStone`, return `fail(ctx, character, 'There is no bindstone here.')`
   - If `character.boundLocationId === location.id`, return `appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', 'You are already bound here.')`
   - Otherwise, update character: `ctx.db.character.id.update({ ...character, boundLocationId: location.id })`
   - Then: `appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', \`You bind your soul to the stone at ${location.name}. You will return here should you fall.\`)`
   - Return after each branch

  This mirrors the existing `bind_location` reducer logic from characters.ts (lines 319-334) but adds combat check, already-bound check, and richer narrative messaging in the sardonic style.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>
    - Typing "bind" at a location with bindStone=true updates boundLocationId and shows confirmation
    - Typing "bind" at a location without a bindstone shows error
    - Typing "bind" while in combat shows error
    - Help text includes the bind command with explanation about respawning on death
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- The bind command appears in help text
- The bind handler is placed logically among other commands (after camp, before explore)
</verification>

<success_criteria>
Players can type "bind" in the narrative console to bind at bindstone locations. Help text documents the command.
</success_criteria>

<output>
After completion, create `.planning/quick/339-add-bind-command-to-bind-at-locations-wi/339-SUMMARY.md`
</output>
