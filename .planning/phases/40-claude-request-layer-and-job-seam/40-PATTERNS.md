# Phase 40: Claude Request Layer and Job Seam - Pattern Map

**Mapped:** 2026-09-29
**Files analyzed:** 24 new/modified
**Analogs found:** 22 / 24 (all paths relative to `C:\projects\uwr\spacetimedb\src\` unless noted)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `data/llm_models.ts` | config (constants) | transform | `data/mechanical_vocabulary.ts` (`as const` exports) + spike `MODEL` consts (git `555da7a1`) | role-match |
| `data/llm_routes.ts` (+ test) | config (route table) | transform | spike `MAX_TOKENS`/`DEFAULT_TIMEOUT_MS` (git) + `data/mechanical_vocabulary.ts` | role-match |
| `data/llm_schemas.ts` (+ test) | config (JSON Schemas) | transform | spike `obj()`/`REGION_*_PROPS` (git) + `buildSkillGenResponseFormat()` in `data/llm_prompts.ts:345` | exact |
| `data/keeper_bible.ts` (+ test) | config (prompt text) | transform | `NARRATOR_PREAMBLE` `data/llm_prompts.ts:2` | exact |
| `data/llm_layers.ts` (+ test) | utility (prompt builders) | transform | `data/llm_prompts.ts` builders (`buildRenownPerkUserPrompt`, `buildSkillGenUserPrompt`) | role-match |
| `helpers/claude_request.ts` (+ test) | utility (pure build/parse) | request-response | spike `buildRequest` (git) + `helpers/measurement.ts` (`redactSecrets`, `Usage`) | role-match |
| `helpers/schema_lint.ts` (+ test) | utility (pure) | transform | `helpers/measurement.ts` + `measurement.test.ts` | role-match |
| `helpers/llm_queue.ts` (+ test) | service | CRUD | `helpers/llm.ts` (`checkBudget`/`incrementBudget`) | role-match |
| `helpers/llm_status.ts` | utility (pure) | transform | `helpers/measurement.ts` | partial |
| `helpers/llm_apply.ts` (+ test) | service | event-driven | `index.ts:943-1636` (`submit_llm_result`), moved verbatim | exact (self) |
| `helpers/renown.ts` (modify) + test | service | CRUD | `helpers/combat_narration.ts:108-125` (identity resolve) + `reducers/renown.test.ts` | exact |
| `helpers/test-utils.ts` (+ `createMockProcCtx`, `INDEX_TO_COLUMN`) | test infra | request-response | itself (`createMockDb`/`createMockCtx`) | exact |
| `helpers/test-utils.test.ts` (modify) | test | n/a | itself | exact |
| `schema/tables.ts` (+ `LlmJob`, `LlmCallLog`, register) | model | CRUD | `LlmConfig` (1890), `LlmTask` (2106), `schema({...})` (2129) | exact |
| `views/llm.ts` + `views/index.ts` | view | request-response | `views/quests.ts` | role-match |
| `index.ts` (`submit_llm_result` thin wrapper) | controller (reducer) | request-response | itself, `index.ts:943-956` | exact |
| privacy test (`schema/tables.privacy.test.ts` or similar) | test | n/a | `reducers/renown.test.ts` (`vi.mock('spacetimedb/server')`) + RESEARCH 5.4 recorder | role-match |
| view test | test | n/a | RESEARCH 5.4 + `createMockDb` | partial |
| `helpers/__fixtures__/claude/*.json` | fixture | n/a | none | no analog |
| model-literal grep test | test | batch | none | no analog |

## Pattern Assignments

### `data/llm_models.ts`, `data/llm_routes.ts` (config, transform)

**Analog:** spike consts (`git show 555da7a1:spacetimedb/src/spike/spike_bodies.ts` lines 25-52). No `spacetimedb/server` imports.
```typescript
export const MODEL = 'claude-sonnet-5-5';
export const ANTHROPIC_VERSION = '2023-06-01';
export const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
export const MAX_TIMEOUT_MS = 180000;
export const MAX_TOKENS: Record<SpikeRoute, number> = { minimal: 256, skill: 4096, region: 8192, ... };
export const DEFAULT_TIMEOUT_MS = { minimal: 60000, skill: 120000, region: 150000, ... } as const;
```
Route values and types: use RESEARCH Pattern 1 table. Vocabulary style: `export const X = [...] as const; export type X = (typeof X)[number]` (`data/mechanical_vocabulary.ts:21-22`).

---

### `data/llm_schemas.ts` (config, transform)

**Analog A (region, reuse verbatim):** `git show 555da7a1:spacetimedb/src/spike/spike_bodies.ts` lines ~137-215.
```typescript
function obj(props: Record<string, any>): any {
  return { type: 'object', additionalProperties: false, required: Object.keys(props), properties: props };
}
const S = { type: 'string' };
const strs = { type: 'array', items: S };
const REGION_CORE_PROPS = { regionName: S, regionDescription: S,
  biome: { type: 'string', enum: ['volcanic','forest','tundra','desert','swamp','mountains','plains','coastal','cavern','ruins'] },
  dominantFaction: S, landmarks: strs, threats: strs,
  locations: { type: 'array', items: obj({ name: S, description: S,
    terrainType: { type: 'string', enum: ['mountains','woods','plains','swamp','dungeon','town','city'] },
    isSafe: { type: 'boolean' }, levelOffset: { type: 'integer' }, connectsTo: strs }) } };
const REGION_POPULATION_PROPS = { npcs: { type:'array', items: obj({ name: S,
    npcType: { type:'string', enum:['vendor','questgiver','lore','trainer','guard','crafter','banker'] },
    locationName: S, description: S, greeting: S,
    personality: obj({ traits: strs, speechPattern: S, knowledgeDomains: strs, secrets: strs, affinityMultiplier: { type:'number' } }) }) },
  enemies: { type:'array', items: obj({ name: S, creatureType: {type:'string', enum:['beast','undead','humanoid','elemental','construct','aberration']},
    role: {type:'string', enum:['melee','ranged','caster']}, terrainTypes: S, groupMin:{type:'integer'}, groupMax:{type:'integer'}, level:{type:'integer'} }) } };
export const REGION_JSON_SCHEMA = obj({ ...REGION_CORE_PROPS, ...REGION_POPULATION_PROPS });
```
Drop the staged core/population pair (workaround, unused). Rename to `REGION_GENERATION_SCHEMA`. Module-level constants (grammar cache keyed on byte-identical schema).

**Analog B (skill):** spike `toAnthropicSchema` (lines ~106-128) maps array `type` -> `anyOf`; source structure is `buildSkillGenResponseFormat()` (`data/llm_prompts.ts:345-407`): strip `name`/`strict`/`json_schema` wrapper, convert `value2`, `effectType`, `effectMagnitude`, `effectDuration` (`type: ['number','null']`) to `anyOf: [{type:'number'},{type:'null'}]`. Keep field `required` list (line 399). Enums: import `ABILITY_KINDS`, `DAMAGE_TYPES`, etc. from `data/mechanical_vocabulary.ts` (skill enum literal today at line 361 matches).
```typescript
import { ABILITY_KINDS, DAMAGE_TYPES, STAT_TYPES } from './mechanical_vocabulary';  // enums: use vocabulary, not prose values (holy/lightning/stun)
```
Race/class/renown schemas: hand-write from `RACE_INTERPRETATION_SCHEMA` (`llm_prompts.ts:120`), `CLASS_GENERATION_SCHEMA` (:130), `RENOWN_PERK_GENERATION_SCHEMA` (:409). Use `obj()` helper style above.

**Test analog:** `data/mechanical_vocabulary.test.ts` (enum completeness vs constants); test that every schema passes `lintSchema`, and that two reads are identical.

---

### `data/keeper_bible.ts` (config, transform)

**Analog:** `NARRATOR_PREAMBLE` (`data/llm_prompts.ts:2-14`), single template-literal export, no interpolation.
```typescript
export const NARRATOR_PREAMBLE = `You are The Keeper of Knowledge — the sardonic, all-knowing narrator of Unnamed Web RPG (UWR). You are not a helpful assistant. ...
Your voice is:
- Sardonic and dry, never enthusiastic or encouraging
...`;
```
Export `KEEPER_BIBLE` as a static string (no dates/ids). Rephrase "You are not a helpful assistant" positively. Add naming rules from `buildWorldGenPrompt` (llm_prompts.ts:34) and class/ability naming rules from `buildClassGenerationUserPrompt` (:156), the tagged-content rule, 3-4 examples. No seeded names. Test: char-length bound 5,000-10,000, contains `<player_input>` rule, no timestamps. Human-verify checkpoint on this file.

---

### `data/llm_layers.ts` (utility, transform)

**Analog:** user-prompt builders in `data/llm_prompts.ts` (`buildSkillGenUserPrompt` :314, `buildRenownPerkUserPrompt` :467, `buildNpcConversationUserPrompt` :623): plain functions returning template strings from primitives. Legacy builders stay untouched. Add `wrapPlayerInput(text)` (cap 1000 chars, escape every `<`/`>` then wrap in `<player_input>`) per RESEARCH section 7.

---

### `helpers/claude_request.ts` (utility, request-response)

**Analog:** spike `buildRequest` body assembly (`spike_bodies.ts` ~lines 250-300) and host-guarded headers:
```typescript
const outputConfig: any = { effort: spec.effort };
const body: any = { model: MODEL, max_tokens: maxTokens };
outputConfig.format = { type: 'json_schema', schema };
body.system = [{ type: 'text', text: prompts.system, cache_control: { type: 'ephemeral' } }];
body.output_config = outputConfig;
body.messages = [{ role: 'user', content: userText }];
const text = JSON.stringify(body);
// headers
headers['content-type'] = 'application/json';
headers['anthropic-version'] = ANTHROPIC_VERSION;
headers['x-api-key'] = keyFor(spec, storedKey);
```
Follow RESEARCH Pattern 2 (fixed key order, `assertValidClaudeBody` forbidden-key guard) and section 6 parser contract. Do not include `thinking`. Reuse from `helpers/measurement.ts`: `redactSecrets`, `Usage`. Spike imported it as `import { redactSecrets, type Usage } from '../helpers/measurement';`. NO `spacetimedb/server` imports (fails in Node vitest).

**Test analog:** `helpers/measurement.test.ts` (pure vitest: `import { describe, it, expect } from 'vitest'`, small deterministic helper builders at top, `it.each` tables). Fixtures under `helpers/__fixtures__/claude/`.

---

### `helpers/schema_lint.ts` (utility, transform)

**Analog:** `helpers/measurement.ts` (pure exports, no I/O, test colocated as `measurement.test.ts`). Signature `lintSchema(schema): string[]`; rules per RESEARCH 3.4; one negative fixture test per rule plus positive test over every JSON route in `LLM_ROUTES`.

---

### `helpers/llm_queue.ts` (service, CRUD)

**Analog:** `helpers/llm.ts` (duck-typed `ctx: any`, index lookup via `by_player`, insert with `id: 0n`, `ctx.timestamp`):
```typescript
export function checkBudget(ctx: any, playerId: any): { allowed: boolean; remaining: number } {
  const rows = [...ctx.db.llm_budget.by_player.filter(playerId)];
  const budget = rows[0];
  if (!budget) {
    ctx.db.llm_budget.insert({ id: 0n, playerId, callCount: 0n, resetDate: today });
```
Copy shape (spread filter result, `id: 0n`, no `Date.now`). Body: RESEARCH Pattern 4 (`enqueueLlmJob`, `buildDedupeKey`). Plain `Error`, not `SenderError` (helper without character context; also avoids `spacetimedb/server` import). Test through `createMockCtx` with `by_dedupe_key` mapped in `INDEX_TO_COLUMN`; positive-control first.

---

### `helpers/llm_apply.ts` (service, event-driven)

**Analog:** `index.ts:943-1636` verbatim. Wrapper being kept (943-956):
```typescript
spacetimedb.reducer('submit_llm_result', { taskId: t.u64(), resultText: t.string(), success: t.bool(), errorMessage: t.string().optional() },
 (ctx: any, { taskId, resultText, success, errorMessage }) => {
  const task = ctx.db.llm_task.id.find(taskId);
  if (!task) throw new SenderError('LLM task not found');
  if (task.playerId.toHexString() !== ctx.sender.toHexString()) throw new SenderError('Not your task');
  if (task.status !== 'pending') throw new SenderError('Task already processed');
  ctx.db.llm_task.id.update({ ...task, status: success ? 'completed' : 'error' });
  if (!success) { if (task.domain === 'creation_race') { appendCreationEvent(ctx, ctx.sender, 'creation_error', ...
```
Helpers to move: `extractJson` (`index.ts:409-420`) and `retryWorldGen` (:423). Copy by line range (`sed -n`), substitute `ctx.sender` -> `job.playerId` (12 uses at 960,962,965,967,1005,1008,1027,1090,1100,1240,1586,1618,1530 region), keep quirks. Region map: RESEARCH section 1 table. Test analog for mocks: `helpers/world_gen.test.ts`:
```typescript
vi.mock('./location', () => ({ connectLocations: (ctx, fromId, toId) => { ctx.db.location_connection.insert({...}); } }));
import { createMockDb } from './test-utils';
```
plus `vi.mock('spacetimedb/server', ...)` (llm_apply imports tables transitively). Static test: source has no `ctx.sender`; `submit_llm_result` has no `domain ===` branches.

---

### `helpers/renown.ts` (modify) (service, CRUD)

**Broken code to replace:** `helpers/renown.ts:53-108` (`triggerRenownPerkGeneration`). Three defects: wrong `llm_task` columns (`completedAt`, `resultText`, `errorMessage`, lines 100-102), `ctx.db.player.id.find(character.ownerUserId)` (line 56; Identity index given u64), `character.raceName` (line 65).
**Identity-resolve pattern to copy:** `helpers/combat_narration.ts:118-125`:
```typescript
let chargedPlayerIdentity: any = null;
for (const p of ctx.db.player.iter()) {
  if (p.userId === character.ownerUserId) { chargedPlayerIdentity = p.id; break; }
}
if (!chargedPlayerIdentity) return;
```
Prefer `p.activeCharacterId === character.id`. Fallback when unresolved: existing `insertStaticRenownPerkOptions(ctx, character.id, rank)` (renown.ts:~112). Then `enqueueLlmJob(ctx, { route:'renown_perk_gen', playerId, characterId: character.id, sourceKey: \`${character.id}:${rank}\`, request: {...} })`. Remove `buildRenownPerk*` import (line 3) and `gpt-5-mini` literal.

**Test analog:** `reducers/renown.test.ts` header (mock `spacetimedb/server`, `../data/renown_data`, `../helpers/events`; `createMockCtx` from `../helpers/test-utils`):
```typescript
vi.mock('spacetimedb/server', () => ({ SenderError: class extends Error { constructor(msg: string) { super(msg); } }, t: {} }));
vi.mock('../data/renown_data', () => ({ RENOWN_PERK_POOLS: {...}, RENOWN_RANKS: [...], calculateRankFromPoints: (p: bigint) => p >= 100n ? 2 : 1, ACHIEVEMENT_DEFINITIONS: {} }));
vi.mock('../helpers/events', () => ({ appendSystemMessage: vi.fn(), appendPrivateEvent: vi.fn(), appendWorldEvent: vi.fn() }));
```
Note the existing renown test lives in `reducers/`; the new `awardRenown` regression test can live in `helpers/renown.test.ts` with the same mocks. Seed `player: [{ id: identity, userId: 7n, activeCharacterId: 1n }]` (same Identity object for `===`).

---

### `helpers/test-utils.ts` (`createMockProcCtx`) (test infra)

**Analog:** itself. Extend `INDEX_TO_COLUMN` (lines ~63-78 of file):
```typescript
const INDEX_TO_COLUMN: Record<string, string> = { by_owner: 'ownerId', ... by_player: 'playerId', by_score: 'score', by_group: 'groupId' };
// ADD: by_dedupe_key: 'dedupeKey', by_status: 'status', by_job: 'jobId'
```
Unmapped `by_X` falls back to column `XId` (silently returns nothing). Build `createMockProcCtx` on `createMockDb(opts.seed)`, and use `db._tables` (Proxy returns `tables` for `_tables`) for snapshot/restore. `createMockCtx` shape to mirror:
```typescript
return { db: createMockDb(opts.seed ?? {}), timestamp: { microsSinceUnixEpoch: opts.timestampMicros ?? 1_000_000_000_000n }, sender: opts.sender ?? { toHexString: () => 'mock-identity-hex' } };
```
Body per RESEARCH 5.2; `ctx` must have no `db`. Test in `helpers/test-utils.test.ts`.

---

### `schema/tables.ts` (`LlmJob`, `LlmCallLog`) (model, CRUD)

**Analog:** `LlmConfig` (1890) private, `LlmTask` (2106) indexes, register in `schema({...})` at 2129 (`llm_config: LlmConfig` line 2231, `llm_task: LlmTask` line 2239).
```typescript
// LLM Pipeline tables (all private — no public: true)
export const LlmConfig = table({ name: 'llm_config' }, { id: t.u64().primaryKey(), apiKey: t.string(), updatedAt: t.timestamp() });
export const LlmTask = table({ name: 'llm_task', public: true,
    indexes: [ { accessor: 'by_player', algorithm: 'btree', columns: ['playerId'] } ] },
  { id: t.u64().primaryKey().autoInc(), playerId: t.identity(), ..., contextJson: t.string().optional(), createdAt: t.timestamp() });
```
New tables: RESEARCH 2.4 columns; indexes in OPTIONS (`by_player`, `by_dedupe_key`, `by_status`); NO `public`. Add `llm_job: LlmJob, llm_call_log: LlmCallLog` next to `llm_config`/`llm_task` in the `schema({...})` object. Do not touch `LlmTask`.

---

### `views/llm.ts` + `views/index.ts` (view, request-response)

**Analog:** `views/quests.ts`:
```typescript
import type { ViewDeps } from './types';
export const registerQuestViews = ({ spacetimedb, t, QuestInstance }: ViewDeps) => {
  spacetimedb.view({ name: 'my_quests', public: true }, t.array(QuestInstance.rowType), (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player?.activeCharacterId) return [];
      return [...ctx.db.quest_instance.by_character.filter(player.activeCharacterId)];
  });
};
```
Registration (`views/index.ts`): add `import { registerLlmViews } from './llm';` and `registerLlmViews(deps);` inside `registerViews`. Uses `ViewDeps` (`views/types.ts`: `{spacetimedb, t, ...}`); since `t.row('MyLlmJob', {...})` is built inside, no new deps needed (RESEARCH Pattern 5). No `_wrapMethod` change required: `_wrapMethod('view', (args) => args[0]?.name)` at `index.ts:276` runs before `registerViews({...})` at `index.ts:385`, so the view is collected automatically. Index lookup only (`by_player.filter(ctx.sender)`), never `.iter()`.

---

### `index.ts` (`submit_llm_result` wrapper) (controller)

Keep lines 943-956 (auth + status update), replace 957-1635 with `success ? applyLlmResult(ctx, toApplyJob(task), resultText) : applyLlmFailure(ctx, toApplyJob(task))`. Delete `extractJson`/`retryWorldGen` from `index.ts` (409-436) once moved; import from `./helpers/llm_apply`. Keep `SenderError` there (reducer has access; user preference `fail()` where character exists is inside moved code, unchanged).

---

### Privacy test (test)

**Analog:** `vi.mock('spacetimedb/server')` pattern (used in `reducers/renown.test.ts`, `helpers/events.test.ts`, `helpers/items.test.ts`, `helpers/combat.test.ts`, `helpers/race_ability.test.ts`). Extend with recorder from RESEARCH 5.4:
```typescript
const recorded: { opts: any; cols: any }[] = [];
vi.mock('spacetimedb/server', () => {
  const chain: any = () => new Proxy(function () {}, { get: () => chain(), apply: () => chain() });
  const t: any = new Proxy({}, { get: () => chain() });
  const table = (opts: any, cols: any) => { const r = { opts, cols, rowType: {} }; recorded.push(r); return r; };
  const schema = (defs: any) => ({ __defs: defs, view: () => ({}), reducer: () => ({}), exportGroup: () => ({}) });
  return { t, table, schema, SenderError: class extends Error {} };
});
const mod: any = await import('../schema/tables');
```
Note: no existing test uses `vi.hoisted`; if the recorder array is referenced inside the factory, wrap it in `vi.hoisted(() => [])` (vi.mock is hoisted above `const recorded`). Assert only `llm_task` is public among `llm_*`.

## Shared Patterns

### Pure-module constraint
**Apply to:** every new `data/*` and `helpers/*` file except `test-utils` and DB-touching code.
No imports from `spacetimedb/server`, `schema/tables.ts`, `helpers/events.ts`, `helpers/location.ts` (load fails in Node vitest). Use duck-typed `ctx: any` and plain `Error`. Files that must load them mock as in `helpers/world_gen.test.ts`.

### Reducer determinism
**Source:** `helpers/llm.ts` (`utcDateString(ctx.timestamp)`). Use `ctx.timestamp`, never `Date.now`/`Math.random`.

### Table/index conventions
**Source:** `schema/tables.ts:2106-2126`. `table(OPTIONS, COLUMNS)`; indexes `{ accessor, algorithm: 'btree', columns: [...] }` in OPTIONS; `id: t.u64().primaryKey().autoInc()`; insert with `id: 0n`; insert returns row.

### Mock DB index gotcha
**Source:** `helpers/test-utils.ts` `INDEX_TO_COLUMN`. Every new `by_*` accessor must be mapped; `===` comparison requires the same Identity object.

### Secrets
**Source:** `helpers/measurement.ts` `redactSecrets`. Apply to all captured error text/messages in `claude_request.ts`; API key only in `buildClaudeHeaders`.

### Test file layout
**Source:** `helpers/measurement.test.ts`, `data/mechanical_vocabulary.test.ts`. Colocated `X.test.ts`, `import { describe, it, expect } from 'vitest'`, run with `pnpm --dir spacetimedb test`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `helpers/__fixtures__/claude/*.json` | fixture | n/a | No fixture directory exists; docs-derived per RESEARCH section 6 list |
| model-literal grep test | test | batch | No test scans repo source text; use `fs.readdirSync` walk with a legacy allowlist (`gpt-5.4`, `gpt-5-mini` in existing sites) |
| `helpers/llm_status.ts` (`keeperMessageForJob`) | utility | transform | No existing in-voice status-message mapper; write pure function, use Keeper tone from `NARRATOR_PREAMBLE` |
| `createMockProcCtx` withTx/fetch parts | test infra | request-response | No existing procedure mock; follow RESEARCH 5.2 |

## Metadata

**Analog search scope:** `spacetimedb/src/{data,helpers,schema,views,reducers}`, `index.ts`, git `555da7a1` spike file
**Files scanned:** ~25 read/grepped
**Pattern extraction date:** 2026-09-29
