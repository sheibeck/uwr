---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: UX Overhaul
current_phase: 48
current_phase_name: Combat Encounter
status: executing
stopped_at: Phase 51.3.1.1 UI-SPEC approved
last_updated: "2026-10-08T21:04:54.056Z"
last_activity: 2026-10-06
last_activity_desc: Phase 48 execution started
progress:
  total_phases: 23
  completed_phases: 10
  total_plans: 147
  completed_plans: 147
  percent: 43
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-05)

**Core value:** A world that writes itself around its players -- every character is unique, every region is discovered, and the narrative responds to what players actually do.
**Current focus:** Phase 48 — Combat Encounter

## Current Position

Phase: 48 (Combat Encounter) — EXECUTING
Plan: 14 of 14
Status: Ready to execute
Last activity: 2026-10-06 — Phase 48 execution started

Progress: [██████████] 100%

Milestone: v3.0 UX Overhaul -- Phases 45-52 (see ROADMAP.md). Phases 45 and 46 are independent and can run in parallel; 47 needs both.

## Previous Milestones

- v1.0 RPG Milestone -- Phases 1-23 (shipped 2026-02-25)
- v2.0 The Living World -- Phases 24-30 (shipped 2026-03-09)
- v2.1 Project Cleanup -- Phases 31, 32, 38 (shipped 2026-09-29; 33-37 parked in Backlog 999.1-999.5)
- v2.2 LLM — Claude Engine -- Phases 39-44 (shipped 2026-10-05; override closeout, 41/43/44 human verification deferred)

See MILESTONES.md for full delivery summaries.

## Accumulated Context

### Decisions

(Archived with v2.1 milestone. See .planning/milestones/v2.1-ROADMAP.md for the full decision log. Key decisions are in PROJECT.md.)

