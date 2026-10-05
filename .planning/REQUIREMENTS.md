# Requirements: UWR v3.0 UX Overhaul

**Defined:** 2026-10-05
**Core Value:** A world that writes itself around its players — every character is unique, every region is discovered, and the narrative responds to what players actually do.

**Source design:** claude_design project `1a7a975f-7b14-488b-9a38-188bc56294cf`. Files: `UWR Ledger Screens.dc.html` (screens 2a–2j), `UWR Console & Combat.dc.html` (Ledger direction 1a/1c only; Folio 1b/1d not chosen), and the Nocturne `_ds/nocturne-67cd9946-…/styles.css`. Each phase re-imports from the MCP and never works from a cached copy.

**Approach (owner, 2026-10-05):** Build a fresh client from scratch. Do not retrofit the existing `src/` UI. Cut over to the new client, then delete the old one entirely. The UX is independent of SpacetimeDB internals: the new client only consumes the generated bindings and the reducers.

## v3.0 Requirements

### Foundation (FND)

- [ ] **FND-01**: The new client runs from a fresh `client/` app (Vite + Vue 3), using the same SpacetimeDB module and generated bindings. The old client keeps working until cutover.
- [ ] **FND-02**: Every screen takes its styling from Nocturne tokens and components (Inter, Phosphor icons, themed hover, pressed and focus-visible states). Nothing hard-codes a color. Rarity and enemy-difficulty colors keep their current hues.
- [ ] **FND-03**: On desktop (1280×800), the player sees the frame:
  - a header: location, time of day, level-up and new-skill tags, screen buttons
  - a vitals rail that stays put
  - the center feed
  - a context rail
- [ ] **FND-04**: A secondary screen opens as a drawer over the center and right columns. The header and vitals rail stay visible, and Esc or the close button dismisses it.
- [ ] **FND-05**: At mobile width (390×844), the player sees a compact vitals strip, the story feed and a bottom tab bar (Story, Map, Bag, Party, More). Secondary screens open as full-height sheets above the tab bar.
- [ ] **FND-06**: The player can sign in (SpacetimeAuth OIDC), reconnect and log out in the new client.
- [ ] **FND-07**: The splash / sign-in screen shows the 16:9 key-art logo (`public/assets/logo.png`, 1672×941) large and undistorted, scaled to fit the viewport at desktop and mobile, with no pixelated rendering.

### Console (CON)

- [ ] **CON-01**: The feed renders each entry as a labelled line by kind: Keeper narration, NPC speech, whisper, party chat, system, quest update, ripple / world event.
- [ ] **CON-02**: NPCs, places and objects in the feed show as soft accent keywords. Clicking one acts on it (hail, examine, travel).
- [ ] **CON-03**: The vitals rail shows HP, MP, SP and XP bars, active effects with time remaining, and party members with health and an Invite button.
- [ ] **CON-04**: The context rail shows:
  - routes out, with level ranges or "safe"
  - Nearby (NPCs, objects, resource nodes, players) with one-click actions
  - tracked quests with progress
  - the active world event with its faction split
- [ ] **CON-05**: The hotbar shows iconed ability slots with cooldowns, and the player can switch between their hotbars.
- [ ] **CON-06**: While an LLM job runs, the player sees the Keeper's progress lines, and staged reveals (world, class) land in the feed.

### Input (INP)

- [ ] **INP-01**: A natural sentence that starts with a command word reaches the conversation or intent path, not the command system. Examples: "Who is that over there?", "Leave him alone", "End this now", "Accept my apology". (Backlog 999.7)
- [ ] **INP-02**: Exact command forms still run the command (for example `who`, `/who`, `invite <name>`). Tests cover every command word in both the sentence form and the exact form.

### Combat (CMB)

- [ ] **CMB-01**: In combat, the right rail becomes the encounter: hostiles with health, a boss tag and difficulty color. The player can click a hostile to target it, and Tab cycles targets.
- [ ] **CMB-02**: The player sees the threat order on the current target (from `aggro_entry`).
- [ ] **CMB-03**: The player sees an enemy wind-up warning (from `combat_enemy_cast`) before the ability lands.
- [ ] **CMB-04**: The combat feed groups real-time events into short beats with headers. Effects and cooldowns show seconds, not rounds.
- [ ] **CMB-05**: The header shows "In combat". The player can click party members to target heals, Flee is on the hotbar, and damage taken flashes on the vitals.

