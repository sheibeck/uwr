# Roadmap

**Milestone:** RPG Milestone — Progression Systems & LLM Content Engine
**Created:** 2026-02-11
**Status:** All planned phases complete. Quick tasks active for balance/polish.

---

## Phase Overview

| Phase | Name | Requirements | Dependencies | Status |
|-------|------|-------------|--------------|--------|
| 1 | Races | REQ-001–005 | None | Complete (2026-02-11) |
| 2 | Hunger | REQ-010–015 | Phase 1 (race stat integration) | Removed (quick-76) |
| 3 | Renown Foundation | REQ-020–026 | None | Complete (2026-02-12) |
| 3.1 | Combat Balance | None | Phase 3 | Complete (2026-02-12) |
| 3.1.1 | Combat Balance Part 2 | None | Phase 3.1 | Complete (2026-02-12) |
| 3.1.2 | Combat Balance for Enemies | None | Phase 3.1.1 | Complete (2026-02-13) |
| 3.1.3 | Enemy AI and Aggro Management | None | Phase 3.1.2 | Complete (2026-02-13) |
| 4 | Config Table Architecture | None | Phase 3 (combat balance complete) | Complete (2026-02-13) |
| 5 | LLM Architecture | REQ-040–047, REQ-080–084 | Phase 3 (first consumer) | Planned |
| 6 | Quest System | REQ-060–066 | Phase 3 (renown gating) | Complete (2026-02-17) |
| 7 | World Events | REQ-030–035 | Phase 1 (race unlock), Phase 5 (LLM text) | Pending (core system built in Phase 18; LLM text pending) |
| 8 | Narrative Tone Rollout | REQ-080–084 (applied) | Phase 5 (LLM pipeline running) | Pending |
| 9 | Content Data Expansion | REQ-090–094 | Phases 1–3 (systems to populate) | Pending (most targets exceeded via quick tasks) |
| 10 | Travel & Movement Costs | None | Phase 4 | Complete (2026-02-13) |
| 11 | Death & Corpse System | None | Phase 10 | Complete (2026-02-17) |
| 12 | Overall Renown System | None | Phase 11 | Complete (2026-02-14) |
| 13 | Crafting System - Weapons & Armor | None | Phase 12 | Complete (2026-02-18) |
| 13.1 | Dual-Axis Gear System | None | Phase 13 | Complete (2026-02-18) |
| 14 | Loot & Gear Progression | None | Phase 13 | Complete (2026-02-17) |
| 15 | Named NPCs | None | Phase 14 | Complete (2026-02-17) |
| 16 | Travelling NPCs | None | Phase 15 | Pending |
| 17 | World Bosses | None | Phase 16 | Pending |
| 18 | World Events System Expansion | None | Phase 17 | Complete (2026-02-18) |
| 19 | NPC Interactions | None | Phase 18 | Complete (2026-02-17) |
| 20 | Perk Variety Expansion | None | Phase 19 | Complete (2026-02-18) |
| 21 | 3/4 | In Progress|  | Pending |
| 22 | Class Ability Balancing & Progression | ABILITY-01–06 | Phase 21 | In Progress (Plan 01/N complete) |

---

### Phase 1: Races

**Goal:** Players can select a race at character creation. Race restricts available classes and grants stat bonuses.

**Requirements:** REQ-001, REQ-002, REQ-003, REQ-004, REQ-005

**Plans:** 2 plans

Plans:
- [x] 01-01-PLAN.md — Backend: Race table, RACE_DATA seeding, create_character reducer with raceId validation and racial stat bonuses, publish and regenerate bindings
- [x] 01-02-PLAN.md — Frontend: Race picker dropdown in CharacterPanel, class filtering by race, updated reducer call with raceId, human verification

**Scope:**
- `Race` table in `spacetimedb/src/index.ts` with `unlocked: bool` field
- `RACE_DATA` constant in `spacetimedb/src/data/races.ts` (bonuses + class restrictions)
- `create_character` reducer updated to accept `raceId`, validate race-class combo, apply racial stat modifiers
- `spacetimedb/src/data/class_stats.ts` updated with additive racial bonus support
- Race picker UI in character creation (`CharacterPanel.vue` or new `RacePickerPanel.vue`)
- Client filters available classes based on selected race

**Starter races (4 unlocked at launch):**
- Human (all common classes)
- Eldrin (magic-focused classes)
- Ironclad (physical/crafting classes)
- Wyldfang (agile/nature classes)

**Success Criteria:**
- [x] Race table seeded with 4 unlocked races
- [x] Character creation shows race picker with stats/restrictions
- [x] Selecting a race updates the class dropdown to valid classes only
- [x] Creating a character with a race stores `raceId` on the Character row
- [x] Racial stat bonuses appear in character stats view
- [x] Attempting to create an invalid race-class combo is rejected by the backend

---

### Phase 2: Hunger

**Goal:** Characters have a hunger track. Eating food grants Well Fed buff that improves combat performance. No penalties for low hunger.

**NOTE:** Hunger system removed in quick-76. Food buff system preserved as CharacterEffect rows. See Key Decisions #98-99 in STATE.md.

**Requirements:** REQ-010, REQ-011, REQ-012, REQ-013, REQ-014, REQ-015

**Plans:** 2 plans

Plans:
- [x] 02-01-PLAN.md — Backend: Hunger table, HungerDecayTick, ItemTemplate extension, food seeding, eat_food/decay_hunger reducers, Well Fed combat integration, my_hunger view, publish and regenerate bindings
- [x] 02-02-PLAN.md — Frontend: HungerBar component, myHunger subscription, Eat button on food items, App.vue wiring, human verification

**Scope:**
- `Hunger` table: `{ characterId, currentHunger, wellFedUntil }`
- `HungerDecay` scheduled table (fires every 5 minutes)
- `eat_food` reducer: consume food item from inventory → set `wellFedUntil`
- Combat reducer in `spacetimedb/src/reducers/combat.ts` checks Well Fed state → applies multipliers
- 4 food item templates seeded (one per tier)
- Hunger bar UI component (shows hunger level + Well Fed status + time remaining)

**Success Criteria (Phase removed — success criteria N/A):**
- [ ] `Hunger` row created for all new characters at creation
- [ ] Hunger decrements every 5 minutes (verify via scheduled table)
- [ ] Eating food sets Well Fed buff with correct duration per tier
- [ ] Well Fed stat bonuses apply in combat (verify damage calculations)
- [ ] UI shows hunger bar and Well Fed status
- [ ] Hunger reaching 0 causes no penalty (verified by test scenario)

---

### Phase 3: Renown Foundation

**Goal:** Each character tracks standing with each faction. Actions grant or reduce standing. Rank tiers are computed and displayed.

**Requirements:** REQ-020, REQ-021, REQ-022, REQ-023, REQ-024, REQ-025, REQ-026

**Plans:** 2 plans

