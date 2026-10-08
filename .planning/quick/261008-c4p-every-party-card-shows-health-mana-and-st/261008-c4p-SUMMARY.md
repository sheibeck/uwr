---
phase: quick-261008-c4p
plan: 01
subsystem: client-party-ui
tags: [party, vitals, memberBars, accessibility, client-only]
requires: []
provides:
  - memberBars() in src/rails/party.ts, the single rule for a party card's bars
affects:
  - src/social/MemberCard.vue
  - src/frame/VitalsStrip.vue
  - src/social/CombatMemberCard.vue
tech-stack:
  added: []
  patterns: [one shared bar rule per party card, owner quote cited in code and UI-SPEC]
key-files:
  created: []
  modified:
    - src/rails/party.ts
    - src/rails/party.test.ts
    - src/social/MemberCard.vue
    - src/social/MemberCard.test.ts
    - src/rails/PartyBlock.test.ts
    - src/social/PartySheet.test.ts
    - src/frame/VitalsStrip.vue
    - src/frame/VitalsStrip.test.ts
    - src/frame/AppFrame.combat.test.ts
    - src/social/CombatMemberCard.vue
    - src/social/CombatMemberCard.test.ts
    - .planning/phases/51.1-party-and-social/51.1-UI-SPEC.md
decisions:
  - "memberBars() reads resourceKind === 'mana' (set by partyMembers only for maxMana > 0); nothing re-derives the mana rule from raw rows"
  - "Your own sheet self card stays bar-less; an unknown member's rail tracks stay aria-hidden with no title"
metrics:
  tasks: 3
  completed: 2026-10-08
status: complete
---

# Phase quick-261008-c4p Plan 01: Every party card shows health, mana and stamina Summary

Every party member card on every surface now draws a health bar, then a mana bar only when the member has mana (`maxMana > 0`), then a stamina bar, from one tested helper, `memberBars()` in `src/rails/party.ts`.

Owner, 2026-10-08: "the party ux should show each party members mana and stamina. (unless they don't have mana at all) Everyone has stamina, so every group member should see every other party members resources - health, mana, stamina."

## What changed

- `src/rails/party.ts`: new `memberBars(member)` returning `MemberBar[]` (`kind`, `value`, `max`, `width`, `title`, `phrase`) in the order health, mana (only when `resourceKind === 'mana'`), stamina. Types `MemberBar` and `MemberBarKind` are exported (types only, so the runtime export list gains just `memberBars`). `PartyMemberView` and `partyMembers` are unchanged.
- `src/social/MemberCard.vue` (desktop rail out of combat, mobile Party sheet): a `v-for` over `memberBars`, each bar a `.track.{kind}-track` progressbar with aria-label `{name} {kind} {v} of {max}` and its own `title`. Rail: always (an unknown member keeps its dimmed, aria-hidden, title-less empty tracks). Sheet: only for a known member who is not you. The old single resource bar and `barFraction`/`pct` helper are gone; mana and stamina tracks are 3px, health stays 4px. The `{s} st` text, low mark, `.stamina-sr` sentence and Lv title are untouched.
- `src/frame/VitalsStrip.vue` (mobile combat grid): each known card draws the same bars as hidden 3px `span.track` elements with titles; the button name reads `Health {pct} percent, mana {m} of {max}, stamina {s} of {max}{, pet ...}{, offline}{. Effects: ...}.` (mana only for a mana user). No new CSS; min-height 44px kept.
- `src/social/CombatMemberCard.vue` (desktop combat): bars and titles untouched; the target name now carries `health, mana (when any), stamina` after `level {n}`, built from `memberBars`.
- `51.1-UI-SPEC.md`: third owner amendment bullet plus the Spacing Exceptions rows, out-of-combat item 6 (old text struck through), the in-combat aria-label, the mobile grid card and its aria-label, sheet item 6, the Copywriting grid row and Tests items 2/3 and Q4. "owner 2026-10-08" count in the UI-SPEC: 14 before, 24 after.

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | b54e4552 | feat(261008-c4p): memberBars gives every party card health, mana if any, then stamina |
| 2 | 4f59206b | feat(261008-c4p): rail and Party sheet member cards show health, mana and stamina bars |
| 3a | d90ebd6e | feat(261008-c4p): mobile combat grid shows mana and stamina; target names carry all three |
| 3b | b62b1c55 | docs(261008-c4p): 51.1 UI-SPEC owner amendment - every party card shows health, mana and stamina |

## Verification

- `npx vitest run src/social src/rails src/frame src/styles --maxWorkers=1`: 59 files, 1489 tests, all passed (run before the last test-only type fix; the four affected files then re-ran green: 188 tests).
- `npx vue-tsc -b`: clean (final run, no output).
- Full `npx vitest run --maxWorkers=1` from the repo root: 368 files, 11254 tests, 11252 passed, 2 failed. Only the three baseline files failed (`scripts/llm/call_log_report.test.mjs`, `scripts/llm/proof_rules.test.mjs`, `spacetimedb/src/helpers/measurement.results.test.ts`); nothing else.
- `src/frame/AppFrame.combat.test.ts` kept CRLF (639 CR, 639 lines in the working file).
- `PartyBlock.vue` and `VitalsRail.vue` are not in any diff; no server, bindings, STATE.md, ROADMAP.md or todo changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test fixture and typing slips found while greening**
- **Found during:** Tasks 2 and 3
- **Issue:** The MemberCard unknown-member fixture left stamina at 12/40, so the new stamina track read 30% instead of 0%; and two `get(...).exists()` calls in PartyBlock.test.ts failed vue-tsc.
- **Fix:** The fixture now zeroes stamina and sets `resourceKind: 'stamina'` (as `partyMembers` does for an unknown member); the calls use `find(...).exists()`. The tsc fix landed in commit d90ebd6e (Task 2's commit had the two type errors in a test file only; vitest was green).
- **Files modified:** src/social/MemberCard.test.ts, src/rails/PartyBlock.test.ts

**2. TDD ordering (note)**
- For Task 1 the helper and its tests were written together and run once green; no separate failing-RED run was recorded. For Tasks 2 and 3 the first run after the test edits was a mixed run with the source changes made right after. Behaviour is fully pinned by the tests.

**3. UI-SPEC extras**
- Beyond the plan's list, the Copywriting row for the grid card aria text (line ~827) was updated too, so the spec does not contradict itself.

## Known Stubs

None.

## Threat Flags

None. No new endpoints, subscriptions or trust-boundary surface; names stay text nodes and attribute bindings.

## Self-Check: PASSED

- memberBars, the four commits (b54e4552, 4f59206b, d90ebd6e, b62b1c55) and the changed files exist; UI-SPEC contains "Every party card shows health, mana (if any) and stamina" once.
