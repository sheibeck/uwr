---
quick_id: 261006-hbk
type: quick
autonomous: true
status: complete
---

# Quick Task 261006-hbk: Health bar does not update when taking damage

## Symptoms (owner, verbatim)

"I'm fighting in game and I see that I'm taking damage from enemies, but my hitpoint bar doesn't seem to really move. At most I've seen a -1 show up next to my health bar, but the bar itself doesn't seem to update when taking damage."

Feed: "Brine Sentinel's Shoot hits you for 11 damage." Character Elfansworth, level 3. Live DB: hp 122 / max_hp 122.

## Current focus

status: complete (fix de0d95b8, published locally; see SUMMARY)

```yaml
reasoning_checkpoint:
  hypothesis: >
    The bar is right; the hp it shows is the net of each round. The caster's own damage-over-time
    heals 50% of every tick back to the caster in the same round transaction
    (reducers/combat.ts:2702-2711, DOT_LIFE_DRAIN_PERCENT) and posts no feed line, so the feed shows
    "hits you for 5" or "Shoot hits you for 11" while the bar moves -1 or -7. Twilight Siphon
    heals in the same round as well, and in-combat regen adds 2 hp per 8 s between rounds.
  confirming_evidence:
    - "Live read-only poll, fight 4103: round 1 hp 122 -> 121 with mana -18 (Grudge Brand cast); round 3 hp 122 -> 114 at victory; combat_enemy_effect showed dot magnitude 9 owner_character_id 1 (heal 9*50/100 = 4)."
    - "Next fights: -7 (Shoot 11 + drain 4), -2, -1, -7, +4: every round moves the row, by less than the damage."
    - "Real resolve_round_timer handler (scratch probe): the row keeps the full damage when no DoT of the caster ticks, so nothing else restores hp."
    - "Every other in-combat heal posts a line (regen effect, Siphon, HoT, heal, perk procs, pet heals); the DoT drain branch is the only silent one."
  falsification_test: >
    A real-handler round with an enemy hit and a caster-owned DoT ticking on the enemy: if hp_after
    equals hp_before minus the hit, the drain is not the offset. It is 4 higher, with no line.
  fix_rationale: >
    The player cannot see why the bar moves less than the damage. Posting the drain heal (the amount
    actually restored) to the caster makes the feed account for every hp change of the round. No
    balance, schema or client change.
  blind_spots: >
    The owner's browser is not observable here: the client chain is proven by a test (real bindTable
    -> session frame -> App -> VitalsRail), not by watching the owner's tab. The owner reported "at
    most -1"; the live rows show -7 drops in later fights, which the client should flash as -7.
```

next_action: none. Gates green, committed de0d95b8, published locally, bindings unchanged.

## Plan

Task 1 (server, red first): `spacetimedb/src/reducers/combat_dot_drain_feed.integration.test.ts`, real `resolve_round_timer` on the strict mock. A hit plus a caster DoT tick in one round: the caster's feed reports the hit and the drain, and they add up to the hp change. Capped heal reports the hp restored (2, not 4). No line at max hp. Line is kind `heal`, private to the caster. One line per tick that restores hp. Red before the fix: 4 of 5 failed ("expected [] to have a length of 1").

Task 2 (server fix): `tickEffectsForRound`, enemy DoT branch: after the drain write, `appendPrivateEvent(caster, 'heal', "Your <source> heals you for <restored>.")` when `newHp > caster.hp`. Green: 5 of 5.

Task 3 (client guard, green before and after): `src/session/vitalsUpdate.test.ts`. Real `bindTable` + `createSession` + `App` with an SDK-shaped fake table: an hp update reaches the rail readout, bar width and delta (-11, then -18 accumulated), and the mobile strip (HP 115, -7). Mutation check: with no update events from the table both cases fail.

