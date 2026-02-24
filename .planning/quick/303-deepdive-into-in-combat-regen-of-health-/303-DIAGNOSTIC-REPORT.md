# Diagnostic Report: In-Combat HP Healing on Level 1 Goblin Enchanter

**Date:** 2026-02-24
**Subject:** Unexpectedly large HP healing ticks during combat on a Level 1 Goblin Enchanter with no buffs

---

## Baseline Character Stats (Level 1 Goblin Enchanter)

| Stat     | Value | Derivation |
|----------|-------|------------|
| CHA      | 12    | 8 (base) + 4 (primary bonus) |
| STR      | 8     | 8 (base) |
| DEX      | 7     | 8 (base) - 1 (Goblin penalty) |
| WIS      | 8     | 8 (base) |
| INT      | 8     | 8 (base) |
| maxHp    | 114   | BASE_HP(50) + STR(8) * HP_STR_MULTIPLIER(8) |
| racialHpRegen | 0 | Goblin has mana_regen(2) + perception(25), no hp_regen |
| Goblin bonuses | mana_regen 2, perception 25 | Neither contributes to HP healing |

---

## Complete Inventory of In-Combat HP Healing Pathways

### Source 1: `regen_health` Reducer (Scheduled every 8 seconds)

**File:** `spacetimedb/src/reducers/combat.ts` lines 1302-1358

**Mechanism:**
- Every 8 seconds, `regen_health` fires for ALL characters
- Computes `tickIndex = timestamp / REGEN_TICK_MICROS(8s)` then `halfTick = tickIndex % 2 === 0`
- **In-combat characters are SKIPPED if `!halfTick`** (line 1316), meaning they only regen on every OTHER tick = every 16 seconds
- In-combat HP regen: `HP_REGEN_IN = 2n`
- Added bonuses from `food_health_regen` CharacterEffects + `racialHpRegen` from Character row

**Expected for Level 1 Goblin Enchanter (no buffs):**
- `hpRegen = 2` (HP_REGEN_IN)
- `hpRegenBonus = 0` (no food buffs, no racialHpRegen for Goblin)
- **Total: 2 HP every 16 seconds**

**Verdict:** This is tiny and cannot explain "really big" healing ticks.

---

### Source 2: `tick_hot` Reducer (Scheduled every 3 seconds)

**File:** `spacetimedb/src/reducers/combat.ts` lines 1658-1772

**Mechanism:**
- Every 3 seconds, iterates ALL CharacterEffect rows
- Processes effects with `effectType === 'regen'` or `effectType === 'dot'`
- For `regen`: adds `effect.magnitude` directly to character HP
- **CRITICAL: tick_hot has NO in-combat gate.** It processes regen effects identically regardless of combat state.
- Decrements `roundsRemaining` by 1 per tick; deletes effect at 0

**Expected for Level 1 Goblin Enchanter (no buffs, solo, no consumables):**
- Zero `regen` CharacterEffects should exist
- **Total: 0 HP from tick_hot**

**BUT if any `regen` CharacterEffect exists** (from any source), it ticks every 3 seconds regardless of combat. Known sources that create `regen` effects:

| Source | Magnitude | Rounds | Duration | Who Can Apply It |
|--------|-----------|--------|----------|-----------------|
| Sanctify (Cleric) | 4 HP/tick | 450 | ~22.5 min at 3s/tick | Any Cleric in party |
| Consecrated Ground (Paladin) | 8 HP/tick | 3 | 9 seconds | Any Paladin in party |
| Nature's Balm (Ranger) | 7 HP/tick | 3 | 9 seconds | Any Ranger targeting you |
| Bandage (consumable) | 5 HP/tick | 3 | 9 seconds | Self-use |
| Simple Rations (consumable) | 1 HP/tick | 10 | 30 seconds | Self-use |
| Heal abilities with HoT split | varies | varies | varies | Healers (Spirit Mender, Mend, etc.) |
| Bard Melody of Mending (song tick) | 6 HP | N/A | Continuous while song active | Bard in party (direct HP, not via CharacterEffect) |

---

### Source 3: `addCharacterEffect` Immediate First Tick

**File:** `spacetimedb/src/helpers/combat.ts` lines 199-212

**Mechanism:**
- When a `regen` effect is CREATED (not refreshed), the first tick is applied immediately
- Heals for `magnitude` HP on creation, then tick_hot handles subsequent ticks

**Impact:** This means creating a Sanctify regen effect also heals for 4 HP immediately. Minor.

---

### Source 4: `applyHeal` Function (Ability-based healing)

**File:** `spacetimedb/src/helpers/combat.ts` lines 786-846

**Formula:** `calculateHealingPower(baseHealing, stats)` = `baseHealing + wis * ABILITY_STAT_SCALING_PER_POINT(1)`
Then: `applyVariance(result, seed)` = 85%-115% range

**Expected for Level 1 Goblin Enchanter:**
- Enchanter has NO heal abilities at any level (confirmed from enchanter_abilities.ts)
- This pathway is INACCESSIBLE for the character's own actions
- Could only be triggered if another character heals the enchanter (Cleric Mend, Spirit Mender, etc.)

