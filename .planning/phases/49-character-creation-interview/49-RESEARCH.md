# Phase 49: Character Creation Interview - Research

**Researched:** 2026-10-06
**Domain:** Vue 3 client view over an existing SpacetimeDB creation state machine, plus one additive server helper (race stat bonuses at finalize)
**Confidence:** HIGH (every claim below was read from the repo, the local database or a throwaway vitest probe in this session; nothing depends on web research)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Interview flow (CRE-01)**
- The interview runs in the story feed. Creation lines arrive as `event_creation` rows carrying Phase 46 segments, so Keeper lines are labelled.
- A step bar above the feed shows Race · Archetype · Class · Name · Enter the realm. It is derived from the server's `character_creation_state.step`, mapping every server step (including error and retry steps) to one indicator position. The name is asked last, and there is no "First words" step.
- Archetype step: two cards, Warrior and Mystic. Typing still works.
- Errors such as `CLASS_FILL_ERROR` show a Retry action that uses the existing server path. Go-back is offered only where the existing state machine supports it. No new server step.
- Entry point:
  - A player with no characters goes straight into the interview, replacing the Phase 45 "character creation is coming" note.
  - The character picker gains a "New character" button for players who already have characters. (SUPERSEDED by the 2026-10-06 owner decision below: one character per account, no such button.)
  - After the name, the player enters the realm with the new character, using the existing `set_active_character` flow.

**Race suggestions (CRE-03)**
- The 3 cards come from races already stored in this world (`race_definition` rows), each with stat tags from its stored bonuses.
  - There is no new LLM call and no prompt change, and nothing is pre-seeded, following the "everything generated through play" principle.
  - With fewer than 3 stored races, only the stored ones show. "Surprise me" and free text are always available.
  - The selection rule (for example the most recent, or a deterministic sample) is Claude's discretion.
- Clicking a card sends that race name through the existing free-text race path.
- "Surprise me" sends a fixed line, "Surprise me.", through the same free-text path, and the Keeper invents a race. No prompt change.
- If `race_definition` is not readable by the client, add one small, additive, public view or exposure for it. (Not needed: see the owner decision below.)

**Live character sheet (CRE-02)**
- On desktop, the sheet replaces the right rail during creation. On mobile, a "Sheet" chip opens it in a sheet.
- It fills in this order: race, archetype, class, stats with bonuses, racial trait, then the name. The name shows as an "Unnamed" placeholder until the last step.
- The staged class reveal lands in the interview feed, and the sheet updates from the stored creation state.

**Mobile (390x844)**
- The interview (feed, cards, input) is usable at 390x844, and the sheet is reachable from the "Sheet" chip.

**Owner decisions after the UI-SPEC draft (2026-10-06, owner in chat)**
- **One character per account stays.** The server's one-character rule is unchanged. The character picker does NOT get a "New character" button. Creation runs only for an account with no character. This supersedes the earlier "New character" entry point.
- **Race stat bonuses are applied on the server.** When a character is finalized, `finalizeCharacter` adds the race's stored stat bonuses to the stats. Today the stats come from the class only.
  - This is a small server change in this phase: code only, no schema change expected.
  - Publish locally with `--break-clients`. Never use `--clear-database` or maincloud. Check that `admin_llm_status` key_length is 108 before and after.
  - Add a test that pins the finalized stats as class base plus race bonus.
  - The live sheet then shows the final values with the race bonus included. The bonus can still be marked "+N (race)" to explain it.
  - This changes balance for new characters. Existing characters are not recomputed.
- **`race_definition` is already public and bound.** No new view is needed for the race cards.

### Claude's Discretion
- The race selection rule.
- Component layout under `src/` (for example `src/creation/`).
- The exact visual of the step bar, following the design import.

### Deferred Ideas (OUT OF SCOPE)
- Generating race suggestions with an LLM (a paid call and a prompt change).
- Fixed browsable race lists (Out of Scope).
- Live creation run-through: deferred to the end-of-milestone UAT, because it needs LLM calls.

Out of scope (CONTEXT phase boundary): browsable fixed race lists (races stay freeform); new creation steps on the server; Keeper Bible or route-block changes (SEG-03 owner approval, not planned).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CRE-01 | Character creation runs as a Keeper interview in the feed, with a step indicator. Steps: race, archetype (Warrior/Mystic), class reveal, name (last), enter the realm. No "First words" step. | Section "Creation state machine" (every server step, transition and exact reducer args); `deriveCreationStep` mapping; entry and screen derivation; creation feed and composer design; Pitfalls 1-9 |
| CRE-02 | A live character sheet fills in on the right as the player chooses: race, archetype, class, stats with bonuses, racial trait, finally the name (unnamed placeholder until then). | "Data sources for the live sheet" (row fields, real `bonuses_json`/`class_stats` shapes); the shared `data/race_bonuses.ts` helper importable through `@game-data`; the server finalize change (Finding F1 and F2); sheet fill-order model |
| CRE-03 | The Keeper offers 3 race suggestions as clickable cards with stat tags; the player can still type any race or choose "Surprise me". | `race_definition` columns and real row; reuse path in `startCreationGeneration` (exact lowercase name match, no model call); selection rule; card tags from `bonusesJson` |
</phase_requirements>

## Summary

The server already contains a complete creation state machine (`spacetimedb/src/reducers/creation.ts`, `helpers/creation_generation.ts`, `helpers/llm_apply.ts`). The client has nothing for it: zero references to `startCreation` or `submitCreationInput` exist in `src/`, and Phase 47's game data hub does not subscribe `character_creation_state`, `event_creation` or `race_definition`. Phase 49 is therefore a new client surface (`src/creation/`) plus one additive server change. The client surface needs its own subscriptions, its own feed store, its own composer (the Phase 47 `Composer` is wired to `routeInput` and requires an active character, so it returns `offline` during creation) and a new `creation` screen kind in `deriveScreen`.

Two server findings change the plan, both verified by probe tests this session. **F1:** `finalizeCharacter` crashes with `Cannot mix BigInt and other types` whenever the class reply has `secondaryStat: 'none'` (a value the LLM schema explicitly allows and `validateClassReply` keeps), so that player can never confirm. The race-bonus helper must normalise `'none'`, and finalize must call it. **F2:** `apply_level_up` (index.ts:495) and the admin level command (commands.ts:607) rebuild stats from `detectPrimarySecondary` plus `computeBaseStatsForGenerated` and overwrite `str/dex/cha/wis/int`, so a race bonus applied only at finalize is erased at the first level-up (and can mis-detect the secondary stat). The owner decision is literal ("applied at finalize"); this is raised as decision D1 below with a recommendation and must not be silently widened.

The O3 starter-tips question is answered: the Phase 47 `event_private` binding IS live during creation (it is keyed on the user id, not the character), but `feedStore.ingest` drops private rows while no character is active, so the finalize-time tips are racy-to-lost. The smallest fix is a bounded "held private rows" buffer inside `feedStore.ts`, replayed in `setCharacter(id)`. No change to `gameData.ts` is needed.

**Primary recommendation:** Build `src/creation/` as a self-contained slice (pure derivation modules, a session-owned `creation` hub with its own bindings and feed store, `CreationView` with its own feed, composer, step bar and sheet), add `creation` to `deriveScreen`, and ship one new import-free `spacetimedb/src/data/race_bonuses.ts` helper that `finalizeCharacter` calls and the sheet imports through `@game-data`. Do not edit `gameData.ts`, `context.ts`, `queries.ts`, `FeedView.vue`, `FeedShell.vue`, `Composer.vue` or `useConsole.ts` (two parallel quick tasks own them).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Creation state machine, validation (name, archetype, ability match, go-back) | API / Backend (SpacetimeDB reducers) | none | Already implemented; client must not duplicate rules (server is source of truth) |
| Race bonus + class base combination (final stats) | API / Backend (`data/race_bonuses.ts`, called by finalize) | Browser (same function imported via `@game-data` for the sheet projection) | One rule, two callers, so projection and final stats cannot drift (O5) |
| Step position, controls matrix, card selection, sheet model | Browser / Client (pure functions) | none | Pure derivations over subscribed rows; no optimistic state |
| Keeper lines, echoes, choice cards, live sheet rendering | Browser / Client (Vue) | none | Text nodes only; rows arrive through subscriptions |
| Subscriptions (`character_creation_state`, `event_creation`, `race_definition`, `my_llm_jobs`) | Browser / Client (session-owned hub) | Database (public tables filtered by `player_id`) | Public tables: client filter is a scoping aid, not access control |
| Race suggestions | Database (`race_definition` rows) | Browser (newest-3 rule) | No LLM, no new view (owner decision) |
| Entry/screen choice | Browser (`deriveScreen`) | none | Pure, tested, existing Phase 45 pattern |
| Enter the realm (character placement) | API / Backend (`finalizeCharacter` + world_gen_start) | Browser (swap to frame when `locationId != 0`) | Server places the character; client only observes |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vue | ^3.5.43 (package.json) | View layer | Already the client framework |
| spacetimedb (npm) | ^2.10.1 | SDK, `toSql`, `Identity` | Already used; `where(r => r.playerId.eq(identity))` verified to emit valid SQL this session |
| @phosphor-icons/vue | 2.2.1 | Icons (regular weight) | Only allowed icon library (designContract test) |
| vitest | ^5.0.2 | Tests (root and `spacetimedb/`) | Existing |
| @vue/test-utils / happy-dom | 2.5.1 / 20.14.5 | Component tests | Existing |

