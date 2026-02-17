---
phase: quick-144
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useHotbar.ts
  - src/composables/useCombat.ts
  - src/App.vue
  - vite.config.ts
  - src/main.ts
autonomous: true

must_haves:
  truths:
    - "Player cast bar never gets stuck after combat ends"
    - "Cooldown timers reset properly when combat transitions occur"
    - "Effect timer maps don't accumulate stale entries across combats"
    - "Client detects when a new version is deployed and forces a fresh load"
  artifacts:
    - path: "src/composables/useHotbar.ts"
      provides: "Combat-end cleanup for localCast, localCooldowns, predictedCooldownReadyAt"
    - path: "src/composables/useCombat.ts"
      provides: "Combat-transition cleanup for effectTimers and enemyCastTimers maps"
    - path: "src/App.vue"
      provides: "Version polling and forced reload on mismatch; faster nowMicros tick rate"
    - path: "vite.config.ts"
      provides: "Build-time version stamp injected into HTML"
    - path: "src/main.ts"
      provides: "Version check polling loop"
  key_links:
    - from: "src/composables/useHotbar.ts"
      to: "activeCombat ref"
      via: "watch on activeCombat transitioning to null"
      pattern: "watch.*activeCombat"
    - from: "src/main.ts"
      to: "vite.config.ts"
      via: "BUILD_VERSION injected at build time, polled against /version.json at runtime"
      pattern: "version"
---

<objective>
Fix stuck cast bars and cooldown timers by properly resetting client-side optimistic state on combat transitions, and add automatic cache busting so deployed client updates take effect without manual browser refresh.

Purpose: Cast bars occasionally get stuck and cooldowns never expire because client-side optimistic predictions (localCast, localCooldowns, predictedCooldownReadyAt) are not cleared when combat ends — only when the character is switched. Additionally, effectTimers and enemyCastTimers Maps in useCombat accumulate stale entries. For cache busting, the Vite-built index.html can be cached by the browser, serving stale JS bundle references after a deploy.

Output: Reliable cast bar / cooldown behavior across combat transitions, and automatic version-aware client reloading.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/composables/useHotbar.ts
@src/composables/useCombat.ts
@src/App.vue
@vite.config.ts
@src/main.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix stuck cast bars and cooldown timers on combat transitions</name>
  <files>src/composables/useHotbar.ts, src/composables/useCombat.ts, src/App.vue</files>
  <action>
**useHotbar.ts — add combat-end reset:**

The `useHotbar` composable accepts `activeCombat` as a Ref but never watches it for transitions. When combat ends (activeCombat becomes null), `localCast`, `localCooldowns`, and `predictedCooldownReadyAt` retain their old predictions, causing stuck cast bars and phantom cooldowns.

1. Add a watcher on `activeCombat` (already passed as arg) that fires when it transitions to `null`:
   ```
   watch(
     () => activeCombat.value,
     (newVal, oldVal) => {
       if (!newVal && oldVal) {
         // Combat just ended — clear all optimistic predictions
         localCast.value = null;
         localCooldowns.value.clear();
         predictedCooldownReadyAt.value.clear();
         hotbarPulseKey.value = null;
       }
     }
   );
   ```
   Place this watcher AFTER the existing `selectedCharacter.id` watcher (around line 348). This ensures that when combat resolves and CharacterCast/AbilityCooldown rows are deleted server-side, the client immediately drops its optimistic overlays.

2. Also add a safety reset in the existing `nowMicros` watcher: if `localCast` exists but the server's `castingState` (from characterCasts) is null AND the local cast should have ended by now (elapsed >= duration + 2 seconds buffer), force-clear localCast. This catches orphaned predictions where the server never created a CharacterCast row (e.g., ability failed silently). Add this check near line 361:
   ```
   // Safety net: clear orphaned localCast if server has no active cast and local timer expired + buffer
   if (localCast.value && !castingState.value) {
     const elapsed = now - localCast.value.startMicros;
     const buffer = 2_000_000; // 2 second grace period
     if (elapsed >= localCast.value.durationMicros + buffer) {
       localCast.value = null;
     }
   }
   ```

**useCombat.ts — clear stale timer caches on combat transition:**

The `effectTimers` and `enemyCastTimers` Maps at the top of `useCombat` are plain Maps (not reactive), and they never get cleared. When combat ends and a new combat starts, stale entries from the old combat can interfere with timer calculations.

3. Add a watcher inside useCombat that clears both maps when `activeCombat` changes identity (transitions to null or to a different combat):
   ```
   watch(
     () => activeCombat.value?.id?.toString() ?? null,
     () => {
       effectTimers.clear();
       enemyCastTimers.clear();
     }
   );
   ```
   Import `watch` from vue at the top of useCombat.ts (it currently only imports `computed` and `type Ref`). Place the watcher at the end of the composable, before the `return` statement.

**App.vue — increase nowMicros tick rate for smoother cast bars:**

4. In onMounted (line 1959), change the setInterval from 200ms to 100ms for smoother cast bar animation:
   ```
   uiTimer = window.setInterval(() => {
     nowMicros.value = Date.now() * 1000 + serverClockOffset.value;
   }, 100);
   ```
   This doubles the visual update frequency from 5fps to 10fps, giving cast bars and cooldown timers noticeably smoother progress without meaningful CPU cost (it only updates one reactive ref).
  </action>
  <verify>
