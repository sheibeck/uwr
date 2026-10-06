---
created: 2026-10-06
title: Renown passive perks chosen via choose_renown_perk have no effect
area: server
priority: medium
---

## Problem

Found during Phase 50 research (50-RESEARCH.md Open Question 6). `choose_renown_perk` stores passive perks as `renown_rank{N}_{sanitized}`, and those keys never match the `RENOWN_PERK_POOLS` keys. As a result, chosen passive perks have no mechanical effect today, including the vendor discount perks. This was verified by reading the code; no test was run.

## Owner decision

On 2026-10-06 the owner chose "Todo for later": this is not fixed in Phase 50. The Phase 50 Stats screen shows perk names correctly.

## Notes for the fix

- Fixing it changes balance, for example vendor prices.
- Decide how to treat perks already chosen.
- Add real-handler tests that a chosen passive takes effect.
