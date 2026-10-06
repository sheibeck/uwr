---
quick_id: 261006-hbk
status: complete
date: 2026-10-06
commits: [de0d95b8]
---

# Quick Task 261006-hbk Summary: health bar "does not move" when taking damage

## Root cause

Neither the client nor the stored hp was broken. The bar shows the net hp change of each round, and the player's own damage-over-time heals the caster in the same round with no feed line.

- `spacetimedb/src/reducers/combat.ts:2704-2711` (before the fix), `tickEffectsForRound`, enemy DoT branch: every tick of a DoT the player put on an enemy heals the caster `DOT_LIFE_DRAIN_PERCENT` (50%, `data/combat_scaling.ts:144`) of the tick. The heal is written in the same round transaction as the enemy's hits, and no event was posted. It was the only silent heal in a round. Regen effects, Twilight Siphon, HoTs, heals, perk procs and pet heals all post a line.
- Elfansworth (Gloamweaver) opens with Grudge Brand: 9 per tick, so 4 hp back each round. The feed said "Brine Sentinel strikes you for 5 damage" while the bar moved -1. It said "Shoot hits you for 11 damage" while the bar moved -7. Between rounds, in-combat regen adds 2 hp per 8 s. Out of combat it is maxHp / 15 per 8 s, so the bar is full a few seconds after the fight.

## Evidence

- Live, read-only `spacetime sql` polls during the owner's fights (12:39-12:43 local):
  - Fight 4103 hp: 122 -> 121 (round 1, mana -18 for Grudge Brand) -> 122 (regen) -> 122 (round 2) -> 114 (round 3, victory).
  - At 12:39:46, `combat_enemy_effect` held a dot with magnitude 9, rounds_remaining 1 and owner_character_id 1.
  - Later fights: -7, -2, -1, -7, +4 (the +4 was a Dimming Ward round with no hit) and -7.
- Real `resolve_round_timer` probe: when no caster DoT ticks, the row keeps the full damage (100 -> 82, 122 -> 108). Nothing else restores hp.
- Client: the vitals read `useSession`'s characters `bindTable`, which refreshes on insert, delete and update. They do not go through the gameData keyed bindings. SDK 2.10.1 merges overlapping query sets into one `update`.

## Fix (de0d95b8)

- `combat.ts:2704-2718`: after the drain write, the caster gets a private `heal` line with the hp actually restored, for example "Your Grudge Brand heals you for 4.". There is no line when the caster was already at max hp. The fallback name is "lingering effect".
- No balance, schema, binding or client source change.

## Tests

- `spacetimedb/src/reducers/combat_dot_drain_feed.integration.test.ts` (5 tests, real handler on the strict mock):
  - A hit and a drain in one round: the hit line and the drain line add up to the hp change.
  - A capped heal reports 2, not 4.
  - No line at max hp, and the "sears" line is unchanged.
  - The line has kind `heal` and goes only to the caster; the other player gets no line and no heal.
  - Two ticks give two lines.
  - Red before the fix: 4 failed, 1 passed (the max-hp case). After the fix all 5 pass.
- `src/session/vitalsUpdate.test.ts` (2 tests): the real `bindTable`, `createSession` and `App`, with an SDK-shaped fake table.
  - Rail: an hp update moves the readout (111 / 122), the bar width and the delta (-11, then -18 summed).
  - Strip: HP 115 and -7.
  - It passed before and after the fix, which rules out suspects 1 and 2.
  - Mutation check: with a table that sends no update events, both cases fail.

## Gates

- `pnpm exec vitest run --dir src --maxWorkers=2`: 116 files, 2440 passed.
- `pnpm exec vue-tsc -b`: exit 0.
- `pnpm build`: exit 0 (the usual chunk-size warning; bundle clean).
- Server, combat files (`src/reducers/combat_*`, `src/helpers/combat*`): 17 files, 447 passed.
- Server, full suite (1 worker): 4046 passed and 2 failed. Both failures are the known baseline `measurement.results.test.ts` (missing `.planning/phases/39-*`).
- `tsc --noEmit` (spacetimedb): no errors on the changed lines or the new test. The 240 errors are the existing baseline.

## Publish evidence (local only)

- Before: `SELECT key_set, key_length FROM admin_llm_status` gave true, 108.
- `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null` showed no clear prompt and ended with "Updated database with name: uwr". The log reads "Updated program to 37da380f..." and then "Database updated".
- After: true, 108.
- `pnpm spacetime:generate -y` succeeded. `git status --porcelain src/module_bindings` was empty, so the bindings are unchanged.
- No maincloud, `--clear-database`, push, or server start or stop.

## Not changed (owner decisions / follow-ups)

- `DOT_LIFE_DRAIN_PERCENT = 50` applies to every player DoT (quick-397 solo-viability rebalance). Ability descriptions do not mention it; Grudge Brand's does not. Whether a DoT should heal at all is a balance call. Now the heal is visible instead of hidden.
- Twilight Siphon's line reports the nominal heal even when the caster is at max hp ("healing you for 12" with nothing restored). That is the opposite mismatch. A one-line follow-up would report the restored amount the same way.
- In-combat regen (+2 hp per 8 s) stays silent. It is ambient and lands between rounds as a rise.
- The owner's browser was not observed directly. If the bar still shows nothing for the -7 rounds after this, look at the browser console: a row callback that throws aborts the SDK's dispatch for that transaction (`db_connection_impl.ts` `#dispatchPendingCallbacks` has no per-callback catch).
