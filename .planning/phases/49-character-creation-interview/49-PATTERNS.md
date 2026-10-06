# Phase 49: Character Creation Interview - Pattern Map

**Mapped:** 2026-10-06
**Files analyzed:** 31 (new + modified)
**Analogs found:** 29 / 31

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `spacetimedb/src/data/race_bonuses.ts` (NEW) | utility (shared pure, `@game-data`) | transform | `spacetimedb/src/data/class_stats.ts` | exact |
| `spacetimedb/src/data/race_bonuses.test.ts` (NEW) | test | transform | `src/gameDataAlias.test.ts` + class_stats usage | role-match |
| `spacetimedb/src/reducers/creation.ts` (MOD, finalize) | reducer | CRUD | itself, lines 125-200 | exact |
| `spacetimedb/src/index.ts` (MOD, `apply_level_up` ~466-520) | reducer | CRUD | itself | exact |
| `spacetimedb/src/reducers/commands.ts` (MOD, `level_character` ~576-630) | reducer (admin) | CRUD | itself / `apply_level_up` | exact |
| `spacetimedb/src/reducers/creation_finalize.test.ts` (NEW) | test (real handler) | CRUD | `spacetimedb/src/reducers/llm_cutover.test.ts` (harness 1-80, confirmSeed 1541-1600) | exact |
| level-up race-bonus test (NEW, e.g. `spacetimedb/src/reducers/level_up_race_bonus.test.ts`) | test (real handler) | CRUD | `llm_cutover.test.ts` lines 517-585 (`levelSeed`, `levelUp`) | exact |
| `src/session/deriveScreen.ts` (MOD) | utility (pure) | transform | itself | exact |
| `src/session/deriveScreen.test.ts` (MOD) | test | transform | itself (table rows 34-55) | exact |
| `src/session/useSession.ts` (MOD) | composable/store | request-response | itself lines 193-330 | exact |
| `src/session/useSession.test.ts` (MOD ~441) | test | - | itself | exact |
| `src/App.vue` (MOD) | component (router) | - | itself lines 1-60 | exact |
| `src/App.test.ts` (MOD 8,109,134-139) | test | - | itself | exact |
| `src/session/CharacterPicker.test.ts` (MOD: drop NoCharactersNote 7,136-152) | test | - | itself | exact |
| `src/session/NoCharactersNote.vue` (DELETE) | component | - | - | - |
| `src/console/feedStore.ts` (MOD: held private rows) | store | event-driven | itself (`setCharacter` 230, `reset` 188, `clear` 334) | exact |
| `src/console/feedStore.test.ts` (MOD, additive) | test | event-driven | itself | exact |
| `src/gameDataAlias.test.ts` (MOD, extend) | test | - | itself | exact |
| `src/creation/creationSteps.ts`, `creationControls.ts`, `raceCards.ts`, `abilityCards.ts`, `sheetModel.ts`, `creationLines.ts` | utility (pure) | transform | `src/session/deriveScreen.ts`, `src/console/lines.ts`, `src/console/indicator.ts` | role-match |
| `src/creation/creationFeedStore.ts` | store | event-driven | `src/console/feedStore.ts` (`createFeedStore`, `FEED_LINE_CAP=300`) | role-match |
| `src/creation/queries.ts` | config (SQL) | request-response | `src/game/queries.ts` (lines 1, 66-68) | exact (do not edit original) |
| `src/creation/creationData.ts` | service/hub | event-driven + CRUD | `src/game/gameData.ts` (`keyedEvent` 267-305) + `src/net/bindTable.ts` + `src/game/bindEventTable.ts` | role-match |
| `src/creation/creationContext.ts` | provider (injection key + inert) | - | `src/game/context.ts` lines 254-257, 296, 363 | exact pattern (do not edit original) |
| `src/creation/CreationView.vue` | component (screen) | - | `src/session/NoCharactersNote.vue` (session-ground + PreFrameHeader) + `src/frame/FeedShell.vue` | role-match |
| `src/creation/CreationFeed.vue` | component | streaming | `src/console/FeedView.vue` (reuse only) + `FeedLine.vue` + `KeeperProgress.vue` | role-match |
| `src/creation/CreationComposer.vue` | component | request-response | `src/input/Composer.vue` lines 1-80 | exact (copy, do not parametrise) |
| `src/creation/StepBar.vue`, `ChoiceBlock.vue` | component | - | none close (cards: `CharacterPicker.vue`) | partial |
| `src/creation/CreationSheet.vue` | component | - | `src/frame/Sheet.vue` (mobile) + `src/frame/ContextRail.vue` (desktop slot) | role-match |
| `src/creation/*.test.ts` (component) | test | - | `src/frame/Sheet.test.ts`, `src/session/CharacterPicker.test.ts`, `src/frame/AppFrame.*.test.ts` | role-match |
| `src/creation/serverWords.test.ts` | test (source pin) | - | `src/input/Composer.test.ts` source-text read pattern | role-match |

