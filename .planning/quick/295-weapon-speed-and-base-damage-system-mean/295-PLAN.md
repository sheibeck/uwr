---
id: "295"
name: "Weapon Speed and Base Damage System"
type: execute
status: pending
---

<objective>
Add a weapon speed system where different weapon types auto-attack at different intervals, with base damage scaled inversely so DPS remains roughly balanced. Fast weapons (daggers, rapiers) swing more often for less per hit; slow weapons (axes) swing less often for more per hit. This creates meaningful weapon choice around burst vs sustained damage.

Purpose: Differentiate weapon types beyond crit multipliers — weapon speed creates gameplay feel differences and meaningful tradeoffs.
Output: Modified combat loop using per-weapon-type attack intervals, rebalanced weapon base damage values, and `getEquippedWeaponStats` returning speed.
</objective>

<context>
@spacetimedb/src/data/combat_constants.ts (AUTO_ATTACK_INTERVAL = 5_000_000n currently)
@spacetimedb/src/data/combat_scaling.ts (WEAPON_CRIT_MULTIPLIERS, inferWeaponType, calculateStatScaledAutoAttack)
@spacetimedb/src/helpers/items.ts (getEquippedWeaponStats — returns baseDamage, dps, name, weaponType)
@spacetimedb/src/reducers/combat.ts (processPlayerAutoAttacks line ~2303, processEnemyAutoAttacks line ~2717, combat_loop scheduled reducer)
@spacetimedb/src/reducers/movement.ts (line ~199 hardcodes AUTO_ATTACK_INTERVAL for mid-combat joins)
@spacetimedb/src/helpers/combat.ts (pet summon uses AUTO_ATTACK_INTERVAL at line ~452)
@spacetimedb/src/data/item_defs.ts (STARTER_WEAPON_DEFS, WORLD_DROP_GEAR_DEFS with weaponBaseDamage/weaponDps)
@spacetimedb/src/seeding/ensure_items.ts (starter weapons seeded with weaponBaseDamage: 3n, weaponDps: 5n)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Define weapon speed constants and rebalance weapon base damage</name>
  <files>
    spacetimedb/src/data/combat_constants.ts
    spacetimedb/src/data/combat_scaling.ts
    spacetimedb/src/data/item_defs.ts
    spacetimedb/src/seeding/ensure_items.ts
    spacetimedb/src/helpers/items.ts
  </files>
  <action>
**1a) Add WEAPON_SPEED_MICROS map in `combat_constants.ts`:**

Define a map from weapon type to auto-attack interval in microseconds:

```typescript
/** Weapon auto-attack intervals by type (microseconds).
 *  Fast weapons swing more often but deal less per hit.
 *  DPS is balanced via inverse damage scaling.
 *
 *  Speed tiers:
 *    Fast   (3.0s): dagger, rapier
 *    Normal (3.5s): staff, bow
 *    Medium (4.0s): sword, blade, mace
 *    Slow   (5.0s): axe
 *  Default fallback (unarmed/unknown): 4_000_000n (4.0s)
 */
export const WEAPON_SPEED_MICROS: Record<string, bigint> = {
  dagger: 3_000_000n,
  rapier: 3_000_000n,
  staff:  3_500_000n,
  bow:    3_500_000n,
  sword:  4_000_000n,
  blade:  4_000_000n,
  mace:   4_000_000n,
  axe:    5_000_000n,
};
export const DEFAULT_WEAPON_SPEED_MICROS = 4_000_000n;
```

Keep `AUTO_ATTACK_INTERVAL = 5_000_000n` as-is (it's still used for enemies and pets which don't have weapon types). Rename it to clarify it's the enemy/pet default, or add a comment. Do NOT remove it — enemies and pets still reference it.

**1b) Add `getWeaponSpeed` helper in `combat_scaling.ts`:**

