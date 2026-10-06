# Phase 48: Combat Encounter - Research

**Researched:** 2026-10-06
**Domain:** Vue 3 client presentation of the Phase 46.1 round engine on SpacetimeDB 2.10.1 (TS SDK), plus one additive per-sender server view
**Confidence:** HIGH (every server and client claim below was read from this checkout; the few exceptions are tagged `[ASSUMED]`)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Encounter rail (CMB-01, CMB-02, CMB-03)**
- **Desktop rail.** While the active character is a participant in an active fight, the desktop right rail shows the Encounter panel instead of Here, Nearby, Tracking and the event card. They return when the fight ends.
- **Hostile rows.** Each row shows: name; HP bar; a boss tag when the enemy is a boss; a difficulty color from the existing `con*` client tokens (level difference rule, as the old client did).
- **Targeting enemies.** Clicking a row targets that hostile (`set_combat_target`). Tab cycles targets forward and Shift+Tab backward, only when no input is focused and no drawer or sheet is open. The current target gets a visible ring.
- **Threat order (CMB-02).** `aggro_entry` is private, so add one small, additive, public SpacetimeDB view: It returns the aggro entries for fights that the sender's own characters take part in. It looks rows up by index, never with `.iter()`, and is computed per sender. No other player's fights are exposed. The threat list on the current target shows party members ordered by aggro value, highest first.
- **Wind-up warning (CMB-03).** It comes from the public `combat_enemy_cast` table: The hostile row shows "{enemy} winds up {ability} → {target} · lands in N rounds". N is `landsAtRound` minus the current round, plus 1, so "lands this round" when N = 1. A warning line also appears in the feed when the cast is announced.

**Rounds on screen (CMB-04, CMB-06)**
- **Feed grouping.** The feed shows a "Round N" header at each round boundary the client has seen. Events are placed by `createdAt` against round `startedAtMicros`, per the 46.1 contract. The client keeps the boundaries it has seen, because round rows are deleted when the fight ends. Opening lines sit before Round 1. Narration that arrives late is shown where it lands, tagged with the round it narrates (from `combat_narrative.roundNumber` or the request).
- **Round timer.** A countdown bar with the seconds left sits on the hotbar, driven by `timerExpiresAtMicros` and the Phase 47 server-clock skew. At 0 it shows "Resolving…" until the next round row arrives.
- **Your choice.** The chosen slot is highlighted, with a label such as "Firebolt → Rotfang". With no choice, an "Auto-attack → {target}" chip shows. A Ready button records an auto-attack choice (`submit_combat_action` with no ability), so the round can end early.
- **Rounds remaining.** In combat, effect chips and hotbar cooldowns show "N rounds" instead of seconds, from `roundsRemaining`. Out of combat the Phase 47 wall-clock display is unchanged.

**Party, Flee and vitals (CMB-05)**
- The header shows an "In combat" tag while the active character is in a fight.
- **Ally targeting.** Clicking a party member (vitals-rail party card, or strip chip on mobile) sets the ally target for the next ability choice (`targetCharacterId`). The selected ally is highlighted. The default ally target is the player. Abilities that do not take an ally ignore it.
- **Flee.** A Flee button sits at the end of the hotbar during combat (`flee_combat`) and shows "Flee chosen" once picked.
- **Damage flash.** The HP bar flashes when the player's HP drops. With reduced motion there is no animation, only a brief color change.

**Mobile (390x844)**
- A compact encounter strip sits above the feed: one hostile chip per enemy, with an HP sliver, a ring on the current target and a wind-up marker. Tap a chip to target. Tapping the strip header opens the full encounter list in a sheet.
- The mobile hotbar row carries the round timer, Ready and Flee.
- Ally targeting uses the strip's party chips.
- The combat feed stays readable, with round headers kept compact.

### Claude's Discretion
- The view's name and shape (for example `my_combat_aggro`), as long as the SpacetimeDB view rules hold: index lookups only, `ctx.sender`-scoped and public.
- The component and file layout under `src/`, for example `src/combat/`.
- Exact animation timings, within the reduced-motion rules.

### Deferred Ideas (OUT OF SCOPE)
- **Enemy effect indicators and cast bar:** enemy DoT/HoT/debuff indicators and a full enemy cast bar (backlog 999.1).
- **Combat balance:** review it in the end-of-milestone playtest.
- **Live round play checks:** deferred to the end-of-milestone UAT.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CMB-01 | Right rail becomes the encounter: hostiles with health, boss tag, difficulty color; click to target; Tab cycles | Q2 (tables and keys), Q3 (difficulty rule, verified against `v2.2-client`), Q6 (`set_combat_target`, cycling scope), Q9 (combat detection) |
| CMB-02 | Threat order on the current target from `aggro_entry` | Q1 (the view: schema, indexes, chain, binding, test pattern) |
| CMB-03 | Enemy wind-up warning from `combat_enemy_cast` | Q2 (cast + `enemy_ability` + pets), Pitfall 6 (the N formula race), Q4 (feed block) |
| CMB-04 | Feed groups by round; effects and cooldowns show rounds | Q4 (header placement, late narration), Q5 (rounds cooldowns; the sweep-fraction finding) |
| CMB-05 | "In combat" header tag, ally targeting, Flee on hotbar, damage flash | Q5, Q6, Q7, Pitfall 2 (dead ally), Pitfall 9 (mobile account menu) |
| CMB-06 | Round timer on the hotbar; chosen action or auto-attack chip | Q5 (timer, chip, Ready, Flee, reducer args), Q9 |
</phase_requirements>

## Summary

Phase 48 is a client phase with one small server addition. Everything the encounter needs is already public and already bound in `src/module_bindings` except the threat order: `aggro_entry` is a private table (columns `id, combatId, enemyId, characterId, petId?, value`; indexes `by_combat`, `by_enemy`). No new index is needed. A public `ViewContext` view can reach it with four chained index lookups that already exist: `player.id` (ctx.sender) -> `character.by_owner_user` -> `combat_participant.by_character` -> `aggro_entry.by_combat`. The repo already has the same shape in `my_group_invites` (player -> characters by owner -> invites by character). The view is additive, so it publishes locally with the 46.1-09 procedure (`--break-clients`, no `--clear-database`, key length checked before and after) and the client then subscribes it with `toSql(tables.myCombatAggro)` exactly like `my_character_effects`.

The client work is a new combat data block in `createGameData` (keyed bindings on the Phase 47 pattern), a handful of pure modules under `src/combat/`, and extensions to five existing surfaces (ContextRail, FeedShell composer, FeedView/feed store, HeaderBar, VitalsRail/VitalsStrip/PartyBlock) plus a mobile strip and sheet. The decisive design facts, all verified in the server source: in-combat is "own `combat_participant` row exists" (participant rows are deleted at every fight end and on a successful flee); `combat_enemy` rows (including dead ones) persist until the fight ends, then everything is deleted in one transaction; resolved `combat_round` rows persist until fight end; `combat_narrative` rows are never deleted and carry the only round number for late narration.

Research found nine places where the approved UI-SPEC meets the engine and needs a decision or a guard, all listed in Common Pitfalls and Open Questions. The ones that change the plan: (1) the rounds-cooldown sweep fraction `roundsRemaining / round(durationMicros / 10s)` is always 1 because the server rewrites `durationMicros = roundsRemaining x 10 s` every round; derive the total from `ability_template.cooldownSeconds` instead; (2) sending a dead or departed ally as `targetCharacterId` makes the server refuse the whole choice (A26 as written is a trap); (3) on mobile the only Log out path is the More sheet behind the tab bar that combat hides (A5 checker note confirmed); (4) the Phase 47 `VitalsStrip` test pins `Party n` as a button in a state where `inCombat` is true, so the new combat UI must gate on a new `game.combat.active`, not on `game.inCombat`; (5) the screen union change must go through `ActiveScreen`, not the `SCREENS` registry, or `screens.test.ts` breaks.

