---
phase: quick-403
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/helpers/combat.test.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [quick-403]
must_haves:
  truths:
    - "DoT abilities apply a combat_enemy_effect row with effectType 'dot' even at low power levels"
    - "DoT ticks appear in the combat log every 3 seconds while the effect is active"
    - "DoT indicator tag appears on the enemy HUD while the effect is active"
    - "Log message on cast mentions the DoT being applied, not just the initial hit"
  artifacts:
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "Fixed resolveAbility dot handler with minimum 1n per-tick"
    - path: "spacetimedb/src/helpers/combat.test.ts"
      provides: "Tests for DoT effect application at low power"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "tickEffectsForRound logs DoT tick messages for enemy effects"
  key_links:
    - from: "resolveAbility (dot handler)"
      to: "addEnemyEffect"
      via: "dotPerTick guaranteed >= 1n"
      pattern: "addEnemyEffect.*dot.*dotPerTick"
    - from: "tickEffectsForRound"
      to: "combat_enemy_effect rows"
      via: "iterates by_combat, applies damage on tick boundaries"
      pattern: "effect\\.effectType === 'dot'"
---

<objective>
Fix DoT (Damage over Time) abilities so they correctly apply periodic damage ticks and show indicators on enemies.

Purpose: DoT abilities like "Rot Bloom" currently only deal instant damage with no periodic effect because bigint integer division rounds dotPerTick to 0n when total DoT power is less than the duration. The effect is never inserted, so no ticks happen and no indicator appears.

Output: Working DoT effects with periodic damage ticks, combat log messages, and enemy HUD indicators.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/combat.ts (resolveAbility dot handler lines 566-597, addEnemyEffect lines 256-317)
@spacetimedb/src/reducers/combat.ts (tickEffectsForRound lines 2489-2615, combat_loop lines 2712-2812)
@spacetimedb/src/data/combat_scaling.ts (EFFECT_TICK_SECONDS=3n, DOT_LIFE_DRAIN_PERCENT=50n)
@spacetimedb/src/helpers/combat.test.ts (existing resolveAbility tests)

