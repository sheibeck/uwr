---
created: 2026-10-05T00:00:00.000Z
title: login_email trusts a client-supplied email
area: backend
priority: high
files:
  - spacetimedb/src/reducers/auth.ts:27-48
---

## Problem

`login_email` (`spacetimedb/src/reducers/auth.ts:27`) takes `email` as a reducer argument and links the caller's `player` row to the `user` row with that email. It never checks the email against the identity's verified SpacetimeAuth token. Any connected identity can call `login_email({ email: '<someone else>' })` and act as that user: their characters, inventory and progress.

The client calls it with the email it parsed from its own id token, but the server cannot rely on that. Found during Phase 45 research (2026-10-05). It is out of scope for Phase 45, which is a UX pass.

## Solution

- Derive the email server-side from the caller's verified JWT claims in the reducer context. Use only the accessor the SpacetimeDB 2.10 TypeScript docs define; do not invent an API. Ignore or remove the argument.
- If no verified email claim is present, throw `SenderError`.
- Keep the reducer signature change additive if possible, and regenerate bindings if the signature changes.
- Tests with `createMockCtx`: a mismatched email is rejected, a matching claim links the user, and a missing claim is rejected.
- Publish locally only. This is a code-only change, so no `--clear-database`.
