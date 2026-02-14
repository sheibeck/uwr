# Phase 19: NPC Interactions - Research

**Researched:** 2026-02-14
**Domain:** NPC affinity/relationship systems, dialogue complexity, dynamic reactions
**Confidence:** MEDIUM

## Summary

Phase 19 builds upon Phase 15's named NPCs foundation to add deep relationship mechanics, complex dialogue systems, and dynamic NPC behavior. The core challenge is designing multiplayer-safe affinity tracking that works with SpacetimeDB's relational model while integrating with existing faction standing, renown, and LLM-generated content systems.

Modern NPC relationship systems use numerical affinity scores (0-100 or multi-tier scales) tied to specific NPCs, with thresholds unlocking new dialogue options, quests, gifts, and services. Dialogue complexity comes from branching trees with state tracking (conversation history, quest progress, affinity level) and context awareness (faction standing, renown rank, world events). Dynamic reactions require NPC "memory" of player actions and personality/mood systems that influence response tone.

The existing architecture already has the pieces needed: per-character FactionStanding shows how to track relationship values, NpcDialog demonstrates conversation logging, QuestTemplate/QuestInstance shows gating content by progress, and the LLM infrastructure from Phase 4 can generate dynamic dialogue responses with context injection.

**Primary recommendation:** Build affinity as a private table (`NpcAffinity`) with per-character, per-NPC scores using the same pattern as FactionStanding. Use thresholds (0/25/50/75/100) to unlock dialogue trees stored in a new `NpcDialogueOption` table. Track conversation history in expanded `NpcDialog` with sentiment/context fields. Integrate existing faction standing and renown as context modifiers for NPC reactions. Use LLM procedures to generate dynamic dialogue at high affinity levels.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SpacetimeDB tables | 1.12.x | Affinity, dialogue options, conversation history | Relational model fits relationship tracking well |
| Private table + index pattern | Existing | Per-character NPC affinity storage | Proven by FactionStanding, prevents client manipulation |
| Public view pattern | Existing | Expose character's own affinities only | Security pattern from my_faction_standings |
| LLM procedures | Phase 4 | Dynamic dialogue generation at high affinity | Existing infrastructure for context-aware text |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Scheduled tables | 1.12.x | Mood decay, conversation cooldowns | Use pattern from HungerDecayTick |
| JSON context fields | Native | Encode conversation history for LLM | Store last 3-5 exchanges as context |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Numerical affinity (0-100) | String tiers ("Stranger" to "Devoted") | Numbers allow smooth progression; tiers require discrete jumps |
| Per-NPC affinity table | Global "influence" score | Per-NPC allows unique relationships; global is simpler but less rich |
| Hardcoded dialogue trees | Pure LLM generation | Hardcoded provides structure/control; LLM adds variety at cost of unpredictability |
| Conversation history in JSON | Separate DialogueLine table per exchange | JSON is lighter; separate table allows querying but adds complexity |

**Installation:**
No new packages. All features use existing SpacetimeDB 1.12.x capabilities.

## Architecture Patterns

### Recommended Project Structure
```
spacetimedb/src/
├── schema/
│   └── tables.ts              -- Add NpcAffinity, NpcDialogueOption, expand NpcDialog
├── reducers/
│   ├── npc_affinity.ts        -- NEW: award_affinity, decay_affinity (scheduled)
│   └── npc_dialogue.ts        -- NEW: speak_to_npc, choose_dialogue_option
├── procedures/
│   └── npc_dialogue.ts        -- NEW: generate_dynamic_dialogue (LLM)
├── views/
│   └── npc.ts                 -- Add my_npc_affinities, available_dialogue_options
└── data/
    ├── npc_data.ts            -- NEW: NPC personality traits, mood modifiers
    └── dialogue_trees.ts      -- NEW: Hardcoded dialogue option templates

client/src/
├── components/
│   ├── NpcDialoguePanel.vue   -- NEW: Render dialogue trees, affinity display
│   └── NpcAffinityBadge.vue   -- NEW: Show relationship tier
└── composables/
    └── useNpcAffinity.ts      -- NEW: Track affinity changes, dialogue state
```

### Pattern 1: Per-Character, Per-NPC Affinity Table
**What:** NpcAffinity tracks relationship scores between each character and each NPC, using same private table + public view pattern as FactionStanding.
**When to use:** Core affinity system; always use this for relationship tracking.

```typescript
// Source: Pattern verified from existing FactionStanding table (tables.ts:1208-1222)
export const NpcAffinity = table(
  {
    name: 'npc_affinity',
    public: true,
    indexes: [
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { name: 'by_npc', algorithm: 'btree', columns: ['npcId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    npcId: t.u64(),
    affinity: t.i64(),           // -100 to +100 (allows hostility)
    lastInteraction: t.timestamp(),
    giftsGiven: t.u64(),         // Track gift count for threshold unlocks
    conversationCount: t.u64(),  // Track total conversations
  }
);

// View: expose only character's own affinities
spacetimedb.view(
  { name: 'my_npc_affinities', public: true },
  t.array(NpcAffinity.rowType),
  (ctx: any) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player?.activeCharacterId) return [];
    return [...ctx.db.npcAffinity.by_character.filter(player.activeCharacterId)];
  }
);
```

