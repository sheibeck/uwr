# Phase 12: Overall Renown System - Context

**Gathered:** 2026-02-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Character-wide renown progression system separate from faction standing. Players accumulate renown through various activities (events, bosses, achievements, quests), unlock named ranks with associated perks. Includes rank structure, perk unlocking mechanics, renown gain integration points, and dedicated UI panel.

Full world boss mechanics (Phase 17) and event spawning system (Phase 18) are separate phases. Phase 12 builds the renown infrastructure and integration hooks.

</domain>

<decisions>
## Implementation Decisions

### Rank structure and thresholds
- 15 named ranks (deep progression system for long-term engagement)
- Stepped curve with 5 tiers: ranks 1-3, 4-6, 7-9, 10-12, 13-15
- Each tier has different threshold scaling (frequent difficulty shifts, varied pacing)
- Named ranks (e.g., Initiate, Veteran, Legend) - not numbered ranks

### Perk system design
- Mix of passive stat bonuses and active abilities (cooldown-based special abilities)
- Choice from pool: each rank offers 2-3 perk options, player picks one (builds variety)
- Unlimited active perks - all chosen perks are active simultaneously
- Permanent choices - no respec system (choices matter, creates alt character value)

### Renown gain sources
**Sources:**
- World events participation
- World boss kills
- Achievement milestones
- Quest completion

**Reward structure (prestige-oriented):**
- Server-first bonuses: first player(s) to kill a boss, complete a quest, or discover something get large renown bonuses
- Diminishing returns: subsequent players get reduced rewards (2nd place < 1st, 3rd < 2nd, etc.)
- Event participation-based rewards: contribution-scaled renown from world events
- Baseline personal-first rewards: players get modest renown for their own first-time boss kill or quest completion (casual-friendly)
- Mostly one-time rewards: achievements and first kills are finite, not grindable

**Server-first tracking:**
- Global announcements in event log: "[Player] was first to slay [Boss]!" visible to all players
- Hall of Fame / Leaderboard: dedicated UI showing who achieved server-firsts and when

### UI presentation
- Dedicated Renown panel (separate floating window, not integrated into Character panel)
- Perk selection flow: notification appears immediately on rank up, but player can dismiss and choose from Renown panel later (not forced choice)
- Progress visualization: linear progress bar with current rank name displayed
- Perk display format: Claude's discretion (choose based on unlimited active perks model)

### Test content scope
- Include minimal test content within Phase 12:
  - 1 test achievement (manually triggerable or auto-granted for validation)
  - Boss kill hook (integrate with existing combat system to grant renown)
  - Event participation stub (minimal hook for testing, full event system is Phase 18)
- Purpose: validates renown system works end-to-end with minimal test cases
- Full boss/event systems built in Phases 17 and 18

### Claude's Discretion
- Exact threshold values for each of the 5 tiers (design stepped curve for engagement pacing)
- Specific rank names (15 names fitting the Shadeslinger tone)
- Perk pool size and variety (how many perks to offer per rank)
- Specific perk effects and balance (stat bonus values, active ability designs)
- Perk display UI layout (list, grid, or tree structure)
- Exact renown point amounts for each source type
- Diminishing returns curve formula (how quickly bonus drops from 1st to 2nd to 3rd place)
- Leaderboard structure and filtering (all-time, by category, etc.)

</decisions>

<specifics>
## Specific Ideas

- Prestige system emphasizes competition and recognition (server-first announcements, leaderboards)
- Casual-friendly baseline ensures non-competitive players still progress (personal-first rewards)
- Permanent perk choices create meaningful decisions and alt character value (no respec)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-overall-renown-system*
*Context gathered: 2026-02-14*
