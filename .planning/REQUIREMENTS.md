# Requirements

**Milestone:** RPG Milestone — Progression Systems & LLM Content Engine
**Created:** 2026-02-11
**Status:** v1 (initial)

---

## Overview

This document captures requirements for the UWR RPG Milestone. Requirements are split into **v1** (this milestone, in scope) and **v2** (future, noted for reference). Each requirement has a unique ID (REQ-XXX) and is assigned to a phase.

---

## Category 1: Races

### v1 — In Scope

**REQ-001** — Race table and definitions
The game must have a `Race` table with at least 4 races defined at launch. Each race has: name, description, available classes (list), base stat modifiers, and an `unlocked` flag (bool). Races with `unlocked: false` are not visible at character creation.

**REQ-002** — Race-class restrictions
Character creation must enforce race-class restrictions. Only classes allowed for the selected race may be chosen. The backend `create_character` reducer must validate the combination and reject invalid combinations.

**REQ-003** — Race stat bonuses
Each race provides additive stat bonuses applied to base class stats. Example: Eldrin gets +15% spell damage, +10% mana regen. These bonuses must apply in combat calculations and stat display.

**REQ-004** — Race picker in character creation UI
The character creation UI must show available races (filtered to `unlocked: true`). Selecting a race must update the class selector to show only valid classes for that race. Race description and bonuses must be visible.

**REQ-005** — Racial data constant
A `RACE_DATA` constant in `spacetimedb/src/data/races.ts` defines racial bonuses and class restrictions. This data is used by reducers and is not stored in the database (static data).

### v2 — Future

**REQ-006** *(v2)* — Race-specific passive abilities (beyond stat bonuses)
**REQ-007** *(v2)* — Race unlock via World Events (Hollowed race example)
**REQ-008** *(v2)* — Racial titles and cosmetic rewards per race

---

## Category 2: Hunger

### v1 — In Scope

**REQ-010** — Hunger table and decay
Each character has a `Hunger` row: `{ characterId, currentHunger: u8 (0-100), wellFedUntil: timestamp }`. Hunger decays on a scheduled tick (every 5 minutes, ~2 points per tick). Hunger cannot go below 0.

**REQ-011** — Well Fed buff
Eating food with the `eat_food` reducer sets `wellFedUntil = now + buffDuration`. While `wellFedUntil > current time`, the character is Well Fed and receives stat bonuses in combat. Buff duration and magnitude vary by food tier.

**REQ-012** — Food item tiers
Food items have 4 tiers (Trail Rations, Basic Meal, Hearty Stew, Feast). Higher tiers provide stronger and longer-lasting Well Fed buffs. Tier 1 available from vendors. Tiers 2-4 require crafting.

**REQ-013** — Combat applies Well Fed bonus
The combat damage/defense calculation checks if the character is Well Fed. If yes, applies the Well Fed stat multipliers from the food item template. Well Fed does NOT need to be manually activated — it applies automatically.

**REQ-014** — Hunger bar in UI
The client UI must show hunger status: current hunger level and whether Well Fed buff is active (including time remaining). No penalty states visible (no "Starving" indicator).

**REQ-015** — No starvation penalty
Hunger reaching 0 must have no negative effect. This is a hard design requirement. No debuffs, no stat penalties, no combat restrictions from low hunger.

### v2 — Future

