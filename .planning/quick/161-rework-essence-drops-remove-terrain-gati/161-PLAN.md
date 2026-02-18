---
phase: quick-161
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/seeding/ensure_enemies.ts
autonomous: true

must_haves:
  truths:
    - "Every enemy can drop an essence regardless of terrain"
    - "Essence drops at ~25% chance per kill per participant"
    - "Enemy level 1-5 drops Essence I, 6-10 drops Essence II, 11+ drops Essence III"
    - "No Essence entries remain in ensureMaterialLootEntries loot tables"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Post-kill essence drop logic inside the per-participant, per-template loot loop"
      contains: "Essence I|Essence II|Essence III"
    - path: "spacetimedb/src/seeding/ensure_enemies.ts"
      provides: "ensureMaterialLootEntries with all Essence entries removed"
  key_links:
    - from: "combat.ts loot loop (per template)"
      to: "ctx.db.itemTemplate.iter() name lookup"
      via: "findItemTemplateByName equivalent inline lookup"
      pattern: "Essence I|Essence II|Essence III"
---

<objective>
Rework Essence I/II/III drops from terrain-gated seeding to runtime combat-resolution drops based on enemy level.

Purpose: Makes essences accessible to all players regardless of zone while giving level-based progression to essence tier acquisition.
Output: Runtime essence drop logic in combat.ts, removal of terrain-gated essence entries from ensure_enemies.ts.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/seeding/ensure_enemies.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add runtime essence drop logic to combat.ts loot loop</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In the per-participant, per-template loot loop (around line 2286, the `for (const template of enemyTemplates)` block), after the existing `generateLootTemplates` call and `combatLoot.insert` loop, add essence drop logic:

1. Look up essence templates by name using `ctx.db.itemTemplate.iter()` iteration (same pattern as `findItemTemplateByName` in helpers/items.ts but inline since we can't import that helper here — or check if it's already imported/available in scope).

   Actually — check whether `findItemTemplateByName` is already imported at the top of combat.ts. If yes, use it directly. If not, do an inline `[...ctx.db.itemTemplate.iter()].find(t => t.name === 'Essence I')` pattern. Do this lookup ONCE outside the participant loop (before the `for (const p of participants)` loop) and store results in variables: `const essenceITemplate`, `const essenceIITemplate`, `const essenceIIITemplate`.

2. Inside the `for (const template of enemyTemplates)` block, after loot is generated, add:

```typescript
// --- Essence drop: 25% chance, tier based on enemy level ---
const essenceSeed = (character.id * 7n ^ ctx.timestamp.microsSinceUnixEpoch + template.id * 31n) % 100n;
if (essenceSeed < 25n) {
  const enemyLevel = template.level ?? 1n;
  const essenceToDrop =
    enemyLevel >= 11n ? essenceIIITemplate :
    enemyLevel >= 6n  ? essenceIITemplate  :
                        essenceITemplate;
  if (essenceToDrop) {
    ctx.db.combatLoot.insert({
      id: 0n,
      combatId: combat.id,
      ownerUserId: character.ownerUserId,
      characterId: character.id,
      itemTemplateId: essenceToDrop.id,
      createdAt: ctx.timestamp,
      qualityTier: undefined,
      affixDataJson: undefined,
      isNamed: undefined,
    });
  }
}
```

