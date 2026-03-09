---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Project Cleanup
status: executing
stopped_at: Completed 33-02-PLAN.md
last_updated: "2026-03-09T23:30:03.272Z"
last_activity: "2026-03-09 - Completed quick task 392: Restore quest formatting, add rich styling to renown/factions/events"
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 9
  completed_plans: 7
  percent: 88
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-09)

**Core value:** A world that writes itself around its players -- every character is unique, every region is discovered, and the narrative responds to what players actually do.
**Current focus:** Phase 33 - Combat Improvements

## Current Position

Phase: 33 of 37 (Combat Improvements)
Plan: 1 of 3 (33-01 complete)
Status: In Progress
Last activity: 2026-03-09 - Completed 33-01: Combat log narrative messages and balance tuning

Progress: [████████░░] 88%

## Previous Milestones

- v1.0 RPG Milestone -- Phases 1-23 (shipped 2026-02-25)
- v2.0 The Living World -- Phases 24-30 (shipped 2026-03-09)

See MILESTONES.md for full delivery summaries.

## Accumulated Context

### Decisions

(Archived with v2.0 milestone. See .planning/milestones/v2.0-ROADMAP.md for full decision log.)

- v2.1: COMB-08 (group info readability) assigned to Phase 37 (UX Polish) rather than Phase 33 (Combat) -- it is purely visual, not combat logic
- [Phase 31]: by_owner index maps to ownerId by default in shared mock DB
- [Phase 31]: Integration flow tests compose pure helpers + mock DB rather than testing resolveAbility directly
- [Phase 31]: Mock item data uses dual ownerId/ownerCharacterId to bridge mock index mapping with production insert
- [Phase 31]: Intent routing tests isolate regex patterns rather than testing full dispatch
- [Phase 32]: Kept CONSUMABLE_RECIPES/GEAR_RECIPES in crafting_materials.ts -- only seeding imports them
- [Phase 32]: Removed sync_all_content reducer from items.ts -- admin /synccontent serves same purpose
- [Phase 32]: Kept syncAllContent in init alongside initScheduledTables for backward compatibility
- [Phase 32]: Kept useCharacterCreation.ts with narrative creation flow -- only old form-based code was dead
- [Phase 32]: Deleted 5 additional orphaned components beyond planned 4 (CharacterActionsPanel, HotbarPanel, PanelShell, CommandBar, LogWindow)
- [Phase 32]: Relocated ensureStarterItemTemplates to helpers/items.ts -- still needed by grantStarterItems for character creation
- [Phase 32]: Replaced syncAllContent in init with targeted ensureRaces + ensureWorldState + ensureStarterItemTemplates
- [Phase 32]: Extracted computeSellValue to helpers/economy.ts to deduplicate vendor sell price calculation
- [Phase quick-392]: Removed client-side quests handler to restore server-side rich formatting
- [Phase 33]: Replaced requirePullerOrLog with direct group_member lookup for simpler group ID resolution
- [Phase 33]: Mid-combat pull adds enemies via addEnemyToCombat; kept set_group_puller reducer to avoid schema changes
- [Phase 33-01]: ABILITY_DAMAGE_SCALER at 50n as primary combat duration lever -- auto-attacks unaffected
- [Phase 33-01]: MANA_COST_MULTIPLIER at 150n to differentiate mana vs stamina economy
- [Phase 33-01]: Mana cast time floor enforced at resolution time, not generation time
- [Phase 33-01]: Buff/debuff event kinds separate from damage/heal for independent color control

### Pending Todos

None.

### Blockers/Concerns

- SpacetimeDB procedures are beta -- load test early before building on them
- **NO PUSHES TO MASTER** -- production auto-deploys from master; all work stays local until user approves
- **NO PUSHES TO MAINCLOUD** -- local SpacetimeDB only until user says otherwise

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 392 | Restore quest formatting, add rich styling to renown/factions/events | 2026-03-09 | c279d2e | [392-restore-quest-formatting-and-add-matchin](./quick/392-restore-quest-formatting-and-add-matchin/) |

## Session Continuity

Last session: 2026-03-09T23:31:00Z
Stopped at: Completed 33-01-PLAN.md
