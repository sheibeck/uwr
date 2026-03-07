# Phase 27: Procedural World Generation - Research

**Researched:** 2026-03-07
**Domain:** LLM-driven procedural content generation within SpacetimeDB TypeScript module
**Confidence:** HIGH

## Summary

Phase 27 implements procedural world generation triggered by player actions -- entering the world after character creation, and exploring uncharted boundary locations. The system uses the established LLM procedure pattern (Phase 24) to call Claude API, generating region content that is written into existing game tables (Region, Location, Npc, EnemyTemplate, etc.).

The codebase is well-prepared for this phase. The `buildWorldGenPrompt()` already exists with the sardonic narrator voice. The three-phase procedure pattern (`withTx(read) -> http.fetch -> withTx(write)`) is battle-tested from character creation. The existing table schema for Region, Location, Npc, EnemyTemplate, LocationConnection, and LocationEnemyTemplate can accept generated content directly. The main engineering challenges are: (1) designing the generation lock to prevent duplicate regions, (2) defining the LLM output JSON schema for region content, (3) wiring the trigger points (creation completion and uncharted location arrival), and (4) seeding uncharted boundary locations on existing regions.

**Primary recommendation:** Build a dedicated `generate_world_region` procedure following the `generate_creation_content` pattern. Extend the Region table with canonical fact fields (biome, faction, landmarks, threats). Use a `WorldGenState` table as both generation lock and state machine (similar to CharacterCreationState).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Two triggers: (1) on character creation complete -- player's first region, and (2) on exploration -- when a player travels to an explicit "uncharted" boundary location
- Existing seeded v1.0 world is kept as the shared starting hub. New characters get their generated region connected to the hub
- Exploration-triggered generation uses explicit "uncharted" locations at region edges (e.g., "The Mists", "Uncharted Wilds") -- player intentionally chooses to explore
- While generation is in progress, the player experiences narrative loading: The System narrates the world forming with typewriter animation
- Small regions: 3-5 locations per generated region, 1-2 NPCs, a handful of enemy types
- Strong thematic link to character: race drives biome, class drives atmosphere and threats
- Region-level descriptions only -- individual locations are named but share the region's description rather than getting unique per-location flavor text
- Region-level canonical facts stored: region name, biome type, dominant faction, key landmarks, notable threats
- Neighboring regions are injected into generation prompts so the LLM can create geographically sensible content
- Geographic topology: new regions connect to the region the player traveled from (or the hub for first-time generation). Forms an organic expanding web
- Semi-informative ripple announcements: reveals direction and a hint of theme but not the full region name or who triggered it
- Templated ripple announcements with variable substitution -- no extra LLM call per announcement
- World-wide scope: uses existing EventWorld table. All online players see the ripple
- Triggering player receives a distinct, richer personal discovery narrative (private event)

### Claude's Discretion
- Content storage approach (extend existing tables vs new tables vs hybrid) -- prioritize narrative richness
- World evolution hooks -- include or defer
- Generation lock implementation
- LLM model selection for world gen (Sonnet recommended for high-stakes one-time generation per Phase 24 pattern)
- Exact region generation JSON schema for LLM output
- How uncharted locations are seeded at region edges after generation
- dangerMultiplier and levelOffset assignment for generated regions

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WORLD-01 | Player entering the world triggers region generation based on race/archetype/class | Trigger on creation COMPLETE step + uncharted location arrival in movement reducer; character data from CharacterCreationState |
| WORLD-02 | Generated regions are persistent -- they exist on the map forever | Content written to existing Region/Location/Npc/EnemyTemplate tables which are permanent |
| WORLD-03 | Region content evolves over time based on player actions and world state | Discretionary -- recommend deferred with lightweight activity counter hook |
| WORLD-04 | Other players receive ripple announcements when new regions appear | appendWorldEvent() with templated messages, EventWorld table with event:true for broadcast |
| WORLD-05 | Canonical world facts stored in structured tables, injected into generation prompts | Extend Region table with biome/faction/landmarks/threats fields; build context string from neighbor regions |
| WORLD-06 | Generation locks prevent duplicate creation of the same region | WorldGenState table row as lock -- insert-or-find pattern in reducer before procedure call |
</phase_requirements>

## Architecture Patterns

