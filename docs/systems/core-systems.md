# Core Systems Specification

This document dives into the gameplay pillars that Unwritten Realms must deliver at launch. Each section lists responsibilities, primary data tables (SpaceTimeDB), action schemas emitted by the AI, validation rules, and UX hooks inside the Vue client.

## 1. World System
- **Purpose**: Represent macro-level state (era, weather cycles, planar rifts, global buffs/debuffs).
- **Data**: `world_settings`, `world_events`, `global_modifiers`, `timeline_markers`.
- **AI Actions**: `world.event`, `world.modifier.apply/remove`, `world.timeline.advance`.
- **Validation**:
  - Events must reference an approved lore tag and impact scope (global/region/zone).
  - Only one era-transition event can be active; queue others.
  - Modifiers require start/end timestamps; durations auto-clamped (<72 in-game hours without GM approval).
- **UX**: World ticker at top of UI, event log filter, tooltip describing global effects on combat/crafting.

## 2. Regions
- **Purpose**: Macro biomes players unlock via renown or quests; house narrative arcs.
- **Data**: `regions(id, world_id, biome, tier, renown_requirement, fast_travel_nodes)`.
- **AI Actions**: `region.create/update`, `region.unlock`, `region.evacuate`.
- **Validation**:
  - `tier` limited 1-10; renown requirements escalate per tier.
  - Must link to at least one faction and two lore anchors.
  - Creation cost charged to "world prep" budget per season (prevents infinite expansion).
- **UX**: Map view with fog-of-war, hover showing required renown, unlock CTA.

## 3. Zones
- **Purpose**: Moment-to-moment play spaces containing encounters, resources, NPC clusters.
- **Data**: `zones(id, region_id, encounter_budget, spawn_table, weather_seed, instance_policy)`.
- **AI Actions**: `zone.spawn_event`, `zone.collapse`, `zone.instance.create`.
- **Validation**:
  - `encounter_budget` cannot exceed region cap; aggregator enforces sum <= region limit.
  - Spawn events require encounter templates; ad-hoc creations flagged for moderation.
  - Collapse requires evacuation messaging and grace timer.
- **UX**: Zone log with hazards, population meter, travel/resume buttons.

## 4. Characters
- **Purpose**: Player avatars with stats, abilities, gear, renown ledger, quest states.
- **Data**: `characters`, `character_progression`, `gear_slots`, `skill_books`, `renown_summary`.
- **AI Actions**: `character.create`, `character.level`, `character.gain_xp`, `character.learn_skill`, `character.receive_item`.
- **Validation**:
  - Attribute/skill gains bound by class archetype budgets.
  - Level-ups require cumulative XP and story beats.
  - Items routed through loot tables; direct legendary grants require GM approval flag.
- **UX**: Character sheet with tabs (Stats, Gear, Skills, Reputation). Inline toasts for XP, level, loot.

## 5. NPCs
- **Purpose**: Faction agents, merchants, quest givers, enemies.
- **Data**: `npcs`, `npc_behaviors`, `npc_spawn_points`, `npc_affiliations`.
- **AI Actions**: `npc.create`, `npc.dialogue.extend`, `npc.assign_quest`, `npc.move`.
- **Validation**:
  - Each NPC needs alignment + motivation tags; missing ones rejected.
  - Spawn density per zone limited; overflow queued.
  - Dialogue expansions run through toxicity filter and lore checker.
- **UX**: Zone overlay showing NPC list, detail drawer with dialogue history and faction ties.

## 6. Renown & Factions
- **Purpose**: Track player relationship with factions/organizations, gating content.
- **Data**: `factions`, `renown_ledger`, `faction_rewards`, `faction_conflicts`.
- **AI Actions**: `renown.adjust`, `faction.create`, `faction.issue_decree`.
- **Validation**:
  - Renown adjustments limited to ±250 per action; daily cap per faction.
  - New faction creation requires lore anchor + charter + two NPC sponsors.
  - Conflicting decrees resolved via council rule (majority of existing faction officers).
- **UX**: Renown wheel widget, notifications for threshold crosses, faction feed with decrees.

## 7. AI Command Interface
- **Purpose**: Translate conversational responses into deterministic world mutations.
- **Components**:
  - **Prompt Builder**: merges player text, context windows, lore knowledge graph, system instructions.
  - **Action Schema Registry**: JSON schema definitions with rate limits and budget metadata.
  - **Validator**: cross-checks payloads, resolves entity IDs, ensures canonical tags.
  - **Executor**: batch applies actions to SpaceTimeDB via stored procedures with rollback on failure.
- **Failure Handling**:
  - Hard fail → error surfaced to player with fallback suggestion.
  - Soft fail (e.g., exceeding caps) → auto-adjust action or request clarification.
  - Suspicious content → flag + queue for moderator before applying.
- **Observability**: Trace per command, metrics (actions/min, failure rate, avg validation time).

## Shared considerations
- **Localization & tone**: Strings sourced from lore glossary; AI instructed to maintain Shadeslinger vernacular.
- **Testing**: Scenario harness that replays scripted conversations and asserts resulting DB state.
- **Performance**: All action batches target <50 ms validation; heavy operations (world rewrites) scheduled asynchronously with progress events.
