---
created: 2026-09-30T20:00:00.000Z
title: Renown passive perks (and static-fallback active perks) have no effect
area: backend
priority: high
files:
  - spacetimedb/src/reducers/renown_perk.ts:74
  - spacetimedb/src/helpers/renown.ts:200
  - spacetimedb/src/data/llm_layers.ts:317
  - spacetimedb/src/helpers/combat.ts:918
---

## Problem

The Phase 41 code review (41-REVIEW.md, iteration 3, WR-B01) found a defect that has existed since Phase 36 (commit f3cb56e0). It now matters because renown perks come from real Claude calls.

- **Passive perks never apply.** `chooseRenownPerkLogic` stores a chosen passive as `renown_rank<R>_<name>`. Every consumer looks up the bare pool key (for example `iron_will`), so the lookup never matches. The consumers are `getPerkBonuses`, `getPerkProcs`, `getPerkBonusByField` and `combat_perks.ts`.
- **Generated passive effects are lost.** Nothing ever reads `perkEffectJson` for a model-generated passive, and the value is deleted along with the pending row.
- **Static-fallback active perks do nothing.** They become `utility` abilities that only log "You use X." (`combat.ts:918`).
- **The prompt and a comment describe behaviour the code doesn't have.** The renown route block requires at least one passive per offer and promises "they just work". The comment at `renown.ts:200-201` also describes the lookup incorrectly.

## Fix direction

- Carry the pool key on the pending row, and have `chooseRenownPerkLogic` store the key the consumers actually read.
- Store the effect of a generated passive when it is chosen, and read it in the perk-bonus lookups.
- Give static-fallback active perks real effects, or stop offering them as actives.
- Add tests: choose a passive, and its bonus shows up in `getPerkBonuses` and in combat.

Candidate home: Phase 43 (it touches the renown route and schemas) or a quick task before Phase 44's live verification.

## Related review info items (41-REVIEW.md iteration 3)

- IN-B11: a rank can be claimed twice. `chooseRenownPerkLogic` has no already-claimed check, and the legacy `choose_perk` reducer is still callable.
- IN-B12: the unknown-`effectType` default of `damage_up` turns a defensive renown buff into a damage buff.
- IN-A10: a renown job that ends without options stalls the ranks queued behind it.