Plans:
- [x] 03-01-PLAN.md — Backend: Faction + FactionStanding tables, faction seeding, EnemyTemplate factionId, standing mutation helpers, combat hook, my_faction_standings view, publish and regenerate bindings
- [x] 03-02-PLAN.md — Frontend: RenownPanel component with FACTION_RANKS, ActionBar wiring, App.vue panel routing, useGameData subscriptions, human verification

**Scope:**
- `Faction` table seeded with 4 factions (Iron Compact, Verdant Circle, Ashen Order, Free Blades)
- `FactionStanding` table: `{ characterId, factionId, standing: i64 }` (composite PK)
- `FACTION_RANKS` constant: standing ranges → rank name + unlock list
- Standing mutation reducers: `grant_faction_standing` (internal helper), called from combat, quest completion
- Rival faction penalty applied when standing changes
- View `my_faction_standings` for client
- Renown panel UI: shows all factions, standing bar, current rank, next rank requirements
- Character creation initializes FactionStanding rows (all factions at 0)

**Success Criteria:**
- [x] 4 factions seeded in Faction table
- [x] Character creation creates FactionStanding rows for all factions at 0
- [x] Combat kill of faction-associated enemy grants correct standing
- [x] Rival faction standing decreases when primary faction standing increases
- [x] `my_faction_standings` view returns correct data for authenticated player
- [x] Renown panel shows accurate standing and rank per faction
- [x] Standing never decays (verify after time passes with no activity)

---

### Phase 3.1: Combat Balance (INSERTED)

**Goal:** Balance combat between melee and caster classes. Address damage scaling, stat contribution, and class viability.
**Depends on:** Phase 3
**Status:** Complete (2026-02-12)
**Plans:** 5 plans (3 planned + 2 gap closure)

Plans:
- [x] 3.1-01-PLAN.md — Backend foundation: combat_scaling.ts helpers, ABILITY_STAT_SCALING mapping, damageType tags, ItemTemplate schema extensions (weaponType, magicResistanceBonus), armor curve tuning
- [x] 3.1-02-PLAN.md — Combat integration: STR auto-attack scaling, DEX crit strikes, ability stat scaling (hybrid formula), WIS healing power, magic/physical damage routing, publish and regenerate bindings
- [x] 3.1-03-PLAN.md — Human verification: test combat balance across warrior, rogue, wizard, cleric classes
- [x] 3.1-04-PLAN.md — Gap closure: Fix ability damage double-dipping (remove weaponComponent for power-based abilities)
- [x] 3.1-05-PLAN.md — Gap closure: Tune scaling constants (stat scaling 2n→1n, power multiplier 10n→5n)

**Success Criteria:**
- [x] STR increases auto-attack damage (~1.5% per point, multiplicative)
- [x] DEX provides crit chance (0.1% per point, 50% cap) with weapon-type multipliers (fast 1.5x, medium 2.0x, slow 2.5x)
- [x] Ability damage uses hybrid formula: (base + stat_scaling) * ability_multiplier
- [x] WIS scales healing for healing classes (2% per point)
- [x] Magic damage bypasses armor, physical uses tuned armor curve (K=1)
- [x] Stats contribute ~30-40% of ability damage (gear remains dominant)
- [x] Level 1 abilities deal 2-3x auto-attack damage (balanced, not overwhelming)
- [x] Critical strikes appear in combat log with appropriate messages

---

### Phase 03.1.1: Combat Balance Part 2 (INSERTED)

**Goal:** Balance DoT (damage over time), HoT (heal over time), and debuff/buff effects within the stat scaling system established in Phase 3.1. Extends the combat balance foundation to cover periodic effects, utility abilities, and multi-target scenarios.
**Depends on:** Phase 3.1
**Status:** Complete (2026-02-12)
**Plans:** 3 plans

Plans:
- [x] 03.1.1-01-PLAN.md — Ability catalog extension & constants: Add DoT/HoT/debuff/AoE metadata fields to ability_catalog.ts, add DOT_SCALING_RATE_MODIFIER/AOE_DAMAGE_MULTIPLIER/DEBUFF_POWER_COST_PERCENT to combat_scaling.ts, annotate abilities with metadata
- [x] 03.1.1-02-PLAN.md — Power budget split implementation: Modify executeAbilityAction in index.ts to split power between direct and periodic effects, apply reduced stat scaling to DoT/HoT, enumerate AoE targets with per-target damage reduction, human verification
- [x] 03.1.1-03-PLAN.md — Comprehensive verification: Test all DoT/HoT/debuff/AoE scenarios, verify power budget splits, verify effect stacking and refresh, human acceptance testing

**Success Criteria:**
- [x] Shadow Cut (power=4, STR-based) deals 14 direct damage, creates DoT for 14 total damage over 2 ticks (50/50 split, user verified)
- [x] DoT damage scales with same stat as direct damage (STR for Shadow Cut, confirmed via testing)
- [x] DoT uses reduced scaling rate (50% of direct damage stat scaling via DOT_SCALING_RATE_MODIFIER)
- [x] Recasting Shadow Cut on same target refreshes DoT duration, doesn't stack damage (user verified against Ash Jackal Alpha)
- [x] Two different DoT abilities stack (different sourceAbility values create separate effect rows)
- [x] Spirit Mender heals 3 direct, creates HoT for 6 total over 2 ticks (WIS 12, user verified)
- [x] HoT healing scales with WIS using reduced scaling rate (confirmed via calculateHealingPower)
- [x] Abilities with debuffs deal reduced damage proportional to debuff power cost (DEBUFF_POWER_COST_PERCENT = 25n)
- [x] AoE abilities deal 65% damage per target (AOE_DAMAGE_MULTIPLIER applied in AoE enumeration loop)
- [x] AoE abilities hit all enemies in combat with no target cap (combatEnemy.by_combat.filter enumerates all)
- [x] Debuffs have fixed magnitude and duration from ability metadata (not stat-scaled)
- [x] DoTs and HoTs tick every 3 seconds via tick_hot scheduled reducer (existing infrastructure)

---

### Phase 03.1.2: Combat Balance for Enemies (INSERTED)

**Goal:** Extend combat balance system to enemy abilities with level-based power scaling, DoT/debuff/healing/AoE mechanics using power budget splits. Enemies gain tactical variety (healers, AoE, buffers) and consistent damage scaling.
**Depends on:** Phase 03.1.1
**Status:** Complete (2026-02-13)
**Plans:** 3 plans

Plans:
- [x] 03.1.2-01-PLAN.md — Enemy metadata and constants: Add ENEMY_BASE_POWER/ENEMY_LEVEL_POWER_SCALING constants, extend all ENEMY_ABILITIES with power/damageType/budget split metadata, add new heal/AoE/buff abilities
- [x] 03.1.2-02-PLAN.md — Enemy ability implementation: Rewrite executeEnemyAbility with level-based power scaling, power budget splits, damage type routing, heal/AoE/buff handlers, seed new enemy abilities, publish module
- [x] 03.1.2-03-PLAN.md — Human verification: Test all enemy ability types (DoT scaling, debuff budget, healing, AoE, buffs, damage type routing)

