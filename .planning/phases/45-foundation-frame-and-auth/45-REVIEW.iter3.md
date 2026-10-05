---
phase: 45-foundation-frame-and-auth
reviewed: 2026-10-05T00:00:00Z
depth: standard
iteration: 2
files_reviewed: 8
files_reviewed_list:
  - src/auth/spacetimeAuth.ts
  - src/net/bindTable.ts
  - src/net/connection.ts
  - src/session/deriveScreen.ts
  - src/session/useSession.ts
  - src/session/SplashScreen.vue
  - src/frame/Drawer.vue
  - src/frame/Sheet.vue
findings:
  critical: 1
  warning: 1
  info: 8
  total: 10
status: issues_found
---

# Phase 45: Code Review Report (iteration 2 re-review)

**Reviewed:** 2026-10-05
**Depth:** standard
**Files Reviewed:** 8 source files (plus their tests, read for reliability)
**Status:** issues_found

## Summary

Scope: `git diff 5ec8952c..HEAD -- src`. I read every changed source file in full and the new tests.

Verification of WR-01 to WR-09:

| ID | Verdict |
|----|---------|
| WR-01 | Fixed. `bindingFailed` and the 15 s watchdog end every "still waiting" path in `signInFailed`. |
| WR-02 | Fixed. Re-entry guard, `pageshow` reset (removed on dispose) and the Enter-on-button skip are all present. |
| WR-03 | Fixed as scoped. The guard is correct but largely defensive, see IN-05. |
| WR-04 | Fixed. A pending, detached subscription is unsubscribed when it applies. |
| WR-05 | Fixed as literally specified, but it introduced a regression: **WR-10 (new)**. |
| WR-06 | Fixed. The token payload is parsed safely, decoded as UTF-8, and storage is all-or-nothing. |
| WR-07 | Fixed. IdP `?error=` redirects throw and every callback parameter is stripped in the `finally`. |
| WR-08 | Fixed. The globals are published only for an accepted connection, and the stale disconnect cannot null them. |
| WR-09 | Fixed. The state machine is correct, with a UX wart (IN-07). |

State machine and lifecycle checks:
- **Connection controller.** `record !== current || intentional` guards the probe continuation. `tokenFailures` is reset on a non-token failure and on a successful connect. `reject()` clears the timer. A disconnect during the probe aborts the continuation. I found no new bug in the retry/token-failure machine.
- **Sign-in watchdog.**
  - `awaitingSessionData` is judged on data alone, with `bindingFailed` and `signInTimedOut` forced false, so expiry does not retrigger the watch.
  - The timer is cleared on a state change, on logout and on dispose. `stopScope()` runs before `clearSignInTimer()`, so the watch cannot re-arm it.
  - It does not run while `reconnecting`. Late data beats an expired watchdog.
- **Tab trap.** The Tab branch returns before the Escape check, so Esc handling is unchanged. The listener is removed on unmount. The Drawer and the Sheet are mutually exclusive (`isDesktop`), so two document listeners never fight. The new tests are sound, but the trap scope itself is wrong (WR-10).

One new Warning. CR-01 is carried forward as deferred and does not count against this verdict. The Info items are IN-01 to IN-04 carried forward (IN-05 of the previous review is resolved), plus four new low-severity items.

## Structural Findings (fallow)

None provided.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Sign-in trusts a client-supplied email, so any authenticated identity can take over another account

**Status: deferred (tracked todo, out of phase scope).** The todo is `.planning/todos/pending/2026-10-05-login-email-trusts-client-supplied-email.md`. It is server code (`spacetimedb/src/reducers/auth.ts`); Phase 45 has no server change. This does not count against the iteration 2 verdict. It is unchanged from the previous review.

**File:** `src/session/useSession.ts:256-261` (client), `spacetimedb/src/reducers/auth.ts:27-48` (server), `src/auth/spacetimeAuth.ts` (email stored from the id token)
**Issue:** The client sends `loginEmail({ email })` from `localStorage`. The server only checks for `@` and never compares the email with the verified JWT claims of `ctx.sender`. This breaks the rule "`ctx.sender` is the authenticated principal — never trust identity args".
**Fix:** Derive the email on the server from the verified token claims, drop the argument, regenerate the bindings, and stop sending the email from the client.

## Warnings

### WR-10: Document-level Tab trap blocks keyboard access to the navigation chrome that is meant to stay usable beside the dialog

**File:** `src/frame/Drawer.vue:13-23`, `src/frame/Sheet.vue:13-23`, `src/frame/focusTrap.ts:30-34`
**Issue:** This was introduced by the WR-05 fix.
- `trapTabKey` now runs for every Tab on the page while a Drawer or Sheet is mounted. If `document.activeElement` is not inside the dialog, it is pulled back to the first or last focusable element.
- `AppFrame.vue` is built so the navigation sits outside the dialog and stays operable while it is open:
  - Mobile: the `TabBar` (it takes a `sheet-open` prop) switches screens by swapping the Sheet.
  - Desktop: the `HeaderBar` buttons call `screens.toggle`, and the `Drawer` only covers `inset: 0 0 0 252px`, leaving the rail and header visible.
