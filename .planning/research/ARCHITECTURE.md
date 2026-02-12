# Architecture Research

**Project:** UWR — Multiplayer Browser RPG (SpacetimeDB 1.12.0, TypeScript)
**Domain:** LLM content pipeline architecture for server-authoritative game backends
**Researched:** 2026-02-11

---

## Content Pipeline Trigger Patterns

### Problem
LLM generation must be triggered at specific game moments without blocking game state mutations or player experience. Three approaches exist:

### Pattern 1: Reducer → Procedure → Table (Fire-and-Forget)
```
[Client action] → [Reducer: mutate game state] → [Schedule Procedure: gen content]
                                                 ↓
                                         [Procedure: call Claude]
                                                 ↓
                                         [Table: write result with status='ready']
                                                 ↓
                                         [All clients: subscription fires]
```

**How it works:**
1. Reducer completes immediately (game state is valid)
2. Reducer writes a "pending" row to a content table (e.g., `QuestText { questId, text: '', status: 'pending' }`)
3. Reducer calls/schedules the procedure (exact mechanism varies — may use SpacetimeDB scheduled table)
4. Procedure runs asynchronously: reads game state, calls Claude, writes text, flips status to `ready`
5. Client subscription fires on status change → UI updates

**Why this is correct:**
- Game state never blocks on LLM
- Multiple clients subscribed to the content table all see the update simultaneously
- Procedure failure doesn't corrupt game state (reducer already committed)

### Pattern 2: Scheduled Table as Async Job Queue
```
[Reducer: insert row into LlmJob table with scheduled time = now]
                    ↓
        [SpacetimeDB scheduled table fires immediately]
                    ↓
        [Reducer: gen_llm_content processes job]
                    ↓
        [Reducer: call procedure for HTTP]
                    ↓
        [Procedure: writes result]
```

**When to use:** When the generation must be retried on failure (the job row persists until processed).
**Limitation:** SpacetimeDB scheduled tables run a reducer, not a procedure. The reducer can call the procedure, but the timing adds complexity.

### Pattern 3: Direct Procedure Trigger (from client)
Client directly calls procedure → procedure reads state, calls Claude, returns text.

**When to use:** ONLY for one-off queries where the result is private to the caller (e.g., preview text for a quest before accepting it).
**Never use for:** Multiplayer-visible content, game state changes.

### Recommendation for UWR
Use **Pattern 1** (Fire-and-Forget via reducer + procedure) for all multiplayer-visible content:
- Quest text generation
- World event consequences
- NPC dialogue
- Faction lore reveals

---

## Content Storage Schema

### Core principle: Status-gated content tables
Every LLM-generated content type has its own table with a `status` column. Clients show placeholders while `status = 'pending'`, then render generated content when `status = 'ready'`.

### Recommended tables

**GeneratedQuestText**
```typescript
table({ name: 'generated_quest_text', public: true }, {
  questId: t.u64().primaryKey(),
  title: t.string(),           // Pre-filled at quest creation
  bodyText: t.string(),        // LLM-generated (empty when pending)
  npcIntro: t.string(),        // LLM-generated NPC dialogue (empty when pending)
  status: t.string(),          // 'pending' | 'ready' | 'fallback'
  generatedAt: t.timestamp().optional(),
  contextHash: t.string(),     // Hash of generation context for deduplication
});
```

**GeneratedEventText**
```typescript
table({ name: 'generated_event_text', public: true }, {
  eventId: t.u64().primaryKey(),
  consequenceText: t.string(),
  narratorComment: t.string(),
  status: t.string(),
  generatedAt: t.timestamp().optional(),
});
```

**GeneratedNpcDialogue**
```typescript
table({ name: 'generated_npc_dialogue', public: true }, {
  id: t.u64().primaryKey().autoInc(),
  npcId: t.u64(),
  triggerContext: t.string(),  // What triggered this dialogue
  dialogueText: t.string(),
  status: t.string(),
  generatedAt: t.timestamp().optional(),
});
```

**LlmConfig** (private — stores API key and settings)
```typescript
table({ name: 'llm_config' }, {  // NOT public
  key: t.string().primaryKey(),
  value: t.string(),
});
// Keys: 'api_key', 'default_model', 'circuit_open', 'failure_count', 'last_failure_at'
```

### Deduplication via context hash
Before calling Claude, compute a hash of the generation context:
```typescript
const hash = computeHash(`${questType}:${zone}:${factionId}:${tier}`);
const existing = ctx.db.generatedQuestText.contextHash.find(hash);
if (existing && existing.status === 'ready') {
  // Reuse existing content — no Claude call needed
  tx.db.generatedQuestText.questId.update({ ...existing, questId: newQuestId });
  return;
}
```
Add a btree index on `contextHash` for O(log n) lookup.

---

## Prompt Engineering for Consistent Tone

### The Shadeslinger tone
Shadeslinger's defining characteristics:
- **Narrator voice**: Third-person omniscient, mildly condescending, darkly amused
- **Humor style**: Dry, British-adjacent, understatement over exaggeration
- **Attitude**: The world is absurd, your quest is ridiculous, and the game acknowledges this
- **Never**: Earnest fantasy purple prose, corporate game-copy energy, modern slang

