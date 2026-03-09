# Phase 29: NPC & Quest Generation - Research

**Researched:** 2026-03-07
**Domain:** LLM-driven NPC conversation, quest generation, dynamic content integration
**Confidence:** HIGH

## Summary

Phase 29 wires LLM generation into the existing NPC and quest infrastructure to replace scripted dialogue trees with freeform LLM conversations and generate contextual quests from NPC interactions. The existing codebase provides strong foundations: `Npc`, `NpcAffinity`, `NpcDialog`, `QuestTemplate`, `QuestInstance`, `QuestItem`, and `NamedEnemy` tables already exist. The LLM proxy pipeline (Phase 24), client-triggered task pattern (Phase 28), and world generation NPC creation (Phase 27) are all established.

The primary technical challenge is designing the NPC conversation procedure -- it must read NPC personality, player affinity, conversation memory, and region context, then produce structured JSON with both dialogue text and side effects (quest offers, affinity changes, location reveals). The established three-phase procedure pattern (`withTx(read) -> http.fetch() -> withTx(write)`) from the LLM proxy architecture handles this cleanly.

**Primary recommendation:** Build the conversation as a new LLM domain (`npc_conversation`) using the existing `LlmTask`-based proxy pipeline. Add an `NpcMemory` table for per-player-per-NPC summarized memory. Expand `writeGeneratedRegion()` to produce richer NPC personality data. Replace the `choose_dialogue_option` reducer with a `talk_to_npc` reducer that creates an LlmTask, and handle the result in `submit_llm_result` to apply conversation effects.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Full LLM-driven conversations -- no dialogue trees. Players type freely, LLM responds in character
- Delete/bypass the v1.0 `npc_dialogue_option` scripted dialogue tree system
- NPC memory is summarized per-player-per-NPC (key facts: topics discussed, quests done, gifts given) -- not full conversation logs
- Conversation side effects (offer_quest, reveal_location, give_item, affinity_change, etc.) auto-apply from structured JSON in LLM response -- no player confirmation prompts
- Side effect types from mechanical vocabulary: CONVERSATION_EFFECTS enum
- Quests are generated on NPC conversation -- when affinity/context is right, the LLM decides to offer a quest as a conversation side effect
- No quests seeded at region creation time -- NPCs start questless, quests emerge through player interaction
- Quests are per-player: each QuestTemplate is generated for a specific player based on their level, class, race, and history
- Quest generation can create new world content using QUEST_WORLD_EFFECTS vocab (spawn_enemies, create_location, spawn_item, unlock_path)
- Players limited to 3-5 active quests at a time. Completed/abandoned quests free up slots
- Rich personality generated at NPC creation time (expand world gen prompt): personality traits, knowledge domains, speech patterns, secrets, faction ties
- Stored in existing `personalityJson` field on Npc table
- NPCs have scoped knowledge boundaries -- they know about their region, faction, and role-specific topics. LLM constrained to this. No omniscient NPCs
- NPCs are fixed at their generated location -- no wandering
- Personality is narrative-only -- affects dialogue tone and content reveals, not mechanical values (except existing affinityMultiplier)
- LLM picks reward type and flavor (item name, description), power-budget formula clamps actual stat values to level-appropriate ranges
- Quest reward items are LLM-generated and class/race-appropriate for the player -- tailored upgrades
- Generated items: LLM names the item + flavor text, stats computed by level/rarity formula. New ItemTemplate row created on quest completion
- Rare ability rewards possible from high-affinity (trusted/bonded) NPCs -- uses Phase 28's skill generation + power budget validation
- Quest type affects reward quality: harder quests (boss_kill, escort) get a reward multiplier over baseline

### Claude's Discretion
- NPC conversation LLM budget model (per-message cost vs free/separate budget)
- Exact active quest limit (3, 4, or 5)
- NPC memory summary format and storage approach
- Quest difficulty multiplier values per quest type
- Which QUEST_WORLD_EFFECTS to implement in this phase vs defer