**Primary recommendation:** Add `my_combat_aggro` (a `t.row` projection without pet rows) to `spacetimedb/src/views/combat.ts` with a no-scan unit test, publish locally, regenerate bindings; then build the client in this order: pure modules -> data block and queries -> feed store round entries -> encounter rail and round row -> hotbar/header/vitals changes -> mobile strip and sheet.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Threat order per sender | Database / Storage (SpacetimeDB view) | Browser (percent math, sort) | `aggro_entry` is private; only a server view can expose the sender's own fights. Percent and ordering are presentation |
| Combat state (enemies, rounds, choices, casts) | Database / Storage (public tables) | Browser (filtered subscriptions) | Already public; the client only filters by `combatId` / `characterId` |
| Round clock and "Resolving..." | Browser | Database (`timerExpiresAtMicros`) | The deadline is server time; the client counts down with the Phase 47 skew. The server alone resolves rounds |
| Round headers and boundaries in the feed | Browser (feed store) | Database (`combat_round.startedAtMicros`) | Rows are deleted at fight end, so the browser must own the boundaries it saw |
| Late-narration round tag | Browser (correlate `event_private` with `combat_narrative`) | Database | The event row has no round field; only `combat_narrative` does |
| Target and ally selection, Tab cycling | Browser (UI state) | API (`set_combat_target`, `use_ability`, `submit_combat_action`) | Selection is local; the server validates and stores the choice |
| Difficulty color, boss tag | Browser | Database (`enemy_template.level`, `isBoss`) | Pure presentation of table values |
| Round cooldown display | Browser | Database (`ability_cooldown.roundsRemaining`) | The server owns the counter; the client formats it |
| Mobile layout switch (strip, hidden tab bar) | Browser (AppFrame) | - | Layout only |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vue | ^3.5.43 | Components, composables | Already the client framework [VERIFIED: package.json] |
| spacetimedb | 2.10.1 (root and `spacetimedb/`) | Client SDK and server module | Installed; `toSql`, typed `tables`, views [VERIFIED: node_modules/spacetimedb/package.json] |
| @phosphor-icons/vue | 2.2.1 | Icons | Project rule; `PhCrosshairSimple`, `PhHourglassMedium`, `PhWarning`, `PhPersonSimpleRun`, `PhCheck`, `PhCaretUp`, `PhCircleNotch`, `PhSword`, `PhX`, `PhDotsThree` all present in the installed index [VERIFIED: grep of dist/index.d.ts] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^5.0.2 | Unit and component tests | All new tests; `@vitest-environment happy-dom` docblock for components |
| @vue/test-utils | 2.5.1 | Component mounting | Component tests |
| `@game-data/*` alias | (repo) -> `spacetimedb/src/data` | Server constants on the client | `combat_constants` (`EFFECT_ROUND_CONVERSION_MICROS`, `MIN_EFFECT_ROUNDS`, `ROUND_TIMER_MICROS`), `mechanical_vocabulary` (`TARGET_RULES`) [VERIFIED: vite.config.ts:15, tsconfig.json:11] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `t.row('MyCombatAggroEntry', ...)` projection | `AggroEntry.rowType` | Reuse needs `AggroEntry` threaded through `ViewDeps`, `registerViews({...})` in `index.ts`, and the key list in `views/llm.test.ts` "registerViews wiring" (that test builds deps from a fixed name list; a missing dep throws at registration). Projection needs none of that and drops `petId` |
| New `game.combat.active` gate | Reuse `game.inCombat` | `VitalsStrip.test.ts` line 235 mounts a party with `inCombat: ref(true)` and pins `Party 3` as a `BUTTON` followed by `.member-chip` entries. Gating combat UI on `inCombat` breaks it (Pitfall 4) |

**Installation:** none. No package is added. (`@phosphor-icons/vue` is already a dependency.)

## Package Legitimacy Audit

No external package is installed or upgraded by this phase. `gsd-tools query package-legitimacy check` was not needed.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | - | - | - | - | - | - |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 SERVER (SpacetimeDB module)                                   CLIENT (Vue)
 ───────────────────────────                                   ────────────
 resolve_round_timer / early resolve ─┐
   combat_round (insert N+1, N->resolved)    ─ public ──┐
   combat_action (own choice rows)           ─ public ──┤
   combat_enemy / combat_enemy_cast          ─ public ──┤   keyed bindings (createKeyed)
   combat_participant (deleted on end/flee)  ─ public ──┼─> own: by character_id  -> combatId
   combat_narrative (never deleted)          ─ public ──┤   fight: by combat_id   -> enemies, rounds,
   active_pet / enemy_template / enemy_ability ─ public ┤           casts, narratives, pets, participants
   ability_cooldown.roundsRemaining          ─ public ──┤   id lists: enemy templates, enemy abilities
   event_private (combat lines, narration)   ─ events ──┤   by character: combat_action (own)
   aggro_entry (PRIVATE) ──► my_combat_aggro ─ view ────┘   static: SELECT * FROM my_combat_aggro
                              player -> character.by_owner_user                │
                              -> combat_participant.by_character               ▼
                              -> aggro_entry.by_combat           createGameData().combat  (+ inert default)
                                                                              │
              ┌───────────────────────────────┬──────────────────────────────┼───────────────────────────┐
              ▼                               ▼                              ▼                           ▼
   src/combat pure modules          feed store (round entries,       AppFrame / ContextRail       HotbarRow + RoundRow
   difficulty, hostiles, threat,    wind-up blocks, narratedRound)   Encounter panel / strip      timer, chip, Ready, Flee,
   windup, roundClock, choice,      -> classifyEntry -> FeedView     HeaderBar In combat tag      chosen slot, "N rounds"
   cycling, ally, emphasis                                           VitalsRail/Strip/PartyBlock  (reducers: use_ability,
                                                                     ally target + damage flash    submit_combat_action,
   COMBAT_KEY controller (ally id, last requested target, Tab)       Encounter sheet (mobile)      flee_combat, set_combat_target)
```

### Recommended Project Structure
```
spacetimedb/src/views/combat.ts          # + my_combat_aggro (additive)
spacetimedb/src/views/combat.test.ts     # NEW: no-scan, other-fight, per-sender, pet rows
src/combat/
  difficulty.ts      # conToken(diff) + meaning word
  hostiles.ts        # hostileRows(enemies, templates, casts, abilities, ...) ascending id
  threat.ts          # threatRows(entries, target, names, selfId): sort, percent, You
  windup.ts          # windupText(), landsIn(); two N rules (rail live, feed at announcement)
  roundClock.ts      # remaining/seconds/fraction/resolving from timerExpiresAtMicros + clock
  choice.ts          # choiceChip(action, ability, target, ally, down) -> text/style/icon id
  cycling.ts         # nextTargetId(list, current, requested, dir)
  ally.ts            # allyTargetFor(ability, selectedId, participants) (Pitfall 2)
  emphasis.ts        # split the last standalone integer
  roundCooldown.ts   # in-combat cooldown view (Q5)
  useCombatController.ts  # COMBAT_KEY provide: allyTargetId, requestTarget, cycle, lastRequested
  useDamageFlash.ts  # composable over an hp ref
  EncounterPanel.vue, HostileCard.vue, ThreatBlock.vue, EncounterStrip.vue,
  EncounterSheetBody.vue, RoundRow.vue, InCombatTag.vue
src/game/queries.ts, gameData.ts, context.ts   # + combat block, inert defaults
src/console/feedStore.ts, lines.ts, FeedLine.vue, FeedView.vue   # round + windup entries, tag
```

### Pattern 1: Per-sender view by chained index lookups
**What:** `ctx.sender` -> player -> own characters -> participant rows -> aggro by combat. Dedupe combat ids, drop pet rows, project four columns plus `id`.
**When to use:** any public per-user read of a private table.
**Example:**
```typescript
// Source: spacetimedb/src/views/groups.ts (my_group_invites, same chain shape) and views/llm.ts (t.row projection);
// rules: CLAUDE.md "Views can ONLY access data via index lookups" and
// https://spacetimedb.com/docs/functions/views (index-only, chained lookups allowed, re-evaluated when the read set changes)
export const registerCombatViews = ({ spacetimedb, t, CombatResult, CombatLoot }: ViewDeps) => {
  // ...existing views...
  const MyCombatAggroEntry = t.row('MyCombatAggroEntry', {   // not "MyCombatAggro": that is the view's own generated struct name
    id: t.u64().primaryKey(),
    combatId: t.u64(),
    enemyId: t.u64(),
    characterId: t.u64(),
    value: t.u64(),
  });

  spacetimedb.view(
    { name: 'my_combat_aggro', public: true },
    t.array(MyCombatAggroEntry),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player || player.userId == null) return [];
      const combatIds = new Set<bigint>();
      for (const character of ctx.db.character.by_owner_user.filter(player.userId)) {
        for (const row of ctx.db.combat_participant.by_character.filter(character.id)) combatIds.add(row.combatId);
      }
      const out: any[] = [];
      for (const combatId of combatIds) {
        for (const e of ctx.db.aggro_entry.by_combat.filter(combatId)) {
          if (e.petId) continue; // pet rows carry the owner's characterId; the UI shows party members only
          out.push({ id: e.id, combatId: e.combatId, enemyId: e.enemyId, characterId: e.characterId, value: e.value });
        }
      }
      return out;
    }
  );
};
```

### Pattern 2: Keyed binding by `combatId` with a derived key
**What:** the key is a `computed` over the own participant row. Reuse `createKeyed` / `keyedRows` / `keyedIdList` exactly as `gameData.ts` does for `hotbars`, `members` and `known`.
**Example:**
```typescript
// Source: src/game/gameData.ts keyedTable(), src/game/keyedBinding.ts
const ownParticipant = keyedTable<CombatParticipant, bigint>(
  characterKey, (c) => c.db.combatParticipant, queries.combatParticipantsOf,
  (row, k) => row.characterId === k);
const combatKey = computed<bigint | null>(() => keyedRows(ownParticipant).value[0]?.combatId ?? null);
const enemies = keyedTable<CombatEnemy, bigint>(
  combatKey, (c) => c.db.combatEnemy, queries.combatEnemies, (row, k) => row.combatId === k);