### System prompt structure (for all UWR generation)
```
You are the narrator of UWR, a multiplayer browser RPG. Your style is modeled on
Shadeslinger: dry wit, biting sarcasm, archaic vocabulary deployed ironically, and
a narrator who is deeply aware of being in a game and mildly disappointed in everyone.

TONE RULES:
- Write in second person ("you") or third person ("the warrior")
- Use archaic terms where they fit, modern ones ironically
- Every sentence should feel like it was written by someone who has seen too much and expects too little
- NPCs are world-weary, mildly helpful, and quietly judging you
- Never use: "epic", "legendary quest", "brave adventurer", "destiny"
- DO use: understatement, dry observations, reluctant assistance

FORMAT:
Return only valid JSON matching the schema below. No preamble, no explanation.
[schema here]

EXAMPLES:
Quest introduction (Friendly tier, retrieve quest):
{"headline": "Missing: One (1) Ledger", "body": "The merchant's accounting ledger has
vanished into the marshes, which says something about the quality of her security
arrangements. Retrieve it before the bog decides it's found a better owner.",
"npc_intro": "I'd look myself, but the marshes and I have an arrangement: I stay dry,
they stay wet. You look like someone with nothing to lose."}

World event consequence (faction threshold reached):
{"headline": "The Iron Compact Stirs", "body": "Ten thousand invoices unpaid. A thousand
debts called in. The Iron Compact has noticed your world exists, and they are, as ever,
delighted by the commercial opportunities presented by the desperate and the dead."}
```

### Key prompt engineering principles
1. **Few-shot examples are mandatory** — abstract tone descriptions fail; examples succeed
2. **Structured JSON output** — parse and validate before storing; reject malformed responses
3. **Inject dynamic context** in the user message, not system message (to maximize cache hits on system prompt)
4. **Temperature 0.4-0.6** — consistent enough to stay on-tone, varied enough to avoid repetition
5. **Explicit length constraints** — "Write exactly 2 sentences" not "write a short description"

### Per-content-type prompts
Each content type (quest, NPC dialogue, event consequence) should have its own system prompt variant — but they should all share a large common section (the tone instructions and examples) that benefits from prompt caching.

---

## Async Generation (Non-Blocking Patterns)

### The core problem
SpacetimeDB procedures make synchronous HTTP calls from the server's perspective — but from the game's perspective, LLM generation must be non-blocking. The game should never stall waiting for Claude.

### Solution: Decouple game state from display text

**Phase 1 (immediate, blocking):** Reducer runs, game state mutates, "pending" row written
**Phase 2 (async, non-blocking):** Procedure generates text, updates row to "ready"
**Client:** Shows loading state → content appears when subscription fires

### Client-side placeholder rendering
```vue
<template>
  <div v-if="questText?.status === 'pending'" class="quest-text loading">
    <span class="narrator-voice">The narrator is composing something suitably
    dispiriting about your current situation. Please stand by.</span>
  </div>
  <div v-else-if="questText?.status === 'ready'" class="quest-text">
    {{ questText.bodyText }}
  </div>
</template>
```

The placeholder itself should be on-tone — even the "loading" state can be flavor text.

### Procedure scheduling
SpacetimeDB 1.12 doesn't have a direct "call procedure from reducer" mechanism. Options:
1. **Scheduled table with `scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 0n)`** — schedules a reducer to fire immediately (next tick). That reducer then calls the procedure.
2. **Separate client trigger** — client sees the "pending" row and calls the procedure itself. Simpler but less authoritative.
3. **Inline procedure call from a separate pathway** — admin or system identity calls procedure after reducer.

**Recommended for UWR**: Option 2 (client-triggered procedure) for simplicity in early phases. The client subscribes to pending content rows and calls the procedure to fulfill them. Later phases can move to server-scheduled generation (option 1) for robustness.

---

## Content Versioning & Reuse

### When to reuse generated content
- Quest descriptions for the same quest type + zone + difficulty tier can be shared across players
- World event consequence text is the same for all players (no personalization needed)
- NPC ambient dialogue can be shared per NPC per context type (greeting, hostile, vendor)

### When to generate fresh
- Quests with player-specific context (faction standing, class, active quest chain) need personalization
- Direct NPC responses to player-specific choices
- Private event log entries for individual player actions

### Versioning strategy
- Store `contextHash` with each generated piece (hash of the inputs used to generate it)
- When regenerating (world state changed), create a new row rather than updating the old one
- Keep last 3 versions per context; garbage collect older ones
- Flag content as `version: number` to allow rollback to previous version if regeneration produces bad output

---

## Recommended Architecture for UWR

### Phase 1: Foundation (implement first)
```
1. Config table: stores API key, model config, circuit breaker state
2. Generated content tables: GeneratedQuestText, GeneratedEventText (with status column)
3. LLM procedure: reads config, calls Claude, writes to content table
4. Client trigger: client sees pending row → calls procedure
5. Fallback content: pre-written arrays keyed by (content_type, zone, tier)
```

### Phase 2: Optimization (after content is flowing)
```
6. Context hash deduplication: check before generating
7. Prompt caching: cache_control on shared lore/tone sections
8. Circuit breaker: SpacetimeDB circuit state table
9. Server-scheduled generation: move client trigger to server scheduled table
10. Per-player rate limiting: track generation requests per player
```

### Phase 3: Scale (when player count grows)
```
11. Content pools: pre-generate quest text pools during off-peak hours via Batch API
12. Model tiering: route different content types to Haiku vs Sonnet automatically
13. Generation queue: ordered queue prevents thundering-herd on server events
```

### Integration with existing UWR systems
- **Combat events**: After a boss kill → EventLocation entry + world event check → trigger LLM consequence if threshold met
- **Faction actions**: After faction standing increase → check if rank threshold crossed → generate rank-up text
- **Quest accept**: Reducer writes quest row + pending content row → procedure generates quest text
- **World events**: Admin/threshold reducer fires → writes WorldEvent row + pending consequence → procedure generates text → all clients see update
