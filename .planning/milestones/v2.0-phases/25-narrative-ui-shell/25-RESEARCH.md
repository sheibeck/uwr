# Phase 25: Narrative UI Shell - Research

**Researched:** 2026-03-07
**Domain:** Vue 3 UI architecture, full-viewport narrative console, natural language intent routing
**Confidence:** HIGH

## Summary

Phase 25 transforms the game's UI from a floating-panel-centric layout (with LogWindow as one panel among many) into a full-viewport narrative console as the primary interface. The existing codebase provides solid foundations: `useEvents.ts` already merges and sorts all event types, `usePanelManager.ts` manages floating overlay panels, and `useLlm.ts` tracks LLM processing state. The main work is: (1) replacing LogWindow with a full-viewport NarrativeConsole, (2) building a HUD bar, (3) creating a server-side `submit_intent` reducer for natural language routing, (4) building a context-aware action bar, and (5) implementing typewriter animation for LLM text.

The project uses Vue 3.5 with Composition API, inline reactive styles (no CSS framework), and SpacetimeDB for real-time data. All existing composables follow the pattern of receiving refs and returning computed/methods. No new libraries are needed -- this is pure Vue component work plus one new server reducer.

**Primary recommendation:** Build in three waves: (1) layout restructure (console + HUD + panel overlays), (2) server-side intent routing + context-aware action bar, (3) typewriter animation + LLM indicators.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Full-viewport fixed background element -- replaces LogWindow entirely
- Console is the base layer; all other panels float as overlays on top
- Single unified event stream -- all event types flow chronologically in one console
- Subtle color tints differentiate event types (damage=red, heal=green, whisper=blue, narrative=gold/white) -- no icons, clean MUD aesthetic
- Horizontal HUD bar fixed across the top of the viewport
- HUD always shows: character name + level, HP bar, mana bar, combat state indicator
- Location name is NOT in the HUD -- communicated through narrative text instead
- Natural language is the primary input method for players
- Slash commands remain as admin/power-user tools only
- Server-side intent parsing: client sends raw text to a single `submit_intent` reducer, server parses and routes
- Unrecognized input: the System narrator responds sardonically but also suggests valid actions
- Context-aware action bar appears above the input area, adapting to situation (combat/exploration/dialogue)
- Players can click action buttons OR type equivalent text
- LLM-generated narrative text uses sentence-by-sentence fade animation
- Click or keypress skips animation and reveals all text instantly
- During pending LLM requests: inline pulsing indicator in the console
- LLM narrative text gets distinct visual styling
- Input is blocked/disabled while typewriter animation plays -- skipping re-enables input immediately

### Claude's Discretion
- Exact approach for absorbing always-open panels (travel, hotbar, group) into the new layout
- Panel access button design and placement (icon row, shortcuts, etc.)
- Action bar info density (cooldown timers, mana costs inline vs. hover)
- Context-aware input placeholder text
- Console max history length and scroll behavior
- Exact typewriter animation timing (delay between sentences)
- LLM text styling details (gold vs amber, italic vs accent border)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UI-01 | Primary interface is a narrative chat console (evolved from LogWindow) | NarrativeConsole component replaces LogWindow as full-viewport fixed element. Reuses `useEvents.ts` combined event stream. |
| UI-02 | Persistent HUD shows HP/mana, combat state at all times | HUD bar component fixed to top. Reads character reactive data. Location excluded per user decision. |
| UI-03 | Natural language intent service routes player text to appropriate reducers | New `submit_intent` server reducer with keyword/pattern matching. Client sends raw text instead of client-side routing. |
| UI-04 | Existing panels accessible as overlays on the narrative console | `usePanelManager` + `FloatingPanel` already handle this. Layout defaults change, remove always-open panels from fixed positions. |
| UI-05 | LLM-generated text displays with typewriter animation | Sentence-by-sentence CSS fade animation on events with LLM kind. Skip on click/keypress. |
| UI-06 | "The System is considering..." indicator during LLM processing | `useLlm.isProcessing` drives inline pulsing indicator inserted into console stream. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vue 3 | 3.5.x | Component framework | Already in use, Composition API throughout |
| SpacetimeDB SDK | 2.0.x | Real-time data, reducers | Already in use, all server communication |
| Vite | 6.4.x | Build tool | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | - | - | All requirements achievable with existing stack |