```typescript
import { WEAPON_SPEED_MICROS, DEFAULT_WEAPON_SPEED_MICROS } from './combat_constants.js';

/** Get auto-attack interval in microseconds for a weapon type.
 *  Falls back to DEFAULT_WEAPON_SPEED_MICROS for unknown types.
 */
export function getWeaponSpeed(weaponType: string): bigint {
  return WEAPON_SPEED_MICROS[weaponType] ?? DEFAULT_WEAPON_SPEED_MICROS;
}
```

**1c) Extend `getEquippedWeaponStats` in `helpers/items.ts`:**

Add `speed` field to the return object — call `getWeaponSpeed(template.weaponType)`. Import `getWeaponSpeed` from `combat_scaling`. The unarmed fallback should return `speed: DEFAULT_WEAPON_SPEED_MICROS`. This ensures combat code can do `weapon.speed` instead of looking up weapon type separately.

Updated return:
```typescript
return {
  baseDamage: template.weaponBaseDamage + bonusDamage,
  dps: template.weaponDps + bonusDps,
  name: template.name,
  weaponType: template.weaponType,
  speed: getWeaponSpeed(template.weaponType),
};
// Unarmed fallback:
return { baseDamage: 0n, dps: 0n, name: '', weaponType: '', speed: DEFAULT_WEAPON_SPEED_MICROS };
```

**1d) Rebalance weaponBaseDamage by weapon type in item_defs.ts:**

Currently all tier 1 weapons have weaponBaseDamage: 4n, weaponDps: 6n, and all tier 2 have 5n/7n. These are identical across weapon types because the old system had a flat 5s interval.

Now that speeds differ, we need to scale damage inversely with speed to keep DPS roughly equal. Use the 4.0s (medium) weapons as the baseline.

DPS normalization approach: if baseline DPS = baseDamage / 4.0s, then for a 3.0s weapon, baseDamage = baseline * (3.0/4.0) = 75%. For a 5.0s weapon, baseDamage = baseline * (5.0/4.0) = 125%.

Apply the speed ratio to `weaponBaseDamage` ONLY (not weaponDps, which is a stat-like value on the template). This keeps the formula simple.

**Tier 1 (currently baseDamage=4, dps=6):**
- Fast (dagger, rapier): weaponBaseDamage: 3n, weaponDps: 5n (hits for less, swings at 3.0s)
- Normal (staff, bow): weaponBaseDamage: 4n, weaponDps: 5n (hits for slightly less, swings at 3.5s)
- Medium (sword, blade, mace): weaponBaseDamage: 4n, weaponDps: 6n (unchanged, baseline at 4.0s)
- Slow (axe): weaponBaseDamage: 5n, weaponDps: 8n (hits hard, swings at 5.0s)

**Tier 2 (currently baseDamage=5, dps=7):**
- Fast (dagger, rapier): weaponBaseDamage: 4n, weaponDps: 5n
- Normal (staff, bow): weaponBaseDamage: 5n, weaponDps: 6n
- Medium (sword, blade, mace): weaponBaseDamage: 5n, weaponDps: 7n (unchanged)
- Slow (axe): weaponBaseDamage: 7n, weaponDps: 9n

Update each weapon entry in `WORLD_DROP_GEAR_DEFS` accordingly. The exact values can be approximate -- the point is that faster weapons deal less per swing and slower deal more, with DPS roughly equal.

**1e) Update starter weapon base damage in `ensure_items.ts`:**

Currently all starter weapons get `weaponBaseDamage: 3n, weaponDps: 5n` (line ~206). Instead of a flat value, look up the weapon type from the `STARTER_WEAPON_DEFS` entry and apply the speed-adjusted values:

Create a small lookup map at the top of the starter weapon loop:
```typescript
const STARTER_WEAPON_STATS: Record<string, { baseDamage: bigint; dps: bigint }> = {
  dagger: { baseDamage: 2n, dps: 4n },
  rapier: { baseDamage: 2n, dps: 4n },
  staff:  { baseDamage: 3n, dps: 4n },
  bow:    { baseDamage: 3n, dps: 4n },
  sword:  { baseDamage: 3n, dps: 5n },
  blade:  { baseDamage: 3n, dps: 5n },
  mace:   { baseDamage: 3n, dps: 5n },
  axe:    { baseDamage: 4n, dps: 6n },
};
```

