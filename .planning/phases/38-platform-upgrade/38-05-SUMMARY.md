---
phase: 38-platform-upgrade
plan: 05
subsystem: platform
tags: [llm-proxy, cloudflare-workers, hono, openai-7, wrangler, pnpm, smoke-test]
requires: [38-04]
provides:
  - llm-proxy/scripts/smoke.sh (health, auth-required, validation, optional real call)
  - llm-proxy on hono 4.13.10, openai 7.23.0, wrangler 4.143.0, workers-types 5.20260928.1
  - llm-proxy as a standalone pnpm project (package-lock.json removed)
affects: [38-06, 38-08]
tech-stack:
  added: [pnpm-lockfile-llm-proxy]
  patterns:
    - "Settings-only pnpm-workspace.yaml per standalone pnpm project (allowBuilds esbuild + workerd)"
key-files:
  created:
    - llm-proxy/scripts/smoke.sh
    - llm-proxy/pnpm-workspace.yaml
    - llm-proxy/pnpm-lock.yaml
  modified:
    - llm-proxy/package.json
  deleted:
    - llm-proxy/package-lock.json
key-decisions:
  - "Real /api/llm call deferred: OpenAI returned 429 no credits (key/billing problem), not a code regression"
requirements-completed: [SC-5]
requirements-partial: [SC-4]
metrics:
  tasks: 2
  commits: 2
completed: 2026-09-29
status: complete
---

# Phase 38 Plan 05: llm-proxy upgrade, pnpm conversion and smoke test Summary

The Cloudflare Worker proxy runs hono 4.13.10, openai 7.23.0, wrangler 4.143.0 and workers-types 5.20260928.1 from its own pnpm lockfile. Health, auth and validation smoke checks pass before and after the upgrade. The real `/api/llm` call is deferred because OpenAI returned "429 You have no credits remaining".

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Smoke script and baseline on the npm-layout dependencies | 8e55ac0c |
| 2 | pnpm conversion, dependency bump, upgraded smoke with `--real` | 014a13ce |

## Smoke output (no secrets)

Baseline (old deps, npm layout, `wrangler dev` 127.0.0.1:8787, no `--real`), exit 0:

```
PASS health (200)
PASS auth-required (401)
PASS validation (400)
```

Upgraded (new deps, pnpm layout, `--real`), exit 1 only because of the real call:

```
PASS health (200)
PASS auth-required (401)
PASS validation (400)
FAIL real-call (expected 200 with ok:true, got 502)
  status=502 error=429 You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.
```

## Resolved versions and typecheck

| Package | Before range | After range | Resolved |
|---------|--------------|-------------|----------|
| hono | ^4.7.0 | ^4.13.0 | 4.13.10 |
| openai | ^4.85.0 | ^7.0.0 | 7.23.0 |
| wrangler | ^4.0.0 | ^4.140.0 | 4.143.0 |
| @cloudflare/workers-types | ^4.20250130.0 | ^5.20260926.1 | 5.20260928.1 |

`tsc --noEmit -p llm-proxy/tsconfig.json` error count: TSC_BASE = 0, after = 0. `pnpm install` exit 0 with only esbuild and workerd approved (no other ignored builds). `pnpm install --frozen-lockfile` exit 0. `llm-proxy/src` and `llm-proxy/wrangler.toml` unchanged (`git diff --quiet` exit 0; compatibility_date stays 2025-01-01).

## Real call: DEFERRED (key problem)

The upgraded worker reached OpenAI through openai 7's `chat.completions.create` and OpenAI answered 429 with "You have no credits remaining", surfaced by the proxy as its documented 502 `{"ok":false,"error":...}`. The wrangler log shows the same OpenAI API error and no worker exception. This proves the upgraded code path end to end up to the provider, so it is recorded as "real call deferred: key problem". Plan 38-08's human checkpoint should ask the user to add OpenAI credits (or supply a working key in `llm-proxy/.dev.vars`) and re-run `bash llm-proxy/scripts/smoke.sh --real` from `llm-proxy/` while `pnpm exec wrangler dev --port 8787 --ip 127.0.0.1` is running. SC-4 is therefore satisfied up to the provider boundary and pending a funded key for the final 200.

## Deviations from Plan

None in code or scope. Process notes:

- Stopping wrangler on Windows left orphan wrangler node processes after `taskkill /IM workerd.exe`. They were identified by their wrangler command line and killed by PID only (no unrelated node process touched). Port 8787 has no listener afterward and nothing answers on it.
- Git reported a CRLF warning for `smoke.sh` on commit. If a Windows checkout ever converts it to CRLF, run it with `bash` after `dos2unix`, or add a `.gitattributes` `*.sh text eol=lf` rule (not done here; out of scope).

## Safety log

- No `wrangler deploy` in any form, no `deploy` or `secret:*` script, nothing pushed, nothing published.
- `.dev.vars` is gitignored; its values were never printed. Grep checks confirmed neither `PROXY_SECRET` nor `OPENAI_API_KEY` values appear in `smoke.sh`. The script passes the bearer through a chmod-600 temp header file and redacts key-like tokens in error output.
- No pnpm command ran inside `llm-proxy/` before `llm-proxy/pnpm-workspace.yaml` existed.
- No permission denials occurred.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- Files exist: `llm-proxy/scripts/smoke.sh`, `llm-proxy/pnpm-workspace.yaml`, `llm-proxy/pnpm-lock.yaml`; `llm-proxy/package-lock.json` not tracked.
- Commits 8e55ac0c and 014a13ce exist.
- Port 8787 free.
