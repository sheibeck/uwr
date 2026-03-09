# Phase 33: Combat Improvements - Research

**Researched:** 2026-03-09
**Domain:** Combat system (server-side combat loop, effect ticking, balance tuning, pull system, client-side combat HUD)
**Confidence:** HIGH

## Summary

Phase 33 covers four distinct workstreams: (1) enriching combat log messages for DoT/HoT ticks and buff/debuff lifecycle events, (2) adding effect indicators to the enemy HUD, (3) rebalancing combat via scaling formula changes, and (4) verifying and fixing the multi-enemy pull system including removing puller role restrictions.

The codebase is well-structured for these changes. Combat log enrichment requires modifications to `tickEffectsForRound()` in `reducers/combat.ts` and `addCharacterEffect()`/`addEnemyEffect()` in `helpers/combat.ts`. The enemy HUD already receives effects data from `useCombat.ts` but `EnemyHud.vue` does not render them. Balance tuning targets `combat_scaling.ts` constants. The pull system needs the `requirePullerOrLog` guard removed and the "Already in combat" block in `start_pull` changed to add enemies to the existing combat instead.

**Primary recommendation:** Work server-side combat log and balance changes first (independent of UI), then update the enemy HUD, then tackle multi-enemy pull fixes last (most complex, highest risk of regression).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Every DoT/HoT tick gets its own log entry (not summarized per round) -- real-time feedback
- Color-coded by effect type: DoT damage in red, HoT healing in green, buffs in blue, debuffs in orange
- Narrative phrasing style: "You suffer 12 damage from Poison Sting" / "Regeneration soothes you for 8 HP" -- immersive, fits keeper tone
- Buff/debuff application and expiration messages include the source ability name: "Shield Wall grants +5 Defense for 3 rounds"
- Small colored text tags displayed below the HP bar (not inline with name)
- Color-coded to match combat log colors (DoT=red, HoT=green, debuff=orange, buff=blue)
- Duration shown as seconds countdown with live update (e.g., "POISON 6s"), not rounds
- Show ALL effects on enemies -- both harmful (player's DoTs/debuffs) AND beneficial (enemy self-buffs like enrage, shield)
- Player's own effects highlighted in yellow and sorted first in the list
- Combat goes too fast currently -- target roughly 2x longer combat duration
- Scale back ability damage (both player and enemy abilities)
- Auto-attack damage stays as-is
- Fix must be in scaling formulas (combat_scaling.ts), NOT individual ability tuning
- Healing stays as-is
- Mana ability costs are too low relative to stamina costs -- increase mana cost scaling
- Mana abilities are missing cast times -- enforce cast times on mana abilities
- Design intent: stamina abilities hit harder but fewer uses; mana abilities hit less hard but more uses with cast time tradeoff
- Verify both scenarios: intentional 2nd group pull AND body-pull proximity adds
- No hard limit on simultaneous enemy groups
- Fix any bugs found during verification
- Verify both solo player AND grouped players pulling multiple groups
- Remove puller role restriction -- anyone in a group can pull
- Pulling mid-combat adds new enemies to the existing active fight

### Claude's Discretion
- Exact ability damage scaling reduction percentage (target ~2x combat duration)
- Specific mana cost multiplier adjustments
- Cast time values for mana abilities
- How to structure the multi-enemy verification tests
- Implementation details for the effect tag UI component

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| COMB-01 | Combat log shows DoT tick damage per tick with effect name | `tickEffectsForRound()` in reducers/combat.ts lines 2538-2550 already emits DoT messages but uses generic phrasing -- needs narrative-style rewording with color-coding kind |
| COMB-02 | Combat log shows HoT tick healing per tick with effect name | `tickEffectsForRound()` lines 2483-2488 already emits HoT messages but uses generic phrasing -- needs narrative-style rewording |
| COMB-03 | Combat log shows buff/debuff application with stat, magnitude, and duration | `addCharacterEffect()` and `addEnemyEffect()` in helpers/combat.ts do NOT emit application events -- need to add them. resolveAbility buff/debuff handlers emit generic "You use X" messages |
| COMB-04 | Combat log shows buff/debuff expiration | `tickEffectsForRound()` lines 2514-2522 already emits expiry messages but uses simple "{name} has worn off" -- needs enrichment with stat/magnitude info |
| COMB-05 | Enemy HUD displays active DoT/HoT/debuff indicators with remaining duration | `useCombat.ts` already computes `effects` array per enemy in `combatEnemiesList`. EnemyHud.vue does NOT render effects at all -- need new sub-component |
| COMB-06 | Multi-enemy pull system verified working | `start_pull` reducer blocks with "Already in combat" -- must change to add-to-existing-combat. `requirePullerOrLog` must be removed from pull/combat start paths |
| COMB-07 | Combat balance pass -- tuned damage/healing constants validated via tests | `combat_scaling.ts` has `GLOBAL_DAMAGE_MULTIPLIER` (85n), `getAbilityMultiplier()`, `abilityResourceCost()` -- all tuning targets. Existing test file `combat_scaling.test.ts` covers pure functions |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| spacetimedb | ^1.11.0 | Server-side WASM runtime | Project core |
| Vue 3 | ^3.x | Client UI framework | Project core |
| Vitest | ^3.2.1 | Unit testing | Already configured in spacetimedb/package.json |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | - | - | All work uses existing libraries |

No new dependencies needed. All changes are within existing code.

## Architecture Patterns

### Relevant Project Structure
```
spacetimedb/src/
  data/combat_scaling.ts       # Balance constants (COMB-07 target)
  data/combat_constants.ts     # Combat timing constants
  helpers/combat.ts            # addCharacterEffect, addEnemyEffect, resolveAbility
  helpers/combat_enemies.ts    # applyArmorMitigation, applyVariance
  helpers/events.ts            # appendPrivateEvent, appendGroupEvent, logPrivateAndGroup
  helpers/group.ts             # requirePullerOrLog (COMB-06 remove guard)
  helpers/test-utils.ts        # createMockDb, createMockCtx
  reducers/combat.ts           # tickEffectsForRound, start_pull, combat_loop_tick
  reducers/groups.ts           # set_group_puller reducer

src/
  components/EnemyHud.vue      # Enemy display (COMB-05 target)
  components/NarrativeInput.vue # Hosts EnemyHud
  composables/useCombat.ts     # combatEnemiesList (already computes effects per enemy)
  ui/effectTimers.ts           # effectLabel, effectIsNegative, effectRemainingSeconds
```

### Pattern 1: Event-Driven Combat Log
**What:** Combat events are written to `event_private` / `event_group` tables via helper functions. The client subscribes and renders them in the narrative feed.
**When to use:** All combat log changes (COMB-01 through COMB-04).
**Key detail:** The `kind` field on events controls client-side color styling. Current kinds include 'damage', 'heal', 'ability', 'system'. Use appropriate kinds to enable color coding:
- DoT ticks: use kind='damage' (renders red)
- HoT ticks: use kind='heal' (renders green)
- Buff application/expiry: use kind='ability' or a new kind like 'buff' (blue)
- Debuff application/expiry: use kind='ability' or a new kind like 'debuff' (orange)

### Pattern 2: Effect Data Flow for Enemy HUD
**What:** `useCombat.ts` already computes effects per enemy in `combatEnemiesList` (line 521-540). Each effect has `{ id, label, seconds, isNegative, isOwn }`. This data flows through `NarrativeInput.vue` to `EnemyHud.vue` but the HUD does not render it.
**Current gap:** `CombatEnemyEntry` type in NarrativeInput.vue (line 88-100) does NOT include effects. The `combatEnemiesList` computed property in useCombat.ts DOES include effects. The type mismatch means effects are stripped when passed to the component.
**Fix:** Extend `CombatEnemyEntry` to include effects array, pass through, render in EnemyHud.

### Pattern 3: Balance Constants in combat_scaling.ts
**What:** All damage/healing formulas reference constants from `combat_scaling.ts`. Changes here propagate automatically.
**Key levers for ~2x combat duration:**
- `GLOBAL_DAMAGE_MULTIPLIER` (currently 85n = 85% damage dealt): Reducing to ~50n would roughly double combat
- `getAbilityMultiplier()`: Formula `100n + castSeconds * 10n + cdBonus` -- reduce the base or scaling
- `abilityResourceCost()`: Formula `4n + level * 2n + power` -- increase for mana abilities
- New: ability-type-specific scaling multiplier (mana vs stamina abilities)

### Pattern 4: Pull System Architecture
**What:** Pull flow: `start_pull` reducer creates PullState + schedules PullTick -> `resolve_pull` scheduled reducer resolves outcome -> `startCombatForSpawn` creates combat.
**Current blocking issue for COMB-06:** Line 929 in `start_pull`: `if (activeCombatIdForCharacter(ctx, character.id)) return failCombat(...)` -- blocks mid-combat pulls entirely.
**Required change:** Instead of blocking, when already in combat, add the new spawn's enemies to the existing combat encounter using `addEnemyToCombat()`.

### Anti-Patterns to Avoid
- **Hardcoding per-ability balance values:** The LLM generates abilities dynamically. All balance must go through scaling formulas, never per-ability constants.
- **Adding new event kinds without client support:** If new event kinds (e.g., 'buff', 'debuff') are introduced, the client-side event feed styling must handle them. Check `NarrativeHud.vue` or event rendering logic.
- **Modifying EnemyHud without updating the type contract:** The `CombatEnemyEntry` type in NarrativeInput.vue acts as the contract. Both the useCombat computed and the EnemyHud props must agree.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Effect remaining time | Custom countdown logic | `effectRemainingSeconds()` from effectTimers.ts | Already handles stun vs round-based, timer store, edge cases |
| Effect label display | Switch on effectType | `effectLabel()` from effectTimers.ts | Handles sourceAbility fallback, type formatting |
| Effect positivity check | if/else chains | `effectIsNegative()` from effectTimers.ts | Centralized negative type set |
| Combat event routing | Direct DB inserts | `appendPrivateEvent`, `logPrivateAndGroup` from events.ts | Handles group broadcasting automatically |
| Mock DB for tests | Manual mock objects | `createMockDb()` from test-utils.ts | Auto-increment, proxy-based table access |

## Common Pitfalls

### Pitfall 1: Event Kind Must Match Client Styling
**What goes wrong:** Adding combat log messages with generic kinds causes them to render without color coding.
**Why it happens:** Client-side event rendering maps `kind` to CSS colors. Unknown kinds get default styling.
**How to avoid:** Verify that the event `kind` used for each message type maps to the correct color in the client-side event feed renderer. Check `NarrativeHud.vue` for the kind-to-color mapping.
**Warning signs:** All new log entries appear in the same default color.

### Pitfall 2: BigInt Division Truncation in Balance Tuning
**What goes wrong:** Halving damage via `damage / 2n` gives 0n for damage=1n. Mana cost formulas can produce 0n costs.
**Why it happens:** BigInt division truncates. Small values disappear.
**How to avoid:** Always ensure minimum values: `Math.max(1n, result)` or `result > 0n ? result : 1n`.
**Warning signs:** Zero damage ticks, free ability casts.

### Pitfall 3: Mid-Combat Pull Creates Duplicate Participants
**What goes wrong:** When adding enemies to existing combat, the pull resolve creates new combat participants for characters already in the fight.
**Why it happens:** `startCombatForSpawn` inserts fresh participants. If reused for mid-combat adds, it duplicates.
**How to avoid:** Use `addEnemyToCombat()` directly instead of `startCombatForSpawn()` when the combat already exists. Only add new aggro entries, not new participants.
**Warning signs:** Characters appearing twice in combat roster, double damage per tick.

### Pitfall 4: Effect Tag Overflow on Small Screens
**What goes wrong:** Many simultaneous effects (5+ DoTs, debuffs, buffs) overflow the HP bar row.
**Why it happens:** Tags rendered in a fixed-width row below HP bar.
**How to avoid:** Use flex-wrap, truncate after N visible tags, or use compact layout.
**Warning signs:** Tags overflowing container bounds.

### Pitfall 5: requirePullerOrLog Used in Multiple Locations
**What goes wrong:** Removing the puller check from `start_pull` but not from `start_combat` leaves inconsistent behavior.
**Why it happens:** `requirePullerOrLog` is called in three places: `start_combat` (line 861/901), `start_pull` (line 938).
**How to avoid:** Remove or bypass the puller check in ALL combat initiation paths, not just one.
**Warning signs:** Group members can pull but not start direct combat, or vice versa.

### Pitfall 6: Mana Cast Time Enforcement on Existing Abilities
**What goes wrong:** Existing abilities in the database have `castSeconds: 0n` for mana abilities. Changing the formula does not retroactively fix them.
**Why it happens:** Abilities are LLM-generated and stored in `ability_template` table. The castSeconds value is set at generation time.
**How to avoid:** Enforce cast time at resolution time in `resolveAbility()` or during the combat loop, not just at generation. Add a minimum cast time floor for mana-type abilities.
**Warning signs:** Old characters with pre-existing mana abilities still instant-cast after the fix.

## Code Examples

### Current DoT Tick Message (needs rewrite)
```typescript
// Source: reducers/combat.ts line 2493-2494 (current)
appendPrivateEvent(ctx, character.id, character.ownerUserId, 'damage',
  `${effect.sourceAbility ?? 'DoT'} deals ${dmg} damage to you.`);

// Target (COMB-01 narrative style):
appendPrivateEvent(ctx, character.id, character.ownerUserId, 'damage',
  `You suffer ${dmg} damage from ${effect.sourceAbility ?? 'a lingering effect'}.`);
```

### Current HoT Tick Message (needs rewrite)
```typescript
// Source: reducers/combat.ts line 2487-2488 (current)
appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
  `${effect.sourceAbility ?? 'Regeneration'} heals you for ${effect.magnitude}.`);

// Target (COMB-02 narrative style):
appendPrivateEvent(ctx, character.id, character.ownerUserId, 'heal',
  `${effect.sourceAbility ?? 'Regeneration'} soothes you for ${effect.magnitude} HP.`);
```

### Missing Buff Application Message (needs adding)
```typescript
// Source: helpers/combat.ts addCharacterEffect() line 201-208
// Currently: NO application message is emitted
// Target (COMB-03): Add after insert/update
appendPrivateEvent(ctx, characterId, character.ownerUserId, 'buff',
  `${sourceAbility} grants ${effectLabel(effectType)} ${magnitude > 0n ? '+' + magnitude : ''} for ${roundsRemaining} rounds.`);
```

### Effect Tag Component Pattern (for EnemyHud.vue)
```vue
<!-- New sub-section in EnemyHud.vue, below HP bar -->
<div :style="effectTagContainer">
  <span
    v-for="effect in enemy.effects"
    :key="String(effect.id)"
    :style="[effectTagStyle, {
      color: effect.isOwn ? '#ffd43b' : effectColor(effect),
      borderColor: effect.isOwn ? '#ffd43b' : effectColor(effect)
    }]"
  >
    {{ effect.label.toUpperCase() }} {{ effect.seconds }}s
  </span>
</div>
```

### Balance Scaling: Ability Damage Multiplier Reduction
```typescript
// Source: combat_scaling.ts getAbilityMultiplier()
// Current: 100n + castSeconds * 10n + cdBonus
// To achieve ~2x combat duration, reduce ability effectiveness:
// Option A: Add a global ability damage scaler (recommended -- single lever)
export const ABILITY_DAMAGE_SCALER = 50n; // 50% on 100n scale
// Apply in resolveAbility scaledPower(): (power * ABILITY_DAMAGE_SCALER) / 100n

// Option B: Reduce the base multiplier
// return 60n + castBonus + cdBonus;  // 60% base instead of 100%
```

### Mid-Combat Pull: Add to Existing Combat
```typescript
// In resolve_pull, replace the "already in combat" block:
const existingCombatId = activeCombatIdForCharacter(ctx, character.id);
if (existingCombatId) {
  // Add new enemies to existing combat instead of blocking
  const combat = ctx.db.combat_encounter.id.find(existingCombatId);
  if (combat) {
    addEnemyToCombat(deps, ctx, combat, spawn, participants);
    // Create aggro entries for new enemies vs existing participants
    // ... (see addEnemyToCombat for pattern)
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Round-based combat | Real-time 1s tick loop | Phase 26 | All effect timing is seconds-based |
| Class-based ability dispatch | kind-based dispatch via resolveAbility | Phase 27 | No hardcoded ability switch |
| Seeded abilities | LLM-generated abilities | Phase 27 | Balance MUST be formula-driven |
| Puller role system | Still active | Pre-v2.1 | Needs removal per COMB-06 |

## Open Questions

1. **Event kind for buff/debuff coloring**
   - What we know: Client event feed styles by `kind`. Current kinds: 'damage', 'heal', 'ability', 'system', 'combat', 'loot', 'quest', etc.
   - What's unclear: Whether new kinds ('buff', 'debuff') are needed or if existing kinds with message styling suffice.
   - Recommendation: Check NarrativeHud event styling. If kind-based color is used, add new kinds. If message content drives color, reuse 'ability' kind.

2. **Mana cast time enforcement scope**
   - What we know: LLM generates abilities with castSeconds. Current mana abilities may have 0 cast time.
   - What's unclear: Whether to enforce at generation time (prompt change), resolution time (runtime floor), or both.
   - Recommendation: Runtime floor in resolveAbility for mana-type abilities ensures all existing + future abilities are covered. Also update generation prompts for new abilities.

3. **`pullerCharacterId` column after removal**
   - What we know: Group table has `pullerCharacterId` optional column. `set_group_puller` reducer exists.
   - What's unclear: Whether to remove the column entirely or just ignore it.
   - Recommendation: Keep the column (schema changes require --clear-database). Just remove the `requirePullerOrLog` checks. The `set_group_puller` reducer becomes a no-op but harmless.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.1 |
| Config file | Inferred from spacetimedb/package.json "test" script |
| Quick run command | `cd spacetimedb && npm test` |
| Full suite command | `cd spacetimedb && npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COMB-01 | DoT tick emits narrative-style damage event | unit | `cd spacetimedb && npx vitest run src/helpers/combat.test.ts -t "DoT tick"` | Partially (combat.test.ts exists, new tests needed) |
| COMB-02 | HoT tick emits narrative-style heal event | unit | `cd spacetimedb && npx vitest run src/helpers/combat.test.ts -t "HoT tick"` | Partially |
| COMB-03 | Buff/debuff application emits event with stat+magnitude+duration | unit | `cd spacetimedb && npx vitest run src/helpers/combat.test.ts -t "buff application"` | No -- Wave 0 |
| COMB-04 | Buff/debuff expiration emits enriched event | unit | `cd spacetimedb && npx vitest run src/helpers/combat.test.ts -t "effect expiry"` | No -- Wave 0 |
| COMB-05 | Effect indicators render in EnemyHud | manual-only | N/A (Vue component, visual) | N/A |
| COMB-06 | Mid-combat pull adds enemies to existing combat | unit | `cd spacetimedb && npx vitest run src/reducers/combat.test.ts -t "mid-combat pull"` | No -- Wave 0 (combat reducer test file may not exist) |
| COMB-07 | Balance constants produce expected damage ranges | unit | `cd spacetimedb && npx vitest run src/data/combat_scaling.test.ts` | Yes (exists) |

### Sampling Rate
- **Per task commit:** `cd spacetimedb && npm test`
- **Per wave merge:** `cd spacetimedb && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] New test cases in `combat.test.ts` for DoT/HoT tick event message format (COMB-01, COMB-02)
- [ ] New test cases in `combat.test.ts` for buff/debuff application event emission (COMB-03)
- [ ] New test cases in `combat.test.ts` for effect expiry event enrichment (COMB-04)
- [ ] New test cases for balance constant changes in `combat_scaling.test.ts` (COMB-07)
- [ ] Test coverage for mid-combat pull scenario (COMB-06) -- may need new test file or section

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of all files listed in Architecture Patterns section
- `spacetimedb/src/reducers/combat.ts` -- combat loop, tickEffectsForRound, start_pull, resolve_pull
- `spacetimedb/src/helpers/combat.ts` -- addCharacterEffect, addEnemyEffect, resolveAbility
- `spacetimedb/src/data/combat_scaling.ts` -- all balance constants and formulas
- `spacetimedb/src/helpers/group.ts` -- requirePullerOrLog
- `src/composables/useCombat.ts` -- client-side combat data flow
- `src/components/EnemyHud.vue` -- current enemy display (no effects rendered)
- `src/ui/effectTimers.ts` -- effect utility functions

### Secondary (MEDIUM confidence)
- CONTEXT.md user decisions -- verified against codebase feasibility

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries needed, all existing code
- Architecture: HIGH -- clear codebase patterns, all integration points identified
- Pitfalls: HIGH -- based on direct code analysis of edge cases
- Balance tuning: MEDIUM -- exact multiplier values need playtesting iteration

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable codebase, no external dependency changes expected)
