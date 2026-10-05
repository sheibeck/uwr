# Phase 46: Structured Keeper Replies - Pattern Map

**Mapped:** 2026-10-05
**Files analyzed:** 22 new/modified
**Analogs found:** 21 / 22 (one with partial match only)

Line numbers refer to the tree at the time of mapping. Excerpts are copied verbatim from the analog.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `spacetimedb/src/helpers/segments.ts` (NEW) | utility (pure) | transform | `spacetimedb/src/data/llm_layers.ts` (`truncateCodePoints`, `neutralizePlayerText`) + `helpers/combat_narration.ts` (`stripNarrationSelfCorrection`) | role-match |
| `spacetimedb/src/helpers/segments.test.ts` (NEW) | test | transform | `helpers/events.test.ts` style plus `data/llm_layers.test.ts` | role-match |
| `spacetimedb/src/helpers/llm_segment_drills.test.ts` (NEW) | test | request-response (apply, table-driven) | `helpers/llm_failure_drills.test.ts` | exact |
| `spacetimedb/src/schema/event_segments.test.ts` (NEW) | test | schema | `schema/llm_privacy.test.ts` (uses `schema_recorder`) | role-match |
| `spacetimedb/src/schema/tables.ts` (EDIT) | model | CRUD | `EventPrivate` / `EventLocation` / `EventCreation` in the same file | exact |
| `spacetimedb/src/helpers/events.ts` (EDIT) | service (helper) | CRUD | itself (`appendPrivateEvent` etc.) | exact |
| `spacetimedb/src/helpers/events.test.ts` (EDIT) | test | CRUD | itself | exact |
| `spacetimedb/src/helpers/llm_apply.ts` (EDIT) | service | event-driven (stored reply apply) | itself (`applyNpcConversationResult`, skill/renown/creation applies) | exact |
| `spacetimedb/src/helpers/combat_narration.ts` (EDIT) | service | event-driven | itself (`handleCombatNarrationResult`) | exact |
| `spacetimedb/src/data/llm_schemas.ts` (EDIT, post-approval) | config | transform | `SKILL_GENERATION_SCHEMA` (array-of-object schema) | exact |
| `spacetimedb/src/data/llm_routes.ts` (EDIT, post-approval) | config | request-response | itself (`LLM_ROUTES` entries) | exact |
| `spacetimedb/src/data/llm_layers.ts`, `keeper_bible.ts` (EDIT, post-approval) | config (prompt) | n/a | themselves | exact |
| `.planning/phases/46-.../46-VOICE-CHANGES.md` (NEW) | doc | n/a | none in codebase (see No Analog) | none |
| Pinned tests: `llm_layers.test.ts`, `keeper_bible.test.ts`, `llm_routes.test.ts`, `llm_schemas.test.ts`, `claude_request.test.ts`, `pronoun_rules.test.ts` (EDIT) | test | n/a | themselves | exact |
| `helpers/llm_apply.characterization.test.ts` + `.snap` (re-record) | test | n/a | itself | exact |
| `scripts/llm/sweep_rules.mjs` (EDIT) | utility | transform | itself (`structuralCheck`, `toneLint`) | exact |
| `scripts/llm/golden_rules.mjs` (EDIT) | utility | transform | itself (`GOLDEN_SPECIFIC`, `evaluateGoldenItem`, `schemaErrors`) | exact |
| `scripts/llm/golden_set.mjs`, `golden_review.mjs`, `golden_run.mjs` (EDIT) | utility | batch | themselves | exact |
| `scripts/llm/golden.live.ts` (EDIT) | config/test | batch | itself (`PHASE_DIR`, `RECORD_PATH`) | exact |
| `scripts/llm/sweep.live.ts` (EDIT) | test | batch | itself (`JSON_ROUTES`) | exact |
| `scripts/llm/golden_run.test.mjs` (EDIT) | test | batch | itself | exact |
| `src/module_bindings/*` (REGENERATE only) | generated | n/a | `pnpm spacetime:generate` | n/a |

## Pattern Assignments

### `spacetimedb/src/schema/tables.ts` (model, CRUD)

**Analog:** `EventPrivate` (lines 1366-1384), `EventLocation` (1349-1364), `EventCreation` (1950-1966). All three are `event: true` tables. Column goes LAST (after `createdAt`).

