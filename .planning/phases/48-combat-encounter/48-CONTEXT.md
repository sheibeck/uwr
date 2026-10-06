# Phase 48: Combat Encounter - Context

**Gathered:** 2026-10-06
**Status:** Ready for planning
**Mode:** Smart discuss. Answers were auto-approved under the owner's overnight instruction (2026-10-05: "I auto approved any questions with your recommendations").

<domain>
## Phase Boundary

Round-based combat plays out in the new client:
- The right rail becomes the encounter.
- The round timer sits on the hotbar.
- The feed groups events by round.
- The player targets enemies and allies, sees the threat order and enemy wind-ups, readies or flees, and sees their chosen action.

Requirements: CMB-01 to CMB-06.

The work is client presentation of the Phase 46.1 round engine, built on the Phase 47 client. The server gets one small additive change: a public, per-user view of the threat order (`aggro_entry` is private today).

Out of scope:
- enemy DoT/HoT/debuff indicators and an enemy cast bar beyond the wind-up warning (backlog 999.1)
- combat balance
- Ledger screens (Phases 50/51)
- character creation (Phase 49)

</domain>

<decisions>
## Implementation Decisions

### Encounter rail (CMB-01, CMB-02, CMB-03)
- **Desktop rail.** While the active character is a participant in an active fight, the desktop right rail shows the Encounter panel instead of Here, Nearby, Tracking and the event card. They return when the fight ends.
- **Hostile rows.** Each row shows:
  - name
  - HP bar
  - a boss tag when the enemy is a boss
  - a difficulty color from the existing `con*` client tokens (level difference rule, as the old client did)
- **Targeting enemies.** Clicking a row targets that hostile (`set_combat_target`). Tab cycles targets forward and Shift+Tab backward, only when no input is focused and no drawer or sheet is open. The current target gets a visible ring.
- **Threat order (CMB-02).** `aggro_entry` is private, so add one small, additive, public SpacetimeDB view:
  - It returns the aggro entries for fights that the sender's own characters take part in. It looks rows up by index, never with `.iter()`, and is computed per sender.
  - No other player's fights are exposed.
  - The threat list on the current target shows party members ordered by aggro value, highest first.
- **Wind-up warning (CMB-03).** It comes from the public `combat_enemy_cast` table:
  - The hostile row shows "{enemy} winds up {ability} → {target} · lands in N rounds". N is `landsAtRound` minus the current round, plus 1, so "lands this round" when N = 1.
  - A warning line also appears in the feed when the cast is announced.

### Rounds on screen (CMB-04, CMB-06)
- **Feed grouping.**
  - The feed shows a "Round N" header at each round boundary the client has seen. Events are placed by `createdAt` against round `startedAtMicros`, per the 46.1 contract.
  - The client keeps the boundaries it has seen, because round rows are deleted when the fight ends.
  - Opening lines sit before Round 1.
  - Narration that arrives late is shown where it lands, tagged with the round it narrates (from `combat_narrative.roundNumber` or the request).
- **Round timer.** A countdown bar with the seconds left sits on the hotbar, driven by `timerExpiresAtMicros` and the Phase 47 server-clock skew. At 0 it shows "Resolving…" until the next round row arrives.
- **Your choice.**
  - The chosen slot is highlighted, with a label such as "Firebolt → Rotfang".
  - With no choice, an "Auto-attack → {target}" chip shows.
  - A Ready button records an auto-attack choice (`submit_combat_action` with no ability), so the round can end early.
- **Rounds remaining.** In combat, effect chips and hotbar cooldowns show "N rounds" instead of seconds, from `roundsRemaining`. Out of combat the Phase 47 wall-clock display is unchanged.

### Party, Flee and vitals (CMB-05)
- The header shows an "In combat" tag while the active character is in a fight.
- **Ally targeting.**
  - Clicking a party member (vitals-rail party card, or strip chip on mobile) sets the ally target for the next ability choice (`targetCharacterId`).
  - The selected ally is highlighted. The default ally target is the player.
  - Abilities that do not take an ally ignore it.
- **Flee.** A Flee button sits at the end of the hotbar during combat (`flee_combat`) and shows "Flee chosen" once picked.
- **Damage flash.** The HP bar flashes when the player's HP drops. With reduced motion there is no animation, only a brief color change.

### Mobile (390×844)
- A compact encounter strip sits above the feed: one hostile chip per enemy, with an HP sliver, a ring on the current target and a wind-up marker. Tap a chip to target. Tapping the strip header opens the full encounter list in a sheet.
- The mobile hotbar row carries the round timer, Ready and Flee.
- Ally targeting uses the strip's party chips.
- The combat feed stays readable, with round headers kept compact.

### Decisions after UI-SPEC and research (2026-10-06, auto-approved under the owner's overnight instruction)

**Placement (UI-SPEC, A1)**
- Ready and Flee sit in a round row above the hotbar slots, not at the end of the slot strip. Ten 52px slots at 1280px leave no room for a slot-style Flee.
- On mobile, the hotbar row carries the timer, Ready and Flee, as CONTEXT says.
- Show the owner this deviation at UAT.

