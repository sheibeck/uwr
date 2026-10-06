---
phase: quick-261006-a3d
plan: 01
subsystem: console / intent
tags: [look, examine, resource-node, inventory, feed, white-space]
status: complete
key-files:
  created:
    - spacetimedb/src/helpers/examine.ts
    - spacetimedb/src/helpers/examine.test.ts
  modified:
    - spacetimedb/src/reducers/intent.ts
    - src/console/FeedLine.vue
    - src/console/FeedLine.test.ts
requirements: [QUICK-261006-a3d]
completed: 2026-10-06
---

# Quick 261006-a3d: Examine nodes and items, keep line breaks Summary

`look` / `look at <target>` now describes resource nodes at the location and items in the character's own inventory (after the unchanged NPC, enemy and player checks), and server feed text keeps its line breaks.

## Commits

- f2b1fd04 test(quick-261006-a3d): add failing tests for node and item examine (RED)
- 96c141ee feat(quick-261006-a3d): examine resource nodes and inventory items with look (GREEN)
- 80a0074b feat(quick-261006-a3d): route look through the examine helper (intent.ts + wiring guard test)
- 8fc50e03 fix(quick-261006-a3d): keep line breaks in server feed text (FeedLine.vue + tests)

## What changed

- `examine.ts` (pure, no spacetimedb/server or schema imports): `parseLookCommand` (strips a whole-word leading "at" and one article), `describeLookTarget` (NPC, enemy, player, node, item), `lookMissLine`. NPC, enemy and player output strings were moved verbatim.
- Node rules mirror `visibleNodes` / `nodeStatus` in `src/rails/nearby.ts`: own personal nodes only, exact name beats partial, an available unlocked node is preferred.
- Items come only from `item_instance.by_owner(character.id)`.
- `intent.ts` LOOK block now delegates to the helper; inline loops removed.
- `FeedLine.vue`: base `.body` has `white-space: pre-wrap`; `.line-echo`, `.line-say`, `.line-whisper`, `.line-party` bodies are pinned to `normal`. Scene and ripple keep their existing pre-wrap.

## Decision: no item keyword kind

A node and the item it yields share a name, so an underlined node name already examines, and the server falls through from nodes to the character's own inventory for the same name, so a click never dead-ends. Typed `look <item>` works for any carried item. An item kind would have edited keywords.ts, keywordLabel.ts, useConsole.ts and FeedView.vue, which sibling tasks own. `useConsole.ts` is unchanged and still sends `look at <name>` (line 397).

## Deviations from Plan

### Orchestrator deviation (not an owner decision)

**1. white-space: pre-wrap instead of pre-line on the base server-line body**
- The orchestrator chose `pre-wrap` (so `help` keeps its indentation). The owner asked only for line breaks in help. The plan said `pre-line`.
- The fallback to `pre-line` was not needed: no existing test broke, and a new mount test asserts `.body` textContent equals the source text exactly (no stray whitespace from the template).
- The CSS contract test pins `pre-wrap` on the base `.body`.

### Auto-fixed Issues

None beyond tooling slips: two of my own multi-line edits were written with real newlines inside string/regex literals (intent.ts and FeedLine.test.ts). Both were caught by the test runs and fixed before committing; nothing broken was committed.

## Publish evidence (local only)

- Before: `spacetime sql uwr --server local "SELECT key_set, key_length FROM admin_llm_status"` gave key_set true, key_length 108.
- Command: `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null`. No clear prompt appeared.
- Publish output tail:
  ```
  Uploading to local => http://127.0.0.1:3000
  Checking for breaking changes...
  Database Migration Plan
  Publishing module...
  Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a
  ```
  (The line "tsc not found in node_modules" printed before "Build finished successfully"; the build succeeded.)
- After: key_set true, key_length 108.
- `pnpm spacetime:generate -y` succeeded; `git status --porcelain src/module_bindings` printed nothing (bindings unchanged).
- No maincloud, no `--clear-database`, no push, no server start or stop.

## Gates

- `spacetimedb`: `examine.test.ts` (37 tests plus wiring guard) and `intent.test.ts` pass. Full module suite: 3810 passed, 2 failed, both in the known baseline `measurement.results.test.ts`.
- Client: `pnpm exec vitest run --dir src --maxWorkers=2` 99 files, 1982 tests passed; `pnpm exec vue-tsc -b` clean; `pnpm build` succeeded (chunk-size warning only; bundle clean).
- FeedLine.test.ts and designContract.test.ts pass.

## Known Stubs

None.

## Threat Flags

None. T-a3d-01/02 (privacy of items and personal nodes) are covered by tests; T-a3d-03/04 by the CSS contract test and the unchanged no-raw-HTML source test.

## Deferred

Manual UAT (click an underlined "Iron Shard" while gathering; type `help`) deferred to milestone UAT per the owner's preference.

## Self-Check: PASSED

examine.ts, examine.test.ts, and commits f2b1fd04, 96c141ee, 80a0074b, 8fc50e03 exist.
