---
phase: quick-349
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/helpers/combat_narration.ts
autonomous: true
requirements: [RT-COMBAT-BUGS]
must_haves:
  truths:
    - "use_ability_realtime reducer exists on the published server module and client can call it without 'no such reducer' error"
    - "Combat loop ticks every ~1 second and auto-attack/ability damage events appear in the narrative panel as private_event rows"
    - "LLM intro narration fires when combat starts and displays before combat loop begins ticking"
    - "If LLM intro fails or times out (~12 seconds), combat loop starts anyway"
    - "Post-combat LLM summary still fires on victory/defeat"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "startCombatForSpawn triggers intro narration and delays combat_loop"
    - path: "spacetimedb/src/helpers/combat_narration.ts"
      provides: "handleCombatNarrationResult starts combat_loop on intro completion"
  key_links:
    - from: "startCombatForSpawn"
      to: "triggerCombatNarration"
      via: "intro narration LlmTask creation"
    - from: "handleCombatNarrationResult"
      to: "scheduleCombatTick"
      via: "schedules first combat tick when intro narration completes"
---

<objective>
Fix real-time combat bugs (no such reducer, missing events, 30s delay) and add LLM intro narration at combat start with delayed combat_loop.

Purpose: The quick-348 changes were never published to the local SpacetimeDB server, so the client bindings reference reducers that don't exist on the running module. Additionally, combat should open with an atmospheric LLM intro narrative before the loop starts ticking.

Output: Working real-time combat with intro narration, immediate event display, and post-combat summary.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/helpers/combat_narration.ts
@spacetimedb/src/helpers/combat.ts (scheduleCombatTick)
@spacetimedb/src/data/combat_constants.ts
@spacetimedb/src/index.ts (handleCombatNarrationResult wiring)
@src/composables/useCombat.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add intro narration at combat start and delay combat_loop until it completes</name>
  <files>spacetimedb/src/reducers/combat.ts, spacetimedb/src/helpers/combat_narration.ts, spacetimedb/src/data/combat_constants.ts</files>
  <action>
**In `spacetimedb/src/data/combat_constants.ts`:**
- Add: `export const COMBAT_INTRO_TIMEOUT_MICROS = 12_000_000n;` (12 second fallback if LLM intro never completes)

**In `spacetimedb/src/reducers/combat.ts` — `startCombatForSpawn` function (line ~159-236):**

1. After inserting participants and pets (after the pet loop, before `scheduleCombatTick`), trigger an intro narration LLM task:

```typescript
// Trigger LLM intro narration
const location = ctx.db.location.id.find(leader.locationId);
const enemyNames = [...ctx.db.combat_enemy.by_combat.filter(combat.id)]
  .map((e: any) => e.displayName);
const playerNames = participants.map((p: any) => p.name);
const hpSummary: RoundEventSummary['participantHpSummary'] = [];
for (const p of participants) {
  hpSummary.push({ name: p.name, hp: p.hp, maxHp: p.maxHp, isEnemy: false });
}
for (const e of ctx.db.combat_enemy.by_combat.filter(combat.id)) {
  hpSummary.push({ name: e.displayName, hp: e.currentHp, maxHp: e.maxHp, isEnemy: true });
}
const introEvents: RoundEventSummary = {
  combatId: combat.id,
  roundNumber: 0n,
  narrativeType: 'intro',
  playerActions: [],
  enemyActions: [],
  effectsApplied: [],
  effectsExpired: [],
  deaths: [],
  nearDeathNames: [],
  hasCrit: false,
  hasKill: false,
  hasNearDeath: false,
  participantHpSummary: hpSummary,
  locationName: location?.name || 'an unknown place',
  enemyNames,
  playerNames,
};
triggerCombatNarration(ctx, combat, { narrationCount: 0n, roundNumber: 0n }, introEvents);
```

2. Replace the current `scheduleCombatTick(ctx, combat.id)` call at line ~233 with a DELAYED fallback tick using `COMBAT_INTRO_TIMEOUT_MICROS`:

```typescript
// Schedule fallback combat tick in case LLM intro never completes
// (handleCombatNarrationResult will schedule an immediate tick on intro success)
import { COMBAT_INTRO_TIMEOUT_MICROS } from '../data/combat_constants';
// ... already have ScheduleAt from deps
const fallbackAt = ctx.timestamp.microsSinceUnixEpoch + COMBAT_INTRO_TIMEOUT_MICROS;
ctx.db.combat_loop_tick.insert({
  scheduledId: 0n,
  scheduledAt: ScheduleAt.time(fallbackAt),
  combatId: combat.id,
});
```