**Existing shape to extend** (lines 1366-1384):
```typescript
export const EventPrivate = table(
  {
    name: 'event_private',
    public: true,
    event: true,
    indexes: [
      { accessor: 'by_owner_user', algorithm: 'btree', columns: ['ownerUserId'] },
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    ownerUserId: t.u64(),
    characterId: t.u64(),
    message: t.string(),
    kind: t.string(),
    createdAt: t.timestamp(),
  }
);
```
**Optional-column precedent in the same group** (line 1361, `EventLocation`): `excludeCharacterId: t.u64().optional(),`.

**Add** (from RESEARCH, probe-verified): define once above `EventLocation`:
```typescript
export const KeeperSegment = t.object('KeeperSegment', {
  kind: t.string(), speaker: t.string(), text: t.string(), speakerNpcId: t.u64().optional(),
});
// last column of EventLocation, EventPrivate, EventCreation only:
segments: t.array(KeeperSegment).optional(),
```
Notes: `t.object` requires a name string in 2.10. No other `t.object(` in `spacetimedb/src` was found by grep (existing code uses `t.array(X.rowType)` in views only), so this named product type has no in-repo analog; use RESEARCH Code Examples. Do NOT add to `event_world`, `event_group`, or any persisted table. Publish needs `--break-clients`, never `--clear-database`.

---

### `spacetimedb/src/helpers/events.ts` (service, CRUD)

**Analog:** itself. Current helpers (lines 42-74, 125-133):
```typescript
export function appendPrivateEvent(
  ctx: any,
  characterId: bigint,
  ownerUserId: bigint,
  kind: string,
  message: string
) {
  return ctx.db.event_private.insert({
    id: 0n,
    ownerUserId,
    characterId,
    kind,
    message,
    createdAt: ctx.timestamp,
  });
}
...
export function appendCreationEvent(ctx: any, playerId: any, kind: string, message: string) {
  ctx.db.event_creation.insert({
    id: 0n,
    playerId,
    message,
    kind,
    createdAt: ctx.timestamp,
  });
}
```
**Change:** add a trailing optional `segments?: Segment[]` to `appendPrivateEvent`, `appendLocationEvent` (after `excludeCharacterId`), `appendCreationEvent`; pass `segments` into the insert (undefined is accepted and dropped by the mock serializer). `import type { Segment } from './segments';` only. Leave `logPrivateAndGroup`, `appendPrivateAndGroupEvent`, `fail`, `appendGroupEvent`, `appendWorldEvent` unchanged.

**Critical mock pitfall:** do NOT add new exports to `events.ts` that `llm_apply.ts` calls. Suites that `vi.mock('./events', ...)` with fixed lists: `combat_narration.test.ts:21` (`appendSystemMessage, appendPrivateEvent, appendWorldEvent, appendNpcDialog, appendCreationEvent`), `llm_failure_drills.test.ts:46`, `llm_seam.test.ts:41` (only three), `combat.test.ts:17` (`appendPrivateEvent, appendGroupEvent, logPrivateAndGroup, fail`), plus `llm_executor`, `llm_sweeper`, `race_ability`, `renown_llm`, `reducers/renown` tests. Put all new logic in `segments.ts`.

**Test analog** `helpers/events.test.ts` (lines 1-40): mocks `spacetimedb/server` with `SenderError` and `./group`, uses `createMockCtx()` and `ctx.db.event_world._rows()`:
```typescript
const ctx = createMockCtx();
appendWorldEvent(ctx, 'day_night', 'The sun rises.');
const rows = ctx.db.event_world._rows();
expect(rows[0].message).toBe('The sun rises.');
```
Add cases: segments written when given, omitted when not, `message` equals `flattenSegments`.

---

### `spacetimedb/src/helpers/segments.ts` (utility, transform) NEW

**Analog (clamp primitives):** `spacetimedb/src/data/llm_layers.ts` lines 55-74. Import and reuse rather than copy:
```typescript
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
export function truncateCodePoints(text: string, max: number): string {
  return Array.from(text).slice(0, max).join('');
}
export function neutralizePlayerText(text: string, max: number): string {
  const wellFormed = String(text ?? '').replace(LONE_SURROGATE, '�');
  return escapeAngles(truncateCodePoints(wellFormed.trim(), max));
}
```
`LONE_SURROGATE` is not exported; either export it or duplicate the regex in `segments.ts`'s `cleanText` (do not use `neutralizePlayerText`, it escapes angle brackets).

