# Phase 33: Combat Improvements - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Players see complete, informative combat feedback (DoT/HoT ticks, buff/debuff events in the log, enemy effect indicators) and encounter balanced difficulty. Multi-enemy pull system verified working. Combat balance pass on ability scaling, mana costs, and cast times.

</domain>

<decisions>
## Implementation Decisions

### Combat Log Formatting
- Every DoT/HoT tick gets its own log entry (not summarized per round) — real-time feedback
- Color-coded by effect type: DoT damage in red, HoT healing in green, buffs in blue, debuffs in orange
- Narrative phrasing style: "You suffer 12 damage from Poison Sting" / "Regeneration soothes you for 8 HP" — immersive, fits keeper tone
- Buff/debuff application and expiration messages include the source ability name: "Shield Wall grants +5 Defense for 3 rounds"

### Enemy Effect Indicators
- Small colored text tags displayed below the HP bar (not inline with name)
- Color-coded to match combat log colors (DoT=red, HoT=green, debuff=orange, buff=blue)
- Duration shown as seconds countdown with live update (e.g., "POISON 6s"), not rounds
- Show ALL effects on enemies — both harmful (player's DoTs/debuffs) AND beneficial (enemy self-buffs like enrage, shield)
- Player's own effects highlighted in yellow and sorted first in the list — clearly distinguishable when many effects stack in group combat

### Balance Tuning
- Combat goes too fast currently — target roughly 2x longer combat duration
- Scale back ability damage (both player and enemy abilities) — abilities hit too hard relative to auto-attacks
- Auto-attack damage stays as-is — will feel more relevant once abilities are scaled down
- Fix must be in scaling formulas (combat_scaling.ts), NOT individual ability tuning — LLM generates abilities dynamically, so the power scaling system must enforce balance
- Healing stays as-is — feels fine currently
- Mana ability costs are too low relative to stamina costs — increase mana cost scaling
- Mana abilities are missing cast times — enforce cast times on mana abilities as a combat balance lever
- Design intent: stamina abilities hit harder but fewer uses (stamina also spent on travel); mana abilities hit less hard but more uses with cast time tradeoff

### Multi-Enemy Pull System
- Verify both scenarios: intentional 2nd group pull AND body-pull proximity adds
- No hard limit on simultaneous enemy groups — players can pull as many as they dare
- Fix any bugs found during verification (not just document)
- Verify both solo player AND grouped players pulling multiple groups
- **CHANGE: Remove puller role restriction** — anyone in a group can pull, not just leader-designated puller
- Pulling mid-combat adds new enemies to the existing active fight

### Claude's Discretion
- Exact ability damage scaling reduction percentage (target ~2x combat duration)
- Specific mana cost multiplier adjustments
- Cast time values for mana abilities
- How to structure the multi-enemy verification tests
- Implementation details for the effect tag UI component

</decisions>

<specifics>
## Specific Ideas

- "Our LLM is coming up with abilities for us, so this needs to be a power scaling change, not just a one off band aid fix"
- "Stamina abilities could hit harder, but you have less uses of them. Mana abilities less hard, but more uses."
- "Each player's effects should be highlighted in yellow and show first in the list. This way I can clearly see my own effects when lots of effects start stacking"
- "Remove the concept of Leader choosing a puller and only the puller can pull. If you are in a group, let anyone pull."
- "In combat, someone could also pull another group if they wished and they would join the existing fight that is in progress"

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `appendPrivateEvent` / `appendGroupEvent` in `helpers/events.ts` — event routing already handles per-player and group events
- `addCharacterEffect` / `addEnemyEffect` in `helpers/combat.ts` — effect application with round tracking
- `effectIsNegative` / `effectLabel` / `effectRemainingSeconds` in `src/ui/effectTimers.ts` — client-side effect utilities
- `EnemyHud.vue` — existing enemy display component (HP bars, con color, name)
- `useCombat.ts` composable — already maps CombatEnemyEffect rows with remaining seconds per enemy
- `combat_scaling.ts` — central location for all damage/healing scaling constants
- `combat_constants.ts` — weapon speeds, auto-attack intervals

### Established Patterns
- Events written to EventPrivate/EventLocation/EventWorld tables, client subscribes via useEvents composable
- Effects tick in `tickEffectsForRound()` inside the combat_loop reducer (1s ticks, DoT/regen every 3s)
- PullState + PullTick tables handle delayed-add pull mechanics
- Vitest co-located test files (`*.test.ts`) with shared mock DB from Phase 31

### Integration Points
- `tickEffectsForRound()` — where DoT/HoT tick events need to be emitted
- `addCharacterEffect()` / `addEnemyEffect()` — where buff/debuff application events need to be emitted
- `EnemyHud.vue` — needs new effect tag sub-component
- `combat_scaling.ts` — ability damage multiplier adjustment
- Pull system reducers — remove puller role check

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 33-combat-improvements*
*Context gathered: 2026-03-09*
