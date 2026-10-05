---
phase: 45-foundation-frame-and-auth
reviewed: 2026-10-05T00:00:00Z
depth: standard
files_reviewed: 52
files_reviewed_list:
  - index.html
  - vite.config.ts
  - package.json
  - src/main.ts
  - src/App.vue
  - src/auth/spacetimeAuth.ts
  - src/connectionLogging.ts
  - src/net/backoff.ts
  - src/net/bindTable.ts
  - src/net/connection.ts
  - src/session/useSession.ts
  - src/session/deriveScreen.ts
  - src/session/frameView.ts
  - src/session/versionCheck.ts
  - src/session/SplashScreen.vue
  - src/session/CharacterPicker.vue
  - src/session/NoCharactersNote.vue
  - src/session/PreFrameHeader.vue
  - src/frame/AppFrame.vue
  - src/frame/HeaderBar.vue
  - src/frame/AccountMenu.vue
  - src/frame/NoticeBars.vue
  - src/frame/TabBar.vue
  - src/frame/tabs.ts
  - src/frame/LocationRow.vue
  - src/frame/VitalsRail.vue
  - src/frame/VitalsStrip.vue
  - src/frame/vitals.ts
  - src/frame/ContextRail.vue
  - src/frame/FeedShell.vue
  - src/frame/Drawer.vue
  - src/frame/Sheet.vue
  - src/frame/MoreSheet.vue
  - src/frame/focusTrap.ts
  - src/frame/useBreakpoint.ts
  - src/frame/useScreens.ts
  - src/screens/screens.ts
  - src/screens/EmptyState.vue
  - src/screens/CraftingScreen.vue
  - src/screens/InventoryScreen.vue
  - src/screens/MapScreen.vue
  - src/screens/SocialScreen.vue
  - src/screens/StatsScreen.vue
  - src/screens/VendorScreen.vue
  - src/screens/WorldEventsScreen.vue
  - src/styles/frame.css
  - src/styles/tokens.client.css
  - src/styles/cssContract.ts
  - src/auth/spacetimeAuth.test.ts
  - src/net/connection.test.ts
  - src/session/useSession.test.ts
  - src/styles/colors.guard.test.ts
findings:
  critical: 1
  warning: 9
  info: 5
  total: 15
status: issues_found
---

# Phase 45: Code Review Report

**Reviewed:** 2026-10-05
**Depth:** standard
**Status:** issues_found

> Saved by the orchestrator. The gsd-code-reviewer agent returned this report inline because its run could not write report files. The content is the reviewer's, unedited except for the orchestrator note on CR-01.

## Summary

The client is mostly well built:
- Rendering is text-only, with no `v-html`.
- The PKCE state and verifier are checked and cleared in `finally`.
- Reducer calls use object syntax.
- Bigint and Timestamp handling is correct.
- The connection controller guards stale attempts with `record !== current` and a `handled` flag, so a failure that fires both `onConnectError` and `onDisconnect` schedules only one retry.

The main problems:
- **Security:** one defect in the sign-in contract, which lives in server code the client depends on (CR-01).
- **Stuck screens:** several paths can leave the UI on "Signing in…" or "Redirecting…" (WR-01, WR-02, WR-03).
- **Subscriptions:** `bindTable` leaks a pending subscription (WR-04).
- **Focus:** the focus trap does not trap when focus is outside the dialog (WR-05).
- **Auth callback:** robustness gaps (WR-06, WR-07).

## Structural Findings (fallow)

None provided.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Sign-in trusts a client-supplied email, so any authenticated identity can take over another account

> **ORCHESTRATOR NOTE: DEFERRED, do not fix in Phase 45.** This is server code (`spacetimedb/src/reducers/auth.ts`). Phase 45 is a UX phase with no server change and no publish. It is tracked as a high-priority todo: `.planning/todos/pending/2026-10-05-login-email-trusts-client-supplied-email.md`. The code fixer must not apply it.

**File:** `src/session/useSession.ts:254-259` (client), `spacetimedb/src/reducers/auth.ts:27-48` (server), `src/auth/spacetimeAuth.ts:132-133`

**Issue:**
- The client reads the email from `localStorage` (`getStoredEmail`) and sends it as `loginEmail({ email })`.
- The server's `login_email` only checks for `@`. It then looks up or creates the user by that string and sets `player.userId`.
- It never compares the email against the verified JWT claims of `ctx.sender`.
- Any holder of a valid SpacetimeAuth identity can claim another email and get that user's characters.
- This breaks the project rule "`ctx.sender` is the authenticated principal — never trust identity args".