// same shape: combatRound, combatEnemyCast, combatNarrative, activePet, combatParticipant (by combat)
// id lists derived from the enemies: enemyTemplate by id, enemyAbility by enemy_template_id (keyedIdList)
```

### Pattern 3: Round entries in the feed store (client-made lines)
**What:** a round header and a wind-up block are feed entries (kinds `round`, `windup`), ingested through the same microtask batch as server rows, with a source rank after every server source so a same-timestamp tie sorts after the server lines. This makes "events at exactly `startedAtMicros(N)` belong to round N-1" fall out of the sort, and "the line never moves when the round rows are deleted" fall out of the store holding the entry.
**Detail:** `compareBatch` sorts by `createdAtMicros`, then `SOURCE_RANK`, then id [VERIFIED: src/console/feedStore.ts:106-112]. Add rank 4 for `combat` (header id = roundNumber). Dedupe key `round:${combatId}:${roundNumber}` (spec) and `windup:${castRowId}`.

### Anti-Patterns to Avoid
- **Gating Phase 48 UI on `game.inCombat`:** breaks `VitalsStrip.test.ts:235` (see Pitfall 4). Add `game.combat.active`.
- **Adding `'encounter'` to `SCREENS` / `ScreenId`:** `screens.test.ts` pins seven screens, `HEADER_SCREENS`, and mounts every registry component for empty-state copy. Add it only to `ActiveScreen` (like `'more'`).
- **Computing the wind-up N for the feed block from the currently open round:** race with the round row (Pitfall 6). Use `landsAtRound - announcedRound`.
- **Subscribing a whole public combat table:** every query carries a WHERE on an indexed column (47 rule). `toSql` produced valid SQL for all of them in this checkout (Q2).
- **Optimistic UI** (CLAUDE.md): chosen slot, chip, target ring and Flee state all derive from rows.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Keyed subscriptions that swap on apply | A new subscription manager | `createKeyed`, `keyedRows`, `keyedIdList`, `idListKey` in `src/game/` | Handles stale swap, failure promote, reconnect re-attach, scope dispose |
| Server-time countdown | `Date.now()` math | `game.clock.nowMicros()` + `useCooldownTicker` (250 ms, 1 s under reduced motion, runs only while active) | Skew and reduced-motion rule already solved and tested |
| Typed WHERE SQL | String-built SQL | `toSql(tables.x.where(...))` in `queries.ts` | Verified to emit valid SQL, including the optional `active_pet.combat_id` column |
| Round-to-time conversion | A client constant | `@game-data/combat_constants` (`EFFECT_ROUND_CONVERSION_MICROS` 4 s, `MIN_EFFECT_ROUNDS` 1, `ROUND_TIMER_MICROS` 10 s) | Server source of truth (project rule); no duplicate |
| Ally-vs-enemy ability target | A client list of kinds | `ability_template.targetRule` (`single_ally`, `single_enemy`, `self`, `all_*`, ...) from `@game-data/mechanical_vocabulary` `TARGET_RULES` | Data-driven abilities (v2.0 rule); kind lists go stale |
| Keeper/narration HTML | Any markup path | Text nodes only; existing guards ban `v-html`, `<svg`, literal colors | 47 contract; test with the `<img onerror>` string |
| Reduced-motion check | New media query code | `prefersReducedMotion()` from `src/console/pinning.ts` | Already used by hotbar and feed |

**Key insight:** every hard part (keyed subscriptions, skew, ticker, guards) already exists from Phase 47. This phase is new data wiring and new pure derivations; the risks are the engine edge cases in Common Pitfalls, not the plumbing.

## Settled Questions (with evidence)

### Q1. The threat-order view

**Schema** [VERIFIED: spacetimedb/src/schema/tables.ts:1206-1222]: `aggro_entry`, **private** (no `public` flag). Columns `id` (u64 pk autoInc), `combatId`, `enemyId`, `characterId`, `petId?`, `value` (u64). Indexes `by_combat` (btree combatId), `by_enemy` (btree enemyId). The bindings carry only the row struct `AggroEntry` in `types.ts:106`; there is no `aggroEntry` table accessor in `index.ts` (grep count 0).

**Who writes it:** one entry per (enemy, participant) at enemy creation (`reducers/combat.ts:140`); pet entries use `characterId = owner.id` with `petId` set (`reducers/combat.ts:1955`, `helpers/combat.ts:1383`); damage updates the character's non-pet entry (`helpers/combat.ts:433-441`); a participant's entries are deleted when they die (`markNewlyDeadParticipants`, combat.ts:1826-1833) or flee (combat.ts:2839-2842); all are deleted at fight end (combat.ts:432). So the threat list naturally omits dead members.

**Indexes for the chain (all exist, no new index):** `player.id` (pk), `character.by_owner_user` [tables.ts:279-286], `combat_participant.by_character` [tables.ts:1061-1066], `aggro_entry.by_combat`. The additive publish therefore needs no index and no `--clear-database`.

**Can a view chain lookups?** Yes. `my_group_invites` already does player -> `character.by_owner_user` -> `group_invite.by_to_character` [VERIFIED: views/groups.ts]; `my_character_effects` does player -> character -> `group_member.by_group` -> `character_effect.by_character` [VERIFIED: views/effects.ts]. The official docs state views "can access multiple tables through chained index lookups", must not use `.iter()`, and re-evaluate "when SpacetimeDB detects something they read has since changed" [CITED: spacetimedb.com/docs/functions/views].

**Per-sender subscription and refresh:** a `ViewContext` view (`spacetimedb.view`, `ctx.sender`) is computed per subscriber [CITED: same page; CLAUDE.md "ViewContext vs AnonymousViewContext"]. The client subscribes the plain `SELECT * FROM my_combat_aggro` once per connection, the way `myCharacterEffects` is subscribed today (`queries.ts:49`, a static binding in `gameData.ts`). Updates arrive as ordinary insert/delete (and update when the view row declares a primary key; `id` is declared `primaryKey()` in the projection above, and the SDK validates at most one primary key per view row [VERIFIED: node_modules/spacetimedb/src/server/views.ts:268-282]). `bindTable` already tolerates views without `onUpdate` [VERIFIED: src/net/bindTable.ts:19-21].

**Bindings and client subscription:** after `pnpm spacetime:generate -y` the module yields `src/module_bindings/my_combat_aggro_table.ts`, an `myCombatAggro` entry in `index.ts` (like `my_quests`), the empty struct `MyCombatAggro` and the row struct `MyCombatAggroEntry` in `types.ts` (like `MyLlmJobs`/`MyLlmJob`). The row name must differ from the view's PascalCase name `MyCombatAggro`, hence `MyCombatAggroEntry`. Client query: `toSql(tables.myCombatAggro)`; `GameConn.db` gains `myCombatAggro: Row<MyCombatAggroEntry>`.

**Existing pattern to copy:** `spacetimedb/src/views/combat.ts` (`my_combat_results`, `my_combat_loot`), `views/groups.ts`, `views/llm.ts` (t.row projection with a name, `[...ctx.db.llm_job.by_player.filter(ctx.sender)]`). **Test pattern to copy:** `spacetimedb/src/views/llm.test.ts`: `createRecordingServerMock` + `capturedViews()`, `createMockDb(seed, { strict: true })` wrapped in the `noScanDb` Proxy that throws on any `iter`, `ADMIN`-style per-sender assertions. The test file must `vi.mock('spacetimedb/server', ...)` and `await import('../schema/tables')` in `beforeAll` like llm.test.ts does.

**Publish:** exactly the 46.1-09 procedure: key check before (`spacetime sql --server local uwr "SELECT key_set, key_length FROM admin_llm_status"`, expected 108), `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null`, key check after, `spacetime logs` for panics, then `pnpm spacetime:generate -y`, `pnpm exec vue-tsc -b`, full client suite. Local only; never maincloud; never `--clear-database`. A view addition is additive, so the migration plan should list only a new view.

### Q2. Combat data the client needs: public? bound? filter column?

All of these are `public: true` and have table bindings [VERIFIED: tables.ts + `grep "^  <name>: __table" src/module_bindings/index.ts` = 1 for each]. Generated SQL for the filters below was produced with `toSql` in this checkout [VERIFIED: vitest probe, then deleted].

| Table | Public / bound | Subscribe filter (indexed?) | Key / fits pattern | Used for |
|-------|---------------|-----------------------------|--------------------|----------|
| `combat_participant` | yes / yes | own: `character_id = me` (`by_character`); fight: `combat_id = k` (`by_combat`) | own keyed by `characterKey`; fight keyed by `combatId` | in-combat flag (own row exists), `combatId`, status (`active`/`dead`), ally-left detection |
| `combat_encounter` | yes / yes | not needed | - | not subscribed: participant rows are deleted at every fight end, so the participant row alone defines "in an active fight" (below) |
| `combat_enemy` | yes / yes | `combat_id = k` (`by_combat`) | keyed by `combatId` | `displayName`, `currentHp`, `maxHp`, `enemyTemplateId`; ascending id order; dead rows (`currentHp 0`) persist until fight end |
| `enemy_template` | yes / yes | `id = a OR id = b` (pk) | `keyedIdList` over the enemies' `enemyTemplateId`s | `level`, `isBoss?` (nothing sets `isBoss` yet, 46.1) |
| `enemy_ability` | yes / yes | `enemy_template_id = a OR ...` (`by_template`) | `keyedIdList` over the same ids | ability `name` for the wind-up (join by `abilityKey` and the enemy's template id) |
| `combat_round` | yes / yes | `combat_id = k` (`by_combat`) | keyed by `combatId` | open round (`state = 'action_select'`): `roundNumber`, `timerExpiresAtMicros`, `startedAtMicros` |
| `combat_action` | yes / yes | own: `character_id = me` (`by_character`) | keyed by `characterKey` | the player's choice for the open round (party members' rows are readable but not needed; filtering by `by_character` keeps the traffic to one row) |
| `combat_enemy_cast` | yes / yes | `combat_id = k` (`by_combat`) | keyed by `combatId` | wind-up row, feed block |
| `combat_narrative` | yes / yes | `combat_id = k` (`by_combat`) | keyed by a **lingering** combat key (Pitfall 7) | `roundNumber` for the late-narration tag; rows are never deleted |
| `active_pet` | yes / yes | `combat_id = k` (`by_combat`, optional column; `toSql` emits `"active_pet"."combat_id" = 5`) | keyed by `combatId` | pet name as a wind-up target |
| `ability_cooldown` | yes / yes (47) | `character_id = me` (47, unchanged) | existing | `roundsRemaining` |
| `character_effect` | yes, **but read through the `my_character_effects` view** (47) | existing | existing | effect chips (unchanged, 47 A13) |
| `aggro_entry` | **private** | via the new view | static, once per connection | Q1 |
| `combat_moment`, `round_timer_tick`, `combat_loop_tick` | private | - | - | never |

Notes:
- **Is anything missing from the bindings?** Only `aggro_entry`. `submit_combat_action` is present and `use_ability_realtime` is gone (46.1-09).
- **`combat_encounter` is not needed.** `clearCombatArtifacts` deletes every participant row of the fight and every enemy, round, action, cast, aggro and pending-add row, then the callers set the encounter `state = 'resolved'` [VERIFIED: reducers/combat.ts:371-461 and the three end paths at 1346, 2170, 2272, 3041]. A fled player's row is deleted too (combat.ts:2855). Own participant row present = in a fight; absent = out.
- **Extend `partyKey`** (the id list behind `knownCharacters`) with the fight's participant character ids, so threat names, ally HP and the You card resolve even for a participant who is not in `group_member` (for example after leaving the group). The row stays `known` per existing rules; unknown characters render as `Member`.
- **Shared-cache rule** (gameData.ts header): the SDK cache is shared by every subscription of one table, so each keyed binding passes a filter equal to its query (own vs fight rows of `combat_participant`).

### Q3. The difficulty-color rule (old client)

Source: `git show v2.2-client:src/composables/useCombat.ts` lines 313-331 (`activeEnemyConClass`) and 433-436, 514-517 [VERIFIED]:

```
diff = Number(enemyTemplate.level - character.level); missing template -> 'conWhite'
diff <= -5 conGray | diff <= -2 conLightGreen | diff === -1 conBlue | diff === 0 conWhite
diff === 1 conYellow | diff === 2 conOrange | otherwise conRed
```

This matches the UI-SPEC table exactly. Token mapping [VERIFIED: src/styles/tokens.client.css:9-15]: `conRed`->`--color-con-red`, `conOrange`->`--color-con-orange`, `conYellow`->`--color-con-yellow`, `conWhite`->`--color-con-white`, `conBlue`->`--color-con-blue`, `conLightGreen`->`--color-con-light-green`, `conGray`->`--color-con-gray`. Today only `FeedLine.vue` uses `--color-con-orange|red|light-green`; no difficulty helper exists in `src/`. Implement `difficulty.ts` returning `{ token, meaning }` and apply it through CSS classes (`.con-red { color: var(--color-con-red) }`), not inline styles, so the design guards see only token names.

### Q4. Feed round grouping

**Contract** (46.1-09, confirmed in code): `startRound` stores `startedAtMicros = ctx.timestamp micros` and `appendPrivateEvent` stores `createdAt = ctx.timestamp`, so every event written in the transaction that opens round N+1 has `createdAt == startedAtMicros(N+1)`, which belongs to round N (`start(N) < t <= start(N+1)`). Resolved rows persist until the fight ends [VERIFIED: combat.ts:3220 marks `resolved`; the only `combat_round` delete is clearCombatArtifacts:387]. Rows published before 46.1 carry `startedAtMicros = 0`: ignore a boundary of 0.

**Design (recommended):**
1. Round headers are feed entries (source rank 4, kind `round`, `createdAtMicros = startedAtMicros(N)`, id = roundNumber, key `round:${combatId}:${roundNumber}`). The store holds them, so deleting the round rows at fight end changes nothing on screen.
2. Ingest a header only for a row whose `state === 'action_select'` seen in the `combat_round` rows watch (`flush: 'sync'`). At a fight start the by-combat subscription applies after round 1 exists, so round 1 arrives in the *snapshot*, not as a live insert; "open round only" yields `Round 1` at a fight start and a single `Round N` after a mid-fight reload, without dumping resolved rounds. Dedupe by key.
3. The same-transaction ordering holds: the SDK applies all table updates of one `TransactionUpdate`, then dispatches every callback in one synchronous loop [VERIFIED: node_modules/spacetimedb/src/sdk/db_connection_impl.ts:923-928, 1042-1052], and the store flushes on a microtask, so the end-of-round lines and the next header land in one batch, where the tie-break rank puts the header last.
4. **Insert, do not append, a header whose snapshot arrives late.** A round-1 header arrives one round trip after the opening lines. If a later-timestamp line is already in the store, place the header before the first entry with `createdAtMicros > start(N)`, scanning backward and stopping at a `local` entry (local echoes use the client clock). Unit-test both the append and the insert case.
5. Open round = the `combat_round` row with `state = 'action_select'` for the own fight; the header whose (combatId, roundNumber) equals it is the accent header, all others neutral, so every header turns neutral when the rows disappear.

**Late narration tag.** The `event_private` row (`kind 'combat_narration'`, `segments`) has **no round field** [VERIFIED: tables.ts:1383-1402]. `handleCombatNarrationResult` inserts one `combat_narrative` row (`combatId`, `roundNumber`, `narrativeText`, `createdAt = ctx.timestamp`) and then one `event_private` row per participant with the same `createdAt` and `message = text` in the same transaction (`helpers/combat_narration.ts:411-426`). Correlate by `createdAtMicros` equality (confirm with text equality) and set `narratedRound` on the feed entry (same pattern as `setQueued`), from a `watch` on the narrative rows, so the tag is captured in the entry and survives the binding going away. The tag shows when `narratedRound` differs from the round of the nearest preceding header. The executor drops narration jobs older than 20 s [VERIFIED: data/llm_limits.ts:53 `LLM_NARRATION_MAX_AGE_MICROS = 20_000_000n`], and the victory/defeat narration arrives after the fight ended, when the own participant row (and the by-combat key) is gone. Keep the narrative binding alive for the last `combatId` for 30 s after the fight ends (20 s plus margin, `[ASSUMED]` margin) so a late line can still be tagged; if no narrative row matches, no tag (spec A22).

**Fit with `classifyLine`:** extend `LineSource` and `FeedLineView` additively. New `LineKind`s: `round` (header, carries `roundNumber`) and `windup` (carries `ability` name for the 500-weight span). Combat-kind lines (`combat`, `damage`, `heal`, `ability`, `buff`, `debuff`, `combat_prompt`, `combat_status`) stay on `classifyByKind`; `FeedLine.vue` stops coloring the whole `damage`/`heal` line and splits the last standalone integer (`emphasis.ts`). `combat_round_header` and `combat_resolving` currently map to `combat` lines (lines.ts:95-96, pinned in `lines.test.ts:210-211`); the spec wants them to render nothing, and the server never writes either kind today [VERIFIED: grep of spacetimedb/src returns no producer], so return `[]` for them and update that one test row.

**Wind-up feed block.** Appended once per cast row id, only for a row observed *inserted* after the cast binding applied (the initial snapshot is skipped; the rail row already shows it). Its createdAt is the `startedAtMicros` of round `announcedRound + 1` (the cast is announced in the enemy phase of round N and round N+1 is opened in the same transaction, `reducers/combat.ts:2441-2445` and 3221), falling back to the server-clock now, with rank 5 so it follows the header.

### Q5. Hotbar changes (timer, chip, Ready, Flee, cooldowns)

**Reducer arguments** [VERIFIED: src/module_bindings/*_reducer.ts]: `use_ability { characterId, abilityTemplateId, targetCharacterId? }`; `submit_combat_action { characterId, abilityTemplateId?, targetEnemyId?, targetCharacterId? }`; `flee_combat { characterId }`; `set_combat_target { characterId, enemyId? }`. In TS: `conn.reducers.submitCombatAction({ characterId, targetEnemyId })` (object syntax; `option` args are omitted or `undefined`). Add `submitCombatAction`, `fleeCombat`, `setCombatTarget` to `GameReducers` in `context.ts`; `useAbility` already exists there.

**Which reducer for a slot in combat:** keep `use_ability` (HotbarRow already calls it with `{ characterId, abilityTemplateId }`). In combat it routes to `deps.submitCombatChoice` with `actionType 'ability'` and the ally target only [VERIFIED: reducers/items.ts:779-815], and the resolver uses `character.combatTargetEnemyId` (fallback lowest living enemy) for the enemy [VERIFIED: reducers/combat.ts:2786-2790]. So the stored `ability` row usually has **no `targetEnemyId`**: the chip target for an enemy-rule ability is `row.targetEnemyId ?? character.combatTargetEnemyId`, and it follows retargeting, which matches what resolves. Ready uses `submit_combat_action` with `targetEnemyId = current target` (that path stores it and updates the character's target).

**Timer.** `combat_round.timerExpiresAtMicros` (u64 micros) minus `game.clock.nowMicros()`; seconds `ceil(remaining / 1e6)`, never `0s`; fraction `remaining / (timerExpiresAtMicros - startedAtMicros)` clamped. Reuse `useCooldownTicker({ clock, active: hasOpenRound })` (250 ms, 1 s under reduced motion). Server skew samples come from event rows today (`gameData.ts onEvent`); additionally sample `startedAtMicros` when a round row is first seen live (optional; each fight start already produces several event rows, so the first sample is immediate). `Number()` on epoch micros is safe (< 2^53).

**Rounds are 10 s but end early:** with one player the round resolves inside the choice reducer, so `Resolving...` will flash for one round trip and a fresh 10 s round appears (46.1-09 contract).

**Choice chip, Ready, Flee** derive only from the own `combat_action` row whose `roundNumber` equals the open round: no row -> `Auto-attack -> {target}`; `auto_attack` -> accent chip; `ability` -> `{Ability} -> {target}` (`targetRule === 'single_ally'` shows the ally, `single_enemy` shows the enemy, other rules show no target); `flee` -> `Fleeing`. Rows of a resolved round are deleted in the transaction that opens the next (`clearRoundChoices`, combat.ts:3221), so the chip and chosen slot clear themselves. Choosing an ability replaces a flee row ("a new choice updates it in place", 46.1-09).

**Round cooldowns (CMB-04/06).** `ability_cooldown.roundsRemaining` is what the engine checks (`roundCooldownRemaining`, helpers/combat_round_state.ts:226). In combat treat `roundsRemaining > 0` as cooling and ignore the wall-clock fields; out of combat `roundsRemaining` is 0 (the fight end rewrites leftover rounds to a wall-clock cooldown, `endCombatCooldowns`). **Finding:** the UI-SPEC sweep fraction `roundsRemaining / max(roundsRemaining, round(durationMicros / 10 s))` is always 1, because `setRoundCooldown` and `decrementRoundCooldowns` both write `durationMicros = roundsRemaining x ROUND_TIMER_MICROS` [VERIFIED: helpers/combat_round_state.ts:244-286, helpers/combat_rounds.ts:65-67]. Derive the total from the ability: `total = max(roundsRemaining, max(MIN_EFFECT_ROUNDS, ceil(cooldownSeconds x 1e6 / EFFECT_ROUND_CONVERSION_MICROS)))` (the server's own `cooldownRounds`, helpers/combat_rounds.ts:50), all from `@game-data/combat_constants` plus the slot's `AbilityTemplate.cooldownSeconds`. Item-bound hotbar slots do not exist: `hotbar.ts` documents that slots carry only `abilityTemplateId` and no item cooldown, so the spec's "item-bound slots keep wall-clock seconds" clause has no data source; drop it.

**Slot state in `HotbarRow.vue`:** it computes `cooldownRows` (latest by end time), `slotStates` and a ticker that runs only while something is cooling. Add `roundsLeft` per slot when `game.combat.active`; the ticker is not needed for rounds (rows change on round resolution), keep it for out-of-combat. Add `chosen` (from the own `ability` action row, `abilityTemplateId` match) and `inert` while resolving. The `RoundRow` is a **separate component** placed in `FeedShell.vue`'s composer above `HotbarRow`, so `HotbarRow.test.ts` (493 lines) keeps its DOM.

### Q6. Targeting

- `set_combat_target({ characterId, enemyId })`: the server rejects an enemy not in the caller's active fight (`failCombat` 'Enemy not in combat'); it does **not** reject a dead enemy (combat.ts:1002-1017), so the client must skip `currentHp 0` rows. The ring follows `character.combatTargetEnemyId` only. The server also moves targets of dead enemies to the next living one at the end of each round (combat.ts:3176-3187) and sets a first target at fight start (combat.ts:149-151).
- **Ally:** `use_ability({ characterId, abilityTemplateId, targetCharacterId })`; for `submit_combat_action` the same field. Hazard in Pitfall 2.
- **Tab cycling scope (A4):** one `keydown` listener (document level, mounted once in `AppFrame`), the same guards as HotbarRow's number keys (`event.repeat`, ctrl/meta/alt, `isComposing`, `isTextField`, `frame.activeScreen.value !== null`, offline) plus: in combat, no `shiftKey`-less modifier other than Shift, and `document.activeElement` is the body or inside `.encounter-panel` or the feed. An open account menu moves focus onto its Log out item, so the focus rule already excludes it. Return without `preventDefault` unless it acts; one living hostile -> do nothing. The next index comes from `lastRequested` (a ref in the controller) so rapid presses advance before the echo. Pure `cycling.ts` takes `(livingIds, currentId, lastRequested, dir)`.
- **Ally selection state:** `allyTargetId` lives in a new `COMBAT_KEY` controller provided from `AppFrame` (like `createConsole`), with an inert default, so `PartyBlock`, `VitalsStrip`, `HotbarRow` and the encounter strip share it without prop drilling. Reset to self when the ally's participant row is gone, when the party changes so the ally is gone, and on fight end.

### Q7. The `'encounter'` screen value and the mobile combat layout

- `ActiveScreen = ScreenId | 'more' | null` [VERIFIED: useScreens.ts:4]. Add `'encounter'` to `ActiveScreen` and to the `open`/`FrameControls.openScreen` parameter, **not** to `SCREENS`/`ScreenId`. `screens.test.ts` pins `SCREENS` to the seven ids, `HEADER_SCREENS`, and mounts every registry component for empty-state copy (`COPY[screen.id]`); a registry entry would fail all three. `tabForScreen`'s `default` already returns the More tab for any unknown value; widen its parameter type only. `HeaderBar.activeScreen` stays `ScreenId | null`; `AppFrame.activeId` must also exclude `'encounter'` (it excludes `'more'` today).
- `useScreens.syncLayout`: also close `'encounter'` when crossing to desktop (the rail is the encounter there). Extend `useScreens.test.ts` (232 lines), additive.
- **Sheet shell:** `Sheet.vue` has a title and a close button only, no meta slot [VERIFIED]. Add a named `meta` slot between the `h4` and the spacer (additive; `Sheet.test.ts` does not pin header children). `AppFrame` renders `EncounterSheet` for `'encounter'` before the generic `Sheet` branch.
- **Mobile combat layout** in `AppFrame.vue` (mobile branch): `LocationRow` and `TabBar` get `v-if="!game.combat.active"` (keep the existing `v-show` logic for the sheet and keyboard cases); the `EncounterStrip` goes between `NoticeBars` and `FeedShell`, collapsed to its header row when `keyboardOpen`. `AppFrame.layout.test.ts` asserts the tab bar and location row exist in the *not-in-combat* mobile case, so it stays green with an inert game.
- **Open sheets at combat start:** `watch(game.combat.active)` -> `screens.close()` on true (except `'encounter'`); on false -> close `'encounter'`. Note `useScreens.close()` refocuses the opener.
- **Account menu on mobile:** see Pitfall 9. The desktop `AccountMenu` lives only in `HeaderBar`; the mobile Log out is `MoreSheet`, reachable only through the tab bar that combat hides.
- **Header:** `HeaderBar` already has `disabled?: boolean` but it sets the native `disabled` attribute and `HeaderBar.test.ts:110-114` pins that. The spec wants `aria-disabled` + focusable + `title`. Add a separate `inCombat` prop (and `roundNumber`) and leave `disabled` untouched; `AppFrame` does not pass `disabled` today.

### Q8. Test blast radius

| File | Pinned thing | Effect | Action |
|------|--------------|--------|--------|
| `src/game/gameData.test.ts` | hand-written `queries: GameQueries` literal; `STATIC_SQL` list; "combat flag: true only when `combatTargetEnemyId` is set" (lines 433-443) | New `GameQueries` members make the literal fail typing; the static binding list gains `myCombatAggro`; the flag test changes if `inCombat` changes source | Add the new queries to the literal and the static SQL; either keep `inCombat` as is and add `combat.active`, or re-source `inCombat` from the participant row and rewrite that test. **Recommended: keep `inCombat` unchanged for effects, add `combat.active` from the participant row** |
| `src/game/queries.test.ts` | per-table WHERE assertions | additive | add the new queries |
| `src/frame/VitalsStrip.test.ts:235` | `partyGame({ inCombat: ref(true) })` expects `Party 3` BUTTON then `.member-chip`s `['Mara 95%','Bo 50%']`, kids order | breaks if combat UI gates on `inCombat` | gate on `combat.active` (inert false in that test) |
| `src/frame/VitalsRail.test.ts:193,204` | effect chip text with `inCombat` true/false | none if effects keep `inCombat` | none |
| `src/rails/PartyBlock.test.ts` | non-interactive cards, Invite button | none out of combat; add combat cases | extend |
| `src/frame/HeaderBar.test.ts:110` | `disabled` -> native `disabled` attribute | none (new `inCombat` prop) | extend |
| `src/screens/screens.test.ts`, `src/frame/tabs` consumers | seven screens, header six | none if `'encounter'` stays out of `SCREENS` | none |
| `src/frame/useScreens.test.ts` | `syncLayout` | additive case | extend |
| `src/frame/ContextRail.test.ts`, `railsShell.test.ts` | three headings `Here, Nearby, Tracking`; 288px | none when not in combat | add a combat case with `combat.active` |
| `src/frame/AppFrame.layout.test.ts`, `AppFrame.screens.test.ts`, `AppFrame.populated.test.ts`, `AppFrame.console.test.ts` | spread `...createInertGame()` into fakes | none if every new `GameData`/context field has an inert default | **rule: new fields are additive with inert defaults** |
| `src/console/lines.test.ts:210-211` | `combat_round_header`/`combat_resolving` -> combat line | changes (render nothing) | update that row |
| `src/console/FeedLine.test.ts`, `FeedView.test.ts`, `feedStore.test.ts` | kinds, damage/heal whole-line class, ordering | extend; update the interim damage/heal expectations | extend |
| `src/hotbar/HotbarRow.test.ts`, `hotbar.test.ts` | slot DOM, cooldown seconds, `aria-label` | none out of combat | extend |
| `src/input/Composer.test.ts` | placeholder `What do you do?` | none out of combat | add the combat placeholder case |
| `src/styles/*.test.ts` (design, colors, scrollbars, tokens 23) | scan every client `.vue`/`.ts`: font sizes 10/12/14/20, weights 400/500, spacing scale on padding/margin/gap, no `#hex`, no `<svg`, no `v-html`, var names from Nocturne or client tokens, 23 tokens | new files are scanned automatically | author to the guards (Pitfall 10) |
| `spacetimedb/src/views/llm.test.ts` "registerViews wiring" | fixed list of dep names | none with the `t.row` projection | none (would break with `AggroEntry` threaded) |

### Q9. Combat start and end detection

`combat.active` = the own `combat_participant` row exists (applied binding). Start: the row appears (fight created in one transaction with enemies, participants and round 1, `reducers/combat.ts:140-200`); the by-combat bindings then subscribe and apply one round trip later, so give the encounter UI an `applied` flag (Pitfall 5). End (victory, defeat, admin end, flee, failure close): the row is deleted in the same transaction that deletes the enemies, rounds and actions, so `active` flips false and the encounter UI unmounts with its data in one tick. `status = 'dead'` keeps the fight UI up (the spec's "You are down"). A reconnect keeps stale rows until the new subscription applies (`bindTable` contract), so a fight that ended while offline clears on re-apply. `character.combatTargetEnemyId` also tracks the fight (set at start, cleared at end) but is a weaker signal (a participant with no living target after a retarget would read false); the existing `inCombat` stays as the effect-chip flag.

## Common Pitfalls

### Pitfall 1: Sweep fraction is always 1
**What goes wrong:** the rounds-cooldown sweep never steps down. **Why:** `durationMicros` is rewritten to `roundsRemaining x 10 s` every round. **How to avoid:** derive the total from `AbilityTemplate.cooldownSeconds` (Q5). **Warning signs:** a unit test with `roundsRemaining 3, durationMicros 30s` returning fraction 1.

### Pitfall 2: A dead or departed ally as `targetCharacterId` poisons every ability choice
**What goes wrong:** with an ally selected (A26 "sent whenever selected") and that ally at 0 HP (the spec keeps dead allies selectable), `submitCombatChoice` refuses even a damage ability: "That target is not in this fight." (combat.ts:3288), and `resolveAbilityChoice` falls back to auto-attack with "Your target is no longer in the fight." (combat.ts:2780). The player silently loses ability use until they re-select. The server also deletes a dead participant's aggro entries and sets `status 'dead'`. **Why it happens:** the server validates `targetCharacterId` for every ability kind, although player damage abilities ignore it (helpers/combat.ts:496-505). **How to avoid:** `allyTargetFor(ability, selectedId, participants)` returns `targetCharacterId` only when `ability.targetRule === 'single_ally'` and the ally's participant is `active` and their HP is above 0; otherwise omit it. The visible selection, ring and resets stay as specified. A dead ally is therefore selectable but not sent (resurrection through this path is refused by the server anyway). Owner-visible deviation from A26: record it.

### Pitfall 3: Tab cycling skips or traps
**What goes wrong:** the server does not reject dead enemies as targets, and Tab inside an input or the account menu must stay native. **How to avoid:** cycle only living hostiles (`currentHp > 0`), keep the scope rule and the one-hostile no-op (Q6), `preventDefault` only when acting.

### Pitfall 4: Gating combat UI on `inCombat` breaks Phase 47 tests
See Q8. `VitalsStrip.test.ts:235` uses `inCombat: ref(true)` for effect rounds only.

### Pitfall 5: "No hostiles left." flash and `Resolving...` at fight start
**What goes wrong:** the own participant row arrives first; the enemy and round bindings (keyed by that row's `combatId`) apply a round trip later, so the panel briefly has zero hostiles. **How to avoid:** `combat.applied` = the enemy binding has applied; show the empty line only when applied and no living hostile; before that render the heading and nothing else. `Resolving...` for "no open round yet" is spec-mandated and acceptable.

### Pitfall 6: Wind-up N off by one in the feed block
**What goes wrong:** the cast is inserted in the transaction that resolves round N and opens round N+1; the cast callback can run before the round binding refreshes, so "current round" reads N and N is one too high. **How to avoid:** the feed block uses the deterministic `landsAtRound - announcedRound` (equals the wind-up length); the live rail row uses `landsAtRound - openRound + 1` (`announcedRound` is set to `roundNumber`, `landsAtRound = roundNumber + windup`, combat.ts:2441-2442). The two strings must be built by one helper.

### Pitfall 7: Late narration cannot be tagged after the fight ends
**What goes wrong:** keyed by the own participant row, the narrative binding is disposed at fight end, but the victory/defeat narration (up to 20 s later) needs `combat_narrative.roundNumber`. **How to avoid:** a lingering key (30 s) and capture `narratedRound` into the feed entry (Q4).

### Pitfall 8: The round-1 header lands out of order
**What goes wrong:** appended after a later line if the subscription round trip loses a race. **How to avoid:** the insert-by-timestamp rule in Q4 step 4.

### Pitfall 9: Mobile account menu unreachable in combat (A5 checker note, confirmed)
**What goes wrong:** the account menu exists only in the desktop `HeaderBar`; on mobile the only Log out is `MoreSheet`, opened by the tab bar that combat hides, so a player cannot log out (or reach anything) during a fight. **How to avoid (recommended, needs an owner nod; see Open Questions):** in combat, a 44px icon-only account button (`PhDotsThree`, `aria-label="Account"`) at the right end of the strip's first row opens `MoreSheet` in a combat mode that lists only Log out. A5 says other sheets are unreachable, so the other rows stay hidden.

### Pitfall 10: Guards trip on new files
**What goes wrong:** `designContract.test.ts` scans every client `.vue` and `.ts`: font sizes 10/12/14/20, weights 400/500, spacing only 0/4/8/16/24/32/48/64 on padding/margin/gap, no `#hex`, no negative spacing px, no `<svg`/`v-html`, var names only from Nocturne/client tokens. **How to avoid:** put the UI-SPEC exception dimensions in `width/height/min-*` (not covered by the spacing rule), build every color with `color-mix(... var(--token) ...)`, apply difficulty color by class. The 23-token pin must stay at 23.

### Pitfall 11: Dead enemies stay in the list
`combat_enemy` rows are deleted only at fight end (combat.ts:436), so a defeated hostile persists at `0/{max}` for the rest of the fight (spec: dimmed, inert, skipped). Do not infer "fight over" from an empty list; the participant row is the signal.

### Pitfall 12: `startedAtMicros` is 0 on pre-46.1 rows
Ignore boundaries with `startedAtMicros === 0n` (a fight that straddles the 46.1 publish).

## Code Examples

### Timer math (pure, bigint to number for display only)
```typescript
// Source: UI-SPEC "Round Contract"; tick from src/hotbar/useCooldownTicker.ts; clock from src/game/serverClock.ts
export function roundTimer(
  round: { timerExpiresAtMicros: bigint; startedAtMicros: bigint } | null,
  nowMicros: number,
): { resolving: boolean; seconds: number; fraction: number } {
  if (round === null) return { resolving: true, seconds: 0, fraction: 0 };
  const total = Number(round.timerExpiresAtMicros - round.startedAtMicros);
  const left = Math.max(0, Number(round.timerExpiresAtMicros) - nowMicros);
  if (left <= 0) return { resolving: true, seconds: 0, fraction: 0 };
  return { resolving: false, seconds: Math.ceil(left / 1_000_000), fraction: total > 0 ? Math.min(1, left / total) : 0 };
}
```

### Difficulty
```typescript
// Source: v2.2-client src/composables/useCombat.ts (activeEnemyConClass)
export function conFor(enemyLevel: bigint | undefined, playerLevel: bigint): { token: string; meaning: string } {
  const diff = enemyLevel === undefined ? 0 : Number(enemyLevel - playerLevel);
  if (diff <= -5) return { token: '--color-con-gray', meaning: 'Trivial' };
  if (diff <= -2) return { token: '--color-con-light-green', meaning: 'Easy' };
  if (diff === -1) return { token: '--color-con-blue', meaning: 'Slightly easy' };
  if (diff === 0) return { token: '--color-con-white', meaning: 'Even match' };
  if (diff === 1) return { token: '--color-con-yellow', meaning: 'Tough' };
  if (diff === 2) return { token: '--color-con-orange', meaning: 'Hard' };
  return { token: '--color-con-red', meaning: 'Deadly' };
}
```

### New queries (all verified to emit valid SQL)
```typescript
// Source: src/game/queries.ts patterns; SQL strings confirmed with a throwaway vitest probe
combatParticipantsOf: (characterId) => toSql(tables.combatParticipant.where((r) => r.characterId.eq(characterId))),
combatParticipants:   (combatId) => toSql(tables.combatParticipant.where((r) => r.combatId.eq(combatId))),
combatEnemies:        (combatId) => toSql(tables.combatEnemy.where((r) => r.combatId.eq(combatId))),
combatRounds:         (combatId) => toSql(tables.combatRound.where((r) => r.combatId.eq(combatId))),
combatCasts:          (combatId) => toSql(tables.combatEnemyCast.where((r) => r.combatId.eq(combatId))),
combatNarratives:     (combatId) => toSql(tables.combatNarrative.where((r) => r.combatId.eq(combatId))),
combatPets:           (combatId) => toSql(tables.activePet.where((r) => r.combatId.eq(combatId))),
combatActions:        (characterId) => toSql(tables.combatAction.where((r) => r.characterId.eq(characterId))),
enemyTemplatesById:   (ids) => /* OR chain on id, like charactersById */,
enemyAbilitiesByTemplate: (ids) => /* OR chain on enemyTemplateId */,
myCombatAggro: toSql(tables.myCombatAggro),   // exists only after the bindings are regenerated
```

### Server view test skeleton
```typescript
// Source: spacetimedb/src/views/llm.test.ts (noScanDb, createMockDb strict, capturedViews)
// Cases: returns only rows of fights the sender's own characters are in; never another user's fight;
// two characters of one user in two fights -> both; no player / userId null -> []; pet rows dropped;
// zero iter() calls (the Proxy throws on iter); two senders get different results; projection keys are exactly
// ['id','combatId','enemyId','characterId','value'].
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Realtime per-ability cooldowns and 1 s combat loop (v2.2) | Rounds: 10 s deadline, early resolve, round cooldowns and effect durations in rounds | 46.1 (2026-10-06) | UI shows rounds; `use_ability_realtime` removed |
| Multi-column index scans unsafe | Prefix scans fine since 2.7, composite ranges since 2.8 | CLAUDE.md | Not needed here (single-column indexes only) |
| Views returned table row types only | Named `t.row` projections and `primaryKey()` on view rows supported | SDK 2.x | Used for the aggro projection |

