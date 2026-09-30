---
name: run-local
description: Launch (or stop) the full UWR stack locally for manual testing — SpacetimeDB server, module publish, and the Vite client. Use when the user asks to run, start, launch, or stop the game/servers locally.
---

# Run UWR locally

Two long-lived processes (the SpacetimeDB server and Vite) plus a one-shot publish, started in
this order. Start each long-lived process with the Bash tool's `run_in_background: true` so it
keeps running across turns, then health-check it before starting the next. Never publish to
maincloud, never run `pnpm spacetime:publishprod`, never pass `--clear-database` unless the
user asks.

| # | Process | Command (from repo root) | Port | Health check |
|---|---------|--------------------------|------|--------------|
| 1 | SpacetimeDB server | `spacetime start --non-interactive --listen-addr 127.0.0.1:3000` | 3000 | `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/v1/ping` → `200` |
| 2 | Publish module (one-shot, not background) | `pnpm spacetime:publish` | — | output contains `Updated database with name: uwr` |
| 3 | Vite client | `pnpm dev` | 5173 | `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/` → `200` |

## Before starting

1. Check nothing is already listening: `netstat -ano | grep -E ":(3000|5173) .*LISTENING"`.
   If a port is taken, report which PID holds it and ask before killing anything.
2. Dependencies installed? If `node_modules` is missing in the root or `spacetimedb/`, run
   `pnpm install` / `pnpm --dir spacetimedb install`.
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
- LLM features run server-side through the scheduled executor. Store the Anthropic key once
  with `node scripts/llm/set-key.mjs` (runbook: `docs/runbooks/llm-key.md`); never print it.
- Login uses SpacetimeAuth OIDC; the redirect URI comes from `.env.local`
  (`VITE_SPACETIMEAUTH_REDIRECT_URI`). Give the user the exact URL Vite prints.

## Report to the user

When all three are up, give: the Vite URL, the two ports, and how to stop.

## Stopping

On Windows, TaskStop on the background shells does NOT stop the child processes. Expect
both of these to survive and always clean them up:
`spacetimedb-standalone.exe` and the `node.exe` running `vite.js` from this repo.

1. TaskStop each background task you started.
2. List the survivors with their command lines (PowerShell):
   `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'spacetimedb-standalone.exe' -or ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'uwr.*vite') }`
3. `Stop-Process -Id <pid> -Force` only for processes that belong to this repo's launch.
4. Confirm `netstat -ano | grep -E ":(3000|5173) .*LISTENING"` prints nothing.

Never kill processes you didn't start without asking.
