---
phase: quick-67
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/ability_catalog.ts
  - spacetimedb/src/index.ts
autonomous: true

must_haves:
  truths:
    - "Every player ability in AbilityTemplate has a meaningful description (not just the ability name)"
    - "Descriptions are seeded from the ABILITIES constant during ensureAbilityTemplates"
    - "Client can read description field from ability_template table via subscriptions"
  artifacts:
    - path: "spacetimedb/src/data/ability_catalog.ts"
      provides: "ABILITIES constant with description field on every entry"
      contains: "description:"
    - path: "spacetimedb/src/index.ts"
      provides: "ensureAbilityTemplates seeding descriptions from ABILITIES.description"
      contains: "resolveDescription"
  key_links:
    - from: "spacetimedb/src/data/ability_catalog.ts"
      to: "spacetimedb/src/index.ts"
      via: "ABILITIES import used in ensureAbilityTemplates"
      pattern: "ABILITIES"
---

<objective>
Add meaningful description text to every player ability in the ABILITIES constant and fix the resolveDescription bug in the insert path of ensureAbilityTemplates.

Purpose: Ability descriptions are currently just the ability name (the fallback) because the ABILITIES constant has no description fields. Additionally, the insert path at line 4471 passes wrong arguments to resolveDescription(key, entry) instead of resolveDescription(entry). This task adds real descriptions and fixes the seeding bug.

Output: All ~75 player abilities have meaningful descriptions stored in the database, accessible to clients via ability_template table subscriptions.
</objective>

<execution_context>
@C:/projects/uwr/CLAUDE.md
</execution_context>

<context>
@spacetimedb/src/data/ability_catalog.ts (ABILITIES constant - add description to each entry)
@spacetimedb/src/index.ts (AbilityTemplate table definition at line 524, ensureAbilityTemplates at line 4346)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add description field to AbilityMetadata interface and all ABILITIES entries</name>
  <files>spacetimedb/src/data/ability_catalog.ts</files>
  <action>
1. Add `description: string;` to the `AbilityMetadata` interface (after `name: string;`).

2. Add a `description` field to EVERY entry in the `ABILITIES` constant. Each description should be 1 sentence (10-25 words) describing what the ability does in gameplay terms. Follow these guidelines by ability type:
   - **Damage abilities** (power > 0, damageType != 'none', no special fields): "Deals [physical/magic] damage to a single target." Include flavor if the name suggests it (e.g. Shadow Cut: "Slashes the target with shadow-infused blade, dealing physical damage with a lingering bleed.")
   - **DoT abilities** (has dotPowerSplit/dotDuration): Mention the damage-over-time aspect, e.g. "Inflicts poison damage over time."
   - **HoT abilities** (has hotPowerSplit/hotDuration): Mention healing over time, e.g. "Channels spirit energy to heal an ally over time."
   - **Debuff abilities** (has debuffType): Mention the debuff effect, e.g. "Hexes the target, reducing their armor."
   - **AoE abilities** (has aoeTargets): Mention hitting multiple targets, e.g. "Cleaves all enemies with a sweeping strike."
   - **Utility/buff abilities** (kind would be 'utility', non-combat, or buffs like wards/shields): Describe the utility, e.g. "Summons a spirit wolf companion to fight alongside you." or "Reveals nearby enemy names and levels."
   - **Pet summon abilities** (spirit_wolf, bone_servant, call_beast, earth_familiar): "Summons a [creature] companion to fight alongside you."

Write descriptions that feel like tooltip text a player would read. Keep them concise and informative. Do NOT modify any other fields on the abilities -- only add the `description` field.

Do NOT touch ENEMY_ABILITIES -- they do not need descriptions.
  </action>
  <verify>TypeScript compiles: `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit`. Every ABILITIES entry has a description field (grep count of "description:" in the ABILITIES section should match the number of ability entries).</verify>
  <done>All ~75 player abilities in ABILITIES have meaningful description strings. AbilityMetadata interface includes description field.</done>
</task>

<task type="auto">
  <name>Task 2: Fix resolveDescription bug in insert path and republish</name>
  <files>spacetimedb/src/index.ts</files>
  <action>
1. In `ensureAbilityTemplates` function (around line 4471), fix the insert path call from:
   ```
   description: resolveDescription(key, entry),
   ```
   to:
   ```
   description: resolveDescription(entry),
   ```
   This matches the update path calls at lines 4421 and 4445 which correctly pass only `entry`.

2. Republish the module with `--clear-database` flag since we need to re-seed all ability descriptions:
   ```
   spacetime publish uwr --clear-database -y --project-path C:/projects/uwr/spacetimedb
   ```

3. Regenerate client bindings (even though the column already exists, regenerate to be safe):
   ```
   spacetime generate --lang typescript --out-dir C:/projects/uwr/src/module_bindings --project-path C:/projects/uwr/spacetimedb
   ```

4. Verify the module published successfully by checking logs:
   ```
   spacetime logs uwr
   ```
  </action>
  <verify>Module publishes without errors. `spacetime logs uwr` shows no panics. Client bindings regenerated. The ability_template_type.ts still contains `description: __t.string()`.</verify>
  <done>All ability templates in the database have meaningful descriptions populated from the ABILITIES constant. The resolveDescription bug is fixed for both update and insert paths.</done>
</task>

</tasks>

<verification>
- `spacetime logs uwr` shows no errors during seeding
- Client binding `src/module_bindings/ability_template_type.ts` has `description: __t.string()`
- Every ability in ABILITIES constant has a `description` field (not just name fallback)
- The resolveDescription function is called consistently with `(entry)` in all three call sites
</verification>

<success_criteria>
All player abilities stored in the AbilityTemplate table have meaningful description text (not just the ability name). Descriptions are sourced from the ABILITIES constant, seeded via ensureAbilityTemplates, and accessible to clients via table subscriptions.
</success_criteria>

<output>
After completion, create `.planning/quick/67-restore-ability-descriptions-to-abilityt/67-SUMMARY.md`
</output>