### Recommended Project Structure
```
spacetimedb/src/
  schema/tables.ts         # Extended Region table + WorldGenState table
  data/llm_prompts.ts      # World gen user prompt builder + JSON schema
  data/world_gen.ts        # Ripple templates, biome mappings, danger scaling
  reducers/world_gen.ts    # trigger_world_gen reducer (validates + creates lock)
  helpers/world_gen.ts     # writeGeneratedRegion(), buildRegionContext(), pickUnchartedLocations()
  seeding/ensure_world.ts  # Add uncharted boundary locations to existing regions
  index.ts                 # generate_world_region procedure
```

### Pattern 1: Generation State Machine (Lock + Status)
**What:** A `WorldGenState` table row acts as both a concurrency lock and progress tracker, similar to `CharacterCreationState`.
**When to use:** Every world generation trigger (creation complete or uncharted arrival).

```typescript
// New table in schema/tables.ts
export const WorldGenState = table(
  {
    name: 'world_gen_state',
    public: true,
    indexes: [
      { accessor: 'by_player', algorithm: 'btree', columns: ['playerId'] },
      { accessor: 'by_source_location', algorithm: 'btree', columns: ['sourceLocationId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    playerId: t.identity(),
    characterId: t.u64(),
    sourceLocationId: t.u64(),       // The uncharted location or hub connection point
    sourceRegionId: t.u64(),         // Region the player came from
    step: t.string(),                // PENDING, GENERATING, WRITING, COMPLETE, ERROR
    generatedRegionId: t.u64().optional(), // Set after region is created
    errorMessage: t.string().optional(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);
```

**Lock mechanism:** The reducer checks for existing `WorldGenState` rows for the same `sourceLocationId`. If one exists with step != ERROR, generation is already in progress or complete -- skip. This prevents duplicate region creation for the same uncharted location.

### Pattern 2: Three-Phase Procedure (Established)
**What:** The procedure pattern from Phase 24 -- `withTx(read context) -> http.fetch(LLM) -> withTx(write results)`.
**When to use:** The `generate_world_region` procedure follows this exactly.

```typescript
// In index.ts -- follows generate_creation_content pattern
spacetimedb.procedure(
  { name: 'generate_world_region' },
  { genStateId: t.u64() },
  t.string(),
  (ctx: any, { genStateId }: { genStateId: bigint }) => {
    // Phase 1: withTx -- read gen state, character data, neighbor regions, API key
    // Phase 2: http.fetch -- call Claude with world gen prompt + region JSON schema
    // Phase 3: withTx -- parse JSON, insert Region, Locations, NPCs, EnemyTemplates,
    //          LocationConnections, LocationEnemyTemplates, update WorldGenState,
    //          emit ripple announcement, emit private discovery event
  }
);
```

### Pattern 3: Client-Triggered Procedure via State Watch
**What:** Client watches `WorldGenState` table for step changes, calls procedure when step = PENDING.
**When to use:** Identical to character creation's watch on `CharacterCreationState`.

```typescript
// Client composable -- follows useCharacterCreation pattern
watch(worldGenStates, (states) => {
  const myState = states.find(s => s.playerId?.toHexString?.() === myHex && s.step === 'PENDING');
  if (myState && !isWorldGenProcessing.value) {
    isWorldGenProcessing.value = true;
    conn.procedures.generateWorldRegion({ genStateId: myState.id })
      .then(() => { isWorldGenProcessing.value = false; })
      .catch(() => { isWorldGenProcessing.value = false; });
  }
});
```

### Pattern 4: Extending Region Table for Canonical Facts
**What:** Add optional fields to the existing Region table rather than creating a separate canonical facts table.
**Why:** Keeps queries simple, avoids joins, existing code continues to work with new optional fields.

```typescript
// Extended Region table
export const Region = table(
  { name: 'region', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    dangerMultiplier: t.u64(),
    regionType: t.string(),
    // New canonical fact fields (all optional for backward compat with seeded regions)
    biome: t.string().optional(),           // 'volcanic', 'forest', 'tundra', 'desert', 'swamp', 'mountains', etc.
    dominantFaction: t.string().optional(),  // Faction name or description
    landmarks: t.string().optional(),        // JSON array of landmark names/descriptions
    threats: t.string().optional(),          // JSON array of notable threat descriptions
    generatedByCharacterId: t.u64().optional(), // Who triggered generation
    isGenerated: t.bool().optional(),        // Distinguish from seeded content
  }
);
```