Note: Import `COMBAT_INTRO_TIMEOUT_MICROS` at the top of the file alongside other combat_constants imports. Also import `RoundEventSummary` from `../helpers/combat_narration` (already imported as a type on line 17). The `ScheduleAt` is available from `deps` (line 243 of registerCombatReducers), but `startCombatForSpawn` is outside that scope -- import `ScheduleAt` from `spacetimedb` at the top of the file.

**In `spacetimedb/src/helpers/combat_narration.ts` — `handleCombatNarrationResult` function:**

After the intro narration is successfully processed and private events are appended (after line ~273 where the "System settles in" message is sent), schedule the first combat tick:

```typescript
if (narrativeType === 'intro') {
  // ... existing "System settles in" messages ...

  // Start combat loop now that intro narration is displayed
  scheduleCombatTick(ctx, combatId);
}
```

Import `scheduleCombatTick` from `./combat` at the top of `combat_narration.ts`.

Also handle the FAILURE case: in the `if (!success)` block at line ~218, for intro narratives, still schedule the combat tick so combat starts even if LLM fails:

```typescript
if (!success) {
  // For intro narration failure, start combat anyway
  if (context.narrativeType === 'intro') {
    const combatIdFallback = BigInt(context.combatId || '0');
    if (combatIdFallback > 0n) {
      scheduleCombatTick(ctx, combatIdFallback);
    }
  }
  return;
}
```

This means combat starts either when: (a) LLM intro succeeds and result is processed, (b) LLM intro fails and the error handler triggers, or (c) the 12-second fallback tick fires if neither (a) nor (b) happened.
  </action>
  <verify>
    <automated>cd spacetimedb && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
    - startCombatForSpawn triggers intro LLM narration and schedules a 12-second fallback combat tick (not immediate)
    - handleCombatNarrationResult schedules immediate combat tick on intro success
    - handleCombatNarrationResult schedules immediate combat tick on intro failure (combat starts regardless)
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Republish server module and regenerate client bindings</name>
  <files>src/module_bindings/</files>
  <action>
1. Publish the server module to local SpacetimeDB (do NOT use --clear-database unless publish fails due to schema changes):

```bash
spacetime publish uwr -p spacetimedb
```

If publish fails with schema errors, try with `--clear-database -y`:
```bash
spacetime publish uwr -p spacetimedb --clear-database -y
```

2. Regenerate client bindings:

```bash
spacetime generate --lang typescript --out-dir src/module_bindings -p spacetimedb
```

3. Verify the `use_ability_realtime` reducer binding exists in the regenerated bindings:

```bash
ls src/module_bindings/use_ability_realtime_reducer.ts
grep "useAbilityRealtime" src/module_bindings/index.ts
```

4. Verify the client still compiles:

```bash
npx vue-tsc --noEmit 2>&1 | head -30
```

Note: Do NOT publish to maincloud. Local only per project rules.
  </action>
  <verify>
    <automated>ls src/module_bindings/use_ability_realtime_reducer.ts && grep "useAbilityRealtime" src/module_bindings/index.ts</automated>
  </verify>
  <done>
    - Server module published to local SpacetimeDB with all quick-348 and quick-349 changes
    - Client bindings regenerated and include use_ability_realtime_reducer
    - "no such reducer" error resolved
    - Client compiles with regenerated bindings
  </done>
</task>

</tasks>

<verification>
1. Start the game, enter combat with an enemy
2. Verify an LLM intro narration appears in the narrative panel before combat damage starts
3. Verify auto-attack damage events appear every ~weapon-speed seconds in the narrative
4. Verify using an ability from the combat action bar works (no "no such reducer" error)
5. Verify victory/defeat shows a post-combat LLM summary
6. Verify that if LLM proxy is unavailable, combat starts within 12 seconds anyway
</verification>

<success_criteria>
- No "no such reducer" errors when using abilities in combat
- Combat events (damage, healing, deaths) appear in real-time in the narrative panel
- LLM intro narration displays before combat loop starts ticking
- Combat starts within 12 seconds even if LLM intro fails
- Post-combat LLM summary still works on victory/defeat
</success_criteria>

<output>
After completion, create `.planning/quick/349-fix-real-time-combat-bugs-no-such-reduce/349-SUMMARY.md`
</output>
