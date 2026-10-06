---
status: testing
phase: 49-character-creation-interview
source: [49-VERIFICATION.md, 49-10-SUMMARY.md, 49-REVIEW-FIX.md]
started: 2026-10-06T00:00:00Z
updated: 2026-10-06T00:00:00Z
deferred: The owner deferred all hands-on verification to one end-of-milestone UAT pass. The live interview needs paid LLM calls, which wait for the owner's go-ahead on the cost.
---

## Current Test

number: 1
name: Live creation interview on desktop (1280)
expected: |
  A fresh account with no character goes straight into the Keeper interview. The step bar shows Race · Archetype · Class · Name · Enter the realm. Race cards show the newest stored races with stat tags. Surprise me and typed text both work. The archetype cards, the staged class reveal and the ability cards follow, then the name, then entering the realm. The live sheet fills in order with the name last ("Unnamed" until then), and stats include the race bonus.
awaiting: user response (deferred to end-of-milestone UAT)

## Tests

The full consolidated checklist is in 49-10-SUMMARY.md under "## Deferred owner checklist (milestone-end UAT)", items 1 to 11.

### 1. Live interview at 1280 (paid LLM)
expected: Every step follows the step bar. The sheet fills with the name last. The frame mounts the moment the character is placed. Starter tips appear in the first frame feed.
result: [pending]

### 2. Live interview at 390×844 (paid LLM, real device)
expected: The Sheet chip opens the sheet, Esc returns focus, the keyboard doesn't hide the input, and the cards fit.
result: [pending]

### 3. Error paths
expected: These paths all work:
- Retry class details on CLASS_FILL_ERROR
- Go back a step
- Start over with its confirmation ("Keep my choices")
- Retry finding a region after a failed first region
result: [pending]

### 4. Race bonus through level-up (D1)
expected: The bonus survives level-up through both apply_level_up and the admin level command. Older races (Human and others) keep their primary and secondary stats. An unnamed or "Unknown" race gets no bonus anywhere.
result: [pending]

### 5. Owner decisions and copy to confirm
expected: Review and confirm each of these:
- A race left unnamed no longer gets +2 STR +1 DEX (Phase 41 pin changed).
- A +STR race bonus adds 8 max HP per point.
- Pre-phase characters may drift at their next level-up (accepted).
- The copy "Retry class details", "Go back a step" and "Keep my choices".
- The server greeting at the name step says "Four characters minimum", but the real rule is 3 to 20 (pre-existing copy).
result: [pending]

### 6. Visual fit
expected: Layouts stay clean at 900px and 1100px, and with a 20-character name.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