### Pattern 5: Uncharted Boundary Locations
**What:** Seed special "uncharted" locations at edges of existing regions. These have `terrainType: 'uncharted'` and `isSafe: true` (no enemies spawn). When a player arrives at one, it triggers generation.
**Why:** The locked decision specifies explicit uncharted locations at region edges.

```typescript
// Added in ensureWorldLayout -- at edges of each seeded region
const mists = upsertLocationByName({
  name: 'The Mists Beyond',
  description: 'A wall of shimmering fog marks the edge of the known world. Something stirs beyond.',
  zone: 'Uncharted',
  regionId: starter.id,
  levelOffset: 0n,
  isSafe: true,           // Safe so no spawns
  terrainType: 'uncharted', // Special marker
  bindStone: false,
  craftingAvailable: false,
});
```

### Anti-Patterns to Avoid
- **Creating separate "canonical facts" table with FK to Region:** Over-engineering. Optional fields on Region are simpler and avoid multi-column index issues.
- **Using the generic `call_llm` procedure:** Too generic. World gen needs specific context assembly (neighbor regions, character data) that belongs in a dedicated procedure.
- **Making LLM call from a reducer:** Reducers must be deterministic. LLM calls MUST use procedures.
- **Optimistic client-side region rendering:** Let subscriptions drive state. Wait for server to write Region/Location rows.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Region content generation | Template-based generation | Claude LLM via procedure | Narrative quality is the key value |
| Ripple announcements | LLM-generated per announcement | Pre-written templates with variable substitution | Saves LLM budget, fast delivery |
| Concurrency lock | Manual flag checks | WorldGenState table + insert-based lock | Transactional safety in SpacetimeDB |
| Location connections | Manual graph management | `connectLocations()` helper | Already handles bidirectional edges |
| Enemy spawning | Custom spawn logic | `ensureSpawnsForLocation()` + `LocationEnemyTemplate` rows | Existing spawn system works for generated locations |
| World event broadcast | Custom notification system | `appendWorldEvent()` + EventWorld table | Already used for world events |

## Common Pitfalls

### Pitfall 1: Duplicate Region Generation Race Condition
**What goes wrong:** Two players arrive at the same uncharted location simultaneously. Both trigger generation. Two regions are created for the same boundary.
**Why it happens:** Without a lock, both reducers see "no region exists here" and both proceed.
**How to avoid:** Use the `WorldGenState` table as a lock. The reducer inserts a row for the `sourceLocationId`. Second player's reducer finds the existing row and skips generation (or waits for it to complete and then moves the player to the new region).
**Warning signs:** Two regions with suspiciously similar content connected to the same parent location.

### Pitfall 2: Procedure withTx Context Staling
**What goes wrong:** Data read in Phase 1 (withTx) is stale by Phase 3 (withTx write). Another transaction modified the data.
**Why it happens:** The LLM call takes 5-30 seconds. State can change between read and write transactions.
**How to avoid:** In Phase 3's withTx, re-read and verify the WorldGenState row still has the expected step. If it was already completed/errored by another process, skip the write.
**Warning signs:** Duplicate insertions, step getting overwritten.

### Pitfall 3: Generated Enemy Templates Without Roles
**What goes wrong:** Generated enemies have no `EnemyRoleTemplate` rows, so `pickRoleTemplate()` returns null, and `seedSpawnMembers()` produces empty spawns.
**Why it happens:** The LLM generates enemy names/stats but the procedure doesn't create corresponding role templates.
**How to avoid:** For each generated EnemyTemplate, also create at least one EnemyRoleTemplate row with a default role. Also create EnemyAbility rows for combat to work.
**Warning signs:** Locations with no spawns despite having LocationEnemyTemplate rows.

### Pitfall 4: Missing LocationEnemyTemplate Rows
**What goes wrong:** Enemies don't spawn at generated locations because there's no `LocationEnemyTemplate` linking location to enemy template.
**Why it happens:** The procedure creates the EnemyTemplate and Location but forgets the junction table.
**How to avoid:** When writing generated content, always create LocationEnemyTemplate rows connecting each generated location to appropriate enemy templates.
**Warning signs:** `ensureSpawnsForLocation()` throws "No enemy templates for location."

