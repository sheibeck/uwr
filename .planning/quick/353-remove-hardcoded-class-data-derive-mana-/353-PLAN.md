---
phase: quick-353
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/class_stats.ts
  - spacetimedb/src/helpers/character.ts
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/helpers/combat_rewards.ts
  - spacetimedb/src/helpers/items.ts
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/reducers/characters.ts
  - spacetimedb/src/reducers/commands.ts
  - spacetimedb/src/reducers/creation.ts
  - spacetimedb/src/data/combat_scaling.ts
  - spacetimedb/src/index.ts
autonomous: true
requirements: [QUICK-353]
must_haves:
  truths:
    - "No hardcoded class lists remain (CLASS_CONFIG, MANA_CLASSES, HYBRID_MANA_CLASSES, PARRY_CLASSES, TANK_CLASSES, HEALER_CLASSES, CLASS_ARMOR, SHIELD_CLASSES)"
    - "Characters with mana abilities get maxMana > 0; characters without mana abilities get maxMana = 0"
    - "All characters get stamina (unchanged)"
    - "Level-up stat computation works without class lookups"
    - "Combat parry/canParry derives from character data, not class name"
    - "Starter items work without CLASS_ARMOR lookup"
  artifacts:
    - path: "spacetimedb/src/data/class_stats.ts"
      provides: "Only generic constants (BASE_HP, BASE_MANA, etc.) and normalizeClassName — no class-specific Sets or Records"
    - path: "spacetimedb/src/helpers/character.ts"
      provides: "recomputeCharacterDerived using ability-based mana detection"
  key_links:
    - from: "spacetimedb/src/helpers/character.ts"
      to: "ability_template table"
      via: "ctx.db.abilityTemplate.by_character.filter(characterId) to check resourceType === 'mana'"
      pattern: "abilityTemplate.*by_character.*filter"
---

<objective>
Remove all hardcoded class data from class_stats.ts and update every consumer to derive behavior from character data instead of class name lookups.

Purpose: In v2.0, classes are LLM-generated and dynamic. Hardcoded class lists (CLASS_CONFIG, MANA_CLASSES, PARRY_CLASSES, etc.) are legacy and break for any generated class not in the list. Mana usage should be derived from whether the character has abilities with `resourceType === 'mana'`.

Output: A class_stats.ts with only generic constants and utility functions, plus all consumers updated.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/data/class_stats.ts
@spacetimedb/src/helpers/character.ts
@spacetimedb/src/helpers/combat.ts
@spacetimedb/src/helpers/combat_rewards.ts
@spacetimedb/src/helpers/items.ts
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/reducers/characters.ts
@spacetimedb/src/reducers/commands.ts
@spacetimedb/src/reducers/creation.ts
@spacetimedb/src/data/combat_scaling.ts
@spacetimedb/src/index.ts
@spacetimedb/src/schema/tables.ts (lines 598-658 for AbilityTemplate schema)

<interfaces>
AbilityTemplate table has:
- characterId: u64 (indexed as by_character)
- resourceType: string ('mana', 'stamina', 'none')
- All other ability fields

Character table has:
- className: string
- str/dex/cha/wis/int: u64 (base stats stored directly)
- maxHp/maxMana/maxStamina: u64 (derived, recomputed)
- racialMaxHp/racialMaxMana/etc: u64 optional

CharacterCreationState table has:
- classStats: string (JSON with primaryStat, secondaryStat, bonusHp, bonusMana, armorProficiency, usesMana)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Gut class_stats.ts — remove all class-specific data, keep only generic constants</name>
  <files>spacetimedb/src/data/class_stats.ts</files>
  <action>
Remove these exports entirely:
- `CLASS_CONFIG` Record
- `MANA_CLASSES` Set
- `HYBRID_MANA_CLASSES` Set
- `PARRY_CLASSES` Set
- `TANK_CLASSES` Set
- `HEALER_CLASSES` Set
- `CLASS_ARMOR` Record
- `SHIELD_CLASSES` Set
- `BASE_ARMOR_CLASS` Record
- `getClassConfig()` function
- `computeBaseStats()` function (class-name-based version)
- `usesMana()` function
- `canParry()` function
- `manaStatForClass()` function
- `baseArmorForClass()` function
- `isArmorAllowedForClass()` function
- `isClassParryCapable()` function
- `isClassManaUser()` function
- `getBaseArmorForArchetype()` function
- `getClassConfigByArchetype()` function