### Pattern 2: Threshold-Based Dialogue Unlocking
**What:** NpcDialogueOption table stores branching dialogue with affinity/faction/renown requirements. Reducer checks requirements before allowing player to choose option.
**When to use:** Any dialogue that should gate on relationship progress.

```typescript
// Source: Pattern inspired by QuestTemplate gating (tables.ts:146-165)
export const NpcDialogueOption = table(
  {
    name: 'npc_dialogue_option',
    public: true,
    indexes: [
      { name: 'by_npc', algorithm: 'btree', columns: ['npcId'] },
      { name: 'by_parent', algorithm: 'btree', columns: ['parentOptionId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    npcId: t.u64(),
    parentOptionId: t.u64().optional(),  // null = root dialogue
    optionKey: t.string(),               // 'greet_stranger', 'quest_offer_1', etc.
    text: t.string(),                    // Player's dialogue choice text
    npcResponse: t.string(),             // NPC's response text
    requiredAffinity: t.i64(),           // Minimum affinity to see this option
    requiredFactionId: t.u64().optional(), // Must have standing with this faction
    requiredRenownRank: t.u64().optional(), // Minimum renown rank
    affinityChange: t.i64(),             // Affinity delta if chosen (+5, -10, etc.)
    unlockQuestTemplateId: t.u64().optional(), // Unlock quest if chosen
    useLlmGeneration: t.bool(),          // If true, call LLM procedure for response
  }
);

// Reducer: choose dialogue option
spacetimedb.reducer('choose_dialogue_option', {
  npcId: t.u64(),
  optionId: t.u64(),
}, (ctx, { npcId, optionId }) => {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player?.activeCharacterId) throw new SenderError('No active character');

  const character = ctx.db.character.id.find(player.activeCharacterId);
  if (!character) throw new SenderError('Character not found');

  const option = ctx.db.npcDialogueOption.id.find(optionId);
  if (!option || option.npcId !== npcId) throw new SenderError('Invalid option');

  // Check affinity requirement
  let affinityRow = null;
  for (const row of ctx.db.npcAffinity.by_character.filter(character.id)) {
    if (row.npcId === npcId) {
      affinityRow = row;
      break;
    }
  }

  const currentAffinity = affinityRow?.affinity ?? 0n;
  if (currentAffinity < option.requiredAffinity) {
    throw new SenderError('Not enough affinity');
  }

  // Check faction requirement
  if (option.requiredFactionId) {
    let hasFaction = false;
    for (const fs of ctx.db.factionStanding.by_character.filter(character.id)) {
      if (fs.factionId === option.requiredFactionId && fs.standing > 0n) {
        hasFaction = true;
        break;
      }
    }
    if (!hasFaction) throw new SenderError('Faction requirement not met');
  }

  // Check renown requirement
  if (option.requiredRenownRank) {
    let renownRow = null;
    for (const r of ctx.db.renown.by_character.filter(character.id)) {
      renownRow = r;
      break;
    }
    if (!renownRow || renownRow.currentRank < option.requiredRenownRank) {
      throw new SenderError('Renown rank too low');
    }
  }

  // Apply affinity change
  if (option.affinityChange !== 0n) {
    awardNpcAffinity(ctx, character, npcId, option.affinityChange);
  }

  // Log conversation
  ctx.db.npcDialog.insert({
    id: 0n,
    characterId: character.id,
    npcId,
    text: `${option.text} | ${option.npcResponse}`,
    createdAt: ctx.timestamp,
  });

  // Unlock quest if specified
  if (option.unlockQuestTemplateId) {
    // Create quest instance (simplified)
    ctx.db.questInstance.insert({
      id: 0n,
      characterId: character.id,
      questTemplateId: option.unlockQuestTemplateId,
      progress: 0n,
      completed: false,
      acceptedAt: ctx.timestamp,
    });
  }
});
```

### Pattern 3: Conversation History with Context
**What:** Expand NpcDialog table to include sentiment/context metadata that can be fed into LLM for dynamic dialogue generation.
**When to use:** When using LLM procedures for dialogue, pass recent conversation history as context.

