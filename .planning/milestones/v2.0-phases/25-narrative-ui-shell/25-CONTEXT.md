# Phase 25: Narrative UI Shell - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Players interact with the game primarily through a narrative chat console that occupies the full viewport. A persistent HUD shows vital stats. Natural language input routes player intent to the correct server action. LLM-generated text appears with animation effects. Existing panels become overlays on top of the console. Character creation flow, world generation display, and combat narration are separate phases that consume this shell.

</domain>

<decisions>
## Implementation Decisions

### Console Layout & Viewport
- Full-viewport fixed background element — replaces LogWindow entirely
- Console is the base layer; all other panels (inventory, stats, map, etc.) float as overlays on top
- Single unified event stream — all event types (combat, whispers, group chat, world, narrative) flow chronologically in one console
- Subtle color tints differentiate event types (damage=red, heal=green, whisper=blue, narrative=gold/white) — no icons, clean MUD aesthetic
- Existing "always-open" panels (travel, hotbar, group) get absorbed or minimized — exact approach at Claude's discretion

### HUD Bar
- Horizontal bar fixed across the top of the viewport
- Always shows: character name + level, HP bar, mana bar, combat state indicator
- Location name is NOT in the HUD — communicated through narrative text instead
- Panel access (inventory, stats, map, etc.) must be intuitive, easy to find, and not cluttered — exact approach at Claude's discretion (compact icon row, keyboard shortcuts, or similar)

### Natural Language Input Routing
- Natural language is the primary input method for players
- Slash commands remain as admin/power-user tools only — not the expected player interaction
- Server-side intent parsing: client sends raw text to a single `submit_intent` reducer, server parses and routes to the appropriate action
- Unrecognized input: the System narrator responds sardonically but also suggests valid actions (helpful hint + narrator tone)
- Context-aware action bar appears above the input area, adapting to situation:
  - Combat: shows available abilities as clickable buttons (compact bar)
  - Exploration: shows available directions, look, interact options
  - NPC dialogue: shows conversation options
- Players can click action buttons OR type equivalent text — both work
- Action bar info density (cooldowns, mana costs, etc.): Claude's discretion
- Input placeholder text context-awareness: Claude's discretion

### Typewriter & LLM Indicators
- LLM-generated narrative text uses sentence-by-sentence fade animation (each sentence fades in as a unit with brief delay between)
- Click or keypress skips animation and reveals all text instantly
- During pending LLM requests: inline pulsing indicator in the console (e.g., "The System is considering your fate...")
- LLM narrative text gets distinct visual styling — separate from regular game events (gold/amber color, italic, subtle accent border, or similar)
- Input is blocked/disabled while typewriter animation plays — skipping re-enables input immediately

### Claude's Discretion
- Exact approach for absorbing always-open panels (travel, hotbar, group) into the new layout
- Panel access button design and placement (icon row, shortcuts, etc.)
- Action bar info density (cooldown timers, mana costs inline vs. hover)
- Context-aware input placeholder text
- Console max history length and scroll behavior
- Exact typewriter animation timing (delay between sentences)
- LLM text styling details (gold vs amber, italic vs accent border)

</decisions>

<specifics>
## Specific Ideas

- Player wants panel access to be "intuitive without getting in the way, and without being painful to find and use"
- Combat ability discovery is a key concern — players need to know what actions they can take without memorizing ability names. The compact action bar with clickable buttons solves this while keeping the narrative feel
- The action bar is not just for combat — it's a general-purpose contextual hint system that adapts to exploration, dialogue, and combat
- Slash commands become admin/debug tools, not the player-facing interface

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useEvents.ts`: Event merging and sorting logic (world/location/private/group) — core data source for the console, can be extended for LLM event types
- `useLlm.ts`: LLM processing state tracking (isProcessing, pendingDomain) — drives the "considering..." indicator
- `usePanelManager.ts`: Floating panel system with drag/resize/z-index — continues to manage overlay panels
- `FloatingPanel.vue`: Generic panel wrapper — reused for all overlay panels
- `useCommands.ts`: Slash command parsing — retains admin commands, NL routing replaces the default path

### Established Patterns
- Events use `{ id, createdAt, kind, message, scope }` shape — new event types (LLM narrative) should follow this
- Panel state persists via localStorage + server sync — new layout should use the same persistence pattern
- `window.__db_conn` global for reducer calls — context-aware action bar will use this
- `[bracketed keywords]` in event messages are already clickable (LogWindow) — action bar extends this pattern

### Integration Points
- `LogWindow.vue` — replaced by NarrativeConsole component
- `CommandBar.vue` — evolved into NL input bar with context-aware action bar
- `useCommands.submitCommand()` — client-side routing replaced by server-side `submit_intent` reducer
- `AppHeader.vue` / `ActionBar.vue` — may be absorbed into HUD bar
- `usePanelManager` defaults — layout defaults change (log panel no longer exists as floating panel)
- LLM request status from Phase 24 tables — drives inline "considering..." indicator

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 25-narrative-ui-shell*
*Context gathered: 2026-03-07*