KEEP these (they are generic, not class-specific):
- `StatKey` type
- `BASE_STAT`, `PRIMARY_BONUS`, `SECONDARY_BONUS`, `PRIMARY_GROWTH`, `SECONDARY_GROWTH`, `OTHER_GROWTH` constants
- `BASE_HP`, `HP_STR_MULTIPLIER`, `BASE_MANA`, `MANA_MULTIPLIER`, `HYBRID_MANA_MULTIPLIER` constants
- `ARMOR_TYPES`, `ARMOR_TYPES_WITH_NONE` arrays
- `normalizeClassName()` function
- `normalizeArmorType()` function
- `computeBaseStatsForGenerated()` function (this one takes primaryStat/secondaryStat directly, not className)

Add ONE new helper function:
```typescript
/**
 * Check if a character has any ability with the given resourceType.
 * Used to derive mana/stamina usage from actual abilities instead of class name.
 */
export function characterUsesResource(ctx: any, characterId: bigint, resourceType: string): boolean {
  for (const ability of ctx.db.abilityTemplate.by_character.filter(characterId)) {
    if (ability.resourceType === resourceType) return true;
  }
  return false;
}
```

Also add a helper to get the best caster stat for mana computation:
```typescript
/**
 * For characters with mana abilities, compute the mana stat as max(int, wis, cha).
 * This replaces the old class-based manaStatForClass lookup.
 */
export function bestCasterStat(stats: Record<StatKey, bigint>): bigint {
  const candidates: StatKey[] = ['int', 'wis', 'cha'];
  return candidates.reduce((best, key) => stats[key] > best ? stats[key] : best, 0n);
}
```
  </action>
  <verify>
    <automated>cd spacetimedb && npx tsc --noEmit src/data/class_stats.ts 2>&1 | head -20</automated>
  </verify>
  <done>class_stats.ts contains only generic constants, normalizeClassName, normalizeArmorType, computeBaseStatsForGenerated, characterUsesResource, and bestCasterStat. No class-specific Sets/Records/lookups remain.</done>
</task>

<task type="auto">
  <name>Task 2: Update all consumers to use character data instead of class lookups</name>
  <files>
    spacetimedb/src/helpers/character.ts,
    spacetimedb/src/helpers/combat.ts,
    spacetimedb/src/helpers/combat_rewards.ts,
    spacetimedb/src/helpers/items.ts,
    spacetimedb/src/reducers/combat.ts,
    spacetimedb/src/reducers/characters.ts,
    spacetimedb/src/reducers/commands.ts,
    spacetimedb/src/reducers/creation.ts,
    spacetimedb/src/data/combat_scaling.ts,
    spacetimedb/src/index.ts
  </files>
  <action>
**spacetimedb/src/helpers/character.ts** — `recomputeCharacterDerived`:
- Remove imports of `HYBRID_MANA_CLASSES`, `baseArmorForClass`, `manaStatForClass`, `usesMana`
- Import `characterUsesResource`, `bestCasterStat`, `BASE_MANA`, `MANA_MULTIPLIER` from class_stats
- Replace mana computation:
  - Old: `usesMana(className)` check + `manaStatForClass` + `HYBRID_MANA_CLASSES` multiplier
  - New: `characterUsesResource(ctx, character.id, 'mana')` to check if character needs mana. If yes, `maxMana = BASE_MANA + bestCasterStat(totalStats) * MANA_MULTIPLIER + gear.manaBonus + racialMaxMana`. Use single MANA_MULTIPLIER for all (no hybrid distinction — v2.0 classes are all unique).
  - If no mana abilities: `maxMana = 0n`
- Replace armor computation:
  - Old: `baseArmorForClass(character.className)`
  - New: Use a default base armor of `2n` (cloth equivalent). The character's actual armor comes from equipped gear (`gear.armorClassBonus`) plus effects. In v2.0, armor proficiency is stored in the creation state and applied via equipment restrictions, not a class lookup. So `armorClass = 2n + gear.armorClassBonus + acBonus + racialArmorBonus`.

**spacetimedb/src/helpers/combat.ts**:
- The local `TANK_CLASSES` and `HEALER_CLASSES` Sets on lines ~39-40 are used for threat multipliers in `calculateAggro` (line ~409). Replace with: check if character has any healing-type abilities (kind === 'heal' or 'group_heal') for HEALER_THREAT, or if the character is using a shield for TANK_THREAT. Simplest: remove class-based threat distinction entirely — all characters use base threat. Or: keep a simple heuristic: characters with shield equipped get tank threat, characters with heal abilities get healer threat.
- The `canParry` in combat.ts at line 2441 calls `canParry(character.className)` from class_stats via deps. Replace with: ALL characters can parry (parry is a universal combat mechanic gated by dex). Set `canParry: true` for all player characters. Enemies already pass `canParry: false`.

