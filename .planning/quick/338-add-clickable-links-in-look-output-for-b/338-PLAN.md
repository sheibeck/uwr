---
phase: quick-338
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/intent.ts
  - src/components/NarrativeMessage.vue
  - src/components/LogWindow.vue
  - src/App.vue
autonomous: true
requirements: [LOOK-LINKS]

must_haves:
  truths:
    - "Bind stone and crafting station appear as clickable [links] in look output"
    - "Clicking bind stone link binds the player to the location"
    - "Clicking crafting station link opens the crafting panel"
    - "NPCs, exits, players, bind stone, crafting station each have distinct link colors"
  artifacts:
    - path: "spacetimedb/src/reducers/intent.ts"
      provides: "Color-tagged brackets for all look link types"
    - path: "src/components/NarrativeMessage.vue"
      provides: "Color-aware bracket rendering that inherits {{color:HEX}} wrapper color"
    - path: "src/App.vue"
      provides: "Keyword click routing for Bind Stone and Crafting Station"
  key_links:
    - from: "spacetimedb/src/reducers/intent.ts"
      to: "src/components/NarrativeMessage.vue"
      via: "{{color:HEX}}[text]{{/color}} format in look event messages"
      pattern: "color.*\\[.*\\]"
    - from: "src/components/NarrativeMessage.vue"
      to: "src/App.vue"
      via: "window.clickNpcKeyword onclick handler"
      pattern: "clickNpcKeyword"
---

<objective>
Add clickable links in the look command output for bind stone, crafting station, NPCs, exits, and players, each with a distinct color. Clicking bind stone triggers binding, clicking crafting station opens the crafting panel.

Purpose: Make the look output interactive — players can click on anything they see to interact with it, with visual color coding to distinguish link types at a glance.
Output: Modified intent.ts (server look output), NarrativeMessage.vue + LogWindow.vue (color-aware bracket rendering), App.vue (click routing)
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/intent.ts (look handler, lines 79-225)
@src/components/NarrativeMessage.vue (bracket rendering + color tags)
@src/components/LogWindow.vue (bracket rendering in log)
@src/App.vue (clickNpcKeyword handler, ~line 1387)

<interfaces>
From spacetimedb/src/reducers/intent.ts (look handler lines 84-186):
- Location fields: location.name, location.description, location.isSafe, location.bindStone, location.craftingAvailable
- NPCs: ctx.db.npc.by_location.filter(character.locationId) -> { name }
- Players: ctx.db.character.by_location.filter(character.locationId) -> { id, name }
- Exits: ctx.db.location_connection.by_from.filter(character.locationId) -> toLocationId -> location.name

