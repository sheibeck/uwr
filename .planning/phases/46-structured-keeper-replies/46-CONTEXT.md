# Phase 46: Structured Keeper Replies - Context

**Gathered:** 2026-10-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Backend only. Every narrative LLM reply arrives as speaker-attributed segments `{kind: narration|dialogue, speaker, text}`, written in the Keeper's second-person scene-narrator voice, and is stored with its event so any client can render labelled lines. NPC speech appears only in dialogue segments. A malformed reply never breaks the feed: it falls back to a single Keeper narration line. The Keeper Bible and route blocks are revised for the narrator voice, but only after the owner approves them. The golden harness is updated for the segment shape. The paid golden run and the owner's tone sign-off (SEG-05) are deferred to the end-of-milestone testing pass. Requirements: SEG-01 to SEG-05.

Out of scope: client rendering of segments (Phase 47, CON-01), and the round-based combat engine (Phase 46.1). Phase 46.1 later uses this phase's `combat_narration` segment contract for big-moment and end-of-fight narration.

</domain>

<decisions>
## Implementation Decisions

### Segment storage
- Add an optional typed `segments` column, an array of a product type `{kind, speaker, text}` plus optional `speakerNpcId`, to the event tables that narrative routes write today: `event_private`, `event_location` and `event_creation`.
  - The column must be additive and optional, so a local publish needs no `--clear-database`. Clearing would wipe the stored Anthropic key.
  - Regenerate the client bindings in `src/module_bindings`.
- Keep `message`. Fill it with flattened plain text in story form, for example `The Ferryman says, "…"`, for logs, admin views and any consumer that ignores segments.
- `speaker` is a display string: "The Keeper" for narration, or the NPC's display name for dialogue. The optional `speakerNpcId` lets Phase 47 make speaker names clickable keywords.
- Extend the event helpers in `spacetimedb/src/helpers/events.ts` (`appendPrivateEvent`, `appendLocationEvent`, `appendCreationEvent`, and the private-plus-group variant if a narrative route uses it) with an optional segments parameter. Existing callers stay unchanged.

### Routes and segment rules
- Narrative routes return segments:
  - `npc_conversation` (already JSON; extend its schema)
  - `combat_narration` (becomes a JSON route returning segments)
  - world and scene narration prose (`world_gen_start` and `world_gen` narrative fields)
  - creation replies (`creation_race`, `creation_class_reveal`)
- Mechanical routes keep their structure. Flavor text from `skill_gen`, `renown_perk_gen` and the `creation_class` fill is stored as Keeper narration segments, not re-shaped.
- Validation and clamping:
  - At most 6 segments per reply, and about 600 characters per segment text (truncate cleanly).
  - `kind` must be `narration` or `dialogue`.
  - A narration segment's speaker is always "The Keeper".
  - A dialogue segment must name an NPC present in the scene. Otherwise it becomes Keeper narration.
  - Empty segments are dropped.
- Malformed reply fallback (bad JSON, unknown kind, missing speaker, empty text, zero valid segments): store one Keeper narration segment. Use salvaged text when the reply holds usable prose; otherwise use an in-voice fallback line. The feed never breaks, and the offline failure drills must cover every narrative route.
- The player's own speech is never a segment speaker. The Keeper describes what "you" do in the second person, and player-typed text is not echoed as "You say".

### Voice and approvals (owner checkpoints)
- SEG-03: draft every Keeper Bible and route-block change (`spacetimedb/src/data/llm_layers.ts` and related layer files) into one before/after review package, for example `46-VOICE-CHANGES.md`. Execution pauses once at a blocking checkpoint. Nothing is applied until the owner approves or edits the package.
  - This is a content approval, not testing, so it is NOT deferred.
- Voice rules for the package:
  - The Keeper narrates what happens around the player in the second person, as in the Ledger console mock.
  - The Keeper is male (he/his).
  - Every NPC is male or female; never it/they for in-world people.
  - The player is always "you", with no third-person pronoun.
  - No first-person Keeper (the owner retracted that direction).
- SEG-05:
  - In this phase: update the golden items and golden rules (`scripts/llm/golden_*.mjs`) for the segment shape, so the run is ready.
  - Deferred: the paid golden run and the owner's tone sign-off go to the end-of-milestone testing pass, with a cost estimate and the owner's go-ahead before anything is spent.
  - No paid LLM calls happen during Phase 46, and no `approvedBy` is set unless the owner approves in chat.

