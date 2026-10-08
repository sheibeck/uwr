---
phase: quick-261008-d2k
plan: 01
subsystem: server-presence
tags: [party, presence, logout, link-dead, spacetimedb]
requires: [51.1 online flag (helpers/online.ts), event_group + my_group_events]
provides: [partyPresenceLine, releaseKind, sessionOnReconnect, announcePartyPresence]
affects: [spacetimedb/src/reducers/auth.ts, spacetimedb/src/reducers/characters.ts, spacetimedb/src/index.ts]
key-files:
  created:
    - spacetimedb/src/helpers/party_presence.ts
    - spacetimedb/src/helpers/party_presence.test.ts
    - spacetimedb/src/reducers/party_presence.integration.test.ts
  modified:
    - spacetimedb/src/reducers/auth.ts
    - spacetimedb/src/reducers/characters.ts
    - spacetimedb/src/index.ts
decisions:
  - "player.sessionStartedAt is the Logout marker (cleared by logout, restored by clientConnected); no schema change"
  - "Every announcement is gated on the boolean syncCharacterOnline returns (a real flag flip)"
metrics:
  tasks: 2
  files: 6
completed: 2026-10-08
status: complete
---

# Quick 261008-d2k: Party hears when a member logs out or goes link-dead

One kind 'group' line per real presence transition of a grouped character: "{name} has logged out.", "{name} has gone link-dead." and "{name} is back.". Server only; published to the local database as a code-only update.

## Commits

- 7f84498e test: failing party presence helper tests (RED)
- 7298077d feat: party presence helper (GREEN)
- da7a3846 test: failing real-handler tests (RED)
- 766b1f69 feat: wiring in auth.ts, characters.ts, index.ts (GREEN)

## What changed

- `helpers/party_presence.ts` (new): `partyPresenceLine`, `releaseKind`, `sessionOnReconnect`, `announcePartyPresence` (one `event_group` row for the character's group via `appendGroupEvent`; false for no id, no character, no group). `events.ts` and `online.ts` untouched.
- `reducers/auth.ts`: `logout` clears `player.sessionStartedAt` at once. `disconnect_logout` reads `releaseKind(player)` before its update, then announces only if `syncCharacterOnline(ctx, releasedCharacterId)` returned true. Module guard, lastSeenAt early return, friend lines and pet dismissal unchanged.
- `reducers/characters.ts`: `set_active_character` announces 'logged_out' for the character left behind and 'back' for the selected one, each only on a real flip. Syncs remain the last character-row writes.
- `index.ts` clientConnected: the existing-player update sets `sessionStartedAt: sessionOnReconnect(existing, ctx.timestamp)`; 'back' is announced when the re-sync flips the flag.

How the Logout button maps: logout tick (time L) is a no-op because clientDisconnected stamps a later lastSeenAt; the clientDisconnected tick releases. The label comes from the missing session (Logout) versus the standing one (drop).

## Judgement calls (flagged for the owner)

- The logout line lands when the character is actually released, about 30 s after the click (the enforced logout window). An earlier line could announce a logout that a quick sign-in cancels.
- "is back" is included, at set_active_character and the clientConnected re-sync (both already return the flip boolean).
- The switch-away line ("{name} has logged out." for the character left behind when switching characters) is included.
- `sessionStartedAt` is the marker rather than a new table, to avoid a schema change in a file the 51.3 plans edit.

## Tests

- New: party_presence.test.ts (9 tests), party_presence.integration.test.ts (15 tests: owner's case, logout without disconnect, link-dead, back inside the window, logout then sign-in then drop, solo, second session, second tick, camp, is-back by select and re-sync, no-back cases, switch-away).
- Plan verify run (12 files): 300 passed.
- Full root `npx vitest run --maxWorkers=1`: 11275 passed, 2 failed; the 3 failing files are exactly the baseline (call_log_report.test.mjs, proof_rules.test.mjs, measurement.results.test.ts).

## Publish (local only)

- Key check `true | 108` before: OK.
- `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null`: exit 0, empty Database Migration Plan, "Updated database with name: uwr". No clear, no maincloud, no push.
- Key check after: OK. No panic or error in the recent logs.
- Bindings not regenerated (no table, column or reducer signature change); `git status` clean for src/module_bindings.

## Deviations from Plan

None - plan executed as written. The shared `index.ts` showed only my own hunk in `git diff --stat` before and after editing.

## Known Stubs

None.

## Threat Flags

None.

## Deferred

The visual check of the party feed is deferred to the end-of-milestone UAT (owner rule).

## Self-Check: PASSED

Files created exist; commits 7f84498e, 7298077d, da7a3846, 766b1f69 are in `git log`.
