---
phase: 45-foundation-frame-and-auth
verified: 2026-10-05T13:10:00Z
status: human_needed
score: 6/6 roadmap success criteria verified in code and automated tests (real-browser confirmation deferred by owner)
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Splash at 1280x800, 1280x600, 390x844, 390x600 (UAT item 1, backstop)"
    expected: "The 16:9 logo is large, undistorted, crisp and the Sign in button is visible without scrolling"
    why_human: "Rendered size, crispness and short-viewport fit need a real browser; jsdom has no layout"
  - test: "Live SpacetimeAuth sign-in, reload, picker, logout (UAT items 2 and 11)"
    expected: "Sign in -> IdP -> back on /uwr -> Connecting -> Signing in -> frame or picker; reload shows Connecting, never the idle splash; logout returns the splash and a reload stays there. Record token lifetime and whether Signing in ever hangs (RESEARCH OQ5 and A4)"
    why_human: "Needs the real IdP, a real token and the local server"
  - test: "Desktop frame at 1280x800 and 1000px (UAT items 3, 4, 9)"
    expected: "48px header, 252px vitals rail, feed, 288px context rail, no page scroll; header labels hide at about 1000px; computed font sizes 10/12/14/20 and weights 400/500 only"
    why_human: "Computed layout and fonts are only observable in a real browser"
  - test: "Drawers on desktop (UAT items 5, 7 backstop)"
    expected: "Each header button opens one drawer over feed and context rail, header and vitals rail stay visible, Esc and X close, focus ring visible and trapped, focus returns to the opener; at short heights the drawer body scrolls while the title row stays"
    why_human: "Focus ring rendering and overflow behaviour need a real browser"
  - test: "Mobile at 390x844 (UAT items 6, 8 backstop)"
    expected: "Vitals strip, location row, feed, 64px tab bar; Map/Bag/Party and More open full-height sheets above the tab bar; Story closes; strip shrinks when a sheet is open; a 20-character name never wraps and New skill hides before Level up"
    why_human: "Layout, truncation and tag-priority behaviour need a real viewport"
  - test: "Reconnect after server stop/start (UAT item 10)"
    expected: "Frame keeps data under a Reconnecting bar with a backoff countdown; recovers within 30 s; after a longer outage the picker returns"
    why_human: "Needs stopping and starting the local SpacetimeDB server"
  - test: "Version notice in a production build (UAT item 12, optional)"
    expected: "After set_app_version to a different value the A new version is ready bar with Reload appears; never in pnpm dev"
    why_human: "Needs a production build and an admin reducer call"
deferred_context:
  - "Owner deferred ALL hands-on verification to one end-of-milestone UAT pass; checklist is in 45-11-SUMMARY.md under Deferred owner verification."
notes:
  - "CR-01 (login_email trusts a client-supplied email) is a pre-existing server defect, tracked in .planning/todos/pending/2026-10-05-login-email-trusts-client-supplied-email.md. Phase 45 made no server change by design. Not a Phase 45 gap."
  - "Secondary screens (Map, Inventory, Stats, Crafting, Social, Events, Vendor) and the feed, context rail and party section are intentional empty-state shells; their content belongs to Phases 47-51. Not stubs against this phase's goal."
---

# Phase 45: Foundation, Frame and Auth Verification Report

