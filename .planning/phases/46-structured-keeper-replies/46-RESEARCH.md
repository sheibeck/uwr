# Phase 46: Structured Keeper Replies - Research

**Researched:** 2026-10-05
**Domain:** SpacetimeDB 2.10 TypeScript module (event tables, product types), Claude structured-output routes, LLM apply layer, golden harness
**Confidence:** HIGH (schema migration verified by a live local probe; apply-layer map read from source; model compliance and live schema compile are LOW until the deferred paid run)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Segment storage
- Add an optional typed `segments` column, an array of a product type `{kind, speaker, text}` plus optional `speakerNpcId`, to the event tables that narrative routes write today: `event_private`, `event_location` and `event_creation`.
  - The column must be additive and optional, so a local publish needs no `--clear-database`. Clearing would wipe the stored Anthropic key.
  - Regenerate the client bindings in `src/module_bindings`.
- Keep `message`. Fill it with flattened plain text in story form, for example `The Ferryman says, "…"`, for logs, admin views and any consumer that ignores segments.
- `speaker` is a display string: "The Keeper" for narration, or the NPC's display name for dialogue. The optional `speakerNpcId` lets Phase 47 make speaker names clickable keywords.
- Extend the event helpers in `spacetimedb/src/helpers/events.ts` (`appendPrivateEvent`, `appendLocationEvent`, `appendCreationEvent`, and the private-plus-group variant if a narrative route uses it) with an optional segments parameter. Existing callers stay unchanged.

#### Routes and segment rules
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

#### Voice and approvals (owner checkpoints)
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

### Deferred Ideas (OUT OF SCOPE)
- The paid golden run and the owner's tone sign-off (SEG-05) are deferred to the end-of-milestone testing pass, with a cost estimate first.
- Client rendering of labelled segment lines is Phase 47 (CON-01).
- The `login_email` email-trust fix (CR-01 from the Phase 45 review) is a separate high-priority todo and is not part of this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEG-01 | Narrative LLM routes return segments `{kind: narration\|dialogue, speaker, text}` | Section "Per-route map" (which routes the model emits segments for vs. which the server wraps), "Segment schema and route kinds", `segments.ts` design, schema lint limits |
| SEG-02 | Segments are stored with the event so the feed renders each as its own labelled line | "Schema migration (verified)": optional `t.array(KeeperSegment)` column on the three event tables, accepted with `--break-clients`, no default and no clear; helper signature extension; bindings regen |
| SEG-03 | Second-person narrator voice; NPC speech only in dialogue segments; owner approves every Bible/route-block edit | "Voice package" surface inventory, sequencing (plumbing before approval, prompt/route-kind changes after), pinned tests that move with the edits |
| SEG-04 | A malformed segment reply falls back to a single Keeper narration line | Fallback ladder, per-route malformed-reply matrix, and the correction that the offline failure drills are `llm_failure_drills.test.ts` (the `drills.live.ts` drills are live infrastructure drills) |
| SEG-05 | Golden run in the narrator voice passes mechanical rules; owner tone sign-off (paid run deferred) | "Golden harness" section: rules that must change, new rule ids, record path, review rendering, why the Phase 44 record tests fail and the replay trap |
</phase_requirements>

## Summary

Every narrative reply reaches the player today as one flat `message` string written by `llm_apply.ts` (or `combat_narration.ts`) into `event_private` or `event_creation`. NPC speech is attributed in text (`Marta says, "…"`); Keeper text for creation, skills and renown is composed server-side with no attribution and a mix of first-person ("I find recklessness entertaining"), third-person ("The Keeper of Knowledge regards you…") and quoted Keeper speech. Phase 46 adds a typed `segments` array next to `message`, one event row per reply holding up to 6 segments, and a pure validator that makes the stored shape safe regardless of what the model returns.

The schema question is settled by a live probe against the local SpacetimeDB 2.10.1 server (scratch databases, deleted afterwards; `uwr` untouched). Adding `segments: t.array(KeeperSegment).optional()` (a named product type with an optional `speakerNpcId`) to an `event: true` table is accepted by a plain publish plus `--break-clients`: the plan reads "Changed schema of event table", no default annotation is required and no clear is needed. The same column on a persisted table is refused ("requires a default value annotation"), which matches the Phase 41 `llm_job.next_attempt_at` precedent. So the optional column is safe on exactly the three event tables the context names, and only because they are event tables.

The main planning risks are sequencing and test churn, not the schema. (1) Route-kind and prompt changes (combat_narration text to JSON, the new NPC reply shape, voice edits) are route-block edits that need owner approval, but the apply-side plumbing does not; the validator's salvage ladder makes the plumbing safe to land first because legacy-shaped replies (`dialogue` field, plain prose) salvage cleanly. (2) About 80 of 152 characterization snapshots and several pinned tests change legitimately. (3) The Phase 44 golden record tests currently fail at collection time; repointing them re-enables a replay of the old record against the new rules, which will conflict for the two routes whose shape changes.

**Primary recommendation:** Build one pure module `spacetimedb/src/helpers/segments.ts` (clamp, canonicalize speakers from the DB, flatten, fallback ladder), add the optional `segments` column last in the column list of the three event tables, extend the event helpers with a trailing optional parameter, write one event row per reply, keep `npc_conversation` a text-JSON route (its effects block cannot fit the structured-output union limit), make `combat_narration` a small structured-output route, wrap server-composed prose for every other route as Keeper narration, and gate every prompt/Bible/route-kind change behind the `46-VOICE-CHANGES.md` checkpoint.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Segment contract (type, clamps, speaker canonicalization, flatten, fallback) | API / Backend (SpacetimeDB module, pure helper) | — | The server is the source of truth; the model's `speaker` string is never trusted or stored |
| Segment persistence | Database / Storage (event tables, optional column) | — | Event tables are the existing feed channel; no new table |
| Model reply shape (segments in NPC and combat replies) | API / Backend (route schema/block) | — | Structured-output schema for combat; prompt-instructed JSON for NPC |
| Server-composed prose wrapped as Keeper narration (creation, world, skill, renown) | API / Backend (apply layer) | — | The apply layer already composes the strings; wrapping is deterministic |
| Rendering labelled lines, clickable speaker names | Browser / Client (Phase 47) | — | Out of scope here; this phase only regenerates bindings |
| Voice (Bible, route blocks, fixed Keeper strings) | API / Backend (prompt layers) | Owner approval gate | Cache-prefix-bearing text; owner approves before it lands |
| Golden rules and items for the segment shape | Offline scripts (`scripts/llm`) | — | Pure rules that import server validators; no network in this phase |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `spacetimedb` (server SDK) | 2.10.1 `[VERIFIED: spacetimedb/node_modules/spacetimedb/package.json]` | `t.object(name, {...})`, `t.array(...)`, `.optional()` for the segment column | Already pinned in the repo; `t.object` requires a name in 2.10 types `[VERIFIED: dist/lib/type_builders.d.ts]` |
| SpacetimeDB CLI | 2.10.1 `[VERIFIED: spacetime --version]` | build, publish, generate | Project standard |
| `vitest` | 5.0.2 `[VERIFIED: spacetimedb/package.json]` | Unit and characterization tests (module and `scripts/llm`) | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Existing `schema_lint.ts` | in repo | Lint the new combat schema (no maxItems, no bounds, additionalProperties false, union and optional counts) | New JSON schema |
| Existing `truncateCodePoints`, `neutralizePlayerText` (`data/llm_layers.ts`) | in repo | Clean code-point truncation, lone-surrogate repair | Segment text clamp |
| Existing `npcGender`, `NPC_GENDERS` (`data/npc_gender.ts`) | in repo | NPC gender for prompts and fallback pronouns | Voice rules |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `t.string()` for `kind` | `t.enum('SegmentKind', {...})` | A sum type becomes a tagged union in the client (`{tag: 'dialogue'}`), awkward to read and no precedent in this repo; every other `kind` column here is a string validated server-side. Use `t.string()` |
| One event row per reply with a segments array | One event row per segment | Per-segment rows lose reply grouping, multiply dedupe and ordering problems (ids are not sequential), and break "talking to an NPC yields one reply". Use one row |
| `npc_conversation` as a structured-output route | Keep text-JSON | The NPC `effects` item has about 17 conditional fields plus `addSecret`; as nullable `anyOf` that is 18 union params against `SCHEMA_MAX_UNION_PARAMS = 16` `[VERIFIED: schema_lint.ts, NPC_REPLY_SHAPE in llm_layers.ts]`. Keep text-JSON; add `segments` to the prompt-described shape |

**Installation:** none. No new packages are needed in this phase.

