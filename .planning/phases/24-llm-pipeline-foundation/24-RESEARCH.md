# Phase 24: LLM Pipeline Foundation - Research

**Researched:** 2026-03-06
**Domain:** SpacetimeDB procedures + Anthropic Claude API integration
**Confidence:** MEDIUM (procedures are beta; API patterns well-documented)

## Summary

This phase builds the server-side plumbing for making validated, cost-controlled Anthropic Claude API calls from SpacetimeDB procedures, plus client-side infrastructure to trigger and monitor them. The key technical challenge is that SpacetimeDB procedures are beta (v2.0.1) and have a critical constraint: **HTTP requests and database transactions cannot be held open simultaneously**. This means the flow must be: validate in reducer -> call procedure for HTTP -> write results in `ctx.withTx()` after HTTP completes.

The Anthropic Messages API is well-documented and straightforward for raw HTTP usage. Prompt caching requires minimum token thresholds (1,024 tokens for Sonnet 4.5, 4,096 tokens for Haiku 4.5) which must be met by system prompts. The client uses Vue 3 with `spacetimedb/vue` composables (`useReducer`, `useTable`) -- procedures will be called via generated bindings on `conn.procedures.*` after regeneration.

**Primary recommendation:** Build a single `call_llm` procedure that accepts domain, model, prompt parameters, and a request ID. Use a private `LlmRequest` table for lifecycle tracking. Reducer validates budget/permissions and inserts the pending request; client then calls the procedure; procedure does HTTP, parses response, and writes results via `ctx.withTx()`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Flat daily cap of 50 LLM calls per player, resets at UTC midnight
- Hard block when exceeded -- player sees thematic message ("The System grows weary...")
- Only successful calls count against budget -- failed/errored calls are free
- Retry once on API failure, then mark request as 'error'
- Failed calls do not consume daily budget
- Players see thematic error messages ("The System falters..."), never raw technical errors
- Admins see raw error details via `spacetime logs` (server-side logging)
- Players see contextual indicators only ("The System is considering...") -- no player-visible request table
- Admin monitoring via server logs, not a dedicated admin table
- Request records deleted from status table after completion -- use existing event tables for history
- Per-domain system prompts (character creation, world gen, combat narration, etc.)
- Sardonic System narrator voice baked into system prompts from day one
- Per-request model field -- each call specifies haiku or sonnet
- Client-triggered procedures: reducer validates, client calls procedure for LLM

### Claude's Discretion
- Graceful degradation strategy (block LLM-dependent actions vs template fallback)
- Request concurrency model per player
- Output format strategy (JSON for mechanical content, freeform for narrative, or always JSON)
- System prompt template structure within per-domain approach
- Request record cleanup timing

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LLM-01 | Server can call Anthropic Claude API via SpacetimeDB procedures using raw HTTP | Procedure `ctx.http.fetch()` documented; Anthropic Messages API format confirmed |
| LLM-02 | API key is stored in a private config table, set by admin reducer | Private table (no `public: true`) + `requireAdmin()` pattern exists in codebase |
| LLM-03 | LLM requests are tracked in a status table (pending/processing/completed/error) | Private `LlmRequest` table with status field; cleanup after completion |
| LLM-04 | Per-player generation budget limits daily LLM calls | `LlmBudget` table with daily counter, UTC midnight reset logic |
| LLM-05 | System prompt uses Anthropic prompt caching for cost reduction | `cache_control` on system message blocks; minimum thresholds documented |
| LLM-06 | Game remains playable if LLM calls fail (graceful degradation) | Retry-once strategy; thematic error messages via existing event system |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| spacetimedb | 2.0.1 | Server runtime + client SDK | Already in use; provides procedures beta |
| spacetimedb/server | 2.0.1 | Server-side table/reducer/procedure definitions | Required for procedure definition |
| spacetimedb/vue | 2.0.1 | Vue 3 composables (useTable, useReducer) | Already used throughout client |

### External API
| Service | Endpoint | Purpose | Auth |
|---------|----------|---------|------|
| Anthropic Messages API | `POST https://api.anthropic.com/v1/messages` | LLM text generation | `x-api-key` header |

