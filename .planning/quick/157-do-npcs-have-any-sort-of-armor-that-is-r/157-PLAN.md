---
phase: quick-157
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
must_haves:
  truths:
    - "User understands whether enemies have armor and how it works"
  artifacts: []
  key_links: []
---

<objective>
Answer: Do NPCs have armor that reduces damage from player characters?

Purpose: Codebase investigation -- no code changes needed.
Output: Analysis report only.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@spacetimedb/src/schema/tables.ts (EnemyTemplate.armorClass field)
@spacetimedb/src/helpers/combat.ts (applyArmorMitigation, computeEnemyStats)
@spacetimedb/src/reducers/combat.ts (resolveAttack, enemy auto-attack section)
@spacetimedb/src/seeding/ensure_enemies.ts (enemy armorClass values)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Report findings -- no code changes</name>
  <files></files>
  <action>
This is a read-only investigation. The answer has already been determined from code analysis:

**YES -- enemies have armor that reduces physical damage from player characters.**

## How Enemy Armor Works

### 1. EnemyTemplate Table (tables.ts line 689)
Every enemy template has an `armorClass: t.u64()` field. Seeded values range from **7n to 14n** across enemy types (e.g., Bog Rat = 12n, Ember Wisp = 8n, higher-tier enemies up to 14n).

### 2. Effective Armor Calculation (combat.ts computeEnemyStats, line 1940)
```
effectiveArmorClass = template.armorClass + template.level
```
A level 5 enemy with base armorClass 10 has 15 effective armor. A level 10 enemy with armorClass 12 has 22 effective armor.

### 3. Armor Mitigation Formula (combat.ts applyArmorMitigation, line 1924)
```
armorReduced = damage * 100 / (100 + armorClass)
globalReduced = armorReduced * 85 / 100
```
This is K=1 formula (~33% reduction at 50 armor, ~50% at 100 armor), then a global 15% damage reduction on top. At typical enemy armor levels (15-25), this means roughly **13-20% physical damage reduction** from armor alone, plus 15% global reduction.

### 4. Damage Type Routing (combat.ts lines 608-616)
- **Physical abilities**: Routed through `applyArmorMitigation` -- enemy armor DOES reduce damage.
- **Magic abilities**: Bypass armor entirely per locked decision #30. Magic damage only gets the global 15% reduction (GLOBAL_DAMAGE_MULTIPLIER = 85n).

### 5. Armor Debuffs Work Against Enemies
- `armor_down` effects reduce enemy armor (lines 463-466).
- Some abilities have `ignoreArmor` option (e.g., Arcane Slash ignores 5 armor).
- Armor cannot go below 0.

### 6. Example Damage Calculation
Player deals 40 raw physical damage vs enemy with 18 effective armor:
- After armor: 40 * 100 / (100 + 18) = 33.9 -> 33
- After global multiplier: 33 * 85 / 100 = 28
- Result: 28 damage dealt (30% total reduction)

Same 40 damage as magic:
- Bypasses armor entirely
- After global multiplier: 40 * 85 / 100 = 34
- Result: 34 damage dealt (15% total reduction)

No code changes required.
  </action>
  <verify>Read-only investigation -- no verification needed.</verify>
  <done>User has a complete understanding of enemy armor mechanics.</done>
</task>

</tasks>

<verification>
No code changes -- purely informational.
</verification>

<success_criteria>
User understands that enemies DO have armor (armorClass field on EnemyTemplate), how it scales (base + level), the mitigation formula (K=1 curve), and that magic bypasses it.
</success_criteria>

<output>
No SUMMARY needed -- this is a read-only investigation.
</output>