### Deferred Ideas (OUT OF SCOPE)
- NPC wanderer role (NPCs moving between locations)
- Full conversation log memory (storing every exchange)
- NPC personality affecting mechanical values (vendor prices, affinity rates)
- Quest chains (multi-part questlines where completing one unlocks the next)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NPC-01 | LLM generates NPCs contextual to the region and world state | Expand `writeGeneratedRegion()` prompt to generate rich `personalityJson` with traits, knowledge domains, speech patterns, secrets, faction ties. World gen already creates basic NPCs with name/type/description/greeting |
| NPC-02 | Generated NPCs have persistent identity stored canonically | Use existing `Npc` table with expanded `personalityJson` field. Add `NpcMemory` table for per-player summarized memory. `NpcAffinity` table already tracks relationship state |
| NPC-03 | LLM generates quests from NPC/region/world context | New `npc_conversation` LLM domain. When affinity threshold is met, LLM includes `offer_quest` effect in structured response. Server creates `QuestTemplate` + `QuestInstance` rows from the effect data |
| NPC-04 | Generated quests use existing quest types with LLM narrative | LLM picks from `QUEST_TYPES` enum. Quest flows through existing `QuestInstance` progress/completion system. LLM adds narrative flavor text stored on a new `description` field on QuestTemplate |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| spacetimedb | 1.11.x | Server runtime | Existing project stack |
| Vue 3 + Composition API | current | Client framework | Existing project stack |
| LLM Proxy (Cloudflare Workers) | current | LLM API calls | Established in Phase 24, HTTP from SpacetimeDB broken locally |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| gpt-5-mini | current | NPC conversation model | Per-message real-time conversation (fast, cheap) |
| gpt-5-mini | current | Quest generation | Quest params generated inline with conversation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| gpt-5-mini for all NPC | gpt-5.4 for high-affinity NPCs | Better quality for rare interactions, but adds complexity; keep simple with single model |

## Architecture Patterns

### New/Modified Tables

```
tables.ts additions:
  NpcMemory          # Per-player-per-NPC summarized memory

tables.ts modifications:
  QuestTemplate      # Add description, rewardType, rewardItemName, rewardGold, rewardAbility, characterId fields
  Npc                # personalityJson already exists, populate with rich data
```

### NpcMemory Table Design
```typescript
export const NpcMemory = table(
  {
    name: 'npc_memory',
    public: true,  // Player can see their own NPC memories
    indexes: [
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { accessor: 'by_npc', algorithm: 'btree', columns: ['npcId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    npcId: t.u64(),
    memoryJson: t.string(),     // JSON: { topics: string[], questsCompleted: string[], secretsShared: string[], giftsGiven: string[], nickname?: string }
    lastUpdated: t.timestamp(),
  }
);
```

### QuestTemplate Extensions
```typescript
// Add to existing QuestTemplate:
description: t.string().optional(),       // LLM-generated narrative description
rewardType: t.string().optional(),        // 'xp' | 'gold' | 'item' | 'ability' | combo
rewardItemName: t.string().optional(),    // LLM-generated item name for item rewards
rewardItemDesc: t.string().optional(),    // LLM-generated item flavor text
rewardGold: t.u64().optional(),           // Gold reward amount
characterId: t.u64().optional(),          // Per-player quest (who it was generated for)
```

### Pattern: NPC Conversation Flow

**What:** Player types freely -> reducer creates LlmTask -> proxy calls LLM -> result applies side effects
**When to use:** Every NPC conversation message