**Success Criteria:**
- [x] Enemy abilities scale with enemy level (not fixed magnitude values)
- [x] Enemy DoT abilities split power between direct damage and periodic ticks
- [x] Enemy debuff abilities deal reduced direct damage (25% power cost for debuff)
- [x] Enemy healer types heal lowest-HP ally with direct heal + HoT
- [x] Enemy AoE types hit all players at 65% damage per target (direct damage only, no DoTs)
- [x] Enemy buffer types apply buff effects to all living enemy allies
- [x] Physical enemy abilities mitigated by armor; magic abilities bypass armor
- [x] User verifies all 6 combat scenarios work correctly

---

### Phase 03.1.3: Enemy AI and aggro management (INSERTED)

**Goal:** Role-based threat multipliers for tank/healer/DPS trinity, combat-state-aware enemy AI scoring (healers heal dying allies, buffers buff early), dead-character aggro cleanup, and leashing mechanics to prevent kiting exploits.
**Depends on:** Phase 03.1.2
**Status:** Complete (2026-02-13)
**Plans:** 2 plans

Plans:
- [x] 03.1.3-01-PLAN.md — Threat multipliers: TANK_CLASSES/HEALER_CLASSES role sets, threat constants (tank 1.5x, healer 0.5x), healing threat generation (50% split across enemies), dead character aggro cleanup
- [x] 03.1.3-02-PLAN.md — AI scoring and leashing: Combat-state-aware AI bonuses (heal priority <30% HP, buff early, debuff tank), leash mechanics (enemies evade and reset when all players leave)

### Phase 4: Config Table Architecture

**Goal:** Consolidate ability and armor configuration into database tables, eliminating hardcoded constants and data fragmentation. Single source of truth for game balance data.

**Dependencies:** Phase 3 (combat balance complete)

**Status:** Complete (2026-02-13)

**Plans:** 2 plans

Plans:
- [x] 04-01-PLAN.md — Extend AbilityTemplate table with metadata columns and enhance seeding to populate from ABILITIES + ABILITY_STAT_SCALING
- [x] 04-02-PLAN.md — Migrate consumers to database lookups, remove legacy constants, regenerate bindings, publish

**Scope:**
- Create `AbilityConfig` table with all ability metadata (name, description, power, cooldown, stat scaling, DoT/HoT/debuff parameters)
- Migrate `ABILITIES` constant → `AbilityConfig` table via seeding
- Eliminate `legacyDescriptions` hardcoded fallback (80+ descriptions)
- Eliminate `ABILITY_STAT_SCALING` duplication - merge into `AbilityConfig`
- Update `executeAbility` to read from database instead of ABILITIES constant
- Optional: Create `ArmorProficiency` config table for CLASS_ARMOR data
- Regenerate client bindings to expose ability data to UI

**Benefits:**
- Single source of truth for all ability data
- Eliminates technical debt from fragmented configuration
- Makes ability data client-readable from database
- Prepares for future admin UI and dynamic tuning
- Enables level-dependent ability power in future

**Success Criteria:**
- [x] AbilityTemplate table extended with all ability metadata (power, damageType, statScaling, DoT/HoT/debuff/AoE fields)
- [x] legacyDescriptions removed from index.ts
- [x] ABILITY_STAT_SCALING kept for seeding only (not execution)
- [x] All abilities work correctly reading from database
- [x] Client can read ability power/cooldown/description from table
- [x] No hardcoded ability constants remain in execution paths

---

### Phase 5: LLM Architecture

**Goal:** Working LLM content pipeline: procedure calls OpenAI Responses API, writes to content tables, handles failures gracefully with Shadeslinger-tone fallbacks. Client-side components render pending/ready/fallback states with on-tone loading flavor text.

**Requirements:** REQ-040, REQ-041, REQ-042, REQ-043, REQ-044, REQ-045, REQ-046, REQ-047, REQ-080, REQ-081, REQ-082, REQ-083, REQ-084

**Plans:** 3 plans

Plans:
- [ ] 05-01-PLAN.md — Backend data layer: LlmConfig (private), GeneratedQuestText, GeneratedEventText, GeneratedNpcContent, LlmCircuit tables + llm_prompts.ts (SHADESLINGER_SYSTEM_PROMPT, prompt builders, JSON schemas) + llm_fallbacks.ts (FALLBACK_CONTENT)
- [ ] 05-02-PLAN.md — Backend behavior: generate_content procedure (OpenAI Responses API, circuit breaker, fallback writing) + set_llm_config/reset_llm_circuit reducers + local publish + bindings regeneration
- [ ] 05-03-PLAN.md — Client integration: useLlmContent composable (triggerGeneration procedure call), GeneratedTextBlock.vue (pending/ready/fallback rendering with flavor text), useGameData subscriptions + human verification

**Scope:**
- `LlmConfig` table (private): api_key, default_model (gpt-5-mini), circuit state
- `setLlmConfig` admin-only reducer
- `GeneratedQuestText`, `GeneratedEventText`, `GeneratedNpcContent` tables (public, status-gated)
- `generate_content` procedure: reads config, calls OpenAI Responses API, writes result or fallback
- `SHADESLINGER_SYSTEM_PROMPT` constant with tone instructions + 5 examples
- Per-content-type prompt builder functions (buildQuestPrompt, buildEventPrompt, buildNpcDialoguePrompt)
- `FALLBACK_CONTENT` constant with 3+ fallbacks per content type (in Shadeslinger tone)
- `LlmCircuit` scheduled table for circuit auto-reset (5-minute reset after 3 failures in 60s)
- Client loading state components with on-tone placeholder text
- `spacetimedb/src/procedures/` directory created

**Integration test:** Admin sets API key → client calls generate_content procedure → quest text row flips from pending to ready.

**Success Criteria:**
- [ ] Admin can set API key via `setLlmConfig` reducer
- [ ] `generate_content` procedure successfully calls OpenAI Responses API and writes text
- [ ] Failing API call (bad key, timeout) writes fallback text — never leaves status as `pending`
- [ ] Circuit breaker opens after 3 failures in 60 seconds, all calls serve fallback
- [ ] Circuit breaker auto-resets after 5 minutes via LlmCircuit scheduled table
- [ ] Prompt caching: automatic on OpenAI at 1024+ tokens (optimization only, not a requirement)
- [ ] Generated output is valid JSON matching the expected schema per content type
- [ ] Prompt injection test: player name with injection attempt → sanitized before prompt (alphanumeric + space, max 30 chars)

---

### Phase 6: Quest Type Expansion + Passive Search System

