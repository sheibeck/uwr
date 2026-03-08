# Phase 30: Narrative Combat - Research

**Researched:** 2026-03-07
**Domain:** Round-based combat engine rework + LLM combat narration integration
**Confidence:** HIGH

## Summary

Phase 30 is a major engine rework that replaces the real-time tick-based combat loop with a round-based resolution model, plus integrates LLM narration into the combat flow. The existing combat system runs on a 1-second scheduled tick (`CombatLoopTick`) that processes auto-attacks, enemy AI abilities, effects, and player casts continuously. This must be restructured so that all participants submit actions within a time window, then the entire round resolves at once, and an LLM narration is optionally generated for key moments.

The existing LLM task pipeline (reducer creates `LlmTask` -> client `useLlmProxy` calls proxy -> `submit_llm_result` reducer processes result) is well-established and directly reusable. The `buildCombatNarrationPrompt` in `llm_prompts.ts` already defines the sardonic narrator voice for combat. The CombatPanel floating overlay and current real-time combat UI elements must be removed entirely, replaced with inline narrative stream interactions.

**Primary recommendation:** Structure the rework in three stages: (1) round-based engine conversion on the server, (2) LLM narration integration using existing pipeline, (3) client combat UI migration to narrative-only.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Replace real-time tick-based combat loop with round-based resolution
- Each round: all players choose one ability (or auto-attack by default), enemies choose one ability/auto-attack, then the entire round resolves in bulk
- 10-second action timer per round -- if player doesn't choose, they auto-attack
- Round locks when timer expires OR all group members have submitted actions
- DoTs, HoTs, and timed effects tick once per round (not real-time)
- Flee is a round action choice -- success/failure resolved in that round's narration
- Existing combat mechanics (damage formulas, scaling, crits, aggro, effects) preserved, just restructured for bulk resolution
- LLM narrates key moments only: combat intro, 1-2 mid-combat rounds (batched), and victory/defeat outro
- Cap at 3-4 LLM calls per combat encounter
- Each LLM call covers an entire round's events (all abilities used, damage dealt, effects applied, deaths)
- Mechanical messages still appear instantly (existing appendPrivateEvent system)
- LLM narration arrives async as supplemental System commentary in the narrative stream (gold/amber styled)
- Server triggers one LLM call per combat round -- all group members see the same narration
- Narration uses typewriter animation (consistent with Phase 25 LLM text handling)
- Combat narration shares the existing 50/day LLM budget (no separate pool)
- Smart throttling: below 10 remaining calls, combat narration auto-skips
- In group combat, the LLM call cost is split/rotated across group members
- When budget exhausted or narration skipped: mechanical text only
- CombatPanel floating overlay removed entirely
- No sticky combat elements -- everything in the narrative stream
- Each round summary displays in narrative stream with textual HP/mana bars (colored #### blocks)
- Round summary IS the combat status display
- During action selection: abilities and targets listed as clickable options in the narrative
- Context action bar hidden during combat
- Players initiate combat by clicking enemy names from look output or typing 'attack [name]'
- After clicking: prompt asks "Approach carefully or charge in?" with two clickable options
- Hotbar abilities displayed inline in the narrative prompt as clickable options
- Non-hotbarred abilities accessible via typing or "more abilities..." option
- Targets listed in narrative prompt -- click to select

### Claude's Discretion
- Enemy action economy (symmetric 1 action vs bosses getting extra actions)
- Solo combat pacing (shorter timer when not in a group)
- Timer presentation details
- Exact textual HP bar format (characters, colors, width)
- Ability + target selection order
- Whether chosen action can be changed before round locks
- Late narration staleness handling

### Deferred Ideas (OUT OF SCOPE)
- Character loadout/hotbar configuration UI
- Narrative-based inventory/equipment management
- Removing remaining floating panels in favor of narrative interaction
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| COMBAT-01 | Combat rounds are narrated by the LLM over the existing turn-based engine | Round-based engine rework + LLM task pipeline integration with buildCombatNarrationPrompt |
| COMBAT-02 | Mechanical state changes (damage, healing, effects) happen instantly; narrative arrives async | appendPrivateEvent for instant mechanical text + LlmTask for async narration |
| COMBAT-03 | The System narrator maintains sardonic voice during combat descriptions | buildCombatNarrationPrompt already defines the voice, vocabulary, and response format |
</phase_requirements>

## Architecture Patterns

### Current Combat Architecture (Being Replaced)

The existing system runs on real-time ticks:

1. **CombatLoopTick** scheduled reducer fires every 1 second (`COMBAT_LOOP_INTERVAL_MICROS = 1_000_000n`)
2. Each tick processes: pending adds, enemy abilities, player auto-attacks, pet combat, victory/defeat checks
3. Players call `use_ability` at any time (fires immediately within the tick cycle)
4. Effects (`EffectTick`, `HotTick`, `CastTick`) run on separate scheduled intervals (10s, 3s, variable)
5. Flee attempts set `status: 'fleeing'` and resolve in the next loop tick

### New Round-Based Architecture

```
ROUND LIFECYCLE:
1. COMBAT_START -> create combat_encounter, set state='action_select', set round timer
2. ACTION_SELECT phase (10s timer or all submitted):
   - Players submit actions via `submit_combat_action` reducer
   - CombatAction table tracks: characterId, combatId, round, abilityTemplateId, targetId
   - Timer expiry or all-submitted triggers round resolution
3. ROUND_RESOLVE:
   - New `resolve_round` reducer (replaces combat_loop):
     a. Process player actions (in order: fastest first, or simultaneous)
     b. Process enemy actions (AI picks abilities/targets)
     c. Tick effects once (DoTs, HoTs, buffs)
     d. Check victory/defeat
     e. Collect round events into a structured summary
     f. Create LlmTask if this round qualifies for narration
     g. Emit mechanical messages immediately via appendPrivateEvent
     h. Advance to next ACTION_SELECT or end combat
4. COMBAT_END -> victory/defeat narration LlmTask, loot distribution, cleanup
```

### Key New Tables

| Table | Purpose |
|-------|---------|
| `CombatAction` | Per-player action submission for current round (characterId, combatId, round, abilityTemplateId, targetEnemyId, targetCharacterId) |
| `CombatRound` | Round state tracking (combatId, roundNumber, state: 'action_select'/'resolving'/'resolved', timerExpiresAt, narrativeText) |
| `CombatNarrative` | Stores LLM-generated narration per combat event (combatId, roundNumber, narrativeText, narrativeType: 'intro'/'round'/'victory'/'defeat') |

### Round Timer Implementation

Use a scheduled reducer (`RoundTimerTick`) that fires when the 10-second timer expires:

```typescript
// When entering action_select phase:
ctx.db.round_timer_tick.insert({
  scheduledId: 0n,
  scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 10_000_000n),
  combatId: combat.id,
  roundNumber: round.roundNumber,
});
```

When all players submit early, the `submit_combat_action` reducer checks if all active participants have acted, and if so, immediately triggers resolution (deletes the timer tick and calls resolve logic inline).

### LLM Integration Pattern

Follow the established `LlmTask` pipeline exactly:

```typescript
// In resolve_round, after collecting round events:
const roundSummary = buildRoundSummaryContext(combat, roundEvents, participants, enemies);
const systemPrompt = buildCombatNarrationPrompt(roundSummary);
const userPrompt = buildCombatRoundUserPrompt(roundEvents);

ctx.db.llm_task.insert({
  id: 0n,
  playerId: /* rotate among group members or use leader */,
  domain: 'combat_narration',
  model: 'gpt-5-mini',
  systemPrompt,
  userPrompt,
  maxTokens: 300n,
  status: 'pending',
  contextJson: JSON.stringify({ combatId, roundNumber, participantIds }),
  createdAt: ctx.timestamp,
});
```

### Narration Qualification Logic

Not every round gets narrated. Qualification criteria:

```typescript
function shouldNarrateRound(combat, roundEvents, narrationCount): boolean {
  // Always narrate: combat intro, victory, defeat
  if (roundEvents.type === 'intro' || roundEvents.type === 'victory' || roundEvents.type === 'defeat') return true;
  // Cap at 3-4 total narrations per combat
  if (narrationCount >= 3) return false;
  // Budget check
  if (remainingBudget < 10) return false;
  // Key events: crit, kill, near-death, significant damage threshold
  return roundEvents.hasCrit || roundEvents.hasKill || roundEvents.hasNearDeath;
}
```

### Combat UI in Narrative Stream

The round summary is rendered as a structured message in the narrative stream. Event kinds:

| Kind | Color | Purpose |
|------|-------|---------|
| `combat` | #ff6b6b (existing) | Damage/mechanical events |
| `combat_narration` | #ffd43b (gold, narrative) | LLM narration from The System |
| `combat_prompt` | #e9ecef (white) | Action selection prompts with clickable abilities/targets |
| `combat_status` | #adb5bd (gray) | Round summary with textual HP bars |

### Textual HP Bar Format (Claude's Discretion)

```
[####████████░░░░░░░░] 67/100 HP  Dire Wolf (L3)
[##████░░░░░░░░░░░░░░] 23/80 HP   Ash Crawler (L2)
```

Use colored spans within the narrative message: green for high HP (>50%), yellow for medium (25-50%), red for low (<25%). Fixed-width monospace block for alignment.

### Action Selection Prompt Format

```
The System regards you expectantly. Choose your action (8s remaining):

> [Void Rend] (12 mana) - targets: [Dire Wolf], [Ash Crawler]
> [Iron Tide] (ready) - targets: [Dire Wolf], [Ash Crawler]
> [Auto-attack] - targets: [Dire Wolf], [Ash Crawler]
> [Flee] - attempt to escape
> [More abilities...] - view all abilities
```

Abilities and targets are clickable keywords (using existing `[bracket]` keyword click system from Phase 28).

### Recommended Selection Order (Claude's Discretion)

Target first, then ability. Rationale: target context helps choose appropriate ability. After clicking a target, the prompt updates to show available abilities for that target. Players can also type ability names directly.

### Ability Changeability (Claude's Discretion)

Allow changing action before round locks. Simply overwrite the `CombatAction` row. This is low-cost and reduces frustration.

### Enemy Action Economy (Claude's Discretion)

- Standard enemies: 1 action per round (symmetric with players)
- Boss enemies (template.isBoss): 2 actions per round (one ability + one auto-attack)
- This preserves boss threat without adding complex multi-action systems

### Solo Combat Pacing (Claude's Discretion)

- Solo (no group): 6-second timer instead of 10
- Group: 10-second timer as specified
- Rationale: solo players don't need to coordinate, shorter timer keeps pacing snappy

### Late Narration Staleness (Claude's Discretion)

If narration arrives after the next round's action_select has already started, still display it but with a subtle indicator: "The System catches up..." prefix. Never block gameplay waiting for narration.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM API calls | Custom HTTP client | Existing LlmTask + useLlmProxy pipeline | Already handles auth, errors, budget, retry |
| Combat narration voice | New prompt system | Existing buildCombatNarrationPrompt | Already defines sardonic voice, vocabulary, format |
| Async message delivery | WebSocket/polling | SpacetimeDB table subscriptions | Client already subscribes to event tables |
| Timer/countdown | setInterval on client | Scheduled reducer (RoundTimerTick) | Server-authoritative, deterministic |
| Typewriter animation | New animation system | Existing useNarrativeAnimation | Already handles sentence-by-sentence reveal |

## Common Pitfalls

### Pitfall 1: Effect Duration Conversion
**What goes wrong:** DoTs/HoTs/buffs are currently measured in seconds/microseconds. Converting to "rounds" risks breaking all existing effect durations.
**Why it happens:** The current system uses `EffectTick` at 10s intervals and `HotTick` at 3s intervals.
**How to avoid:** Convert effect durations to round counts at combat start. A 10-second DoT at 10s ticks = 1 tick; in round-based, that becomes ~3 rounds (if rounds are ~3-4s). Define a clear conversion formula and apply it consistently.
**Warning signs:** Effects ending too fast or too slow after conversion.

### Pitfall 2: Race Condition on Round Resolution
**What goes wrong:** Multiple clients submit actions near-simultaneously; the "all submitted" check triggers resolution multiple times.
**Why it happens:** SpacetimeDB reducers are transactional, but the check-and-resolve pattern needs to be atomic.
**How to avoid:** The `submit_combat_action` reducer does the check-and-resolve in a single transaction. SpacetimeDB's transactional reducers handle this -- one reducer call will see all prior submissions and trigger resolution exactly once.

### Pitfall 3: Budget Rotation in Groups
**What goes wrong:** All LLM calls charge to the same player's budget, depleting one player while others have full budgets.
**Why it happens:** LlmTask requires a single `playerId`.
**How to avoid:** Track which player's budget was last charged per combat. Round-robin through group members. Store the rotation index on `CombatEncounter` or `CombatRound`.

### Pitfall 4: CombatPanel Removal Breaking Existing Features
**What goes wrong:** Removing CombatPanel breaks loot display, combat results, enemy targeting, and other features that depend on the panel.
**Why it happens:** CombatPanel currently handles loot modal, result display, and enemy selection.
**How to avoid:** Identify all CombatPanel responsibilities FIRST. Map each to its narrative-stream replacement before deleting. Loot display becomes narrative messages. Enemy selection becomes clickable keywords. Results become narrative summary.

### Pitfall 5: Orphaned Scheduled Reducers
**What goes wrong:** Old scheduled reducers (CombatLoopTick, EffectTick, HotTick, CastTick) continue firing alongside new round-based system.
**Why it happens:** Multiple scheduled tables reference the same combat state.
**How to avoid:** In the round-based system, replace ALL tick-based scheduling with round-based triggers. The `resolve_round` reducer handles everything that separate ticks used to do. Delete or repurpose the old scheduled tables.

### Pitfall 6: Blocking Combat on LLM Response
**What goes wrong:** Players wait for LLM narration before they can act in the next round.
**Why it happens:** Mixing async narration with synchronous round flow.
**How to avoid:** NEVER block round progression on narration. The next ACTION_SELECT phase starts immediately after resolution. Narration arrives and displays whenever it arrives. Combat state machine and narration are completely decoupled.

## Code Examples

### Round-Based Combat State Machine

```typescript
// New table for round state
export const CombatRound = table({
  name: 'combat_round',
  public: true,
  indexes: [
    { accessor: 'by_combat', algorithm: 'btree', columns: ['combatId'] },
  ],
}, {
  id: t.u64().primaryKey().autoInc(),
  combatId: t.u64(),
  roundNumber: t.u64(),
  state: t.string(),           // 'action_select', 'resolving', 'resolved'
  timerExpiresAtMicros: t.u64(),
  narrationCount: t.u64(),     // Total narrations triggered so far in this combat
});

// Player action submission
export const CombatAction = table({
  name: 'combat_action',
  public: true,
  indexes: [
    { accessor: 'by_combat', algorithm: 'btree', columns: ['combatId'] },
    { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
  ],
}, {
  id: t.u64().primaryKey().autoInc(),
  combatId: t.u64(),
  characterId: t.u64(),
  roundNumber: t.u64(),
  actionType: t.string(),      // 'ability', 'auto_attack', 'flee'
  abilityTemplateId: t.u64().optional(),
  targetEnemyId: t.u64().optional(),
  targetCharacterId: t.u64().optional(),
  submittedAt: t.timestamp(),
});
```

### Submit Action Reducer Pattern

```typescript
spacetimedb.reducer('submit_combat_action', {
  characterId: t.u64(),
  actionType: t.string(),
  abilityTemplateId: t.u64().optional(),
  targetEnemyId: t.u64().optional(),
  targetCharacterId: t.u64().optional(),
}, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  const combatId = activeCombatIdForCharacter(ctx, character.id);
  if (!combatId) return fail(ctx, character, 'Not in combat');

  const round = getCurrentRound(ctx, combatId);
  if (!round || round.state !== 'action_select') return fail(ctx, character, 'Not in action phase');

  // Upsert action (allows changing before lock)
  const existing = [...ctx.db.combat_action.by_character.filter(character.id)]
    .find(a => a.combatId === combatId && a.roundNumber === round.roundNumber);

  if (existing) {
    ctx.db.combat_action.id.update({ ...existing, ...args, submittedAt: ctx.timestamp });
  } else {
    ctx.db.combat_action.insert({
      id: 0n, combatId, characterId: character.id,
      roundNumber: round.roundNumber, ...args, submittedAt: ctx.timestamp,
    });
  }

  // Check if all active participants have submitted
  const participants = [...ctx.db.combat_participant.by_combat.filter(combatId)]
    .filter(p => p.status === 'active');
  const actions = [...ctx.db.combat_action.by_combat.filter(combatId)]
    .filter(a => a.roundNumber === round.roundNumber);
  const allSubmitted = participants.every(p =>
    actions.some(a => a.characterId === p.characterId)
  );

  if (allSubmitted) {
    // Cancel timer and resolve immediately
    resolveRound(ctx, combatId, round);
  }
});
```

### LLM Narration on Round Resolve

```typescript
// After resolving all actions and effects:
function triggerCombatNarration(ctx, combat, round, roundEvents) {
  if (!shouldNarrateRound(combat, roundEvents, round.narrationCount)) return;

  // Rotate budget charge through group members
  const participants = [...ctx.db.combat_participant.by_combat.filter(combat.id)]
    .filter(p => p.status === 'active');
  const chargeIndex = Number(round.narrationCount % BigInt(participants.length));
  const chargePlayer = ctx.db.character.id.find(participants[chargeIndex].characterId);
  if (!chargePlayer) return;
  const player = ctx.db.player.id.find(chargePlayer.ownerUserId);
  // Get player identity for budget
  // ... budget check + increment ...

  const context = buildRoundNarrationContext(roundEvents);
  const systemPrompt = buildCombatNarrationPrompt(context);
  const userPrompt = buildCombatRoundUserPrompt(roundEvents);

  ctx.db.llm_task.insert({
    id: 0n,
    playerId: /* charged player's identity */,
    domain: 'combat_narration',
    model: 'gpt-5-mini',
    systemPrompt,
    userPrompt,
    maxTokens: 400n,
    status: 'pending',
    contextJson: JSON.stringify({
      combatId: combat.id.toString(),
      roundNumber: round.roundNumber.toString(),
      narrativeType: roundEvents.type, // 'intro', 'round', 'victory', 'defeat'
    }),
    createdAt: ctx.timestamp,
  });
}
```

### Handling Combat Narration Results in submit_llm_result

```typescript
// In the existing submit_llm_result reducer, add combat_narration domain handler:
} else if (task.domain === 'combat_narration') {
  const context = task.contextJson ? JSON.parse(task.contextJson) : {};
  const combatId = BigInt(context.combatId);
  const narrativeType = context.narrativeType;

  try {
    const data = extractJson(resultText);
    const narrativeText = data.narrative || resultText;

    // Store narration
    ctx.db.combat_narrative.insert({
      id: 0n, combatId, roundNumber: BigInt(context.roundNumber),
      narrativeText, narrativeType, createdAt: ctx.timestamp,
    });

    // Broadcast to all combat participants as event
    const participants = [...ctx.db.combat_participant.by_combat.filter(combatId)];
    for (const p of participants) {
      const character = ctx.db.character.id.find(p.characterId);
      if (!character) continue;
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'combat_narration', narrativeText);
    }
    // Also check resolved combats for victory/defeat narrations
    // ...
  } catch (e) {
    // Silent failure -- combat continues without narration
  }
}
```

## Existing Code to Modify

### Server-Side (spacetimedb/)

| File | Change | Impact |
|------|--------|--------|
| `src/reducers/combat.ts` | Replace combat_loop with resolve_round; add submit_combat_action, round timer | **MAJOR** -- 3030 lines, core rework |
| `src/helpers/combat.ts` | Refactor executeAbilityAction for batch execution; add round-based effect ticking | MAJOR |
| `src/data/llm_prompts.ts` | Add buildCombatRoundUserPrompt; enhance buildCombatNarrationPrompt with round event schema | MODERATE |
| `src/schema/tables.ts` | Add CombatRound, CombatAction, CombatNarrative, RoundTimerTick tables | MODERATE |
| `src/index.ts` | Add combat_narration handler to submit_llm_result | MODERATE |
| `src/data/combat_constants.ts` | Add ROUND_TIMER_MICROS, SOLO_TIMER_MICROS; remove/deprecate tick intervals | SMALL |

### Client-Side (src/)

| File | Change | Impact |
|------|--------|--------|
| `src/composables/useCombat.ts` | Rework for round-based state; add action submission; remove real-time timer tracking | **MAJOR** |
| `src/composables/useContextActions.ts` | Hide action bar during combat; combat actions move to narrative stream | MODERATE |
| `src/components/CombatPanel.vue` | DELETE entirely | -- |
| `src/components/HotbarPanel.vue` | May keep for configuration but remove from combat flow | SMALL |
| `src/components/NarrativeConsole.vue` | Handle new event kinds (combat_prompt, combat_status, combat_narration) | MODERATE |
| `src/components/NarrativeMessage.vue` | Render textual HP bars, clickable ability/target prompts in combat events | MODERATE |

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Real-time 1s tick loop | Round-based resolution | All timing logic changes |
| Player fires abilities any time | Player submits action per round | New action submission flow |
| Separate effect/hot/cast ticks | Single resolve_round handles all | Consolidates 4 scheduled reducers |
| CombatPanel floating overlay | Narrative stream combat UI | Component deletion + narrative rendering |
| No combat narration | LLM narrates key moments | New LlmTask domain + result handler |

## Open Questions

1. **Effect Duration Conversion Formula**
   - What we know: Current effects use seconds/microseconds (e.g., 10s DoTs, 3s HoT ticks)
   - What's unclear: Exact mapping from time-based to round-based (is 1 round = 3s? 4s? Variable?)
   - Recommendation: Define 1 round ~ 4 seconds equivalent. A 12-second DoT becomes 3 rounds. Apply floor division with minimum 1 round. Rebalancing may be needed post-implementation.

2. **Player Identity for Budget in Group Combat**
   - What we know: LlmTask requires a `playerId` (identity). Budget is per-player.
   - What's unclear: The `playerId` on LlmTask is an identity, but budget rotation needs to find a player identity from a characterId.
   - Recommendation: Character has `ownerUserId` -> Player table lookup -> player identity. Use round-robin by narration count modulo participant count.

3. **Loot Distribution After CombatPanel Removal**
   - What we know: CombatPanel currently shows loot modal and "Take/Take All" buttons.
   - What's unclear: How loot interaction works in narrative-only mode.
   - Recommendation: Victory narration includes loot list as clickable items. "[Take Rusty Sword]" "[Take All Loot]" "[Dismiss]" as keyword actions. Same reducers (takeLoot, takeAllLoot, dismissCombatResults) called via click handlers.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual testing (no automated test infrastructure detected) |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COMBAT-01 | Round resolution triggers LLM narration for qualifying rounds | manual | Publish + play through combat | N/A |
| COMBAT-02 | Mechanical messages appear instantly, narration arrives async | manual | Observe event timing during combat | N/A |
| COMBAT-03 | Sardonic narrator voice in combat descriptions | manual | Read LLM output in narrative stream | N/A |

### Sampling Rate
- **Per task commit:** `spacetime publish uwr -p spacetimedb` + manual playtest
- **Per wave merge:** Full combat flow test (start -> action select -> resolve -> narration -> victory/defeat)
- **Phase gate:** Complete combat encounter with narration working end-to-end

### Wave 0 Gaps
- None -- no automated test infrastructure to set up. All validation is manual via gameplay.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `spacetimedb/src/reducers/combat.ts` (3030 lines) -- full combat engine
- Codebase analysis: `spacetimedb/src/helpers/combat.ts` -- ability execution, combat tick scheduling
- Codebase analysis: `spacetimedb/src/data/llm_prompts.ts` -- existing combat narration prompt
- Codebase analysis: `spacetimedb/src/index.ts:719` -- submit_llm_result handler pattern
- Codebase analysis: `spacetimedb/src/schema/tables.ts` -- LlmTask, LlmBudget, LlmRequest tables
- Codebase analysis: `spacetimedb/src/reducers/npc_interaction.ts` -- LlmTask creation pattern
- Codebase analysis: `src/composables/useLlmProxy.ts` -- client LLM proxy pipeline
- Codebase analysis: `src/composables/useCombat.ts` -- client combat state management
- Codebase analysis: `src/composables/useContextActions.ts` -- action bar during combat
- Codebase analysis: `src/components/CombatPanel.vue` -- current combat UI (to be deleted)
- Codebase analysis: `src/components/NarrativeMessage.vue` -- event rendering and kinds

### Secondary (MEDIUM confidence)
- SpacetimeDB TS SDK patterns from CLAUDE.md -- table definitions, reducer patterns, scheduled tables

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- entirely using existing project infrastructure (SpacetimeDB, Vue, LLM proxy)
- Architecture: HIGH -- clear patterns established in prior phases, round-based model is well-defined in CONTEXT.md
- Pitfalls: HIGH -- identified from direct codebase analysis of the 3030-line combat.ts

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable -- internal project architecture)