### Claude's Discretion
- The exact product-type name and field order for the segment type, and the helper names.
- Exact truncation behavior and the in-voice fallback wording. The wording goes into the voice review package, so the owner sees it.
- How to identify "NPCs present in the scene" for the dialogue check. Use the data the apply layer already has, such as the conversation's NPC or the location's NPCs.
- Whether `world_gen` narration segments land in `event_private` or `event_location`. Follow where each route writes today.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `spacetimedb/src/data/llm_routes.ts`: route table (`LLM_ROUTES`, `validateRoutes`). `combat_narration` and `smoke_test` are `{kind:'text'}`; the others are JSON with schemas.
- `spacetimedb/src/data/llm_schemas.ts`: the JSON reply schemas (RACE_SCHEMA, CLASS_REVEAL_SCHEMA, CLASS_FILL_SCHEMA, WORLD_START_SCHEMA, REGION_FILL_SCHEMA, SKILL_GENERATION_SCHEMA, RENOWN_PERK_SCHEMA, and the npc conversation schema). Schemas must stay inside the subset-linted shape; the v2.0 validators enforce ranges.
- `spacetimedb/src/data/llm_layers.ts`: the Keeper Bible and per-route blocks. Edits need owner approval. Layer tests pin the route blocks.
- `spacetimedb/src/helpers/llm_apply.ts`: applies stored replies. It already attributes NPC speech in the text (name, "says", quoted dialogue). Keeper creation, skill and renown text is stored without attribution.
- `spacetimedb/src/helpers/events.ts`: `appendWorldEvent`, `appendLocationEvent`, `appendPrivateEvent`, `appendPrivateAndGroupEvent`, `appendCreationEvent`, `appendGroupEvent`.
- Event tables in `spacetimedb/src/schema/tables.ts` (`event_world`, `event_location`, `event_private`, `event_group`, `event_creation`) are `event: true` tables with `message` and `kind` string columns.
- Golden harness: `scripts/llm/golden_set.mjs`, `golden_rules.mjs`, `golden_run.mjs`, `golden_review.mjs`, `golden.live.ts`. Offline failure drills: `drill_rules.mjs`, `drills.live.ts`.

### Established Patterns
- LLM flow since v2.2: a reducer calls `enqueueLlmJob`; the scheduled `llm_run` procedure claims the job, fetches outside a transaction, persists, then applies from the stored text. Apply failures can re-run from stored text with no second billed call.
- Sonnet 5.5 request rules: explicit `output_config.effort`, required `max_tokens`, JSON via `output_config.format` with static schemas. Forbidden keys are pinned by tests.
- Characterization suites from Phases 40-42 must stay green.
- Unit tests ship in every phase.

### Integration Points
- New client: `src/module_bindings` is regenerated with `pnpm spacetime:generate`. Phase 47 renders segments, so this phase needs no client UI change beyond the regenerated bindings.
- Local publish only: `spacetime publish uwr -p spacetimedb`, no `--clear-database`. Never maincloud.
- Baseline test failures to ignore: `scripts/llm/call_log_report.test.mjs`, `golden_run.test.mjs`, `proof_rules.test.mjs`, `spacetimedb/src/helpers/measurement.results.test.ts`. They fail because the v2.2 phase folders moved to `.planning/milestones/`. Golden harness changes may touch `golden_run.test.mjs`; fixing its path lookup is in scope only if needed for SEG-05 readiness.

</code_context>

<specifics>
## Specific Ideas

- Target output, as in the Ledger console mock:
  - a narration segment, "The Keeper": "You peer into the well. It is deep, dark and wet..."
  - a dialogue segment, "The Ferryman": "Mind the current, traveller."
  - The client renders the dialogue segment as `The Ferryman says, "Mind the current, traveller."`
- Input: `.planning/milestones/v2.2-phases/44-live-verification-and-tone-eval/44-TONE-FIXES.md`, section "Open question for the UX overhaul". This phase answers its questions: a separate speaker field and text split into narration and dialogue, applied to Keeper, NPC and combat text, with the speaker and kind stored for journals and history.

</specifics>

<deferred>
## Deferred Ideas

- The paid golden run and the owner's tone sign-off (SEG-05) are deferred to the end-of-milestone testing pass, with a cost estimate first.
- Client rendering of labelled segment lines is Phase 47 (CON-01).
- The `login_email` email-trust fix (CR-01 from the Phase 45 review) is a separate high-priority todo and is not part of this phase.

</deferred>
