---
phase: quick-244
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/seeding/ensure_enemies.ts
autonomous: true
requirements: [244]

must_haves:
  truths:
    - "Pull adds only come from the same enemy template (e.g. Bandit + Bandit, never Bandit + Hexbinder)"
    - "Beasts and non-pack animals do not trigger pull adds even if same template"
    - "Wolves, humanoids, undead, and constructs with shared consciousness do trigger adds"
    - "factionId is no longer used for pull candidate filtering"
  artifacts:
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "EnemyTemplate table with isSocial field"
      contains: "isSocial: t.bool().optional()"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Pull candidate filter using isSocial + same enemyTemplateId"
    - path: "spacetimedb/src/seeding/ensure_enemies.ts"
      provides: "All enemy templates seeded with isSocial values"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "spacetimedb/src/schema/tables.ts"
      via: "EnemyTemplate.isSocial field check in candidates filter"
      pattern: "isSocial"
---

<objective>
Replace faction-based pull candidate filtering with a per-template `isSocial` flag. Adds only come from the same enemy template AND require `isSocial: true`. This gives finer control over which enemy types call for help.

Purpose: Faction-based pulls created cross-template adds (e.g. Bandits pulling in Hexbinders) which was undesirable gameplay. isSocial makes pack/social behavior opt-in per template.
Output: Schema change, pull logic rewrite, all 30+ templates seeded with correct isSocial values, local publish.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/projects/uwr/spacetimedb/src/schema/tables.ts
@C:/projects/uwr/spacetimedb/src/reducers/combat.ts
@C:/projects/uwr/spacetimedb/src/seeding/ensure_enemies.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add isSocial to EnemyTemplate schema</name>
  <files>spacetimedb/src/schema/tables.ts</files>
  <action>
In the `EnemyTemplate` table definition (around line 696-720), add `isSocial: t.bool().optional()` after `isBoss: t.bool().optional()`:

```typescript
    factionId: t.u64().optional(),
    isBoss: t.bool().optional(),
    isSocial: t.bool().optional(),
```

No other changes to this file.
  </action>
  <verify>TypeScript compiles without errors (will be verified as part of Task 3 publish).</verify>
  <done>`isSocial: t.bool().optional()` exists in EnemyTemplate column definition.</done>
</task>

<task type="auto">
  <name>Task 2: Replace faction-based pull candidates with isSocial + same-template filter</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
Find the `candidates` block around lines 956-969 in `resolve_pull`:

```typescript
const candidates = PULL_ALLOW_EXTERNAL_ADDS
  ? [...ctx.db.enemySpawn.by_location.filter(pull.locationId)]
      .filter((row) => row.id !== spawn.id && row.state === 'available')
      .map((row) => ({
        spawn: row,
        template: ctx.db.enemyTemplate.id.find(row.enemyTemplateId),
      }))
      .filter(
        (row) =>
          row.template &&
          row.template.factionId !== undefined &&
          template.factionId !== undefined &&
          row.template.factionId === template.factionId
      )
  : [];
```

Replace it with:

```typescript
const candidates = PULL_ALLOW_EXTERNAL_ADDS
  ? [...ctx.db.enemySpawn.by_location.filter(pull.locationId)]
      .filter((row) => row.id !== spawn.id && row.state === 'available')
      .map((row) => ({
        spawn: row,
        template: ctx.db.enemyTemplate.id.find(row.enemyTemplateId),
      }))
      .filter(
        (row) =>
          row.template &&
          row.template.isSocial === true &&
          row.template.id === template.id
      )
  : [];
```

Also update the nearby flavor message at line ~1047 to say "of the same type" instead of "of the same faction":

```typescript
if (PULL_ALLOW_EXTERNAL_ADDS && overlapPressure > 0) {
  reasons.push(`Other ${template.name}s are nearby and may answer the call.`);
}
```