**Phase Goal:** The old UI is gone, and a player can sign in to the fresh client and see the Nocturne frame: header, persistent vitals rail, feed and context rail on desktop; compact vitals strip, feed and tab bar on mobile; secondary screens open as drawers or sheets.
**Verified:** 2026-10-05
**Status:** human_needed (code complete and wired; real-browser evidence deferred by the owner)
**Re-verification:** No, initial verification

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Old `src/` UI deleted after tagging `v2.2-client`; `pnpm dev` on 5173; SpacetimeAuth sign-in with existing redirect URI; character connected via existing module and bindings; reconnect on reload or drop; logout | VERIFIED (code + tests); live run is a human item | `git tag` lists `v2.2-client`; the tag holds 84 non-binding src files (components 33, composables 31+7, ui 3, data 1) and none exist in HEAD (`find src`). `legacyClientRemoval.test.ts` asserts the paths are gone, deps are exactly vue/spacetimedb/phosphor, port 5173 + `strictPort`. `.env.local` redirect URI is `http://localhost:5173/uwr`; `spacetimeAuth.ts` default unchanged from the tag. `useSession.ts` calls `loginEmail`, `setActiveCharacter`, `logout` and subscribes to `myPlayer`, `character`, `pendingSkill`, `worldState`, `region`, `location`, `appVersion`, all present in generated bindings. `connection.ts` reconnects with backoff, resumes on online/visible, wipes the session only after 3 token failures against a reachable host. `App.vue` creates the session, `start()` on mount, `dispose()` on unmount. |
| 2 | At 1280x800: header (location, time of day, level-up/new-skill tags, screen buttons), stationary vitals rail, feed and context rail | VERIFIED in code; pixel layout is a human item | `AppFrame.vue` desktop branch composes `HeaderBar`, `VitalsRail`, `FeedShell`, `ContextRail`. `HeaderBar.vue`: place, Day/Night, Level up / New skill tags, `HEADER_SCREENS` buttons, account menu. Data flows from `buildFrameView` (character, location/region join, `worldState.isNight`, `pendingLevels`, `pendingSkill`). `AppFrame.layout.test.ts`, `HeaderBar.test.ts`, `VitalsRail.test.ts`, `frameView.test.ts` pass. |
| 3 | Screen button opens a drawer over center and right columns while header and vitals rail stay; Esc or close button dismisses | VERIFIED | `Drawer.vue` is `position:absolute; inset:0 0 0 252px` inside `.frame-body` (header and rail outside its span), document Escape handler plus close button emit `close`, focus trap and focus return (`useScreens.close`). `Drawer.test.ts`, `useScreens.test.ts`, `AppFrame.screens.test.ts` pass. |
| 4 | At 390x844: compact vitals strip, feed, bottom tab bar (Story, Map, Bag, Party, More); secondary screen opens as full-height sheet above the tab bar | VERIFIED in code; viewport rendering is a human item | `AppFrame.vue` mobile branch (below 900px): `VitalsStrip`, `LocationRow`, `FeedShell compact`, `Sheet`/`MoreSheet` as flex child before `TabBar`. `tabs.ts` defines the five tabs and mapping. `TabBar.test.ts`, `Sheet.test.ts`, `VitalsStrip.test.ts` pass. |
| 5 | Nocturne hover, pressed, focus-visible with Inter and Phosphor; no hard-coded component color (a test fails if one does); rarity and difficulty hues kept | VERIFIED | `nocturne.css` vendored (`:focus-visible`, btn states), Inter via `--font-*`, Phosphor-only enforced by `designContract.test.ts`. `colors.guard.test.ts` and `designContract.test.ts` pass; my own grep finds no literal color outside `nocturne.css` and `tokens.client.css`. `tokens.client.css` pins rarity (`#22c55e`, `#3b82f6`, `#aa44ff`, `#ff8800`) and con hues. Computed fonts are a human item (UAT 9). |
| 6 | Splash shows the 16:9 logo large, undistorted, fit to viewport at 1280x800 and 390x844, no pixelation | VERIFIED in code; visual is a human item | `SplashScreen.vue`: `<img>` 1672x941, `aspect-ratio:16/9`, `object-fit:contain`, `width:min(960px,100%)`, `max-height:calc(100dvh - 176px)`, `BASE_URL`-aware src; asset `public/assets/logo.png` exists. `SplashScreen.test.ts` passes. Crispness at short viewports is UAT item 1. |

