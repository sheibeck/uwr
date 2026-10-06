# Phase 48: Combat Encounter - Pattern Map

**Mapped:** 2026-10-06
**Files analyzed:** 41 (1 server view + test, 7 modified game/console/frame files, about 30 new/extended client files)
**Analogs found:** 40 / 41 (the one gap is `useCombatController.ts`, which is a role-match only)

Line numbers refer to the checkout at commit e8400f47. Authoritative design detail (names, engine edge cases) is in 48-RESEARCH.md (Q1-Q9, Pitfalls 1-12) and 48-UI-SPEC.md. This map only says what to copy from.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `spacetimedb/src/views/combat.ts` (modify: add `my_combat_aggro`) | view | request-response (per-sender read) | `spacetimedb/src/views/groups.ts` `my_group_invites` + `views/llm.ts` `MyLlmJob` row | exact |
| `spacetimedb/src/views/combat.test.ts` (new) | test | request-response | `spacetimedb/src/views/llm.test.ts` | exact |
| `src/game/queries.ts` (modify) | config | request-response | itself (`hotbars`, `charactersById`) | exact |
| `src/game/queries.test.ts` (modify) | test | - | itself | exact |
| `src/game/gameData.ts` (modify: combat block) | service/hub | event-driven (subscriptions) | itself (`keyedTable`, `keyedIdList`, `staticBindings`) | exact |
| `src/game/gameData.test.ts` (modify) | test | - | itself (`queries` literal, `STATIC_SQL`) | exact |
| `src/game/context.ts` (modify: `GameReducers`, `GameData.combat`, inert default, `COMBAT_KEY`) | config | - | itself (`GAME_KEY`, `CONSOLE_KEY`, `createInertConsole`) | exact |
| `src/combat/difficulty.ts` | utility | transform | `src/rails/levelRange.ts` / `rails/effects.ts` (pure helpers) plus RESEARCH "Difficulty" snippet | role-match |
| `src/combat/hostiles.ts`, `threat.ts`, `windup.ts`, `roundClock.ts`, `choice.ts`, `cycling.ts`, `ally.ts`, `emphasis.ts`, `roundCooldown.ts` | utility | transform | `src/hotbar/hotbar.ts` (cooldownFraction/cooldownLabel) and `src/rails/party.ts` | role-match |
| `src/combat/useCombatController.ts` | provider/composable | event-driven | `src/console/useConsole.ts` (`createConsole` + `provide(CONSOLE_KEY)`) | role-match |
| `src/combat/useDamageFlash.ts` | hook | event-driven | `HotbarRow.vue` ready-flash `watch` (lines 124-148) | role-match |
| `src/combat/EncounterPanel.vue`, `HostileCard.vue`, `ThreatBlock.vue`, `InCombatTag.vue` | component | request-response | `src/rails/PartyBlock.vue`, `src/rails/NearbyList.vue` | role-match |
| `src/combat/EncounterStrip.vue`, `EncounterSheetBody.vue` | component | request-response | `src/frame/VitalsStrip.vue`, `src/frame/MoreSheet.vue` + `Sheet.vue` | role-match |
| `src/combat/RoundRow.vue` | component | request-response + timer | `src/hotbar/HotbarRow.vue` (ticker, reducer call, key handling) | role-match |
| `src/frame/ContextRail.vue` (modify) | component | request-response | itself + `rails/ContextContent.vue` | exact |
| `src/frame/AppFrame.vue` (modify) | component | request-response | itself | exact |
| `src/frame/useScreens.ts` (+test) (modify: `'encounter'` in `ActiveScreen`) | hook | - | itself (`'more'` handling) | exact |
| `src/frame/Sheet.vue` (modify: `meta` slot), `HeaderBar.vue` (`inCombat` prop), `FeedShell.vue` (RoundRow slot) | component | - | themselves | exact |
| `src/rails/PartyBlock.vue`, `src/frame/VitalsStrip.vue`, `VitalsRail.vue` (modify: ally select, flash) | component | request-response | `PartyBlock.vue` member card (lines 45-78) | exact |
| `src/hotbar/HotbarRow.vue` (modify: roundsLeft, chosen) | component | request-response | itself | exact |
| `src/console/feedStore.ts` (modify: round/windup entries, `narratedRound`) | store | event-driven | itself (`ingest`, `compareBatch`, `setQueued`) | exact |
| `src/console/lines.ts` (modify: `round`, `windup` kinds) | utility | transform | itself (`classifyByKind`) | exact |
| `src/console/FeedLine.vue`, `FeedView.vue` (modify) | component | transform | themselves | exact |
| `src/input/Composer.vue` (combat placeholder) | component | - | itself | exact |

