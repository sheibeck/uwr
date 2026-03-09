# Phase 24: LLM Pipeline Foundation - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

The server can make validated, cost-controlled LLM calls via SpacetimeDB procedures, and the client can trigger and monitor them. This phase builds the plumbing — no player-facing LLM features yet. Downstream phases (character creation, world gen, skills, combat narration) all consume this pipeline.

</domain>

<decisions>
## Implementation Decisions

### Budget & Rate Limiting
- Flat daily cap of 50 LLM calls per player
- Resets at UTC midnight
- Hard block when exceeded — player sees a thematic message (e.g., "The System grows weary...")
- Only successful calls count against the budget — failed/errored calls are free

### Error Handling & Fallback
- Retry once on API failure, then mark request as 'error'
- Failed calls do not consume daily budget
- Players see thematic error messages ("The System falters..."), never raw technical errors
- Admins can see raw error details via `spacetime logs` (server-side logging)
- Graceful degradation strategy: Claude's Discretion

### Request Lifecycle & Monitoring
- Players see contextual indicators only (e.g., "The System is considering...") — no player-visible request table
- Admin monitoring via server logs (`spacetime logs`), not a dedicated admin table
- Request records deleted from status table after completion — use existing event tables for history
- Request concurrency model (one-at-a-time vs queue per player): Claude's Discretion

### Prompt Architecture
- Per-domain system prompts (character creation, world gen, combat narration, etc.) — not a single shared prompt
- Sardonic System narrator voice baked into system prompts from day one
- Per-request model field — each call specifies haiku or sonnet (Haiku 4.5 for real-time, Sonnet for high-stakes)
- Output format (structured JSON vs freeform text per use case): Claude's Discretion

### Claude's Discretion
- Graceful degradation strategy (block LLM-dependent actions vs template fallback)
- Request concurrency model per player
- Output format strategy (JSON for mechanical content, freeform for narrative, or always JSON)
- System prompt template structure within per-domain approach
- Request record cleanup timing

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `requireAdmin()` in `spacetimedb/src/data/admin.ts`: Admin identity validation, reuse for API key management reducer
- Event system (`appendPrivateEvent()`, `appendLocationEvent()`): Use for player-facing LLM status messages and error notifications
- `ADMIN_IDENTITIES` set: Already configured for admin operations

### Established Patterns
- Reducer-based mutations with `SenderError` / `fail()` for validation
- Server-authoritative state — client subscribes to tables via `useTable()`
- No optimistic updates — UI waits for server confirmation
- Data catalogs in `spacetimedb/src/data/` for game constants

### Integration Points
- No existing procedures in codebase — this is the first SpacetimeDB procedure
- SpacetimeDB procedures use `ctx.withTx()` for database access (different from reducers)
- `ctx.http.fetch()` available in procedures for external API calls
- Client calls procedures differently from reducers — will need new client-side patterns
- Generated bindings (`src/module_bindings/`) will need regeneration after procedure creation

</code_context>

<specifics>
## Specific Ideas

- Project decision: "Client-triggered procedures (reducer validates, client calls procedure for LLM)" — the flow is: reducer validates permissions/budget, then client calls the procedure
- SpacetimeDB procedures are beta — load test early before building complex features on top
- Prompt caching requires minimum thresholds: 1024 tokens for Sonnet, 4096 tokens for Haiku — system prompts must meet these minimums

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 24-llm-pipeline-foundation*
*Context gathered: 2026-03-06*