Run `cd C:/projects/uwr && npx vue-tsc --noEmit` to verify TypeScript compiles without errors. Manually inspect that useHotbar.ts has the new `activeCombat` watcher and safety net, useCombat.ts has the combat-transition clear watcher with `watch` imported, and App.vue setInterval is 100ms.
  </verify>
  <done>
localCast/localCooldowns/predictedCooldownReadyAt are cleared when activeCombat transitions to null. effectTimers and enemyCastTimers are cleared on combat identity change. Orphaned localCast predictions are force-cleared after 2s grace. nowMicros ticks at 100ms for smoother bars. TypeScript compiles clean.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add automatic cache busting on client deploys</name>
  <files>vite.config.ts, src/main.ts</files>
  <action>
The Vite build already hashes JS/CSS filenames, but `index.html` itself can be cached by the browser. When a new client build is deployed, players with cached HTML continue loading old bundles until they manually hard-refresh.

**vite.config.ts — generate version.json at build time:**

1. Add a small custom Vite plugin that generates a `version.json` file in the build output:
   ```typescript
   import { defineConfig } from 'vite';
   import vue from '@vitejs/plugin-vue';
   import { writeFileSync } from 'fs';
   import { resolve } from 'path';

   const versionPlugin = () => ({
     name: 'version-json',
     closeBundle() {
       const version = Date.now().toString();
       writeFileSync(
         resolve(__dirname, 'dist/version.json'),
         JSON.stringify({ version })
       );
     },
   });

   export default defineConfig({
     plugins: [vue(), versionPlugin()],
     define: {
       __BUILD_VERSION__: JSON.stringify(Date.now().toString()),
     },
   });
   ```
   The `define` injects `__BUILD_VERSION__` as a compile-time constant into the client code. The `closeBundle` hook writes a matching `version.json` to the dist folder.

**src/main.ts — poll for version changes and force reload:**

2. After the app mounts, start a version polling loop. Add AFTER the `void bootstrap()` call:
   ```typescript
   declare const __BUILD_VERSION__: string;

   const CLIENT_VERSION = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev';

   const checkForUpdates = async () => {
     try {
       const resp = await fetch('/version.json?_=' + Date.now(), {
         cache: 'no-store',
       });
       if (!resp.ok) return;
       const data = await resp.json();
       if (data.version && data.version !== CLIENT_VERSION && CLIENT_VERSION !== 'dev') {
         console.log('[Version] New client version detected, reloading...');
         window.location.reload();
       }
     } catch {
       // Network error or dev mode — skip silently
     }
   };

   // Check for updates every 60 seconds, but only in production
   if (CLIENT_VERSION !== 'dev') {
     setInterval(checkForUpdates, 60_000);
   }
   ```
   Key design choices:
   - `cache: 'no-store'` plus cache-buster query param ensures we always get the latest version.json
   - `CLIENT_VERSION !== 'dev'` skips polling during `vite dev` mode (where `__BUILD_VERSION__` would be the define value from dev server — in dev mode `define` still applies, so we check explicitly)
   - Automatic `window.location.reload()` instead of a prompt — the game reconnects seamlessly via SpacetimeDB auth token in localStorage, so a reload is non-disruptive
   - 60-second interval is conservative enough not to waste bandwidth but catches deploys within a minute

3. Also add a `public/version.json` placeholder for dev mode so fetch doesn't 404 during local development:
   Create file `public/version.json` with content: `{"version":"dev"}`
   This way the dev server serves it without errors, and the `CLIENT_VERSION !== 'dev'` guard prevents any reload logic from firing.
  </action>
  <verify>
Run `cd C:/projects/uwr && npx vue-tsc --noEmit` to verify TypeScript compiles. Check that vite.config.ts has the versionPlugin and define block. Check that src/main.ts has the version polling logic. Check that public/version.json exists. Run `cd C:/projects/uwr && npx vite build` and verify dist/version.json is generated with a numeric version string.
  </verify>
  <done>
Build produces dist/version.json with a timestamp version. Client code embeds matching __BUILD_VERSION__ constant. Production client polls /version.json every 60 seconds and auto-reloads when a mismatch is detected. Dev mode skips polling entirely. TypeScript and build both pass.
  </done>
</task>

</tasks>

<verification>
1. TypeScript compilation: `npx vue-tsc --noEmit` passes with no errors
2. Build succeeds: `npx vite build` completes and `dist/version.json` exists
3. Timer cleanup: useHotbar.ts has activeCombat watcher clearing localCast/localCooldowns/predictedCooldownReadyAt
4. Effect cache cleanup: useCombat.ts has watcher clearing effectTimers/enemyCastTimers on combat change
5. Version polling: main.ts has 60-second interval fetching /version.json with cache-busting
6. Dev safety: public/version.json exists, dev mode skips polling
</verification>

<success_criteria>
- Cast bar and cooldown timers properly reset when combat ends (activeCombat goes null)
- Stale effect/cast timer map entries cleared between combats
- Orphaned optimistic cast predictions auto-clear after 2s grace period
- New client deploys detected within 60 seconds and browser auto-reloads
- No regressions: TypeScript compiles, Vite build succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/144-robust-cast-bar-cooldown-timers-and-auto/144-SUMMARY.md`
</output>
