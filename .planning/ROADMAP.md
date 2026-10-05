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

**Plans**: 1/11 plans executed

Plans:
**Wave 1**

- [x] 45-01-PLAN.md — Cutover: tag `v2.2-client`, toolchain and config (port 5173 strict, `@game-data` alias), vendored Nocturne, seven screen shells, old UI deleted, new entry point and guards

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 45-02-PLAN.md — Client tokens, frame overrides and static design-contract guards (no literal colors, pinned hues, type/spacing scale, Phosphor and Inter only)
- [ ] 45-03-PLAN.md — Auth fixes (expired token, URL cleanup) and the connection controller (backoff 1-30 s, rejected token, resume on online/visible)
- [ ] 45-04-PLAN.md — bindTable (rows survive reconnect), deriveScreen, version rule and frame-view projections
- [ ] 45-05-PLAN.md — Screen state, breakpoint, focus trap, Drawer, Sheet and More sheet
- [ ] 45-06-PLAN.md — Vitals rail, mobile vitals strip, context rail and feed shells
- [ ] 45-07-PLAN.md — Header with account menu, tab bar and mapping, location row, Reconnecting and version notice bars

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 45-08-PLAN.md — Splash with the 16:9 logo and seven states, character picker, no-characters note
- [ ] 45-09-PLAN.md — Session: login_email, set_active_character, logout, subscriptions, derived screen and frame view
- [ ] 45-10-PLAN.md — AppFrame composition (desktop and mobile at 900px), drawer/sheet integration and static frame contract

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 45-11-PLAN.md — App screen switch, phase gate (suite vs baseline, build, dev server) and owner UAT in real Chrome

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

**Plans**: TBD
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

**Plans**: TBD
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

  1. The feed shows each entry as a labelled line by kind (Keeper narration, NPC speech, whisper, party chat, system, quest update, ripple / world event), an NPC reply appears as separate narration and dialogue lines, and NPCs, places and objects show as soft accent keywords that hail, examine or travel when clicked. While an LLM job runs the Keeper's progress lines appear, and staged reveals (world, class) land in the feed.
  2. The vitals rail shows HP, MP, SP and XP bars, active effects with time remaining, and party members with health and an Invite button; the context rail shows routes out (level ranges or "safe"), Nearby (NPCs, objects, resource nodes, players) with one-click actions, tracked quests with progress, and the active world event with its faction split.
  3. The hotbar shows iconed ability slots with cooldowns, and the player can switch between their hotbars.
  4. Typing a natural sentence that starts with a command word ("Who is that over there?", "Leave him alone", "End this now", "Accept my apology") reaches the conversation or intent path, while exact forms (`who`, `/who`, `invite <name>`) still run the command.
  5. At 390×844 the feed, keywords, hotbar and input are usable, and the vitals, routes, Nearby, quests and active event are reachable from the compact strip and tab bar.

**Plans**: TBD
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

**Plans**: TBD
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

**Plans**: TBD
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

**Plans**: TBD
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
  3. World events lists active, upcoming and recently resolved events with region and timers; the detail shows the description, the faction tug-of-war, objectives with progress across the realm and a timeline of the ripples the event caused.
  4. The event detail shows the player's contribution and percentile, the party's contribution and reward tiers, with Travel there and Track in the sidebar (the tracked event appears in the context rail).
  5. At 390×844 Map, Party and World events open as full-height sheets above the tab bar (via the Map, Party and More tabs) and every action above works.

**Plans**: TBD
**UI hint**: yes
**Design source**: Re-import via `/gsd-ui-phase` from the claude_design MCP (never cached): the map/travel, group and social, and world events screens in `UWR Ledger Screens.dc.html`, desktop and mobile.
**Notes**:

  - Server gaps to scope in plan-phase: the `group` table has no loot mode (LDG-06); there is no dedicated "travel with party" reducer (`move_character` moves the party when the leader travels), so the Travel versus Travel with party semantics for grouped players need a decision; confirm the data for "upcoming" events and the ripple timeline. The percentile can be derived client-side from the public `event_contribution` rows.
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
**Design source**: The Nocturne bundle is re-imported fresh via `/gsd-ui-phase`; the undesigned surfaces (bank, loot, trade, help, bug report, /llm admin) have no mock, so the UI-SPEC composes them from Nocturne components and the patterns set in Phases 45-51.
**Notes**:

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
| 45. Foundation, Frame and Auth | v3.0 | 1/11 | In Progress|  |
| 46. Structured Keeper Replies | v3.0 | 0/TBD | Not started | - |
| 46.1. Round-Based Combat Engine | v3.0 | 0/TBD | Not started | - |
| 47. Console, Rails, Hotbar and Input | v3.0 | 0/TBD | Not started | - |
| 48. Combat Encounter | v3.0 | 0/TBD | Not started | - |
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

---
*Last updated: 2026-10-05 after v3.0 roadmap creation (Phases 45-52; Backlog 999.1-999.5 preserved, 999.6 and 999.7 promoted to v3.0)*