```typescript
// Expand existing NpcDialog table (currently at tables.ts:128-144)
export const NpcDialog = table(
  {
    name: 'npc_dialog',
    public: true,
    indexes: [
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { name: 'by_npc', algorithm: 'btree', columns: ['npcId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    npcId: t.u64(),
    text: t.string(),
    createdAt: t.timestamp(),
    sentiment: t.string().optional(),     // NEW: 'positive', 'negative', 'neutral'
    contextJson: t.string().optional(),   // NEW: JSON with faction, renown, affinity at time
    wasLlmGenerated: t.bool().default(false), // NEW: Track which responses were dynamic
  }
);

// Helper: build context for LLM dialogue generation
function buildDialogueContext(ctx: any, character: any, npc: any): string {
  // Get affinity
  let affinity = 0;
  for (const row of ctx.db.npcAffinity.by_character.filter(character.id)) {
    if (row.npcId === npc.id) {
      affinity = Number(row.affinity);
      break;
    }
  }

  // Get recent conversation history (last 3 exchanges)
  const recentDialogue: string[] = [];
  const allDialogue = [...ctx.db.npcDialog.by_character.filter(character.id)]
    .filter((d: any) => d.npcId === npc.id)
    .sort((a: any, b: any) => Number(b.createdAt.microsSinceUnixEpoch - a.createdAt.microsSinceUnixEpoch))
    .slice(0, 3);

  for (const d of allDialogue) {
    recentDialogue.push(d.text);
  }

  // Get faction standing with NPC's faction
  const npcFaction = [...ctx.db.npc.iter()].find((n: any) => n.id === npc.id);
  let factionStanding = 0;
  if (npcFaction) {
    for (const fs of ctx.db.factionStanding.by_character.filter(character.id)) {
      if (fs.factionId === npcFaction.factionId) {
        factionStanding = Number(fs.standing);
        break;
      }
    }
  }

  // Get renown rank
  let renownRank = 0;
  for (const r of ctx.db.renown.by_character.filter(character.id)) {
    renownRank = Number(r.currentRank);
    break;
  }

  return JSON.stringify({
    characterName: character.name,
    npcName: npc.name,
    affinity,
    factionStanding,
    renownRank,
    recentDialogue,
  });
}
```

### Pattern 4: NPC Personality and Mood System
**What:** Store NPC personality traits in Npc table or separate config. Calculate mood modifiers based on faction events, time of day, player actions.
**When to use:** Add depth to NPC reactions; mood affects dialogue tone and affinity gain/loss rates.

```typescript
// Source: Pattern inspired by research on five-factor personality model (OCEAN)
// and circumplex model of affect for mood

// Expand Npc table to include personality (tables.ts:112-126)
export const Npc = table(
  {
    name: 'npc',
    public: true,
    indexes: [{ name: 'by_location', algorithm: 'btree', columns: ['locationId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    npcType: t.string(),
    locationId: t.u64(),
    description: t.string(),
    greeting: t.string(),
    factionId: t.u64().optional(),           // NEW: NPC's faction affiliation
    personalityJson: t.string().default('{}'), // NEW: JSON with OCEAN traits
    baseMood: t.string().default('neutral'),   // NEW: 'cheerful', 'grumpy', 'neutral', etc.
  }
);

// Data file: personality archetypes
export const NPC_PERSONALITIES = {
  friendly_merchant: {
    openness: 70,      // 0-100 scale
    conscientiousness: 80,
    extraversion: 90,
    agreeableness: 85,
    neuroticism: 20,
    baseMood: 'cheerful',
    affinityMultiplier: 1.2,  // Gains affinity faster
  },
  grumpy_guard: {
    openness: 30,
    conscientiousness: 95,
    extraversion: 20,
    agreeableness: 40,
    neuroticism: 60,
    baseMood: 'irritable',
    affinityMultiplier: 0.8,  // Gains affinity slower
  },
  mysterious_scholar: {
    openness: 95,
    conscientiousness: 70,
    extraversion: 30,
    agreeableness: 60,
    neuroticism: 50,
    baseMood: 'contemplative',
    affinityMultiplier: 1.0,
  },
};

// Helper: calculate affinity change with personality modifier
function awardNpcAffinity(ctx: any, character: any, npcId: bigint, baseChange: bigint) {
  const npc = ctx.db.npc.id.find(npcId);
  if (!npc) return;

  // Parse personality
  const personality = JSON.parse(npc.personalityJson || '{}');
  const multiplier = personality.affinityMultiplier || 1.0;

  // Apply personality multiplier
  const adjustedChange = BigInt(Math.floor(Number(baseChange) * multiplier));

  // Get or create affinity row
  let affinityRow = null;
  for (const row of ctx.db.npcAffinity.by_character.filter(character.id)) {
    if (row.npcId === npcId) {
      affinityRow = row;
      break;
    }
  }

  if (affinityRow) {
    ctx.db.npcAffinity.id.update({
      ...affinityRow,
      affinity: affinityRow.affinity + adjustedChange,
      lastInteraction: ctx.timestamp,
      conversationCount: affinityRow.conversationCount + 1n,
    });
  } else {
    ctx.db.npcAffinity.insert({
      id: 0n,
      characterId: character.id,
      npcId,
      affinity: adjustedChange,
      lastInteraction: ctx.timestamp,
      giftsGiven: 0n,
      conversationCount: 1n,
    });
  }
}
```