### Models to Use
| Model ID | Use Case | Caching Threshold |
|----------|----------|-------------------|
| `claude-sonnet-4-5` | High-stakes one-time generation (character creation, world gen) | 1,024 tokens min |
| `claude-haiku-4-5` | Real-time generation (combat narration, quick responses) | 4,096 tokens min |

**No additional npm packages needed.** Raw HTTP via `ctx.http.fetch()` is the correct approach for SpacetimeDB procedures.

## Architecture Patterns

### Recommended Server Structure
```
spacetimedb/src/
  schema/tables.ts        # Add LlmConfig, LlmRequest, LlmBudget tables
  helpers/llm.ts          # LLM helper functions (buildRequest, parseResponse, checkBudget)
  data/llm_prompts.ts     # Per-domain system prompt templates
  reducers/llm.ts         # Admin reducers (setApiKey), validation reducers
  index.ts                # Register procedure + reducers
```

### Pattern 1: The Request Lifecycle Flow

**What:** Reducer validates -> client calls procedure -> procedure does HTTP + writes result
**When to use:** Every LLM call

```
1. Client calls reducer: validateLlmRequest({ domain, params })
   - Reducer checks: player exists, character exists, budget not exceeded
   - Reducer inserts LlmRequest row (status: 'pending', requestId: auto-inc)
   - Reducer returns nothing (transactional)

2. Client observes LlmRequest table via subscription
   - Sees new 'pending' row -> calls procedure

3. Client calls procedure: callLlm({ requestId })
   - Procedure reads request via ctx.withTx()
   - Procedure updates status to 'processing' via ctx.withTx()
   - Procedure builds HTTP request from domain + params
   - Procedure calls ctx.http.fetch() (OUTSIDE any transaction)
   - On success: ctx.withTx() writes parsed result to game table + deletes request row + increments budget
   - On failure: retry once, then ctx.withTx() marks request as 'error'

4. Client sees game table update via subscription -> renders result
```

### Pattern 2: Private Config Table for API Key (LLM-02)

**What:** Store API key in a non-public table, accessible only server-side
**Why:** Tables without `public: true` are private -- clients cannot subscribe to or read them

```typescript
// schema/tables.ts
export const LlmConfig = table(
  { name: 'llm_config' },  // NO public: true
  {
    id: t.u64().primaryKey(),  // Always 1 (singleton)
    apiKey: t.string(),
    updatedAt: t.timestamp(),
  }
);

// reducers/llm.ts -- admin only
spacetimedb.reducer('set_api_key', { apiKey: t.string() }, (ctx, { apiKey }) => {
  requireAdmin(ctx);
  const existing = ctx.db.llmConfig.id.find(1n);
  if (existing) {
    ctx.db.llmConfig.id.update({ ...existing, apiKey, updatedAt: ctx.timestamp });
  } else {
    ctx.db.llmConfig.insert({ id: 1n, apiKey, updatedAt: ctx.timestamp });
  }
});
```

### Pattern 3: Budget Tracking (LLM-04)

**What:** Per-player daily counter with UTC midnight reset

```typescript
export const LlmBudget = table(
  {
    name: 'llm_budget',
    indexes: [{ accessor: 'by_player', algorithm: 'btree', columns: ['playerId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    playerId: t.identity(),
    callCount: t.u64(),
    resetDate: t.string(),  // "2026-03-06" -- UTC date string for easy comparison
  }
);

// Helper
function checkAndIncrementBudget(ctx: any, playerId: any): boolean {
  const today = utcDateString(ctx.timestamp);
  const budget = ctx.db.llmBudget.by_player.filter(playerId);
  // Find or create today's record, check < 50, increment
}
```

### Pattern 4: Procedure Definition with HTTP + withTx

**Critical constraint:** Cannot hold HTTP and transaction open simultaneously.