**Version verification:** `spacetimedb` 2.10.1 (installed), `vitest` 5.0.2 (installed). No registry installs.

## Package Legitimacy Audit

No external packages are installed in this phase, so the gate has nothing to check.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Schema migration (verified)

Live probe, 2026-10-05, local server `127.0.0.1:3000`, CLI 2.10.1, throwaway databases `seg-probe-46` and `seg-probe-46b` (both deleted; `uwr` and its stored key untouched). Module defined `const Seg = t.object('KeeperSegment', { kind: t.string(), speaker: t.string(), text: t.string(), speakerNpcId: t.u64().optional() })` and added the column after the last existing column of an `event: true` table.

| Column definition on an event table | Publish result | Source |
|---|---|---|
| `segments: t.array(Seg)` (no default) | plan "Changed schema of event table", breaking-clients prompt, no default error | `[VERIFIED: local probe]` |
| `segments: t.array(Seg).optional()` | same; applied with `--break-clients`; reducer inserts with and without `segments`, with `speakerNpcId: 7n` and with `speakerNpcId: undefined`, all succeeded | `[VERIFIED: local probe]` |
| `segments: t.array(Seg).default([])` | same plan | `[VERIFIED: local probe]` |
| `segments: t.array(Seg).optional().default(undefined)` | same plan | `[VERIFIED: local probe]` |
| Same `.optional()` column on a persisted (non-event) table | refused: "Adding a column segments to table persist requires a default value annotation ... Aborting publish due to required manual migration" | `[VERIFIED: local probe]` |
| Three event tables sharing one named `KeeperSegment` type, one with an index | created and insert reducer ran | `[VERIFIED: local probe]` |

Conclusions for the plan:
- Use `.optional()` (what CONTEXT locked). It is safe only because the three tables are `event: true`. Do not copy the pattern onto `combat_narrative` or any persisted table without `.default(...)`.
- The publish needs `--break-clients` (all clients are disconnected, no data loss, no clear). Same as Phase 41-18 (`npc.gender`) and 42. Local command: `spacetime publish uwr -p spacetimedb --server local --break-clients`. Never maincloud (owner-only).
- Place `segments` LAST in each table's column list (after `createdAt`). Docs say new columns go at the end `[CITED: spacetimedb.com/docs/databases/automatic-migrations]`; the probe only exercised end placement.
- Precedent agrees: Phase 41-10 refused `llm_job.next_attempt_at` (`t.timestamp().optional()` without a default) on a persisted table; 41-18 `npc.gender` `.default('')` needed only `--break-clients`.
- Generated bindings (probe output) `[VERIFIED: local probe]`: `KeeperSegment` becomes `__t.object("KeeperSegment", {kind, speaker, text, speakerNpcId: __t.option(__t.u64())})` in `types.ts`; each event row type gets `segments: __t.option(__t.array(KeeperSegment))` (a client reads `segments?: KeeperSegment[]`, `speakerNpcId?: bigint`). Regenerate with `pnpm spacetime:generate` (root script).
- Test mocks: the recording mock (`schema_recorder.ts`) accepts any `t.x(...)` chain, so `t.object('KeeperSegment', ...)`, `t.array(...)` and `.optional()` load under `vi.mock('spacetimedb/server')`. `rowColumnProblems` skips optional columns, so existing row inserts that omit `segments` stay valid. A non-optional column with a default would flag "missing column" in every test that builds event rows by hand, another reason to keep `.optional()`.

## Per-route map (every narrative write path today)

Source: `spacetimedb/src/helpers/llm_apply.ts` and `helpers/combat_narration.ts` `[VERIFIED: source read]`.

| Route | Success apply fn | Event helper / table | Event `kind` | Message format today |
|---|---|---|---|---|
| `creation_race` | `applyCreationResult` | `appendCreationEvent` / `event_creation` | `creation` | `${narrative}\n\n**${raceName}**\n+P STAT, +S STAT[. flavor]\n\nNow then. Every creature must choose a path... [Warrior] ... [Mystic]...\n\n(If you're already regretting your choices, type "go back." The Keeper does not judge... much.)` |
| `creation_class_reveal` | `applyClassRevealResult` (then `startClassFill`) | `appendCreationEvent` / `event_creation` | `creation` | `${classDescription}\n\n**${className}**\n\nYour first ability:\n\n${name} — ${description}\n  ${mechanics line}\n\n${CLASS_REVEAL_MILESTONE_LINE}` |
| `creation_class` | `applyClassFillResult` | `appendCreationEvent` / `event_creation` | `creation` | `${classDescription}\n\n**${className}**\n${stat line}...\n\nYour starting abilities:\n\n[name] — desc\n mechanics...\nChoose one... Choose wisely — or don't. I find recklessness entertaining.\n\n(If you're already regretting ...)` |
| `world_gen_start` | `applyWorldStartResult` | `appendPrivateEvent` / `event_private` (arrival, only when the character has no location yet); `appendWorldEvent` ripple (static pool); two `system` lines | `narrative` (arrival), `world`, `system` | `You open your eyes in ${start}, ${region}.\n\n${regionDescription}\n\n${npcNoticeLine}\n\nTry [look]... The Keeper is still remembering the roads out.` |
| `world_gen` | `applyWorldFillResult` | `appendPrivateEvent` / `event_private` | `system` | `worldFillCompleteLine(region)` (static copy; no model prose) |
| `skill_gen` | `applySkillGenResult` | `appendPrivateEvent` / `event_private` | `narrative` | `The Keeper of Knowledge regards you with something resembling interest.\n\n"Level N. How quaint..."\n\n[skill] -- desc\n  stats...\n\n"Choose wisely. Or don't..."` (model supplies only skill `description` text) |
| `renown_perk_gen` | `applyRenownPerkResult` | `appendPrivateEvent` / `event_private` | `narrative` | `Your renown has grown...\n\nThe Keeper of Knowledge regards you...\n\n"Rank N. ..."\n\n[perk] -- desc...\n"Choose wisely..."` |
| `npc_conversation` | `applyNpcConversationResult` | `appendNpcDialog` (`npc_dialog`, persisted) plus `appendPrivateEvent` / `event_private` | `npc` | `${npc.name} says, "${dialogue}"`; effect cues are separate `npc` rows (`quest` row for a new quest) |
| `combat_narration` | `applyCombatNarrationResult` -> `handleCombatNarrationResult` | `combat_narrative` row (persisted) plus `appendPrivateEvent` per participant / `event_private` | `combat_narration` | `[Round N] ` prefix only for `narrativeType === 'round'` (none enqueued today; outro only), then the prose |

Failure and malformed paths (all in `applyLlmFailure` and the apply fns):
- Malformed creation (race and class reveal): `CREATION_MALFORMED_LINE` as `creation_error` event and the step reverts. Fill failure: `failClassFill` -> `CLASS_FILL_FAILED_LINE`.
- World start parse failure or missing `regionName` / `startLocation.name`: `failWorldGen` (private `system` line when placed, else `creation_error`). World fill: `failWorldFill`.
- Skill gen with fewer than 3 valid skills: a Keeper `narrative` line, nothing inserted. Renown with fewer than 3 valid: static options plus a Keeper `narrative` line.
- NPC: invalid JSON writes `${npc.name} mutters something unintelligible. (Try again.)` (`npc` event) and returns before memory or cooldown writes; a reply with no `dialogue` stores `"..."`.
- Combat: a parse failure uses the raw text; an empty narrative returns silently; failure is silent by design.
- `applyLlmFailure` posts resting / failure lines for every domain (Keeper-voice copy in `llm_apply.ts`, `llm_status.ts`, `llm_queue.ts`, `creation_generation.ts`, `world_gen.ts`, `llm_sweeper.ts`, `renown.ts`).