[VERIFIED: package.json, spacetimedb/package.json read in this session]

### Supporting
None to add. Reuse: `src/console/FeedLine.vue`, `KeeperProgress.vue`, `indicator.ts` (`selectLlmIndicator(rows, 'creation', rotation)`), `pinning.ts`, `cleanServerText.ts`, `src/input/history.ts`, `src/input/limits.ts`, `src/frame/Sheet.vue`, `NoticeBars.vue`, `useBreakpoint.ts`, `useKeyboardOpen.ts`, `src/session/PreFrameHeader.vue`, `src/hotbar/hotbar.ts` (`abilityIcon`), `src/net/bindTable.ts`, `src/game/bindEventTable.ts`, `@game-data/class_stats`, `@game-data/llm_indicator_lines`.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Own `CreationComposer.vue` | Parametrise `Composer.vue` | `Composer` reads `CONSOLE_KEY`/`game.combat`, hard-codes `aria-label="Your action"`, and a parallel quick task edits the composer/hotbar area. A new component copies about 60 lines and conflicts with nothing |
| Own `CreationFeed.vue` | Add props/slots to `FeedView.vue` | `FeedView` is bound to the game feed and keyword vocabulary and is being edited by quick task 261006-a0i. The choice block must sit after the progress line inside the scroller, which `FeedView` has no slot for |
| Own small creation feed store | New `'creation'` source in `createFeedStore` | `acceptRow` returns false with no character and `lines.ts` ignores `kind` for segment rows; a dedicated store plus classifier avoids touching 47 files |
| Session-owned creation hub | Bindings created in the view | The view can unmount and remount through a transient `picker` frame (Pitfall 7); event rows never replay, so view-owned state loses lines |

**Installation:** none. No new packages. [VERIFIED: UI-SPEC "Registry Safety" and this research add no dependency]

**Version verification:** not applicable; no package is added. Installed versions were read from `package.json`.

## Package Legitimacy Audit

No external packages are installed or added by this phase, so the `package-legitimacy` gate is not applicable.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none added) | - | - | - | - | - | - |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 SpacetimeDB (public tables, filtered subscriptions)
  character_creation_state  WHERE player_id = me ──┐
  event_creation            WHERE player_id = me ──┤   (event rows: onInsert only, never replayed)
  race_definition           (whole table, view-scoped)
  my_llm_jobs (Phase 47, already live)  ───────────┤
  character WHERE owner_user_id = me, my_player ───┤   (Phase 45, already live)
                                                   ▼
        session-owned CreationHub (src/creation/creationData.ts)
         ├─ stateRow            = lowest-id row for me (server uses the first row too)
         ├─ feed store          = event_creation rows + client echoes, newest 300, never cleared by a remount
         ├─ raceRows            = race_definition (applied flag)
         └─ actions: start()  submit(text)  enterRealmIfNeeded()
                   │  start_creation({})   submit_creation_input({text})   set_active_character({characterId})
                   ▼
  deriveScreen(…, activeCharacterPlaced) ──► 'creation' ──► CreationView
                                                           ├─ PreFrameHeader ("New character", Log out) + NoticeBars
                                                           ├─ StepBar        ◄── deriveCreationStep(state, worldJobActive, startFailed)
                                                           ├─ CreationFeed   ◄── classifyCreationRow + FeedLine + KeeperProgress(scope 'creation')
                                                           │    └─ ChoiceBlock (race / archetype / ability cards) after the progress line
                                                           ├─ CreationComposer ◄── controlsFor(step): quick row, decision row, placeholder, locked
                                                           └─ CreationSheet (desktop rail / mobile Sheet) ◄── sheetModel(state, @game-data helpers)
  placed active character (locationId != 0) ──► 'frame' (AppFrame mounts, its own automatic look follows)

 Server finalize path:  confirm ──► finalizeCharacter ──► computeCreationStats(primary, secondary, state.raceBonuses)
                                      (data/race_bonuses.ts, shared with the sheet) ──► character row (stats) + COMPLETE + world_gen_start job
