# Anthropic key runbook (SEC-04)

How to set, check, rotate and recover the Anthropic API key that the SpacetimeDB module uses for every LLM call. The key is held server-side only and is never logged.

## Where the key lives

- The private `llm_config` table in the module (row 1). Nothing else in the module holds the key.
- Your own `spacetimedb/.env.local` (git-ignored) as `ANTHROPIC_API_KEY=...`. The key script reads it from there inside its own process.
- Never in the browser, the client bundle, logs, chat, screenshots or a commit.
- `llm_admin_state` holds status only: whether a key is set, whether it is valid, its length and timestamps. It never holds the key.

## Prerequisites

- The CLI login identity (`spacetime login`) is an admin (it is listed in `ADMIN_IDENTITIES`); `set_api_key`, `llm_smoke_test` and `admin_llm_status` are admin only.
- The local server is running and the module is published (see the `run-local` skill: `spacetime start --non-interactive --listen-addr 127.0.0.1:3000`, then `pnpm spacetime:publish`).
- A dedicated Anthropic Console workspace for this project, with its own API key.

## Anthropic Console spend limit

Set a monthly spend limit on the dedicated Console workspace before you put a key into the module. This is the interim global cost guard until the Phase 43 ceiling and kill switch exist.

The module adds its own guards on top:

- $1.00 and 200 calls per player per UTC day.
- At most 3 active jobs per player.
- A hard $2.00 phase ledger (`llm_spend`) that every job reserves against before it is sent. When it is exhausted, calls stop with the "Keeper has fallen silent" line.

## First-time setup

1. Put `ANTHROPIC_API_KEY=<your key>` in `spacetimedb/.env.local` yourself (edit the file in your editor; do not paste the key into a terminal command or chat).
2. Check the file without revealing the key: `node scripts/llm/set-key.mjs --dry-run`. It prints only `ANTHROPIC_API_KEY: present (format ok, len <n>)`, or `missing` / `format unexpected` with exit code 2.
3. Store the key on the local server: `node scripts/llm/set-key.mjs`. The script reads the key inside its own process, gets your CLI token in-process, posts to `http://127.0.0.1:3000/v1/database/uwr/call/set_api_key` (the key only in the request body), and prints the HTTP status. It exits 0 only when the module log shows `llm key set, len=<n>` for your key's length, and prints `key stored: yes (len <n>)`.
4. Check the status. The table never holds the key: `spacetime sql uwr --server local "SELECT * FROM llm_admin_state"`. As an admin you can also subscribe to the `admin_llm_status` view.
5. Run the smoke test: `spacetime call uwr llm_smoke_test --server local`.
6. Wait about a minute, then read `lastSmokeJson` (from `llm_admin_state` or `admin_llm_status`). All six routes `ok` means the key is valid and every JSON schema is warm.

Exit codes of `set-key.mjs`: 0 stored and confirmed, 1 store failed or unconfirmed, 2 key missing or unexpected format.

If the confirmation never appears, or the HTTP call is rejected (401 or 403), the CLI token most likely does not authenticate as the admin identity. There is no manual fallback that handles the key: `spacetime call` takes reducer arguments on its command line, which would put the key in the process list and in your shell history (PowerShell saves it to disk). Diagnose the identity instead; none of these steps touches the key:

1. Run `spacetime login show` (never with `--token`) and note the identity it reports.
2. Compare it with `ADMIN_IDENTITIES` in `spacetimedb/src/data/admin.ts`. If it is not listed, you are logged in as a different identity: log in again with the admin account (`spacetime logout`, then `spacetime login`).
3. Re-run `node scripts/llm/set-key.mjs --dry-run`, then `node scripts/llm/set-key.mjs`.
4. If it still fails, check `spacetime logs uwr --server local` for the reducer error (the key is never logged) and stop there; do not try another way of passing the key.

## Rotation

1. Edit `spacetimedb/.env.local` with the new key.
2. Run `node scripts/llm/set-key.mjs --dry-run`, then `node scripts/llm/set-key.mjs`.
3. Run `spacetime call uwr llm_smoke_test --server local` and wait for six `ok` results.
4. Revoke the old key in the Anthropic Console.

In-flight calls finish on the old key (the executor reads the key when it claims a job). Their results never change the key status: a check is recorded only for the key that is current when the reply arrives, so revoking the old key right away cannot mark the new key invalid. After a rotation `keyValid` reads false ("unverified") until the smoke test passes.