## Pattern Assignments

### `spacetimedb/src/views/combat.ts` (view, per-sender read)

**Analogs:** `spacetimedb/src/views/groups.ts:4-19` (chain shape), `views/llm.ts:94-103` (named `t.row` projection), `views/combat.ts:3-25` (file to extend).

**Chained index lookup, player to characters to child rows** (groups.ts lines 4-19):
```typescript
spacetimedb.view(
  { name: 'my_group_invites', public: true },
  t.array(GroupInvite.rowType),
  (ctx: any) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player || player.userId == null) return [];
    const invites: typeof GroupInvite.rowType[] = [];
    for (const character of ctx.db.character.by_owner_user.filter(player.userId)) {
      for (const invite of ctx.db.group_invite.by_to_character.filter(character.id)) {
        invites.push(invite);
      }
    }
    return invites;
  }
);
```

**Projection row (no table `rowType`, because `aggro_entry` is private and has no exported Table dep)** (llm.ts lines 94-103, destructure only `{ spacetimedb, t }`):
```typescript
export const registerLlmViews = ({ spacetimedb, t }: ViewDeps) => {
  const MyLlmJob = t.row('MyLlmJob', { id: t.u64(), route: t.string(), ... });
  spacetimedb.view({ name: 'my_llm_jobs', public: true }, t.array(MyLlmJob), (ctx: any) => [...]);
```

Apply: add `MyCombatAggroEntry = t.row('MyCombatAggroEntry', {id,combatId,enemyId,characterId,value})` inside `registerCombatViews` (name must differ from the generated `MyCombatAggro`, RESEARCH Pattern 1). Use the full body in RESEARCH Pattern 1 (lines 178-212). Keep `registerCombatViews` destructuring unchanged (do not thread `AggroEntry` through `ViewDeps`; `llm.test.ts` "registerViews wiring" pins the dep list). No `.iter()`. Skip rows with `e.petId`.

---

### `spacetimedb/src/views/combat.test.ts` (test)

**Analog:** `spacetimedb/src/views/llm.test.ts` (copy the harness).

**Mock + schema bootstrap** (lines 1-27 trimmed):
```typescript
import { createMockDb } from '../helpers/test-utils';
import { capturedViews, createRecordingServerMock } from '../helpers/schema_recorder';
vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);
beforeAll(async () => { await import('../schema/tables'); });
const ident = (hex: string) => ({ toHexString: () => hex });
```

**noScanDb proxy** (lines 70-80):
```typescript
function noScanDb(seed: Record<string, any[]>) {
  const db = createMockDb(seed, { strict: true });
  return new Proxy({} as any, {
    get: (_t, table: string) =>
      new Proxy({} as any, {
        get: (_u, prop: string) => {
          if (prop === 'iter') throw new Error(`table scan attempted on ${table}`);
          return db[table][prop];
        },
      }),
  });
}
```

**Register-and-capture** (lines 82-90): `const { t, schema } = createRecordingServerMock(); const spacetimedb = schema({}); const before = capturedViews().length; registerCombatViews({ spacetimedb, t } as any); capturedViews().slice(before)`. Note combat views also use `CombatResult`/`CombatLoot` row types: pass stubs `{ rowType: ... }` or filter the captured list by `opts.name === 'my_combat_aggro'`.

**Assertions** (lines 187-216 style): `v.opts` equals `{ name: 'my_combat_aggro', public: true }`; `v.fn({ sender: alice, db: noScanDb(seed) })`; other-user fight never returned; no player or `userId == null` returns `[]`; exact key list `['id','combatId','enemyId','characterId','value']`; pet row dropped; two characters in two fights return both. Seed tables needed: `player`, `character`, `combat_participant`, `aggro_entry` with the indexes recorded by `schema/tables`.

---

### `src/game/queries.ts` (+ `queries.test.ts`)

**Analog:** itself. Add members to `GameQueries` (lines 11-42) and the factory (lines 49-102).