**Deprecated/outdated:** `combat_loop_tick` (drained), `combat_round_header` / `combat_resolving` event kinds (never written), snake_case table handles (deprecated aliases).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A 30 s narrative-binding linger covers the late victory/defeat narration (20 s executor max age plus margin) | Q4, Pitfall 7 | A narration arriving after 30 s loses its round tag only (no tag shown); no functional harm |
| A2 | `t.row('MyCombatAggroEntry', ...)` with a `primaryKey()` column generates `MyCombatAggroEntry` in `types.ts` and the view struct `MyCombatAggro` (no collision) | Q1 | If the generator names differ, only type imports change; checked against the `MyLlmJob`/`MyLlmJobs` precedent but not run (publish and generate are out of scope for research) |
| A3 | Sampling the skew on a live round insert is optional because event rows already sample it | Q5 | Timer drifts by one network latency; clamp makes it harmless |
| A4 | Owner accepts a small account button on the mobile strip in combat | Pitfall 9, Open Q1 | Without it Log out is unreachable mid-fight (still recoverable by flee or fight end) |
| A5 | Owner accepts "dead ally selectable but not sent" as the A26 deviation | Pitfall 2, Open Q2 | Alternative is resetting the selection to self on ally death |

## Open Questions (RESOLVED)

1. **Mobile account menu in combat (A5 checker note).**
   - Known: the tab bar is hidden in combat; Log out lives only in `MoreSheet` (mobile) and `AccountMenu` (desktop header).
   - Unclear: where the owner wants the control.
   - Recommendation: `PhDotsThree` 44px button, right end of the vitals strip row 1 in combat, opening `MoreSheet` listing only Log out. Planner to make it a plan task with a test that Log out is reachable in combat on mobile; mention at UAT.
   - RESOLVED (2026-10-06, auto-approved overnight): a small account button on the encounter strip header opens a Log-out-only More sheet. See CONTEXT "Decisions after UI-SPEC and research" and plan 48-12.