- A keyboard user who activates a tab or header button (focus on that control, outside the dialog) and presses Tab is thrown back into the dialog. The user cannot Tab to the next tab or header button. The only route out is Esc followed by re-navigation.
- Before this fix, focus on the chrome moved freely. The fix over-corrected from "the trap leaks when focus is on `<body>`" to "the trap owns all Tab presses on the page".

**Fix:** Pull focus back only when focus has actually been lost (on `<body>` or `null`). Leave focus that is deliberately on other app chrome alone:
```ts
// Drawer.vue / Sheet.vue
if (event.key === 'Tab') {
  const active = document.activeElement;
  const lost = active === null || active === document.body;
  const inside = !!root.value && active instanceof Node && root.value.contains(active);
  if (root.value && (lost || inside)) trapTabKey(event, root.value);
  return;
}
```
This keeps the WR-05 cases, so the existing body-focus tests still pass. Add a test that Tab from a button outside the dialog is not prevented. Separately, the desktop `Drawer` is a non-modal side panel, so `aria-modal="true"` there is inaccurate. Consider `aria-modal="false"` on the Drawer, or hiding the rest of the app with `inert` if it is meant to be modal.

## Info

### IN-01: A failed callback masks a valid existing session (carried forward, slightly more reachable)

**File:** `src/session/useSession.ts:169`, `src/session/deriveScreen.ts:45`
**Issue:** `authFailed` starts true when `callbackError` is set, and `deriveScreen` ranks it highest. `App.vue` still calls `session.start()`, so the socket connects with an older valid token while the UI shows "Sign-in failed". WR-07 now routes an IdP "Deny" (`?error=access_denied`) into this path, so a user with an old session who cancels a re-login hits it more often.
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

### IN-05: loginEmail rejection handling can now discriminate error types (new, minor)

**File:** `src/session/useSession.ts:261-271`
**Issue:**
- The WR-03 fix guards on connection identity and status, and its notes say the SDK's rejection type is unknown.
- In the installed SDK (`node_modules/spacetimedb/src/sdk/db_connection_impl.ts:1196-1230`), the reducer promise rejects only with `SenderError` (the server refused) or `InternalError`. A socket drop never rejects it: the callback map just keeps the pending call.
- So the new guard is mostly defensive, and the real distinction is still not made. An `InternalError` (a transient server fault) on a live connection still wipes the stored credentials via `failSignIn`.

**Fix:** Wipe the session only for a `SenderError`. For anything else, log and let the watchdog or a reconnect handle it:
```ts
import { SenderError } from 'spacetimedb';
// in the catch, after the stale/status guard:
if (!(error instanceof SenderError)) { console.warn('[session] loginEmail failed', error); return; }
failSignIn();
```

### IN-06: `bindTable.failed` is sticky across a re-attach (new, minor)

**File:** `src/net/bindTable.ts:93-131`
**Issue:** `failed` is cleared only by an applied subscription or `dispose`, not by `attach()` on a new connection. A subscription error on connection 1 keeps `bindingFailed` true while connection 2's subscription is still pending. For a session still waiting for data, the user sees "Sign-in failed" until the new subscription applies, instead of "Signing in…". Loaded frames are not affected.
**Fix:** Reset `failed.value = false` in `attach()` right after `detach()`, when a non-null conn is attached.

### IN-07: Token-failure retries show the "Can't reach the server" splash against a reachable host (new, minor)

**File:** `src/net/connection.ts:96, 140-142`
**Issue:** After WR-09, the 1st and 2nd consecutive token failure against a reachable host call `scheduleRetry()`. That sets `status = hasConnected ? 'reconnecting' : 'unreachable'`, so the first-connect user sees "Can't reach the server. Retrying…" for roughly 3 s before the session is rejected. The copy is wrong, but the behavior is correct.
**Fix:** Optional. Keep `connecting` during token-failure retries, for example with a `scheduleRetry(status)` parameter. Otherwise accept it.

### IN-08: Tab after a pointer click inside the dialog body jumps to the close button (new, minor)

**File:** `src/frame/focusTrap.ts:30-34`
**Issue:**
- Clicking non-focusable dialog text leaves `document.activeElement` on `<body>`, so `inside` is false. The new document-level handler treats this as lost focus and focuses the first element, the close button.
- Before WR-05, native Tab continued from the click position.
- The WR-10 fix keeps this behavior (`lost` includes body).

**Fix:** Optionally skip the pull-back when the last pointer interaction was inside the dialog, or make the dialog body `tabindex="-1"` so a click inside leaves focus in the dialog.

---

_Reviewed: 2026-10-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
