# Phase 30: Narrative Combat - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Combat encounters are narrated by the LLM over a round-based combat engine. This phase replaces the current real-time tick-based combat loop with a round-based model where all participants choose actions, the round resolves in bulk, and the LLM narrates the results. The CombatPanel floating overlay is removed entirely — all combat UI lives in the narrative stream. Existing combat mechanics (damage formulas, scaling, effects, crits, aggro) are preserved but restructured around round-based resolution.

Requirements: COMBAT-01, COMBAT-02, COMBAT-03

</domain>

<decisions>
## Implementation Decisions

### Round-Based Combat Model (Major Engine Rework)
- Replace real-time tick-based combat loop with round-based resolution
- Each round: all players choose one ability (or auto-attack by default), enemies choose one ability/auto-attack, then the entire round resolves in bulk
- 10-second action timer per round — if a player doesn't choose, they auto-attack
- Round locks when timer expires OR all group members have submitted actions
- DoTs, HoTs, and timed effects tick once per round (not real-time). Will need rebalancing of existing effect values
- Flee is a round action choice — success/failure resolved in that round's narration
- Existing combat mechanics (damage formulas, scaling, crits, aggro, effects) preserved, just restructured for bulk resolution
- Both engine rework and narrative layer in Phase 30 (tightly coupled, can't narrate rounds without round-based resolution)

### Narration Granularity
- LLM narrates key moments only: combat intro, 1-2 mid-combat rounds (batched), and victory/defeat outro
- Cap at 3-4 LLM calls per combat encounter
- Each LLM call covers an entire round's events (all abilities used, damage dealt, effects applied, deaths)
- Combat start gets a narrated introduction (The System describes the enemy and sets the scene)
- Combat end gets a narrated victory or defeat summary
- Not every round gets narration — only qualifying rounds with key events (crits, kills, near-death, significant damage)

### Narrative Delivery Timing
- Mechanical messages still appear instantly for tactical awareness (existing appendPrivateEvent system)
- LLM narration arrives async as supplemental System commentary in the narrative stream (gold/amber styled)
- Server triggers one LLM call per combat round — all group members see the same narration
- Narration uses typewriter animation (consistent with Phase 25 LLM text handling)
- This model works cleanly for grouped combat: instant mechanical feedback for all participants, shared narration arrives after

### LLM Budget
- Combat narration shares the existing 50/day LLM budget (no separate pool)
- Smart throttling: below 10 remaining calls, combat narration auto-skips to preserve budget for player-triggered features (NPC conversations, skill generation, world gen)
- In group combat, the LLM call cost is split/rotated across group members
- When budget exhausted or narration skipped: players see mechanical text only, The System goes quiet ("The System has lost interest in your skirmish.")

### Combat Without Narration (Fallback)
- Mechanical text only — no template flavor text, no fake narration
- The System announces it's lost interest once, then stays quiet for the rest of combat
- No player toggle to disable narration for now (simplifies implementation)
- Late-arriving narration: Claude's discretion on staleness handling

### Combat UX — No Floating Panels
- CombatPanel floating overlay is removed entirely
- No sticky combat elements — everything in the narrative stream
- Each round summary displays in the narrative stream with textual HP/mana bars (colored #### blocks) for all enemies and party members
- Round summary is the combat status display — shows who's alive, HP levels, active effects
- During action selection: The System prompts "What will you do?" with abilities and targets listed as clickable options in the narrative
- No floating panels, no action bar during combat — all interactions through narrative stream
- Context action bar (explore destinations, NPCs, look) remains for non-combat only; hidden during combat

### Combat Initiation (Pulling)
- Players initiate combat by clicking enemy names from 'look' output or typing 'attack [name]'
- After clicking/typing: a quick prompt asks "Approach carefully or charge in?" with two clickable options (careful pull vs body pull)
- Group adds announced via narrative message + appearing in next round's status summary

### Target & Ability Selection
- During action selection phase, hotbar abilities displayed inline in the narrative prompt as clickable options (with cooldown status, mana cost)
- Non-hotbarred abilities accessible via typing ability name or "more abilities..." option
- Targets (enemies and allies) listed in the narrative prompt — click to select target, then choose ability
- Ability + target selection order: Claude's discretion
- Ability changeability before round lock: Claude's discretion

### Claude's Discretion
- Enemy action economy (symmetric 1 action vs bosses getting extra actions)
- Solo combat pacing (shorter timer when not in a group)
- Timer presentation details (how countdown is shown alongside The System's narrative prompt)
- Exact textual HP bar format (characters, colors, width)
- Ability + target selection order
- Whether chosen action can be changed before round locks
- Late narration staleness handling

</decisions>

<specifics>
## Specific Ideas

- "Everyone submits their combat action and then the system narrates what happens" — the core vision is collaborative, simultaneous action submission followed by narrated resolution
- Textual HP bars using colored `####` characters in the narrative stream — MUD aesthetic, not UI widgets
- The round summary IS the combat UI — no separate status displays needed
- "I want hotbars like subset that we can choose what shows up there" — hotbar configuration/loadout management is a future phase, but the concept of showing a subset of abilities during combat is used here
- Action bar during combat is hidden — combat is purely narrative interaction (clickable text + typing)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `spacetimedb/src/data/llm_prompts.ts`: `buildCombatNarrationPrompt` already defines the sardonic combat narrator voice, damage vocabulary, and JSON response format
- `spacetimedb/src/reducers/combat.ts`: All combat mechanics (damage formulas, scaling, crits, aggro, effects, AI) — restructure for round-based resolution but preserve core logic
- `src/composables/useCombat.ts`: Client combat state management — needs significant rework for round-based model
- `src/composables/useContextActions.ts`: Manages action bar — needs combat-mode hiding
- `src/composables/useLlmProxy.ts`: Client-side LLM proxy for triggering LLM calls
- `HotbarSlot` table: Already tracks player's chosen ability subset — reuse for combat ability display
- `appendPrivateEvent` / `logPrivateAndGroup`: Continue using for instant mechanical messages

### Established Patterns
- LLM flow: reducer creates LlmTask → useLlmProxy handles HTTP → submit_llm_result reducer writes result
- Event log system with typed events (combat, ability, system, quest) and color coding
- Scheduled reducers for tick-based systems (CombatLoopTick, EffectTick, etc.) — will be replaced with round-based resolution
- Narrative console typewriter animation for LLM text

### Integration Points
- `combat_loop` scheduled reducer: Replace with round-based resolution reducer
- `start_combat` / `start_pull` reducers: Keep but modify to initiate round-based combat
- `use_ability` reducer: Restructure to submit action for round rather than immediate execution
- `flee_combat` reducer: Becomes a round action choice
- `CombatPanel.vue`: Delete entirely
- `HotbarPanel.vue`: May need rework or removal (abilities shown in narrative instead)
- `tick_effects` / `tick_hot` / `tick_casts` scheduled reducers: Replace with per-round effect processing
- Effect durations: Convert from seconds/microseconds to round counts

</code_context>

<deferred>
## Deferred Ideas

- Character loadout/hotbar configuration UI (narrative-based equipment and ability management panel) — future phase
- Narrative-based inventory/equipment management — future phase
- Removing remaining floating panels (inventory, stats, etc.) in favor of narrative interaction — future phase

</deferred>

---

*Phase: 30-narrative-combat*
*Context gathered: 2026-03-07*
