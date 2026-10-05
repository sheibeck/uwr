---
phase: 45-foundation-frame-and-auth
fixed_at: 2026-10-05T00:00:00Z
review_path: .planning/phases/45-foundation-frame-and-auth/45-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 9
skipped: 1
status: partial
---

# Phase 45: Code Review Fix Report

**Fixed at:** 2026-10-05
**Source review:** .planning/phases/45-foundation-frame-and-auth/45-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 10 (CR-01, WR-01 to WR-09)
- Fixed: 9
- Skipped: 1 (CR-01, deferred by the orchestrator)

Verification: `pnpm vitest run src` gives 3604 passed and 2 failed. The 2 failures are the pre-existing `spacetimedb/src/helpers/measurement.results.test.ts` baseline. `pnpm exec vue-tsc -b` is clean. The design guards in `src/styles` stay green. All fixes were made in an isolated worktree and fast-forwarded onto `master`. Nothing was pushed or published.

Each fix ships tests. For the main behavior changes, I ran the new tests against the pre-fix source and they failed.

## Fixed Issues

### WR-01: Several paths hang forever on "Signing in…" with no failure state or timeout

**Files modified:** `src/session/deriveScreen.ts`, `src/session/deriveScreen.test.ts`, `src/session/useSession.ts`, `src/session/useSession.test.ts`
**Commit:** 397b8e84
**Status:** fixed: requires human verification (logic change)
**Applied fix:**
- `ScreenInput` gains `bindingFailed` and `signInTimedOut`.
  - Every "still waiting" outcome in the connected/reconnecting data branch now returns the existing `signInFailed` splash instead of `signingIn` when either flag is set.
  - A loaded frame or picker is never torn down by a late subscription error.
  - No new splash state or copy was added.
- `bindingFailed` is `myPlayer.failed || charactersBinding.failed`.
- `signInTimedOut` is a 15 s watchdog (`SIGNIN_TIMEOUT_MS`).
  - It runs only while the link is `connected` and the data rules still say "signing in".
  - It is judged on the data alone, so expiring does not restart the clock. Late data still wins and clears the failure.
  - It is cleared on logout and dispose.
- This covers the failed subscriptions, a deleted active character, and a connected session with no `player` row.
- Tests:
  - `deriveScreen` cases for each combination.
  - Session tests for a failed `my_player` subscription, a failed characters subscription, the 14999/15000 ms boundary, a deleted active character, late data winning, no timer during a reconnect, retry from the failure splash, and no timer left after dispose.

### WR-02: Splash can stay stuck on "Redirecting…", and `signIn()` has no re-entrancy guard

**Files modified:** `src/session/useSession.ts`, `src/session/useSession.test.ts`, `src/session/SplashScreen.vue`, `src/session/SplashScreen.test.ts`
**Commit:** 3d7b2886
**Applied fix:**
- `signIn()` returns early while `redirecting` is true.
- The session listens for `pageshow` and resets `redirecting` when `event.persisted` is true (a bfcache restore). The listener is removed in `dispose`.
- The splash window Enter handler ignores events whose target is a `<button>`, so the native click is the only activation, and it ignores `repeat` and `defaultPrevented` events.
- Tests:
  - A double `signIn` makes one login call.
  - A persisted `pageshow` resets the splash and allows a new sign-in.
  - Dispose removes the listener.
  - Enter on the focused button and a repeating Enter emit nothing.

### WR-03: `loginEmail` rejection unconditionally wipes the stored credentials

**Files modified:** `src/session/useSession.ts`, `src/session/useSession.test.ts`
**Commit:** ee5041ea
**Status:** fixed: requires human verification (logic change)
**Applied fix:**
- The `loginEmail` catch returns early (with a `console.warn`) when `controller.conn.value !== conn` or the status is not `connected`. The reconnect path then re-sends `loginEmail`.
- A rejection on the live, connected connection still calls `failSignIn`.
- I did not add SenderError discrimination, because the SDK's rejection type for reducer failures is not known from the code.
- Tests: a socket drop mid-call, and a late rejection from a replaced connection, both keep the credentials and do not disconnect.

### WR-04: `bindTable.detach` leaks the server subscription when it is still pending

**Files modified:** `src/net/bindTable.ts`, `src/net/bindTable.test.ts`
**Commit:** a9c85d41
**Applied fix:**
- When `onApplied` fires for a binding that was detached (`currentConn !== conn`), it now calls `handle.unsubscribe()` inside try/catch and returns, as the review suggested.
- Tests:
  - A pending handle detached by a re-attach is unsubscribed when it later applies, without touching `applied` or `rows`.
  - The same applies after `dispose`, and an unsubscribe error is swallowed.