Scalar WHERE (lines 75-78) for `combatParticipantsOf`, `combatParticipants`, `combatEnemies`, `combatRounds`, `combatCasts`, `combatNarratives`, `combatPets`, `combatActions`:
```typescript
hotbars: (characterId) => toSql(tables.hotbar.where((r) => r.characterId.eq(characterId))),
```
OR chain (lines 85-90) for `enemyTemplatesById` / `enemyAbilitiesByTemplate`; reuse `requireIds`:
```typescript
charactersById: (ids) => {
  requireIds(ids);
  return toSql(tables.character.where((r) => ids.map((id) => r.id.eq(id)).reduce((a, b) => a.or(b))));
},
```
Static view (line 50): `myCombatAggro: toSql(tables.myCombatAggro),` (only after `pnpm spacetime:generate -y`). Exact snippets: RESEARCH "New queries" (lines 459-473). Update the hand-written `queries: GameQueries` literal and `STATIC_SQL` in the tests.

---

### `src/game/gameData.ts` (hub: combat bindings)

**Analog:** itself.

**Static view binding** (lines 126-150): add `const combatAggro = deps.bind<MyCombatAggroEntry>({ table: (c) => c.db.myCombatAggro, sql: [queries.myCombatAggro] });` and push it to `staticBindings` (lines 143-151).

**Keys** (lines 176-179): add `combatKey = computed<bigint | null>(() => keyedRows(ownParticipant).value[0]?.combatId ?? null)`. Define `ownParticipant` via `keyedTable(characterKey, (c) => c.db.combatParticipant, queries.combatParticipantsOf, (row, k) => row.characterId === k)` (Pattern 2).

**keyedTable helper** (lines 195-208), reuse as-is for `enemies`, `rounds`, `casts`, `narratives`, `pets`, `fightParticipants`, `combatActions`:
```typescript
function keyedTable<R, K extends bigint | string>(key, table, sql, matches) {
  return createKeyed<C, K, TableBinding<C, R>>({
    key, conn: input.conn,
    make: (k) => deps.bind<R>({ table, sql: [sql(k)], filter: (row) => matches(row, k) }),
  });
}
```
**keyedIdList** (lines 210-224) for `enemyTemplate` (by id) and `enemyAbility` (by `enemyTemplateId`); the id-list key is built with `idListKey(enemies.map(e => e.enemyTemplateId))`, like `questTemplateKey` (lines 184-186).

**Extend `partyKey`** (lines 180-183) with the fight participants' character ids (RESEARCH Q2 notes).

**Register in `keyedAll`** (lines 378-398) so `reset()` disposes them; expose a `combat` object on the return value (lines 421-460) built from `keyedRows(...)`. `inCombat` (line 403) stays unchanged; add `combat.active` from the own participant row. Narrative key lingers 30 s (Pitfall 7). Round watch with `{ flush: 'sync' }` to ingest headers, as the `watch(characterId, ..., { flush: 'sync' })` at line 413 does.

**Server clock sampling** (lines 120-127, `onEvent`): optionally also `clock.sample(round.startedAtMicros)` on first live sight of a round row.

---

### `src/game/context.ts`

**Analog:** itself.

- **Reducers** (lines 41-62): add `submitCombatAction(a: { characterId: bigint; abilityTemplateId?: bigint; targetEnemyId?: bigint; targetCharacterId?: bigint }): Promise<void>`, `fleeCombat(a: { characterId: bigint })`, `setCombatTarget(a: { characterId: bigint; enemyId?: bigint })`, in the `useAbility` style.
- **GameData** (lines 70-110): add `readonly combat: CombatData` (active, applied, enemies, templates, abilities, round, casts, narratives, pets, participants, ownAction, aggro). Typed with `List<T>` / `Readonly<Ref<...>>`.
- **Inert default** (lines 168-212): `createInertGame()` must return an inert `combat` (`constant(false)`, `empty<...>()`) so every existing `...createInertGame()` test fake keeps passing (RESEARCH Q8 rule).
- **Injection key** (lines 124-126): `export const COMBAT_KEY: InjectionKey<CombatController> = Symbol('uwr.combat');` plus `createInertCombat()` next to `createInertConsole()` (lines 224-239).
- `FrameControls.openScreen(id: ScreenId)` (line 115): widen to accept `'encounter'`.

---

### `src/combat/useCombatController.ts` (provider, no exact analog)

**Analog:** `src/console/useConsole.ts` as built in `AppFrame.vue:44-47`:
```typescript
const consoleApi = createConsole({ game: inject(GAME_KEY, createInertGame()), frame: frameControls });
provide(CONSOLE_KEY, consoleApi);
onBeforeUnmount(() => consoleApi.dispose());
```
Apply: `createCombatController({ game })` returns `{ allyTargetId, requestTarget, cycle, lastRequested, dispose }`, provided from `AppFrame` with `provide(COMBAT_KEY, ...)`, consumed with `inject(COMBAT_KEY, createInertCombat())` (same inert-default idiom as `PartyBlock.vue:12-13`). Reducer call shape and swallow-and-warn error handling: copy `HotbarRow.vue:151-168`.