**Analog (salvage of prose):** `helpers/combat_narration.ts` lines 158-177, `stripNarrationSelfCorrection(text)` stays in front of combat raw-text salvage.

**Analog (tolerant JSON):** `llm_apply.ts` lines 94-105 `extractJson(raw)` (fence strip, first/last brace slice, `JSON.parse`; throws on bad input, so callers wrap in try/catch). `segments.ts` must stay free of `spacetimedb/server` imports so `scripts/llm/*.mjs` can import it (as `golden_rules.mjs` lines 14-21 import other `.ts` validators by relative path).

**Core design:** use RESEARCH Patterns 1 and 2 (`normalizeSegments`, `flattenSegments`, fallback ladder, `keeperSegments(text)`), constants `KEEPER_SPEAKER = 'The Keeper'`, `MAX_SEGMENTS = 6`, `MAX_SEGMENT_CHARS = 600`. Total functions, never throw. Strip one pair of outer quotes from dialogue text (Pitfall 6).

---

### `spacetimedb/src/helpers/llm_apply.ts` (service, event-driven)

**Analog:** itself. Import block already pulls `appendPrivateEvent` / `appendCreationEvent` from `./events` (lines 32-34).

**NPC apply, block to replace** (lines 654-674):
```typescript
  let data: any;
  try {
    data = extractJson(resultText);
  } catch (parseErr) {
    console.error(`NPC conversation JSON parse error: ${parseErr}`);
    appendNpcDialog(ctx, charId, npc.id, `${npc.name} mutters something unintelligible.`);
    appendPrivateEvent(ctx, charId, character.ownerUserId, 'npc',
      `${npc.name} mutters something unintelligible. (Try again.)`);
    return;
  }

  const dialogue = data.dialogue || '...';
  ...
  appendNpcDialog(ctx, charId, npc.id, `${npc.name}: "${dialogue}"`);
  appendPrivateEvent(ctx, charId, character.ownerUserId, 'npc',
    `${npc.name} says, "${dialogue}"`);
```
Keep: the early return on invalid JSON (before memory/cooldown writes), the effect loop (lines 677+, effect cue rows stay separate `npc` rows with no segments), and `appendNpcDialog` text. Write exactly one `npc` event row with `flattenSegments(segments)` and `segments`. Caution: `console.error(... ${parseErr})` logs the JSON.parse message which quotes the input; RESEARCH Security says log only a fixed reason.

**Server-wrapped routes** (add `keeperSegments(text)` as the 5th/6th arg): creation `appendCreationEvent` at lines 275, 373, 445 (`'creation'`); error lines 123, 175, 305, 327, 357 (`creation_error`) stay as plain; arrival `appendPrivateEvent` line 531 (`'narrative'`); skill line 640 and renown line 1018 (`'narrative'`, `presentation` variable). System lines (542-544, 596, 218) stay unsegmented.

**Mock-pitfall:** `applyLlmResult` is exercised with real events in `llm_apply.characterization.test.ts` and with the mock in drills/seam; new code must only call existing `./events` exports.

---

### `spacetimedb/src/helpers/combat_narration.ts` (service, event-driven)

**Analog:** itself, `handleCombatNarrationResult` lines 199-240. Parse block to replace:
```typescript
    const data = JSON.parse(text);
    narrative = data.narrative || text;
  } catch {
    narrative = resultText.trim();
  }
  narrative = stripNarrationSelfCorrection(narrative);
  if (!narrative || narrative.length === 0) return;
  ctx.db.combat_narrative.insert({ id: 0n, combatId, roundNumber, narrativeText: narrative, narrativeType, createdAt: ctx.timestamp });
  const prefix = narrativeType === 'round' ? `[Round ${roundNumber}] ` : '';
  for (const charIdStr of participantCharacterIds) {
    ...
    appendPrivateEvent(ctx, charId, character.ownerUserId, 'combat_narration', prefix + narrative);
  }
```
Keep: `if (!success) return`, empty result returns silently (no noise during combat), `combat_narrative` row stays plain text (flattened), `appendPrivateEvent` per participant gains `segments`. Allowed dialogue speakers: `context`/summary enemy names (`enemyNames` from `RoundEventSummary`) plus location NPCs (OQ7). Imports only `appendPrivateEvent` from `./events` (line 12); keep it that way.