<interfaces>
From spacetimedb/src/helpers/combat.ts:
```typescript
export type AbilityRow = {
  id: bigint; kind: string; targetRule: string; value1: bigint; value2?: bigint;
  damageType?: string; scaling: string; effectType?: string; effectMagnitude?: bigint;
  effectDuration?: bigint; name: string; resourceType: string; resourceCost: bigint;
  cooldownSeconds: bigint; castSeconds: bigint;
};

export type AbilityActor = {
  type: 'character' | 'enemy' | 'pet';
  id: bigint; stats: { str: bigint; dex: bigint; int: bigint; wis: bigint; cha: bigint };
  level: bigint; name: string;
};

export function addEnemyEffect(ctx, combatId, enemyId, effectType, magnitude, roundsRemaining, sourceAbility, ownerCharacterId?)
export function addCharacterEffect(ctx, characterId, effectType, magnitude, roundsRemaining, sourceAbility)
export function resolveAbility(ctx, combatId, actor, ability, targetCharacterId?, targetPetId?)
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fix DoT per-tick floor and improve log messages</name>
  <files>spacetimedb/src/helpers/combat.ts, spacetimedb/src/helpers/combat.test.ts</files>
  <behavior>
    - Test: DoT with low power (power=6, duration=9) still inserts a combat_enemy_effect with magnitude >= 1n
    - Test: DoT with high power (power=100, duration=9) inserts correct per-tick magnitude (50/9 = 5n)
    - Test: HoT with low power (power=4, duration=9) still inserts a character_effect with magnitude >= 1n
  </behavior>
  <action>
**Root cause:** In `resolveAbility` at line 572, `dotPerTick = dotTotal / duration` uses bigint integer division. When `dotTotal < duration` (e.g., power=6 -> dotTotal=3, duration=9), `dotPerTick = 0n`. The `if (dotPerTick > 0n)` guard at lines 580/590 then skips the effect entirely.

**Fix in resolveAbility `kind === 'dot'` block (line 566-597):**

1. After computing `dotPerTick` (line 572), add a floor: `if (dotPerTick < 1n && dotTotal > 0n) dotPerTick = 1n;`
2. Update log message at line 594 to mention the DoT effect:
   - Change from: `Your ${ability.name} hits ${getEnemyName(enemy)} for ${dealt} damage.`
   - Change to: `Your ${ability.name} hits ${getEnemyName(enemy)} for ${dealt} damage and applies a damage-over-time effect.`
3. Also update the group log at line 595 similarly.

**Fix in resolveAbility `kind === 'hot'` block (line 600-622):**

Apply the same floor for `hotPerTick` at line 609: `if (hotPerTick < 1n && hotTotal > 0n) hotPerTick = 1n;`

**Tests:** Add a new `describe('resolveAbility dot handler')` block in combat.test.ts using the existing `makeCombatCtx` pattern (or create a similar factory). Tests:
- `'applies DoT effect even with low power'`: ability with kind='dot', value1=2n (low power), effectDuration=9n. Assert combat_enemy_effect row exists with magnitude >= 1n.
- `'applies correct DoT magnitude with high power'`: ability with kind='dot', value1=50n, effectDuration=9n. Assert combat_enemy_effect row exists with reasonable magnitude.
- `'applies HoT effect even with low power'`: ability with kind='hot', value1=2n, effectDuration=9n. Assert character_effect row exists with effectType='regen' and magnitude >= 1n.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vitest run spacetimedb/src/helpers/combat.test.ts --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>DoT and HoT effects always apply with at least 1n per-tick magnitude. Log messages mention the DoT effect on cast.</done>
</task>

<task type="auto">
  <name>Task 2: Improve tickEffectsForRound DoT tick logging for enemy effects</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In `tickEffectsForRound` (line 2550-2615 of combat.ts reducer), the enemy DoT tick logging at line 2568-2569 uses `appendPrivateEvent` with message: `"${effect.sourceAbility ?? 'A lingering effect'} sears ${enemy.displayName} for ${dmg}."` — this is correct and should produce visible combat log entries.

Verify the tick message includes the enemy's display name correctly. The existing code at lines 2564-2571 iterates all participants and logs to each. This should work if effects are being applied (which Task 1 fixes).

Additionally, confirm the `roundsRemaining` decrement logic at lines 2601-2616 correctly handles the enemy DoT lifecycle:
- DoT damage applies when `roundsRemaining % EFFECT_TICK_SECONDS === 0n` (line 2559)
- Duration decrements by 1 each combat loop tick (1 second, line 2602)
- Effect deleted when `newRounds <= 0n` (line 2603)

No code change needed here unless testing reveals an issue — the primary fix is in Task 1 ensuring effects are actually inserted.

**One improvement:** Add a log message when an enemy DoT effect expires (similar to character effects at line 2534-2542). After line 2603 where `newRounds <= 0n`, before deleting, log to all participants:

```typescript
// Log enemy DoT/debuff expiry
if (effect.effectType === 'dot' || effect.effectType === 'armor_down') {
  for (const p of participants) {
    const pc = ctx.db.character.id.find(p.characterId);
    if (pc) appendPrivateEvent(ctx, pc.id, pc.ownerUserId, 'system',
      `${effect.sourceAbility ?? effect.effectType} on ${enemy.displayName} fades.`);
  }
}
```

Insert this BEFORE `ctx.db.combat_enemy_effect.id.delete(effect.id)` at line ~2615.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vitest run spacetimedb/src/helpers/combat.test.ts --reporter=verbose 2>&1 | tail -10</automated>
  </verify>
  <done>Enemy DoT effect expiry is logged to all combat participants. Combined with Task 1, the full DoT lifecycle (apply -> tick -> expire) produces visible combat log entries.</done>
</task>

</tasks>

<verification>
1. Run all combat tests: `npx vitest run spacetimedb/src/helpers/combat.test.ts`
2. Publish locally: `spacetime publish uwr -p spacetimedb`
3. In-game test: Use a DoT ability on an enemy. Verify:
   - Combat log shows initial hit message mentioning DoT effect
   - Enemy HUD shows DoT indicator tag with countdown
   - Combat log shows periodic tick damage every ~3 seconds
   - Combat log shows effect expiry when DoT wears off
</verification>

<success_criteria>
- DoT abilities apply combat_enemy_effect rows with magnitude >= 1n regardless of power level
- Combat log shows DoT application, periodic tick damage, and expiry messages
- Enemy HUD displays DoT effect indicator while active
- All existing combat tests continue to pass
</success_criteria>

<output>
After completion, create `.planning/quick/403-fix-dot-abilities-apply-periodic-ticks-a/403-SUMMARY.md`
</output>