```

### Recommended Project Structure
```
src/creation/
├── creationSteps.ts      # deriveCreationStep (pure), STEP_LABELS, position table
├── creationControls.ts   # controlsFor(step): quick row, decision row, placeholder, locked, choice block kind
├── raceCards.ts          # selectRaceCards (newest 3), tags, description, aria-label
├── abilityCards.ts       # parseAbilities, tags, aria-label
├── sheetModel.ts         # buildSheet(state) using @game-data/class_stats + @game-data/race_bonuses
├── creationLines.ts      # classifyCreationRow: kind + segments -> line views, ** and [bracket] cleaning
├── creationFeedStore.ts  # ingest(row), appendEcho(text), dedupe by id, sort, cap 300
├── creationData.ts       # createCreationData(deps, input): bindings + actions; session wires it like `game`
├── creationContext.ts    # CREATION_KEY injection key + inert default (NOT in game/context.ts)
├── CreationView.vue  StepBar.vue  CreationFeed.vue  ChoiceBlock.vue  CreationComposer.vue  CreationSheet.vue
└── *.test.ts
spacetimedb/src/data/race_bonuses.ts        # NEW, import-free apart from ./class_stats
spacetimedb/src/data/race_bonuses.test.ts   # NEW
spacetimedb/src/reducers/creation.ts        # finalizeCharacter calls the helper
spacetimedb/src/reducers/creation_finalize.test.ts   # NEW (real handler, mock ctx)
```

### Creation state machine (Q1, from `reducers/creation.ts`, `creation_generation.ts`, `llm_apply.ts`, `llm_sweeper.ts`)

Step values (free string column, 11 known): `AWAITING_RACE`, `GENERATING_RACE`, `AWAITING_ARCHETYPE`, `GENERATING_CLASS`, `CLASS_FILLING`, `CLASS_FILL_ERROR`, `CLASS_REVEALED`, `AWAITING_NAME`, `CONFIRMING`, `CONFIRMING_GO_BACK`, `COMPLETE`. The schema comment in `tables.ts:1931` is stale (it omits CLASS_FILLING and CLASS_FILL_ERROR); trust the reducer. [VERIFIED: grep + read]

| From | Trigger | To | Notes |
|------|---------|----|-------|
| (no row) | `start_creation` | `AWAITING_RACE` | inserts state, posts GREETING (plain `creation` row, no segments) |
| (no row) | `submit_creation_input` (any text) | `AWAITING_RACE` | auto-start; **exception:** a stranded character (location 0) intercepts first |
| `AWAITING_RACE` | any non-empty text | `GENERATING_RACE` (job) or `AWAITING_ARCHETYPE` (reuse) | text stored as `raceDescription` (capped 1000 code points). If `description.trim().toLowerCase()` equals a `race_definition.nameLower`, the race is reused with **no model call** and the state goes straight to `AWAITING_ARCHETYPE`; otherwise a `creation_race` job is enqueued |
| `GENERATING_RACE` | job ok | `AWAITING_ARCHETYPE` | writes race name/narrative/`raceBonuses`, a segments line, and inserts `race_definition` (skipped if the model named no race) |
| `GENERATING_RACE` | job failed, malformed, refused, stale lock | `AWAITING_RACE` | plus a `creation_error` segments line |
| `AWAITING_ARCHETYPE` | text containing `warrior` or `mystic` (substring, lower-cased) | `GENERATING_CLASS` (job) | else `creation_error`, state unchanged |
| `GENERATING_CLASS` | reveal ok | `CLASS_FILLING` | stores className, classDescription, `abilities` (exactly one), posts the reveal lines, enqueues the fill in the same tx |
| `GENERATING_CLASS` | failed/malformed/stale | `AWAITING_ARCHETYPE` | `creation_error` |
| `CLASS_FILLING` | fill ok | `CLASS_REVEALED` | stores `classStats` (JSON) and `abilities` (up to 3) |
| `CLASS_FILLING` | fill failed/malformed/expired/refused | `CLASS_FILL_ERROR` | reveal fields stay; one `creation_error` line |
| `CLASS_FILL_ERROR` | any text that is not a go-back phrase | `CLASS_FILLING` | `retryClassFill` re-enqueues the fill only; the line `The Keeper picks the thread of your finer details back up...` follows. `retry` is safe (it contains none of the go-back substrings) |
| `CLASS_REVEALED` | text matching an ability name (exact, then substring either way, first hit wins) | `AWAITING_NAME` | sets `chosenAbilityIndex`; no match: `creation_error` listing the three names |
| `AWAITING_NAME` | valid name | `CONFIRMING` | 3 to 20 characters, no whitespace, letters only, case-insensitive unique across all characters; refusals are `creation_error` lines |
| `CONFIRMING` | exactly `confirm` (case-insensitive) | `COMPLETE` | re-checks name uniqueness (taken: back to `AWAITING_NAME`, name cleared); else `finalizeCharacter` |
| `CONFIRMING` | `start over` or any go-back substring | `AWAITING_RACE` | clears everything, **no confirmation question** |
| any of `AWAITING_RACE`(no), `AWAITING_ARCHETYPE`, `CLASS_REVEALED`, `CLASS_FILL_ERROR` | go-back phrase | `CONFIRMING_GO_BACK` | `goBackTarget` and `previousStep` set; a `creation_warning` line. Targets: `AWAITING_ARCHETYPE`->`AWAITING_RACE`; `CLASS_REVEALED` and `CLASS_FILL_ERROR`->`AWAITING_ARCHETYPE`. Not detected at `AWAITING_NAME`, `CONFIRMING`, `COMPLETE`, `GENERATING_*`, `CLASS_FILLING` |
| `CONFIRMING_GO_BACK` | exactly `yes` (trim, lower) | `goBackTarget` | `clearDataFromStep` blanks fields from the target on (race kept for the archetype target) |
| `CONFIRMING_GO_BACK` | anything else | `previousStep` | `Crisis of conviction averted. Carry on.` |
| `COMPLETE` | any text | stays | stranded char: hint line; text `explore` (also `[explore]`) retries the first region |
| unknown | any text | stays | `creation_error` "Unknown creation step" |

Go-back phrase list (substring, case-insensitive): `go back, start over, redo, changed my mind, try again, wait no, undo, i want to change, let me change, different race, different archetype`. At `CLASS_FILL_ERROR` only, `try again` is removed so it retries instead.

Reducer bindings (exact args, from `src/module_bindings`): `startCreation({})`, `submitCreationInput({ text: string })`, `setActiveCharacter({ characterId: bigint })`. Table accessors: `characterCreationState`, `eventCreation`, `raceDefinition`, `myLlmJobs` (camelCase). [VERIFIED: bindings read]

**What finalize does (finalizeCharacter):** inserts the character at `locationId 0n` with stats from the class pair only, runs `recomputeCharacterDerived`, grants starter items, race ability, faction standings, the chosen ability plus hotbar slot 1, **sets `player.activeCharacterId`**, sets step `COMPLETE`, posts `Go on then, {name}...` to `event_creation`, writes the starter-tips `system` row to `event_private`, and inserts a `world_gen_state` (PENDING) and calls `startWorldGeneration` (one `world_gen_start` job). All in one transaction.

**Unplaced character:** the state stays `COMPLETE` until the first region places the character. `findStrandedCharacter` (active character, else any character of the user at location 0) makes `submit_creation_input` accept `explore` to retry. A failed first region ends in `world_gen_state.step = 'ERROR'` and a `creation_error`/private line; only the player's `explore` retries.

**How the client knows creation finished and the character is placed:** the `character` row (filtered by `owner_user_id`) arrives with `locationId = 0n` at finalize, `my_player.activeCharacterId` is set in the same tx, and the character's `locationId` becomes non-zero when `applyWorldStartResult` places it. `character_creation_state` never leaves `COMPLETE` and is never deleted.

### Data sources for the live sheet (Q2)

`character_creation_state` (public, `by_player` index): `id u64, playerId Identity, step string, goBackTarget?, raceDescription?, raceName?, raceNarrative?, raceBonuses? (JSON), archetype? ('warrior'|'mystic'), className?, classDescription?, classStats? (JSON), abilities? (JSON array), chosenAbilityIndex? (u64), characterName?, previousStep?, createdAt, updatedAt`. Optional columns arrive as `undefined`-or-value in the TS bindings.

Real JSON shapes read from the owner's local database this session:
- `race_definition.bonuses_json` = `{"primary":{"stat":"dex","value":2},"secondary":{"stat":"int","value":1},"flavor":"Underlight Eyes: you see clearly in dim places ..."}` (flavor up to 200 characters). Server clamp (`validateRaceReply`): primary 1..3, secondary 1..2, the two stats distinct, flavor optional. `race_definition` columns: `id, name, nameLower, narrative, bonusesJson, createdAt`. The local DB currently holds exactly **one** race row ("Dark-Elf"), so a real run shows one card.
- `class_stats` = `{"primaryStat":"int","secondaryStat":"wis","bonusHp":4,"bonusMana":28,"usesMana":true,"weaponProficiencies":[...],"armorProficiencies":[...]}`. `secondaryStat` can be the string `"none"`.
- `abilities` entries: `name, description, kind, damageType, targetRule, resourceType, resourceCost, castSeconds, cooldownSeconds, value1, [value2, scaling, effectType, effectMagnitude, effectDuration]`.

`event_creation` (public **event** table, `by_player` index; rows are never cached, so use `bindEventTable`'s `onInsert` listener): `id, playerId, message, kind ('creation' | 'creation_warning' | 'creation_error'), createdAt, segments?: KeeperSegment[]`. Segment rows carry `kind` (`narration` or `dialogue`), `speaker` (`The Keeper`), `text`. `message` always equals the flattened segments.

**Class stat base (UI-SPEC O4, answered):** `computeBaseStatsForGenerated`, `BASE_STAT` (8n), `PRIMARY_BONUS` (4n), `SECONDARY_BONUS` (2n) live in `spacetimedb/src/data/class_stats.ts`, which has **no imports**. The `@game-data` alias is `spacetimedb/src/data` (vite.config.ts and tsconfig paths), so the client can import it as `@game-data/class_stats`. `helpers/creation_validate.ts` is NOT under that alias, so the new helper must live in `data/`. [VERIFIED: vite.config.ts, tsconfig.json, class_stats.ts]

### Pattern 1: One shared pure helper for final stats (server finalize and client sheet)

**What:** `spacetimedb/src/data/race_bonuses.ts` exports `parseRaceBonuses` and `computeCreationStats`. It imports only from `./class_stats`, never throws, returns bigint records and a per-stat race delta.
**When to use:** `finalizeCharacter` (server) and `buildSheet` (client) call it with the same arguments, so the projection equals the stored stats.
**Example (prototyped and run in this session, then removed; results below are real output):**
```typescript
// spacetimedb/src/data/race_bonuses.ts  (import-free apart from ./class_stats, browser-safe)
import { BASE_STAT, computeBaseStatsForGenerated } from './class_stats';
import type { StatKey } from './class_stats';

const STAT_KEYS: readonly StatKey[] = ['str', 'dex', 'cha', 'wis', 'int'];
/** Mirrors validateRaceReply: primary 1..3, secondary 1..2. Older stored rows are re-clamped. */
export const RACE_PRIMARY_BONUS_MAX = 3n;
export const RACE_SECONDARY_BONUS_MAX = 2n;

export interface RaceStatBonus { stat: StatKey; value: bigint }
export interface ParsedRaceBonuses { primary: RaceStatBonus | null; secondary: RaceStatBonus | null; flavor: string | null }

function isStatKey(v: unknown): v is StatKey {
  return typeof v === 'string' && (STAT_KEYS as readonly string[]).includes(v);
}
function readBonus(raw: unknown, max: bigint): RaceStatBonus | null {
  if (raw === null || typeof raw !== 'object') return null;
  const { stat, value } = raw as { stat?: unknown; value?: unknown };
  if (!isStatKey(stat) || typeof value !== 'number' || !Number.isFinite(value)) return null;
  const whole = BigInt(Math.trunc(value));
  if (whole <= 0n) return null;
  return { stat, value: whole > max ? max : whole };
}
export function parseRaceBonuses(json: string | null | undefined): ParsedRaceBonuses { /* try/catch JSON.parse; unknown stat or bad value drops that entry only */ }

