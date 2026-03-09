# Phase 27: Procedural World Generation - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Player entering the world triggers persistent region generation based on their race, archetype, and class. Generated regions have locations, NPCs, and enemies written into existing game tables. Regions persist permanently and are discoverable by other players. Other players receive ripple announcements when new regions appear. Canonical world facts are stored in structured tables and injected into subsequent generation prompts. Generation locks prevent duplicate creation.

</domain>

<decisions>
## Implementation Decisions

### Generation Trigger & Flow
- Two triggers: (1) on character creation complete — player's first region, and (2) on exploration — when a player travels to an explicit "uncharted" boundary location
- Existing seeded v1.0 world is kept as the shared starting hub. New characters get their generated region connected to the hub
- Exploration-triggered generation uses explicit "uncharted" locations at region edges (e.g., "The Mists", "Uncharted Wilds") — player intentionally chooses to explore
- While generation is in progress, the player experiences narrative loading: The System narrates the world forming with typewriter animation ("The edges of reality ripple... something ancient stirs..."). Maintains immersion from character creation flow

### Region Identity & Content
- Small regions: 3-5 locations per generated region, 1-2 NPCs, a handful of enemy types
- Strong thematic link to character: race drives biome, class drives atmosphere and threats. A fire mystic gets volcanic terrain, a forest warrior gets deep woods
- Region-level descriptions only — individual locations are named but share the region's description rather than getting unique per-location flavor text
- Matches existing region scale in the seeded world

### Content Storage
- Claude's Discretion — choose the approach that best serves the narrative experience. The narrative is the key to the game experience. Consider: existing tables (Region, Location, Npc, EnemyTemplate) already work with combat, quests, and interaction systems. But if richer narrative fields are needed, extend or supplement as appropriate.

### World Coherence & Canonical Facts
- Region-level canonical facts stored: region name, biome type, dominant faction, key landmarks, notable threats
- Lightweight — enough for future prompts to reference without contradicting, not a deep lore graph
- Neighboring regions are injected into generation prompts so the LLM can create geographically sensible content (no volcano next to glacier without narrative justification)
- Geographic topology: new regions connect to the region the player traveled from (or the hub for first-time generation). Forms an organic expanding web, not a star topology

### World Evolution (WORLD-03)
- Claude's Discretion — decide whether to include basic evolution hooks (storing player activity metrics per region for a future evolution phase) or defer entirely. Generation is the core scope.

### Ripple Announcements
- Semi-informative tone: reveals direction and a hint of theme but not the full region name or who triggered it. E.g., "A new land has been remembered beyond the Ashlands..."
- Templated with variable substitution — pre-written templates with biome hints and adjacent region names. No extra LLM call per announcement. Saves budget for content generation
- World-wide scope: uses existing EventWorld table. All online players see the ripple
- The triggering player receives a distinct, richer personal discovery narrative (private event): "You have wandered beyond the edge of the known world. The System takes a breath and remembers..."

### Generation Locks (WORLD-06)
- Claude's Discretion — implement locking to prevent duplicate region creation when multiple players trigger generation for the same uncharted location simultaneously

### Claude's Discretion
- Content storage approach (extend existing tables vs new tables vs hybrid) — prioritize narrative richness
- World evolution hooks — include or defer
- Generation lock implementation
- LLM model selection for world gen (Sonnet recommended for high-stakes one-time generation per Phase 24 pattern)
- Exact region generation JSON schema for LLM output
- How uncharted locations are seeded at region edges after generation
- dangerMultiplier and levelOffset assignment for generated regions

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildWorldGenPrompt()` in `llm_prompts.ts`: Sardonic world gen prompt already written — "the world is not being created, it is being remembered"
- `EventWorld` table: World-wide event broadcast with `{ message, kind, createdAt }` — direct channel for ripple announcements
- `EventPrivate` table: Per-character private events — channel for personal discovery narrative
- LLM pipeline (Phase 24): `LlmRequest`, `LlmConfig`, `LlmBudget` tables + procedure pattern (withTx read -> http.fetch -> withTx write)
- `CharacterCreationState` table: Has `raceName`, `raceNarrative`, `archetype`, `className`, `classDescription` — all inputs for region generation
- `connectLocations()` helper: Creates bidirectional LocationConnection rows
- `computeLocationTargetLevel()`: Uses region.dangerMultiplier + location.levelOffset for enemy scaling

### Established Patterns
- Region table: `{ id, name, dangerMultiplier, regionType }` — lightweight, will need extension for canonical facts
- Location table: `{ id, name, description, zone, regionId, levelOffset, isSafe, terrainType, bindStone, craftingAvailable }` — fits generated content
- Npc table: `{ id, name, npcType, locationId, description, greeting, factionId, personalityJson, baseMood }` — rich enough for generated NPCs
- EnemyTemplate table: Full combat-ready template with stats, abilities, loot — generated enemies plug in here
- Seeded world uses `ensure_world.ts` for deterministic content creation — pattern for generation output
- Three-phase procedure pattern: withTx(read context) -> http.fetch(LLM) -> withTx(write results)

### Integration Points
- Character creation completion (Phase 26): Trigger point for initial region generation
- `reducers/movement.ts`: Travel reducer — needs to detect uncharted location arrival and trigger generation
- `helpers/location.ts`: Location utilities — extend for generation-related helpers
- `seeding/ensure_world.ts`: Existing world seeding — add uncharted boundary locations to existing regions
- `data/llm_prompts.ts`: World gen prompt exists, needs user-message schema for region JSON output

</code_context>

<specifics>
## Specific Ideas

- Per PROJECT.md: "The world creates itself around players" and "Persistent + evolving regions: world only grows"
- Per PROJECT.md: "Ripple announcements for world growth: players sense world shifts without knowing specifics" — semi-informative chosen over fully mysterious
- The narrative loading experience should feel like a continuation of the character creation flow — same System voice, same typewriter animation, seamless transition from "you are someone" to "you are somewhere"
- Regions should feel lived-in with history and tension (per existing `buildWorldGenPrompt`) — "Every location should have something slightly wrong with it, something beautiful about it, and something that would make a sensible person turn around and leave"

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 27-procedural-world-generation*
*Context gathered: 2026-03-06*
