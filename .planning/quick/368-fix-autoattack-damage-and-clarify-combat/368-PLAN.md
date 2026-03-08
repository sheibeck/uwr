---
phase: quick-368
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/helpers/combat_enemies.ts
autonomous: true
requirements: [FIX-AUTOATTACK-DMG, COMBAT-LOG-CLARITY]

must_haves:
  truths:
    - "Player auto-attacks deal damage proportional to weapon baseDamage + dps + level + STR, not just baseDamage + STR"
    - "Enemy auto-attacks apply damage variance via resolveAttack (already working)"
    - "Auto-attack combat log messages are clearly labeled with weapon name to distinguish from ability damage"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Updated auto-attack damage formula and labeled combat messages"
    - path: "spacetimedb/src/helpers/combat_enemies.ts"
      provides: "No changes expected (applyVariance already correct)"
  key_links:
    - from: "processPlayerAutoAttackForRound"
      to: "resolveAttack"
      via: "baseDamage parameter"
      pattern: "baseDamage.*weapon.*dps.*level"
---

<objective>
Fix auto-attack damage so it accounts for weapon damage, weapon DPS, character level, and STR bonus instead of just weapon.baseDamage + STR (which yields ~1 damage after armor mitigation). Also label auto-attack messages with the weapon name so they are clearly distinguishable from ability damage in the combat log.

Purpose: Auto-attacks currently hit for 1 damage because the formula only uses weapon.baseDamage (e.g., 3n for a starter sword) + STR bonus, which after armor mitigation drops to 1. The damage formula needs to incorporate weapon DPS and character level to be meaningful. Combat log messages need weapon names to distinguish auto-attacks from abilities.

Output: Updated combat.ts with proper auto-attack damage formula and labeled messages.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/combat.ts (processPlayerAutoAttackForRound ~line 2259, processEnemyAutoAttackForRound ~line 2409, resolveAttack ~line 586)
@spacetimedb/src/helpers/items.ts (getEquippedWeaponStats returns {baseDamage, dps, name, weaponType, speed})
@spacetimedb/src/helpers/combat_enemies.ts (applyVariance, applyArmorMitigation)
@spacetimedb/src/data/combat_constants.ts (WEAPON_SPEED_MICROS — speed tiers for DPS balancing)

<interfaces>
From spacetimedb/src/helpers/items.ts:
```typescript
// getEquippedWeaponStats returns:
{ baseDamage: bigint, dps: bigint, name: string, weaponType: string, speed: bigint }
// No weapon equipped returns:
{ baseDamage: 0n, dps: 0n, name: '', weaponType: '', speed: DEFAULT_WEAPON_SPEED_MICROS }
```

From spacetimedb/src/helpers/combat_enemies.ts:
```typescript
export function applyVariance(value: bigint, seed: bigint): bigint; // +-15% variance, min 1n
export function applyArmorMitigation(damage: bigint, armorClass: bigint): bigint; // damage * 100 / (100 + armor)
```

Starter weapon baseDamage values (from ensure_items.ts):
- dagger/rapier: 2n-3n, sword/blade/mace: 3n, axe: 4n, staff/bow: 7n, greatsword: 8n
- DPS values are slightly higher than baseDamage in each case

Current player auto-attack formula (line 2275):
```typescript
const baseDamage = (weapon.baseDamage ?? 0n) + (bonuses.str ?? 0n);
// For a starter sword: 3 + 0 STR = 3, after armor (e.g., 10 AC): 3*100/110 = 2, then GLOBAL_DAMAGE_MULTIPLIER
```

Current enemy auto-attack formula (line 2442):
```typescript
const baseDamage = enemy.attackDamage ?? template.baseDamage ?? 5n;
// This is already reasonable — enemies have proper baseDamage from computeEnemyStats
```

Current player auto-attack messages (lines 2293-2298):
```typescript
miss: `You miss ${eName}.`,
hit: (d: bigint) => `You hit ${eName} for ${d} damage.`,
crit: (d: bigint) => `Critical hit on ${eName} for ${d} damage!`,
```
// These are indistinguishable from ability messages except abilities say "Your [Name] hits..."

