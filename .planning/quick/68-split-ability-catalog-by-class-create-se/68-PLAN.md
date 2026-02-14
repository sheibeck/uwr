---
phase: quick-68
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/abilities/shaman_abilities.ts
  - spacetimedb/src/data/abilities/warrior_abilities.ts
  - spacetimedb/src/data/abilities/enchanter_abilities.ts
  - spacetimedb/src/data/abilities/cleric_abilities.ts
  - spacetimedb/src/data/abilities/wizard_abilities.ts
  - spacetimedb/src/data/abilities/rogue_abilities.ts
  - spacetimedb/src/data/abilities/paladin_abilities.ts
  - spacetimedb/src/data/abilities/ranger_abilities.ts
  - spacetimedb/src/data/abilities/necromancer_abilities.ts
  - spacetimedb/src/data/abilities/spellblade_abilities.ts
  - spacetimedb/src/data/abilities/bard_abilities.ts
  - spacetimedb/src/data/abilities/beastmaster_abilities.ts
  - spacetimedb/src/data/abilities/monk_abilities.ts
  - spacetimedb/src/data/abilities/druid_abilities.ts
  - spacetimedb/src/data/abilities/reaver_abilities.ts
  - spacetimedb/src/data/abilities/summoner_abilities.ts
  - spacetimedb/src/data/abilities/enemy_abilities.ts
  - spacetimedb/src/data/ability_catalog.ts
autonomous: true

must_haves:
  truths:
    - "ABILITIES constant still contains all 80 player abilities with identical keys and values"
    - "ENEMY_ABILITIES constant still contains all enemy abilities with identical keys and values"
    - "All existing imports from ability_catalog.ts continue to resolve (ABILITIES, ENEMY_ABILITIES, GLOBAL_COOLDOWN_MICROS, AbilityMetadata, DamageType)"
    - "Module builds and publishes successfully"
  artifacts:
    - path: "spacetimedb/src/data/abilities/"
      provides: "Per-class ability files"
    - path: "spacetimedb/src/data/ability_catalog.ts"
      provides: "Re-exports merged ABILITIES, ENEMY_ABILITIES, types"
  key_links:
    - from: "spacetimedb/src/data/ability_catalog.ts"
      to: "spacetimedb/src/data/abilities/*.ts"
      via: "import and spread into ABILITIES/ENEMY_ABILITIES"
      pattern: "import.*from.*abilities/"
    - from: "spacetimedb/src/index.ts"
      to: "spacetimedb/src/data/ability_catalog.ts"
      via: "unchanged import path"
      pattern: "from.*data/ability_catalog"
---

<objective>
Split the monolithic ability_catalog.ts (~1400 lines) into per-class ability files for better organization and maintainability as the ability count grows toward 300-500+.

Purpose: Improve code organization so each class's abilities are in their own file, making it easier to find, edit, and extend abilities per class.
Output: 17 new files (16 classes + 1 enemy) in abilities/ directory, with ability_catalog.ts reduced to imports/re-exports.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/data/ability_catalog.ts
@spacetimedb/src/data/combat_scaling.ts (imports ABILITIES)
@spacetimedb/src/reducers/combat.ts (imports ENEMY_ABILITIES)
@spacetimedb/src/index.ts (imports ABILITIES, ENEMY_ABILITIES, GLOBAL_COOLDOWN_MICROS)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create per-class ability files and enemy abilities file</name>
  <files>
    spacetimedb/src/data/abilities/shaman_abilities.ts
    spacetimedb/src/data/abilities/warrior_abilities.ts
    spacetimedb/src/data/abilities/enchanter_abilities.ts
    spacetimedb/src/data/abilities/cleric_abilities.ts
    spacetimedb/src/data/abilities/wizard_abilities.ts
    spacetimedb/src/data/abilities/rogue_abilities.ts
    spacetimedb/src/data/abilities/paladin_abilities.ts
    spacetimedb/src/data/abilities/ranger_abilities.ts
    spacetimedb/src/data/abilities/necromancer_abilities.ts
    spacetimedb/src/data/abilities/spellblade_abilities.ts
    spacetimedb/src/data/abilities/bard_abilities.ts
    spacetimedb/src/data/abilities/beastmaster_abilities.ts
    spacetimedb/src/data/abilities/monk_abilities.ts
    spacetimedb/src/data/abilities/druid_abilities.ts
    spacetimedb/src/data/abilities/reaver_abilities.ts
    spacetimedb/src/data/abilities/summoner_abilities.ts
    spacetimedb/src/data/abilities/enemy_abilities.ts
  </files>
  <action>
    Create the `spacetimedb/src/data/abilities/` directory.

    For each of the 16 player classes (shaman, warrior, enchanter, cleric, wizard, rogue, paladin, ranger, necromancer, spellblade, bard, beastmaster, monk, druid, reaver, summoner), create a file `{class}_abilities.ts` that:

    1. Imports `AbilityMetadata` and `DamageType` from `../ability_catalog.js` (relative path back to parent).
    2. Exports a `const {CLASS}_ABILITIES` (e.g., `SHAMAN_ABILITIES`) typed as `Record<string, AbilityMetadata>`.
    3. Contains ONLY the ability entries from the current ABILITIES constant where `className === '{class}'`.
    4. Preserves exact key names, values, and `as DamageType` casts.

    Example pattern for each file:
    ```typescript
    import type { AbilityMetadata, DamageType } from '../ability_catalog.js';

    export const SHAMAN_ABILITIES: Record<string, AbilityMetadata> = {
      shaman_spirit_mender: { ... },
      shaman_spirit_wolf: { ... },
      // ... all shaman abilities exactly as they appear today
    };
    ```

    For enemy abilities, create `enemy_abilities.ts` that:
    1. Imports `DamageType` from `../ability_catalog.js`.
    2. Exports `ENEMY_ABILITIES` with the same type signature it has today (the inferred object type with all enemy ability keys).
    3. Contains ALL entries currently in the ENEMY_ABILITIES constant.

    IMPORTANT: The ability data must be byte-for-byte identical to the current values. Do not reformat, reorder, or change any values. Keep the exact same key ordering within each ability entry.
  </action>
  <verify>
    All 17 files exist in spacetimedb/src/data/abilities/ directory. Each file exports its constant. No TypeScript syntax errors (checked in Task 2 build).
  </verify>
  <done>16 class ability files + 1 enemy ability file created with exact data from ability_catalog.ts</done>