From src/components/NarrativeMessage.vue:
- renderColorTags(): processes {{color:#HEX}}text{{/color}} -> <span style="color:HEX">
- bracket regex: /\[([^\]]+)\]/g -> clickable span with onclick=window.clickNpcKeyword
- Processing order: renderColorTags FIRST, then bracket regex

From src/App.vue (clickNpcKeyword, line 1387):
- Routes keyword to: skill choice -> creation input -> NPC conversation + submitIntent
- bind_location reducer: { characterId: t.u64() } — binds character to current location
- Crafting panel: openPanel('crafting')
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Color-tagged brackets in look output + color-aware bracket rendering</name>
  <files>spacetimedb/src/reducers/intent.ts, src/components/NarrativeMessage.vue, src/components/LogWindow.vue</files>
  <action>
**Server (intent.ts)** — In the bare "look" handler (lines 104-183), wrap each link type in {{color:HEX}}[text]{{/color}} tags with distinct colors:

Color scheme:
- Bind Stone: #ffd43b (gold) — `{{color:#ffd43b}}[Bind Stone]{{/color}}`
- Crafting Station: #f59e0b (amber) — `{{color:#f59e0b}}[Crafting Station]{{/color}}`
- NPCs: #da77f2 (purple) — wrap each NPC name: `{{color:#da77f2}}[${n.name}]{{/color}}`
- Exits: #4dabf7 (light blue) — wrap each exit: `{{color:#4dabf7}}[${l.name}]{{/color}}`
- Players: #69db7c (green) — wrap each player: `{{color:#69db7c}}[${c.name}]{{/color}}`
- Enemies: already have con-colors, no change needed

Specific changes to intent.ts look handler:
1. Line 106: Change `parts.push('A bind stone stands here...')` to `parts.push('{{color:#ffd43b}}[Bind Stone]{{/color}} — A bind stone stands here, pulsing with faint energy.')`
2. Line 107: Change `parts.push('A crafting station is available here.')` to `parts.push('{{color:#f59e0b}}[Crafting Station]{{/color}} — A crafting station is available here.')`
3. Lines 112-118 (NPCs): Wrap each NPC name with `{{color:#da77f2}}[${n.name}]{{/color}}` instead of bare `[${n.name}]`
4. Lines 125-131 (Players): Wrap each player name with `{{color:#69db7c}}[${c.name}]{{/color}}` instead of bare `[${c.name}]`
5. Lines 177-183 (Exits): Wrap each exit with `{{color:#4dabf7}}[${l.name}]{{/color}}` instead of bare `[${l.name}]`

**Client (NarrativeMessage.vue)** — Modify the bracket regex replacement in BOTH `processSentence` and `renderedMessage` to detect if the `[bracket]` text is inside an already-rendered color span and inherit that color instead of forcing blue.

The processing chain is: renderColorTags -> bracket regex. After renderColorTags, a color-wrapped bracket like `{{color:#da77f2}}[Elara]{{/color}}` becomes:
`<span style="color: #da77f2; font-weight: 600;">[Elara]</span>`

The bracket regex then finds `[Elara]` inside this HTML. To inherit the color, change the bracket replacement regex to look for a preceding `color: (#[0-9a-fA-F]{6})` in the surrounding context.

Implementation approach: Instead of two separate passes (renderColorTags then bracket regex), create a single function `renderLinks(text: string): string` that:
1. First does the `\n` -> `<br>` replacement
2. Then processes `{{color:HEX}}[text]{{/color}}` as a SINGLE pattern: match `{{color:(#[0-9a-fA-F]{6})}}\[([^\]]+)\]{{/color}}` and replace with a clickable span using the specified HEX color
3. Then processes remaining `{{color:HEX}}text{{/color}}` (non-bracket color tags) normally
4. Then processes remaining bare `[text]` brackets with the default blue (#60a5fa)

This ensures colored brackets get their custom color while plain brackets keep the default blue.

Update both `processSentence` and `renderedMessage` to use this new `renderLinks` function.

**Client (LogWindow.vue)** — Apply the same rendering change to LogWindow.vue's `renderMsg` function (line ~106-112) so the journal/log view also shows colored clickable links. Use the same `renderLinks` logic: process color-tagged brackets first with their custom color, then remaining brackets with default blue.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>
- Look output shows [Bind Stone] in gold, [Crafting Station] in amber, [NPC names] in purple, [exit names] in light blue, [player names] in green
- All bracket links are clickable (cursor: pointer, underline, onclick)
- Each link type uses its designated color instead of uniform blue
- Enemy con-colors unchanged
  </done>
</task>

<task type="auto">
  <name>Task 2: Route Bind Stone and Crafting Station clicks to actions</name>
  <files>src/App.vue</files>
  <action>
In the `clickNpcKeyword` handler (App.vue ~line 1387), add handling for "Bind Stone" and "Crafting Station" keywords BEFORE the NPC check and submitIntentReducer call.

After the creation/skill check block (line 1396) and inside the `else if (selectedCharacter.value)` block (line 1396), add:

```typescript
// Handle special location feature clicks
if (keyword === 'Bind Stone') {
  // Call bind_location reducer directly
  conn.reducers.bindLocation({ characterId: selectedCharacter.value.id });
  return;
}
if (keyword === 'Crafting Station') {
  // Open the crafting panel
  openPanel('crafting');
  return;
}
```

Add these checks BEFORE the existing NPC name check (line 1398) so they take priority. The `bindLocation` reducer already exists (characters.ts line 319) and handles validation (checks location.bindStone).

Verify that `conn` (the SpacetimeDB connection) and `openPanel` are already available in scope at this location — they are (conn is from useAuth, openPanel is from usePanelManager, both used extensively in App.vue).

Also verify the reducer name: server defines `'bind_location'` which maps to client `conn.reducers.bindLocation` (snake_case to camelCase conversion per CLAUDE.md section 4).
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
- Clicking [Bind Stone] in look output calls bind_location reducer, player sees "You are now bound to {location}" message
- Clicking [Crafting Station] in look output opens the crafting panel
- Clicking NPC/exit/player names still works as before (routes to intent or conversation)
  </done>
</task>

</tasks>

<verification>
1. Type "look" in a location with a bind stone and crafting station
2. Verify bind stone appears in gold, crafting station in amber, NPCs in purple, exits in blue, players in green
3. Click [Bind Stone] — should bind and show confirmation message
4. Click [Crafting Station] — should open crafting panel
5. Click an NPC name — should enter conversation as before
6. Click an exit name — should travel as before
</verification>

<success_criteria>
- All five link types in look output have distinct, visually distinguishable colors
- Bind Stone and Crafting Station are clickable with correct actions
- Existing NPC/exit/player click behavior unchanged
- No TypeScript compilation errors
</success_criteria>

<output>
After completion, create `.planning/quick/338-add-clickable-links-in-look-output-for-b/338-SUMMARY.md`
</output>