**Goal:** Extend the existing quest system with four new quest types (kill_loot, explore, delivery, boss_kill) and introduce a passive Search mechanic that triggers on location entry, revealing hidden resources, quest items, and named enemies. Seed 14 new quests across all 3 regions woven into existing NPC dialogue chains via affinity-gated branches.

**Requirements:** REQ-060, REQ-061, REQ-062, REQ-063, REQ-064, REQ-065, REQ-066

**Dependencies:** Phase 3 (FactionStanding), existing QuestTemplate/QuestInstance system (quick-106)

**Plans:** 3 plans

Plans:
- [x] 06-01-PLAN.md — Schema extension (QuestTemplate new fields, QuestItem/NamedEnemy/SearchResult tables) + quest type reducers (loot_quest_item, pull_named_enemy, delivery in hailNpc, kill_loot drops in combat)
- [x] 06-02-PLAN.md — Passive search system (performPassiveSearch helper, travel integration) + quest data seeding (14 quests + 14 dialogue branches across 7 NPCs)
- [x] 06-03-PLAN.md — Publish module, regenerate bindings, client integration (search results + quest items + named enemies in LocationGrid), human verification

**Scope:**

**Backend — Quest Type Expansion:**
- Add `questType` field to `QuestTemplate`: `'kill' | 'kill_loot' | 'explore' | 'delivery' | 'boss_kill'`
- Add optional fields: `targetLocationId`, `targetNpcId`, `targetItemName`, `itemDropChance`
- `QuestItem` table: per-character lootable nodes spawned at target locations (public, client-filtered)
- `NamedEnemy` table: instanced per-character world spawns with HP, respawn timer, spawnChance
- `kill_loot` reducer: on enemy kill, roll drop chance, create QuestItem in character's inventory
- `explore` reducer: looting a QuestItem node (cast timer, aggro chance from location enemy pool)
- `delivery` reducer: hailing target NPC auto-completes delivery, unlocks follow-up dialogue branches
- `boss_kill` progress: hooks into existing combat kill tracking for NamedEnemy kills

**Backend — Passive Search System:**
- `SearchResult` table: per-character, per-location, stores what was revealed this visit (public, client-filtered)
- Search triggers on every location entry (in travel reducer)
- Independent probability rolls per category:
  - Hidden/rare resources: 65% chance
  - Quest items (active explore quest at this location): 40% chance
  - Named enemy (instanced): 20% chance
- Deterministic pseudo-random using hash of (characterId XOR timestamp)
- Results cleared when character leaves location
- Future-ready: search skill level and perks will apply multipliers

**New Quests Seeded (14 quests across existing NPCs via affinity-gated dialogue):**
| NPC | Quest | Type | Affinity Gate |
|-----|-------|------|---------------|
| Marla the Guide | Old Debts | delivery | Acquaintance |
| Warden Kael | Stolen Supply Cache | kill_loot | Acquaintance |
| Warden Kael | The Ranger's Cache | explore | Friend |
| Herbalist Venna | Bogfen Healing Moss | explore | Acquaintance |
| Herbalist Venna | Croaker Bile Glands | kill_loot | Friend |
| Scout Thessa | Enemy Scouting Reports | explore | (unlocks via Marla delivery) |
| Scout Thessa | The Iron Compact Leak | delivery | Friend |
| Ashwalker Ren | Encryption Key | kill_loot | Acquaintance |
| Ashwalker Ren | The Ashforged Commander | boss_kill | Friend |
| Torchbearer Isa | The Revenant Lord | boss_kill | Acquaintance |
| Torchbearer Isa | The Binding Seal | explore | Friend |
| Keeper Mordane | The Keeper's Ledger | explore | (unlocks via Thessa delivery) |
| Keeper Mordane | The Vault Warden | boss_kill | Friend |

**Narrative chains:**
- Marla -> (delivery) -> Scout Thessa -> (delivery) -> Keeper Mordane (ties all 3 regions)
- Each NPC's deeper quests unlock via affinity, creating long-term relationship investment

**Success Criteria:**
- [x] Search triggers on location entry and reveals hidden resources, quest items, named enemies per probability
- [x] kill_loot quests complete when item drops from target enemy (per-character roll)
- [x] explore quests complete when character loots the quest node (cast timer, possible aggro)
- [x] delivery quests auto-complete when character hails the target NPC
- [x] boss_kill quests complete when character kills the instanced named enemy
- [x] Named enemies are instanced per-character with respawn timers
- [x] New quests are accessible via affinity-gated NPC dialogue branches
- [x] Delivery chain Marla -> Thessa -> Mordane links all 3 regions narratively

---

### Phase 7: World Events

**Goal:** Server-wide events fire (admin-triggered or threshold-triggered), generate LLM consequence text, appear in the world event log, and can unlock races.

**NOTE:** Core world events system (admin-fired events, event spawns, contribution tiers, rewards, dual success/failure consequences, WorldEventPanel UI) was implemented in Phase 18 WITHOUT LLM. Remaining scope for Phase 7 is: LLM-generated event text via Phase 5 pipeline, threshold-triggered auto-firing, and race_unlock consequence. The fire_world_event reducer exists and admin event panel is functional.

**Requirements:** REQ-030, REQ-031, REQ-032, REQ-033, REQ-034, REQ-035

**Dependencies:** Phase 1 (race unlock target), Phase 5 (LLM text)

**Scope (remaining):**
- `GeneratedEventText` used from Phase 5 pipeline (LLM text for event consequences)
- Threshold check in combat/quest reducers: when stat crosses threshold → fire world event automatically
- World event consequence: type `race_unlock` sets `Race.unlocked = true`

**Done (Phase 18):**
- `WorldEvent` table with event type, status, firedAt, consequenceType fields
- `WorldStatTracker` for server-wide counters
- `fire_world_event` reducer (admin-only, guarded by admin identity)
- `resolve_world_event` reducer (admin-only, applies consequences)
- Bronze/Silver/Gold contribution tiers with fixed tiered rewards
- WorldEventPanel with Active + History tabs
- Banner overlay notifications for event start/end

**Success Criteria:**
- [ ] Admin can fire a world event via reducer (done — fire_world_event exists)
- [ ] World event fires automatically when server threshold is crossed (pending)
- [ ] WorldEvent row appears in world events table (done — Phase 18)
- [ ] LLM-generated consequence text appears in world event log for all players (pending — requires Phase 5)
- [ ] `race_unlock` world event sets `Race.unlocked = true` for the target race (pending)
- [ ] Players can create Hollowed characters after the Hollowed Emerge event fires (pending)

---

### Phase 8: Narrative Tone Rollout

**Goal:** LLM-generated Shadeslinger tone applied consistently across all generated content. All existing hardcoded strings reviewed for tone consistency.

**Requirements:** REQ-080, REQ-081, REQ-082, REQ-083, REQ-084

**Dependencies:** Phase 5 (LLM pipeline), Phases 6-7 (content consumers)

