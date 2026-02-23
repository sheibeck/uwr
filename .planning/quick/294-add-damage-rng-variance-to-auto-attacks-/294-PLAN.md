---
phase: quick-294
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat_enemies.ts
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [QUICK-294]
must_haves:
  truths:
    - "Player auto-attacks deal varying damage within +-15% of base each tick"
    - "Player ability damage varies within +-15% of computed value per hit"
    - "Player healing varies within +-15% of computed heal amount"
    - "Enemy auto-attacks deal varying damage within +-15% of base each tick"
    - "Enemy ability damage (direct, DoT initial, debuff, AoE) varies within +-15%"
    - "Pet auto-attacks deal varying damage within +-15% of base"
    - "Damage/healing values never go below 1n after variance"
  artifacts:
    - path: "spacetimedb/src/helpers/combat_enemies.ts"
      provides: "applyVariance utility function"
      exports: ["applyVariance"]
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "Variance applied to executeAbility applyDamage and applyHeal"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Variance applied to resolveAttack, player autos, enemy autos, pet autos"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "spacetimedb/src/helpers/combat_enemies.ts"
      via: "import applyVariance"
      pattern: "applyVariance"
    - from: "spacetimedb/src/helpers/combat.ts"
      to: "spacetimedb/src/helpers/combat_enemies.ts"
      via: "import applyVariance"
      pattern: "applyVariance"
---

<objective>
Add +-15% damage/healing variance to all combat values so hits fluctuate naturally instead of dealing exact fixed amounts every time.

Purpose: Fixed damage feels robotic and removes excitement from combat. Variance makes each hit feel unique and adds tactical uncertainty (will this heal be enough? will this hit finish the enemy?).

Output: A single `applyVariance` utility used at every damage and healing computation point across player auto-attacks, player abilities, player healing, enemy auto-attacks, enemy abilities, and pet auto-attacks.
</objective>

<context>
@spacetimedb/src/helpers/combat_enemies.ts
@spacetimedb/src/helpers/combat.ts
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/data/combat_scaling.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create applyVariance utility and wire into all damage/healing paths</name>
  <files>
    spacetimedb/src/helpers/combat_enemies.ts
    spacetimedb/src/helpers/combat.ts
    spacetimedb/src/reducers/combat.ts
  </files>
  <action>
**1. Add `applyVariance` to `combat_enemies.ts`** (this file already exports `scaleByPercent` and `applyArmorMitigation` — clean home for another math utility):

```typescript
/**
 * Apply +-15% variance to a damage or healing value using a deterministic seed.
 * Formula: value * (85 + seed % 31) / 100  -->  range [85%, 115%] of base
 * Returns at least 1n to avoid zero-damage hits.
 */
export function applyVariance(value: bigint, seed: bigint): bigint {
  if (value <= 0n) return value;
  const roll = ((seed < 0n ? -seed : seed) % 31n);  // 0-30
  const percent = 85n + roll;  // 85-115
  const result = (value * percent) / 100n;
  return result > 0n ? result : 1n;
}
```

**2. Wire into `resolveAttack` in `reducers/combat.ts`** — this handles ALL auto-attacks (player, enemy, pet). Apply variance to `reducedDamage` BEFORE the outcome multiplier is applied, so crits/blocks scale the varied value. The seed is already available as the `seed` parameter.

In the `resolveAttack` function (around line 591-605), change:
```typescript
// BEFORE:
const reducedDamage = applyArmorMitigation(baseDamage, targetArmor);
// ...
let finalDamage = (reducedDamage * outcome.multiplier) / 100n;
```
to:
```typescript
const reducedDamage = applyArmorMitigation(baseDamage, targetArmor);
const variedDamage = applyVariance(reducedDamage, seed + 7919n);  // offset to decouple from outcome roll
// ...
let finalDamage = (variedDamage * outcome.multiplier) / 100n;
```

Add `applyVariance` to the existing import from `'../helpers/combat_enemies'` (line 37 already imports `applyArmorMitigation, scaleByPercent`).

**3. Wire into `applyDamage` inside `executeAbility` in `combat.ts`** — this handles ALL player ability damage (single-target and multi-hit). Apply variance to each per-hit `reduced` value.

In the per-hit loop inside `applyDamage` (around line 670-692 in combat.ts), after the armor/magic mitigation is applied to get `reduced`, apply variance:
```typescript
// After computing `reduced` (the post-mitigation damage per hit):
const variedReduced = applyVariance(reduced, nowMicros + character.id + i * 997n);
hitDamages.push(variedReduced);
totalDamage += variedReduced;
```
Replace the existing `hitDamages.push(reduced); totalDamage += reduced;` lines.

