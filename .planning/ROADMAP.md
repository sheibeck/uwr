# Roadmap: UWR

## Milestones

- ✅ **v1.0 MVP** -- Phases 1-23 (shipped 2026-02-25)
- ✅ **v2.0 The Living World** -- Phases 24-30 (shipped 2026-03-09)
- ✅ **v2.1 Project Cleanup** -- Phases 31, 32, 38 (shipped 2026-09-29; 33-37 parked in Backlog)
- ✅ **v2.2 LLM — Claude Engine** -- Phases 39-44 (shipped 2026-10-05; 41, 43, 44 human verification deferred)
- 🚧 **v3.0 UX Overhaul** -- Phases 45-52 (in progress; started 2026-10-05)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-23) -- SHIPPED 2026-02-25</summary>

See `.planning/milestones/v1.0-ROADMAP.md` for full details (if archived).

- Phases 1-23: Character creation, combat, inventory, crafting, quests, NPCs, world events, renown, travel, death/corpse, config tables, auth, subscription optimization

</details>

<details>
<summary>✅ v2.0 The Living World (Phases 24-30) -- SHIPPED 2026-03-09</summary>

- [x] Phase 24: LLM Pipeline Foundation (3/3 plans) -- completed 2026-03-07
- [x] Phase 25: Narrative UI Shell (3/3 plans) -- completed 2026-03-07
- [x] Phase 26: Narrative Character Creation (3/3 plans) -- completed 2026-03-07
- [x] Phase 27: Procedural World Generation (3/3 plans) -- completed 2026-03-07
- [x] Phase 28: Dynamic Skill Generation (3/3 plans) -- completed 2026-03-07
- [x] Phase 29: NPC & Quest Generation (3/3 plans) -- completed 2026-03-07
- [x] Phase 30: Narrative Combat (4/4 plans) -- completed 2026-03-09

See `.planning/milestones/v2.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.1 Project Cleanup (Phases 31, 32, 38) -- SHIPPED 2026-09-29</summary>

- [x] Phase 31: Test Infrastructure (3/3 plans) -- completed 2026-03-09
- [x] Phase 32: Dead Code Removal (3/3 plans) -- completed 2026-03-09
- [x] Phase 38: Platform Upgrade (8/8 plans) -- completed 2026-09-29

Phases 33-37 parked in the Backlog as 999.1-999.5. See `.planning/milestones/v2.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.2 LLM — Claude Engine (Phases 39-44) -- SHIPPED 2026-10-05</summary>

- [x] Phase 39: Procedure-to-Claude Spike (11/11 plans) -- completed 2026-09-29
- [x] Phase 40: Claude Request Layer and Job Seam (10/10 plans) -- completed 2026-09-30
- [x] Phase 41: Executor and Domain Cutover (18/18 plans) -- code complete; human verification deferred
- [x] Phase 42: Client Cutover and Legacy Removal (7/7 plans) -- completed 2026-09-30
- [x] Phase 43: Latency Tuning, Staged Generation and Budget (15/15 plans) -- code complete; human verification deferred
- [x] Phase 44: Live Verification and Tone Eval (10/10 plans) -- QUAL-03 proven; QUAL-01 and QUAL-02 deferred by the owner

Known gaps (QUAL-01, QUAL-02, Phase 41/43 live checks, maincloud) are listed in `.planning/MILESTONES.md`. See `.planning/milestones/v2.2-ROADMAP.md` for full details.

</details>

### 🚧 v3.0 UX Overhaul (In Progress)

**Milestone Goal:** Rebuild the client to the UWR Ledger Screens and Console & Combat designs on the Nocturne design system, at desktop (1280×800) and mobile (390×844), with structured, speaker-attributed Keeper replies. 45 requirements, 8 phases.

**Milestone rules** (apply to every phase below):

- **Fresh client, old one deleted.** Phase 45 deletes the old `src/` UI and builds the new client from scratch at the repo root (Vite + Vue 3) against the existing module and generated bindings. It takes over the old client's dev port (5173), SpacetimeAuth redirect URI, build scripts and deploy path. Nothing keeps the old client running (owner, 2026-10-05: greenfield). The local git tag `v2.2-client` keeps the old code as the parity reference.
- **Design is re-imported every phase.** Each UI phase starts with `/gsd-ui-phase`, which imports the design fresh from the claude_design MCP (project `1a7a975f-7b14-488b-9a38-188bc56294cf`: `UWR Ledger Screens.dc.html`, `UWR Console & Combat.dc.html` Ledger direction 1a/1c only, Nocturne `_ds/…/styles.css` and `_ds_bundle.js`). Never a cached copy.
- **Mobile is in every UI phase.** Each screen works at 390×844 as part of its own phase; there is no trailing mobile phase.
- **Unit tests are required in every phase** (project rule): tests enforce the rules the phase implements.
- **Combat becomes round-based.** Rounds last at most 10 seconds and end early once every player has chosen; a player who has not chosen auto-attacks (owner decision 2026-10-05, Phase 46.1).
- **Server is source of truth.** The new client never duplicates server data or constants; it imports from `spacetimedb/src/data/`. Server changes in this milestone are limited to what a requirement needs (Phase 46, the round-based combat engine in Phase 46.1, and the small additions flagged in Phases 48-51), additive, and tested.
- **Local only.** Publish to the local SpacetimeDB only; no push to master and no maincloud publish without the owner. Avoid `--clear-database` (it wipes the stored Anthropic key).

**Execution order:** Phases 45 and 46 are independent and can run in parallel; 47 needs both. Phase 46.1 (backend) needs 46 and can run alongside 45 and 47; 48 needs 46.1. After 47, phases 48, 49, 50 and 51 do not depend on each other (49 also needs 46). Phase 52 is last.

- [ ] **Phase 45: Foundation, Frame and Auth** - Old UI deleted; fresh client at the repo root with Nocturne tokens, the three-column frame, drawer and sheet shells, mobile tab bar and sign-in
- [ ] **Phase 46: Structured Keeper Replies** - Speaker-attributed narration and dialogue segments from every narrative LLM route, in the second-person narrator voice, with owner tone sign-off
- [ ] **Phase 46.1: Round-Based Combat Engine** (INSERTED) - 10-second rounds that end early once every player has chosen, auto-attack when no action is chosen, Keeper narration at big moments and the end of the fight
- [ ] **Phase 47: Console, Rails, Hotbar and Input** - Labelled feed with keywords, vitals and context rails, hotbar, LLM progress lines, and the command-word input fix
- [ ] **Phase 48: Combat Encounter** - The right rail becomes the encounter: targeting, threat order, enemy wind-up warnings, round timer on the hotbar, round-grouped combat feed
- [ ] **Phase 49: Character Creation Interview** - Keeper interview in the feed (race, archetype, class, then the name last) with a step indicator, race suggestion cards and a live character sheet
- [ ] **Phase 50: Ledger Screens: Character and Economy** - Inventory, stats, vendor and crafting as drawers and sheets
- [ ] **Phase 51: Ledger Screens: World and People** - Map and travel, group and social, and world events as drawers and sheets
- [ ] **Phase 52: Parity and Production** - Parity checklist against the `v2.2-client` tag (including undesigned surfaces), and production serves the new client

## Phase Details

### Phase 45: Foundation, Frame and Auth

**Goal**: The old UI is gone, and a player can sign in to the fresh client and see the Nocturne frame: header, persistent vitals rail, feed and context rail on desktop; compact vitals strip, feed and tab bar on mobile; secondary screens open as drawers or sheets.
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, FND-07, CUT-03
**Success Criteria** (what must be TRUE):

  1. The old `src/` UI (components, composables, entry point, styles and their tests) is deleted after tagging it `v2.2-client`. The player runs the new client with `pnpm dev` on port 5173, signs in with SpacetimeAuth (existing redirect URI), sees their character connected through the existing module and generated bindings, reconnects after a reload or dropped connection, and logs out.
  2. At 1280×800 the player sees the header (location, time of day, level-up and new-skill tags, screen buttons), a vitals rail that stays put, the center feed and the context rail.
  3. Clicking a screen button opens a drawer over the center and right columns while the header and vitals rail stay visible; Esc or the close button dismisses it.
  4. At 390×844 the player sees a compact vitals strip, the story feed and a bottom tab bar (Story, Map, Bag, Party, More); a secondary screen opens as a full-height sheet above the tab bar.
  5. Buttons, tabs, inputs and panels show Nocturne hover, pressed and keyboard focus-visible states with Inter and Phosphor icons; no component hard-codes a color (a test fails if one does), and rarity and enemy-difficulty colors keep their current hues.
  6. The splash / sign-in screen shows the 16:9 key-art logo large and undistorted, scaled to fit the viewport at 1280×800 and 390×844, with no pixelated rendering.

**Plans**: 11/11 plans executed

Plans:
**Wave 1**

- [x] 45-01-PLAN.md — Cutover: tag `v2.2-client`, toolchain and config (port 5173 strict, `@game-data` alias), vendored Nocturne, seven screen shells, old UI deleted, new entry point and guards

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 45-02-PLAN.md — Client tokens, frame overrides and static design-contract guards (no literal colors, pinned hues, type/spacing scale, Phosphor and Inter only)
- [x] 45-03-PLAN.md — Auth fixes (expired token, URL cleanup) and the connection controller (backoff 1-30 s, rejected token, resume on online/visible)
- [x] 45-04-PLAN.md — bindTable (rows survive reconnect), deriveScreen, version rule and frame-view projections
- [x] 45-05-PLAN.md — Screen state, breakpoint, focus trap, Drawer, Sheet and More sheet
- [x] 45-06-PLAN.md — Vitals rail, mobile vitals strip, context rail and feed shells
- [x] 45-07-PLAN.md — Header with account menu, tab bar and mapping, location row, Reconnecting and version notice bars

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 45-08-PLAN.md — Splash with the 16:9 logo and seven states, character picker, no-characters note
- [x] 45-09-PLAN.md — Session: login_email, set_active_character, logout, subscriptions, derived screen and frame view
- [x] 45-10-PLAN.md — AppFrame composition (desktop and mobile at 900px), drawer/sheet integration and static frame contract

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 45-11-PLAN.md — App screen switch, phase gate (suite vs baseline, build, dev server) and owner UAT in real Chrome

**UI hint**: yes
**Design source**: Re-import via `/gsd-ui-phase` from the claude_design MCP (never cached): Nocturne tokens and components, and the frame shown in Ledger 2i/2j and Console & Combat 1a, desktop and mobile.
**Notes**:

  - The rails and feed are shells here; Phase 47 fills them. The header and the auth flow carry real data.
  - Build in place: the root project (package.json, vite.config.ts, index.html, `src/`) becomes the new client. Keep `src/module_bindings` (regenerated by the root `spacetime:generate`); remove dependencies only the old UI used (for example `html2canvas`).
  - Non-UI modules worth keeping (SpacetimeAuth PKCE flow, connection logging, legacy-credential clear, app-version check) may be carried over with their tests; everything else is rebuilt. Read old code from the `v2.2-client` tag.
  - Character creation arrives in Phase 49; until then a new player is told to wait, and existing local characters are used for testing.
  - SpacetimeAuth needs the new client's dev origin registered as a redirect URI (owner action if it is not already allowed); Phase 52 repeats this for the production origin.
  - Tests: layout and breakpoint behavior, drawer and sheet open/close (Esc, close button), auth token and reconnect handling, and a guard that fails on hard-coded colors.

### Phase 46: Structured Keeper Replies

**Goal**: Every narrative LLM reply arrives as speaker-attributed segments in the Keeper's second-person scene-narrator voice and is stored with its event, so any client can render labelled lines.
**Depends on**: Nothing (backend only; independent of Phase 45 and can run in parallel with it)
**Requirements**: SEG-01, SEG-02, SEG-03, SEG-04, SEG-05
**Success Criteria** (what must be TRUE):

  1. NPC chat, world and scene narration, combat outro and creation replies come back as segments shaped `{kind: narration|dialogue, speaker, text}`, and NPC speech appears only in dialogue segments.
  2. Segments are stored with the event: talking to an NPC yields a "The Keeper" narration line and a separate "The Ferryman says, “…”" dialogue line in the event data a client reads.
  3. A malformed reply (bad JSON, unknown kind, missing speaker, empty text) is stored as a single Keeper narration line and never breaks the feed; the offline failure drills cover it.
  4. The Keeper narrates what happens around the player in the second person, as in the Ledger console mock, and the owner approved every Keeper Bible and route-block change before it landed.
  5. A golden run in the narrator voice passes its mechanical rules and the owner signs off on the tone (QUAL-01 carry-over).

**Plans**: 10/10 plans executed

Plans:
**Wave 1**

- [x] 46-01-PLAN.md — Segment contract (segments.ts), KeeperSegment column on three event tables, event helpers, local publish and bindings

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 46-02-PLAN.md — Apply layer: NPC replies as segments, Keeper narration segments on creation, arrival, skill, renown and fallback rows

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 46-03-PLAN.md — Segment-aware combat narration, SEG-04 malformed-reply matrix and invariant, failure-drill segment checks

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 46-04-PLAN.md — Golden rules for the segment shape (missing_segments, segments_invalid, keeper_first_person, allowed speakers)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 46-05-PLAN.md — Golden harness: labelled-line review page, Phase 46 record paths, Phase 44 replay guard, dry run

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 46-06-PLAN.md — Voice package 46-VOICE-CHANGES.md and the blocking owner approval (SEG-03, OQ1-OQ7)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 46-07-PLAN.md — Approved Keeper Bible and non-combat route blocks, NPC reply shape with segments

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 46-08-PLAN.md — Combat narration JSON route (COMBAT_NARRATION_SCHEMA) with its approved block, OQ7 allow-list

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 46-09-PLAN.md — Approved fixed Keeper strings, fallback wording, segment formatting rules, OQ2

**Wave 10** *(blocked on Wave 9 completion)*

- [x] 46-10-PLAN.md — OQ3 (44 Fix 2) decision, phase gate, code-only local publish, deferred owner verification list

**Notes**:

  - Owner checkpoints: (a) SEG-03, explicit approval of each Keeper Bible and route-block edit before it is applied; (b) SEG-05, the paid golden run is run only with the owner's go-ahead on cost, and the tone sign-off is the owner's call (no `approvedBy` unless the owner approves in chat).
  - Inputs: `.planning/phases/44-live-verification-and-tone-eval/44-TONE-FIXES.md` ("Open question for the UX overhaul") and the Phase 44 golden harness. The Keeper is a second-person scene narrator; the earlier first-person direction was retracted by the owner (see REQUIREMENTS.md Out of Scope).
  - Phases 47 and 49 depend on the segment contract (SEG-01, SEG-02, SEG-04), not on the SEG-05 sign-off, so the tone checkpoint does not block UI work. The labelled-line rendering of segments is verified in the new client in Phase 47 (CON-01).
  - Schema changes must be additive with defaults so the local publish needs no `--clear-database`.
  - Tests: segment schema validation and clamping, malformed-reply fallback for every route, NPC speech only in dialogue segments, stored-event shape, characterization suites from Phases 40-42 still green.

### Phase 46.1: Round-Based Combat Engine (INSERTED)

**Goal**: Combat resolves in rounds of at most 10 seconds, giving players time to read the narration. A round ends early once every player in the fight has chosen an action, and a player who has not chosen auto-attacks.
**Depends on**: Phase 46 (narration is stored as speaker segments). Backend only; can run alongside Phase 45 and Phase 47.
**Requirements**: RND-01, RND-02, RND-03, RND-04, RND-05
**Success Criteria** (what must be TRUE):

  1. A round lasts at most 10 seconds and resolves as soon as every player in the fight has chosen an action; a solo player who acts at once does not wait out the timer.
  2. A player who has not chosen an action when the round resolves auto-attacks their current target.
  3. Player and enemy actions resolve in a deterministic order each round; cooldowns, effects, DoTs/HoTs and enemy abilities count in rounds, and an enemy wind-up announced in one round lands in a later round.
  4. The round number, its deadline and each player's chosen action are in public tables the client can subscribe to (generated bindings updated).
  5. The Keeper narrates big moments (a kill, a near-death, a boss phase change) and the end of the fight as speaker segments, within the per-encounter narration budget; there is no fixed every-N-rounds summary.

**Plans**: 9/9 plans executed

Plans:
**Wave 1**

- [x] 46.1-01-PLAN.md — Pure round rules (seconds to rounds, cooldown meaning, wind-up length, ordering, auto-attack target) and the big-moment detector with the 3-per-fight cap; 10-second timer
- [x] 46.1-02-PLAN.md — Additive schema: defaulted round columns on five tables, private combat_moment table, recorder default flag, insert source scan
- [x] 46.1-03-PLAN.md — Narration: moment summary and enqueue, outro final round, moment per-call text, 46.1-VOICE-ADDENDUM.md

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 46.1-04-PLAN.md — Round state service (rounds, ticks, choices, round cooldowns and their conversion) and effect, stun and perk durations in rounds

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 46.1-05-PLAN.md — Engine core: round 1 at combat start, resolveRound, guarded tick reducer, per-second loop retired, rounds-not-wall-clock invariant test

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 46.1-06-PLAN.md — Choices: use_ability in combat, submit_combat_action, early resolution, flee as a choice, target validation, joiners, casts

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 46.1-07-PLAN.md — Enemy wind-ups and cooldowns in rounds, pets and adds per round, resolve_pull guard, static no-wall-clock guard

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 46.1-08-PLAN.md — Big-moment wiring in resolveRound and removal of the dead real-time code

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 46.1-09-PLAN.md — Local publish with --break-clients (no clear, key checked), bindings regeneration, client safety, phase gate, Phase 48 contract, deferred owner checklist