**Scope:**
- Finalize `SHADESLINGER_SYSTEM_PROMPT` with tested examples
- Verify all 3+ fallback content sets match the tone
- Client loading states use on-tone placeholder text throughout (quest panel, event log, NPC dialogue)
- Review and update hardcoded event log strings in existing reducers for tone
- Manual QA pass: read generated outputs, tune prompt if off-tone

**Success Criteria:**
- [ ] 5 different quest text generations reviewed — all in Shadeslinger tone
- [ ] 3 different world event consequence texts reviewed — all in Shadeslinger tone
- [ ] Loading states use on-tone placeholder text (not "Loading...")
- [ ] 10 existing hardcoded event log strings reviewed and updated if off-tone
- [ ] Fallback content set reviewed and confirmed in-tone by a human reader

---

### Phase 9: Content Data Expansion

**Goal:** Game world feels populated. Enough gear, resources, NPCs, and enemies to support meaningful progression through the new systems.

**NOTE:** Most targets have been exceeded through quick tasks and phase work:
- Enemies: 29+ enemy templates across all regions and time periods (target: 8+) — EXCEEDED
- Resources: 20+ resource/material templates in crafting_materials.ts (target: 10+) — EXCEEDED
- Named NPCs: 7+ NPCs seeded with dialogue trees (target: 5+) — EXCEEDED
- Recipes: 14 consumable recipes + 15 gear recipes = 29 total (target: 4-6 food recipes) — EXCEEDED
- Gear sets: 3 world-drop tiers + crafted gear from materials (target: 3 gear sets) — MET
- Hunger-specific food crafting: N/A — hunger removed; food buff system uses CharacterEffect

**Requirements:** REQ-090, REQ-091, REQ-092, REQ-093, REQ-094

**Dependencies:** Phases 1-3 (systems to tie content to)

**Scope:**
- 3 complete gear sets defined in item template data
- 10+ resources in resource catalog (including food ingredients)
- 5+ named NPCs with faction, location, personality notes
- 8+ enemy types (at least 2 per zone, with faction associations)
- 4-6 crafting recipes for food items (Hunger tiers 2-4) — NOTE: Hunger removed; 14 consumable recipes exist
- Vendor inventories updated to include new food items and resources

**Gear set suggestions:**
| Set | Tier | Theme | Classes |
|-----|------|-------|---------|
| Rusted Warden | Early | Scavenger soldier | Warrior, Paladin |
| Thornweave | Mid | Forest ranger | Ranger, Druid |
| Ashen Scholar | End | Scholar-mage | Mage, Priest |

**Success Criteria:**
- [ ] 3 gear sets defined with full slot coverage (head, chest, legs, hands, feet, weapon) — partially met via T1/T2/T3 world-drop tiers
- [ ] 10+ resources defined in data file, at least 5 harvestable from world locations — MET (20+ resources)
- [ ] 5 named NPCs defined with all required fields; at least 2 serve as quest givers — MET (7+ NPCs)
- [ ] 8 enemy types defined; combat system tested with new enemies — EXCEEDED (29+ templates)
- [ ] Food crafting recipes defined; end-to-end test: harvest resource → craft food → eat → get buff — MET (14 consumable recipes; Hunger system removed per quick-76)

---

## Dependency Graph

```
Phase 1 (Races) ──────────────────────────────────────────────────┐
Phase 3 (Renown) ──────────────────────────────────────────────┐  │
Phase 3.1 (Combat Balance) <- Phase 3                          │  │
Phase 3.1.1 (Combat Balance Part 2) <- Phase 3.1               │  │
Phase 3.1.2 (Combat Balance for Enemies) <- Phase 3.1.1        │  │
Phase 3.1.3 (Enemy AI & Aggro) <- Phase 3.1.2                  │  │
Phase 4 (Config Tables) <- Phase 3 ─────────────────────────┐  │  │
Phase 5 (LLM Architecture) <- Phase 3  ──────────────────┐  │  │  │
                                                          │  │  │  │
Phase 6 (Quests) <- Phase 3, Phase 5                     │  │  │  │
Phase 7 (World Events) <- Phase 5 ──────────────────(race unlock) ┘│
                                                          │       │
Phase 8 (Tone) <- Phase 5, 6, 7                          │       │
Phase 9 (Content Data) <- Phase 1, 3                     │       │
                                                          │       │
Phase 10 (Travel) <- Phase 4                             │       │
Phase 11 (Death & Corpse) <- Phase 10                    │       │
Phase 12 (Overall Renown) <- Phase 11                    │       │
Phase 13 (Crafting System) <- Phase 12                   │       │
Phase 13.1 (Dual-Axis Gear) <- Phase 13                  │       │
Phase 14 (Loot & Gear) <- Phase 13                       │       │
Phase 15 (Named NPCs) <- Phase 14                        │       │
Phase 16 (Travelling NPCs) <- Phase 15                   │       │
Phase 17 (World Bosses) <- Phase 16                      │       │
Phase 18 (World Events Expansion) <- Phase 17 ───────────┘       │
Phase 19 (NPC Interactions) <- Phase 18                          │
Phase 20 (Perk Variety Expansion) <- Phase 19                    │
Phase 21 (Race Expansion) <- Phase 20
Phase 22 (Class Ability Balancing) <- Phase 21 (races must be expanded first)
```

**Status legend:** Phases 1, 3, 3.1, 3.1.1, 3.1.2, 3.1.3, 4, 6, 10, 11, 12, 13, 13.1, 14, 15, 18, 19, 20 = Complete. Phases 5, 7, 8, 9 = Pending. Phases 16, 17, 21, 22 = Pending (not yet planned).

### Phase 10: Travel & Movement Costs

**Goal:** Region-based travel cost system where within-region travel costs 5 stamina per character and cross-region travel costs 10 stamina per character plus a 5-minute cooldown. All group members must afford travel or the group move fails. Travel UI shows cost indicators and cooldown countdowns.
**Depends on:** Phase 4
**Status:** Complete (2026-02-13)
**Plans:** 2 plans

Plans:
- [x] 10-01-PLAN.md — Backend: TRAVEL_CONFIG constants, TravelCooldown table, move_character reducer with region-based stamina costs, group-wide validation, and per-character cooldown
- [x] 10-02-PLAN.md — Frontend: Publish module, regenerate bindings, TravelPanel cost indicators, cooldown countdown display, affordability gating, human verification

### Phase 11: Death & Corpse System

**Goal:** Level-gated death consequence system where level 5+ characters who die in combat create a corpse at the death location containing their inventory items (equipped gear and gold stay on character). Characters respawn normally at their bind point with no ghost state. Cleric Resurrect ability targets corpses to teleport dead player back. Corpse Summon ability merges all corpses to caster location. Confirmation prompts for both. 30-day corpse decay timer.
**Depends on:** Phase 10
**Status:** Complete (2026-02-17)
**Plans:** 3 plans