export interface CreationStats { stats: Record<StatKey, bigint>; raceBonus: Record<StatKey, bigint> }
/** primary/secondary: pass undefined before the class exists (all base 8 plus the race). 'none' or unknown secondary boosts only the primary. */
export function computeCreationStats(
  primaryStat: string | null | undefined,
  secondaryStat: string | null | undefined,
  raceBonusesJson: string | null | undefined,
): CreationStats {
  const primary = isStatKey(primaryStat) ? primaryStat : undefined;
  const secondary = isStatKey(secondaryStat) ? secondaryStat : undefined;
  const stats = primary
    ? computeBaseStatsForGenerated(primary, secondary, 1n)
    : { str: BASE_STAT, dex: BASE_STAT, cha: BASE_STAT, wis: BASE_STAT, int: BASE_STAT };
  const raceBonus = { str: 0n, dex: 0n, cha: 0n, wis: 0n, int: 0n };
  const parsed = parseRaceBonuses(raceBonusesJson);
  for (const b of [parsed.primary, parsed.secondary]) {
    if (b === null) continue;
    stats[b.stat] += b.value;
    raceBonus[b.stat] += b.value;
  }
  return { stats, raceBonus };
}
```
Probe output with the owner's real Dark-Elf bonuses (`dex +2, int +1`):
- mystic `int/wis`: stats `str 8, dex 10, cha 8, wis 10, int 13`; race delta `dex 2, int 1`.
- warrior `str/none`: stats `str 12, dex 10, cha 8, wis 8, int 9` (no throw).
- projection before a class: `str 8, dex 10, cha 8, wis 8, int 9`.
- `{"primary":{"stat":"con","value":9},"secondary":{"stat":"wis","value":9}}`: primary dropped (`con` is not a stat), secondary clamped to 2.

Do not change class math: `secondaryStat === primaryStat` (not deduped by `validateClassReply`) still adds both class bonuses today (int 14); keep that.

### Pattern 2: finalize change (minimal diff)

In `spacetimedb/src/reducers/creation.ts`: add `import { computeCreationStats } from '../data/race_bonuses';` and replace

```typescript
const classStats = computeBaseStatsForGenerated(primaryStat, secondaryStat, 1n);
```
with
```typescript
const { stats: classStats } = computeCreationStats(primaryStat, secondaryStat, state.raceBonuses);
```
Everything below (`str: classStats.str` ...) stays. The `computeBaseStatsForGenerated` destructure from `deps` then becomes unused in `creation.ts`; remove that one name from the destructure only if the build complains (server tsconfig has no `noUnusedLocals`; the root one does but does not compile reducers). `state.raceBonuses` is the same JSON the player saw (copied from the reply or from `race_definition` at the race step). The `secondaryStat = cs.secondaryStat || undefined` line can stay: the helper normalises `'none'`. Net effect: confirm no longer throws on `'none'` (F1) and stats become class base plus race bonus.

No schema change: `character` already stores `str/dex/cha/wis/int`; no new table, column or reducer. `recomputeCharacterDerived` reads the stored stats and does not overwrite them (it derives `maxHp = 50 + str*8 + ...`), so a +STR race bonus raises starting max HP by 8 per point (balance note for the owner). The module surface does not change, so `pnpm spacetime:generate` should produce no diff (still run it to confirm).

### Pattern 3: `deriveScreen` gains `creation`

Add input `activeCharacterPlaced: boolean` (= active character loaded and `locationId !== 0n`) and replace the `noCharacters` kind with `creation`:

```typescript
if (input.activeCharacterId !== null) {
  if (!input.activeCharacterLoaded) return waiting;
  return input.activeCharacterPlaced ? { kind: 'frame' } : { kind: 'creation' };
}
if (input.characterCount === 0) return { kind: 'creation' };
return { kind: 'picker' };
```
In `useSession.ts` the `screenInput` computed adds `activeCharacterPlaced: activeCharacter.value !== null && activeCharacter.value.locationId !== 0n`. The `awaitingSessionData` watchdog reuses `screenInput`, so it needs no change. A stranded unplaced character with no active id shows the picker; selecting it makes the active character unplaced and therefore `creation` (matches UI-SPEC).

### Pattern 4: the held-private-rows fix for O3 (smallest client change)

Facts: `gameData.ts` builds `privateEvents = keyedEvent(userKey, ...)` with `userKey = input.userId`, so the `event_private` subscription is live from sign-in, through creation. The row reaches `feed.ingest('private', row)`, but `acceptRow` returns false when `characterId` is null, and the finalize tx sets the active character in the same transaction, so whether the tips survive depends on callback order inside one `TransactionUpdate`. Fix inside `src/console/feedStore.ts` only (not in `gameData.ts`):

- In `ingest`, when `characterId.value === null` and `source === 'private'` and `row.characterId` is defined and `row.kind !== 'presence'`, push the row into a bounded `held` array (cap 50, oldest dropped) instead of discarding it.
- In `setCharacter(id)`, after `reset()`, if `id !== null`, re-ingest every held row whose `row.characterId === id`, then clear `held`. Rows for other characters are dropped. `setCharacter(null)` and `clear()` empty `held`.
- `acceptRow` stays pure and unchanged (its test `accepts nothing without an active character` still holds); `setCharacter(null) clears and then accepts nothing` still holds because held rows are never visible until a matching `setCharacter`.
- The replayed tips sort by `createdAt` ahead of the automatic `look` (which fires after `privateEventsApplied`), so they appear first in the new character's feed.
- Rows that arrive after the character became active (including world-gen ripple lines while the creation view still shows step 5) already flow into the hub feed and are shown when the frame mounts.

### Pattern 5: entry, start and hand-off

- The hub keeps `character_creation_state` and `event_creation` subscribed (both filtered by `player_id = my identity`, tiny) while no placed active character exists, so they are applied long before the first `start_creation`. `race_definition` is subscribed while the creation view is mounted.
- `start_creation` is called once per view mount, only when the account has zero characters (`characterCount === 0`), only after `connected`, the characters binding applied, the state binding applied and the event binding applied. Calling it before the event subscription applies can lose the greeting (event rows are delivered only to current subscribers; the old client needed a re-trigger workaround for this race). `start_creation` is idempotent: it writes either the greeting (new state) or a resume line (existing state), so calling it again is a safe Retry.
- When showing an unplaced active character (step 5), do not call `start_creation`.
- Hand-off: the frame replaces the view when the active character is loaded and placed. `set_active_character` is never needed in the normal path (finalize sets the active id itself). The UI-SPEC branch "call `set_active_character` once with the newest character id at COMPLETE when `activeCharacterId` is missing" is unreachable through `deriveScreen` (zero characters shows creation; one or more characters with no active id shows the picker). Implement it only as a defensive no-op guard, or drop it and note it in the plan.
- The player's identity for the filters comes from the `my_player` row's `id` (`Player.id` is the Identity). The session already holds this row.

### Anti-Patterns to Avoid
- **Routing creation text through `routeInput`/`useConsole`:** needs a character id, so `submit()` returns `offline`; and command words (`who`, `look`, `/x`) would be interpreted. Creation text must go straight to `submit_creation_input` (Q6). `routeInput` is never imported by the creation slice.
- **Using `lines.ts` for creation rows:** its segment path ignores the row `kind`, so a `creation_error` with segments renders as a Keeper line, and `creation_warning` falls through to a plain `system` line. Classify by row kind first.
- **Optimistic state:** step bar and sheet derive only from the subscribed row.
- **Putting creation bindings in `gameData.ts` or `context.ts`:** both are being edited by the parallel quick tasks.
- **`v-html`:** race names are authored by other players; every string is a text node.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Class base stats | A client copy of the +4/+2 rule | `computeBaseStatsForGenerated` via `@game-data/class_stats` | Server is source of truth (project rule) |
| Race bonus combination | A client re-implementation of "add race to class" | `data/race_bonuses.ts` (new), called by finalize and the sheet | One rule, no drift (O5) |
| Progress line text and pools | Copied strings | `selectLlmIndicator(jobs, 'creation', rotation)` and `LLM_*` via `@game-data/llm_indicator_lines` | Already scoped: `LLM_CREATION_CONSOLE_ROUTES` = creation_race, creation_class_reveal, creation_class, world_gen_start, world_gen |
| Server-text cleaning | Ad-hoc regex | `cleanServerText` (brackets, color tokens) plus one `**` strip in `creationLines.ts` | Already tested; `**` is the only extra transform |
| Subscriptions | Raw SDK subscribe calls | `bindTable` (rows) and `bindEventTable` (event rows) | Reconnect handling, stale-apply safety, no listener stacking |
| Scroll pinning | New math | `isPinned`, `prefersReducedMotion` from `console/pinning.ts` | 48px rule is a tested contract |
| Input history | New ring buffer | `createInputHistory` | 50 lines, draft restore |
| Modal sheet, focus trap, Esc | A new dialog | `frame/Sheet.vue` | 45 contract (grabber, close, trap, focus return) |
| Keyboard-open detection | `visualViewport` code | `useKeyboardOpen(focusedRef)` | Existing threshold (120px) |
| Ability kind icon | A table | `abilityIcon(kind)` from `hotbar/hotbar.ts` | 47 table with fallback |
| Name, archetype, ability matching | Client validation | Send the text; show the server's `creation_error` | Server rules are the contract (UI-SPEC) |

**Key insight:** this phase is mostly derivation. Every behavior (what is allowed at each step, what text means what) is already in the server; the client's job is to show the row, send plain words, and never second-guess the server.

## Common Pitfalls

### Pitfall 1: `secondaryStat: 'none'` makes confirm throw (F1)
**What goes wrong:** `finalizeCharacter` passes `'none'` into `computeBaseStatsForGenerated`, which executes `stats['none'] += 2n` and throws `Cannot mix BigInt and other types`. The reducer rolls back and the player is stuck at `CONFIRMING` with no feed line (the client sees only a rejected promise). [VERIFIED: probe test run in this session; the LLM schema allows `'none'` (`llm_schemas.ts:118`) and `validateClassReply` keeps it]
**How to avoid:** the new helper normalises any non-stat value to "no secondary"; add a regression test through the real handler.
**Warning signs:** `Cannot mix BigInt` in `spacetime logs uwr`.

### Pitfall 2: level-up erases the race bonus and can mis-detect the secondary (F2, decision D1)
**What goes wrong:** `apply_level_up` (`index.ts:495`) and the admin level command (`commands.ts:607`) call `detectPrimarySecondary(character)` then overwrite all five stats with `computeBaseStatsForGenerated(primary, secondary, newLevel)` plus the legacy `race`-table racial (null for generated races). Stats applied only at finalize vanish at the first level-up, and a +2/+3 bonus on a non-class stat can tie or beat the class secondary, so detection (needs a strict gap between 2nd and 3rd) can pick the wrong secondary or none. `getAbilityStatScaling` (hybrid) also detects from live stats. [VERIFIED: code read]
**Why it matters:** the owner's decision is literal ("applied at finalize", "existing characters are not recomputed"). Honouring it exactly makes the bonus a level-1-only effect.
**Options:** (A) finalize only, as decided, and record the level-up behavior as an owner decision; (B) also carry the bonus through the two level-up sites by subtracting the race bonus before detection and adding it after (looked up from `race_definition` by `character.race`), but characters created before this phase never received the bonus, so subtracting it from their stats would corrupt their detection; there is no schema marker to tell them apart (a column is out of scope). **Recommendation: A for this phase** (it is the literal decision and the only safe code-only option), expose `computeCreationStats` so a later change can reuse it, and list D1 prominently in the plan summary and the milestone-end UAT so the owner decides on B or a marker column.

### Pitfall 3: the server's substring go-back detection can hijack a card click
**What goes wrong:** at `AWAITING_ARCHETYPE`, `CLASS_REVEALED` and `CLASS_FILL_ERROR` any text containing `redo`, `undo`, `go back`, `wait no`, `try again`... starts a go-back instead. An ability named for example "Redoubt Strike" or "Undoing Word" sent by its card goes to `CONFIRMING_GO_BACK`. [VERIFIED: `isGoBackIntent`]
**How to avoid:** none on the client without a server change (substring matching of the ability name in the other direction would risk matching a different ability). Add a pure check in tests over the fixture abilities, flag it in the plan as a known server quirk, and let the player recover with `Keep it` / typing. Low probability, not blocking.

### Pitfall 4: calling `start_creation` before `event_creation` is applied loses the greeting
**What goes wrong:** event rows reach only live subscribers. **How to avoid:** gate `start_creation` on the event binding `applied` (and state binding applied). A lost greeting is recoverable (calling `start_creation` again writes a resume line). Event rows are not replayed after a reload or a reconnect, so a missed line is simply missing; the step bar and choice block recover from the row.

### Pitfall 5: the Phase 47 `Composer` cannot be reused
**What goes wrong:** `useConsole.submit()` requires `game.characterId`, runs `routeInput`, and the Composer has fixed `aria-label="Your action"` and placeholders. **How to avoid:** `CreationComposer.vue` with its own draft ref, `createInputHistory`, `INPUT_MAX_CHARS`, IME guard (`event.isComposing`), Enter sends, locked and disabled states from `controlsFor(step)`. It also needs its own `inputFocused` ref for `useKeyboardOpen`.

### Pitfall 6: `lines.ts` classification differs from the creation contract
**What goes wrong:** segment rows become Keeper lines whatever their kind; `creation_error` with segments (written by `keeperFallback`) must be an Error line; `creation_warning` has no class; `FeedLine`'s Keeper body does not preserve newlines (`white-space: pre-line` is needed for the `Race: ... / Class: ...` summary); `**` markers are not removed for segment rows. **How to avoid:** `creationLines.ts` classifies by `row.kind` first, cleans text (brackets and `**`), and returns `FeedLineView`-shaped objects so `FeedLine.vue` renders them. Preserve newlines with a scoped `:deep(.line-keeper .body) { white-space: pre-line }` in `CreationFeed.vue`. The warning icon (`PhWarning` leading the label row) needs an optional flag on `FeedLine.vue` or a wrapper; `FeedLine.vue` already imports `PhWarning`. Because quick task 261006-a0i edits `FeedLine.test.ts`, put any new FeedLine tests in a new file.

### Pitfall 7: a transient `picker` frame can unmount the creation view
**What goes wrong:** at finalize the character row (filtered table) and the `my_player` view update arrive together in one transaction, but if the callbacks interleave, `deriveScreen` can briefly see one character and no active id (`picker`), unmounting the view; feed lines held in the view are lost (event rows do not replay). **How to avoid:** keep the creation feed store and state in the session-owned hub (cleared only on logout `reset()`), keep the bindings live while there is no placed active character, and make remount side-effect free (`start_creation` only when the account has zero characters). Add a test that unmount and remount keeps the lines.

### Pitfall 8: the first-region retry control depends on `my_llm_jobs`
**What goes wrong:** UI-SPEC shows the error marker and `Retry` when `COMPLETE`, unplaced and no world job is active. If `my_llm_jobs` has not applied or lags, a spurious error flashes. **How to avoid:** only evaluate "no job" after the jobs binding has applied (it is a static, long-applied binding, and the job is inserted in the same tx as the character), and derive the working flag from `LLM_CREATION_CONSOLE_ROUTES` jobs with an active status. As a belt-and-braces signal the `world_gen_state` row (public, `by_player`) shows `ERROR`; the planner may add that filtered subscription if it wants a second source.

### Pitfall 9: transitions that discard rows
**What goes wrong:** the state row is replaced on every update (`id.update`); `bindTable` re-reads on insert/delete/update, so the hub's `stateRow` computed changes identity on each step. **How to avoid:** derive everything from the row with pure functions and key Vue lists by stable ids. Pick the lowest-id row for the player (the server reads the first row of `by_player`).

### Pitfall 10: stale schema comment and resume-line wording
`tables.ts:1931` omits `CLASS_FILLING` and `CLASS_FILL_ERROR`; the resume line at `AWAITING_NAME` says `Four characters minimum` against a validation of 3 (UI-SPEC O2: shown as sent). Neither is changed here (SEG-03 / out of scope).

### Pitfall 11: second device and stale COMPLETE rows (server limits, not fixed here)
`start_creation` checks "already has a character" only at start; `finalizeCharacter` does not re-check, so two devices of one user mid-creation could finalize twice. A `COMPLETE` state row survives for an account whose character was removed by an admin, leaving `start_creation` stuck on the "already created" line. Both are rare, pre-existing and out of scope; mention in the verification notes.

## Code Examples

### Step derivation (pure, one test row per server step)
```typescript
// src/creation/creationSteps.ts  (UI-SPEC "Mapping of every server step")
export type Position = 1 | 2 | 3 | 4 | 5;
export interface StepView { position: Position; error: boolean; working: boolean; known: boolean }

