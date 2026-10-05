# Phase 44 Maincloud Proof Checklist

**Claude never runs any of these commands.** Every command below is run by you, in your own terminal, from the repo root. Claude only reads what you paste back, as data, and re-checks the Phase 39 gate against it.

Never paste the Anthropic key, the CLI token or the `llm_config` table anywhere. None of the steps below asks for them. If you ever paste something key-shaped by mistake, rotate that key (runbook: `docs/runbooks/llm-key.md`, "Rotation").

You decided that maincloud actions wait until the end of the milestone. Nothing here is urgent, and nothing here blocks local play. This checklist carries forward the Phase 41 checklist (`41-MAINCLOUD-CHECKLIST.md`), updated for Phases 42, 43 and 44.

## Step 0: Where the local proof stands

The local proof was handled in Phase 44. Read `44-LIVE-RESULTS.md` first. In short: the failure drills passed on the scratch database `uwr-verify`, and the golden run was recorded (27 calls). The paid end-to-end run was deferred, so the per-domain live proof and the per-route latency table are still open; the tone sign-off is `needs_fixes` (see `44-TONE-FIXES.md`). Running this checklist before the local end-to-end run is allowed, but a prompt or schema slip would then cost a hosted attempt instead of local pennies, so consider doing the local run first.

## Step 1: Preconditions

1. `spacetime server list`: the default (marked `***`) is the server you intend. Every command below names `--server maincloud` explicitly anyway.
2. The dedicated Anthropic Console workspace has a monthly spend limit set. The module also enforces a daily ceiling (default $10.00, changeable with `/llm ceiling`), 200 calls per player per UTC day and 3 active jobs per player.
3. The key is in `spacetimedb/.env.local` as `ANTHROPIC_API_KEY=...` (your eyes only).
4. `git status` is clean for source files and HEAD is the commit you want to ship.

Good: all four true.

## Step 2: Publish (you)

Follow the Phase 42 two-publish sequence: section E of `.planning/phases/42-client-cutover-and-legacy-removal/42-USER-CHECKLIST.md` (publish 1 from the recorded commit, client deploy, purge to COUNT 0, publish 2 from the main checkout at HEAD). Do not repeat the sequence here; do it there.

Phase 43's schema additions are additive and defaulted: four defaulted columns (two on `llm_admin_state`, two on `llm_spend`) and a changed `admin_llm_status` view. No table is removed by them, and they need no clear. Publish 2 from the main checkout at HEAD already carries them. Use `--break-clients` only if the CLI asks for it, and only after you have read that the planned changes are the ones described above.

**Never pass `--clear-database`, `-y` / `--yes`, `--delete-data` or `-c` on maincloud.** A clear wipes the private `llm_config` key and the spend ledger.

Good: the CLI prints `Updated database with name: uwr, identity: ...` and `spacetime logs --server maincloud uwr` shows no panic.

## Step 3: Set the key (you)

1. `node scripts/llm/set-key.mjs --dry-run`. Good: `ANTHROPIC_API_KEY: present (format ok, len <n>)`.
2. `node scripts/llm/set-key.mjs --target maincloud --confirm-maincloud`. Both flags are required; the script refuses without them. Good: `set_api_key: HTTP 200` and `key stored: yes (len <n>)`.

If it prints `unconfirmed`, 401 or 403, see the runbook's fallback note and tell Claude what it printed (never the key).

## Step 4: Smoke test of all eight routes (you)

1. `spacetime call --server maincloud uwr llm_smoke_test`
2. Wait about a minute, then run `spacetime sql --server maincloud uwr "SELECT * FROM llm_admin_state"` and keep the output for the paste-back (it holds no key).

Good: `keyValid` true and `lastSmokeJson` has **eight** `ok` entries, one per route in `LLM_SMOKE_ROUTES` (`spacetimedb/src/data/llm_limits.ts`):

1. `smoke_test`
2. `creation_race`
3. `creation_class_reveal`
4. `creation_class`
5. `world_gen_start`
6. `world_gen`
7. `skill_gen`
8. `renown_perk_gen`

The old Phase 41 checklist said "six" ok entries. That is out of date: Phase 43 split the staged routes, so the smoke test now covers eight. `world_gen` ok means the region schema compiled on maincloud.

## Step 5: One call per domain, in the browser with the network tab open (you)

Open the production client with the browser DevTools network tab recording (keep "Preserve log" on). Then, once each:

1. **Race:** create a character and pick a race.
2. **Class:** the class reveal appears, then the class fills in. Pick an ability, then name and confirm the character.
3. **World:** the first region starts (start location and first NPC), then the rest fills in.
4. **Explore:** travel to a second region and wait for it.
5. **NPC chat:** one conversation turn with an NPC. Check that the NPC is described as he or she, and that any line about the Keeper calls the Keeper he.
6. **Combat outro:** win or lose one fight and look for the closing narration.
7. **Renown:** trigger one renown rank-up if convenient (note it if none was available).
8. **Skill offer:** level up once and look at the offered skills (note it if no level was pending).
9. **Admin stats:** as an admin, run `/llm stats` and note that it prints one plain table.
10. In the network tab, filter for `anthropic` and for any proxy host (`workers.dev`, `localhost:8787`, and so on). Good: no request goes to the Anthropic API host or to any proxy host; the browser talks only to the SpacetimeDB host.

While a world or class call is running, also issue a few commands and move around, and note whether combat ticks and commands felt normal.

## Step 6: Paste back

Paste these outputs plus your notes:

1. `spacetime sql --server maincloud uwr "SELECT * FROM llm_admin_state"`
2. `spacetime sql --server maincloud uwr "SELECT * FROM llm_call_log"`
3. `spacetime sql --server maincloud uwr "SELECT * FROM llm_spend"`
4. Your notes: per-domain result timings, the network-tab observation, the responsiveness observation, the pronoun observation.

Do not paste `llm_config`, the key, the token or `spacetimedb/.env.local`.

## Step 7: What Claude will check

Claude re-checks the Phase 39 gate against your results:

| Check | Threshold |
|---|---|
| Dispatch delay p95 (from `dispatchLateMs` in `llm_call_log`) | under 250 ms (Phase 39 maincloud figure: 3.0 ms) |
| Reliability | zero failed calls, except any you caused deliberately (Phase 39: 0 of 164) |
| Region schema | `world_gen` ok in the smoke results |
| Ledger and ceiling | spend under the daily ceiling you set (default $10.00, 10,000,000 micro-USD); the ceiling still reads the value you left |
| Responsiveness | your note that combat and commands stayed normal while a call ran (at most 2x baseline; Phase 39: ping p95 34.3 ms, tick p95 2.72 ms, 0.96x to 1.03x of baseline) |
| Browser | no request to Anthropic or a proxy |

A failed gate is recorded as reopening the executor decision (the Phase 39 go).

## Step 8: How to defer

Reply "defer". The phase then records the maincloud proof as `human_needed` and verification reports it as outstanding, not passed. (As of 2026-09-30 you chose to write this checklist and defer the run; maincloud actions wait until the end of the milestone.)
