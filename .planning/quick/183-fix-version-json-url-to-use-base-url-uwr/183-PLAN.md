---
phase: quick-183
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/main.ts
autonomous: true
must_haves:
  truths:
    - "Version polling fetches from the correct base URL in production (/uwr/version.json)"
    - "Version polling still works in dev mode (fetches /version.json from dev server root)"
  artifacts:
    - path: "src/main.ts"
      provides: "Base-URL-aware version.json fetch"
      contains: "import.meta.env.BASE_URL"
  key_links:
    - from: "src/main.ts"
      to: "/uwr/version.json"
      via: "import.meta.env.BASE_URL prefix on fetch URL"
      pattern: "import\\.meta\\.env\\.BASE_URL.*version\\.json"
---

<objective>
Fix the version.json polling URL to use Vite's base URL so it works on GitHub Pages.

Purpose: The auto-reload mechanism (from quick-144) polls `/version.json` every 60s to detect new deployments. In production, the site is deployed at `https://sheibeck.github.io/uwr/` (built with `--base=/uwr/`), so the file lives at `/uwr/version.json`. The current code fetches `/version.json` (missing the `/uwr` prefix), which returns 404 and silently breaks update detection.

Output: A one-line fix in `src/main.ts` that prepends `import.meta.env.BASE_URL` to the version.json fetch path.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/main.ts
@vite.config.ts
@.github/workflows/static.yml
</context>

<tasks>

<task type="auto">
  <name>Task 1: Prefix version.json fetch with Vite BASE_URL</name>
  <files>src/main.ts</files>
  <action>
In `src/main.ts`, line 56, change the fetch URL from:

```typescript
const resp = await fetch('/version.json?_=' + Date.now(), {
```

to:

```typescript
const resp = await fetch(import.meta.env.BASE_URL + 'version.json?_=' + Date.now(), {
```

Vite's `import.meta.env.BASE_URL` is:
- `/uwr/` in production (set by `--base=/uwr/` in the GitHub Actions workflow)
- `/` in dev mode (default)

This means the fetch URL becomes `/uwr/version.json?_=...` in production and `/version.json?_=...` in dev. Both are correct.

Note: The previous path `/version.json` had a leading slash. `import.meta.env.BASE_URL` always ends with a trailing slash, so we use `'version.json'` (no leading slash) to avoid a double slash.

Do NOT change anything else in the file.
  </action>
  <verify>
Run `npx vue-tsc --noEmit` from `C:/projects/uwr` to confirm TypeScript compiles. Visually confirm the fetch line now uses `import.meta.env.BASE_URL + 'version.json?_='`.
  </verify>
  <done>
The `checkForUpdates` function in `src/main.ts` fetches `${BASE_URL}version.json` instead of `/version.json`. TypeScript compiles without errors.
  </done>
</task>

</tasks>

<verification>
1. `npx vue-tsc --noEmit` passes
2. `src/main.ts` contains `import.meta.env.BASE_URL` in the fetch call on the version.json line
3. No other lines in main.ts were modified
</verification>

<success_criteria>
- Version polling URL uses `import.meta.env.BASE_URL` prefix
- TypeScript compiles cleanly
- Dev mode still fetches `/version.json` (BASE_URL defaults to `/`)
- Production mode fetches `/uwr/version.json` (BASE_URL is `/uwr/`)
</success_criteria>

<output>
After completion, create `.planning/quick/183-fix-version-json-url-to-use-base-url-uwr/183-SUMMARY.md`
</output>