### Pattern 5: Gift-Giving Mechanics
**What:** Allow players to give items to NPCs for affinity boosts. Gift value and NPC preferences affect affinity gain.
**When to use:** Add non-dialogue affinity progression; creates economic sink for items.

```typescript
// Source: Pattern from research on gift-giving affinity systems in Wandering Sword,
// Dragon's Dogma, Fantasy Life i

// Add NPC gift preferences to data
export const NPC_GIFT_PREFERENCES = {
  // Map npcId to preferred item categories and specific items
  friendly_merchant: {
    lovedCategories: ['consumable', 'resource'],
    lovedItems: [12n, 45n], // specific item template IDs
    likedCategories: ['gear'],
    dislikedCategories: ['junk'],
  },
};

// Reducer: give gift to NPC
spacetimedb.reducer('give_gift_to_npc', {
  npcId: t.u64(),
  itemInstanceId: t.u64(),
}, (ctx, { npcId, itemInstanceId }) => {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player?.activeCharacterId) throw new SenderError('No active character');

  const character = ctx.db.character.id.find(player.activeCharacterId);
  if (!character) throw new SenderError('Character not found');

  const npc = ctx.db.npc.id.find(npcId);
  if (!npc) throw new SenderError('NPC not found');

  // Check character is at NPC's location
  if (character.locationId !== npc.locationId) {
    throw new SenderError('NPC not at your location');
  }

  // Get item
  const item = ctx.db.itemInstance.id.find(itemInstanceId);
  if (!item || item.ownerCharacterId !== character.id) {
    throw new SenderError('Item not found or not owned');
  }

  const template = ctx.db.itemTemplate.id.find(item.templateId);
  if (!template) throw new SenderError('Item template not found');

  // Calculate affinity based on gift preference
  let affinityGain = 5n; // Base gift value

  // Check if NPC loves/likes this item (would come from NPC_GIFT_PREFERENCES)
  // For simplicity, use vendor value as baseline
  affinityGain = template.vendorValue / 10n;
  if (affinityGain < 1n) affinityGain = 1n;
  if (affinityGain > 20n) affinityGain = 20n; // Cap gain

  // Delete item from inventory
  ctx.db.itemInstance.id.delete(itemInstanceId);

  // Award affinity
  awardNpcAffinity(ctx, character, npcId, affinityGain);

  // Increment gift counter
  for (const row of ctx.db.npcAffinity.by_character.filter(character.id)) {
    if (row.npcId === npcId) {
      ctx.db.npcAffinity.id.update({
        ...row,
        giftsGiven: row.giftsGiven + 1n,
      });
      break;
    }
  }

  appendSystemMessage(ctx, character, `${npc.name} appreciates your gift! (+${affinityGain} affinity)`);
});
```

### Pattern 6: Dynamic Reactions to Player Actions
**What:** NPCs react differently based on player's faction standing, renown, recent actions (kills, quests completed).
**When to use:** Greeting text, available services, dialogue tone all vary by context.

```typescript
// Helper: get NPC greeting based on context
function getNpcGreeting(ctx: any, character: any, npc: any): string {
  // Get affinity
  let affinity = 0;
  for (const row of ctx.db.npcAffinity.by_character.filter(character.id)) {
    if (row.npcId === npc.id) {
      affinity = Number(row.affinity);
      break;
    }
  }

  // Get faction standing if NPC has faction
  let factionStanding = 0;
  if (npc.factionId) {
    for (const fs of ctx.db.factionStanding.by_character.filter(character.id)) {
      if (fs.factionId === npc.factionId) {
        factionStanding = Number(fs.standing);
        break;
      }
    }
  }

  // Get renown rank
  let renownRank = 0;
  for (const r of ctx.db.renown.by_character.filter(character.id)) {
    renownRank = Number(r.currentRank);
    break;
  }

  // Hostile: negative faction or very low affinity
  if (factionStanding < -50 || affinity < -50) {
    return `${npc.name} glares at you with open hostility.`;
  }

  // Devoted: high affinity
  if (affinity >= 75) {
    return `${npc.name} greets you warmly, an old friend.`;
  }

  // Friend: moderate affinity
  if (affinity >= 50) {
    return `${npc.name} nods in recognition.`;
  }

  // Famous: high renown but low affinity
  if (renownRank >= 5 && affinity < 25) {
    return `${npc.name} eyes you with a mix of respect and wariness.`;
  }

  // Stranger: default
  return npc.greeting;
}

// Reducer: hail NPC (existing, would expand to use dynamic greeting)
spacetimedb.reducer('hail_npc', { npcId: t.u64() }, (ctx, { npcId }) => {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player?.activeCharacterId) throw new SenderError('No active character');

  const character = ctx.db.character.id.find(player.activeCharacterId);
  if (!character) throw new SenderError('Character not found');

  const npc = ctx.db.npc.id.find(npcId);
  if (!npc) throw new SenderError('NPC not found');

  // Check location
  if (character.locationId !== npc.locationId) {
    throw new SenderError('NPC not at your location');
  }

  const greeting = getNpcGreeting(ctx, character, npc);

  // Log dialogue
  ctx.db.npcDialog.insert({
    id: 0n,
    characterId: character.id,
    npcId,
    text: greeting,
    createdAt: ctx.timestamp,
    sentiment: 'neutral',
    contextJson: buildDialogueContext(ctx, character, npc),
    wasLlmGenerated: false,
  });
});
```