**spacetimedb/src/reducers/combat.ts**:
- Remove import of `TANK_CLASSES`, `HEALER_CLASSES` from class_stats (line 3)
- The `canParry` at line 312 is destructured from `deps` — this comes from index.ts. See index.ts changes below.
- At line 2441 where `canParry: canParry(character.className)` is called: change to `canParry: true` (all player characters can parry in v2.0).

**spacetimedb/src/helpers/combat_rewards.ts**:
- `computeBaseStats(character.className, newLevel)` at line 338 for level-up stat recalculation.
- Replace with `computeBaseStatsForGenerated(primaryStat, secondaryStat, newLevel)`. To get primaryStat/secondaryStat: parse from `character.classStats` JSON field if available, or fall back to detecting the two highest base stats at level 1 (subtract racial contributions, find which stats had bonuses). Simplest approach: store primaryStat/secondaryStat on the character row. But since we can't change schema easily, use: read classStats JSON from CharacterCreationState if still available, OR compute from the character's current stats which ones are primary/secondary by checking which have the highest values after removing level growth. BETTER: just use `computeBaseStatsForGenerated` by extracting primary/secondary from the classStats JSON stored on CharacterCreationState. Actually, the character table itself doesn't store classStats. The creation flow stores stats directly. For level-up: since stats are already stored on the character, we just need to ADD the per-level growth. Change approach: instead of recomputing from scratch, add growth increments. `character.str += PRIMARY_GROWTH` for primary, `SECONDARY_GROWTH` for secondary, `OTHER_GROWTH` for others. But we need to know which stat is primary. SOLUTION: Look at the character's abilities and class generation data. Actually the simplest v2.0 approach: store `primaryStat` and `secondaryStat` as columns on the character table. But that requires schema change + republish. ALTERNATIVE: For now, keep `computeBaseStatsForGenerated` and extract primary/secondary from the character's creation state. The `CharacterCreationState` row may be deleted after creation. So instead: detect primary/secondary from the character's base stats at level 1 (the two highest stats reveal primary/secondary since we applied PRIMARY_BONUS and SECONDARY_BONUS). Write a helper: `detectPrimarySecondary(character)` that checks current stats minus level growth to find which two are highest. OR even simpler: just use the two highest current stats as primary/secondary for growth purposes. This is what we'll do:
  ```typescript
  function detectPrimarySecondary(character: any): { primary: StatKey; secondary: StatKey | undefined } {
    const stats: [StatKey, bigint][] = [
      ['str', character.str], ['dex', character.dex], ['cha', character.cha],
      ['wis', character.wis], ['int', character.int],
    ];
    stats.sort((a, b) => Number(b[1] - a[1]));
    const primary = stats[0][0];
    // Secondary only if there's a clear gap between 2nd and 3rd
    const secondary = stats[1][1] > stats[2][1] ? stats[1][0] : undefined;
    return { primary, secondary };
  }
  ```
  Then: `const { primary, secondary } = detectPrimarySecondary(character);` and `computeBaseStatsForGenerated(primary, secondary, newLevel)`.

**spacetimedb/src/reducers/characters.ts**:
- Line 230: `computeBaseStats(className, 1n)` — this is in the legacy `create_character` reducer. Replace with `computeBaseStatsForGenerated('str', undefined, 1n)` as a safe default (this reducer is legacy and may not be actively used, but needs to compile). Or better: derive primary from whatever stat the class name suggests — but since we're removing class lookups, just use str as default primary for the legacy path.

**spacetimedb/src/reducers/commands.ts**:
- Line 633: `computeBaseStats(character.className, target)` — this is in the admin `/setlevel` command. Replace with same pattern as combat_rewards: `detectPrimarySecondary(character)` + `computeBaseStatsForGenerated(primary, secondary, target)`.

**spacetimedb/src/reducers/creation.ts**:
- Line 352: already uses `computeBaseStatsForGenerated(primaryStat, secondaryStat, 1n)` — no change needed.

**spacetimedb/src/data/combat_scaling.ts**:
- Line 1: imports `getClassConfig` — used at line 327 for hybrid ability stat scaling.
- Replace: instead of looking up CLASS_CONFIG for the class, use the same `detectPrimarySecondary` approach. When `statScaling === 'hybrid'`, look up the character's primary/secondary stats (need to pass them in or detect them). SIMPLEST: change the function signature to accept primaryStat/secondaryStat directly instead of className. Update the caller in the combat reducer to pass these through.
- Actually, check: `getAbilityStatDamage` at line ~320 takes `className` and `characterStats`. Change it to take `primaryStat: StatKey` and `secondaryStat: StatKey | undefined` instead of `className: string`. Update all callers.

