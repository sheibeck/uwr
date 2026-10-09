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
| 7 | Plan 08 | `helpers/combat_rewards.ts` (~L225, ~L241) still inserts `enemy_respawn_tick` rows after kills; they drain harmlessly through the guarded no-op `respawn_enemy`. | Plan 11 or 27: stop the inserts |
| 8 | Plan 08 | `relevelLegacySpawns` has no production caller; `DEFAULT_LOCATION_SPAWNS` is still exported and imported by `index.ts`. Two doc comments in `helpers/families.ts` (L9, L539) still name the deleted spawn functions. | Plan 27 cleanup |
| 9 | Plan 08 | `pickUpQuestItem` aggro still looks for an `enemy_spawn`, so quest-item aggro finds nothing until Plan 11's pool draw; `start_combat` still uses `ensureAvailableSpawn` / `spawnEnemy`. | Plan 11 (pool draw) / Plan 27 (retire) |
| 10 | Plan 08 | Fixed by the coordinator (a12c3b65): `helpers/online.test.ts` single-writer guard now allows the test fixture `helpers/pool_fixture.ts`. | done |
| 11 | Plan 11 | PROPOSED refusal copy kept in `reducers/pools.ts` `PULL_REFUSALS` ("That is not here.", "Nothing will fight you here.", "You are already in a fight.", "Finish gathering first.") and "That enemy is not here to fight." in `start_combat`. | Plan 27 copy review (D-58) |
| 12 | Plan 11 | `ensureAvailableSpawn` and `spawnEnemy` have no production caller in `combat.ts`. | Plan 16 or 27 cleanup |
| 13 | Plan 11 | Typed `loot <item>` intent did not pass `startCombat` to `pickUpQuestItem`, so no quest-item ambush from the typed path. | assigned to Plan 13 (lists intent.ts) |
| 14 | Plan 11 | `pull_family` reaches `src/module_bindings` only at Plan 17's regeneration. | Plan 17 |
| 15 | Plan 17 | Live migration links every family of a region to every non-safe place that had its templates, so each host place carries all three of its region's families (D-25 grouping by creature type). Variety per place may feel flat; worth a look in the code review / UAT, possibly thin the links by terrain fit. | closed: owner will regenerate the world from scratch (D-67); new regions use D-67 |
| 16 | Plan 17 | 36 server-made filler member names ("<Noun> Raider/Warder/Mender/Hexer", e.g. "Skitterer Mender") are visible in examine and on fight cards. | Plan 27 copy review (D-58) |
| 17 | Plan 16 | New PROPOSED copy: `Safety:` label, `Members:` label, family examine line, plural `con` threat lines ("Goblins look dangerous."), `Population: {Word}.` suffix. | Plan 27 copy review (D-58) |