### Pitfall 5: Region Topology Breaking Travel
**What goes wrong:** Players can't reach the new region because LocationConnections aren't set up correctly.
**Why it happens:** The procedure creates region and locations but doesn't connect the uncharted boundary location to the new region's entry location.
**How to avoid:** Use `connectLocations()` to bidirectionally connect: (1) the uncharted location to the new region's entry location, and (2) all locations within the new region to each other per the generated topology.
**Warning signs:** "Location not connected" error when trying to travel to new region.

### Pitfall 6: Haiku vs Sonnet Model Selection
**What goes wrong:** Using Haiku for world gen produces lower quality, less creative content. Using Sonnet might fail from SpacetimeDB runtime (noted in creation code: "Sonnet HTTP requests fail from SpacetimeDB runtime").
**Why it happens:** Phase 26 discovered Sonnet fails and switched to Haiku for both race and class generation.
**How to avoid:** Use Haiku (claude-haiku-4-5) since it's proven to work from SpacetimeDB procedures. The creation code comment says "Haiku for both -- Sonnet HTTP requests fail from SpacetimeDB runtime." This is a critical finding -- Sonnet may not be viable.
**Warning signs:** HTTP timeout or error when calling procedure.

## Code Examples

### Region Generation JSON Schema (for LLM output)

```typescript
// In data/llm_prompts.ts
export const REGION_GENERATION_SCHEMA = `{
  "regionName": "string -- evocative name (2-4 words)",
  "regionDescription": "string -- 2-3 sentences describing the region's atmosphere, history, and personality",
  "biome": "string -- one of: volcanic, forest, tundra, desert, swamp, mountains, plains, coastal, cavern, ruins",
  "dominantFaction": "string -- name of the dominant local power or group",
  "landmarks": ["string -- 2-3 notable landmarks or features"],
  "threats": ["string -- 2-3 notable threats or dangers"],
  "locations": [
    {
      "name": "string -- location name",
      "terrainType": "string -- one of: mountains, woods, plains, swamp, dungeon, town, city",
      "isSafe": "boolean -- true for settlements",
      "levelOffset": "number -- 0 for base, 1-2 for harder areas",
      "connectsTo": ["string -- names of other locations in this region it connects to"]
    }
  ],
  "npcs": [
    {
      "name": "string -- NPC name",
      "npcType": "string -- vendor, quest, lore",
      "locationName": "string -- which location they reside in",
      "description": "string -- 1-2 sentences",
      "greeting": "string -- their greeting to visitors"
    }
  ],
  "enemies": [
    {
      "name": "string -- enemy type name",
      "creatureType": "string -- beast, undead, humanoid, elemental, construct, aberration",
      "role": "string -- melee, ranged, caster",
      "terrainTypes": "string -- comma-separated terrain types where they appear",
      "groupMin": "number -- 1-3",
      "groupMax": "number -- 1-5",
      "level": "number -- base level, typically 1-3 for starter-adjacent regions"
    }
  ]
}`;

export function buildRegionGenerationUserPrompt(
  characterRace: string,
  characterClass: string,
  characterArchetype: string,
  sourceRegionName: string,
  neighborRegions: { name: string; biome: string; threats: string }[]
): string {
  const neighborContext = neighborRegions.length > 0
    ? `Neighboring regions: ${neighborRegions.map(r => `${r.name} (${r.biome}, threats: ${r.threats})`).join('; ')}`
    : 'This region borders the edge of the known world.';

  return `A ${characterRace} ${characterClass} (${characterArchetype}) has wandered beyond the edge of ${sourceRegionName}.

${neighborContext}

Generate a region that feels thematically linked to this character. The ${characterRace}'s heritage should influence the biome and culture. The ${characterClass} class should influence the atmosphere and threats.

Generate 3-5 locations, 1-2 NPCs, and 2-3 enemy types. All locations share the region description rather than having individual descriptions.

Respond with ONLY valid JSON matching this schema:
${REGION_GENERATION_SCHEMA}`;
}
```

### Ripple Announcement Templates

