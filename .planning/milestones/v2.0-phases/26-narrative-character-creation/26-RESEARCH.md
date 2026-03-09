# Phase 26: Narrative Character Creation - Research

**Researched:** 2026-03-07
**Domain:** SpacetimeDB server-side state machine + LLM integration + Vue narrative UI
**Confidence:** HIGH

## Summary

This phase replaces the legacy form-based CharacterPanel with an immersive narrative conversation driven by the System narrator. The architecture is a server-side state machine (new `CharacterCreationState` table) that tracks which step the player is on, with LLM calls generating race interpretation, class identity, and starting abilities. The client routes players without a character into the NarrativeConsole, which displays creation narrative events and accepts freeform text input.

The core challenge is bridging the existing LLM pipeline (validate reducer -> procedure -> result) with a multi-step creation flow where each step depends on the previous step's LLM output. The `useLlm.ts` composable currently has a TODO for auto-triggering -- the procedure must be called after the validate reducer commits. This is the critical gap that must be solved for this phase.

**Primary recommendation:** Build a server-side creation state table with step enum, store all LLM results as JSON strings in the state row, and use the event_private system to push narrative messages to the player. The client should NOT orchestrate the multi-step flow -- the server should own the state machine entirely.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- System opens with a cold open narration -- sardonic monologue, no player input needed to start
- Flow sequence: greeting -> race description (freeform text) -> archetype choice -> class reveal -> ability pick -> naming
- Character naming happens AFTER the narrative flow completes -- a final "sign here" moment before entering the world
- Player enters NarrativeConsole immediately on login with no character -- no intermediary screen, immersive from first moment
- Archetype choice (Warrior/Mystic): player types it out, or clicks inline links in the narrative text -- NOT buttons in the action bar
- Players CAN go back on choices -- warn dramatically ("you may never see this class again") then allow it
- Going back is type-based -- player types "go back", "start over", "I changed my mind" etc., intent system recognizes it
- Player can go back to ANY previous step (race, archetype, etc.) -- server tracks current creation step and rewinds
- Going back costs a daily budget call -- re-generation uses LLM calls, not free re-rolls
- Previously generated content IS lost on going back -- new LLM call produces something different
- Class reveal shows BOTH narrative flavor text AND concrete mechanical stats (+2 STR, spell damage bonus, etc.)
- Starting ability choice: pick 1 from 3 LLM-generated abilities (consistent with planned SKILL-01 pattern)
- Starting abilities show both narrative description AND stat blocks (damage, cooldown, effect)
- Ability selection: type the ability name or click it as an inline link in the narrative text
- One character per player -- no multi-character support
- To create a new character, player must delete their current character first
- Clean break from legacy -- legacy characters with fixed races/classes are incompatible with v2.0
- Legacy CharacterPanel (race dropdown, class dropdown) is replaced entirely by narrative flow
- Sonnet model for class generation (high-stakes one-time generation, per Phase 24 decision)