Which events actually need `segments`:
- `event_private`: npc, narrative (skill, renown, arrival), combat_narration, and the `fail()`-style Keeper lines the narrative routes write.
- `event_creation`: creation, creation_error lines written by the creation apply path.
- `event_location`: no narrative route writes it today. Extend `appendLocationEvent` for symmetry (CONTEXT), but nothing populates it (Claude's discretion item resolves to `event_private` for world narration).
- `appendPrivateAndGroupEvent` / `logPrivateAndGroup`: no narrative route uses them, so leave them unchanged (CONTEXT: "if a narrative route uses it"). `event_group` and `event_world` get no column.

## Segment schema and route kinds

### Which routes the model emits segments for (recommendation)
- **`npc_conversation` (model emits segments).** Keep it a text route with prompt-instructed JSON (no `output_config.format`; `assertValidClaudeBody` forbids `format` on text routes). Replace `"dialogue"` in `NPC_REPLY_SHAPE` with `"segments": [{"kind": "narration|dialogue", "speaker": "...", "text": "..."}]`; keep `internalThought`, `effects`, `memoryUpdate`. The pinned layer test requires the block to contain `"dialogue"`, `"internalThought"`, `"effects"`, `"memoryUpdate"` and must be updated with the voice package.
- **`combat_narration` (model emits segments, becomes a JSON route).** New schema `COMBAT_NARRATION_SCHEMA = obj({ segments: { type: 'array', items: obj({ kind: enumOf(['narration','dialogue']), speaker: S, text: S }) } })` in `llm_schemas.ts`, `{kind: 'json', schema}` in `llm_routes.ts`, add to `LLM_JSON_SCHEMAS`. The 6-segment and 600-character clamps cannot live in the schema (`maxItems`, `maxLength` are rejected by the linter); the server clamps. Update `llm_routes.test.ts` (it pins `combat_narration` as text at lines 107 to 113), `llm_schemas.test.ts` (+ snapshot), `claude_request.test.ts` (+ snapshot), `scripts/llm/sweep.live.ts` (`JSON_ROUTES` excludes combat today) and `sweep_rules.mjs`.
- **Creation, world, skill, renown (server wraps).** The model's existing prose fields (`narrative`, `classDescription`, ability `description`, `regionDescription`) are Keeper narration by definition. The apply layer wraps the server-composed text into Keeper narration segments. This avoids changing five schemas, the measured tuning, and the prompt-cache grammar for stage routes. Open question OQ1 asks whether the owner reads SEG-01 as requiring model-emitted segments there.

### JSON schema subset (linter `helpers/schema_lint.ts`)
Every object `additionalProperties: false` with all keys `required`; no `minimum/maximum/minLength/maxLength/pattern`; `minItems` only 0 or 1; no `maxItems`; no `oneOf`, array-valued `type` or `nullable` (use `anyOf` with null); enum members scalar; at most 24 optional and 16 union params per schema; the root must be an object with a `required` array. The combat schema (one array of three required fields) uses 0 of both budgets. `llm_schemas.test.ts` runs `lintSchema` over a fixed `ALL` list and pins union counts; add the new schema there.

### Request builder
`buildClaudeRequest` adds `output_config.format = {type: 'json_schema', schema}` for any route whose `LLM_ROUTES[route].output.kind === 'json'` and rejects it for text routes `[VERIFIED: claude_request.ts]`. Flipping `combat_narration` is therefore one entry in `llm_routes.ts` plus the schema; the response classifier then also enforces `required` top-level keys (`segments`) and turns bad JSON into an `invalid_json` or `schema_mismatch` failure. Those are in `BILLED_FAILURE_CLASSES` in `llm_executor.ts`: the job fails (billed, no retry) and `applyLlmFailure` runs, which for combat is silent by design. Consequences:
- Under structured outputs, "bad JSON" can only reach the apply layer for `npc_conversation`. For combat it is intercepted earlier. The apply function must still be total over any string (tests feed it garbage directly) and the executor-level outcome for combat stays "no narration line, combat continues" (document it; do not add noise during a fight).
- Update `LLM_NO_AUTO_RETRY_ROUTES` expectations? No: combat is already no-retry. `deriveRouteTuning` still traces combat to the Phase 43 record (`p99 168`, `maxTokens 768`); a JSON wrapper adds only tens of tokens.

### Token headroom risk (npc_conversation)
Tuned `maxTokens` 512 against measured p99 379 (`llm_tuning.ts` entry) leaves about 130 tokens. Adding a narration segment plus JSON wrapping for two segments is roughly +70 to +100 tokens. A cut-off reply is a billed `truncated` failure (npc is not in the no-auto-retry list, but truncation is not retryable either). `llm_tuning.test.ts` enforces that tuned values equal the derivation over `llm_measurements.json`, so `maxTokens` cannot be raised in code without a paid re-sweep. Mitigation: cap the NPC narration to one short segment in the route block, watch `budget_exceeded`/`truncated` in the deferred golden run, and let the owner decide on a re-sweep with the end-of-milestone cost estimate (OQ4).

## Architecture Patterns

### System Architecture Diagram

```
 player input -> reducer (talk_to_npc / creation / explore / level-up / combat end)
        |
        v
 enqueueLlmJob (request snapshot, sourceKey, budget)  ->  llm_dispatch (scheduled)
        |
        v
 llm_run procedure:  claim (tx1) -> ctx.http.fetch (no tx) -> classify -> persist resultText (tx2)
        |                                                          |
        |                         failure classes (refusal, truncated, invalid_json, ...) --+--> applyLlmFailure (in-voice lines)
        v
 applyStored (tx3) -> applyLlmResult(job, resultText)
        |
        +-- npc_conversation:  extractJson -> raw.segments / legacy dialogue / prose
        |                         |
        |                         v
        |            segments.ts normalizeSegments(raw, present NPCs from DB)
        |              - cap 6, cap 600 code points, drop empty
        |              - kind not narration|dialogue -> narration
        |              - narration speaker := "The Keeper"
        |              - dialogue speaker matched to an NPC present (conversation NPC always
        |                allowed; NPCs at the character's location); matched -> canonical DB name + npcId;
        |                no match -> Keeper narration (neutral wording)
        |              - zero valid -> fallback ladder (salvage prose, else in-voice line)
        |
        +-- combat_narration:  parse segments (or salvage text) -> same normalizer (present = enemy names + location NPCs)
        +-- creation / world / skill / renown:  keeperSegments(server-composed prose)  (wrap, no model speaker)
        |
        v
 appendPrivateEvent / appendCreationEvent (kind, message = flattenSegments(segs), segments)
        |
        v
 event_private / event_creation row  ->  subscribed client reads message (legacy) or segments (Phase 47)
```

### Recommended Project Structure
```
spacetimedb/src/
├── helpers/segments.ts            # NEW pure module: types, normalize, flatten, fallback, keeper wrap (no spacetimedb/server import)
├── helpers/segments.test.ts       # NEW unit tests (SEG-01, SEG-04 clamps)
├── helpers/llm_segment_drills.test.ts   # NEW malformed-reply matrix over every narrative route (SEG-04)
├── helpers/events.ts              # EXTEND: trailing optional `segments` param on three helpers
├── helpers/llm_apply.ts           # EDIT: write one event row per reply with segments
├── helpers/combat_narration.ts    # EDIT: handleCombatNarrationResult uses the normalizer
├── schema/tables.ts               # EDIT: KeeperSegment type + optional column LAST on three event tables
├── data/llm_schemas.ts            # EDIT: COMBAT_NARRATION_SCHEMA (after approval)
├── data/llm_routes.ts             # EDIT: combat_narration json (after approval)
└── data/llm_layers.ts, keeper_bible.ts   # EDIT only after owner approval of 46-VOICE-CHANGES.md
scripts/llm/
├── golden_rules.mjs, sweep_rules.mjs, golden_set.mjs, golden_review.mjs, golden_run.mjs, golden.live.ts   # segment-shape readiness
```

### Pattern 1: one pure normalizer, canonical speakers from the database
**What:** The model's `speaker` string is only used to look up an NPC. The stored `speaker` is the literal `"The Keeper"` or the NPC's `name` read from the database; `speakerNpcId` is the database id. A model can therefore never invent or spoof a speaker, and an over-long or hostile speaker string is never stored.
**When to use:** every route that parses model segments (npc, combat). Server-wrapped routes always use the Keeper constant.
**Example:**
```typescript
// Source: this research (segments.ts design); cleanText wraps the existing truncateCodePoints and lone-surrogate repair from data/llm_layers.ts
export const SEGMENT_KINDS = ['narration', 'dialogue'] as const;
export const KEEPER_SPEAKER = 'The Keeper';
export const MAX_SEGMENTS = 6;
export const MAX_SEGMENT_CHARS = 600; // code points

export type Segment = { kind: 'narration' | 'dialogue'; speaker: string; text: string; speakerNpcId?: bigint };
export type PresentSpeaker = { id?: bigint; name: string };

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

export function normalizeSegments(raw: unknown, present: readonly PresentSpeaker[]): Segment[] {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_SEGMENTS * 2) : []; // bound work before per-item processing
  const out: Segment[] = [];
  for (const item of list) {
    if (out.length === MAX_SEGMENTS) break;
    if (item === null || typeof item !== 'object') continue;
    const text = cleanText((item as any).text);        // string only, lone surrogates repaired, controls stripped, trimmed, <= 600 code points
    if (text === '') continue;                           // empty segments are dropped
    const kind = (item as any).kind === 'dialogue' ? 'dialogue' : 'narration';
    if (kind === 'dialogue') {
      const who = present.find((p) => norm(p.name) === norm(String((item as any).speaker ?? '')));
      if (who) { out.push({ kind, speaker: who.name, text, ...(who.id !== undefined ? { speakerNpcId: who.id } : {}) }); continue; }
    }
    out.push({ kind: 'narration', speaker: KEEPER_SPEAKER, text });   // unknown kind, missing speaker, unmatched speaker -> narration
  }
  return out;                                            // [] means zero valid: caller runs the fallback ladder
}

export function flattenSegments(segs: readonly Segment[]): string {
  return segs.map((s) => (s.kind === 'dialogue' ? `${s.speaker} says, "${s.text}"` : s.text)).join('\n\n');
}
```

### Pattern 2: fallback ladder (never throws, never empty)
1. Parse JSON (existing tolerant `extractJson`); take `segments`.
2. `normalizeSegments` -> use if non-empty.
3. No usable segments but the reply has the legacy NPC `dialogue` string: a single dialogue segment from the conversation NPC (the speaker is certain). Narrow, deliberate exception: attribution is known, so it does not violate "NPC speech only in dialogue" (OQ2).
4. Else if the raw reply is usable prose (not JSON-shaped, at least a few letters, no refusal marker): one Keeper narration segment of the salvaged text, truncated. For combat this is the existing raw-text behavior; `stripNarrationSelfCorrection` stays in front of it. For `npc_conversation`, do not salvage raw model text into narration (it could be NPC speech, JSON debris or an injected string); use the in-voice line.
5. Else one Keeper narration segment with the in-voice fallback line (wording goes into the voice package; for NPC the current line is `${npc.name} mutters something unintelligible. (Try again.)`).

`message` is always `flattenSegments(result)`, so a consumer that ignores segments still sees plain story text.

### Pattern 3: extend, do not fork, the event helpers
Add one trailing optional parameter and write the column only when given:
```typescript
// Source: spacetimedb/src/helpers/events.ts (existing shape) + this research
import type { Segment } from './segments';
export function appendPrivateEvent(ctx: any, characterId: bigint, ownerUserId: bigint, kind: string, message: string, segments?: Segment[]) {
  return ctx.db.event_private.insert({ id: 0n, ownerUserId, characterId, kind, message, createdAt: ctx.timestamp, segments });
}
```
`segments: undefined` is accepted by the real SDK for an optional column `[VERIFIED: probe, ev_c insert]` and is dropped by the mock snapshot serializer (`serialize` skips undefined), so rows written by untouched callers snapshot identically.

**Mock pitfall (critical):** `combat_narration.test.ts`, `llm_executor.test.ts`, `llm_failure_drills.test.ts`, `llm_seam.test.ts`, `llm_sweeper.test.ts`, `race_ability.test.ts`, `renown_llm.test.ts`, `combat.test.ts` and `reducers/renown.test.ts` mock `./events` with a fixed export list (`appendSystemMessage, appendPrivateEvent, appendWorldEvent, appendNpcDialog, appendCreationEvent`). Any NEW function that `llm_apply.ts` imports from `./events` will be `undefined` in those suites. Keep all new logic in `segments.ts` (not mocked) and only extend the signatures of the existing exports.

### Anti-Patterns to Avoid
- **Storing the model's `speaker` string.** Canonicalize from the database; never echo model text into `speaker`.
- **Per-segment event rows.** Breaks reply grouping and ordering (ids are not sequential).
- **Putting `.optional()` on a persisted table.** Refused without a default.
- **Raising `maxTokens` in code.** The tuning test traces values to the measurement record.
- **Landing the combat route-kind switch before its route block changes.** The block still says "plain prose, no JSON"; ship the schema, route kind and block edits together after approval.
- **Adding new exports to `events.ts` that apply code calls** (mock pitfall above).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Code-point-safe truncation | `str.slice(0, 600)` | `truncateCodePoints` (`data/llm_layers.ts`) | Never splits an astral character; repo-standard (`creation_validate.ts` imports it) |
| Lone-surrogate repair | custom regex | the `LONE_SURROGATE` pattern used in `neutralizePlayerText` | Same behavior, already tested |
| Tolerant JSON extraction | new parser | `extractJson` (`llm_apply.ts`) / `extractJsonObject` (`sweep_rules.mjs`) | Handles fences and prose around the object |
| NPC pronouns and gender | new heuristics | `npcGender(row)`, `npcPronouns` (`data/npc_gender.ts`) | Single reader; keeper-pronouns rule |
| JSON schema conformance in golden rules | new validator | `schemaErrors` (`golden_rules.mjs`) | Already walks type/enum/required/items/anyOf |
| Segment validation in scripts | duplicate logic in `.mjs` | import `segments.ts` from `scripts/llm/*.mjs` (they already import `.ts` server validators, e.g. `creation_validate.ts`) | One contract, drift-free |
| Migration defaults | manual data migration | event-table optional column + `--break-clients` | Verified safe |

**Key insight:** the contract is small but every piece of it is a trust boundary (model text becoming stored speaker names). One pure module with the DB as the only source of speaker names removes the whole spoofing class.

## Runtime State Inventory

Not a rename/refactor phase, but an event-table schema change and a prompt-layer change touch runtime state. Answers per category:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Event tables are non-persistent (rows are delivered to subscribers and dropped); `npc_dialog` and `combat_narrative` hold plain text and keep it. No stored data carries a speaker today | None. Code edit only; no data migration |
| Live service config | None — verified: Anthropic key lives in private `llm_config`; no external service holds segment config | None |
| OS-registered state | None — verified: no scheduled task or service embeds a changed name | None |
| Secrets / env vars | `llm_config` key must survive. `--clear-database` would wipe it (Phase 41 recovery runbook) | Publish with `--break-clients` only; never `--clear-database` |
| Build artifacts | `src/module_bindings` (types.ts, `event_private_table.ts`, `event_creation_table.ts`, `event_location_table.ts`) go stale after the schema edit | Regenerate with `pnpm spacetime:generate`; commit |
| Prompt cache | A Keeper Bible edit changes `system[0]` for all ten routes (one cache write each after the first call); a route-block edit invalidates that route only | Expected, no action; mention in the voice package |

## Common Pitfalls

### Pitfall 1: the `events` mock export list
**What goes wrong:** a new helper exported from `events.ts` and called by `llm_apply.ts` is `undefined` under eight test suites' `vi.mock('./events', ...)`.
**Why:** those factories return only five functions.
**How to avoid:** new logic only in `segments.ts`; extend existing function signatures.
**Warning signs:** `TypeError: ... is not a function` in executor, drills, seam, sweeper tests.

### Pitfall 2: optional column on a persisted table
**What goes wrong:** publish refuses ("requires a default value annotation"), the executor is tempted to `--clear-database`, which wipes the stored API key.
**How to avoid:** only the three `event: true` tables get `.optional()` with no default; if segments are ever added to `combat_narrative` or `npc_dialog`, use `.default([])` and re-probe.

### Pitfall 3: column order
**What goes wrong:** a column added before `createdAt` is a reorder, not an append.
**How to avoid:** append after the last column (`createdAt`).

### Pitfall 4: the Phase 44 record replay trap
**What goes wrong:** `golden_run.test.mjs` fails at collection (0 tests run) because its pinned-record `describe` reads `.planning/phases/44-.../44-golden-run.json` (moved to `.planning/milestones/v2.2-phases/44-.../`). Repointing the path re-enables a replay that runs `evaluateGoldenItem` over the OLD recorded replies and asserts the failures equal the stored ones. After the segment rules land, old-shape npc and combat replies will fail new structure rules, so the replay conflicts.
**How to avoid:** repoint the path (it restores ~500 lines of pure golden-run tests that currently do not execute) and either skip replay for routes whose shape changed (documented list `['npc_conversation','combat_narration']`) or stamp the record with a shape version. Do not fix the other two baseline-failing files (`call_log_report`, `proof_rules`) or `measurement.results.test.ts`; Phase 46 does not touch them. See "Golden harness".

### Pitfall 5: combat tone lints are text-route rules
**What goes wrong:** `toneLint` runs `text_json_wrapper` (raw starts with `{`), `text_quotes` and `narration_sentences` (2 to 4 sentences over the raw reply) for `combat_narration`. A JSON reply fails the first and miscounts the third.
**How to avoid:** change those rules to run on the joined narration text of the segments; keep `exclamation` (and add the key `text` to `NARRATIVE_KEY`, otherwise exclamation marks inside segment text are not linted on any route).

### Pitfall 6: model quotes inside dialogue text
**What goes wrong:** the flattened `message` becomes `X says, ""..."" ` when the model wraps dialogue in quotes.
**How to avoid:** strip one matching pair of outer quotes from dialogue text in `cleanText` for dialogue segments; keep the model's inner quotes (they flatten fine). Straight quotes stay (existing tests and mocks pin straight quotes; the roadmap's curly quotes are typography for the client).

