# Architecture Patterns

**Domain:** LLM-driven living world RPG integration into existing SpacetimeDB + Vue 3 multiplayer game
**Researched:** 2026-03-06
**Confidence:** HIGH (based on codebase analysis + SpacetimeDB procedure docs)

---

## Existing Architecture Summary

The current codebase is a mature two-tier architecture:

**Server (SpacetimeDB TypeScript backend):**
- `spacetimedb/src/schema/tables.ts` — ~90 tables (1870 lines), all game state
- `spacetimedb/src/reducers/` — 20 reducer modules (auth, combat, commands, items, etc.)
- `spacetimedb/src/views/` — 9 view modules (scoped per-player data via `ctx.sender`)
- `spacetimedb/src/helpers/` — 15 helper modules (events, combat, items, etc.)
- `spacetimedb/src/data/` — Static game data (races, abilities, items, NPCs, etc.)
- Event system: `EventWorld`, `EventLocation`, `EventPrivate`, `EventGroup` tables (all `event: true`)
- Scheduled tables for combat loops, regen, casts, day/night, respawns

**Client (Vue 3 SPA):**
- `src/composables/` — 21 composables (useEvents, useCommands, useCombat, etc.)
- `src/components/` — 34 components (panels, overlays, modals)
- Panel system: `FloatingPanel` with `usePanelManager` for draggable/resizable windows
- Event log: `LogWindow` + `CommandBar` — primary text interaction
- `useTable()` for reactive SpacetimeDB subscriptions
- `useReducer()` for calling server reducers with object syntax

**Key patterns already established:**
1. All mutations via reducers, never client-side state
2. Events delivered via `event: true` tables (auto-pushed, no subscription SQL needed)
3. Commands via `/slash` syntax in `CommandBar.vue`
4. NPC dialogue via tree-based `NpcDialogueOption` table with affinity gating
5. Character creation via form-based composable (`useCharacterCreation.ts`)

---

## 1. LLM Pipeline Architecture

### The Flow: Reducer + Procedure + Status Table

SpacetimeDB procedures support synchronous HTTP via `ctx.http.fetch()` and return values to the caller via Promise. Database access requires `ctx.withTx()`. Procedures CANNOT hold a transaction open while making HTTP calls.

**Recommended pipeline:**

```
[Player action] --> [Reducer: validate, mutate game state, insert pending row]
                         |
                         v
              [Client: sees pending row via subscription]
              [Client: calls procedure to fulfill it]
                         |
                         v
              [Procedure: read context via ctx.withTx()]
              [Procedure: call Anthropic API via ctx.http.fetch()]
              [Procedure: write result via ctx.withTx()]
                         |
                         v
              [All clients: subscription fires on status change]
```