No schema, binding, client source or balance change. `DOT_LIFE_DRAIN_PERCENT` stays 50 (owner's call; see summary).

## Hypotheses to test

1. Client keyed binding in `src/game/gameData.ts` drops row UPDATEs for the active character.
2. AppFrame / FrameView props snapshot a stale character.
3. Server writes hp then something restores it (regen tick, max-hp recompute, round resolution).
4. The -1 is regen and combat damage never reaches the character row.

## Evidence

- `applyEnemyAbilityDamage` (`spacetimedb/src/helpers/combat.ts:1152`) writes `ctx.db.character.id.update({ ...target, hp: nextHp })` from a fresh `find`.
- Scratch probe through the real `resolve_round_timer` handler on the strict mock: auto-attack round 100 -> 82 hp ("Cave Rat strikes you for 18"), Shoot round 122 -> 108 ("Brine Sentinel's Shoot hits you for 14"). The row keeps the damage at the end of the transaction.
- `regen_health` (`reducers/combat.ts:1358`) reads rows fresh; in combat it adds 2 hp per 8 s. It cannot hide 11.
- SDK 2.10.1 table cache (`node_modules/spacetimedb/src/sdk/table_cache.ts`) keys rows by primary key and merges overlapping query sets into one `update`; `bindTable` refreshes on `onUpdate`.
- Live: Elfansworth is a Gloamweaver with Twilight Siphon (drain, heals 50% of dealt), Grudge Brand (dot; enemy dot ticks heal the caster 50% silently, `DOT_LIFE_DRAIN_PERCENT`), Dimming Ward (shield 29). Brine Sentinel: level 1, 32 hp, base damage 8, Shoot (damage, cast 0, cd 6).

- Live read-only polls (spacetime sql, 1-2 s) during the owner's fights at 12:39-12:43 local:
  - fight 4103: 122 -> 121 (round 1, mana 118 -> 100) -> 122 (regen) -> 122 (round 2) -> 114 (round 3, victory) -> 116 -> 122 (regen).
  - at 12:39:46 `combat_enemy_effect`: dot, magnitude 9, rounds_remaining 1, owner_character_id 1 (Grudge Brand: 9 * 50 / 100 = 4 hp back per tick).
  - later fights: 122 -> 115 (-7), 117 -> 115 (-2); 122 -> 121 (-1), 122 -> 115 (-7), 115 -> 119 (+4, Dimming Ward round); 122 -> 115 (-7).
  - Round 1 of fight 4103: hit 5, drain +4, net -1. Shoot rounds: hit 11, drain +4, net -7. The "-1" the owner saw is the first kind.
- `reducers/combat.ts:2702-2711` (tickEffectsForRound, enemy DoT branch): `caster.hp + healAmt` written with no `appendPrivateEvent`. The DoT line "Grudge Brand sears Brine Sentinel for 9." says nothing about the heal. Grudge Brand's description does not mention it either.

## Eliminated

- hypothesis: the client keyed binding drops character UPDATEs (gameData `createKeyed`).
  evidence: the vitals do not read gameData; they read `useSession` `charactersBinding` (plain `bindTable`, refresh on insert, delete and update). SDK 2.10.1 merges overlapping query sets into one `update` callback. The live round deltas (-1) match what the owner saw. A client chain test (real bindTable -> session frame -> App -> VitalsRail) passes.
- hypothesis: AppFrame / FrameView snapshot a stale character.
  evidence: `frame` is a computed of `activeCharacter`; App passes it as `:view`; AppFrame passes `view.hp` straight to VitalsRail and VitalsStrip. Covered by the same client test.
- hypothesis: the server writes hp and something resets it (regen tick, max-hp recompute, round steps).
  evidence: real-handler probe keeps the full damage when no caster DoT ticks; regen adds 2 per 8 s in combat; recomputeCharacterDerived is not called in combat; every character write in a round re-reads the row.
- hypothesis: combat damage never reaches the row and the -1 is regen.
  evidence: regen only raises hp; live rows drop by 1-8 in the round transactions.
