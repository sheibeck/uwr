---
phase: quick-247
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/ability_catalog.ts
  - spacetimedb/src/data/abilities/summoner_abilities.ts
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [247]
---

<objective>
Enforce the Primal Titan's 90-second duration. The ability description already says "for 90 seconds" but nothing actually expires the pet. Add `petDurationSeconds` to AbilityMetadata, `expiresAtMicros` to ActivePet schema, set it when summoning, and dismiss the pet in the regen tick loop.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Add petDurationSeconds to AbilityMetadata</name>
  <files>spacetimedb/src/data/ability_catalog.ts</files>
  <action>
Add `petDurationSeconds?: bigint;` to the AbilityMetadata interface after `resourceCostOverride`:

```typescript
  resourceCostOverride?: bigint;
  petDurationSeconds?: bigint;
```
  </action>
  <done>`petDurationSeconds?: bigint` exists in AbilityMetadata interface.</done>
</task>

<task type="auto">
  <name>Task 2: Set petDurationSeconds on summoner_primal_titan</name>
  <files>spacetimedb/src/data/abilities/summoner_abilities.ts</files>
  <action>
Add `petDurationSeconds: 90n` to the `summoner_primal_titan` entry after `resourceCostOverride`:

```typescript
    resourceCostOverride: 68n,
    petDurationSeconds: 90n,
```
  </action>
  <done>`petDurationSeconds: 90n` present on summoner_primal_titan.</done>
</task>

<task type="auto">
  <name>Task 3: Add expiresAtMicros to ActivePet schema</name>
  <files>spacetimedb/src/schema/tables.ts</files>
  <action>
In the ActivePet table definition (line ~1016), add `expiresAtMicros: t.u64().optional()` after `nextAutoAttackAt`:

```typescript
    nextAutoAttackAt: t.u64().optional(),
    expiresAtMicros: t.u64().optional(),
```
  </action>
  <done>`expiresAtMicros: t.u64().optional()` present in ActivePet columns.</done>
</task>

<task type="auto">
  <name>Task 4: Pass durationSeconds through summonPet and set expiresAtMicros on insert</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
1. Update the `summonPet` function signature (line ~415) to add a `durationSeconds?: bigint` 6th parameter:

```typescript
  const summonPet = (
    petLabel: string,
    petDescription: string,
    namePool: string[],
    ability?: { key: string; cooldownSeconds: bigint },
    stats?: {
      hpBase?: bigint;
      hpPerLevel?: bigint;
      damageBase?: bigint;
      damagePerLevel?: bigint;
      weaponScalePercent?: bigint;
    },
    durationSeconds?: bigint
  ) => {
```

2. In the `ctx.db.activePet.insert(...)` call (line ~447), add `expiresAtMicros` after `nextAutoAttackAt`:

```typescript
      nextAutoAttackAt: inActiveCombat ? nowMicros + AUTO_ATTACK_INTERVAL : undefined,
      expiresAtMicros: durationSeconds ? nowMicros + durationSeconds * 1_000_000n : undefined,
```

3. In the `summoner_primal_titan` case (line ~1763), pass `90n` as the 6th argument:

```typescript
      case 'summoner_primal_titan':
        summonPet(
          'Primal Titan', 'the Primal Titan',
          ['Titan', 'Colossus', 'Ancient'],
          { key: 'pet_aoe_heal', cooldownSeconds: 6n },
          { hpBase: 60n, hpPerLevel: 20n, damageBase: 6n, damagePerLevel: 4n, weaponScalePercent: 70n },
          90n
        );
```
  </action>
  <done>summonPet has durationSeconds param; insert sets expiresAtMicros; primal_titan passes 90n.</done>
</task>

<task type="auto">
  <name>Task 5: Check pet expiry in regen_health tick loop</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In the pet HP regen loop inside `regen_health` (line ~1354), add an expiry check at the top of the loop body, before the HP regen logic:

```typescript
    for (const pet of ctx.db.activePet.iter()) {
      // Dismiss timed pets when their duration has elapsed
      if (pet.expiresAtMicros !== undefined && pet.expiresAtMicros !== null &&
          ctx.timestamp.microsSinceUnixEpoch >= pet.expiresAtMicros) {
        ctx.db.activePet.id.delete(pet.id);
        continue;
      }
      if (pet.currentHp === 0n) continue;
```
  </action>
  <done>Pet expiry check present at top of activePet loop in regen_health.</done>
</task>

<task type="auto">
  <name>Task 6: Publish to local and regenerate bindings</name>
  <action>
1. `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb --clear-database -y`
2. `spacetime generate --lang typescript --out-dir C:/projects/uwr/src/module_bindings --project-path C:/projects/uwr/spacetimedb`
  </action>
  <done>Publish succeeds with exit 0. Bindings regenerated.</done>
</task>

</tasks>
