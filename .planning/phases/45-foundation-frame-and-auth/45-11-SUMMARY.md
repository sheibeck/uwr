---
phase: 45-foundation-frame-and-auth
plan: 11
subsystem: ui
tags: [vue, wiring, phase-gate, uat]
requires:
  - phase: 45-08
    provides: session object, SplashScreen, CharacterPicker, NoCharactersNote
  - phase: 45-09
    provides: session views and derived screen
  - phase: 45-10
    provides: AppFrame composition
provides:
  - "App.vue: root screen switch bound to the session (props callbackError, session)"
  - "App.test.ts: screen switch and event wiring tests with a fake session"
  - "Phase gate record: full suite vs baseline, build with bundle guard, dev path /uwr"
affects: []
tech-stack:
  added: []
  patterns: [destructure session refs in script setup so the template auto-unwraps them, session prop for tests with createDefaultSession fallback]
key-files:
  created:
    - src/App.test.ts
  modified:
    - src/App.vue
key-decisions:
  - "App owns the session lifecycle: created in setup (or taken from the session prop), start() on mount, dispose() on unmount (covers Vite hot updates)"
  - "Real-browser owner verification (Task 3) deferred by the owner to end-of-milestone UAT"
patterns-established:
  - "Fake Session built from computed/ref/vi.fn for component wiring tests"
requirements-completed: [FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, FND-07, CUT-03]
duration: 12min
completed: 2026-10-05
status: complete
---

# Phase 45 Plan 11: App wiring and phase gate Summary

**App.vue renders exactly one of splash, picker, no-characters note or AppFrame from the session's derived screen and routes sign in, select, log out and reload to the session; the automated phase gate (suite vs baseline, build with bundle guard, /uwr dev path) is green and the owner's real-browser checklist is deferred to end-of-milestone UAT.**

## Accomplishments
- `src/App.vue`: props `{ callbackError?, session? }`; session is `props.session ?? createDefaultSession({ callbackError })`; `onMounted(start)`, `onBeforeUnmount(dispose)`; template switches SplashScreen / CharacterPicker / NoCharactersNote / AppFrame with all props and events bound. `src/main.ts` unchanged.
- `src/App.test.ts`: 7 tests with a fake session covering every screen, every event path, start once / dispose once, live screen switching without remount, and the frame screen with no view yet.
- Phase gate: full suite (`--maxWorkers=1`) 98 files passed, 4 failed, all 4 in the baseline list (call_log_report, golden_run, proof_rules, measurement.results); the baseline-compare script printed `no new failures`. `pnpm build` exit 0 (vue-tsc, vite build, `bundle clean: 4 files scanned`). `git tag -l v2.2-client` prints the tag. No push, no publish.
- Dev path check: `pnpm dev` started briefly; `http://localhost:5173/` and `/uwr?code=x&state=y` both returned 200 and the latter contains `id="app"`. Vite was stopped afterwards (PID 14412 terminated). A SpacetimeDB process (PID 12020) was already listening on 3000 before this run and answers `/v1/ping` 200; it was not started or touched by this agent.

## Task Commits
1. Task 1: 91b1876d (feat(45-11): bind App screen switch to the session). Tests were written together with the implementation in one commit (no separate RED commit; the plan marks the wiring tests tdd but they passed on first run against the new App.vue).
2. Task 2: verification only, no commit.
3. Task 3: deferred (see below).

## Deviations from Plan
- Task 2 step 3 (leave SpacetimeDB and Vite running for the owner): not done. By orchestrator instruction the owner deferred all hands-on verification to the end of the milestone, and long-lived servers must not be left by the subagent. Dev server was started only for the `/uwr` check and then stopped.
- Task 3 (`checkpoint:human-verify`) was not presented; recorded as deferred by the owner. No owner results exist yet for the checklist items, the token lifetime observation, or any "Signing in…" hang (RESEARCH Open Question 5 and A4).
- Task 1 TDD: single commit rather than RED then GREEN (see above).

## Known Stubs
None.

## Threat Flags
None. T-45-05 mitigated (bundle guard clean, legacyCredentials/legacyLlmRemoval guards in the green suite). T-45-21 mitigated (no push, no publish, no clear-database).

## Deferred owner verification

