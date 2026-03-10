# Requirements: UWR

**Defined:** 2026-03-09
**Core Value:** A world that writes itself around its players -- every character is unique, every region is discovered, and the narrative responds to what players actually do.

## v2.1 Requirements

Requirements for v2.1 Project Cleanup milestone. Each maps to roadmap phases.

### Testing

- [x] **TEST-01**: Backend has unified mock DB test infrastructure (single reusable pattern)
- [x] **TEST-02**: Combat engine has regression tests covering damage, healing, effects, death
- [x] **TEST-03**: Item/inventory reducers have unit tests covering equip, unequip, sell, drop
- [x] **TEST-04**: Intent routing has tests covering command parsing and dispatch
- [x] **TEST-05**: Equipment generation has tests covering rarity rolling, affix generation, stat scaling
- [x] **TEST-06**: Event logging has tests verifying all event types are emitted correctly

### Cleanup

- [x] **CLEAN-01**: All v1.0 legacy files identified in MEMORY.md are removed (seeded data, old components)
- [x] **CLEAN-02**: Implicit mechanical rules from item_defs.ts are extracted to mechanical_vocabulary.ts before deletion
- [x] **CLEAN-03**: Backend code is deduplicated (shared helpers extracted for sell logic, combat utilities)
- [x] **CLEAN-04**: Frontend code is deduplicated (redundant components consolidated)
- [x] **CLEAN-05**: Dead reducers and unused table accessors are removed
- [x] **CLEAN-06**: Import graph is clean — no broken or circular imports after cleanup

### Combat

- [x] **COMB-01**: Combat log shows DoT tick damage per tick with effect name
- [x] **COMB-02**: Combat log shows HoT tick healing per tick with effect name
- [x] **COMB-03**: Combat log shows buff/debuff application with stat, magnitude, and duration
- [x] **COMB-04**: Combat log shows buff/debuff expiration
- [ ] **COMB-05**: Enemy HUD displays active DoT/HoT/debuff indicators with remaining duration
- [x] **COMB-06**: Multi-enemy pull system verified working (engage multiple groups simultaneously)
- [x] **COMB-07**: Combat balance pass — tuned damage/healing constants validated via tests
- [ ] **COMB-08**: Group info panel has readable font size and layout

### Narrative UI

- [x] **NARR-01**: User can sell items via narrative command (`sell <item>`)
- [x] **NARR-02**: User can sell in bulk via narrative command (`sell all junk`, `sell 3 <item>`)
- [ ] **NARR-03**: Hotbar displays inline in narrative combat HUD with ability slots and cooldown state
- [x] **NARR-04**: User can manage hotbar via narrative commands (`hotbar set 1 <ability>`, `hotbar swap 1 3`)
- [x] **NARR-05**: Event feed entries are styled by kind (combat=red, reward=gold, system=gray, social=blue)

### Equipment

- [ ] **EQUIP-01**: Equipment drops are dynamically generated based on enemy level, world tier, and rarity rolls
- [ ] **EQUIP-02**: Generated equipment has level-scaled stats (AC, damage) computed from formulas not hardcoded
- [ ] **EQUIP-03**: Quest reward equipment is dynamically generated matching quest difficulty
- [ ] **EQUIP-04**: Hardcoded WORLD_DROP_GEAR_DEFS replaced by dynamic generation function
- [ ] **EQUIP-05**: Generated equipment uses existing affix system (prefix/suffix) for names and stat bonuses

### Abilities

- [ ] **ABIL-01**: Ability kinds in mechanical_vocabulary.ts cover all current game systems (combat, crafting, gathering, travel, social, songs, auras, pets, fear, summoning)
- [ ] **ABIL-02**: Missing ability kinds (resurrect, corpse_summon, track, group_heal, songs, auras, travel, pets, fear, bandages, potions, food_summon) are added to server dispatch
- [ ] **ABIL-03**: Skill generation system can produce non-combat abilities (craft_boost, gather_boost, travel_speed, haggle, buff-only, debuff-only)
- [ ] **ABIL-04**: Client ability dispatch handles all new ability kinds without special-casing
- [ ] **ABIL-05**: Pure buff abilities (haste, stat buffs) and pure debuff abilities (slow, fear) exist without damage components — castable outside combat on self or party
- [ ] **ABIL-06**: Race abilities are functional in-game (not just narrative flavor text) — minor passive or active effects on longer cooldowns
- [ ] **ABIL-07**: Heritage bonuses apply every level (not every other level as in v1.0) and are shown during character creation and level-up
- [ ] **ABIL-08**: Renown perks use the dynamic ability system — same source system as class abilities
- [ ] **ABIL-09**: Renown rank-up triggers LLM-driven perk selection flow (header notification, perk choice UI similar to level-up)
- [ ] **ABIL-10**: Abilities track their source (Class, Renown, Race) for UI display and filtering
- [ ] **ABIL-11**: LLM has constraint rules for generating renown perks (different from class abilities)

