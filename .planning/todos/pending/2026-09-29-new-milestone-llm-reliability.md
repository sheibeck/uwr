---
created: 2026-09-29T00:00:00.000Z
title: NEW MILESTONE — fix the LLM pipeline (provider, credits, proxy architecture)
area: backend
priority: high
kind: milestone-seed
trigger: start with /gsd-new-milestone after v2.1 is audited, completed and archived
files:
  - llm-proxy/src/index.ts
  - llm-proxy/.dev.vars
  - src/composables/useLlmProxy.ts
  - spacetimedb/src/index.ts
---

## Why

User decision, 2026-09-29, when approving Phase 38: "I want a new milestone to address the LLM issues."
Timing chosen: finish v2.1 (phases 33–37) first, then start this milestone.

## Known issues to scope

- **Live LLM calls fail.** The OpenAI account behind `llm-proxy/.dev.vars` returns `429 You have no credits remaining`. Phase 38 proved the upgraded proxy (hono 4.13 / openai 7 / wrangler 4.143) reaches the provider; only a funded key is missing. SC-4's real 200 is deferred to this milestone. `bash llm-proxy/scripts/smoke.sh --real` is the check.
- **Provider mismatch.** PROJECT.md says "Anthropic Claude API", but the proxy uses the OpenAI SDK (`chat.completions.create`, model `gpt-5-mini`). Decide the provider and model mix deliberately.
- **Proxy architecture.** LLM calls go client → Cloudflare Worker → provider, with an LlmTask table polled by the client and a proxy secret in browser localStorage. This exists because `ctx.http.fetch` looked broken on SpacetimeDB 2.0.1, which research traced to 2.0.1's 500 ms default HTTP timeout; 2.10 defaults to 30 s (max 180 s). See `2026-09-29-spike-procedure-http-to-retire-llm-proxy.md`: that spike is the natural first phase of this milestone.
- The secret-in-localStorage pattern and client-side task polling are candidates for removal if procedure HTTP works (the API key would then live server-side).

## References

- `.planning/notes/platform-upgrade-research.md`
- `.planning/phases/38-platform-upgrade/38-05-SUMMARY.md` (proxy upgrade and the 429)
- `.planning/phases/38-platform-upgrade/38-RESEARCH.md`
