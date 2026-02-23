---
phase: quick-289
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/helpers/combat_rewards.ts
  - spacetimedb/src/helpers/combat_perks.ts
  - spacetimedb/src/helpers/combat_enemies.ts
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/seeding/ensure_items.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "All existing tests and functionality unchanged after refactor"
    - "No function signatures or behavior modified"
    - "Every import resolves correctly across all consuming files"
  artifacts:
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "Core combat mechanics + ability execution (~2300 lines)"
    - path: "spacetimedb/src/helpers/combat_rewards.ts"
      provides: "Post-combat rewards, XP, death penalties, event contributions"
    - path: "spacetimedb/src/helpers/combat_perks.ts"
      provides: "Perk proc system and active perk abilities"
    - path: "spacetimedb/src/helpers/combat_enemies.ts"
      provides: "Enemy stat computation, role config, armor mitigation"
  key_links:
    - from: "spacetimedb/src/helpers/combat.ts"
      to: "spacetimedb/src/helpers/combat_enemies.ts"
      via: "imports applyArmorMitigation, scaleByPercent for ability execution"
      pattern: "from ['\"]\\./combat_enemies['\"]"
    - from: "spacetimedb/src/helpers/combat_perks.ts"
      to: "spacetimedb/src/helpers/combat.ts"
      via: "imports addCharacterEffect for perk buff application"
      pattern: "from ['\"]\\./combat['\"]"
    - from: "spacetimedb/src/index.ts"
      to: "spacetimedb/src/helpers/combat_perks.ts"
      via: "imports executePerkAbility, calculateFleeChance"
      pattern: "from ['\"]\\./helpers/combat_perks['\"]"
---

<objective>
Reorganize the 2912-line combat.ts monolith and the 246-line combat_rewards.ts into
four cohesive helper files with clean responsibilities, without changing any behavior.

Purpose: combat.ts is too large to navigate or maintain. Functions cluster into natural
groups — enemy stat math, perk procs, XP/rewards, and ability execution — that belong
in separate files.

Output: Four combat helper files with clear responsibilities and all imports updated.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/combat.ts
@spacetimedb/src/helpers/combat_rewards.ts
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/index.ts
@spacetimedb/src/seeding/ensure_items.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract combat_enemies.ts and combat_perks.ts from combat.ts</name>
  <files>
    spacetimedb/src/helpers/combat_enemies.ts
    spacetimedb/src/helpers/combat_perks.ts
    spacetimedb/src/helpers/combat.ts
  </files>
  <action>
Read combat.ts fully before making any changes.

**Create `combat_enemies.ts`** with these exports moved out of combat.ts:
- `ENEMY_ROLE_CONFIG` (the Record constant, lines 66-102)
- `getEnemyRole(role: string)` (line 2629) — uses ENEMY_ROLE_CONFIG
- `scaleByPercent(value, percent)` (line 2634) — pure math
- `applyArmorMitigation(damage, armorClass)` (line 2644) — imports GLOBAL_DAMAGE_MULTIPLIER from data/combat_scaling
- `computeEnemyStats(template, roleTemplate, participants)` (line 2650) — uses getEnemyRole, imports EnemyTemplate/EnemyRoleTemplate/Character from schema/tables

combat_enemies.ts needs these imports:
- `{ GLOBAL_DAMAGE_MULTIPLIER }` from `../data/combat_scaling`
- `{ EnemyTemplate, EnemyRoleTemplate, Character }` from `../schema/tables`

**Create `combat_perks.ts`** with these exports moved out of combat.ts:
- `applyPerkProcs(ctx, character, eventType, damageDealt, seed, combatId, enemy)` (line 2684) — the entire function
- `findPerkByKey(perkKey)` (line 2804, currently private — keep it non-exported) — used by executePerkAbility
- `executePerkAbility(ctx, character, abilityKey)` (line 2820) — the entire function
- `calculateFleeChance(dangerMultiplier)` (line 2909)

combat_perks.ts needs these imports:
- `{ SenderError }` from `spacetimedb/server`
- `{ getPerkProcs }` from `./renown`
- `{ RENOWN_PERK_POOLS }` from `../data/renown_data`
- `{ addCharacterEffect }` from `./combat` (circular-safe: combat.ts does NOT import from combat_perks.ts)
- `{ appendPrivateEvent, appendGroupEvent }` from `./events`
- `{ getEquippedWeaponStats }` from `./items`
- `{ effectiveGroupId }` from `./group`

