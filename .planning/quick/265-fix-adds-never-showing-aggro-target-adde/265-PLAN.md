---
phase: quick-265
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements:
  - QUICK-265
must_haves:
  truths:
    - "Add enemies have valid AggroEntry rows with the correct character IDs after joining combat"
    - "Add enemies select an attack target on their first combat tick"
    - "Add enemies display an aggro target in the UI immediately upon arrival"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Fixed addEnemyToCombat using correct charId and immediate aggro target for adds"
  key_links:
    - from: "addEnemyToCombat (line ~117-130)"
      to: "AggroEntry.characterId"
      via: "charId = (p as any).characterId ?? p.id"
      pattern: "characterId.*charId"
    - from: "pending-add processing (line ~2145-2155)"
      to: "combatEnemy.aggroTargetCharacterId"
      via: "update after addEnemyToCombat returns"
      pattern: "aggroTargetCharacterId.*activeParticipants"
---

<objective>
Fix add enemies never attacking or showing an aggro target in the UI.

Purpose: `addEnemyToCombat` is called from two places — once with Character rows (p.id = character ID) and once with CombatParticipant rows (p.id = participant row ID, p.characterId = character ID). The second call site passes wrong IDs into AggroEntry, so the attack loop's activeIds check never matches and topAggro is always null for adds.

Output: Corrected `addEnemyToCombat` that handles both row shapes, plus an immediate aggro target set for adds so the UI shows "Targeting" before the first attack tick.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix addEnemyToCombat to resolve correct characterId for both row shapes</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In `addEnemyToCombat` (lines ~117-130), the loop `for (const p of participants)` uses `p.id` as `characterId` for AggroEntry rows and as the key for `ctx.db.character.id.find(p.id)`. This is correct when `participants` are Character rows, but wrong when they are CombatParticipant rows (which have `p.id` = participant row ID and `p.characterId` = character ID).

Fix: derive `charId` before the AggroEntry insert, using the presence of `characterId` to detect the row shape:

```typescript
for (const p of participants) {
  const charId = (p as any).characterId ?? p.id;
  ctx.db.aggroEntry.insert({
    id: 0n,
    combatId: combat.id,
    enemyId: combatEnemy.id,
    characterId: charId,     // was: p.id
    petId: undefined,
    value: 0n,
  });
  const current = ctx.db.character.id.find(charId);  // was: p.id
  if (current && !current.combatTargetEnemyId) {
    ctx.db.character.id.update({ ...current, combatTargetEnemyId: combatEnemy.id });
  }
}
```

The `startCombatForSpawn` call site at line ~167 passes Character rows where `characterId` is undefined, so `(p as any).characterId ?? p.id` falls back to `p.id` (character ID) — unchanged behavior. The pending-add call site at line ~2146 passes CombatParticipant rows where `characterId` holds the real character ID — now resolved correctly.
  </action>
  <verify>TypeScript compiles without errors: `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit`</verify>
  <done>No TypeScript errors. AggroEntry rows created during pending-add processing will have characterId values matching those in activeParticipants.map(p =&gt; p.characterId).</done>
</task>

<task type="auto">
  <name>Task 2: Set immediate aggroTargetCharacterId for adds so UI shows target on arrival</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In the pending-add processing loop (lines ~2142-2168), `addEnemyToCombat` is called but its return value is discarded. The new enemy's `aggroTargetCharacterId` starts as `undefined`, so the UI shows no "Targeting" row until the enemy's first attack tick resolves topAggro.

Fix: capture the return value and immediately update `aggroTargetCharacterId` to the first active participant's character ID:

```typescript
const newEnemy = addEnemyToCombat(
  deps,
  ctx,
  combat,
  spawnRow,
  participants,
  false,
  pending.enemyRoleTemplateId ?? undefined
);
// Set initial aggro target so UI shows "Targeting" immediately on arrival
if (newEnemy && activeParticipants.length > 0) {
  ctx.db.combatEnemy.id.update({
    ...newEnemy,
    aggroTargetCharacterId: activeParticipants[0].characterId,
  });
}
```

`activeParticipants` is already in scope at this point in the function. This mirrors how the attack phase sets `aggroTargetCharacterId` after finding topAggro — we just do it eagerly for the arrival moment.
  </action>
  <verify>TypeScript compiles without errors: `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit`</verify>
  <done>No TypeScript errors. Add enemies will have aggroTargetCharacterId set the moment they arrive, not only after their first attack tick fires.</done>
</task>

</tasks>

<verification>
After both tasks:
1. `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit` — zero errors
2. Publish locally: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb`
3. In-game: trigger a combat that spawns adds (social pulls or scripted adds). Observe the add enemy in the combat UI — it should show a "Targeting" row immediately upon arrival and should start attacking on its next tick.
</verification>

<success_criteria>
- Add enemies have AggroEntry rows with correct character IDs (matching active participant character IDs)
- Add enemies attack normally after arrival (topAggro resolves correctly in the attack loop)
- Add enemies display a "Targeting" label in the UI immediately when they join combat
- No TypeScript compilation errors
</success_criteria>

<output>
After completion, create `.planning/quick/265-fix-adds-never-showing-aggro-target-adde/265-SUMMARY.md`
</output>
