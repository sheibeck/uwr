# Roadmap: UWR v2.0 — The Living World

## Overview

v2.0 transforms UWR from a traditional RPG with fixed content into a living world driven by LLM generation. The build order follows a strict dependency chain: the LLM pipeline must exist before anything can generate content, the narrative UI must exist before generated content can be displayed, and character creation is the first player-facing proof that the pipeline works. From there, world generation creates the space for NPCs, quests, and skills to inhabit, and narrative combat ties it all together as the final integration point.

**Milestone:** v2.0 — The Living World
**Phases:** 24-30 (continuing from v1.0 Phase 23)
**Requirements:** 36 across 7 categories
**Created:** 2026-03-06

## Milestones

- Complete **v1.0 — RPG Milestone** - Phases 1-23 (shipped 2026-02-25)
- Current **v2.0 — The Living World** - Phases 24-30 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (24, 25, 26...): Planned milestone work
- Decimal phases (24.1, 24.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 24: LLM Pipeline Foundation** - SpacetimeDB procedure calling Anthropic API with status tracking, cost controls, and graceful degradation (completed 2026-03-07)
- [ ] **Phase 25: Narrative UI Shell** - Chat-first narrative console with persistent HUD, natural language input, and typewriter animation
- [ ] **Phase 26: Narrative Character Creation** - Guided conversation with the System to create a unique race, archetype, and LLM-generated class
- [ ] **Phase 27: Procedural World Generation** - Player arrival triggers persistent region creation with canonical world facts and ripple announcements
- [ ] **Phase 28: Dynamic Skill Generation** - Level-up offers 3 LLM-generated skills with schema constraints and power-budget validation
- [ ] **Phase 29: NPC & Quest Generation** - LLM creates contextual NPCs with persistent identity and narrative quests from world state
- [ ] **Phase 30: Narrative Combat** - Combat rounds narrated by the LLM over the existing turn-based engine

## Phase Details

### Phase 24: LLM Pipeline Foundation
**Goal**: The server can make validated, cost-controlled LLM calls and the client can trigger and monitor them
**Depends on**: Nothing (foundation for all v2.0 work)
**Requirements**: LLM-01, LLM-02, LLM-03, LLM-04, LLM-05, LLM-06
**Success Criteria** (what must be TRUE):
  1. An admin can set the Anthropic API key via reducer, and the key is never visible to clients
  2. A procedure can call the Claude API and write the parsed response into a game table via ctx.withTx()
  3. Every LLM request shows its lifecycle status (pending/processing/completed/error) in a trackable table
  4. A player who exceeds their daily generation budget receives a clear message and the call is blocked
  5. When the LLM API is unreachable or returns an error, the game remains playable with appropriate fallback behavior
**Plans**: 3 plans

Plans:
- [ ] 24-01-PLAN.md — Server tables, helpers, prompt templates, admin API key reducer
- [ ] 24-02-PLAN.md — Validation reducer and call_llm procedure with retry and error handling
- [ ] 24-03-PLAN.md — Client composable, error cleanup scheduler, binding regeneration, end-to-end verification

### Phase 25: Narrative UI Shell
**Goal**: Players interact with the game primarily through a narrative chat console with persistent status information
**Depends on**: Phase 24 (typing indicators depend on LLM request status)
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06
**Success Criteria** (what must be TRUE):
  1. The narrative console is the primary interface -- it occupies the main viewport and renders all event types with rich formatting
  2. HP, mana, location, and combat state are always visible in a persistent HUD regardless of what is happening in the console
  3. Player can type natural language in the input bar and the intent service routes it to the correct reducer (e.g., "go north" triggers travel)
  4. Existing panels (inventory, stats, social) open as overlays on top of the narrative console
  5. LLM-generated text appears with a typewriter animation, and a "The System is considering..." indicator shows during pending LLM requests
**Plans**: 3 plans

Plans:
- [ ] 25-01-PLAN.md — Server-side submit_intent reducer and useContextActions composable
- [ ] 25-02-PLAN.md — NarrativeConsole, HUD, input components and App.vue layout restructure
- [ ] 25-03-PLAN.md — Typewriter animation, LLM indicators, binding regeneration, and full integration verification

### Phase 26: Narrative Character Creation
**Goal**: New players experience character creation as a guided narrative conversation with the System, producing a unique LLM-generated class
**Depends on**: Phase 24 (LLM pipeline), Phase 25 (narrative display)
**Requirements**: CHAR-01, CHAR-02, CHAR-03, CHAR-04, CHAR-05, CHAR-06, CHAR-07
**Success Criteria** (what must be TRUE):
  1. A new player enters a narrative holding space and the System greets them with sardonic commentary
  2. The player describes any fantasy race in freeform text and receives an LLM-interpreted race with description
  3. After choosing Warrior or Mystic archetype, the LLM generates a wildly creative unique class with name, description, and mechanical stats
  4. Going back on a choice triggers a warning that the previously generated content may be lost forever
  5. The player chooses a starting ability from their generated class, and all creation state survives page refresh
**Plans**: TBD

Plans:
- [ ] 26-01: TBD
- [ ] 26-02: TBD

### Phase 27: Procedural World Generation
**Goal**: The world creates itself around players -- entering the world triggers persistent region generation with coherent, evolving content
**Depends on**: Phase 24 (LLM pipeline), Phase 26 (character must exist to trigger world gen)
**Requirements**: WORLD-01, WORLD-02, WORLD-03, WORLD-04, WORLD-05, WORLD-06
**Success Criteria** (what must be TRUE):
  1. When a player enters the world, a region is generated based on their race, archetype, and class -- with locations, NPCs, and enemies written into existing game tables
  2. Generated regions persist permanently on the map and are discoverable by other players
  3. Other players receive ripple announcements ("The world shifts at the edges...") when new regions appear
  4. Canonical world facts (region names, biomes, landmarks, factions) are stored in structured tables and injected into all subsequent generation prompts for that region
  5. Generation locks prevent duplicate creation of the same region when multiple players trigger generation simultaneously
**Plans**: TBD

Plans:
- [ ] 27-01: TBD
- [ ] 27-02: TBD

### Phase 28: Dynamic Skill Generation
**Goal**: Level-up becomes a moment of discovery -- players choose from 3 LLM-generated skills that may never be offered again
**Depends on**: Phase 24 (LLM pipeline), Phase 26 (generated class defines skill context)
**Requirements**: SKILL-01, SKILL-02, SKILL-03, SKILL-04
**Success Criteria** (what must be TRUE):
  1. When a player levels up, 3 unique skills are generated based on their class, race, and history -- each with a creative name, sardonic description, and valid mechanical stats
  2. The player picks 1 skill; the other 2 are marked as potentially expired and may not appear again
  3. Every generated skill passes schema validation (valid damage types, effect types, target types from the combat engine's vocabulary)
  4. A power-budget formula rejects skills that are mechanically overpowered or underpowered before they reach the database
**Plans**: TBD

Plans:
- [ ] 28-01: TBD

### Phase 29: NPC & Quest Generation
**Goal**: NPCs and quests emerge from the world context -- generated contextually, stored canonically, consumed by existing game systems
**Depends on**: Phase 24 (LLM pipeline), Phase 27 (regions must exist for NPCs/quests to inhabit)
**Requirements**: NPC-01, NPC-02, NPC-03, NPC-04
**Success Criteria** (what must be TRUE):
  1. The LLM generates NPCs that fit their region's biome, history, and current state -- not generic fantasy shopkeepers
  2. Generated NPCs have persistent identity stored in canonical tables (name, personality, dialogue topics) and behave consistently across interactions
  3. The LLM generates quests from NPC/region/world context that use existing quest types (kill, explore, delivery, etc.) with narrative flavor
  4. Generated quests are accepted, progressed, and completed through the existing quest system with no special handling
**Plans**: TBD

Plans:
- [ ] 29-01: TBD

### Phase 30: Narrative Combat
**Goal**: Combat encounters feel like a story unfolding -- the LLM narrates each round while the mechanical engine resolves damage and effects instantly
**Depends on**: Phase 24 (LLM pipeline), Phase 25 (narrative display), Phase 28 (LLM-generated abilities in combat)
**Requirements**: COMBAT-01, COMBAT-02, COMBAT-03
**Success Criteria** (what must be TRUE):
  1. Each combat round produces an LLM-narrated description that references the actual abilities used, damage dealt, and effects applied
  2. Mechanical state changes (HP loss, buff application, enemy death) happen instantly via the existing combat engine; the narrative text arrives asynchronously and is displayed alongside mechanical events
  3. The System narrator maintains sardonic voice throughout combat descriptions -- combat feels like a story the narrator finds entertaining, not a spreadsheet
**Plans**: TBD

Plans:
- [ ] 30-01: TBD

## Coverage

| Requirement | Phase | Category |
|-------------|-------|----------|
| LLM-01 | 24 | 3/3 | Complete   | 2026-03-07 | 24 | LLM Pipeline |
| LLM-03 | 24 | LLM Pipeline |
| LLM-04 | 24 | LLM Pipeline |
| LLM-05 | 24 | LLM Pipeline |
| LLM-06 | 24 | LLM Pipeline |
| UI-01 | 25 | Narrative UI |
| UI-02 | 25 | Narrative UI |
| UI-03 | 25 | Narrative UI |
| UI-04 | 25 | Narrative UI |
| UI-05 | 25 | Narrative UI |
| UI-06 | 25 | Narrative UI |
| CHAR-01 | 26 | Character Creation |
| CHAR-02 | 26 | Character Creation |
| CHAR-03 | 26 | Character Creation |
| CHAR-04 | 26 | Character Creation |
| CHAR-05 | 26 | Character Creation |
| CHAR-06 | 26 | Character Creation |
| CHAR-07 | 26 | Character Creation |
| WORLD-01 | 27 | Procedural World |
| WORLD-02 | 27 | Procedural World |
| WORLD-03 | 27 | Procedural World |
| WORLD-04 | 27 | Procedural World |
| WORLD-05 | 27 | Procedural World |
| WORLD-06 | 27 | Procedural World |
| SKILL-01 | 28 | Dynamic Skills |
| SKILL-02 | 28 | Dynamic Skills |
| SKILL-03 | 28 | Dynamic Skills |
| SKILL-04 | 28 | Dynamic Skills |
| NPC-01 | 29 | NPC & Quest Gen |
| NPC-02 | 29 | NPC & Quest Gen |
| NPC-03 | 29 | NPC & Quest Gen |
| NPC-04 | 29 | NPC & Quest Gen |
| COMBAT-01 | 30 | Narrative Combat |
| COMBAT-02 | 30 | Narrative Combat |
| COMBAT-03 | 30 | Narrative Combat |

**Mapped: 36/36 -- no orphans, no duplicates.**

## Progress

**Execution Order:**
Phases execute in numeric order: 24 -> 25 -> 26 -> 27 -> 28 -> 29 -> 30

| Phase | Name | Plans Complete | Status | Completed |
|-------|------|----------------|--------|-----------|
| 24 | LLM Pipeline Foundation | 3/3 | Complete | 2026-03-07 |
| 25 | Narrative UI Shell | 0/3 | Planning complete | - |
| 26 | Narrative Character Creation | 0/? | Not started | - |
| 27 | Procedural World Generation | 0/? | Not started | - |
| 28 | Dynamic Skill Generation | 0/? | Not started | - |
| 29 | NPC & Quest Generation | 0/? | Not started | - |
| 30 | Narrative Combat | 0/? | Not started | - |

---
*Created: 2026-03-06*
*Last updated: 2026-03-07*