`activeCombatIdForCharacter` is a private helper in combat.ts used ONLY by `executePerkAbility`. Move it into combat_perks.ts as a private function.

**Update combat.ts:**
- Remove the 5 functions/constants moved to combat_enemies.ts
- Remove the 4 functions moved to combat_perks.ts (including private `findPerkByKey` and private `activeCombatIdForCharacter`)
- Add import of `{ applyArmorMitigation, scaleByPercent }` from `./combat_enemies` (these are used within executeAbility and other functions remaining in combat.ts)
- Remove imports that are no longer needed (SenderError may still be needed for executeAbility; check before removing). Specifically, these imports are only used by moved functions and should be removed:
  - `{ getPerkProcs }` from `./renown` — only used by applyPerkProcs (VERIFY: grep for other uses first)
  - `{ RENOWN_PERK_POOLS }` from `../data/renown_data` — only used by findPerkByKey (VERIFY first)
  - `{ effectiveGroupId }` from `./group` — VERIFY if used elsewhere in combat.ts before removing

IMPORTANT: `EnemyTemplate`, `EnemyRoleTemplate`, `Character` from schema/tables — check if these are used by remaining combat.ts code before removing the import.

Keep the re-exports of combat constants (COMBAT_LOOP_INTERVAL_MICROS, etc.) in combat.ts since index.ts imports them from there.