### UX

- [ ] **UX-01**: User can increase/decrease global font size of the entire app
- [ ] **UX-02**: Font size preference persists across sessions (localStorage)
- [ ] **UX-03**: Group info panel text is sized for readability

## v2.2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Equipment

- **EQUIP-06**: Equipment set bonuses (wearing matching pieces grants extra stats)
- **EQUIP-07**: Equipment upgrade/enhancement system (improve existing gear)

### Advanced Narrative

- **NARR-06**: Keeper-narrated sell transactions (sardonic commentary on trades)
- **NARR-07**: Equipment comparison via narrative command (`compare <item>`)

## Out of Scope

| Feature | Reason |
|---------|--------|
| LLM-generated item names per drop | Too slow/expensive; existing affix name composition is fast and thematic |
| Drag-and-drop hotbar | Fights text-first narrative UI design philosophy |
| Floating damage numbers | Visual noise in text console UI |
| Tooltip-heavy item UI | Breaks on mobile, fights text-first design |
| Auto-equip / gear score | Removes player agency about stat priorities |
| Streaming LLM tokens | Already ruled out; typewriter animation sufficient |
| Equipment comparison popup | Modal pattern interrupts narrative flow |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEST-01 | Phase 31 | Complete |
| TEST-02 | Phase 31 | Complete |
| TEST-03 | Phase 31 | Complete |
| TEST-04 | Phase 31 | Complete |
| TEST-05 | Phase 31 | Complete |
| TEST-06 | Phase 31 | Complete |
| CLEAN-01 | Phase 32 | Complete |
| CLEAN-02 | Phase 32 | Complete |
| CLEAN-03 | Phase 32 | Complete |
| CLEAN-04 | Phase 32 | Complete |
| CLEAN-05 | Phase 32 | Complete |
| CLEAN-06 | Phase 32 | Complete |
| COMB-01 | Phase 33 | Complete |
| COMB-02 | Phase 33 | Complete |
| COMB-03 | Phase 33 | Complete |
| COMB-04 | Phase 33 | Complete |
| COMB-05 | Phase 33 | Pending |
| COMB-06 | Phase 33 | Complete |
| COMB-07 | Phase 33 | Complete |
| COMB-08 | Phase 37 | Pending |
| NARR-01 | Phase 34 | Complete |
| NARR-02 | Phase 34 | Complete |
| NARR-03 | Phase 34 | Pending |
| NARR-04 | Phase 34 | Complete |
| NARR-05 | Phase 34 | Complete |
| EQUIP-01 | Phase 35 | Pending |
| EQUIP-02 | Phase 35 | Pending |
| EQUIP-03 | Phase 35 | Pending |
| EQUIP-04 | Phase 35 | Pending |
| EQUIP-05 | Phase 35 | Pending |
| ABIL-01 | Phase 36 | Pending |
| ABIL-02 | Phase 36 | Pending |
| ABIL-03 | Phase 36 | Pending |
| ABIL-04 | Phase 36 | Pending |
| ABIL-05 | Phase 36 | Pending |
| ABIL-06 | Phase 36 | Pending |
| ABIL-07 | Phase 36 | Pending |
| ABIL-08 | Phase 36 | Pending |
| ABIL-09 | Phase 36 | Pending |
| ABIL-10 | Phase 36 | Pending |
| ABIL-11 | Phase 36 | Pending |
| UX-01 | Phase 37 | Pending |
| UX-02 | Phase 37 | Pending |
| UX-03 | Phase 37 | Pending |

**Coverage:**
- v2.1 requirements: 44 total
- Mapped to phases: 44
- Unmapped: 0

---
*Requirements defined: 2026-03-09*
*Last updated: 2026-03-09 after roadmap creation*
