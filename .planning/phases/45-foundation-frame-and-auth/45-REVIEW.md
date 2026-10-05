---
phase: 45-foundation-frame-and-auth
reviewed: 2026-10-05T00:00:00Z
depth: standard
iteration: 3
files_reviewed: 4
files_reviewed_list:
  - src/frame/focusTrap.ts
  - src/frame/Drawer.vue
  - src/frame/Sheet.vue
  - src/session/useSession.ts
findings:
  critical: 1
  warning: 0
  info: 8
  total: 9
status: clean
---

# Phase 45: Code Review Report (iteration 3, final re-review)

**Reviewed:** 2026-10-05
**Depth:** standard
**Files Reviewed:** 4 source files (plus Drawer.test.ts, Sheet.test.ts and useSession.test.ts, read for reliability)
**Status:** clean (CR-01 is deferred and does not count against the verdict)

## Summary

Scope: `git diff 3bcba7a9..HEAD -- src`. I read every changed source file in full and the new tests. I ran `npx vitest run src/frame src/session`: 19 files, 288 tests, all passing.

Verification of the two items that were to be fixed:

| ID | Verdict |
|----|---------|
| WR-10 | Fixed. No new bug found. |
| IN-05 | Fixed. No new bug found. |

**WR-10 (Tab trap scope).**
- `trapTabKeyAtDocument` (`src/frame/focusTrap.ts:50-56`) delegates to `trapTabKey` only when `document.activeElement` is `null`, is `<body>`, or is inside the dialog. Focus that is deliberately on the header, rail or tab bar is left to the browser, so Tab moves freely between that chrome.
- The `lost` and `inside` checks use `Node` and `contains`, which are safe for a null `activeElement`. `trapTabKey` still re-checks `inside` itself, so a lost-focus Tab is pulled to the first element, or the last with Shift.
- Drawer and Sheet both route Tab through it. The Tab branch still returns before the Escape check, and the listener is removed on unmount. The two components are mutually exclusive, so two document listeners never run together.
- Desktop `Drawer` is now `aria-modal="false"`, which is accurate for a panel inset beside a live rail and header (`inset: 0 0 0 252px`). Mobile `Sheet` stays `aria-modal="true"` per the 45-UI-SPEC, with an explanatory comment. See IN-09 for a small residual wrinkle.
- The new tests cover the three paths: Tab from outside chrome is not prevented (forward and Shift), Tab with focus on `<body>` is pulled in (dispatched at `document`), and Shift+Tab on the first element wraps to the last. They assert `defaultPrevented` and `activeElement`. `document.body.innerHTML = ''` in `afterEach` cleans up the extra chrome button, so tests do not leak into each other.

**IN-05 (loginEmail rejection discrimination).**
- `SenderError` is imported from `spacetimedb`. I confirmed in the installed SDK that `dist/index.browser.mjs` defines `SenderError` and `InternalError` and exports them from the same bundle as `DbConnectionImpl`. The reducer promise rejects with exactly those classes (`db_connection_impl.ts:1218-1223`), so `instanceof` is reliable and there is no duplicate-class hazard.
- `failSignIn` (which wipes the stored credentials and disconnects) now runs only for a `SenderError` on the live connection. An `InternalError` or any other error logs and returns. `loginSentFor === conn` prevents a same-connection retry, so recovery is the existing 15 s sign-in watchdog (`signInFailed` splash without wiping the session) or a reconnect.
- The stale-connection and non-connected guard still runs first. The new tests cover `SenderError` (fails sign-in), `InternalError` (credentials kept, no disconnect) and a plain `Error` (credentials kept).

CR-01 is carried forward as deferred. Info items IN-01 to IN-04 and IN-06 to IN-08 are carried forward unchanged. IN-05 is resolved and removed. One new low-severity Info item (IN-09) is added. No Critical or Warning findings remain other than the deferred CR-01.

## Structural Findings (fallow)

None provided.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Sign-in trusts a client-supplied email, so any authenticated identity can take over another account

**Status: deferred (tracked todo, out of phase scope).** The todo is `.planning/todos/pending/2026-10-05-login-email-trusts-client-supplied-email.md`. It is server code (`spacetimedb/src/reducers/auth.ts`); Phase 45 has no server change. This does not count against the iteration 3 verdict. It is unchanged from the previous review.

**File:** `src/session/useSession.ts:256-261` (client), `spacetimedb/src/reducers/auth.ts:27-48` (server), `src/auth/spacetimeAuth.ts` (email stored from the id token)
**Issue:** The client sends `loginEmail({ email })` from `localStorage`. The server only checks for `@` and never compares the email with the verified JWT claims of `ctx.sender`. This breaks the rule "`ctx.sender` is the authenticated principal — never trust identity args".
**Fix:** Derive the email on the server from the verified token claims, drop the argument, regenerate the bindings, and stop sending the email from the client.