Plans:
- [x] 11-01-PLAN.md — Backend foundation: Corpse/CorpseItem tables, createCorpse helper, death hook in combat defeat sections, respawn modification, loot_corpse_item/loot_all_corpse reducers, corpse decay cleanup, publish and regenerate bindings
- [x] 11-02-PLAN.md — Resurrection and Corpse Summon: PendingResurrect/PendingCorpseSummon tables, cleric_resurrect/cleric_corpse_summon ability definitions, initiate/accept/decline reducers with confirmation flow, publish and regenerate bindings (refactored to unified PendingSpellCast via quick-93)
- [x] 11-03-PLAN.md — Frontend UI: skipped per user decision; functionality deemed complete

### Phase 12: Overall Renown System - Character-wide renown separate from factions, renown ranks with unlockable perks, renown gain sources from events/bosses/achievements

**Goal:** Character-wide renown progression system with 15 named ranks across 5 tiers, permanent perk choices from pools at each rank (mix of passive stat bonuses and active abilities), server-first tracking with diminishing returns, combat-integrated renown awards, achievement milestones, and dedicated tabbed UI panel with rank progression, perk selection, and leaderboard.
**Depends on:** None (independent system - can run parallel with Phase 11)
**Status:** Complete (2026-02-14)
**Plans:** 3 plans

Plans:
- [x] 12-01-PLAN.md — Backend foundation: Renown/RenownPerk/RenownServerFirst/Achievement tables, 15-rank threshold curve, perk pools, awardRenown/awardServerFirst helpers, choose_perk/test reducers
- [x] 12-02-PLAN.md — Integration hooks: EnemyTemplate isBoss field, character creation Renown init, combat victory renown awards, perk stat bonuses in combat, publish module and regenerate bindings
- [x] 12-03-PLAN.md — Frontend UI: Tabbed RenownPanel (Factions/Renown/Leaderboard), perk selection flow, rank-up notification overlay, useGameData subscriptions, human verification

### Phase 13: Crafting System - Weapons & Armor

**Goal:** Material-driven gear crafting system where players gather tiered materials from world nodes and enemy drops, discover recipes through salvage (75% chance), loot scrolls, and quest rewards, and craft fully deterministic gear with affixes controlled by material type and quality controlled by material tier. Salvage reworked from gold yield to material yield. Crafting UI extended with type filter chips and show-only-craftable toggle.
**Depends on:** Phase 12
**Status:** Complete (2026-02-18)
**Plans:** 3 plans

Plans:
- [x] 13-01-PLAN.md — Schema + data foundation: RecipeTemplate columns, crafting_materials.ts data file, material ItemTemplates, gear recipes, enemy material drops, resource nodes, crafting locations
- [x] 13-02-PLAN.md — Reducer rework: salvage_item yields materials + recipe discovery, craft_recipe applies deterministic affixes, learn_recipe_scroll reducer
- [x] 13-03-PLAN.md — Frontend UI: CraftingPanel filter chips + craftable toggle + red/green material display, remove Research Recipes button, update salvage confirm text

### Phase 13.1: Dual-Axis Gear System (INSERTED)

**Goal:** Separate craft quality (Dented/Standard/Reinforced/Exquisite/Mastercraft controlling base stats) from rarity (Common-Legendary controlling magical affixes). Consolidate all crafting materials into single seeding path, introduce Essence I/II/III as required gear crafting ingredients, unify recipe helpers, and add item description metadata to ItemTemplate.
**Depends on:** Phase 13
**Status:** Complete (2026-02-18)
**Plans:** 2 plans

Plans:
- [x] 13.1-01-PLAN.md — Schema + data foundation: craftQuality on ItemInstance, description on ItemTemplate, dual-axis helpers in crafting_materials.ts, Essence MATERIAL_DEFS, material consolidation, recipe helper unification, Essence enemy loot entries
- [x] 13.1-02-PLAN.md — Reducer + frontend: craft_recipe dual-axis logic, publish module, regenerate bindings, useInventory.ts craftQuality/description reading, App.vue tooltip updates

### Phase 14: Loot & Gear Progression - Magic item properties and affixes, gear quality tiers (common to legendary), drop tables and rarity system, endgame gear hunting loop

**Goal:** Dropped gear has quality tiers (Common through Legendary) with prefix/suffix affixes that create emergent item identities, level-gated quality unlocks per region tier, named Legendary uniques from boss enemies, and a complete gear lifecycle of drop-equip-outgrow-salvage.
**Depends on:** Phase 13
**Status:** Complete (2026-02-17)
**Plans:** 4 plans

Plans:
- [x] 14-01-PLAN.md — Schema foundation: ItemAffix table, ItemInstance/CombatLoot quality fields, affix catalog data file with prefixes/suffixes/legendaries
- [x] 14-02-PLAN.md — Loot pipeline: quality tier rolling, affix generation at drop time, affix application at take time, getEquippedBonuses affix support
- [x] 14-03-PLAN.md — Named legendary drops from boss enemies, salvage_item reducer for gear recycling
- [x] 14-04-PLAN.md — Publish module, regenerate bindings, client UI: quality colors, affix tooltips, Epic/Legendary flash, salvage context menu, human verification

### Phase 15: Named NPCs - Unique NPC entities (not templates), NPC dialogue system, NPC-specific shops and services, NPC placement in regions

**Goal:** Unique named NPC entities placed in world regions with NPC-specific shops and services. Core NPC system implemented as part of earlier phases.
**Depends on:** Phase 14
**Status:** Complete (2026-02-17)
**Plans:** 0 plans (implemented organically via earlier quick tasks and NPC Interactions phase)

Plans:
- [x] Implemented — core NPC system, shops, and world placement complete via Phase 19 and quick tasks

### Phase 16: Travelling NPCs - NPC movement AI between regions, travelling merchant schedules, dynamic NPC location tracking

**Goal:** [To be planned]
**Depends on:** Phase 15
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 16 to break down)

### Phase 17: World Bosses - Elite enemy encounters, unique loot tables for bosses, boss spawn mechanics, group scaling for bosses

**Goal:** [To be planned]
**Depends on:** Phase 16
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 17 to break down)

### Phase 18: World Events System Expansion

**Goal:** Persistent world event lifecycle system with admin-fired events scoped to regions, self-contained event content (exclusive enemies and items), Bronze/Silver/Gold contribution tiers with fixed tiered rewards, dual success/failure consequences that permanently change world state (Ripple), and a dedicated WorldEventPanel with Active + History tabs plus banner overlay notifications.
**Depends on:** Phase 17
**Status:** Complete (2026-02-18)
**Plans:** 3 plans