- [Phase ?]: Phase 39-01: measurement gate is strict (dispatch p95 < 250 ms, load p95 < 2.0x baseline); thin data returns incomplete; go_with_cap cap = max(2, highest passing level)
- [Phase ?]: Phase 39-02: spike spend cap is a code constant (2.4M micro-USD); spike_reset preserves spend counters; missing spike_state fails closed
- [Phase ?]: [39-03] Spike key read via util.parseEnv (not process.env); readLogs slices whole log; only probeUwrClean may read uwr, via a fixed argument list
- [Phase ?]: Phase 39-04: runConcurrent async wrapper plus startConcurrent live handle; canary key remains in llm_config row 1 until real key stored in Plan 06
- [Phase ?]: 39-05: ctx.sender in a scheduled procedure is the module identity (no connection id); requesting player must be carried in the job row
- [Phase ?]: 39-05: ctx.http.fetch throws on timeout (platform) but returns 401 on a bad key; request-id visible, retry-after not observed
- [Phase ?]: 39-06: paid ladder rungs 2 and 3 all ok on attempt 1 (10/10 models, 30/30 Sonnet 5.5); est spend 2280 micro-USD; no re-run needed
- [Phase ?]: 39-07: region JSON Schema compiles (no staged workaround needed); thinking-off composes with output_config.format; client-called procedure does not block its own connection; publish waits for the in-flight call
- [Phase ?]: 39-08: server-side procedure concurrency is capped at 4 (in-flight never above 4 with 8 enqueued); level 8 has no ticks at in-flight >= 6
- [Phase ?]: 39-11: gate results profile and SPIKE_TARGET maincloud opt-in; maincloud (cap 8, all levels pass, spend 1.147M micro-USD) measured on uwr-spike-925iv; real key replaced by placeholder
- [Phase 39]: Phase 39: LLM executor = scheduled procedure (in-flight cap at most 8). Maincloud uwr-spike-925iv strict gate verdict go (floor-adjusted identical): dispatch p95 3.0 ms, 0/164 reliability failures, region schema compiles, ping and tick p95 at 0.96x-1.03x of baseline at 8/4/2 in flight, observed cap 8 (local 4). Local results provisional (strict incomplete). Jobs must carry the player identity (ctx.sender is the module identity). Confirmed by user 2026-09-29 ("confirm-strict"); llm-proxy retired in Phase 42; Phase 41 proves the real executor on maincloud
- [Phase 39]: [39-10] Maincloud DB uwr-spike-925iv kept briefly by the user, then deleted by the user on 2026-09-29 (describe returns 404)
- [Phase ?]: 40-01: schema_recorder loads real index.ts under a recording spacetimedb/server mock with no production edit; createMockProcCtx has no ctx.db and a module-identity sender
- [Phase ?]: 40-03: Keeper Bible 7,421 chars (~2,283 tokens); player text capped 1000 code points, truncated not rejected, all <,> escaped; combat_narration route is plain prose; NPC reply shape copied into llm_layers.ts
- [Phase ?]: [40-04] llm_job and llm_call_log are private; public llm_* set is exactly llm_task until Phase 42; enqueueLlmJob dedupes on JSON-array key with active statuses blocking
- [Phase ?]: 40-05: submit_llm_result pinned by 120 characterization cases and 116 snapshots; Plan 40-08 must pass them unmodified
- [Phase ?]: 40-05: rank-2 renown static fallback throws on bigint JSON.stringify (pinned as a throw, unfixed); creation race/class clamping gap pinned for Phase 41
- [Phase ?]: [40-06] RETRYABLE_CLASSES is a frozen array (rate_limit, overloaded, server, timeout, network); spend-cap 429 recognised by error_code alone; retryAfterSeconds only for retryable classes from a numeric header
- [Phase ?]: 40-07: perkEffectJson bigint values serialized as plain JSON numbers (safe range) so stored JSON matches the perk prompt shape; index.ts copy of the fallback still has the bigint defect (Phase 41)
- [Phase ?]: 40-08: submit_llm_result apply logic extracted verbatim to helpers/llm_apply.ts keyed on job.playerId; renown bigint throw preserved for Phase 41
- [Phase ?]: 40-09: seam test excludes only llm_config from the leak scan and normalizes auto-increment ids when comparing re-invoked-tx end state; local publish needed no --break-clients and no clear
- [Phase ?]: [40-10] Keeper Bible tone approved by the user (verbatim 'Approved', 2026-09-30) with no edits; 7,421 chars (~2,283 tokens); full suite must be run per file on this host due to memory exhaustion
- [Phase ?]: [41-01] Retry lifetime bound pinned by test (worst retrying route 303.2 s < 10 min pending expiry); llm_dispatch/llm_sweep_tick unbound until 41-07; CLI identity is an admin (user-approved, set pinned by admin.test.ts)
- [Phase ?]: 41-02: reservations use existing chars/3 reserveCostMicroUsd helper (more conservative than chars/3.25); refusal order daily_calls, daily_cost, phase_cap; unknown billing charges ledger only
- [Phase ?]: [41-03] insertStaticRenownPerkOptions returns rows inserted and is idempotent per character+rank; Keeper line only when rows were inserted
- [Phase ?]: [41-03] Creation replies clamp-and-default (never reject); legacy ability field names no longer read; nameless race not saved as race_definition
- [Phase ?]: [41-04] Retry jitter is up to 20% of the base, added on the retry-after core; defer delay is 500 ms + [0,250); jitter is a deterministic hash of job id and a second seed
- [Phase ?]: [41-04] Route inputs are snapshotted in requestJson and revived per declared bigint path only (never by an in-band tag), so model-written NPC memory is never reinterpreted
- [Phase ?]: 41-05: cap-exempt routes are combat_narration and renown_perk_gen (never refused busy); only narration is uncounted
- [Phase ?]: 41-06: claimLlmJob exported; runLlmJob composes guard, claim, call, persist, apply; unreadable-body replies treated as unknown billing (ledger charged reservation, player nothing)
- [Phase ?]: 41-06: smoke jobs record failed entries in llm_admin_state and never call applyLlmFailure; smoke resultText stored redacted
- [Phase ?]: [41-07] llm_sweep inserts its next tick unconditionally and first (like sweep_llm_errors); sweeper never runs a success apply, re-dispatches received jobs; report counters increment after status and money are written
- [Phase ?]: 41-08: key script must match log line 'llm key set, len=<n>'; admin_llm_status row type is AdminLlmStatusRow (SDK derives AdminLlmStatus from the view name); llm_smoke_test is all-or-nothing against the phase cap
- [Phase ?]: 41-09: key script transports the key via HTTP call endpoint body (not argv); maincloud needs --target maincloud plus --confirm-maincloud; storeKey flow lives in scripts/llm/cli.mjs
- [Phase ?]: 41-10: talk_to_npc enqueues via enqueueLlmJob keyed on npc_memory.lastUpdated (per-turn dedupe); the player line is echoed only after a created job
- [Phase ?]: 41-10: local publish needed --clear-database (llm_job.next_attempt_at needs a default); bindings regenerated with no diff
- [Phase ?]: 41-11: combat narration is a victory/defeat outro only, enqueued before clearCombatArtifacts; never throws, refusal is silent
- [Phase ?]: 41-12: Skill offers go through one helper (requestSkillOffer) shared by level-up, request_skill_offer and [skills]; eligibility = level>=2, no pending skills, no generated ability at current level, dedupe on character+level; failure lines name [skills]
- [Phase ?]: 41-13: creation progress lines post only when a job was enqueued; refusal reverts the step and posts creation_error; client isCreationLlmProcessing derives from GENERATING_* step
- [Phase ?]: [Phase 41-14]: World-gen failure goes to ERROR (failWorldGen), never PENDING; only the player's explore retries, including the first region (fresh starter state for a character at location 0 whose starter state is ERROR)
- [Phase ?]: [Phase 41-14]: startWorldGeneration returns reused|enqueued|duplicate|refused; the ripple line posts only on enqueued or duplicate; a refusal sets ERROR with a fixed in-voice errorMessage (world_gen_state is public)
- [Phase ?]: 41-15: live-proof harness connects with withDatabaseName('uwr') (SDK 2.10 has no withModuleName); paid mode = PROVE_LIVE_DRY unset, re-runnable; A1 settled (CLI token is an admin, admin_llm_status rows: 1)
- [Phase 41]: 41-16/41-17: live proof and maincloud proof deferred by user (2026-09-30, human_needed, not passed); key stored locally (len 108); 41-MAINCLOUD-CHECKLIST.md written for the user to run
- [Phase ?]: [41-18] NPC gender: male/female clamp (model value, text pronouns, FNV-1a name hash); npc.gender column default '' needed only --break-clients locally (no clear); Bible: Keeper is he, people he or she, beasts may be it, player is you; npcGender(row) is the only reader
- [Phase ?]: [42-01] Apply-layer characterization drives applyLlmResult/applyLlmFailure directly; llm_apply.ts writes no old call counts; llm_prompts.ts deleted and kept deleted by test
- [Phase ?]: [42-02] Indicator lines module is import-free (strings only to the browser); cleanup literal sits inside removeItem(...) for the bundle guard's one allowed span; guard output is rule id, path, offset and string/comment/code class only; calibration on pre-cutover dist: exit 1 with proxy-key-name, proxy-secret, proxy-url
- [Phase ?]: [42-03] purge_legacy_llm is admin-only, counts-only and idempotent over a fixed four-table list; sweep_llm_errors stays registered as an empty drain until the tables drop in 42-06; client-connected absence test ran the real handler
- [Phase ?]: [42-04] Only creation and world-gen state rows lock input (isLlmInputLocked); failed or expired jobs show no client error UI; removing llm-proxy/.gitignore exposed ignored leftovers, hidden via local .git/info/exclude
- [Phase ?]: [42-05] Publish 1 ran local with --break-clients only (no clear, key intact len 108); purge_legacy_llm emptied the four legacy tables (tick row removed); publish-1 commit 5968d54f; local server left running (PID 13620)
- [Phase ?]: [42-06] Publish-2 code: four legacy LLM tables, sweep_llm_errors and purge_legacy_llm deleted; public llm_* set is [] with exactly 8 private tables; absence checked at schema level (recorder, __defs, scheduledReducers, strict initScheduledTables) since the mock returns [] for unknown tables; model-literal allowlist is empty
- [Phase ?]: [42-07] Publish 2 ran local with --break-clients only (no clear, key intact len 108) and dropped llm_budget, llm_cleanup_tick, llm_request, llm_task; re-publish and second bindings regeneration are no-ops; local server stopped (PID 13620); user checklist 42-USER-CHECKLIST.md holds all Cloudflare/OpenAI/env/maincloud steps
- [Phase ?]: 43-01: global ceiling and kill switch checked in enqueueLlmJob before busy and before any write; missing llm_admin_state row fails closed; $2 phase cap constant kept until Plan 43-06
- [Phase ?]: 43-02: /llm stats aggregation is pure (imports only ./measurement); p50/p95 over ok calls only, money and latency truncate; route names stripped of [ ] < > { } for the v-html console
- [Phase ?]: 43-03: claim-time halted/ceiling end a pending job as failed (not expired) through failAtClaim so applyLlmFailure releases the domain lock; one shared resting line, public bucket unavailable
- [Phase ?]: 43-04: stage-1 schemas are the smallest reveal (no isSafe on the start location, no locationName on the first NPC); stage-2 builders tolerate older stored inputs so apply, executor and cutover suites stay green unchanged
- [Phase ?]: [43-06] Smoke test checks kill switch then today's held spend plus all smoke reservations against the ceiling (exactly at ceiling allowed); view reads a missing state row as halted with zero ceiling; $2 phase cap constant and helper deleted
- [Phase ?]: 43-07: /llm slash commands are admin-gated by ADMIN_IDENTITIES on ctx.sender with an in-voice fail() refusal; malformed /llm forms answer usage rather than falling through to the command row
- [Phase ?]: [43-08] World generation is staged: world_gen_start reveals region, safe start location and first NPC and enqueues the world_gen fill in the same apply transaction; a failed fill is FILL_ERROR with the stage-1 region playable and no automatic retry
- [Phase ?]: [43-08] writeRegionFill connects every new location to the start location by graph reachability; startWorldFill turns an unreadable stage 1 into FILL_ERROR instead of throwing; Plan 43-11 must teach the sweeper that GENERATING is held by world_gen_start and FILLING by world_gen
- [Phase ?]: [43-09] Rotation only picks a line from the winning route's pool and never changes which job wins; stage-2 steps (FILLING, FILL_ERROR, CLASS_FILLING, CLASS_FILL_ERROR) excluded from input-locking lists read from server data
- [Phase ?]: [43-10] Effort chosen by passing-sample count (ties go to low and are recorded); deriveRecordFields is the single source of derived record fields; insufficient data keeps the baseline; sweep harness dry by default with record written in finally
- [Phase ?]: [43-10] Dry run: 90 Run A + 18 Run B requests, worst-case reservation 3,998,458 micro-USD (under the 4.5M stop line); paid branches unexecuted until Plan 43-12
- [Phase ?]: [43-11] Sweeper keeps two holder sets: world_gen_start holds PENDING/GENERATING, world_gen holds FILLING; a stranded FILLING lock goes to FILL_ERROR, never ERROR; only the player's explore retries stage 2
- [Phase ?]: 43-12: paid sweep approved and run once (108 calls, $0.9221 of $5 cap); low effort chosen on all 9 routes; caching passes on all 9; LAT-06 verdict leave_out (class reveal p50 4665 ms, p95 7113 ms)
- [Phase ?]: 43-13: a class fill adding no usable ability is malformed (CLASS_FILL_ERROR); 'try again' at CLASS_FILL_ERROR retries the fill instead of going back
- [Phase ?]: [43-14] Measured tuning applied: low effort on all 9 routes, max_tokens 256-2560 derived; caching passed 9/9; LAT-06 leave_out (class reveal p50 4665 ms), parallel not built
- [Phase ?]: [43-15] Local publish used --break-clients only (view row type change, no table removed); key intact (108 before and after); kill switch/ceiling round trip at $0; pre-existing time-command getWorldState import bug deferred
- [Phase ?]: [Phase 44-01]: validateRenownActivePerk lives in pure renown_perk_validate.ts (re-exported by llm_apply.ts) so offline harnesses reuse the server clamp without the server runtime
- [Phase ?]: [Phase 44-02]: Failure drills use the real applyLlmFailure and events-mock lines; leak pattern is whole-word; four inline apply lines are pinned against llm_apply.ts source
- [Phase ?]: [Phase 44-03]: --db accepts only uwr or uwr-verify, local only, refused with any hosted flag; Console reconciliation is BigInt exact (2.00% passes, 2.01% fails, 50-token floor for categories under 2000, deferred/invalid never pass); plain node loads the route table through ts_resolve_hook.mjs
- [Phase ?]: 44-04: approvalAllowed needs overall approvedBy user; the review page's verdicts/overall is not itself an approval, the orchestrator adds approvedBy only when the owner approves in chat
- [Phase ?]: 44-04: golden harness dry by default (worst-case $0.5744 of a $2.00 cap, $1.80 stop line, no retry); run refuses over a recorded run, use rerun with GOLDEN_ONLY
- [Phase ?]: [44-05] A paid live-proof run is refused for any database but uwr-verify; the dry run may read uwr or uwr-verify
- [Phase ?]: [44-05] Smoke jobs are not in my_llm_jobs; smoke ids come from the call log report by run window
- [Phase ?]: 44-06: Live drills run on uwr-verify only; fake key stored before each drill, real key restored per drill in finally; timeout row cost is the ledger reservation, tied to ledger delta
- [Phase ?]: 44-07: one approved paid golden run recorded (27 calls, $0.2604); 13 of 27 items fail a mechanical rule and are left as data for the owner's 44-08 review; no rule or item weakened; approval stays null
- [Phase ?]: [44-08] QUAL-01 tone NOT approved (needs_fixes: 12 fails, skl-02 unrated); nothing applied; response shape (speaker field) deferred to UX overhaul 999.6
- [Phase ?]: 44-10: Console token reconciliation deferred by the owner for both windows (golden 2026-10-05T08:29:21Z to 08:32:10Z, log totals 5667/41325/83717/12903); recorded deferred, not passed; streaming indicative (n=0)
- [v3.0] Fresh client (Vite + Vue 3) on Nocturne, built at the repo root after Phase 45 deletes the old `src/` UI (tagged `v2.2-client`); it takes over port 5173, the SpacetimeAuth redirect and deploy path; no side-by-side clients (owner, 2026-10-05: greenfield)
- [v3.0] The Keeper is a second-person scene narrator (first-person direction retracted); narrative LLM replies become speaker-attributed segments (SEG, Phase 46); Keeper Bible and route-block edits need explicit owner approval, tone sign-off is SEG-05
- [v3.0] ~~Combat stays real-time~~ superseded 2026-10-05: combat becomes round-based (10s rounds that end early once every player has chosen, auto-attack default, Keeper narrates big moments and the end of the fight; Phase 46.1). The old src/ client is not updated for rounds
- [v3.0] Character creation order is race, class, name (last), enter the realm; mock 2a's name-first order and its "First words" step are dropped (owner, 2026-10-05)
- [Phase ?]: 45-01: Old client tagged v2.2-client locally before deletion; html2canvas removed (bug report returns in Phase 52)
- [Phase ?]: 45-02: textColorOffenders ignores comments (PR numbers parse as hex); negative px spacing flagged
- [Phase ?]: 45-03: connect() only starts from idle/rejected/expired so repeat calls cannot reset backoff
- [Phase ?]: 45-03: connection.test.ts runs under happy-dom (auth module reads window at import)
- [Phase ?]: 45-04: LinkStatus aliases ConnectionStatus via type-only import so deriveScreen and the connection controller cannot drift
- [Phase ?]: 45-04: bindTable ignores applied/error callbacks from a replaced connection and keeps rows until a fresh apply
- [Phase ?]: [Phase 45-05]: focusableWithin excludes tabindex=-1 on buttons; Esc listener is document-level and ignores defaultPrevented
- [Phase ?]: [Phase 45-06]: Bar fills use inline width percentage only; strip tag group is one tag row high so New skill clips before Level up and the name never wraps
- [Phase ?]: 45-07: Account menu Esc handled at wrapper with stopPropagation so it never closes a drawer; NoticeBars countdown derives from absolute nextRetryAt
- [Phase ?]: [45-08] Splash Enter handler gated on button shown and enabled, not on connection state; static tests resolve sources from process.cwd() under happy-dom
- [Phase ?]: 45-09: logout disposes every binding so stale rows never reach the next sign-in; keyed bindings recreated only on key change
- [Phase ?]: 45-10: mobile feed and location row hidden with v-show so feed keeps scroll; Drawer/Sheet keyed by screen id for focus on swap
- [Phase ?]: [46-01] Event helpers omit the segments key when none/empty given; local publish used --break-clients only (no clear, key 108 before and after); bindings regenerated with KeeperSegment
- [Phase ?]: [46-01] Player-attributed dialogue check runs before present-speaker match; unmatched speaker becomes Keeper narration in straight quotes; truncation keeps 599 code points then U+2026
- [Phase ?]: 46-02: NPC replies use segmentsFromReply with present speakers from npc.by_location; non-JSON NPC reply is one Keeper segment with no memory write; world_gen stage 2 writes no model prose so stays unwrapped
- [Phase ?]: Phase 46-03: combat round prefix removed; message always equals flattenSegments(segments); unusable successful combat replies store one Keeper fallback line per participant
- [Phase ?]: Phase 46-03: failWorldFill creation_error line wrapped with keeperFallback segments (wording unchanged)
- [Phase ?]: 46-04: narration segment speaker must be exactly 'The Keeper'; dialogue speakers compared by speakerKey against item allowedSpeakers
- [Phase ?]: 46-04: keeper_first_person also lints plain combat prose so the rule holds before and after the 46-08 combat route flip
- [Phase ?]: 46-05: review page reviewLines uses the server normalizer; golden.live.ts writes Phase 46 record; Phase 44 replay skips npc/combat routes and ignores the two new rule ids
- [Phase ?]: 46-06: Owner approved the Phase 46 voice package as drafted (OQ1 server wrap, OQ3 (a), OQ6 (i), OQ7 enemies plus NPCs at location); no pair rejected
- [Phase ?]: 46-07: applied route-schema-* approved blocks to llm_schemas.ts (package section G assigns them to 46-07), overriding the plan's schemas-unchanged line
- [Phase ?]: 46-08: combat_narration is a JSON segments route (schema, route kind and approved block in one commit); OQ7 recommended allow-list kept
- [Phase ?]: 46-09: OQ6 (i) all 27 string pairs and the 4 fallback pairs applied byte for byte; D2, D3 and OQ2 kept as built (segments.ts unchanged)
- [Phase ?]: 46-10: OQ3 (a) applied. Power budgets stated in the per-call text of skill_gen, renown_perk_gen, creation_class_reveal and creation_class, read from the server clamp; range_violation stays a failure
- [Phase ?]: 47-01: command words run only in exact typed shape; slash lines always commands; bare leave/end end a conversation
- [Phase ?]: 47-02: keyword-eligible lines are Keeper, NPC, scene, quest, ripple, world event, system and warning; player-authored text never eligible
- [Phase ?]: 47-03: route levels use the per-location rule (region base + levelOffset); item_cooldown unused (no slot-to-item link)
- [Phase ?]: 47-04: No client Error line for failed jobs; queue gate excludes world_gen fill route; feed cap keeps the newest entry
- [Phase ?]: 47-05: createKeyed disposes its bindings when the owning effect scope stops; queries throw on empty id lists (callers use idListKey null)
- [Phase ?]: [47-06] View row lists in GameData use the underlying row types (QuestInstance, CharacterEffect, GroupInvite, FactionStanding, MyLlmJob) because the generated My* view types are empty objects
- [Phase ?]: 47-07: smooth pill jump holds the pinned flag 600ms; pinned auto-follow scrolls instantly
- [Phase ?]: 47-08: 'Party · n' counts every member including the player; unknown party members show a dimmed card and a plain 'Member' strip chip with no percent
- [Phase ?]: 47-10: ContextContent is a fragment; Map sheet (47-12) must mount it in a flex column with 16px gap
- [Phase ?]: 47-11: hotbar sweep uses an inline conic-gradient background (data-percent for tests) instead of a --cd custom property, because the var() guard accepts only Nocturne/client tokens
- [Phase ?]: 47-12: owner try-out changes - dark shared scrollbars in frame.css and the 760px desktop feed measure removed (supersedes 45-UI-SPEC for the desktop feed)
- [Phase ?]: [46.1-01] Round timer is 10s; seconds convert to rounds at 4s via ceil with minimum 1; MAX_COMBAT_NARRATIONS(3) caps big moments per fight
- [Phase ?]: 46.1-02: combat_round/combat_action stay public for RND-04; combat_moment private; schema additive-only with defaulted last columns
- [Phase ?]: 46.1-03: moment per-call text auto-approved overnight and listed in 46.1-VOICE-ADDENDUM.md; M4 says full health (no singular they); outro carries the final round
- [Phase ?]: 46.1-04: round ticks deleted only by scheduledId; cooldowns convert at the fight boundary with ceil (9 s left is 3 rounds, 2 rounds is 8 s); stun stored as magnitude 1 with roundsRemaining, larger kept on re-apply
- [Phase 46.1]: 46.1-05: stored ability choices are re-validated at resolution (ownership, round cooldown, ally target, resources) and fall back to the auto-attack
- [Phase 46.1]: 46.1-05: combat_loop is a module-guarded drain that only calls ensureRound and never reschedules; combat_loop_tick stays defined
- [Phase ?]: 46.1-06: flee is the player's whole action for the round; success deletes the participant row (no fleeing/fled status); resolveRound skips the enemy phase when no participant is left
- [Phase ?]: 46.1-07: stun interrupts a winding-up enemy (A2); pet ability fires every petAbilityDue round, auto-attack every round (A3); partial-pull adds store arriveAtRound N+1
- [Phase ?]: 46.1-08: moment tail runs after the victory/defeat checks (final round never narrates a moment); row written before the enqueue so a refusal still counts against the 3-per-fight budget
- [Phase ?]: [46.1-09] Local publish with --break-clients (additive, no clear) kept the stored key length 108; generated types.ts carries a CombatMoment row struct (generator emits private-table row types) with no table binding
- [Phase ?]: [48-01] my_combat_aggro view (row MyCombatAggroEntry, pets dropped, combat ids deduplicated) published locally with --break-clients only (no clear, key 108 before and after); bindings carry myCombatAggro
- [Phase ?]: 48-05: Tab scope bails when a role=menu is in the DOM; hidden target status is set on request, not on echo
- [Phase ?]: 48-11: HeaderBar combat lock uses a new inCombat prop with aria-disabled; native disabled prop unchanged
- [Phase ?]: 48-11: VitalsRail latches the damage-flash key with the hp prop so a character switch never reads as a drop