---

### `spacetimedb/src/data/llm_schemas.ts` + `llm_routes.ts` (config, post-approval)

**Schema helpers** (llm_schemas.ts lines 46-64): `obj()`, `S`, `enumOf()`. Array-of-object analog `SKILL_GENERATION_SCHEMA` (line 281):
```typescript
export const SKILL_GENERATION_SCHEMA: Node = deepFreeze(
  obj({ skills: { type: 'array', items: SKILL_ITEM } }),
);
```
New:
```typescript
export const COMBAT_NARRATION_SCHEMA: Node = deepFreeze(
  obj({ segments: { type: 'array', items: obj({ kind: enumOf(['narration', 'dialogue']), speaker: S, text: S }) } }),
);
```
No `maxItems`/`maxLength` (linter rejects them); clamps live server-side. Add to `LLM_JSON_SCHEMAS` and the `ALL` list in `llm_schemas.test.ts`.

**Route flip** (llm_routes.ts line 80):
```typescript
  combat_narration: route('combat_narration', { kind: 'text' }),
```
becomes `{ kind: 'json', schema: COMBAT_NARRATION_SCHEMA }`; import the schema alongside the others (import list at line 21). `npc_conversation` (line 79) stays `{ kind: 'text' }` (union-param limit; file header comment line 15 explains). Do not edit `llm_tuning.ts` (test traces it to measurements).

---

### `scripts/llm/sweep_rules.mjs` (utility, transform)

**Analog:** itself.
- `NARRATIVE_KEY` (line 183): `/description$|^(dialogue|narrative|narration)$/i` add `text`.
- `structuralCheck` (lines 336-343): replace `missing_dialogue` (npc) and `empty_text` (combat) with `missing_segments` using `segments.ts` normalization:
```javascript
    case 'npc_conversation': {
      const obj = typeof p === 'string' ? extractJsonObject(p) : isObject(p) ? p : undefined;
      if (!obj || !isNonEmptyString(obj.dialogue)) bad.push('missing_dialogue');
      break;
    }
    case 'combat_narration':
      if (typeof p !== 'string' || p.trim() === '') bad.push('empty_text');
      break;
```
- `toneLint` combat block (lines 281-287): `text_json_wrapper`, `text_quotes`, `narration_sentences` run on raw text; change to the joined narration text and drop the two wrapper rules for combat. Line 256 `route === 'combat_narration' && raw.includes('!')` also reads raw.
- `sweep.live.ts` line 276 `JSON_ROUTES` filter excludes `combat_narration`; remove that exclusion.

---

### `scripts/llm/golden_rules.mjs` (utility, transform)

**Analog:** itself. `GOLDEN_RULES = Object.freeze([...GOLDEN_SPECIFIC, ...TONE_RULES])` (line 44); add new ids (`segments_invalid`, optional `speaker_not_present`, `keeper_first_person`) to `GOLDEN_SPECIFIC`; order is pinned by `golden_rules.test.mjs`. `evaluateGoldenItem` (line 413) already uses `LLM_ROUTES[route].output.kind` and `schemaErrors(schema, value, path)` (line 127) for JSON routes. Server validators are imported by relative `.ts` path (lines 14-21); import `../../spacetimedb/src/helpers/segments.ts` the same way. `KEEPER_IT_OR_THEY` (line 58) is the existing pronoun regex to reuse.

### `scripts/llm/golden.live.ts` (config)

Lines 74-76 hard-code the Phase 44 folder:
```typescript
const PHASE_DIR = path.join(REPO_ROOT, '.planning', 'phases', '44-live-verification-and-tone-eval');
const RECORD_PATH = path.join(PHASE_DIR, '44-golden-run.json');
const REVIEW_PATH = path.join(PHASE_DIR, '44-golden-review.html');
```
Repoint to `46-structured-keeper-replies` with `46-golden-run.json` / `46-golden-review.html`. `drills.live.ts:59` also points to the old folder; leave it. The dry run (free) must stay green; no paid `run` mode.