**Fix:** Derive the email on the server from the verified token claims (the SpacetimeDB 2.10 reducer-context JWT accessor; check the docs). Ignore or drop the argument, regenerate the bindings, and stop sending the email from the client.

## Warnings

### WR-01: Several paths hang forever on "Signing in…" with no failure state or timeout

**File:** `src/session/deriveScreen.ts:51-55`, `src/session/useSession.ts:264-277`

**Issue:**
- `TableBinding.failed` is set by `bindTable` when a subscription errors, but nothing reads it.
- A failed `my_player` subscription leaves `playerLoaded` false, so the splash stays on "Signing in…".
- A failed characters subscription leaves `charactersApplied` false, with the same result.
- `activeCharacterId !== null` while `activeCharacterLoaded` is false returns `signingIn` with no escape, for example when the character was deleted.
- A connected session with no `player` row never calls `loginEmail` and never errors.

**Fix:**
- Add `bindingFailed` (`myPlayer.failed.value || charactersBinding.value?.failed.value`) to `ScreenInput`.
- When it is true, return `splash('signInFailed')` or a new `connectionProblem` state with a retry.
- Add a signing-in watchdog of about 15 s that sets `authFailed` and offers retry or logout.

### WR-02: Splash can stay stuck on "Redirecting…", and `signIn()` has no re-entrancy guard

**File:** `src/session/useSession.ts:334-343`, `src/session/SplashScreen.vue:29-37`

**Issue:**
- `signIn()` sets `redirecting = true` and only resets it if `beginSpacetimeAuthLogin` rejects.
- Pressing Back from the IdP page triggers a bfcache restore, which keeps `redirecting` true and the button disabled.
- `signIn()` does not check `redirecting`. The window-level Enter handler and the button's own click can each call `beginSpacetimeAuthLogin`.
- The second call overwrites the verifier and state, so the callback fails with "Invalid auth state".

**Fix:**
- Add `if (redirecting.value) return;` at the top of `signIn`.
- On `pageshow` with `e.persisted`, reset `redirecting`. Register the listener in the session and remove it in `dispose`.
- In `onKeydown`, skip the handler when `e.target` is the focused button, or call `preventDefault`.

### WR-03: `loginEmail` rejection unconditionally wipes the stored credentials

**File:** `src/session/useSession.ts:237-242, 259`

**Issue:**
- `conn.reducers.loginEmail(...).catch(failSignIn)` clears the auth session on any rejection.
- That includes a socket drop mid-call that the controller would have recovered from.
- It also includes a late rejection from the old `conn` after a reconnect, which kills the healthy new connection.

**Fix:** In the catch, return early when `controller.conn.value !== conn || controller.status.value !== 'connected'`. Better, wipe the session only for a server-side validation error (SenderError) and leave everything else to the reconnect path, which sends `loginEmail` again.

### WR-04: `bindTable.detach` leaks the server subscription when it is still pending

**File:** `src/net/bindTable.ts:80-87`

**Issue:**
- `detach` only unsubscribes when `handle.isActive()`.
- A subscription that has not applied yet is never unsubscribed.
- When it later applies, the callback exits early because `currentConn !== conn`, so nothing cleans it up.
- This affects the keyed bindings: `character` by `userId` and `pendingSkill` by `activeCharacterId`.

**Fix:** In `onApplied`, when the binding has been detached (`currentConn !== conn`), call `handle.unsubscribe()` inside try/catch and return.

### WR-05: Focus trap never traps when focus is outside the dialog

**File:** `src/frame/Drawer.vue:33`, `src/frame/Sheet.vue:33`, `src/frame/focusTrap.ts:30-34`

**Issue:**
- `@keydown` is on the dialog `<section>`, so it only sees events whose target is inside the dialog.
- That makes the `!inside` branch of `trapTabKey` dead code.
- With focus on `<body>`, Tab escapes the `aria-modal` dialog.

**Fix:** Handle Tab in the `document` keydown listener the components already register, and call `trapTabKey(event, root.value)` there.

### WR-06: Auth callback stores tokens before parsing the email

**File:** `src/auth/spacetimeAuth.ts:80-87, 127-133`

**Issue:**
- The id token is persisted first, then `parseJwtEmail` runs `atob` and `JSON.parse` unguarded.
- A malformed payload therefore throws after storage, so the splash says "Sign-in failed" while a valid token is in storage.
- `atob` decodes as Latin-1, which mangles non-ASCII claims.
- When `expires_in` is absent, an older `spacetimeauth_expires_at` survives, so a fresh token can be treated as expired.