Do NOT move or touch: `rollAttackOutcome`, `abilityResourceCost`, `staminaResourceCost`, `hasShieldEquipped`, `abilityCooldownMicros`, `abilityCastMicros`, `enemyAbilityCastMicros`, `enemyAbilityCooldownMicros`, `abilityDamageFromWeapon`, `addCharacterEffect`, `addEnemyEffect`, `applyHpBonus`, `getTopAggroId`, `sumCharacterEffect`, `sumEnemyEffect`, `executeAbility`, `applyEnemyAbilityDamage`, `executeEnemyAbility`, `executePetAbility`, `executeAbilityAction`, `awardXp`, `applyDeathXpPenalty`, `scheduleCombatTick`, `computeRacialAtLevelFromRow` (private).
  </action>
  <verify>
Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` from project root — zero type errors.
Grep all files in spacetimedb/src/ for imports from `helpers/combat` and verify every imported symbol still exists in its declared source file.
  </verify>
  <done>
combat_enemies.ts exists with 5 exports (ENEMY_ROLE_CONFIG, getEnemyRole, scaleByPercent, applyArmorMitigation, computeEnemyStats).
combat_perks.ts exists with 3 exports (applyPerkProcs, executePerkAbility, calculateFleeChance) plus 2 private helpers.
combat.ts no longer contains any of those functions. combat.ts imports applyArmorMitigation and scaleByPercent from combat_enemies.
Zero type errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Move XP functions into combat_rewards.ts and update all consumer imports</name>
  <files>
    spacetimedb/src/helpers/combat.ts
    spacetimedb/src/helpers/combat_rewards.ts
    spacetimedb/src/index.ts
    spacetimedb/src/reducers/combat.ts
    spacetimedb/src/seeding/ensure_items.ts
  </files>
  <action>
Read combat.ts, combat_rewards.ts, index.ts, reducers/combat.ts, and seeding/ensure_items.ts fully before making any changes.

**Move into combat_rewards.ts** from combat.ts:
- `awardXp(ctx, character, enemyLevel, baseXp)` (line 2534) — the entire function including the `computeRacialAtLevelFromRow` private helper it depends on (line 2475)
- `applyDeathXpPenalty(ctx, character)` (line 2615) — the entire function

combat_rewards.ts will need these additional imports for the moved functions:
- `{ MAX_LEVEL, xpModifierForDiff, xpRequiredForLevel }` from `../data/xp`
- `{ computeBaseStats }` from `../data/class_stats`
- `{ recomputeCharacterDerived }` from `./character`
- `{ appendPrivateEvent }` from `./events`

Place `computeRacialAtLevelFromRow` as a private (non-exported) function in combat_rewards.ts, above `awardXp`.

**Update combat.ts:**
- Remove `awardXp`, `applyDeathXpPenalty`, and private `computeRacialAtLevelFromRow`
- Check if any remaining function in combat.ts calls `awardXp` or `applyDeathXpPenalty` — if so, add import from `./combat_rewards`. (Based on analysis: these are only called from reducers/combat.ts and index.ts, not from within helpers/combat.ts itself.)
- Clean up imports in combat.ts that are now unused after all extractions (Task 1 + Task 2). Specifically check:
  - `{ MAX_LEVEL, xpModifierForDiff, xpRequiredForLevel }` from data/xp — if only used by awardXp/applyDeathXpPenalty, remove
  - `{ computeBaseStats }` from data/class_stats — if only used by awardXp, remove (normalizeClassName may still be used)
  - `{ recomputeCharacterDerived }` from helpers/character — VERIFY if used elsewhere before removing

**Update index.ts** (barrel re-exports for SpacetimeDB module):
- Change import of `awardXp`, `applyDeathXpPenalty` from `'./helpers/combat'` to `'./helpers/combat_rewards'`
- Change import of `getEnemyRole`, `scaleByPercent`, `applyArmorMitigation`, `computeEnemyStats` from `'./helpers/combat'` to `'./helpers/combat_enemies'`
- Change import of `executePerkAbility`, `calculateFleeChance` from `'./helpers/combat'` to `'./helpers/combat_perks'`
- Add import of `applyPerkProcs` from `'./helpers/combat_perks'` IF it is currently imported from combat (check first)
- Keep remaining combat.ts imports that still live there (rollAttackOutcome, executeAbility, addCharacterEffect, etc.)

**Update reducers/combat.ts:**
- Change `import { applyPerkProcs, addCharacterEffect, addEnemyEffect } from '../helpers/combat'` to:
  - `import { addCharacterEffect, addEnemyEffect } from '../helpers/combat'`
  - `import { applyPerkProcs } from '../helpers/combat_perks'`
- combat_rewards imports already correct (no change needed)

**Update seeding/ensure_items.ts:**
- `import { abilityResourceCost, staminaResourceCost } from '../helpers/combat'` — these stay in combat.ts, NO CHANGE needed here.
  </action>
  <verify>
Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` from project root — zero type errors.
Run `spacetime build --project-path spacetimedb` (if available) or verify no build errors.
Grep all files in spacetimedb/src/ for any import of a symbol from a file where it no longer exists — should find zero matches.
Verify line count of combat.ts is approximately 2200-2350 lines (down from 2912).
  </verify>
  <done>
combat_rewards.ts contains awardXp, applyDeathXpPenalty, and all original reward helpers.
combat.ts is reduced to ~2300 lines containing only ability execution, effects, attack outcomes, resource costs, and cooldown helpers.
index.ts imports each symbol from its new correct source file.
reducers/combat.ts imports applyPerkProcs from combat_perks.
Zero type errors across the entire project.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit --project spacetimedb/tsconfig.json` passes with zero errors
2. Every exported symbol is importable from exactly one file (no duplicates)
3. No circular dependency chains (combat.ts does NOT import from combat_perks.ts or combat_rewards.ts; combat_perks.ts imports from combat.ts which is safe one-directional)
4. File sizes after refactor:
   - combat.ts: ~2200-2350 lines (ability execution + effects + core mechanics)
   - combat_rewards.ts: ~350-380 lines (post-combat + XP)
   - combat_perks.ts: ~250-280 lines (perk procs + active perks + flee)
   - combat_enemies.ts: ~80-100 lines (enemy stat math)
</verification>

<success_criteria>
- combat.ts reduced from 2912 lines to ~2300 lines
- Four helper files with clear, non-overlapping responsibilities
- Zero behavior changes — pure file reorganization
- All imports resolve across all 4 consumer files (index.ts, reducers/combat.ts, seeding/ensure_items.ts, and internal cross-imports)
- Zero TypeScript compilation errors
</success_criteria>

<output>
After completion, create `.planning/quick/289-reorganize-combat-helper-files-into-sens/289-SUMMARY.md`
</output>
