# Roadmap: UWR

## Milestones

- ✅ **v1.0 MVP** -- Phases 1-23 (shipped 2026-02-25)
- ✅ **v2.0 The Living World** -- Phases 24-30 (shipped 2026-03-09)
- 🚧 **v2.1 Project Cleanup** -- Phases 31-37 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-23) -- SHIPPED 2026-02-25</summary>

See `.planning/milestones/v1.0-ROADMAP.md` for full details (if archived).

- Phases 1-23: Character creation, combat, inventory, crafting, quests, NPCs, world events, renown, travel, death/corpse, config tables, auth, subscription optimization

</details>

<details>
<summary>✅ v2.0 The Living World (Phases 24-30) -- SHIPPED 2026-03-09</summary>

- [x] Phase 24: LLM Pipeline Foundation (3/3 plans) -- completed 2026-03-07
- [x] Phase 25: Narrative UI Shell (3/3 plans) -- completed 2026-03-07
- [x] Phase 26: Narrative Character Creation (3/3 plans) -- completed 2026-03-07
- [x] Phase 27: Procedural World Generation (3/3 plans) -- completed 2026-03-07
- [x] Phase 28: Dynamic Skill Generation (3/3 plans) -- completed 2026-03-07
- [x] Phase 29: NPC & Quest Generation (3/3 plans) -- completed 2026-03-07
- [x] Phase 30: Narrative Combat (4/4 plans) -- completed 2026-03-09

See `.planning/milestones/v2.0-ROADMAP.md` for full details.

</details>

### 🚧 v2.1 Project Cleanup (In Progress)

**Milestone Goal:** Stabilize, polish, and complete the v2.0 foundation -- remove dead code, add tests, wire remaining v1.0 systems into narrative UI, and fix combat gaps.

- [ ] **Phase 31: Test Infrastructure** - Unified mock DB, combat regression tests, and test coverage across core systems
- [ ] **Phase 32: Dead Code Removal** - Purge v1.0 legacy files, extract implicit rules, deduplicate code, clean imports
- [ ] **Phase 33: Combat Improvements** - Complete combat logging, enemy effect indicators, balance tuning, multi-pull verification
- [ ] **Phase 34: Narrative UI Integration** - Sell commands, hotbar in narrative UI, event feed styling
- [ ] **Phase 35: Dynamic Equipment Generation** - Level-scaled equipment drops replacing hardcoded gear definitions
- [ ] **Phase 36: Ability Expansion** - Extend ability kinds to cover all game systems with server and client dispatch
- [ ] **Phase 37: UX Polish** - Global font scaling and group info readability

## Phase Details

### Phase 31: Test Infrastructure
**Goal**: Developers can safely modify combat, inventory, and intent routing with confidence that regressions are caught
**Depends on**: Nothing (first phase of v2.1)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06
**Success Criteria** (what must be TRUE):
  1. A single shared mock DB utility exists and all test files use it (no duplicate mock implementations)
  2. Combat test suite catches regressions in damage formulas, healing, DoT/HoT tick values, death triggers, and crit calculations
  3. Item/inventory tests verify equip, unequip, sell (with perk bonuses), and drop flows
  4. Intent routing tests verify command parsing dispatches to correct handlers for all registered commands
  5. Equipment generation tests verify rarity rolling, affix selection, and stat scaling produce valid items
**Plans**: 3 plans

Plans:
- [ ] 31-01-PLAN.md -- Shared mock DB utility, refactor existing tests, event logging tests
- [ ] 31-02-PLAN.md -- Combat regression tests (formulas, effects, attack outcomes)
- [ ] 31-03-PLAN.md -- Item/inventory tests, equipment generation tests, intent routing tests

### Phase 32: Dead Code Removal
**Goal**: Codebase is smaller, cleaner, and free of v1.0 legacy artifacts -- every remaining file is actively used
**Depends on**: Phase 31 (tests verify nothing breaks during removal)
**Requirements**: CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05, CLEAN-06
**Success Criteria** (what must be TRUE):
  1. All files listed in MEMORY.md deletion list are removed and the project compiles without errors
  2. Implicit mechanical rules from item_defs.ts (armor class restrictions, stat ranges, slot vocabulary) are captured in mechanical_vocabulary.ts
  3. Backend has no duplicated sell/combat/economy logic -- shared helpers exist and all call sites use them
  4. Frontend has no redundant components doing the same thing (legacy panels alongside narrative equivalents removed)
  5. Import graph is clean -- no broken or circular imports after all removals
**Plans**: TBD

Plans:
- [ ] 32-01: TBD
- [ ] 32-02: TBD