```typescript
// In data/world_gen.ts
export const RIPPLE_TEMPLATES = [
  'A new land has been remembered beyond {sourceRegion}... the air carries hints of {biomeHint}.',
  'The edges of reality ripple. Something ancient stirs beyond {sourceRegion}.',
  'The world grows. A {biomeHint} presence makes itself known past {sourceRegion}.',
  'Reality exhales. Beyond {sourceRegion}, {biomeHint} terrain has always been there. You simply failed to notice.',
  'The map trembles at its borders. {sourceRegion} is no longer the edge of things.',
];

export const DISCOVERY_TEMPLATES = [
  'You have wandered beyond the edge of the known world. The System takes a breath and remembers... {regionName}.',
  'The mists part. You are the first to remember {regionName}. The System notes this with something almost like interest.',
  'You step into {regionName}. It has always been here. You were simply the first to notice.',
];

export const BIOME_HINTS: Record<string, string[]> = {
  volcanic: ['scorched', 'ember-touched', 'ashen'],
  forest: ['verdant', 'ancient woodland', 'deep-rooted'],
  tundra: ['frost-bitten', 'ice-shrouded', 'crystalline'],
  desert: ['sun-scorched', 'sand-swept', 'arid'],
  swamp: ['mire-cloaked', 'fetid', 'bog-born'],
  mountains: ['stone-crowned', 'peaks of', 'windswept heights'],
  plains: ['wind-swept', 'open expanse', 'grassland'],
  coastal: ['salt-touched', 'tide-worn', 'sea-bitten'],
  cavern: ['subterranean', 'deep-dwelling', 'darkness-steeped'],
  ruins: ['crumbling', 'time-ravaged', 'forgotten'],
};
```

### Writing Generated Content to Tables

```typescript
// In helpers/world_gen.ts -- called from procedure's Phase 3 withTx
export function writeGeneratedRegion(tx: any, parsed: any, genState: any) {
  // 1. Insert Region with canonical facts
  const region = tx.db.region.insert({
    id: 0n,
    name: parsed.regionName,
    dangerMultiplier: 100n, // Base danger -- scaled by distance from hub
    regionType: 'outdoor',
    biome: parsed.biome,
    dominantFaction: parsed.dominantFaction,
    landmarks: JSON.stringify(parsed.landmarks),
    threats: JSON.stringify(parsed.threats),
    generatedByCharacterId: genState.characterId,
    isGenerated: true,
  });

  // 2. Insert Locations (share region description)
  const locationMap: Record<string, bigint> = {};
  for (const loc of parsed.locations) {
    const row = tx.db.location.insert({
      id: 0n,
      name: loc.name,
      description: parsed.regionDescription, // Region-level description shared
      zone: parsed.regionName,
      regionId: region.id,
      levelOffset: BigInt(loc.levelOffset ?? 0),
      isSafe: loc.isSafe ?? false,
      terrainType: loc.terrainType ?? 'plains',
      bindStone: false,
      craftingAvailable: false,
    });
    locationMap[loc.name] = row.id;
  }

  // 3. Connect locations within region
  for (const loc of parsed.locations) {
    if (!loc.connectsTo) continue;
    for (const targetName of loc.connectsTo) {
      const fromId = locationMap[loc.name];
      const toId = locationMap[targetName];
      if (fromId && toId) connectLocations(tx, fromId, toId);
    }
  }

  // 4. Connect entry location to source (uncharted) location
  const entryLocationId = locationMap[parsed.locations[0]?.name];
  if (entryLocationId) {
    connectLocations(tx, genState.sourceLocationId, entryLocationId);
  }

  // 5. Insert EnemyTemplates, EnemyRoleTemplates, and LocationEnemyTemplates
  for (const enemy of parsed.enemies) {
    const template = tx.db.enemy_template.insert({
      id: 0n,
      name: enemy.name,
      role: enemy.role ?? 'melee',
      roleDetail: enemy.role ?? 'melee',
      abilityProfile: 'basic',
      terrainTypes: enemy.terrainTypes ?? 'plains',
      creatureType: enemy.creatureType ?? 'beast',
      timeOfDay: 'any',
      socialGroup: 'solo',
      socialRadius: 0n,
      awareness: 'normal',
      groupMin: BigInt(enemy.groupMin ?? 1),
      groupMax: BigInt(enemy.groupMax ?? 2),
      armorClass: 10n,
      level: BigInt(enemy.level ?? 1),
      maxHp: BigInt((enemy.level ?? 1) * 25 + 50),
      baseDamage: BigInt((enemy.level ?? 1) * 3 + 5),
      xpReward: BigInt((enemy.level ?? 1) * 15 + 10),
    });

    // Create default role template (required for spawn system)
    tx.db.enemy_role_template.insert({
      id: 0n,
      enemyTemplateId: template.id,
      roleKey: enemy.role ?? 'melee',
      displayName: enemy.name,
      role: enemy.role ?? 'melee',
      roleDetail: enemy.role ?? 'melee',
      abilityProfile: 'basic',
    });

    // Link enemy to appropriate locations
    for (const [locName, locId] of Object.entries(locationMap)) {
      const locDef = parsed.locations.find((l: any) => l.name === locName);
      if (locDef?.isSafe) continue; // No enemies in safe locations
      tx.db.location_enemy_template.insert({
        id: 0n,
        locationId: locId as bigint,
        enemyTemplateId: template.id,
      });
    }
  }

  // 6. Insert NPCs
  for (const npc of parsed.npcs) {
    const locId = locationMap[npc.locationName];
    if (!locId) continue;
    tx.db.npc.insert({
      id: 0n,
      name: npc.name,
      npcType: npc.npcType ?? 'lore',
      locationId: locId,
      description: npc.description ?? '',
      greeting: npc.greeting ?? 'Welcome, stranger.',
    });
  }

  // 7. Seed uncharted locations at edges of new region for future exploration
  // Pick 1-2 locations as boundary points and add uncharted exits
  const nonSafeLocations = Object.entries(locationMap).filter(([name]) => {
    const def = parsed.locations.find((l: any) => l.name === name);
    return def && !def.isSafe;
  });
  if (nonSafeLocations.length > 0) {
    const edgeLoc = nonSafeLocations[nonSafeLocations.length - 1];
    const uncharted = tx.db.location.insert({
      id: 0n,
      name: `The Uncharted Beyond ${parsed.regionName}`,
      description: 'A wall of shimmering fog marks the edge of the known world. Something stirs beyond.',
      zone: 'Uncharted',
      regionId: region.id,
      levelOffset: 0n,
      isSafe: true,
      terrainType: 'uncharted',
      bindStone: false,
      craftingAvailable: false,
    });
    connectLocations(tx, edgeLoc[1] as bigint, uncharted.id);
  }

  return region;
}
```

