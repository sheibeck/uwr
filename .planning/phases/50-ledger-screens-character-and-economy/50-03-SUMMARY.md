---
phase: 50-ledger-screens-character-and-economy
plan: 03
subsystem: spacetimedb
tags: [spacetimedb, game-data, renown, factions]

requires:
  - phase: 50-01
    provides: "import-free shared module pattern with source pins"
provides:
  - "spacetimedb/src/data/perk_rules.ts: perkBonusByField, perkDisplayName"
  - "spacetimedb/src/data/faction_rules.ts: factionTier, FACTION_TIER_LABELS, FactionTierKey"
affects: [50-09 publish, Stats screen, Vendor screen (rapport), /faction command]

tech-stack:
  added: []
  patterns:
    - "Server helper delegates to a pure data/ function so the client shows the number the server applies"

key-files:
  created:
    - spacetimedb/src/data/perk_rules.ts
    - spacetimedb/src/data/perk_rules.test.ts
    - spacetimedb/src/data/faction_rules.test.ts
  modified:
    - spacetimedb/src/helpers/renown.ts
    - spacetimedb/src/data/faction_rules.ts
    - src/input/infoCommands.ts
    - src/input/infoCommands.test.ts

key-decisions:
  - "The passive-perk key mismatch (renown_rank{N}_{name} never equals a pool key) is not fixed here; a test pins today's behavior and points at .planning/todos/pending/2026-10-06-renown-passive-perks-no-effect.md"
  - "One factionTier rule for the Stats screen and /faction; negative thresholds use <= so the bands shift by one tier"

requirements-completed: [LDG-03, LDG-08]

status: complete
duration: 15min
completed: 2026-10-06
---

# Phase 50 Plan 03: Shared perk rules and faction tier Summary

The server's perk bonus lookup and the readable perk name now live in one import-free module, and one `factionTier` rule gives the Stats screen and the `/faction` command the same tier word.

## Exported signatures

`spacetimedb/src/data/perk_rules.ts` (imports only `./renown_data`):

- `perkBonusByField(perkKeys: ReadonlyArray<string>, fieldName: string, characterLevel?: bigint): number`
- `perkDisplayName(perkKey: string): string`: exact pool key gives the pool name; `renown_rank{N}_{name}` gives the rank-N pool name; anything else is humanized (prefix stripped, words capitalized).

`spacetimedb/src/data/faction_rules.ts` (now imports only `./mechanical_vocabulary`):

- `type FactionTierKey`, `FACTION_TIER_LABELS: readonly string[]` (Hated to Exalted)
- `factionTier(standing: bigint): { key: FactionTierKey; label: string }`

`helpers/renown.ts` `getPerkBonusByField(ctx, characterId, fieldName, characterLevel?)` keeps its name, signature and export and delegates to `perkBonusByField` over the character's `renown_perk` keys. `src/input/infoCommands.ts` `standingLabel` returns `factionTier(standing).label` through `@game-data/faction_rules`.

## Task Commits

1. Task 1: perk_rules and getPerkBonusByField delegation: `572167eb`
2. Task 2: factionTier and standingLabel re-pointed: `81c3570b`

## Verification

- `perk_rules.test.ts`: 12 tests; `faction_rules.test.ts`: 21 tests; `infoCommands.test.ts` 31 tests (4 new); `src/input` 6 files, 271 tests; `src/gameDataAlias.test.ts` 6 tests; `intent.test.ts` (calls getPerkBonusByField) green.
- `pnpm exec vue-tsc -b` exits 0.
- The new infoCommands rows were run before the re-point and failed (RED), then passed.

## For the owner's UAT note: `/faction` labels that changed

Positive standings keep their labels. Negative bands shift by one tier because negative thresholds are now reached with `<=`:

| Standing | Old label | New label |
|----------|-----------|-----------|
| -1 to -24 | Unfriendly | Neutral |
| -26 to -49 | Hostile | Unfriendly |
| -51 to -99 | Hated | Hostile |

Unchanged: -25 Unfriendly, -50 Hostile, -100 and below Hated, 0 and above. The existing `formatFactions` and `formatFaction` fixtures (60, -25, 80, 0) sit in unchanged bands, so their expectations did not move.

## Deviations from Plan

None to scope. Notes: the plan describes `shrewd_bargainer` as rank 2; in the current `renown_data.ts` it is a rank 3 perk (`iron_will` is rank 2). Tests match by content: `renown_rank3_shrewd_bargainer` resolves through the rank 3 pool, and `renown_rank3_iron_will` falls through to the humanized name. The scaling-perk test uses the real `masterwork` entry (`craftQualityBonus 25`, `perLevelBonus 0.5`). `faction_rules.ts` keeps its import at the top of the file, after the header comment.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- FOUND: spacetimedb/src/data/perk_rules.ts, perk_rules.test.ts, faction_rules.test.ts
- FOUND commits: 572167eb, 81c3570b