No new dependencies needed. The typewriter animation uses CSS transitions/animations. The intent parser is pure string matching on the server.

## Architecture Patterns

### Recommended Component Structure
```
src/
  components/
    NarrativeConsole.vue     # Full-viewport event stream (replaces LogWindow)
    NarrativeHud.vue         # Fixed top bar (HP, mana, combat, panel buttons)
    NarrativeInput.vue       # Input bar + context-aware action bar (replaces CommandBar)
    NarrativeMessage.vue     # Single message renderer (handles typewriter, colors, keywords)
  composables/
    useEvents.ts             # EXISTING - extend with LLM event type support
    useCommands.ts           # EXISTING - simplify to just call submit_intent + retain admin slash commands
    useLlm.ts                # EXISTING - drives "considering" indicator
    useNarrativeAnimation.ts # NEW - typewriter state machine per-message
    useContextActions.ts     # NEW - derives available actions from game state (combat/explore/dialogue)
    usePanelManager.ts       # EXISTING - layout defaults change, remove always-open panels
```

### Pattern 1: Full-Viewport Console as Base Layer
**What:** NarrativeConsole is a `position: fixed; inset: 0` element that replaces the floating LogWindow panel. All other panels render on top with higher z-index via the existing FloatingPanel system.
**When to use:** This is the only layout pattern for the game world view.
**Key implementation detail:**
```typescript
// NarrativeConsole sits behind everything, full viewport
const consoleStyle = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  background: '#0a0a0f',  // Dark background matching MUD aesthetic
  zIndex: 1,  // Base layer, panels are z-index 10+
};

// HUD bar at top, console body fills remaining space, input at bottom
// Template: <HUD /> <scrollable-events /> <action-bar /> <input />
```

### Pattern 2: Server-Side Intent Routing
**What:** A single `submit_intent` reducer receives raw text, pattern-matches to determine the action, and dispatches to the appropriate internal handler. This replaces the client-side `useCommands.ts` routing.
**When to use:** All non-slash-command player input.
**Key design:**
```typescript
// Server-side pattern matching in submit_intent reducer
// Priority order:
// 1. Exact command match (look, inventory, stats, camp)
// 2. Direction/travel ("go north", "travel to Ironforge", "north")
// 3. Combat ("attack", "use fireball", "cast heal")
// 4. Social ("say hello", "whisper to Bob hi there")
// 5. NPC interaction ("talk to Vendor", "hail Guard")
// 6. Fallback: sardonic System response + hints

// The reducer calls the same internal functions that existing reducers use
// (e.g., the same moveCharacter logic, the same say logic)
```

### Pattern 3: Context-Aware Action Bar
**What:** A composable (`useContextActions`) inspects game state (combat active? NPCs present? adjacent locations?) and returns a list of available actions as button descriptors.
**When to use:** Rendered above the input bar, adapts to situation.
**Key design:**
```typescript
type ContextAction = {
  label: string;        // Button text ("Attack", "Go North")
  command: string;      // Text to submit ("attack", "go north")
  category: 'combat' | 'explore' | 'social' | 'ability';
  disabled?: boolean;   // e.g., on cooldown
  detail?: string;      // Tooltip: mana cost, cooldown time
};

// Combat context: abilities from hotbar, "flee", target selection
// Exploration: adjacent locations as "Go [direction/name]", "look", NPC names
// Dialogue: active NPC dialogue keywords as buttons
```

### Pattern 4: Typewriter Animation State Machine
**What:** Each LLM-generated message gets a local animation state that controls sentence-by-sentence fade-in. Non-LLM messages render instantly.
**When to use:** Events where `kind` indicates LLM-generated narrative.
**Key design:**
```typescript
// useNarrativeAnimation composable
// Tracks: which messages are animating, how many sentences revealed
// On new LLM event: split into sentences, reveal one at a time with delay
// On click/keypress: reveal all remaining sentences instantly
// After animation complete: mark message as fully revealed

// CSS: each sentence uses opacity transition
// .sentence-enter { opacity: 0; transition: opacity 0.4s ease-in; }
// .sentence-visible { opacity: 1; }
```