---

### `src/combat/RoundRow.vue`, Tab key handling, `useDamageFlash.ts`

**Analog:** `src/hotbar/HotbarRow.vue`.

**Imports + inject** (lines 1-30): same `inject(GAME_KEY, createInertGame())`, `inject(FRAME_KEY, createInertFrame())`, `prefersReducedMotion` from `../console/pinning`.

**Ticker (timer countdown)** (lines 66-77 plus `useCooldownTicker.ts:17-45`):
```typescript
const tickNow = ref(game.clock.nowMicros());
const ticker = useCooldownTicker({ clock: game.clock, active: anyCooling });
watch(ticker.nowMicros, (value) => { tickNow.value = value; }, { flush: 'sync' });
```
Apply: `active` = open round exists. Use the `roundTimer` snippet (RESEARCH lines 429-442) for seconds, fraction and "Resolving...".

**Reducer call** (lines 151-168): `pendingId` guard, `reducers === null || characterId === null` early return, `try/catch` with `console.warn('[hotbar] ... failed', error)` and "the server writes refusals into the feed". Copy for Ready (`submitCombatAction`), Flee (`fleeCombat`), target (`setCombatTarget`).

**Document key handler** (lines 183-197, `isTextField` at 170-181) is the template for Tab/Shift+Tab: same guards `event.repeat || ctrlKey || metaKey || altKey || isComposing`, `frame.activeScreen.value !== null`, offline, `isTextField(document.activeElement)`. Register in `onMounted`/`onBeforeUnmount` (lines 200+). Return without `preventDefault` unless acting.

**Flash** (lines 124-148): `FLASH_MS` timer set, `if (prefersReducedMotion()) continue;`. Use for `useDamageFlash(hp)` (watch HP ref; skip animation under reduced motion and use a brief class color change instead).

**Slot state in HotbarRow** (lines 82-110): extend `SlotState` with `roundsLeft`, `chosen`, `inert`; when `game.combat.active.value`, treat `row.roundsRemaining > 0` as cooling and compute the sweep total from `AbilityTemplate.cooldownSeconds` with `@game-data/combat_constants` (Pitfall 1), not `durationMicros`. `useSlot` (line 138) adds `targetCharacterId` only via `allyTargetFor(...)`.

---

### `src/combat/EncounterPanel.vue`, `HostileCard.vue`, `ThreatBlock.vue`, `InCombatTag.vue`

**Analogs:** `src/rails/PartyBlock.vue` (card list, progressbar markup, text-node-only rule), `src/rails/NearbyList.vue` (clickable rows).

**Component skeleton and a11y bar** (PartyBlock.vue lines 1-8, 45-78):
```vue
<script setup lang="ts">
import { computed, inject } from 'vue';
import { PhCrownSimple } from '@phosphor-icons/vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { barFraction } from '../frame/vitals';
const game = inject(GAME_KEY, createInertGame());
function pct(value: bigint, max: bigint): string { return `${barFraction(value, max) * 100}%`; }
</script>
<div class="track health-track" role="progressbar"
  :aria-label="`${name} health ${hp} of ${maxHp}`" aria-valuemin="0"
  :aria-valuenow="Number(hp)" :aria-valuemax="Number(maxHp)">
  <div class="fill fill-health" :style="{ width: pct(hp, maxHp) }"></div>
</div>
```
Apply: `{{ }}` text nodes only (enemy names are server text; test with `<img onerror>` string), Phosphor icons only (no `<svg`), difficulty color through CSS classes (`.con-red { color: var(--color-con-red) }`), colors via `color-mix(... var(--token) ...)`, scoped style with the 4/8/16/24 spacing scale and 10/12/14/20 font sizes.

---

### `src/frame/ContextRail.vue` and `AppFrame.vue` (modify)

**ContextRail analog:** itself (23 lines). Today it renders `<ContextContent />` inside `aside.context-rail` (288px). Apply: `<EncounterPanel v-if="game.combat.active.value" /><ContextContent v-else />` with `inject(GAME_KEY, createInertGame())`. `ContextContent.vue` stays untouched (also used by the mobile Map sheet).