```
1. Player types "talk to [NPC]" or clicks NPC
2. Client calls `talk_to_npc` reducer with { characterId, npcId, message }
3. Reducer validates (location match, not in combat, cooldown)
4. Reducer builds prompt with NPC personality + region context + affinity + memory
5. Reducer inserts LlmTask with domain='npc_conversation'
6. Client LLM proxy picks up task, calls API, submits result
7. submit_llm_result handler parses structured JSON response
8. Applies side effects: affinity_change, offer_quest, give_item, etc.
9. Logs NPC dialogue to NpcDialog table
10. Updates NpcMemory with summarized conversation
```

### Pattern: Quest Generation as Conversation Effect

**What:** LLM decides to offer a quest during conversation based on affinity + context
**When to use:** When affinity threshold is met and NPC role supports quests

```typescript
// LLM response JSON includes:
{
  "dialogue": "I have a task for you...",
  "effects": [
    {
      "type": "offer_quest",
      "questType": "kill",           // From QUEST_TYPES enum
      "questName": "The Blighted Pack",
      "questDescription": "Thin the corrupted wolves...",
      "targetCount": 5,
      "rewardType": "item",
      "rewardItemName": "Fang-Etched Pauldron",
      "rewardItemDesc": "Fashioned from the very creatures...",
      "rewardXp": 150
    },
    {
      "type": "affinity_change",
      "amount": 3
    }
  ]
}
```

### Pattern: Item Reward Generation on Quest Completion

**What:** When quest completes, create ItemTemplate with LLM-named item + level-scaled stats
**When to use:** Quest rewards of type 'item'

```typescript
// On quest completion with item reward:
// 1. Read quest's rewardItemName and rewardItemDesc
// 2. Compute stats using existing crafting/item scaling formulas
// 3. Insert ItemTemplate row with LLM flavor + computed stats
// 4. Insert ItemInstance for the player
```

### Anti-Patterns to Avoid
- **Storing full conversation logs as memory:** Use summarized key facts only. Conversation text goes to NpcDialog (which already exists) but memory is a compact summary
- **Making NPC omniscient:** Constrain LLM system prompt to NPC's region, faction, and role knowledge boundaries
- **Client-side NPC state:** All NPC state is server-authoritative. Client reads NpcDialog, NpcAffinity, and NpcMemory tables
- **Blocking conversation on quest generation:** Quest creation happens server-side in submit_llm_result, not as a separate step

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM API calls | Direct HTTP from SpacetimeDB | LlmTask + LLM Proxy pipeline | SpacetimeDB HTTP broken locally (established pattern) |
| Item stat scaling | Custom item stat generator | Existing tier/level formulas from crafting system | Battle-tested, balanced values |
| Affinity tracking | Custom relationship system | Existing NpcAffinity table + awardNpcAffinity helper | Already handles CHA scaling, perk bonuses, tier tracking |
| Dialogue history | Custom conversation log | Existing NpcDialog table | Per-character-per-NPC logging already works |
| Ability generation | Custom ability creation | Phase 28's skill_budget.ts + processGeneratedSkill | Power budget validation already battle-tested |

## Common Pitfalls

### Pitfall 1: QuestTemplate becoming player-specific breaks existing indexes
**What goes wrong:** Adding `characterId` to QuestTemplate makes `by_npc` and `by_enemy` indexes less useful for filtering
**Why it happens:** v1.0 QuestTemplate was NPC-scoped, v2.0 is per-player
**How to avoid:** Add a `by_character` index to QuestTemplate. When checking quest limits, filter by character first. Existing `by_npc` index still useful for finding all quests from an NPC
**Warning signs:** Slow queries when checking quest counts per player

### Pitfall 2: LLM generating invalid quest types
**What goes wrong:** LLM returns quest types not in QUEST_TYPES enum
**Why it happens:** LLM hallucination or creative naming
**How to avoid:** Validate questType against QUEST_TYPES array in the result handler. Fall back to 'kill' if invalid. Same pattern used for skill generation enum validation
**Warning signs:** Quest creation failing silently

