# Technology Stack

**Analysis Date:** 2026-02-11

## Languages

**Primary:**
- TypeScript 5.6.2 - Full codebase (backend and client)

**Secondary:**
- JavaScript (ES2020) - Transcompiled target

## Runtime

**Environment:**
- Node.js 24.x (from GitHub Actions workflow at `.github/workflows/static.yml`)

**Package Manager:**
- npm 11.6.2
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Vue 3.5.13 - Frontend UI framework (`src/`) uses Vue 3 composition API
- Vite 6.4.1 - Build tool and development server

**Database/Backend:**
- SpacetimeDB 1.12.0 - Transactional database backend with pub/sub (used in both `spacetimedb/` and client)
  - Server-side SDK for TypeScript reducers, tables, views, and lifecycle hooks
  - Client-side SDK for Vue reactive data subscription and state management

**Testing:**
- Not detected in current configuration

**Build/Dev:**
- `@vitejs/plugin-vue` 5.2.4 - Vite plugin for Vue 3 SFC compilation
- `vue-tsc` 2.2.0 - TypeScript compiler for Vue files

## Key Dependencies

**Critical:**
- `spacetimedb` 1.12.0 - Core database runtime
  - Server API for schema definition (`table()`, `schema()`, `reducer()`, `view()`)
  - Client API for subscriptions (`useTable`, `useReducer` from `spacetimedb/vue`)
  - Authentication utilities and ID token handling

**Infrastructure:**
- None detected (no external REST APIs, no ORM, no HTTP client libraries required)

## Configuration

**Environment:**
- Vite configuration: `vite.config.ts` (minimal, only Vue plugin)
- TypeScript config: `tsconfig.json` (strict mode enabled)
- Backend TypeScript config: `spacetimedb/tsconfig.json` (SpacetimeDB requirements enforced)
- Environment variables loaded from `.env.local`:
  - `VITE_SPACETIMEDB_HOST` - WebSocket URI for SpacetimeDB (default: `ws://localhost:3000`)
  - `VITE_SPACETIMEDB_DB_NAME` - Database/module name (default: `uwr`)
  - `VITE_SPACETIMEAUTH_CLIENT_ID` - OpenID Connect client ID
  - `VITE_SPACETIMEAUTH_REDIRECT_URI` - OAuth2 redirect URL
  - `VITE_SPACETIMEAUTH_ISSUER` - Auth provider issuer URL (default: `https://auth.spacetimedb.com`)

**Build:**
- `vite.config.ts` - Minimal Vite configuration with Vue plugin
- TypeScript configuration with strict mode, no unused variables/parameters

## Platform Requirements

**Development:**
- Node.js 20+ (from GitHub Actions, also validates with 24.x installed)
- npm 11.x
- Cargo/Rust toolchain (for `gen-bindings` tool in package.json scripts)

**Production:**
- Deployment target: GitHub Pages (see `.github/workflows/static.yml`)
- Static hosting of built Vite SPA
- WebSocket connectivity to SpacetimeDB backend instance (default: `ws://localhost:3000`)

## Project Structure

**Monorepo:**
- `src/` - Vue 3 client application (TypeScript + Vue components)
- `spacetimedb/` - Backend module with separate package.json
  - `spacetimedb/src/` - Tables, reducers, views, lifecycle hooks
  - Generated bindings exported to `src/module_bindings/`

**Build Outputs:**
- Frontend: `dist/` - Vite build output for GitHub Pages deployment
- Backend: `spacetimedb/dist/` - Compiled backend module (used by `spacetime` CLI)

---

*Stack analysis: 2026-02-11*