```typescript
// index.ts
import { TimeDuration } from 'spacetimedb';

export const callLlm = spacetimedb.procedure(
  { requestId: t.u64() },
  t.string(),  // Returns status string to caller
  (ctx, { requestId }) => {
    // 1. Read request details (transaction)
    let request: any;
    ctx.withTx(tx => {
      request = tx.db.llmRequest.id.find(requestId);
      if (!request) throw new SenderError('Request not found');
      tx.db.llmRequest.id.update({ ...request, status: 'processing' });
    });

    // 2. Read API key (transaction)
    let apiKey: string;
    ctx.withTx(tx => {
      const config = tx.db.llmConfig.id.find(1n);
      if (!config) throw new SenderError('LLM not configured');
      apiKey = config.apiKey;
    });

    // 3. Make HTTP call (NO transaction open)
    const response = ctx.http.fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: 1024,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: request.userPrompt }],
      }),
      timeout: TimeDuration.fromMillis(30000),
    });

    // 4. Parse and store result (transaction)
    ctx.withTx(tx => {
      if (response.ok) {
        const body = JSON.parse(response.text());
        const content = body.content[0].text;
        // Write to domain-specific game table
        // Delete request row
        // Increment budget
      } else {
        // Mark as error, log details server-side
      }
    });

    return 'completed';
  }
);
```

### Anti-Patterns to Avoid
- **Passing API key from client:** Never accept the API key as a procedure argument from the client. Read it server-side from the private config table.
- **Holding transaction during HTTP:** `ctx.withTx()` and `ctx.http.fetch()` cannot overlap. Always close transaction before fetching.
- **Optimistic UI updates:** Do not update client state optimistically. Let subscriptions drive state changes after the procedure writes to tables.
- **Exposing raw errors to players:** All player-facing messages go through `appendPrivateEvent()` or `appendSystemMessage()` with thematic wording.
- **Single monolithic system prompt:** Use per-domain prompts as decided. Each domain (character creation, world gen, combat) gets its own system prompt.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP requests | Custom fetch wrapper | `ctx.http.fetch()` | Only API available in procedures |
| JSON parsing | Custom parser | `JSON.parse()` | Standard JS, available in SpacetimeDB |
| Player messaging | Custom notification system | `appendPrivateEvent()` / `appendSystemMessage()` | Already exists, already rendered in client |
| Admin validation | Custom auth check | `requireAdmin()` from `data/admin.ts` | Already exists and tested |
| Date comparison for budget | Complex timestamp math | String comparison on UTC date strings | Simpler, less error-prone |

## Common Pitfalls

### Pitfall 1: Transaction + HTTP Overlap
**What goes wrong:** SpacetimeDB panics or silently fails if you call `ctx.http.fetch()` inside a `ctx.withTx()` block.
**Why it happens:** Procedures explicitly disallow concurrent transactions and HTTP.
**How to avoid:** Always structure as: `withTx(read) -> fetch() -> withTx(write)`. Three distinct phases.
**Warning signs:** Runtime error about holding transaction during HTTP call.

### Pitfall 2: withTx Callback Re-execution
**What goes wrong:** Side effects happen multiple times because `withTx` may retry the callback.
**Why it happens:** SpacetimeDB docs state "functions passed to `withTx` may execute multiple times and must be idempotent."
**How to avoid:** Only do database reads/writes inside `withTx`. Never do HTTP calls, logging to external services, or non-idempotent operations inside it.
**Warning signs:** Duplicate database entries, double-counted budgets.

### Pitfall 3: Prompt Caching Threshold Not Met
**What goes wrong:** Cache misses on every request, no cost savings.
**Why it happens:** System prompts below minimum token thresholds (1,024 for Sonnet 4.5, 4,096 for Haiku 4.5).
**How to avoid:** Pad system prompts with rich context (game lore, world state, examples) to meet thresholds. Monitor `cache_creation_input_tokens` vs `cache_read_input_tokens` in responses.
**Warning signs:** `cache_read_input_tokens` always 0 in API responses.

### Pitfall 4: Schema Export Omission
**What goes wrong:** New tables not accessible via `ctx.db.*` in reducers/procedures.
**Why it happens:** Forgot to add new tables to the `schema()` call in `tables.ts`.
**How to avoid:** Always add new tables to both the export AND the schema registration at line ~1772 of `tables.ts`.
**Warning signs:** TypeScript errors about property not existing on `ctx.db`.

### Pitfall 5: Client Bindings Not Regenerated
**What goes wrong:** Client cannot see new tables or call new procedures.
**Why it happens:** `spacetime generate` not run after server schema changes.
**How to avoid:** Run `npm run spacetime:generate` after every schema change.
**Warning signs:** Import errors in client code, missing procedure methods.

