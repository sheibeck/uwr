# Quick Task 382: Shore up quest system — Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Task Boundary

Shore up quest system: NPC quest limits (max active per NPC), duplicate prevention, quest-enemy alignment (LLM knows existing enemies or creates new ones), LLM context enrichment with region/location/enemy data, quest narrative continuity (follow-up quests), repeat quest throttling.

</domain>

<decisions>
## Implementation Decisions

### NPC Active Quest Cap
- Max 1 active quest per NPC per player at a time
- Deep quest chains are encouraged — the limit is concurrent, not lifetime
- When capped: in-character refusal — LLM prompt tells NPC they have outstanding work, NPC weaves it into dialogue naturally

### Enemy Alignment for Kill Quests
- LLM should prefer existing enemies at nearby locations but CAN create new enemy types if narrative demands it
- Server creates the enemy template if LLM invents a new one
- LLM context includes: enemy names + locations + level ranges

### Follow-up Quest Chains
- Follow-up quests offered on turn-in — when player turns in a quest, the NPC's thank-you dialogue can include a follow-up offer_quest effect
- Chain happens naturally in the conversation flow

### Claude's Discretion
- Quest chain memory tracking: use existing NpcMemory.memoryJson questsCompleted list vs new table — Claude decides best approach
- Repeat quest throttling implementation details
- Duplicate quest prevention mechanism

</decisions>

<specifics>
## Specific Ideas

- Enrich LLM system prompt with nearby enemy data (names, locations, levels) so kill quests target real enemies
- Add per-NPC active quest count check in talk_to_npc or submit_llm_result
- Include completed quest names in NPC conversation context so LLM can build narrative chains
- Throttle repeat quest offers by tracking recently-offered quest names in NPC memory

</specifics>
