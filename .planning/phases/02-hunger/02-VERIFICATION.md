---
phase: 02-hunger
verified: 2026-02-12T05:58:19Z
status: human_needed
score: 16/16 must-haves verified
re_verification: false
human_verification:
  - test: Open the application, create a character, navigate to the Stats panel
    expected: Hunger bar shows 100/100 with a full green progress bar. No Well Fed badge is shown.
    why_human: Cannot verify visual rendering and DOM output programmatically
  - test: Buy or craft Simple Rations. Use it via the Use button.
    expected: A HoT message appears. No Well Fed badge. Simple Rations shows no Eat button - only Use.
    why_human: Requires visual confirmation that consumable-slot items do not show Eat button
  - test: Craft Roasted Roots (2x Root Vegetable + 1x Salt). Open inventory and click Eat.
    expected: Roasted Roots consumed. Well Fed badge appears showing +2 STR and ~45m remaining.
    why_human: Requires end-to-end flow verification including crafting and live SpacetimeDB state update
  - test: Enter combat while Well Fed with +2 STR (Roasted Roots). Note damage dealt.
    expected: Damage is 2 higher than the base formula without the buff.
    why_human: Requires runtime comparison of damage values
  - test: Wait 5+ real minutes after logging in. Check hunger value.
    expected: Hunger has decreased by approximately 2 points (e.g., 98/100).
    why_human: Requires waiting for the scheduled decay tick to fire in the live module
  - test: Let hunger reach 0. Observe hunger bar display.
    expected: Bar shows 0/100, no penalty text, red color, no negative indicator.
    why_human: Requires visual confirmation of no-penalty behavior at 0
---
