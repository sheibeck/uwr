---
phase: quick-382
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/npc_conversation.ts
  - spacetimedb/src/data/llm_prompts.ts
  - spacetimedb/src/reducers/npc_interaction.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/reducers/quests.ts
autonomous: true
requirements: [QUEST-LIMITS, QUEST-ENEMY-ALIGN, QUEST-FOLLOWUP, QUEST-DEDUP, QUEST-THROTTLE]

must_haves:
  truths:
    - "NPC refuses to offer new quest when player already has active quest from that NPC"
    - "Kill quests target existing enemies at nearby locations when available"
    - "LLM prompt includes enemy names, locations, and levels for context"
    - "Turn-in dialogue can offer follow-up quest from same NPC"
    - "Completed quest names stored in NPC memory for narrative continuity"
    - "Duplicate quest names prevented within same NPC"
    - "Recently-completed quest types throttled to encourage variety"
  artifacts:
    - path: "spacetimedb/src/helpers/npc_conversation.ts"
      provides: "getActiveQuestCountForNpc, getCompletedQuestNamesForNpc, getNearbyEnemyContext helpers"
    - path: "spacetimedb/src/data/llm_prompts.ts"
      provides: "Enriched system+user prompts with enemy data, completed quest history, per-NPC cap info"
    - path: "spacetimedb/src/index.ts"
      provides: "Per-NPC quest cap enforcement, enemy template resolution from LLM enemy name, duplicate prevention"
  key_links:
    - from: "spacetimedb/src/helpers/npc_conversation.ts"
      to: "spacetimedb/src/reducers/npc_interaction.ts"
      via: "getNearbyEnemyContext called in talk_to_npc"
      pattern: "getNearbyEnemyContext"
    - from: "spacetimedb/src/data/llm_prompts.ts"
      to: "spacetimedb/src/index.ts"
      via: "LLM response includes targetEnemyName for kill quests"
      pattern: "targetEnemyName"
    - from: "spacetimedb/src/index.ts"
      to: "spacetimedb/src/helpers/npc_conversation.ts"
      via: "getActiveQuestCountForNpc check before creating quest"
      pattern: "getActiveQuestCountForNpc"
---

<objective>
Shore up the quest system with NPC quest limits, enemy alignment, follow-up quest chains, duplicate prevention, and repeat throttling.

Purpose: Prevent quest spam, make kill quests target real enemies, enable narrative quest chains, and improve overall quest quality through LLM context enrichment.
Output: Enhanced quest guardrails across server helpers, LLM prompts, and quest processing logic.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/npc_conversation.ts
@spacetimedb/src/data/llm_prompts.ts
@spacetimedb/src/reducers/npc_interaction.ts
@spacetimedb/src/index.ts (lines 997-1196)
@spacetimedb/src/reducers/quests.ts
@spacetimedb/src/schema/tables.ts

<interfaces>
From spacetimedb/src/schema/tables.ts:
```typescript
// QuestTemplate: by_npc index (npcId), by_character index (characterId)
// QuestInstance: by_character index (characterId), by_template index (questTemplateId)
// EnemyTemplate: id PK, name, level, role, creatureType
// LocationEnemyTemplate: by_location index (locationId), fields: locationId, enemyTemplateId
// NpcMemory: by_character index, memoryJson contains { topics, questsCompleted, secretsShared, giftsGiven, lastConversationSummary }
// Location: id PK, name, regionId, isSafe
// LocationConnection: by_from index (fromLocationId), toLocationId
```

From spacetimedb/src/helpers/npc_conversation.ts:
```typescript
export const MAX_ACTIVE_QUESTS = 4;
export function getOrCreateNpcMemory(ctx, characterId, npcId): any;
export function updateNpcMemory(ctx, memoryRow, memoryUpdate, internalThought?): void;
export function getActiveQuestCount(ctx, characterId): number;
export function getAffinityTierForConversation(affinity): string;
export function parseNpcPersonality(npc): { traits, speechPattern, knowledgeDomains, secrets, affinityMultiplier };
```