### Anti-Patterns to Avoid
- **Duplicating event data for animation state:** Don't copy event objects. Use a separate reactive Map keyed by event ID to track animation progress.
- **Blocking the event stream during animation:** New events should still append and scroll. Only the typewriter message animates; other messages render normally.
- **Client-side intent parsing:** The CONTEXT.md explicitly locks this to server-side. Don't parse natural language on the client.
- **Removing FloatingPanel system:** Keep it intact. Only change is removing the LogWindow panel and adjusting default layouts.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Panel drag/resize/z-index | Custom panel system | Existing `usePanelManager` + `FloatingPanel` | Already battle-tested with server sync |
| Event merging/sorting | Custom event aggregation | Existing `useEvents.ts` | Handles 4 event scopes, local events, session filtering |
| LLM status tracking | Custom polling/state | Existing `useLlm.ts` | Already tracks isProcessing, pendingDomain |
| Sentence splitting | Complex NLP | Simple regex `text.match(/[^.!?]+[.!?]+/g)` | Good enough for game narrative text |

## Common Pitfalls

### Pitfall 1: Scroll Position Management
**What goes wrong:** Auto-scrolling to bottom on every new event breaks manual scrollback. Existing LogWindow already handles this with `isAtBottom` tracking, but the full-viewport console changes the scroll container.
**Why it happens:** The scroll container changes from a panel body to a flex-grow div inside a fixed layout.
**How to avoid:** Carry over the `isAtBottom` + `scrollToBottom` pattern from LogWindow. Keep the "New messages" jump button.
**Warning signs:** Users report being snapped to bottom while reading old messages.

### Pitfall 2: Panel Z-Index Conflicts with Console
**What goes wrong:** Console sits at z-index 1, but panels start at 10. If the HUD or input bar doesn't have proper z-index, panels can render behind them.
**Why it happens:** The HUD and input bar are part of the console (z-index 1) but need to be above panels.
**How to avoid:** HUD bar gets z-index higher than the panel max (e.g., 10000). Input bar similarly. Or: make HUD/input siblings of the panel container, not children of the console.
**Warning signs:** HUD disappears behind opened panels.

### Pitfall 3: Always-Open Panels Removal
**What goes wrong:** `usePanelManager` force-opens log, travel, hotbar, group panels on load (lines 167-170, 477-480). Removing these without updating the logic causes errors or reverts.
**Why it happens:** Multiple places enforce always-open: `loadFromStorage`, server sync handler, `getDefaultLayout`.
**How to avoid:** Remove the log panel from `getDefaultLayout` and `usePanelManager` entirely. Travel/hotbar/group functionality moves to the context-aware action bar. Keep their panel definitions but don't force-open.
**Warning signs:** Panels reopen on page refresh despite being removed from the layout.

### Pitfall 4: Input Blocking During Animation
**What goes wrong:** If input is disabled during typewriter animation and the animation breaks (component unmount, error), input stays permanently disabled.
**Why it happens:** State management bug where `isAnimating` never resets.
**How to avoid:** Use a watchEffect cleanup or timeout fallback. Never let animation block input for more than ~10 seconds max.
**Warning signs:** Input field stays grayed out after animation should have completed.

### Pitfall 5: submit_intent Reducer Scope Creep
**What goes wrong:** The intent reducer tries to handle too many cases and becomes unmaintainable.
**Why it happens:** Natural language parsing is inherently ambiguous.
**How to avoid:** Start with a small set of recognized patterns (10-15 core actions). Use existing reducer internal functions. Unrecognized input gets the sardonic System response. Future phases can expand the parser.
**Warning signs:** The reducer grows past 300 lines with many regex patterns.

## Code Examples