**REQ-016** *(v2)* — Group feast mechanic (one player's meal buffs whole party)
**REQ-017** *(v2)* — Race-specific hunger modifiers (some races eat less often)
**REQ-018** *(v2)* — Hunger-driven crafting tutorial integration

---

## Category 3: Renown / Faction

### v1 — In Scope

**REQ-020** — Faction table and definitions
A `Faction` table defines game factions. v1 launches with 3-4 factions, each having: id, name, description, and optional rival faction id. Factions are static data (no runtime creation).

**REQ-021** — Faction standing per character per faction
A `FactionStanding` table stores `{ characterId, factionId, standing: i64 }` per combination. Default standing on character creation: 0 (Neutral). Standing can be negative (Hostile territory).

**REQ-022** — Faction ranks
A `FACTION_RANKS` constant defines rank tiers: Hostile (-5000..−1), Unfriendly (-999..0), Neutral (0..999), Friendly (1000..2999), Honored (3000..5999), Revered (6000..8999), Exalted (9000+). Rank is computed client-side from standing value.

**REQ-023** — Standing mutations via game actions
Faction standing increases from: completing faction quests, killing faction-associated enemies, offering tribute (vendor-sold items consumed for standing). Standing changes are applied in the relevant reducers.

**REQ-024** — Cross-faction standing effects
Actions that increase standing with one faction may decrease standing with its rival faction. This is defined in faction data and applied automatically in the standing mutation reducer.

**REQ-025** — Faction standing view
A view `my_faction_standings` returns all FactionStanding rows for `ctx.sender`. Client uses this to display standing per faction and compute rank.

**REQ-026** — No standing decay
Faction standing never decays over time. Once earned, standing is permanent. No scheduled tick for standing.

### v2 — Future

**REQ-027** *(v2)* — Faction title rewards at Exalted
**REQ-028** *(v2)* — Faction war events (server-wide faction conflict triggers)
**REQ-029** *(v2)* — New factions unlocked via World Events

---

## Category 4: World Events

### v1 — In Scope

**REQ-030** — World Event table
A `WorldEvent` table stores: id, eventType (string), targetId (string), triggerCondition (string), status (`fired` | `resolved`), firedAt (timestamp).

**REQ-031** — Admin-triggered world events
A `fire_world_event` reducer (callable only by admin identity) allows manually triggering world events with specified type and target. Used for live game master events and testing.

**REQ-032** — Threshold-triggered world events
Server-wide stat trackers (e.g., total enemies killed, total faction standing gained) check thresholds on each relevant action. When a threshold is crossed, a world event fires automatically.

**REQ-033** — World event event log entry
When a world event fires, an `EventWorld` log entry is appended visible to all players. The entry uses LLM-generated consequence text (when available) or a pre-written fallback.

**REQ-034** — LLM-generated consequence text
World events trigger LLM text generation via the `generateContent` procedure. Generated text appears in the event log when ready. Status is `pending` until generation completes.

**REQ-035** — World event consequence: unlock race
A world event of type `race_unlock` must set `Race.unlocked = true` for the specified race. This is the primary World Events × Race integration.

### v2 — Future

**REQ-036** *(v2)* — World event consequence: unlock new faction
**REQ-037** *(v2)* — World event consequence: change zone enemy composition
**REQ-038** *(v2)* — Player-triggered world events (completing champion quests)
**REQ-039** *(v2)* — World event history panel in UI

---

## Category 5: LLM Integration

### v1 — In Scope

**REQ-040** — LLM config table
A private `LlmConfig` table stores: `api_key`, `default_model`, `circuit_open` (bool), `failure_count` (u32), `last_failure_at` (timestamp). An admin-only `setLlmConfig` reducer sets these values. The table is NOT public.

**REQ-041** — `generateContent` procedure
A single SpacetimeDB procedure (`generate_content`) handles all LLM generation: accepts content type and context JSON, calls the Anthropic Messages API, writes result to the appropriate content table. Content type determines the prompt template and target table.

**REQ-042** — Fire-and-forget generation pattern
All LLM generation is asynchronous. Game state mutations complete in reducers. Reducers write "pending" rows to content tables. Client sees pending rows and triggers the procedure. Procedure updates rows to "ready" on completion.

**REQ-043** — Fallback content system
Every content type must have pre-written fallback text in a `FALLBACK_CONTENT` constant (in `spacetimedb/src/data/llm_fallbacks.ts`). If the procedure fails (API error, timeout, malformed response), it writes fallback text and sets status to `fallback` (never leaves as `pending`).

**REQ-044** — Circuit breaker
The circuit breaker state is stored in `LlmConfig`. If API failures exceed 3 in 60 seconds, `circuit_open` flips to `true`. All generation calls serve fallback content while the circuit is open. The circuit auto-resets after 5 minutes (via scheduled table).

**REQ-045** — Prompt injection prevention
All player-controlled strings (character names, guild names) are sanitized before inclusion in prompts: alphanumeric + space only, max 30 chars, XML-tag wrapped, with instruction in system prompt not to follow them.

**REQ-046** — Prompt caching
The shared tone/lore section of all LLM prompts must use Anthropic's prompt caching (`cache_control: { type: "ephemeral" }`). This section must be ≥1024 tokens to qualify for caching. Reduces latency and cost for concurrent requests.

**REQ-047** — Model tiering
NPC ambient dialogue uses `claude-haiku-4-5-20251001`. Quest descriptions and world event consequences use `claude-sonnet-4-5-20250929`. Model selection is determined by content type at procedure call time.

### v2 — Future

**REQ-048** *(v2)* — Context deduplication (check hash before generating)
**REQ-049** *(v2)* — Server-scheduled generation (replace client-triggered procedure)
**REQ-050** *(v2)* — Per-player generation rate limiting
**REQ-051** *(v2)* — Anthropic Batch API for off-peak content pre-generation

---

## Category 6: Quests

### v1 — In Scope

**REQ-060** — Quest table
A `Quest` table stores: id (autoInc), factionId, requiredStanding (i64), rewardXp (u32), rewardGold (u32), rewardStanding (i64), questType (string), zoneId (string).

**REQ-061** — Generated quest text table
A `GeneratedQuestText` table stores: questId (FK), title, bodyText, npcIntro, status, contextHash. LLM generates bodyText and npcIntro. Title is pre-filled from quest template.

**REQ-062** — Player quest tracking
A `PlayerQuest` table stores: characterId, questId, status (`available` | `active` | `complete`), startedAt, completedAt (optional).

**REQ-063** — Renown-gated quest availability
Quests are available only when the player's faction standing ≥ `quest.requiredStanding`. A view `available_quests` joins Quest + FactionStanding, filtered by `ctx.sender`'s standings. Locked quests are visible with standing requirement shown.

**REQ-064** — Quest accept reducer
`accept_quest` reducer: validates quest is available for character, creates PlayerQuest row with status `active`, writes GeneratedQuestText row with status `pending` (triggers LLM generation).

**REQ-065** — Quest completion reducer
`complete_quest` reducer: validates quest objectives are met, updates PlayerQuest to `complete`, grants rewards (XP, gold, faction standing), appends private event log entry.

**REQ-066** — Quest UI panel
Client must display: available quests (with faction + standing requirement), active quests (with objectives and generated description), and completed quests (history). Quest text shows loading state while pending, then generated text.

### v2 — Future

**REQ-067** *(v2)* — Multi-objective quests (kill + retrieve + travel in one quest)
**REQ-068** *(v2)* — Group quests (require full party to complete)
**REQ-069** *(v2)* — Quest chains (completing quest A unlocks quest B)
**REQ-070** *(v2)* — Daily quest rotation per faction

---

## Category 7: Narrative Tone

### v1 — In Scope

**REQ-080** — Shadeslinger system prompt template
A `SHADESLINGER_SYSTEM_PROMPT` constant in `spacetimedb/src/data/llm_prompts.ts` defines the shared tone instructions and 3-5 concrete examples. This is the cacheable section used in all LLM calls.

**REQ-081** — Per-content-type prompt templates
Separate prompt builder functions for each content type: `buildQuestPrompt(context)`, `buildEventPrompt(context)`, `buildNpcDialoguePrompt(context)`. Each extends the base Shadeslinger prompt with content-specific instructions.

**REQ-082** — Structured JSON output
All LLM generation must request JSON output matching a defined schema per content type. The procedure validates JSON before writing to the database. Malformed JSON triggers fallback.

**REQ-083** — Fallback content in Shadeslinger tone
Pre-written fallback content in `llm_fallbacks.ts` must match the Shadeslinger tone. They must not read as generic game copy. At least 3 fallback variants per content type.

**REQ-084** — Loading state flavor text
Client loading states (while LLM is generating) must use on-tone placeholder text, not generic "Loading..." messages. These are defined as constants in the Vue client.

### v2 — Future

**REQ-085** *(v2)* — LLM-rewritten existing event log messages for tone consistency
**REQ-086** *(v2)* — Tone audit tool (script to flag off-tone hardcoded strings)
**REQ-087** *(v2)* — Player-visible narrator "voice level" setting (more/less sarcastic)

---

## Category 8: Content Data

### v1 — In Scope

**REQ-090** — Expanded gear sets
Define ≥3 complete gear sets (head, chest, legs, hands, feet, weapon) in item template data. At least one per difficulty tier (early-game, mid-game, endgame). Include stats and rarity.

**REQ-091** — Expanded resource catalog
Define ≥10 distinct resources used in crafting recipes. Resources have: id, name, description, rarity tier, harvest location. Include resources needed for food crafting (Hunger system).

**REQ-092** — NPC catalog expansion
Define ≥5 named NPCs with role (quest giver, vendor, trainer), faction affiliation, location, and a brief personality description used to guide LLM NPC dialogue generation.

**REQ-093** — Enemy variety expansion
Define ≥8 distinct enemy types beyond any existing enemies. Include at least 2 per world zone. Each enemy has: stats, abilities list, loot table, and faction association.

**REQ-094** — Crafting recipes for food
Define crafting recipes for food items (Tiers 2-4). Each recipe specifies: input resources (from REQ-091), output food item (from Hunger system, REQ-012), and optionally a required crafting station.

### v2 — Future

**REQ-095** *(v2)* — LLM-assisted bulk content generation (Batch API during off-peak)
**REQ-096** *(v2)* — Player-craftable gear (crafting recipes for equipment)
**REQ-097** *(v2)* — Named boss enemies with unique abilities and world event tie-ins

---

## Summary Table

| Category | v1 REQs | v2 REQs |
|----------|---------|---------|
| Races | REQ-001 to 005 | REQ-006 to 008 |
| Hunger | REQ-010 to 015 | REQ-016 to 018 |
| Renown / Faction | REQ-020 to 026 | REQ-027 to 029 |
| World Events | REQ-030 to 035 | REQ-036 to 039 |
| LLM Integration | REQ-040 to 047 | REQ-048 to 051 |
| Quests | REQ-060 to 066 | REQ-067 to 070 |
| Narrative Tone | REQ-080 to 084 | REQ-085 to 087 |
| Content Data | REQ-090 to 094 | REQ-095 to 097 |
| **Totals** | **40 v1** | **21 v2** |
