# Phase 42 User Checklist: retire the proxy, clean env vars, migrate maincloud

**Claude never runs any of these commands.** They are yours, run from your own terminal. Everything here touches real accounts (Cloudflare, OpenAI, your hosting provider, maincloud), which Claude is not allowed to reach.

Never paste a key, token, secret or env value anywhere (chat, commits, issues). This document names files and variables only, never values. If you ever paste something key-shaped by mistake, rotate it (for the Anthropic key: `docs/runbooks/llm-key.md`, "Rotation").

Nothing here is urgent for local play. Sections A to C are cleanup. Section E is the only step that changes production data, so read it fully before you start.

## A. Retire the proxy (Cloudflare and OpenAI)

The game no longer calls the proxy. The Worker still exists and still holds an OpenAI key.

1. Open the Cloudflare dashboard, Workers and Pages, and find the deployed Worker. Its name in the old `llm-proxy/wrangler.toml` was `uwr-llm-proxy`. That is recorded from research only (assumption A1), so confirm the name in the dashboard first.
2. Delete it, either from the dashboard or from inside the leftover `llm-proxy/` folder (its `node_modules` still holds wrangler):
   `pnpm exec wrangler delete uwr-llm-proxy`
3. Revoke the OpenAI key the Worker held (OpenAI platform, API keys, revoke). Do this even after the Worker is deleted.
4. Treat the old proxy secret as burned. Vite inlined `VITE_LLM_PROXY_SECRET` into every client build that was ever deployed, so anyone who downloaded an old bundle could read it. Deleting the Worker and revoking the OpenAI key is what makes that harmless.

Good: the Worker is gone from the dashboard and the OpenAI key shows as revoked.

## B. Environment variables

The code no longer reads either variable.

1. In the root `.env.local`, delete the `VITE_LLM_PROXY_URL` and `VITE_LLM_PROXY_SECRET` lines.
2. In your hosting provider's settings, delete the same two variables if they were ever set there. For GitHub Pages: repository Settings, Secrets and variables, Actions (check both the Secrets and the Variables tabs).

Good: a search of `.env.local` and the hosting settings finds no `VITE_LLM_PROXY` name.

## C. Local leftovers

After section A, delete the whole local `llm-proxy/` folder. Only ignored files remain in it (`.dev.vars`, `node_modules/`, `.wrangler/`, `dist/`), so nothing is lost from git.

Then remove the line `/llm-proxy/` from `.git/info/exclude` (Plan 42-04 added it locally to hide those ignored leftovers; with the folder gone it is dead weight).

Good: `ls llm-proxy` reports no such folder, and `git status` is unchanged.

## D. Rebuild and check the bundle

1. `pnpm build`
2. `node scripts/check-bundle.mjs` must print `bundle clean`. If it reports a hit, run `node scripts/check-bundle.mjs --explain` (it prints rule ids and offsets, never bundle text) and tell Claude what it says.
3. Deploy the client only when you choose to. A push to master deploys production, and Claude never pushes.

Returning browsers: a tab that still has `localStorage.llm_proxy_secret` set loses it on the next load (the client calls one `localStorage.removeItem` for it). Nothing else is needed.

## E. Maincloud: the two-publish sequence (you only)

Why two publishes: the legacy tables (`llm_task`, `llm_request`, `llm_budget`, `llm_cleanup_tick`) cannot be dropped while old clients or old reducers still use them, and SpacetimeDB refuses to drop a table that still holds rows. So: publish 1 removes every reader and writer, the client is redeployed, the purge empties the tables, and publish 2 drops them. The local server was rehearsed in exactly this order (Plans 42-05 and 42-07).

**Never pass `--clear-database`, `-y` / `--yes`, `--delete-data` or `-c` on maincloud.** A clear wipes the private `llm_config` Anthropic key and the spend ledger. If any publish refuses or asks about data deletion, stop and tell Claude the exact message; do not retry with other flags.

Publish-1 commit (the module as it was after the reducers were removed and before the tables were dropped):

`5968d54f58fd5792772d52fd5a30369a8055c646`

### E1. Preconditions

1. `spacetime --version` still reports 2.10.1 (research verified table removal on that version). If it changed, ask Claude to re-run the scratch probe first.
2. `spacetime server list`: you know which server is the default (`***`). Every command below names `--server maincloud` explicitly.
3. Know where `41-MAINCLOUD-CHECKLIST.md` stands. Publish 1 below also carries all of Phase 41 (new `llm_job` tables, `npc.gender`, the executor), so it replaces that checklist's publish step if you have not run it yet. The key step (`node scripts/llm/set-key.mjs --target maincloud --confirm-maincloud`) and the smoke test from that checklist still apply after publish 1 if the key is not yet stored on maincloud.