### Pattern 7: LLM-Generated Dynamic Dialogue
**What:** At high affinity or for complex conversations, call LLM procedure to generate contextual NPC responses.
**When to use:** Special dialogue moments, high-affinity conversations, unique character interactions.

```typescript
// Source: Existing LLM infrastructure from Phase 4 (04-RESEARCH.md)
// Procedure: generate dynamic NPC dialogue
spacetimedb.procedure(
  'generate_npc_dialogue',
  {
    characterId: t.u64(),
    npcId: t.u64(),
    playerMessage: t.string(),
  },
  t.string(),  // returns generated response
  (ctx, { characterId, npcId, playerMessage }) => {
    // Read config
    const config = ctx.withTx(tx => {
      return [...tx.db.llmConfig.iter()][0] ?? null;
    });

    if (!config?.apiKey) {
      return 'I have nothing to say.'; // Fallback
    }

    // Get character, NPC, build context
    const character = ctx.withTx(tx => tx.db.character.id.find(characterId));
    const npc = ctx.withTx(tx => tx.db.npc.id.find(npcId));
    if (!character || !npc) return 'I have nothing to say.';

    const contextJson = ctx.withTx(tx => buildDialogueContext(tx, character, npc));

    // Build prompt
    const npcPersonality = JSON.parse(npc.personalityJson || '{}');
    const systemPrompt = `You are ${npc.name}, an NPC in a dark fantasy RPG.
Personality: ${npc.description}
Mood: ${npc.baseMood}
You are speaking to ${character.name}.

Context:
${contextJson}

Respond in character, 1-2 sentences max. Dark, gritty tone (Shadeslinger style).`;

    const userPrompt = `Player says: "${sanitizeForPrompt(playerMessage, 200)}"

Your response:`;

    // HTTP call to Anthropic
    try {
      const response = ctx.http.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: config.defaultModel || 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          system: [{ type: 'text', text: systemPrompt }],
          messages: [{ role: 'user', content: userPrompt }],
        }),
        timeout: TimeDuration.fromMillis(15_000),
      });

      if (!response.ok) {
        return 'I have nothing to say.';
      }

      const body = response.json();
      return body.content[0].text;
    } catch (e) {
      return 'I have nothing to say.';
    }
  }
);

// Client calls this procedure when player chooses "Dynamic conversation" option
```

### Anti-Patterns to Avoid
- **Global affinity (one score for all NPCs):** Use per-NPC affinity; unique relationships are more engaging
- **Affinity stored client-side:** Must be server-authoritative to prevent cheating
- **Unbounded conversation history:** Store last 3-5 exchanges max; more causes LLM context bloat
- **Using `.iter()` on NpcAffinity in views:** Use index lookups (by_character.filter)
- **Hardcoding dialogue for every NPC/affinity combo:** Use templates + LLM generation for variety
- **Allowing affinity gain spam:** Add cooldowns (max 1 conversation per NPC per hour)
- **Ignoring existing faction/renown systems:** Integrate them as context modifiers

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Relationship tracking | Custom graph database | SpacetimeDB relational tables | FactionStanding pattern already proven |
| Dialogue tree editor | Custom UI tool | JSON/TypeScript data files | Easier to version control, test, iterate |
| Conversation history | Manual log parsing | NpcDialog table with JSON context field | Queryable, persistent, ties to existing table |
| LLM dialogue generation | Custom API wrapper | Existing Phase 4 procedure pattern | Infrastructure already exists |
| Affinity decay over time | Custom timer logic | Scheduled table (NpcAffinityDecay) | Same pattern as HungerDecayTick |
| Mood calculation | Complex state machine | Simple JSON personality + modifier calculation | Keeps data readable, debuggable |

**Key insight:** SpacetimeDB's relational model + index lookups handle relationship tracking naturally. Don't invent graph-database patterns; use the tables and indexes already working for factions and renown.

## Common Pitfalls

### Pitfall 1: Affinity inflation without decay
**What goes wrong:** Players grind affinity to max with every NPC by repeating same action (gift spam).
**Why it happens:** No cooldowns or diminishing returns.
**How to avoid:** Add conversation cooldowns (1 per NPC per hour), gift limits (3 per day per NPC), and optional affinity decay for NPCs not interacted with in 7+ days.
**Warning signs:** All players have max affinity with all NPCs within first week.