---

### Source 5: Perk Procs (`procHealPercent`)

**File:** `spacetimedb/src/helpers/combat_perks.ts` lines 87-104

**Mechanism:**
- On hit/kill/crit events, checks for perk procs with `procHealPercent`
- Heals for `(damageDealt * procHealPercent) / 100`
- Requires renown perks: Bloodthirst (rank 4), Vampiric Strikes (rank 7)

**Expected for Level 1 character:** Zero. These require substantial renown rank investment. Extremely unlikely for a brand-new Level 1 character.

---

### Source 6: Second Wind (Active Perk Ability)

**File:** `spacetimedb/src/helpers/combat_perks.ts` lines 193-203

**Mechanism:** Heals for 20% maxHp on manual activation. Requires renown rank 7+.

**Expected for Level 1:** Zero. Not available.

---

### Source 7: Pet Healing (pet_heal / pet_aoe_heal)

**File:** `spacetimedb/src/reducers/combat.ts` lines 1398-1470

**Mechanism:** Heal pets target lowest-HP party member. Formula: `10n + pet.level * 5n`

**Expected for Level 1 Enchanter:** Enchanter Charm requires level 10. No pet at level 1. Zero healing from this source.

---

### Source 8: Bard Melody of Mending (Song Tick)

**File:** `spacetimedb/src/reducers/combat.ts` lines 1829-1849

**Mechanism:** Bard song that ticks every 6 seconds while active. Heals: `(10n * 65n) / 100n = 6 HP` per tick per group member. Applied directly to HP, not via CharacterEffect.

**Expected for Level 1 Enchanter (solo):** Zero. Only applies if in a group with a Bard playing this song.

---

### Source 9: Life-drain DoTs (enemy DoT ticking with ownerCharacterId)

**File:** `spacetimedb/src/reducers/combat.ts` lines 1739-1748

**Mechanism:** When a character's DoT ticks on an enemy, if `ownerCharacterId` is set, the character is healed for the DoT damage amount. This is a life-drain mechanic.

**Expected for Level 1 Enchanter:** Enchanter's Mind Fray has `dotPowerSplit: 0.5` and creates a DoT. However, the life-drain healing is on `combatEnemyEffect` (enemy-side), not `characterEffect`. The owner-heal occurs in tick_hot when processing enemy DoTs. **This IS active for the enchanter if Mind Fray is used.**

Mind Fray DoT calculation: power=3, dotPowerSplit=0.5, so 50% of damage goes to DoT. The DoT magnitude per tick depends on ability scaling. For CHA=12 enchanter:
- Ability base damage = power(3) * multiplier + stat scaling
- With `calculateHealingPower` not applicable (this is damage)
- Life-drain healing = same as DoT tick magnitude

This is worth investigating further as a potential source.

---

### Source 10: `lifeOnHit` Gear Stat

**File:** `spacetimedb/src/helpers/items.ts` line 274, 306

**Status:** The `getEquippedBonuses` function accumulates `lifeOnHit` from Vampiric affixes on gear, BUT there is NO code in the combat auto-attack or ability resolution path that consumes this value. **This is a tracked-but-unused stat.** It cannot be the source of any healing.

---

## Root Cause Analysis

### Most Likely Explanation: Stale Sanctify `regen` CharacterEffect

**Likelihood: HIGH** if the enchanter was EVER in a group with a Cleric.

Evidence chain:
1. `cleric_sanctify` applies `regen` effect with magnitude=4, roundsRemaining=450 to ALL party members (line 1174 of combat.ts helper)
2. The `tick_hot` reducer processes this effect every 3 seconds with NO in-combat awareness (line 1658-1717)
3. At 3 seconds per tick, 450 rounds = 1,350 seconds = **22.5 minutes** of continuous 4 HP/3s healing
4. That is 80 HP per minute against a 114 HP pool -- the character is essentially unkillable
5. The `tick_effects` reducer (line 1552-1626) explicitly SKIPS `regen` and `dot` effects (line 1559-1561), so only `tick_hot` manages the countdown
6. `tick_hot` DOES decrement roundsRemaining and delete at 0 (lines 1712-1717), so the effect WILL eventually expire, but not for 22.5 minutes

**The "really big healing ticks" are most likely 4 HP every 3 seconds from Sanctify, which is visually large compared to the base 2 HP every 16 seconds.**

### Second Most Likely: Bandage or Simple Rations Regen Effect

If the player used a Bandage (5 HP/tick for 3 ticks = 9 seconds) or Simple Rations (1 HP/tick for 10 ticks = 30 seconds) before or during combat, these create `regen` CharacterEffects that tick via `tick_hot` every 3 seconds regardless of combat state.

Bandage at 5 HP per 3 seconds = 100 HP/min. Against 114 HP pool, this is extremely powerful but short-lived (9 seconds).

### Third Most Likely: Life-drain from Mind Fray DoT

If the enchanter cast Mind Fray and the resulting DoT on the enemy has `ownerCharacterId` set, each DoT tick would heal the enchanter for the DoT magnitude. However, this requires checking whether `addEnemyEffect` sets `ownerCharacterId` when called from Mind Fray. Let me verify:

