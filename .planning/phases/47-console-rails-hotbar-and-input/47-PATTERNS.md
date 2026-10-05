# Phase 47: Console, Rails, Hotbar and Input - Pattern Map

**Mapped:** 2026-10-05
**Files analyzed:** 36 (new and modified, layout per RESEARCH "Recommended Project Structure", discretionary)
**Analogs found:** 36 / 36 (3 are partial: Composer, HotbarRow, keywords have only a role-level analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/game/bindEventTable.ts` | data layer | event-driven (onInsert only) | `src/net/bindTable.ts` | role-match |
| `src/game/bindEventTable.test.ts` | test | fake connection | `src/net/bindTable.test.ts` | exact |
| `src/game/keyedBinding.ts` (swap-on-applied) | data layer | request-response | watch blocks in `src/session/useSession.ts` 196-228 | role-match |
| `src/game/gameData.ts`, `context.ts` (provide/inject, inert default) | composable/provider | transform | `src/session/useSession.ts` (computed derivations) + `src/session/frameView.ts` | role-match |
| `src/game/serverClock.ts` | utility | transform | `src/frame/vitals.ts` | role-match |
| `src/console/lines.ts` (classifyLine), `cleanServerText.ts`, `whisper.ts` | utility (pure) | transform | `src/frame/vitals.ts` | role-match |
| `src/console/keywords.ts` | utility (pure) | transform | `src/frame/vitals.ts` (style); no matcher analog | partial |
| `src/console/feedStore.ts` | store/composable | event-driven | `src/session/useSession.ts` build() | role-match |
| `src/console/indicator.ts` | utility (pure) | transform | `git show v2.2-client:src/composables/useLlmStatus.ts` (behavior) | behavior-ref |
| `src/console/FeedView.vue`, `FeedLine.vue`, `KeeperProgress.vue` | component | request-response | `src/frame/FeedShell.vue` (modified) | exact for shell |
| `src/input/routeInput.ts`, `commands.ts`, `conversation.ts`, `history.ts`, `narrativeQueue.ts` | utility (pure) | request-response | `src/frame/vitals.ts` (style) + old `onNarrativeSubmit`/`useCommands` (behavior) | role-match |
| `src/input/Composer.vue` | component | request-response | `src/session/CharacterPicker.vue` (form/input component) | partial |
| `src/hotbar/hotbar.ts`, `HotbarRow.vue`, `HotbarSelector.vue` | utility + component | CRUD (reducer call) | `src/frame/vitals.ts` + `src/frame/TabBar.vue` | partial |
| `src/rails/{effects,levelRange,party,nearby,quests,worldEvent,xp}.ts` | utility (pure) | transform | `src/frame/vitals.ts` | exact (style) |
| `src/frame/VitalsRail.vue`, `VitalsStrip.vue` (modified) | component | request-response | themselves | exact |
| `src/frame/ContextRail.vue` (modified) | component | request-response | itself + `railsShell.test.ts` | exact |
| `src/frame/FeedShell.vue` (modified) | component | request-response | itself | exact |
| `src/screens/MapScreen.vue`, `SocialScreen.vue` (sheet bodies) | component | request-response | themselves | exact |
| `src/styles/nocturne.css` / `tokens.client.css` (23 tokens) | config | n/a | existing token files + `tokens.client.test.ts` | exact |
| tests for each pure module and component | test | n/a | `VitalsRail.test.ts`, `bindTable.test.ts`, `railsShell.test.ts` | exact |

## Pattern Assignments

### `src/game/bindEventTable.ts` (data layer, event-driven)

**Analog:** `src/net/bindTable.ts`. Copy the structural interfaces (lines 4-48), the detach-with-same-reference rule (73-91), and the stale-apply unsubscribe (105-130). Do NOT call `iter()` (empty for event tables); push rows to a callback.

Structural types (lines 4-17), reuse by `import type { ConnLike, SubscriptionHandleLike } from '../net/bindTable'`:
```typescript
type Listener = (...args: any[]) => void;
export interface ConnLike { subscriptionBuilder(): SubscriptionBuilderLike; }
```
Stale-apply guard to keep (lines 109-119):
```typescript
.onApplied(() => {
  if (currentConn !== conn) {
    try { handle?.unsubscribe(); } catch {}
    return;
  }
  applied.value = true;
  ...
})
.onError((...args: unknown[]) => {
  if (currentConn !== conn) return;
  console.warn('[bindTable] subscription error', options.sql, ...args);
```
Listener signature: the SDK calls `(ctx, row)`; `bindTable.test.ts` line 62 fires `cb({}, row)`. The RESEARCH Pattern 1 skeleton is the starting point.

**Test analog:** `src/net/bindTable.test.ts` `makeConn` (lines 10-71): fake table with `Set` listeners, `handle` with `unsubscribe/isActive/isEnded`, builder with chained `onApplied/onError/subscribe`, helpers `fireApplied`, `fireError`, `insert`. Drop `iter`/`rows`/`remove` for the event variant. No docblock needed (node env).

### `src/game/keyedBinding.ts` and session-style watchers (data layer)

**Analog:** `src/session/useSession.ts` lines 186-228. Keyed rebind with `flush: 'sync'`, plus the connection watcher that re-attaches all bindings:
```typescript
watch(controller.conn, (conn) => {
  for (const binding of staticBindings) binding.attach(conn);
  charactersBinding.value?.attach(conn);
}, { immediate: true, flush: 'sync' });

watch(activeCharacterId, (id) => {
  pendingBinding.value?.dispose();
  pendingBinding.value = null;
  if (id === null) return;
  const binding = deps.bind<PendingSkill>({
    table: (c) => c.db.pendingSkill,
    sql: [queries.pendingSkills(id)],
    filter: (row) => row.characterId === id,
  });
  binding.attach(controller.conn.value);
  pendingBinding.value = binding;
}, { immediate: true, flush: 'sync' });
```
Phase 47 deviation (RESEARCH Pattern 2): for location, group, id-list keys, create the new binding first, and dispose the old one only when the new `applied` flips true (avoids the "No one is nearby" flash on each move). Inject `bind` via deps (as `deps.bind` at line 121 `bind: bindTable`) so tests pass a fake. Query strings come from a `defaultQueries()`-style object using `toSql(tables.x.where((r) => r.col.eq(id)))` (lines 97-110). Never subscribe whole public tables.

**Test analog:** `src/session/useSession.test.ts` (fake `bind` injection, fake controller).

### `src/game/context.ts` (provider with inert default)

**Analog:** none exact; RESEARCH Pattern 4. `railsShell.test.ts` lines 20-49 mounts `ContextRail` and `FeedShell` bare (`mount(ContextRail)`), asserting empty lines ("Your location appears here.", "No one is nearby.", "No quests tracked.", feed "Your story will appear here."). Use `inject(GAME_KEY, INERT_GAME)` so these keep passing, and update only assertions that new content changes.

### `src/rails/*.ts` and `src/console/{lines,cleanServerText,whisper}.ts`, `src/input/*.ts`, `src/hotbar/hotbar.ts` (pure modules)

**Analog:** `src/frame/vitals.ts` (whole file). Header comment citing the spec, bigint in, `Number()` only for math and display, total functions, no throws:
```typescript
export function barFraction(value: bigint | number, max: bigint | number): number {
  const m = Number(max);
  if (!(m > 0)) return 0;
  const fraction = Number(value) / m;
  if (!Number.isFinite(fraction)) return 0;
  return Math.min(1, Math.max(0, fraction));
}
export function vitalText(value: bigint | number, max: bigint | number): string {
  if (!(Number(max) > 0)) return '0 / 0';
  return `${Number(value)} / ${Number(max)}`;
}
```
Reuse `barFraction`/`vitalText` directly for HP, MP, SP, and party bars; `xpProgress` follows the same clamp style (clamp numerator while `pendingLevels > 0n`; "Max level" at `MAX_LEVEL`).
**Test analog:** `VitalsRail.test.ts` lines 34-61, table-style `describe` blocks per function (`routeInput` matrix: every command word in sentence and exact form).

Constraints from tsconfig (RESEARCH): no `String.replaceAll`, `Array.prototype.at`, `Object.hasOwn`, no regex `v` flag; no `#hex` literals even in regex (use `/\{\{\/?color(?::[^}]*)?\}\}/g`).

### `src/console/indicator.ts` (pure, port of behavior)

**Behavior reference only:** `git show v2.2-client:src/composables/useLlmStatus.ts`. Port `routeInConsoleScope` (game scope: `!LLM_CREATION_ONLY_ROUTES.includes(route)`), `indicatorLineFor(route, rotation)` (own-property checks, silent route = null, unknown route = fallback line, modulo rotation), and `selectLlmIndicator`. Import constants via `@game-data/llm_indicator_lines` (the old file used a relative `../../spacetimedb/src/...` import; the new client uses the alias, see `src/gameDataAlias.test.ts`). Input rows come from `my_llm_jobs` (`id, route, status, createdAt`).

### `src/console/FeedView.vue`, `FeedLine.vue`, `src/frame/FeedShell.vue` (component)

**Analog:** `src/frame/FeedShell.vue` (modified in place; keep `compact` prop and the root `main.feed`):
```vue
<script setup lang="ts">
const props = defineProps<{ compact?: boolean }>();
</script>
<template>
  <main class="feed" :class="{ compact: props.compact }">
    <div class="feed-line"><p class="empty">Your story will appear here.</p></div>
  </main>
</template>
<style scoped>
.feed { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; justify-content: flex-end; overflow-y: auto; padding: 16px 32px; }
.feed.compact { padding: 4px 16px 8px; }
.empty { margin: 0; font-size: 12px; color: var(--color-neutral-500); }
</style>
```
Style rules visible here: scoped styles, CSS custom properties only (`var(--color-*)`), spacing on the 4/8/16/24/32/48/64 scale, font sizes 12/14/20 (10 allowed), weights 400/500. Text via `{{ }}` interpolation only; keyword spans are `<button>` or `<span>` built from `findKeywords` parts, never `v-html`. Keep the empty-state line when the feed is empty.

### `src/frame/VitalsRail.vue` and `VitalsStrip.vue` (component, modified)

**Analog:** `src/frame/VitalsRail.vue`. Props-driven (currently `name, avatarInitial, classLine, hp, maxHp, mana, maxMana, stamina, maxStamina` as bigint). Add XP bar, effects and party sections without breaking those props (the 45 test mounts with those props only, so new data comes from inject with an inert default or optional props). Bar markup to copy for XP and party bars (lines 35-50):
```vue
<div v-for="bar in bars" :key="bar.key" class="bar">
  <div class="bar-row"><span class="label">{{ bar.label }}</span><span class="value">{{ vitalText(bar.value, bar.max) }}</span></div>
  <div class="track" role="progressbar" :aria-label="bar.label" aria-valuemin="0"
       :aria-valuenow="Number(bar.value)" :aria-valuemax="Number(bar.max)">
    <div class="fill" :class="`fill-${bar.key}`" :style="{ width: `${barFraction(bar.value, bar.max) * 100}%` }"></div>
  </div>
</div>
```
The existing Party block (`<h6>Party</h6><p class="empty">Not in a party.</p>`, lines 55-58) is the slot to fill; keep the empty line text (asserted in `VitalsRail.test.ts` line 116).
**Test analog:** `VitalsRail.test.ts`: `// @vitest-environment happy-dom` docblock, `mountRail(overrides)` helper, `afterEach` unmount, source-scan block reading `resolve(process.cwd(), 'src/frame/VitalsRail.vue')` (lines 107-118), and an escape test (`'<img src=x onerror=alert(1)>'` renders as text, line 100). Reuse the escape test for every component that renders server or player text (feed lines, NPC names, effect names).

### `src/frame/ContextRail.vue` (component, modified)

**Analog:** itself plus `railsShell.test.ts`. Existing structure: aside `aria-label="Context"`, width 288px, three `section`s with `h6` headings Here, Nearby, Tracking and empty `p` lines. Add routes (level range or "Safe"), Nearby actions (Whisper, Invite), tracked quests, event card inside these sections; keep headings order and empty strings or update the test assertions deliberately.

### `src/input/Composer.vue` (component, request-response)

**Analog:** role-level only. Use `src/session/CharacterPicker.vue` for event-handler/emit style and the `focusTrap.ts`/`useScreens.ts` plain-composable approach (no router; screens are app state, `closeScreen()` and `openScreen()` provided from `AppFrame`). `maxlength="1000"` with a parity test reading the server constant from source (do not import `llm_layers.ts`). Reducer calls use object syntax: `conn.reducers.submitIntent({ characterId, text })`; table handles camelCase (`c.db.myPlayer`).

### `src/styles/*` token additions

**Analog:** `src/styles/nocturne.css`, `tokens.client.css`, with the pin test `tokens.client.test.ts` (must move to 23 tokens). Guards: `src/styles/cssContract.ts` (`parseDecls`, `colorOffenders`, `textColorOffenders`, `definedCustomProperties`, `usedCustomProperties`), `colors.guard.test.ts`, `designContract.test.ts`, `src/frame/frameContract.test.ts`. They scan every new file automatically; negative px margins must use `calc((32px - 44px) / 2)`.

## Shared Patterns

### Reducer and subscription wiring
**Source:** `src/session/useSession.ts` 97-128, 186-228. Inject `bind` and queries; `flush: 'sync'` watchers; `toSql(tables.x.where(r => r.col.eq(id)))`; views (`my_*`) unfiltered.

### Test harness for components
**Source:** `src/frame/VitalsRail.test.ts` 1-32. Docblock `// @vitest-environment happy-dom`, `@vue/test-utils` `mount`, resolve files from `process.cwd()` (not `import.meta.url`), source-scan assertions for spec tokens.

### Test harness for data layer
**Source:** `src/net/bindTable.test.ts` 10-71 fake connection; `src/session/useSession.test.ts` fake `bind`.

### Text safety
**Source:** `VitalsRail.test.ts` line 100 escape test; guards ban `v-html`, `<svg`, `<h1|h2|h3|h5>`, non-Phosphor icons (import from `@phosphor-icons/vue` as in `src/frame/tabs.ts` lines 1-3).

### Server constants
**Source:** `@game-data/*` alias (`src/gameDataAlias.test.ts`): `llm_indicator_lines`, `xp`, `renown_data`, `mechanical_vocabulary`. `helpers/segments.ts` is NOT importable (pulls `llm_layers.ts`); compare `kind === 'dialogue'` and add a parity test reading its `SEGMENT_KINDS` as text.

## Old client behavior references (read with `git show v2.2-client:<path>`, do not copy)

| Behavior | Reference |
|---|---|
| Command gate and routing | `src/App.vue` `onNarrativeSubmit` (line ~1176) and `src/composables/useCommands.ts` (prefix matching there caused the hijack; the new rule is exact shapes) |
| Keyword click handler | `src/App.vue` ~line 1250 (`useAbilityRealtime` at ~1336 is combat-only; hotbar uses `use_ability`) |
| Indicator selection and rotation | `src/composables/useLlmStatus.ts` |
| Hotbar and cooldown rule | `src/composables/useHotbar.ts` (lines ~78, 279-285, 455) |
| Route level range | `src/components/MapPanel.vue` ~216-224 |
| Info formatters (`renown`, `factions`, `faction`, `events`, `group`) | old `useCommands.ts` |

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/console/keywords.ts` | utility | transform | No text scanner exists; use RESEARCH "Keyword matcher" (manual leftmost-longest, per-code-point fold, never regex from names) |
| `src/console/feedStore.ts` cap/dedupe/microtask sort | store | event-driven | No capped event store yet; RESEARCH "Store behavior" |
| `src/hotbar/HotbarRow.vue` sweep and ticker | component | timer | No cooldown UI or shared ticker exists; RESEARCH "Hotbar and effects" |
| Number-key handling (1-0 when input not focused) | component | event-driven | No global key handler besides `focusTrap.ts` in `src/frame/` |

## Metadata

**Analog search scope:** `src/net`, `src/session`, `src/frame`, `src/screens`, `src/styles`; old client via `git show v2.2-client`.
**Files read:** bindTable.ts and test, vitals.ts, FeedShell.vue, VitalsRail.vue and test, railsShell.test.ts, useSession.ts (95-285), tabs.ts, old useLlmStatus.ts (top 80 lines). UI-SPEC and the last 240 lines of RESEARCH were not read (lines 477+ of RESEARCH were truncated); planner should check them for the S1-S9 open-question resolutions and the validation architecture.
**Pattern extraction date:** 2026-10-05