### Roadmap Evolution

- 2026-09-29: Phases 33-37 parked in Backlog as 999.1-999.5 (user decision: put on hold while re-imagining core concepts). Promote with /gsd-review-backlog.

- 2026-09-29: v2.2 roadmap created: Phases 39-44 (39 Spike, 40 Claude Layer and Job Seam, 41 Executor and Domain Cutover, 42 Client Cutover and Legacy Removal, 43 Latency Tuning and Budget, 44 Live Verification and Tone Eval). Numbering continues from 38; 33-37 are consumed by parked Backlog 999.1-999.5, which stay untouched.

- Phase 38 added: Platform Upgrade (SpacetimeDB 2.0.1 -> 2.10.x, tooling, llm-proxy deps, pnpm-only). Runs next, ahead of 33-35 and 37. Research: `.planning/notes/platform-upgrade-research.md`

- 2026-10-05: v3.0 roadmap created: Phases 45-52 (45 Foundation, Frame and Auth; 46 Structured Keeper Replies; 47 Console, Rails, Hotbar and Input; 48 Combat Encounter; 49 Character Creation Interview; 50 Ledger: Character and Economy; 51 Ledger: World and People; 52 Parity and Cutover). Numbering continues from 44. Backlog 999.6 and 999.7 promoted into v3.0; 999.1-999.5 untouched.
- Phase 46.1 inserted after Phase 46: Round-Based Combat Engine: 10s rounds that end early when all players have chosen, auto-attack default, Keeper narrates big moments and the end of the fight
- Phase 51.1 inserted after Phase 51: split out of Phase 51 on 2026-10-07 (owner: phases overloaded)
- Phase 51.2 inserted after Phase 51: split out of Phase 51 on 2026-10-07 (owner: phases overloaded)
- Phase 52.1 inserted after Phase 52: split out of Phase 52 on 2026-10-07 (owner: phases overloaded)
- Phase 51.3 inserted after Phase 51.2: Loot: AI-filled loot tables per enemy type plus the designed loot rails (owner 2026-10-07)
- Phase 51.4 inserted after Phase 51.3: Loot Rails split from the loot phase; 51.3 renamed Regional Economy (owner 2026-10-07)

### Pending Todos

- `todos/pending/2026-09-29-new-milestone-llm-reliability.md` — **NEXT MILESTONE (after v2.1 is archived):** fix the LLM pipeline (OpenAI credits/provider, procedure HTTP vs llm-proxy)

- `todos/pending/2026-09-29-migrate-client-table-handles-to-camelcase.md` — optional cleanup of deprecated snake_case table aliases
- `todos/pending/2026-09-29-require-admin-for-increment-event-counter-reducer.md` — **security:** `increment_event_counter` has no `requireAdmin`, so any client can force-resolve world events
- `todos/pending/2026-10-06-renown-passive-perks-no-effect.md`: chosen passive renown perks never match `RENOWN_PERK_POOLS` keys, so they have no effect. The owner chose to handle it later.
- `todos/pending/2026-10-06-combat-victory-summary-looks-like-three-keeper-lines.md`: one victory outro split into three segments renders as three "The Keeper" lines. The client fix is to group the segments under one label. Changing the outro length in the prompt needs owner approval.
- `todos/pending/2026-10-06-hotbar-hover-shows-ability-description.md`: hovering a hotbar slot should show the ability description, cost, cooldown and cast time. It must work on keyboard focus and on mobile (long-press). Client only.
- `todos/pending/2026-10-06-crafting-and-backpack-follow-the-updated-mock.md`: owner play-test plus the new `UWR Crafting.dc.html` mock. Smaller backpack squares, a clear craft and salvage result message, craft ×N, and output descriptions with stats. The odds bar stays off unless the owner decides otherwise.
- `todos/pending/2026-10-06-bind-stone-in-nearby-with-bind-action.md`: bind stone row in Nearby with a Bind action. Folded into Phase 51.
- `todos/pending/2026-10-06-nearby-npc-chat-bubble-instead-of-hail.md`: NPC rows in Nearby use a chat bubble icon ("Talk to {name}") instead of the word "hail". Folded into Phase 51.
- `todos/pending/2026-10-07-party-pet-hud-and-follow-indicators.md`: pet HUD and travel-with-leader indicators from the updated `UWR Party.dc.html`. Folded into Phase 51.
- `todos/pending/2026-10-07-combat-outro-tells-how-the-fight-unfolded.md`: the victory outro reads as wry aftermath because the prompt gets no record of the fight. Owner wants an action-oriented summary of how the fight unfolded from the abilities both sides used. Server digest needs no approval; the prompt wording needs the owner's explicit approval of the exact text.
- `todos/pending/2026-10-07-level-up-and-new-skill-tags-do-nothing.md`: **blocks progression.** The Level up and New skill tags are display-only; no client calls `apply_level_up` or `choose_skill` (the old button was deleted in 45-01 and every UI-SPEC deferred the flow).
- `todos/pending/2026-10-07-combat-mock-effect-chips-update.md`: updated `UWR Combat.dc.html` changes the effect chips for players and enemies. Fold into Phase 51.4 (same design file as the loot rails).

- `todos/pending/2026-10-08-friends-in-different-starting-zones-can-find-each-other.md`: friends who start in different race zones need a way to meet (owner idea; touches 999.11, 999.26, 51.1, 52.2).
- `todos/pending/2026-10-09-widen-the-right-context-rail-so-names-and-long-lists-fit.md`: the right context rail (fixed 288px) cuts off place names and makes busy places a long scroll; the centre feed has spare width. Owner chose a rail that grows with the screen; folded into Phase 51.5.1.
- `todos/pending/2026-10-09-keeper-mocks-your-cowardice-when-you-flee.md`: a successful flee ends with only a system line; the owner wants a Keeper summary of the fight that notes your cowardice. Prompt wording needs the owner's approval. Pairs with the victory-outro todo.

### Blockers/Concerns