Use `STARTER_WEAPON_STATS[weapon.weaponType]` when seeding, falling back to `{ baseDamage: 3n, dps: 5n }`.
  </action>
  <verify>
Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` to verify no type errors. Confirm `getEquippedWeaponStats` return type now includes `speed: bigint`. Confirm `WEAPON_SPEED_MICROS` is exported from `combat_constants.ts`.
  </verify>
  <done>
WEAPON_SPEED_MICROS map exists with 4 speed tiers. getEquippedWeaponStats returns speed field. Weapon base damage values vary by weapon type in both item_defs.ts and ensure_items.ts. No type errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire weapon speed into the combat loop and all auto-attack scheduling</name>
  <files>
    spacetimedb/src/reducers/combat.ts
    spacetimedb/src/reducers/movement.ts
    spacetimedb/src/helpers/combat.ts
  </files>
  <action>
**2a) Update `processPlayerAutoAttacks` in `reducers/combat.ts` (line ~2387):**

Currently:
```typescript
ctx.db.combatParticipant.id.update({ ...participant, nextAutoAttackAt: nowMicros + AUTO_ATTACK_INTERVAL });
```

Change to use the weapon speed already available from the `weapon` variable (which is computed earlier in the same loop body at line ~2316):
```typescript
ctx.db.combatParticipant.id.update({ ...participant, nextAutoAttackAt: nowMicros + weapon.speed });
```

The `weapon` variable is `deps.getEquippedWeaponStats(ctx, character.id)` which now returns `speed`.

Also update the initial `nextAutoAttackAt` when creating CombatParticipant rows. There are several places:

**2b) Update combat participant creation in `reducers/combat.ts` (line ~187):**

Currently:
```typescript
nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + AUTO_ATTACK_INTERVAL,
```

At this point the character is being added to combat. Look up their equipped weapon speed:
```typescript
const pWeapon = deps.getEquippedWeaponStats(ctx, p.id);
// ...
nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + pWeapon.speed,
```

Import `getWeaponSpeed` and `DEFAULT_WEAPON_SPEED_MICROS` from combat_constants (via combat_scaling or directly) at the top of the file if needed.

**2c) Update pet auto-attack in `reducers/combat.ts` (line ~208):**

Pets don't have weapon types. Keep using `AUTO_ATTACK_INTERVAL` for pets. No change needed. The existing code at line ~208 and ~2480 already uses `AUTO_ATTACK_INTERVAL` for pets. Leave this as-is.

**2d) Update movement.ts (line ~199):**

Currently hardcodes `const AUTO_ATTACK_INTERVAL = 5_000_000n;`. Instead, import `getWeaponSpeed` from `../data/combat_scaling` and `DEFAULT_WEAPON_SPEED_MICROS` from `../data/combat_constants`, then look up the character's weapon:

```typescript
import { getEquippedWeaponStats } from '../helpers/items';
// ...
const joinWeapon = getEquippedWeaponStats(ctx, movedChar.id);
// ...
nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + joinWeapon.speed,
```

Remove the hardcoded `AUTO_ATTACK_INTERVAL` local constant from movement.ts.

**2e) Update `helpers/combat.ts` pet summon (line ~452):**

The pet summon line uses `AUTO_ATTACK_INTERVAL` for the pet's `nextAutoAttackAt`. Pets don't have weapons, so keep using `AUTO_ATTACK_INTERVAL`. No change needed.

**2f) Ensure enemy auto-attacks remain unchanged:**

Enemies use `AUTO_ATTACK_INTERVAL` (5s) everywhere in `processEnemyAutoAttacks`. This is correct — enemies don't have equipped weapons. Leave all enemy auto-attack intervals as-is. They already have their own attack timing via `nextAutoAttackAt` on CombatEnemy rows.

**2g) Consider the haste effect:**

The `enchanter_haste` ability applies a `haste` CharacterEffect but it's never consumed. This is a pre-existing issue and out of scope. Do NOT try to wire haste into weapon speed in this task. Leave a comment near the auto-attack scheduling:
```typescript
// TODO: Check for 'haste' CharacterEffect to reduce weapon speed interval
```

**Important:** The `AUTO_ATTACK_INTERVAL` constant in `combat_constants.ts` should NOT be removed — it's still used for enemies, pets, and the pull add delay calculation. Just ensure player auto-attacks use `weapon.speed` instead.
  </action>
  <verify>
Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` to verify no type errors. Grep for remaining hardcoded uses of `AUTO_ATTACK_INTERVAL` in player auto-attack paths to ensure none were missed (should only remain in enemy/pet paths). Test: `grep -n "AUTO_ATTACK_INTERVAL" spacetimedb/src/reducers/combat.ts` — verify it only appears in enemy auto-attack scheduling, pet scheduling, and the pull delay calculation (not in processPlayerAutoAttacks' scheduling line).
  </verify>
  <done>
Player auto-attack interval uses weapon.speed (per-weapon-type intervals from WEAPON_SPEED_MICROS). Enemy and pet auto-attacks unchanged at 5s. Movement.ts join-combat uses weapon speed. No hardcoded 5s intervals remain in player auto-attack paths. Compiles cleanly.
  </done>
</task>

<task type="auto">
  <name>Task 3: Publish locally, regenerate bindings, verify no runtime errors</name>
  <files>
    src/module_bindings/ (regenerated, not manually edited)
  </files>
  <action>
1. Publish the module locally:
   ```bash
   spacetime publish uwr --project-path C:/projects/uwr/spacetimedb --clear-database -y
   ```

2. Regenerate client bindings:
   ```bash
   spacetime generate --lang typescript --out-dir C:/projects/uwr/src/module_bindings --project-path C:/projects/uwr/spacetimedb
   ```

3. Check server logs for any runtime errors during seeding (particularly ensure_items):
   ```bash
   spacetime logs uwr 2>&1 | tail -50
   ```

4. If the publish fails, check error output and fix. Common issues: missing imports, wrong bigint types, syntax errors.

No schema changes are expected (no new columns on tables), so `--clear-database` is for clean re-seeding of weapon stats only. The ItemTemplate table columns (weaponBaseDamage, weaponDps, weaponType) already exist — we're just changing the VALUES seeded into them.

Note: Do NOT publish to maincloud per project rules. Local only.
  </action>
  <verify>
`spacetime logs uwr` shows no errors. Server starts and seeds successfully. Client bindings regenerate without errors. Run `npx vue-tsc --noEmit` in the project root to verify client still compiles.
  </verify>
  <done>
Module published locally, seeds cleanly with updated weapon stats. Client bindings regenerated. No compile errors on client or server.
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles: `npx tsc --noEmit --project spacetimedb/tsconfig.json` passes
2. No remaining hardcoded player auto-attack intervals: grep confirms `AUTO_ATTACK_INTERVAL` only in enemy/pet/pull-delay paths
3. Module publishes locally without errors
4. Server logs show clean seeding (no runtime errors)
5. Client compiles: `npx vue-tsc --noEmit` passes
</verification>

<success_criteria>
- Daggers and rapiers auto-attack every 3.0s with lower per-hit damage
- Staves and bows auto-attack every 3.5s
- Swords, blades, and maces auto-attack every 4.0s (baseline)
- Axes auto-attack every 5.0s with highest per-hit damage
- DPS roughly balanced across weapon types at the same tier
- Enemies and pets unaffected (still 5s interval)
- No compile errors, no runtime errors
- getEquippedWeaponStats returns speed field
</success_criteria>