**Why client-triggered (not server-scheduled):**
- SpacetimeDB scheduled tables fire reducers, not procedures. A reducer cannot make HTTP calls.
- A reducer could call a procedure, but the scheduling mechanism adds complexity for no benefit.
- Client-triggered is simpler: client sees `status: 'pending'`, calls `conn.procedures.generateContent(...)`.
- The procedure validates the request server-side (checks pending row exists, isn't already fulfilled).
- If the client disconnects mid-generation, the pending row persists. Another client (or reconnection) can retry.

### The LLM Procedure

```typescript
// In spacetimedb/src/procedures/llm.ts

spacetimedb.procedure(
  'generate_content',
  {
    requestId: t.u64(),    // ID of the LlmRequest row
  },
  t.string(),              // Returns status: 'completed' | 'error'
  (ctx, { requestId }) => {
    // 1. Read the request and context inside a transaction
    const requestData = ctx.withTx(tx => {
      const req = tx.db.llmRequest.id.find(requestId);
      if (!req) throw new SenderError('Request not found');
      if (req.status !== 'pending') throw new SenderError('Already processed');

      // Mark as in-progress to prevent duplicate calls
      tx.db.llmRequest.id.update({ ...req, status: 'processing' });

      // Gather context data needed for the prompt
      return {
        requestType: req.requestType,
        contextJson: req.contextJson,
        characterId: req.characterId,
      };
    });

    // 2. Build prompt and call Anthropic (OUTSIDE transaction)
    const apiKey = ctx.withTx(tx => {
      const config = tx.db.llmConfig.key.find('api_key');
      return config?.value ?? '';
    });

    if (!apiKey) {
      ctx.withTx(tx => {
        const req = tx.db.llmRequest.id.find(requestId)!;
        tx.db.llmRequest.id.update({ ...req, status: 'error', errorMessage: 'No API key configured' });
      });
      return 'error';
    }

    const prompt = buildPrompt(requestData.requestType, requestData.contextJson);

    const response = ctx.http.fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
      timeout: TimeDuration.fromMillis(30000),
    });

    const body = JSON.parse(response.text());
    const generatedText = body.content[0].text;

    // 3. Write result back inside a transaction
    ctx.withTx(tx => {
      const req = tx.db.llmRequest.id.find(requestId)!;
      tx.db.llmRequest.id.update({
        ...req,
        status: 'completed',
        resultJson: generatedText,
        completedAt: tx.timestamp,
      });

      // Route result to the appropriate game table
      routeResult(tx, req.requestType, req.characterId, generatedText);
    });

    return 'completed';
  }
);
```

### Request Table Schema

```typescript
export const LlmRequest = table(
  {
    name: 'llm_request',
    public: true,
    indexes: [
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { accessor: 'by_status', algorithm: 'btree', columns: ['status'] },
      { accessor: 'by_type', algorithm: 'btree', columns: ['requestType'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    requestType: t.string(),     // 'char_creation' | 'skill_offer' | 'region_gen' | 'npc_gen' | 'quest_gen' | 'combat_narration'
    contextJson: t.string(),     // JSON blob of context for prompt building
    status: t.string(),          // 'pending' | 'processing' | 'completed' | 'error'
    resultJson: t.string(),      // LLM response (empty until completed)
    errorMessage: t.string(),    // Error details (empty unless error)
    createdAt: t.timestamp(),
    completedAt: t.timestamp().optional(),
  }
);
```

### Config Table (API Key Storage)

```typescript
export const LlmConfig = table(
  { name: 'llm_config' },  // NOT public - never expose API keys to clients
  {
    key: t.string().primaryKey(),
    value: t.string(),
  }
);
// Keys: 'api_key', 'model', 'max_requests_per_minute', 'circuit_breaker_failures', 'circuit_breaker_open_until'
```

### Client-Side Trigger Pattern

```typescript
// In src/composables/useLlm.ts
export const useLlm = (conn: Ref<DbConnection | null>) => {
  const pendingRequests = computed(() =>
    llmRequests.value.filter(r => r.status === 'pending')
  );

  // Watch for pending requests that need fulfillment
  watch(pendingRequests, async (pending) => {
    for (const req of pending) {
      // Only trigger if this client's character owns the request
      if (req.characterId !== selectedCharacter.value?.id) continue;
      try {
        await conn.value?.procedures.generateContent({ requestId: req.id });
      } catch (e) {
        console.error('LLM generation failed:', e);
      }
    }
  });
};
```

---

## 2. Chat-First UI Architecture

### Current UI: Panel-Based

The existing UI is panel-based: `LogWindow` (event log), `CommandBar` (slash commands), and ~30 floating panels. The log window renders events from 4 scoped event tables. Commands go through `useCommands.ts` which dispatches to various reducers.

### New UI: Narrative Console as Primary Surface

The chat-first UI does NOT replace the panel system. It **promotes** the log + command bar from "one panel among many" to "the primary surface." Panels become secondary overlays that open on demand.

**Component changes:**

| Component | Action | Rationale |
|-----------|--------|-----------|
| `LogWindow.vue` | **Evolve** into `NarrativeConsole.vue` | Becomes full-width, supports rich narrative formatting, typing indicators |
| `CommandBar.vue` | **Evolve** into chat input | Natural language input alongside slash commands |
| `FloatingPanel` system | **Keep as-is** | Panels overlay the narrative for inventory, stats, etc. |
| `CharacterPanel.vue` | **Replace** with `CharacterCreationFlow.vue` | Multi-step narrative instead of form |
| `SplashScreen.vue` | **Keep** | Login remains the same |
| `App.vue` | **Modify** | Layout shifts: narrative console takes center, panels float over |

### New Components

```
src/components/
  NarrativeConsole.vue        -- Full-width narrative log with rich formatting
  NarrativeInput.vue          -- Chat input that supports both /commands and natural language
  NarrativeMessage.vue        -- Individual message renderer (system, npc, player, combat)
  CharacterCreationFlow.vue   -- Multi-step narrative character creation
  SkillOfferPanel.vue         -- Level-up skill selection (3 LLM-generated choices)
  NarrativeTypingIndicator.vue -- "The System is considering..." indicator
```

### New Composables

```
src/composables/
  useLlm.ts                  -- LLM request/response lifecycle
  useNarrative.ts             -- Message formatting, typing state, scroll behavior
  useCharacterCreationFlow.ts -- State machine for narrative character creation
  useSkillOffers.ts           -- Level-up skill offer management
```

### Narrative Message Types

The existing event system uses `kind` strings: `'system'`, `'presence'`, `'npc'`, `'damage'`, `'heal'`, `'reward'`, `'command'`, `'faction'`, `'avoid'`, `'blocked'`. New kinds needed:

```typescript
// New event kinds for narrative
'narrator'     // The System speaking (sardonic commentary)
'creation'     // Character creation conversation
'skill_offer'  // Level-up skill choices
'world_shift'  // Ripple announcements ("The world trembles...")
'quest_narrate' // Quest narrative text
```

These flow through the EXISTING `EventPrivate` table. No new event tables needed. The `NarrativeConsole` renders them with richer formatting based on `kind`.

### Integration with Existing Event System

The existing `useEvents.ts` composable merges 4 event tables into `combinedEvents`. The narrative console consumes the same data but renders differently:

```typescript
// In useNarrative.ts
const narrativeMessages = computed(() =>
  combinedEvents.value.map(event => ({
    ...event,
    renderType: mapKindToRenderType(event.kind),
    // 'narrator' → full-width, styled, possibly animated
    // 'damage' → compact combat log line
    // 'npc' → dialogue bubble style
    // 'system' → muted info line
  }))
);
```

---

## 3. Procedural World Storage

### Principle: LLM-Generated Content Uses Existing Table Shapes

The existing schema already has `Region`, `Location`, `LocationConnection`, `Npc`, `NpcDialogueOption`, `EnemyTemplate`, `QuestTemplate`, etc. LLM-generated content should write INTO these same tables, not create parallel structures.

### New Tables for LLM-Generated Content

```typescript
// Tracks which content was LLM-generated (vs. seeded)
export const GeneratedContent = table(
  {
    name: 'generated_content',
    indexes: [
      { accessor: 'by_target', algorithm: 'btree', columns: ['targetTable', 'targetId'] },
      { accessor: 'by_request', algorithm: 'btree', columns: ['llmRequestId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    targetTable: t.string(),     // 'region' | 'location' | 'npc' | 'quest_template' | 'enemy_template' | 'ability_template'
    targetId: t.u64(),           // PK of the generated row in the target table
    llmRequestId: t.u64(),       // FK to LlmRequest that created it
    generatedAt: t.timestamp(),
    promptHash: t.string(),      // For deduplication
  }
);

// Character's generated class (the LLM-created class definition)
export const GeneratedClass = table(
  {
    name: 'generated_class',
    public: true,
    indexes: [
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { accessor: 'by_name', algorithm: 'btree', columns: ['className'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    className: t.string(),           // "Ashweaver", "Bonecaller", etc.
    archetype: t.string(),           // 'warrior' | 'mystic'
    description: t.string(),         // LLM-generated class description
    primaryStat: t.string(),         // 'str' | 'dex' | 'int' | 'wis' | 'cha'
    secondaryStat: t.string(),
    armorType: t.string(),           // 'cloth' | 'leather' | 'mail' | 'plate'
    resourceType: t.string(),        // 'mana' | 'stamina' | 'rage' | custom
    flavorJson: t.string(),          // Additional LLM-generated flavor (lore, personality hints)
    createdAt: t.timestamp(),
  }
);

// Skill offers at level-up
export const SkillOffer = table(
  {
    name: 'skill_offer',
    public: true,
    indexes: [
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    level: t.u64(),              // The level these were offered at
    abilityKey: t.string(),      // Generated unique key
    abilityName: t.string(),
    description: t.string(),     // LLM-generated description
    abilityJson: t.string(),     // Full ability stats as JSON (power, cooldown, etc.)
    chosen: t.bool(),            // True if player picked this one
    expired: t.bool(),           // True if unchosen and no longer available
    createdAt: t.timestamp(),
  }
);
```

### How LLM Content Flows Into Existing Tables

When the LLM generates a region, the procedure writes to the EXISTING tables:

```typescript
// Inside the procedure's ctx.withTx(), after parsing LLM response:
function routeRegionResult(tx: any, parsed: RegionGenResult, characterId: bigint) {
  // 1. Create region in existing Region table
  const region = tx.db.region.insert({
    id: 0n,
    name: parsed.regionName,
    dangerMultiplier: parsed.dangerLevel * 100n,
    regionType: parsed.regionType,
  });

  // 2. Create locations in existing Location table
  for (const loc of parsed.locations) {
    const location = tx.db.location.insert({
      id: 0n,
      name: loc.name,
      description: loc.description,
      zone: parsed.regionName,
      regionId: region.id,
      levelOffset: loc.levelOffset,
      isSafe: loc.isSafe,
      terrainType: loc.terrainType,
      bindStone: loc.isSafe, // Safe locations get bind stones
      craftingAvailable: loc.hasCrafting,
    });

    // 3. Create location connections in existing table
    // (connections built after all locations created)
  }

  // 4. Create NPCs in existing Npc table
  for (const npc of parsed.npcs) {
    tx.db.npc.insert({
      id: 0n,
      name: npc.name,
      npcType: npc.type,
      locationId: npc.locationId,
      description: npc.description,
      greeting: npc.greeting,
      personalityJson: JSON.stringify(npc.personality),
      baseMood: npc.mood,
    });
  }

  // 5. Track that this was LLM-generated
  tx.db.generatedContent.insert({
    id: 0n,
    targetTable: 'region',
    targetId: region.id,
    llmRequestId: requestId,
    generatedAt: tx.timestamp,
    promptHash: hash,
  });
}
```

### What Existing Systems Consume

| System | Table | How LLM Content Integrates |
|--------|-------|---------------------------|
| Combat | `EnemyTemplate`, `LocationEnemyTemplate` | LLM generates enemy types for new regions; combat engine consumes them identically to seeded enemies |
| Inventory | `ItemTemplate` | LLM can generate unique items; existing loot/equip system handles them |
| Quests | `QuestTemplate` | LLM generates quests; existing quest accept/progress/complete flow works unchanged |
| Travel | `Location`, `LocationConnection` | LLM generates new locations; existing travel system discovers them |
| NPC Dialogue | `Npc`, `NpcDialogueOption` | LLM generates NPCs with dialogue trees; existing dialogue system works |

---

## 4. Character Creation Flow

### State Machine in SpacetimeDB

Character creation becomes a multi-step conversation tracked by a state table.

```typescript
export const CharacterCreation = table(
  {
    name: 'character_creation',
    public: true,
    indexes: [
      { accessor: 'by_player', algorithm: 'btree', columns: ['playerId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    playerId: t.identity(),
    step: t.string(),             // 'intro' | 'race_input' | 'race_confirm' | 'archetype_pick' | 'class_generating' | 'class_reveal' | 'name_input' | 'complete'
    raceFreetext: t.string(),     // What the player typed for race ("a shadow elf with silver eyes")
    raceNormalized: t.string(),   // LLM-normalized race name ("Shadow Elf")
    raceDescription: t.string(),  // LLM-generated race description
    archetype: t.string(),        // 'warrior' | 'mystic'
    classResult: t.string(),      // JSON of the generated class (empty until class_reveal)
    characterName: t.string(),    // Chosen name (empty until name_input)
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);
```

### State Machine Flow

```
intro
  System: "Ah, another soul stumbles into existence..."
  System: "What manner of creature are you? Describe yourself."
  → Player types freeform race description
  → Insert LlmRequest(type: 'race_interpret')

race_input
  → LLM interprets freeform text into race name + description + stat bonuses
  → Update step to 'race_confirm'

race_confirm
  System: "A Shadow Elf, is it? [description]. Adequate, I suppose."
  System: "Now then. Are you the sort who solves problems with violence (Warrior), or the sort who solves problems with slightly more elegant violence (Mystic)?"
  → Player picks archetype
  → Update step to 'archetype_pick'

archetype_pick
  → Insert LlmRequest(type: 'class_generate', context: { race, archetype })
  → Update step to 'class_generating'

class_generating
  [Client shows: "The System is deliberating on your particular brand of mediocrity..."]
  → LLM generates unique class: name, description, stat profile, resource type
  → Update step to 'class_reveal'

class_reveal
  System: "You are an Ashweaver. [description]. Don't let it go to your head."
  System: "What do they call you?"
  → Player types character name
  → Update step to 'name_input'

name_input
  → Validate name (length, uniqueness, profanity)
  → Create Character row with generated class stats
  → Create GeneratedClass row
  → Insert 3 starter AbilityTemplate rows for the class
  → Update step to 'complete'
  → Delete CharacterCreation row (or mark complete)

complete
  System: "Welcome to the world, [Name]. Try not to die immediately."
  → Transition to game world
  → Trigger region generation for starting area if needed
```

### Reducer for Creation Steps

```typescript
spacetimedb.reducer('creation_step', {
  input: t.string(),  // Player's text input or choice
}, (ctx, { input }) => {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player) throw new SenderError('Not logged in');

  const creation = [...ctx.db.characterCreation.by_player.filter(ctx.sender)][0];
  if (!creation) throw new SenderError('No creation in progress');

  switch (creation.step) {
    case 'intro':
      // Player described their race
      ctx.db.characterCreation.id.update({
        ...creation,
        raceFreetext: input,
        step: 'race_input',
        updatedAt: ctx.timestamp,
      });
      // Insert LLM request for race interpretation
      ctx.db.llmRequest.insert({
        id: 0n,
        characterId: 0n, // No character yet
        requestType: 'race_interpret',
        contextJson: JSON.stringify({ freetext: input }),
        status: 'pending',
        resultJson: '',
        errorMessage: '',
        createdAt: ctx.timestamp,
      });
      break;

    case 'race_confirm':
      // Player picked archetype
      const archetype = input.toLowerCase();
      if (archetype !== 'warrior' && archetype !== 'mystic') {
        appendPrivateEventByPlayer(ctx, player, 'creation',
          'The System sighs. "Warrior or Mystic. Those are the options. Choose."');
        return;
      }
      ctx.db.characterCreation.id.update({
        ...creation,
        archetype,
        step: 'archetype_pick',
        updatedAt: ctx.timestamp,
      });
      // Insert LLM request for class generation
      ctx.db.llmRequest.insert({
        id: 0n,
        characterId: 0n,
        requestType: 'class_generate',
        contextJson: JSON.stringify({
          race: creation.raceNormalized,
          raceDescription: creation.raceDescription,
          archetype,
        }),
        status: 'pending',
        resultJson: '',
        errorMessage: '',
        createdAt: ctx.timestamp,
      });
      ctx.db.characterCreation.id.update({
        ...creation,
        archetype,
        step: 'class_generating',
        updatedAt: ctx.timestamp,
      });
      break;

    // ... additional steps
  }
});
```

### Client-Side Creation Flow

```typescript
// In src/composables/useCharacterCreationFlow.ts
export const useCharacterCreationFlow = (/* deps */) => {
  const creationState = computed(() =>
    characterCreations.value.find(c => c.playerId === myIdentity.value)
  );

  const currentStep = computed(() => creationState.value?.step ?? null);
  const isCreating = computed(() => currentStep.value !== null && currentStep.value !== 'complete');

  const submitCreationInput = (input: string) => {
    conn.value?.reducers.creationStep({ input });
  };

  // Watch for pending LLM requests during creation
  // (handled by useLlm composable)

  return { creationState, currentStep, isCreating, submitCreationInput };
};
```

---

## 5. Prompt Management

### Store in Code, Not Database

Prompts should live in code (`spacetimedb/src/data/prompts/`) because:
1. They are versioned with git (rollback, diff, blame)
2. They change with code changes (new fields require new prompts)
3. No runtime edit needed (the API key is the only dynamic config)
4. Prompt caching benefits from stable system prompts

### File Structure

```
spacetimedb/src/data/prompts/
  system_base.ts        -- Core narrator voice and tone rules (shared prefix)
  race_interpret.ts     -- Freeform race text -> structured race data
  class_generate.ts     -- Race + archetype -> unique class definition
  skill_generate.ts     -- Class + level + existing skills -> 3 new skill offers
  region_generate.ts    -- World state + character context -> new region
  npc_generate.ts       -- Region + location context -> NPC with personality
  quest_generate.ts     -- Region + NPC + world state -> quest definition
  combat_narrate.ts     -- Combat round data -> narrative text
  index.ts              -- Prompt builder that assembles system + user messages
```

### Prompt Assembly Pattern

```typescript
// spacetimedb/src/data/prompts/index.ts
import { SYSTEM_BASE } from './system_base';
import { RACE_INTERPRET_PROMPT } from './race_interpret';
import { CLASS_GENERATE_PROMPT } from './class_generate';
// ...

const PROMPT_REGISTRY: Record<string, { system: string; userTemplate: (ctx: any) => string }> = {
  'race_interpret': {
    system: SYSTEM_BASE + RACE_INTERPRET_PROMPT.system,
    userTemplate: RACE_INTERPRET_PROMPT.user,
  },
  'class_generate': {
    system: SYSTEM_BASE + CLASS_GENERATE_PROMPT.system,
    userTemplate: CLASS_GENERATE_PROMPT.user,
  },
  // ...
};

export function buildPrompt(requestType: string, contextJson: string): {
  system: string;
  user: string;
} {
  const entry = PROMPT_REGISTRY[requestType];
  if (!entry) throw new Error(`Unknown request type: ${requestType}`);
  const context = JSON.parse(contextJson);
  return {
    system: entry.system,
    user: entry.userTemplate(context),
  };
}
```

### Prompt Caching Strategy

The Anthropic API supports prompt caching via `cache_control` on system message blocks. Since `SYSTEM_BASE` (narrator voice, tone rules, examples) is identical across all request types, it should be the first block with `cache_control: { type: 'ephemeral' }`. The per-type system instructions follow as a second block.

```typescript
// In the procedure's API call:
body: JSON.stringify({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  system: [
    {
      type: 'text',
      text: SYSTEM_BASE,  // Shared across all requests
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: typeSpecificInstructions,
    },
  ],
  messages: [{ role: 'user', content: userPrompt }],
})
```

---

## 6. Component Boundaries

### Server-Side New Components

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `procedures/llm.ts` | HTTP calls to Anthropic, response parsing | LlmRequest table, LlmConfig table, all game tables (via routeResult) |
| `data/prompts/` | Prompt templates and assembly | Called by procedures/llm.ts |
| `reducers/creation.ts` | Character creation state machine | CharacterCreation table, LlmRequest table, Character table |
| `reducers/skills.ts` (modified) | Level-up with skill offers | SkillOffer table, AbilityTemplate table, LlmRequest table |
| `reducers/world_gen.ts` | Region/location generation triggers | Region, Location, Npc tables, LlmRequest table |
| `helpers/llm_routing.ts` | Routes LLM results to game tables | All game tables |
| Schema additions | LlmRequest, LlmConfig, CharacterCreation, GeneratedClass, SkillOffer, GeneratedContent | N/A |

### Client-Side New Components

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `NarrativeConsole.vue` | Primary narrative display | useEvents, useNarrative |
| `NarrativeInput.vue` | Chat/command input | useCommands (existing), useCharacterCreationFlow |
| `CharacterCreationFlow.vue` | Multi-step creation UI | useCharacterCreationFlow |
| `SkillOfferPanel.vue` | Level-up choices | useSkillOffers |
| `useLlm.ts` | LLM request lifecycle, procedure calls | conn.procedures |
| `useNarrative.ts` | Message formatting, typing indicators | useEvents (existing) |
| `useCharacterCreationFlow.ts` | Creation state machine (client side) | CharacterCreation table |
| `useSkillOffers.ts` | Skill offer display and selection | SkillOffer table |

### Modified Existing Components

| Component | Modification |
|-----------|-------------|
| `App.vue` | Layout restructure: narrative console as primary, panels as overlays |
| `useCharacterCreation.ts` | Replaced by `useCharacterCreationFlow.ts` |
| `useEvents.ts` | Add new event kinds for narrative types |
| `CommandBar.vue` | Evolves into `NarrativeInput.vue` (or wraps it) |
| `LogWindow.vue` | Evolves into `NarrativeConsole.vue` (or wraps it) |
| `schema/tables.ts` | New table definitions added |
| `reducers/index.ts` | Register new reducer modules |

---

## 7. Data Flow Diagrams

### Character Creation Data Flow

```
[Client: NarrativeInput]
    |
    v
[Reducer: creation_step] --> [CharacterCreation table (step updated)]
    |                                    |
    v                                    v
[LlmRequest table (pending)]    [Client: sees step change, shows System message]
    |
    v
[Client: useLlm watches pending] --> [Procedure: generate_content]
    |                                        |
    v                                        v
[Anthropic API]                      [LlmRequest (completed)]
                                             |
                                             v
                                     [CharacterCreation (step advanced, data filled)]
                                             |
                                             v
                                     [Client: sees next step, shows result]
```

### Region Generation Data Flow

```
[Player enters world / travels to edge]
    |
    v
[Reducer: checks if region exists at destination]
    |
    NO --> [Insert LlmRequest(type: 'region_gen')]
    |      [Insert placeholder Region + Location rows with minimal data]
    |      [EventWorld: "The world shifts at the edges..."]
    |
    v
[Client: useLlm triggers procedure]
    |
    v
[Procedure: gathers world state, calls Anthropic]
    |
    v
[Procedure: updates Region/Location/Npc/EnemyTemplate rows with generated content]
    |
    v
[All clients: subscription updates show new region data]
[EventWorld: "A new land reveals itself: The Ashen Steppes"]
```

### Combat Narration Data Flow

```
[Combat loop tick fires (existing scheduled reducer)]
    |
    v
[Reducer: resolves combat round, writes damage/heal events (existing)]
    |
    v
[Reducer: inserts LlmRequest(type: 'combat_narration', context: round_data)]
    |
    v
[Client: triggers procedure for narration]
    |
    v
[Procedure: generates narrative text for the round]
    |
    v
[Procedure: inserts EventPrivate with kind='narrator' for each participant]
    |
    v
[Client: NarrativeConsole renders combat narration alongside mechanical events]
```

---

## 8. Build Order (Dependency Graph)

```
Phase 1: LLM Foundation
  [LlmConfig table] ──────────────────────────────┐
  [LlmRequest table] ─────────────────────────────┤
  [generate_content procedure] ────────────────────┤
  [data/prompts/system_base.ts] ───────────────────┤
  [useLlm.ts composable] ─────────────────────────┘
  WHY FIRST: Everything else depends on this pipeline.

Phase 2: Narrative UI Shell
  [NarrativeConsole.vue] (evolve LogWindow) ───────┐
  [NarrativeInput.vue] (evolve CommandBar) ─────────┤
  [useNarrative.ts] ───────────────────────────────┤
  [New event kinds in useEvents.ts] ───────────────┘
  WHY SECOND: Needed to display any LLM-generated content.
  DEPENDS ON: Phase 1 (for typing indicators on LLM requests)

Phase 3: Character Creation
  [CharacterCreation table] ───────────────────────┐
  [GeneratedClass table] ──────────────────────────┤
  [data/prompts/race_interpret.ts] ────────────────┤
  [data/prompts/class_generate.ts] ────────────────┤
  [reducers/creation.ts] ─────────────────────────┤
  [CharacterCreationFlow.vue] ─────────────────────┤
  [useCharacterCreationFlow.ts] ───────────────────┘
  WHY THIRD: First player-facing LLM feature. High impact, bounded scope.
  DEPENDS ON: Phase 1 (LLM pipeline), Phase 2 (narrative display)

Phase 4: Procedural World Generation
  [data/prompts/region_generate.ts] ───────────────┐
  [GeneratedContent tracking table] ───────────────┤
  [reducers/world_gen.ts] ────────────────────────┤
  [helpers/llm_routing.ts (region routing)] ───────┘
  WHY FOURTH: Players need somewhere to go after creation.
  DEPENDS ON: Phase 1, Phase 3 (character must exist to trigger world gen)

Phase 5: Dynamic Skills
  [SkillOffer table] ──────────────────────────────┐
  [data/prompts/skill_generate.ts] ────────────────┤
  [SkillOfferPanel.vue] ──────────────────────────┤
  [useSkillOffers.ts] ────────────────────────────┤
  [Modify level-up reducer] ──────────────────────┘
  DEPENDS ON: Phase 1, Phase 3 (GeneratedClass defines skill context)

Phase 6: NPC + Quest Generation
  [data/prompts/npc_generate.ts] ──────────────────┐
  [data/prompts/quest_generate.ts] ────────────────┤
  [LLM routing for NPC/Quest tables] ─────────────┘
  DEPENDS ON: Phase 1, Phase 4 (regions must exist for NPCs/quests)

Phase 7: Narrative Combat
  [data/prompts/combat_narrate.ts] ────────────────┐
  [Modify combat loop reducer] ───────────────────┘
  DEPENDS ON: Phase 1, Phase 2, Phase 5 (LLM-generated abilities)
  WHY LAST: Most complex integration point (real-time-ish combat + LLM latency)
```

**Critical path:** Phase 1 -> Phase 2 -> Phase 3 -> Phase 4. Everything branches from Phase 4.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Blocking Reducers on LLM Calls
**What:** Trying to call the LLM from inside a reducer.
**Why bad:** Reducers must be deterministic and cannot make HTTP calls. Even if they could, blocking a reducer on a 2-30 second API call would freeze game state for all players.
**Instead:** Reducer inserts pending request. Procedure handles the HTTP call separately.

### Anti-Pattern 2: Parallel Content Tables
**What:** Creating `GeneratedNpc` alongside the existing `Npc` table.
**Why bad:** Every system that consumes NPCs (dialogue, quests, combat) would need to check two tables. Doubles query complexity, creates sync bugs.
**Instead:** Write generated content INTO the existing tables. Track provenance separately via `GeneratedContent`.

### Anti-Pattern 3: Client-Side State for Creation Flow
**What:** Managing character creation steps in Vue `ref()` state.
**Why bad:** Refreshing the page loses progress. Multi-device play breaks. Server can't validate the current step.
**Instead:** All creation state lives in the `CharacterCreation` table. Client reads it reactively.

### Anti-Pattern 4: Storing Prompts in the Database
**What:** Putting prompt templates in a `PromptTemplate` table.
**Why bad:** Can't version with git, can't diff, can't rollback. Prompts change WITH code (new fields need new prompts). Runtime editing creates untested prompt states.
**Instead:** Prompts in `spacetimedb/src/data/prompts/` as TypeScript files.

### Anti-Pattern 5: One Mega-Procedure
**What:** A single `generate_content` procedure that handles all content types.
**Why bad:** Actually fine for Phase 1. But becomes unmaintainable as prompt logic grows.
**When to split:** When any single prompt file exceeds ~200 lines, or when different content types need different API parameters (model, temperature, max_tokens).

---

## Scalability Considerations

| Concern | At 10 players | At 100 players | At 1000 players |
|---------|---------------|----------------|-----------------|
| LLM API calls | Direct calls, no queuing | Rate limiting per player | Request queue with priority, batch API for pre-generation |
| Content deduplication | Not needed | Context hash dedup for shared content | Content pools pre-generated during off-peak |
| Procedure concurrency | Single procedure handles all | Multiple concurrent procedures fine | Need to monitor SpacetimeDB procedure limits |
| Prompt caching | System prompt cached across calls | Same, with higher hit rate | Same, critical for cost control |
| Event table size | Not a concern | Periodic cleanup of old events | Event archival or TTL |

---

## Sources

- SpacetimeDB Procedures documentation: https://spacetimedb.com/docs/procedures/
- SpacetimeDB TypeScript SDK: https://spacetimedb.com/docs/sdks/typescript/
- Codebase analysis of `spacetimedb/src/schema/tables.ts` (1873 lines, ~90 tables)
- Codebase analysis of `spacetimedb/src/reducers/` (20 modules)
- Codebase analysis of `src/composables/` (21 composables)
- Codebase analysis of `src/components/` (34 components)
- Existing event system: `EventWorld`, `EventLocation`, `EventPrivate`, `EventGroup` tables
- Existing NPC dialogue: `NpcDialogueOption` tree-based system with affinity gating
- Existing character creation: `useCharacterCreation.ts` (form-based, to be replaced)