Plans:
- [x] 18-01-PLAN.md — Backend foundation: WorldEvent/EventContribution/EventSpawnEnemy/EventSpawnItem/EventObjective/EventDespawnTick tables, event data constants with tier reward specs, lifecycle helpers (fire/resolve/reward/consequence/spawn)
- [x] 18-02-PLAN.md — Reducers and hooks: fire/resolve/collect/increment/despawn reducers, combat kill contribution hooks, movement auto-registration, publish module and regenerate bindings
- [x] 18-03-PLAN.md — Client UI: WorldEventPanel with Active + History tabs, banner overlay notification, action bar button with badge, useGameData subscriptions, human verification

### Phase 19: NPC Interactions - Deepen relationships, dialogue complexity, affinity systems, and dynamic NPC reactions to player actions

**Goal:** Per-NPC affinity tracking with tiered relationships (Hostile to Devoted), threshold-gated dialogue options, dynamic context-aware greetings based on affinity/faction/renown, gift-giving mechanics for relationship progression, and full UI integration with affinity display and dialogue trees.
**Depends on:** Phase 18
**Status:** Complete (2026-02-17)
**Plans:** 3 plans

Plans:
- [x] 19-01-PLAN.md — Backend foundation: NpcAffinity/NpcDialogueOption tables, Npc table expansion (factionId/personality/mood), affinity helper module, dialogue seed data for 3 NPCs across 4 tiers
- [x] 19-02-PLAN.md — Backend interaction: Dynamic greetings in hailNpc, choose_dialogue_option/give_gift_to_npc reducers, conversation cooldowns, publish module and regenerate bindings
- [x] 19-03-PLAN.md — Frontend UI: skipped per user decision; multi-step questing via NPC dialogue deemed sufficient for MVP

### Phase 20: Perk Variety Expansion

**Goal:** Expand renown perk pools (ranks 2-11) with diverse effect types across three domains: combat procs, crafting/gathering bonuses, and social/utility modifiers. 3 meaningful choices per rank with domain-based differentiation. Active ability perks with hotbar integration.
**Depends on:** Phase 19
**Status:** Complete (2026-02-18)
**Plans:** 3 plans

Plans:
- [x] 20-01-PLAN.md — Perk data foundation: extend PerkEffect type, design 30 perks for ranks 2-11 (combat/crafting/social), sync frontend display
- [x] 20-02-PLAN.md — Passive perk hooks: combat proc system, crafting/gathering bonuses, social/utility modifiers across all game systems
- [x] 20-03-PLAN.md — Active ability perks: hotbar auto-assignment, ability execution (Second Wind, Thunderous Blow, Wrath of the Fallen), cooldown tracking

### Phase 21: Race Expansion

**Goal:** Expand the race roster from 4 starter races to 15+ traditional fantasy races (good and evil alignment), upgrade all races to a dual-bonus system, and introduce a level-up racial bonus mechanic that fires at character creation and every even level. Locked races require world events to unlock; starter races remain available from the start.

**Depends on:** Phase 20

**Requirements:** RACE-EXP-01, RACE-EXP-02, RACE-EXP-03, RACE-EXP-04, RACE-EXP-05

**Plans:** Complete

Plans:
- [x] 21-01-PLAN.md — Schema migration (Race table bonus1Type/bonus1Value schema, Character table 9 optional racial bonus columns), RACE_DATA expanded to 15 races, create_character dual-bonus application, recomputeCharacterDerived racial contributions, publish --clear-database, regenerate bindings
- [x] 21-02-PLAN.md — Level-up racial bonus fix (awardXp preserves race bonuses + even-level stacking with diminishing returns), level_character admin command fix, /unlockrace admin command with world broadcast, racialManaRegen/racialStaminaRegen wired into regen tick
- [x] 21-03-PLAN.md — CharacterPanel.vue race info panel updated to show bonus1Type/bonus2Type with human-readable labels via formatRaceBonus helper
- [x] 21-04 (redesign) — Full racial system redesign: 4-field schema (creation x2, penalty, levelBonus), 9 new Character columns, computeRacialAtLevel(), /level notification fix, travel cost modifiers, faction bonus, HP regen wiring, CharacterPanel penalty/level-bonus UI, StatsPanel Racial Profile section

**Scope:**

**New races to add (target 11+ new races):**
- Goblin (unlocked — cunning, small, bonus magic damage + bonus mana regen)
- Troll (unlocked — regenerating, brutish, bonus max HP + bonus physical damage)
- Dark-Elf (locked — graceful and sinister, bonus spell damage + bonus mana regen)
- Dwarf (unlocked — stout and stubborn, bonus max HP + bonus physical damage)
- Gnome (unlocked — inventive and quick, bonus mana regen + bonus max mana)
- Halfling (unlocked — nimble and lucky, bonus crit chance + bonus evasion)
- Half-Elf (unlocked — versatile and adaptable, +1 to two stats of choice at creation)
- Orc (unlocked — savage and strong, bonus physical damage + bonus max HP)
- Half-Giant (locked — massive, bonus max HP + bonus physical damage but reduced mana)
- Cyclops (locked — singular-minded brutes, bonus physical damage + bonus armor)
- Satyr (locked — wild and magical, bonus spell damage + bonus stamina regen)

**Dual-bonus system for all races (including 4 existing starter races):**
Each race grants exactly two bonuses. Bonuses are not limited to stat points. The bonus pool includes:
- +1 to a specific stat (STR, DEX, INT, WIS, CON, CHA)
- Bonus spell damage (flat, added after stat scaling)
- Bonus physical damage (flat, added after stat scaling)
- Bonus max mana (increases max mana pool)
- Bonus mana regen (restores additional mana per regen tick)
- Bonus max HP (increases max health pool)
- Bonus stamina regen (restores additional stamina per tick)
- Bonus crit chance (flat %, added to base crit)
- Bonus armor (flat, added to armor total)

**Level-up racial bonus mechanic:**
- Racial bonuses apply once at character creation (level 1)
- Bonuses apply again at every EVEN character level (2, 4, 6, 8, 10...)
- This compounds racial identity across the progression curve without overwhelming early balance
- Implementation: hook into level-up logic to re-apply racial bonus row at even levels

**Locked vs unlocked races:**
- Unlocked races: Human, Eldrin, Ironclad, Wyldfang, Goblin, Dwarf, Gnome, Halfling, Half-Elf, Orc, Troll
- Locked races (require world events): Dark-Elf, Half-Giant, Cyclops, Satyr
- Locked races completely hidden from race picker (not shown with lock icon — invisible until unlocked)
- The `Race.unlocked` field (already on the table from Phase 1) controls this

**Existing starter races — dual-bonus upgrades:**
- Human: +1 CHA + bonus stamina regen (versatile, resilient)
- Eldrin: bonus spell damage + bonus max mana (magical heritage)
- Ironclad: bonus physical damage + bonus armor (forged body)
- Wyldfang: bonus crit chance + +1 DEX (primal instinct)