From spacetimedb/src/data/llm_prompts.ts:
```typescript
export function buildNpcConversationSystemPrompt(npc, region, location, personality, affinityTier, memory): string;
export function buildNpcConversationUserPrompt(playerMessage, activeQuestCount, maxQuests, nearbyLocationNames?): string;
export const NPC_CONVERSATION_RESPONSE_SCHEMA: string;
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add quest context helpers and enrich LLM prompts</name>
  <files>spacetimedb/src/helpers/npc_conversation.ts, spacetimedb/src/data/llm_prompts.ts, spacetimedb/src/reducers/npc_interaction.ts</files>
  <action>
**In `spacetimedb/src/helpers/npc_conversation.ts`**, add three new helper functions:

1. `getActiveQuestCountForNpc(ctx, characterId, npcId): number` — Count non-completed QuestInstance rows where the quest_template's npcId matches. Iterate `ctx.db.quest_instance.by_character.filter(characterId)`, for each non-completed instance look up `ctx.db.quest_template.id.find(qi.questTemplateId)` and check `qt.npcId === npcId`.

2. `getCompletedQuestNamesForNpc(ctx, characterId, npcId): string[]` — Extract completed quest names from NpcMemory.memoryJson.questsCompleted for this character+NPC pair. Use existing `getOrCreateNpcMemory`.

3. `getNearbyEnemyContext(ctx, locationId): { name: string; level: number; location: string }[]` — Collect enemy templates from the character's current location AND connected locations. For each location, iterate `ctx.db.location_enemy_template.by_location.filter(locId)`, look up the enemy template, and collect `{ name: et.name, level: Number(et.level), location: loc.name }`. Cap at 15 entries to keep prompt size bounded.

Also add `export const MAX_QUESTS_PER_NPC = 1;` constant.

**In `spacetimedb/src/data/llm_prompts.ts`**, modify two functions:

1. `buildNpcConversationSystemPrompt` — Add new parameters: `completedQuestNames: string[]`, `activeQuestFromThisNpc: boolean`. Add to the system prompt:
   - A section "### Quest History with this player" listing completed quest names so LLM can build narrative chains
   - If `activeQuestFromThisNpc` is true, add instruction: "You have already given this player a task that is not yet complete. Do NOT offer another quest. Instead, reference the outstanding work if the topic comes up — remind them they have unfinished business with you."

2. `buildNpcConversationUserPrompt` — Add new parameters: `nearbyEnemies: { name: string; level: number; location: string }[]`, `recentQuestNames: string[]`. Add to the user prompt:
   - Enemy context section: "Enemies in the area: {name} (level {level}, at {location})" — so kill quests can reference real enemies
   - Add `targetEnemyName` field to the NPC_CONVERSATION_RESPONSE_SCHEMA for offer_quest effects: `"targetEnemyName": "string -- exact name of an existing enemy to target (for kill/kill_loot/boss_kill quests, prefer enemies listed above)"`
   - Add instruction: "For kill quests, prefer targeting enemies listed above. You may invent a new enemy type ONLY if the narrative strongly demands it."
   - Throttle instruction: "Recently completed quests: {recentQuestNames}. Avoid offering quests with the same name or very similar objectives."

**In `spacetimedb/src/reducers/npc_interaction.ts`**, update `talk_to_npc` to:
1. Import and call the new helpers: `getActiveQuestCountForNpc`, `getCompletedQuestNamesForNpc`, `getNearbyEnemyContext`, `MAX_QUESTS_PER_NPC`
2. Pass `completedQuestNames` and `activeQuestFromThisNpc` (boolean: `getActiveQuestCountForNpc(ctx, character.id, npcId) >= MAX_QUESTS_PER_NPC`) to `buildNpcConversationSystemPrompt`
3. Pass `nearbyEnemies` and `recentQuestNames` (last 5 from completedQuestNames) to `buildNpcConversationUserPrompt`
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>
    - getNearbyEnemyContext returns enemy data from current + connected locations
    - getActiveQuestCountForNpc counts active quests per NPC per player
    - LLM system prompt includes completed quest history and per-NPC cap enforcement
    - LLM user prompt includes nearby enemy context with names/levels/locations
    - Response schema includes targetEnemyName field for kill quests
    - talk_to_npc passes all enriched context to prompt builders
  </done>
</task>

<task type="auto">
  <name>Task 2: Enforce per-NPC quest cap, enemy alignment, duplicate prevention, and follow-up chains in submit_llm_result</name>
  <files>spacetimedb/src/index.ts, spacetimedb/src/reducers/quests.ts, spacetimedb/src/helpers/npc_conversation.ts</files>
  <action>
**In `spacetimedb/src/index.ts`** (the `npc_conversation` branch of `submit_llm_result`, around line 1053), modify the `offer_quest` effect processing:

1. **Per-NPC cap enforcement**: Before creating a quest, check `getActiveQuestCountForNpc(ctx, charId, npcIdVal) >= MAX_QUESTS_PER_NPC`. If capped, `continue` (skip the quest offer silently — the LLM prompt already told the NPC not to offer, this is a safety net). Import `getActiveQuestCountForNpc` and `MAX_QUESTS_PER_NPC` from `../helpers/npc_conversation`.

2. **Duplicate quest name prevention**: Before creating the quest template, check if there's already a quest_template with the same name for the same NPC+character combination. Iterate `ctx.db.quest_template.by_npc.filter(npcIdVal)` and check for matching `name` AND `characterId === charId`. If found, `continue`.

3. **Enemy template resolution from LLM name**: For kill-type quests (`kill`, `kill_loot`, `boss_kill`), if `effect.targetEnemyName` is provided:
   - Search `location_enemy_template` at the character's location AND connected locations for an enemy_template whose `name` matches (case-insensitive)
   - If found, set `targetEnemyTemplateId` to that template's ID
   - If NOT found (LLM invented a new enemy), create a new EnemyTemplate with sensible defaults: `name: effect.targetEnemyName`, `level: character.level`, `role: 'melee'`, `roleDetail: 'standard'`, `abilityProfile: 'basic'`, `terrainTypes: 'any'`, `creatureType: effect.targetEnemyName.includes('undead') ? 'undead' : 'beast'` (simple heuristic), `timeOfDay: 'any'`, `socialGroup: 'loner'`, `socialRadius: 0n`, `awareness: 'normal'`, `groupMin: 1n`, `groupMax: 1n`, `armorClass: BigInt(8 + Number(character.level))`, `maxHp: BigInt(20 + Number(character.level) * 8)`, `baseDamage: BigInt(3 + Number(character.level) * 2)`, `xpReward: BigInt(Number(character.level) * 10 + 15)`. Then create a `location_enemy_template` entry linking it to the character's current location. Set `targetEnemyTemplateId` to the new template's ID.
   - This replaces the current fallback that just grabs the first enemy at the location.

4. **Record completed quest in NPC memory**: After the quest is accepted, no change needed here — this happens at turn-in time (see quests.ts below).

**In `spacetimedb/src/reducers/quests.ts`**, in the `turn_in_quest` reducer:

1. **Record quest name in NPC memory**: After awarding rewards and before deleting the quest instance, if `qt.npcId` exists:
   - Import `getOrCreateNpcMemory` and `updateNpcMemory` from `../helpers/npc_conversation`
   - Get the memory row: `const memory = getOrCreateNpcMemory(ctx, character.id, qt.npcId)`
   - Parse memoryJson, push `qt.name` to `questsCompleted` array (cap at 10, drop oldest), write back via direct update (same pattern as updateNpcMemory but for questsCompleted field)
   - Add a new function `recordQuestCompletion` in `npc_conversation.ts` that handles this cleanly.

**In `spacetimedb/src/helpers/npc_conversation.ts`**, add:

1. `recordQuestCompletion(ctx, characterId, npcId, questName): void` — Gets or creates NPC memory, parses memoryJson, pushes questName to questsCompleted (dedup, cap at 10), saves.

**Follow-up quest chains**: The existing system already supports this — when a player turns in a quest and then talks to the NPC again, the LLM sees the completed quest in the quest history and can naturally offer a follow-up. The key enabler is recording `questsCompleted` in NPC memory (done above) and passing it to the prompt (done in Task 1). No additional schema changes needed.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>
    - Per-NPC quest cap (max 1 active) enforced server-side in submit_llm_result
    - Duplicate quest names blocked for same NPC+character
    - Kill quests resolve targetEnemyName from LLM against real enemy templates
    - New enemy templates auto-created when LLM invents novel enemies
    - Quest completion recorded in NPC memory for narrative continuity
    - Follow-up quest chains enabled via completed quest history in LLM context
    - Recent quest names passed to LLM for repeat throttling
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles without errors: `npx tsc --noEmit -p spacetimedb/tsconfig.json`
2. Publish to local SpacetimeDB: `spacetime publish uwr -p spacetimedb`
3. Manual verification: Talk to NPC, get quest, talk again — NPC should NOT offer another quest while first is active
4. Manual verification: Kill quest should reference real enemy names from the area
</verification>

<success_criteria>
- Per-NPC active quest cap of 1 enforced both in LLM prompt (soft) and server logic (hard)
- LLM receives enemy context (names, levels, locations) for informed kill quest targeting
- Kill quests resolve to real enemy templates when possible, create new ones when necessary
- Completed quest names stored in NPC memory and passed to future conversations
- Duplicate quest name prevention in place
- Recent quest names passed to LLM for repeat throttling
- TypeScript compiles and module publishes successfully
</success_criteria>

<output>
After completion, create `.planning/quick/382-shore-up-quest-system-npc-quest-limits-d/382-SUMMARY.md`
</output>
