---
created: 2026-10-06T16:16:26Z
title: Combat victory summary shows as three Keeper lines
area: ui
files:
  - src/console/lines.ts:6
  - src/console/lines.ts:180-190
  - src/console/lines.ts:316-318
  - spacetimedb/src/data/llm_layers.ts:498
  - spacetimedb/src/data/llm_layers.ts:872-958
  - spacetimedb/src/helpers/combat_narration.ts:205-215
  - spacetimedb/src/helpers/combat_moments.ts:1-14
---

## Problem

The owner played a 3-round fight against a Brine Sentinel on 2026-10-06. The fight ended with three consecutive "The Keeper" blocks that all summarise the same fight: the approach, the exchange and collapse, then the aftermath. To the owner it looked as if the Keeper summarised the combat three times.

Log excerpt:
- Round 3 kill, rewards, then "You earned 1 renown".
- Then "The Keeper" three times, each with one paragraph.

Analysis (code read on 2026-10-06, no LLM call made):
- No big-moment narration fired. `detectMoment` returns null in the round that ends the fight (`combat_moments.ts` header). Intro narration uses fixed text with no LLM call (`combat_narration.ts:428`).
- So all three blocks are the single victory outro (`enqueueCombatOutro`, narrativeType `'victory'`). The model returned it as three narration segments, one paragraph each.
- The client renders every segment as its own labelled line (`lines.ts:6`, "A row with a non-empty segments array becomes one line per segment"). Each one gets a "The Keeper" header, so one summary looks like three narrations.
- The outro prompt (`llm_layers.ts:498`) asks for "a brief narrative summary of the whole fight… as narration segments". The model wrote about 140 words in three paragraphs for a 3-round fight, which is long for "brief".

## Solution

Two independent parts:

1. **Client (no owner approval needed).** In `lines.ts`, group consecutive narration segments from the same event row with the same speaker under one label: one "The Keeper" header, with the paragraphs as separate bodies. Labels should repeat only when the speaker changes (Keeper, then an NPC, then Keeper). This matches the Phase 46 segments contract and fixes the look for every multi-paragraph Keeper reply, not only combat. Add tests in `lines.test.ts` / `FeedLine.test.ts`.

2. **Server prompt (needs explicit owner approval, SEG-03 / Keeper Bible rule).** Optionally make the outro length scale with the fight. For example, ask for one narration segment of two or three sentences for short fights (up to about 3 rounds), and allow more only for long or boss fights. Pass the round count in `buildCombatOutroVolatile`. Re-check the golden tests after any wording change. Do not change the prompt without the owner's go-ahead.

Check the round tag: per the 48-UAT item 5, late narration carries "THE KEEPER · ROUND M". The grouped label must keep that tag.

## Status (2026-10-06)

- **Client part:** done in quick 261006-h5w (one label per reply).
- **Prompt part:** the owner approved it in chat on 2026-10-06 ("We need short fight summaries to be shorter"). Queued as quick 261006-hpo.