2. **A26 versus the server's ally validation.**
   - Recommendation: `allyTargetFor` (Pitfall 2). Record as a deviation.
   - RESOLVED: `allyTargetFor` sends the ally only for `single_ally` abilities while the ally is alive and active. See CONTEXT and plans 48-02, 48-05 and 48-10.
3. **Hostile rows while the fight data is applying.**
   - Recommendation: Pitfall 5 (`combat.applied`).
   - RESOLVED: hostile rows wait for `combat.applied`, per Pitfall 5. See plans 48-04 and 48-08.
4. **Threat percent basis** (UI-SPEC A8, unresolved): keep relative-to-top; only `threat.ts` changes if the owner revises.
   - RESOLVED for now: threat percent is relative to the top entry (CONTEXT A8). It stays open for owner review at UAT.
5. **Vite dev server.** The brief says it is running, but port 5173 did not answer during research (the SpacetimeDB server answered 200 on `/v1/ping`). Not blocking: no step of this phase needs the dev server except optional visual checks, which are deferred to the milestone UAT.
   - RESOLVED: the Vite dev server listens on [::1]:5173 (IPv6 localhost) and answers on http://localhost:5173/. Not blocking.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build, tests | yes | v22.23.2 | - |
| pnpm | scripts | yes | 11.23.0 | - |
| spacetime CLI | local publish, bindings generation | yes | present (`spacetimedb-cli.exe`) | - |
| SpacetimeDB local server (127.0.0.1:3000) | local publish of the view | yes (ping 200) | - | build-only check `spacetime build -p spacetimedb` |
| Vite dev server (5173) | optional visual checks | no response at research time | - | deferred UAT |
| claude_design MCP "Unwritten Realms" | design re-import | not needed (UI-SPEC is approved) | - | - |