## Pattern Assignments

### `spacetimedb/src/data/race_bonuses.ts` (utility, transform)

**Analog:** `spacetimedb/src/data/class_stats.ts` (no imports; exported constants + pure functions; bigint stats)

Types and constants to import (class_stats.ts lines 1-8):
```typescript
export type StatKey = 'str' | 'dex' | 'cha' | 'wis' | 'int';
export const BASE_STAT = 8n;
export const PRIMARY_BONUS = 4n;
export const SECONDARY_BONUS = 2n;
```
Core function being wrapped (class_stats.ts ~29-46):
```typescript
export function computeBaseStatsForGenerated(primaryStat: StatKey, secondaryStat: StatKey | undefined, level: bigint): Record<StatKey, bigint> {
  const stats = { str: BASE_STAT, dex: BASE_STAT, cha: BASE_STAT, wis: BASE_STAT, int: BASE_STAT };
  stats[primaryStat] += PRIMARY_BONUS;
  if (secondaryStat) stats[secondaryStat] += SECONDARY_BONUS;   // 'none' -> throws BigInt mix (F1)
  ...
```
`detectPrimarySecondary(character)` is in the same file (~70-80): sorts the five stats, secondary only with a strict gap. The level-up carry-through subtracts the race bonus BEFORE passing the character in.

Full proposed body: 49-RESEARCH.md "Pattern 1" (lines 242-287). Only import is `./class_stats` (must stay import-free otherwise so `@game-data` works in the browser). Consider adding a `level` parameter (default `1n`) or a separate `subtractRaceBonus`/`addRaceBonus` pair so level-up sites can reuse it (D1).

---

### `spacetimedb/src/reducers/creation.ts` (finalize)

**Analog:** itself. Deps destructure lines 125-138 (`computeBaseStatsForGenerated` comes from `deps`); classStats parse lines 140-190; the single line to replace is line 192:
```typescript
const classStats = computeBaseStatsForGenerated(primaryStat, secondaryStat, 1n);
```
-> `const { stats: classStats } = computeCreationStats(primaryStat, secondaryStat, state.raceBonuses);` with `import { computeCreationStats } from '../data/race_bonuses';`. Line 153 `secondaryStat = cs.secondaryStat || undefined;` can stay (helper normalises `'none'`).

---

### `spacetimedb/src/index.ts` `apply_level_up` (lines 466-520)

**Analog:** itself. Current stat rebuild (lines 494-510):
```typescript
const { primary, secondary } = detectPrimarySecondary(character);
const newBase = computeBaseStatsForGenerated(primary, secondary, newLevel);
const raceRow = [...ctx.db.race.iter()].find((r: any) => r.name === character.race);
const racial = raceRow ? computeRacialAtLevelFromRow(raceRow, newLevel) : null;
const updated = { ...character, level: newLevel, pendingLevels: currentPending - 1n,
  str: newBase.str + (racial?.str ?? 0n), dex: ..., cha: ..., wis: ..., int: ...,
```
D1 change: look up `race_definition` by `character.race` (lowercase via `nameLower`; check which index exists in `tables.ts` - prefer an index `.find`/`.filter` over `.iter()` if one is declared on `nameLower`), parse with `parseRaceBonuses`, subtract from a copy of `character` before `detectPrimarySecondary`, then add `raceBonus[stat]` into the `str..int` sums. No definition / no bonuses -> identical to today. Imports already at index.ts lines 50 and 53 (`computeBaseStatsForGenerated`, `detectPrimarySecondary`).

