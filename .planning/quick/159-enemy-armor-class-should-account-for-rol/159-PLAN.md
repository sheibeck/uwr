---
phase: 159-enemy-ac-role-level
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/seeding/ensure_enemies.ts
autonomous: true
must_haves:
  truths:
    - "Tank enemies (tank role) have the highest effective AC at any given level"
    - "Healer/support enemies have the lowest effective AC at any given level"
    - "DPS enemies have moderate AC between tank and healer"
    - "Higher level enemies of the same role have higher AC than lower level ones"
    - "AC computation follows the same pattern as HP and damage (role config driven)"
  artifacts:
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "Role-based AC via ENEMY_ROLE_CONFIG baseArmor + armorPerLevel fields"
      contains: "baseArmor"
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "Updated computeEnemyStats using role-based AC"
      contains: "baseArmor"
    - path: "spacetimedb/src/seeding/ensure_enemies.ts"
      provides: "Normalized armorClass values in enemy templates"
  key_links:
    - from: "spacetimedb/src/helpers/combat.ts (ENEMY_ROLE_CONFIG)"
      to: "computeEnemyStats"
      via: "role.baseArmor + role.armorPerLevel * level"
      pattern: "baseArmor.*armorPerLevel"
---

<objective>
Make enemy armor class scale meaningfully by combat role and level.

Purpose: Currently every enemy has a flat armorClass in the template (7-14) with only +1 per level from computeEnemyStats. This means a level 1 spirit healer and a level 5 construct tank have nearly the same AC. Enemies should feel distinct — tanks should be armored walls, casters/healers should be squishy, and level should matter.

Output: Updated ENEMY_ROLE_CONFIG with baseArmor/armorPerLevel per role, updated computeEnemyStats to use role-based AC, and normalized template armorClass values.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/combat.ts (ENEMY_ROLE_CONFIG at line ~64, computeEnemyStats at line ~1930, applyArmorMitigation at line ~1924)
@spacetimedb/src/seeding/ensure_enemies.ts (ensureEnemyTemplatesAndRoles at line ~465)
@spacetimedb/src/schema/tables.ts (EnemyTemplate at line ~673, EnemyRoleTemplate at line ~699)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add role-based AC to ENEMY_ROLE_CONFIG and update computeEnemyStats</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
1. Add `baseArmor` and `armorPerLevel` fields to the `ENEMY_ROLE_CONFIG` type and each role entry.

   The AC formula will be: `role.baseArmor + role.armorPerLevel * effectiveLevel`

   This replaces the current: `template.armorClass + effectiveLevel`

   Role AC values (designed so that at level 1, tank ~18 AC, damage ~10 AC, healer ~6 AC, support ~8 AC; and scaling diverges further at higher levels):

   ```
   tank:    { baseArmor: 14n, armorPerLevel: 4n }   // L1=18, L3=26, L5=34 — heavily armored
   damage:  { baseArmor: 6n,  armorPerLevel: 3n }   // L1=9,  L3=15, L5=21 — moderate armor
   support: { baseArmor: 5n,  armorPerLevel: 2n }   // L1=7,  L3=11, L5=15 — light armor
   healer:  { baseArmor: 3n,  armorPerLevel: 2n }   // L1=5,  L3=9,  L5=13 — very light armor
   ```

   Update the TypeScript type for ENEMY_ROLE_CONFIG values to include `baseArmor: bigint; armorPerLevel: bigint`.

2. Update `computeEnemyStats` (line ~1930) to compute AC from role config:

   Change:
   ```typescript
   const baseArmorClass = template.armorClass + effectiveLevel;
   ```
   To:
   ```typescript
   const baseArmorClass = role.baseArmor + role.armorPerLevel * effectiveLevel;
   ```

   This means `template.armorClass` is no longer used in the computation. The template field remains in the schema (no migration needed) but is effectively superseded by role-based computation. This is intentional — the template `armorClass` field can be repurposed later as a per-enemy AC bonus if desired, but for now the role config drives everything.

   Do NOT change the function signature, return type, or any other part of computeEnemyStats.
   Do NOT change applyArmorMitigation or any combat damage code.
   Do NOT change the EnemyTemplate schema.
  </action>
  <verify>
