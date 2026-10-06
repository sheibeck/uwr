# Phase 49: Character Creation Interview - Context

**Gathered:** 2026-10-06
**Status:** Ready for planning
**Mode:** Smart discuss. Answers were auto-approved under the owner's overnight instruction (2026-10-05: "I auto approved any questions with your recommendations"). The owner decided on 2026-10-05 that the name is asked last and that there is no "First words" step.

<domain>
## Phase Boundary

A new player goes through character creation as a Keeper interview in the feed.

- **Steps:** race, then archetype (Warrior or Mystic), then the class reveal, then the name, then entering the realm.
- **Step indicator:** shows where the player is in the interview.
- **Race cards:** 3 suggestions with stat tags. The player can also type any race or choose "Surprise me".
- **Live character sheet:** fills in as the player chooses. The name shows as a placeholder until the last step.
- **Mobile:** works at 390×844.

Requirements: CRE-01, CRE-02 and CRE-03.

Builds on Phase 45 (frame, picker), Phase 46 (Keeper lines as segments in `event_creation`) and Phase 47 (feed and input).

Out of scope:
- Browsable fixed race lists (races stay freeform).
- New creation steps on the server.
- Keeper Bible or route-block changes. These need SEG-03 owner approval and are not planned.

</domain>

<decisions>
## Implementation Decisions

### Interview flow (CRE-01)
- The interview runs in the story feed. Creation lines arrive as `event_creation` rows carrying Phase 46 segments, so Keeper lines are labelled.
- A step bar above the feed shows Race · Archetype · Class · Name · Enter the realm. It is derived from the server's `character_creation_state.step`, mapping every server step (including error and retry steps) to one indicator position. The name is asked last, and there is no "First words" step.
- Archetype step: two cards, Warrior and Mystic. Typing still works.
- Errors such as `CLASS_FILL_ERROR` show a Retry action that uses the existing server path. Go-back is offered only where the existing state machine supports it. No new server step.
- Entry point:
  - A player with no characters goes straight into the interview, replacing the Phase 45 "character creation is coming" note.
  - The character picker gains a "New character" button for players who already have characters.
  - After the name, the player enters the realm with the new character, using the existing `set_active_character` flow.

### Race suggestions (CRE-03)
- The 3 cards come from races already stored in this world (`race_definition` rows), each with stat tags from its stored bonuses.
  - There is no new LLM call and no prompt change, and nothing is pre-seeded, following the "everything generated through play" principle.
  - With fewer than 3 stored races, only the stored ones show. "Surprise me" and free text are always available.
  - The selection rule (for example the most recent, or a deterministic sample) is Claude's discretion.
- Clicking a card sends that race name through the existing free-text race path.
- "Surprise me" sends a fixed line, "Surprise me.", through the same free-text path, and the Keeper invents a race. No prompt change.
- If `race_definition` is not readable by the client, add one small, additive, public view or exposure for it. Publish locally only, with `--break-clients`, never clearing the database, checking the key length (108) before and after, then regenerate the bindings.

### Live character sheet (CRE-02)
- On desktop, the sheet replaces the right rail during creation. On mobile, a "Sheet" chip opens it in a sheet.
- It fills in this order: race, archetype, class, stats with bonuses, racial trait, then the name. The name shows as an "Unnamed" placeholder until the last step.
- The staged class reveal lands in the interview feed, and the sheet updates from the stored creation state.

### Mobile (390×844)
- The interview (feed, cards, input) is usable at 390×844, and the sheet is reachable from the "Sheet" chip.

### Owner decisions after the UI-SPEC draft (2026-10-06, owner in chat)
- **One character per account stays.** The server's one-character rule is unchanged. The character picker does NOT get a "New character" button. Creation runs only for an account with no character. This supersedes the earlier "New character" entry point.
- **Race stat bonuses are applied on the server.** When a character is finalized, `finalizeCharacter` adds the race's stored stat bonuses to the stats. Today the stats come from the class only.
  - This is a small server change in this phase: code only, no schema change expected.
  - Publish locally with `--break-clients`. Never use `--clear-database` or maincloud. Check that `admin_llm_status` key_length is 108 before and after.
  - Add a test that pins the finalized stats as class base plus race bonus.
  - The live sheet then shows the final values with the race bonus included. The bonus can still be marked "+N (race)" to explain it.
  - This changes balance for new characters. Existing characters are not recomputed.
- **`race_definition` is already public and bound.** No new view is needed for the race cards.

### Owner decision after research (2026-10-06, owner in chat): D1
- **The race bonus survives level-up.** Leveling up currently rebuilds all five stats from the class (`apply_level_up` at index.ts:495, and the admin level command at commands.ts:607). Both places now carry the bonus through:
  - Look up the race from `race_definition` using `character.race`.
  - Subtract the race bonus before `detectPrimarySecondary`.
  - Add the bonus back after `computeBaseStatsForGenerated`.
  - Reuse the shared `computeCreationStats` and `parseRaceBonuses` helpers.
- No schema change and no marker column. This is still code only, with the same local publish rules.
- Characters created before this phase never got the bonus, so their stats can come out slightly off at their next level-up. The owner accepted this as a greenfield trade-off.
- Tests must pin both cases:
  - A level-up keeps the race bonus.
  - A race with no stored definition or no bonuses levels up exactly as it does today.
- Research finding F1 (finalize crashes when `secondaryStat` is `'none'`) gets fixed as part of the same helper.

### Claude's Discretion
- The race selection rule.
- Component layout under `src/` (for example `src/creation/`).
- The exact visual of the step bar, following the design import.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 45 session and screen logic: `CharacterPicker`, `NoCharactersNote`, `deriveScreen`, and the frame shells.
- Phase 47 console:
  - feed store, lines, FeedView and FeedLine
  - `useConsole` and `routeInput`
  - Composer
  - keyed bindings
- Phase 46 segments in `event_creation`.
- Server creation flow:
  - `reducers/creation.ts`
  - `character_creation_state` steps such as `AWAITING_RACE`, `CLASS_REVEALED`, `AWAITING_NAME` and `CLASS_FILL_ERROR`
  - the `creation_race`, `creation_class_reveal` and `creation_class` LLM routes
  - `race_definition`
- The old client at tag `v2.2-client` is a behavior reference only (the narrative creation flow in `useCharacterCreation`).

### Established Patterns
- Design guards, text nodes only, inert defaults for new injected data, filtered subscriptions.
- Server changes are additive only and published locally with no clear.

### Integration Points
- `deriveScreen`, picker, AppFrame (creation mode), FeedShell and Composer (creation input routing), and the context rail (live sheet on desktop).

</code_context>

<specifics>
## Specific Ideas

- Design source: the character creation screen (mock 2a) in `UWR Ledger Screens.dc.html`, desktop and mobile. Re-import it fresh from the claude_design MCP project "Unwritten Realms".
- Two owner deviations from mock 2a apply:
  - The name is asked last.
  - The "First words" step is dropped.

</specifics>

<deferred>
## Deferred Ideas

- Generating race suggestions with an LLM (a paid call and a prompt change).
- Fixed browsable race lists (Out of Scope).
- Live creation run-through: deferred to the end-of-milestone UAT, because it needs LLM calls.

</deferred>