### Pitfall 2: Dialogue options explosion
**What goes wrong:** Branching dialogue creates exponential option count; becomes unmaintainable.
**Why it happens:** Every dialogue choice creates 3+ branches, and each branch has 3+ options.
**How to avoid:** Use "hub and spoke" pattern: return to central dialogue hub after each branch. Limit depth to 2-3 levels max. Use LLM for variety instead of hardcoding every path.
**Warning signs:** NpcDialogueOption table has 500+ rows for a single NPC.

### Pitfall 3: LLM hallucinating quest/item offers
**What goes wrong:** Dynamic dialogue generates "I'll give you the Sword of Truth" but no such quest/item exists.
**Why it happens:** LLM has no knowledge of actual game state.
**How to avoid:** Use LLM only for flavor/reaction text, not offers. Hardcode dialogue options that unlock quests/items. Pass strict system prompt: "Only describe existing items/quests from context."
**Warning signs:** Players report NPCs promising rewards that never appear.

### Pitfall 4: Faction standing and affinity conflicts
**What goes wrong:** Player has high affinity with Iron Compact NPC but also high standing with rival faction. NPC reactions become nonsensical.
**Why it happens:** Affinity and faction treated as independent.
**How to avoid:** Affinity gain with NPC includes automatic faction standing gain. High rival faction standing applies negative modifier to affinity gain (harder to befriend).
**Warning signs:** Players exploit affinity to bypass faction rivalries.

### Pitfall 5: Conversation history leaking between characters
**What goes wrong:** Player's alt character sees dialogue history from main character.
**Why it happens:** NpcDialog not properly filtered by characterId.
**How to avoid:** Always filter conversation history by both characterId AND npcId. Use by_character index consistently.
**Warning signs:** Client console shows dialogue from wrong character.

### Pitfall 6: Affinity thresholds unclear to players
**What goes wrong:** Players don't know why dialogue options are locked or what affinity level unlocks them.
**Why it happens:** No UI feedback on requirements.
**How to avoid:** Show locked dialogue options with requirements displayed ("Requires 50 affinity"). Add affinity progress bar to NPC dialogue panel.
**Warning signs:** Player confusion in feedback/bug reports.

### Pitfall 7: Dynamic dialogue cost spiral
**What goes wrong:** Every conversation calls LLM, costs spike.
**Why it happens:** No caching or reuse of generated responses.
**How to avoid:** Cache generated responses in NpcDialog with wasLlmGenerated flag. Reuse if same context within 1 hour. Use LLM sparingly (only for high-affinity or special moments).
**Warning signs:** LLM API bill grows faster than player count.

## Code Examples

### Affinity Threshold Constants
```typescript
// Source: Pattern from research on Pathfinder 2E Influence subsystem,
// Dragon's Dogma affinity tiers

export const AFFINITY_TIERS = {
  HOSTILE: -50,
  UNFRIENDLY: -25,
  NEUTRAL: 0,
  FRIENDLY: 25,
  CLOSE_FRIEND: 50,
  DEVOTED: 75,
  SOULMATE: 100,
};

export const AFFINITY_TIER_NAMES: Record<number, string> = {
  [-50]: 'Hostile',
  [-25]: 'Unfriendly',
  [0]: 'Stranger',
  [25]: 'Acquaintance',
  [50]: 'Friend',
  [75]: 'Close Friend',
  [100]: 'Devoted',
};

// Helper: get tier name from affinity score
function getAffinityTierName(affinity: number): string {
  if (affinity >= 100) return AFFINITY_TIER_NAMES[100];
  if (affinity >= 75) return AFFINITY_TIER_NAMES[75];
  if (affinity >= 50) return AFFINITY_TIER_NAMES[50];
  if (affinity >= 25) return AFFINITY_TIER_NAMES[25];
  if (affinity >= 0) return AFFINITY_TIER_NAMES[0];
  if (affinity >= -25) return AFFINITY_TIER_NAMES[-25];
  return AFFINITY_TIER_NAMES[-50];
}
```

### Conversation Cooldown Check
```typescript
// Source: Pattern from scheduled table approach in Phase 4
const CONVERSATION_COOLDOWN_MICROS = 3600_000_000n; // 1 hour

function canConversWithNpc(ctx: any, characterId: bigint, npcId: bigint): boolean {
  let lastInteraction = 0n;
  for (const row of ctx.db.npcAffinity.by_character.filter(characterId)) {
    if (row.npcId === npcId) {
      lastInteraction = row.lastInteraction.microsSinceUnixEpoch;
      break;
    }
  }

  const now = ctx.timestamp.microsSinceUnixEpoch;
  return (now - lastInteraction) >= CONVERSATION_COOLDOWN_MICROS;
}
```