Task 3 (`checkpoint:human-verify`, blocking) was **deferred by the owner to end-of-milestone UAT** (decision 2026-10-05). Checklist copied verbatim from the plan. Items 1, 7 and 8 are the three UI-SPEC backstop rows.

**What was built:** The fresh Vue 3 client on Nocturne at the repo root: splash with the 16:9 logo and sign-in, character picker, desktop frame (header, vitals rail, feed, context rail) with drawers, mobile frame (strip, feed, tab bar) with sheets, Reconnecting and version bars, log out. Claude started SpacetimeDB (port 3000) and Vite (port 5173) in Task 2. Use an account that already has a local character (character creation is Phase 49).

**How to verify:**

Open http://localhost:5173/uwr in Chrome with DevTools device toolbar.
1. Splash at 1280x800, 1280x600, 390x844 and 390x600: the logo is large, undistorted, crisp (not pixelated) and the Sign in button is visible without scrolling. (backstop: short viewports)
2. Sign in: Sign in -> SpacetimeAuth -> back on /uwr -> "Connecting…" -> "Signing in…" -> frame (active character) or picker. In the picker choose a character; the frame opens. Reload the page: it shows "Connecting…" (never the idle splash first) and returns to the frame.
3. Desktop 1280x800: 48px header with brand, "Region · Location", Day or Night, any Level up / New skill tags, Map, Bag, Stats, Craft, Social, Events and the account (three dots) button; vitals rail 252px with name, level line and Health/Mana/Stamina bars; feed column; context rail 288px with Here, Nearby, Tracking; no page scroll.
4. Narrow the window to about 1000px: header button labels hide (icons stay; hover shows the name); the location truncates first.
5. Drawers: click each header button; one drawer at a time covers the feed and right rail while the header and vitals rail stay visible; Esc and the X button close it; pressing Tab shows the purple focus ring and stays inside the drawer; focus returns to the button after closing.
6. Mobile 390x844: vitals strip, location row, feed, 64px tab bar (Story, Map, Bag, Party, More); no header bar. Map, Bag, Party open full-height sheets (Map, Inventory, Social); More opens a sheet with Stats, Crafting, Events, Vendor, Log out; Story closes the sheet; while a sheet is open the strip shrinks to one row.
7. Shrink the viewport height until the empty-state block no longer fits (about 390x320 and 1280x360): the drawer and sheet body scroll while their title row stays put. (backstop: drawer/sheet overflow)
8. Mobile strip at 390px: in DevTools Elements, change the strip's name text to a 20-character name (for example "Aldric Thornwood Val") and, if the character lacks pending levels or skills, use one that has them or add the tag text by editing an existing tag: the New skill tag disappears before Level up and the name never wraps. (backstop: strip tags)
9. DevTools Computed: rail h6 is 10px, tags 12px, body text 14px, titles 20px; no other font sizes on screen; weights only 400 and 500.
10. Reconnect: ask Claude to stop the local SpacetimeDB server. The frame keeps showing its data with a "Reconnecting…" bar counting down "Next try in 1s, 2s, 5s, 10s…". Ask Claude to start it again within 30 seconds: the bar disappears and the frame recovers. Repeat with an outage longer than 30 seconds: after recovery the picker returns (expected; the server logs the character out after 30 s; no auto-restore in this phase).
11. Log out from the header account menu (desktop) and from More (mobile): the splash returns; reloading stays on the splash.
12. Optional, version bar: stop `pnpm dev`, run `BUILD_VERSION=uat1 pnpm build` then `pnpm preview --port 5173 --strictPort`, sign in, then as an admin identity run `spacetime call uwr set_app_version '"uat2"' --server local`: the "A new version is ready." bar with Reload appears in the frame (it never shows in pnpm dev).

Note anything unexpected, including how long the SpacetimeAuth session lasts before "Your session expired" (RESEARCH Open Question 5) and whether sign-in ever sticks on "Signing in…" (RESEARCH A4, the my_player view).

**Resume signal:** Type "approved" or describe the issues. Per-item results, observed token lifetime and any "Signing in…" hang are still to be recorded at end-of-milestone UAT.

## Self-Check: PASSED
- src/App.vue and src/App.test.ts exist; commit 91b1876d exists; tag v2.2-client exists.