### Phase 33: Combat Improvements
**Goal**: Players see complete, informative combat feedback and encounter balanced difficulty
**Depends on**: Phase 31 (combat tests enable safe rebalancing), Phase 32 (clean codebase)
**Requirements**: COMB-01, COMB-02, COMB-03, COMB-04, COMB-05, COMB-06, COMB-07
**Success Criteria** (what must be TRUE):
  1. Player sees per-tick damage/healing entries in the combat log with effect name and amount for every DoT and HoT
  2. Player sees buff/debuff application and expiration entries in the combat log with stat, magnitude, and duration
  3. Enemy HUD shows active DoT, HoT, and debuff icons with remaining duration countdown
  4. Player can engage multiple enemy groups simultaneously without combat state corruption
  5. Damage and healing constants are tuned and validated by passing test assertions
**Plans**: TBD

Plans:
- [ ] 33-01: TBD
- [ ] 33-02: TBD

### Phase 34: Narrative UI Integration
**Goal**: Players can sell items and manage hotbars entirely through the narrative console with styled event feedback
**Depends on**: Phase 32 (dead code removed, shared helpers exist)
**Requirements**: NARR-01, NARR-02, NARR-03, NARR-04, NARR-05
**Success Criteria** (what must be TRUE):
  1. Player can type `sell <item>` and the item is sold with correct gold calculation including perk bonuses
  2. Player can type `sell all junk` or `sell 3 <item>` for bulk sales with a summary of what was sold
  3. Hotbar is visible in the narrative combat HUD showing ability slots with cooldown timers
  4. Player can type `hotbar set 1 <ability>` and `hotbar swap 1 3` to manage ability slots
  5. Event feed entries are color-coded by kind (combat=red, reward=gold, system=gray, social=blue)
**Plans**: TBD

Plans:
- [ ] 34-01: TBD
- [ ] 34-02: TBD

### Phase 35: Dynamic Equipment Generation
**Goal**: Equipment drops are unique, level-appropriate, and dynamically generated -- no more selecting from a static pool
**Depends on**: Phase 32 (mechanical vocabulary extracted), Phase 33 (combat math stabilized)
**Requirements**: EQUIP-01, EQUIP-02, EQUIP-03, EQUIP-04, EQUIP-05
**Success Criteria** (what must be TRUE):
  1. Defeating an enemy drops equipment with stats scaled to enemy level and world tier
  2. Generated equipment stats (AC, damage, bonuses) are computed from formulas, not looked up from hardcoded tables
  3. Quest reward equipment is dynamically generated matching the quest difficulty tier
  4. The static WORLD_DROP_GEAR_DEFS constant is gone, replaced by a generation function
  5. Generated equipment names use the existing prefix/suffix affix system
**Plans**: TBD

Plans:
- [ ] 35-01: TBD
- [ ] 35-02: TBD

### Phase 36: Ability Expansion
**Goal**: The ability system covers all game systems -- players can discover crafting, gathering, travel, and social abilities
**Depends on**: Phase 32 (mechanical vocabulary complete), Phase 33 (combat dispatch stable)
**Requirements**: ABIL-01, ABIL-02, ABIL-03, ABIL-04
**Success Criteria** (what must be TRUE):
  1. mechanical_vocabulary.ts includes ability kinds for combat, crafting, gathering, travel, and social systems
  2. Server dispatch handles all new ability kinds (resurrect, corpse_summon, track, group_heal, craft_boost, gather_boost, travel_speed, haggle)
  3. Skill generation at level-up can produce non-combat abilities appropriate to the player's class and context
  4. Client ability dispatch renders and activates all new ability kinds without hardcoded special cases
**Plans**: TBD

Plans:
- [ ] 36-01: TBD

### Phase 37: UX Polish
**Goal**: Players can customize text size for comfortable reading across all UI elements
**Depends on**: Nothing (independent of other phases)
**Requirements**: UX-01, UX-02, UX-03, COMB-08
**Success Criteria** (what must be TRUE):
  1. Player can increase and decrease the global font size of the entire application
  2. Font size preference persists across browser sessions via localStorage
  3. Group info panel text is sized for readability at all font scale settings
**Plans**: TBD

Plans:
- [ ] 37-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 31 -> 32 -> 33 -> 34 -> 35 -> 36 -> 37

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-23 | v1.0 | All | Complete | 2026-02-25 |
| 24-30 | v2.0 | 22/22 | Complete | 2026-03-09 |
| 31. Test Infrastructure | 1/3 | In Progress|  | - |
| 32. Dead Code Removal | v2.1 | 0/? | Not started | - |
| 33. Combat Improvements | v2.1 | 0/? | Not started | - |
| 34. Narrative UI Integration | v2.1 | 0/? | Not started | - |
| 35. Dynamic Equipment Generation | v2.1 | 0/? | Not started | - |
| 36. Ability Expansion | v2.1 | 0/? | Not started | - |
| 37. UX Polish | v2.1 | 0/? | Not started | - |

---
*Last updated: 2026-03-09 after phase 31 planning*