### E2. Publish 1 from the recorded commit

```
git worktree add ../uwr-p42-publish1 5968d54f58fd5792772d52fd5a30369a8055c646
pnpm --dir ../uwr-p42-publish1/spacetimedb install
cd ../uwr-p42-publish1
spacetime publish uwr --server maincloud --break-clients
```

Expect `Updated database with name: uwr` and a migration plan that removes no table. The first publish after the 2.10 upgrade re-creates the views and disconnects clients; that is what `--break-clients` allows, and it loses no data. Return to the main checkout afterwards.

### E3. Deploy the new client, then reload open tabs

1. Deploy the new client build (your normal deploy).
2. In game, run `/setappversion` so open tabs are prompted to reload (README "Post-Deploy In-Game Steps"). An old tab subscribed to the task table breaks when that table is dropped, so do this before E5.

### E4. Purge and confirm COUNT 0

```
spacetime call --server maincloud uwr purge_legacy_llm
spacetime sql --server maincloud uwr "SELECT COUNT(*) AS n FROM llm_task"
spacetime sql --server maincloud uwr "SELECT COUNT(*) AS n FROM llm_request"
spacetime sql --server maincloud uwr "SELECT COUNT(*) AS n FROM llm_budget"
spacetime sql --server maincloud uwr "SELECT COUNT(*) AS n FROM llm_cleanup_tick"
```

All four must print 0. The purge logs a counts-only line (`legacy llm purge: llm_task=... llm_request=... llm_budget=... llm_cleanup_tick=...`) in `spacetime logs --server maincloud uwr`. If `llm_task` is very large and the call fails (research assumption A2), stop and ask Claude for a batched purge.

### E5. Publish 2 from the main checkout

From the main checkout at HEAD (the commit that has the tables removed):

```
spacetime publish uwr --server maincloud --break-clients
```

Expect four `Removed table` lines (`llm_budget`, `llm_cleanup_tick`, `llm_request`, `llm_task`) and `Updated database with name: uwr`. If it refuses because a table still holds data, repeat E4 and try again. Never clear.

### E6. Verify

1. `spacetime describe --json --server maincloud uwr` lists none of `llm_task`, `llm_request`, `llm_budget`, `llm_cleanup_tick`, and still lists `llm_job`. (Count occurrences; do not paste the output anywhere that could hold secrets. It contains schema only.)
2. `spacetime sql --server maincloud uwr "SELECT key_set, key_length FROM admin_llm_status"` shows `key_set` true with your key's length.
3. `spacetime logs --server maincloud uwr` shows no panic after the update.
4. Run `pnpm spacetime:generate` from the main checkout: `git status --porcelain src/module_bindings` should print nothing.

### E7. Clean up the worktree

`git worktree remove ../uwr-p42-publish1`

## F. What Claude already did locally (for your reference)

No command below touched maincloud, Cloudflare or OpenAI, and nothing was pushed.

- **Publish 1 (local, Plan 42-05):** `spacetime publish uwr --server local --break-clients < /dev/null` from commit `5968d54f58fd5792772d52fd5a30369a8055c646`. Outcome: `Updated database with name: uwr`, empty migration plan, stale reducers answer "No such reducer". A no-flag re-run was a no-op.
- **Purge (local):** `spacetime call --server local uwr purge_legacy_llm` left `llm_task`, `llm_request`, `llm_budget` and `llm_cleanup_tick` at COUNT 0.
- **Publish 2 (local, Plan 42-07):** `spacetime publish uwr --server local --break-clients < /dev/null` with no other flag. Outcome: four `Removed table` lines (`llm_budget`, `llm_cleanup_tick`, `llm_request`, `llm_task`) and `Updated database with name: uwr`. A no-flag re-run was a no-op.
- **After publish 2 (local):** `spacetime describe` lists none of the four legacy tables and still lists `llm_job`; `admin_llm_status` shows `key_set` true, `key_length` 108 (the key survived, no clear was used); bindings regenerated with a second regeneration producing no diff; full suite, module build, client build and `node scripts/check-bundle.mjs` (`bundle clean`) all green.
- The local SpacetimeDB server was stopped again at the end. Restart it with the run-local skill when you want to play.

## Still deferred from earlier phases (not part of Phase 42)

The local live proof and the maincloud proof from Phase 41 (`41-LOCAL-PROOF.md`, `41-MAINCLOUD-CHECKLIST.md`) remain yours to run when you choose; Phase 44 picks them up.