**AppFrame mobile branch** (lines 114-147): `LocationRow` (line 134) and `TabBar` (line 146) get `v-if="!game.combat.active.value"` on top of the existing `v-show`; insert `<EncounterStrip v-if="game.combat.active.value" />` between `NoticeBars` and `FeedShell`. Add before the generic `Sheet` branch (line 141): `<EncounterSheet v-else-if="screens.active.value === 'encounter'" />`.

**activeId** (lines 53-56): extend the exclusion `active === 'more' || active === 'encounter'`.

Add `provide(COMBAT_KEY, createCombatController(...))` after line 47. Add `watch(game.combat.active, ...)` to `screens.close()` at combat start (except `'encounter'`) and close `'encounter'` at the end, next to `watch(isDesktop, ...)` at line 38. Test files spread `...createInertGame()`, so every new field needs an inert default.

---

### `src/frame/useScreens.ts` (+test)

**Analog:** itself. Line 4: `export type ActiveScreen = ScreenId | 'more' | null;` becomes `ScreenId | 'more' | 'encounter' | null`. Widen the `open` parameter (line 8). `syncLayout` (lines 52-57) also clears `'encounter'` on desktop:
```typescript
if (isDesktop && (active.value === 'more' || active.value === 'encounter')) { active.value = null; opener = null; }
```
Do NOT add `'encounter'` to `SCREENS` / `ScreenId` (`screens.test.ts` pins seven). `tabForScreen`'s `default` already returns More for unknown values; widen its parameter type only.

---

### `src/console/feedStore.ts` (round and wind-up entries)

**Analog:** itself.

**Sort key** (lines 106-113): add `combat: 4` and `windup: 5` ranks to `SOURCE_RANK` (lines 88-93) so a same-microsecond header sorts after server lines:
```typescript
function compareBatch(a: FeedEntry, b: FeedEntry): number {
  if (a.createdAtMicros !== b.createdAtMicros) return a.createdAtMicros < b.createdAtMicros ? -1 : 1;
  const rankA = SOURCE_RANK[a.source as Exclude<FeedSource, 'local'>] ?? 0;
  ...
```
**Ingest and dedupe** (lines 156-179): `knownKeys` / `pendingKeys`, microtask `schedule(flush)`. Add a client-made entry method (for example `ingestCombat(kind, ...)`) that uses key `round:${combatId}:${roundNumber}` / `windup:${castId}`. `acceptRow` (lines 95-110) does not apply to client-made entries.

**Late header insert** (Q4 step 4, Pitfall 8): `flush()` (lines 128-137) only appends; add the backward-scan insert for a round-1 header, stopping at a `local` entry. Unit-test both append and insert.

**Entry mutation pattern for `narratedRound`**: copy `setQueued` (lines 202-208):
```typescript
setQueued(key, queued) {
  const index = entries.value.findIndex((e) => e.key === key);
  if (index === -1 || entries.value[index].queued === queued) return;
  const next = entries.value.slice();
  next[index] = { ...next[index], queued };
  entries.value = next;
},
```
Add optional `FeedEntry` fields (`roundNumber?`, `narratedRound?`, `ability?`) additively; the structural `LineSource` in `lines.ts` must match.

---

### `src/console/lines.ts`, `FeedLine.vue`, `FeedView.vue`

**Analog:** itself.

- Extend `LineKind` (lines 46-60) with `'round' | 'windup'` and `FeedLineView` with `roundNumber`, `ability`, `narratedRound`.
- `classifyEntry` (lines 281-290) already routes by `entry.source`; add an early branch for the client-made kinds before `classifyByKind`. Build with `makeLine(key, { kind, text, keywordEligible: false })` (lines 118-132).
- `COMBAT_KINDS` (lines 76-85): `combat_round_header` and `combat_resolving` are listed there; spec says render nothing, so return `[]` (no producer exists), and update `lines.test.ts:210-211`.
- `damage`/`heal` (lines 258-259) stay on `classifyByKind`. `FeedLine.vue` stops coloring the whole line and wraps only the last standalone integer (`emphasis.ts`), as a text split rendered via `<span>` text nodes.
- `FeedLine.vue` structure (lines 54-120): `<div class="line" :class="[`line-${line.kind}`, ...]">` with a per-kind icon/label `v-else-if` chain; add `round` and `windup` branches there with Phosphor icons only (no `<svg`).

---

### `src/rails/PartyBlock.vue`, `src/frame/VitalsStrip.vue`, `VitalsRail.vue` (ally targeting, flash, In combat)

