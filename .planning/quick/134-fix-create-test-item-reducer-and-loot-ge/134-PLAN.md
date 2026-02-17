---
phase: quick-134
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/combat_constants.ts
  - spacetimedb/src/seeding/ensure_enemies.ts
  - spacetimedb/src/reducers/commands.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true

must_haves:
  truths:
    - "/createitem common produces a world-drop item (not Training Sword, Apprentice Robe, etc.)"
    - "Combat loot gear drops are world-drop items, never starter gear"
  artifacts:
    - path: "spacetimedb/src/data/combat_constants.ts"
      provides: "Shared STARTER_ITEM_NAMES export"
      contains: "export const STARTER_ITEM_NAMES"
    - path: "spacetimedb/src/reducers/commands.ts"
      provides: "Starter-item-filtered create_test_item"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Starter-item-filtered generateLootTemplates gearEntries"
  key_links:
    - from: "spacetimedb/src/seeding/ensure_enemies.ts"
      to: "spacetimedb/src/data/combat_constants.ts"
      via: "import { STARTER_ITEM_NAMES }"
    - from: "spacetimedb/src/reducers/commands.ts"
      to: "spacetimedb/src/data/combat_constants.ts"
      via: "import { STARTER_ITEM_NAMES }"
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "spacetimedb/src/data/combat_constants.ts"
      via: "import { STARTER_ITEM_NAMES }"
---

<objective>
Fix /createitem and combat loot to never pick starter gear items (Training Sword, Apprentice Robe, etc.) as drop candidates.

Purpose: Starter items exist only as starting equipment for new characters. The runtime reducers that pick items at drop time were not filtering them out, so players could receive worthless starter gear from /createitem and combat kills.

Output: STARTER_ITEM_NAMES exported from combat_constants.ts; create_test_item and generateLootTemplates both filter it at runtime; module published.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Move STARTER_ITEM_NAMES to shared combat_constants.ts</name>
  <files>
    spacetimedb/src/data/combat_constants.ts
    spacetimedb/src/seeding/ensure_enemies.ts
  </files>
  <action>
    In spacetimedb/src/data/combat_constants.ts, append the STARTER_ITEM_NAMES export after the existing constants:

    ```typescript
    export const STARTER_ITEM_NAMES = new Set([
      // Starter weapons
      'Training Sword', 'Training Mace', 'Training Staff', 'Training Bow',
      'Training Dagger', 'Training Axe', 'Training Blade', 'Training Rapier',
      // Starter cloth armor
      'Apprentice Robe', 'Apprentice Trousers', 'Apprentice Boots',
      // Starter leather armor
      'Scout Jerkin', 'Scout Pants', 'Scout Boots',
      // Starter chain armor
      'Warden Hauberk', 'Warden Greaves', 'Warden Boots',
      // Starter plate armor
      'Vanguard Cuirass', 'Vanguard Greaves', 'Vanguard Boots',
      // Starter accessories
      'Rough Band', 'Worn Cloak', 'Traveler Necklace', 'Glimmer Ring', 'Shaded Cloak',
    ]);
    ```

    In spacetimedb/src/seeding/ensure_enemies.ts:
    - Remove the local `const STARTER_ITEM_NAMES = new Set([...])` block (lines 6-20)
    - Add import at the top: `import { STARTER_ITEM_NAMES } from '../data/combat_constants';`
  </action>
  <verify>TypeScript compiles without errors: run `spacetime publish uwr-game --project-path spacetimedb/src` mentally traced — no missing exports. Confirm ensure_enemies.ts no longer defines STARTER_ITEM_NAMES locally.</verify>
  <done>STARTER_ITEM_NAMES is exported from combat_constants.ts and ensure_enemies.ts imports it from there.</done>
</task>

<task type="auto">
  <name>Task 2: Filter starter items in create_test_item and generateLootTemplates, then publish</name>
  <files>
    spacetimedb/src/reducers/commands.ts
    spacetimedb/src/reducers/combat.ts
  </files>
  <action>
    In spacetimedb/src/reducers/commands.ts:
    - Add import at the top of the file: `import { STARTER_ITEM_NAMES } from '../data/combat_constants';`
    - In the `create_test_item` reducer, both template search loops need `!STARTER_ITEM_NAMES.has(tmpl.name)`:

      Primary slot loop (around line 373):
      ```typescript
      for (const tmpl of ctx.db.itemTemplate.iter()) {
        if (tmpl.slot === slot && !tmpl.isJunk && !STARTER_ITEM_NAMES.has(tmpl.name)) {
          template = tmpl;
          break;
        }
      }
      ```

      Fallback loop (around line 380):
      ```typescript
      for (const tmpl of ctx.db.itemTemplate.iter()) {
        if (['chest', 'legs', 'boots', 'mainHand', 'head', 'hands', 'wrists', 'belt'].includes(tmpl.slot) && !tmpl.isJunk && !STARTER_ITEM_NAMES.has(tmpl.name)) {
          template = tmpl;
          break;
        }
      }
      ```

    In spacetimedb/src/reducers/combat.ts:
    - Add `STARTER_ITEM_NAMES` to the existing import from `'../data/combat_constants'`. Currently line 1 imports from `'../data/ability_catalog'` and other imports. Find the import that already pulls from `combat_constants` — it may or may not exist. Check existing imports (lines 1-8) for `'../data/combat_constants'`. If present, add STARTER_ITEM_NAMES to it. If absent, add a new import line: `import { STARTER_ITEM_NAMES } from '../data/combat_constants';`
    - In `generateLootTemplates` (around line 596-599), update the `gearEntries` filter to also exclude starter items:
      ```typescript
      const gearEntries = entries.filter((entry) => {
        const template = ctx.db.itemTemplate.id.find(entry.itemTemplateId);
        return template && !template.isJunk && !STARTER_ITEM_NAMES.has(template.name) && template.requiredLevel <= (enemyTemplate.level ?? 1n) + 1n;
      });
      ```

    After editing both files, publish the module:
    ```bash
    spacetime publish uwr-game --project-path C:/projects/uwr/spacetimedb/src
    ```

    Wait for successful publish confirmation. If publish fails due to schema changes requiring clear, use:
    ```bash
    spacetime publish uwr-game --clear-database -y --project-path C:/projects/uwr/spacetimedb/src
    ```
    (Only use --clear-database if the normal publish fails with a migration error.)
  </action>
  <verify>
    1. Module publishes successfully (no TypeScript errors in output)
    2. Check spacetime logs uwr-game for any runtime errors
    3. In-game: /createitem common should produce a world-drop item name, not Training Sword or Apprentice Robe
  </verify>
  <done>
    - create_test_item never returns a starter item name
    - generateLootTemplates gearEntries excludes starter items
    - Module is live on server
  </done>
</task>

</tasks>

<verification>
After publish:
- `spacetime logs uwr-game` shows no panic or error
- Calling /createitem common in-game produces a non-starter item (e.g. "Iron Shortsword", not "Training Sword")
- Kill a low-level enemy multiple times; no starter gear appears in loot window
</verification>

<success_criteria>
- STARTER_ITEM_NAMES is a single source of truth in combat_constants.ts
- ensure_enemies.ts, commands.ts, and combat.ts all import from that shared location
- Runtime item selection in both create_test_item and generateLootTemplates excludes all starter items
- Module published and running
</success_criteria>

<output>
After completion, create `.planning/quick/134-fix-create-test-item-reducer-and-loot-ge/134-SUMMARY.md`
</output>