Use seed offset `template.id * 31n` to differentiate essence rolls across multiple templates in a group fight (consistent with the 31n offset convention from STATE.md decision #103). The seed must not collide with existing affix seed offsets (31n/37n/41n/43n) — use `character.id * 7n ^ timestamp + template.id * 31n` which differs from those per-item fixed offsets.

Place the essence lookup variables (essenceITemplate etc.) immediately before the `for (const p of participants)` loop so they are computed once per victory, not per participant per template.
  </action>
  <verify>
    Run `spacetime publish uwr --project-path spacetimedb/` and confirm it publishes without error. Then test in game: kill enemies of various levels and confirm essence items appear in loot window.
  </verify>
  <done>
    Module publishes cleanly. Killing any enemy (plains, woods, dungeon) has ~25% chance to produce an essence in the loot window. The essence tier matches enemy level (1-5=I, 6-10=II, 11+=III).
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove all Essence I/II/III entries from ensureMaterialLootEntries</name>
  <files>spacetimedb/src/seeding/ensure_enemies.ts</files>
  <action>
In `ensureMaterialLootEntries` (starting around line 112):

1. Remove the three lookup variables at lines 142-144:
   ```typescript
   const essenceI = findItemTemplateByName(ctx, 'Essence I');
   const essenceII = findItemTemplateByName(ctx, 'Essence II');
   const essenceIII = findItemTemplateByName(ctx, 'Essence III');
   ```

2. Remove every `// Essence drops (tier-gated)` comment block and all `upsertLootEntry` calls for essenceI/essenceII/essenceIII. There are 6 creature-type blocks (animal, beast, undead, spirit, construct, humanoid) each with an essence block — remove all of them entirely. The patterns to find and delete:

   For each creature block, the block looks like:
   ```typescript
   // Essence drops (tier-gated)
   if (!isMidTier && !isHighTier) {
     if (essenceI) upsertLootEntry(...essenceI.id, 15n);
   }
   if (isMidTier) {
     if (essenceI) upsertLootEntry(...essenceI.id, 10n);
     if (essenceII) upsertLootEntry(...essenceII.id, 15n);
   }
   if (isHighTier) {
     if (essenceII) upsertLootEntry(...essenceII.id, 10n);
     if (essenceIII) upsertLootEntry(...essenceIII.id, 15n);
   }
   ```
   Delete these blocks entirely for all 6 creature types.

3. Update the comment block at lines 98-110 to remove the mention of Essence drops being terrain-gated. Change the comment to note that Essence drops are now handled at runtime in combat.ts based on enemy level (no seeding required).

After removing the essence variables and blocks, ensure TypeScript is still valid — the `essenceI/II/III` variables are only used in the essence blocks being removed, so no other references should remain.
  </action>
  <verify>
    Run `spacetime publish uwr --project-path spacetimedb/` after both tasks are complete and confirm successful publish. Optionally: grep ensure_enemies.ts for "Essence" to confirm zero remaining references.
  </verify>
  <done>
    `grep -n "Essence" spacetimedb/src/seeding/ensure_enemies.ts` returns zero results (or only comments). Module publishes cleanly. Old loot table entries for essences are no longer seeded at startup (existing entries remain in DB from prior runs — use --clear-database on republish if needed to flush stale rows).
  </done>
</task>

</tasks>

<verification>
After both tasks:
1. `spacetime publish uwr --project-path spacetimedb/` succeeds (no TypeScript compile errors)
2. Kill a level 1-5 enemy in plains — ~25% of kills should show Essence I in loot window
3. Kill a level 6-10 enemy in any zone — ~25% should show Essence II
4. Kill a level 11+ enemy — ~25% should show Essence III
5. No terrain distinction — plains enemies can drop Essence III if they are level 11+
6. `grep -n "essenceI\|essenceII\|essenceIII" spacetimedb/src/seeding/ensure_enemies.ts` returns no variable declarations or upsertLootEntry calls

If stale LootTableEntry rows for Essence exist from prior seeding runs, republish with `spacetime publish uwr --clear-database -y --project-path spacetimedb/` to flush them.
</verification>

<success_criteria>
- All enemies in all zones can drop essences
- Drop chance is ~25% per enemy per kill
- Essence tier is determined by enemy level (1-5=I, 6-10=II, 11+=III)
- ensureMaterialLootEntries contains zero Essence I/II/III upsert calls
- Module publishes without errors
</success_criteria>

<output>
After completion, create `.planning/quick/161-rework-essence-drops-remove-terrain-gati/161-SUMMARY.md` using the summary template.
</output>
```
