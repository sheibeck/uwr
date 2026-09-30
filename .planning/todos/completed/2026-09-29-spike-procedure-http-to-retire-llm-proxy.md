---
created: 2026-09-29T00:00:00.000Z
title: Spike procedure HTTP on SpacetimeDB 2.10 to retire llm-proxy
area: backend
priority: medium
resolves_phase: 39
files:
  - spacetimedb/src/index.ts
  - llm-proxy/src/index.ts
  - src/composables/useLlmProxy.ts
---

## Problem

LLM calls go through a Cloudflare Worker (`llm-proxy/`) and an LlmTask table that the client polls. We built this because `ctx.http.fetch` in procedures seemed broken locally on 2.0.1.

Research suggests the real cause was 2.0.1's 500ms default HTTP timeout (10s max). Since 2.0.5 the default is 30s and the max 180s ([#4630](https://github.com/clockworklabs/SpacetimeDB/pull/4630)). If procedure HTTP works, the proxy, the polling composable, and the proxy secret in localStorage can all go.

## Solution

Run this after Phase 38 (SpacetimeDB is on 2.10):

- Add a throwaway procedure that `ctx.http.fetch`es a public URL, then the Anthropic API with a small prompt and an explicit timeout
- Run it against the local server
- Watch for these gotchas: loopback and private IPs are blocked by design ([#4546](https://github.com/clockworklabs/SpacetimeDB/issues/4546)), so it can't call a local proxy; and `ctx.sender` was empty in procedures from 2.4 to 2.6.0 (fixed in 2.6.1)
- If it works, plan a separate phase or quick task to move LLM calls into procedures, keeping the API key server-side, and remove `llm-proxy/`

See `.planning/notes/platform-upgrade-research.md`.