The `applyDamage` function in combat.ts helper creates enemy DoTs via `addEnemyEffect(ctx, combatId, enemy.id, 'dot', ...)`. The `ownerCharacterId` parameter IS passed from combat.ts helper line ~2077. So Mind Fray DoT would trigger life-drain healing.

**However**, this would show up as an enemy-side effect, not a character-side "heal" event. The heal message would not appear in character events. This is less likely to be the visible "big healing tick" the user notices.

### Least Likely (but possible): Double Healing from regen_health + tick_hot

If any `food_health_regen` or `regen` CharacterEffect exists, the character gets healed by two independent systems:
1. `regen_health` adds food_health_regen bonus to the base 2 HP regen (every 16s in combat)
2. `tick_hot` processes `regen` effects every 3 seconds (no combat gate)

These are NOT double-counting the same effect. `food_health_regen` is processed by `regen_health` as a bonus. `regen` is processed by `tick_hot`. They are different effect types. No bug here -- just two systems that could stack.

---

## Bugs Found

### Bug 1: Sanctify Duration is Extreme (Design Issue, not Code Bug)

Sanctify's `regen` effect lasts 450 rounds at 3s/tick = 22.5 minutes. This was originally designed as "~45 minutes" based on a 10s round assumption in `effect_tick`, but `tick_hot` uses 3s ticks. The original design intent was 450 * 10s = 75 minutes. At 3s/tick, it lasts 22.5 minutes -- shorter than intended but still extremely long.

At 4 HP every 3 seconds = 80 HP/minute, this makes any character with Sanctify nearly unkillable in low-level combat.

**Recommendation:** Either:
- (a) Reduce Sanctify regen magnitude from 4n to 1n-2n to make it a gentle background heal, OR
- (b) Reduce roundsRemaining from 450 to a lower value (e.g., 150 rounds = 7.5 min), OR
- (c) Add an in-combat gate to `tick_hot` for `regen` effects (not recommended -- this would break intentional in-combat HoTs like Nature's Balm and Consecrated Ground)

### Bug 2 (Minor): Bandage/Rations Regen Effects Bypass Combat Regen Gate

Bandage (5 HP/tick) and Simple Rations (1 HP/tick) create `regen` CharacterEffects that tick via `tick_hot` every 3 seconds. They do NOT respect the `regen_health` reducer's halfTick in-combat gate. This is likely intended -- bandages should work in combat -- but worth noting.

### Bug 3 (Tracked, Not Active): `lifeOnHit` Stat Accumulated but Never Applied

The `getEquippedBonuses` function collects `lifeOnHit` from Vampiric affixes, but no combat code reads or applies it. This is a missing feature, not a healing bug. It does NOT cause any healing.

---

## Diagnostic Questions for the User

To narrow down the root cause, the user should check:

1. **Does the enchanter have any `regen` CharacterEffect rows?** Look for effectType='regen' with any sourceAbility. If sourceAbility='Sanctify', that is the smoking gun.

2. **Was the enchanter EVER in a party with a Cleric?** Sanctify applies to all party members. Even if the Cleric left the party, the effect persists.

3. **What is the actual healing tick amount?** The magnitude tells us the source:
   - 4 = Sanctify
   - 7 = Nature's Balm
   - 8 = Consecrated Ground
   - 5 = Bandage
   - 1 = Simple Rations
   - 2 = Base regen_health (every 16s)

4. **How frequently does the heal tick?** Every 3 seconds = tick_hot (regen CharacterEffect). Every 16 seconds = regen_health reducer.

5. **Is the heal event message like "You are healed for X by [source]"?** The source name in the message directly identifies which system is healing.

---

## Summary

| Source | Expected Magnitude | Frequency | Active for L1 Goblin Enchanter? |
|--------|-------------------|-----------|--------------------------------|
| regen_health (base) | 2 HP | Every 16s (in combat) | Yes, always |
| food_health_regen bonus | 0 HP (no food) | Every 16s (in combat) | Only with food buff |
| racialHpRegen | 0 HP (Goblin) | Every 16s (in combat) | No |
| tick_hot (regen effects) | varies by source | Every 3s (no combat gate) | Only if effect exists |
| Sanctify regen | 4 HP/tick | Every 3s for 22.5 min | Only if grouped with Cleric |
| Bandage regen | 5 HP/tick | Every 3s for 9s | Only if used bandage |
| Simple Rations regen | 1 HP/tick | Every 3s for 30s | Only if used rations |
| applyHeal (ability) | N/A | On cast | No heal abilities for Enchanter |
| Perk procs | N/A | On hit/kill/crit | No (requires high renown) |
| Pet healing | N/A | Per ability interval | No (requires level 10) |
| Mind Fray life-drain | DoT magnitude | Every 3s (DoT tick) | Possible if ownerCharId set |
| lifeOnHit gear | 0 (unused) | Never | No (stat tracked but unused) |

**Root cause verdict:** The most likely explanation is a persistent `regen` CharacterEffect from Sanctify, a Bandage, or another party member's healing ability. Check the CharacterEffect table for the specific character.
