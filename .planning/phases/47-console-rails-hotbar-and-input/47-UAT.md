---
status: testing
phase: 47-console-rails-hotbar-and-input
source: [47-VERIFICATION.md, 47-12-SUMMARY.md]
started: 2026-10-05T23:30:00Z
updated: 2026-10-05T23:30:00Z
deferred: The owner tried the exploring UX on the local stack on 2026-10-05 and approved it, with two follow-ups that have since been fixed. The remaining device and visual checks are deferred to the one end-of-milestone UAT pass.
---

## Current Test

number: 1
name: Keyboard-open compaction on a real phone
expected: |
  On a real phone with the software keyboard open (input focused), the vitals strip compacts, the location row hides, and the feed keeps at least 120px.
awaiting: user response (deferred to end-of-milestone UAT; easiest after a maincloud deploy, since a phone cannot reach the localhost dev stack)

## Tests

The full ten-step try-out list is in 47-12-SUMMARY.md, under "## Deferred owner verification". The owner verified it on 2026-10-05, apart from the items below.

### 1. Keyboard-open compaction on a real phone
expected: With the keyboard open, the strip compacts and the location row hides. The feed keeps at least 120px.
result: [pending]

### 2. iOS 14px input zoom (UI-SPEC A9)
expected: Note whether iOS zooms when the input is focused. If it does, decide whether to accept the zoom or add a 16px mobile-input exception.
result: [pending]

### 3. Real-phone layout at about 390×844
expected: Each tab and sheet opens and shows its content:
- Map tab: routes, Nearby, Tracking and the event card.
- Party tab: the party block.
- Strip chips: open the Social sheet.
- Sheet actions: close the sheet. Whisper and Invite fill the input.
result: [pending]

### 4. Route level rule
expected: Route tags (`Lv N` / `Lv N–M` / `Safe`) match the owner's expectation. The rule is per location: the region base plus the location's levelOffset, ±1 when the offset is non-zero.
result: [pending]

### 5. Effect time in combat only
expected: Effect chips show "n rounds" only while in combat, and show no time outside combat. This is a server data limit: `roundsRemaining` only ticks in combat.
result: [pending]

### 6. Try-out follow-ups on the running client
expected: Scrollbars are dark-themed everywhere, and the desktop feed, composer and hotbar fill the center column.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