**Requirements Detail:**
- RACE-EXP-01: At least 11 new races added to RACE_DATA with unlocked/locked status and two distinct bonuses each
- RACE-EXP-02: All 4 existing starter races upgraded to dual-bonus system
- RACE-EXP-03: Level-up racial bonus mechanic implemented — even-level hook re-applies racial bonuses
- RACE-EXP-04: Locked races completely hidden in character creation UI; /unlockrace admin command with world broadcast
- RACE-EXP-05: Racial bonuses cover the full bonus pool (spell damage, physical damage, max mana, mana regen, max HP, armor, crit used across the roster)

**Success Criteria:**
- [ ] 15 races defined in RACE_DATA with `unlocked` flag and exactly two bonuses each
- [ ] Character creation race picker shows 11 unlocked races; 4 locked races completely absent
- [ ] Creating a character with any race applies both racial bonuses to stats/combat modifiers
- [ ] Leveling a character to an even level (2, 4, 6...) triggers racial bonus stack + notification
- [ ] /unlockrace admin command unlocks a race globally with world broadcast
- [ ] Dark-Elf, Half-Giant, Cyclops, Satyr remain locked until /unlockrace fires

---

### Phase 21.1: Stat Systems & Off-Stat Hooks (INSERTED)

**Goal:** Stat scaling is symmetric around base 10, all five off-stats (WIS, INT, CHA, STR, DEX) have live hooks affecting gameplay, the block system uses DEX chance and STR mitigation, and salvage drops recipe scrolls with INT-boosted probability instead of auto-learning.

**Requirements:** STAT-01, STAT-02, STAT-03, STAT-04, STAT-05

**Depends on:** Phase 21
**Plans:** 4 plans

Plans:
- [ ] 21.1-01-PLAN.md — Stat scaling helper (statOffset) + shield armor type and class restrictions
- [ ] 21.1-02-PLAN.md — Block system (DEX chance, STR mitigation) + WIS pull hook
- [ ] 21.1-03-PLAN.md — INT salvage scroll drop + CHA vendor/faction/affinity hooks
- [ ] 21.1-04-PLAN.md — Publish backend, regenerate bindings, client block stats display, human verify

### Phase 22: Class Ability Balancing & Progression

**Goal:** Every class has a fully designed, mechanically distinct ability set covering levels 1–10, with clear class identity enforced through ability choice, stat scaling, and resource usage. The unlock curve is deliberately paced — abilities arrive at meaningful moments, not one-per-level automatically. All referenced mechanics (DoT, HoT, AoE, debuffs, aggro) have backend support.

**Depends on:** Phase 21 (Race Expansion must be complete so class abilities can reference fully-defined racial bonus system)

**Requirements:** ABILITY-01, ABILITY-02, ABILITY-03, ABILITY-04, ABILITY-05, ABILITY-06

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 22 to break down)

**Scope:**

- Audit all 15 class ability files (`warrior`, `cleric`, `wizard`, `rogue`, `ranger`, `druid`, `bard`, `monk`, `paladin`, `shaman`, `necromancer`, `beastmaster`, `enchanter`, `reaver`, `spellblade`, `summoner`) — verify each existing ability has correct damage values, descriptions, debuff magnitudes, and mechanical backing
- Extend all classes from level 5 to level 10: design 5 additional abilities per class (up to 75 new abilities total), preserving class identity and avoiding cross-class homogeneity
- Redesign the unlock curve: evaluate whether 1-ability-per-level is optimal or whether some levels grant utility, upgrades, or passive modifiers instead of active abilities; produce a progression design document as a CONTEXT file before implementation
- Enforce class identity pillars: each class should have a distinct primary niche (e.g. Warrior = damage + armor shred, Cleric = group healing + resurrection, Wizard = burst magic + mana management, Rogue = single-target burst + evasion) that is consistently expressed across all 10 levels
- Build any missing backend systems that existing abilities reference but do not have reducer support for: e.g. taunt/aggro for `warrior_intimidating_presence`, group morale for `warrior_rally`, AoE damage distribution for `cleave`-type abilities
- Balance check: validate that power values scale appropriately with level and that no class is dominant or useless in group combat

**Requirements Detail:**

- ABILITY-01: All 15 classes have abilities defined for levels 1–10 in their respective data files
- ABILITY-02: Each class has a documented identity pillar (1-sentence description of primary role and playstyle)
- ABILITY-03: Every ability with a mechanic tag (DoT, HoT, AoE, debuff, aggro) has corresponding backend reducer support that implements the tag's effect
- ABILITY-04: The unlock curve (which levels grant abilities vs. passives vs. upgrades) is explicitly designed and applied consistently across all classes
- ABILITY-05: Power values are reviewed and balanced relative to level — no ability at level 6+ should be weaker than a level 2 ability of the same class
- ABILITY-06: New abilities are human-verified in-game: cast animations, damage numbers, buff/debuff applications all observable

**Success Criteria:**

- [ ] All 15 class ability files contain entries for levels 1–10
- [ ] A CONTEXT.md or design note covers the unlock curve decision and class identity pillars for all 15 classes
- [ ] No ability references a debuffType, aoeTargets, or mechanic tag that is unimplemented in `reducers/combat.ts`
- [ ] Power scaling passes sanity check: level N ability power >= level (N-3) ability power for same class (no regression)
- [ ] Human verification: player can level a character to 10 and observe distinct, functional abilities at each unlock point

---

## Milestone Success Criteria

The milestone is complete when:

1. **Races**: Players can select from >=4 races at character creation; race restricts classes; racial bonuses apply in combat — MET
2. **Hunger**: Removed (quick-76). Food buff system preserved as CharacterEffect. Well Fed buff works via food_mana_regen/food_stamina_regen effectTypes. No starvation penalty by design. See Key Decisions #98-99.
3. **Renown**: Completing faction actions increases standing; rank thresholds unlock quests and rewards; standing persists permanently — MET
4. **Quests**: Players can accept and complete renown-gated quests; quest system works without LLM (LLM text generation deferred to Phase 5+7); 5 quest types functional (kill, kill_loot, explore, delivery, boss_kill) — MET
5. **World Events**: Admin fires world events via UI (WorldEventPanel admin tab); event participation tracking works; Bronze/Silver/Gold contribution tiers functional; LLM-generated consequence text NOT integrated (deferred to Phase 5+7); threshold-triggered auto-firing NOT implemented; race_unlock consequence NOT implemented — PARTIALLY MET
6. **LLM Integration**: Not yet implemented (Phase 5 pending). All generation deferred. Circuit breaker and fallback content not yet built. No game state depends on LLM success — PENDING
7. **Content**: >=3 gear tiers (T1/T2/T3), >=20 resources, >=7 NPCs, >=29 enemy templates, 29 recipes (14 consumable + 15 gear), 3 gear quality axes (rarity + craft quality + world-drop tier) — EXCEEDED
8. **Tone**: Pending Phase 5 LLM implementation — PENDING
