# Research Summary

**Project:** UWR — RPG Milestone (Progression Systems + LLM Content Engine)
**Synthesized:** 2026-02-11
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

---

## Executive Summary

The UWR milestone is technically feasible with the existing stack (SpacetimeDB 1.12.0 TypeScript + Vue 3). The RPG systems (Race, Hunger, Renown, Quests, World Events) are straightforward to implement in SpacetimeDB tables + reducers. The LLM integration (Anthropic API via SpacetimeDB procedures) is viable but requires careful architecture to avoid the five critical failure modes identified in research.

**Overall confidence:** HIGH for RPG systems, MEDIUM-HIGH for LLM integration (procedures are beta).

---

## Key Decisions Validated by Research

| Decision | Research Finding | Confidence |
|----------|-----------------|------------|
| LLM via SpacetimeDB procedures | Viable. HTTP calls work in procedures. Constraints documented. | HIGH |
| Hunger = reward-only | Validated by WoW Well Fed history. Penalty-based hunger is universally disliked. | HIGH |
| Renown per-faction, no decay | No decay is standard (WoW model). Decay creates churn without engagement. | HIGH |
| Race as data rows (not enum) | Required for World Event race unlocks. `Race.unlocked: bool` pattern. | HIGH |
| Client-triggered procedure (Phase 1) | Simplest async generation path. Server-scheduled for Phase 2. | MEDIUM |
| Config table for API key | Best available pattern in SpacetimeDB 1.12. No native env vars yet. | MEDIUM |

---

## Architecture Blueprint

### The generation pipeline (every LLM-generated content type)

```
1. Game event fires (quest accept, world event trigger, NPC interact)
   ↓
2. Reducer: writes game state + content row with status='pending'
   (Reducer completes immediately — game state valid)
   ↓
3. Client: sees 'pending' row → shows placeholder text → calls procedure
   ↓
4. Procedure: reads state (withTx) → calls Claude (outside tx) → writes text (withTx)
   Procedure: on failure → writes fallback text (always sets status, never leaves 'pending')
   ↓
5. All subscribers: see status flip to 'ready' → UI updates with generated text
```

**Non-negotiable invariant:** Game state validity must never depend on LLM success.

### Content tables pattern
Every content type has a dedicated table with `status: 'pending' | 'ready' | 'fallback'`.
Index on `contextHash` for deduplication. All tables are `public: true`.

### Credential storage
Config table (private, not public). API key stored as a row. Admin-only `setConfig` reducer.

---

## System Designs (by feature)

### Race System
- `Race` table: `{ id, name, description, unlocked: bool, classRestrictions: string (JSON), statBonuses: string (JSON) }`
- Start with 4 races unlocked, 1-2 hidden (unlock via World Events)
- `RACE_CLASS_MAP` data constant in `spacetimedb/src/data/races.ts`
- `create_character` reducer validates race-class combination
- Character gains base stats = class stats + race modifiers (additive)

### Hunger System
- `Hunger` table: `{ characterId (PK), currentHunger: u8, wellFedUntil: timestamp }`
- Scheduled `HungerDecay` fires every 5 minutes: ticks hunger down by 2 points
- `eat_food` reducer: consumes food item → sets `wellFedUntil = now + buffDuration`
- Combat reducer: if `wellFedUntil > ctx.timestamp` → apply Well Fed stat multipliers
- No starvation penalty. No mandatory maintenance.

### Renown / Faction System
- `Faction` table: `{ id, name, description, rivalFactionId: optional }`
- `FactionStanding` table: `{ characterId, factionId, standing: i64 }` (composite PK)
- `FactionRank` data constant: maps standing ranges to rank names + unlocks
- Reducers that grant renown: `completeFactionQuest`, `killFactionEnemy`, `offerTribute`
- View `my_faction_standings`: filters by `ctx.sender`, returns all faction standings
- No standing decay. Floor: hostile factions don't go below -5000 automatically.

### World Events System
- `WorldEvent` table: `{ id, eventType, targetId, triggerCondition, status, firedAt }`
- `GeneratedEventText` table: `{ eventId (PK), consequenceText, status }`
- Trigger types: threshold (reducer checks total counts), admin (`fire_world_event` reducer)
- On fire: reducer writes WorldEvent row + GeneratedEventText row with `status='pending'`
- Procedure generates consequence text → flips to `status='ready'`
- EventWorld log entry appended for all players

### Quest System
- `Quest` table: `{ id, factionId, requiredStanding, rewardXp, rewardGold, rewardStanding }`
- `GeneratedQuestText` table: `{ questId (PK), title, bodyText, npcIntro, status, contextHash }`
- `PlayerQuest` table: `{ characterId, questId, status: 'active'|'complete', startedAt, completedAt }`
- View `available_quests`: joins Quest + FactionStanding, filters by player's standing ≥ required
- Quest text generated when player views available quests (or pre-generated on server event)

### LLM Integration
- `LlmConfig` table (private): stores `api_key`, `default_model`, circuit breaker state
- Single `generateContent` procedure: accepts content type + context, returns unit (writes to table)
- Always: read state (withTx) → HTTP call (outside tx) → write result (withTx) → write fallback on error
- Prompt caching: shared tone + lore section cached with `cache_control: { type: "ephemeral" }`
- Model routing: Haiku for NPC barks, Sonnet for quests and world events

---

## Critical Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Procedures API changes (beta) | High | Encapsulate in `src/procedures/` abstraction layer |
| HTTP call inside `withTx` crashes | High | Always: read in tx → HTTP outside → write in new tx |
| LLM failure leaves game state invalid | High | Never tie game mechanics to LLM success |
| Prompt injection via player names | Medium | Sanitize all player input; wrap in XML tags in prompt |
| Cost spike from concurrent generation | Medium | Per-player rate limit + context deduplication + circuit breaker |
| Rate limits exceeded at launch | Medium | Upgrade Anthropic tier before launch; deduplication reduces calls |
| `withTx` double-write on retry | Medium | Check for existing ready content before inserting |

---

## Implementation Order (Recommended)

Phase sequence that minimizes dependencies and risk:

1. **Races** — No LLM dependency. Foundation for everything else (class gating, stat bonuses).
2. **Hunger** — No LLM dependency. Scheduled table pattern proves out for later systems.
3. **Renown Foundation** — Tables + standing logic. No quests yet, no LLM yet.
4. **LLM Architecture** — Config table, procedure skeleton, fallback system, circuit breaker. Do this BEFORE quests or events need it.
5. **Quest System** — Uses renown gating + LLM text generation.
6. **World Events** — Uses renown thresholds + LLM consequence generation.
7. **Narrative Tone Rollout** — Apply LLM tone to event logs, existing NPC dialogue, quest text refinement.
8. **Content Data Expansion** — Gear, resources, crafting, NPCs, enemies. LLM-assisted batch generation.

---

## Shadeslinger Tone — Non-Negotiable Reminders

- Include 3-5 tone examples in every system prompt — abstract descriptions fail
- "Avoid these words" lists: epic, legendary, brave adventurer, destiny, heroic journey
- Every loading/placeholder state should also be in-tone ("The narrator is composing something suitably dispiriting...")
- Fallback content must also match the tone — pre-written fallbacks get the same treatment as LLM outputs
- Test tone by reading output aloud. If it sounds like a press release, rewrite the prompt.