**Missing dependencies with no fallback:** none.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 5.0.2 (client config in `vite.config.ts`; `spacetimedb/` has its own vitest) |
| Config file | none separate; `// @vitest-environment happy-dom` per component test; `@game-data` alias via `vite.config.ts` |
| Quick run command | `pnpm exec vitest run src/<dir>/<file>.test.ts` (server: `cd spacetimedb && pnpm exec vitest run src/views/combat.test.ts`) |
| Full suite command | `pnpm exec vitest run --dir src --maxWorkers=2` plus `pnpm exec vue-tsc -b`; server `cd spacetimedb && pnpm exec vitest run --maxWorkers=1` (baseline: client 78 files / 1372 tests green at 46.1-09; server baseline has one known failing file `measurement.results.test.ts`) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CMB-01 | `conFor` boundaries (-6,-5,-4,-2,-1,0,1,2,3,9), missing template -> white, meaning words | unit | `pnpm exec vitest run src/combat/difficulty.test.ts` | Wave 0 |
| CMB-01 | hostile rows: ascending id, HP clamp, `0/0`, boss only when `isBoss === true`, defeated inert, count text | unit + component | `pnpm exec vitest run src/combat/hostiles.test.ts src/combat/EncounterPanel.test.ts` | Wave 0 |
| CMB-01 | click calls `set_combat_target`; ring follows `combatTargetEnemyId` only | component | `pnpm exec vitest run src/combat/EncounterPanel.test.ts` | Wave 0 |
| CMB-01 | Tab/Shift+Tab: forward, backward, wrap, none -> first/last, skip defeated, one hostile no-op, rapid presses, scope (input, drawer/sheet, modifier, header button, hotbar slot), `preventDefault` only when acting, `Target:` status | unit + component | `pnpm exec vitest run src/combat/cycling.test.ts src/combat/useCombatController.test.ts` | Wave 0 |
| CMB-01 | rail swaps Here/Nearby/Tracking for the Encounter panel only when `combat.active` | component | `pnpm exec vitest run src/frame/ContextRail.test.ts src/frame/railsShell.test.ts` | exists, extend |
| CMB-02 | server view: own fights only, never another user's, per-sender, no `iter()`, pet rows dropped, keys | server unit | `cd spacetimedb && pnpm exec vitest run src/views/combat.test.ts` | Wave 0 |
| CMB-02 | threat rows: descending, id tiebreak, percent vs top, `You`, empty, no target hides | unit + component | `pnpm exec vitest run src/combat/threat.test.ts` | Wave 0 |
| CMB-02 | `queries.myCombatAggro` is an unfiltered view subscription; bindings contain `myCombatAggro` | unit | `pnpm exec vitest run src/game/queries.test.ts` | exists, extend (after regenerate) |
| CMB-03 | N formula (rail live vs feed at announcement), `lands this round`, targets you/name/pet/the party, row follows the cast row | unit | `pnpm exec vitest run src/combat/windup.test.ts` | Wave 0 |
| CMB-03 | feed block once per cast id, not on snapshot, same string as the rail | unit + component | `pnpm exec vitest run src/console/feedStore.test.ts src/console/FeedLine.test.ts` | exists, extend |
| CMB-04 | header placement `start(N) < t <= start(N+1)` incl. equality, opening lines before Round 1, header before any line, boundaries survive row deletion, dedupe, accent vs neutral, 300 cap, insert-by-timestamp | unit | `pnpm exec vitest run src/console/feedStore.test.ts src/console/lines.test.ts` | exists, extend |
| CMB-04 | late narration tag only when rounds differ and known; correlation by createdAt; survives binding disposal | unit | `pnpm exec vitest run src/console/feedStore.test.ts src/game/gameData.test.ts` | exists, extend |
| CMB-04 | combat lines Body neutral, last integer emphasised for damage/heal only, `<b>` literal, round header/resolving kinds render nothing, no `v-html` | component | `pnpm exec vitest run src/console/FeedLine.test.ts src/console/emphasis.test.ts` | exists/Wave 0 |
| CMB-04 | rounds cooldown: `{n} rounds`/`1 round`, total from `cooldownSeconds` (not `durationMicros`), no wall clock in combat, out-of-combat unchanged | unit + component | `pnpm exec vitest run src/combat/roundCooldown.test.ts src/hotbar/HotbarRow.test.ts` | Wave 0 / extend |
| CMB-05 | header `In combat · Round N`, six screen buttons `aria-disabled` and focusable, account enabled, drawer closes at start | component | `pnpm exec vitest run src/frame/HeaderBar.test.ts src/frame/AppFrame.screens.test.ts` | exists, extend |
| CMB-05 | ally targeting: default self, `You` first, aria-pressed, reset on leave/fight end, `allyTargetFor` omits dead/left/non-ally-rule, not shown solo | unit + component | `pnpm exec vitest run src/combat/ally.test.ts src/rails/PartyBlock.test.ts src/frame/VitalsStrip.test.ts` | Wave 0 / extend |
| CMB-05 | Flee calls `flee_combat`, `Flee chosen` from the row, reverts when an ability replaces it | component | `pnpm exec vitest run src/combat/RoundRow.test.ts` | Wave 0 |
| CMB-05 | damage flash: drop yes, first load/character switch no, healing no, delta sums, reduced-motion class path with no animation | unit + component | `pnpm exec vitest run src/combat/useDamageFlash.test.ts src/frame/VitalsRail.test.ts` | Wave 0 / extend |
| CMB-05 | mobile: tab bar and location row hidden in combat, strip chips target, header opens `encounter` sheet, sheet meta, closes at fight end, strip collapses with the keyboard, tag priority over Level up/New skill, account button reaches Log out | component | `pnpm exec vitest run src/frame/AppFrame.layout.test.ts src/frame/useScreens.test.ts src/combat/EncounterStrip.test.ts` | exists, extend / Wave 0 |
| CMB-06 | timer: ceil seconds never `0s`, fraction, skew, `Resolving...` at 0 and with no open round, controls inert, 1 s tick under reduced motion | unit + component | `pnpm exec vitest run src/combat/roundClock.test.ts src/combat/RoundRow.test.ts` | Wave 0 |
| CMB-06 | chip states (default, no target, Ready, ability enemy/ally/no target, flee, down), chosen slot from the row only and cleared next round, Ready uses `submit_combat_action` and disables once a row exists | unit + component | `pnpm exec vitest run src/combat/choice.test.ts src/combat/RoundRow.test.ts src/hotbar/HotbarRow.test.ts` | Wave 0 |
| All | design guards, 23 tokens, computed sizes/weights on a populated combat frame | static | `pnpm exec vitest run src/styles` | exists |
| All | Phase 47 suites still green | regression | `pnpm exec vitest run --dir src --maxWorkers=2` | exists |

