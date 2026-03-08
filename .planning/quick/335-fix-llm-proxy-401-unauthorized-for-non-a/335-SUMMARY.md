---
quick_task: 335
description: Fix LLM proxy 401 Unauthorized for non-admin accounts during character creation
date: 2026-03-07
commit: ea49d5c
---

# Quick Task 335: Fix LLM proxy 401 Unauthorized

## Problem
Non-admin users got 401 Unauthorized when triggering LLM calls (character creation, world gen, etc.) because `useLlmProxy.ts` read the proxy secret exclusively from `localStorage.getItem('llm_proxy_secret')`, which only admin accounts had set.

## Fix
Added `import.meta.env.VITE_LLM_PROXY_SECRET` as fallback in `useLlmProxy.ts:53`. The proxy secret is a shared app-level secret (not per-user auth), so baking it into the client build via env var is appropriate.

Also added `VITE_LLM_PROXY_SECRET=unwritten-realms-proxy-secret` to `.env.local` (required newline fix — initial append lacked trailing newline on previous line).

## Files Modified
- `src/composables/useLlmProxy.ts` — added env var fallback for proxy secret
- `.env.local` — added VITE_LLM_PROXY_SECRET (gitignored, not committed)