And update the partial/failure log messages at lines ~1102 and ~1123 that say "of the same faction" — replace "of the same faction" with nothing (just remove that phrase, since it's now same-template by definition):
- Line ~1102: `${reserved.length} ${reserved.length === 1 ? 'add' : 'adds'} of the same faction will arrive` → `${reserved.length} ${reserved.length === 1 ? 'add' : 'adds'} will arrive`
- Line ~1123: `${reserved.length} ${reserved.length === 1 ? 'add' : 'adds'} of the same faction rush in` → `${reserved.length} ${reserved.length === 1 ? 'add' : 'adds'} rush in`
  </action>
  <verify>Grep for `factionId` in combat.ts to confirm no faction-based pull filtering remains. Grep for `isSocial` to confirm new logic is present.</verify>
  <done>Pull candidates filtered by `isSocial === true` and `template.id === template.id` (same template). No faction comparison in pull logic.</done>
</task>

<task type="auto">
  <name>Task 3: Seed isSocial on all enemy templates and publish</name>
  <files>spacetimedb/src/seeding/ensure_enemies.ts</files>
  <action>
In `ensureEnemyTemplatesAndRoles`, add `isSocial` to every `addEnemyTemplate` call. Apply the following values based on creature type and ecology:

**isSocial: true** (pack hunters, social groups, shared-consciousness constructs, humanoids, undead):
- `bogRat` — NO (solitary scavenger animal)
- `bandit` — YES (humanoid gang)
- `hexbinder` — YES (humanoid cult)
- `graveAcolyte` — YES (undead cult)
- `graveSkirmisher` — YES (undead)
- `graveServant` — YES (undead)
- `alleyShade` — YES (undead)
- `frostboneAcolyte` — YES (undead)
- `cinderWraith` — YES (undead)
- `ashveilPhantom` — YES (undead)
- `ashforgedRevenant` — YES (undead)
- `ridgeSkirmisher` — YES (humanoid)
- `sootboundMystic` — YES (humanoid)
- `emberPriest` — YES (humanoid)
- `fenWitch` — YES (humanoid)
- `cinderSentinel` — YES (construct, Iron Compact shared consciousness)
- `basaltBrute` — YES (construct, Iron Compact)
- `sootboundSentry` — YES (construct, Iron Compact)
- `vaultSentinel` — YES (construct, Iron Compact)
- `thicketWolf` — YES (pack hunter)
- `ashJackal` — YES (pack canid)
- `nightRat` — YES (social scavenger, packs)

**isSocial: false** (solitary/non-social beasts, spirits, solo animals):
- `bogRat` — false (animal, solitary)
- `emberWisp` — false (spirit, ephemeral)
- `blightStalker` — false (beast, ambush predator)
- `marshCroaker` — false (animal, amphibian)
- `dustHare` — false (animal, prey)
- `thornSprite` — false (spirit)
- `gloomStag` — false (beast, solitary)
- `mireLeech` — false (beast, parasite)
- `emberhawk` — false (beast, bird of prey)
- `ashenRam` — false (beast, territorial)
- `shadowProwler` — false (beast, ambush)
- `nightfangViper` — false (beast, snake)
- `gloomwingBat` — false (beast, bat)
- `bogSpecter` — false (spirit)
- `emberling` — false (spirit)
- `duskMoth` — false (spirit)

For each template, add `isSocial: true` or `isSocial: false` to the object passed to `addEnemyTemplate`. Example:

```typescript
const bandit = addEnemyTemplate({
  name: 'Bandit',
  // ... existing fields ...
  factionId: fFreeBlades,
  isSocial: true,
});
```

After editing, publish to local:
```
spacetime publish uwr --project-path C:/projects/uwr/spacetimedb
```
  </action>
  <verify>
1. `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` succeeds with no errors.
2. Grep `ensure_enemies.ts` for `isSocial` — every template block should have exactly one `isSocial:` entry.
  </verify>
  <done>All 22+ templates have explicit `isSocial` values. Module publishes successfully to local.</done>
</task>

</tasks>

<verification>
After all tasks complete:
1. `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` exits 0 (no TypeScript errors, no schema errors).
2. `grep -n "factionId" spacetimedb/src/reducers/combat.ts` shows NO lines inside the candidates filter block.
3. `grep -c "isSocial" spacetimedb/src/seeding/ensure_enemies.ts` returns 22 or more (one per template).
</verification>

<success_criteria>
- EnemyTemplate has `isSocial: t.bool().optional()` column
- Pull candidates check `isSocial === true` AND `template.id === template.id` (same template)
- Faction comparison is fully removed from pull candidate logic
- Every enemy template in ensure_enemies.ts has an explicit `isSocial` value
- Module publishes locally without errors
</success_criteria>

<output>
After completion, create `.planning/quick/244-replace-faction-based-pull-with-issocial/244-SUMMARY.md`
</output>