### Sampling Rate
- **Per task commit:** the quick command of the touched module, plus `pnpm exec vitest run src/styles` when a `.vue` or `.css` changed.
- **Per wave merge:** full client suite and `pnpm exec vue-tsc -b`; server suite after the view task.
- **Phase gate:** full suites green, `pnpm build` (includes the bundle guard), then `/gsd-verify-work`. Live round play stays deferred to the milestone UAT.

### Wave 0 Gaps
- [ ] `spacetimedb/src/views/combat.test.ts` (new): the view, no-scan Proxy, per-sender
- [ ] `src/combat/{difficulty,hostiles,threat,windup,roundClock,choice,cycling,ally,emphasis,roundCooldown}.test.ts`
- [ ] `src/combat/{useCombatController,useDamageFlash}.test.ts`
- [ ] `src/combat/{EncounterPanel,EncounterStrip,RoundRow}.test.ts` (component, happy-dom, inject inert defaults then override)
- [ ] Update fixtures: `gameData.test.ts` (`queries` literal, static SQL), `queries.test.ts`, `lines.test.ts:210`, `VitalsStrip`/`PartyBlock`/`HeaderBar`/`useScreens`/`Composer`/`HotbarRow` extensions
- [ ] A shared test builder for combat rows (bigint ids, `{ microsSinceUnixEpoch }` timestamps), kept inside test files (production-file guards must not scan helpers, as in 45-10)
- [ ] Server publish and `pnpm spacetime:generate -y` are execution tasks, not test gaps; the client tests that import `myCombatAggro` come after regeneration