### `spacetimedb/src/reducers/commands.ts` `level_character` (reducer at ~576, rebuild at ~607-620)

Same shape as above:
```typescript
const { primary, secondary } = detectPrimarySecondary(character);
const newBase = computeBaseStatsForGenerated(primary, secondary, target);
const racial = raceRow ? computeRacialAtLevelForAdmin(raceRow, target) : null;
const updated = { ...character, level: target, xp: xpRequiredForLevel(target),
  str: newBase.str + (racial?.str ?? 0n), ...
```
Imports at line 5 (`detectPrimarySecondary` from `../data/class_stats`). Add `../data/race_bonuses` import beside it. Best: one shared helper (e.g. `levelStatsWithRaceBonus(ctx, character, level)`) in `race_bonuses.ts` takes only plain data; the `race_definition` lookup stays in each reducer (keeps the data file import-free and ctx-free).

---

### `spacetimedb/src/reducers/creation_finalize.test.ts` and level-up test (real handler)

**Analog:** `spacetimedb/src/reducers/llm_cutover.test.ts`

Harness (lines 11-15, 37-39, 45-78):
```typescript
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer, rowColumnProblems } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);
const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };   // one shared identity object (mock compares ===)
beforeAll(async () => {
  await import('../index');
  for (const name of ['apply_level_up', 'submit_creation_input', ...]) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') throw new Error(`capturedReducer('${name}') ...`);
    handlers[name] = h;
  }
}, 120_000);
function newCtx(seed: Seed, sender: any = alice, timestampMicros: bigint = T0) {
  return createMockCtx({ seed, sender, timestampMicros, strict: true });
}
```
Finalize seed (lines 1541-1557, `confirmSeed`): `character_creation_state` row at `step: 'CONFIRMING'` with `raceName, raceBonuses (JSON), archetype, className, characterName`; trigger `handlers.submit_creation_input(ctx, { text: 'confirm' })`; read `rows(ctx, 'character')[0]`. Add `classStats` JSON (`{"primaryStat":"int","secondaryStat":"wis"}` and a `"none"` case). Expected values: RESEARCH lines 289-292 / 457. Note: `playerSeed()` and `rows()` helpers are local to llm_cutover.test.ts - copy them, do not import.

Level-up seed (lines 517-524, 560):
```typescript
const levelSeed = (level = 2n, pendingLevels = 1n, over = {}): Seed => ({
  ...playerSeed(), ...worldSeed(),
  ...characterSeed({ level, pendingLevels, str: 10n, dex: 10n, cha: 10n, wis: 10n, int: 10n, hp: 50n, maxHp: 50n, ...over }),
  ability_template: [], pending_skill: [], character_creation_state: [],
});
const levelUp = (ctx: any) => handlers.apply_level_up(ctx, { characterId: 1n });
```
Add a `race_definition` row seed (`id, name, nameLower, narrative, bonusesJson, createdAt`) for the "keeps bonus" case; omit it for the "unchanged" case. The admin `level_character` reducer needs the same pair of tests (capture `'level_character'`; check its admin gate in commands.ts ~576-590 to seed an admin sender). Regression: existing llm_cutover level-up tests (571-620) and confirm tests (1560-1600, ~2046-2150) must stay green.

---

### `src/session/deriveScreen.ts` + test

**Analog:** itself. Union (lines 16-20) replace `{ kind: 'noCharacters' }` with `{ kind: 'creation' }`; add `activeCharacterPlaced: boolean` to `ScreenInput`; tail of `deriveScreen`:
```typescript
if (input.activeCharacterId !== null) {
  return input.activeCharacterLoaded ? { kind: 'frame' } : waiting;
}
if (input.characterCount === 0) return { kind: 'noCharacters' };
return { kind: 'picker' };
```
-> RESEARCH Pattern 3 (lines 316-323). Test table style: `deriveScreen.test.ts` line 5 `const base: ScreenInput = {...}`, rows like line 34 `['noCharacters only after characters applied', { characterCount: 0 }, { kind: 'noCharacters' }]`, asserted at line 55.

