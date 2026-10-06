---
status: testing
phase: 48-combat-encounter
source: [48-VERIFICATION.md, 48-14-SUMMARY.md]
started: 2026-10-06T00:00:00Z
updated: 2026-10-06T00:00:00Z
deferred: The owner deferred all hands-on verification to one end-of-milestone UAT pass. This phase was built overnight under the owner's instruction to auto-approve recommendations. Item 5 needs a paid LLM call and waits for the owner's go-ahead on the cost.
---

## Current Test

number: 1
name: Live combat on desktop (1280)
expected: |
  Fight on the local stack. In combat, the header shows "In combat · Round N" and the right rail becomes the Encounter panel. That panel shows hostiles with HP, difficulty color and boss tag, a threat list on the target, and wind-up rows. Click or Tab cycles targets; Tab works after Esc or a click away from the input. The feed groups events under "Round N" headers. The hotbar round row shows the countdown, the choice chip, Ready and Flee. Cooldowns show "N rounds". Party cards select an ally for heals. The HP bar flashes when hit.
awaiting: user response (deferred to end-of-milestone UAT)

## Tests

The full consolidated checklist is in 48-14-SUMMARY.md under "## Deferred owner verification" (sections A–D).

### 1. Live combat at 1280 (checklist A, desktop items)
expected: The encounter rail, targeting, threat list, wind-up warnings, round headers, timer and Resolving…, choice chip, Ready, Flee chosen, "N rounds" cooldowns, ally targeting and damage flash all behave as specified in 48-UI-SPEC.
result: [pending]

### 2. Live combat at 390×844 (checklist A, mobile items)
expected: In mobile combat, the tab bar and location row are hidden. The encounter strip sits above the feed with tappable hostile chips. The strip header opens the encounter sheet. The account button opens a Log-out-only sheet. The round row carries the timer, Ready and Flee. Ally chips work in the vitals strip.
result: [pending]

### 3. Deviations to approve or change (checklist B)
expected: Review each deviation:
- A1: Ready and Flee sit in a round row above the slots, not at the end of the hotbar.
- A4: Tab is scoped, and desktop focus starts in the input.
- A5: The tab bar is hidden in mobile combat, and the account button sits on the strip.
- A8: Threat percent is relative to the top entry.
- A26: A dead ally is not sent as a target.
- Ally chips have a 37px tap height.
- The target glow is clipped.
- Ready and Flee copy.
- Ally button accessible names.
result: [pending]

### 4. UI backstops (checklist C)
expected: The following layouts stay clean:
- the round row at 900px and at 390 with long names
- the strip with 6 or more chips
- the vitals chip row with many allies and effects
- the encounter sheet with 8 hostiles
- the desktop panel scrolling with 8 hostiles
result: [pending]

### 5. Late-narration round tag (paid LLM)
expected: Keeper narration that arrives after its round resolves carries "THE KEEPER · ROUND M".
result: [pending]

### 6. Clock behavior after a reload mid-fight (review WR-03..06)
expected: After a reload or reconnect during a fight, the countdown is off by at most one round and recovers on the next live round. Controls are never locked while a round is open.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