**Notes**:

  - This reverses the v2.0 "real-time combat" decision. The v2.0 round experiment (Phase 30, commits `8a94bf47`, `74137f46`) used fixed 30-second rounds and was reverted in quick-348 as sluggish; early resolution and the 10-second cap address that. Check those commits for reusable code.
  - The combat_loop / round_timer_tick schedulers and the legacy round constants in `combat_constants.ts` are the starting point; remove real-time-only code that becomes dead.
  - Keep schema changes additive where possible: a `--clear-database` publish wipes the stored Anthropic key, so ask the owner first if one is needed.
  - Tests: early resolution when all players have chosen, timeout resolution, auto-attack fallback, round-based cooldown and effect counting, deterministic action order, big-moment narration triggers and the budget cap.

### Phase 47: Console, Rails, Hotbar and Input

**Goal**: A player explores the world through the new client: they read a labelled feed, act on keywords and rails, use the hotbar, and type natural sentences without command words hijacking them.
**Depends on**: Phase 45 (frame), Phase 46 (segments)
**Requirements**: CON-01, CON-02, CON-03, CON-04, CON-05, CON-06, INP-01, INP-02
**Success Criteria** (what must be TRUE):

  1. The feed shows each entry as a labelled line by kind (Keeper narration, NPC speech, whisper, party chat, system, quest update, world event), an NPC reply appears as separate narration and dialogue lines, and NPCs, places and objects show as soft accent keywords that hail, examine or travel when clicked. While an LLM job runs the Keeper's progress lines appear, and staged reveals (world, class) land in the feed.
  2. The vitals rail shows HP, MP, SP and XP bars, active effects with time remaining, and party members with health and an Invite button; the context rail shows routes out (level ranges or "safe"), Nearby (NPCs, objects, resource nodes, players) with one-click actions, tracked quests with progress, and the active world event with its faction split.
  3. The hotbar shows iconed ability slots with cooldowns, and the player can switch between their hotbars.
  4. Typing a natural sentence that starts with a command word ("Who is that over there?", "Leave him alone", "End this now", "Accept my apology") reaches the conversation or intent path, while exact forms (`who`, `/who`, `invite <name>`) still run the command.
  5. At 390×844 the feed, keywords, hotbar and input are usable, and the vitals, routes, Nearby, quests and active event are reachable from the compact strip and tab bar.

**Plans**: 12/12 plans executed

Plans:
**Wave 1**

- [x] 47-01-PLAN.md — Input routing: command words run only in exact form (routeInput matrix), conversation words, input history
- [x] 47-02-PLAN.md — Feed text: line classification by kind, server markup cleaning, whisper/chat/NPC parsers, keyword matcher
- [x] 47-03-PLAN.md — Rail and hotbar derivations: effects, XP, party, quests, route levels, Nearby, world event card, hotbar slots and cooldowns
- [x] 47-04-PLAN.md — Console state: ported indicator selection and queue gate, narrative queue, info formatters, capped feed store
- [x] 47-05-PLAN.md — Subscription primitives: event-table binding, keyed swap-on-applied bindings, server clock, filtered queries

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 47-06-PLAN.md — Game data hub with every filtered subscription; GAME/FRAME/CONSOLE injection contracts; session, App and AppFrame wiring

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 47-07-PLAN.md — Feed rendering: labelled lines, keyword buttons, pinning and New lines pill, Keeper progress line, three line-hue tokens
- [x] 47-08-PLAN.md — Vitals rail and mobile strip: XP, effect chips, party block with Invite, leader crown, chip row

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 47-09-PLAN.md — Console controller and composer: routing to reducers, echoes, narrative queue, conversation mode, keyword and rail actions, automatic look
- [x] 47-10-PLAN.md — Context rail: Here card with routes, Nearby actions, tracked quests, world event card with objective progress

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 47-11-PLAN.md — Hotbar: ten iconed slots, cooldown sweeps, number keys, hotbar switching

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 47-12-PLAN.md — Mobile reach (Map and Social sheets), keyboard-open compaction, populated integration test, full gate, owner try-out checklist (deferred)

**UI hint**: yes
**Design source**: Re-import via `/gsd-ui-phase` from the claude_design MCP (never cached): Ledger 2i/2j and Console & Combat 1a (exploring), desktop and mobile.
**Notes**:

  - INP-01/02 promote backlog 999.7. Command words to cover in both sentence and exact form: who, accept, decline, leave, invite, kick, promote, whisper, w, friend, endcombat, end, endc, group, renown, factions, faction, events. The old routing in `src/App.vue` at tag `v2.2-client` (`onNarrativeSubmit`, `clientHandledCommands`) is reference for behavior, not code to port.
  - CON-06 consumes the Phase 43 indicator lines and the world and class staged-reveal steps; those server flows already exist.
  - Tests: command-word routing matrix (sentence form vs exact form for every word), segment-to-line rendering by kind, keyword click actions, hotbar switching and cooldown display, rail data derivation.

### Phase 48: Combat Encounter

**Goal**: Round-based combat plays out in the new client: the right rail becomes the encounter, the round timer sits on the hotbar, and the feed groups events by round.
**Depends on**: Phase 46.1 (round engine), Phase 47
**Requirements**: CMB-01, CMB-02, CMB-03, CMB-04, CMB-05, CMB-06
**Success Criteria** (what must be TRUE):

  1. When combat starts the header shows "In combat" and the context rail becomes the encounter: hostiles with health, a boss tag and difficulty color; clicking a hostile targets it and Tab cycles targets.
  2. The player sees the threat order on the current target and an enemy wind-up warning before the ability lands.
  3. The combat feed groups events by round, each under a round header; effects and cooldowns show rounds remaining.
  4. The player can click party members to target heals, Flee is on the hotbar, and damage taken flashes on the vitals.
  5. At 390×844 the encounter, targeting, hotbar and Flee are usable, and the combat feed stays readable.
  6. The round timer counts down on the hotbar, the player sees the action they have chosen for this round, and with no choice the hotbar shows that they will auto-attack.

**Plans**: 14/14 plans executed

Plans:
**Wave 1**

- [x] 48-01-PLAN.md — my_combat_aggro per-sender view with a no-scan test; local publish with --break-clients (no clear, key checked); bindings regeneration

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 48-02-PLAN.md — Pure encounter modules: difficulty, wind-up copy, hostile rows, threat rows, Tab cycling, ally-target rule

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 48-03-PLAN.md — Pure round modules: round clock, choice chip and round controls, amount emphasis, rounds cooldowns, damage flash composable

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 48-04-PLAN.md — Data layer: combat queries, CombatData on GameData with inert defaults, combat reducers, keyed combat bindings with the narrative linger

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 48-05-PLAN.md — Combat controller (targets, Tab and Esc keys, ally selection, round clock), 'encounter' screen value and combat screen lock, AppFrame provide

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 48-06-PLAN.md — Feed store round headers and wind-up entries with boundary ordering; round and wind-up line kinds and the late-narration tag

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 48-07-PLAN.md — Combat feed wiring from rows to the store; FeedLine and FeedView rendering (round dividers, wind-up block, tag, amount emphasis)

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 48-08-PLAN.md — Desktop Encounter panel (hostile cards, threat block) and the context rail swap

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 48-09-PLAN.md — Round row above the hotbar (chip, timer, Ready, Flee) and the combat input placeholder

**Wave 10** *(blocked on Wave 9 completion)*

- [x] 48-10-PLAN.md — Hotbar in combat: rounds cooldowns, inert while resolving or down, chosen slot, ally target argument

**Wave 11** *(blocked on Wave 10 completion)*

- [x] 48-11-PLAN.md — Header In combat tag and locked screen buttons, party ally targeting, vitals-rail damage flash

**Wave 12** *(blocked on Wave 11 completion)*

- [x] 48-12-PLAN.md — Mobile combat: encounter strip, encounter sheet with round meta, Log out from the strip, hidden tab bar and location row

**Wave 13** *(blocked on Wave 12 completion)*

- [x] 48-13-PLAN.md — Mobile vitals strip in combat: In combat tag, ally chips, damage flash

**Wave 14** *(blocked on Wave 13 completion)*

- [x] 48-14-PLAN.md — Populated combat frame test at both widths, phase gate, validation map, deferred owner checklist