### `src/session/useSession.ts`

`activeCharacter` computed lines 193-197; `screenInput` lines 302-313 - add
`activeCharacterPlaced: activeCharacter.value !== null && activeCharacter.value.locationId !== 0n,`. Session also owns the creation hub (wire like `game`, exposed near line 383 return object); reset on logout.

### `src/App.vue`

Lines 6 and 44:
```vue
import NoCharactersNote from './session/NoCharactersNote.vue';
<NoCharactersNote v-else-if="screen.kind === 'noCharacters'" @logout="session.logout()" />
```
-> `CreationView` with `v-else-if="screen.kind === 'creation'"`, `provide(CREATION_KEY, session.creation ?? createInertCreation())` beside line 17 `provide(GAME_KEY, session.game ?? createInertGame());`.

### `src/console/feedStore.ts` (held private rows)

`setCharacter(id)` at line 230, `reset()` at 188-200, `clear()` at 334, `acceptRow` at 118 (leave pure/unchanged). Add bounded `held` array (cap 50) per RESEARCH Pattern 4 (lines 330-334).

---

### `src/creation/queries.ts`, `creationData.ts`, `creationContext.ts`

- SQL: copy `src/game/queries.ts` style (`import { toSql } from 'spacetimedb';`, line 68 `myLlmJobs: toSql(tables.myLlmJobs)`); filtered form per RESEARCH lines 441-444.
- Bindings: `bindTable({ table, sql, filter? })` from `src/net/bindTable.ts` (exposes `rows`, `applied`, `failed`, `attach`, `dispose`) for `characterCreationState`, `raceDefinition`; `bindEventTable({ table, sql, onRow })` from `src/game/bindEventTable.ts` for `eventCreation` (rows never cached; push to the creation feed store). Hub composition mirrors `gameData.ts` `keyedEvent` (267-305) but lives in `src/creation/`.
- Injection: copy `src/game/context.ts` lines 254-257 (`export const GAME_KEY: InjectionKey<GameData> = Symbol('uwr.game');`) and the inert factory style (`createInertGame` line 296) as `CREATION_KEY` / `createInertCreation` in `creationContext.ts`.
- Read `game.llmJobs` read-only; use `selectLlmIndicator(rows, 'creation', rotation)` from `src/console/indicator.ts:83`.

### `src/creation/CreationComposer.vue`

**Analog:** `src/input/Composer.vue` lines 1-80. Copy: Phosphor import (line 3), `INPUT_MAX_CHARS` from `../input/limits` (line 12), `focusEnd`/`moveCaretToEnd`, `send()` keeping focus, and `onKeydown`:
```typescript
if (event.key === 'Escape') { inputEl.value?.blur(); return; }
if (event.isComposing) return;
if (event.key === 'Enter') { event.preventDefault(); send(); }
else if (event.key === 'ArrowUp') { ... recallPrevious(); moveCaretToEnd(); }
```
Replace `CONSOLE_KEY`/`game.combat` with `CREATION_KEY`, own draft ref + `createInputHistory()` (`src/input/history.ts:19`), placeholder/lock from `controlsFor(step)`; `useKeyboardOpen(inputFocused)` from `src/frame/useKeyboardOpen.ts:20`.

### `src/creation/CreationFeed.vue`

Reuse `FeedLine.vue` (props line 19: `{ line: FeedLineView; disabled: boolean; currentRound?: boolean }`), `KeeperProgress.vue`, `isPinned`/`prefersReducedMotion` (`src/console/pinning.ts` 8, 18, threshold 48). Warning icon: wrapper element in CreationFeed (resolved Open Question 2), not a FeedLine edit. Newlines via scoped `:deep(.line-keeper .body) { white-space: pre-line }`.

### `src/creation/CreationView.vue`

