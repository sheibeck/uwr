# Stack Research

**Project:** UWR — Multiplayer Browser RPG (SpacetimeDB 1.12.0, TypeScript)
**Domain:** SpacetimeDB procedures + Anthropic API integration
**Researched:** 2026-02-11

---

## SpacetimeDB Procedures HTTP

SpacetimeDB TypeScript procedures are in **beta** as of 1.12.0. Key capabilities:

### What `ctx.http.fetch()` provides
- Makes HTTP requests from within a procedure (server-side, not client-side)
- Signature mirrors the Fetch API: `ctx.http.fetch(url, options)`
- Supports GET and POST methods; custom headers for auth tokens (Authorization: Bearer)
- Returns a response object with `.text()`, `.json()` methods
- **Cannot be called inside a `withTx()` block** — must happen between transactions

### HTTP call lifecycle in procedures
```typescript
spacetimedb.procedure('gen_quest', { questId: t.u64() }, t.unit(), (ctx, { questId }) => {
  // Step 1: Read state in a transaction
  let state: { zone: string; level: number } | undefined;
  ctx.withTx(tx => {
    const quest = tx.db.quest.questId.find(questId);
    if (quest) state = { zone: quest.zone, level: quest.level };
  });
  if (!state) return {};

  // Step 2: HTTP call OUTSIDE any transaction
  const response = ctx.http.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ ... }),
    // Timeout: TimeDuration.fromMillis(8000) — always set this
  });

  // Step 3: Write result in new transaction
  ctx.withTx(tx => {
    tx.db.questText.insert({ questId, text: response.text(), status: 'ready' });
  });
  return {};
});
```

### Limitations and constraints
- **Beta caveat**: API will change in future SpacetimeDB releases. Encapsulate in abstraction layer.
- **No streaming**: Cannot stream tokens back to clients. Must write complete response to table.
- **Return values are caller-only**: Table mutations propagate to all subscribers; return values don't.
- **`withTx` must be idempotent**: The callback may execute multiple times with different states.
- **No documented max procedure timeout**: Developer must set explicit HTTP timeouts.
- **No concurrent HTTP calls in one procedure**: Sequential only.

### SpacetimeDB 1.11 → 1.12 changes
- 1.12.0 is the version in use (`spacetimedb: "^1.12.0"` per STACK.md)
- Procedures were added in 1.11.x as beta
- No breaking changes to procedure API between 1.11 and 1.12 documented; verify before upgrading

---

## Anthropic API (2026)

### Messages API endpoint
```
POST https://api.anthropic.com/v1/messages
```

### Required headers
```
x-api-key: YOUR_API_KEY
anthropic-version: 2023-06-01
content-type: application/json
```

### Request body (minimal)
```json
{
  "model": "claude-haiku-4-5-20251001",
  "max_tokens": 150,
  "system": "You are a sarcastic fantasy narrator...",
  "messages": [
    { "role": "user", "content": "Generate a quest introduction for..." }
  ]
}
```

### Response structure
```json
{
  "id": "msg_...",
  "type": "message",
  "content": [{ "type": "text", "text": "Generated text here" }],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 120, "output_tokens": 87 }
}
```
Extract text: `response.content[0].text`

### Model selection for UWR
| Use case | Model | Rationale |
|----------|-------|-----------|
| NPC ambient dialogue, short barks | `claude-haiku-4-5-20251001` | Fastest (~0.5s TTFT), cheapest ($1/$5 per MTok) |
| Quest descriptions, faction lore | `claude-sonnet-4-5-20250929` | Quality + reasonable latency (~1.2s TTFT) |
| Major world events, story moments | `claude-sonnet-4-5-20250929` | Never use Opus in real-time generation |

### Prompt caching
Add `cache_control: { type: "ephemeral" }` to large static content blocks:
```json
{
  "type": "text",
  "text": "[Long world lore / tone instructions]",
  "cache_control": { "type": "ephemeral" }
}
```
- Cache TTL: 5 minutes default, 1 hour for stable content
- Minimum cacheable: 1024 tokens (Sonnet), 4096 tokens (Haiku)
- Cache read cost: 10% of normal input price — critical for concurrent players sharing world context

