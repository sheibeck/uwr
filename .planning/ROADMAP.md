# Roadmap

**Milestone:** RPG Milestone — Progression Systems & LLM Content Engine
**Created:** 2026-02-11
**Status:** Planning

---

## Phase Overview

| Phase | Name | Requirements | Dependencies | Status |
|-------|------|-------------|--------------|--------|
| 1 | Races | REQ-001–005 | None | Complete (2026-02-11) |
| 2 | Hunger | REQ-010–015 | Phase 1 (race stat integration) | Complete (2026-02-12) |
| 3 | Renown Foundation | REQ-020–026 | None | Complete (2026-02-12) |
| 4 | Config Table Architecture | None | Phase 3 (combat balance complete) | Complete (2026-02-13) |
| 5 | LLM Architecture | REQ-040–047, REQ-080–084 | Phase 3 (first consumer) | Planned |
| 6 | Quest System | REQ-060–066 | Phase 3 (renown gating), Phase 5 (LLM text) | Pending |
| 7 | World Events | REQ-030–035 | Phase 1 (race unlock), Phase 5 (LLM text) | Pending |
| 8 | Narrative Tone Rollout | REQ-080–084 (applied) | Phase 5 (LLM pipeline running) | Pending |
| 9 | Content Data Expansion | REQ-090–094 | Phases 1–3 (systems to populate) | Pending |

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

**Requirements:** REQ-010, REQ-011, REQ-012, REQ-013, REQ-014, REQ-015

**Plans:** 2 plans

Plans:
- [ ] 02-01-PLAN.md — Backend: Hunger table, HungerDecayTick, ItemTemplate extension, food seeding, eat_food/decay_hunger reducers, Well Fed combat integration, my_hunger view, publish and regenerate bindings
- [ ] 02-02-PLAN.md — Frontend: HungerBar component, myHunger subscription, Eat button on food items, App.vue wiring, human verification

**Scope:**
- `Hunger` table: `{ characterId, currentHunger, wellFedUntil }`
- `HungerDecay` scheduled table (fires every 5 minutes)
- `eat_food` reducer: consume food item from inventory → set `wellFedUntil`
- Combat reducer in `spacetimedb/src/reducers/combat.ts` checks Well Fed state → applies multipliers
- 4 food item templates seeded (one per tier)
- Hunger bar UI component (shows hunger level + Well Fed status + time remaining)

**Success Criteria:**
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
- [ ] 4 factions seeded in Faction table
- [ ] Character creation creates FactionStanding rows for all factions at 0
- [ ] Combat kill of faction-associated enemy grants correct standing
- [ ] Rival faction standing decreases when primary faction standing increases
- [ ] `my_faction_standings` view returns correct data for authenticated player
- [ ] Renown panel shows accurate standing and rank per faction
- [ ] Standing never decays (verify after time passes with no activity)

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

**Goal:** Working LLM content pipeline: procedure calls Anthropic API, writes to content tables, handles failures gracefully. No content consumers yet — this is the plumbing phase.

**Requirements:** REQ-040, REQ-041, REQ-042, REQ-043, REQ-044, REQ-045, REQ-046, REQ-047, REQ-080, REQ-081, REQ-082, REQ-083, REQ-084

**Plans:** 3 plans

Plans:
- [ ] 04-01-PLAN.md — Backend foundation: LlmConfig, GeneratedQuestText, GeneratedEventText, LlmCircuit tables + SHADESLINGER_SYSTEM_PROMPT and FALLBACK_CONTENT constants + set_llm_config and reset_llm_circuit reducers
- [ ] 04-02-PLAN.md — Procedure implementation: generate_content procedure with Anthropic API call, circuit breaker, fallback writing + publish and regenerate bindings
- [ ] 04-03-PLAN.md — Client integration: useLlmContent composable, GeneratedTextBlock component, useGameData subscriptions + human verification of end-to-end pipeline

**Scope:**
- `LlmConfig` table (private): api_key, default_model, circuit state
- `setLlmConfig` admin-only reducer
- `GeneratedQuestText` table (public, status-gated)
- `GeneratedEventText` table (public, status-gated)
- `generate_content` procedure: reads config, calls Anthropic API, writes result or fallback
- `SHADESLINGER_SYSTEM_PROMPT` constant with tone instructions + 5 examples
- Per-content-type prompt builder functions
- `FALLBACK_CONTENT` constant with 3+ fallbacks per content type (in Shadeslinger tone)
- `LlmCircuit` scheduled table for circuit auto-reset
- Client loading state components with on-tone placeholder text
- `spacetimedb/src/procedures/` directory created for procedure abstraction layer

**Integration test:** Admin sets API key → client calls generate_content procedure → quest text row flips from pending to ready.

