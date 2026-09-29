# Phase 5: LLM Architecture - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Working LLM content pipeline: procedure calls OpenAI API, writes to content tables, handles failures gracefully. No content consumers yet — this is the plumbing phase. Covers quest text, event text, and NPC-related generated content.

</domain>

<decisions>
## Implementation Decisions

### LLM Provider
- **Switch from Anthropic to OpenAI** — cost was the deciding factor (Claude too expensive)
- Target model: **gpt-5-mini** for cost-effectiveness (model name stored in LlmConfig so it can be swapped without code changes)
- API approach: **OpenAI Responses API** — use `client.responses.create()` with structured JSON output
- API docs reference for researcher: https://developers.openai.com/api/docs
- LlmConfig stores: api_key, model name (default: gpt-5-mini), circuit state

### JSON Response Schema
- Claude has discretion to design the schema — pick what's architecturally stable
- Must scale to **three content types**: quest text, event text, and NPC content (not just quests/events as originally scoped)
- Response format: structured JSON so the model knows exactly what fields to return per content type
- Researcher should validate schema design against OpenAI structured output capabilities

### Shadeslinger Tone
- **"A smart, self-aware fantasy voice that blends genuine stakes, sharp character-driven humor, and conversational modern language within a world that treats every choice as meaningful."**
- SHADESLINGER_SYSTEM_PROMPT should encode this voice with 5 examples spanning quest flavor, event consequence text, and NPC dialogue
- Fallback content must match this tone — not generic placeholder text

### Content Triggering & Lifecycle
- **Claude's Discretion** — user deferred triggering approach to builder
- Recommendation: automatic generation on entity creation (quest/event/NPC created → row inserted as `pending` → procedure fires → flips to `ready` or writes fallback)
- Circuit breaker opens after 3 failures in 60 seconds; auto-resets after 5 minutes (from roadmap spec)

### Fallback Content
- 3+ fallbacks per content type (quest, event, NPC)
- Fallbacks must be written in Shadeslinger tone — not generic "Content unavailable" messages
- Claude designs the actual fallback text as part of the FALLBACK_CONTENT constant

### Claude's Discretion
- Exact JSON response schema fields per content type
- Content triggering mechanism (recommended: automatic on entity creation)
- Fallback text content (must match Shadeslinger tone)
- Prompt builder function structure (one per content type vs shared with type param)

</decisions>

<specifics>
## Specific Ideas

- User explicitly mentioned concern about Anthropic Claude API costs — this is why the provider switch matters
- Use `client.responses.create()` from OpenAI Responses API (not the older chat completions endpoint)
- Well-formatted JSON instructions in the prompt help the model return structured data matching our schema
- gpt-5-mini preferred for high-volume short content (quest descriptions, event flavor text, NPC greetings)

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-llm-architecture*
*Context gathered: 2026-02-19*
