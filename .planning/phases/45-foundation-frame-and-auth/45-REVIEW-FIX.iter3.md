---
phase: 45-foundation-frame-and-auth
fixed_at: 2026-10-05T00:00:00Z
review_path: .planning/phases/45-foundation-frame-and-auth/45-REVIEW.md
iteration: 2
findings_in_scope: 3
fixed: 2
skipped: 1
status: partial
---

# Phase 45: Code Review Fix Report

**Fixed at:** 2026-10-05
**Source review:** .planning/phases/45-foundation-frame-and-auth/45-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 3 (CR-01, WR-10, plus IN-05 added by the orchestrator)
- Fixed: 2 (WR-10, IN-05)
- Skipped: 1 (CR-01, deferred by the orchestrator to a tracked todo; no `spacetimedb/` change)

Verification: `pnpm vitest run src` gives 3611 passed and 2 failed. The 2 failures are the pre-existing `spacetimedb/src/helpers/measurement.results.test.ts` baseline. `pnpm exec vue-tsc -b` is clean. The `src/styles` design guards stay green. The run rewrote three snapshot files under `spacetimedb/`; they were discarded. All fixes were made in an isolated worktree and fast-forwarded onto `master`. Nothing was pushed or published.

## Fixed Issues

### WR-10: Document-level Tab trap blocks keyboard access to the navigation chrome that is meant to stay usable beside the dialog

**Files modified:** `src/frame/focusTrap.ts`, `src/frame/Drawer.vue`, `src/frame/Sheet.vue`, `src/frame/Drawer.test.ts`, `src/frame/Sheet.test.ts`, `.planning/phases/45-foundation-frame-and-auth/45-UI-SPEC.md`
**Commit:** 0d944d2b
**Status:** fixed: requires human verification (logic change)
**Applied fix:**
- New `trapTabKeyAtDocument(event, container)` in `focusTrap.ts`. It calls the existing `trapTabKey` only when focus is lost (`document.activeElement` is `null` or `<body>`) or is already inside the dialog. Focus on a header, rail or tab-bar control is left alone, so Tab moves normally between that chrome. Drawer and Sheet both use it for their document-level keydown listener, replacing the duplicated logic. The Escape branch is unchanged.
- The desktop `Drawer` is now `aria-modal="false"` (it is a non-modal side panel; the rail and header stay visible and operable). `role="dialog"` and `aria-labelledby` are kept.
- The mobile `Sheet` keeps `aria-modal="true"`, matching its full-height overlay behavior in 45-UI-SPEC.md. I added a one-line comment recording why. Note for the reviewer: the mobile `TabBar` stays operable beside the sheet, so `aria-modal="true"` there is a deliberate spec choice. Revisit it if screen-reader users report the tab bar as unreachable.
- 45-UI-SPEC.md (focus and ARIA paragraph) updated to describe the lost-or-inside trap scope and the per-surface `aria-modal` values.
- Tests (Drawer and Sheet):
  - Tab and Shift+Tab from a header or tab-bar control outside the dialog are not prevented and focus does not move.
  - Tab with focus on the body is pulled into the dialog (existing WR-05 cases still pass).
  - Tab on the last element wraps to the first, and Shift+Tab on the first wraps to the last.
  - The Drawer test now asserts `aria-modal="false"`.
- I ran the new tests against the pre-fix source: the three tests for the outside-chrome Tab and the `aria-modal` value failed there.

### IN-05: loginEmail rejection handling can now discriminate error types

**Files modified:** `src/session/useSession.ts`, `src/session/useSession.test.ts`
**Commit:** 0164b8f8
**Status:** fixed: requires human verification (logic change)
**Applied fix:**
- The installed SDK (`spacetimedb` 2.x) exports `SenderError` and `InternalError` from the root package (`dist/index.d.ts` re-exports `lib/errors`), and `db_connection_impl.ts` rejects a reducer call with `SenderError` (server refusal) or `InternalError`. No API was invented.
- In the `loginEmail` rejection handler, after the existing stale-connection and status guard, `failSignIn()` now runs only for `error instanceof SenderError`. Any other rejection logs a `console.warn` and returns, so stored credentials are kept and recovery is left to the sign-in watchdog or a reconnect.
- Tests: the existing "fails sign-in when loginEmail rejects" test now rejects with a `SenderError`. New tests show that an `InternalError` and a plain `Error` on a live connection keep the credentials, do not disconnect and do not show the failure splash.

## Skipped Issues

### CR-01: Sign-in trusts a client-supplied email, so any authenticated identity can take over another account

**File:** `src/session/useSession.ts:256-261` (client), `spacetimedb/src/reducers/auth.ts:27-48` (server)
**Reason:** Deferred by the orchestrator. It needs a server change (`spacetimedb/`), which is out of Phase 45 scope. Tracked in `.planning/todos/pending/2026-10-05-login-email-trusts-client-supplied-email.md`.
**Original issue:** The client sends `loginEmail({ email })` from `localStorage` and the server never compares it with the verified JWT claims of `ctx.sender`.

## Not In Scope This Iteration

IN-01 to IN-04 (carried forward), IN-06 (`bindTable.failed` sticky across re-attach), IN-07 (token-failure retry copy) and IN-08 (Tab after a pointer click jumps to the close button) are Info findings below the `critical_warning` fix scope and were not touched. IN-08's behavior is unchanged by WR-10 (body focus still counts as lost).

## Iteration 1 History

Iteration 1 (review of 2026-10-05, 45-REVIEW.iter2.md and 45-REVIEW-FIX.iter2.md hold the archived copies) fixed 9 of 10 in-scope findings and skipped CR-01 (deferred, same reason as above). All commits are on `master`:

| Finding | Commit | Summary |
|---------|--------|---------|
| WR-01 | 397b8e84 | End a stuck "Signing in" splash on a failed subscription or after a 15 s watchdog |
| WR-02 | 3d7b2886 | Guard `signIn` re-entry, reset `redirecting` on bfcache restore, skip Enter on the button |
| WR-03 | ee5041ea | Keep stored credentials when `loginEmail` is interrupted by a reconnect |
| WR-04 | a9c85d41 | Unsubscribe a pending `bindTable` subscription when it applies after detach |
| WR-05 | 13f26c73 | Trap Tab at the document so focus outside a dialog is pulled back in (over-corrected; see WR-10) |
| WR-06 | 1f39993b | Parse the id token safely and store the session all-or-nothing |
| WR-07 | af4796e9 | Surface IdP error redirects and strip every callback parameter |
| WR-08 | d8dbf90e | Publish window debug globals only for an accepted connection |
| WR-09 | ae62ccee | Reject a token only after consecutive failures against a reachable host |

The iteration 2 re-review confirmed WR-01 to WR-09 as fixed and found WR-10 (regression from the WR-05 fix), addressed above.

---

_Fixed: 2026-10-05_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