**Score:** 6/6 verified in code and automated tests; 0 failed; real-browser confirmation outstanding.

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/main.ts`, `src/App.vue` | VERIFIED | Entry mounts App after `handleSpacetimeAuthCallback`; App switches splash / picker / no-characters / frame from `session.screen` |
| `src/session/useSession.ts`, `deriveScreen.ts`, `frameView.ts`, `versionCheck.ts` | VERIFIED | Substantive, wired from App; real subscriptions (not static) |
| `src/net/connection.ts`, `bindTable.ts`, `backoff.ts` | VERIFIED | Controller used by `createDefaultSession` |
| `src/auth/spacetimeAuth.ts` | VERIFIED | Expired-token handling, URL cleanup, one-shot PKCE values cleared |
| `src/frame/*` (AppFrame, HeaderBar, VitalsRail, VitalsStrip, ContextRail, FeedShell, Drawer, Sheet, MoreSheet, TabBar, NoticeBars, AccountMenu, LocationRow, focusTrap, useBreakpoint, useScreens) | VERIFIED | All imported and used by AppFrame |
| `src/screens/*` (seven shells + registry) | VERIFIED as shells | Intentional empty states; registry drives header buttons, tabs, drawer and sheet |
| `src/session/SplashScreen.vue`, `CharacterPicker.vue`, `NoCharactersNote.vue` | VERIFIED | Wired in App.vue |
| `src/styles/nocturne.css`, `tokens.client.css`, `frame.css` | VERIFIED | Imported in `main.ts` |
| `vite.config.ts` (port 5173 strict, `@game-data` alias), `package.json`, `index.html` | VERIFIED | Guarded by `legacyClientRemoval.test.ts`, `gameDataAlias.test.ts` |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `main.ts` | `App.vue` | `createApp(App, { callbackError })` after callback handling | WIRED |
| `App.vue` | `createDefaultSession` | session lifecycle `start`/`dispose` | WIRED |
| `useSession` | server | `loginEmail` once per connection when the player row has no user, `setActiveCharacter`, `logout` (capped 2 s) | WIRED |
| `useSession` | `AppFrame` | `frame` computed from live character, location, region, worldState, pendingSkill rows | WIRED |
| `AppFrame` | Drawer / Sheet / MoreSheet / TabBar | `useScreens` plus `screens` registry | WIRED |
| `useSession` | reconnect | `controller.conn` watch re-attaches bindings, `reconnecting` drives `NoticeBars` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| HeaderBar / VitalsRail / VitalsStrip | place, time, hp/mana/stamina, tags | `buildFrameView` over `character`, `location`, `region`, `world_state`, `pending_skill` subscriptions | Yes | FLOWING |
| CharacterPicker | characters | `character` where `owner_user_id = userId` | Yes | FLOWING |
| FeedShell, ContextRail, party section, secondary screens | none | static empty-state text | n/a | Intentional shells; content is Phases 47-51 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Client test suite | `npx vitest run src --maxWorkers=2` | 92 files passed, 3611 tests passed; the one failing file is the baseline `spacetimedb/src/helpers/measurement.results.test.ts` (v2.2 phase folders moved) | PASS (baseline only) |
| Build + bundle guard | `pnpm build` | vue-tsc and vite build clean, `bundle clean: 4 files scanned` | PASS |
| Old tag exists | `git tag` | `v2.2-client` present | PASS |

The orchestrator's full-run baseline (4 failed files, all pre-existing, 4032 tests passed) was not re-run in full by this verifier; the src subset reproduces the one baseline failure in scope and no new ones.

### Probe Execution

Step 7c: SKIPPED (no probes declared by the phase).

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|-------------|--------|----------|
| FND-01 fresh Vite + Vue 3 app at root, same module/bindings, 5173, redirect URI | 45-01, 45-11 | SATISFIED | See truth 1 |
| FND-02 Nocturne styling, no hard-coded color, hues kept | 45-02, 45-11 | SATISFIED | Truth 5; guard tests green |
| FND-03 desktop frame | 45-04, 45-06, 45-07, 45-10, 45-11 | SATISFIED in code; browser layout via UAT | Truth 2 |
| FND-04 drawer, header and rail stay, Esc/close | 45-01, 45-05, 45-10, 45-11 | SATISFIED | Truth 3 |
| FND-05 mobile strip, feed, tab bar, sheets | 45-01, 45-05, 45-06, 45-07, 45-10, 45-11 | SATISFIED in code; browser layout via UAT | Truth 4 |
| FND-06 sign in, reconnect, log out | 45-03, 45-04, 45-07, 45-08, 45-09, 45-11 | SATISFIED in code, verified against final code (not the early checkbox); live sign-in, reconnect drill and logout via UAT | `useSession.ts` wires sign-in (`beginSpacetimeAuthLogin`), `loginEmail`, reconnect, `logout`; `connection.test.ts`, `useSession.test.ts`, `logout.test.ts`, `spacetimeAuth.test.ts` pass |
| FND-07 splash logo | 45-08, 45-11 | SATISFIED in code; visual via UAT | Truth 6 |
| CUT-03 old client deleted after tag, nothing references it | 45-01, 45-11 | SATISFIED | Tag present, old dirs absent, `legacyClientRemoval.test.ts`, README structure updated; grep of non-planning files finds no reference to the old directories (only `spacetimedb/src/data`, which is the server) |

Orphaned requirements: none. Every ID mapped to Phase 45 in REQUIREMENTS.md (FND-01..07, CUT-03) appears in at least one PLAN frontmatter, and the union of plan IDs equals the roadmap list.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| none | No TBD/FIXME/XXX in `src` (excluding bindings); no literal colors outside the two token files | none | none |
| `FeedShell.vue`, `ContextRail.vue`, `VitalsRail.vue` party block, `src/screens/*` | Static empty-state text | Info | Intentional Phase 45 shells per roadmap; filled in Phases 47-51 |

### Human Verification Required

See the `human_verification` frontmatter list; the full 12-item checklist is in `45-11-SUMMARY.md` ("Deferred owner verification"). Three items are UI-SPEC backstops (short-viewport splash, drawer/sheet overflow, strip tag priority). All were deferred by the owner to end-of-milestone UAT. Also record observed SpacetimeAuth token lifetime and any "Signing in..." hang.

### Notes (not gaps)

- CR-01: `login_email` trusts a client-supplied email. Pre-existing server issue deferred to `.planning/todos/pending/2026-10-05-login-email-trusts-client-supplied-email.md`; Phase 45 changed no server code by design. Recommend it is scheduled before the milestone ships.
- The Inter font is loaded from Google Fonts via the vendored `nocturne.css`; offline play falls back to `system-ui`. Informational.
- Code review: clean after 3 iterations (45-REVIEW.md).

### Gaps Summary

No gaps. All six roadmap success criteria and all eight requirement IDs are satisfied in the code and its automated tests, the build and bundle guard pass, and the only failing test file is a documented baseline failure. The status is human_needed solely because the owner deferred the real-Chrome, live-auth and reconnect checks to end-of-milestone UAT.

---

_Verified: 2026-10-05_
_Verifier: Claude (gsd-verifier)_