- **[Milestone end, user action] Maincloud migration.** On 2026-09-30 the user deferred it "until we're all done". Run section E of 42-USER-CHECKLIST.md: publish 1 from 5968d54f, deploy the client and `/setappversion`, `purge_legacy_llm` with COUNT 0 checks, then publish 2. Publish 1 also covers 41-MAINCLOUD-CHECKLIST.md. Phase 43 adds only additive, defaulted schema, so publish 2 from the final HEAD still needs no clear.
- **[Phase 41 PARTLY DONE 2026-09-30] Smoke test passed locally (6/6 routes ok, key_valid true, ~$0.11; world_gen 23.5 s, creation_class 10.1 s). The rest of the local live proof (41-16 Task 2) is still deferred.** The user set the Anthropic key locally (keySet true, len 108, `keyValid` false until a smoke test passes) and decided on 2026-09-30 "we can skip the live proof for now". Nothing has been proven against real Claude: no smoke test, no real action per domain, no real-response usage or latency figures, no he/she pronoun check on real output. Resume: `41-LOCAL-PROOF.md` ("How to resume later"): `spacetime call uwr llm_smoke_test --server local`, then `pnpm exec vitest run --config scripts/llm/vitest.live.config.ts` (PROVE_LIVE_DRY unset). The key stays stored locally, so local play makes real calls within the caps ($1/day and 200 calls per player, $2 phase ledger). Do not `--clear-database` locally without need (it wipes the key).
- **[Phase 41 DEFERRED, user action] Maincloud proof (41-17) not run.** `41-MAINCLOUD-CHECKLIST.md` is written for the user; the user chose to defer the run. The Phase 39 gate re-check on maincloud (dispatch p95 under 250 ms, zero reliability failures, region schema, responsiveness, no browser request to Anthropic or a proxy) is deferred too. Run the local live proof first. A maincloud publish adds `npc.gender` (default '') and needs `--break-clients` (no data loss, no clear); the first publish after the 2.10 upgrade may also need it.
- [Phase 41 follow-up, cosmetic] `set-key.mjs` prints Node warning `MODULE_TYPELESS_PACKAGE_JSON` for `spacetimedb/src/helpers/measurement.ts`; adding `"type": "module"` to `spacetimedb/package.json` would silence it.
- [Phase 38, resolved by Phase 42] The OpenAI path and llm-proxy are removed; LLM calls run server-side on Claude. Revoking the old OpenAI key and deleting the Worker are on 42-USER-CHECKLIST.md
- [v2.2] The Phase 39 maincloud leg ran in Plan 39-11 on uwr-spike-925iv by user decision on 2026-09-29 and the go decision is confirmed; Phase 41 still proves the real executor on maincloud. The maincloud leg of QUAL-02 (Phase 44) remains a manual user action
- [v2.2] `--clear-database` wipes the private `llm_config` Anthropic key; avoid unless a schema change requires it (runbook lands in Phase 41)
- [Phase 38] First maincloud publish after the 2.10 upgrade will re-create the 14 views and need --break-clients (no data loss) -- user-run only
- [Phase 38] Lockfiles moved to pnpm-only -- check any external host's package-manager detection before the next push
- [Phase 40 → 41] Hand-offs:
  - The renown static fallback in `helpers/llm_apply.ts` still throws on bigint `JSON.stringify(perk.effect)`. It is pinned by characterization tests; fix it with a shared serializer and update the snapshot deliberately.
  - Creation race and class replies are not clamped. They are pinned as "Phase 41: validator gap".
  - The executor must process or expire the pending `renown_perk_gen` jobs, and add a sweeper for stuck active jobs (dedupe blocks on them, review IN-07).
  - `my_llm_jobs.errorCode` is a coarse bucket: transient, unavailable, declined or failed.
  - Review Info items IN-01 to IN-12 are in `40-REVIEW.md`.