**Fix:**
- Wrap `parseJwtEmail` in try/catch and return null on failure.
- Decode with TextDecoder over the `atob` bytes.
- Store all keys or none.
- Remove `expiresAt` when `expiresIn` is falsy.

### WR-07: IdP error redirects are ignored and leave PKCE state and error parameters behind

**File:** `src/auth/spacetimeAuth.ts:91-93`

**Issue:**
- With no `code`, the callback returns null.
- `?error=access_denied&state=…` therefore produces no error message.
- The URL keeps `error`, `error_description` and `state`, and the one-shot verifier and state stay in sessionStorage.
- `iss` and `session_state` also stay in the URL.

**Fix:** Throw on `url.searchParams.get('error')`, clean up in the same `finally`, and delete `iss`, `session_state` and `error*` from the URL.

### WR-08: A superseded attempt's late `onConnect` clobbers `window.__db_conn` and `__my_identity`

**File:** `src/net/connection.ts:265-276`

**Issue:**
- `buildDbConnection`'s `onConnect` sets the globals before the controller decides whether the attempt is stale.
- The stale connection is then disconnected, and its `onDisconnect` nulls the globals even when a newer connection is active.

**Fix:** Set the globals only after the controller accepts the connection, for example by having `handlers.onConnect(conn)` return whether the attempt was accepted.

### WR-09: A single token failure against a reachable host wipes credentials

**File:** `src/net/connection.ts:119-139`

**Issue:**
- On the first "Failed to verify token", a successful `/v1/ping` immediately rejects and clears the session. The ping only proves the host is up.
- `MAX_TOKEN_FAILURES` only matters when the probe fails, and a third failure against an unreachable host then rejects. That is the opposite of the apparent intent.

**Fix:** Count consecutive token failures and reject only at `tokenFailures >= MAX_TOKEN_FAILURES`, with backoff retries before that. Use the probe only to tell "network down" from "token bad", and don't reject on the third failure while unreachable.

## Info

### IN-01: A failed callback masks a valid existing session

**File:** `src/session/useSession.ts:167`, `src/session/deriveScreen.ts:44`

**Issue:** `authFailed` starts true when `callbackError` is set, and `deriveScreen` ranks it highest. `App.vue` still calls `session.start()`, so the socket connects with an older valid token while the UI shows "Sign-in failed".

**Fix:** Skip `controller.connect()` while `authFailed` is true, or clear the stored session when the callback fails.

### IN-02: Production build version falls back to `Date.now()`

**File:** `vite.config.ts:5`

**Issue:** A release build without `BUILD_VERSION` never equals the admin-set `app_version`, so the reload prompt is permanent.

**Fix:** Fail the build when `BUILD_VERSION` is unset in production mode, or document that it is mandatory.

### IN-03: Choosing the Story tab steals focus from the tab that was clicked

**File:** `src/frame/AppFrame.vue:45-52`, `src/frame/useScreens.ts:41-48`

**Issue:** `onSelectTab('story')` calls `screens.close()`, which refocuses the previous opener.

**Fix:** Give `close()` a `restoreFocus` option, or pass the Story tab element as the new opener.

### IN-04: Smaller defects and stale text

- `src/frame/AccountMenu.vue:44-46`:
  - ArrowUp with `index === -1` lands on the second-to-last item.
  - There is no Home/End or Tab handling.
- `src/frame/focusTrap.ts:1-14`:
  - `[href]` is not excluded when disabled.
  - Elements hidden by `display:none` or `inert` count as focusable.
- `src/connectionLogging.ts:3-10`: the comment says TS 5.6, but the project uses `typescript ~6.0.3`. Re-verify that the TS2589 workaround is still needed.
- `src/frame/HeaderBar.vue:14`: `AppFrame` never passes the `disabled` prop.

### IN-05: Test gaps

None of the following is exercised by a test:
- a failed `my_player` or `character` subscription (WR-01)
- a `bindTable` detach while pending (WR-04)
- `parseJwtEmail` on a malformed token (WR-06)
- an IdP `?error=` redirect (WR-07)
- a `pageshow` restore or a double sign-in (WR-02)
- Tab with focus outside the dialog (WR-05)

The existing connection, auth and session tests do test real behavior.

---

_Reviewed: 2026-10-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