**Success Criteria:**
- [ ] Admin can set API key via `setLlmConfig` reducer
- [ ] `generate_content` procedure successfully calls Anthropic API and writes text
- [ ] Failing API call (bad key, timeout) writes fallback text — never leaves status as `pending`
- [ ] Circuit breaker opens after 3 failures in 60 seconds, all calls serve fallback
- [ ] Circuit breaker auto-resets after 5 minutes
- [ ] Prompt caching applied to SHADESLINGER_SYSTEM_PROMPT section
- [ ] Generated output is valid JSON matching the expected schema
- [ ] Prompt injection test: character name with injection attempt → sanitized before prompt

---

### Phase 6: Quest System

**Goal:** Renown-gated quests available per faction. Players accept quests, complete objectives, earn rewards. Quest text is LLM-generated.

**Requirements:** REQ-060, REQ-061, REQ-062, REQ-063, REQ-064, REQ-065, REQ-066

**Dependencies:** Phase 3 (FactionStanding for gating), Phase 5 (LLM text generation)

**Scope:**
- `Quest` table seeded with ≥8 quests (2 per faction, gated at Neutral and Friendly rank)
- `GeneratedQuestText` table extended (from Phase 4) with quest-specific fields
- `PlayerQuest` table: tracks per-player quest status
- `accept_quest` reducer: validates availability, creates PlayerQuest row, triggers quest text generation
- `complete_quest` reducer: validates objectives met, grants rewards, updates standing
- View `available_quests`: joins Quest + FactionStanding, filters by player's standing
- Quest panel UI: available quests, active quests (with generated descriptions), quest log

**Quest seed data (v1):**
| Quest | Faction | Required Standing | Type |
|-------|---------|------------------|------|
| The Lost Shipment | Iron Compact | 0 (Neutral) | Retrieve |
| Clearing the Route | Iron Compact | 1000 (Friendly) | Kill |
| The Overgrown Path | Verdant Circle | 0 (Neutral) | Travel |
| The Fungal Bloom | Verdant Circle | 1000 (Friendly) | Kill |
| The Missing Tome | Ashen Order | 0 (Neutral) | Retrieve |
| A Test of Mettle | Free Blades | 0 (Neutral) | Kill |
| Contract Work | Free Blades | 1000 (Friendly) | Kill |
| The Debt Ledger | Iron Compact | 3000 (Honored) | Retrieve |

**Success Criteria:**
- [ ] Quest panel shows available quests filtered by player's faction standing
- [ ] Locked quests are visible with standing requirement shown
- [ ] Accepting a quest creates PlayerQuest row and triggers text generation
- [ ] Quest description shows Shadeslinger-tone LLM text (or fallback)
- [ ] Completing quest objectives grants XP, gold, and faction standing
- [ ] Completing a quest with rival faction consequence reduces rival standing

---

### Phase 7: World Events

**Goal:** Server-wide events fire (admin-triggered or threshold-triggered), generate LLM consequence text, appear in the world event log, and can unlock races.

**Requirements:** REQ-030, REQ-031, REQ-032, REQ-033, REQ-034, REQ-035

**Dependencies:** Phase 1 (race unlock target), Phase 5 (LLM generation)

**Scope:**
- `WorldEvent` table: event type, target, status, firedAt
- `WorldServerStats` table: server-wide counters (total kills, total quests completed, etc.)
- `fire_world_event` reducer (admin-only, protected by admin identity check)
- Threshold check in combat/quest reducers: when stat crosses threshold → fire world event automatically
- World event consequence: type `race_unlock` sets `Race.unlocked = true`
- `GeneratedEventText` used from Phase 4 pipeline
- EventWorld log entry with consequence text visible to all players
- World events panel or prominent UI element showing recent world events

**v1 World Events (seeded):**
| Event | Trigger | Consequence |
|-------|---------|-------------|
| The Iron Reckoning | 1000 Iron Compact quests completed (server-wide) | Faction gear unlocked |
| The Green Awakening | 500 Verdant Circle kills | New zone opens |
| The Hollowed Emerge | 2000 Hollow Crown enemies killed (total) | Hollowed race unlocked |

**Success Criteria:**
- [ ] Admin can fire a world event via reducer
- [ ] World event fires automatically when server threshold is crossed
- [ ] WorldEvent row appears in world events table
- [ ] LLM-generated consequence text appears in world event log for all players
- [ ] `race_unlock` world event sets `Race.unlocked = true` for the target race
- [ ] Players can create Hollowed characters after the Hollowed Emerge event fires

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

**Requirements:** REQ-090, REQ-091, REQ-092, REQ-093, REQ-094

**Dependencies:** Phases 1-3 (systems to tie content to)

**Scope:**
- 3 complete gear sets defined in item template data
- 10+ resources in resource catalog (including food ingredients)
- 5+ named NPCs with faction, location, personality notes
- 8+ enemy types (at least 2 per zone, with faction associations)
- 4-6 crafting recipes for food items (Hunger tiers 2-4)
- Vendor inventories updated to include new food items and resources

