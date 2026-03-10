---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Project Cleanup
status: executing
stopped_at: Completed quick-404-01-PLAN.md
last_updated: "2026-03-10T19:04:16.320Z"
last_activity: "2026-03-10 - Completed quick task 404: Sardonic welcome message"
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 14
  completed_plans: 12
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
Last activity: 2026-03-10 - Completed quick task 404: Sardonic welcome message

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
- [Phase 33-05]: Combat enemy targeting takes priority over pull in clickNpcKeyword: combatEnemiesList checked first, then availableEnemies for mid-combat pull
- [Phase 33-combat-improvements]: CREATION_ABILITY_SCHEMA now uses 'kind' field matching SKILL_GENERATION_SCHEMA; backward compat via chosen.effect fallback for cached creation states
- [Phase 034]: Extracted KIND_COLORS to NarrativeMessage.colors.ts -- Vue SFC script setup cannot export named symbols
- [Phase 034]: sell intent commands apply getPerkBonusByField before computeSellValue for correct stacking order
- [Phase 034]: ensureDefaultHotbar creates 'main' hotbar lazily on first use
- [Phase 034]: hotbar switch pattern uses negative lookahead to avoid conflicts with subcommands

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
| 393 | Pin starter region danger to L1, share starter regions by race | 2026-03-10 | b8ee016 | [393-weight-level-1-enemies-in-starting-regio](./quick/393-weight-level-1-enemies-in-starting-regio/) |
| 394 | Apply gold formatting to all narrative command headers and add inv descriptions | 2026-03-10 | 91ce26f | [394-apply-gold-formatting-to-all-narrative-c](./quick/394-apply-gold-formatting-to-all-narrative-c/) |
| 395 | Remove slash prefix from non-admin commands, add clickable who names and group status | 2026-03-10 | 4ea2b89 | [395-remove-slash-prefix-from-non-admin-comma](./quick/395-remove-slash-prefix-from-non-admin-comma/) |
| 396 | Fix debuff targeting (buff+debuff effectType hits caster) and HoT double-heal | 2026-03-10 | 1c01d75 | [396-fix-combat-targeting-debuffs-hit-caster-](./quick/396-fix-combat-targeting-debuffs-hit-caster-/) |
| 397 | Rebalance combat so solo player can reliably defeat equal-level enemies | 2026-03-10 | fddbf32 | [397-rebalance-combat-so-solo-player-can-reli](./quick/397-rebalance-combat-so-solo-player-can-reli/) |
| 398 | Deferred level-up: pendingLevels counter, apply_level_up reducer, HUD indicator + confirmation flow | 2026-03-10 | cefaa2a | [398-delayed-level-up-save-level-ups-for-manu](./quick/398-delayed-level-up-save-level-ups-for-manu/) |
| 399 | Add hotbar delete command | 2026-03-10 | 744d550 | [399-add-a-hotbar-delete-command](./quick/399-add-a-hotbar-delete-command/) |
| 400 | Add enemies and players commands to narrative input | 2026-03-10 | e113ae3 | [400-add-enemies-and-players-commands](./quick/400-add-enemies-and-players-commands/) |
| 401 | Rebalance abilities to ~20 damage at level 1 (ABILITY_DAMAGE_SCALER=30n, HEALING_POWER_SCALER=65n) | 2026-03-10 | eb96aff | [401-rebalance-abilities-20-dmg-at-level1](./quick/401-rebalance-abilities-20-dmg-at-level1/) |
| 402 | Show level up link in header, walk through 1 level at a time | 2026-03-10 | 49802c7 | [402-level-up-header-link-and-multi-level](./quick/402-level-up-header-link-and-multi-level/) |
| 403 | Fix DoT abilities: apply periodic ticks and show DoT indicator on enemies | 2026-03-10 | 29cf266 | [403-fix-dot-abilities-apply-periodic-ticks-a](./quick/403-fix-dot-abilities-apply-periodic-ticks-a/) |
| 404 | Auto-populate ability to hotbar on creation, rewrite sardonic welcome message | 2026-03-10 | d1aa05d | [404-auto-populate-ability-to-hotbar-on-creat](./quick/404-auto-populate-ability-to-hotbar-on-creat/) |

## Session Continuity

Last session: 2026-03-10T19:04:16.312Z
Stopped at: Completed quick-404-01-PLAN.md
