# External Integrations

**Analysis Date:** 2026-02-11

## APIs & External Services

**SpacetimeDB Cloud (Optional):**
- SpacetimeDB Auth - OpenID Connect provider for user authentication
  - Issuer URL: `https://auth.spacetimedb.com` (configurable via `VITE_SPACETIMEAUTH_ISSUER`)
  - Client ID: Set via environment variable `VITE_SPACETIMEAUTH_CLIENT_ID`
  - OAuth2 PKCE flow implemented in `src/auth/spacetimeAuth.ts`
  - Token storage: localStorage with expiration tracking
  - Email extraction: Parsed from JWT id_token payload

**SpacetimeDB Database:**
- WebSocket connection to SpacetimeDB instance
  - Connection URI: Configurable via `VITE_SPACETIMEDB_HOST` (default: `ws://localhost:3000`)
  - Module name: Configurable via `VITE_SPACETIMEDB_DB_NAME` (default: `uwr`)
  - Client SDK: `spacetimedb` npm package
  - Authentication: Token-based via `.withToken()` on connection builder

## Data Storage

**Primary Database:**
- SpacetimeDB transactional database
  - Type: In-process or remote relational database with pub/sub
  - Client: `DbConnection` class from generated `src/module_bindings/index.ts`
  - Connection initialization: `src/main.ts` with callbacks for connect/disconnect/error
  - Tables defined in `spacetimedb/src/index.ts` (schema export at line 1177)

**Tables:**
- `player` - User identity with session info (public table)
- `user` - Email and account creation metadata (public table with `by_email` index)
- `character` - Character data including stats, inventory state
- `friend_request` - Pending friend relationships (indexed by `fromUserId`, `toUserId`)
- `friend` - Established friend relationships (indexed by `userId`)
- `world_state` - Global game state (day/night, spawn location)
- `region` - Map regions and zone definitions
- And many more domain-specific tables (combat, items, groups, NPCs, quests, etc.)

**Caching:**
- None detected (SpacetimeDB subscriptions act as reactive cache)

**State Synchronization:**
- Vue 3 reactivity driven by SpacetimeDB table subscriptions
- Client tracks tables via `useTable()` hook from `spacetimedb/vue`
- Automatic deserialization of table rows to TypeScript types

## Authentication & Identity

**Auth Provider:**
- SpacetimeDB Auth (OpenID Connect compatible)
  - Implementation: Custom PKCE-based OAuth2 flow in `src/auth/spacetimeAuth.ts`
  - Discovery: OIDC token endpoint at `${ISSUER}/oidc/token`
  - Auth endpoint: `${ISSUER}/oidc/auth`

**Token Management:**
- ID tokens stored in localStorage with expiration
- PKCE verifier and state stored in sessionStorage during auth flow
- Token refresh: Manual - requires localStorage check and re-authentication if expired
- Integration: Token passed to SpacetimeDB connection via `.withToken()` in `src/main.ts`

**Identity System:**
- `Identity` type from `spacetimedb` package represents authenticated user
- Sender identity available via `ctx.sender` in reducers (backend)
- Client-side identity access via global `window.__my_identity` set in connection callback

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Rollbar, or similar)

**Logs:**
- Browser console logging for:
  - SpacetimeDB connection status (`src/main.ts`)
  - SpacetimeDB connection errors
  - Auth callback failures
- Backend logs available via `spacetime logs <db-name>` CLI command

**Debugging:**
- SpacetimeDB logs accessible via CLI: `spacetime logs uwr` (local) or `spacetime logs` (for configured servers)

## CI/CD & Deployment

**Hosting:**
- GitHub Pages (static deployment)
- Workflow: `.github/workflows/static.yml`
  - Builds: `npm ci && npx vite build --base=/uwr/`
  - Deploys to: `https://[user].github.io/uwr/`
  - Triggered on: Push to master, manual workflow dispatch

**Backend Deployment:**
- Local: `spacetime publish uwr --project-path spacetimedb --server local`
- Remote (optional): `spacetime publish uwr --project-path spacetimedb` (to configured default server)
- Maincloud: `spacetime publish uwr --project-path spacetimedb` (when maincloud is default server)

**CI Pipeline:**
- GitHub Actions workflow only (no external CI service)
- Node.js 20 cached via npm cache
- Environment secrets injected:
  - `VITE_SPACETIMEDB_DB_NAME`
  - `VITE_SPACETIMEDB_HOST`
  - `VITE_SPACETIMEAUTH_CLIENT_ID`
  - `VITE_SPACETIMEAUTH_REDIRECT_URI`

## Environment Configuration

**Required env vars:**
- `VITE_SPACETIMEDB_HOST` - WebSocket URI (dev default: `ws://localhost:3000`)
- `VITE_SPACETIMEDB_DB_NAME` - Database module name (dev default: `uwr`)
- `VITE_SPACETIMEAUTH_CLIENT_ID` - OAuth2 client ID (required for auth to work)
- `VITE_SPACETIMEAUTH_REDIRECT_URI` - OAuth2 redirect (dev default: `window.location.origin`)

**Secrets location:**
- Development: `.env.local` (git-ignored, local only)
- CI/CD: GitHub Secrets (injected by `.github/workflows/static.yml`)
- Auth tokens: Browser localStorage (persistent across sessions until expiry)

**Token Lifecycle:**
- ID token stored with expiration timestamp
- Automatic expiration check in `getStoredIdToken()` function
- Stale token cleanup on auth error (`Unauthorized`/`401` triggers reload)

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- SpacetimeDB connection lifecycle callbacks in `src/main.ts`:
  - `onConnect(conn, identity)` - Fires on successful connection, stores global identity
  - `onDisconnect()` - Fires on disconnection
  - `onConnectError(ctx, error)` - Fires on connection failure, triggers reload if auth error

**Client Subscriptions:**
- Implicit subscriptions via `useTable(tables.tableName)` Vue hook
- Reducers called via `useReducer(reducers.reducerName)` pattern
- No explicit subscription builder pattern in client code reviewed

## Reducer/RPC Interface

**Client-Server Communication:**
- Reducers are transactional mutations called from client
- Pattern: `conn.reducers.reducerName({ param: value })`
- Examples in composables (`useAuth.ts`, `useCombat.ts`, etc.):
  - `reducers.loginEmail({ email })`
  - `reducers.createCharacter({ characterName })`
  - `reducers.executeAbilityAction({ abilityId, targetId })`
  - `reducers.moveCharacter({ x, y })`

**Return Values:**
- Reducers do NOT return data to caller (transactional constraint)
- Data changes observable via table subscriptions instead

---

*Integration audit: 2026-02-11*