### Pitfall 3: Conversation prompt exceeding token limits
**What goes wrong:** NPC personality + region context + memory + affinity all injected = huge prompt
**Why it happens:** Rich NPC data + accumulated memory grows over time
**How to avoid:** Budget the prompt: personality ~200 tokens, region ~100 tokens, memory ~150 tokens, affinity/conversation ~100 tokens. Cap memory summary length. Use gpt-5-mini's smaller context efficiently
**Warning signs:** LLM responses getting truncated or slow

### Pitfall 4: Race condition in quest slot limits
**What goes wrong:** Player accepts multiple quests simultaneously, exceeding the limit
**Why it happens:** Concurrent LLM responses both offering quests
**How to avoid:** Quest acceptance happens in submit_llm_result reducer (transactional). Count active quests inside the reducer before inserting QuestInstance. The one-at-a-time LlmTask concurrency check also helps
**Warning signs:** Players with more than the limit of active quests

### Pitfall 5: NpcDialogueOption table becomes dead code
**What goes wrong:** Old dialogue tree system still referenced but unused
**Why it happens:** NpcDialogueOption table and getAvailableDialogueOptions helper still exist
**How to avoid:** Delete or mark as deprecated. The `choose_dialogue_option` reducer should be replaced, not left alongside the new system. Clean up `npc_affinity.ts` to remove `getAvailableDialogueOptions`
**Warning signs:** TypeScript errors from missing table data

### Pitfall 6: World gen NPCs lack personality data
**What goes wrong:** Existing NPCs from Phase 27 world gen have no personalityJson
**Why it happens:** `writeGeneratedRegion()` currently inserts NPCs with only name/type/description/greeting
**How to avoid:** Expand the REGION_GENERATION_SCHEMA to include personality fields in the NPC generation. Update `writeGeneratedRegion()` to populate personalityJson from the LLM response
**Warning signs:** NPCs have generic, personality-less conversations

## Code Examples

### Conversation System Prompt Structure
```typescript
// Source: Project pattern from llm_prompts.ts
function buildNpcConversationSystemPrompt(
  npc: any,
  region: any,
  location: any,
  personality: any,
  affinityTier: string,
  memory: any
): string {
  return `${NARRATOR_PREAMBLE}

## Your Role: ${npc.name}

You are now speaking AS this NPC, not as The System. The System narrates the world,
but right now you ARE ${npc.name}.

### Identity
- Name: ${npc.name}
- Role: ${npc.npcType}
- Location: ${location.name} in ${region.name} (${region.biome})
- Personality: ${personality.traits?.join(', ')}
- Speech pattern: ${personality.speechPattern}
- Knowledge domains: ${personality.knowledgeDomains?.join(', ')}

### What You Know
- Your region: ${region.name} (${region.biome}), landmarks: ${region.landmarks}
- Threats: ${region.threats}
- Your secrets (only share at trusted+ affinity): ${personality.secrets?.join('; ')}

### What You DO NOT Know
- Other regions you have never visited
- Player's private thoughts or inventory
- Events in distant parts of the world

### Relationship with this player
- Affinity tier: ${affinityTier}
- Memory: ${JSON.stringify(memory)}

### Response Rules
- Stay in character as ${npc.name}
- Your tone matches your personality
- At ${affinityTier} affinity, you are willing to: [corresponding AFFINITY_UNLOCKS]
- If context calls for it, include side effects in the effects array
- NEVER break character to discuss game mechanics directly

Respond with valid JSON matching the schema in the user message.`;
}
```