### DangerMultiplier Scaling Strategy

```typescript
// In data/world_gen.ts
// Danger scales by "distance" from hub (number of region hops)
// Hub: 100, Adjacent: 150-200, Two hops: 200-300, Three+: 300-500
export function computeRegionDanger(sourceRegionDanger: bigint): bigint {
  const base = Number(sourceRegionDanger);
  // Increase by 50-100 per hop, with some variance
  const increase = 50 + Math.floor(Math.random() * 50); // Note: use deterministic seed in practice
  return BigInt(Math.min(base + increase, 800)); // Cap at 800 (level 8)
}
```

**Note on determinism:** The danger calculation above uses `Math.random()` for illustration. In SpacetimeDB reducers (which must be deterministic), use `ctx.timestamp` based seed arithmetic instead, as the existing spawn system does.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded world in ensure_world.ts | LLM-generated regions via procedure | Phase 27 (this phase) | World grows organically per player |
| Generic call_llm procedure | Domain-specific procedures | Phase 26 (creation) | Better context assembly per domain |
| Sonnet for quality generation | Haiku for all (Sonnet HTTP fails) | Phase 26 discovery | Must use Haiku until Sonnet HTTP is fixed |

**Critical discovery from Phase 26:** The comment in `index.ts` line 612 says "Haiku for both -- Sonnet HTTP requests fail from SpacetimeDB runtime." This means **Sonnet cannot be used** for world generation procedures despite being the recommended model for high-stakes generation. Haiku must be used. This is HIGH confidence -- it's in the production code.

## Discretion Recommendations

### Content Storage: Extend Existing Tables (Recommended)
Extend the Region table with optional canonical fact fields. This is the simplest approach, avoids new table complexity, and existing code continues to work. The fields (biome, faction, landmarks, threats) are lightweight strings/JSON.

