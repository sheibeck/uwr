# Technology Stack

**Project:** UWR v2.0 — The Living World (LLM-driven procedural RPG)
**Researched:** 2026-03-06
**Scope:** NEW stack additions only. Existing stack (SpacetimeDB 2.0.1, Vue 3.5.13, Vite 6.4.1) is validated and unchanged.

---

## Recommended Stack Additions

### LLM Integration (Server-Side)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Raw HTTP via `ctx.http.fetch()` | SpacetimeDB 2.0.1 built-in | Call Anthropic Messages API | SpacetimeDB procedures use **synchronous** HTTP. The `@anthropic-ai/sdk` (v0.78.0) is async-only and **cannot run inside SpacetimeDB procedures**. Use raw HTTP to `POST https://api.anthropic.com/v1/messages` instead. |
| Claude Haiku 4.5 | API model `claude-haiku-4-5-20250929` | Primary generation model | $0.25/$1.25 per 1M tokens (input/output). 80x cheaper than Opus. Fast enough for real-time feel. Use for: skill gen, NPC gen, combat narration, quest gen, region descriptions. |
| Claude Sonnet 4.6 | API model `claude-sonnet-4-6-20260320` | Complex generation fallback | $3/$15 per 1M tokens. Use only for: character class creation (one-time, high-stakes), world-defining region generation. Haiku handles everything else. |