**UI hint**: yes
**Design source**: Re-import via `/gsd-ui-phase` from the claude_design MCP (never cached): Console & Combat 1a/1c (Ledger direction) and Ledger 2i/2j in combat, desktop and mobile.
**Notes**:

  - The engine changes in Phase 46.1; this phase is the client presentation of rounds.
  - Server gap to scope in plan-phase: `aggro_entry` is a private table today and is not in the generated bindings, so CMB-02 needs a small additive exposure (for example a public view for the player's own combat). `combat_enemy_cast` is already public.
  - Enemy DoT/HoT/debuff indicators (999.1) and the enemy cast bar todos stay deferred.
  - Tests: target selection and Tab cycling, threat-order ordering, wind-up warning timing, round grouping boundaries, round timer and auto-attack display, rounds-remaining formatting, the aggro exposure's visibility rules.

### Phase 49: Character Creation Interview

**Goal**: A new player is led through character creation as a Keeper interview in the feed (race, archetype, class, then the name last), with a live character sheet that fills in as they choose.
**Depends on**: Phase 46 (Keeper lines are segments), Phase 47 (feed and input)
**Requirements**: CRE-01, CRE-02, CRE-03
**Success Criteria** (what must be TRUE):

  1. A player with no character starts a Keeper interview in the feed, with each Keeper line labelled and a step indicator showing where they are; the steps run race, archetype (Warrior/Mystic), class reveal, name, then entering the realm, so the name is asked last.
  2. The Keeper offers 3 race suggestions as clickable cards with stat tags; the player can click a card, type any race, or choose "Surprise me" and let the Keeper pick.
  3. A live character sheet on the right fills in as the player chooses (race, archetype, class, stats with bonuses and racial trait first, and the name last, shown as an unnamed placeholder until then), the staged class reveal lands in the interview, and after the name the player enters the realm with their new character.
  4. At 390×844 the interview is usable and the character sheet is reachable alongside it.

**Plans**: 10 plans

Plans:
**Wave 1**

- [ ] 49-01-PLAN.md — Shared race-bonus helper (data/race_bonuses.ts); finalize adds the race bonus (F1 fixed); both level-up sites keep it (D1); real-handler tests
- [ ] 49-03-PLAN.md — Pure step derivation and per-step controls; button words pinned against the server's matching rules
- [ ] 49-05-PLAN.md — Creation line classifier and feed store; held private rows so the finalize starter tips survive (O3)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 49-02-PLAN.md — Full module suite, local publish with --break-clients (key length 108 before and after), bindings regeneration with no diff
- [ ] 49-04-PLAN.md — Race cards (newest 3, stat tags), ability cards, live sheet model on the shared helper
- [ ] 49-06-PLAN.md — Session-ownable creation hub: filtered subscriptions, start once per mount, send with echo, retry, defensive hand-off

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 49-07-PLAN.md — StepBar, ChoiceBlock and CreationComposer components
- [ ] 49-08-PLAN.md — CreationFeed and CreationSheet components

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 49-09-PLAN.md — CreationView composition, desktop and 390x844 behavior

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 49-10-PLAN.md — deriveScreen 'creation', session-owned hub, App wiring, note removed; phase gate and deferred owner checklist
**UI hint**: yes
**Design source**: Re-import via `/gsd-ui-phase` from the claude_design MCP (never cached): the character creation screen in `UWR Ledger Screens.dc.html`, desktop and mobile.
**Notes**:

  - Deviations from mock 2a (owner decisions, 2026-10-05): (1) the player chooses the name last (race, archetype, class reveal, name, enter the realm; the archetype step stays before the class), not first as the mock shows; (2) the mock's "First words" step is dropped entirely, because the game has no such concept. The UI-SPEC, the step indicator and the live sheet follow this order, not the mock's. The server already asks for the name after the class (`AWAITING_NAME` follows `CLASS_REVEALED`) and has no first-words step, so the order needs no new server step.
  - Server gap to scope in discuss/plan: the creation state machine has no suggestion step today (`AWAITING_RACE` takes free text). CRE-03 needs a suggestions source (generated through the creation route, or drawn from stored `race_definition` rows) and a "Surprise me" path. Any Keeper Bible or route-block change follows the SEG-03 owner-approval rule.
  - Races stay freeform; there is no fixed browsable race list (Out of Scope).
  - Tests: step order and indicator mapping for every creation step (name asked last), card, typed and surprise-me paths, live sheet derivation per step (name placeholder until the last step), go-back behavior, error and retry steps (CLASS_FILL_ERROR).

### Phase 50: Ledger Screens: Character and Economy

**Goal**: Players manage their gear, read their character's numbers, trade with vendors and craft through Ledger drawers on desktop and sheets on mobile.
**Depends on**: Phase 45 (drawer and sheet shells), Phase 47 (Nearby actions open the vendor)
**Requirements**: LDG-01, LDG-02, LDG-03, LDG-08, LDG-09, LDG-10, LDG-11
**Success Criteria** (what must be TRUE):

  1. Inventory shows equipment slots and the backpack side by side with filters (All, Gear, Materials, Food), slot count and gold; selecting an item opens an inspector with rarity, tier, stats compared with what is equipped (▲/▼), flavor text, sell value and Equip / Salvage.
  2. Stats shows base stats as bars with the gear bonus, a derived-stats table, renown rank with a perk choice, and faction standing.
  3. Vendor shows the vendor's name, role, faction, quote and rapport modifiers, a for-sale table with a "usable by you" filter and Buy, and the player's sellables with value, Sell, Sell all junk and buy back of the last sale; quest items are marked unsellable.
  4. Crafting shows materials on hand and a recipe list with category tabs, an "only craftable" filter and have-versus-need per recipe; the selected recipe shows quality odds, an optional reagent / affix and Craft, and Discover recipes is reachable from the screen.
  5. At 390×844 each screen opens as a full-height sheet above the tab bar (Bag opens inventory) and every action above works.

**Plans**: 27 plans (23 planned + 4 gap-closure after owner live-play feedback)

Plans:
**Wave 1**

- [x] 50-01-PLAN.md — Shared per-instance item stat sum (examine uses it, parity with getEquippedBonuses) and backpack capacity rule
- [x] 50-02-PLAN.md — Crafting quality helpers and pure planCraft; craft_recipe validates before it mutates (real-handler tests)
- [x] 50-03-PLAN.md — Perk bonus lookup and perk display names; factionTier shared by Stats and /faction
- [x] 50-06-PLAN.md — Private vendor_buyback table and the per-sender my_vendor_buyback view

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 50-04-PLAN.md — Shared equip rule (canEquipItem) and item rules (quest marker, use keys, salvage); equip_item and use_item call them

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 50-05-PLAN.md — Shared vendor pricing and rapport; buy_item, sell_item and sell_all_junk call it (differential tests)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 50-07-PLAN.md — Shared sell helper: quest-item refusal, affix snapshot and buy-back record on sell_item and typed sell; sell N and sell junk skip quest items

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 50-08-PLAN.md — buyback_last_sale reducer (owner rules) and delete_character cleanup

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 50-09-PLAN.md — Full module suite, local publish with --break-clients (key length 108 before and after), bindings regenerated (buy-back only)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 50-10-PLAN.md — Session-owned LedgerData hub, typed filtered queries, action runner
- [x] 50-11-PLAN.md — Item model, comparison and backpack models; @game-data alias pins

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 50-12-PLAN.md — Session and App wiring; FrameControls.screenArgs and the per-screen header meta slot
- [x] 50-13-PLAN.md — Shared parts: GoldAmount, FilterChips, SegTabs, InlineConfirm, ItemTile, NoticeLine

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 50-14-PLAN.md — Inventory inspector model and component (comparison, actions, salvage confirmation)
- [x] 50-16-PLAN.md — Stats model, percent formatter and perk chooser
- [x] 50-18-PLAN.md — Nearby Trade opens the vendor by NPC; vendor model (prices, usable-by-you, sell rows, junk preview, buy-back state)
- [x] 50-21-PLAN.md — Crafting model (have/need, filters, single quality and hint, planCraft reasons) and reagent picker

**Wave 10** *(blocked on Wave 9 completion)*

- [x] 50-15-PLAN.md — Inventory screen (desktop and 390x844)
- [x] 50-17-PLAN.md — Stats screen (desktop and 390x844)
- [x] 50-19-PLAN.md — Vendor sell side: Your backpack, Sell all junk, Just sold card with Buy back
- [x] 50-22-PLAN.md — Crafting screen (desktop and 390x844)

**Wave 11** *(blocked on Wave 10 completion)*

- [x] 50-20-PLAN.md — Trade screen: vendor selection, band and rapport, For sale, mobile tabs

**Wave 12** *(blocked on Wave 11 completion)*

- [x] 50-23-PLAN.md — Register the four screens (Trade title, meta), delete placeholders, phase gate, validation map, owner try-out list and deferred UAT checklist

**Gap closure (owner live-play feedback, 2026-10-06)**

- [x] 50-24-PLAN.md — Area-appropriate vendor base stock with a guarded restock scheduler; buy_item and sell_all_junk require a vendor at the location
- [x] 50-25-PLAN.md — Rule-based recipe generation from carried materials (Discover recipes), shared and deduplicated
- [x] 50-26-PLAN.md — Finite vendor stock (quantity column), buy-above-sell price floor, sell_item_quantity (server, published locally)
- [x] 50-27-PLAN.md — Client: quantity "×n", sold out, sell quantity picker
**UI hint**: yes
**Design source**: Re-import via `/gsd-ui-phase` from the claude_design MCP (never cached): the inventory, stats, vendor and crafting screens in `UWR Ledger Screens.dc.html`, desktop and mobile.
**Notes**:

  - Server gap to scope in plan-phase: no buy-back reducer or last-sale state exists today (LDG-09). `salvage_item`, `sell_all_junk` and `research_recipes` already exist. Confirm the data sources for rapport modifiers and crafting quality odds during research.
  - The LLM "Keeper's assessment" on Stats is deferred (LDG-F1).
  - Tests: item comparison (▲/▼) math, filter and slot-count logic, unsellable quest items, buy-back state, recipe have-versus-need and craftable filter, usable-by-you filter.

### Phase 51: Ledger Screens: World and People

**Goal**: Players see and travel the world, play with other people, and follow world events through Ledger drawers on desktop and sheets on mobile.
**Depends on**: Phase 45 (drawer and sheet shells), Phase 47 (context rail tracking)
**Requirements**: LDG-04, LDG-05, LDG-06, LDG-07, LDG-12, LDG-13, LDG-14
**Success Criteria** (what must be TRUE):

  1. Map shows the known locations of a region as a route graph with a legend (here, visited, heard of, bind point) and a region list with level ranges; picking a node shows its description, danger, travel cost, services, players there and related quests, with Travel and Travel with party.
  2. Social shows a party table (class, where, health) with invite, leave, kick and promote, a loot-mode control, and accept / decline for pending invites; it also shows group chat, friends with online status and location, a who's-online count, and pending friend requests to accept.
  3. World events lists active, upcoming and recently resolved events with region and timers; the detail shows the description, the faction tug-of-war, objectives with progress across the realm and a timeline of the World events the event caused.
  4. The event detail shows the player's contribution and percentile, the party's contribution and reward tiers, with Travel there and Track in the sidebar (the tracked event appears in the context rail).
  5. At 390×844 Map, Party and World events open as full-height sheets above the tab bar (via the Map, Party and More tabs) and every action above works.

**Plans**: TBD
**UI hint**: yes
**Design source**: Re-import via `/gsd-ui-phase` from the claude_design MCP (never cached): the map/travel, group and social, and world events screens in `UWR Ledger Screens.dc.html`, desktop and mobile.
**Notes**:
  - **Pulled in from the backlog (owner decision 2026-10-06):**
    - **999.22, party and player context menus** (design `UWR Party.dc.html`, re-imported fresh). Build the menus on party members and players together with the Social screen, sharing one set of action helpers. The player-trade parts of that file go to Phase 52.
    - **999.20, Examine (eyeball) button** on things in the right-hand rail. Phase 51 already works in the context rail.

  - Server gaps to scope in plan-phase: the `group` table has no loot mode (LDG-06); there is no dedicated "travel with party" reducer (`move_character` moves the party when the leader travels), so the Travel versus Travel with party semantics for grouped players need a decision; confirm the data for "upcoming" events and the World event timeline. The percentile can be derived client-side from the public `event_contribution` rows.
  - Tests: route graph and legend states from location data, travel cost and party-travel rules, party actions by role (leader vs member), loot-mode control, friend and invite lists, event timers and sections, contribution percentile math.

### Phase 52: Parity and Production

**Goal**: The new client does everything the old client did and is what production serves.
**Depends on**: Phases 45-51
**Requirements**: CUT-01, CUT-02
**Success Criteria** (what must be TRUE):

  1. A written parity checklist lists every action the old client (tag `v2.2-client`) offered, and every row is done in the new client at desktop and 390×844, including the surfaces not in the design: bank, loot, player trade, help, bug report and the /llm admin commands, built from Nocturne components.
  2. The production build and the GitHub Pages deploy configuration serve the new client; this is verified locally by building and previewing the production output (the push to master stays an owner action).
  3. Nothing in the repo references the old UI, and the build and the full test suite pass.

**Plans**: TBD
**UI hint**: yes
**Design source**: The Nocturne bundle is re-imported fresh via `/gsd-ui-phase`. **Loot now has a mock:** owner decision 2026-10-06, "build the designed loot rails in Phase 52". The combat loot rails follow `UWR Combat.dc.html`, re-imported fresh from the claude_design MCP (project id `1a7a975f-7b14-488b-9a38-188bc56294cf`) together with the Nocturne `_ds` files and `support.js`. See backlog 999.23, which is pulled into this phase. **Bank now has a mock too:** owner decision 2026-10-06, build the designed bank in Phase 52. The bank and vault screen follows `UWR Bank.dc.html`, re-imported fresh. See backlog 999.25, which is pulled into this phase. **Admin screens now have a mock:** the owner sent `UWR Admin Screens.dc.html` on 2026-10-06 ("admin screen mocks"). The `/llm` admin surface, and any other admin screens the file draws, follow it, re-imported fresh from the claude_design MCP (project id `1a7a975f-7b14-488b-9a38-188bc56294cf`) together with the Nocturne `_ds` files and `support.js`. Admin screens stay gated to admins, and the server stays the only authority (`requireAdmin`). If the file draws admin surfaces beyond today's `/llm` admin, Phase 52 planning lists them and asks the owner which are in scope. **Trade now has a mock:** owner decision 2026-10-06, build the designed trade in Phase 52. The player trade window, and its "Trade" entry on a player or party member, follow the trade parts of `UWR Party.dc.html`, re-imported fresh. The rest of that file (the party and player context menus, backlog 999.22) is built in Phase 51. The remaining undesigned surfaces (help, bug report) have no mock, so the UI-SPEC composes them from Nocturne components and the patterns set in Phases 45-51.
**Notes**:
  - **Pulled in from the backlog (owner decision 2026-10-06).** These cover parity with the old client and are built from the owner's designs, each re-imported fresh:
    - **999.18, Hotbar Manager** (`UWR Hotbar Manager.dc.html`). The new client cannot assign abilities to slots or create, switch or swap hotbars today. The reducers `set_hotbar_slot`, `create_hotbar`, `switch_hotbar`, `swap_hotbar_slots` and `delete_hotbar` exist, but no client code calls them.
    - **999.16, Journal** (`UWR Journal.dc.html`, including the revised quest details from the main screen):
      - The quest log, with track and untrack in the rail, abandon with confirmation and the reputation note, grouped by region.
      - The 30-active cap. This is a server change; it touches the `MAX_ACTIVE_QUESTS` offer path, and any prompt change needs owner approval.
      - The visible turn-in action (todo `2026-10-06-quest-turn-in-affordance-in-new-client.md`).
  - **Already in Phase 52 from the backlog:** 999.23 loot rails, 999.25 bank, the admin screens (`UWR Admin Screens`) and player trade (from `UWR Party`).
  - **Size:** with these additions Phase 52 is large. At plan time, split it with `/gsd-phase --insert`, for example designed screens versus parity checklist and production deploy, rather than trimming scope.

  - Seed the parity checklist at the start of the phase from an audit of the `v2.2-client` tag: the old client's panels, modals, composables and command handlers (for example BankPanel, LootPanel, TradePanel, BugReportModal, CraftingModal, TrackPanel, RacialProfilePanel) and its reducer calls. Earlier phases may append the actions they cover.
  - Deploy: `.github/workflows` holds only `claude.yml` and `claude-code-review.yml`, so find how master builds and publishes to GitHub Pages before changing it. The root build scripts already belong to the new client (Phase 45). The SpacetimeAuth redirect URI for the production origin must be registered (owner action).
  - No push to master and no maincloud publish without the owner. The maincloud run, live end-to-end verification and Console reconciliation stay owner manual items (QUAL-02).
  - If this phase proves too heavy at plan time, split it with `/gsd-phase --insert` (undesigned surfaces versus production deploy) rather than trimming the parity checklist.
  - Tests: parity checklist completeness check, admin gating for /llm commands, bank, loot and trade flows, and a repo guard that fails if anything references the removed old UI.

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-23 | v1.0 | All | Complete | 2026-02-25 |
| 24-30 | v2.0 | 22/22 | Complete | 2026-03-09 |
| 31, 32, 38 | v2.1 | 14/14 | Complete | 2026-09-29 |
| 39-44 | v2.2 | 71/71 | Shipped (3 phases human verification deferred) | 2026-10-05 |
| 45. Foundation, Frame and Auth | v3.0 | 11/11 | In Progress|  |
| 46. Structured Keeper Replies | v3.0 | 10/10 | In Progress|  |
| 46.1. Round-Based Combat Engine | v3.0 | 9/9 | In Progress|  |
| 47. Console, Rails, Hotbar and Input | v3.0 | 12/12 | In Progress|  |
| 48. Combat Encounter | v3.0 | 14/14 | In Progress|  |
| 49. Character Creation Interview | v3.0 | 0/TBD | Not started | - |
| 50. Ledger Screens: Character and Economy | v3.0 | 0/TBD | Not started | - |
| 51. Ledger Screens: World and People | v3.0 | 0/TBD | Not started | - |
| 52. Parity and Production | v3.0 | 0/TBD | Not started | - |

## Backlog

### Phase 999.1: Combat Improvements (BACKLOG)

**Parked:** 2026-09-29 from v2.1 Phase 33 — on hold while core project concepts are re-imagined. Artifacts kept in `.planning/phases/999.1-*/` (files retain their original `33-` prefixes).
**State when parked:** all 5 plans' code landed; 33-03 (enemy HUD effect tags, commit 4dacfd1b) has no SUMMARY; 33-VERIFICATION.md is `human_needed` and predates gap plans 33-04/33-05 — needs 33-03 reconcile + re-verification

**Goal**: Players see complete, informative combat feedback and encounter balanced difficulty
**Originally depended on**: Phase 31 (combat tests enable safe rebalancing), Phase 32 (clean codebase) (backlog items are unsequenced)
**Requirements**: COMB-01, COMB-02, COMB-03, COMB-04, COMB-05, COMB-06, COMB-07
**Success Criteria** (what must be TRUE):

  1. Player sees per-tick damage/healing entries in the combat log with effect name and amount for every DoT and HoT
  2. Player sees buff/debuff application and expiration entries in the combat log with stat, magnitude, and duration
  3. Enemy HUD shows active DoT, HoT, and debuff icons with remaining duration countdown
  4. Player can engage multiple enemy groups simultaneously without combat state corruption
  5. Damage and healing constants are tuned and validated by passing test assertions

**Plans**: 5 plans

Plans:

- [ ] 33-01-PLAN.md -- Combat log narrative messages, buff/debuff lifecycle events, balance tuning
- [ ] 33-02-PLAN.md -- Multi-enemy pull fixes, remove puller role restriction
- [ ] 33-03-PLAN.md -- Enemy HUD effect indicators with color coding and duration countdown
- [ ] 33-04-PLAN.md -- Gap closure: fix CREATION_ABILITY_SCHEMA field mismatch (effect -> kind)
- [ ] 33-05-PLAN.md -- Gap closure: enable mid-combat pull via narrative enemy clicks

Promote with /gsd-review-backlog when ready.

### Phase 999.2: Narrative UI Integration (BACKLOG)

**Parked:** 2026-09-29 from v2.1 Phase 34 — on hold while core project concepts are re-imagined. Artifacts kept in `.planning/phases/999.2-*/` (files retain their original `34-` prefixes).
**State when parked:** 34-01 and 34-02 summarized; 34-03 code landed (commits 0e809ea4, dcbaad24, e041231a, d29430ba, eb05ef49) without a SUMMARY; no CONTEXT.md; 34-UAT.md never run — needs 34-03 reconcile + verification

**Goal**: Players can sell items, manage multiple named hotbars, and use abilities outside combat entirely through the narrative console with styled event feedback
**Originally depended on**: Phase 32 (dead code removed, shared helpers exist) (backlog items are unsequenced)
**Requirements**: NARR-01, NARR-02, NARR-03, NARR-04, NARR-05
**Success Criteria** (what must be TRUE):

  1. Player can type `sell <item>` and the item is sold with correct gold calculation including perk bonuses
  2. Player can type `sell all junk` or `sell 3 <item>` for bulk sales with a summary of what was sold
  3. Hotbar is visible at all times (not just combat) showing ability slots with cooldown timers
  4. Player can create multiple named hotbars, switch between them with arrows, and manage slots via commands
  5. Event feed entries are color-coded by kind (combat=red, reward=gold, system=gray, social=blue)

**Plans**: 3 plans

Plans:

- [ ] 34-01-PLAN.md -- Fix sell perk bonus, add sell all junk and sell N commands, complete event colors
- [ ] 34-02-PLAN.md -- Hotbar schema (Hotbar parent table), server reducers, intent commands
- [ ] 34-03-PLAN.md -- Persistent hotbar UI, multi-hotbar navigation, remove bottom action bar

Promote with /gsd-review-backlog when ready.

### Phase 999.3: Dynamic Equipment Generation (BACKLOG)

**Status:** Folded into 999.12 (Gear power budget and generated items) on 2026-10-06. Its goal and success criteria are delivered there, and 999.12 carries its requirement IDs EQUIP-01 to EQUIP-05. This entry is kept for history; promote 999.12, not this item.

**Parked:** 2026-09-29 from v2.1 Phase 35 — on hold while core project concepts are re-imagined. Artifacts kept in `.planning/phases/999.3-*/` (files retain their original `35-` prefixes).
**State when parked:** not started (no context, research or plans)

**Goal**: Equipment drops are unique, level-appropriate, and dynamically generated -- no more selecting from a static pool
**Originally depended on**: Phase 32 (mechanical vocabulary extracted), Phase 33 (combat math stabilized) (backlog items are unsequenced)
**Requirements**: EQUIP-01, EQUIP-02, EQUIP-03, EQUIP-04, EQUIP-05
**Success Criteria** (what must be TRUE):

  1. Defeating an enemy drops equipment with stats scaled to enemy level and world tier
  2. Generated equipment stats (AC, damage, bonuses) are computed from formulas, not looked up from hardcoded tables
  3. Quest reward equipment is dynamically generated matching the quest difficulty tier
  4. The static WORLD_DROP_GEAR_DEFS constant is gone, replaced by a generation function
  5. Generated equipment names use the existing prefix/suffix affix system

**Overlap (2026-10-06):** 999.12 covers criteria 1, 2, 3 and 5 and goes further. Criterion 4 is already met: `WORLD_DROP_GEAR_DEFS` no longer exists in the code.

**Plans**: TBD

Plans:

- [ ] 35-01: TBD
- [ ] 35-02: TBD

Promote with /gsd-review-backlog when ready.

### Phase 999.4: Ability Expansion (BACKLOG)

**Parked:** 2026-09-29 from v2.1 Phase 36 — on hold while core project concepts are re-imagined. Artifacts kept in `.planning/phases/999.4-*/` (files retain their original `36-` prefixes).
**State when parked:** all 5 plans executed and summarized; never verified (stopped at the 36-05 human-verify checkpoint); renown-perk flow depends on working LLM calls

**Goal**: The ability system covers all game systems with diverse ability types, pure buffs/debuffs, functional race abilities, per-level heritage bonuses, and renown perks unified into the dynamic ability system
**Originally depended on**: Phase 32 (mechanical vocabulary complete), Phase 33 (combat dispatch stable) (backlog items are unsequenced)
**Requirements**: ABIL-01, ABIL-02, ABIL-03, ABIL-04, ABIL-05, ABIL-06, ABIL-07, ABIL-08, ABIL-09, ABIL-10, ABIL-11
**Success Criteria** (what must be TRUE):

  1. mechanical_vocabulary.ts includes ability kinds for combat, crafting, gathering, travel, social, songs, auras, pets, fear, and summoning
  2. Server dispatch handles all new ability kinds without hardcoded special cases
  3. Pure buff abilities (stat boosts, haste) and pure debuff abilities (slow, fear) work without damage components and are castable outside combat
  4. Race abilities are functional in-game (minor passive/active effects, not just narrative text)
  5. Heritage bonuses apply every level and are shown during character creation and level-up
  6. Renown perks use the dynamic ability system with LLM-driven selection at rank-up
  7. Abilities track source (Class, Renown, Race) for display and filtering
  8. Client ability dispatch renders and activates all new ability kinds without hardcoded special cases

**Plans**: 5 plans

Plans:

- [ ] 36-01-PLAN.md -- Vocabulary expansion (new ABILITY_KINDS), schema (source/abilityKey columns), BASE_BUDGET entries
- [ ] 36-02-PLAN.md -- Heritage bonus every-level fix, race ability data definitions
- [ ] 36-03-PLAN.md -- Server dispatch for all new kinds, pure buff/debuff fix, LLM skill gen expansion, race ability granting
- [ ] 36-04-PLAN.md -- Renown perks as dynamic abilities, PendingRenownPerk table, LLM perk generation flow
- [ ] 36-05-PLAN.md -- Client-side renown perk choice UI (header notification, perk selection in console)

Promote with /gsd-review-backlog when ready.

### Phase 999.5: UX Polish (BACKLOG)

**Parked:** 2026-09-29 from v2.1 Phase 37 — on hold while core project concepts are re-imagined. Artifacts kept in `.planning/phases/999.5-*/` (files retain their original `37-` prefixes).
**State when parked:** not started (no context, research or plans)

**Goal**: Players can customize text size for comfortable reading across all UI elements
**Originally depended on**: Nothing (independent of other phases) (backlog items are unsequenced)
**Requirements**: UX-01, UX-02, UX-03, COMB-08
**Success Criteria** (what must be TRUE):

  1. Player can increase and decrease the global font size of the entire application
  2. Font size preference persists across browser sessions via localStorage
  3. Group info panel text is sized for readability at all font scale settings

**Plans**: TBD

Plans:

- [ ] 37-01: TBD

Promote with /gsd-review-backlog when ready.

### Phase 999.6: Complete UX Overhaul — UWR Ledger Screens design (BACKLOG)

**Status:** Promoted to v3.0 (Phases 45-52) on 2026-10-05. Delivered by the v3.0 requirements FND, CON, CMB, CRE, LDG, SEG and CUT (see `.planning/REQUIREMENTS.md`).

**Goal:** Rebuild the client UX to match the "UWR Ledger Screens" design, which uses the Nocturne design system. This is a complete UX overhaul. Captured 2026-09-29.

**Source design (import via the claude_design MCP):**

- MCP endpoint: `https://api.anthropic.com/v1/design/mcp`. Authenticate with `/design-login`.
- Project: https://claude.ai/design/p/1a7a975f-7b14-488b-9a38-188bc56294cf?file=UWR+Ledger+Screens.dc.html (the whole project is readable).
- Focus file and implementation target: `UWR Ledger Screens.dc.html`.
- Files the selection imports, which must also be read:
  - `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/_ds_bundle.js`
  - `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/styles.css`
  - `support.js`
- Design updated by the owner on 2026-10-05 (same project, same files). Re-import from the MCP when this is promoted; never work from a cached copy.

**Notes:**

- Response shape is decided here (owner, 2026-10-05). The Phase 44 tone review deferred reply-shape choices to this overhaul: speaker attribution, splitting narration from dialogue, and what highlighting and journals need. Inputs and affected routes and schemas are in `.planning/phases/44-live-verification-and-tone-eval/44-TONE-FIXES.md` ("Open question for the UX overhaul"). The Keeper's voice target is story-like prose in the first person ("I"), with speech attributed in the text. **Update (2026-10-05):** the owner retracted the first-person direction; the Keeper is a second-person scene narrator (v3.0 SEG-03).
- It overlaps parked 999.2 (Narrative UI Integration) and 999.5 (UX Polish, including UX-01–03 and COMB-08). Reconcile or supersede those when this is promoted.
- It is unsequenced relative to the v2.2 LLM milestone. Phase 43 adds staged reveals and Keeper progress lines to the console, so check for UI conflicts if both are active.

**Requirements:** v3.0 FND, CON, CMB, CRE, LDG, SEG, CUT (see `.planning/REQUIREMENTS.md`)
**Plans:** tracked under v3.0 Phases 45-52

### Phase 999.7: Natural-language input is hijacked by bare command words (BACKLOG)

**Status:** Promoted to v3.0 (INP-01/02, Phase 47) on 2026-10-05.

**Goal:** Typing a sentence that starts with a command word reaches the conversation or intent handler, not the command system.

- Example: in an NPC conversation, "Who is that over there?" does nothing, because the first word `who` routes the whole line to the `who` command.
- **Cause:** `onNarrativeSubmit` in `src/App.vue` (about lines 1181-1188) sends any input whose first word is in `clientHandledCommands` to `submitCommand()`. The list is `who`, `accept`, `decline`, `leave`, `invite`, `kick`, `promote`, `whisper`, `w`, `friend`, `endcombat`, `end`, `endc`, `group`, `renown`, `factions`, `faction` and `events`. So "Leave him alone", "End this now", "Accept my apology" and "Group up behind me" are all swallowed too.
- **Fix directions:**
  - Require the `/` prefix for these commands.
  - Or treat a bare word as a command only when the whole input matches the command's exact syntax, such as `who` alone or `invite <name>`.
  - Or always route to the conversation while the player is talking to an NPC.
  - Also check `useCommands.ts` (`/who` or `who`), and check that `NarrativeInput.vue` command hints stay consistent.
- Add tests: every listed word at the start of a natural sentence goes to the intent/conversation path, and the exact command forms still work.
- Captured 2026-09-30 by user report. It may fold into 999.5 (UX Polish) or 999.6 (UX Overhaul).

**Requirements:** v3.0 INP-01, INP-02
**Plans:** tracked under v3.0 Phase 47

### Phase 999.8: Learned intent graph for natural-language input (BACKLOG)

**Goal:** `submit_intent` maps natural phrasing to a known game intent through a phrase-to-intent graph stored in SpacetimeDB tables. The graph learns as players play, so a phrase is resolved once and then mapped from the tables, with no LLM call and no token cost. Captured 2026-10-06 (owner idea, refined in discussion).

**Today:** `submit_intent` (`spacetimedb/src/reducers/intent.ts`, about 1,700 lines) is a chain of exact-match and regex checks. Anything it does not recognize ends at the sardonic fallback ("…means nothing here"). The client router (`src/input/routeInput.ts`, Phase 47) already keeps command words in natural sentences off the command path; this item is about what the server does with those sentences.

**Design (from discussion):**

- **No graph engine.** SpacetimeDB has no native graph features. Model the graph as node and edge tables with btree indexes, as `location` and `location_connection` already do. Indexed lookups are in memory and take microseconds. The speed gain comes from skipping the LLM, not from the graph shape. Graphify is a dev-time CLI over repo files and cannot run inside a reducer.
- **Intent registry first.** Refactor the if-chain into a declarative registry: each intent with its verbs, aliases, argument shape and handler. These are the intent nodes. Bootstrap words come from the existing command words and aliases (mechanical rules, not seeded content).
- **Layer 1, phrase cache (exact):** `intent_phrase { id, pattern, context, intent, hits }`, index on `[pattern, context]`. Normalize before lookup: lowercase, strip punctuation, drop filler ("i want to", "please", "let's"), and replace names of things around the character with placeholders, so "ask Borin about the mine" becomes `ask {npc} about {topic}`. One pattern covers every NPC, place and item.
- **Layer 2, word-to-intent weights (fuzzy):** `intent_token { token, intent, weight }`, index on `token`. On a cache miss, look up each word, add up the weights per intent, and take the best intent if it clears a threshold. Deterministic and token-free.
- **`context`** is `explore` or `combat`, because the same phrase can mean different things in each.

**Learning without the LLM:**

1. **Player confirmation (primary).** On a miss, the Keeper offers in-character choices from the closest matches and what is around the character ("Did you mean: travel to Ashford, talk to Borin, look at the mine?"). The click writes the pattern and strengthens its word weights.
2. **Next-action signal (secondary, lower weight).** A miss followed within a few seconds by a successful command links the phrase to that command.
3. **Optional LLM fallback.** At most one call per new pattern, with the answer kept permanently. It can be left out entirely.

Write a mapping only when it is confirmed, never for every typed line, or the graph fills with chatter and typos.

**Guardrails:**

- **Never during NPC conversation.** While the "Talking with …" lock is on (client side, `src/console/useConsole.ts` `conversation`), free text goes to `talk_to_npc` and never reaches `submit_intent`. Keep it that way, and do not add graph lookups to the in-conversation break-outs.
- **Tighten `isGameAction`** (`src/input/conversation.ts`). Today any line starting with `buy`, `sell`, `craft`, `attack`, `fight` or `kill` leaves the conversation, so "sell me your finest blade?" said to a vendor runs a sell command. Match exact command forms, as `routeExactCommand` does.
- **Exact commands always win.** Learned mappings never override `look`, `sell`, `attack` or the other registry commands.
- **Private tables.** Reducers read them; clients never subscribe.
- **One global graph, with gradual promotion.** The graph is shared by all players (owner). Guardrail (approved by owner): a newly learned mapping applies at once for the player who confirmed it and becomes global after 3 different players confirm it, which limits bad or deliberately misleading mappings.

**Order of checks in `submit_intent` (outside conversation):** exact command forms → phrase cache → word weights → name match against what is around the character → player-confirm prompt (optional LLM) → sardonic fallback.

**Decisions (2026-10-06, open-question review):**

- The intent graph is **global** (shared by all players), with the gradual-promotion guardrail above.
- The server does **not** need to know about the conversation lock.
- On a miss, the Keeper shows **the closest intent match** ("Did you mean: travel to Ashford?"), not a list of choices.

**Open questions:**

- When the player answers "no" to the closest match, does the Keeper offer the next match, or fall back to the sardonic line?

**Requirements:** TBD (unit tests required: normalization and placeholders, cache hit and miss, weight scoring and threshold, the conversation lock skipping the lookup, exact commands outranking learned mappings, promotion threshold)
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.9: NPC memory graph (BACKLOG)

**Goal:** NPCs are living entities that remember. Memory is stored by the game in SpacetimeDB tables, not held in LLM output: what happened (written by game events) and who the NPC is (backstory, opinions and relationships uncovered in conversation and kept as canon). NPCs remember other players, not just the one talking. Recall is index lookups, so it costs no tokens. Captured 2026-10-06 (owner idea, refined in discussion). Shares the node-and-edge table pattern with 999.8.

**Today:**

- `npc_memory` (`spacetimedb/src/schema/tables.ts`) is one `memoryJson` blob per character and NPC: `topics`, `secretsShared`, `questsCompleted`, `giftsGiven` and `lastConversationSummary`, each capped at 10. The LLM writes most of it (`memoryUpdate` and `internalThought`, applied in `helpers/llm_apply.ts` `applyNpcConversationResult`). An NPC knows only the player currently talking to it.
- **Leaks to fix whatever happens:** `npc_memory` is `public: true`, so every client can read every NPC's memory of every player, including `secretsShared`. `npc.personalityJson.secrets` (written at world gen, `helpers/world_gen.ts`) sits in the public `npc` table.

**Kind 1: what happened (game-written, decays).**

```ts
npc_memory_event {
  id, npcId, subjectKind /* 'character' | 'npc' | 'world' */, subjectId?, kind, refId?,
  toLocationId? /* direction, for sightings (999.10) */, salience, tier /* 'short' | 'long' */,
  count, createdAt, lastSeenAt, expiresAt?
}
// indexes: [npcId, subjectKind, subjectId], [npcId, tier], expiresAt
```

- The subject is generalized beyond characters so NPCs can remember other NPCs (999.10 sightings). NPCs never record sightings of players' movements (owner decision, 2026-10-06).

- Kinds: `met`, `talked`, `gift`, `quest_given`, `quest_completed`, `quest_abandoned`, `fought_nearby`, `died_nearby`, `helped`, `insulted`, `secret_shared`.
- Written by the reducers that already handle the event (`talk_to_npc`, quest accept and `turn_in_quest`, `give_gift_to_npc`, combat at the NPC's location). Exact and token-free. The LLM may suggest at most a tag from a fixed vocabulary, which the server validates.
- **Short-term memory is a small, fast-lookup buffer per NPC** (owner decision): when it reaches its size limit, the oldest short-term memories move to long-term instead of being dropped. There is no time-based expiry. Long-term salience fades over time, and each NPC keeps its top N, so the table stays bounded.

**Kind 2: who the NPC is (LLM-revealed, permanent canon).**

```ts
npc_fact {
  id, npcId, kind /* backstory | opinion | relationship | secret | rumor */,
  aboutKind /* self | npc | faction | location | region | item */, aboutId?,
  text, stance? /* -100..100 */, revealTier, importance,
  discoveredByCharacterId, createdAt, lastReferencedAt
}
// indexes: npcId, [aboutKind, aboutId]
npc_fact_known { factId, characterId }   // who has heard it (doubles as a player journal)
```

- An NPC's past does not exist until a player uncovers it, the same principle as the world map.
- The `[aboutKind, aboutId]` index answers the reverse questions ("who has an opinion about the Tidewardens?", "who knows about Mira?"), which is what connects NPCs to each other and to factions.
- **Conversation flow:**
  1. Recall by index, no LLM. Rank facts about entities the player just named (999.8's name matching), then facts about the current location, faction and quests, then facts the player already knows, then one or two facts unlocked by affinity that the player has not heard.
  2. The prompt gets them as canon it must not contradict, plus permission to reveal one fact.
  3. The reply schema gains `newFacts`, with zero or one entry: `{kind, about, text, stance}`.
  4. Before saving: `about` must name a real database entity (as speaker names are checked today), text length is capped, duplicates are dropped, and per-NPC and per-player creation caps apply. Then save it and mark it heard.
- **Uses:** quest generation reads facts as hooks. World events about a faction find every NPC with an opinion of it. A relationship fact writes a matching edge on the other NPC's side (they can confirm or dispute it). Important facts can spread to nearby NPCs as lower-importance rumors.

**Rule: memory shapes speech, game state decides outcomes.** Mechanics read the real tables, never memory. For example, an exclusive quest (new `quest_template.exclusive` flag) is unavailable while `quest_instance.by_template` shows an active holder. Memory only shapes how the NPC explains it ("I already sent Aria after the bell"). A forgotten memory cannot break rules, and the LLM cannot hand out a taken quest.

**Guardrails:**

- Facts the LLM invents never describe players. What an NPC knows about a player comes only from game-written event memories (stops harassment such as "tell everyone Kael is a thief").
- One new fact per reply, plus rate limits, so leading questions cannot reshape an NPC.
- All memory and fact tables private. Move `personalityJson.secrets` into private `npc_fact` rows gated by `revealTier`.
- No new LLM calls: new facts ride on the conversation call already being made.

**Migration:** retire the `memoryJson` blob and `lastConversationSummary`. The `npc_dialog` transcript stays as a display log. Local `--clear-database` is acceptable (greenfield rule).

**Decisions (2026-10-06, open-question review):**

- **NPCs never name other players.** They say "another traveler" or similar.
- **Short-term memory** is a size-limited fast-lookup buffer; overflow moves the oldest memories to long-term (section "Kind 1" above).
- **NPCs know only one or two important rumors** (see 999.10).

**Open questions:**

- Size of the short-term buffer per NPC, the long-term cap, and the long-term fade rate.
- Cap on non-rumor facts per NPC (backstory, opinions, relationships).
- Do rumors spread to other NPCs at all, now that rumors are rare and tied to quests?

**Requirements:** TBD (unit tests required: event memory writes per event kind, short-to-long promotion and expiry, decay, per-NPC cap, recall ranking, the `about` name check, fact caps and reveal-tier gating, mirrored relationship edges, no LLM facts about players, exclusive-quest check, tables private)
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.10: Wandering NPCs, sightings and rumors (BACKLOG)

**Goal:** Some NPCs wander their region and other NPCs notice them, so "Have you seen Rob?" gets a real answer. NPCs who keep rumors seed exploration: places, treasure, people, creatures, factions, races and crafts that a player earns through the relationship and then chases. Every discovery grows the world and is announced as a World event. NPCs give directions like a real person: bearings plus landmarks. Captured 2026-10-06 (owner idea, refined in discussion). **Depends on 999.9** (event memories and `npc_fact`) and uses 999.8's name matching for "Have you seen <name>?".

**Today:** NPCs never move (`npc.locationId` is set at world gen and not updated). `location_connection` has only `fromLocationId` and `toLocationId`, with no bearing. Existing pieces to reuse: the day/night tick, deterministic seeds (`helpers/search.ts`, `helpers/llm_retry.ts`), `performPassiveSearch`, the world-fill pipeline (`startWorldFill`), the world-generation announcement lines in `helpers/world_gen.ts` and `renown_server_first`. The client already ends the "Talking with" lock when the NPC leaves (`src/console/useConsole.ts`, `npcsHere` watcher).

**1. Wandering:**

- New `npc` columns: `homeLocationId`, `wanderStyle`:
  - `anchored`: never moves. Forced in code for service NPC types (vendor, banker, crafting); generation cannot override it. `ensureRegionServices` keeps a start location's vendor and banker, and anchoring keeps them there.
  - `roamer`: moves along `location_connection` but **stays within its own zone** (owner decision), and moves **at most about once per in-game day** (about once per real hour with the 999.14 calendar).
  - `commuter`: moves between a day spot and a night spot on the day/night tick (built together with wandering, owner decision).
- A scheduled `npc_wander_tick` decides moves with deterministic seeds (NPC id and timestamp), never `Math.random`.
- An NPC does not leave while a player has talked to it in the last few minutes.
- The location feed announces arrivals and departures ("Rob the Miner arrives from Copperhollow.").
- A wandering NPC who is the turn-in target of an active quest is part of the game; the quest log shows their last known location.

**2. Sightings (observant NPCs):**

- Each move writes `saw_arrive` and `saw_leave` event memories (999.9, `subjectKind: 'npc'`, `toLocationId`) for NPCs at the locations being left and entered.
- `perception` (0-100) per NPC, set at generation. A deterministic roll against it decides whether the sighting is recorded. Low perception may record a vague sighting ("someone passed through, heading out of town") with no name.
- Sightings are short-term and fade within about a day unless repeated; the newest sighting wins, so Rob coming back and heading west replaces the earlier answer.
- **NPCs never watch players.** Only NPC movements are recorded (owner decision, 2026-10-06).

**3. Directions: bearings plus landmarks (owner decision):**

- Add `bearing` to `location_connection` (8-point compass), set at world gen. The reverse connection gets the opposite bearing; the server validates the value.
- The server computes the route: a breadth-first search over connections from the NPC's location to the destination, limited to what the NPC knows (home region, and places it has walked through when wandering). It produces steps of bearing plus landmark or place name, using `region.landmarks` and location names.
- The LLM only phrases those steps naturally ("Head east to the old mill, then west along the river until you reach Eastgate."). It never invents the route.

**4. Rumored places (special and rare, owner decisions 2026-10-06):**

- **Only rumor keepers know place rumors.** Not every NPC knows one. `npc.rumorKeeper` is decided by the server at NPC generation (deterministic seed, never by the LLM), with **a handful of keepers per region** (owner decision). Rumors are rare and valuable.
- **One place rumor per keeper, ever.** A keeper holds exactly one place rumor. It is created lazily, the first time any player reaches the reveal tier with that keeper: the reply schema's `newPlace` (name, one-line hint, route hint) is accepted only then. After that it is fixed, and every later player who earns the keeper's trust hears the same rumor. The NPC never invents a second or different place rumor; `newPlace` from any other NPC, or from a keeper that already has one, is dropped.
- **Earned through the relationship.** The rumor is an `npc_fact` (999.9) with `revealTier` set high: `trusted` for a location, `bonded` for a region. Affinity rises from kind conversation, completed quests and gifts, and falls from rudeness and abandoned quests (existing `awardNpcAffinity` sources: conversation ±5 per reply, quest turn-in +10, abandon −3, gifts). Teaser at `friendly` (built together with rumors, owner decision): the keeper hints there is something they do not talk about yet, without naming it.
- **Rumors never expire.**
- **Rumors can point outside the region, including to an undiscovered region.** A rumored location is a `location` stub with status `rumored`; a rumored region is a `region` stub with status `rumored` (name, hint and a bearing from the keeper's region, nothing generated).
- **Rarity budgets** so rumors stay special:
  - Rumor keepers capped per region (above).
  - Rumored regions are rarer than rumored locations: only from `bonded` keepers, plus a global cap on open (not yet charted) rumored regions, for example three at a time. A keeper rolled while the cap is full gets a location rumor instead.
  - The server checks the name is not an existing place (loose match) before writing a stub.
- **Cheap stubs:** no connections, enemies or full description, so no tokens are spent on places nobody reaches.
- **Per-player discovery (owner decision):** a rumored place appears on a player's map and in their journal only after they have heard it (`npc_fact_known`). Different players can earn the same rumor from the same keeper.
- **Going public:** a rumor becomes visible to everyone only when someone finds a path that links it to the charted world. The path comes from the keeper's route hint attached to a real location (for a region, an edge location of the keeper's region), or from exploring: `performPassiveSearch` at the hinted location can roll to uncover it.
- **When a path is found:** the stub becomes `charted`. A location is generated by the existing world-fill pipeline; a region by the existing region generation (`startWorldGeneration`, which respects generation locks). `location_connection` rows with bearings are written, the discovery is announced to everyone as a World event, and the discoverer gets server-first renown (`renown_server_first`).
- The LLM proposes only a name and a hint. Danger, level, enemies and loot come from the normal region rules, so a leading question ("tell me about the Golden City of Free Loot") yields nothing unless the NPC is a keeper at the right tier, and then only its one rumor.

**5. Rumor kinds (exploration seeds, owner decisions 2026-10-06):**

A rumor is only a pointer. It resolves into a row in the system that pays it off; it never holds the reward itself.

| Kind | Example rumor | What the player finds | Pays off through |
|---|---|---|---|
| Place | "There's a chapel under the lake" | a location or region | world fill and region generation (section 4) |
| Treasure | "My grandfather buried his pay near the old mill" | a hidden cache, found by searching there | `performPassiveSearch`, `search_result`, item rarity tiers, loot tables |
| Person | "My brother went to the Hollow and never came back" | an NPC who does not exist until reached | NPC generation; 999.9 relationship facts link the two NPCs |
| Creature | "A white stag walks the Ashwood at night" | a new creature that appears when the player arrives (at night, if the rumor says so) | `enemy_template`, `named_enemy`, the day/night tick |
| Faction | "The ferrymen answer to someone else" | a new faction enters the world | `faction`, `faction_standing`, rival pairs (`faction_rules.ts`) |
| Race | "Stone-skinned folk trade at the high pass" | a new people enters the world | `race_definition` |
| Craft | "The smith at Eastgate knows how to temper starsteel" | a recipe learned from someone or found somewhere | `recipe_template`, `recipe_discovered` |

```ts
rumor { id, keeperNpcId, kind, whereLocationId? /* real or rumored */, hint, routeHint?,
        payoffTier, revealTier, status /* rumored | found */, foundByCharacterId?, createdAt }
```

- **Treasure is a one-time claim.** The first player to find a cache takes it; after that the rumor is spent for everyone (status `found`).
- **Discoveries are World events.** Finding a place, person, creature, faction or race grows the world: it becomes shared, is announced to everyone as a World event, appears on the World events screen, and earns the discoverer server-first renown. **First finds of every kind are World events that reward renown** (owner, 2026-10-06), including the first claim of a treasure and the first craft of a discovered recipe.
- **Discovered races become selectable at character creation** (owner, 2026-10-06): once a race rumor is found, the race (`race_definition`) is offered alongside the freeform race entry.
- **Rumor kinds are mechanical vocabulary** (`spacetimedb/src/data/mechanical_vocabulary.ts`). The LLM supplies only flavor for the kind it is given (name, hint). The server sets the payoff from the region's danger, so a rumor can never promise more than the region allows.
- **Keepers have a specialty** that fits who they are, from `npcType` and `personalityJson.knowledgeDomains` (a miner knows treasure, a hunter knows creatures, a barkeep knows people, a smith knows crafts). **A keeper knows only one or two important rumors** (owner decision), not one per kind.
- **Reveal tiers by kind:** person and creature at `friendly`; treasure, craft and location at `trusted`; region, faction and race at `bonded`.
- **Rarity budgets by kind:** creatures and people are the most common; then treasure and crafts; then locations; regions, factions and races are the rarest, each with a global cap on open (undiscovered) rumors.
- **Chains:** a payoff can carry the next rumor (a map in a treasure cache becomes a region rumor; a found person can be a keeper). Chain depth is capped so chains stay rare.

**6. Rumor quests: the race to finish first (owner decisions, 2026-10-06):**

- Rumors usually lead into a quest, often a multi-step one.
- **Several players can be on the same rumor quest at once.**
- The race:
  1. Get the quest (earn the keeper's trust).
  2. **Complete it first:** only the first finisher claims the big reward: renown plus the World event announcement.
  3. **Second place and later:** players who were already on the quest and finish afterwards get a smaller reward (a little renown or faction standing; for a new place, a reward for also finding it).
  4. **Once completed, the quest closes:** no other character can take it again.
- Some other quests may also allow several finishers with smaller rewards; first-finisher-only rewards apply to rumor quests and other first finds.
- Not the same as an exclusive quest (999.9): an exclusive quest has one holder at a time; a rumor quest has many holders and one winner.

**Terminology:** these discoveries are always called **World events**. Never use "ripple" for this concept in code, player-facing text or docs (owner, 2026-10-06).

**Decisions (2026-10-06, open-question review):**

- Wanderers stay within their zone and move at most about once per in-game day.
- A handful of rumor keepers per region; each keeper knows one or two important rumors; rumors are rare and valuable.
- The abandon penalty (−3 against +10 for completion) stays as it is.
- Rumor quests are a race with tiered rewards and close once completed (section 6).
- Commuter NPCs are built together with wandering, and the `friendly` teaser together with rumors.

**Open questions:**

- Exact numbers: keepers per region, the global cap on rumored regions nobody has reached.
- Reward sizes for second place and later on a rumor quest.

**Requirements:** TBD (unit tests required: service NPC types never wander, moves stay within the region and step limit, no move during a recent conversation, deterministic move choice, sightings written to NPCs at both ends, the perception roll, no player sightings, newest sighting wins, bearing validation and reverse bearings, route search limited to NPC knowledge, only rumor keepers can create a place rumor, one rumor per keeper and the same rumor for every player, reveal gated by affinity tier, region rumors only from bonded keepers and within the global cap, rumors never expire, rumor duplicate check, rumor visibility only for players who heard it, rumor goes public only when a path links it, charting a location triggers world fill and charting a region triggers region generation, every rumor kind resolves into its payoff system, treasure claimable once, first finds of every kind (including treasure claims and first crafts) announced as World events with server-first renown, discovered races offered at character creation, payoff tier set by the server from region danger, keeper specialty and per-kind reveal tiers and budgets, chain depth cap)
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)


### Phase 999.11: Race discovery, similar-race matching and the Rite of Becoming (BACKLOG)

**Goal:** Character creation lists the playable races on request, matches a described race against races that already exist (trait graph, no extra LLM call), steers near-duplicates to an existing race or a lineage of it, caps the world at 20 starting zones tied to race history, and gives the player who discovers a new race a one-time quest to become it. Captured 2026-10-06 (owner idea, refined in discussion). Related: 999.8 (learned phrases), 999.9 (affinity, NPC facts), 999.10 (race rumors, discovered races selectable at creation).

**Today:**

- Races are reused only on an exact name match: `findRaceDefinition` (`spacetimedb/src/data/race_bonuses.ts`) looks up `race_definition.by_name` (lowercased). "Stone giants" does not match an existing "Stoneborn".
- A race reuses the starter region of the first player who created it (`reuseStarterRegion`, `spacetimedb/src/helpers/world_gen.ts`, matched on `region.starterForRace`), so choosing an existing race already lands at its starting zone.
- New races are generated by the `creation_race` LLM job and saved by the creation-race apply step in `spacetimedb/src/helpers/llm_apply.ts` (insert into `race_definition`).
- Phase 49 (v3.0, CRE-03) shows the 3 newest `race_definition` rows as suggestion cards (`src/creation/raceCards.ts`); the creation context already loads every `race_definition`.
- A legacy `race` table (with `unlocked`) is still written by `spacetimedb/src/data/races.ts` and `spacetimedb/src/helpers/world_events.ts`. Remove it or merge it into `race_definition` as part of this item.
- Players have one character, so a new race cannot be tried by rolling a new character.

**1. List races on request:** moved to its own backlog item, 999.15 (Phase 49 is complete).

**2. Similar-race matching (trait graph):**

- Each race gets trait tags from a fixed vocabulary (body: stone, scaled, feathered, fungal…; size; home: mountain, forest, sea, underground…; temperament; magic leaning), stored as race-to-trait rows indexed by trait (the node-and-edge pattern of 999.8 to 999.10). The trait vocabulary is mechanical vocabulary.
- When a player describes a race:
  1. Free check, no LLM: match the text against race names and trait words (learned phrases as in 999.8), and score existing races by trait overlap.
  2. Strong match: the Keeper suggests it in voice ("Sounds like the Stoneborn, who already walk the Greyreach. Join them, or insist you're something new?"). Choosing it places the player at that race's starting zone.
  3. No clear match: the `creation_race` call that already happens receives the closest few races and must answer "this is race X" or "this is new" (with trait tags from the vocabulary). Matching therefore adds no tokens.
- Insisting on something new (owner decision, 2026-10-06):
  - Near-identical (very high overlap): no new race; pick the existing one or describe something different.
  - Close match: if the player insists, it becomes a **lineage** of the existing race ("Frost Stoneborn"): its own name, narrative and flavor, a bonus drawn from the parent's bonus family, and a starting zone chosen as in section 3. A close match never becomes a new race.
  - Nothing close: a new race, with its own starting zone while the cap allows (section 3).

**3. Starting zones: cap of 20, tied to race history (owner decisions, 2026-10-06):**

- At most **20 starting zones** in the world. The cap applies to starting zones, not races.
- A starting zone is linked to a race and its history: when a race's zone is generated, its history and the zone's facts (region biome, landmarks, dominant faction, 999.9-style facts) are stored as edges between the race and the zone.
- Those edges decide which races can start in which zones: a lineage, a new race created after the cap is reached, and a discovered race without its own zone each start in the zone whose history and traits best fit the race (trait and fact overlap, computed by the server; no LLM call). A zone can host several races.
- A daily limit on new races, alongside the LLM daily budget.
- **A race discovered through questing always gets its own starting zone**, even when the 20-zone cap is reached (owner decision).

**4. Rite of Becoming (change race; owner decisions, 2026-10-06):**

- **Only a race discovered during play can be the target.** Player-created races and existing races cannot be changed to.
- **Offered only to the discoverer:** the player who discovers the race (the first find, 999.10) is offered the Rite. No one else gets it for that race.
- **One time only:** the quest is offered once; a player can change race through it at most once.
- A real quest chain (earn the people's trust, a trial, a rare reagent): it is a large change, so it takes effort.
- Effect: race bonuses swap, and level bonuses are recomputed through the existing `recompute_racial_all` / `computeRacialAtLevelFromRow`; the racial ability swaps; optional rebind to the race's home. Class, level and gear stay.
- Becoming the discovered race is part of that first find's World event with renown (999.10 first-finds rule).

**Decisions (2026-10-06, open-question review):**

- "List all races on request" is its own backlog item, 999.15.
- A race discovered through questing gets its own starting zone even past the cap.
- **A discoverer who declines the Rite can never get it back.**

**Open questions:**

- Does abandoning the Rite quest partway count as declining (gone for good)?

**Requirements:** TBD (unit tests required: race list contents and hidden rumored races, stub race filled on first choice and then shared, trait scoring, strong match suggests an existing race and places the player at its starting zone, the `creation_race` reply choosing existing versus new, near-identical blocked, an insisted close match becomes a lineage and never a new race, at most 20 starting zones, race-to-zone history edges, best-fit zone selection for lineages and post-cap races, daily new-race limit, Rite offered only to the discoverer of a race discovered in play and only once, bonus and ability swap with recompute, class, level and gear unchanged, World event with renown)
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.12: Gear power budget and generated items (BACKLOG)

**Goal:** A vast range of unique items, recipes, weapons and armor whose power always fits how hard they were to get. Every source (drops, named enemies, bosses, quests, rumor treasure, crafting, World events) uses one power budget with a hard cap, so quest and boss gear is worth the effort but never breaks the game. The graph pattern (999.8 to 999.11) records where items come from and how recipes connect. Captured 2026-10-06 (owner idea, refined in discussion). Related: 999.3 (overlaps, see below), 999.9 (NPC facts about items), 999.10 (treasure and craft rumors, first finds).

**Today:**

- **Strong rules:** two quality axes: rarity (common to legendary, rolled from world tier and region danger, `spacetimedb/src/helpers/items.ts` `TIER_RARITY_WEIGHTS` and `rollQualityTier`) and craft quality (dented to mastercraft, `spacetimedb/src/data/crafting_rules.ts`). There are prefix and suffix affixes with set strength per tier (`spacetimedb/src/data/affix_catalog.ts`), and crafting with material tiers, essences, modifier reagents, salvage and research.
- **Missing content:** since the v2.0 removal of seeded content, server code never inserts `loot_table`, `loot_table_entry` or `recipe_template` rows. Enemies and bosses cannot drop gear (`findLootTable` in `spacetimedb/src/reducers/combat.ts` always returns nothing), and research has no recipes to find. Item templates come only from starter gear, the admin `grant_item`, and quest rewards.
- **Quest reward gear was broken; fixed 2026-10-06 by quick task 261006-g12** (`grantQuestItemReward` in `quests.ts`, used by both `turn_in_quest` and the "turn in <quest>" intent). The original problem, kept for context: `turn_in_quest` (`spacetimedb/src/reducers/quests.ts`) inserts an `item_template` with columns that do not exist (`damage`, `armor`, `str`, `maxHp`, …), without required ones (`requiredLevel`, `allowedClasses`, …), and with invalid slots (`feet`, `weapon`; the real names are `boots`, `mainHand`). If the insert throws, the whole turn-in rolls back, so item-reward quests cannot be completed. It also scales the reward from the player's level, not the quest's difficulty.

**1. One power budget for every source (owner decisions, 2026-10-06):**

```
budget = baseline(itemLevel) × sourceMultiplier × small variance (±5%)
```

- **`itemLevel` comes from the content, not the player:** enemy level, quest difficulty, recipe material tier or region danger. `requiredLevel = itemLevel`.
- **Source multipliers reflect effort:** normal drop 1.0, named enemy 1.15, boss 1.3, quest by type (reuse `typeMultipliers` in `quests.ts`), rumor treasure 1.25, end of a rumor chain 1.35, crafted by craft quality (dented 0.9 up to mastercraft 1.3), World event by tier (bronze, silver, gold).
- **Hard cap: 1.4×** (owner decision). No item exceeds 1.4 × baseline at its level.
- **Every stat has a point cost**, affixes included (for example 1 STR = 1 point, 1 HP = 0.2), so any combination is checked against the budget. Randomness picks which stats an item gets, not how much power.
- **Rarity is a result of budget and source**, not a separate roll.
- **The LLM supplies names, descriptions and a theme** ("frost", "drowned", "ember") that steers which stats an item leans toward. It never sets numbers.

**2. Crafting against boss gear (owner decision: agreed):** mastercraft can match boss gear, but only with rare materials from that boss or its region, so crafting and boss hunting support each other.

**3. Legendaries (owner decisions, 2026-10-06):** think "the One Ring": legendary items have their own history. "Almost sentient" is flavor only for now (description and history text); legendaries take no actions of their own.

- **Unique:** each legendary exists once and has one bearer at a time. There can be many different legendaries.
- **Bonded, never traded:** a legendary is bonded to its bearer. Trading, giving, dropping, mailing or banking it to another character is refused.
- **Never destroyed:** deleting, salvaging, selling or otherwise destroying a legendary is refused.
- **Lost into history, found again as a rumor:** when a legendary leaves its bearer it is not deleted. It "disappears into history" and resurfaces as a new rumor on some NPC (a 999.10 rumor keeper, possibly in another region), so it can be found again. The new finder becomes its next bearer; finding it is a World event with renown.
- **When it is lost:**
  - **Character deleted:** the legendary is lost into history immediately.
  - **Inactivity:** if the bearer's character has not logged in for **over six months**, a scheduled sweep removes it from their inventory and sends it into history (`player.lastActivityAt` is already updated on input; confirm the right last-login signal).
- **Rumors never name past bearers.** A legendary's rumor speaks only of where it might be (a location) and/or which NPC might hold it. Bearer history may be kept internally (game-written rows) but is never shown in rumors or NPC facts.
- **Earned** through rumors (999.10), first finds or legendary bosses. Special effects come from the existing ability-effect vocabulary and count against the same budget and 1.4× cap.

**3a. Boss tiers (owner decisions, 2026-10-06):**

| | Zone boss | Legendary boss | Risen boss (successor, 999.13) |
|---|---|---|---|
| Respawns | yes | never: killable once | fills the seat a fallen boss left |
| Drops | **named items**: boss gear; many copies of the same named item can exist; not legendary | a **legendary** item (section 3) | its own new unique gear |
| When killed | normal loot | a **World event**; the world changes; the boss is gone | its rise and its fall are World events |
| Budget | boss 1.3 | legendary, within the 1.4× cap | by its tier |

- Named items record the boss that dropped them (provenance).
- A legendary boss's death changes the world through the consequence types World events already have (`spacetimedb/src/data/world_event_data.ts`: success and failure consequences), for example lower region danger, a faction gaining ground, or a sealed place opening.
- Today `enemy_template.isBoss` exists but nothing in world generation sets it, and `named_enemy` is per character with a respawn timer (`spacetimedb/src/helpers/search.ts`). Boss tiers are new.

**3b. Who receives a legendary (owner decisions, 2026-10-06):**

- **Group kill** (bosses are locked to a group): **the legendary chooses.** It picks a random group member. That player may claim it or refuse; on a refusal it picks again among the members who have not refused, until someone claims it. (The group can still agree among themselves who should claim it.)
- **World event kill** (for example a world boss fought by many players): only **active participants** are eligible. A player must reach a minimum participation level; doing one small thing and sitting back does not qualify. Then a random eligible participant is picked, with the same claim-or-refuse rule. `event_contribution` already records participation.

**3c. Stat point values (proposal for owner approval, 2026-10-06):**

The yardstick is what a character gains from leveling: each level adds about 8 stat points (primary +3, secondary +2, each other stat +1; `spacetimedb/src/data/class_stats.ts`). Gear is measured against that, so leveling stays the main source of power and gear adds a share on top.

- **Point costs** (1 point = 1 point of a main stat), derived from the current formulas:
  | Stat | Cost | Why |
  |---|---|---|
  | STR, DEX, INT, WIS, CHA | 1 point each | the same currency levels give |
  | HP | 10 HP = 1 point | 1 STR already gives 8 HP plus damage (`HP_STR_MULTIPLIER`) |
  | Mana | 10 mana = 1 point | 1 caster stat gives 6 mana plus spell power (`MANA_MULTIPLIER`) |
  | Armor (AC) | 3 AC = 1 point | 1 AC cuts physical damage taken by about 1% at low AC (`applyArmorMitigation`) |
  | Magic resist | 1 MR = 1 point | worth about 3 AC (`MAGIC_RESIST_SCALING` = 3) |
- **Base versus bonus:** a weapon's base damage and an armor piece's base AC come from a curve by item level, weapon or armor type and slot. The point budget covers bonus stats and affixes. Both are scaled by the same source multiplier and held under the same 1.4× cap.
- **Baseline per item:** `baseline(L) = max(1, round(0.25 × L × slotWeight))` bonus points, with slot weights chest, legs and main hand 1.5; head, hands, boots and off hand 1.0; wrists, belt, neck, earrings and cloak 0.75 (the weights add up to about 12 across the 12 slots).
- **What that means:** a full set of normal gear at level L adds about 25% of a level-L character's own stat points (about 30 points at level 10, against about 118 from the character). Best-in-slot gear at the 1.4× cap adds about 35%.
- Existing affix strengths already fit this scale (for example +1 to +4 STR per tier; "Vital" HP of 5, 8 and 15 is 0.5 to 1.5 points).
- Note: `MAX_LEVEL` is 10 today (`spacetimedb/src/data/xp.ts`), while world tiers are defined up to level 50. The formula scales either way.

**3d. Balance test (approved by owner, 2026-10-06):** a unit test simulates a fight in best-in-slot gear against the same fight in normal gear, and fails if the best gear wins more than a set margin faster (proposed: at most 35% fewer rounds, matching the stat share above).

**4. Where the graph helps:**

- **Provenance:** each item links to its source (boss, quest, NPC, region, recipe, material). This drives first-find World events, legendary uniqueness, and NPC knowledge of items ("Borin forged that blade", 999.9 facts).
- **Recipes as a graph:** materials connect through recipes to outputs. Materials belong to terrain and regions (`MATERIAL_DEFS` already lists gathering terrain). A newly found region can bring a regional material with a tier from its danger, which bounds crafted power. Recipes are discovered through craft rumors (999.10), NPC teaching or research.
- **Generated loot tables:** when a region or enemy is created, the server builds its loot entries (LLM picks themes, the budget sets stats). This fixes the empty tables.
- **Template reuse:** item templates keyed by base type, material, level band and theme, and reused so the world is not flooded with one-off templates; each instance rolls its own affixes.

**5. Balance enforced by tests:** for every source and level, budget ≤ 1.4 × baseline including affixes; `requiredLevel = itemLevel`; identical inputs give identical items; a simulated fight with best-in-slot gear beats baseline gear by no more than a set margin; each legendary has at most one owner.

**999.3 folded in (2026-10-06):** 999.3 (Dynamic Equipment Generation) is folded into this item; its entry stays in the backlog for history, marked as folded. This item carries its requirement IDs **EQUIP-01 to EQUIP-05** and its success criteria, which become part of this item's criteria:

1. Defeating an enemy drops equipment with stats scaled to enemy level and world tier (EQUIP: drops).
2. Generated equipment stats (AC, damage, bonuses) come from formulas, not hardcoded tables.
3. Quest reward equipment is generated to match the quest's difficulty tier.
4. ~~The static `WORLD_DROP_GEAR_DEFS` constant is gone~~ (already met: it no longer exists).
5. Generated equipment names use the existing prefix and suffix affix system.

Suggested slicing when promoted: (a) power budget and generated drops and loot tables (criteria 1, 2, 5), (b) quest rewards by quest difficulty (criterion 3), (c) crafting, regional materials and recipe graph, (d) legendaries and provenance.

**Decisions (2026-10-06, open-question review):**

- **Winning a legendary from an NPC who holds it varies by story:** a quest; affinity (for example a dying holder chooses you as their successor, see 999.13 seats); or an epic tale that ends in a fight (you find them, confront them, and eventually fight).
- **NPCs cannot be attacked at will.** Monsters can be fought freely; an NPC can only be fought as the climax of a story quest.
- **Keep internal bearer history** for admin information and fun facts. It is never shown in rumors.
- **If every eligible player refuses a legendary**, it slips away into history and resurfaces as a new rumor.
- The four quest turn-in follow-ups found by quick task 261006-g12 were fixed by quick task 261006-gy6 (shared `turnInCompletedQuest` helper: inventory space check, quest XP through `awardXp`, NPC memory on both paths, reward names never clash with starter items, giver location checked on both paths).

**Open questions:**

- What counts as minimum participation for a World event kill (needs more discussion).
- Quest reward defects left open by quick task 261006-gy6: the hail auto-turn-in and delivery-quest completion in `spacetimedb/src/reducers/commands.ts` are a third reward path that skips the shared helper (no gold, no item reward, no NPC memory, different affinity amounts, keeps the quest instance); the starter upsert could still overwrite a reward if a future starter item takes an already-granted reward's name (needs a template-origin column); the "turn in" intent stops at the first same-named quest even if it is incomplete.
- Approve or change the stat point values and baseline in section 3c, and the 35% margin for the balance test (3d).
- The base damage and base AC curves by item level, weapon or armor type and slot.

**Requirements:** TBD (unit tests required: budget formula per source, 1.4× cap including affixes, `requiredLevel = itemLevel`, item level from content not player, deterministic generation, rarity from budget and source, LLM output never sets numbers, mastercraft parity only with boss or region materials, zone bosses respawn and drop named items (many copies), legendary bosses die once and trigger a World event with a world change, legendary claim-or-refuse among group members, minimum participation for World event kills, legendary single ownership, legendaries cannot be traded or destroyed, legendary lost immediately on character deletion and after six months of bearer inactivity, lost legendary resurfacing as a new NPC rumor that names a location or NPC holder and never a past bearer, provenance links, generated loot tables non-empty for generated enemies, template reuse, quest rewards matched to quest difficulty)
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.13: Seats and succession: the living world (BACKLOG)

**Goal:** NPCs and bosses rise and fall. The world has **seats** ("Lord of the Hollow", "Leader of the Tidewardens", "Smith of Eastgate", "Banker of Greyreach") held by NPCs or bosses. When an occupant dies or is overthrown, a successor takes the seat. Deaths are rare and significant, and a successor does not simply inherit everything, so a death matters. Captured 2026-10-06 (owner idea, refined in discussion). **Depends on** 999.9 (memory, relationship facts), 999.10 (rumors, wandering) and 999.14 (world calendar, for aging); boss tiers are in 999.12.

**Seats:**

- A seat is a node; its occupant, past occupants and successor candidates are edges (the same node-and-edge pattern as 999.8 to 999.12).
- Successor candidates come from existing links: a child (999.9 relationship facts), a lieutenant, an up-and-coming member of the same faction, or a creature rumor (999.10). With no candidate, one is generated: the LLM writes the name and story; the server sets power from the seat's tier.
- **Service seats are never empty** (vendor, banker, crafting): an heir or apprentice takes over at once, extending the 999.10 rule that service NPCs never wander.
- **Boss seats:** after a legendary boss dies (999.12), the seat stays empty for a while, then something new rises. **"Something new has claimed the Hollow" is a World event** (owner, 2026-10-06), and so is the risen boss's later fall.

**NPC deaths: rare and significant (owner decisions, 2026-10-06):**

- Deaths are uncommon events, never routine churn.
- Causes:
  - **Age:** NPCs age on the world calendar (999.14) and can die of old age.
  - **Disease.**
  - **Overrun events:** a World event where monsters overrun a town. The monsters fight the NPCs, and the NPCs defend themselves. Players can step in and save them by fighting off the attackers; NPCs who are not saved can die.
  - Other events to define (for example faction conflict or a boss rising nearby).
- **The successor has only a chance to carry things on** (owner decision): each quest, rumor and memory of the dead NPC passes to the successor with some probability, not automatically. Otherwise a death would change nothing. What is not carried on ends: a quest ends gracefully for the players on it, a rumor is lost or passes to another keeper, a memory is forgotten. A carried memory sounds like an heir's ("My father spoke of you").

**Ages, seats and illness (owner decisions, 2026-10-06):**

- **Lifespans come from race:** each race has a lifespan, and NPCs live to their race's maximum unless something else kills them. **Each NPC starts at a random age.** (NPCs have no race or age today: the `npc` table needs a race and a birth date, and `race_definition` needs a lifespan.)
- **Carry-over is a coin flip:** each quest, rumor and memory has a **50/50** chance of passing to the successor.
- **Seat vacancies:**
  - **Boss seats** stay empty for up to **6 in-game months** and never longer (about 180 real hours at one real hour per in-game day, 999.14).
  - **Seats players rely on** (shopkeeper, banker, crafting) are filled quickly.
  - **Leadership seats** (for example a town leader) may stay empty for a while, and the vacancy can become a quest: find the heir, or help the town choose a leader.
- **Disease and illness:** a sick NPC can give a time-limited quest to find a cure. The cure can spawn harvestable ingredients, or drops on specific monsters that must be slain. If the cure does not arrive in time, the NPC can die.
- **NPCs cannot be attacked at will** (see 999.12): an NPC is only fought as the climax of a story quest.

**Town overruns (approved by owner, 2026-10-06):**

- Overruns are **World events announced in advance**, so players know they are coming (for example a warning one in-game day ahead).
- The defense works like other participation-based World events (`world_event` with objectives, thresholds and time limits): players fight the attacking monsters, and success depends on how much the defenders achieve.
- NPCs are not simulated in combat. Instead, **if the event fails, each notable NPC in the town rolls a chance of dying**; defenders who took part raise the town's odds.
- On success, defenders earn renown tiers and affinity with the town's NPCs.

**Things every system must handle when an occupant dies:** quests, rumors, memories, wandering and sightings, delivery targets, legendary holders (999.12: a legendary held by a dying NPC resurfaces as a new rumor), and faction leadership.

**Build order:**

1. Boss succession only: seats for bosses, vacancy, a successor rises (World event). No aging needed.
2. NPC life cycle: aging, disease, overrun events, heirs and faction leaders, and seats for service NPCs. Needs 999.9, 999.10 and 999.14.

**Decisions (2026-10-06, open-question review):** see "Ages, seats and illness" above: race lifespans with random starting ages, 50/50 carry-over, seat vacancy rules, disease quests, and no attacking NPCs at will.

**Open questions:**

- Town-overrun numbers: warning lead time, success threshold, and the chance an NPC dies when the defense fails.
- Disease: how often an NPC falls ill, how long the cure window is, and whether an uncured NPC always dies or rolls a chance.
- Other death causes beyond age, disease, overruns and story fights.

**Requirements:** TBD (unit tests required: seats and occupants, successor chosen from linked candidates before generating one, service seats never empty, boss seat vacancy then a rise World event, deaths only from defined causes and at defined rates, overrun defense where players can save NPCs, per-item carry-over chance for quests, rumors and memories, graceful handling of everything not carried over, legendary held by a dead NPC resurfacing as a rumor)
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.14: World calendar and day/night timing (BACKLOG)

**Goal:** The world has a calendar (days, and years for aging in 999.13), and the day/night cycle matches it: **one real hour is one in-game 24-hour day, with 40 minutes of daytime and 20 minutes of night** (owner decisions, 2026-10-06). The owner's order: add the calendar first, then change the day/night timing.

**Today:**

- Day/night is a scheduled tick (`day_night_tick`) that flips `world_state.isNight` and sets `nextTransitionAtMicros` (`spacetimedb/src/index.ts`, around the day/night tick reducer; `spacetimedb/src/helpers/scheduling.ts`).
- Durations are constants in `spacetimedb/src/helpers/location.ts`: `DAY_DURATION_MICROS` = 20 minutes, `NIGHT_DURATION_MICROS` = 10 minutes (a 30-minute cycle).
- `world_state` has no date: there is no calendar, so nothing can age.
- Night already changes gathering (`timeOfDay` in material gather entries), enemy spawns and the "time" and "look" output (`spacetimedb/src/helpers/look.ts`, `spacetimedb/src/reducers/intent.ts`).

**Design:**

- A world clock anchored to an epoch timestamp and a random starting date (both stored once on `world_state` at world start), so the current in-game date and time is computed from `ctx.timestamp` deterministically: day number, hour, day or night.
- Change the constants to 40 minutes of day and 20 minutes of night (one real hour per in-game day).
- At one real hour per day, a 365-day year takes about 15 real days, so an NPC living 60 to 80 years lasts about 2.5 to 3.3 real years.
- "time" and "look" show the date and the in-game hour as well as day or night.
- **Full calendar** (owner): days, months and years, named months and weekdays, and seasons.
- **The world starts on a random calendar date** (owner): players enter the world in medias res.
- **Weather system** (owner): weather by region and time, which can affect combat, the harvestable materials available, and which enemies appear in a zone at that time.
- **Players can see the date, the weather and the time** (owner). The UI shows day or night today.
- Unit tests: day and night lengths, the date computed from timestamps, the random start date, the transition schedule, weather selection, and the time and look output.

**Decisions (2026-10-06, open-question review):** full calendar with named months, weekdays and seasons; a random starting date; a weather system that affects combat, materials and enemies; date, weather and time visible to players; day/night timing ships with the calendar.

**Open questions:**

- Calendar numbers: days per month, months per year, and whether month and weekday names are generated once at world start (LLM) or fixed.
- Weather design: the kinds of weather, whether weather is per region or per biome, how long it lasts, and its exact effects on combat, materials and enemies.
- Where the date, weather and time appear in the UI (for example the vitals rail).
- Do seasons change anything beyond weather (events, materials, enemies)?

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.15: List all races on request at character creation (BACKLOG)

**Goal:** During character creation the player can ask to see every playable race ("races", "show me the races", or a "See all races" control) and gets a list of names with a one-line description each. Captured 2026-10-06; split out of 999.11 because Phase 49 is complete.

**Today:** Phase 49 (CRE-03) shows the 3 newest `race_definition` rows as suggestion cards (`src/creation/raceCards.ts`), and the creation context already loads every `race_definition`.

**Design:**

- No LLM call: the list comes from stored rows.
- Playable races: full races created by players, plus races discovered through rumors (999.10), which are public once found. Rumored races nobody has found stay hidden.
- Choosing a race that is only a stub (a discovered race may have just a name and hint) generates it in full the first time, with its own starting zone (999.11); from then on everyone gets the same race.
- Choosing a listed race places the player at that race's starting zone (existing `reuseStarterRegion`).
- Unit tests: request phrasings, list contents, hidden rumored races, stub generation on first choice, starting-zone placement.

**Depends on:** 999.10 (discovered races) and 999.11 (stub races and starting zones) for the full behavior. Listing player-created races works today without them.

**Related:** 999.21 (character creation screens match the mock). The owner suggests doing these together.

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.16: Journal (quests) screen with tracking, abandon and region grouping (design: UWR Journal) (PULLED INTO PHASE 52)

**Status (owner decision 2026-10-06):** pulled into Phase 52. Plan and build it there; this entry stays as the design record.

**Goal:** A Quests menu item opens a Ledger screen (desktop drawer, mobile sheet) showing the same information as the `quests` chat command, formatted properly. From it, players track or untrack quests for the right rail, abandon quests with a confirmation, and browse quests grouped by region, with a cap of 30 active quests. Captured 2026-10-06 (owner idea). No quest backlog item existed to merge into.

**What the owner asked for:**
1. **Quests menu item.** A new entry (header button on desktop; the More sheet or a tab on mobile) that opens a Quests screen built on the Phase 45 drawer and sheet shells.
2. **Same information as `quests`, formatted.** Everything the chat `quests` command prints (the client formatter ported in Phase 47, `src/input/infoCommands.ts`), shown as structured rows and not as raw text. Each quest shows its name, giver or recipient, type, objective with progress, rewards, description and turn-in status.
3. **Tracking checkbox.** One checkbox per quest. A checked quest appears in the right rail's Tracking section (Phase 47 `ContextContent`). Unchecking removes it.
4. **Abandon.** One abandon action per quest, which reuses the existing `abandon_quest` reducer. It asks for confirmation (the Phase 49 and 50 inline confirmation pattern). The confirmation states the cost:
   - The reputation or affinity loss. Today `awardNpcAffinity` takes 3 off the giver's affinity on abandon.
   - The server's line "This quest may never be offered again."
5. **Grouped by region.** Quests are listed under their region, using the quest location or the giver's location mapped to a region. Each region heading shows its count.
6. **Limit of 30 active quests.** A character can hold at most 30 active quests at a time. The screen shows the count, for example "12 / 30".

**Design source (owner, 2026-10-06; re-import fresh when this is planned; never cached):** the quests screen is the **Journal**, and its rail follows the owner's Claude Design file.
- claude_design MCP (`https://api.anthropic.com/v1/design/mcp`, auth via `/design-login`), project "Unwritten Realms" (id `1a7a975f-7b14-488b-9a38-188bc56294cf`): https://claude.ai/design/p/1a7a975f-7b14-488b-9a38-188bc56294cf?file=UWR+Journal.dc.html
- Focus file: `UWR Journal.dc.html`.
- Also read the files it imports:
  - `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/_ds_bundle.js`
  - `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/styles.css`
  - `support.js`
- Implement `UWR Journal.dc.html`.
- **Revised mock (owner, 2026-10-06, later the same day):** the owner updated `UWR Journal.dc.html` with a new version of the Journal screen and its rail. The link and file list are unchanged. Plan against the latest version from a fresh import, not against anything summarized from the earlier one. Where the revised design differs from this entry's notes (including the owner's list above), the revised design wins.
- The menu item is "Journal". Where this entry says "Quests menu item" or "Quests screen", read Journal. If the design differs from the list above, the design wins and the owner's list is checked against it.
- **Quest details from the main screen (owner, 2026-10-06, second mock revision).** The owner updated `UWR Journal.dc.html` again to show how a player opens a quest's details from the main game screen, without opening the Journal first. Entry points include the right-rail Tracking section, the context rail's quest or event card, and quest names in the feed. Take the exact entry points, layout and copy from the fresh import.
  - This is in scope for 999.16.
  - The details view and the Journal screen share one quest-details component and data model, so both show the same objective progress, rewards, giver or recipient, region, track toggle, abandon (with confirmation) and turn-in status.
  - Desktop and the 390×844 mobile sheet are both covered.
  - Related: todo `2026-10-06-quest-turn-in-affordance-in-new-client.md` (a "Turn in" action belongs in these details), and 999.20 (Examine button in the right-hand rail; the two may share an interaction pattern).
- Run it as a UI phase (`/gsd-ui-phase` from the fresh import, then plan and execute). Timing: after the v3.0 milestone, with 999.19.

**Turn-in bug reported with this item (fixed in quick 261006-kpj, not part of this backlog item).** The owner could not turn in a completed quest by talking to its giver. Cause: the new client sends `hail {npc}` through `submit_intent`, and the intent HAIL/TALK branch only printed the greeting. The turn-in logic lived only in the `hail_npc` reducer. The visible "Turn in" action for the Journal and Nearby is still todo `2026-10-06-quest-turn-in-affordance-in-new-client.md`.

**Notes for planning:**
- **The limit needs a server change.** Today `MAX_ACTIVE_QUESTS = 4` in `spacetimedb/src/helpers/npc_conversation.ts`. It is used by the LLM quest offer (`llm_apply.ts:750`) and by the NPC conversation context (`npc_interaction.ts:93`). Decide whether 30 replaces it as a per-character cap that every accept path enforces (dialogue accept, LLM offer, the old auto-accept), and whether the offer prompt's count changes. A prompt change needs owner approval.
- **Where tracking state lives.** Either a small per-character table (synced across devices, server-authoritative) or per-viewer local storage. Prefer server-side so the rail matches on every device; a `my_tracked_quests` view or a column on `quest_instance` are the options.
- **Rail cap.** The right rail Tracking section needs a cap for how many tracked quests it shows, or it overflows. A small default such as 5 is suggested; the rest show as "+N more".
- **Related:**
  - todo `2026-10-06-quest-turn-in-affordance-in-new-client.md`: a "Turn in" action and a "Return to {NPC}" hint. They belong on this screen too.
  - 999.9 (NPC memory, abandon falls on affinity).
  - 999.12 (quest reward gear).
  - Phase 51 (World events and Track in the sidebar share the same Tracking rail).
- **Tests:**
  - region grouping
  - the 30 cap on every accept path
  - track and untrack sync with the rail
  - abandon confirmation copy, including the reputation loss
  - the formatter matches what `quests` shows
  - escape test on quest text (LLM-generated)

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.17: Combat round wind-up for cast times, with cancel on the hotbar slot (BACKLOG)

**Goal:** An ability's cast time decides how many rounds it takes to go off, for characters and enemies alike, under one rule. Between rounds the feed shows the cast in progress ("You continue casting X." / "You focus on X."). A player can cancel a wind-up from the ability's own hotbar slot during any round's decision window, then pick a new action for that round. Captured 2026-10-06 (owner decision, design agreed in conversation).

**Why (today's behavior):**
- **Player cast time is ignored in combat.** `resolveAbilityChoice` (`spacetimedb/src/reducers/combat.ts`) fires the chosen ability at the player's turn in the round it was chosen and never reads `castSeconds`. A cast already running when a fight starts is cancelled ("Your casting is interrupted by combat.").
- **Cast time still raises damage.** `getAbilityMultiplier` (`spacetimedb/src/data/combat_scaling.ts`) adds +10% per cast second, so in combat a slow cast is pure upside.
- **Enemies wind up on a different scale.** `windupRounds` (`spacetimedb/src/helpers/combat_rounds.ts`) rounds up using `EFFECT_ROUND_CONVERSION_MICROS` (4s), and the ability lands at the end of round N + windup. Any enemy cast time, even 1s, therefore delays the ability by at least one full round. The enemy posts "X begins to cast Y." once and nothing in the rounds between.
- **The round timer is not a cast-time unit.** `ROUND_TIMER_MICROS` (10s) is only the player's decision window. It plays no part in the wind-up rule.

**Agreed design:**
1. **One rule for everyone.** `castRounds = ceil(castSeconds / 2)`. One round means the ability goes off at the end of the round it was chosen:

   | Cast time | Goes off |
   |---|---|
   | 0–2s | the round it is chosen |
   | 3–4s | one round later |
   | 5–6s | two rounds later (and so on) |

   Enemies move off the 4s scale onto this rule, so their 1–2s casts become same-round.
2. **The wind-up uses the ability's real `castSeconds`.** `MANA_MIN_CAST_SECONDS = 3` stays as it is for damage only. If the wind-up used the floored value, every mana spell would take two rounds.
3. **A wind-up bonus pays for the lost round.** Each extra round of wind-up adds about **+60%** to the ability's multiplier, on top of the existing +10%/s cast bonus and the cooldown bonus. A 3s spell goes from 1.3× to about 1.9×. The bonus applies to enemy abilities too (same `scaledPower` path), which makes enemy wind-ups bigger, telegraphed hits.
   - Level 1 estimate (damage ability value1 12, starter dagger): a 2s spell then an auto-attack ≈ 17 + 8 = 25. A 1s mana spell (floored to 1.3×) then an auto-attack ≈ 27. A two-round 3s spell without the bonus ≈ 19, about 25–30% behind; with the bonus ≈ 27.
   - These are level 1 estimates and auto-attacks scale with gear, so a test must check the trade at several levels and tune the +60% if needed.
4. **Unchanged:** cooldown lengths, the ability power budget (`helpers/skill_budget.ts`), and the generator's cast ranges (0–3s, mana ≥ 1s, `data/llm_layers.ts`). Nothing generated today takes more than two rounds; the longer rows only matter if longer casts appear later.
5. **Player wind-up state.** A per-combat player cast row, like `combat_enemy_cast`: character, ability, target, the round it started and the round it lands. While the row is open, the player's pending cast is their action. They don't auto-attack, and the round treats them as already chosen.
6. **Cooldown and resource cost start when the ability goes off,** not when the cast begins. Cooldown lengths are unchanged; only the start point moves. This keeps the slot clickable during the wind-up, and it means cancelling costs nothing. The player rule should match enemy behavior (today enemy cooldowns start at announce), or the planner records why they differ.
7. **Feed lines.**
   - First round: "You begin casting X."
   - Each round in between: "You continue casting X." (mana) or "You focus on X." (stamina or physical)
   - The landing round: "You use X on Y."
   - Group and other participants see "Name continues casting X."
   - Enemies post "X continues casting Y." in each round between.
   - Use the Keeper's second-person narrator voice, as in the rest of the feed.
8. **Interrupts and targets.** A stun interrupts a player's wind-up, as it already does for enemies. When the ability lands and its stored target is gone, it retargets by its own rule or fizzles (the same as `landEnemyCasts`).
9. **Cancel on the hotbar slot** (`src/hotbar/HotbarRow.vue`).
   - **The slot gets a "winding up" state next to `chosen`.** It shows a fill distinct from the cooldown sweep, a "1 round" badge in the spot cooldowns use for their round count, and an × that appears on hover or focus.
   - **Accessible label:** "Fireball, casting, 1 round left, press to cancel".
   - **The slot toggles during the decision window.** The first click or number key marks the cast for cancelling: the slot shows "Cancel", the round chip says "Cancelling X", and the player can pick another ability or Ready. A second click resumes the cast with no progress lost. The cancel only takes effect when the round resolves; until then the server just stores a pending cancel. This protects against a stray number-key press throwing away a round of progress.
   - **Mobile:** a tap toggles cancel; long-press still opens the tooltip.
   - **Fallback:** if the active hotbar doesn't contain the casting ability, the round row's chip (`src/combat/RoundRow.vue`, "Casting Fireball · 1 round left") also toggles cancel. It is the same action in a second place, needed only in that case.
   - Enemies never cancel.

**Cooldowns are in scope too (owner, 2026-10-06): "make sure that backlog item also handles cooldowns on abilities!"** Point 4 above ("cooldown lengths unchanged") still holds for the stored `cooldownSeconds` values. The **rounds rule for cooldowns** must be designed here, together with the cast rule. Today's behaviour:
- In combat, a cooldown lasts `cooldownRounds(cooldownSeconds) = max(1, ceil(cooldownSeconds / 4s))` rounds (`spacetimedb/src/helpers/combat_rounds.ts`, `EFFECT_ROUND_CONVERSION_MICROS` = 4s in `data/combat_constants.ts`).
- An ability used in round N can be chosen again from round N + C (46.1).
- When the fight ends, the rounds left on a cooldown convert back to wall-clock time (`roundsToWallClockMicros`).
- The hotbar shows "N rounds" in combat (48 and quick 261006-h5w/hpp).
- The proposed cast rule divides by 2s while cooldowns divide by 4s, so the two units would not match.
- **Owner's live example (2026-10-06):** "Grudge Stab". Out of combat it reads `8 stamina · 5s cooldown · Instant`; in combat it reads `8 stamina · 2 round cooldown · Instant`. Today that is ceil(5 / 4) = 2 rounds.
- **Owner correction (2026-10-06):** the 10s `ROUND_TIMER_MICROS` is only the decision wait. It is **not** how long a round lasts and must not be used to reason about real time. ("The 10s is NOT how long a round lasts.")
- **Owner decision (2026-10-06): cooldowns use exactly the same seconds-to-rounds rule as cast times.** "Let's make cooldowns work just like cast times will work." Under the cast rule above, `cooldownRounds = ceil(cooldownSeconds / 2)`, with whatever minimum the cast rule sets for a non-zero value. If planning changes the cast rule, cooldowns change with it, through one shared function.
  - Grudge Stab (5s) becomes ceil(5 / 2) = 3 rounds. Make this a test row.
- **Owner decision (2026-10-06): seconds stay the source of truth.** In the owner's words: "It's OK to keep the cast time in seconds… then we can adjust cooldown/cast times according to its true cast time. If we convert to rounds then we have to rebalance by rounds."
  - Abilities keep `castSeconds` and `cooldownSeconds` as stored and authored values. All balancing, the power budget and the generator ranges are tuned in seconds.
  - Rounds are only derived at combat time, through the one shared rule. There is no rounds column, and no stored or authored value in rounds.
  - Changing an ability's seconds changes its rounds automatically.
  - The UI can show both values, for example "3 rounds (5s)", so the true value stays visible.

Decide and test all of the following:
1. **One seconds-to-rounds rule, decided by the owner:** cast time and cooldown share it. Implement a single function used by both `castRounds` and `cooldownRounds` (and by `windupRounds` for enemies), and remove the separate 4s `EFFECT_ROUND_CONVERSION_MICROS` path for cooldowns. **Effect durations follow the same rule (owner, 2026-10-06).** In the owner's words: "durations should be the same way. They should end after the final tick on the final round."
   - DoT, HoT, buff, debuff and crowd-control durations keep their seconds (or micros) as the stored, authored and balanced value.
   - Their round count comes from the same shared seconds-to-rounds function, at combat time.
   - An effect ends after its final tick in its final round. It never expires before that tick, and it never ticks an extra round.
   - Effects that run when a fight starts convert to rounds the same way. When a fight ends, remaining rounds convert back to wall-clock time exactly.
   - The chips (Phase 48 and quick 261006-hpp) show the same round counts.
   - Tests:
     - a table of seconds to rounds for durations, matching cast times and cooldowns
     - the tick count equals the round count
     - the effect disappears only after the last tick
     - player and enemy effects follow the same rule
2. **When a cooldown starts.** It starts when the ability goes off (point 6). A cancelled wind-up starts no cooldown and charges no cost.
3. **Enemy cooldowns.** Enemy abilities follow the same cooldown rule as player abilities.
4. **Converting at fight start and end.** A cooldown running before a fight converts to rounds when the fight starts. At the end it converts back to wall-clock time. Both directions are exact and never round down to "free".
5. **Shorter or longer cooldowns.** If the new rule changes how many rounds an ability is unavailable, say whether the ability's power budget or cooldown bonus (`getAbilityMultiplier`) needs an adjustment.
6. **UI.** The hotbar cooldown sweep and "N rounds" badge use the same numbers as the server. Show the winding-up and cooling-down states clearly apart on the slot. The tooltip (quick h5w/hpp) shows the cooldown in rounds in combat.
7. **Tests.** Cover each of the following:
   - the shared rule's table of seconds to rounds
   - when a cooldown starts after a wind-up, and that a cancel starts none
   - enemy parity
   - converting at fight start and end
   - that the hotbar and tooltip show the same numbers as the server

**Notes for planning:**
- **Schema change.** A new player cast table (or the existing `combat_action` row carrying wind-up fields) means a local `--clear-database` publish (greenfield, allowed). Never publish to maincloud automatically.
- **Reducers.** The cancel and resume toggle needs a reducer, or a new action type on the existing choice submit (`submit_combat_action`). Cancel and resume are only accepted while the round is in `action_select`. The client calls it from the slot and from the chip (CLAUDE.md checklist step 4).
- **Choice collection.** Round collection (`allChosen` and the waiting list) must count a winding-up player as already chosen, unless the player has marked a cancel.
- **Client estimate.** `roundsToEstimateMicros` and the hotbar's rounds text should show the remaining wind-up rounds.
- **Tests (required):**
  - the `ceil(castSeconds / 2)` bucket table, including 0s and the mana floor not being used
  - a landing round for players and for enemies
  - a feed line in each round between (mana vs stamina wording)
  - the wind-up bonus per extra round
  - a balance check at several levels: a two-round cast vs a quick spell plus an auto-attack
  - cooldown and cost charged only on landing
  - cancel toggles and resume keeps progress
  - a cancel after resolve is refused
  - a stun interrupts a player wind-up
  - a landing target that is gone retargets or fizzles
  - a winding-up player counted as chosen
  - the slot state and accessible label
  - the chip fallback when the casting ability is not on the active hotbar
- **Related:**
  - 999.1 (combat balance tuning)
  - 999.4 (ability expansion; longer casts would use the 5–6s+ rows)

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.18: Hotbar Manager (design: UWR Hotbar Manager) (PULLED INTO PHASE 52)

**Status (owner decision 2026-10-06):** pulled into Phase 52. Plan and build it there; this entry stays as the design record.

**Goal:** Build the hotbar management screen from the owner's Claude Design file, so players can arrange their abilities across hotbars on desktop and mobile. Captured 2026-10-06 (owner request).

**Design source (re-import fresh when this is planned; never cached):**
- claude_design MCP (`https://api.anthropic.com/v1/design/mcp`, auth via `/design-login`). Project "Unwritten Realms" (id `1a7a975f-7b14-488b-9a38-188bc56294cf`): https://claude.ai/design/p/1a7a975f-7b14-488b-9a38-188bc56294cf?file=UWR+Hotbar+Manager.dc.html
- Focus file: `UWR Hotbar Manager.dc.html`.
- Also read the files it imports:
  - `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/_ds_bundle.js`
  - `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/styles.css`
  - `support.js`
- Implement `UWR Hotbar Manager.dc.html`: a hotbar management solution for the game.

**Notes for planning:**
- **Builds on Phase 47:** the hotbar (`src/hotbar/*`: HotbarRow, HotbarSelector, the cooldown ticker), the existing hotbar tables and reducers, and quick 261006-h5w / 261006-hpp (the slot tooltip with description and type).
- **Run it as a UI phase:** `/gsd-ui-phase`, which writes a UI-SPEC from the fresh design import, then plan and execute.
- **Desktop:** a Ledger drawer. **Mobile:** a sheet at 390×844, opened from the frame (a header button or More).
- **Design guards apply:**
  - no literal colors (map the mock's hex values to existing tokens; the pin stays 23), no v-html, no `<svg`
  - Phosphor icons and Inter only
  - sizes 10/12/14/20, weights 400/500
  - spacing 4/8/16/24/32/48/64
  - text nodes only
- **Server:** confirm in research whether the design needs anything the hotbar reducers do not have yet, such as named hotbars, reordering or more slots. Server changes stay additive and publish locally only.
- **Related:**
  - 999.17 (round wind-up with cancel on the hotbar slot)
  - todo `2026-10-06-race-ability-source-as-chip.md` (Race / Renown source chip on abilities)

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.19: Character screen: rename Stats to Character, updated design (design: UWR Character) (BACKLOG)

**Goal:** Rename the Stats menu item and screen to "Character", and rebuild that screen and its rail from the owner's updated Claude Design file. Captured 2026-10-06 (owner request).

**Design source (re-import fresh when this is planned; never cached):**
- claude_design MCP (`https://api.anthropic.com/v1/design/mcp`, auth via `/design-login`), project "Unwritten Realms" (id `1a7a975f-7b14-488b-9a38-188bc56294cf`): https://claude.ai/design/p/1a7a975f-7b14-488b-9a38-188bc56294cf?file=UWR+Character.dc.html
- Focus file: `UWR Character.dc.html`.
- Also read the files it imports:
  - `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/_ds_bundle.js`
  - `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/styles.css`
  - `support.js`
- Implement `UWR Character.dc.html`.

**Notes for planning:**
- **Supersedes the Phase 50 Stats screen (LDG-03).** That screen is being built in Phase 50 from the older "UWR Ledger Screens" mock 2c: plans 50-16 (stats model, PerkChooser) and 50-17 (Stats screen).
  - This item replaces its layout and rail with the new design and renames it everywhere: the header button, the More row, the `SCREENS` entry and title, the drawer and sheet titles, and tests.
  - Reuse the Phase 50 stats model, the shared `@game-data` helpers (item stats, perk rules, faction tier) and the hub.
- **Timing (owner, 2026-10-06):** follow up after the v3.0 milestone is complete. Phase 50 keeps its current Stats screen.
- **Run it as a UI phase** (`/gsd-ui-phase` from the fresh import, then plan and execute).
- **Design guards apply:**
  - no literal colors (map the mock's hex values to existing tokens; the token pin stays at 23)
  - no v-html, no `<svg`
  - Phosphor icons and Inter only
  - font sizes 10/12/14/20, weights 400/500
  - spacing 4/8/16/24/32/48/64
  - text nodes only
- **Out of scope unless the owner decides otherwise:** the "Keeper's assessment" (LDG-F1) is still deferred. If the new design draws it, record it as a decision.
- **Related:**
  - 999.18 (Hotbar Manager)
  - todo `2026-10-06-race-ability-source-as-chip.md` (Race / Renown chips)
  - todo `2026-10-06-renown-passive-perks-no-effect.md`

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.20: Examine (eyeball) button on things in the right-hand rail (PULLED INTO PHASE 51)

**Status (owner decision 2026-10-06):** pulled into Phase 51. Plan and build it there; this entry stays as the design record.

**Goal:** Put an eyeball "examine" button next to each item, enemy, player and place in the right-hand rail, so players can explore what is around them. Clicking it "looks at" that thing, the same as typing `look <target>`. Captured 2026-10-06 (owner request).

**Notes for planning:**
- **Reuse the existing look path:** the `look <target>` command in `spacetimedb/src/helpers/examine.ts` (`parseLookCommand`, which matches NPCs, enemies, players, resource nodes, then inventory items) and `spacetimedb/src/helpers/look.ts`. The button should send the same intent rather than add a parallel server path. Places may need a new look target if `look` does not cover locations yet; check this in research.
- **Client:** the right-hand rail is `src/frame/ContextRail.vue`. Check the hostile cards (`src/combat/HostileCard.vue`) and the mobile layout at 390x844 too.
- **Design guards apply:** Phosphor icons only (an eye icon), no `<svg`, no literal colors, text nodes only, and an accessible label (for example "Examine <name>").
- **Tests:** the button sends the correct look target for each kind of entry.

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.21: Character creation screens match the mock: left step rail, ability cards only (BACKLOG)

**Goal:** Make the character creation screens match the mock. Captured 2026-10-06 (owner request).

**What is wrong today (owner):**
1. **Step indicator placement:** the mock shows the current step in a left-hand rail. The build shows it in a bar along the top (`src/creation/StepBar.vue`, placed in `src/creation/CreationView.vue`).
2. **Duplicate ability content:** when the player picks abilities, the screen shows both the printed text of the abilities and the ability cards. Show only the cards (`ChoiceBlock` fed by `parseAbilityCards` in `src/creation/abilityCards.ts`). They are easier to read and remove the duplicate content. The printed list probably comes from the Keeper's narration in `CreationFeed`; suppress or trim it while the cards are shown.

**Notes for planning:**
- **Design source:** re-import the character creation screen from `UWR Ledger Screens.dc.html` (mock 2a) through the claude_design MCP, never cached, the same source Phase 49 used. Check desktop and mobile at 390x844 (decide in discuss whether mobile keeps a top bar).
- **Keep the Phase 49 owner deviations:** the name is chosen last and there is no "First words" step.
- **Run it as a UI phase** (`/gsd-ui-phase`); the usual design guards apply (tokens only, no v-html, no `<svg`, Phosphor icons and Inter, the fixed size, weight and spacing scales).
- **Tests:** the step rail renders on the left on desktop for every step; ability text is not duplicated when the cards are shown; the Phase 49 creation tests still pass.
- **Related:** 999.15 (list all races at character creation). The owner suggests doing these together, since both rework the creation screens.

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.22: Party and player context menus (design: UWR Party) (PULLED INTO PHASE 51 (player trade: Phase 52))

**Status (owner decision 2026-10-06):** pulled into Phase 51 (player trade: Phase 52). Plan and build it there; this entry stays as the design record.

**Goal:** Add context menus to party members and other players, so socializing and grouping take one click. Build it from the owner's Claude Design file. Captured 2026-10-06 (owner request).

**Design source (re-import fresh when this is planned; never cached):**
- claude_design MCP (`https://api.anthropic.com/v1/design/mcp`, auth via `/design-login`). Project "Unwritten Realms" (id `1a7a975f-7b14-488b-9a38-188bc56294cf`): https://claude.ai/design/p/1a7a975f-7b14-488b-9a38-188bc56294cf?file=UWR+Party.dc.html
- Focus file: `UWR Party.dc.html`.
- Also read the files it imports:
  - `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/_ds_bundle.js`
  - `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/styles.css`
  - `support.js`
- Implement `UWR Party.dc.html`.

**Notes for planning:**
- **Where the menus attach:** party members in the vitals rail (`src/rails/PartyBlock.vue`, Phase 47) and players in the context rail's Nearby list (`src/frame/ContextRail.vue`). The design decides any other places, such as names in the feed.
- **Reuse existing actions:** the group reducers (`spacetimedb/src/reducers/groups.ts`) and the social command words (invite, kick, promote, leave, whisper, friend). Menu entries should act by role, for example kick and promote only for the leader. Confirm in research whether the design needs anything the server does not have yet. Server changes stay additive and publish locally only.
- **Overlap with Phase 51 (LDG-05, Social screen):** that screen also has party invite, leave, kick and promote, and friends. Share one set of action helpers between the menus and the Social screen, and decide in discuss which phase builds them first.
- **Player trade (owner, 2026-10-06; the design was revised to add it).** `UWR Party.dc.html` now also covers player-to-player trading: starting a trade from the player and party menus, and the trade window itself. Take the exact flow, layout and copy from the fresh import.
  - **Server.** Trade reducers and tables already exist; `cancel_trade` is in the bindings. Research confirms the full set and any gaps, such as offer and accept steps, gold in trades, the bag-space check, and the 999.24 stack cap.
  - **Overlap with Phase 52.** Trade is one of Phase 52's parity surfaces and was listed there as having no mock. It now has one, in this file. Owner decision 2026-10-06: the designed trade is built in Phase 52, and the rest of 999.22 (the party and player context menus) is built in Phase 51.
- **Run it as a UI phase** (`/gsd-ui-phase` from the fresh import, then plan and execute). Desktop and mobile at 390x844 (the menu may need a sheet or long-press on touch).
- **Design guards apply:**
  - no literal colors (map the mock's hex values to existing tokens; the token pin stays at 23)
  - no v-html, no `<svg`
  - Phosphor icons and Inter only
  - font sizes 10/12/14/20, weights 400/500
  - spacing 4/8/16/24/32/48/64
  - text nodes only
- **Accessibility:** the menu opens from the keyboard, traps focus and closes on Escape (reuse `src/frame/focusTrap.ts`).
- **Tests:** menu entries per role and target (party member vs other player, leader vs member, self), each entry calls the right reducer, keyboard behavior.
- **Related:** 999.20 (Examine button in the right-hand rail, a possible "Examine" menu entry for players), Phase 51.

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.23: Combat loot rails (design: UWR Combat) (PULLED INTO PHASE 52)

**Status (owner, 2026-10-06):** pulled into Phase 52, Parity and Production: "build the designed loot rails in Phase 52". Plan and build it there, with the notes below. This entry remains only as the design record.

**Goal:** After a fight, show loot in the rails as the owner's Claude Design file draws it, so players can see what dropped and take it item by item or all at once, on desktop and mobile. Captured 2026-10-06 (owner request).

**Design source (re-import fresh when this is planned; never cached):**
- claude_design MCP (`https://api.anthropic.com/v1/design/mcp`, auth via `/design-login`), project "Unwritten Realms" (id `1a7a975f-7b14-488b-9a38-188bc56294cf`): https://claude.ai/design/p/1a7a975f-7b14-488b-9a38-188bc56294cf?file=UWR+Combat.dc.html
- Focus file: `UWR Combat.dc.html`.
- Also read the files it imports:
  - `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/_ds_bundle.js`
  - `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/styles.css`
  - `support.js`
- Implement `UWR Combat.dc.html`, the combat loot rails.

**Notes for planning:**
- **What the server already has.** Bindings exist for `combat_loot`, `my_combat_loot`, `loot_table`, the `take_loot` and `take_all_loot` reducers, and the corpse reducers `loot_corpse_item` and `loot_all_corpse`. Research confirms which ones the design needs, and whether anything is missing (for example a loot-mode rule for parties, see Phase 51 LDG-06).
- **Overlap with Phase 52 (Parity and Production).** The new client has no loot UI yet. The old `v2.2-client` LootPanel is on Phase 52's parity audit list. If Phase 52 adds a basic loot action for parity, this item replaces it with the designed rails. Decide during Phase 52 planning whether to pull this item in.
- **Builds on Phase 48.** It reuses the Encounter panel, the rail swap at fight end, and the mobile encounter strip.
- **Design guards apply:**
  - no literal colors; map rarity to the existing `--color-rarity-*` tokens, and the token pin stays 23
  - no v-html, no `<svg`
  - Phosphor icons and Inter only
  - font sizes 10/12/14/20 and weights 400/500
  - spacing 4/8/16/24/32/48/64
  - text nodes only
- **Run it as a UI phase** (`/gsd-ui-phase` from the fresh import, then plan and execute).
- **Related:**
  - 999.12 (gear power budget and generated items)
  - 999.20 (Examine button)
  - Phase 50 inventory (backpack capacity, item inspector and comparison, which the loot rows can reuse)

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.24: Max item stack size of 99 (BACKLOG)

**Goal:** A stack of a stackable item holds at most 99. Adding more starts a new stack in a free backpack slot. Captured 2026-10-06 (owner request).

**Today (code read 2026-10-06):** stackable items have no cap. `addItemToInventory` (`spacetimedb/src/helpers/items.ts` ~369) merges into any existing non-equipped stack, and `hasBackpackSpace` (`spacetimedb/src/data/inventory_rules.ts`, Phase 50) treats a stackable template with an existing stack as always fitting.

**Notes for planning:**
- **Shared constant.** Add `MAX_STACK_SIZE = 99` to the import-free `spacetimedb/src/data/inventory_rules.ts`, so the client, which reads it through `@game-data`, never keeps its own copy.
- **Space rule.** A stackable item fits if an existing stack has room for the whole quantity, or there are enough free slots for the overflow. Partial fills split across stacks, and the stack and slot math is shared by every add path.
- **Every path that adds stackable items must respect the cap:**
  - loot, from `take_loot` / `take_all_loot` and corpses
  - quest rewards (`grantQuestItemReward`)
  - crafting output (`craft_recipe` / `planCraft`)
  - gathering
  - vendor `buy_item` and buy-back (`buyback_last_sale`, Phase 50)
  - trades
  - bank withdrawals
  - starter items
- **Existing over-cap stacks** (greenfield, no compatibility shim): either leave them alone and only stop further growth, or split them in a one-off cleanup. A local `--clear-database` is not needed. Decide when this is planned.
- **Client:** the Phase 50 backpack tiles show `×n` up to 99, and the slot count must reflect split stacks.
- **Tests** (real handlers on the strict mock database):
  - adding to 99 opens a new stack
  - partial overflow splits across stacks
  - a full backpack refuses only the overflow
  - every add path respects the cap
- **Related:** 999.12 (gear power budget and generated items) and the Phase 50 inventory capacity rule (`MAX_INVENTORY_SLOTS`).

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.25: Bank and vault screen (design: UWR Bank) (PULLED INTO PHASE 52)

**Status (owner, 2026-10-06):** pulled into Phase 52 (Parity and Production). The designed bank is built there, so this entry only records the design.

**Goal:** A bank or vault screen from the owner's Claude Design file, where players deposit and withdraw items on desktop and mobile. Captured 2026-10-06 (owner request).

**Design source (re-import fresh when this is planned; never cached):**
- claude_design MCP (`https://api.anthropic.com/v1/design/mcp`, auth via `/design-login`), project "Unwritten Realms" (id `1a7a975f-7b14-488b-9a38-188bc56294cf`): https://claude.ai/design/p/1a7a975f-7b14-488b-9a38-188bc56294cf?file=UWR+Bank.dc.html
- Focus file: `UWR Bank.dc.html`.
- Also read the files it imports:
  - `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/_ds_bundle.js`
  - `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/styles.css`
  - `support.js`
- Implement `UWR Bank.dc.html`.

**Notes for planning:**
- **What the server already has.** Bindings for `my_bank_slots` and the `deposit_to_bank` and `withdraw_from_bank` reducers. Research should confirm whether the design needs more, such as gold deposits, bank capacity or expansion, sorting or tabs, or a bank-NPC location rule.
- **Overlap with Phase 52 (Parity and Production).** Bank is one of Phase 52's parity surfaces, and the roadmap says it has "no mock". It now has one. Decide whether to build this design in Phase 52, the way 999.23 loot was pulled in, or to ship a basic parity bank there and swap in the design after the milestone.
- **What it reuses from Phase 50:** item tiles, the inspector, backpack capacity, shared item stats, and the `LedgerData` hub pattern. Also 999.24 (max stack size 99), which applies to deposits and withdrawals.
- **Design guards apply:**
  - no literal colors; rarity uses `--color-rarity-*` and the pin stays at 23
  - no v-html, no `<svg`
  - Phosphor icons and Inter only
  - font sizes 10/12/14/20, weights 400/500
  - spacing 4/8/16/24/32/48/64
  - text nodes only
- Run it as a UI phase (`/gsd-ui-phase` from the fresh import).

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

---
*Last updated: 2026-10-06 after the owner put effect durations on the same rounds rule (999.17)*