## Security Domain

> `security_enforcement` is absent from `.planning/config.json` (treated as enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | existing SpacetimeAuth flow (Phase 45) |
| V3 Session Management | no | existing session controller |
| V4 Access Control | yes | The aggro view is scoped by `ctx.sender` through player -> own characters -> participant rows; no client-supplied id is trusted. Reducers keep `requireCharacterOwnedBy`; the client sends only `characterId` and target ids and the server re-validates targets (combat.ts:3283-3300) |
| V5 Input Validation | yes | Text nodes only (enemy, ability, character and pet names are server data); no `v-html`; the `<img onerror>` test string on every new text surface; ids as bigint end to end |
| V6 Cryptography | no | none |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Another player's threat table or fight leaked through the view | Information disclosure | Chained index lookups from `ctx.sender`; server unit test with two senders and two fights; projection drops `petId` and pet rows |
| View scans a table (`.iter()`) and breaks invalidation or leaks | Information disclosure / DoS | No-scan Proxy test (`noScanDb`) as in `views/llm.test.ts` |
| Name text rendered as HTML (enemy/ability/pet/character names, narration) | Tampering | Vue interpolation; design guard bans `v-html`/`<svg`; escape tests |
| Public combat tables expose other fights' rows to any subscriber | Information disclosure | Not new (tables are public by design, 47-12 todo `event-tables-public-read`); the client subscribes only filtered by own `characterId`/`combatId` |
| Tab key hijack trapping keyboard users | Denial of use | Scope rule in Q6 (A4) |
| Spoofed reducer args | Spoofing | Server `requireCharacterOwnedBy(ctx, characterId)` on every combat reducer |

## Project Constraints (from CLAUDE.md and memory)

- SpacetimeDB TS rules: views use index lookups only (no `.iter()`), `ViewContext` with `ctx.sender`, views need an explicit subscription (`SELECT * FROM <view>`); reducer calls use object syntax; never edit generated bindings, regenerate with `pnpm spacetime:generate -y`; do not invent APIs (the view API and `t.row` usage above were read from `node_modules/spacetimedb` and existing views).
- Smallest change: the server touches only `views/combat.ts` (+ its test). Do not touch unrelated files or configs.
- Server is the source of truth: round constants and target rules come from `@game-data/*`, never duplicated.
- Prefer `fail()` for server validation lines (not applicable: no new reducer).
- Publishing: local only, `--break-clients` (never `--clear-database` unless schema changes need it; this change is additive), key length checked before and after, **never maincloud**. Research did not publish, start or stop any server.
- Every phase includes unit tests that enforce the rules (memory: testing requirements).
- Greenfield: no compat shims; the old client need not keep working.
- Defer human-verify/UAT to the milestone end; no UI-SPEC re-run (approved).
- Keeper voice: second person, no first person; the client's copy follows the UI-SPEC copywriting contract (no pronoun for the Keeper or enemies).
- No `.claude/skills` rule file applies to this phase (only `run-local`, which launches the stack and is not used here).

## Sources

### Primary (HIGH confidence)
- This repository, read in full for the cited lines: `spacetimedb/src/schema/tables.ts`, `views/{combat,groups,effects,llm,index,types}.ts`, `views/llm.test.ts`, `reducers/combat.ts`, `reducers/items.ts` (use_ability), `helpers/{combat,combat_rounds,combat_round_state,combat_narration,events}.ts`, `data/{combat_constants,mechanical_vocabulary,llm_limits}.ts`; `src/game/*`, `src/console/*`, `src/frame/*`, `src/hotbar/*`, `src/rails/*`, `src/screens/*`, `src/styles/*`, `src/module_bindings/*`
- `git show v2.2-client:src/composables/useCombat.ts` (difficulty rule)
- `node_modules/spacetimedb/src/server/views.ts`, `src/sdk/db_connection_impl.ts` (view primary keys; synchronous callback dispatch per transaction)
- 46.1-09-SUMMARY (round and choice contract, publish procedure); 47-RESEARCH and the 47 SUMMARYs; 48-CONTEXT; 48-UI-SPEC
- A throwaway vitest probe (deleted afterwards, working tree clean) confirming `toSql` output for the new queries

### Secondary (MEDIUM confidence)
- [CITED: https://spacetimedb.com/docs/functions/views] view context types, index-only access, chained lookups, re-evaluation on read-set change, view primary keys

### Tertiary (LOW confidence)
- none beyond the items in the Assumptions Log

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (no new packages; versions read from `package.json` and `node_modules`)
- Architecture: HIGH (every table, index and reducer behavior read from source; keyed pattern reused)
- Pitfalls: HIGH for server-derived ones (1, 2, 5, 6, 7, 11), MEDIUM for ordering behavior across subscriptions (3-8 reason from verified SDK dispatch plus the store's batch sort, not from a live run)

**Research date:** 2026-10-06
**Valid until:** 2026-11-05 (stable until the round engine or Phase 47 client changes)