**Critical constraint:** SpacetimeDB procedures are synchronous. `ctx.http.fetch()` blocks until the response completes. This means:
- No streaming responses inside procedures (the full response arrives at once)
- Timeout management is essential (set `timeout` in RequestOptions)
- Cannot use `@anthropic-ai/sdk` npm package (it's async/Promise-based)
- Cannot make HTTP calls while a transaction (`ctx.withTx`) is open

### LLM Integration (Client-Side Streaming — Optional Enhancement)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@anthropic-ai/sdk` | ^0.78.0 | Client-side streaming for narrative feel | **Only if** you add a thin proxy/edge function. NOT for direct browser use (API key exposure). Consider this a Phase 2+ enhancement, not MVP. |

**Recommendation:** For MVP, do NOT stream. SpacetimeDB procedures return the full LLM response, which gets written to event log tables. The client receives it via subscription reactivity. This is simpler, secure, and matches the existing LogWindow pattern. Streaming can be layered on later via a typewriter animation effect on the client (no server changes needed).

### Prompt Management (No New Dependencies)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Template literal functions | TypeScript built-in | Prompt templates | No library needed. Prompts are string templates with variable interpolation. Keep them in `spacetimedb/src/prompts/` as pure functions that return `{role, content}[]` message arrays. |

**Why no prompt library:** Prompt libraries (LangChain, etc.) are async, Node.js-dependent, and massively over-engineered for this use case. You need string templates that produce JSON message arrays for a REST API call. TypeScript template literals do this perfectly.

### Client UI Additions

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| No new UI library | -- | Chat-first narrative interface | Build on existing `LogWindow.vue` + `CommandBar.vue`. The existing event log system is already a chat-like interface with scoped messages, timestamps, and styled event kinds. Evolve it, don't replace it. |
| CSS `@keyframes` / `requestAnimationFrame` | Browser built-in | Typewriter text animation | Fake streaming feel on client side. Characters appear progressively even though the full text arrived at once via subscription. Zero dependencies. |
| `v-html` with sanitization | Vue built-in | Render narrative markup | Already used in LogWindow. Extend with simple markdown-like formatting for LLM output (bold, italic, color spans). |

**Why no chat UI library:** Syncfusion Chat UI, vue-advanced-chat, etc. are designed for person-to-person messaging with avatars, read receipts, typing indicators. UWR's "chat" is a narrative log from a system narrator -- fundamentally different from a chat app. The existing LogWindow is closer to what's needed than any chat library.

### Caching & Cost Management (No New Dependencies)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| SpacetimeDB tables | Built-in | LLM response cache | Store generated content (classes, skills, NPCs, regions) in tables. These ARE the cache. Once a class is generated, it lives in the `Character` table forever. Once a region is generated, it lives in the `Region` table. No separate cache layer needed. |
| Anthropic prompt caching | API feature | Reduce repeated system prompt costs | Cache reads cost 0.1x base price. System prompts (narrator voice, world context) are identical across calls -- perfect for prompt caching. Send `cache_control: {"type": "ephemeral"}` on system messages. |

---

## What NOT to Add

| Technology | Why Not |
|------------|---------|
| `@anthropic-ai/sdk` (server) | Async-only. Cannot run in synchronous SpacetimeDB procedures. Use raw `ctx.http.fetch()`. |
| LangChain / LlamaIndex | Massive async frameworks. Overkill for structured prompt templates + one API call. |
| Any prompt templating library | TypeScript template literals are sufficient. Prompts are just functions returning message arrays. |
| Redis / Memcached | SpacetimeDB tables ARE the cache. Generated content persists in the database. |
| Vector database (Pinecone, etc.) | No semantic search needed. Content is generated on-demand, not retrieved from embeddings. |
| OpenAI / other LLM providers | Anthropic Claude is the chosen provider per PROJECT.md. Don't multi-provider. |
| Syncfusion Chat UI / vue-advanced-chat | Wrong abstraction. UWR needs a narrative log, not a chat widget. |
| Server-Sent Events / WebSocket streaming | SpacetimeDB subscriptions already provide real-time reactivity. Adding a separate streaming channel creates architectural complexity for marginal UX gain. |
| Marked / markdown parser | LLM output should return pre-formatted HTML spans or plain text with simple custom markup. Full markdown parsing is overkill for game narrative text. |

---

## Architecture: LLM Call Flow

```
Client                    SpacetimeDB                      Anthropic API
  |                           |                                |
  |-- reducer call ---------->|                                |
  |   (e.g. create_class)    |                                |
  |                           |-- procedure (internal) ------->|
  |                           |   ctx.http.fetch(anthropic)    |
  |                           |<-- JSON response --------------|
  |                           |                                |
  |                           |-- ctx.withTx() --------------->|
  |                           |   Insert generated content     |
  |                           |   into tables                  |
  |                           |                                |
  |<-- subscription update ---|                                |
  |   (table change pushes    |                                |
  |    to client reactively)  |                                |
```

**Important pattern:** Reducers call procedures internally. The client calls a reducer (e.g., `createCharacterClass`), the reducer delegates to a procedure for the LLM call, the procedure writes results to tables via `ctx.withTx()`, and the client receives the data via normal SpacetimeDB subscription reactivity.

**Wait -- can reducers call procedures?** No. Reducers and procedures are both top-level entry points. The correct pattern is:

```
Option A (Recommended): Client calls procedure directly
  Client -> procedure (HTTP to Anthropic + withTx to write results)
  Client <- subscription update with generated content

Option B: Two-step via reducer
  Client -> reducer (validates, sets "generating" flag in table)
  Client -> procedure (fetches LLM, writes results via withTx)
  Client <- subscription updates for both steps
```

Option A is simpler. Use Option B only when you need the reducer's transaction guarantees for validation before spending money on an LLM call.

---

## Raw HTTP Call Pattern (Server-Side)

```typescript
// spacetimedb/src/llm/claude.ts -- thin wrapper around ctx.http.fetch

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeRequest {
  model: string;
  max_tokens: number;
  system: string | Array<{ type: string; text: string; cache_control?: { type: string } }>;
  messages: ClaudeMessage[];
}

interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

export function callClaude(
  http: HttpClient,
  apiKey: string,
  request: ClaudeRequest
): ClaudeResponse {
  const response = http.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(request),
    timeout: { secs: 30, nanos: 0 },  // TimeDuration format TBD
  });

  if (!response.ok) {
    throw new Error(`Claude API error ${response.status}: ${response.text()}`);
  }

  return response.json() as ClaudeResponse;
}
```

---

## Prompt Template Pattern (No Library)

```typescript
// spacetimedb/src/prompts/class_generation.ts

const SYSTEM_NARRATOR = `You are The System — a sardonic, omniscient narrator of a fantasy world.
You find mortals endlessly amusing. Your tone is dry, witty, and slightly mocking,
but never cruel. You speak as if narrating a story you find entertaining.`;

export function classGenerationPrompt(race: string, archetype: 'Warrior' | 'Mystic'): ClaudeRequest {
  return {
    model: 'claude-haiku-4-5-20250929',
    max_tokens: 500,
    system: [
      { type: 'text', text: SYSTEM_NARRATOR, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `Generate a unique class for a ${race} ${archetype}. Return JSON: { "className": "...", "description": "...", "flavor": "..." }` },
    ],
    messages: [
      { role: 'user', content: `I am a ${race}. I walk the path of the ${archetype}.` },
    ],
  };
}
```

---

## Cost Estimates

| Action | Model | Est. Tokens (in/out) | Cost per Call | Calls per Player Session |
|--------|-------|---------------------|---------------|-------------------------|
| Character class gen | Haiku 4.5 | 500/300 | $0.0005 | 1 |
| Skill generation (3 options) | Haiku 4.5 | 600/400 | $0.0007 | ~5 per session |
| Region generation | Haiku 4.5 | 800/500 | $0.0008 | 1-2 |
| Combat narration (per round) | Haiku 4.5 | 400/200 | $0.0004 | ~10 per combat |
| NPC generation | Haiku 4.5 | 500/400 | $0.0006 | 2-3 |
| Quest generation | Haiku 4.5 | 700/500 | $0.0008 | 1-2 |

**Estimated cost per player session (1 hour):** ~$0.01-0.02 with Haiku 4.5
**Estimated cost per 1000 MAU:** ~$200-400/month (assuming 20 sessions/player/month)

**Cost controls:**
1. Use Haiku for everything except class creation
2. Enable Anthropic prompt caching (system prompts cached at 0.1x cost)
3. Rate-limit LLM calls per player (e.g., max 5 skill generations per hour)
4. Cache generated content in tables -- never regenerate what already exists
5. Keep prompts concise -- every token costs money

---

## API Key Management

**Problem:** SpacetimeDB procedures need the Anthropic API key, but it can't be hardcoded.

**Solution:** Store the API key in a private SpacetimeDB table, seeded by an admin reducer:

```typescript
export const Config = table({ name: 'config' }, {
  key: t.string().primaryKey(),
  value: t.string(),
});

// Admin-only reducer to set config
spacetimedb.reducer('set_config', { key: t.string(), value: t.string() }, (ctx, { key, value }) => {
  if (!isAdmin(ctx.sender)) throw new SenderError('Not admin');
  const existing = ctx.db.config.key.find(key);
  if (existing) ctx.db.config.key.update({ ...existing, value });
  else ctx.db.config.insert({ key, value });
});
```

The procedure reads the key from the config table via `ctx.withTx()`. The table is private (not `public: true`), so clients never see it.

---

## Existing Infrastructure to Leverage (NOT new stack)

| Existing System | How It Serves v2.0 |
|----------------|-------------------|
| Event log system | Narrative delivery channel. LLM-generated text writes to event logs, client receives via subscription. |
| LogWindow.vue | Evolves into chat-first narrative UI. Already handles scoped messages, timestamps, styled kinds. |
| CommandBar.vue | Player input interface. Already parses commands. Extend for narrative inputs. |
| Config table pattern | Already exists in codebase. Use for API key storage. |
| `spacetimedb/src/data/` | Prompt templates and generation schemas live here alongside existing game data. |

---

## Installation (Server-Side)

```bash
# No new server dependencies needed!
# SpacetimeDB 2.0.1 already includes ctx.http.fetch() in procedures.
# The Anthropic API is called via raw HTTP -- no SDK required.
```

## Installation (Client-Side)

```bash
# No new client dependencies needed!
# Chat-first UI is built from existing Vue components.
# Typewriter animation uses browser-native APIs.
```

**Total new npm dependencies: ZERO.**

This is intentional. Every new dependency is a maintenance burden, a bundle size increase, and a potential breaking change. The existing stack plus raw HTTP covers every requirement.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| LLM call method | Raw `ctx.http.fetch()` | `@anthropic-ai/sdk` | SDK is async-only; SpacetimeDB procedures are synchronous |
| Prompt management | TypeScript template functions | LangChain | Massive async framework, Node.js-only, extreme overkill |
| LLM model | Haiku 4.5 (primary) | Sonnet/Opus | 80x more expensive. Haiku quality is sufficient for game content. |
| Chat UI | Evolve existing LogWindow | Syncfusion Chat UI | Wrong abstraction (person-to-person chat vs narrative log) |
| Response caching | SpacetimeDB tables | Redis | Additional infrastructure. Generated content naturally lives in game tables. |
| Streaming | Typewriter animation (client) | SSE/WebSocket streaming | Adds architectural complexity. Subscription reactivity + client animation achieves same UX. |
| Structured output | JSON in prompt instructions | Anthropic Structured Outputs beta | Structured Outputs requires beta header and specific models. Simple JSON instructions with Haiku work reliably for game content schemas. |

---

## Sources

- [SpacetimeDB Procedures Documentation](https://spacetimedb.com/docs/procedures/) - Procedure API, HTTP fetch, transaction management
- [SpacetimeDB 2.0.1 Release](https://github.com/clockworklabs/SpacetimeDB/releases/tag/v2.0.1) - Current version with procedure support
- [Anthropic TypeScript SDK (npm)](https://www.npmjs.com/package/@anthropic-ai/sdk) - v0.78.0, async-only (NOT usable in SpacetimeDB procedures)
- [Claude API Messages Endpoint](https://docs.anthropic.com/en/api/messages) - Raw HTTP REST API reference
- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing) - Haiku $0.25/$1.25, Sonnet $3/$15, Opus $5/$25 per 1M tokens
- [Anthropic Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) - JSON schema compliance (beta)
- [Anthropic Prompt Caching](https://platform.claude.com/docs/en/about-claude/pricing) - Cache reads at 0.1x base price
- [LLM Cost Optimization Strategies](https://ai.koombea.com/blog/llm-cost-optimization) - 60-80% cost reduction techniques
- SpacetimeDB SDK source: `spacetimedb/dist/server/procedures.d.ts`, `http_internal.d.ts` (local, verified)
