# Phase 26: Narrative Character Creation - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

New players experience character creation as a guided narrative conversation with the System. The player describes a fantasy race in freeform text, chooses Warrior or Mystic archetype, and receives a unique LLM-generated class with stats and starting abilities. All creation state persists server-side. This replaces the legacy CharacterPanel form entirely. World generation, combat narration, and skill progression are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Creation Flow
- System opens with a cold open narration — sardonic monologue, no player input needed to start
- Flow sequence: greeting → race description (freeform text) → archetype choice → class reveal → ability pick → naming
- Character naming happens AFTER the narrative flow completes — a final "sign here" moment before entering the world
- Player enters NarrativeConsole immediately on login with no character — no intermediary screen, immersive from first moment
- Archetype choice (Warrior/Mystic): player types it out, or clicks inline links in the narrative text — NOT buttons in the action bar
- Race prompt guidance level: Claude's Discretion

### Going-Back Warnings
- Players CAN go back on choices — warn dramatically ("you may never see this class again") then allow it
- Going back is type-based — player types "go back", "start over", "I changed my mind" etc., intent system recognizes it
- Player can go back to ANY previous step (race, archetype, etc.) — server tracks current creation step and rewinds
- Going back costs a daily budget call — re-generation uses LLM calls, not free re-rolls
- Previously generated content IS lost on going back — new LLM call produces something different

### Generated Class Presentation
- Class reveal shows BOTH narrative flavor text AND concrete mechanical stats (+2 STR, spell damage bonus, etc.)
- Starting ability choice: pick 1 from 3 LLM-generated abilities (consistent with planned SKILL-01 pattern)
- Starting abilities show both narrative description AND stat blocks (damage, cooldown, effect)
- Ability selection: type the ability name or click it as an inline link in the narrative text

### Player Model
- One character per player — no multi-character support
- To create a new character, player must delete their current character first
- Clean break from legacy — legacy characters with fixed races/classes are incompatible with v2.0
- Legacy CharacterPanel (race dropdown, class dropdown) is replaced entirely by narrative flow

### Claude's Discretion
- How much guidance the System gives before race description (minimal nudge vs explicit invitation)
- Exact sardonic tone and personality of each System message during creation
- Server-side creation state table design (steps, fields, persistence approach)
- How the System acknowledges a player returning after deleting a character
- LLM prompt structure for race interpretation, class generation, and ability generation
- Mechanical stat ranges and balance for generated classes/abilities

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useLlm.ts`: `requestGeneration(domain, model, prompt)` — drives LLM calls with `character_creation` domain already registered
- `NarrativeConsole.vue`: Full-viewport narrative display with typewriter animation, "considering..." indicator, inline links
- `NarrativeInput.vue`: Text input with context actions — handles both typing and click-based interaction
- `useNarrativeAnimation.ts`: Sentence-by-sentence fade animation for LLM text
- `submit_intent` reducer: Server-side NL input routing — extend for creation-flow intents
- `validate_llm_request` reducer: Budget checking, concurrency, domain validation — `character_creation` domain already whitelisted
- `useCharacterCreation.ts`: Legacy composable (form-based) — will be replaced, but the `createCharacter` reducer call pattern can be referenced

### Established Patterns
- Events use `{ id, createdAt, kind, message, scope }` shape — creation narrative events should follow this
- LLM pipeline: reducer validates → procedure calls API → result stored/evented
- `[bracketed keywords]` in event messages are clickable — use for archetype and ability choices
- `fail(ctx, character, message)` for player-visible errors with sardonic tone

### Integration Points
- `App.vue` line 33: `v-if="!selectedCharacter"` — currently shows CharacterPanel, needs to show narrative creation instead
- `App.vue` line 56: `v-else` game world — creation flow must produce a selectedCharacter before this renders
- Character table: currently has `raceId` (FK) and `className` (string) — LLM-generated content needs new/modified storage (freeform race description, generated class name, generated class description, stats)
- `useLlm.ts` TODO: procedure auto-triggering not yet implemented — creation flow needs this working

</code_context>

<specifics>
## Specific Ideas

- Inline clickable links in narrative text for choices (archetype, abilities) — not separate UI buttons. Keeps the conversation feeling like a conversation.
- The warning when going back should feel dramatic and in-character — the System lamenting the loss of something unique, not a generic confirmation dialog
- Per PROJECT.md: "Wild class generation (no guardrails on naming/theme)" — the LLM should be genuinely creative, not producing standard fantasy classes
- Per PROJECT.md: "Uniqueness over balance by design decision" — stats don't need to be perfectly balanced
- Sonnet model for class generation (high-stakes one-time generation, per Phase 24 decision)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 26-narrative-character-creation*
*Context gathered: 2026-03-07*
