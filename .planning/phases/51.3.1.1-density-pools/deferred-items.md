# Phase 51.3.1.1 deferred items (found during execution)

Collected by the coordinator from executor reports. Each needs a home before the phase closes: a later plan, the code review fix pass, or a todo.

| # | Found in | Item | Proposed home |
|---|----------|------|---------------|
| 1 | Plan 05 | Perk damage in `helpers/combat_perks.ts` (bonus strike, flat bonus, on-kill area hit, active damage perk) skips `absorbEnemyShield`, so enemy shields do not absorb it. The enemy-HP source pin lists these four writes as a known gap. | code review fix pass (small, combat correctness) |
| 2 | Plan 05 | A pet killed by an enemy auto-attack keeps its aggro entry; enemy targeting accepts pet entries without checking the pet still exists, so an enemy can idle on a dead pet. Pre-existing. | code review fix pass or todo (999.4 pets) |
| 3 | Plans 04, 05 | Enemy `fear`, `hot` and non-debuff `buff` from AI-written enemy abilities act on the wrong side; `hot` is not an ally kind. Member abilities from family_rules never use these kinds. | todo (999.4 abilities) unless a generated enemy can get them now |
| 4 | Plan 05 | `spawnEnemyWithTemplate` still refuses boss templates with "Named enemies cannot be tracked" (meant for `start_tracked_combat`). Nothing sets `isBoss` today. | Plan 27 (retires `start_tracked_combat`) |
| 5 | Plan 04 | New PROPOSED copy inline in `helpers/combat.ts`: `{caster} mends {ally}.`, `{caster} recovers.`, `{ally} is shielded by {ability}.`, `A ward on {enemy} absorbs {n} damage.` | Plan 27 copy review (D-58) |
| 6 | Plan 07 | `FAMILY_NAME_MARKS` (Grey, Pale, Wild, Dark, Old, Red, Black, Lesser) is PROPOSED copy in `helpers/family_validate.ts`. | Plan 27 copy review (D-58) |
