---
phase: quick-93
plan: 01
subsystem: death-corpse-system
tags: [backend, refactor, resurrection, corpse-summon, necromancer, summoner]
dependency-graph:
  requires: [quick-92, 11-02]
  provides: [unified-spell-cast-table, necromancer-corpse-summon, summoner-corpse-summon]
  affects: [resurrection-system, corpse-system, class-abilities]
tech-stack:
  added: [PendingSpellCast table with spellType discriminator]
  patterns: [table-unification, class-based-ability-routing, flat-mana-costs]
key-files:
  created: []
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/reducers/corpse.ts
    - spacetimedb/src/data/abilities/cleric_abilities.ts
    - spacetimedb/src/data/abilities/necromancer_abilities.ts
    - spacetimedb/src/data/abilities/summoner_abilities.ts
    - spacetimedb/src/index.ts
decisions:
  - id: unified-spell-cast-table
    summary: "Merged PendingResurrect and PendingCorpseSummon into single PendingSpellCast table with spellType discriminator"
    rationale: "Eliminates code duplication, simplifies architecture, makes adding future spell casts easier"
  - id: corpse-summon-class-shift
    summary: "Moved Corpse Summon from Cleric to Necromancer and Summoner at level 6"
    rationale: "Better thematic fit - necromancers and summoners manipulate entities, clerics focus on healing/resurrection"
  - id: flat-mana-costs-no-cooldowns
    summary: "Changed to flat mana costs (50 resurrect, 60 corpse summon) with 0 cooldown, added 10s cast time"
    rationale: "Resource-gated abilities feel more skill-based than time-gated, cast time prevents spam"
metrics:
  duration: 4min
  tasks: 2
  files: 6
  commits: 2
  completed: 2026-02-14
---

# Phase quick Plan 93: Refactor Resurrection & Corpse Summon Summary

**One-liner:** Unified spell-cast table architecture, moved Corpse Summon to Necromancer/Summoner, switched from cooldown-gated to mana-gated with cast times.

## What Was Done

### Task 1: Merge tables and update ability catalog
**Commit:** 0adc737

Replaced two near-identical tables (`PendingResurrect`, `PendingCorpseSummon`) with unified `PendingSpellCast` table:
- Added `spellType` discriminator field ('resurrect' | 'corpse_summon')
- Made `corpseId` optional (only used for resurrect)
- Updated schema export and index.ts imports

Moved `corpse_summon` from Cleric to Necromancer and Summoner:
- Removed `cleric_corpse_summon` (was level 7)
- Added `necromancer_corpse_summon` at level 6
- Added `summoner_corpse_summon` at level 6

Updated both abilities:
- `cooldownSeconds: 0n` (no cooldowns)
- `castSeconds: 10n` (10 second cast time)
- Updated descriptions to mention mana costs

### Task 2: Refactor all reducers
**Commit:** bf1fad9

Updated all 6 spell-cast reducers (`initiate_resurrect`, `accept_resurrect`, `decline_resurrect`, `initiate_corpse_summon`, `accept_corpse_summon`, `decline_corpse_summon`):
- Replaced `ctx.db.pendingResurrect` / `ctx.db.pendingCorpseSummon` with `ctx.db.pendingSpellCast`
- Added `spellType` verification in all accept/decline reducers
- Changed resurrect mana cost from formula (16) to flat 50n
- Changed corpse summon mana cost from formula (18) to flat 60n
- Removed all `abilityCooldown.insert` blocks (both abilities now 0 cooldown)
- Updated corpse summon class check: from cleric level 7+ to necromancer/summoner level 6+
- Added dynamic ability key lookup: `${caster.className}_corpse_summon`
- Fixed corpseId handling with optional type (undefined for corpse_summon)

## Deviations from Plan

None - plan executed exactly as written.

## Technical Decisions

### 1. SpellType discriminator pattern
Used string literal union type ('resurrect' | 'corpse_summon') instead of enum or numeric type. Provides type safety with minimal overhead and makes debugging easier (readable string values in database).

### 2. Optional corpseId field
Made `corpseId: t.u64().optional()` since corpse summon doesn't target a specific corpse. Cleaner than using sentinel values like 0n.

### 3. Dynamic ability key construction
Used `` `${caster.className}_corpse_summon` `` for ability template lookup. Enables code reuse across necromancer and summoner without duplicating logic.

### 4. Flat mana costs
Replaced formula-based costs with flat values (50 for resurrect, 60 for corpse summon). Simpler, more predictable, easier to balance.

## Verification Results

All verification checks passed:
- ✓ Zero references to `PendingResurrect` or `PendingCorpseSummon` anywhere in codebase
- ✓ `PendingSpellCast` appears in schema export and all reducers
- ✓ `cleric_resurrect`: 0n cooldown, 10n cast time
- ✓ `necromancer_corpse_summon` exists at level 6
- ✓ `summoner_corpse_summon` exists at level 6
- ✓ `cleric_corpse_summon` removed (0 references)
- ✓ No `abilityCooldown.insert` calls in corpse.ts
- ✓ Resurrect costs 50n mana (2 occurrences: initiate + accept)
- ✓ Corpse summon costs 60n mana (2 occurrences: initiate + accept)
- ✓ Necromancer/summoner class check in place

## Self-Check: PASSED

All files modified exist:
- FOUND: spacetimedb/src/schema/tables.ts
- FOUND: spacetimedb/src/reducers/corpse.ts
- FOUND: spacetimedb/src/data/abilities/cleric_abilities.ts
- FOUND: spacetimedb/src/data/abilities/necromancer_abilities.ts
- FOUND: spacetimedb/src/data/abilities/summoner_abilities.ts
- FOUND: spacetimedb/src/index.ts

All commits exist:
- FOUND: 0adc737 (Task 1)
- FOUND: bf1fad9 (Task 2)

## Impact

**Database schema:** Breaking change - `PendingResurrect` and `PendingCorpseSummon` tables removed, replaced with `PendingSpellCast`. Requires `--clear-database` publish.

**Cleric class:** Lost Corpse Summon ability (was level 7). Keeps Resurrect at level 6 with improved usability (no cooldown, mana-gated).

**Necromancer/Summoner classes:** Gained Corpse Summon at level 6. Thematically appropriate for entity-manipulation classes.

**Gameplay balance:** Both spells now resource-gated (mana) instead of time-gated (cooldowns). 10s cast time prevents spam. Players must manage mana pools rather than waiting for arbitrary timers.

## Next Steps

1. Publish module with `--clear-database` flag (breaking schema change)
2. Regenerate client bindings
3. Test resurrection flow: Cleric level 6+ can resurrect at corpse location
4. Test corpse summon flow: Necromancer/Summoner level 6+ can summon corpses from any location
5. Verify UI shows pending spell casts correctly (may need client updates)
6. Monitor for issues with spellType routing or optional corpseId handling