### Pitfall 6: Budget Race Condition
**What goes wrong:** Player exceeds budget by submitting multiple requests simultaneously.
**Why it happens:** Budget check and increment are not atomic if done in procedure (multiple withTx calls).
**How to avoid:** Check AND increment budget in the validation reducer (which is transactional). The reducer gates access; the procedure just executes.
**Warning signs:** Players occasionally exceeding 50-call daily cap.

## Code Examples

### Anthropic Messages API - Raw HTTP Request
```typescript
// Source: https://platform.claude.com/docs/en/api/messages
const response = ctx.http.fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-5',  // or 'claude-haiku-4-5'
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: systemPromptText,
        cache_control: { type: 'ephemeral' }  // Enable prompt caching
      }
    ],
    messages: [
      { role: 'user', content: userPrompt }
    ],
  }),
  timeout: TimeDuration.fromMillis(30000),
});

// Parse response
const body = JSON.parse(response.text());
if (response.ok) {
  const generatedText = body.content[0].text;
  const usage = body.usage;  // { input_tokens, output_tokens, cache_read_input_tokens, ... }
} else {
  const errorMsg = body.error?.message || 'Unknown API error';
  console.error(`LLM API error: ${errorMsg}`);  // Visible in spacetime logs
}
```

### Procedure Definition (SpacetimeDB 2.0.1)
```typescript
// Source: https://spacetimedb.com/docs/functions/procedures
import { TimeDuration } from 'spacetimedb';
import { SenderError } from 'spacetimedb/server';

export const callLlm = spacetimedb.procedure(
  { requestId: t.u64() },
  t.string(),
  (ctx, { requestId }) => {
    // Database reads/writes use ctx.withTx()
    // HTTP calls happen outside transactions
    // Return value goes only to the calling client
    return 'result';
  }
);
```

### Client Calling a Procedure (Vue)
```typescript
// After spacetime generate, procedures appear on the connection object
// Pattern follows existing reducer calling but procedures return values
const conn = window.__db_conn;
if (conn) {
  // Procedures are accessed like reducers but return promises
  conn.procedures.callLlm({ requestId: requestId });
}
```

### UTC Date String Helper
```typescript
// For budget reset comparison
function utcDateString(timestamp: any): string {
  const ms = Number(timestamp.microsSinceUnixEpoch / 1000n);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
```

### Thematic Error Messages (using existing event system)
```typescript
// Source: spacetimedb/src/helpers/events.ts
import { appendPrivateEvent, appendSystemMessage } from '../helpers/events';

// When budget exceeded
appendSystemMessage(ctx, character, 'The System grows weary of your demands. Return tomorrow.');

// When LLM API fails
appendSystemMessage(ctx, character, 'The System falters momentarily. Try again.');
```

## Discretion Recommendations

### Graceful Degradation: Block LLM-Dependent Actions
**Recommendation:** Block the action and show thematic message. Do NOT fall back to templates.
**Rationale:** This is v2.0 foundation -- downstream phases (character creation, world gen) will be LLM-only by design decision ("clean break, no legacy fallback"). Building template fallbacks now creates dead code. If the API is down, the player simply cannot perform that LLM-dependent action until it recovers. This is acceptable for a game where LLM generation is the core differentiator.

### Request Concurrency: One Active Request Per Player
**Recommendation:** Allow only one in-flight LLM request per player at a time.
**Rationale:** Simplifies budget tracking, prevents abuse, avoids race conditions. The validation reducer checks for any existing 'pending' or 'processing' request for the player before creating a new one.

### Output Format: Always JSON with Fallback Text Extraction
**Recommendation:** Always request JSON output from the LLM. Each domain defines its expected JSON schema. If JSON parsing fails, attempt to extract text content as a fallback.
**Rationale:** Mechanical content (skills, stats, items) MUST be structured. Narrative content (descriptions, combat narration) benefits from structured wrapping (e.g., `{ "narrative": "...", "metadata": {} }`). Consistent JSON handling simplifies the pipeline. Anthropic supports structured outputs if needed later.

