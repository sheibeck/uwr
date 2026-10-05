# Phase 41 Maincloud Proof Checklist

**Claude never runs any of these maincloud commands.** Every command below is run by you, in your own terminal, from the repo root. Claude only reads what you paste back (as data) and re-checks the Phase 39 gate against it.

Never paste the Anthropic key, the CLI token or the `llm_config` table anywhere. None of the steps below asks for them. If you ever paste something key-shaped by mistake, rotate that key (runbook: `docs/runbooks/llm-key.md`, "Rotation").

## Step 0: Run the local live proof first (currently deferred)

The local live proof (Plan 41-16) was deferred on 2026-09-30 and has not been run. Do it before maincloud, so a prompt, schema or harness slip costs local pennies and not a production attempt. The commands are in `41-LOCAL-PROOF.md` ("How to resume later"):

- `spacetime call uwr llm_smoke_test --server local`, wait about a minute, then `spacetime sql --server local uwr "SELECT * FROM llm_admin_state"`; expect six `ok`.
- `pnpm exec vitest run --config scripts/llm/vitest.live.config.ts` (with `PROVE_LIVE_DRY` unset).

Good: six ok smoke entries locally, every domain step completed, ledger under $2.00.

## Step 1: Preconditions

1. `spacetime server list`: the default (marked `***`) is the server you intend; maincloud is the target of `spacetime:publishprod`.
2. The dedicated Anthropic Console workspace has a monthly spend limit set (the module also caps at $1.00 and 200 calls per player per UTC day, 3 active jobs per player and a $2.00 phase ledger).
3. The key is in `spacetimedb/.env.local` as `ANTHROPIC_API_KEY=...` (your eyes only).
4. `git status` is clean for source files and HEAD is the Phase 41 commit you want to ship.

Good: all four true.

## Step 2: Publish (you)

Run `pnpm spacetime:publishprod` (this is `spacetime publish uwr --server maincloud`).

Expected schema changes on maincloud, none of which clear data:

- The first publish after the 2.10 upgrade re-creates the 14 views.
- The current schema adds the `npc.gender` column (default `''`; existing NPC rows resolve through `npcGender`).
- All Phase 40 and Phase 41 tables (`llm_job`, `llm_call_log`, `llm_config`, `llm_admin_state`, `llm_spend` and so on) are new there.

If the CLI stops at "The above changes will BREAK existing clients. Do you want to proceed?", that is the expected `--break-clients` prompt. Re-run with `--break-clients` yourself, for example `pnpm spacetime:publishprod --break-clients` (or `spacetime publish uwr --server maincloud --break-clients`). It disconnects clients and loses no data.

Do NOT use `--clear-database` on maincloud. It would wipe the private `llm_config` key and the spend ledger.

Good: the CLI prints `Updated database with name: uwr, identity: ...` and `spacetime logs uwr --server maincloud` shows no panic.

## Step 3: Set the key (you)

1. `node scripts/llm/set-key.mjs --dry-run`. Good: `ANTHROPIC_API_KEY: present (format ok, len <n>)`.
2. `node scripts/llm/set-key.mjs --target maincloud --confirm-maincloud`. Both flags are required. Good: `set_api_key: HTTP 200` and `key stored: yes (len <n>)`.

If it prints `unconfirmed`, 401 or 403, see the runbook's fallback note and tell Claude what it printed (never the key).

## Step 4: Smoke test (you)

1. `spacetime call --server maincloud uwr llm_smoke_test`
2. Wait about a minute, then run `spacetime sql --server maincloud uwr "SELECT * FROM llm_admin_state"` and keep the output for the paste-back (it holds no key).

Good: `keyValid` true and `lastSmokeJson` has six `ok` entries: `smoke_test`, `creation_race`, `creation_class`, `world_gen`, `skill_gen`, `renown_perk_gen`. `world_gen` ok means the region schema compiled on maincloud.

## Step 5: Browser run with the network tab open (you)

Open the production client with the browser DevTools network tab recording (keep "Preserve log" on). Then:

1. Create a character (race, class, name, confirm). Note how long the race, class and first region results take to appear.
2. While the first region is generating, close the tab, wait about 30 seconds, reopen it. Good: the region is there, exactly once (no duplicate region).
3. Explore to another place.
4. Talk to an NPC. Check that the NPC is described and speaks of others as he or she, and that any line about the Keeper calls the Keeper he.
5. Win or lose one fight and look for the closing narration.
6. Level up once (or note that no level was pending), and trigger a renown rank-up if convenient.
7. In the network tab, filter for `anthropic` and for any proxy host (`workers.dev`, `localhost:8787`, and so on). Good: no request goes to the Anthropic API host or to any proxy host; the browser talks only to the SpacetimeDB host.

## Step 6: Responsiveness (you)

While a world-gen or class call is running, issue a few commands and move around. Note whether combat ticks and commands felt normal (no noticeable stalls). This is the qualitative ping and tick check from CONTEXT.

## Step 7: Paste back

Paste these outputs plus your network-tab and responsiveness notes:

1. `spacetime sql --server maincloud uwr "SELECT * FROM llm_admin_state"`
2. `spacetime sql --server maincloud uwr "SELECT * FROM llm_call_log"`
3. `spacetime sql --server maincloud uwr "SELECT * FROM llm_spend"`
4. Your notes: per-domain result timings, the network-tab observation, the responsiveness observation, the pronoun observation.

Do not paste `llm_config`, the key, the token or `spacetimedb/.env.local`.

## Step 8: What Claude will check

Claude re-checks the Phase 39 gate against your results:

| Check | Threshold |
|---|---|
| Dispatch delay p95 (from `dispatchLateMs` in `llm_call_log`) | under 250 ms (Phase 39 maincloud figure: 3.0 ms) |
| Reliability | zero failed calls, except any you caused deliberately (Phase 39: 0 of 164) |
| Region schema | `world_gen` ok in the smoke results |
| Ledger | total under $2.00 (2,000,000 micro-USD) |
| Responsiveness | your note that combat and commands stayed normal while a call ran (at most 2x baseline; Phase 39: ping p95 34.3 ms, tick p95 2.72 ms, 0.96x to 1.03x of baseline) |
| Browser | no request to Anthropic or a proxy |

A failed gate is recorded as reopening the executor decision (the Phase 39 go).

## Step 9: How to defer

Reply "defer". The phase then records the maincloud proof as human_needed and verification reports it as outstanding, not passed. (As of 2026-09-30 the user chose to write this checklist and defer the run.)