const POSITION: Record<string, { position: Position; working?: boolean; error?: boolean }> = {
  AWAITING_RACE: { position: 1 },
  GENERATING_RACE: { position: 1, working: true },
  AWAITING_ARCHETYPE: { position: 2 },
  GENERATING_CLASS: { position: 3, working: true },
  CLASS_FILLING: { position: 3, working: true },
  CLASS_FILL_ERROR: { position: 3, error: true },
  CLASS_REVEALED: { position: 3 },
  AWAITING_NAME: { position: 4 },
  CONFIRMING: { position: 5 },
};
// CONFIRMING_GO_BACK -> position of previousStep (1 if absent). COMPLETE + unplaced -> 5 (working if a world job is active, else error).
// Unknown step -> last known position (1 if none), known:false (input locked, no choice block). No row -> position 1, working false.
```

### Entry rule
```typescript
// src/session/useSession.ts (screenInput)
activeCharacterPlaced: activeCharacter.value !== null && activeCharacter.value.locationId !== 0n,
```

### Subscriptions (verified SQL shape)
```typescript
// src/creation/queries.ts  (SQL emitted in a probe this session)
// SELECT * FROM "event_creation" WHERE "event_creation"."player_id" = 0x<identity hex>
eventCreation: (id: Identity) => toSql(tables.eventCreation.where((r) => r.playerId.eq(id))),
creationState: (id: Identity) => toSql(tables.characterCreationState.where((r) => r.playerId.eq(id))),
raceDefinitions: toSql(tables.raceDefinition),   // SELECT * FROM "race_definition"
```

### Server pin test through the real handler (pattern from `llm_cutover.test.ts`)
```typescript
// spacetimedb/src/reducers/creation_finalize.test.ts
vi.mock('spacetimedb/server', async () => (await import('../helpers/schema_recorder')).createRecordingServerMock());
beforeAll(async () => { await import('../index'); submit = capturedReducer('submit_creation_input'); }, 120_000);
const ctx = createMockCtx({ seed: { player: [{ id: alice, userId: 7n }], character_creation_state: [{ id: 1n, playerId: alice, step: 'CONFIRMING',
  raceName: 'Saltkin', raceBonuses: '{"primary":{"stat":"dex","value":2},"secondary":{"stat":"int","value":1}}',
  classStats: '{"primaryStat":"int","secondaryStat":"wis"}', archetype: 'mystic', className: 'Tidecaller', characterName: 'Mirel',
  createdAt: T, updatedAt: T }] }, sender: alice, timestampMicros: T0, strict: true });