### System Prompt Template Structure
**Recommendation:** Each domain gets a file in `data/llm_prompts.ts` exporting a function that builds the system prompt from game state context. Structure:
```typescript
export function buildCharacterCreationPrompt(worldContext: string): string { ... }
export function buildCombatNarrationPrompt(combatContext: string): string { ... }
```
**Rationale:** Functions allow injecting dynamic game state while keeping the sardonic narrator voice consistent via a shared preamble.

### Request Record Cleanup: Delete on Completion, 5-Minute TTL on Errors
**Recommendation:** Successful requests: delete immediately after writing results to game tables. Error requests: keep for 5 minutes (for client to display error), then let a scheduled cleanup reducer delete them.
**Rationale:** Keeps the request table small. Error visibility window gives the client time to show the thematic error message.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Reducers for external calls | Procedures with `ctx.http.fetch()` | SpacetimeDB 2.0 (Jan 2026) | Enables LLM integration without external services |
| `@clockworklabs/spacetimedb-sdk` | `spacetimedb` npm package | SpacetimeDB 2.0 | Single package for client + server |
| Positional reducer args | Object syntax `{ param: value }` | SpacetimeDB 2.0 | Same pattern applies to procedures |
| String-based scheduled tables | `scheduledReducers` registry pattern | SpacetimeDB 2.0 | For cleanup scheduler |

**Deprecated/outdated:**
- `@clockworklabs/spacetimedb-sdk`: Replaced by `spacetimedb` package
- Streaming LLM responses: Out of scope by design decision (typewriter animation on client instead)

## Open Questions

1. **Procedure Error Handling Semantics**
   - What we know: Procedures can throw `SenderError`, return values go to caller only
   - What's unclear: Exact behavior when `ctx.http.fetch()` times out or network fails -- does it throw? Return error response?
   - Recommendation: Wrap all HTTP calls in try/catch. Test timeout behavior early. The retry-once strategy handles this.

2. **Client Procedure Call API in Vue**
   - What we know: Generated bindings will include procedure schemas. React uses `conn.procedures.callLlm()`.
   - What's unclear: Exact Vue composable for procedures (is there a `useProcedure` equivalent to `useReducer`?). May need to call directly on connection object.
   - Recommendation: After first procedure is defined and bindings generated, inspect the generated code to confirm the calling pattern. Worst case, call directly on connection object.

3. **Prompt Caching with Haiku 4.5 (4,096 Token Minimum)**
   - What we know: Haiku requires 4,096 tokens minimum for caching. Combat narration prompts may be shorter.
   - What's unclear: Whether combat narration system prompts will naturally reach 4,096 tokens.
   - Recommendation: Design prompts to include sufficient game lore context to meet threshold. If a domain's prompt naturally falls short, skip caching for that domain rather than padding wastefully. Monitor costs.

## Sources

### Primary (HIGH confidence)
- [Anthropic Messages API](https://platform.claude.com/docs/en/api/messages) - Request/response format, model names, headers
- [Anthropic Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) - cache_control syntax, token thresholds, pricing
- [SpacetimeDB Procedures](https://spacetimedb.com/docs/functions/procedures) - Definition syntax, ctx.http.fetch, ctx.withTx, limitations

### Secondary (MEDIUM confidence)
- [SpacetimeDB 2.0.1 Release](https://github.com/clockworklabs/SpacetimeDB/releases/tag/v2.0.1) - Procedure examples, ask_ai pattern
- Existing codebase (`spacetimedb/src/`) - Established patterns, helper functions, table definitions

### Tertiary (LOW confidence)
- Client-side procedure calling in Vue -- not documented, inferred from React patterns and generated bindings structure

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - SpacetimeDB 2.0.1 confirmed, Anthropic API well-documented
- Architecture: MEDIUM - Procedure patterns from official examples, but beta status means edge cases unknown
- Pitfalls: MEDIUM - Transaction/HTTP constraint is documented; retry behavior and Vue integration need validation
- API format: HIGH - Anthropic Messages API is stable and well-documented
- Prompt caching: HIGH - Thresholds and syntax confirmed from official docs

**Research date:** 2026-03-06
**Valid until:** 2026-03-20 (procedures are beta, API could change)