### Dialogue Tree Data Structure
```typescript
// Source: Pattern from research on hub-and-spoke dialogue systems
export const BLACKSMITH_DIALOGUE = {
  greet: {
    id: 1n,
    npcId: 5n, // blacksmith NPC ID
    parentOptionId: null, // root
    optionKey: 'greet',
    text: 'Hail, smith.',
    npcResponse: 'What do you want? I\'ve work to do.',
    requiredAffinity: 0n,
    affinityChange: 1n, // Small gain for greeting
    useLlmGeneration: false,
  },
  ask_about_craft: {
    id: 2n,
    npcId: 5n,
    parentOptionId: 1n, // child of greet
    optionKey: 'ask_about_craft',
    text: 'Can you craft me something special?',
    npcResponse: 'Maybe. If you\'re worthy. Come back when you\'ve proven yourself.',
    requiredAffinity: 25n,
    requiredRenownRank: 3n,
    affinityChange: 5n,
    unlockQuestTemplateId: 10n, // Unlocks special crafting quest
    useLlmGeneration: false,
  },
  deep_conversation: {
    id: 3n,
    npcId: 5n,
    parentOptionId: 1n,
    optionKey: 'deep_conversation',
    text: 'Tell me about yourself.',
    npcResponse: '', // Will be LLM-generated
    requiredAffinity: 50n,
    affinityChange: 10n,
    useLlmGeneration: true, // Use LLM procedure
  },
};
```

