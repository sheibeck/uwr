# Phase 45: Foundation, Frame and Auth - Pattern Map

**Mapped:** 2026-10-05
**Files analyzed:** 40 (new/modified/kept) 
**Analogs found:** 16 real analogs / 40. The rest are greenfield Vue shells whose contract is 45-UI-SPEC.md.

NOTE ON ANALOGS: This phase deletes the old UI. Analogs under `src/components/`, `src/composables/`, `src/ui/`, `src/App.vue` and `src/main.ts` (old) will be deleted. After deletion read them with `git show v2.2-client:<path>`. Analogs marked KEPT survive on disk.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/main.ts` (rewrite) | bootstrap | request-response | `src/main.ts` (old, deleted) | exact (shape pinned by test) |
| `src/App.vue` | component (phase switch) | event-driven | old `src/App.vue` (login/pending gating, version watch) | partial |
| `src/auth/spacetimeAuth.ts` (KEPT, +`hasExpiredToken`, strip params on failure) | service | request-response | itself | exact |
| `src/auth/spacetimeAuth.test.ts` | test | request-response | `src/legacyCredentials.test.ts` (fake storage) | role-match |
| `src/connectionLogging.ts` + test (KEPT) | utility | event-driven | itself | exact |
| `src/legacyCredentials.ts` + test (KEPT) | utility | file-I/O | itself | exact |
| `src/net/connection.ts` (controller) | service | event-driven | old `src/main.ts` builder chain | partial |
| `src/net/backoff.ts` | utility | transform | none | no analog |
| `src/net/bindTable.ts` | service | pub-sub | `src/composables/data/useCoreData.ts` (deleted) | role-match |
| `src/net/*.test.ts` | test | event-driven | `src/connectionLogging.test.ts` (vi.spyOn/restoreAllMocks) | role-match |
| `src/session/deriveScreen.ts` | utility | transform | `isLoggedIn` computed in old `useAuth.ts` | partial |
| `src/session/useSession.ts` (login_email, logout, set_active) | service | request-response | old `src/composables/useAuth.ts` (deleted) | role-match |
| `src/session/SplashScreen.vue` | component | request-response | old `src/components/SplashScreen.vue` (deleted) | role-match |
| `src/session/CharacterPicker.vue`, `NoCharactersNote.vue` | component | CRUD | none | no analog |
| `src/session/versionCheck.ts` | utility | transform | old `src/App.vue` lines 569-587 (deleted) | role-match |
| `src/frame/*` (AppFrame, HeaderBar, VitalsRail, VitalsStrip, ContextRail, FeedShell, TabBar, Drawer, Sheet, MoreSheet, NoticeBars, AccountMenu, useBreakpoint, useScreens) | components | event-driven | none (UI-SPEC is the contract) | no analog |
| `src/screens/*` (7 empty shells) | component | none | none | no analog |
| `src/styles/nocturne.css`, `tokens.client.css`, `frame.css` | config | n/a | `src/ui/colors.ts` (hex source of truth, deleted) | partial |
| `src/styles/{colors.guard,tokens.client,designContract}.test.ts` | test (static) | file-I/O | `src/legacyLlmRemoval.test.ts` (walk + scan) | role-match |
| `src/legacyClientRemoval.test.ts` | test (static) | file-I/O | `src/legacyLlmRemoval.test.ts` | exact |
| `src/gameDataAlias.test.ts` | test | file-I/O | `src/llmAdminBindings.test.ts` | role-match |
| `src/legacyLlmRemoval.test.ts` (MODIFY: drop `client wiring`, relax count, add llm_ scan) | test | file-I/O | itself | exact |
| `src/llmAdminBindings.test.ts` (KEPT) | test | file-I/O | itself | exact |
| `scripts/check-bundle.mjs` + test (KEPT) | script | batch | itself | exact |
| `vite.config.ts` (MODIFY: port, strictPort, alias) | config | n/a | itself | exact |
| `index.html` (MODIFY) | config | n/a | itself | exact |
| `package.json`, `tsconfig.json`, `env.d.ts` (MODIFY) | config | n/a | themselves | exact |

## Pattern Assignments

### `src/main.ts` (bootstrap)

**Analog:** old `src/main.ts` (deleted; `git show v2.2-client:src/main.ts`). Shape is pinned by `src/legacyCredentials.test.ts` lines 69-89.

**Imports and env** (old main.ts lines 1-11):
```typescript
import { DbConnection } from './module_bindings/index.ts';
import { logConnectError, logDisconnect } from './connectionLogging';
import { clearLegacyLlmCredential } from './legacyCredentials';
import { getStoredIdToken, handleSpacetimeAuthCallback } from './auth/spacetimeAuth';

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? 'ws://localhost:3000';
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? 'uwr';
```
Never read `import.meta.env` as a whole object (legacyLlmRemoval test, lines 168-176).

**Builder chain** (lines 31-37) goes into `src/net/connection.ts`, built per attempt (one-shot):
```typescript
DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB_NAME)
  .withToken(getStoredIdToken() || undefined)
  .onConnect(onConnect)
  .onDisconnect((_ctx, err) => logDisconnect(err))
  .onConnectError((_ctx, err) => logConnectError(err));
```
In the controller, `.withToken(token)` takes a non-null token (no anonymous connect, RESEARCH Pitfall 5). Drop `SpacetimeDBProvider` and `h(...)` render wrapper.

**Globals** (lines 13-20, 46-58): keep `window.__db_conn`, `window.__my_identity`, `window.__client_version` and the `declare global { interface Window {...} }` block.

**Bootstrap order the test pins** (test lines 76-88): `const bootstrap = async () => {` then `clearLegacyLlmCredential();` as the first statement, then `handleSpacetimeAuthCallback()`, then `createApp(`. Import must match `import { clearLegacyLlmCredential } from './legacyCredentials'`. Use the RESEARCH "main.ts bootstrap shape" code block verbatim, and capture `callbackError` instead of only logging as old main.ts did (line 28).

---

### `src/net/connection.ts` (service, event-driven)

**Analog:** old `src/main.ts` builder chain (above) plus `src/connectionLogging.ts` (KEPT; takes no generated context type on purpose, TS2589). Controller design is RESEARCH Pattern 1 (`handled` flag per connection, `intentional` flag, `backoffDelayMs`, token-rejected probe to `/v1/ping`). Do not use `spacetimedb/vue` `SpacetimeDBProvider`, `useTable`, `useReducer`.

Test pattern: `src/connectionLogging.test.ts` lines 4-18:
```typescript
describe('connection logging', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  it('...', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    ...
```
Add `vi.useFakeTimers()` and an injected `buildConnection` factory.

---

### `src/net/bindTable.ts` (service, pub-sub)

**Analog:** `src/composables/data/useCoreData.ts` (deleted; `git show v2.2-client:src/composables/data/useCoreData.ts`).

**Imports** (lines 1-4):
```typescript
import { shallowRef, watch } from 'vue';
import { toSql } from 'spacetimedb';
import { tables } from '../../module_bindings';
```
**Core pattern** (lines 82-84 and 119-124): subscription plus rebuild-from-`iter()` on insert/update/delete (views can deliver delete+insert):
```typescript
dbConn.subscriptionBuilder()
  .onApplied(() => refresh(dbConn))
  .subscribe([ toSql(tables.player), ... ]);

const rebind = (table: any, ref: { value: any[] }, iter: () => Iterable<any>) => {
  const rebuild = () => { ref.value = [...iter()]; };
  table.onInsert(rebuild);
  table.onUpdate(rebuild);
  table.onDelete(rebuild);
};
```
Rows are `shallowRef` (line 9 style). Departures required in the new code: use camelCase handles (`tables.myPlayer`, `conn.db.worldState`, `conn.db.appVersion`; old used `tables.world_state`), detach with `removeOnInsert/removeOnUpdate/removeOnDelete` (old never detached, double-binding on each `isActive` toggle), do NOT blank rows on disconnect, expose an `applied` flag, add `.onError`, and keep the returned handle for `unsubscribe()`. Subscribe to `myPlayer` view, not whole `player`.

**Filtered subscription pattern** (`src/composables/data/useWorldData.ts` lines 107-123, deleted):
```typescript
toSql(tables.npc.where(r => r.locationId.eq(locId))),
...
locationSubHandle = dbConn.subscriptionBuilder()
  .onApplied(() => { refreshLocationScoped(dbConn); if (oldHandle) oldHandle.unsubscribe(); })
```
Subscribe-new-before-unsubscribe-old. New equivalents: `tables.character.where(r => r.ownerUserId.eq(userId))`, `tables.pendingSkill.where(r => r.characterId.eq(activeId))`.

---

### `src/session/useSession.ts` (service, request-response)

**Analog:** old `src/composables/useAuth.ts` (deleted; `git show v2.2-client:src/composables/useAuth.ts`).

**Imports** (lines 1-11): auth helpers from `'../auth/spacetimeAuth'`: `beginSpacetimeAuthLogin, clearAuthSession, getStoredEmail, getStoredIdToken`. Reducers come from `'../module_bindings'`; call as `conn.reducers.loginEmail({ email })` (object syntax; the old used `useReducer(reducers.loginEmail)`, which the new client avoids).

**Login-after-connect** (lines 54-74): when connected and `player.userId == null` and an email exists, call `loginEmail({ email })` once; when `userId != null` clear pending state:
```typescript
if (!active) return;
if (userId != null) { isPendingLogin.value = false; return; }
if (email) { loginEmailReducer({ email }); }
```
**isLoggedIn** (line 25): `hasToken && player.userId != null`.

**Login start with error capture** (lines 29-39):
```typescript
try { void beginSpacetimeAuthLogin(); }
catch (err) { authError.value = err instanceof Error ? err.message : 'Login failed'; }
```
Note: `beginSpacetimeAuthLogin` is async, so a sync try/catch misses a rejection. Use `.catch(...)` or `await` in the new code. Splash copy follows UI-SPEC (`Sign-in failed. Try again.`).

**Logout** (lines 41-52) calls the reducer then `clearAuthSession()`. New order (RESEARCH Pitfall 9): `await Promise.race([conn.reducers.logout({}), timeout(2000)])`, `clearAuthSession()`, `controller.disconnect()`, then splash. Only call the reducer when status is `connected`.

---

### `src/auth/spacetimeAuth.ts` (KEPT)

Additions only. Pattern for the new `hasExpiredToken()` (mirror `getStoredIdToken`, lines 36-42):
```typescript
export const getStoredIdToken = () => {
  const token = localStorage.getItem(STORAGE_KEYS.idToken);
  const expiresAt = Number(localStorage.getItem(STORAGE_KEYS.expiresAt) ?? 0);
  if (!token) return null;
  if (expiresAt && Date.now() > expiresAt) return null;
  return token;
};
```
Failure cleanup: in `handleSpacetimeAuthCallback` (lines 82-133) the `url.searchParams.delete('code'|'state')` plus `window.history.replaceState({}, document.title, url.toString())` (lines 128-130) only run on success; wrap the body so the same cleanup runs on every throw (lines 89, 93, 110, 114). Module reads `import.meta.env.VITE_SPACETIMEAUTH_*` and `window.location.origin` at import time (lines 1-4): tests use `vi.stubEnv` + `vi.resetModules()` + dynamic import under happy-dom.

---

### `src/session/SplashScreen.vue` (component)

**Analog:** old `src/components/SplashScreen.vue` (deleted; `git show v2.2-client:src/components/SplashScreen.vue`).

**Enter key to login** (lines 31-45), keep this behavior:
```typescript
function handleKeydown(e: KeyboardEvent) { if (e.key === 'Enter' && props.connActive) emit('login'); }
onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
```
Departures: no `connActive` gating (Sign in works without a socket); no `:style="styles.*"` props (FND-02 forbids inline style objects, use scoped CSS with `var(--...)`); logo `src` must be `` `${import.meta.env.BASE_URL}assets/logo.png` `` not `/assets/logo.png` (old line 3); real `<button class="btn btn-primary">`, not a clickable `<span>`; status `aria-live="polite"`, error `role="alert"`; seven states per UI-SPEC splash table. Logo CSS rule from UI-SPEC: `width: min(960px,100%); max-height: calc(100dvh - 176px); aspect-ratio: 16/9; object-fit: contain; height:auto; flex-shrink:0`, no `image-rendering`.

---

### `src/session/versionCheck.ts` (utility, transform)

**Analog:** old `src/App.vue` lines 569-587 (deleted).
```typescript
const serverVersion = (rows as Array<{ version: string }>)[0]?.version;
const clientVersion = window.__client_version;
if (!serverVersion || !clientVersion || clientVersion === 'dev') return;
if (serverVersion === clientVersion) { ... return; }
```
New: extract a pure `shouldPromptReload(serverRow, clientVersion, isDev)`; no `window.location.reload()` and no `_version_reload_attempted` guard, only show the bar; suppress when `import.meta.env.DEV` (vite define `__BUILD_VERSION__` is a timestamp in dev). `__BUILD_VERSION__` is declared via `declare const __BUILD_VERSION__: string;` (old main.ts line 46).

---

### `src/legacyLlmRemoval.test.ts` (MODIFY) and `src/legacyClientRemoval.test.ts` (NEW)

**Analog:** `src/legacyLlmRemoval.test.ts` (KEPT).

**Header/helpers** (lines 1-17):
```typescript
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/');
function read(relativePath: string): string { return readFileSync(`${ROOT}${relativePath}`, 'utf8'); }
```
**Edit:** delete `describe('client wiring', ...)` (lines 19 to ~141; it reads `src/composables/data/useCoreData.ts`, `src/App.vue`, `src/components/NarrativeConsole.vue`, ENOENT after deletion). Keep `proxy removal` (line 143), `docs` (195), `generated bindings after publish 2` (227). Change line 147 `toBeGreaterThanOrEqual(20)` to a value the new `src/` meets (>= 10 is safe; >10 non-test files is also required by three `spacetimedb/src` tests). Check the `walkProduction` list at lines ~100-126 and the "proxy composable ... are gone" test at line 178 for deleted-path assumptions.

**Add** a scan that no non-test client source names a private table: `llm_config`, `llm_job`, `llm_call_log`, `llm_dispatch`, `llm_sweep_tick`, `llm_player_budget`, `llm_spend`, `llm_admin_state`. Use the `FORBIDDEN_WORDS` + offenders pattern (lines 129-159):
```typescript
const offenders: string[] = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const word of FORBIDDEN_WORDS) { if (text.includes(word)) offenders.push(`${file.slice(ROOT.length)}: ${word}`); }
}
expect(offenders).toEqual([]);
```
`legacyClientRemoval.test.ts` copies this structure with `existsSync(...)` false assertions for `src/components`, `src/composables`, `src/ui`, `src/data`, `temp_all_panels.txt`, `public/assets/logo_old.png`, no `html2canvas` in package.json, `vite.config.ts` contains `port: 5173` and `strictPort`, `index.html` contains `id="app"` and `/src/main.ts`.

---

### `src/styles/*.test.ts` (static contract tests)

**Analog:** `src/legacyLlmRemoval.test.ts` file walker (`walkProduction`, skips `*.test.ts`, filters `SOURCE_EXTENSIONS`) and `src/llmAdminBindings.test.ts` (read generated text, `readdirSync` + sort + `toEqual`). Scanner implementation: RESEARCH "Static color scanner core" (postcss + `vue/compiler-sfc` `parse`). Token pin test asserts every hex from UI-SPEC Client token table against `tokens.client.css` text. Excluded from the color scan: `src/styles/nocturne.css`, `src/styles/tokens.client.css`, `*.test.ts`, `src/module_bindings/**`. The old hex source of truth to compare values against is `src/ui/colors.ts` lines 2-17 (deleted; `git show v2.2-client:src/ui/colors.ts`):
```typescript
common: '#ffffff', uncommon: '#22c55e', rare: '#3b82f6', epic: '#aa44ff', legendary: '#ff8800'
dented: '#888', standard: '#ccc', reinforced: '#6c9', exquisite: '#9cf', mastercraft: '#f90'
```
(craft values expand to `#888888`, `#cccccc`, `#66cc99`, `#99ccff`, `#ff9900` in the token file.)

---

### Config files

**`vite.config.ts`** (full file, 12 lines; KEPT shape):
```typescript
const BUILD_VERSION = process.env.BUILD_VERSION || Date.now().toString();
export default defineConfig({
  plugins: [vue()],
  define: { __BUILD_VERSION__: JSON.stringify(BUILD_VERSION) },
});
```
Add `server: { port: 5173, strictPort: true }` and `resolve.alias` for `spacetimedb/src/data` (mirror in `tsconfig.json` `paths`). Do not add a global test `environment` (legacyCredentials.test.ts line 41 asserts no `localStorage` in node); use `// @vitest-environment happy-dom` per file.

**`index.html`** (30 lines): remove the whole inline `<style>` (lines 8-24: `background: #0b0c10` and `button:focus { outline: none }`), add `viewport-fit=cover` to the viewport meta (line 5); keep `<div id="app">` and `<script type="module" src="/src/main.ts">` (lines 27-28), icon link line 6.

**`package.json`**: do not touch `scripts.build` (check-bundle.test.mjs "build wiring", line 411+, requires it to end with `&& node scripts/check-bundle.mjs`, contain `vite build`, no `;`/`||`/`|`). `pnpm remove html2canvas`; add `@phosphor-icons/vue`; dev-add `@vue/test-utils happy-dom postcss@8.5.28` behind a human-verify checkpoint.

## Shared Patterns

### Reducer calls and table handles
**Source:** CLAUDE.md + RESEARCH. **Apply to:** all `src/net`, `src/session`, `src/frame` code.
Object-syntax reducers `conn.reducers.setActiveCharacter({ characterId })`, `conn.reducers.logout({})`; camelCase handles `conn.db.worldState`, `tables.myPlayer`; `DbConnection`/`tables` imported from `./module_bindings`; bigint ids converted with `Number()` only for display; never send identity args.

### Connection logging
**Source:** `src/connectionLogging.ts` (KEPT). **Apply to:** the controller's `onDisconnect`/`onConnectError`. Since SDK 2.10 an error on an established connection arrives in `onDisconnect(ctx, err)`; both callbacks can fire for one failure, so retry scheduling is idempotent per connection.

### Storage key hygiene
**Source:** `src/auth/spacetimeAuth.ts` lines 6-13, 46-50. **Apply to:** logout, expired-token, rejected-token flows: always `clearAuthSession()` (removes every `spacetimeauth_*` key plus both sessionStorage entries).

### Static guards read source text, not runtime
**Source:** `src/legacyLlmRemoval.test.ts`, `src/llmAdminBindings.test.ts`, `src/legacyCredentials.test.ts` (`readFileSync(fileURLToPath(new URL('./x', import.meta.url)))`). **Apply to:** CUT-03, FND-01, FND-02 tests. Tests skip `*.test.ts` when scanning so word lists in tests never self-match.

### Server-test constraints on new `src/`
`spacetimedb/src/reducers/llm_cutover.test.ts` (~2360, ~2416) and `spacetimedb/src/schema/llm_absence.test.ts` (~105) require more than 10 non-test `.ts/.vue/.js` files under `src/` (excluding `module_bindings`) at every commit; `pronoun_rules.test.ts`, `model_literals.test.ts`, `llm_schemas.test.ts` scan new copy; do not recreate `src/composables/useLlm.ts`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/net/backoff.ts` | utility | transform | Schedule 1,2,5,10,20,30 s capped; RESEARCH Pattern 1 snippet |
| `src/frame/*` (header, rails, strip, tab bar, drawer, sheet, notice bars, account menu, `useBreakpoint`, `useScreens`, focus trap) | component | event-driven | Old UI was inline-style objects (`src/ui/styles.ts`), a pattern FND-02 forbids. Use UI-SPEC plus RESEARCH Patterns 4 and 5 and the test sketch |
| `src/screens/*` (7 empty states) | component | none | New; copy per UI-SPEC Copywriting Contract |
| `src/session/CharacterPicker.vue`, `NoCharactersNote.vue` | component | CRUD | Old character selection was the creation flow being deleted; spec in UI-SPEC |
| `src/session/deriveScreen.ts` | utility | transform | Only loose analog is `isLoggedIn` (useAuth.ts line 25); pure function per RESEARCH Pattern 3 |
| `src/styles/frame.css`, `tokens.client.css`, `nocturne.css` | config | n/a | Nocturne vendored byte-for-byte from claude_design MCP; never cached |

## Metadata

**Analog search scope:** `src/`, `src/composables/**`, `src/components/SplashScreen.vue`, `src/ui/colors.ts`, root configs, `scripts/check-bundle.test.mjs`
**Files read:** main.ts, useCoreData.ts, useAuth.ts, spacetimeAuth.ts, SplashScreen.vue, legacyCredentials.test.ts, legacyLlmRemoval.test.ts (partial), llmAdminBindings.test.ts, connectionLogging.test.ts, colors.ts, vite.config.ts, index.html
**Pattern extraction date:** 2026-10-05