Shell from `NoCharactersNote.vue` (lines 1-16): `<div class="session-ground"><PreFrameHeader title=... @logout="emit('logout')" />`. Feed + composer column layout from `src/frame/FeedShell.vue` (template 12-20, `.feed` / `.composer` CSS 23-50: `padding: 8px 32px 16px; gap: 8px`, compact `8px 16px`). Mobile sheet: `src/frame/Sheet.vue` (`defineProps<{ title: string }>()`, `emit('close')`); breakpoint via `src/frame/useBreakpoint.ts`; notices via `NoticeBars.vue`.

### Pure modules (`creationSteps`, `creationControls`, `raceCards`, `abilityCards`, `sheetModel`, `creationLines`)

Follow `deriveScreen.ts`: type-only imports, exported pure function, table-driven test (`base` + `it.each` rows). `sheetModel.ts` imports `@game-data/class_stats` and `@game-data/race_bonuses` (alias in `vite.config.ts:15`, `tsconfig.json:11`). `creationLines.ts` reuses `cleanServerText` (`src/console/cleanServerText.ts`) and returns `FeedLineView`-shaped objects from `src/console/lines.ts` types (import type only).

## Shared Patterns

### `@game-data` alias
**Source:** `vite.config.ts:15` `'@game-data': fileURLToPath(new URL('./spacetimedb/src/data', import.meta.url))`; `tsconfig.json:11`. Test pattern `src/gameDataAlias.test.ts` lines 1-40: imports the same symbol via alias and relative path and asserts equality; production walker skips `module_bindings`. Extend with `race_bonuses` / `class_stats` and an "imports only ./class_stats" source check.

### Design contract (auto-scans every new `.vue`/CSS)
**Source:** `src/styles/designContract.test.ts` (type scale 10/12/14/20 line 118; weights 400/500 line 130; spacing 0/4/8/16/24/32/48/64 line 145; Nocturne font tokens 156; h4/h6 only; Phosphor icons only 235+; no inline svg, no `v-html`), plus `colors.guard.test.ts` (no literal colors), `tokens.client.test.ts` (23 tokens, add none), `scrollbars.test.ts` (dark scrollbar on scroll surfaces). Text nodes only.

### Inert defaults for injected data
`createInertGame()` / `createInertConsole()` in `src/game/context.ts` (296, 363) - copy the shape into `creationContext.ts`.

### Server reducer conventions
Throw `SenderError` only without character context; otherwise `appendPrivateEvent`/`fail()`. Insert with `id: 0n`. No `.iter()` where an index exists.

## Do Not Edit (owned by quick tasks 261006-a0i / a13 / a3d) - reuse only

- `src/game/queries.ts`, `src/game/queries.test.ts`, `src/game/gameData.ts`, `src/game/gameData.test.ts`, `src/game/context.ts`
- `src/console/useConsole.ts` (+test), `src/console/keywords.ts` (+test), `src/console/keywordLabel.ts`, `src/console/FeedView.vue` (+`FeedView.test.ts`), `src/console/FeedLine.vue`, `src/console/FeedLine.test.ts`
- `src/rails/enemies.ts` (+test), `src/rails/NearbyList.vue`, `src/rails/ContextContent.test.ts`
- `src/action/*`, `src/frame/FeedShell.vue`
- `spacetimedb/src/helpers/examine.ts` (+test), `spacetimedb/src/reducers/intent.ts`

Also do not edit `src/input/Composer.vue` (adjacent to a13's composer area; copy instead). Any new FeedLine test goes in a new file.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/creation/StepBar.vue` | component | - | No step indicator exists; follow UI-SPEC + design import, design-contract tokens |
| `src/creation/ChoiceBlock.vue` | component | request-response | No card-choice block in feed; nearest card styling is `CharacterPicker.vue` (`.card`, `.card-title`, `.card-kicker` classes seen in `NoCharactersNote.vue`) |

## Metadata

**Analog search scope:** `spacetimedb/src/{data,reducers,index.ts}`, `src/{session,console,input,frame,game,net,styles}`, `src/App.vue`, `.planning/quick/261006-*`
**Files scanned:** ~35
**Pattern extraction date:** 2026-10-06
