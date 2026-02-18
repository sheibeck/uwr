---
phase: quick-177
plan: 01
subsystem: loot
tags: [spacetimedb, loot-tables, affixes, gear-parity, world-drops]

requires:
  - phase: quick-160
    provides: T2 gear templates (ensureWorldDropGearTemplates) and T1 other-slot templates
  - phase: 14-loot-gear-progression
    provides: affix catalog, generateAffixData, quality tier rolling

provides:
  - Rare dropped gear total affix magnitude raised to 4n (parity with crafted reinforced)
  - T2 gear seeded into loot tables for mid/high-tier terrains (mountains, town, city, dungeon)
  - BigInt serialization bug fixed in generateLootTemplates (affixes no longer panic combat_loop)

affects: [loot-tables, crafting-parity, combat-loop, gear-progression]

tech-stack:
  added: []
  patterns:
    - "Separate T2 gear loop after main terrain loop in ensureLootTables (mirrors ensureMaterialLootEntries pattern)"
    - "Convert BigInt affix magnitudes to Number before JSON.stringify; BigInt() cast on parse restores precision"

key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/items.ts
    - spacetimedb/src/seeding/ensure_enemies.ts
    - spacetimedb/src/reducers/combat.ts

key-decisions:
  - "Rare affix budget cap raised from 2n to 4n: matches crafted reinforced gear (2 slots x 2n = 4n total)"
  - "T2 gear weight 3n in mid/high-tier tables (vs 6n for T1) — less common but present at those tiers"
  - "T1 other-slot gear (head/wrists/hands/belt/offHand) confirmed already in loot tables — ensureCraftingBaseGearTemplates (line 95) runs before ensureLootTables (line 107) in syncAllContent"
  - "HP affix asymmetry (drops 5n-15n vs crafted 1n-3n) documented as intentional — drops are random, crafting is deterministic choice"
  - "BigInt affix magnitudes serialized as Number in JSON; take_loot already expected number type and called BigInt() on parse"

duration: 4min
completed: 2026-02-18
---

# Quick Task 177: Validate Gear Drop Parity Summary

**Rare affix budget raised to 4n matching crafted reinforced gear, T2 gear added to mid/high-tier loot tables, and pre-existing BigInt serialization panic in combat_loop fixed.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-18T14:47:03Z
- **Completed:** 2026-02-18T14:50:10Z
- **Tasks:** 2 (Task 1 audit read-only, Task 2 code + publish)
- **Files modified:** 3

## Accomplishments

- Confirmed all 6 parity findings from plan with actual file reads — seeding order, affix counts, HP asymmetry, rare cap, T2 gap, slot coverage
- Raised rare affix budget cap from 2n to 4n so rare world-drops match crafted reinforced gear in total affix magnitude
- Added T2 gear templates (tier=2n, requiredLevel<=20) to mountains/town/city/dungeon loot tables with weight 3n
- Fixed pre-existing BigInt serialization panic that caused combat_loop to crash whenever a non-common item dropped

## Task Commits

1. **Task 1: Audit and document all parity findings** — read-only audit, no commit (no code changes)
2. **Task 2: Fix confirmed parity gaps** — `ee95c9d` (feat)

## Files Created/Modified

- `spacetimedb/src/helpers/items.ts` — Rare affix budget cap: `remaining = 2n` → `remaining = 4n`
- `spacetimedb/src/seeding/ensure_enemies.ts` — Added `t2GearTemplates` filter + T2 gear loop for mid/high-tier terrains at end of ensureLootTables
- `spacetimedb/src/reducers/combat.ts` — Fixed `JSON.stringify(affixes)` to convert BigInt magnitudes to Number before serialization

## Decisions Made

- **Rare cap 4n:** Crafted reinforced gear uses 2 modifier slots with magnitude 2n each = 4n total. Rare drops should match. Previous cap of 2n made rare drops strictly weaker than crafted equivalents.
- **T2 weight 3n vs T1 weight 6n:** T2 gear is rarer than T1 in mid/high-tier zones to maintain incentive for both gear tiers. Jewelry stays at 1n.
- **No fix for HP affix asymmetry:** HP on drops (5n-15n range) vs crafted HP (1n-3n via Life Stone) is intentional — crafting offers deterministic stat choice, drops offer random higher values. Acceptable asymmetry by design.
- **T1 other-slot coverage:** Finding 6 from the plan was confirmed as non-issue. ensureCraftingBaseGearTemplates runs 12 lines before ensureLootTables in syncAllContent, so all helm/bracers/gauntlets/belt/offHand templates are in the database when the filter runs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed BigInt serialization panic in generateLootTemplates**
- **Found during:** Task 2 (post-publish log check)
- **Issue:** `JSON.stringify(affixes)` at combat.ts:632 panics with "Do not know how to serialize a BigInt" because `generateAffixData` returns `magnitude: bigint`. This caused all non-common gear drops to panic the combat_loop reducer. The panic appeared in logs at 14:36:19 (before our publish).
- **Fix:** Added `.map((a) => ({ ...a, magnitude: Number(a.magnitude) }))` before `JSON.stringify`. The `take_loot` reducer already expected `magnitude` as `number` (line 296 in items.ts) and called `BigInt(affix.magnitude)` when inserting into ItemAffix table — so this is the correct expected format.
- **Files modified:** spacetimedb/src/reducers/combat.ts
- **Verification:** Module builds and publishes cleanly; no further panic in logs after republish
- **Committed in:** ee95c9d (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** The BigInt fix was essential — without it, any non-common gear drop would crash combat. This is a correctness requirement, not scope creep.

## Issues Encountered

- `ensure_world.ts` had auto-formatter changes (`.js` extension additions to imports) triggered by build tool. Reverted before commit to keep diff minimal.

## Next Phase Readiness

- Gear drop parity aligned: rare drops (4n) match crafted reinforced (4n)
- T2 gear now accessible via world drops for level 11+ players in mid/high-tier zones
- All equipment slots (head, wrists, hands, belt, offHand) were already in loot tables — no additional fix needed
- Module published cleanly and running on local server

---
*Phase: quick-177*
*Completed: 2026-02-18*