## Recovery after --clear-database

A local `--clear-database` wipes `llm_config`, `llm_admin_state` and the `llm_spend` ledger. The key is gone and the $2 phase ledger restarts at zero.

1. BEFORE clearing, write down the phase totals from `admin_llm_status` (`phaseSpentMicroUsd` and `phaseReservedMicroUsd`). The $2.00 phase budget is then tracked by hand across the clear.
2. After the clear and republish, re-run `node scripts/llm/set-key.mjs --dry-run` and `node scripts/llm/set-key.mjs`.
3. Re-run the smoke test and confirm six `ok` results.
4. Never clear the maincloud database.

## Smoke test and status

`llm_smoke_test` enqueues six calls, one per route: `smoke_test` (a short text call), then one minimal call per JSON schema: `creation_race`, `creation_class`, `world_gen`, `skill_gen` and `renown_perk_gen`.

- Cost is roughly $0.05 to $0.08 per run, charged to the phase ledger only (no player budget).
- Run one at a time. A second run is refused while any smoke job is still active, and a run that would exceed the phase cap creates nothing.
- `lastSmokeJson` has one entry per route with: `ok`, `class` (the failure class when not ok), `latencyMs`, token counts (`input`, `output`, `cacheWrite`, `cacheRead`), `costMicroUsd` and `atMicros`. The `smoke_test` entry also carries a short `reply`.
- The `smoke_test` route succeeding is what marks the key valid (`keyValid` true, `keyVerifiedAt` set).

## Never do this

- Never put the key in a command argument, in `spacetime call` arguments, in chat, in a commit, in a screenshot, or in shared `spacetime logs` output. `set-key.mjs` is the only supported way to store it.
- If a key ever did end up on a command line, treat it as leaked: rotate it (see Rotation) and clear your shell history, including the PowerShell history file at `(Get-PSReadLineOption).HistorySavePath` and the current session's history (`Clear-History`).
- Never let an agent run the key script against maincloud (the `--target maincloud --confirm-maincloud` form is yours alone).
- Never `SELECT *` from `llm_config`; it holds the key.
- Never print the output of `spacetime login show --token`.

## Symptoms

| Symptom | Meaning | What to do |
|---|---|---|
| Smoke result class `auth` | The key is invalid or revoked | Create a new key in the Console, then follow Rotation |
| Smoke or job class `billing` | The Anthropic Console spend limit is reached | Raise the Console limit or wait for the next period (do not clear the database) |
| Class `overloaded` or `rate_limit` | Anthropic is busy or throttling | Wait and retry; jobs retry on their own |
| Player sees "The Keeper is resting. Return later." | The admin kill switch is off, or today's global spend ceiling (default $10, UTC day) is reached | Check `llmEnabled`, `daySpentMicroUsd` and `dailyCeilingMicroUsd` in `admin_llm_status`, or run `/llm stats` as admin. `/llm on` re-enables; `/llm ceiling <dollars>` changes the ceiling; the ceiling resets at UTC midnight |
| Player sees "The Keeper grows weary of your demands. Return tomorrow." | That player hit the $1.00 or 200 call daily limit (UTC day) | Nothing to do; resets at UTC midnight |
| `set-key.mjs` prints `key stored: unconfirmed` | The call was accepted but no `llm key set, len=<n>` line was found in the last 200 log lines | Check `spacetime logs uwr --server local` for errors and that the identity is an admin |
| `set-key.mjs` prints `spacetime login token: not found` | Not logged in | Run `spacetime login` |

## Maincloud (user only)

Claude never publishes to maincloud, calls maincloud or runs the key script against it. When you are ready:

1. Publish with `pnpm spacetime:publishprod`. The first publish after the 2.10 upgrade may need `--break-clients`; add it yourself only if the CLI asks for it.
2. Set the key: `node scripts/llm/set-key.mjs --target maincloud --confirm-maincloud`. Both flags are required; with only `--target maincloud` the script refuses.
3. Run the smoke test against maincloud: `spacetime call uwr llm_smoke_test --server maincloud`, wait about a minute, and read `lastSmokeJson` with `spacetime sql uwr --server maincloud "SELECT * FROM llm_admin_state"`.
4. Confirm the Console workspace spend limit is in place before opening the game to players.
