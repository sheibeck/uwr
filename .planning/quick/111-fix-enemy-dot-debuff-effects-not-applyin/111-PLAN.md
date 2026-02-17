---
phase: quick-111
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat.ts
autonomous: true

must_haves:
  truths:
    - "Enemy DoT and debuff abilities apply CharacterEffect rows during combat"
    - "executeEnemyAbility resolves ability definitions correctly (no undefined lookup)"
    - "Backend module published with the fix in place"
  artifacts:
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "ENEMY_ABILITIES imported from ability_catalog, not empty stub"
      contains: "import { ENEMY_ABILITIES } from '../data/ability_catalog'"
  key_links:
    - from: "spacetimedb/src/helpers/combat.ts"
      to: "spacetimedb/src/data/ability_catalog.ts"
      via: "named import ENEMY_ABILITIES"
      pattern: "import.*ENEMY_ABILITIES.*ability_catalog"
---

<objective>
Fix applied: enemy DoT/debuff effects were never executing because ENEMY_ABILITIES was an empty stub object in helpers/combat.ts, causing all ability lookups to return undefined and executeEnemyAbility to return early without inserting any CharacterEffect rows.

Purpose: Enemies with DoT and debuff abilities (poison, venom, hex, curse, etc.) now correctly apply their effects to players.
Output: Published backend module where enemy abilities resolve from the real catalog and CharacterEffect rows are inserted during combat.
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
  <name>Task 1: Verify fix and republish backend module</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
The fix has already been applied. Confirm line 36 of spacetimedb/src/helpers/combat.ts reads:
  import { ENEMY_ABILITIES } from '../data/ability_catalog';
and that the old stub `const ENEMY_ABILITIES: any = {};` is gone.

Then republish the backend module to maincloud so the fix is live:
  spacetime publish uwr --project-path spacetimedb

No bindings regeneration needed — no schema changes were made, only an import fix.
  </action>
  <verify>
1. `grep -n "ENEMY_ABILITIES" spacetimedb/src/helpers/combat.ts` shows only the import line, no stub const.
2. `spacetime publish uwr --project-path spacetimedb` exits with success.
3. `spacetime logs uwr` shows no build errors after publish.
  </verify>
  <done>Module published successfully. Enemy abilities (DoT/debuff) now resolve from the real ENEMY_ABILITIES catalog and insert CharacterEffect rows during combat rounds.</done>
</task>

</tasks>

<verification>
After republishing:
- Enter combat with an enemy known to have DoT/debuff abilities (e.g. a spider with Venom Bite, or a shaman enemy with Hex).
- Observe that debuff/DoT icons appear on affected characters in the group panel.
- Confirm CharacterEffect rows tick and expire correctly.
</verification>

<success_criteria>
- Import fix present in helpers/combat.ts (no stub).
- Module published to maincloud without errors.
- Enemy DoT/debuff abilities visibly apply effects in game.
</success_criteria>

<output>
After completion, create `.planning/quick/111-fix-enemy-dot-debuff-effects-not-applyin/111-SUMMARY.md`
</output>
