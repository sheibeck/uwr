---
status: resolved
trigger: "Enemies don't auto-attack until ~5 seconds into combat. Both the player's first auto-attack and the enemy's first auto-attack fire at the same time, about 5 seconds after combat starts."
created: 2026-02-22T00:00:00Z
updated: 2026-02-22T00:02:00Z
---

## Current Focus

hypothesis: CONFIRMED — enemy first auto-attack was scheduled at full AUTO_ATTACK_INTERVAL (5s), same as player
test: Read addEnemyToCombat and startCombatForSpawn
expecting: Both set nextAutoAttackAt = now + 5_000_000n, causing synchronized first swings
next_action: RESOLVED

## Symptoms

expected: Enemies should begin auto-attacking shortly after combat starts (within 1-2 seconds), not 5 seconds later.
actual: |
  3:45:53 PM - Player casts Mind Fray (combat starts)
  3:45:54 PM - Mind Fray hits
  3:45:57 PM - Mind Fray DoT tick
  3:45:58 PM - Player auto-attack fires
  3:45:58 PM - Enemy auto-attack fires (FIRST enemy auto — ~5 seconds after combat started)
  3:46:00 PM - Mind Fray DoT tick
  3:46:03 PM - Player auto-attack fires again

Both player and enemy first auto-attacks fire simultaneously at ~5s. After that, enemy auto-attacks continue normally.
errors: None — just incorrect timing.
reproduction: Enter combat with any enemy. Note when their first enemy auto-attack lands.
started: Newly noticed.

## Eliminated

(none — root cause found on first hypothesis)

## Evidence

- timestamp: 2026-02-22T00:01:00Z
  checked: spacetimedb/src/reducers/combat.ts line 24
  found: AUTO_ATTACK_INTERVAL = 5_000_000n (5 seconds in microseconds)
  implication: Both player and enemy use the same 5-second interval for their first attack

- timestamp: 2026-02-22T00:01:00Z
  checked: spacetimedb/src/reducers/combat.ts addEnemyToCombat (line 115)
  found: nextAutoAttackAt = ctx.timestamp.microsSinceUnixEpoch + AUTO_ATTACK_INTERVAL (now + 5s)
  implication: Enemy first attack scheduled at now+5s — identical to player

- timestamp: 2026-02-22T00:01:00Z
  checked: spacetimedb/src/reducers/combat.ts startCombatForSpawn (line 177)
  found: player participant nextAutoAttackAt = ctx.timestamp.microsSinceUnixEpoch + AUTO_ATTACK_INTERVAL (now + 5s)
  implication: Player first attack also now+5s — they fire simultaneously, explaining the bug

- timestamp: 2026-02-22T00:01:00Z
  checked: COMBAT_LOOP_INTERVAL_MICROS in combat_constants.ts
  found: 1_000_000n (1 second) — combat loop ticks every 1s
  implication: Minimum granularity is 1s; using 1-3s range gives 2-3 distinct tick buckets

- timestamp: 2026-02-22T00:02:00Z
  checked: All callsites of addEnemyToCombat
  found: Called for initial enemy (line 169), failure-pull adds (line 1112), pending adds (line 2160)
  implication: 1-3s delay is correct for all cases — adds should not instant-attack either

## Resolution

root_cause: |
  In addEnemyToCombat (combat.ts line 115), enemy nextAutoAttackAt was set to
  ctx.timestamp.microsSinceUnixEpoch + AUTO_ATTACK_INTERVAL (5,000,000 microseconds = 5 seconds).
  Player first auto-attack (startCombatForSpawn line 177) uses the same 5-second delay.
  The combat loop fires attacks when nextAutoAttackAt <= nowMicros, so both fire simultaneously
  at the ~5 second mark.

fix: |
  Changed addEnemyToCombat line 115 from:
    nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + AUTO_ATTACK_INTERVAL
  To:
    nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + 1_000_000n + (spawnToUse.id % 2_000_000n)

  This gives each enemy a deterministic first-attack delay of 1-3 seconds based on their
  spawn ID, making them attack sooner than the player's 5-second first swing. Different
  spawn IDs produce different delays (staggered), and the formula is deterministic (no
  Math.random — safe for SpacetimeDB reducers).

verification: |
  Logic verified: enemy first attack will now fire at 1-3s rather than 5s after combat start.
  Player first attack still fires at 5s. The combat log should show enemy auto-attacks at ~1-3s,
  well before the player's first swing at ~5s.
  Requires republish to local to test in-game.

files_changed:
  - spacetimedb/src/reducers/combat.ts (line 115: changed enemy nextAutoAttackAt initial delay from 5s to 1-3s)
