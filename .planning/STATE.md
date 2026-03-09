---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Project Cleanup
status: in-progress
stopped_at: Completed 32-03-PLAN.md
last_updated: "2026-03-09T19:03:14.000Z"
last_activity: 2026-03-09 -- Completed 32-01 extract rules and rewire imports
progress:
  total_phases: 7
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
  percent: 88
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-09)

**Core value:** A world that writes itself around its players -- every character is unique, every region is discovered, and the narrative responds to what players actually do.
**Current focus:** Phase 32 - Dead Code Removal

## Current Position

Phase: 32 of 37 (Dead Code Removal)
Plan: 3 of 3 (32-03 complete)
Status: In Progress
Last activity: 2026-03-09 -- Completed 32-03 legacy frontend panels cleanup

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

### Pending Todos

None.

### Blockers/Concerns

- SpacetimeDB procedures are beta -- load test early before building on them
- **NO PUSHES TO MASTER** -- production auto-deploys from master; all work stays local until user approves
- **NO PUSHES TO MAINCLOUD** -- local SpacetimeDB only until user says otherwise

## Session Continuity

Last session: 2026-03-09T19:03:14.000Z
Stopped at: Completed 32-03-PLAN.md