### Conversation Response Schema
```typescript
const NPC_CONVERSATION_SCHEMA = `{
  "dialogue": "string -- what the NPC says, in character",
  "internalThought": "string -- brief NPC internal reaction (used for memory, not shown to player)",
  "effects": [
    {
      "type": "offer_quest | reveal_location | give_item | affinity_change | warn_danger | open_shop | none",

      // For offer_quest:
      "questType": "kill | kill_loot | explore | delivery | boss_kill | gather",
      "questName": "string",
      "questDescription": "string -- narrative quest description",
      "targetCount": "number",
      "rewardType": "xp | gold | item | ability",
      "rewardXp": "number",
      "rewardGold": "number (optional)",
      "rewardItemName": "string (optional -- for item rewards)",
      "rewardItemDesc": "string (optional -- for item rewards)",

      // For affinity_change:
      "amount": "number (-5 to +5)",

      // For reveal_location:
      "locationName": "string",
      "locationDescription": "string"
    }
  ],
  "memoryUpdate": {
    "addTopics": ["string -- new topics discussed"],
    "addSecret": "string or null -- secret shared, if any"
  }
}`;
```

### Quest Reward Item Stats Formula
```typescript
// Source: Based on existing crafting/item tier system
function computeQuestRewardStats(
  playerLevel: bigint,
  questType: string,
  rewardRarity: string
): Partial<ItemTemplate> {
  // Base budget scales with level
  const levelNum = Number(playerLevel);
  const baseBudget = levelNum * 2 + 5;

  // Quest type multiplier
  const typeMultipliers: Record<string, number> = {
    kill: 1.0,
    kill_loot: 1.0,
    explore: 0.8,
    gather: 0.8,
    delivery: 0.9,
    boss_kill: 1.3,
    escort: 1.2,
    discover: 0.9,
    interact: 0.8,
  };
  const typeMult = typeMultipliers[questType] || 1.0;

  // Rarity multiplier
  const rarityMultipliers: Record<string, number> = {
    common: 0.8,
    uncommon: 1.0,
    rare: 1.3,
    epic: 1.6,
    legendary: 2.0,
  };
  const rareMult = rarityMultipliers[rewardRarity] || 1.0;

  const totalBudget = Math.round(baseBudget * typeMult * rareMult);
  // Distribute budget across stats based on item slot and class
  // ... (similar to crafting system)
}
```

## Discretion Recommendations

### NPC Conversation Budget Model
**Recommendation:** Share the existing per-player daily LLM budget. Each NPC message costs 1 budget point (same as skill gen or world gen). This keeps things simple and prevents conversation spam.
**Rationale:** The budget system already exists with `checkBudget()` / `incrementBudget()`. NPC conversations are the most frequent LLM use, so they should count against the same pool. Players will self-regulate usage.

### Active Quest Limit
**Recommendation:** 4 active quests per player.
**Rationale:** 3 feels too restrictive for a game with emergent quests from multiple NPCs. 5 makes it easy to forget older quests. 4 is the sweet spot -- encourages completing quests before seeking more.

### NPC Memory Summary Format
**Recommendation:** JSON object with typed arrays:
```json
{
  "topics": ["the blight", "the old king", "trade routes"],
  "questsCompleted": ["The Blighted Pack"],
  "questsFailed": [],
  "secretsShared": ["the hidden spring behind the falls"],
  "giftsGiven": ["Iron Dagger", "Health Potion"],
  "nickname": null,
  "lastConversationSummary": "Player asked about trade routes and the blight"
}
```
**Rationale:** Structured data is easy to inject into prompts, easy to update incrementally, and bounded in size. Each array capped at ~10 entries (oldest dropped). Total memory stays under 500 characters.

### Quest Difficulty Multiplier Values
**Recommendation:**
| Quest Type | Reward Multiplier | Rationale |
|-----------|-------------------|-----------|
| kill | 1.0x | Baseline |
| kill_loot | 1.0x | Same difficulty, different mechanics |
| explore | 0.8x | Low danger, travel only |
| gather | 0.8x | Low danger, repetitive |
| delivery | 0.9x | Travel + possibly dangerous areas |
| discover | 0.9x | Exploration with some risk |
| interact | 0.8x | Simple interaction objective |
| boss_kill | 1.3x | Single hard fight, higher stakes |
| escort | 1.2x | Complex, failure-prone |