Current enemy auto-attack messages (lines 2461-2467):
```typescript
hit: (d: bigint) => `${eName} hits you for ${d} damage.`,
crit: (d: bigint) => `${eName} crits you for ${d} damage!`,
```
// Indistinguishable from enemy ability messages
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix player auto-attack damage formula and label all auto-attack messages</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
  In `processPlayerAutoAttackForRound` (around line 2275), replace the baseDamage calculation:

  Current: `const baseDamage = (weapon.baseDamage ?? 0n) + (bonuses.str ?? 0n);`

  New formula — combine weapon baseDamage, weapon DPS, character level, and STR to produce meaningful auto-attack damage:
  ```typescript
  // Auto-attack damage: weapon base + DPS contribution + level scaling + STR
  // DPS/2 adds weapon quality; level adds progression; STR adds stat scaling
  const baseDamage = (weapon.baseDamage ?? 0n) + (weapon.dps ?? 0n) / 2n + (character.level ?? 1n) + (bonuses.str ?? 0n);
  ```

  This means a level 1 starter sword (baseDamage=3, dps=4) with 0 STR gives: 3 + 2 + 1 + 0 = 6 raw damage.
  After 10 armor mitigation: 6*100/110 = ~5 damage. After variance: 4-6 range. Much better than 1.

  Then update ALL auto-attack combat log messages to include the weapon name (or "fists" if unarmed).
  Add a weaponLabel variable right after the weapon lookup:
  ```typescript
  const weaponLabel = weapon.name || 'fists';
  ```

  Update player auto-attack messages to clearly label them:
  - miss: `Your ${weaponLabel} misses ${eName}.` (was: `You miss ${eName}.`)
  - hit: `Your ${weaponLabel} hits ${eName} for ${d} damage.` (was: `You hit ${eName} for ${d} damage.`)
  - crit: `Your ${weaponLabel} crits ${eName} for ${d} damage!` (was: `Critical hit on ${eName} for ${d} damage!`)
  - dodge: `${eName} dodges your ${weaponLabel} swing.` (was: `${eName} dodges your attack.`)
  - parry: `${eName} parries your ${weaponLabel} swing.` (was: `${eName} parries your attack.`)
  - block: `${eName} blocks your ${weaponLabel} swing, taking ${d} damage.` (was: `${eName} blocks your attack, taking ${d} damage.`)

  Update the corresponding group messages similarly:
  - miss: `${character.name}'s ${weaponLabel} misses ${eName}.`
  - hit: `${character.name}'s ${weaponLabel} hits ${eName} for ${d} damage.`
  - crit: `${character.name}'s ${weaponLabel} crits ${eName} for ${d} damage!`
  - dodge: `${eName} dodges ${character.name}'s ${weaponLabel} swing.`
  - parry: `${eName} parries ${character.name}'s ${weaponLabel} swing.`
  - block: `${eName} blocks ${character.name}'s ${weaponLabel} swing (${d} damage).`

  For enemy auto-attacks in `processEnemyAutoAttackForRound` (around line 2461), update messages to label them as auto-attacks:
  - hit: `${eName} strikes you for ${d} damage.` (was: `${eName} hits you for ${d} damage.`)
  - crit: `${eName} lands a crushing blow for ${d} damage!` (was: `${eName} crits you for ${d} damage!`)
  - dodge: `You dodge ${eName}'s strike.` (was: `You dodge ${eName}'s attack.`)
  - miss: `${eName}'s strike misses you.` (was: `${eName} misses you.`)
  - parry: `You parry ${eName}'s strike.` (was: `You parry ${eName}'s attack.`)
  - block: `You block ${eName}'s strike, taking ${d} damage.` (was: `You block ${eName}'s attack, taking ${d} damage.`)

  And enemy group messages:
  - hit: `${eName} strikes ${character.name} for ${d} damage.`
  - crit: `${eName} lands a crushing blow on ${character.name} for ${d}!`
  - dodge: `${character.name} dodges ${eName}'s strike.`
  - miss: `${eName}'s strike misses ${character.name}.`
  - parry: `${character.name} parries ${eName}'s strike.`
  - block: `${character.name} blocks ${eName}'s strike (${d}).`

  Also update the enemy-attacks-pet message (line ~2428) to use "strikes" instead of "hits":
  `${enemy.displayName} strikes ${pet.name} for ${rawDmg} damage.`

  DO NOT touch resolveAttack itself, ability damage in combat.ts helpers, or any other combat functions.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>
  - Player auto-attack baseDamage formula includes weapon.baseDamage + weapon.dps/2 + character.level + STR (producing ~5-6 damage at level 1 instead of ~1)
  - All player auto-attack messages include weapon name (e.g., "Your Training Sword hits X for 5 damage.")
  - All enemy auto-attack messages use "strikes" / "strike" wording to distinguish from ability "hits"
  - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit -p spacetimedb/tsconfig.json` passes
- Grep for old messages to confirm they are all replaced:
  - `grep "You miss\|You hit\|Critical hit on" spacetimedb/src/reducers/combat.ts` should show zero matches in processPlayerAutoAttackForRound
  - `grep "hits you for\|crits you for\|misses you\." spacetimedb/src/reducers/combat.ts` should show zero matches in processEnemyAutoAttackForRound
</verification>

<success_criteria>
- Player auto-attacks deal level-appropriate damage (5-6 at level 1 with starter weapon, scaling up)
- Auto-attack messages in combat log include weapon name for player attacks
- Enemy auto-attack messages use "strikes" wording distinct from ability "hits"
- No regressions in ability damage, resolveAttack, or other combat functions
</success_criteria>

<output>
After completion, create `.planning/quick/368-fix-autoattack-damage-and-clarify-combat/368-SUMMARY.md`
</output>
