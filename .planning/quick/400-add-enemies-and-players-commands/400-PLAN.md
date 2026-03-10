---
phase: quick-400
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/intent.ts
autonomous: true
requirements: [QUICK-400]
must_haves:
  truths:
    - "Player can type 'enemies' to see a list of all enemies at their location with level and con colors"
    - "Player can type 'players' to see a list of all other players at their location with level, race, and class"
    - "Both commands show informative message when no targets are present"
    - "Help text includes both new commands"
  artifacts:
    - path: "spacetimedb/src/reducers/intent.ts"
      provides: "enemies and players command handlers"
      contains: "lower === 'enemies'"
  key_links:
    - from: "spacetimedb/src/reducers/intent.ts"
      to: "ctx.db.enemy_spawn.by_location"
      via: "enemies command handler"
      pattern: "enemy_spawn\\.by_location\\.filter"
    - from: "spacetimedb/src/reducers/intent.ts"
      to: "ctx.db.character.by_location"
      via: "players command handler"
      pattern: "character\\.by_location\\.filter"
---

<objective>
Add "enemies" and "players" commands to the narrative input system so players can quickly see what enemies and other players are at their current location without needing the full "look" output.

Purpose: Quick tactical awareness -- players in combat zones want a focused enemy list, and social players want to see who else is around.
Output: Two new command handlers in intent.ts, help text updated.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/intent.ts
@spacetimedb/src/helpers/look.ts

<interfaces>
<!-- Existing patterns from look.ts to reuse -->

Enemy spawn query pattern (from look.ts lines 63-86):
```typescript
const spawns = [...ctx.db.enemy_spawn.by_location.filter(character.locationId)];
const aliveSpawns = spawns.filter((s: any) => s.state === 'available' || s.state === 'engaged' || s.state === 'pulling');
// For each spawn: ctx.db.enemy_template.id.find(spawn.enemyTemplateId)
// template has: level, role, creatureType, isBoss, name
// spawn has: name, groupCount, state
```

Player query pattern (from look.ts lines 50-60):
```typescript
const allChars = [...ctx.db.character.by_location.filter(character.locationId)];
const otherPlayers = allChars.filter((c: any) => c.id !== character.id);
// character has: name, level, race, className
```

Con color logic (from look.ts lines 70-78):
```typescript
const diff = Number(template.level) - Number(character.level);
let color: string;
if (diff <= -5) color = '#6b7280';      // grey
else if (diff <= -3) color = '#b6f7c4'; // green
else if (diff <= -1) color = '#8bd3ff'; // blue
else if (diff === 0) color = '#f8fafc'; // white
else if (diff <= 2) color = '#f6d365';  // yellow
else if (diff <= 4) color = '#f59e0b';  // orange
else color = '#f87171';                  // red
```

Help text location: around line 52-91 in intent.ts, alphabetically ordered commands.
Event output: `appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', text)`
Gold header color: `{{color:#fbbf24}}Header:{{/color}}`
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add enemies and players commands to intent.ts</name>
  <files>spacetimedb/src/reducers/intent.ts</files>
  <action>
Add two new command handlers in intent.ts submit_intent reducer, placed after the existing command blocks (after TIME, before or after other simple commands -- find a logical alphabetical spot near the look/inventory commands).

**1. "enemies" command (aliases: "enemies", "mobs"):**
- Match: `lower === 'enemies' || lower === 'mobs'`
- Query `ctx.db.enemy_spawn.by_location.filter(character.locationId)`
- Filter to alive spawns: `state === 'available' || state === 'engaged' || state === 'pulling'`
- For each alive spawn, look up `ctx.db.enemy_template.id.find(spawn.enemyTemplateId)`
- Use the SAME con color logic from look.ts (diff = template.level - character.level, same color thresholds)
- Format each enemy as: `{{color:COLOR}}[NAME]COUNTSUFFIX (Lv LEVEL) - ROLE CREATURETYPE{{/color}}`
  - countSuffix: ` x${spawn.groupCount}` if groupCount > 1n, else empty
  - If isBoss, append ` [BOSS]` after creature type
  - If state === 'engaged', append ` [In Combat]`
  - If state === 'pulling', append ` [Pulling]`
- Header: `{{color:#fbbf24}}Enemies at this location:{{/color}}`
- If no alive spawns: show `No enemies nearby.`
- Output via `appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', text)`

**2. "players" command (aliases: "players", "who"):**
- Match: `lower === 'players' || lower === 'who'`
- Query `ctx.db.character.by_location.filter(character.locationId)`
- Filter out self: `c.id !== character.id`
- Format each player as: `  {{color:#69db7c}}[NAME]{{/color}} — Level LEVEL RACE CLASSNAME`
- Header: `{{color:#fbbf24}}Players at this location:{{/color}}`
- If no other players: show `No other players nearby.`
- Output via appendPrivateEvent

**3. Update help text:**
- Add `'  [enemies] (mobs) — List all enemies at your location with levels and threat.',` in alphabetical position (after "equip" area or after "events")
- Add `'  [players] (who) — List all players at your location.',` in alphabetical position (after "loot" area or before "quests")
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>
  - "enemies" command shows all alive enemy spawns with con colors, level, role, creature type, boss/combat status
  - "players" command shows all other players at location with level, race, class
  - Both show friendly message when no targets present
  - Help text includes both new commands in alphabetical order
  - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
- Publish to local SpacetimeDB and test both commands in-game
- Type "enemies" at a location with enemies -- see colored list
- Type "enemies" at a safe location -- see "No enemies nearby."
- Type "players" when alone -- see "No other players nearby."
- Type "help" -- see both new commands listed
</verification>

<success_criteria>
Both "enemies" and "players" commands work from the narrative input, showing formatted lists consistent with the look command's styling (con colors for enemies, green for player names, gold headers).
</success_criteria>

<output>
After completion, create `.planning/quick/400-add-enemies-and-players-commands/400-SUMMARY.md`
</output>