### World Evolution Hooks: Defer (Recommended)
WORLD-03 says "evolves over time." The CONTEXT.md explicitly marks this as discretionary. Recommend deferring with zero hooks -- evolution is its own feature with complex requirements (EVOLVE-01, EVOLVE-02, EVOLVE-03 in Future Requirements). Adding stub counters now adds complexity with no value until those requirements are implemented.

### Generation Lock: WorldGenState Table Row (Recommended)
Insert a WorldGenState row in the trigger reducer. The row's `sourceLocationId` acts as the lock -- second player's reducer checks for existing rows and either waits or joins the result. This is transactionally safe in SpacetimeDB.

### Model Selection: Haiku (Required by Technical Constraint)
Per Phase 26 discovery, Sonnet HTTP requests fail from SpacetimeDB runtime. Use claude-haiku-4-5. Haiku's quality is sufficient for region generation given the structured JSON schema constrains the output.

### DangerMultiplier: Scale from Source Region
New regions inherit source region's danger + 50-100. Hub is 100, first generated regions are 150-200, cascading outward. Caps at 800 (level 8).

### Uncharted Location Seeding: Post-Generation
After generating a region, seed 1-2 "uncharted" locations at its edges for future exploration. Also add uncharted locations to existing seeded regions in `ensureWorldLayout`.

## Open Questions

1. **Loot tables for generated enemies**
   - What we know: Existing enemies have loot tables linked via `terrainType + creatureType + tier`. Generated enemies could use the same lookup if they match existing terrain/creature type combos.
   - What's unclear: Do we need to generate new loot table entries, or can generated enemies reuse existing loot tables?
   - Recommendation: Reuse existing loot tables by matching generated enemy's `terrainType` and `creatureType` to existing loot table rows. This avoids the complexity of generating items and keeps loot balanced.

2. **EnemyAbility rows for generated enemies**
   - What we know: Combat requires EnemyAbility rows linked to EnemyTemplate. Without them, enemies only auto-attack.
   - What's unclear: Should the LLM generate ability details, or should we use a default ability set?
   - Recommendation: Assign a default "basic" ability set to generated enemies (e.g., one melee/ranged ability matching their role). Full ability generation can come in NPC/Quest Generation phase.

3. **Transitioning player after generation completes**
   - What we know: Player triggers generation from uncharted location. Generation takes 5-30 seconds.
   - What's unclear: Should the player auto-move to the new region's entry location, or stay at the uncharted location and choose to travel?
   - Recommendation: Keep player at the uncharted location. Once generation completes, the new region's entry location becomes a connected travel option. The discovery narrative tells them what appeared. They travel manually -- consistent with existing movement system.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `spacetimedb/src/schema/tables.ts` -- all table definitions
- Codebase analysis: `spacetimedb/src/index.ts` lines 415-675 -- LLM procedure patterns
- Codebase analysis: `spacetimedb/src/reducers/creation.ts` -- state machine pattern
- Codebase analysis: `spacetimedb/src/reducers/movement.ts` -- travel trigger point
- Codebase analysis: `spacetimedb/src/helpers/location.ts` -- enemy spawning, connections
- Codebase analysis: `spacetimedb/src/seeding/ensure_world.ts` -- world layout pattern
- Codebase analysis: `spacetimedb/src/data/llm_prompts.ts` -- existing world gen prompt
- Codebase analysis: `spacetimedb/src/composables/useCharacterCreation.ts` -- client procedure call pattern

### Secondary (MEDIUM confidence)
- Phase 26 discovery (code comment): Sonnet HTTP fails from SpacetimeDB runtime

## Metadata

**Confidence breakdown:**
- Architecture patterns: HIGH -- directly modeled on existing Phase 24/26 patterns in codebase
- Table extensions: HIGH -- straightforward optional field additions
- Generation lock: HIGH -- standard SpacetimeDB transactional pattern
- LLM schema design: MEDIUM -- schema is original design, needs iteration during implementation
- Enemy/NPC integration: MEDIUM -- relies on matching existing systems, edge cases possible
- Haiku limitation: HIGH -- documented in production code

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable internal codebase, no external dependencies changing)