### QUEST_WORLD_EFFECTS to Implement This Phase
**Recommendation:** Implement `spawn_enemies` and `spawn_item` only. Defer `create_location`, `unlock_path`, `spawn_npc`, `modify_faction`, and `trigger_event` to future phases.
**Rationale:** `spawn_enemies` creates NamedEnemy rows (already exists). `spawn_item` creates QuestItem rows (already exists). The other effects require creating world geometry (locations, connections) which adds significant complexity and should be validated separately.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `NpcDialogueOption` scripted trees | LLM freeform conversation | Phase 29 | DELETE old dialogue system |
| `choose_dialogue_option` reducer | `talk_to_npc` reducer + LlmTask | Phase 29 | Replace, don't extend |
| Seeded quests from world gen | Quests emerge from conversation | Phase 29 | No quest seeding at region creation |
| Generic NPC greeting + type | Rich personalityJson | Phase 29 | Expand world gen prompt |

**Deprecated/outdated:**
- `NpcDialogueOption` table: Replace with LLM conversations
- `NpcDialogueVisited` table: No longer needed (no dialogue trees to track)
- `choose_dialogue_option` reducer: Replace with `talk_to_npc`
- `getAvailableDialogueOptions()` in npc_affinity.ts: Delete
- `NPC_PERSONALITIES` in npc_data.ts: Replace with LLM-generated personality data (keep AFFINITY_TIERS and cooldown constants)

## Open Questions

1. **Conversation cooldown adjustment**
   - What we know: Current `CONVERSATION_COOLDOWN_MICROS` is 1 hour (npc_data.ts line 31)
   - What's unclear: Is 1 hour appropriate for LLM conversations? Players may want more frequent interaction
   - Recommendation: Reduce to 30 seconds (budget is the real limiter now, not cooldown). Or remove cooldown entirely since budget gates usage

2. **NPC personality migration for existing NPCs**
   - What we know: World gen currently creates NPCs with empty personalityJson
   - What's unclear: Do existing NPCs from previous world gen runs need retroactive personality generation?
   - Recommendation: Handle gracefully -- if personalityJson is empty, generate a basic personality from npc name/type/location context in the conversation prompt. No migration needed

3. **Quest completion reward flow**
   - What we know: QuestInstance tracks progress/completion. Quest rewards need to be applied
   - What's unclear: Existing quest system may not have a "turn in" flow -- quests auto-complete on progress
   - Recommendation: Add a `turn_in_quest` reducer that validates completion and awards rewards (XP, gold, items). This replaces auto-completion for LLM quests

## Sources

### Primary (HIGH confidence)
- Project codebase: `spacetimedb/src/schema/tables.ts` -- all table definitions
- Project codebase: `spacetimedb/src/data/mechanical_vocabulary.ts` -- all enum vocabularies
- Project codebase: `spacetimedb/src/helpers/npc_affinity.ts` -- affinity tracking system
- Project codebase: `spacetimedb/src/helpers/world_gen.ts` -- writeGeneratedRegion NPC creation
- Project codebase: `spacetimedb/src/data/llm_prompts.ts` -- prompt patterns and schemas
- Project codebase: `spacetimedb/src/index.ts` -- LlmTask creation and submit_llm_result handler
- Project codebase: `spacetimedb/src/composables/useLlmProxy.ts` -- client LLM proxy pattern

### Secondary (MEDIUM confidence)
- Project codebase: `spacetimedb/src/helpers/skill_gen.ts` -- JSON extraction and validation pattern
- Project codebase: `spacetimedb/src/reducers/quests.ts` -- quest item/named enemy interaction

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - using only existing project patterns and libraries
- Architecture: HIGH - extending proven LlmTask pipeline with new domain, tables are straightforward extensions
- Pitfalls: HIGH - identified from actual codebase analysis (existing table structures, index patterns, LLM result handling)

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable -- all patterns are internal project patterns)
