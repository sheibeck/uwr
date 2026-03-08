---
phase: quick-362
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/world_gen.ts
  - spacetimedb/src/data/llm_prompts.ts
  - spacetimedb/src/reducers/intent.ts
  - spacetimedb/src/helpers/world_gen.test.ts
  - spacetimedb/src/reducers/intent.test.ts
autonomous: true
requirements: [SPAWN-SAFE, AUTO-LOOK]

must_haves:
  truths:
    - "New characters always spawn in a safe location with bindstone, crafting, bank NPC, and vendor NPC"
    - "When a player travels to a new location, they automatically see full LOOK output"
  artifacts:
    - path: "spacetimedb/src/helpers/world_gen.ts"
      provides: "writeGeneratedRegion guarantees all 4 core services at starting location"
    - path: "spacetimedb/src/data/llm_prompts.ts"
      provides: "LLM schema includes banker npcType and prompt instructs first safe location has all services"
    - path: "spacetimedb/src/reducers/intent.ts"
      provides: "Travel handler emits full LOOK output after arrival"
  key_links:
    - from: "spacetimedb/src/helpers/world_gen.ts"
      to: "writeGeneratedRegion"
      via: "ensure vendor + banker NPCs exist at starting safe location"
    - from: "spacetimedb/src/reducers/intent.ts"
      to: "travel handler"
      via: "auto-look after inline move"
---

<objective>
Ensure new characters spawn in safe locations with ALL core services (bindstone, crafting station, bank, shop/vendor), and automatically show LOOK output when traveling to a new location.

Purpose: Players currently spawn in locations missing essential services. Also, players must manually type LOOK after every travel which is tedious.
Output: Patched world gen to guarantee services, patched travel to auto-look, unit tests for both rules.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/world_gen.ts
@spacetimedb/src/data/llm_prompts.ts
@spacetimedb/src/reducers/intent.ts
@spacetimedb/src/index.ts (lines 897-950, character placement after world gen)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Guarantee all core services at starting safe location</name>
  <files>spacetimedb/src/helpers/world_gen.ts, spacetimedb/src/data/llm_prompts.ts</files>
  <action>
1. In `spacetimedb/src/data/llm_prompts.ts`, update `REGION_GENERATION_SCHEMA`:
   - Add `banker` to the npcType enum: `"npcType":"vendor|questgiver|lore|trainer|guard|crafter|banker"`
   - In `buildRegionGenerationUserPrompt`, add instruction: "IMPORTANT: The first safe location (isSafe: true) MUST have at least one NPC with npcType 'vendor' and one with npcType 'banker'. These are essential services for new players."

2. In `spacetimedb/src/helpers/world_gen.ts`, in `writeGeneratedRegion`, after the NPC insertion loop (step 8), add a post-processing step that ensures the first safe location (the one with `bindStone: true`) has all required services. This is a server-side safety net regardless of what the LLM generates:

   a. Find the home location (first safe non-uncharted location in the region — same one that gets bindStone/crafting).
   b. Check if a vendor NPC exists at that location. If not, insert a fallback vendor NPC:
      ```
      { name: 'The Reluctant Merchant', npcType: 'vendor', locationId: homeLocation.id,
        description: 'A merchant who seems mildly annoyed by the concept of commerce.',
        greeting: 'Fine. I suppose you want to buy something. Let us get this over with.',
        personalityJson: JSON.stringify({ traits: ['reluctant', 'sardonic'], speechPattern: 'speaks with weary resignation', knowledgeDomains: ['trade goods'], secrets: [], affinityMultiplier: 1.0 }) }
      ```
   c. Check if a banker NPC exists at that location. If not, insert a fallback banker NPC:
      ```
      { name: 'The Ledger Keeper', npcType: 'banker', locationId: homeLocation.id,
        description: 'A meticulous figure who guards your valuables with obsessive precision.',
        greeting: 'Your assets are safe. They are always safe. I do not make mistakes.',
        personalityJson: JSON.stringify({ traits: ['meticulous', 'protective'], speechPattern: 'speaks in clipped precise sentences', knowledgeDomains: ['banking', 'valuables'], secrets: [], affinityMultiplier: 1.0 }) }
      ```

   The logic should: iterate through the inserted NPCs to check for npcType === 'vendor' and npcType === 'banker' at the home location (the first safe location that got bindStone: true). Only insert fallbacks if missing.

   Extract the "find home location" logic into a helper function `findHomeLocation(locationsByName)` that returns the first safe non-uncharted location, since the same pattern is used here and in index.ts character placement.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vitest run spacetimedb/src/helpers/world_gen.test.ts --reporter=verbose 2>&1 | tail -20</automated>
  </verify>
  <done>writeGeneratedRegion always produces a starting location with bindstone, crafting, vendor NPC, and banker NPC — even when LLM output omits them</done>
</task>

<task type="auto">
  <name>Task 2: Auto-look on travel + unit tests for both features</name>
  <files>spacetimedb/src/reducers/intent.ts, spacetimedb/src/helpers/world_gen.test.ts, spacetimedb/src/reducers/intent.test.ts, spacetimedb/package.json</files>
  <action>
