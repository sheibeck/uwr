# Phase 29: NPC & Quest Generation - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

LLM generates contextual NPCs with persistent identity and narrative quests from world state. Generated content is consumed by existing game systems (quest tracking, NPC affinity, combat, items). This phase does NOT add new game mechanics — it wires LLM generation into the existing NPC, quest, and item infrastructure.

</domain>

<decisions>
## Implementation Decisions

### NPC Conversation Model
- Full LLM-driven conversations — no dialogue trees. Players type freely, LLM responds in character
- Delete/bypass the v1.0 `npc_dialogue_option` scripted dialogue tree system
- NPC memory is summarized per-player-per-NPC (key facts: topics discussed, quests done, gifts given) — not full conversation logs
- Conversation side effects (offer_quest, reveal_location, give_item, affinity_change, etc.) auto-apply from structured JSON in LLM response — no player confirmation prompts
- Side effect types from mechanical vocabulary: CONVERSATION_EFFECTS enum

### Quest Generation Triggers
- Quests are generated on NPC conversation — when affinity/context is right, the LLM decides to offer a quest as a conversation side effect
- No quests seeded at region creation time — NPCs start questless, quests emerge through player interaction
- Quests are per-player: each QuestTemplate is generated for a specific player based on their level, class, race, and history
- Quest generation can create new world content using QUEST_WORLD_EFFECTS vocab (spawn_enemies, create_location, spawn_item, unlock_path)
- Players limited to 3-5 active quests at a time. Completed/abandoned quests free up slots

### NPC Identity Depth
- Rich personality generated at NPC creation time (expand world gen prompt): personality traits, knowledge domains, speech patterns, secrets, faction ties
- Stored in existing `personalityJson` field on Npc table
- NPCs have scoped knowledge boundaries — they know about their region, faction, and role-specific topics. LLM constrained to this. No omniscient NPCs
- NPCs are fixed at their generated location — no wandering (wanderer role deferred)
- Personality is narrative-only — affects dialogue tone and content reveals, not mechanical values (prices, rewards, affinity rates). Exception: existing affinityMultiplier in personalityJson

### Quest Reward Scaling
- LLM picks reward type and flavor (item name, description), power-budget formula clamps actual stat values to level-appropriate ranges
- Quest reward items are LLM-generated and class/race-appropriate for the player — tailored upgrades, distinct from random mob drops
- Generated items: LLM names the item + flavor text, stats computed by level/rarity formula (similar to crafting system). New ItemTemplate row created on quest completion
- Rare ability rewards possible from high-affinity (trusted/bonded) NPCs — uses Phase 28's skill generation + power budget validation
- Quest type affects reward quality: harder quests (boss_kill, escort) get a reward multiplier over baseline (kill). Explore/gather quests give less

### Claude's Discretion
- NPC conversation LLM budget model (per-message cost vs free/separate budget)
- Exact active quest limit (3, 4, or 5)
- NPC memory summary format and storage approach
- Quest difficulty multiplier values per quest type
- Which QUEST_WORLD_EFFECTS to implement in this phase vs defer

</decisions>

<specifics>
## Specific Ideas

- Quest items should be a meaningful gear progression path — good source of equipment upgrades over time, but power-scaled so players don't become overpowered too quickly
- Quest reward items are different from random enemy drops: they are specifically geared for the player's race/class
- The "may never be offered again" philosophy from Phase 28 skill generation applies to quest uniqueness — each quest is a one-time offer

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Npc` table (schema/tables.ts): has unused `personalityJson`, `baseMood`, `factionId` fields ready for rich NPC identity
- `NpcAffinity` table + helpers (helpers/npc_affinity.ts): full affinity tracking (-100 to +100), tier names, CHA-scaled gains, perk bonuses
- `NpcDialog` table: per-character-per-NPC conversation log storage
- `QuestTemplate` table: supports questType (kill, kill_loot, explore, delivery, boss_kill), targetEnemyTemplateId, targetLocationId, targetNpcId, targetItemName
- `QuestInstance` table: per-character quest progress tracking with by_character and by_template indexes
- `QuestItem` / `NamedEnemy` tables: quest objective entities with location-based discovery
- `writeGeneratedRegion()` (helpers/world_gen.ts): already inserts basic NPCs during region creation — expand prompt for richer NPC data
- `llm_prompts.ts`: NARRATOR_PREAMBLE and prompt builder pattern established
- `mechanical_vocabulary.ts`: NPC_ROLES, QUEST_TYPES, QUEST_WORLD_EFFECTS, QUEST_REWARD_TYPES, NPC_AFFINITY_THRESHOLDS, NPC_MEMORY_TYPES, CONVERSATION_EFFECTS, AFFINITY_UNLOCKS all defined
- Phase 28 skill generation pipeline: AbilityTemplate + power budget validation pattern reusable for ability quest rewards
- Phase 28 client trigger pattern: `prepare_skill_gen` reducer sets state, client calls procedure

### Established Patterns
- Three-phase procedure: `withTx(read) -> http.fetch() -> withTx(write)` (Phase 24)
- Haiku model for real-time generation (Sonnet HTTP fails from SpacetimeDB runtime)
- Schema-constrained JSON generation with mechanical vocabulary validation
- Client triggers procedure after server sets state (reducer prepares, client calls)
- `registerXxxReducers(deps)` pattern for V2 auto-collection compatibility

### Integration Points
- `writeGeneratedRegion()` in world_gen.ts: expand to generate richer NPC personality data
- `npc_interaction.ts` reducers: replace `choose_dialogue_option` with LLM conversation reducer
- `quests.ts` reducers: quest acceptance/completion flow already exists — wire generated quests into it
- Item generation: create ItemTemplate rows with level-scaled stats on quest completion
- Intent service (Phase 25): route "talk to [NPC]" natural language to conversation reducer

</code_context>

<deferred>
## Deferred Ideas

- NPC wanderer role (NPCs moving between locations) — future phase
- Full conversation log memory (storing every exchange) — current approach uses summarized memory
- NPC personality affecting mechanical values (vendor prices, affinity rates) — keep narrative-only for now
- Quest chains (multi-part questlines where completing one unlocks the next) — could be a future enhancement

</deferred>

---

*Phase: 29-npc-quest-generation*
*Context gathered: 2026-03-07*