### Pitfall 7: scope of "narrative voice" is wider than `llm_layers.ts`
**What goes wrong:** the server-composed text wrapped into Keeper segments (skill and renown presentations, creation messages, arrival, failure lines) is itself first-person ("I find recklessness entertaining", "when you want me to try again"), third-person ("The Keeper of Knowledge regards you") or quoted Keeper speech, which is exactly what the narrator voice replaces. Leaving it makes the segmented feed inconsistent.
**How to avoid:** the voice package lists these strings (inventory below) and the owner decides how far to go; each change needs its pinned test updated (`llm_failure_drills.test.ts` "pinned inline lines", `pronoun_rules.test.ts`, characterization snapshots).

### Pitfall 8: `range_violation` blocks SEG-05's "passes mechanical rules"
**What goes wrong:** 44-TONE-FIXES Fix 2 left eight skill/perk/creation items failing `range_violation` because the route blocks never state the budgets; the owner chose nothing yet (options a/b/c). A narrator-voice golden run cannot "pass its mechanical rules" while that stands.
**How to avoid:** put Fix 2 in the voice package as an explicit decision item (OQ3). Do not weaken the rule to force a pass.

## Voice package inventory (for `46-VOICE-CHANGES.md`, SEG-03)

Everything below is text that changes the model's prompt or the stored Keeper line. The checkpoint must show before/after for each and nothing may be applied before approval. Pins that move with each edit are listed so the post-approval plan updates tests in the same commit.