submit(ctx, { text: 'confirm' });
expect(ctx.db._tables.character[0]).toMatchObject({ str: 8n, dex: 10n, cha: 8n, wis: 10n, int: 13n });
```
(This exact seed shape ran green in the probe; the probe showed today's output with a `str +2 / dex +1` race ignored: `str 8, dex 8, cha 8, wis 10, int 12`.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Old client creation console (`v2.2-client` `useCharacterCreation.ts`: `autoStartCreation`, `creationCombinedEvents`, `isCreationLlmProcessing`, auto-select on COMPLETE) | New creation slice, step derived from the row, input lock from the controls matrix, hand-off by `deriveScreen` | v3.0 | Old client re-triggered `start_creation` if no events arrived (the same lost-greeting race); new client gates on `applied` |
| Race bonuses ignored at finalize (class base only) | Class base plus race bonus via `computeCreationStats` | this phase (owner decision) | Balance change for new characters; level-up behavior is decision D1 |

**Deprecated/outdated:** the `noCharacters` screen kind and `NoCharactersNote.vue` (replaced by `creation`); the stale step comment in `tables.ts`.

Old-client behavior worth keeping (from `git show v2.2-client:src/composables/useCharacterCreation.ts`): filter creation events by own identity; sort by `createdAt`; lock input during `GENERATING_*` (list from `LLM_INPUT_LOCKING_CREATION_STEPS`, but note CLASS_FILLING and CLASS_FILL_ERROR are deliberately not in it, while UI-SPEC locks CLASS_FILLING and leaves CLASS_FILL_ERROR open); auto-pick the newest character on COMPLETE (not needed: finalize sets the active id).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Within one `TransactionUpdate` the SDK may fire the `event_private` insert before or after the `character`/`my_player` callbacks, so the held-rows buffer is needed (order not documented in the SDK docs consulted) | Pattern 4 | Low: the buffer is harmless if order happens to be favorable; test it with a fake binding |
| A2 | `character` and `my_player` updates for the finalize tx arrive in one message, so a transient `picker` is unlikely | Pitfall 7 | Low: the hub-owned feed makes it harmless either way |
| A3 | The race-bonus helper clamps (primary 3, secondary 2) are the right ceiling for legacy `race_definition` rows written before Phase 41 | Pattern 1 | Low: the one local row is within range; an out-of-range legacy row would be capped, not rejected |
| A4 | Recommending option (A) for D1 (no level-up carry-through) is what the owner wants | Pitfall 2 | Medium: if the owner wants the bonus to persist, a follow-up server task (and probably a marker column) is needed |
| A5 | The old client's `LLM_INPUT_LOCKING_CREATION_STEPS` comment about CLASS_FILLING staying open is superseded by UI-SPEC A11 (input locked while `CLASS_FILLING`) | State of the Art | Low |

## Open Questions (RESOLVED)

1. **D1: should the race bonus survive level-up?**
   - What we know: finalize-only is the literal decision; level-up recomputes stats from the class pair (F2) and drops the bonus; carrying it through is unsafe for existing characters without a marker.
   - What's unclear: whether the owner wants the bonus permanent.
   - Recommendation: implement finalize-only now, add a prominent entry to the phase summary and the milestone-end UAT list, and keep `computeCreationStats` reusable. Do not widen the server change in this phase.

   - RESOLVED by the owner (2026-10-06, in chat): "Keep it through level-up". Finalize AND both level-up sites carry the race bonus: subtract it before `detectPrimarySecondary` and add it back after `computeBaseStatsForGenerated`, looked up from `race_definition` by `character.race`. Code only, with no marker column. Pre-phase characters may drift at their next level-up, which the owner accepted as greenfield. See 49-CONTEXT "Owner decision after research: D1".

2. **Warning icon placement.** UI-SPEC puts `PhWarning` inside the Keeper label row. That needs a small additive flag in `FeedLine.vue`/`lines.ts` (files near the parallel quick tasks) or a wrapper element beside the line. Recommendation: a wrapper in `CreationFeed.vue` (no 47 file edits) unless the plan runs after the quick tasks merge.

   - RESOLVED: a wrapper in `CreationFeed.vue`, with no edits to the Phase 47 `FeedLine.vue` or `lines.ts` (quick tasks a0i and a3d own those files).

3. **Reconnect mid-interview.** Event rows sent while disconnected are lost; UI-SPEC says one `start_creation` per mount. Optional improvement: call it once more when status returns to `connected` while the account still has no character (writes a resume line). Recommendation: leave out unless UAT shows a gap; mention it in the plan as a cheap follow-up.

   - RESOLVED: left out of this phase and listed in the plan as a cheap follow-up if UAT shows a gap.

4. **The `set_active_character` branch** in UI-SPEC "Entering the realm" is unreachable through `deriveScreen`. Recommendation: implement nothing, or a defensive one-shot guarded by "COMPLETE, one character, no active id".

   - RESOLVED: the defensive one-shot only, guarded by "COMPLETE, one character, no active id".

5. **`CONFIRMING` Start over has no server confirmation** (UI-SPEC A12 adds a client one). Confirmed correct by the code.
   - RESOLVED: confirmed correct by the code. The client confirmation (UI-SPEC A12) stays.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | tests, build | yes | v22.23.2 | none needed |
| pnpm | scripts | yes | 11.23.0 | none needed |
| SpacetimeDB CLI | local publish and generate (executor step only) | yes | binary present (`spacetime --version` reports path/commit) | none needed |
| Local SpacetimeDB server | publish, live checks | yes, answers `/v1/ping` 200 | owner's server (do not start or stop) | none needed |
| Vite dev server | owner try-out | yes, `http://localhost:5173` 200 | owner's (do not stop) | none needed |
| Anthropic key (local) | live creation | stored; `admin_llm_status` reads `key_set true, key_length 108` just now | n/a | live creation is deferred to the milestone UAT (no paid calls) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