### Claude's Discretion
- How much guidance the System gives before race description (minimal nudge vs explicit invitation)
- Exact sardonic tone and personality of each System message during creation
- Server-side creation state table design (steps, fields, persistence approach)
- How the System acknowledges a player returning after deleting a character
- LLM prompt structure for race interpretation, class generation, and ability generation
- Mechanical stat ranges and balance for generated classes/abilities

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHAR-01 | Player enters a narrative holding space and converses with the System | Server-side state machine + event_private messages; App.vue routing to NarrativeConsole for players without characters |
| CHAR-02 | Player describes any fantasy race in freeform text; LLM interprets and normalizes it | New creation-specific reducer handles freeform text, triggers LLM with race interpretation prompt; result stored in creation state |
| CHAR-03 | Player chooses Warrior or Mystic archetype | Intent recognition in creation reducer (typed or clicked via [Warrior]/[Mystic] inline links) |
| CHAR-04 | LLM generates a unique class from race + archetype with wild creativity | Sonnet call with race + archetype context; JSON schema for class name, description, stats, and 3 abilities |
| CHAR-05 | Going back on a decision is warned -- "you may never see this class again" | Server checks creation step, emits dramatic warning event, allows rewind on confirmation |
| CHAR-06 | Player receives class description with niche overview, then chooses a starting ability | LLM output includes 3 abilities with stat blocks; selection via typed name or inline link click |
| CHAR-07 | All creation state persists server-side (page refresh doesn't lose progress) | CharacterCreationState table with all accumulated LLM results; client reconstructs display from server state on reconnect |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SpacetimeDB TS SDK | 1.11.x | Server-side tables, reducers, procedures | Project foundation |
| Vue 3 | 3.x | Client UI framework | Project standard |
| spacetimedb/react (vue equiv) | 1.11.x | useTable, subscriptions | Project standard |

### No New Libraries Needed
This phase builds entirely on existing infrastructure. No new dependencies.

## Architecture Patterns

### Server-Side State Machine

The creation flow is a server-side state machine with these steps:

```
GREETING -> AWAITING_RACE -> RACE_CONFIRMED -> AWAITING_ARCHETYPE ->
ARCHETYPE_CONFIRMED -> GENERATING_CLASS -> CLASS_REVEALED ->
AWAITING_ABILITY -> ABILITY_CHOSEN -> AWAITING_NAME -> COMPLETE
```

New table: `CharacterCreationState`
```typescript
export const CharacterCreationState = table(
  {
    name: 'character_creation_state',
    public: true,  // Client needs to read step + generated content
    indexes: [
      { accessor: 'by_player', algorithm: 'btree', columns: ['playerId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    playerId: t.identity(),
    step: t.string(),              // Current step enum
    raceDescription: t.string().optional(),    // Player's freeform race text
    raceName: t.string().optional(),           // LLM-interpreted race name
    raceNarrative: t.string().optional(),      // LLM narrative about the race
    raceBonuses: t.string().optional(),        // JSON: stat bonuses from race
    archetype: t.string().optional(),          // 'warrior' or 'mystic'
    className: t.string().optional(),          // LLM-generated class name
    classDescription: t.string().optional(),   // LLM narrative about the class
    classStats: t.string().optional(),         // JSON: stat modifiers
    abilities: t.string().optional(),          // JSON: array of 3 generated abilities
    chosenAbilityIndex: t.u64().optional(),    // 0, 1, or 2
    characterName: t.string().optional(),      // Final chosen name
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);
```

### Creation Flow Reducer Pattern

A single `submit_creation_input` reducer handles ALL creation-step inputs:

```typescript
spacetimedb.reducer('submit_creation_input', {
  text: t.string(),
}, (ctx, { text }) => {
  const state = [...ctx.db.characterCreationState.by_player.filter(ctx.sender)][0];
  if (!state) { /* create initial state, emit greeting */ }

  const lower = text.trim().toLowerCase();

  // Check for go-back intent at any step
  if (isGoBackIntent(lower)) {
    handleGoBack(ctx, state);
    return;
  }

  switch (state.step) {
    case 'AWAITING_RACE':
      // Store race text, create LLM request for race interpretation
      break;
    case 'AWAITING_ARCHETYPE':
      // Validate warrior/mystic, create LLM request for class generation
      break;
    case 'CLASS_REVEALED':
      // This step waits for ability choice -- parse ability name
      break;
    case 'AWAITING_NAME':
      // Validate name, finalize character
      break;
  }
});
```

### LLM Pipeline Integration (Critical Gap)

The current LLM pipeline has a gap: `useLlm.ts` calls `validateLlmRequest` reducer but the procedure `call_llm` is NOT auto-triggered. The TODO in `useLlm.ts` line 72 explicitly notes this.

**Solution for this phase:** After the `validate_llm_request` reducer creates the pending request, the creation reducer should store enough state that a NEW reducer (or extending the procedure call) can be triggered. Two approaches:

**Option A (Recommended): Server-side auto-trigger via scheduled reducer**
After `validate_llm_request` commits, schedule an immediate `process_llm_request` tick that calls the procedure internally. This keeps the flow entirely server-side.

**Option B: Client-side procedure call**
The client calls `call_llm` procedure after `validateLlmRequest` succeeds. This requires the client to know the requestId, which it can't easily get since `llm_request` is private.

**Option C: Inline the LLM call in the creation reducer flow**
Since creation needs specific handling anyway, bypass the generic LLM pipeline for creation and call the procedure directly from a creation-specific procedure.

**Recommendation:** Option A or C. The creation flow is complex enough to warrant its own procedure that handles the full step (validate -> call API -> store result -> emit events) rather than piggybacking on the generic pipeline.

### Client Routing

```
App.vue decision tree:
1. Not logged in -> SplashScreen
2. Logged in, no character, no creation state -> Start creation (emit greeting)
3. Logged in, no character, has creation state -> Resume creation at current step
4. Logged in, has character -> Game world (NarrativeConsole + panels)
```

The key change in App.vue: replace the `CharacterPanel` block (lines 33-53) with the NarrativeConsole in creation mode. The NarrativeConsole is already full-viewport -- it just needs to be shown during creation too, with creation events instead of game events.

### Event Flow for Creation

Creation uses `event_private` with a new kind `'creation'` to push narrative messages:
- Greeting monologue: system emits event_private with kind='creation'
- Race confirmation: LLM result emitted as event_private kind='creation'
- Class reveal: LLM result with [ability names] as clickable keywords
- Warnings: event_private kind='creation' with dramatic go-back warnings

The client filters events by kind to style creation messages differently if needed, though the existing `'narrative'`/`'llm'` kind styling (italic, gold border) works well.

### LLM JSON Schemas for Prompts

#### Race Interpretation
```json
{
  "raceName": "string - short evocative name",
  "narrative": "string - 2-3 sentences of sardonic commentary on this race",
  "bonuses": {
    "primary": { "stat": "str|dex|int|wis|cha", "value": 2 },
    "secondary": { "stat": "str|dex|int|wis|cha", "value": 1 },
    "flavor": "string - one unique racial trait description"
  }
}
```

#### Class Generation (with 3 abilities)
```json
{
  "className": "string - wildly creative class name",
  "classDescription": "string - 2-3 sentences of sardonic class description",
  "archetype": "warrior|mystic",
  "stats": {
    "primaryStat": "str|dex|int|wis|cha",
    "secondaryStat": "str|dex|int|wis|cha|none",
    "bonusHp": 0,
    "bonusMana": 0,
    "armorProficiency": "cloth|leather|chain|plate",
    "usesMana": true
  },
  "abilities": [
    {
      "name": "string - evocative ability name",
      "description": "string - sardonic description",
      "damageType": "physical|fire|ice|lightning|shadow|holy|nature|arcane",
      "baseDamage": 10,
      "cooldownSeconds": 6,
      "manaCost": 5,
      "effect": "none|dot|heal|buff|debuff|stun",
      "effectDuration": 0
    }
  ]
}
```

### Mapping LLM Stats to Character Table

The Character table uses fixed stats (str, dex, int, wis, cha) and has `className` and `race` as strings. For v2.0 LLM-generated characters:

- `race`: Store the LLM-generated `raceName` (string, already compatible)
- `className`: Store the LLM-generated `className` (string, already compatible)
- Base stats: Compute from LLM JSON `stats.primaryStat`/`secondaryStat` using existing `computeBaseStats` logic, OR use LLM-provided values directly
- The `raceDescription` and `classDescription` need storage -- either on the Character table (new optional columns) or in the CharacterCreationState (kept after completion)

**Recommendation:** Add optional `raceDescription` and `classDescription` string columns to Character table. These are display-only (shown in character info panels) and don't affect combat math.

### Stat Computation for Generated Classes

The existing `computeBaseStats(className, level)` in `class_stats.ts` uses a hardcoded `CLASS_CONFIG` lookup. For LLM-generated classes, this won't work -- the class name won't be in the lookup table.

**Solution:** The LLM output specifies `primaryStat` and `secondaryStat`. At character creation time, register the generated class in `CLASS_CONFIG` dynamically (not practical with the current hardcoded map), OR compute base stats inline using the same formula:

```typescript
// For LLM-generated classes, apply the same formula as computeBaseStats
// but using the LLM-provided primary/secondary stats
const BASE_STAT = 8n;
const PRIMARY_BONUS = 4n;
const SECONDARY_BONUS = 2n;

stats.str = BASE_STAT + (primary === 'str' ? PRIMARY_BONUS : 0n) + (secondary === 'str' ? SECONDARY_BONUS : 0n);
// ... etc for each stat
```

Then `recomputeCharacterDerived` handles maxHp, maxMana, etc. from base stats + equipment. The `normalizeClassName` function will need a fallback for unknown classes -- currently it lowercases and matches against the known list. For generated classes, it should pass through as-is.

### Go-Back Intent Recognition

```typescript
function isGoBackIntent(text: string): boolean {
  const patterns = [
    'go back', 'start over', 'redo', 'changed my mind',
    'try again', 'wait no', 'actually', 'undo',
    'i want to change', 'let me change', 'different',
  ];
  return patterns.some(p => text.includes(p));
}
```

### Inline Link Clicks

The existing `[bracketed keyword]` pattern in NarrativeMessage.vue makes text clickable via `window.clickNpcKeyword`. This function is currently undefined (the `onclick` handler references it but there's no implementation). For creation:

1. The LLM output for archetype choice includes `[Warrior]` and `[Mystic]` in the narrative text
2. The LLM output for ability choice includes `[Ability Name 1]`, `[Ability Name 2]`, `[Ability Name 3]`
3. When clicked, `window.clickNpcKeyword` should submit the keyword as input text to `submit_creation_input`

**Implementation:** Define `window.clickNpcKeyword` in App.vue or the creation composable to call the submit reducer with the clicked keyword text.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM API calls | Custom HTTP client | Existing `call_llm` procedure + `buildAnthropicRequest` | Already handles retries, error handling, budget |
| Narrative display | Custom creation UI | Existing NarrativeConsole + NarrativeMessage | Already handles typewriter animation, keyword links, styling |
| Event system | Custom creation events | Existing `event_private` table + `appendPrivateEvent` | Already subscribed, rendered, animated |
| Stat computation | New stat formulas | Existing `computeBaseStats` pattern + `recomputeCharacterDerived` | Maintains consistency with existing combat math |
| Budget tracking | New budget system | Existing `checkBudget`/`incrementBudget` in helpers/llm | Already handles daily resets, concurrency |

## Common Pitfalls

### Pitfall 1: LLM Procedure Auto-Triggering Gap
**What goes wrong:** The `useLlm.ts` composable calls `validateLlmRequest` but never calls the `call_llm` procedure. The TODO on line 72 says "For now, the pipeline validates and creates the request."
**Why it happens:** Phase 24 built the pipeline but deferred client->procedure orchestration.
**How to avoid:** Either build a creation-specific procedure that handles the full flow, or implement the auto-trigger mechanism (scheduled reducer that picks up pending requests).
**Warning signs:** LLM requests stuck in 'pending' status forever.

### Pitfall 2: Race/Class Not in Hardcoded Lookups
**What goes wrong:** `computeBaseStats`, `normalizeClassName`, `isClassAllowed`, `manaStatForClass`, `baseArmorForClass`, `canParry`, etc. all use hardcoded class lists. LLM-generated class names will fail these lookups.
**Why it happens:** v1.0 used fixed classes; v2.0 uses generated ones.
**How to avoid:** All class-lookup functions need a fallback path for unknown classes. The LLM output must include enough mechanical info (uses mana? armor type? stat scaling?) to bypass the hardcoded lookups.
**Warning signs:** Errors on character creation, missing stats, 0 HP/mana.

### Pitfall 3: Creation State Lost on Disconnect
**What goes wrong:** If creation state is client-only, page refresh loses everything.
**Why it happens:** Temptation to manage state in Vue refs.
**How to avoid:** All creation state lives in `CharacterCreationState` table (server-side). Client reads from subscription on reconnect. CHAR-07 explicitly requires this.
**Warning signs:** Blank creation screen after page refresh.

### Pitfall 4: Keyword Click Handler Not Wired
**What goes wrong:** `[bracketed keywords]` render as clickable links but `window.clickNpcKeyword` is undefined -- clicks do nothing.
**Why it happens:** NarrativeMessage.vue renders the onclick but the global handler was never registered.
**How to avoid:** Register `window.clickNpcKeyword` early in App.vue or the creation composable, routing clicks to the appropriate reducer.
**Warning signs:** Clicking [Warrior] or [Mystic] does nothing.

### Pitfall 5: selectedCharacterId Required for LLM Calls
**What goes wrong:** `useLlm.ts` requires `selectedCharacterId` to be non-null before calling `validateLlmRequest`. During creation, there IS no character yet.
**Why it happens:** The LLM pipeline was designed assuming a character already exists.
**How to avoid:** Creation flow needs its own reducer that doesn't require `characterId`. The `validate_llm_request` reducer currently requires `characterId` for ownership checks -- creation must bypass this.
**Warning signs:** LLM calls silently fail, `requestGeneration` returns null.

### Pitfall 6: Archetype Mapping to Game Mechanics
**What goes wrong:** The game has 16+ specific classes (warrior, wizard, paladin, etc.) with hardcoded combat behavior. An LLM-generated "Ember-Blooded Pyroclast" has no entry in `CLASS_CONFIG`, `MANA_CLASSES`, `TANK_CLASSES`, `HEALER_CLASSES`, `PARRY_CLASSES`, etc.
**Why it happens:** v1.0 combat system is deeply coupled to known class names.
**How to avoid:** The LLM JSON output must include mechanical flags: `{ usesMana: true, canParry: false, role: 'dps', armorType: 'cloth' }`. These flags drive the combat system instead of class name lookups. Each lookup function needs a fallback using these flags from the character/creation state.
**Warning signs:** Generated characters can't use abilities, have wrong armor, or break combat.

## Code Examples

### Server: Creation Greeting (no LLM needed)
```typescript
// When player has no character and no creation state, emit greeting
function emitCreationGreeting(ctx: any, playerId: any) {
  const userId = requirePlayerUserId(ctx);

  // Create the state row
  ctx.db.characterCreationState.insert({
    id: 0n,
    playerId: ctx.sender,
    step: 'AWAITING_RACE',
    createdAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
  });

  // Emit greeting as event_private (characterId=0 since no character yet)
  // NOTE: event_private requires characterId -- may need a creation-specific event table
  // or use a sentinel characterId (0n) for pre-character events
}
```

### Server: Go-Back Warning
```typescript
// Emit dramatic warning, set step to 'CONFIRMING_GO_BACK'
appendCreationEvent(ctx, state.playerId,
  'You wish to unmake what was made? The [class name] that was born of your choices — ' +
  'a thing that has never existed before and may never exist again — you would cast it aside? ' +
  'Very well. Type "yes" to abandon this path, or continue as you were.'
);
```

### Client: Route to Creation Mode
```typescript
// In App.vue, replace CharacterPanel block
// When logged in, no character: show NarrativeConsole in creation mode
const isInCreation = computed(() => {
  // Player has no active character (no selectedCharacter)
  // Check if they have a creation state row
  return !selectedCharacter.value;
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed race dropdown | Freeform text + LLM interpretation | v2.0 Phase 26 | Race table becomes legacy; new races are LLM-generated strings |
| Fixed class list | LLM-generated unique classes | v2.0 Phase 26 | CLASS_CONFIG must have fallback for unknown classes |
| Form-based CharacterPanel | Narrative conversation flow | v2.0 Phase 26 | CharacterPanel component becomes unused |
| Client-side creation state | Server-side state machine | v2.0 Phase 26 | Creation survives page refresh |

**Deprecated/outdated after this phase:**
- `CharacterPanel.vue`: Replaced by narrative flow in NarrativeConsole
- `useCharacterCreation.ts`: Legacy composable replaced by new creation composable
- Fixed race/class validation in `create_character` reducer: Must support generated values
- `RACE_DATA` import for character creation: Races are now freeform

## Open Questions

1. **event_private requires characterId -- how to emit creation events pre-character?**
   - What we know: event_private has `characterId: t.u64()` (required, not optional). During creation, no character exists yet.
   - What's unclear: Whether to add a creation-specific event table, make characterId optional, or use a sentinel value (0n).
   - Recommendation: Add a new `EventCreation` table with `playerId: t.identity()` instead of characterId. This cleanly separates creation events from game events and avoids polluting the event_private table. The client subscribes to this table during creation mode.

2. **How does the procedure get called after validate_llm_request?**
   - What we know: Current pipeline is broken -- validate creates pending row but procedure is never called from client.
   - What's unclear: Whether to fix the generic pipeline or build creation-specific flow.
   - Recommendation: Build a creation-specific procedure `generate_creation_content` that handles the full flow (validate budget, call API, parse response, update creation state, emit events) without going through the generic pipeline. This avoids the characterId requirement in `validate_llm_request` and keeps creation self-contained.

3. **How to handle normalizeClassName and class lookups for generated classes?**
   - What we know: 10+ functions in class_stats.ts, combat helpers, and item helpers use hardcoded class name lookups.
   - What's unclear: Whether to modify all lookup functions now or defer to when combat is actually used.
   - Recommendation: Store archetype ('warrior' or 'mystic') alongside className. Use archetype as the fallback key for all class lookups. Warrior archetype maps to warrior-like stats (physical, can parry, plate armor). Mystic maps to wizard-like stats (magical, mana user, cloth armor). This gives generated classes sensible combat behavior without modifying every lookup function.

4. **One character per player enforcement**
   - What we know: Context says one character per player, delete current before creating new.
   - What's unclear: Does the existing create_character reducer already enforce this?
   - Recommendation: Add a check at creation start: if player already has a character, reject with a sardonic message. The delete_character reducer already exists.

## Sources

### Primary (HIGH confidence)
- Project codebase: `spacetimedb/src/schema/tables.ts` -- all table definitions
- Project codebase: `spacetimedb/src/reducers/llm.ts` -- LLM validation reducer
- Project codebase: `spacetimedb/src/reducers/intent.ts` -- NL intent handling pattern
- Project codebase: `spacetimedb/src/reducers/characters.ts` -- create_character reducer and stat computation
- Project codebase: `spacetimedb/src/helpers/llm.ts` -- budget, request building, response parsing
- Project codebase: `spacetimedb/src/data/llm_prompts.ts` -- system prompts, narrator voice
- Project codebase: `spacetimedb/src/data/class_stats.ts` -- CLASS_CONFIG, stat computation
- Project codebase: `src/composables/useLlm.ts` -- client LLM flow (with TODO gap)
- Project codebase: `src/components/NarrativeConsole.vue` -- narrative display
- Project codebase: `src/components/NarrativeMessage.vue` -- keyword/link rendering
- Project codebase: `src/App.vue` -- routing between creation and game

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions from user discussion session

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all existing project infrastructure, no new libraries
- Architecture: HIGH -- state machine pattern is well-understood, all integration points identified
- Pitfalls: HIGH -- identified from direct codebase analysis (hardcoded class lookups, missing procedure trigger, event table constraints)

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable -- all findings are project-specific, not library-version-dependent)