### Character Creation (CRE)

- [ ] **CRE-01**: Character creation runs as a Keeper interview in the feed, with a step indicator. Steps run race → archetype (Warrior/Mystic) → class reveal → name (last) → enter the realm. There is no "First words" step (deviates from mock 2a by owner decision).
- [ ] **CRE-02**: A live character sheet fills in on the right as the player chooses: race, archetype, class, stats with bonuses, racial trait, and finally the name (an unnamed placeholder until then).
- [ ] **CRE-03**: The Keeper offers 3 race suggestions as clickable cards with stat tags. The player can still type any race, or choose "Surprise me" to let the Keeper pick.

### Ledger Screens (LDG)

- [ ] **LDG-01**: Inventory: equipment slots and a backpack side by side, with backpack filters (All, Gear, Materials, Food), slot count and gold.
- [ ] **LDG-02**: The inventory inspector shows the selected item's rarity, tier and stats compared with what's equipped (▲/▼), plus flavor text, sell value and Equip / Salvage.
- [ ] **LDG-03**: Stats: base stats as bars showing the gear bonus, a derived-stats table, renown rank with a perk choice, and faction standing.
- [ ] **LDG-04**: Map: known locations in a region as a route graph, with a legend (here, visited, heard of, bind point) and a region list with level ranges.
- [ ] **LDG-05**: Map: picking a node shows description, danger, travel cost, services, players there and related quests, with Travel and Travel with party.
- [ ] **LDG-06**: Social: a party table (class, where, health) with invite, leave, kick and promote, a loot-mode control, and accept / decline for pending invites.
- [ ] **LDG-07**: Social: group chat, friends with online status and location, a who's-online count, and pending friend requests to accept.
- [ ] **LDG-08**: Vendor: the vendor's name, role, faction, quote and rapport modifiers, and a for-sale table with a "usable by you" filter and Buy.
- [ ] **LDG-09**: Vendor: the player's sellables with value, Sell, Sell all junk and buy back the last sale. Quest items are marked unsellable.
- [ ] **LDG-10**: Crafting: materials on hand, and a recipe list with category tabs and an "only craftable" filter. Each recipe shows the materials you have against what it needs.
- [ ] **LDG-11**: Crafting: the selected recipe shows its quality odds, an optional reagent / affix and Craft. Discover recipes is reachable from this screen.
- [ ] **LDG-12**: World events: active, upcoming and recently resolved events, with region and timers.
- [ ] **LDG-13**: World events: the event detail shows the description, the faction tug-of-war, objectives with progress across the realm, and a timeline of the ripples it caused.
- [ ] **LDG-14**: World events: the player's contribution and percentile, party contribution, reward tiers, Travel there, and Track in the sidebar.

### Structured Replies (SEG)

- [ ] **SEG-01**: Narrative LLM routes (NPC chat, world and scene narration, combat outro, creation) return segments shaped `{kind: narration|dialogue, speaker, text}`.
- [ ] **SEG-02**: Segments are stored with the event, so the feed renders each segment as its own labelled line: "The Keeper", or "The Ferryman says, “…”".
- [ ] **SEG-03**: The Keeper narrates what happens around the player in the second person, as in the Ledger console mock, and NPC speech goes only in dialogue segments. Changes to the Keeper Bible and route blocks need explicit owner approval.
- [ ] **SEG-04**: A malformed segment reply falls back to a single Keeper narration line and never breaks the feed.
- [ ] **SEG-05**: (QUAL-01 carry-over) A golden run in the narrator voice passes its mechanical rules, and the owner signs off on the tone.

### Cutover (CUT)

- [ ] **CUT-01**: Every action the old client offers can be done in the new client, per a written parity checklist. That includes surfaces not in the design (bank, loot, player trade, help, bug report, /llm admin commands), which get built from Nocturne components.
- [ ] **CUT-02**: The production build and GitHub Pages deploy serve the new client.
- [ ] **CUT-03**: The old client (the `src/` UI, its entry point and its tests) is deleted, and nothing in the repo references it.