## Warnings

None.

## Info

### IN-01: A failed callback masks a valid existing session (carried forward, unchanged)

**File:** `src/session/useSession.ts:169`, `src/session/deriveScreen.ts:45`
**Issue:** `authFailed` starts true when `callbackError` is set, and `deriveScreen` ranks it highest. `App.vue` still calls `session.start()`, so the socket connects with an older valid token while the UI shows "Sign-in failed". An IdP "Deny" (`?error=access_denied`) routes into this path, so a user with an old session who cancels a re-login hits it.
**Fix:** Skip `controller.connect()` while `authFailed` is true, or clear the stored session when the callback fails.

### IN-02: Production build version falls back to `Date.now()` (carried forward, unchanged)

**File:** `vite.config.ts:5`
**Issue:** A release build without `BUILD_VERSION` never equals the admin-set `app_version`, so the reload prompt is permanent.
**Fix:** Fail the build when `BUILD_VERSION` is unset in production mode, or document that it is mandatory.

### IN-03: Choosing the Story tab steals focus from the tab that was clicked (carried forward, unchanged)

**File:** `src/frame/AppFrame.vue:45-52`, `src/frame/useScreens.ts:41-48`
**Issue:** `onSelectTab('story')` calls `screens.close()`, which refocuses the previous opener.
**Fix:** Give `close()` a `restoreFocus` option, or pass the Story tab element as the new opener.

### IN-04: Smaller defects and stale text (carried forward, unchanged)

- `src/frame/AccountMenu.vue:44-46`:
  - ArrowUp with `index === -1` lands on the second-to-last item.
  - There is no Home/End or Tab handling.
- `src/frame/focusTrap.ts:1-14`:
  - `[href]` is not excluded when disabled.
  - Elements hidden by `display:none` or `inert` count as focusable.
- `src/connectionLogging.ts:3-10`: the comment says TS 5.6, but the project uses `typescript ~6.0.3`. Re-verify that the TS2589 workaround is still needed. `src/net/connection.ts:264-265` repeats the same comment.
- `src/frame/HeaderBar.vue:14`: `AppFrame` never passes the `disabled` prop.

### IN-06: `bindTable.failed` is sticky across a re-attach (carried forward, unchanged)

**File:** `src/net/bindTable.ts:93-131`
**Issue:** `failed` is cleared only by an applied subscription or `dispose`, not by `attach()` on a new connection. A subscription error on connection 1 keeps `bindingFailed` true while connection 2's subscription is still pending. For a session still waiting for data, the user sees "Sign-in failed" until the new subscription applies, instead of "Signing in…". Loaded frames are not affected.
**Fix:** Reset `failed.value = false` in `attach()` right after `detach()`, when a non-null conn is attached.

### IN-07: Token-failure retries show the "Can't reach the server" splash against a reachable host (carried forward, unchanged)

**File:** `src/net/connection.ts:96, 140-142`
**Issue:** The 1st and 2nd consecutive token failure against a reachable host call `scheduleRetry()`. That sets `status = hasConnected ? 'reconnecting' : 'unreachable'`, so the first-connect user sees "Can't reach the server. Retrying…" for roughly 3 s before the session is rejected. The copy is wrong, but the behavior is correct.
**Fix:** Optional. Keep `connecting` during token-failure retries, for example with a `scheduleRetry(status)` parameter. Otherwise accept it.

### IN-08: Tab after a pointer click inside the dialog body jumps to the close button (carried forward, unchanged)

**File:** `src/frame/focusTrap.ts:50-56`
**Issue:** Clicking non-focusable dialog text leaves `document.activeElement` on `<body>`, so `lost` is true and `inside` is false. The document-level handler pulls focus to the first element, the close button. Before the document-level trap, native Tab continued from the click position.
**Fix:** Optionally skip the pull-back when the last pointer interaction was inside the dialog, or make the dialog body `tabindex="-1"` so a click inside leaves focus in the dialog.

### IN-09: Mobile Sheet is `aria-modal="true"` but its Tab trap deliberately lets focus reach the tab bar (new, minor)

**File:** `src/frame/Sheet.vue:36`, `src/frame/focusTrap.ts:50-56`
**Issue:** `aria-modal="true"` tells assistive technology that content outside the sheet is inert. `AppFrame` keeps the `TabBar` operable beside the open sheet and the trap now leaves focus on it alone. A screen-reader user may be unable to reach or announce the tab bar, while a keyboard user can. The mismatch is a consequence of the 45-UI-SPEC decision to treat the sheet as modal, so this is not a regression.
**Fix:** Optional. Either put the TabBar inside the modal region or apply `inert` to the rest of the app (including a non-interactive tab bar) while the sheet is open. Alternatively, use `aria-modal="false"` on the Sheet if the tab bar must remain reachable. Confirm with the UI-SPEC owner.

---

_Reviewed: 2026-10-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