**Analog:** `PartyBlock.vue:45-78`, the `member` card. Today the cards are non-interactive `div`s (RESEARCH Q8 notes PartyBlock tests assert that). Apply: when `game.combat.active.value`, render the card as a button (`aria-pressed` on the selected ally), call `combat.selectAlly(id)`, and add the "You" card from `game.characterId`. Out of combat the DOM must stay identical. Gate on `combat.active`, never on `game.inCombat` (`VitalsStrip.test.ts:235` pins that; Pitfall 4). `HeaderBar` gets a separate `inCombat` prop and `aria-disabled`; do not alter its native `disabled` prop (`HeaderBar.test.ts:110-114`).

---

## Shared Patterns

### Subscription filters
**Source:** `src/game/gameData.ts:195-224` (`keyedTable`, `keyedIdList`) and the header comment at lines 54-62 (shared-cache rule).
**Apply to:** every new combat binding. Each carries a WHERE on an indexed column and a `filter` equal to its query. Never subscribe a whole public table.

### Inert injection defaults
**Source:** `src/game/context.ts:168-239` (`createInertGame`, `createInertFrame`, `createInertConsole`) and `inject(KEY, createInertX())` as in `PartyBlock.vue:12-13`.
**Apply to:** `game.combat`, `COMBAT_KEY`, every new component. Phase 45/47 shell tests mount with bare fakes.

### Server reducers from the UI
**Source:** `src/hotbar/HotbarRow.vue:138-168`.
**Apply to:** Ready, Flee, target click, Tab cycling, ally ability use. Object-syntax reducer args (CLAUDE.md), `reducers === null || characterId === null` guard, refusal arrives in the feed (no client error UI), `console.warn` only. No optimistic UI: chip, ring, chosen slot and Flee state derive from rows.

### Server clock and reduced motion
**Source:** `src/game/serverClock.ts` (`game.clock.nowMicros()`), `src/hotbar/useCooldownTicker.ts` (250 ms, 1 s reduced), `prefersReducedMotion` from `src/console/pinning`.
**Apply to:** round timer, damage flash, any animation.

### Design guards
**Source:** `src/styles/designContract.test.ts`, `colors.guard.test.ts`, `tokens.client.test.ts` (scan every client `.vue`/`.ts`).
**Apply to:** all new files. Font sizes 10/12/14/20, weights 400/500, spacing 0/4/8/16/24/32/48/64 on padding/margin/gap, no `#hex`, no `<svg`, no `v-html`, custom properties only from `nocturne.css`/`tokens.client.css`; exception dimensions go in `width/height/min-*`; difficulty color by class mapped to `--color-con-*`; the token pin stays at 23.

### Pure derivations plus unit tests
**Source:** `src/rails/party.ts` + `party.test.ts`, `src/hotbar/hotbar.ts` + `hotbar.test.ts` (pure module beside a `*.test.ts`).
**Apply to:** every `src/combat/*.ts` helper. Project rule: all phases include unit tests. Reuse server constants from `@game-data/combat_constants` and `@game-data/mechanical_vocabulary` (`TARGET_RULES`), never duplicate.

### Test harness conventions
**Source:** `src/frame/ContextRail.test.ts:1-60` (`// @vitest-environment happy-dom`, `mount(..., { global: { provide: { [GAME_KEY as symbol]: game } } })`, game fake built as `{ ...createInertGame(), connected: ref(true), ... } as unknown as GameData`, `afterEach` unmount).
**Apply to:** all new component tests.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none fully absent) | | | `useCombatController.ts` has only a role-match analog (`createConsole` plus provide); the Tab-cycling document listener is the HotbarRow key handler adapted. The wind-up and round entries are new feed-entry kinds with no existing client-made server-ordered entries, so the insert-by-timestamp rule (RESEARCH Q4 step 4) is new logic with no analog. |

## Metadata

**Analog search scope:** `spacetimedb/src/views/`, `src/game/`, `src/console/`, `src/hotbar/`, `src/rails/`, `src/frame/`, `src/styles/`
**Files read:** views/groups.ts, views/combat.ts, views/llm.ts (partial), views/llm.test.ts (partial), game/queries.ts, game/gameData.ts, game/context.ts, game/serverClock.ts, console/feedStore.ts, console/lines.ts, console/FeedLine.vue (head), hotbar/HotbarRow.vue (1-200), hotbar/useCooldownTicker.ts, rails/PartyBlock.vue (1-110), frame/AppFrame.vue, ContextRail.vue, rails/ContextContent.vue, frame/useScreens.ts, frame/ContextRail.test.ts (head)
**Pattern extraction date:** 2026-10-06
