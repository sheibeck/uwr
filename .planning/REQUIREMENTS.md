# Requirements: UWR v2.0 — The Living World

**Defined:** 2026-03-06
**Core Value:** A world that writes itself around its players — every character is unique, every region is discovered, and the narrative responds to what players actually do.

## v2.0 Requirements

### LLM Pipeline

- [x] **LLM-01**: Server can call Anthropic Claude API via SpacetimeDB procedures using raw HTTP
- [x] **LLM-02**: API key is stored in a private config table, set by admin reducer
- [x] **LLM-03**: LLM requests are tracked in a status table (pending/processing/completed/error)
- [x] **LLM-04**: Per-player generation budget limits daily LLM calls
- [x] **LLM-05**: System prompt uses Anthropic prompt caching for cost reduction
- [x] **LLM-06**: Game remains playable if LLM calls fail (graceful degradation)

### Narrative UI

- [x] **UI-01**: Primary interface is a narrative chat console (evolved from LogWindow)
- [x] **UI-02**: Persistent HUD shows HP/mana, location, combat state at all times
- [x] **UI-03**: Natural language intent service routes player text to appropriate reducers
- [x] **UI-04**: Existing panels (inventory, stats, social) accessible as overlays on the narrative console
- [x] **UI-05**: LLM-generated text displays with typewriter animation
- [x] **UI-06**: "The System is considering..." indicator shows during LLM processing

### Character Creation

- [x] **CHAR-01**: Player enters a narrative holding space and converses with the System
- [x] **CHAR-02**: Player describes any fantasy race in freeform text; LLM interprets and normalizes it
- [x] **CHAR-03**: Player chooses Warrior or Mystic archetype
- [x] **CHAR-04**: LLM generates a unique class from race + archetype with wild creativity (no guardrails on naming/theme)
- [x] **CHAR-05**: Going back on a decision is warned — "you may never see this class again"
- [x] **CHAR-06**: Player receives class description with niche overview, then chooses a starting ability
- [x] **CHAR-07**: All creation state persists server-side (page refresh doesn't lose progress)

### Procedural World

- [x] **WORLD-01**: Player entering the world triggers region generation based on race/archetype/class
- [x] **WORLD-02**: Generated regions are persistent — they exist on the map forever
- [ ] **WORLD-03**: Region content evolves over time based on player actions and world state
- [x] **WORLD-04**: Other players receive ripple announcements when new regions appear
- [x] **WORLD-05**: Canonical world facts stored in structured tables, injected into generation prompts
- [x] **WORLD-06**: Generation locks prevent duplicate creation of the same region

### Dynamic Skills

- [x] **SKILL-01**: Level-up offers 3 LLM-generated skills based on class, race, and history
- [x] **SKILL-02**: Player picks 1 skill; unchosen skills may vanish permanently
- [x] **SKILL-03**: Generated skills use schema-constrained templates (valid damage types, effect types, power ranges)
- [x] **SKILL-04**: Power-budget validation rejects overpowered/underpowered skills before insertion

### NPC & Quest Generation

- [x] **NPC-01**: LLM generates NPCs contextual to the region and world state
- [x] **NPC-02**: Generated NPCs have persistent identity (name, personality, dialogue topics) stored canonically
- [ ] **NPC-03**: LLM generates quests from NPC/region/world context
- [ ] **NPC-04**: Generated quests use existing quest types (kill, explore, delivery, etc.) with LLM-written narrative

### Narrative Combat

- [ ] **COMBAT-01**: Combat rounds are narrated by the LLM over the existing turn-based engine
- [ ] **COMBAT-02**: Mechanical state changes (damage, healing, effects) happen instantly; narrative arrives async
- [ ] **COMBAT-03**: The System narrator maintains sardonic voice during combat descriptions

## Future Requirements

### World Evolution
- **EVOLVE-01**: Regions change based on cumulative player actions over time
- **EVOLVE-02**: NPCs develop relationships and memory of player interactions
- **EVOLVE-03**: World events emerge from player activity patterns

### Advanced Features
- **ADV-01**: Player-to-player trading with narrative flavor
- **ADV-02**: Guild/faction formation driven by player choices
- **ADV-03**: Travelling NPCs that move between regions

## Out of Scope

| Feature | Reason |
|---------|--------|
| Legacy data migration | Clean break — no backward compatibility, no parallel systems |
| Balanced class design | Uniqueness over balance by design decision |
| Mobile app | Web-first |
| PvP combat | Not in current scope |
| Streaming LLM responses | Typewriter animation achieves same UX without server complexity |
| Fallback to legacy creation | Clean break — LLM creation is the only path |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LLM-01 | Phase 24 | Complete |
| LLM-02 | Phase 24 | Complete |
| LLM-03 | Phase 24 | Complete |
| LLM-04 | Phase 24 | Complete |
| LLM-05 | Phase 24 | Complete |
| LLM-06 | Phase 24 | Complete |
| UI-01 | Phase 25 | Complete |
| UI-02 | Phase 25 | Complete |
| UI-03 | Phase 25 | Complete |
| UI-04 | Phase 25 | Complete |
| UI-05 | Phase 25 | Complete |
| UI-06 | Phase 25 | Complete |
| CHAR-01 | Phase 26 | Complete |
| CHAR-02 | Phase 26 | Complete |
| CHAR-03 | Phase 26 | Complete |
| CHAR-04 | Phase 26 | Complete |
| CHAR-05 | Phase 26 | Complete |
| CHAR-06 | Phase 26 | Complete |
| CHAR-07 | Phase 26 | Complete |
| WORLD-01 | Phase 27 | Complete |
| WORLD-02 | Phase 27 | Complete |
| WORLD-03 | Phase 27 | Pending |
| WORLD-04 | Phase 27 | Complete |
| WORLD-05 | Phase 27 | Complete |
| WORLD-06 | Phase 27 | Complete |
| SKILL-01 | Phase 28 | Complete |
| SKILL-02 | Phase 28 | Complete |
| SKILL-03 | Phase 28 | Complete |
| SKILL-04 | Phase 28 | Complete |
| NPC-01 | Phase 29 | Complete |
| NPC-02 | Phase 29 | Complete |
| NPC-03 | Phase 29 | Pending |
| NPC-04 | Phase 29 | Pending |
| COMBAT-01 | Phase 30 | Pending |
| COMBAT-02 | Phase 30 | Pending |
| COMBAT-03 | Phase 30 | Pending |

**Coverage:**
- v2.0 requirements: 36 total
- Mapped to phases: 36
- Unmapped: 0

---
*Requirements defined: 2026-03-06*
*Last updated: 2026-03-06 after roadmap creation (phases 24-30)*
