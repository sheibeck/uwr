# Phase 44 User Checklist: what only you can do

Nothing here blocks any plan. Claude cannot see your screen, your browser network tab or your Anthropic Console, and never runs hosted commands. This checklist gathers every item that needs you, with the evidence Phase 44 collected.

Never paste a key, token, secret or env value anywhere (chat, commits, issues). Paste Console numbers as text, never as a screenshot.

**Where Phase 44 stands, plainly:** the failure drills passed on the scratch database `uwr-verify`; the golden run was recorded (27 calls, $0.2604, window 2026-10-05T08:29:21Z to 08:32:10Z); your tone verdict is `needs_fixes` (not approved); and you deferred the paid end-to-end run, so there is no end-to-end harness timing, no per-route latency table and no module call-log token total yet. Where a number below would come from that run, this checklist says so instead of quoting one.

## A. Things only your eyes can do

- [ ] **Keeper line rotation (Phase 43 UAT 3).** While generation runs, the Keeper line in the console changes about every 5 seconds. Good: it stays in the Keeper's voice and says "you" for the player.
- [ ] **Browser network tab (from Phase 41).** Open DevTools, Network, keep "Preserve log" on, and play through a character creation, a region entry and an NPC chat. Filter for the Anthropic host (`anthropic`) and for any proxy host (`workers.dev`, `localhost:8787`). Good: no request goes to either; the browser talks only to the SpacetimeDB host. (Claude already checked that the built client bundle contains no Anthropic host; the live network tab is the part that needs you.)
- [ ] **Feel of staged entry (Phase 43 UAT 1 and 2).** Region entry should put you in the new region, with its start location and first NPC, in about 10 seconds, before the rest fills in. Class reveal should show the class identity and first ability in about 5 seconds, then fill in, and your input is not locked during the fill.
  - Harness timings for comparison: none from the end-to-end run, because it was deferred (`44-live-results.json` has status `deferred` and no stage timings). Single direct-API calls in the golden run, for orientation only and not the staged flow: `world_gen_start` 9674 and 11174 ms, `creation_class_reveal` 4012 and 6576 ms (`44-golden-run.json`).
- [ ] **Visual check of the `/llm` admin commands (Phase 43 UAT 4).** As admin: `/llm stats` prints one plain table; `/llm off` makes the next LLM action answer "The Keeper is resting. Return later." with no call made; `/llm on` restores it; `/llm ceiling 10.00` sets the ceiling; a non-admin gets an in-voice refusal. Leave calls on and the ceiling at $10.00. The content of `/llm stats` was checked by the harness only where a live run existed; with the end-to-end run deferred, that is also yours to look at.

## B. Things you accept, with the evidence

- [ ] **Phase 43 UAT 5: the late-reply money logic (WR-A01, a late reply across UTC midnight).** The claim: a late reply never lowers today's spend figure below the real spend, and the ceiling is never enforced against too low a figure. Evidence: the existing late-reply and ledger tests in the module test suite (all green in the Phase 44 full-suite run: 76 files, 3869 tests), and the Phase 44 failure drill matrix (plan 44-02 unit matrix and the live drills in `44-live-drills.json`, all passed on `uwr-verify`: bad key, ceiling, kill switch, tiny timeout, restore check).
- [ ] **Phase 43 UAT 6: `max_tokens` headroom (WR-A04) and the stage-2 cap exemption (WR-B01).** The values to accept for routes that never auto-retry: `creation_race`, `creation_class_reveal` and `creation_class` at 1024; `world_gen_start` at 1536; `world_gen` at 2560; `combat_narration` at 768. And that the stage-2 fill routes are exempt from the per-player cap of 3, while the global cap, kill switch, ceiling and daily budget still apply. Evidence: the real stop reasons and output sizes in `44-golden-run.json` (every item records its stop reason and token usage). The end-to-end run would have added module-side stop reasons and sizes for the staged routes; that part is outstanding.

## C. Console reconciliation (if you want the cost check closed)

The recorded token totals should agree with the Anthropic Console within 2%. The golden run is the only paid window so far.

1. Wait at least 10 minutes after the window end (the golden window ended 2026-10-05T08:32:10Z, so it is long past).
2. In the Anthropic Console usage view, filter to the dedicated workspace for this project and model `claude-sonnet-5-5`, with the UTC range 2026-10-05T08:29:21Z to 08:32:10Z. Please confirm nothing else used this key in that window.
3. Read four totals for the window: uncached input, cache creation (write), cache read and output. If the Console only offers a whole-day total, read that day's four numbers and say so.
4. For reference, the recorded totals are 5,667 uncached input, 41,325 cache write, 83,717 cache read and 12,903 output tokens over 27 calls. The comparison is made by the plan's integer-math record; you only supply the Console side.
5. Paste the four numbers as text. If you defer, the reconciliation is recorded as deferred, not passed, and the phase reports it as outstanding.

There is no second window: the end-to-end run was deferred, so nothing else needs reconciling yet. When the end-to-end run is done, repeat this for its window.

## D. Maincloud

Everything on maincloud is yours and waits until the end of the milestone. Use `44-MAINCLOUD-CHECKLIST.md`. It covers Phase 42 section E (the two-publish sequence), the Phase 43 publish and its checks (UAT 7), and the Phase 41 maincloud items (key step, eight-route smoke test, per-domain calls, the Phase 39 gate re-check). Never pass `--clear-database`, `-y`, `--yes`, `--delete-data` or `-c` on maincloud.

## E. Also still open for you (carried forward)

- [ ] **The paid end-to-end run (44-09), deferred.** It would give the per-domain live verdicts, per-route p50, p95 and p99, stage timings, time to playable, the module-side token totals for the second Console window, and the NPC-chat sample that the streaming decision needs (at least 20 ok calls). Until it runs, QUAL-02's live half is `human_needed`, and streaming is recorded as indicative only.
- [ ] **Tone re-run after fixes (QUAL-01).** Your verdict is `needs_fixes`. `44-TONE-FIXES.md` is a proposal awaiting your decision (nothing was applied). After you approve fixes and they are applied, the failing items re-run with `GOLDEN_LIVE_RUN=rerun GOLDEN_ONLY=<ids>` after a fresh cost checkpoint, and skl-02 needs a verdict. Reply shape (a speaker field) is deferred to the UX overhaul (backlog 999.6).
- [ ] **Phase 41 live checks** (local live proof, pronoun check on real replies, bundle check): the failure drills and the golden run absorbed part of this; the per-domain live proof and the pronoun check on end-to-end replies move with the deferred run above.
- [ ] **Phase 43 live checks** (`43-UAT.md` items 1 to 7): items 1 and 2 timing from the deferred run, items 3 and 4 in section A, items 5 and 6 in section B, item 7 in section D.
- [ ] **Maincloud migration** (`42-USER-CHECKLIST.md` section E), reached through section D.