## Future Requirements

Deferred. Tracked, not in this roadmap.

- **ADM-01**: Admin "Keeper's Desk" screens (live events, event catalog, GM tools, Keeper monitor, server health), from `UWR Admin Screens.dc.html`
- **LDG-F1**: The Keeper's-assessment flavor text on the Stats screen (an LLM call per view)
- **COMB-05**: Enemy DoT/HoT/debuff indicators (backlog 999.1)
- **UX-01–03, COMB-08**: Global font scale and group readability (backlog 999.5)
- Enemy cast bar and cast times in ability descriptions (pending todos 2026-03-09)
- **QUAL-02**: Live end-to-end verification, Console reconciliation and the maincloud run (owner manual items)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Round-based combat | The engine stays real-time (a v2.0 decision). The mock's rounds become beat grouping in the feed. |
| Fixed, browsable race list ("show all fifteen") | Races stay freeform, which keeps every character unique. |
| First-person Keeper voice | Retracted by the owner. The Keeper is a second-person scene narrator. |
| Retrofitting the existing `src/` UI | Owner decision: build fresh, cut over, delete the old UI. |
| Folio design direction (1b/1d) | The Ledger direction was chosen. |
| Native mobile app | Web-first. The responsive mobile web layout is in scope. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 45 | Pending |
| FND-02 | Phase 45 | Pending |
| FND-03 | Phase 45 | Pending |
| FND-04 | Phase 45 | Pending |
| FND-05 | Phase 45 | Pending |
| FND-06 | Phase 45 | Pending |
| FND-07 | Phase 45 | Pending |
| CON-01 | Phase 47 | Pending |
| CON-02 | Phase 47 | Pending |
| CON-03 | Phase 47 | Pending |
| CON-04 | Phase 47 | Pending |
| CON-05 | Phase 47 | Pending |
| CON-06 | Phase 47 | Pending |
| INP-01 | Phase 47 | Pending |
| INP-02 | Phase 47 | Pending |
| CMB-01 | Phase 48 | Pending |
| CMB-02 | Phase 48 | Pending |
| CMB-03 | Phase 48 | Pending |
| CMB-04 | Phase 48 | Pending |
| CMB-05 | Phase 48 | Pending |
| CRE-01 | Phase 49 | Pending |
| CRE-02 | Phase 49 | Pending |
| CRE-03 | Phase 49 | Pending |
| LDG-01 | Phase 50 | Pending |
| LDG-02 | Phase 50 | Pending |
| LDG-03 | Phase 50 | Pending |
| LDG-04 | Phase 51 | Pending |
| LDG-05 | Phase 51 | Pending |
| LDG-06 | Phase 51 | Pending |
| LDG-07 | Phase 51 | Pending |
| LDG-08 | Phase 50 | Pending |
| LDG-09 | Phase 50 | Pending |
| LDG-10 | Phase 50 | Pending |
| LDG-11 | Phase 50 | Pending |
| LDG-12 | Phase 51 | Pending |
| LDG-13 | Phase 51 | Pending |
| LDG-14 | Phase 51 | Pending |
| SEG-01 | Phase 46 | Pending |
| SEG-02 | Phase 46 | Pending |
| SEG-03 | Phase 46 | Pending |
| SEG-04 | Phase 46 | Pending |
| SEG-05 | Phase 46 | Pending |
| CUT-01 | Phase 52 | Pending |
| CUT-02 | Phase 52 | Pending |
| CUT-03 | Phase 52 | Pending |

**Coverage:**
- v3.0 requirements: 45 total
- Mapped to phases: 45
- Unmapped: 0

**By phase:** 45 Foundation (6), 46 Structured Keeper Replies (5), 47 Console, Rails, Hotbar and Input (8), 48 Combat Encounter (5), 49 Character Creation Interview (3), 50 Ledger: Character and Economy (7), 51 Ledger: World and People (7), 52 Parity and Cutover (3).

---
*Requirements defined: 2026-10-05*
*Last updated: 2026-10-05 after roadmap creation (traceability filled, 44/44 mapped; FND-07 splash logo added)*
