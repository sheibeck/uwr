---
phase: quick-334
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/intent.ts
  - src/components/NarrativeMessage.vue
autonomous: true
requirements: [LOOK-ENHANCE]
---

<objective>
Enhance the "look" command to show a rich location overview: description, day/night, bind stone, crafting station, NPCs (clickable), enemies (level-colored), resources, and other players. Support "look <target>" to inspect specific NPCs or enemies. Goal: replace travel panel with narrative-driven information.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/intent.ts (look handler at lines 42-50, consider handler at lines 252-301 for reference)
@src/components/NarrativeMessage.vue (v-html rendering with [keyword] click support)
@spacetimedb/src/schema/tables.ts (tables: Location, Npc, Character, EnemySpawn, EnemyTemplate, ResourceNode, WorldState)

<interfaces>
<!-- Con color logic: -->
diff <= -5 → gray (#6b7280)
diff <= -3 → light green (#b6f7c4)
diff <= -1 → blue (#8bd3ff)
diff === 0 → white (#f8fafc)
diff <= 2 → yellow (#f6d365)
diff <= 4 → orange (#f59e0b)
diff > 4 → red (#f87171)

<!-- Server tables: -->
ctx.db.location.id.find(locationId) → { name, description, regionId, levelOffset, isSafe, terrainType, bindStone, craftingAvailable }
ctx.db.npc.by_location.filter(locationId) → { name, npcType, description, greeting, ... }
ctx.db.enemy_spawn.by_location.filter(locationId) → { name, enemyTemplateId, state, groupCount, ... }
ctx.db.enemy_template.id.find(templateId) → { name, level, isBoss, ... }
ctx.db.resource_node.by_location.filter(locationId) → { name, state, quantity, ... }
ctx.db.character.by_location.filter(locationId) → { id, name, level, ... }
ctx.db.world_state.id.find(0n) → { isNight, nextTransitionAtMicros }

<!-- Keyword click system: [bracketed text] → window.clickNpcKeyword → App.vue:1381 → submitIntentReducer -->
<!-- So clicking [NPC Name] sends "NPC Name" as intent text, which currently would NOT match hail (hail requires "hail NPC Name") -->
<!-- We need "look" to also handle "look <name>" for inspecting specific targets -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Enhance server-side look handler with full location overview and target inspection</name>
  <files>spacetimedb/src/reducers/intent.ts</files>
  <action>
Replace the simple look handler (lines 42-50) with a richer implementation that handles both bare "look" and "look <target>".

**Change the look match from exact string to regex:**
```typescript
const lookMatch = raw.match(/^(?:look|l)(?:\s+(.+))?$/i);
```

**If no target (bare "look" / "l"):** Build a rich multi-section message:

1. **Header:** `location.name` on its own line

2. **Description:** `location.description`

3. **Day/Night:** Query `ctx.db.world_state.id.find(0n)`. If found, append `\nIt is currently {{nighttime|daytime}}.` based on `worldState.isNight`.

4. **Safe area / Bind stone / Crafting:**
   - If `location.isSafe`: append `\nThis is a safe area.`
   - If `location.bindStone`: append `\nA bind stone stands here, pulsing with faint energy.`
   - If `location.craftingAvailable`: append `\nA crafting station is available here.`

5. **NPCs section:** Query `ctx.db.npc.by_location.filter(character.locationId)`. If any NPCs present, append:
   - Single: `\n\nYou see [NPC Name] here.`
   - Multiple: `\n\nYou see [NPC1], [NPC2], and [NPC3] here.` (Oxford comma, all bracketed for clickability)

6. **Other players section:** Query `ctx.db.character.by_location.filter(character.locationId)`. Filter out the current character (by id). If other characters present, append:
   - Single: `\n\n[PlayerName] is here.`
   - Multiple: `\n\n[Player1], [Player2], and [Player3] are here.`
   (Bracket player names so they're clickable — clicking sends intent "PlayerName" which could match whisper etc.)

7. **Enemies section:** Query `ctx.db.enemy_spawn.by_location.filter(character.locationId)` for spawns where `state !== 'dead'` and `state !== 'depleted'` (check what valid alive states look like — use anything that's not explicitly dead/gone). For each, look up `ctx.db.enemy_template.id.find(spawn.enemyTemplateId)` to get level. Calculate `diff = Number(template.level) - Number(character.level)`. Map diff to hex color:
   - diff <= -5: `#6b7280` (gray)
   - diff <= -3: `#b6f7c4` (light green)
   - diff <= -1: `#8bd3ff` (blue)
   - diff === 0: `#f8fafc` (white)
   - diff <= 2: `#f6d365` (yellow)
   - diff <= 4: `#f59e0b` (orange)
   - diff > 4: `#f87171` (red)

   Format each enemy as: `{{color:HEX}}[EnemyName] (Lv X){{/color}}` — bracket enemy names too for clickability.
   If groupCount > 1, show: `{{color:HEX}}[EnemyName] x3 (Lv X){{/color}}`.
   If enemies present, append: `\n\nEnemies nearby: Enemy1, Enemy2.`

8. **Resources section:** Query `ctx.db.resource_node.by_location.filter(character.locationId)` for nodes with `state === 'available'`. Deduplicate by name, show count if multiple of same. If present, append:
   `\n\nResources: ResourceName1, ResourceName2 x3.`

9. **Travel exits:** Query `ctx.db.location_connection.by_from.filter(character.locationId)`. Map to location names. If any, append:
   `\n\nExits: [Location1], [Location2], [Location3].` (bracketed so clicking travels there)

Keep event kind as `'look'`.

**If target specified ("look <name>"):** Search for matching NPC or enemy at this location:

a. **NPC match:** Loop through `ctx.db.npc.by_location.filter(character.locationId)`. If `npc.name.toLowerCase() === targetName.toLowerCase()` (or includes), show:
   `[NPC Name]: ${npc.description}`
   Use kind `'look'`.

b. **Enemy match:** Loop through `ctx.db.enemy_spawn.by_location.filter(character.locationId)`. If `spawn.name.toLowerCase().includes(targetName)`, look up template and show:
   `You study ${spawn.name}. Level ${template.level}. ${template.role} ${template.creatureType}.`
   Include boss indicator if `template.isBoss`.
   Use kind `'look'`.

c. **Player match:** Loop through `ctx.db.character.by_location.filter(character.locationId)`. If name matches, show:
   `${target.name}, Level ${target.level} ${target.race} ${target.className}.`

d. **No match:** `fail(ctx, character, 'You don't see "${targetName}" here.')`

**Important:** The existing exact-match `if (lower === 'look' || lower === 'l')` must be replaced with the regex match. Make sure the regex version still matches bare "look" and "l".
  </action>
  <verify>
Publish module: `spacetime publish uwr -p spacetimedb`. Check `spacetime logs uwr` for no errors.
  </verify>
  <done>Look command produces rich location overview with day/night, bind stone, crafting, NPCs, players, enemies (colored), resources, and exits. "look <name>" inspects specific targets.</done>
</task>

<task type="auto">
  <name>Task 2: Add color tag rendering support in NarrativeMessage</name>
  <files>src/components/NarrativeMessage.vue</files>
  <action>
In `NarrativeMessage.vue`, add support for `{{color:HEX}}text{{/color}}` tags.

1. Add a helper function before `processSentence`:

```typescript
function renderColorTags(text: string): string {
  return text.replace(
    /\{\{color:(#[0-9a-fA-F]{6})\}\}(.+?)\{\{\/color\}\}/g,
    (_match, color, content) => {
      return `<span style="color: ${color}; font-weight: 600;">${content}</span>`;
    }
  );
}
```

2. In `processSentence`, apply `renderColorTags` AFTER `\n→<br>` replacement but BEFORE `[keyword]` replacement:
```typescript
function processSentence(sentence: string): string {
  return renderColorTags(
    sentence.replace(/\n/g, '<br>')
  ).replace(/\[([^\]]+)\]/g, (_match, keyword) => {
    return `<span style="color: #60a5fa; cursor: pointer; text-decoration: underline; font-weight: 600;" onclick="window.clickNpcKeyword('${keyword.replace(/'/g, "\\'")}')">[${keyword}]</span>`;
  });
}
```

3. In `renderedMessage` computed, same pipeline — apply `renderColorTags` after `\n→<br>` but before `[keyword]`:
```typescript
const renderedMessage = computed(() => {
  return renderColorTags(
    props.event.message.replace(/\n/g, '<br>')
  ).replace(/\[([^\]]+)\]/g, (match, keyword) => {
    return `<span style="color: #60a5fa; cursor: pointer; text-decoration: underline; font-weight: 600;" onclick="window.clickNpcKeyword('${keyword.replace(/'/g, "\\'")}')">${match}</span>`;
  });
});
```

4. Add `'look'` to KIND_COLORS with `#c8ccd0` (light neutral gray — readable but not attention-grabbing).

5. Add `'move'` to KIND_COLORS with `#adb5bd` if not already there (for travel messages).
  </action>
  <verify>
Run `npx vite build` from project root to verify no compilation errors. Test in browser: type "look" and verify colored enemy names and clickable brackets render correctly.
  </verify>
  <done>Color tags render as colored spans. Enemy names show con colors. NPC/player/exit names are clickable brackets. Look messages have neutral gray color.</done>
</task>

</tasks>

<verification>
1. Type "look" — see full location overview with description, day/night, facilities, NPCs, players, enemies, resources, exits
2. NPC names appear as clickable [bracketed] blue links
3. Enemy names appear with level-colored text (gray for trivial, red for dangerous)
4. Player names appear as clickable brackets
5. Exit locations appear as clickable brackets (clicking travels there)
6. Type "look npc_name" — see NPC description
7. Type "look enemy_name" — see enemy details
8. Bind stone and crafting station indicators show when present
</verification>

<output>
After completion, create `.planning/quick/334-narrative-panel-shows-location-descripti/334-SUMMARY.md`
</output>