| Surface | Today | Needed for Phase 46 | Pinned by |
|---|---|---|---|
| `KEEPER_BIBLE` IDENTITY, VOICE | Keeper described as the model's own identity; "speak to the player's own character as you... narrate everyone else in the third person" | Narrator framing: narrates the scene around "you"; speaker label "The Keeper"; no first person; Keeper he/his stays; examples 2 and 4 use third-person self-reference ("the Keeper notes", "The Keeper has seen") and example 3 is labelled `Keeper:`, so they are rewritten. Examples must stay 3 to 4 and free of banned phrases | `keeper_bible.test.ts` (size 5000 to 10000 chars, headings once in order, 3 to 4 examples, no banned phrases, pronoun rule); `pronoun_rules.test.ts` (`KEEPER_IT_OR_THEY` scan of source and snapshots) |
| Bible EXAMPLES/formatting | "plain prose only... when a route asks for JSON return only the JSON" | Add a short segments note (narration vs dialogue; speech only in dialogue) | same |
| `creation_race` block | "narrative is 2-3 sentences of sardonic Keeper commentary" | Narrator-voice wording, second person, no "the Keeper" self-reference | `llm_layers.test.ts` (`keeps the exact-race-name rule`, `as you` regex over eight routes) |
| `creation_class_reveal`, `creation_class` | class/ability descriptions "speak to the arrival as you" | Voice alignment only | `llm_layers.test.ts` (JSON-only ending line on stage blocks, no it/they) |
| `world_gen_start`, `world_gen` | "You narrate as though you are finally bothering to mention a place" | Voice alignment; "When a description speaks of the traveler, it says you" pin must stay | `llm_layers.test.ts` (`Set gender to male or female`, `he or she`, the traveler sentence) |
| `skill_gen`, `renown_perk_gen` | "sardonic commentary from the Keeper, spoken to the character as you" | Wording so descriptions read as narration, not "The Keeper notes ..." (44 Fix 1, minus the retracted first person) | `llm_layers.test.ts` |
| `npc_conversation` | reply shape has `dialogue`; rule list | New reply shape with `segments`; narration vs dialogue rules; only the NPC (or a present NPC) speaks in dialogue; the player's speech is never a speaker; loud speech by word choice, no exclamation marks (44 Fix 3); one short narration segment (token headroom) | `llm_layers.test.ts` (`describes the JSON reply`: keys `dialogue`, `internalThought`, `effects`, `memoryUpdate`; `Gender line`) |
| `combat_narration` | "2-4 sentences of plain prose and nothing else. No JSON" and pinned phrases | JSON segments reply; Keeper narration in second person; a lone player is only "you" (never "a woman", "a man", "the stranger"; 44 Fix 3); enemy speech only if the enemy speaks as a person | `llm_layers.test.ts` (`2-4 sentences of plain prose`, `EXACT names`, `Never contradict`, `not /valid JSON/i`, draft/self-correction line, outro second-person line, `a beast may be it`); `claude_request.test.ts` snapshot |
| Fixed Keeper strings composed by the apply layer | `llm_apply.ts` presentations (skill, renown, creation messages, arrival), `CREATION_MALFORMED_LINE`, failure lines; `creation.ts` static intro is first person ("I am The Keeper of Knowledge") | Decision item: which of these move into the narrator voice (those that become Keeper narration segments) and which stay as is (system/status lines). Also the in-voice fallback wording for malformed replies (Claude's discretion, owner sees it) | `llm_failure_drills.test.ts` pinned inline lines; snapshots; `pronoun_rules.test.ts` |
| 44 Fix 2 (range budgets) | not applied | Owner decision a/b/c (OQ3) | `llm_layers.test.ts` (skill/renown/class guidance), `golden_rules.test.mjs` |

Note for the package: the Keeper Bible was approved verbatim in Phase 40 (user, 2026-09-30) and any edit changes the cached prefix shared by every route, so the package must say so.

## Code Examples

### Segment type and column (module)
```typescript
// Source: verified by local probe 2026-10-05; shape per spacetimedb 2.10.1 dist/lib/type_builders.d.ts
// schema/tables.ts, defined once above the three event tables
export const KeeperSegment = t.object('KeeperSegment', {
  kind: t.string(),                 // 'narration' | 'dialogue'
  speaker: t.string(),              // 'The Keeper' or the NPC's stored name
  text: t.string(),
  speakerNpcId: t.u64().optional(), // set for dialogue by a known NPC (Phase 47 keyword links)
});

// EventPrivate, EventLocation, EventCreation: add as the LAST column of each
segments: t.array(KeeperSegment).optional(),
```

### NPC apply (sketch)
```typescript
// Source: this research; replaces the dialogue/appendNpcDialog/appendPrivateEvent block in applyNpcConversationResult
const present = [
  { id: npc.id, name: npc.name },                                            // the conversation NPC is always allowed
  ...[...ctx.db.npc.by_location.filter(character.locationId)].map((n: any) => ({ id: n.id, name: n.name })),
];
const segments = npcSegmentsFromReply(data, npc, present);                    // fallback ladder inside; never empty
const dialogueText = segments.filter((s) => s.kind === 'dialogue').map((s) => s.text).join(' ');
appendNpcDialog(ctx, charId, npc.id, `${npc.name}: "${dialogueText || '...'}"`);
appendPrivateEvent(ctx, charId, character.ownerUserId, 'npc', flattenSegments(segments), segments);
```

### Server-wrapped route (skill_gen sketch)
```typescript
appendPrivateEvent(ctx, charId, character.ownerUserId, 'narrative', presentation, keeperSegments(presentation));
```
`keeperSegments(text)` splits on blank lines into at most 6 Keeper narration segments (each truncated to 600 code points, an overflowing tail merged into the last segment or dropped by rule; the planner picks one rule and tests it).

### Offline verification commands
```bash
# module unit tests (about 18 s for everything)
cd spacetimedb && pnpm exec vitest run src/helpers/segments.test.ts
# whole module suite (baseline 58 files / 3144 tests, 2 known failures in measurement.results.test.ts)
cd spacetimedb && pnpm exec vitest run
# scripts (baseline: 3 collection failures, 353 tests pass in 6 files)
pnpm exec vitest run scripts/llm
# golden dry run (free, builds 27 requests, byte-stable, none sent)
pnpm exec vitest run --config scripts/llm/vitest.live.config.ts golden
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| One flat `message` string with in-text attribution | Typed `segments` plus a flattened `message` | Phase 46 | Client renders labelled lines (Phase 47) from `segments`; logs and admin views keep reading `message` |
| Combat narration as plain prose (text route) | Structured-output JSON with `segments` | Phase 46 (after approval) | Provider enforces `kind` enum and required fields; apply clamps count/length |
| Keeper speaks as himself in first/third person | Second-person scene narrator | Phase 46 (owner retracted the first-person direction) | Bible examples and pinned tests move |

**Deprecated/outdated:** the `dialogue` field in the NPC reply shape (replaced by `segments`; salvaged, not supported, in the apply ladder); `text_json_wrapper`/`text_quotes`/`narration_sentences` as raw-text combat lints; `sweep.live.ts` treating combat as a text route.

## Golden harness (SEG-05 readiness)

Facts `[VERIFIED: source read, baseline run]`:
- 27 items (npc 6, cre 5, wld 4, skl 3, ren 2, cmb 2, adv 5), inputs from `sweep_fixtures.mjs`. Dry run passes today: 27 requests, byte-stable, worst-case reservation 574,433 micro-USD (cap `$2`, stop line `$1.80`).
- `evaluateGoldenItem` decides json vs text from `LLM_ROUTES[route].output.kind`, so flipping combat to json automatically makes it run `schemaErrors(cfg.output.schema, obj)`; `schemaErrors` already handles array/enum/required/items.
- `structuralCheck` in `sweep_rules.mjs`: npc requires non-empty `dialogue` (`missing_dialogue`); combat requires non-empty text (`empty_text`). Both must change to a `missing_segments` check (zero valid segments after normalization). Shared with `sweep.live.ts` and `sweep_rules.test.mjs`.
- `playerPronounHit(text, ex)` and the lone-beast rules read `o.text`, which becomes the raw JSON string for a JSON route; make them read the joined narration text.
- `golden.live.ts` hard-codes `PHASE_DIR` to the moved Phase 44 folder for `RECORD_PATH` and `REVIEW_PATH`. A paid `run` refuses when the record at that path is `recorded`; the new narrator-voice run must write a NEW record. Repoint to `.planning/phases/46-structured-keeper-replies/46-golden-run.json` and `46-golden-review.html` (and `golden-verdicts` equivalents if the review code names them). `drills.live.ts`, `prove-live.live.ts` also point at the moved folder but are untouched by this phase.
- `golden_review.mjs` shows `it.text` (raw reply, JSON string for JSON routes) as a `pre`. The owner is judging "reads like a book", so render segments as labelled lines (flatten with the same function) in the review page, still as text nodes (adversarial replies are never put into markup).

### Rule changes (recommended, tests in `golden_rules.test.mjs` which runs today)
| Change | Detail |
|---|---|
| New rule `segments_invalid` | After normalization with the item's allowed speakers, the reply (a) has zero valid segments, or (b) a model segment violated a clamp the server would have to fix (more than 6, text over 600 code points, unknown kind, narration speaker not "The Keeper", dialogue speaker not in the allowed set). Mirrors the server contract by importing `segments.ts` |
| New rule `speaker_not_present` (optional, could fold into `segments_invalid`) | Dialogue speaker not equal to `item.input.npc.name` (npc items) or an enemy name / listed present NPC (combat items). Needs `expectations.presentSpeakers` or derives from `item.input` |
| New rule `keeper_first_person` | Narration segment text outside quoted spans contains `I`, `me`, `my` as the Keeper speaking about himself; encodes "no first-person Keeper". Optional but cheap and it proves the retracted direction mechanically |
| New heuristic `npc_speech_in_narration` (optional) | A narration segment with a quoted span of at least three words whose sentence names the NPC. Heuristic: expect false positives (signs, songs); recommend a note rather than a failure |
| `exclamation` | Add `text` to `NARRATIVE_KEY` so segment text is linted on every route |
| `narration_sentences`, `text_json_wrapper`, `text_quotes` | Compute on the joined narration text; drop the two text-wrapper rules for combat |
| `GOLDEN_RULES` order | Pinned by tests; add the new ids to the `GOLDEN_SPECIFIC` list (planner picks the position) and update the id-list tests |
| Items | Add `expectations.presentSpeakers` for combat items (enemy names for cmb items already exist as `enemyNames`); npc items derive the NPC name from `input.npc.name`. No new items are required; optional: one extra npc item whose player message tries to make the NPC speak as another NPC or as "The Keeper" (spoof probe) |

### Why the baseline suites fail and what is needed
- `call_log_report.test.mjs`, `golden_run.test.mjs`, `proof_rules.test.mjs`: each reads a Phase 44 JSON record at module/describe level from `.planning/phases/44-live-verification-and-tone-eval/`; that folder moved to `.planning/milestones/v2.2-phases/44-live-verification-and-tone-eval/` (files present there) `[VERIFIED]`. The suite errors at collection so zero tests in those files run.
- `measurement.results.test.ts` (module): the same reason for `.planning/phases/39-*`.
- For SEG-05 readiness, fix only `golden_run.test.mjs` (Phase 46 edits `golden_run.mjs`-adjacent code and must not do it blind) with the replay guard from Pitfall 4. Leave the others.

## Characterization suites that must stay green, and snapshots that legitimately change

Green baseline before any edit `[VERIFIED: ran 2026-10-05]`: module 58 files / 3144 tests, only `measurement.results.test.ts` red (2 tests, baseline); `scripts/llm` 353 tests pass in 6 files, 3 files fail at collection (baseline).

| Suite | Role | Expected effect of Phase 46 |
|---|---|---|
| `helpers/llm_apply.characterization.test.ts` (+ `.snap`, 152 snapshots) | Phase 40 to 42 apply behavior | 80 snapshots contain a narrative event row (npc 37, narrative 24, creation 14, combat_narration 5) and gain a `segments` key where the apply now writes one. `message` stays byte-identical wherever the old text maps cleanly. Legitimate behavior changes: `falls back to "..." when the reply has no dialogue`, `QUIRK: invalid JSON writes the unintelligible messages`, and the four combat quirks (`JSON without a narrative field stores the JSON text itself`, `raw prose falls back to the trimmed text`, `code-fenced JSON narrative`, round-prefixed broadcast). Re-record with `vitest -u` and review that every diff is only the added `segments` key or those named cases |
| `helpers/llm_apply.test.ts`, `llm_seam.test.ts`, `llm_executor.test.ts`, `llm_failure_drills.test.ts` | seam/executor/drills (events mocked) | Stay green if `events` mock keeps its export list (Pitfall 1) and failure lines unchanged; pinned inline lines move only if the owner approves new copy |
| `helpers/claude_request.test.ts` (+ snap, 10 route snapshots) | request builder | `combat_narration` body snapshot changes (json route, `output_config.format`, edited block); every snapshot embeds a Bible placeholder so a Bible edit does not change them; edited route blocks change their own snapshots |
| `data/llm_routes.test.ts`, `llm_schemas.test.ts` (+ snap, 7), `llm_layers.test.ts`, `keeper_bible.test.ts`, `pronoun_rules.test.ts`, `llm_tuning.test.ts` | pins | routes test (combat json), schemas test (add combat schema, union counts, snapshot), layers test (npc keys, combat pins), tuning test must stay unchanged and green |
| `helpers/combat_narration.test.ts`, `events.test.ts`, `creation_validate.test.ts`, `world_gen.test.ts`, `skill_gen.test.ts`, `renown_llm.test.ts`, `creation_generation.test.ts`, `schema/llm_privacy.test.ts`, `llm_absence.test.ts` | adjacent | Mostly unchanged; `events.test.ts` gains segment cases; `llm_privacy`/`llm_absence` must stay green (public `llm_*` set is empty) |
| Root `src/*.test.ts` (Phase 45) | client | Unchanged; the client reads no event table (`grep` finds `event_private` etc. only in `src/module_bindings/index.ts`) |

## Client impact

- Regenerate `src/module_bindings` (`pnpm spacetime:generate`): adds the `KeeperSegment` type and `segments` option fields on `event_private`, `event_location` and `event_creation` rows. No hand edits (generated; project hard rule).
- Phase 45 client code (`src/net`, `src/session`, `src/frame`) subscribes to no event table `[VERIFIED: grep]`; no client change is required and none should be made in this phase.
- Phase 47 contract notes for the plan summary: render segments as text nodes only (no HTML or `{{color}}` markup interpretation of segment text); `speakerNpcId` is optional; `message` stays the fallback for rows without `segments`.

## Security Domain

Required (`security_enforcement` absent = enabled). ASVS L1.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | unchanged (`ctx.sender` stays the principal) |
| V3 Session Management | no | unchanged |
| V4 Access Control | partly | Event tables inherit the visibility `message` has today. No new exposure, no new table; `llm_*` tables stay private (public `llm_*` set pinned empty by `llm_privacy.test.ts`) |
| V5 Input Validation | yes | `segments.ts` normalizer: type checks, kind allowlist, code-point caps, canonical speakers from the DB, count cap before per-item work |
| V6 Cryptography | no | no new secrets; the Anthropic key path is untouched |
| V7 Error handling and logging | yes | do not log reply text or parse-error snippets (`JSON.parse` messages quote the input); log only route, job and a fixed reason; use `redactSecrets` where an error string is logged |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Speaker spoofing: a reply names an NPC who is not present, "The Keeper", a player character, or another real person | Spoofing | Dialogue speaker is matched against NPCs present (conversation NPC always; NPCs at the character's location; for combat, listed enemy names and location NPCs); stored speaker is the DB name or the Keeper constant; unmatched becomes Keeper narration with fixed neutral wording; the model string is never stored |
| Prompt injection through player or NPC text into speaker fields | Spoofing / Tampering | Player text stays inside `<player_input>` tags (existing); speaker is never taken from the model; golden `adv-3`/`adv-4`/`adv-5` and an optional spoof item probe it; `injection_compliance`/`prompt_leak` rules run over every segment string |
| Impersonation inside segment text (a dialogue text that reads "The Keeper says, ...") | Spoofing | Cosmetic and bounded; clients render text nodes only (Phase 47); `flattenSegments` builds attribution from the validated speaker, not from model text |
| Oversize or many-segment replies (DoS, feed flooding) | Denial of service | Slice before processing, 6 segments, 600 code points, provider `max_tokens` already caps total size; truncate by code point; strip control characters and lone surrogates |
| Malformed reply breaking the feed or the transaction | Denial of service | Normalizer and ladder are total functions (never throw); apply keeps writing a single Keeper narration line; a throw would roll back the whole apply (`applyStored` retries then fails the job) |
| Markup injection via the flattened `message` | Tampering | Segments carry plain text; the old `{{color:...}}` console markup is not used by the new client; Phase 47 must not interpret markup in segment text |
| Pre-existing: `event_private` and `event_creation` are `public: true` tables with no per-owner view or visibility filter in the module (`grep` for `clientVisibilityFilter` finds nothing; no view over them) | Information disclosure | Not widened by this phase (segments hold exactly what `message` already holds). `[ASSUMED]` that a client can subscribe to all rows of a public event table; recommend a separate todo, not Phase 46 scope |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | tests, scripts | yes | v22.23.2 | — |
| pnpm | root and module scripts | yes | 11.23.0 | — |
| SpacetimeDB CLI | build, publish, generate | yes | 2.10.1 | — |
| Local SpacetimeDB server | local publish check | yes (ping 200, `127.0.0.1:3000`, default `***` server is local) | 2.10.1 | `spacetime start` (see `.claude/skills/run-local`) |
| Anthropic key in `llm_config` | paid golden run only (deferred) | not needed this phase | — | none; no paid call happens |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none. Do not target maincloud; the CLI default server is local.

## Validation Architecture

Enabled (`workflow.nyquist_validation: true`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 5.0.2 |
| Config file | `spacetimedb/` (default `vitest run`, no config file needed) and root `vite.config.ts`; live files use `scripts/llm/vitest.live.config.ts` |
| Quick run command | `cd spacetimedb && pnpm exec vitest run src/helpers/segments.test.ts src/helpers/llm_segment_drills.test.ts src/helpers/events.test.ts` |
| Full suite command | `cd spacetimedb && pnpm exec vitest run` and `pnpm exec vitest run scripts/llm` (known baseline failures excluded) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEG-01 | Segment type, kind allowlist, narration speaker is "The Keeper", dialogue speaker canonicalized to a present NPC else narration, caps (6, 600 code points, astral-safe), empty dropped | unit | `cd spacetimedb && pnpm exec vitest run src/helpers/segments.test.ts` | no, Wave 0 |
| SEG-01 | `COMBAT_NARRATION_SCHEMA` lints clean, union/optional counts, `combat_narration` is a json route, request carries `output_config.format` | unit | `cd spacetimedb && pnpm exec vitest run src/data/llm_schemas.test.ts src/data/llm_routes.test.ts src/helpers/claude_request.test.ts` | yes, edit |
| SEG-01 | NPC reply yields a Keeper narration segment and a separate dialogue segment; NPC speech only in dialogue segments; the player is never a speaker | integration (apply) | `cd spacetimedb && pnpm exec vitest run src/helpers/llm_apply.test.ts` | yes, edit |
| SEG-02 | Optional `segments` column on exactly `event_private`, `event_location`, `event_creation`, absent on `event_world`/`event_group`; named type `KeeperSegment` | schema | `cd spacetimedb && pnpm exec vitest run src/schema/event_segments.test.ts` | no, Wave 0 (uses `schema_recorder`) |
| SEG-02 | Helpers write `segments` when given, omit when not; `message` equals `flattenSegments`; existing callers unchanged | unit | `cd spacetimedb && pnpm exec vitest run src/helpers/events.test.ts` | yes, edit |
| SEG-02 | Stored event shape per route (npc, combat, creation x3, skill, renown, arrival) holds one row with segments and a plain `message` | characterization | `cd spacetimedb && pnpm exec vitest run src/helpers/llm_apply.characterization.test.ts` | yes, re-record reviewed |
| SEG-02 | Local publish accepts the schema with `--break-clients` and no clear; bindings regenerate cleanly | manual (local server) | `spacetime publish uwr -p spacetimedb --server local --break-clients` then `pnpm spacetime:generate`; `git diff --stat src/module_bindings` shows only the three tables and `types.ts` | manual-only (needs the local server; never maincloud) |
| SEG-03 | No Bible/route-block edit is applied before approval: `git diff` of `keeper_bible.ts` and `llm_layers.ts` is empty at the checkpoint; after approval the diff equals the approved package; pinned layer/Bible tests updated and green | manual gate plus unit | `git diff --quiet <phase-base> -- spacetimedb/src/data/keeper_bible.ts spacetimedb/src/data/llm_layers.ts` (pre-approval); `cd spacetimedb && pnpm exec vitest run src/data/llm_layers.test.ts src/data/keeper_bible.test.ts src/data/pronoun_rules.test.ts` | manual-only (owner approval is content judgment) |
| SEG-04 | Malformed-reply matrix over every narrative route: bad JSON, valid JSON without segments, unknown kind, missing speaker, empty/whitespace text, zero valid, over 6, over 600, spoofed speaker, markup/control chars, fenced JSON; each ends in exactly one Keeper narration segment (or the specified wrap) and a plain `message`, never a throw and never a second event | unit (table-driven) | `cd spacetimedb && pnpm exec vitest run src/helpers/llm_segment_drills.test.ts` | no, Wave 0 |
| SEG-04 | Offline failure drills (`llm_failure_drills.test.ts`) stay green and gain the segment cases for failure lines (the `drills.live.ts` drills are live infrastructure drills, not this) | unit | `cd spacetimedb && pnpm exec vitest run src/helpers/llm_failure_drills.test.ts` | yes, extend |
| SEG-05 | Golden rules for the segment shape; items carry expectations; `GOLDEN_RULES` order; combat tone lints on joined text; `NARRATIVE_KEY` covers `text` | unit | `pnpm exec vitest run scripts/llm/golden_rules.test.mjs scripts/llm/sweep_rules.test.mjs scripts/llm/golden_review.test.mjs` | yes, edit |
| SEG-05 | Golden dry run builds all 27 production requests (combat now with `output_config.format`), byte-stable, worst case under the stop line | dry (free) | `pnpm exec vitest run --config scripts/llm/vitest.live.config.ts golden` | yes |
| SEG-05 | `golden_run` pure rules restored (path fix) and replay guarded for changed-shape routes | unit | `pnpm exec vitest run scripts/llm/golden_run.test.mjs` | yes, edit (currently fails at collection) |
| SEG-05 | Paid golden run and tone sign-off | manual, deferred to end of milestone | `GOLDEN_LIVE_RUN=run pnpm exec vitest run --config scripts/llm/vitest.live.config.ts golden` only after the owner approves the cost | deferred; no paid call this phase |

### Sampling Rate
- **Per task commit:** the quick run command plus the one suite for the touched layer.
- **Per wave merge:** `cd spacetimedb && pnpm exec vitest run` and `pnpm exec vitest run scripts/llm`.
- **Phase gate:** full module suite green (only the two `measurement.results.test.ts` baseline failures allowed), `scripts/llm` green apart from the two untouched baseline files, golden dry run green, local publish and bindings regeneration done, voice checkpoint approved and its diff verified.

### Wave 0 Gaps
- [ ] `spacetimedb/src/helpers/segments.test.ts` — SEG-01, SEG-04 clamp and canonicalization cases
- [ ] `spacetimedb/src/helpers/llm_segment_drills.test.ts` — SEG-04 matrix, driven through `applyLlmResult` with the real events (not the mocked module) so the stored row shape is asserted
- [ ] `spacetimedb/src/schema/event_segments.test.ts` — SEG-02 column presence and absence via `schema_recorder`
- [ ] `golden_run.test.mjs` path repoint plus replay guard — SEG-05 coverage restoration
- [ ] Framework install: none

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The compiled grammar for the combat segments schema (array of objects with an enum) is accepted live by Sonnet 5.5 structured outputs; only checked against the repo linter, never against the provider | Segment schema | Combat narration would fail as `bad_request`; discovered only at the deferred paid run. Low risk (simple shape, similar to compiled schemas) |
| A2 | A model prompted for `segments` in text-JSON (NPC) mostly returns the shape and keeps NPC speech in dialogue segments | Per-route map | The fallback ladder absorbs failures, but tone quality and `segments_invalid` rate are only measurable in the paid golden run |
| A3 | A re-sweep of `npc_conversation` tuning may be needed if the added narration segment pushes output near 512 tokens | Token headroom | Billed `truncated` failures on NPC replies until re-tuned; owner decides spend (OQ4) |
| A4 | Any client can subscribe to all rows of a `public` event table, so `event_private` content is readable by other players (pre-existing) | Security | If wrong the exposure does not exist; if right it is unchanged by this phase but should become its own todo |
| A5 | The same publish behavior (`--break-clients`, no clear) holds on maincloud | Schema migration | Owner-only deploy; re-check the plan output before applying there |
| A6 | Phase 47 renders segment text as text nodes, not HTML | Client impact | If it used `v-html` on segment text, injected markup would render; contract note passes this to Phase 47 |

## Open Questions

1. **OQ1: do creation/world/skill/renown replies need model-emitted segments, or is server wrapping enough?**
   - What we know: SEG-01 text says routes "return segments"; CONTEXT also says mechanical routes keep their structure and flavor text is "stored as Keeper narration segments, not re-shaped". Wrapping needs no schema, tuning or grammar change.
   - Unclear: whether the owner expects, say, the race `narrative` to arrive pre-segmented from the model.
   - Recommendation: wrap server-side (Keeper narration only; the Keeper never needs dialogue segments in those routes). Flag in the plan summary; revisit only if the owner asks.
2. **OQ2: salvage the legacy NPC `dialogue` field as a dialogue segment?**
   - What we know: attribution is certain (the conversation NPC), and it keeps the legacy shape harmless while prompts and code land in different waves.
   - Unclear: it is a strict reading exception to "zero valid segments -> single Keeper narration".
   - Recommendation: allow it as ladder step 3; the golden `segments_invalid` rule still flags a reply that omits `segments`.
3. **OQ3: owner decision on 44 Fix 2 (range budgets: a, b or c)?**
   - What we know: `range_violation` is the dominant mechanical failure; SEG-05 requires passing mechanical rules.
   - Recommendation: include the choice in `46-VOICE-CHANGES.md`; do not weaken the rule unilaterally.
4. **OQ4: re-sweep cost if NPC tokens run over?**
   - Recommendation: decide after the deferred golden run; include a re-sweep line in the end-of-milestone cost estimate.
5. **OQ5: the existing `say` echo (`You say to ${npc.name}: "..."`, kind `say`) in `talk_to_npc`.**
   - What we know: it is a server-written event, not a model segment; CONTEXT says player text is not echoed as "You say" in segments.
   - Recommendation: leave the server echo untouched in this phase (it is not a segment); note it for Phase 47's feed design.
6. **OQ6: scope of the narrator voice over fixed server strings (inventory above).**
   - Recommendation: the owner decides per row in the voice package; default to only the strings that become Keeper narration segments.
7. **OQ7: combat dialogue allow-list.**
   - Recommendation: allow dialogue only for speakers present (NPCs at the location plus enemy display names listed in the stored summary); everything else becomes Keeper narration. The simpler alternative (no dialogue in combat) is also valid; the owner can choose in the voice package.

## Sequencing recommendation for the planner

1. **Plumbing (no owner approval needed, nothing prompts the model differently):** `segments.ts` + tests; `KeeperSegment` and the optional column on three event tables; events helper signatures; apply-layer writes one row with segments for every narrative route, using the salvage ladder (legacy shapes keep working); `llm_segment_drills.test.ts`; schema test; characterization re-record; local publish with `--break-clients`; bindings regenerate. This wave leaves prompts, routes and the Bible untouched.
2. **Golden readiness (offline):** rules, items, review rendering, `golden.live.ts` paths, `golden_run.test.mjs` path fix and replay guard, dry run green.
3. **Voice package + blocking checkpoint:** draft `46-VOICE-CHANGES.md` with every before/after (Bible, route blocks, new NPC reply shape, combat JSON route block, fallback line wording, fixed-string inventory, Fix 2 decision). Pause for owner approval. No layer edit before this.
4. **After approval (one commit with its tests):** apply the approved edits; flip `combat_narration` to a json route with its schema; update `llm_layers.test.ts`, `keeper_bible.test.ts`, `llm_routes.test.ts`, `llm_schemas.test.ts`, `claude_request.test.ts` snapshots, `sweep.live.ts` JSON_ROUTES; run the golden dry run.
5. **Deferred, not this phase:** paid golden run, tone sign-off, optional NPC re-sweep.

## Project Constraints (from CLAUDE.md and memory)

- SpacetimeDB TS rules: `table(OPTIONS, COLUMNS)`; indexes in options; schema via `schema({...})` default export; do not invent APIs (everything above is checked against the installed 2.10.1 package and a live probe); do not edit generated bindings; reducers deterministic; object-syntax reducer calls.
- Feature checklist (backend plus client wiring): this phase is backend only; the client wiring (subscribe and render) is Phase 47. The checklist item "call the reducers from the UI" does not apply because no new reducer is added.
- Editing behavior: smallest change; do not touch unrelated files or configs.
- Prefer `fail()` over `SenderError` where character context exists (not needed here; normalizers do not throw).
- Greenfield rule: no backups or compatibility shims; local `--clear-database` only if schema needs it (it does not here and would wipe the stored key: avoid).
- Never auto-publish to maincloud; local publish `spacetime publish uwr -p spacetimedb` (CLI flag is `-p`); add `--break-clients`.
- Server is the source of truth; the client imports from `spacetimedb/src/data/` rather than duplicating constants (segment kind and speaker constants live in the server module).
- Unit tests ship in every phase (all of the above are test-bearing).
- keeper-pronouns rule: Keeper he/his; every NPC male or female; player always "you".
- no-ui-specs: no UI-SPEC for this phase (backend only).

## Sources

### Primary (HIGH confidence)
- Local probe against SpacetimeDB 2.10.1 (scratch databases `seg-probe-46`, `seg-probe-46b`, deleted): migration outcomes, insert behavior, generated binding shapes.
- `spacetimedb/node_modules/spacetimedb/dist/lib/type_builders.d.ts` (2.10.1): `t.object(name, obj)`, `t.array`, `.optional()`, `.default()` signatures.
- Repo source read: `helpers/llm_apply.ts`, `helpers/combat_narration.ts`, `helpers/events.ts`, `helpers/claude_request.ts`, `helpers/llm_executor.ts`, `helpers/schema_lint.ts`, `helpers/schema_recorder.ts`, `data/llm_schemas.ts`, `data/llm_routes.ts`, `data/llm_layers.ts`, `data/keeper_bible.ts`, `data/llm_tuning.ts`, `data/npc_gender.ts`, `schema/tables.ts`, `reducers/npc_interaction.ts`, `scripts/llm/*`.
- Baseline test runs (2026-10-05): module suite and `scripts/llm`, golden dry run.
- Phase 41-10 and 41-18 summaries (migration precedents), `44-TONE-FIXES.md` (voice and range findings).

### Secondary (MEDIUM confidence)
- spacetimedb.com/docs/databases/automatic-migrations and /docs/tables/default-values (adding columns requires a default and goes at the end; silent on optional columns and event tables, which the probe settles).

### Tertiary (LOW confidence)
- None used for decisions; items needing live confirmation are in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; installed versions verified.
- Architecture: HIGH — apply paths read from source; migration verified live.
- Pitfalls: HIGH for mock/test/migration mechanics (reproduced or read); MEDIUM for model compliance and token headroom (needs the paid run).

**Research date:** 2026-10-05
**Valid until:** 2026-11-04 (stable; re-check if the SpacetimeDB SDK or Sonnet model changes)
