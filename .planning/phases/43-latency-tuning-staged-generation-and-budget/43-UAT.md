---
status: testing
phase: 43-latency-tuning-staged-generation-and-budget
source: [43-VERIFICATION.md]
started: 2026-10-01T10:38:51Z
updated: 2026-10-01T10:38:51Z
---

## Current Test

number: 1
name: Staged region entry, live
expected: |
  Exploring past the edge into an unknown region puts you in the new region (start location and first NPC) in about 10 s, before the rest fills in. Rotating Keeper lines show while it runs, and you can act in the stage-1 region while it fills.
awaiting: user response

## Tests

### 1. Staged region entry, live
expected: You arrive in the new region with its start location and first NPC in about 10 s, before the rest fills in. Rotating Keeper lines show while it runs. You can act during the fill.
result: [pending]

### 2. Staged class reveal, live
expected: When you create a character, the class identity and first ability appear in about 5 s, then the rest of the class fills in. Input is not locked during the fill.
result: [pending]

### 3. Progress-line rotation on screen
expected: While generation runs, the Keeper line in the console changes about every 5 s. It is in the Keeper's voice and uses "you" for the player.
result: [pending]

### 4. Admin /llm commands in the real console
expected: As admin, `/llm stats` prints per-route calls, cost, p50/p95 latency and errors as plain text. `/llm off` makes the next LLM action answer "The Keeper is resting. Return later." with no call made. `/llm on` restores it. `/llm ceiling <dollars>` changes the ceiling. A non-admin gets an in-voice refusal.
result: [pending]

### 5. Review the money logic of WR-A01 (late reply across UTC midnight)
expected: A late reply never lowers today's spend figure below the real spend, and the ceiling is never enforced against too low a figure.
result: [pending]

### 6. Review the WR-A04 max_tokens headroom and the WR-B01 cap exemption
expected: You accept these values for routes that never auto-retry: creation_race, creation_class_reveal and creation_class at 1024; world_gen_start at 1536; world_gen at 2560; combat_narration at 768. You accept that the stage-2 fill routes are exempt from the per-player cap of 3, while the global cap, kill switch, ceiling and daily budget still apply.
result: [pending]

### 7. Maincloud publish (user-run, deferred to milestone end)
expected: You follow 43-USER-CHECKLIST.md after the Phase 42 maincloud sequence. No clear.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