**Gear set suggestions:**
| Set | Tier | Theme | Classes |
|-----|------|-------|---------|
| Rusted Warden | Early | Scavenger soldier | Warrior, Paladin |
| Thornweave | Mid | Forest ranger | Ranger, Druid |
| Ashen Scholar | End | Scholar-mage | Mage, Priest |

**Success Criteria:**
- [ ] 3 gear sets defined with full slot coverage (head, chest, legs, hands, feet, weapon)
- [ ] 10+ resources defined in data file, at least 5 harvestable from world locations
- [ ] 5 named NPCs defined with all required fields; at least 2 serve as quest givers
- [ ] 8 enemy types defined; combat system tested with new enemies
- [ ] Food crafting recipes defined; end-to-end test: harvest resource → craft food → eat → get buff

---

## Dependency Graph

```
Phase 1 (Races) ──────────────────────────────────────┐
Phase 3 (Renown) ──────────────────────────────────┐   │
Phase 4 (Config Tables) <- Phase 3                 │   │
Phase 5 (LLM Architecture) <- Phase 3        ──┐   │   │
                                              │   │   │
Phase 2 (Hunger) <- Phase 1                   │   │   │
Phase 6 (Quests) <- Phase 3, Phase 5          │   │   │
Phase 7 (World Events) <- Phase 5 ─────────── │ ──┘   │
                                    (race unlock) ──────┘
Phase 8 (Tone) <- Phase 5, 6, 7
Phase 9 (Content Data) <- Phase 1, 2, 3
```

Phases 1, 3, 4, and 5 can run in parallel (4 and 5 both require 3 complete). Phases 2, 6, 7 start once their dependencies complete. Phases 8 and 9 run last.

### Phase 10: Travel & Movement Costs - Region travel with distance-based costs (short = stamina, long = gold + cooldown), travel restrictions and validation, travel UI improvements

**Goal:** Distance-based travel cost system where short-distance travel (1-2 steps) costs stamina and long-distance travel (3+ steps) costs gold plus a 30-second cooldown. All reachable locations visible in travel panel with cost previews and affordability indicators.
**Depends on:** Phase 4
**Plans:** 2 plans

Plans:
- [ ] 10-01-PLAN.md — Backend: BFS distance calculation, TRAVEL_CONFIG constants, TravelCooldown table, move_character reducer with distance-based cost validation and deduction
- [ ] 10-02-PLAN.md — Frontend: Publish module, regenerate bindings, client-side BFS for reachable locations, cost preview UI, cooldown countdown display, human verification

### Phase 11: Death & Corpse System - Corpse mechanic for level 5+ characters, equipped items stay while inventory drops to corpse, corpse retrieval mechanics, death penalties and resurrection

**Goal:** [To be planned]
**Depends on:** Phase 10
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 11 to break down)

### Phase 12: Overall Renown System - Character-wide renown separate from factions, renown ranks with unlockable perks, renown gain sources from events/bosses/achievements

**Goal:** [To be planned]
**Depends on:** Phase 11
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 12 to break down)

### Phase 13: Crafting System - Weapons & Armor - Extend recipe system for gear crafting, material requirements and gathering, crafted gear as deterministic progression path

**Goal:** [To be planned]
**Depends on:** Phase 12
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 13 to break down)

### Phase 14: Loot & Gear Progression - Magic item properties and affixes, gear quality tiers (common to legendary), drop tables and rarity system, endgame gear hunting loop

**Goal:** [To be planned]
**Depends on:** Phase 13
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 14 to break down)

### Phase 15: Named NPCs - Unique NPC entities (not templates), NPC dialogue system, NPC-specific shops and services, NPC placement in regions

**Goal:** [To be planned]
**Depends on:** Phase 14
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 15 to break down)

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

### Phase 18: World Events System Expansion - Regional event spawning (Ripple system), event types and objectives, faction and overall renown rewards, event participation tracking

**Goal:** [To be planned]
**Depends on:** Phase 17
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 18 to break down)

---

## Milestone Success Criteria

The milestone is complete when:

1. **Races**: Players can select from >=4 races at character creation; race restricts classes; racial bonuses apply in combat
2. **Hunger**: Hunger decays over time; eating food grants Well Fed buff; buff improves combat stats; no starvation penalty exists
3. **Renown**: Completing faction actions increases standing; rank thresholds unlock quests and rewards; standing persists permanently
4. **Quests**: Players can accept and complete renown-gated quests; quest text is LLM-generated in Shadeslinger tone
5. **World Events**: Admin (or threshold) fires a world event; LLM generates consequence text; all players see it; race unlock event works end-to-end
6. **LLM Integration**: All generation uses Shadeslinger tone; fallback content exists; circuit breaker works; no game state depends on LLM success
7. **Content**: >=3 gear sets, >=10 resources, >=5 NPCs, >=8 enemies, food crafting recipes defined
8. **Tone**: All LLM-generated and LLM-fallback text passes human Shadeslinger tone review