1. Set up vitest in `spacetimedb/package.json`:
   - Add devDependency: `"vitest": "^3.2.1"`
   - Add script: `"test": "vitest run"`
   - Run `cd spacetimedb && npm install`

2. In `spacetimedb/src/reducers/intent.ts`, after the inline move (around line 823, after `appendLocationEvent` for arrival), extract the bare LOOK logic (lines 94-201) into a reusable function and call it after travel. Specifically:
   - Extract the bare "look" block (lines 94-201 of intent.ts) into a standalone exported function: `export function buildLookOutput(ctx: any, character: any): string[]` that returns the parts array.
   - After the `appendLocationEvent(ctx, matchedLocation.id, 'move', ...)` line in the travel handler, re-read the character from db (since locationId just changed), call `buildLookOutput`, and emit as a 'look' event:
     ```
     const arrivedChar = ctx.db.character.id.find(character.id);
     if (arrivedChar) {
       const lookParts = buildLookOutput(ctx, arrivedChar);
       if (lookParts.length > 0) {
         appendPrivateEvent(ctx, arrivedChar.id, arrivedChar.ownerUserId, 'look', lookParts.join('\n'));
       }
     }
     ```
   - Update the bare "look" handler (lines 94-201) to use the same `buildLookOutput` function.
   - IMPORTANT: `buildLookOutput` must be defined INSIDE the `registerIntentReducers` closure so it has access to `ctx.db`, `getWorldState`, etc. Or accept the necessary imports as parameters. The cleanest approach: define it as a module-level exported function that takes `(ctx, character)` and imports `getWorldState` from helpers. The intent handler already imports `getWorldState`.

3. Create `spacetimedb/src/helpers/world_gen.test.ts` with unit tests:
   - Test: `writeGeneratedRegion` with LLM output containing NO vendor/banker NPCs still produces vendor + banker at the home location
   - Test: `writeGeneratedRegion` with LLM output containing vendor + banker does NOT create duplicates
   - Test: The home location always has `bindStone: true` and `craftingAvailable: true`
   - Since SpacetimeDB's `ctx.db` is not available in unit tests, create mock objects that simulate the db interface (insert returns the inserted row with an auto-incrementing id, iter/filter return arrays, etc.). Use a simple in-memory mock.

4. Create `spacetimedb/src/reducers/intent.test.ts` with unit tests:
   - Test: `buildLookOutput` returns array containing location name and description
   - Test: Travel intent handler emits both 'move' and 'look' events (verify via mock appendPrivateEvent calls)
   - Use the same mock db pattern.

   For both test files, mock the db with a pattern like:
   ```typescript
   function createMockDb() {
     const tables: Record<string, any[]> = {};
     let nextId = 1n;
     return new Proxy({}, {
       get: (_, tableName: string) => ({
         insert: (row: any) => { const r = { ...row, id: row.id === 0n ? nextId++ : row.id }; (tables[tableName] ??= []).push(r); return r; },
         id: { find: (id: bigint) => (tables[tableName] ?? []).find(r => r.id === id), update: (row: any) => { /* update in place */ }, delete: (id: bigint) => { /* remove */ } },
         iter: () => (tables[tableName] ?? []),
         by_location: { filter: (locId: bigint) => (tables[tableName] ?? []).filter(r => r.locationId === locId) },
         by_from: { filter: (id: bigint) => (tables[tableName] ?? []).filter(r => r.fromLocationId === id) },
         by_to: { filter: (id: bigint) => (tables[tableName] ?? []).filter(r => r.toLocationId === id) },
         by_character: { filter: (id: bigint) => (tables[tableName] ?? []).filter(r => r.characterId === id) },
         by_template: { filter: (id: bigint) => (tables[tableName] ?? []).filter(r => r.enemyTemplateId === id) },
         by_spawn: { filter: (id: bigint) => (tables[tableName] ?? []).filter(r => r.spawnId === id) },
       })
     });
   }
   ```
  </action>
  <verify>
    <automated>cd C:/projects/uwr/spacetimedb && npx vitest run --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>Travel auto-emits full LOOK output. Unit tests pass proving: (1) starting location always has all 4 services, (2) travel produces both move and look events.</done>
</task>

</tasks>

<verification>
- `cd C:/projects/uwr/spacetimedb && npx vitest run` — all tests pass
- Grep for `npcType.*banker` in llm_prompts.ts confirms banker is a valid type
- Grep for `The Reluctant Merchant` or `The Ledger Keeper` in world_gen.ts confirms fallback NPCs
- Grep for `buildLookOutput` in intent.ts confirms extracted function exists and is called from travel handler
</verification>

<success_criteria>
- writeGeneratedRegion guarantees bindstone + crafting + vendor NPC + banker NPC at starting location
- LLM prompt schema includes banker npcType
- Travel to a new location automatically shows full LOOK output (location, NPCs, enemies, resources, exits)
- Unit tests enforce both rules and pass
</success_criteria>

<output>
After completion, create `.planning/quick/362-ensure-new-characters-spawn-in-safe-loca/362-SUMMARY.md`
</output>
