---
status: testing
phase: 42-client-cutover-and-legacy-removal
source: [42-VERIFICATION.md]
started: 2026-10-01T00:06:41Z
updated: 2026-10-01T00:06:41Z
---

## Current Test

number: 1
name: Returning browser's stored llm_proxy_secret is cleared
expected: |
  The key is gone from localStorage after load, nothing is shown to the player, and no request goes to any proxy URL
awaiting: user response

## Tests

### 1. Returning browser's stored llm_proxy_secret is cleared
Set `localStorage.llm_proxy_secret` by hand in devtools, then reload.
expected: The key is gone from localStorage after load, nothing is shown to the player, and no request goes to any proxy URL
result: [pending]

### 2. Keeper indicator per LLM action
Trigger creation race, class, world gen, skill, renown perk and NPC chat; watch the narrative console.
expected: The route's Keeper line shows with the pulse while the job is pending/in_flight/received and clears when it ends; creation and world gen lock input, other routes do not; a forced failure/expiry shows the server-written in-voice Keeper line and no error chip
result: [pending]

### 3. Narrow viewport, screen reader, reduced motion
About 320px wide with the longest indicator line; NVDA/VoiceOver on the role=status region.
expected: Line wraps without overflow; first line is announced politely; prefers-reduced-motion turns the pulse off
result: [pending]

### 4. Live LLM smoke test (deferred by the user)
Run llm_smoke_test as admin on the local stack.
expected: A job completes end to end with the stored Anthropic key (keyValid true)
result: [pending]

### 5. User cleanup checklist (42-USER-CHECKLIST.md)
Delete the Cloudflare Worker, revoke the OpenAI key, remove VITE_LLM_PROXY_* from the root .env.local and hosting settings, delete the leftover llm-proxy/ folder (and its .git/info/exclude line), rebuild and redeploy, and run the maincloud two-publish yourself.
expected: No deployed proxy, no live proxy credential, maincloud matches local
result: [pending]
progress: 2026-09-30.
- No Cloudflare Worker was ever deployed: the user's account has no projects.
- The user has revoked all OpenAI API keys.
- Claude deleted the local `llm-proxy/` folder and its `.git/info/exclude` line, at the user's request.
- Still to do: remove the `VITE_LLM_PROXY_*` lines from `.env.local` and the hosting settings; run the maincloud two-publish.

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
