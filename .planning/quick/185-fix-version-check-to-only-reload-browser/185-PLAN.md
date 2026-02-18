---
phase: quick-185
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - vite.config.ts
autonomous: true
must_haves:
  truths:
    - "Browser only reloads when a genuinely new build is deployed, not on every 60s poll"
    - "CLIENT_VERSION baked into JS bundle matches version.json written to dist/"
  artifacts:
    - path: "vite.config.ts"
      provides: "Single version string shared between define and versionPlugin"
      contains: "const BUILD_VERSION"
  key_links:
    - from: "vite.config.ts define.__BUILD_VERSION__"
      to: "vite.config.ts versionPlugin closeBundle"
      via: "shared BUILD_VERSION constant"
      pattern: "BUILD_VERSION"
---

<objective>
Fix the version check auto-reload mechanism so the browser only reloads when a genuinely new build is deployed, not on every 60-second poll.

Purpose: Quick-144 added version polling but two separate Date.now() calls produce different timestamps — the `define` block runs at config evaluation time while `closeBundle()` runs after bundling completes. They never match, causing infinite reloads.

Output: A single shared version string used by both the inlined CLIENT_VERSION and the dist/version.json file.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@vite.config.ts
@src/main.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix version mismatch by using single shared timestamp</name>
  <files>vite.config.ts</files>
  <action>
The bug: `Date.now()` is called twice at different moments during the build:
1. Line 21: `define: { __BUILD_VERSION__: JSON.stringify(Date.now().toString()) }` — runs when Vite evaluates the config object
2. Line 9: `const version = Date.now().toString()` inside `closeBundle()` — runs after bundling finishes

These two timestamps will NEVER be identical, so CLIENT_VERSION !== version.json on every poll, triggering reload.

Fix: Create a single `const BUILD_VERSION = Date.now().toString();` at the top of vite.config.ts (after imports, before the plugin definition). Use this same constant in both:
- The `define` block: `__BUILD_VERSION__: JSON.stringify(BUILD_VERSION)`
- The `closeBundle` function: `JSON.stringify({ version: BUILD_VERSION })`

The full updated vite.config.ts should look like:

```typescript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const BUILD_VERSION = Date.now().toString();

const versionPlugin = () => ({
  name: 'version-json',
  closeBundle() {
    writeFileSync(
      resolve(__dirname, 'dist/version.json'),
      JSON.stringify({ version: BUILD_VERSION })
    );
  },
});

export default defineConfig({
  plugins: [vue(), versionPlugin()],
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
});
```

Do NOT change src/main.ts — the polling logic there is correct. The bug is entirely in vite.config.ts producing mismatched versions.
  </action>
  <verify>
1. Run `npx vite build` (or whatever the project build command is)
2. After build, check that the version in dist/version.json matches what would be inlined:
   - `cat dist/version.json` to see the version value
   - `grep -o '__BUILD_VERSION__.*' dist/assets/*.js | head -1` or search the built JS for the inlined timestamp
   - Both should show the exact same timestamp string
3. Confirm src/main.ts was NOT modified
  </verify>
  <done>
A single BUILD_VERSION constant is used for both the inlined client version and the version.json file. The browser will only reload when a new build with a different timestamp is deployed.
  </done>
</task>

</tasks>

<verification>
- vite.config.ts uses a single BUILD_VERSION constant for both define and versionPlugin
- No two separate Date.now() calls exist
- src/main.ts polling logic unchanged
- Build produces matching versions in JS bundle and version.json
</verification>

<success_criteria>
- After deploying, the browser does NOT reload on every 60s poll
- Browser DOES reload when a new build (with new timestamp) is deployed
- Version string in dist/version.json matches the value inlined into the JS bundle
</success_criteria>

<output>
After completion, create `.planning/quick/185-fix-version-check-to-only-reload-browser/185-SUMMARY.md`
</output>