</task>

<task type="auto">
  <name>Task 2: Refactor ability_catalog.ts to import and re-export from class files</name>
  <files>spacetimedb/src/data/ability_catalog.ts</files>
  <action>
    Rewrite ability_catalog.ts to:

    1. Keep at the TOP of the file:
       - `export const GLOBAL_COOLDOWN_MICROS = 1_000_000n;`
       - `export type DamageType = 'physical' | 'magic' | 'none';`
       - `export interface AbilityMetadata { ... }` (full interface, unchanged)

    2. Import all per-class ability constants:
       ```typescript
       import { SHAMAN_ABILITIES } from './abilities/shaman_abilities.js';
       import { WARRIOR_ABILITIES } from './abilities/warrior_abilities.js';
       // ... all 16 classes
       ```

    3. Re-export merged ABILITIES:
       ```typescript
       export const ABILITIES: Record<string, AbilityMetadata> = {
         ...SHAMAN_ABILITIES,
         ...WARRIOR_ABILITIES,
         ...ENCHANTER_ABILITIES,
         ...CLERIC_ABILITIES,
         ...WIZARD_ABILITIES,
         ...ROGUE_ABILITIES,
         ...PALADIN_ABILITIES,
         ...RANGER_ABILITIES,
         ...NECROMANCER_ABILITIES,
         ...SPELLBLADE_ABILITIES,
         ...BARD_ABILITIES,
         ...BEASTMASTER_ABILITIES,
         ...MONK_ABILITIES,
         ...DRUID_ABILITIES,
         ...REAVER_ABILITIES,
         ...SUMMONER_ABILITIES,
       };
       ```

    4. Import and re-export ENEMY_ABILITIES:
       ```typescript
       import { ENEMY_ABILITIES as _ENEMY_ABILITIES } from './abilities/enemy_abilities.js';
       export const ENEMY_ABILITIES = _ENEMY_ABILITIES;
       ```
       Or simply: `export { ENEMY_ABILITIES } from './abilities/enemy_abilities.js';`

    5. Remove ALL inline ability data from the file (the old ABILITIES = { ... } and ENEMY_ABILITIES = { ... } blocks).

    Verify NO existing imports break:
    - `spacetimedb/src/index.ts` imports: `ABILITIES, ENEMY_ABILITIES, GLOBAL_COOLDOWN_MICROS` from `./data/ability_catalog` -- unchanged path
    - `spacetimedb/src/data/combat_scaling.ts` imports: `ABILITIES` from `./ability_catalog.js` -- unchanged path
    - `spacetimedb/src/reducers/combat.ts` imports: `ENEMY_ABILITIES` from `../data/ability_catalog` -- unchanged path

    After rewriting, build the module:
    ```bash
    cd spacetimedb && npm run build
    ```
    Or if no build script, run `npx tsc --noEmit` to type-check.

    Then publish to verify full module works:
    ```bash
    spacetime publish uwr --project-path spacetimedb
    ```
  </action>
  <verify>
    1. `npx tsc --noEmit` (or build) passes with zero errors from spacetimedb directory.
    2. `spacetime publish uwr --project-path spacetimedb` succeeds.
    3. ability_catalog.ts is now ~60-80 lines (types + imports + re-exports) instead of ~1400 lines.
    4. All 3 consumer files (index.ts, combat_scaling.ts, combat.ts) have UNCHANGED import paths.
  </verify>
  <done>ability_catalog.ts reduced to imports/re-exports hub. Module builds and publishes. All consumers unchanged.</done>
</task>

</tasks>

<verification>
- Count ability keys: the merged ABILITIES object must have exactly 80 keys (same as before).
- Count enemy ability keys: ENEMY_ABILITIES must have the same number of keys as before.
- All imports from ability_catalog resolve correctly (no import path changes needed in consumers).
- Module publishes successfully to SpacetimeDB.
</verification>

<success_criteria>
- 16 per-class files + 1 enemy file exist in spacetimedb/src/data/abilities/
- ability_catalog.ts is a thin hub (~60-80 lines) with types, imports, and re-exports
- Zero changes to any consumer file (index.ts, combat_scaling.ts, combat.ts)
- Module builds and publishes without errors
</success_criteria>

<output>
After completion, create `.planning/quick/68-split-ability-catalog-by-class-create-se/68-SUMMARY.md`
</output>