### Pricing (2026-02-11)
| Model | Input (uncached) | Cache read | Output |
|-------|-----------------|------------|--------|
| Haiku 4.5 | $1/MTok | $0.10/MTok | $5/MTok |
| Sonnet 4.5 | $3/MTok | $0.30/MTok | $15/MTok |

---

## Credential Storage

### The problem
SpacetimeDB TypeScript backend modules don't have native environment variable support for runtime secrets. The `ANTHROPIC_API_KEY` must reach the module code somehow.

### Options

**Option A: Compile-time constant (simplest, not recommended for production)**
```typescript
const ANTHROPIC_API_KEY = 'sk-ant-...';  // Hard-coded in source
```
- Risk: Key is in source code / git history. Never do this for production.

**Option B: SpacetimeDB admin-set config table (recommended)**
Create a private `Config` table:
```typescript
export const Config = table(
  { name: 'config' },  // NOT public — no `public: true`
  { key: t.string().primaryKey(), value: t.string() }
);
```
Admin populates it via a privileged reducer (or direct db tool). The procedure reads from it:
```typescript
const keyRow = ctx.db.config.key.find('anthropic_api_key');
if (!keyRow) throw new Error('API key not configured');
const API_KEY = keyRow.value;
```
This key is never exposed to clients (table not public, not in any view).

**Option C: Module-level constant via SpacetimeDB module environment (future)**
SpacetimeDB roadmap includes proper environment variable support. Not available in 1.12.

### Recommendation for UWR
Use Option B (Config table). Set the API key once via an admin-only `setConfig` reducer protected by a hardcoded admin identity check. Never log or return the value.

---

## Cost & Rate Limit Patterns

### Estimated cost model (UWR)
Assumptions: 50 concurrent players, each triggering 1 LLM generation per 5 minutes.
- 50 * 12 = 600 calls/hour
- Per call: ~800 input tokens (cached lore: 600 + fresh context: 200) + 150 output tokens
- Cached input cost (Sonnet): 600 * $0.30/MTok = $0.00018 per call
- Fresh input cost (Sonnet): 200 * $3/MTok = $0.0006 per call
- Output cost (Sonnet): 150 * $15/MTok = $0.00225 per call
- Total per call: ~$0.003
- Per hour (600 calls): ~$1.80
- Per month (assumed 8h/day active): ~$432/month at scale

**With deduplication (60% cache hit rate on content):**
- Effective calls: 240/hour = ~$0.72/hour = ~$173/month

### Rate limits (Anthropic Tier 1)
- Requests per minute: 50 RPM (Haiku), 50 RPM (Sonnet)
- Tokens per minute: 50,000 TPM (Haiku), 40,000 TPM (Sonnet)
- Requests per day: 5,000 (Haiku), 1,000 (Sonnet)

At 600 calls/hour = 10 RPS, you'd blow the RPM limits immediately with Tier 1.
**Upgrade to Tier 2+ before launch** (requires $40 spend): 1,000 RPM, 200k TPM.

### Circuit breaker implementation
```typescript
// Track failures in SpacetimeDB table
export const LlmCircuit = table({ name: 'llm_circuit' }, {
  id: t.u64().primaryKey(),
  failureCount: t.u64(),
  lastFailureAt: t.timestamp(),
  isOpen: t.bool(),
});
```
Open circuit if 3+ failures in 60 seconds. Reset after 5 minutes. All calls during open circuit use fallback content.

---

## Key Findings & Risks

| Finding | Confidence | Impact |
|---------|-----------|--------|
| Procedures are beta — API will change | HIGH | Medium — encapsulate carefully |
| HTTP cannot happen inside `withTx` | HIGH | High — architecture must account for this |
| Prompt caching is critical for cost control | HIGH | High — implement from day 1 |
| Rate limits require Tier 2+ at scale | HIGH | High — plan for upgrade before launch |
| Config table is the best credential pattern | MEDIUM | Medium — no perfect solution in 1.12 |
| `withTx` callbacks must be idempotent | HIGH | High — double-writes must be safe |