**spacetimedb/src/index.ts**:
- Remove all class-specific imports: `CLASS_ARMOR`, `baseArmorForClass`, `canParry`, `computeBaseStats`, `manaStatForClass`, `usesMana`, `TANK_CLASSES`, `HEALER_CLASSES`, `HYBRID_MANA_CLASSES`, `MANA_MULTIPLIER`, `HYBRID_MANA_MULTIPLIER`, `isArmorAllowedForClass`
- Keep: `ARMOR_TYPES_WITH_NONE`, `BASE_HP`, `HP_STR_MULTIPLIER`, `BASE_MANA`, `normalizeArmorType`, `normalizeClassName`, `computeBaseStatsForGenerated`
- Update `reducerDeps` object: remove `canParry`, `computeBaseStats`, `manaStatForClass`, `baseArmorForClass`, `usesMana`, `HYBRID_MANA_CLASSES`, `normalizeClassName` (only remove from deps if no longer needed by any reducer). Keep `normalizeClassName` if still used elsewhere.
- Add new imports: `characterUsesResource`, `bestCasterStat`
- The `usesMana` reference at line 829 in the creation class-generation callback: this reads `stats.usesMana` from LLM-generated class JSON — this is fine, it's reading from LLM output not from class_stats. Leave as-is.

**spacetimedb/src/helpers/items.ts** — `grantStarterItems`:
- Remove import of `CLASS_ARMOR`, `normalizeClassName` from class_stats
- The function uses `CLASS_ARMOR[normalizeClassName(character.className)]` to determine starter armor type and `SHIELD_CLASSES` for shield grants.
- Replace: In v2.0, the character's creation state has `armorProficiency` in the classStats JSON. But by the time grantStarterItems runs, creation state may be gone. Simplest: grant cloth armor to everyone as starter gear (it's starter gear, not endgame). For shield: check if character has any abilities that suggest tanking, or just skip shield for now (v2.0 equipment is generated/found). Actually, keep it simple: all starters get cloth armor + a basic weapon. Remove the class-based armor/shield logic. Use `'cloth'` as the default armor type. Remove SHIELD_CLASSES check — no starter shield for anyone (shields are found/bought in-game).
- Keep `normalizeClassName` import if still needed for weapon lookup. Actually the STARTER_WEAPONS map is also keyed by class name — this is also legacy. Replace with a generic starter weapon (e.g., "Training Staff" for mystic archetype, "Training Sword" for warrior archetype). Check if `character.archetype` or similar exists. If not, just give everyone "Training Sword" as default. Actually check the STARTER_WEAPONS map to see what's there.

For STARTER_WEAPONS: these are keyed by hardcoded class names too. Since this is starter gear, simplify to: give a "Training Sword" to everyone as default starter weapon. The weapon templates already exist from seeding.
  </action>
  <verify>
    <automated>cd spacetimedb && npx tsc --noEmit 2>&1 | head -40</automated>
  </verify>
  <done>All files compile with no TypeScript errors. No references to removed exports remain. grep for CLASS_CONFIG, MANA_CLASSES, HYBRID_MANA_CLASSES, PARRY_CLASSES, TANK_CLASSES, HEALER_CLASSES, CLASS_ARMOR, SHIELD_CLASSES across the codebase returns zero results (outside of comments). Characters with mana abilities get maxMana > 0, characters without get maxMana = 0. All player characters can parry. Level-up uses detectPrimarySecondary + computeBaseStatsForGenerated.</done>
</task>

</tasks>

<verification>
```bash
# 1. TypeScript compilation passes
cd spacetimedb && npx tsc --noEmit

# 2. No references to removed class-specific exports
grep -rn "CLASS_CONFIG\|MANA_CLASSES\b\|HYBRID_MANA_CLASSES\|PARRY_CLASSES\b\|TANK_CLASSES\|HEALER_CLASSES\|CLASS_ARMOR\|SHIELD_CLASSES\b\|getClassConfig\|computeBaseStats[^F]\|usesMana\|canParry\|manaStatForClass\|baseArmorForClass\|isArmorAllowedForClass\|isClassParryCapable\|isClassManaUser\|getBaseArmorForArchetype\|getClassConfigByArchetype" --include="*.ts" spacetimedb/src/ | grep -v "class_stats.ts" | grep -v "// " | grep -v "comment"

# 3. Publish to local SpacetimeDB succeeds
spacetime publish uwr -p spacetimedb --clear-database -y
```
</verification>

<success_criteria>
- Zero hardcoded class lists in codebase
- TypeScript compiles clean
- Local publish succeeds
- recomputeCharacterDerived derives mana from ability_template resourceType
- Level-up correctly applies stat growth without class name lookup
- All player characters can parry in combat
</success_criteria>

<output>
After completion, create `.planning/quick/353-remove-hardcoded-class-data-derive-mana-/353-SUMMARY.md`
</output>