Publish procedure for the one server change (executor runs it; this research did not):
1. Before: `spacetime sql --server local uwr "SELECT key_set, key_length FROM admin_llm_status"` (expect `true | 108`; read 108 this session).
2. `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null` (never `--clear-database`, never `--server maincloud`; the change is code-only so the flag is a precaution that matches the owner's instruction and prior phases).
3. After: `spacetime logs --server local uwr 2>&1 | tail -n 60 | grep -iE "database updated|panic|error"` shows the update and no panic, and the key check again reads 108.
4. `pnpm spacetime:generate` (module surface unchanged: expect no diff in `src/module_bindings`).
5. Existing characters are untouched: no migration runs and finalize is only invoked for new characters.

## Validation Architecture

(`workflow.nyquist_validation` is `true` in `.planning/config.json`.)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 5.0.2 (root, happy-dom per file via `// @vitest-environment happy-dom`; server tests run in node under `spacetimedb/`) |
| Config file | none (root uses `vite.config.ts`; `@game-data` alias already defined there) |
| Quick run command | `pnpm exec vitest run src/creation src/session --maxWorkers=1` and `cd spacetimedb && pnpm exec vitest run src/data/race_bonuses.test.ts src/reducers/creation_finalize.test.ts --maxWorkers=1` |
| Full suite command | `pnpm exec vitest run --maxWorkers=1` (root run also picks up the 76 `spacetimedb/src` test files) plus `pnpm exec vue-tsc -b`. Baseline failures to ignore: `scripts/llm/call_log_report.test.mjs`, `scripts/llm/proof_rules.test.mjs`, `spacetimedb/src/helpers/measurement.results.test.ts` |

Measured this session: `deriveScreen.test.ts` plus `feedStore.test.ts` (69 tests) run in about 1.2 s; a server test file about 0.8 s plus a first import of `index.ts` of about 4 s.

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CRE-01 | one position/marker/working row per server step incl. CONFIRMING_GO_BACK each `previousStep`, COMPLETE with and without job, no row, unknown; no "First words" in source | unit | `pnpm exec vitest run src/creation/creationSteps.test.ts` | no, Wave 0 |
| CRE-01 | controls matrix per step (quick row, decision row, placeholder, lock); `Go back` only at AWAITING_ARCHETYPE, CLASS_REVEALED, CLASS_FILL_ERROR; `Retry` sends `retry` / `explore`; `Yes, go back` sends `yes`, `Keep it` sends `no`; Start over needs confirmation | unit | `pnpm exec vitest run src/creation/creationControls.test.ts` | no, Wave 0 |
| CRE-01 | classification: kind first, segments, `**` stripped, brackets unwrapped, warning flag, echo, newlines kept, text nodes | unit + component | `pnpm exec vitest run src/creation/creationLines.test.ts src/creation/CreationFeed.test.ts` | no, Wave 0 |
| CRE-01 | hub: start once per mount, only with zero characters, gated on applied, rejection -> Error line + Retry; send paths echo then `submit_creation_input`; empty text never sent; lines survive remount | unit | `pnpm exec vitest run src/creation/creationData.test.ts` | no, Wave 0 |
| CRE-01 | `deriveScreen`: `creation` for zero characters and for unplaced active; picker unchanged (no New character button); frame for placed; no `noCharacters` kind remains; `useSession` and `App` wiring | unit | `pnpm exec vitest run src/session src/App.test.ts` | exists, update (see blast radius) |
| CRE-01 | step bar render, mobile text `Step 2 of 5 · Archetype`, `aria-current`, hidden status line | component | `pnpm exec vitest run src/creation/StepBar.test.ts` | no, Wave 0 |
| CRE-01 | enter the realm hold while unplaced, frame swap when `locationId != 0` | component | `pnpm exec vitest run src/creation/CreationView.test.ts` | no, Wave 0 |
| CRE-01 | design guards over the new files (no new token, no literal color, spacing scale, Phosphor only, no v-html, headings h4/h6) | static | `pnpm exec vitest run src/styles` | exists; scans new files automatically |
| CRE-02 | sheet model per step (before any choice, after race projection, archetype, class reveal, class fill, ability, name), cleared fields after go-back, malformed JSON tolerated, raw `<b>` literal | unit | `pnpm exec vitest run src/creation/sheetModel.test.ts src/creation/CreationSheet.test.ts` | no, Wave 0 |
| CRE-02 | sheet imports the shared helper (source pin) and equals `computeCreationStats` for the same fixtures | unit | same | no, Wave 0 |
| CRE-02 | helper purity, normalisation, clamps, unknown stat dropped, projection | unit (server) | `cd spacetimedb && pnpm exec vitest run src/data/race_bonuses.test.ts` | no, Wave 0 |
| CRE-02 | finalized stats = class base + race bonus; `'none'` secondary no longer throws; no `raceBonuses` = class base only; maxHp reflects STR; existing character stats unchanged by `set_active_character` | integration (real handler) | `cd spacetimedb && pnpm exec vitest run src/reducers/creation_finalize.test.ts` | no, Wave 0 |
| CRE-02 | held private rows replayed on `setCharacter`, others dropped, cap 50, `clear()` empties | unit | `pnpm exec vitest run src/console/feedStore.test.ts` | exists, extend |
| CRE-02 | mobile Sheet chip opens the same content, Esc and close dismiss and return focus, keyboard-open compaction | component | `pnpm exec vitest run src/creation/CreationView.mobile.test.ts` | no, Wave 0 |
| CRE-03 | newest-3 rule (ties by larger id), fewer than 3, none (note line), not applied (nothing), tags incl. missing/malformed/unknown stat, description fallback, card click sends the name, `Surprise me` sends exactly `Surprise me.`, free text as typed | unit + component | `pnpm exec vitest run src/creation/raceCards.test.ts src/creation/ChoiceBlock.test.ts` | no, Wave 0 |
| CRE-01/03 | archetype and ability cards send `Warrior`/`Mystic`/ability name; unparseable `abilities` shows no cards; block inert while sending and re-enabled on rejection | component | `pnpm exec vitest run src/creation/ChoiceBlock.test.ts` | no, Wave 0 |
| CRE-01 | button text pins (`retry`, `go back`, `yes`, `no`, `start over`, `Confirm`, `explore`, `Surprise me.`) against the server's matching rules; the go-back-phrase check over fixture ability names | unit | `pnpm exec vitest run src/creation/serverWords.test.ts` | no, Wave 0 (imports the phrase list through a source-text read of `creation.ts`, like `Composer.test.ts` does for the length limit) |
| all | `@game-data` alias exposes `class_stats` and `race_bonuses`, which import nothing but each other | unit | `pnpm exec vitest run src/gameDataAlias.test.ts` | exists, extend |

### Sampling Rate
- **Per task commit:** the quick run command for the touched slice.
- **Per wave merge:** root full suite with `--maxWorkers=1` plus `pnpm exec vue-tsc -b`.
- **Phase gate:** full suite green (ignoring the three baseline failures) and `pnpm build` (includes `scripts/check-bundle.mjs`) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `spacetimedb/src/data/race_bonuses.ts` and `race_bonuses.test.ts` (helper first: everything else imports it)
- [ ] `spacetimedb/src/reducers/creation_finalize.test.ts` (real-handler harness copied from `llm_cutover.test.ts`: `capturedReducer`, `createMockCtx({ strict: true })`)
- [ ] `src/creation/creationSteps.test.ts`, `creationControls.test.ts`, `raceCards.test.ts`, `sheetModel.test.ts`, `creationLines.test.ts`, `creationData.test.ts`, `serverWords.test.ts`
- [ ] Component tests: `StepBar`, `CreationFeed`, `ChoiceBlock`, `CreationComposer`, `CreationSheet`, `CreationView` (desktop and mobile)
- [ ] Framework install: none

### Test blast radius (Q8)
Existing tests that must change (all because of `ScreenInput`/`AppScreen`/`noCharacters` removal):
- `src/session/deriveScreen.test.ts`: `base` gets `activeCharacterPlaced`; the `noCharacters` rows become `creation`; add rows for unplaced active (`creation`), placed active (`frame`), unplaced active but not loaded (`signingIn`).
- `src/session/useSession.test.ts` line ~441 ("shows the no-characters note with zero rows") becomes `creation`; `makeCharacter` has `locationId: 10n`, so every existing frame test stays `frame`.
- `src/App.test.ts`: the `NoCharactersNote` import and the `noCharacters` test (lines 8, 109, 134-139) become a `CreationView` case; `fakeSession` gains the `creation` hub.
- `src/session/CharacterPicker.test.ts`: delete the `NoCharactersNote` import and `describe('NoCharactersNote')` (lines 7, 136-152) together with `NoCharactersNote.vue`. The picker tests themselves are unchanged (no New character button).
- `src/console/feedStore.test.ts`: additive (held rows); the two "accepts nothing" tests stay valid.
- Unaffected if the recommendation is followed: Phase 47 `Composer`, `FeedView`, `useConsole`, hotbar, `gameData`, rails and Phase 48 combat tests (none of those files change).
- Auto-scanned guards that the new files must satisfy: `designContract.test.ts` (type scale 10/12/14/20, weights 400/500, spacing 0/4/8/16/24/32/48/64 for padding, margin and gap, only h4/h6, Phosphor only, no inline svg, no `v-html`, focus ring never removed), `colors.guard.test.ts`, `tokens.client.test.ts` (23 tokens), `scrollbars.test.ts` (dark scrollbar rule on scrollable surfaces), and the bundle guard in `pnpm build`.
- Server: `llm_cutover.test.ts` confirm tests (lines ~1560-1600 and ~2046-2150) use `confirmSeed` with no `classStats`; they do not assert stats, so they stay green; run them as the regression check for the finalize edit. `creation_validate.test.ts` is unaffected (the helper does not touch it).

### Parallel quick tasks (planning-relevant overlap)
Untracked plans seen in `.planning/quick/`: `261006-a0i` (Nearby enemies with pull actions) edits `src/game/{queries,gameData,context}.ts` (+ tests), `src/rails/enemies.ts`, `src/console/{useConsole,keywords,keywordLabel,FeedView.vue}` (+ `FeedLine.test.ts`, `FeedView.test.ts`), `src/rails/NearbyList.vue`, `ContextContent.test.ts`; `261006-a13` (action progress bar) edits `src/action/*`, `src/game/{queries,gameData,context}.ts`, `src/frame/FeedShell.vue`. Rules for this phase: never edit those files; keep the creation hub, queries, injection key and tests in `src/creation/`; import `abilityIcon` from `hotbar/hotbar.ts` and read `game.llmJobs` read-only; the files this phase does edit (`useSession.ts`, `deriveScreen.ts`, `App.vue`, `feedStore.ts`, `CharacterPicker.test.ts`) are not on either list. If the warning icon is added to `FeedLine.vue`/`lines.ts`, schedule it after the quick tasks land or use the wrapper in Open Question 2.

## Security Domain

`security_enforcement` is not set to false in config, so it applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged; Phase 45 session and `login_email`) | existing |
| V3 Session Management | no | existing |
| V4 Access Control | yes | Reducers key on `ctx.sender`; the client never sends identity or character id for creation. `event_creation`, `character_creation_state` and `race_definition` are public tables, so the `WHERE player_id = me` filter only scopes the client; it is not access control (known, tracked as T-47-04b for event tables) |
| V5 Input Validation | yes | Server validates names, archetype, ability match and truncates player text to 1000 code points (`truncateCodePoints`, 40-03 escaping for prompts); client trims, drops empty text, caps at `INPUT_MAX_CHARS`, and shows server refusals as sent |
| V6 Cryptography | no | none |