### Example 1: NarrativeConsole Layout Structure
```vue
<!-- NarrativeConsole.vue - full viewport base layer -->
<template>
  <div :style="consoleStyle">
    <NarrativeHud :character="selectedCharacter" :combat="activeCombat" />

    <div ref="scrollEl" :style="scrollAreaStyle" @scroll="checkIfAtBottom">
      <NarrativeMessage
        v-for="event in combinedEvents"
        :key="`${event.scope}-${event.id}`"
        :event="event"
        :is-llm="isLlmEvent(event)"
        :animation-state="animationStates.get(event.id)"
      />
      <!-- Inline LLM processing indicator -->
      <div v-if="isLlmProcessing" :style="consideringStyle">
        The System is considering your fate...
      </div>
    </div>

    <div v-if="!isAtBottom" :style="jumpBtnStyle" @click="jumpToBottom">
      New messages
    </div>

    <NarrativeInput
      :disabled="isAnimating"
      :context-actions="contextActions"
      :placeholder="inputPlaceholder"
      @submit="onSubmit"
      @skip-animation="skipAnimation"
    />
  </div>
</template>
```

### Example 2: Context Action Bar
```typescript
// useContextActions.ts
export function useContextActions(deps: {
  selectedCharacter: Ref<Character | null>;
  activeCombat: Ref<CombatEncounter | null>;
  adjacentLocations: Ref<Location[]>;
  npcsHere: Ref<Npc[]>;
  hotbarDisplay: Ref<HotbarDisplaySlot[]>;
}) {
  return computed<ContextAction[]>(() => {
    const actions: ContextAction[] = [];
    const char = deps.selectedCharacter.value;
    if (!char) return actions;

    if (deps.activeCombat.value) {
      // Combat context: abilities from hotbar
      for (const slot of deps.hotbarDisplay.value) {
        if (!slot.abilityKey) continue;
        actions.push({
          label: slot.name,
          command: `use ${slot.name.toLowerCase()}`,
          category: 'ability',
          disabled: slot.cooldownRemaining > 0,
          detail: slot.cooldownRemaining > 0 ? `${slot.cooldownRemaining}s` : undefined,
        });
      }
    } else {
      // Exploration: adjacent locations
      for (const loc of deps.adjacentLocations.value) {
        actions.push({
          label: loc.name,
          command: `go ${loc.name.toLowerCase()}`,
          category: 'explore',
        });
      }
      // NPCs present
      for (const npc of deps.npcsHere.value) {
        actions.push({
          label: `Talk to ${npc.name}`,
          command: `hail ${npc.name.toLowerCase()}`,
          category: 'social',
        });
      }
      actions.push({ label: 'Look', command: 'look', category: 'explore' });
    }
    return actions;
  });
}
```

### Example 3: Server-Side Intent Parser Structure
```typescript
// In submit_intent reducer
spacetimedb.reducer('submit_intent', { characterId: t.u64(), text: t.string() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  const raw = args.text.trim();
  const lower = raw.toLowerCase();

  // Admin slash commands pass through to existing handling
  if (lower.startsWith('/')) {
    // Route to existing submit_command logic
    return;
  }

  // Intent matching (order matters -- more specific first)
  if (lower === 'look') { /* existing look logic */ return; }
  if (lower.match(/^go\s+(.+)$/i)) { /* travel logic */ return; }
  if (lower.match(/^(attack|fight|kill)\s*(.*)$/i)) { /* combat engage */ return; }
  if (lower.match(/^use\s+(.+)$/i)) { /* ability use */ return; }
  if (lower.match(/^(talk|hail|speak)\s+(to\s+)?(.+)$/i)) { /* NPC interaction */ return; }
  if (lower.match(/^say\s+(.+)$/i)) { /* chat */ return; }

  // Unrecognized -- sardonic System response
  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
    `The System stares at you blankly. "${raw}"? Perhaps try "look", "go [place]", or "attack".`);
});
```

