---
created: 2026-10-09T09:00:00.000Z
title: Perk damage skips enemy shields (absorbEnemyShield)
area: general
files:
  - spacetimedb/src/helpers/combat_perks.ts (~L56-60, ~L73-76, ~L128-130, the active damage perk)
  - spacetimedb/src/helpers/enemy_damage_sites.test.ts (pins these four writes as a known gap)
---

## Problem

Phase 51.3.1.1 (Plans 04/05) made enemy shields absorb every player-sourced damage write through `absorbEnemyShield`, except four perk writes in `combat_perks.ts` (bonus strike, flat bonus, on-kill area hit, active damage perk). An enemy support member's ward does not stop perk damage. Found by Plan 05 (deferred-items row 1); flagged again by the phase verifier.

## Solution

Call `absorbEnemyShield(ctx, combatId, enemy, damage)` before each perk write lowers enemy HP; remove them from the known-gap allow list in `enemy_damage_sites.test.ts`; add tests. Small, server-only. Candidate home: Phase 51.3.2 (combat rounds work) or a quick task.