**Mobile combat layout (A5, A6)**
- Mobile combat hides the tab bar and the location row.
- The encounter strip sits above the feed.
- A small account button on the strip opens a sheet with Log out only, because Log out otherwise lives in the More sheet, which is hidden in combat.

**Ally targeting (A7, A26)**
- A "You" ally card and chip appear in combat, so the player can select themself again.
- The client sends `targetCharacterId` only for `single_ally` abilities, and only while the selected ally is alive and an active participant. Otherwise the server would refuse the whole choice.

**Threat view (CMB-02)**
- Add one additive public view, `my_combat_aggro`. It returns a projection row `MyCombatAggroEntry {id, combatId, enemyId, characterId, value}`, with pet rows excluded.
- It chains index lookups that already exist (player, then `character.by_owner_user`, then `combat_participant.by_character`, then `aggro_entry.by_combat`), so no new index is needed.
- Publish locally with `--break-clients` and no clear. Check the key length (108) before and after, then run `pnpm spacetime:generate -y`.

**Smaller rules**
- Threat percent is relative to the top entry (A8). The owner can revise this at UAT.
- No enemy effect chips (A9, deferred to 999.1).
- Effect chips are unchanged (A13).
- The server's "begins to cast" line is not suppressed (A15).
- The new `'encounter'` value is added to `ActiveScreen` only, not to `SCREENS` (A28).

**Engine-driven fixes**
- The hotbar cooldown sweep total comes from `ability_template.cooldownSeconds` and the round constants, because the server rewrites `durationMicros` every round.
- The item-slot clause is dropped, because no item-bound hotbar slots exist.

**Combat gates**
- Combat UI is gated on a new `game.combat.active`, meaning the player's own `combat_participant` row exists, and not on `game.inCombat`.
- `HeaderBar` gets a separate `inCombat` prop, which disables its controls with `aria-disabled`.

### Claude's Discretion
- The view's name and shape (for example `my_combat_aggro`), as long as the SpacetimeDB view rules hold: index lookups only, `ctx.sender`-scoped and public.
- The component and file layout under `src/`, for example `src/combat/`.
- Exact animation timings, within the reduced-motion rules.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 47 client:**
  - `src/game/gameData.ts` (filtered keyed subscriptions, `createKeyed`, `bindEventTable`) and `src/game/queries.ts`
  - `src/console/*` (feed store, lines, FeedView, keyword matcher, `useConsole` with the narrative queue)
  - `src/hotbar/*` (HotbarRow, cooldown ticker, selector)
  - `src/rails/*` (ContextContent, PartyBlock, EffectChips)
  - `src/frame/*` (AppFrame, VitalsRail and VitalsStrip, HeaderBar, Sheets)
  - `src/game/serverClock.ts`
- **Phase 46.1 server contract:** see 46.1-09-SUMMARY "Round and choice contract for Phase 48". It covers:
  - the tables `combat_round` and `combat_action`
  - `ability_cooldown.roundsRemaining`
  - `character_effect.roundsRemaining` and `combat_enemy_effect.roundsRemaining`
  - `combat_enemy_cast` (`announcedRound`, `landsAtRound`)
  - `combat_narrative`
  - the reducers `use_ability`, `submit_combat_action`, `flee_combat` and `set_combat_target`
- **Client tokens:** difficulty colors `conRed`, `conOrange`, `conYellow`, `conWhite`, `conBlue`, `conLightGreen` and `conGray` in `src/styles/tokens.client.css` (Phase 45).
- **Behavior reference only:** the old client at tag `v2.2-client` (its combat panel, target cycling and con colors).

### Established Patterns
- Design guards:
  - no literal colors, no `v-html`, no `<svg`
  - Phosphor icons and the Inter font only
  - font sizes 10/12/14/20, weights 400/500
  - spacing 4/8/16/24/32/48/64
  - custom properties only from Nocturne or the client tokens
- Text nodes only, with the img-onerror escape test.
- Event-table subscriptions are filtered.
- The Phase 45 and 47 shell tests use inject with inert defaults.

### Integration Points
- **Server view.** Add the view to the module, publish locally with `--break-clients` (never clearing the database), check the stored key before and after, then regenerate bindings with `pnpm spacetime:generate -y`.
- **Client surfaces:**
  - ContextRail on desktop, which switches to Encounter in combat
  - the mobile feed area for the encounter strip
  - HotbarRow for the timer, choice chip, Ready and Flee
  - FeedView for round headers
  - VitalsRail and PartyBlock for ally targeting and the damage flash
  - HeaderBar for the In combat tag

</code_context>

<specifics>
## Specific Ideas

- **Design source:** Console & Combat 1a/1c (Ledger direction) and Ledger 2i/2j in combat, desktop and mobile. Re-import fresh from the claude_design MCP project "Unwritten Realms" (never cached).
- **Owner's original ask:** rounds as in the UX mocks, with time to read narration. The owner chose a 10s round with auto-attack.

</specifics>

<deferred>
## Deferred Ideas

- **Enemy effect indicators and cast bar:** enemy DoT/HoT/debuff indicators and a full enemy cast bar (backlog 999.1).
- **Combat balance:** review it in the end-of-milestone playtest.
- **Live round play checks:** deferred to the end-of-milestone UAT.

</deferred>