- [Env] On 2026-09-30 the machine briefly ran out of committed virtual memory (0.5 GB free), which crashed multi-worker vitest runs. It cleared after a restart (40.8 GB free). Single-worker runs (`--maxWorkers=1`, about 19 s, 1454 tests green) stay the safe default for agents on this low-end host.
- [v3.0 scoping] Server surface gaps found while roadmapping, to scope in plan-phase (additive and tested): `aggro_entry` is private and not in the bindings (CMB-02, Phase 48); `group` has no loot mode and there is no travel-with-party reducer (LDG-05, LDG-06, Phase 51); no buy-back reducer (LDG-09, Phase 50); creation has no race-suggestion step (CRE-03, Phase 49)
- [v3.0 deploy/auth] How master deploys to GitHub Pages is not visible in `.github/workflows` (only claude.yml and claude-code-review.yml); SpacetimeAuth needs redirect URIs for the new client's dev origin (Phase 45) and the production origin (Phase 52)
- [v3.0 bindings] The root `spacetime:generate` keeps writing to `src/module_bindings`, which the new client uses
- **NO PUSHES TO MASTER** -- production auto-deploys from master; all work stays local until user approves
- **NO PUSHES TO MAINCLOUD** -- local SpacetimeDB only until user says otherwise (one exception: the Phase 39 spike database uwr-spike-925iv, published by Claude under the user's 2026-09-29 grant since deleted by the user on 2026-09-29)
- QUAL-01 open: owner tone not approved (44-golden-verdicts.json needs_fixes); owner must decide on 44-TONE-FIXES.md; skl-02 unrated (carried into v3.0 as SEG-05, Phase 46)

### Quick Tasks Completed

(v2.1 quick tasks 392-405 archived in .planning/milestones/v2.1-ROADMAP.md.)

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261006-a0i | Enemies listed in Nearby, each with one Pull button (careful pull, an owner decision). Enemy names are feed keywords and rows show the difficulty color. Review fixes WR-01/02. | 2026-10-06 | a5b70a7e, fff5acbe | [261006-a0i-nearby-enemies-with-pull-actions-and-ene](./quick/261006-a0i-nearby-enemies-with-pull-actions-and-ene/) |
| 261006-a13 | Action progress row above the hotbar for gathering and out-of-combat casts. Review fixes WR-01..04: client-time first-seen and a data-layer map. | 2026-10-06 | 39cb2397, 8b0b94e3 | [261006-a13-action-progress-bar-for-gathering-and-ca](./quick/261006-a13-action-progress-bar-for-gathering-and-ca/) |
| 261006-a3d | Server `look` examines resource nodes and the player's own items, with "look at X" parsed. Server text keeps its line breaks (pre-wrap, ends trimmed). Review fixes: exact matches beat partial ones, player chat line breaks flattened on the server (CR-02), affix stats, item counts. Published locally; key 108 before and after. | 2026-10-06 | 80a0074b, 8fc50e03, e5341e30, 6a3b86eb | [261006-a3d-examine-nodes-and-items-and-keep-line-br](./quick/261006-a3d-examine-nodes-and-items-and-keep-line-br/) |
| 261006-h5w | One Keeper label per multi-paragraph reply (`continued` segments, also applied in creation). Hotbar tooltip: name, cost, cooldown (rounds in combat), cast time and description, on hover, focus or long-press; uses `aria-describedby`. Client only. | 2026-10-06 | 2cf45167, e3ff4643 | [261006-h5w-keeper-segments-one-label-and-hotbar-abi](./quick/261006-h5w-keeper-segments-one-label-and-hotbar-abi/) |
| 261006-hbk | Health bar "not moving": the bar was right. The player's own DoT life-drain (50% of each tick) healed in the same round with no feed line. The caster now gets "Your {DoT} heals you for N". Server; published locally, key 108 before and after. | 2026-10-06 | de0d95b8 | [261006-hbk-health-bar-does-not-update-when-taking-d](./quick/261006-hbk-health-bar-does-not-update-when-taking-d/) |
| 261006-hpo | The combat outro length scales with the fight: 3 rounds or fewer gives one segment of 2 or 3 sentences, longer fights at most 2, boss or named at most 3. Owner-approved prompt change; published locally, key 108 before and after. | 2026-10-06 | 7091bb47 | [261006-hpo-shorter-combat-outro-for-short-fights](./quick/261006-hpo-shorter-combat-outro-for-short-fights/) |
| 261006-hyu | Quest turn-in follow-ups: turned-in quests are kept as history (`completedAt` set, never paid twice, excluded from active lists and abandon); a journal line per quest type on turn-in; one shared package-pickup helper with the aggro roll; turned-in quest items cleaned up; say auto-accept wording fits each quest type. Published locally, key 108 before and after. | 2026-10-06 | fa0a050a, 2a64fdd0, a05f628b | [261006-hyu-quest-turn-in-follow-ups-stale-paid-rows](./quick/261006-hyu-quest-turn-in-follow-ups-stale-paid-rows/) |
| 261006-hpp | Enemy effect chips on Encounter hostile cards and the mobile strip (`combat_enemy_effect` bound per fight, N rounds, +N overflow). The hotbar tooltip gains a type line from the shared `ABILITY_KIND_LABELS` (`@game-data`). Client only. | 2026-10-06 | cf417d20, 61a710ee | [261006-hpp-enemy-effect-chips-in-encounter](./quick/261006-hpp-enemy-effect-chips-in-encounter/) |
| 261006-kpj | Typed hail, talk to and speak to (the new client's NPC talk path) now turn in completed quests through a shared `turnInQuestsAtNpc` helper; before this, only the `hail_npc` reducer did. Published locally, key 108 before and after. | 2026-10-06 | 05d3bbaf, 4fd45c14 | [261006-kpj-typed-hail-turns-in-completed-quests](./quick/261006-kpj-typed-hail-turns-in-completed-quests/) |
| 261006-fjl | Removed the word "ripple" from code and player-facing text; world-growth announcements are World events. Feed kind `ripple` -> `world` (label "World event"), `pickRippleMessage` -> `pickWorldEventMessage`, start line now "shimmer". Guard test added. No publish. | 2026-10-06 | a7bdf561, 4269d5a1, 7aa34027 | [261006-fjl-remove-ripple-from-code-and-player-facin](./quick/261006-fjl-remove-ripple-from-code-and-player-facin/) |
| 261006-g12 | Quest item rewards are schema-valid and equippable: `turn_in_quest` insert used non-existent columns and missed required ones (serializer threw, turn-in rolled back), slots `feet`/`weapon` and armor `medium` replaced; reward typed from the character's proficiencies. "turn in <quest>" intent now grants the item too. 63 tests. No publish. | 2026-10-06 | de82b155, 1c7b41f8 | [261006-g12-fix-turn-in-quest-item-reward](./quick/261006-g12-fix-turn-in-quest-item-reward/) |
| 261006-gy6 | Quest turn-in follow-ups: both paths share `turnInCompletedQuest`. Full bags refuse an item-reward turn-in in voice with nothing applied; quest xp goes through `awardXp` (promised amount kept, pending levels + [Level Up] prompt; max level still gets the xp); the intent path records NPC memory; a reward named like an existing template (e.g. a starter item) becomes "<Giver>'s <name>"; `turn_in_quest` now checks the giver's location. 30 tests. No publish. | 2026-10-06 | 9d263c50, a660736d, 963b6207, bfd908a4, 7b38a16f | [261006-gy6-quest-turn-in-followups-inventory-space-](./quick/261006-gy6-quest-turn-in-followups-inventory-space-/) |
| 261006-hky | Hail turn-in uses the shared `turnInCompletedQuest`: hailing an NPC turns in completed quests for that NPC with the same xp (level-up prompt), gold, item, affinity and NPC memory as `turn_in_quest`, and deletes the instance (the old hail paid xp + affinity only and kept a still-`completed` row). Delivery quests with a recipient are turned in to the recipient (`questTurnInNpcId`) once the package is picked up; the old block paid without the pickup. Full bags on hail: in-voice refusal, nothing applied, greeting still runs. 15 tests. No publish. | 2026-10-06 | dc1be40a | [261006-hky-route-hail-auto-turn-in-and-delivery-com](./quick/261006-hky-route-hail-auto-turn-in-and-delivery-com/) |
| 261008-a97 | Travel with leader moves to the self menu: the desktop rail switch is gone, a follow icon sits beside your name (non-leader members), the self ⋯/right-click entries are proven end to end, the mobile Party sheet switch stays. set_follow_leader writes one party line on a real change: "{name} is now following the leader." / "{name} is no longer following the leader." (owner wording). Local publish, key 108 kept, no bindings change. Full suite green apart from the baseline. | 2026-10-08 | ef4c029d, e6475fe1, 9020c255, 0aa38c9e | [261008-a97-travel-with-leader-moves-to-the-self-men](./quick/261008-a97-travel-with-leader-moves-to-the-self-men/) |
| 261008-ag8 | Enemy spawns scale to their place's level: `enemy_spawn.level` and `combat_enemy.level` (defaulted columns); pure `data/enemy_rules.ts` (`enemyStatsForLevel`, `placeLevelBand`, `placeSpawnLevel`, `effectiveEnemyLevel`, `templateAtLevel`). A type that fits the place keeps its level, otherwise the spawn takes the place target (Mother Pan Undercroft now level 5). Quest and named spawns follow the band (owner: "Quest bosses should be harder!"; extra boss bump is 51.3.1). Old level-0 spawns re-level on arrival. Combat stats, XP, gold, loot gates, renown, server text and the Nearby/Encounter client read the spawn level. Local publish (2 columns, no clear, key 108 kept), bindings regenerated. Full suite green apart from the baseline. | 2026-10-08 | ec27831e, 15d71387, dc29e192, 5c405790 | [261008-ag8-enemy-spawns-scale-to-the-place-level-wh](./quick/261008-ag8-enemy-spawns-scale-to-the-place-level-wh/) |
| (direct) | Owner UI asks: the desktop rail drops the follow summary, `Loot: personal` is gone everywhere (cd94769b); the map arrival banner clears itself after 8 s and has a Dismiss button (aa8e1462). | 2026-10-08 | cd94769b, aa8e1462 | - |
| 261008-c4p | Every party card shows health, mana (only for mana users) and stamina bars: the desktop rail card, the mobile Party sheet card and the mobile combat grid (desktop combat card already did). One rule, `memberBars()` in `src/rails/party.ts`. Each bar is a labelled progressbar with a tooltip; card names carry all three values. Your own sheet card stays bar-less (header strip). Client only. Full suite green apart from the baseline. | 2026-10-08 | b54e4552, 4f59206b, d90ebd6e, b62b1c55, 46e9ae77 | [261008-c4p-every-party-card-shows-health-mana-and-st](./quick/261008-c4p-every-party-card-shows-health-mana-and-st/) |
| 261008-d2k | The party hears when a member logs out ("{name} has logged out."), goes link-dead ("{name} has gone link-dead.") or comes back ("{name} is back."): one group line per real online flip, via `helpers/party_presence.ts`. Logout vs link-dead read from `player.sessionStartedAt` (logout clears it), no schema change. The line lands at release, about 30 s after the click; switching character announces the one left behind. Friend presence lines unchanged. Local publish, key 108 kept, no bindings change. Full suite green apart from the baseline. | 2026-10-08 | 7f84498e, 7298077d, da7a3846, 766b1f69, e32c7f11 | [261008-d2k-party-hears-when-a-member-logs-out-or-goe](./quick/261008-d2k-party-hears-when-a-member-logs-out-or-goe/) |
| 261008-e7t | Tap a party member to target them, in and out of fights: mobile chips (44px, with 3px health/mana/stamina bars), rail member cards and the self block are target buttons; the Party chip still opens the sheet and the ⋯ menu still works. The hotbar sends the selected ally for single-ally abilities out of combat too. Server fix: an out-of-combat ally target must be in your party, online, here and standing (shared rule `data/ally_target_rules.ts`), checked in `use_ability` and again in `tick_casts`; before this any character anywhere could be healed, even from 0 HP. Pet targeting stays in 999.4. Local publish, key 108 kept. Full suite green apart from the baseline. | 2026-10-08 | ee189e96, 77589b8d, b691aebe, a8722ca2, 1fed2765, 4363eab7 | [261008-e7t-tap-a-party-member-to-target-them-everyw](./quick/261008-e7t-tap-a-party-member-to-target-them-everyw/) |
| 261008-f3m | Dropped loot as bracketed item names you click to take: "Loot dropped: [Rusty Dagger], [Wolf Pelt] [Take all]" (rarity tokens), each link calls take_loot for its exact row (loot id carried in the line, never shown), [Take all] calls take_all_loot, taken items read as plain text, and `loot` re-lists untaken drops. Shared grammar `data/loot_line.ts`; private reward rows only. Stopgap until the 51.4 loot rails (owner). Local publish, key 108 kept. Full suite green apart from the baseline. | 2026-10-08 | 6f01d831, 1711a2a9, 1cf5e86d, fcaf3429, 7980f63c, 9a9e8d68, 891eefd6 | [261008-f3m-dropped-loot-shows-as-bracketed-item-nam](./quick/261008-f3m-dropped-loot-shows-as-bracketed-item-nam/) |

## Deferred Items

Items acknowledged and deferred at milestone close on 2026-09-29:

| Category | Item | Status |
|----------|------|--------|
| verification | Phase 999.1 (was 33): 33-VERIFICATION.md | dropped 2026-10-08 (owner removed 999.1) |
| uat | Phase 999.2 (was 34): 34-UAT.md | dropped 2026-10-08 (owner removed 999.2) |
| debug | slam-cooldown-delay-new-warrior | resolved-archived |
| quick_task | Historical quick tasks 1-405 (404 flagged) | legacy format with no status field, not actually open |
| todo | 5 pending todos (2 are LLM milestone seeds) | carried forward |
| requirements | COMB-05, COMB-08, NARR-03, EQUIP-01-05, UX-01-03 | carried with parked Backlog phases 999.1-999.5 |

Items acknowledged and deferred at the v2.2 close on 2026-10-05 (owner chose to move to the UX overhaul):

| Category | Item | Status |
|----------|------|--------|
| verification | Phase 41: 41-VERIFICATION.md (milestones/v2.2-phases) | human_needed |
| verification | Phase 43: 43-VERIFICATION.md, 43-UAT.md 7 pending (milestones/v2.2-phases) | human_needed |
| verification | Phase 44: 44-VERIFICATION.md, 44-UAT.md 5 pending (milestones/v2.2-phases) | human_needed |
| requirements | QUAL-01 (tone sign-off: needs_fixes, 44-TONE-FIXES.md proposal), QUAL-02 (e2e run, Console reconciliation, maincloud) | open |
| user action | Maincloud migration (42-USER-CHECKLIST.md section E, 44-MAINCLOUD-CHECKLIST.md) | pending |

## Deferred Verification

| Phase | State | Resume |
|-------|-------|--------|
| 41 | verification_deferred_human | /gsd-verify-work 41 |
| 43 | verification_deferred_human | /gsd-verify-work 43 |
| 44 | verification_deferred_human | /gsd-verify-work 44 |
| 45 | verification_deferred_human | /gsd-verify-work 45 |
| 46 | verification_deferred_human | /gsd-verify-work 46 |
| 47 | verification_deferred_human | /gsd-verify-work 47 |
| 46.1 | verification_deferred_human | /gsd-verify-work 46.1 |
| 48 | verification_deferred_human | /gsd-verify-work 48 |
| 49 | verification_deferred_human | /gsd-verify-work 49 |
| 50 | verification_deferred_human | /gsd-verify-work 50 |
| 51 | verification_deferred_human | /gsd-verify-work 51 |
| 51.1 | verification_deferred_human | /gsd-verify-work 51.1 |
| 51.3 | verification_deferred_human | /gsd-verify-work 51.3 |
| 51.3.1.1 | verification_deferred_human | /gsd-verify-work 51.3.1.1 |
| 51.3.1.2 | verification_deferred_human | /gsd-verify-work 51.3.1.2 |
| quick 2026-10-08 | passed (owner, 2026-10-08: "all approved.") | `.planning/quick/2026-10-08-UAT.md` |

Phase 41 is code-complete and verified at code level (41-VERIFICATION.md: human_needed, no gaps). The user deferred the live checks on 2026-09-30 ("we can skip the live proof for now") and chose to keep going: the local live proof (41-LOCAL-PROOF.md), the browser network-tab check and the maincloud checklist (41-MAINCLOUD-CHECKLIST.md). Phase 44 live verification picks them up. The key is set locally (length 108, not yet verified by a smoke test).

Phase 42 verification passed on 2026-09-30, after the user resolved every UAT item: 4 passed and 1 skipped. Its maincloud two-publish is deferred to the end of the milestone (see Blockers/Concerns).

Phase 43 is code-complete and verified at code level (43-VERIFICATION.md: human_needed, 5/5 criteria, no gaps). On 2026-10-01 the user chose "Defer all and keep going" for the 7 items in 43-UAT.md: staged region and class reveal live, line rotation, the /llm admin console, WR-A01 money logic, the WR-A04/WR-B01 limits, and maincloud. Phase 44 live verification can pick up items 1 to 4.

Phase 45 is code-complete and verified in code (45-VERIFICATION.md: human_needed, 6/6 criteria, 8/8 requirements, no gaps; code review clean after 3 iterations, CR-01 deferred to the login_email todo). On 2026-10-05 the owner deferred ALL hands-on testing for v3.0 to one end-of-milestone pass; the 7 items are in 45-UAT.md.

Phase 46 is code-complete and verified in code (46-VERIFICATION.md: human_needed, 4/5 must-haves with SEG-05 owner-deferred, 0 gaps; code review clean after 3 iterations, WR-01 wording owner-approved, WR-07 kept strict by owner decision G3). The owner approved the voice package (46-VOICE-CHANGES.md) on 2026-10-05. The 6 deferred items are in 46-UAT.md; items 1, 3, 4 and 6 need paid LLM calls (worst case about $0.62, cap $2.00) and wait for the owner's go-ahead.

Phase 47 is code-complete and verified in code. 47-VERIFICATION.md is human_needed: 5/5 success criteria, 8/8 requirements and 0 gaps. Code review was clean after 3 iterations, with WR-01 to WR-06 fixed. The owner tried the playable exploring UX on 2026-10-05 and approved it, with two follow-ups that are now fixed: dark scrollbars and a full-width desktop feed. The 6 remaining device and visual checks are in 47-UAT.md. A server todo was filed for the public event tables (T-47-04b).

Phase 46.1 (round-based combat) is code-complete and verified in code. 46.1-VERIFICATION.md is human_needed (5/5, 0 gaps). Code review is clean after 2 iterations; CR-01 added the module-identity guard to all 12 previously unguarded scheduled reducers, and WR-01..04 were fixed. It was published locally twice, additive only with no clear, and the stored key length stayed 108. It was built overnight on 2026-10-05/06 under the owner's auto-approve instruction. The 6 deferred items are in 46.1-UAT.md, including the voice addendum review and the stale stun wording.

Phase 48 (combat encounter UI) is code-complete and verified in code. 48-VERIFICATION.md is human_needed (6/6, 0 gaps, 3 behavior-unverified). Code review: WR-01..05 were fixed within the 3-iteration loop. WR-06 was fixed after the loop (d2d74a7b) and has not been re-reviewed. The only server change is the additive my_combat_aggro view, published locally with no clear; key length stays 108. Built overnight on 2026-10-06 under the auto-approve instruction. The deviations for owner review (A1, A4, A5, A8, A26) and the live checks are in 48-UAT.md.

Phase 51.1 (Party) is code-complete and verified in code. 51.1-VERIFICATION.md is human_needed: SC1-SC4 verified, SC5 and SC6 present but behavior-unverified, 141 of 149 truths, 0 gaps. Three review iterations ran (server, client-social, client-rest), and the two review-3 warnings were fixed after the loop. Everything is published locally with no clear and the key stays at 108. The owner approved the first CR-01 sign-in on 2026-10-07. The re-test of the tightened token checks (issuer and audience pinned, email claim only) is deferred: on 2026-10-08 the owner said "Keep going. Im not at my computer, so I'll login test when I am back". It is item 1 in 51.1-UAT.md, with the one-line TOKEN_EMAIL_CHECK rollback. Maincloud blockers: WR-04 (require email_verified?) and IN-01 (production SpacetimeAuth client id in SPACETIMEAUTH_CLIENT_IDS).

Phase 51.3 (Regional Economy) is code-complete and verified in code: 51.3-VERIFICATION.md is human_needed, 17/17 truths, 0 gaps. 13 plans in 7 waves; two review passes (A: 1 Critical, 6 Warning; B: 2 Warning, from the owner's live run) all fixed in 51.3-REVIEW-FIX.md, 9 Info items deferred. The owner approved the region_economy wording as written (pinned by sha256) and set recipe scrolls to 10%. Published locally several times with no clear; key length stays 108. The owner turned the AI economy on locally and ran one live /economy design on Kesterlane Basin (job 8206, about $0.03); its two mismatched crafted outputs were repaired in place (/economy repair). The 5 deferred checks are in 51.3-UAT.md.

## Session Continuity

### Overnight autonomy (2026-10-05, owner)

Owner, going offline: "Just keep going. I'm going to bed. Compact as needed, keep developing. I auto approved any questions with your recommendations". Until the owner returns, every question is answered with Claude's recommended option and logged in the phase CONTEXT or SUMMARY as "auto-approved (owner overnight instruction)". The safety rules still apply: no paid LLM calls (the golden run stays deferred to the end of the milestone), no maincloud publish, no git push and no --clear-database.

### Run order decision (2026-10-05)

The owner chose to run Phase 47 before Phase 46.1, then PAUSE after Phase 47 so the owner can try the playable new UX with an existing character, then continue with 46.1, 48, 49, 50, 51, 52. All other testing stays deferred to the end of the milestone. Roadmap dependencies allow this (47 needs 45 and 46; 46.1 must finish before 48).

Phase 51.3.1.1 (Density Pools) is code-complete and verified in code. 51.3.1.1-VERIFICATION.md is human_needed: SC1-SC7 hold in code and tests, 0 gaps. 32 plans (27 planned, plus 28-30 for family scaling, histories and feuds, 31 for client follow-ups, 32 for live-test fixes), two review rounds (A/B/C then a fix pass; 2 blockers and 13 warnings fixed, then 2 more warnings fixed), five local publishes (A-E), all key-checked and never cleared; the full suite passes apart from the 3 known baseline files. Deferred to the end-of-milestone pass: 51.3.1.1-UAT.md (6 items: the owner's wording review in 51.3.1.1-COPY-REVIEW.md, visual checks, live play, and two paid checks). Three small combat items became todos (perk damage vs enemy shields, dead pet aggro, AI-written enemy fear/hot/buff).

Phase 51.3.1.2 (Bigger Regions) is code-complete and verified in code. 51.3.1.2-VERIFICATION.md is human_needed: 23/23 must-haves (SC1-SC6, D-01..D-19, review-fix logic) hold, 0 gaps. 14 plans plus the D-19 cap change: two-stage generation (places and people, then the new world_gen_families route), 8-10 places by a seeded roll with a floor of 6, hop-gradient levels, deliberate region shape, 3-5 NPCs, medium economy with one late loot job per family past 7, a families-only retry state (FAMILIES_ERROR, [explore] retries only the failed stage), and the crossing hold (D-15..D-18: nobody enters until places and families are in; new characters wait in creation; approved storm lines). All region-creation routes share a generous 20,000-token cap (D-19, owner: no tuning while systems are being built; late family loot jobs 4096). One review round (A pipeline, B hold/tooling): 1 blocker and 11 warnings fixed. Two local publishes, key-checked, never cleared, no schema change; full suite 13,896 passed apart from the 3 baseline files. Pushed to GitHub at the owner's request. Deferred to the end-of-milestone pass: 51.3.1.2-UAT.md (4 items incl. the paid region measurement). Owner deferrals: paid proof and its cost bound wait until all systems exist. New todos: live proof writes to the archived Phase 44 folder; ability vocabulary contract (Whisper Network casts as a damage buff). New backlog: 999.32 Settings menu (narrative pruning, default OFF = show everything).

### Resume note (2026-10-09, after 51.3.1.2)

- **51.3.1.2 is DONE in code** (UAT deferred). **Next: 51.3.2 Combat Wind-Up, Cooldowns and Durations in Rounds** (backlog 999.17): needs the owner for its discuss. Bring to that discuss: the todo `2026-10-09-travel-ability-gives-damage-buff.md` (ability vocabulary contract: same-category fallbacks, nothing on the AI's menu without a working system, contract test, the travel_discount fix) proposed as added scope; 999.4 Ability Expansion stays in the backlog (owner). Also the three combat todos from 51.3.1.1.
- **Practice (owner, 2026-10-09):** run the full suite once after all lanes finish, never alongside them (memory full-suite-after-lanes); no tuning of AI caps/budgets and no paid checks until all systems exist (memory systems-then-ux-then-tuning). Executor rules for 51.3.1.2 are in `scratchpad/p51312/rules.md` (copy and adapt per phase).
- **Owner-approved this session:** 51.3.1.1 COPY-REVIEW (en dash; new Nearby load line), 51.3.1.2 PROMPT-DRAFT with Owner choices.

### Resume note (2026-10-09, overnight; owner asleep: "Keep going. I'm going to bed.")

- **Run:** `/gsd-autonomous` v3.0, explicit run order (owner: systems, then UX, then admin/tuning, then release): 51.3.1.1 Density Pools → 51.3.1.2 Bigger Regions → 51.3.2 → 52.1.1 → 52.1.2 → 52.2 → 52.3 → 52.4 → 51.4 → 51.5 → 52.1 → 51.5.1 → 52.5 Admin and Balance Dials → 53.
- **51.3.1.1 status:** 32 plans. Done: 01-26 and 28-31 (31 includes the live Map rating wiring and the combat-pets query fix). Left: **Plan 32** (live-test fixes: D-73 level-first rating, D-74 quest targets completable plus a 40% pull chance, D-75 the approved NPC no-open-task line, NPC reply cap 1024 plus one retry and one line per family, golden test fixtures), then **Plan 27** (cleanup, D-72 one resource per gather, guards, COPY-REVIEW.md for the owner, local publish C with live checks, VALIDATION). Then code review and fix, verification, the UAT file (deferred to milestone end), and the owner's one wording review (COPY-REVIEW.md, D-58).
- **Executor practice:** rules `scratchpad/p5131/rules.md`, hand-off `scratchpad/p5131/handoff.md`. Lanes run in parallel only when files_modified are disjoint and there is one publisher. Executors run their own tests and vue-tsc; the coordinator runs the full suite with `CI=true` in the snapshot worktree `scratchpad/suitewt`, whose node_modules are JUNCTIONS to the real repo (never delete its contents recursively; remove the junctions with rmdir first before removing the worktree).
- **Deferred items:** `.planning/phases/51.3.1.1-density-pools/deferred-items.md` (rows 1-33).
- **Approvals done:** prompt draft (including Revision 2 and the Feud none variant) APPROVED 2026-10-08; the NPC no-open-task line approved 2026-10-09. The owner's local aiEnabled is ON: no paid calls without the owner.
- **51.3.1.1 is DONE in code** (6b15dbc4; UAT + wording review deferred). **Next: 51.3.1.2 Bigger Regions.** Pre-discuss research is committed (51.3.1.2-RESEARCH.md, Owner Questions Q1-Q10). When the owner is back: run the smart discuss from those questions (Q1-Q6 feed the prompt draft), write CONTEXT, then plan (research exists), get the new prompt wording approved, execute, review, verify.
- **Owner notes this session:** the world will be regenerated from scratch (memory); feuds are a 35% chance; hubs, stations and bind stones per D-59..D-64; the NPC memory graph (999.9) is the real cure for stale NPC memory, not yet scheduled.

### Resume note (2026-10-08, fourth compact)

- **Done since the third compact:**
  - Phase 51.3 Regional Economy: code-complete, 13/13 plans, reviews A+B fixed, VERIFICATION human_needed 17/17, UAT deferred (51.3-UAT.md). Owner ran a live /economy design on Kesterlane Basin ($0.03); AI economy switch is ON locally (owner).
  - Quick tasks: a97, ag8, c4p, d2k, e7t (ally targeting + out-of-combat heal hole closed), f3m (feed loot links, stopgap until 51.4), day/night 40/20, direct UI asks. All 7 quick checks approved by the owner.
  - Roadmap: 51.3.1.1 Density Pools promoted (CONTEXT D-00..D-50, MOCK-BRIEF, Living Places mock imported + MOCK-DIFF resolved); 51.3.1 narrowed to difficulty dials only; 51.5.1 Motion and Polish added; 999.28 cartographer map (+ updated Map mock, switcher, north arrow top-right, YOU pill); 999.29 -> 51.3.1.1; 999.30 warning system; 999.4 now Ability Expansion, Pets and Threat; Phase 53 admin Populations panel (balance dials only, no simulation).
- **Next (updated 2026-10-08 after the compact):** Phase 51.3.1 Combat Dials no longer exists. The owner moved all balance dials to the end ("admin and dials should be last. Systems first, then UX (since UX needs the system in place), then tuning"). Run order now, phase numbers kept, one phase at a time with `/gsd-autonomous --only <N>`: **51.3.1.1 Density Pools → 51.3.1.2 Bigger Regions (8-10 places; owner, inserted 2026-10-08) → 51.3.2 Wind-Up → 52.1.1 Bank → 52.1.2 Trade → 52.2 Social and Guilds → 52.3 Log → 52.4 World Events → 51.4 Loot Rails → 51.5 Character, Level Up and New Skill → 52.1 Hotbar Manager → 51.5.1 Motion and Polish → 52.5 Admin and Balance Dials → 53 Parity and Production**, then the milestone UAT, audit, complete and cleanup. 52.5 holds the combat dials (partial discuss answers in 52.5-DISCUSSION-LOG.md), the Density Pools dials, the quest-boss bonus (owner: wait for this phase) and the admin screens moved from 53. 51.3.1.1 ships fixed numbers in one rules file (CONTEXT D-51..D-53); its prompt rewrite needs owner approval; economy size setting D-50.
- **Executor practice:** one executor per publish; parallel only when files are disjoint and neither publishes. Rules: scratchpad p513/rules.md (51.3.x) and p511/rules.md (quick tasks); hand-off logs beside them. Small owner finds go to todos (owner, memory small-issues-stay-todos).
- **Open owner items:** CR-01 sign-in re-test (51.1-UAT 1); IN-01 closed (verified 2026-10-08: the live GitHub Pages site https://sheibeck.github.io/uwr/ is built with client_id client_032PmGBhDqP6SjkKuAORIQ, the id the server trusts; the Pages deploy workflow was removed 2026-03-09, so master pushes do not currently deploy); paid golden-run items. WR-04 (require `email_verified`) moved to backlog 999.31 (owner, 2026-10-08: "we don't need to verify the email address at this point").

### Resume note (2026-10-08, third compact)

- **Run:** `/gsd-autonomous` for v3.0. Resume with `/gsd-autonomous --from 51.3`, after checking the in-flight items below.
- **Done since the last compact:** Phase 51.1 Party is complete in code: 16 plans, 3 review iterations plus fixes, verification human_needed, UAT deferred.
- **Waiting on the owner:**
  - The CR-01 sign-in **re-test** of the tightened token checks (51.1-UAT item 1).
  - Two maincloud blockers: WR-04 (require `email_verified`?) and IN-01 (the production SpacetimeAuth client id).
- **Run order now (owner, 2026-10-08):**
  1. 51.3 Regional Economy
  2. 51.3.1 Combat Dials
  3. 51.3.2 Combat Wind-Up, Cooldowns and Durations (was 999.17)
  4. 51.4 Loot Rails (+ effect icons and slide-out panel)
  5. 51.5 Character, Level Up and New Skill
  6. 52.1 Hotbar Manager
  7. 52.1.1 Bank
  8. 52.1.2 Trade
  9. 52.2 Social and Guilds
  10. 52.3 Log
  11. 52.4 World Events
  12. 53 Parity and Production (last)
- **In flight at compact time.** Agents may have finished, so check git log and the files.
  - **51.3 planning:**
    - CONTEXT, RESEARCH, PATTERNS and VALIDATION are committed.
    - The planner was writing the 51.3 PLANs plus `51.3-PROMPT-DRAFT.md`.
    - Next: plan-checker → coverage gates → **show the owner the PROMPT-DRAFT for approval** → execute one plan at a time.
    - The plan that writes the prompt is gated on that approval. The route stays off (`aiEnabled` false) until `/economy ai on`.
  - **Quick task 261008-a97:**
    - Scope: Travel with leader moves into the self ⋯/right-click menu, a follow icon goes beside your name, and the party gets a line on each follow toggle.
    - DONE 2026-10-08 (ef4c029d..0aa38c9e); recorded in Quick Tasks Completed, todo moved to completed.
  - **Quick task 261008-ag8:**
    - Scope: enemy spawns scale to the place's level when no enemy type fits.
    - DONE 2026-10-08 (ec27831e..5c405790); recorded in Quick Tasks Completed. The todo stays open for fix (b), world-gen enemy level ranges, in Phase 51.3.1. Owner: "Quest bosses should be harder!" (quest and named spawns stay in the place band; the extra boss bump is 51.3.1).
  - **Queued quick tasks** run after ag8, one at a time, because each publishes locally:
    - **Day/night 40/20:** DONE 2026-10-08 (338df1ed), local publish, key 108 kept. The calendar stays in 999.14.
    - **Party card bars:** DONE 2026-10-08 (quick 261008-c4p).
- **51.3.1 Combat Dials discuss must cover:**
  - difficulty by level, region and enemy type;
  - pull size: multiple enemies per pull, tied to difficulty;
  - ability power dials: per kind at cast time, with a per-ability escape hatch;
  - world-gen enemy types per place level range. This is a prompt change, so the owner approves the wording.
- **Owner decisions today:**
  - 51.3 dials are global, per region, per tier and per item.
  - The 51.3 job uses the "Small" counts.
  - Legendary recipes need 3 foreign regions, which means a 4th recipe slot.
  - Backfill uses `/economy design <region>`.
  - Pets stay dropped (999.27). Mobile shows a pet tag with a paw.
  - Menu icons: ChatCircleDots, Heart, UserPlus.
  - 999.1, 999.2 and 999.5 are removed. 999.17 is promoted to 51.3.2.
- **Servers:** the coordinator started the local SpacetimeDB (127.0.0.1:3000) and Vite (5173) as background tasks in this session. The key is still at length 108.
- **Executor practice:**
  - One plan at a time with gsd-executor, in the main tree. Not in worktrees: they have no node_modules.
  - The rules and hand-off files are in the session scratchpad folder `p511` (`rules.md`, `handoff.md`). Make a new folder per phase, for example `p513`.
  - Run vitest single-worker.
  - Commits end with the Co-Authored-By and Claude-Session lines.
  - The scratchpad is `C:/Users/Dell/AppData/Local/Temp/claude/C--projects-uwr/bc40b66c-7c2b-4e9c-9279-961553578aa3/scratchpad/`. The newest combat design extract is in `design-combat3/` there.

### Resume note (2026-10-07, second compact)

- **Run:** `/gsd-autonomous` for v3.0, owner awake and active. Resume with `/gsd-autonomous --from 51.1`.
  - Done in code (human_needed, UAT deferred to one end-of-milestone pass): 45, 46, 47, 46.1, 48, 49, 50 (incl. the 50-28..50-40 follow-up), **51** (13 plans incl. 51-12 two-dimensional map layout and 51-13 no List view; 51-VERIFICATION 13/14).
  - **v3.0 order now (owner, 2026-10-08, supersedes the line below):** 51.3 Regional Economy → 51.3.1 Combat Dials (difficulty dials only) → 51.3.1.1 Density Pools (was backlog 999.29; owner wants an updated mock first) → 51.3.2 Combat Wind-Up, Cooldowns and Durations (was backlog 999.17) → 51.4 Loot Rails → 51.5 Character, Level Up and New Skill → 51.5.1 Motion and Polish → 52.1 Hotbar Manager → 52.1.1 Bank → 52.1.2 Trade → 52.2 Social and Guilds → 52.3 Log → 52.4 World Events (was 51.6) → 53 Parity and Production (was 52, now last).
  - **Earlier order (owner, 2026-10-07):** 51.1 Party → 51.3 Regional Economy → 51.4 Loot Rails (+ new effect chips) → 51.5 Character, Level Up and New Skill → 51.6 World Events (was 51.2) → 51.7 Log → 52 Parity and Production → 52.1 Bank, Trade and Hotbar Manager → 52.2 Social and Guilds. Then the end-of-milestone UAT and golden run, audit, complete, cleanup. 51.2 is unused.
  - Backlog 999.26 (world structure) is the next milestone.
- **Next step: Phase 51.1 Party** (slimmed: online status with offline members left behind in travel and fights, pets and travel-with-leader in the party block, invite expiry and cancel, role-aware ⋯ and right-click menus, private `user`, CR-01 login fix as its own last plan with an owner sign-in check after the local publish).
  - Exists: `51.1-CONTEXT.md` (pointer + owner decisions), `51.1-RESEARCH.md`, `51.1-PATTERNS.md`, `51.1-VALIDATION.md`, `51.1-UI-SPEC.md` (its Social screen sections now belong to 52.2). No plans yet (the planner was stopped before writing).
  - **Before planning 51.1:** update `51.1-UI-SPEC.md` (gsd-ui-researcher revision + gsd-ui-checker) from the new UWR Combat rails and the Social mock's menu notes, then re-scope the research/validation to Party only, then plan (planner + checker) and execute one plan at a time.
  - Combat rail changes that touch 51.1 (C:\Users\Dell\AppData\Local\Temp\claude\C--projects-uwr\2abada36-596b-490d-914e-a49b8e730067\scratchpad\design-combat2\COMBAT2-DIFF.md): clicking your own block targets yourself (replaces the Phase 48 "You" card); in-combat party cards with health/resource bars and effect chips; follow indicators, stamina warning and switch hidden in combat; XP hidden in combat.
  - Social mock asks of 51.1 (C:\Users\Dell\AppData\Local\Temp\claude\C--projects-uwr\2abada36-596b-490d-914e-a49b8e730067\scratchpad\design-social\SOCIAL-DIFF.md): add a defaulted `lastOnlineAt` with `character.online` (same helper); a three-state status dot (online, busy = in combat, offline); one name component (guild tag later); extensible menu entry groups. Keep the UI-SPEC's ⋯ opener, icons (PhChatCircle, PhUserPlus), inline confirms and disabled-with-reason entries.
- **Open owner calls (ask when the phase comes up):**
  - Pets in combat (Combat mock): pet kind and icon, pet ability and cooldown, click a pet to target it. The server has no pet kind, pets have no abilities, and `use_ability` cannot target a pet; 51.1 UI-SPEC overrides 4-6 dropped these. Build server support, or keep them dropped?
  - Effect chips (Combat mock, Phase 51.4): green buff colour has no token (pin 23); the effects panel wants source, total duration and description that the server does not store; enemies never get buffs.
  - Social mock (52.2): it drops the party from Social ("Your party stays in the left bar") and mobile has no party surface while the Party tab opens Social. Guild scope (found, invite, join requests, 4 ranks with a permission matrix, roster, MOTD, transfer, disband, /g chat) and the guild chat privacy (event tables are public).
  - Character mock (51.5): first-person Keeper quotes in the Level Up mock, 40px/30px numerals and off-scale sizes, the positive-green token; server gaps (class card, achievements content, skill flavor, Keeper's assessment, server firsts, HP/mana preview).
  - Combat outro wording (todo `2026-10-07-combat-outro-tells-how-the-fight-unfolded.md`): offer a draft of the new prompt wording for approval.
  - Copy choices from 51-11/51-12 SUMMARYs (1 stop vs n stops, 160 vs 180px map gap, etc.).
- **Design extracts (fresh 2026-10-07, absolute paths; re-import fresh only if the owner sends a new version):**
  - Character + Level Up: C:\Users\Dell\AppData\Local\Temp\claude\C--projects-uwr\2abada36-596b-490d-914e-a49b8e730067\scratchpad\design-character\ (CHARACTER-EXTRACT.md, CHARACTER-SCOUT.md)
  - Log: C:\Users\Dell\AppData\Local\Temp\claude\C--projects-uwr\2abada36-596b-490d-914e-a49b8e730067\scratchpad\design-log\ (LOG-EXTRACT.md, LOG-SCOUT.md)
  - Combat (rails, effect chips, loot): C:\Users\Dell\AppData\Local\Temp\claude\C--projects-uwr\2abada36-596b-490d-914e-a49b8e730067\scratchpad\design-combat2\ (COMBAT2-EXTRACT.md, COMBAT2-DIFF.md)
  - Social and Guilds: C:\Users\Dell\AppData\Local\Temp\claude\C--projects-uwr\2abada36-596b-490d-914e-a49b8e730067\scratchpad\design-social\ (SOCIAL-EXTRACT.md, SOCIAL-DIFF.md, SOCIAL-SCOUT.md)
  - Phase 51 executor hand-off log and rules: C:\Users\Dell\AppData\Local\Temp\claude\C--projects-uwr\2abada36-596b-490d-914e-a49b8e730067\scratchpad\p51\handoff.md, C:\Users\Dell\AppData\Local\Temp\claude\C--projects-uwr\2abada36-596b-490d-914e-a49b8e730067\scratchpad\p51\rules.md
- **Constraints:** no paid LLM calls without a go-ahead (golden run deferred, about $0.62); no maincloud, no git push, never `--clear-database`; commit with explicit paths; prompt wording changes need the owner's explicit approval; Windows is case-insensitive.
- **Servers:** the owner's local SpacetimeDB (PID 12020, 127.0.0.1:3000) and Vite (port 5173) are running; don't stop either. If Vite serves a stale empty module after an agent edit, `touch` the file (seen once with inventory_rules.ts).
- **Local publish:** `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null`, checking `admin_llm_status` key_length 108 before and after with `grep -qE "true +[|] +108"`.
- **Baseline test failures to ignore:** `scripts/llm/call_log_report.test.mjs`, `scripts/llm/proof_rules.test.mjs`, `spacetimedb/src/helpers/measurement.results.test.ts`. Run vitest from the repo root.
- **Executor practice:** one plan at a time with gsd-executor (sonnet; opus for heavy plans), each prompt pointing at a rules file and a hand-off log; code review per phase (server and client reviewers in parallel), fixers, then gsd-verifier.
- **Open todos (pending):** level up and new skill unwired (51.5), combat outro story, combat mock effect chips (51.4), CR-01 login (51.1), event tables public, renown perks with no effect, typed text reveal, race ability chip, hotbar hover description, combat victory three Keeper lines.

**Resume file:** .planning/phases/51.3.1.1-density-pools/51.3.1.1-UI-SPEC.md

Last session: 2026-10-08T21:04:54.000Z
Stopped at: Phase 51.3.1.1 UI-SPEC approved

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 38 P01 | 15min | 3 tasks | 20 files |
| Phase 38 P02 | 30min | 2 tasks | 1 files |
| Phase 38 P03 | 25min | 3 tasks | 21 files |
| Phase 38 P04 | 10min | 2 tasks | 2 files |
| Phase 38 P05 | 25min | 2 tasks | 5 files |
| Phase 38 P06 | 15min | 3 tasks | 3 files |
| Phase 38 P07 | 15min | 2 tasks | 7 files |
| Phase 38 P08 | 20min | 2 tasks | 0 files |
| Phase 39 P01 | 12min | 3 tasks | 4 files |
| Phase 39 P02 | 25min | 3 tasks | 7 files |
| Phase 39 P03 | 25min | 3 tasks | 10 files |
| Phase 39 P04 | 25min | 3 tasks | 3 files |
| Phase 39 P05 | 20min | 2 tasks | 4 files |
| Phase 39 P06 | 25min | 3 tasks | 2 files |
| Phase 39 P07 | 45min | 2 tasks | 4 files |
| Phase 39 P08 | 30min | 2 tasks | 2 files |
| Phase 39 P11 | 30min | 3 tasks | 10 files |
| Phase 39 P09 | resumed | 3 tasks | 6 files |
| Phase 39 P10 | 20min | 3 tasks | 27 files |
| Phase 40 P01 | 15min | 2 tasks | 4 files |
| Phase 40 P02 | 25min | 3 tasks | 9 files |
| Phase 40 P03 | 30min | 3 tasks | 4 files |
| Phase 40 P04 | 12min | 2 tasks | 4 files |
| Phase 40 P05 | 55min | 3 tasks | 4 files |
| Phase 40 P06 | 15min | 2 tasks | 35 files |
| Phase 40 P07 | 30min | 2 tasks | 7 files |
| Phase 40 P08 | 30min | 2 tasks | 3 files |
| Phase 40 P09 | 35min | 2 tasks | 4 files |
| Phase 40 P10 | 10min | 2 tasks | 0 files |
| Phase 41 P01 | 10min | 3 tasks | 10 files |
| Phase 41 P02 | 15min | 2 tasks | 2 files |
| Phase 41 P03 | 45min | 2 tasks | 9 files |
| Phase 41 P04 | 12min | 3 tasks | 8 files |
| Phase 41 P05 | 20min | 2 tasks | 5 files |
| Phase 41 P06 | 70min | 2 tasks | 5 files |
| Phase 41 P07 | 35min | 2 tasks | 7 files |
| Phase 41 P08 | 25min | 2 tasks | 10 files |
| Phase 41 P09 | 15min | 2 tasks | 4 files |
| Phase 41 P10 | 20min | 2 tasks | 3 files |
| Phase 41 P11 | 12min | 2 tasks | 5 files |
| Phase 41 P12 | 25min | 3 tasks | 13 files |
| Phase 41 P13 | ~25min | 2 tasks | 11 files |
| Phase 41 P14 | 25min | 3 tasks | 17 files |
| Phase 41 P15 | 35min | 2 tasks | 10 files |
| Phase 41 P18 | ~60min | 3 tasks | 32 files |
| Phase 41 P16 | ~10min | 1 of 2 tasks (Task 2 deferred) | 1 files |
| Phase 41 P17 | ~15min | 3 tasks (Task 2 deferred by user) | 2 files |
| Phase 42 P01 | 55min | 3 tasks | 10 files |
| Phase 42 P02 | 40min | 3 tasks | 9 files |
| Phase 42 P03 | 35min | 3 tasks | 12 files |
| Phase 42 P04 | 40min | 3 tasks | 12 files |
| Phase 42 P05 | 25min | 2 tasks | 7 files |
| Phase 42 P06 | 25min | 3 tasks | 15 files |
| Phase 42 P07 | 25min | 3 tasks | 8 files |
| Phase 43 P01 | 15min | 3 tasks | 16 files |
| Phase 43 P02 | 12min | 2 tasks | 2 files |
| Phase 43 P03 | 25min | 2 tasks | 9 files |
| Phase 43 P04 | 40min | 2 tasks | 9 files |
| Phase 43 P05 | 25min | 2 tasks | 10 files |
| Phase 43 P06 | 15min | 3 tasks | 11 files |
| Phase 43 P07 | 14min | 2 tasks | 4 files |
| Phase 43 P08 | 55min | 3 tasks | 7 files |
| Phase 43 P09 | 25min | 2 tasks | 7 files |
| Phase 43 P10 | 30min | 3 tasks | 9 files |
| Phase 43 P11 | 25min | 2 tasks | 4 files |
| Phase 43 P12 | 25min | 3 tasks | 2 files |
| Phase 43 P13 | 55min | 3 tasks | 10 files |
| Phase 43 P14 | ~15min | 2 tasks | 6 files |
| Phase 43 P15 | 35min | 3 tasks | 9 files |
| Phase 44 P01 | resumed | 2 tasks | 5 files |
| Phase 44 P02 | 55min | 2 tasks | 1 files |
| Phase 44 P03 | 40min | 2 tasks | 7 files |
| Phase 44 P04 | 1 session | 3 tasks | 5 files |
| Phase 44 P05 | 55min | 2 tasks | 6 files |
| Phase 44 P06 | 3.5h | 3 tasks | 4 files |
| Phase 44 P07 | about 15 min live work plus owner checkpoint | 3 tasks | 4 files |
| Phase 44 P09 | deferred | 3 tasks | 2 files |
| Phase 44 P08 | 30 min | 2 tasks | 3 files |
| Phase 44 P10 | 2 sessions | 3 tasks | 6 files |
| Phase 45 P01 | 25min | 3 tasks | 30 files |
| Phase 45 P02 | 15min | 3 tasks | 7 files |
| Phase 45 P03 | 20min | 3 tasks | 7 files |
| Phase 45 P04 | 12min | 3 tasks | 8 files |
| Phase 45 P05 | 15min | 3 tasks | 9 files |
| Phase 45 P06 | 15min | 3 tasks | 8 files |
| Phase 45 P07 | 12min | 3 tasks | 9 files |
| Phase 45 P08 | 10min | 2 tasks | 6 files |
| Phase 45 P09 | 25min | 2 tasks | 3 files |
| Phase 45 P10 | 10min | 2 tasks | 4 files |
| Phase 46 P01 | 20min | 3 tasks | 10 files |
| Phase 46 P02 | 35min | 3 tasks | 4 files |
| Phase 46 P03 | 40min | 3 tasks | 7 files |
| Phase 46 P04 | 35min | 2 tasks | 5 files |
| Phase 46 P05 | 25min | 2 tasks | 4 files |
| Phase 46 P06 | 5min | 3 tasks | 1 files |
| Phase 46 P07 | 15min | 2 tasks | 8 files |
| Phase 46 P08 | 25min | 2 tasks | 15 files |
| Phase 46 P09 | 40min | 3 tasks | 18 files |
| Phase 46 P10 | 55min | 2 tasks | 8 files |
| Phase 47 P01 | 25min | 2 tasks | 7 files |
| Phase 47 P02 | 20min | 3 tasks | 9 files |
| Phase 47 P03 | 25min | 4 tasks | 16 files |
| Phase 47 P04 | 20min | 3 tasks | 8 files |
| Phase 47 P05 | 15min | 3 tasks | 8 files |
| Phase 47 P06 | 25min | 3 tasks | 9 files |
| Phase 47 P07 | 40min | 3 tasks | 13 files |
| Phase 47 P08 | 25min | 2 tasks | 8 files |
| Phase 47 P09 | 45min | 3 tasks | 8 files |
| Phase 47 P10 | 30min | 3 tasks | 9 files |
| Phase 47 P11 | 30min | 2 tasks | 7 files |
| Phase 47 P12 | 40min | 4 tasks | 17 files |
| Phase 46.1 P01 | 6min | 2 tasks | 5 files |
| Phase 46.1 P02 | 15min | 2 tasks | 7 files |
| Phase 46.1 P03 | 20min | 2 tasks | 5 files |
| Phase 46.1 P04 | 25min | 2 tasks | 8 files |
| Phase 46.1 P05 | ~1h | 2 tasks | 4 files |
| Phase 46.1 P06 | 25min | 2 tasks | 5 files |
| Phase 46.1 P07 | ~45min | 2 tasks | 3 files |
| Phase 46.1 P08 | 35min | 2 tasks | 14 files |
| Phase 46.1 P09 | 20min | 2 tasks | 11 files |
| Phase 48 P01 | 15min | 2 tasks | 5 files |
| Phase 48 P02 | ~10min | 3 tasks | 12 files |
| Phase 48 P03 | 10min | 3 tasks | 10 files |
| Phase 48 P04 | 10min | 3 tasks | 5 files |
| Phase 48 P05 | 20min | 2 tasks | 9 files |
| Phase 48 P06 | 20min | 2 tasks | 5 files |
| Phase 48 P07 | 25m | 2 tasks | 8 files |
| Phase 48 P08 | 15min | 2 tasks | 6 files |
| Phase 48 P09 | 20min | 2 tasks | 5 files |
| Phase 48 P10 | 10min | 2 tasks | 2 files |
| Phase 48 P11 | 35min | 3 tasks | 11 files |
| Phase 48 P12 | 8min | 3 tasks | 8 files |
| Phase 48 P13 | 25min | 2 tasks | 2 files |
| Phase 48 P14 | 40min | 2 tasks | 2 files |

## Operator Next Steps

- Phase 45 is a UI phase: `/gsd-ui-phase 45` (re-imports the design from the claude_design MCP), then `/gsd-plan-phase 45`
- Phase 46 is backend and independent: `/gsd-plan-phase 46` can run in parallel (owner checkpoints: SEG-03 approvals, SEG-05 golden run and tone sign-off)
