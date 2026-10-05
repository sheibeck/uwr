# Phase 43 User Checklist: live checks, admin controls, maincloud publish

**Claude never runs the steps in sections 1, 2 and 4.** They need your eyes, an admin session in the running game, or your maincloud account. This extends the Phase 42 checklist (`.planning/phases/42-client-cutover-and-legacy-removal/42-USER-CHECKLIST.md`); it does not replace it. Where the two overlap (the maincloud publish), do the Phase 42 sequence first.

Never paste a key, token, secret or env value anywhere (chat, commits, issues). This document names files, variables and commands only, never values.

## 0. Where things stand (for your reference)

- Phase 43 is published to the **local** server only, with no clear. Your stored Anthropic key survived (`key_set` true, `key_length` 108 before and after).
- The local SpacetimeDB server was left **running** (started by Claude in the background, listener on `127.0.0.1:3000`). The Vite client is not running. Start it with `pnpm dev` (run-local skill), or stop the server with the run-local skill's "Stopping" section when you are done.
- Local defaults after the publish: `llm_enabled` true, daily ceiling `10000000` micro-USD ($10.00).
- Known unrelated bug found during this plan (not fixed, logged in `deferred-items.md`): the `time` command in `spacetimedb/src/reducers/intent.ts` calls `getWorldState` without importing it, so typing `time` panics that reducer. Everything else below is unaffected.

## 1. Live play check on the local stack

Start the stack with the run-local skill if it is not already up (server is already running; you need `pnpm dev` and the Vite URL it prints).

- [ ] **Staged region entry.** Trigger a new region (travel to an uncharted edge, or finish creating a new character). Good: you can enter the region and meet the first NPC **before** the rest of the region fills in (stage 1 is playable while stage 2 generates).
- [ ] **Rotating Keeper lines.** While the Keeper indicator is working, watch it. Good: the line changes about every 5 seconds instead of sitting on one message.
- [ ] **Staged class reveal.** Create a character. Good: the class name and first ability appear early, and choosing an ability waits for the full class to finish (it does not let you pick from a half-built class).
- [ ] Anything that feels slow or stuck: note the time and what you were doing, then tell Claude. Phase 44 picks up live evidence.

## 2. Admin controls in a live session

You must be signed in as an admin identity (the `ADMIN_IDENTITIES` set; the CLI identity is also an admin). Each command answers with one plain system message.

- [ ] `/llm stats`: expect **one plain table** (spend today, ceiling, calls, per-route lines).
- [ ] `/llm off`: expect `LLM calls are off.` Then try any LLM action (for example talk to an NPC or start world generation). Good: **one** `The Keeper is resting. Return later.` line and no call to Anthropic (check `/llm stats` shows no new call).
- [ ] `/llm on`: expect `LLM calls are on.` Repeat the action; it works again.
- [ ] `/llm ceiling 10.00`: expect `Daily LLM ceiling set to $10.00.` (Allowed range is $0.01 to $1000.00; anything else is refused with a range message.)
- [ ] Leave the game with calls **on** and the ceiling at **$10.00**.

For scripts, the same controls are reducers (run from your terminal; `--server local` unless you mean otherwise):

```
spacetime call --server local uwr llm_set_enabled false
spacetime call --server local uwr llm_set_enabled true
spacetime call --server local uwr llm_set_daily_ceiling 10000000
spacetime sql --server local uwr "SELECT llm_enabled, daily_ceiling_micro_usd FROM admin_llm_status"
```

`llm_set_daily_ceiling` takes micro-USD ($1 = 1000000). Claude already ran this round trip locally at zero cost (see `43-15-SUMMARY.md`); sections 2 repeats it through the real UI.

## 3. Measurement outcome (already decided, nothing to run)

- **Effort sweep and caching (Plans 43-12 and 43-14): applied.** You approved the paid run. 108 real calls cost $0.9221 of the $5.00 cap. Low effort won or tied on all 9 routes, `max_tokens` was cut to 256-2560 per route, and prompt caching works on all 9 routes. The tuned values are live in `llm_tuning.ts`.
- **LAT-06 (parallel class generation): leave out.** Class reveal measured p50 4665 ms and p95 7113 ms against a 10000 ms threshold, so parallel archetype generation was not built.
- **Still live evidence, not synthetic:** LAT-01 and LAT-02 are measured on a harness, not in play. The section 1 checks above are the live evidence; anything unexpected moves to Phase 44.

## 4. Maincloud (you only, deferred to the milestone end as decided in Phase 42)

**Never pass `--clear-database`, `-y` / `--yes`, `--delete-data` or `-c` on maincloud: never clear.** A clear wipes the private `llm_config` Anthropic key and the spend ledger. If a publish refuses or asks about data deletion, stop and tell Claude the exact message; do not retry with other flags.

Phase 43's schema change is additive: four defaulted columns (two on `llm_admin_state`, two on `llm_spend`) and a changed `admin_llm_status` view (it gained `daily_ceiling_micro_usd`, `llm_enabled`, `spend_day_utc`, `day_spent_micro_usd` and lost `phase_cap_micro_usd`). No table is removed. Locally this needed only `--break-clients` (the view row type changed).

- [ ] **Order.** Finish the Phase 42 sequence first (its section E). Its publish 2 (E5) is "from the main checkout at HEAD", which already carries the Phase 43 module, so if you have not run E5 yet, E5 **is** the Phase 43 publish: no extra publish is needed, go to the verification below.
- [ ] If E5 is already done, publish the current main checkout at HEAD (module source unchanged since the local publish at commit `74b5d357`):

  ```
  spacetime publish uwr --server maincloud
  ```

  Read the migration plan it prints. Expect `Created columns` lines for `llm_admin_state` and `llm_spend`, a removed and created `admin_llm_status` view, **no** `Removed table` line. Expect at most a break-clients prompt; answer it (or re-run with `--break-clients`) only after reading that the changes are the ones above. Expect `Updated database with name: uwr`.
- [ ] **Verify on maincloud** (every command names `--server maincloud`):

  ```
  spacetime sql --server maincloud uwr "SELECT key_set, key_length FROM admin_llm_status"
  spacetime sql --server maincloud uwr "SELECT llm_enabled, daily_ceiling_micro_usd FROM admin_llm_status"
  spacetime logs --server maincloud uwr
  ```

  Good: `key_set` true with the same `key_length` as before the publish (note it first: run the first command **before** publishing), `llm_enabled` true, `daily_ceiling_micro_usd` 10000000 ($10), and no panic after the update in the logs.
- [ ] Run `pnpm spacetime:generate` from the main checkout; `git status --porcelain src/module_bindings` should print nothing.
- [ ] Deploy the client only when you choose (a push to master deploys production; Claude never pushes), then `/setappversion` so open tabs reload.
- [ ] After the live checks in section 2, confirm on maincloud that calls are **on** and the ceiling is **$10.00** (the admin SQL above).

## 5. What Claude never did

- No maincloud call of any kind: every spacetime command in this phase named `--server local`. No `pnpm spacetime:publishprod`.
- No git push.
- No key read: the Anthropic key, `llm_config`, the CLI token, `.env.local` files and `.dev.vars` were never opened, printed or committed. Only `admin_llm_status` fields and `COUNT(*)` values were queried.
- No clear, `-y`, `--yes` or `--delete-data` on any publish. Only `--break-clients` was used, after the migration plan was read and showed no removed table.