Run `cd /c/projects/uwr/spacetimedb && npx tsc --noEmit` to confirm no type errors. Verify ENEMY_ROLE_CONFIG has all 4 roles with baseArmor and armorPerLevel fields. Verify computeEnemyStats uses role.baseArmor + role.armorPerLevel * effectiveLevel.
  </verify>
  <done>
ENEMY_ROLE_CONFIG has baseArmor/armorPerLevel for tank, damage, support, healer roles. computeEnemyStats computes AC from role config instead of template.armorClass. TypeScript compiles without errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Normalize seeded armorClass values in enemy templates</name>
  <files>spacetimedb/src/seeding/ensure_enemies.ts</files>
  <action>
Now that AC is role-driven, the per-template `armorClass` values are no longer used in combat computation. However, they should be set to sensible values that reflect the enemy's intended toughness in case they are used for display, tooltips, or future per-enemy AC bonuses.

Set all enemy template `armorClass` values to 0n (zero) since the role config now drives AC entirely. This makes it clear the field is not the source of truth for AC.

Update every `armorClass: Xn` in `ensureEnemyTemplatesAndRoles` to `armorClass: 0n`.

The affected enemies and their current values (all become 0n):
- Bog Rat: 12n -> 0n
- Ember Wisp: 8n -> 0n
- Bandit: 8n -> 0n
- Blight Stalker: 9n -> 0n
- Grave Acolyte: 9n -> 0n
- Hexbinder: 9n -> 0n
- Thicket Wolf: 9n -> 0n
- Marsh Croaker: 8n -> 0n
- Dust Hare: 7n -> 0n
- Ash Jackal: 8n -> 0n
- Thorn Sprite: 8n -> 0n
- Gloom Stag: 12n -> 0n
- Mire Leech: 9n -> 0n
- Fen Witch: 9n -> 0n
- Grave Skirmisher: 9n -> 0n
- Cinder Sentinel: 13n -> 0n
- Emberling: 7n -> 0n
- Frostbone Acolyte: 9n -> 0n
- Ridge Skirmisher: 10n -> 0n
- Emberhawk: 9n -> 0n
- Basalt Brute: 14n -> 0n
- Ashen Ram: 12n -> 0n
- Sootbound Sentry: 14n -> 0n
- Grave Servant: 12n -> 0n
- Alley Shade: 10n -> 0n
- Vault Sentinel: 14n -> 0n
- Sootbound Mystic: 10n -> 0n
- Ember Priest: 11n -> 0n
- Ashforged Revenant: 12n -> 0n

Do NOT change any other fields (level, maxHp, baseDamage, xpReward, etc.).
Do NOT change any role template definitions (addRoleTemplate calls).
Do NOT change loot table or vendor logic.
  </action>
  <verify>
Run `cd /c/projects/uwr/spacetimedb && npx tsc --noEmit` to confirm no type errors. Grep for `armorClass:` in ensure_enemies.ts and confirm all values are `0n`.
  </verify>
  <done>
All enemy template armorClass values in ensureEnemyTemplatesAndRoles are 0n. The role-based AC from ENEMY_ROLE_CONFIG is now the sole source of enemy armor class in combat.
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles: `cd /c/projects/uwr/spacetimedb && npx tsc --noEmit` passes
2. Role AC values make sense at sample levels:
   - Tank L1: 14 + 4*1 = 18 AC (~15% damage reduction)
   - Tank L5: 14 + 4*5 = 34 AC (~25% damage reduction)
   - Damage L1: 6 + 3*1 = 9 AC (~8% damage reduction)
   - Damage L5: 6 + 3*5 = 21 AC (~17% damage reduction)
   - Healer L1: 3 + 2*1 = 5 AC (~5% damage reduction)
   - Healer L5: 3 + 2*5 = 13 AC (~11% damage reduction)
3. The spread between tank and healer AC grows with level (13 at L1 vs 21 at L5)
4. No enemy template still uses a non-zero armorClass value
</verification>

<success_criteria>
- ENEMY_ROLE_CONFIG has baseArmor and armorPerLevel for all 4 role types
- computeEnemyStats derives AC from role config, not template.armorClass
- All seeded enemy templates have armorClass: 0n
- TypeScript compiles without errors
- Tank roles have highest AC, healers have lowest, at every level
</success_criteria>

<output>
After completion, create `.planning/quick/159-enemy-armor-class-should-account-for-rol/159-SUMMARY.md`
</output>