Similarly for the AoE path inside `applyDamage` (around line 580-663): after computing `mitigatedDamage` for each AoE target, apply variance:
```typescript
const variedMitigated = applyVariance(mitigatedDamage, nowMicros + character.id + targetEnemy.id);
// Use variedMitigated instead of mitigatedDamage for HP update and threat
```
Update the `nextHp` calculation line, the threat calculation line, and the log message to use `variedMitigated` instead of `mitigatedDamage`.

Add `applyVariance` to the import from `'./combat_enemies'` at the top of combat.ts (line 37).

**4. Wire into `applyHeal` inside `executeAbility` in `combat.ts`** — this handles ALL player healing. Apply variance to `scaledAmount` right after `calculateHealingPower` computes it.

In `applyHeal` (around line 813-815):
```typescript
// BEFORE:
const scaledAmount = calculateHealingPower(directHeal, characterStats);
const nextHp = current.hp + scaledAmount > current.maxHp ? current.maxHp : current.hp + scaledAmount;

// AFTER:
const rawScaledAmount = calculateHealingPower(directHeal, characterStats);
const scaledAmount = applyVariance(rawScaledAmount, nowMicros + character.id + target.id + 4231n);
const nextHp = current.hp + scaledAmount > current.maxHp ? current.maxHp : current.hp + scaledAmount;
```

**5. Wire into `applyEnemyAbilityDamage` in `combat.ts`** — this handles ALL enemy ability damage (direct damage from dot/debuff/aoe/direct kinds). Apply variance to `finalDamage` before it's applied to HP.

In `applyEnemyAbilityDamage` (around line 1964-1976):
```typescript
// After all mitigation is applied, before the HP update:
finalDamage = applyVariance(finalDamage, target.id + BigInt(abilityName.length) * 1009n);
```
Insert this line just before `if (finalDamage < 1n) finalDamage = 1n;` (the applyVariance already guarantees >= 1n but the existing guard is harmless to keep).

**6. Wire into enemy ability pet damage in `executeEnemyAbility`** — the pet-targeting branch (around line 2009) computes `rawDamage = totalPower` directly. Apply variance:
```typescript
const rawDamage = applyVariance(totalPower, enemyId + pet.id + 6173n);
```

**IMPORTANT NOTES:**
- Do NOT apply variance to DoT per-tick values or HoT per-tick values. These are already subdivided from a total budget and variance on each tick would be confusing. Variance on the initial direct damage portion is sufficient.
- Do NOT apply variance to threat calculations — threat should track actual damage dealt.
- Do NOT apply variance to resource costs.
- Import `applyVariance` from `'./combat_enemies'` in combat.ts and from `'../helpers/combat_enemies'` in reducers/combat.ts.
- Use different seed offsets (prime numbers: 7919, 997, 4231, 1009, 6173) at each call site to ensure different variance rolls even when the base seed components are similar.
  </action>
  <verify>
    1. `cd C:/projects/uwr && npx tsc --noEmit --project spacetimedb/tsconfig.json` compiles without errors
    2. `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` publishes successfully to local
    3. Grep for `applyVariance` confirms it appears in all three files: combat_enemies.ts (definition), combat.ts (ability damage + healing + enemy ability damage), combat.ts reducers (resolveAttack)
    4. Verify no `Math.random()` was introduced anywhere
  </verify>
  <done>
    All 6 damage/healing paths apply +-15% variance using deterministic seed-based PRNG. Player auto-attacks, player abilities (single-target and AoE), player healing, enemy auto-attacks, enemy abilities (all kinds), and pet auto-attacks all produce varied values. DoT/HoT ticks remain fixed per-tick. The module compiles and publishes cleanly.
  </done>
</task>

</tasks>

<verification>
- TypeScript compilation passes with no errors
- Module publishes to local SpacetimeDB
- `applyVariance` function exists in combat_enemies.ts and is imported in both combat.ts and reducers/combat.ts
- No `Math.random()` calls exist in any modified file
- Grep for `applyVariance` returns hits in all three files
- Combat log messages will now show varying numbers instead of the same fixed value each tick
</verification>

<success_criteria>
- All auto-attacks (player, enemy, pet) show +-15% damage variance per hit
- All ability damage (player single/multi/AoE, enemy direct/dot/debuff/aoe) shows +-15% variance on the direct damage portion
- All player healing shows +-15% variance
- DoT/HoT ticks remain unvaried (fixed per-tick)
- No value ever drops below 1n
- Module compiles and publishes without errors
</success_criteria>

<output>
After completion, create `.planning/quick/294-add-damage-rng-variance-to-auto-attacks-/294-SUMMARY.md`
</output>