### Example 4: Typewriter Animation
```typescript
// useNarrativeAnimation.ts
export function useNarrativeAnimation() {
  const animating = ref<Map<string, { sentences: string[]; revealed: number; complete: boolean }>>(new Map());
  const isAnimating = computed(() => {
    for (const state of animating.value.values()) {
      if (!state.complete) return true;
    }
    return false;
  });

  function startAnimation(eventId: string, text: string) {
    const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
    animating.value.set(eventId, { sentences, revealed: 0, complete: false });
    revealNext(eventId);
  }

  function revealNext(eventId: string) {
    const state = animating.value.get(eventId);
    if (!state || state.complete) return;
    state.revealed++;
    if (state.revealed >= state.sentences.length) {
      state.complete = true;
    } else {
      setTimeout(() => revealNext(eventId), 300); // 300ms between sentences
    }
  }

  function skipAll() {
    for (const [id, state] of animating.value.entries()) {
      state.revealed = state.sentences.length;
      state.complete = true;
    }
  }

  return { animating, isAnimating, startAnimation, skipAll };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| LogWindow as floating panel | Full-viewport narrative console | This phase | Console becomes the game's primary interface |
| Client-side command routing (useCommands.ts) | Server-side intent parsing (submit_intent) | This phase | Natural language becomes primary input |
| Slash commands as primary input | Slash commands as admin-only | This phase | Players type natural language instead |
| Always-open travel/hotbar/group panels | Context-aware action bar | This phase | Cleaner layout, information appears when relevant |

**Important compatibility notes:**
- The `submit_command` reducer still exists and handles `look`, `hail`, admin commands. The new `submit_intent` can delegate to the same internal functions.
- The existing `useCommands.ts` handles many slash commands client-side. For Phase 25, the client should: (1) check if input starts with `/` -- if so, keep existing client-side routing for admin commands, (2) otherwise, send to `submit_intent` reducer.
- `usePanelManager.ts` lines 167-170 and 477-480 force-open log/travel/hotbar/group. These need updating but not removal of the panel manager itself.

## Open Questions

1. **LLM event type identification**
   - What we know: Events have `kind` field (damage, heal, whisper, command, system, etc.) and `scope` (world, location, private, group, client)
   - What's unclear: There's no existing `kind` value for LLM-generated narrative. Need to define one (e.g., `kind: 'narrative'` or `kind: 'llm'`).
   - Recommendation: Add `kind: 'narrative'` for LLM-generated events. The `submit_intent` reducer's sardonic responses should use `kind: 'system'` since they're game engine responses, not LLM.

2. **Travel intent resolution**
   - What we know: `move_character` takes a `locationId` (bigint). Natural language says "go north" or "go to Ironforge".
   - What's unclear: How to resolve location names to IDs on the server. Locations have names but the server needs to look up adjacent locations by name.
   - Recommendation: In `submit_intent`, query adjacent locations for the character's current location, fuzzy-match by name. This data is already available server-side via `location_connection` table.

3. **Ability intent resolution**
   - What we know: Abilities are invoked by `abilityKey` string. Players will type "use fireball" or just "fireball".
   - What's unclear: Whether to match against the character's known abilities or all abilities.
   - Recommendation: Match against the character's hotbar + available abilities only. Use case-insensitive name matching.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `useEvents.ts`, `usePanelManager.ts`, `useLlm.ts`, `useCommands.ts`, `LogWindow.vue`, `CommandBar.vue`, `ActionBar.vue`, `App.vue`, `FloatingPanel.vue`
- Server reducers: `commands.ts` (submit_command, say, hail_npc), `movement.ts` (move_character), `llm.ts` (validate_llm_request)
- CONTEXT.md: User decisions locked for this phase

### Secondary (MEDIUM confidence)
- Vue 3.5 Composition API patterns (well-established, matches existing codebase patterns)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries, existing Vue 3 + SpacetimeDB stack
- Architecture: HIGH - Clear component decomposition following existing patterns
- Pitfalls: HIGH - Identified from direct codebase inspection of panel manager, event system, scroll handling
- Intent routing: MEDIUM - Server-side pattern matching design is straightforward but the exact set of recognized patterns needs iteration

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable -- no external dependency changes)
