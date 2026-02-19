---
phase: quick-210
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/commands.ts
autonomous: true
requirements: [QUICK-210]

must_haves:
  truths:
    - "Completing a quest whose XP crosses a level threshold causes the character to level up"
    - "Quest XP log message appears and level-up log message appears in sequence"
    - "No regression: kill quests, delivery quests both still award correct XP"
  artifacts:
    - path: "spacetimedb/src/reducers/commands.ts"
      provides: "hailNpc with level-up-aware XP award for both kill and delivery quest turn-ins"
  key_links:
    - from: "spacetimedb/src/reducers/commands.ts hailNpc"
      to: "spacetimedb/src/helpers/combat.ts awardCombatXp"
      via: "deps.awardCombatXp call replacing raw xp update"
      pattern: "awardCombatXp"
---

<objective>
Fix quest XP not triggering level-up when completing a quest that crosses the XP threshold.

Purpose: Quest completion calls `ctx.db.character.id.update({ ...character, xp: currentXp })` directly, bypassing the level-up check in `awardCombatXp`. Combat uses `awardCombatXp` which correctly runs the while-loop level check and recomputes derived stats. Quest turn-in must do the same.

Output: Modified `hailNpc` function in commands.ts where both kill-quest and delivery-quest XP awards go through `awardCombatXp` (passing `character.level` as `enemyLevel` so the diff=0 modifier applies the full reward XP with no scaling penalty).
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/reducers/commands.ts
@spacetimedb/src/helpers/combat.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace raw XP updates in hailNpc with awardCombatXp calls</name>
  <files>spacetimedb/src/reducers/commands.ts</files>
  <action>
The `hailNpc` function in `registerCommandReducers` has two places that directly update `character.xp` without running the level-up check. Both must be replaced with `deps.awardCombatXp`.

**Step 1 — Add `awardCombatXp` to the deps destructure.**

The destructure at the top of `registerCommandReducers` (lines 7-38) currently includes `xpRequiredForLevel` and `MAX_LEVEL` but NOT `awardCombatXp`. Add it:

```typescript
const {
  spacetimedb,
  t,
  requireAdmin,
  requireCharacterOwnedBy,
  requirePlayerUserId,
  appendPrivateEvent,
  appendNpcDialog,
  appendLocationEvent,
  appendGroupEvent,
  fail,
  computeBaseStats,
  recomputeCharacterDerived,
  xpRequiredForLevel,
  MAX_LEVEL,
  awardCombatXp,   // ADD THIS LINE
  ensureWorldLayout,
  // ... rest unchanged
} = deps;
```

**Step 2 — Fix kill quest turn-in (around line 75-78).**

Current code:
```typescript
// Award XP (show in reward color)
const xpGained = quest.rewardXp;
const currentXp = character.xp + xpGained;
ctx.db.character.id.update({ ...character, xp: currentXp });
appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward', `You gain ${xpGained} XP.`);
```

Replace with:
```typescript
// Award XP — use awardCombatXp so level-up check runs
// Pass character.level as enemyLevel: diff=0 → 100% modifier, no scaling penalty on quest XP
const xpResult = awardCombatXp(ctx, character, character.level, quest.rewardXp);
appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward', `You gain ${xpResult.xpGained} XP.`);
if (xpResult.leveledUp) {
  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
    `You reached level ${xpResult.newLevel}!`);
  appendLocationEvent(ctx, character.locationId, 'system',
    `${character.name} reached level ${xpResult.newLevel}.`);
}
```

**Step 3 — Fix delivery quest turn-in (around line 106-113).**

Current code:
```typescript
// Award XP
const currentXp = character.xp + qt.rewardXp;
ctx.db.character.id.update({ ...character, xp: currentXp });

appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
  `Delivery complete: ${qt.name}. ${npc.name} accepts your delivery.`);
appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
  `You gain ${qt.rewardXp} XP.`);
```

Replace with:
```typescript
// Award XP — use awardCombatXp so level-up check runs
const deliveryXpResult = awardCombatXp(ctx, character, character.level, qt.rewardXp);

appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
  `Delivery complete: ${qt.name}. ${npc.name} accepts your delivery.`);
appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
  `You gain ${deliveryXpResult.xpGained} XP.`);
if (deliveryXpResult.leveledUp) {
  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
    `You reached level ${deliveryXpResult.newLevel}!`);
  appendLocationEvent(ctx, character.locationId, 'system',
    `${character.name} reached level ${deliveryXpResult.newLevel}.`);
}
```

Notes:
- `awardCombatXp` signature: `(ctx, character, enemyLevel, baseXp)` returns `{ xpGained, leveledUp, newLevel? }`
- `appendLocationEvent` is already in the deps destructure (line 15), no change needed there
- `awardCombatXp` is exported from `helpers/combat.ts` and threaded through `index.ts` deps — the same pattern used in `reducers/combat.ts`
  </action>
  <verify>spacetime publish uwr --project-path spacetimedb/spacetimedb && spacetime logs uwr 2>&1 | tail -20</verify>
  <done>Module publishes without TypeScript errors. In-game: a character just below a level threshold who completes a quest with sufficient rewardXp levels up and sees "You reached level N!" in the log.</done>
</task>

</tasks>

<verification>
1. `spacetime publish uwr --project-path spacetimedb/spacetimedb` completes without errors.
2. `spacetime logs uwr` shows no runtime panics.
3. Functional test: use `/level_character` to set a test character to level 1 with 90 XP, complete any quest with rewardXp >= 10, confirm character.level becomes 2 and HP/mana/stats recompute correctly.
</verification>

<success_criteria>
- Module publishes cleanly with no TypeScript errors.
- Quest completion that crosses the XP threshold triggers level-up: character.level increments, base stats and derived stats (HP, mana, etc.) recompute via `recomputeCharacterDerived`.
- XP log message and level-up system message both appear in the log panel.
- Quest XP amounts unchanged: `awardCombatXp(ctx, character, character.level, rewardXp)` with diff=0 applies 100% modifier so the full `rewardXp` is awarded.
</success_criteria>

<output>
After completion, create `.planning/quick/210-when-i-complete-a-quest-and-the-xp-pushe/210-01-SUMMARY.md`
</output>