### WR-05: Focus trap never traps when focus is outside the dialog

**Files modified:** `src/frame/Drawer.vue`, `src/frame/Sheet.vue`, `src/frame/Drawer.test.ts`, `src/frame/Sheet.test.ts`
**Commit:** 13f26c73
**Applied fix:**
- Tab is now handled in the existing document-level keydown listener, which calls `trapTabKey(event, root.value)`. The dialog-level `@keydown` was removed, so there is no double handling.
- Tests:
  - Tab with focus on `<body>` goes to the close button.
  - Shift+Tab goes to the last focusable element.
  - Tab is no longer trapped after unmount.

### WR-06: Auth callback stores tokens before parsing the email

**Files modified:** `src/auth/spacetimeAuth.ts`, `src/auth/spacetimeAuth.test.ts`
**Commit:** 1f39993b
**Applied fix:**
- `parseJwtEmail` is wrapped in try/catch and returns null on any failure.
- It decodes the `atob` bytes as UTF-8 with `TextDecoder`.
- The email and expiry are computed before the first write. Then each of the four keys is either written or removed, so a stale expiry, access token or email from an earlier session cannot survive next to a fresh token.
- If a write throws, all four keys are removed and the error is rethrown (all or none).
- A malformed payload now yields `email: null`. The existing "no stored email" path in `useSession` then fails sign-in.
- Tests:
  - A malformed payload and a non-JSON payload resolve with a null email.
  - Non-ASCII claims decode correctly.
  - Stale keys are removed.
  - A failed write leaves no keys.

### WR-07: IdP error redirects are ignored and leave PKCE state and error parameters behind

**Files modified:** `src/auth/spacetimeAuth.ts`, `src/auth/spacetimeAuth.test.ts`
**Commit:** af4796e9
**Applied fix:**
- With `?error=...` and no `code`, the callback now throws `error_description` or the error code, inside the same try/finally.
- The finally block now deletes `code`, `state`, `iss`, `session_state`, `error`, `error_description` and `error_uri`, and clears the PKCE values.
- A plain load with neither `code` nor `error` still returns null and touches nothing.
- Tests:
  - An error redirect throws, makes no token request, and cleans the URL and PKCE storage.
  - Without a description it falls back to the error code.
  - The success path also strips `iss` and `session_state`.

### WR-08: A superseded attempt's late `onConnect` clobbers `window.__db_conn` and `__my_identity`

**Files modified:** `src/net/connection.ts`, `src/net/connection.test.ts`, `src/net/connection.globals.test.ts` (new)
**Commit:** d8dbf90e
**Applied fix:**
- `ConnectionHandlers.onConnect` now returns a boolean: true when the controller accepted the connection, false when it was stale.
- `buildDbConnection` sets the window globals only when `onConnect` returned true.
- Tests:
  - The controller reports accepted or stale.
  - A new test file mocks `module_bindings`.
    - A stale late `onConnect` does not overwrite the live globals.
    - Its disconnect does not null them.

### WR-09: A single token failure against a reachable host wipes credentials

**Files modified:** `src/net/connection.ts`, `src/net/connection.test.ts`
**Commit:** ae62ccee
**Status:** fixed: requires human verification (logic change)
**Applied fix:**
- On a "Failed to verify token" error, the probe now only separates "network down" from "token bad".
  - Unreachable host: back off and retry, with nothing counted and nothing wiped.
  - Reachable host: count a consecutive token failure and retry with backoff. Reject and clear the session only at `MAX_TOKEN_FAILURES` (3).
- The non-token-failure reset of the count is unchanged.
- Tests were rewritten to match:
  - One failure against a reachable host does not wipe.
  - The third reachable failure rejects.
  - An unreachable host never rejects, even after many failures.
  - A network error resets the count.
  - Recovery from `rejected` needs three failures.

## Skipped Issues

### CR-01: Sign-in trusts a client-supplied email, so any authenticated identity can take over another account

**File:** `src/session/useSession.ts:254-259`, `spacetimedb/src/reducers/auth.ts:27-48`, `src/auth/spacetimeAuth.ts:132-133`
**Reason:** skipped: deferred (server change out of phase scope). The orchestrator tracks it in `.planning/todos/pending/2026-10-05-login-email-trusts-client-supplied-email.md`. `spacetimedb/` was not touched and the `loginEmail` call signature is unchanged.
**Original issue:** The client sends `loginEmail({ email })` from `localStorage`, and the server never checks it against the verified JWT claims of `ctx.sender`, so any authenticated identity can claim another account's email.

---

_Fixed: 2026-10-05_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