### `scripts/llm/golden_run.test.mjs` / `golden_review.mjs`
Fix the collection-time path to `.planning/milestones/v2.2-phases/44-live-verification-and-tone-eval/` and guard replay for `['npc_conversation','combat_narration']` (RESEARCH Pitfall 4). Review rendering: flatten segments into labelled lines as text nodes only.

---

### `spacetimedb/src/helpers/llm_segment_drills.test.ts` (test, NEW)

**Analog:** `helpers/llm_failure_drills.test.ts`. Setup to copy (lines 15, 42-61):
```typescript
vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);
beforeAll(async () => { await import('../schema/tables'); });
beforeEach(() => { vi.clearAllMocks(); });
```
Difference: RESEARCH says do NOT mock `./events` here (assert the real stored row shape through `applyLlmResult`). Use `createMockProcCtx`/`createMockCtx` from `./test-utils`. Table-drive the matrix over every narrative route (bad JSON, no segments, unknown kind, missing speaker, empty, over 6, over 600, spoofed speaker, fenced JSON). Also extend `llm_failure_drills.test.ts` pinned inline lines only where the owner approves copy.

### `spacetimedb/src/schema/event_segments.test.ts` (test, NEW)
**Analog:** `schema/llm_privacy.test.ts` and `helpers/schema_recorder.ts` (`createRecordingServerMock`); the recorder accepts any `t.x()` chain, so `t.object('KeeperSegment', ...)` loads. Assert `segments` exists on exactly the three tables and not on `event_world` / `event_group`.

---

## Shared Patterns

### Mock-safe module boundaries
**Source:** `helpers/events.ts` + the nine suites' `vi.mock('./events')`. **Apply to:** `llm_apply.ts`, `combat_narration.ts`. Only extend existing export signatures; new logic goes in `segments.ts`.

### Never trust model speaker
**Source:** RESEARCH Pattern 1. **Apply to:** every parse of model segments. Store `'The Keeper'` or the DB NPC name plus `speakerNpcId`; present NPCs from `ctx.db.npc.by_location.filter(character.locationId)` plus the conversation NPC (`npc` at `llm_apply.ts:651`).

### Total apply functions, no logging of reply text
**Source:** `combat_narration.ts` line 152 (`console.error('... ' + redactSecrets(String(e)))`, import from `./measurement`). **Apply to:** all new error paths. A throw rolls back the whole apply.

### Prompt/voice edits gated by owner approval
**Source:** CONTEXT SEG-03. **Apply to:** `llm_layers.ts`, `keeper_bible.ts`, route flip, new NPC reply shape, fixed Keeper strings, fallback wording. Draft only in `46-VOICE-CHANGES.md`; `git diff` of those files must be empty at the checkpoint.

### Schema lint subset
**Source:** `helpers/schema_lint.ts` (via `llm_schemas.test.ts` `ALL` list). **Apply to:** `COMBAT_NARRATION_SCHEMA`.

### Publish rules
Local only: `spacetime publish uwr -p spacetimedb --server local --break-clients`; then `pnpm spacetime:generate`. Never maincloud, never `--clear-database`, no paid LLM calls.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `KeeperSegment` named product type (`t.object(name, {...})`) | model | n/a | No `t.object(` exists in `spacetimedb/src`; use the probe-verified snippet in RESEARCH Code Examples |
| `46-VOICE-CHANGES.md` | doc | n/a | Content-approval package; no codebase analog. Structure from RESEARCH "Voice package inventory". Check prior `44-TONE-FIXES.md` in `.planning/milestones/v2.2-phases/44-live-verification-and-tone-eval/` for tone-doc style |

## Metadata

**Analog search scope:** `spacetimedb/src/{helpers,data,schema,views}`, `scripts/llm`
**Files read/scanned:** about 14 read (events.ts, events.test.ts, combat_narration.ts, targeted ranges of llm_apply.ts, tables.ts, llm_routes.ts, llm_schemas.ts, llm_layers.ts, sweep_rules.mjs, golden_rules.mjs, golden.live.ts, llm_failure_drills.test.ts) plus greps
**Pattern extraction date:** 2026-10-05