### Vue Component: Affinity Display
```vue
<!-- Source: Consistent with existing panel patterns -->
<template>
  <div :style="styles.panel">
    <div :style="styles.header">{{ npcName }}</div>
    <div :style="styles.row">
      <span>Relationship:</span>
      <span :style="affinityColor">{{ affinityTier }}</span>
    </div>
    <div :style="styles.progressBar">
      <div
        :style="{
          ...styles.progressFill,
          width: `${affinityProgress}%`,
          backgroundColor: affinityBarColor,
        }"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { AFFINITY_TIER_NAMES } from '../data/affinity_tiers';

const props = defineProps<{
  npcName: string;
  affinity: number;
}>();

const affinityTier = computed(() => {
  if (props.affinity >= 100) return AFFINITY_TIER_NAMES[100];
  if (props.affinity >= 75) return AFFINITY_TIER_NAMES[75];
  if (props.affinity >= 50) return AFFINITY_TIER_NAMES[50];
  if (props.affinity >= 25) return AFFINITY_TIER_NAMES[25];
  if (props.affinity >= 0) return AFFINITY_TIER_NAMES[0];
  if (props.affinity >= -25) return AFFINITY_TIER_NAMES[-25];
  return AFFINITY_TIER_NAMES[-50];
});

const affinityProgress = computed(() => {
  // Map -100 to 100 onto 0-100 scale
  return Math.max(0, Math.min(100, (props.affinity + 100) / 2));
});

const affinityColor = computed(() => {
  if (props.affinity >= 75) return { color: '#4ade80' }; // green
  if (props.affinity >= 25) return { color: '#60a5fa' }; // blue
  if (props.affinity >= 0) return { color: '#9ca3af' }; // gray
  return { color: '#f87171' }; // red
});

const affinityBarColor = computed(() => {
  if (props.affinity >= 75) return '#4ade80';
  if (props.affinity >= 25) return '#60a5fa';
  if (props.affinity >= 0) return '#9ca3af';
  return '#f87171';
});
</script>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Binary relationships (friend/foe) | Graduated affinity scales (-100 to +100) | Mid-2010s | More nuanced progression, clearer player goals |
| Hardcoded all dialogue | LLM-generated dynamic responses | 2024-2026 | Infinite variety, but requires guardrails |
| Faction = NPC reaction | Separate NPC affinity + faction modifiers | 2020s | Individual relationships matter alongside faction politics |
| Single dialogue tree per NPC | Threshold-unlocked branches + personality-driven reactions | 2020s | Replayability, rewards relationship investment |
| Static NPC mood | Dynamic mood based on world events, time, player actions | 2020s | NPCs feel alive, react to context |

**Deprecated/outdated:**
- Binary "liked/disliked" flags: Use numerical scales for smooth progression
- Global "charisma" stat determining all NPC reactions: Use per-NPC affinity for unique relationships
- Storing full conversation transcripts: Use summary JSON + recent exchanges for LLM context

## Open Questions

1. **Should affinity decay over time for inactive relationships?**
   - What we know: Some RPGs decay affinity if player doesn't interact with NPC for extended period (realism). Others keep affinity permanent (player-friendly).
   - What's unclear: Does decay add meaningful depth or just punish players for exploring other content?
   - Recommendation: Optional decay for LOW-confidence. Plan could include it as scheduled reducer but disable by default. Test with player feedback.

2. **How many dialogue tiers/thresholds are optimal?**
   - What we know: Research shows 3-5 tiers common (Stranger → Acquaintance → Friend → Close Friend → Devoted). Too many dilutes meaning; too few feels grindy.
   - What's unclear: What's right for this game's progression pace?
   - Recommendation: Start with 5 tiers (0, 25, 50, 75, 100). Each tier unlocks new dialogue options/quests. Can adjust thresholds in data files post-launch.

3. **Should gifts consume item instances or just reference templates?**
   - What we know: Consuming items creates economic sink. Referencing templates (no actual item needed) simplifies but feels less meaningful.
   - What's unclear: Does item sink matter for this game's economy?
   - Recommendation: Consume actual item instances. Ties gift-giving to loot/crafting loops. Matches existing trade/vendor patterns.

4. **How to handle NPC affinity when NPC travels (Phase 16)?**
   - What we know: Phase 16 adds travelling NPCs. Affinity should persist, but player won't always know where NPC is.
   - What's unclear: Does affinity decay faster if player can't find NPC? Does NPC "miss" the player?
   - Recommendation: Affinity persists regardless of location. Add "Where is X?" dialogue option to other NPCs to hint at traveller locations. Defer complex "longing" mechanics to future phase.

5. **Should LLM-generated dialogue be cached per-character or shared?**
   - What we know: Caching saves cost. Per-character cache is most accurate but expensive. Shared cache (same context = same response) is cheaper but less personal.
   - What's unclear: Is shared caching acceptable for player immersion?
   - Recommendation: Per-character cache stored in NpcDialog. If same characterId + same contextJson within 1 hour, reuse. Different characters can get different responses.

## Sources

### Primary (HIGH confidence)
- `C:/projects/uwr/spacetimedb/src/schema/tables.ts` — Existing table patterns (FactionStanding, Renown, NpcDialog)
- `C:/projects/uwr/spacetimedb/src/helpers/renown.ts` — Pattern for awarding/calculating points
- `C:/projects/uwr/.planning/phases/04-llm-architecture/04-RESEARCH.md` — LLM procedure infrastructure
- [SpacetimeDB](https://spacetimedb.com/) — Core database platform documentation

### Secondary (MEDIUM confidence)
- [Personality and Mood for Non-player Characters: A Method for Behavior Simulation](https://digitalcommons.calpoly.edu/theses/2406/) — Five-factor personality model implementation
- [How to Build Deep and Engaging NPC Relationships](https://litrpgreads.com/blog/rpg/how-to-build-deep-and-engaging-npc-relationships-for-your-dnd-campaign) — Relationship progression patterns
- [GameAnalytics: How to write perfect dialogue trees](https://www.gameanalytics.com/blog/how-to-write-perfect-dialogue-trees-for-games) — Dialogue tree structuring
- [Branching Conversation Systems and the Working Writer](https://www.gamedeveloper.com/design/branching-conversation-systems-and-the-working-writer-part-1-introduction) — Managing dialogue complexity
- [How Dynamic Reputation Shifts Work in RPGs](https://www.ttrpg-games.com/blog/how-dynamic-reputation-shifts-work-in-rpgs/) — Reputation system mechanics
- [AI NPC Agent: Revolutionizing Gaming](https://www.jenova.ai/en/resources/ai-npc-agent) — 2026 state of AI NPCs
- [How AI Is Revolutionizing NPCs: Dynamic, Memory-Driven Game Worlds](https://thecodekaizen.medium.com/how-ai-is-revolutionizing-npcs-dynamic-memory-driven-game-worlds-21cd2b463a0e) — Memory architecture for NPCs
- [Where Winds Meet: NPC Affinity Gift Guide](https://buffget.com/news/where-winds-meet-npc-affinity-gift-guide-what-items-do-li-bai-and-key-characters-like-o7icy5) — Gift-giving mechanics
- [How to Increase Affinity in Wandering Sword](https://www.thegamer.com/wandering-sword-affinity-increase-guide-explained/) — Affinity progression systems
- [Dragon's Dogma 2: Affinity](https://dragonsdogma2.wiki.fextralife.com/Affinity) — Affinity threshold unlocks

### Tertiary (LOW confidence — needs validation)
- OCEAN personality model implementation details: research paper exists but specific game integration requires testing
- Conversation cooldown thresholds (1 hour): arbitrary choice, needs playtesting
- Affinity tier thresholds (0/25/50/75/100): common pattern but optimal values depend on progression pace
- Gift value to affinity conversion rate: needs balancing with item economy

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all patterns verified against existing codebase (FactionStanding, Renown, NpcDialog, LLM procedures)
- Architecture (affinity table + dialogue options): HIGH — direct application of proven patterns
- LLM integration: HIGH — Phase 4 infrastructure already implemented and documented
- Personality/mood systems: MEDIUM — research-backed but implementation needs testing
- Gift-giving mechanics: MEDIUM — verified from multiple RPG implementations but balancing needed
- Dialogue tree complexity: MEDIUM — best practices documented but optimal structure varies per game
- Dynamic reactions: MEDIUM — research shows patterns but specific implementation requires iteration

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (30 days — affinity system patterns are stable, but LLM integration may evolve with SpacetimeDB updates)
