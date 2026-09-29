---
name: run-local
description: Launch (or stop) the full UWR stack locally for manual testing — SpacetimeDB server, module publish, llm-proxy (wrangler dev), and the Vite client. Use when the user asks to run, start, launch, or stop the game/servers locally.
---

# Run UWR locally

Three long-lived processes, started in this order. Start each with the Bash tool's
`run_in_background: true` so it keeps running across turns, then health-check it before
starting the next. Never publish to maincloud, never run `pnpm spacetime:publishprod`,
never `wrangler deploy`, never pass `--clear-database` unless the user asks.

| # | Process | Command (from repo root) | Port | Health check |
|---|---------|--------------------------|------|--------------|
| 1 | SpacetimeDB server | `spacetime start --non-interactive --listen-addr 127.0.0.1:3000` | 3000 | `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/v1/ping` → `200` |
| 2 | Publish module (one-shot, not background) | `pnpm spacetime:publish` | — | output contains `Updated database with name: uwr` |
| 3 | LLM proxy | `cd llm-proxy && WRANGLER_SEND_METRICS=false pnpm exec wrangler dev --port 8787 --ip 127.0.0.1` | 8787 | `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8787/` → `200` |
| 4 | Vite client | `pnpm dev` | 5173 | `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/` → `200` |

## Before starting

1. Check nothing is already listening: `netstat -ano | grep -E ":(3000|8787|5173) .*LISTENING"`.
   If a port is taken, report which PID holds it and ask before killing anything.
2. Dependencies installed? If `node_modules` is missing in the root, `spacetimedb/`, or
   `llm-proxy/`, run `pnpm install` / `pnpm --dir spacetimedb install` / `pnpm --dir llm-proxy install`.
   Each directory is a standalone pnpm project (no workspace); do not add a root `pnpm-workspace.yaml`.

## Notes

- Poll each health check for up to ~90 s before declaring failure; show the last lines of
  the process output if it fails.
- Step 2 is only needed after backend changes, but it is a harmless no-op otherwise.
  If the backend schema changed and publish reports it needs `--break-clients` (view/schema
  changes that disconnect clients but keep data), that flag is fine locally. Needing
  `--clear-database` is a stop-and-ask.
- After backend schema/reducer changes also run `pnpm spacetime:generate` (never hand-edit
  `src/module_bindings/`).
- The llm-proxy needs `llm-proxy/.dev.vars` (OPENAI_API_KEY, PROXY_SECRET). Never print its
  values. The browser needs `localStorage.llm_proxy_secret` set to the same PROXY_SECRET for
  LLM features. `bash llm-proxy/scripts/smoke.sh` checks health/401/400 (add `--real` for a
  real OpenAI call, which costs a little and needs account credits).
- Login uses SpacetimeAuth OIDC; the redirect URI comes from `.env.local`
  (`VITE_SPACETIMEAUTH_REDIRECT_URI`). Give the user the exact URL Vite prints.

## Report to the user

When all four are up, give: the Vite URL, the three ports, and how to stop.

## Stopping

Stop the background tasks you started (TaskStop on each), then confirm the ports are free.
If processes linger (wrangler leaves `workerd.exe` and node children; spacetime leaves
`spacetimedb-standalone.exe`), find the PIDs with
`netstat -ano | grep -E ":(3000|8787|5173) .*LISTENING"` and stop only those PIDs
(`taskkill //PID <pid> //T //F`). Never kill processes you didn't start without asking.