### Known Threat Patterns for Vue + SpacetimeDB creation

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stored XSS via another player's invented race name, class name, ability text or Keeper narrative shown on cards, sheet and feed | Tampering | Text nodes only (no `v-html`; the designContract test enforces it); `title` attributes and `aria-label` built from strings, never HTML; a test renders `<b>x</b>` literally in cards, sheet and feed |
| Prompt injection through a race card (stored race name sent back as typed text) | Tampering | Card click is the free-text path: an exact stored name is reused with no model call; any other text is truncated and escaped by the server layers (Phase 40) |
| Information exposure of other players' creation text/state (public tables) | Information disclosure | Filtered subscriptions (aids scoping only); recorded as a known gap, not widened; never subscribe `event_creation` or `character_creation_state` unfiltered |
| Reducer spam / double submit | DoS | Block, quick row and decision row inert while a send is in flight; server per-player caps and budget already apply to LLM routes |
| Unbounded client memory from event rows | DoS | Creation feed capped at 300 lines; held private rows capped at 50 |
| Client-trusted stats | Tampering | Final stats are computed only on the server in finalize; the sheet is a projection |

## Project Constraints (from CLAUDE.md)

- SpacetimeDB rules: reducers are transactional and deterministic; read data via tables and subscriptions, never reducer return values; `ctx.sender` is the principal (never trust identity args); reducer calls use object syntax (`conn.reducers.submitCreationInput({ text })`); camelCase table handles; do not edit generated bindings (regenerate with `spacetime generate`); do not invent SpacetimeDB APIs.
- Feature checklist: backend tables and reducers, client subscribes, client calls the reducer (do not forget the wiring), client renders from tables. Here the backend already exists, so the work is subscribe, call and render; `startCreation` and `submitCreationInput` have no client caller today.
- Timestamps are objects on the client: use `createdAt.microsSinceUnixEpoch`.
- Publishing: local only; maincloud is manual and never automatic; never `--clear-database` unless a schema change requires it (none here); the CLI flag is `-p`.
- Editing behavior: smallest change, do not touch unrelated files, configs or dependencies.
- Project memory rules honored: server is the source of truth (no copied constants; import through `@game-data`); prefer `fail()` over `SenderError` where character context exists (not applicable: no new server validation); all new work includes unit tests; the Keeper is "he", every NPC male or female (not touched, client copy uses no first person or pronoun for the Keeper); no UI-SPEC rework before the UX overhaul (the UI-SPEC is already approved); greenfield: no compat shims; UAT deferred to milestone end.
- `.claude/skills/` contains only `run-local` (not relevant to implementation).

## Sources

### Primary (HIGH confidence)
- `spacetimedb/src/reducers/creation.ts`, `helpers/creation_generation.ts`, `helpers/llm_apply.ts` (creation apply and failure), `helpers/creation_validate.ts`, `helpers/llm_sweeper.ts` (creation lock release), `data/class_stats.ts`, `data/llm_indicator_lines.ts`, `data/llm_schemas.ts` (read in full or in the relevant ranges)
- `spacetimedb/src/schema/tables.ts` (table definitions), `src/module_bindings/*` (exact row and reducer shapes)
- Client: `src/session/{deriveScreen,useSession,CharacterPicker,NoCharactersNote,PreFrameHeader}.*`, `src/App.vue`, `src/frame/{AppFrame,FeedShell,Sheet,NoticeBars,useKeyboardOpen,useBreakpoint}.*`, `src/game/{gameData,context,queries,bindEventTable,keyedBinding}.ts`, `src/console/{feedStore,lines,FeedView,FeedLine,KeeperProgress,indicator,cleanServerText,pinning,useConsole}.*`, `src/input/{Composer,history,limits}.*`, `src/styles/{designContract.test,cssContract}.ts`
- `git show v2.2-client:src/composables/useCharacterCreation.ts` (old behavior reference)
- Probe tests run in this session and removed afterwards (working tree clean apart from the two untracked quick-task plans): (1) real `submit_creation_input` at CONFIRMING with `secondaryStat: 'none'` throws `Cannot mix BigInt and other types`; (2) with `raceBonuses` set, today's stored stats ignore them (`8,8,8,10,12`); (3) `toSql(...where(r => r.playerId.eq(identity)))` emits valid SQL for `event_creation`, `character_creation_state`, `world_gen_state`; (4) the prototype helper's numbers above
- Local database reads (read-only `spacetime sql`): `admin_llm_status` (`true | 108`), `race_definition` (one Dark-Elf row), `character_creation_state` (one COMPLETE row with real `class_stats`)
- `.planning/phases/49-*/49-CONTEXT.md`, `49-UI-SPEC.md` (approved), `.planning/STATE.md`, `.planning/REQUIREMENTS.md`, `.planning/config.json`, `.planning/quick/261006-a0i-*` and `261006-a13-*` plans

### Secondary (MEDIUM confidence)
- Phase 47/48 SUMMARY notes in `.planning/phases/48-combat-encounter/48-01-SUMMARY.md` and `48-14-SUMMARY.md` for the publish procedure and key-length check

### Tertiary (LOW confidence)
- None. No web search or library documentation lookup was needed: every question is about code in this repository, so the research-plan seam (Context7/web providers) was not used.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, nothing new; all reused modules were read.
- Architecture: HIGH for the state machine, data shapes and the server change (probes ran); MEDIUM for the SDK callback ordering behind the O3 buffer and the transient-picker case (A1, A2), both of which have harmless fallbacks.
- Pitfalls: HIGH for F1 and F2 (verified by probe and code); MEDIUM for Pitfall 3 (probability of an ability name containing a go-back substring is low but real).

**Research date:** 2026-10-06
**Valid until:** 2026-11-05 (repo-local findings; revisit if the quick tasks change `FeedLine`/`lines.ts` or if creation reducers change)
