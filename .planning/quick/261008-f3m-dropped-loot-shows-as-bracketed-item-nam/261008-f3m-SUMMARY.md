---
phase: quick-261008-f3m
plan: 01
status: complete
subsystem: loot / console feed
tags: [loot, feed, keywords, take_loot, take_all_loot, my_combat_loot]
requires:
  - take_loot / take_all_loot reducers (unchanged)
  - my_combat_loot view (unchanged; bindings already had it)
provides:
  - "@game-data/loot_line: formatLootLine, parseLootLine, stripLootTokens, cleanLootName, LOOT_DROPPED_LEAD, LOOT_AVAILABLE_LEAD, TAKE_ALL_LABEL, LOOT_NAME_MAX, type LootLinePiece"
  - "src/console/lootLine.ts: lootParts, lootPlainText, TAKE_ALL_ENTRY_NAME"
  - "game.loot (my_combat_loot rows); GameReducers.takeLoot / takeAllLoot"
  - "keyword kinds 'loot' and 'lootAll'; KeywordPart.rarity"
affects:
  - spacetimedb/src/reducers/combat.ts (victory announcement)
  - spacetimedb/src/reducers/intent.ts (loot command)
  - src/console feed rendering, src/ledger NoticeLine (through cleanServerText)
tech-stack:
  added: []
  patterns:
    - "machine tokens in a server line, parsed by a shared pure grammar, never displayed"
    - "links gated by row presence in a my_* view, matched by id"
key-files:
  created:
    - spacetimedb/src/data/loot_line.ts
    - spacetimedb/src/data/loot_line.test.ts
    - spacetimedb/src/reducers/loot_feed_links.test.ts
    - src/console/lootLine.ts
    - src/console/lootLine.test.ts
    - src/console/lootGuards.test.ts
  modified:
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/intent.ts
    - spacetimedb/src/reducers/loot_victory.integration.test.ts
    - src/game/queries.ts
    - src/game/context.ts
    - src/game/gameData.ts
    - src/console/keywords.ts
    - src/console/keywordLabel.ts
    - src/console/useConsole.ts
    - src/console/lines.ts
    - src/console/cleanServerText.ts
    - src/console/FeedView.vue
    - src/console/FeedLine.vue
    - (tests) queries, gameData, useConsole, lines, cleanServerText, FeedView, FeedLine, NoticeLine
decisions:
  - "The loot id travels in the line ({{loot:<id>:<rarity>}}name{{/loot}}); links match by id, never by name or order"
  - "[Take all] is live while any of the line's own ids is in my_combat_loot, which equals 'that fight still has rows'"
  - "The loot command writes kind reward (was look); tokens are parsed on private reward rows only"
  - "Taking writes no client echo; the server's lines are the only feedback"
metrics:
  duration: "about 30 min (13:00 to 13:30 local)"
  completed: 2026-10-08
  tasks: 3
  commits: 6
---

# Quick 261008-f3m: Dropped loot as bracketed item names you click to take

After a won fight with drops, the feed now shows one Reward line: `Loot dropped: [Rusty Dagger], [Wolf Pelt] [Take all]`. Each name is in its rarity token color. Clicking a name calls `take_loot` for that exact `combat_loot` row, matched by id. `[Take all]` calls `take_all_loot`. Typing `loot` lists the untaken drops again in the same clickable form. The server is published locally.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 RED | 6f01d831 | test(261008-f3m): add failing tests for the loot-line grammar and the loot links |
| 1 GREEN | 1711a2a9 | feat(261008-f3m): one loot-line grammar for the victory line and the loot command |
| 2 RED | 1cf5e86d | test(261008-f3m): add failing tests for the loot view, take actions and loot parts |
| 2 GREEN | fcaf3429 | feat(261008-f3m): subscribe to my_combat_loot, take actions and loot parts |
| 3 RED | 7980f63c | test(261008-f3m): add failing tests for loot links in the feed |
| 3 GREEN | 9a9e8d68 | feat(261008-f3m): dropped loot as bracketed item names you click to take |

## What changed

**Server**
- `spacetimedb/src/data/loot_line.ts` (new, pure, imports only QUALITY_TIERS). It holds the one grammar: `<lead> {{loot:<id>:<rarity>}}<name>{{/loot}}, ... {{lootall}}Take all{{/lootall}}`.
  - `formatLootLine` skips rows with no template or an empty cleaned name, and returns null when nothing is left.
  - `parseLootLine` uses one fixed module `/g` regex with bounded quantifiers. It resets `lastIndex`, wraps the body in try/catch and never throws. It returns null when there is no item piece.
  - `stripLootTokens` turns item tokens into names and removes the take-all token together with the one space before it.
  - `cleanLootName` removes `[ ] { }`, turns control characters into spaces, collapses whitespace and caps the name at 80.
- Victory (`combat.ts`, "Announce the drops as one line of loot links"): the hex RARITY_COLORS map and the newline list are gone. The line is written through `formatLootLine(LOOT_DROPPED_LEAD, charLoot, ...)`. When it returns null, the old "No loot dropped from ..." line is written. The `combat_result` insert and its delete are unchanged.
- `loot` command (`intent.ts`): the same grammar under `LOOT_AVAILABLE_LEAD`, now kind `reward`. The "There is nothing to loot here." system line is unchanged. The quest-item `loot <name>` branch is untouched.
- `items.ts` is unchanged, and there are no schema or reducer-signature changes.

**Client**
- `game.loot` comes from a tenth static binding on `my_combat_loot` (`queries.myCombatLoot`, with no WHERE because the view is scoped server-side).
- `GameReducers` gains `takeLoot({ characterId, lootId })` and `takeAllLoot({ characterId })`.
- `KeywordKind` gains `loot` and `lootAll` (labels "Take {item}" and "Take all loot"), and `KeywordPart` gains an optional `rarity`. The loot kinds never come from the vocabulary.
- `src/console/lootLine.ts`:
  - `lootPlainText` draws items and the take-all as `[..]`;
  - `lootParts(pieces, available)` gives an item an entry only when its id is in `available`, and gives `[Take all]` an entry only when any item id of this line is in it.
- `useConsole.actOnKeyword`:
  - `loot` calls `takeLoot` and `lootAll` calls `takeAllLoot`;
  - neither writes an echo, closes a screen or changes the conversation;
  - both bump sendTick and do nothing while offline or with no character.
- `lines.ts`:
  - on private kind `reward` rows only, `parseLootLine` runs before `cleanServerText`;
  - a hit becomes one `quest` line labelled "Reward", with `keywordEligible: false` and the `loot` pieces;
  - `buildFeedLines` fills its parts with `lootParts(line.loot, options.availableLoot ?? EMPTY_LOOT)`.
- `FeedView.vue`: `availableLoot` is the set of ids of the `game.loot` rows whose `characterId` is the active character's.
- `FeedLine.vue`:
  - a loot button gets the `keyword-take` class and an inline `color: rarityColor(rarity)`;
  - a taken item is a `span.loot-name` in its rarity color;
  - under `@media (pointer: coarse)`, `.keyword-take::after` has `inset: -12px 0`, which turns the 22px line into a hit area of about 46px;
  - the new markup is glued in the same `><` style (the body is pre-wrap).
- `cleanServerText`: calls `stripLootTokens` first, so the ledger notice line reads "Loot dropped: Rusty Dagger, Wolf Pelt".

## Judgement calls

1. **The loot id travels in the line.** Names repeat, order breaks once a row is taken, and private event rows carry no combat id. Ids are unique and never reused. A forged token is harmless: it is clickable only for ids in the player's own `my_combat_loot`, and `take_loot` re-checks ownership.
2. **Layout** follows the owner's 51.4 note: one line, `Loot dropped: [A], [B] [Take all]`. Take all is on every loot line that lists at least one item (the owner asked for it).
3. **The [Take all] gate is the line's own ids.** Every victory deletes the character's older rows first, and the line lists exactly the fight's takeable rows. So "any of this line's ids is still present" equals "that fight still has rows".
4. **The `loot` command moved from kind `look` to `reward`**, so its output parses into links too.
5. **No client echo on take.** The server's "You receive X." / "You take all loot: ..." / "Backpack is full" lines are the only feedback.
6. **Taken items keep their rarity color** as plain bracketed text, so history stays readable.
7. **Old-format history rows stay plain** ("Take Rat Tail"), per the greenfield rule (no shim).
8. **Rarity colors come from `rarityColor`** (the `--color-rarity-*` tokens, the Inventory helper). No classes were invented.
9. **Junk is not neutral in the line.** The token carries rarity only, which is acceptable for a stopgap.
10. **Extra hardening (not in the plan text, inside its intent):** loot tokens are parsed only when the row's source is `private`. A `reward` row on the group or location source stays plain, and a test pins this. This matches the plan's key link ("private kind 'reward' rows only") and T-f3m-01.

## Phase 51.4 keep-or-retire

ROADMAP owner note, 2026-10-08 (commit 438b9a3d): these links stay until the loot rails ship. Then the owner decides whether they stay as a shortcut or retire. Header comments in `spacetimedb/src/data/loot_line.ts` and `src/console/lootLine.ts` say this.

Pieces 51.4 can reuse:
- `@game-data/loot_line`;
- the `loot` and `lootAll` keyword kinds;
- `game.loot`;
- `GameReducers.takeLoot` and `GameReducers.takeAllLoot`.

The take actions are not on ConsoleApi; 51.4 may expose them.

If the links retire:
- remove the `parseLootLine` branch in `lines.ts` and the two keyword kinds;
- then either keep `stripLootTokens` or change the server line.

## Verification

- Task 1 verify (loot_line, loot_feed_links, loot_victory, dismiss_combat_results, intent, pronoun_rules, no_ripple_word): 7 files, 162 tests passed.
- Task 2 verify (queries, gameData, lootLine, useConsole, keywords, FeedLine): 6 files, 218 tests passed.
- Task 3 verify (`src/console`, NoticeLine, `src/styles`, loot_line): 19 files, 499 tests passed.
- `npx vue-tsc -b`: clean.
- Full root `npx vitest run --maxWorkers=1`: 11760 tests passed and 2 failed, in 386 of 389 files. The only failing files are the three baseline ones: `scripts/llm/call_log_report.test.mjs`, `scripts/llm/proof_rules.test.mjs` and `spacetimedb/src/helpers/measurement.results.test.ts`.
- Each commit's `git show --stat` lists only this plan's paths. `src/module_bindings` is unchanged, and STATE.md and ROADMAP.md were not touched by this task.

## Publish (local)

- `git status --porcelain -- spacetimedb/` before the publish: empty. No files outside this plan were changed.
- Key check before: `true | 108`, OK.
- `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null`: exit 0. "Build finished successfully", an empty Database Migration Plan, then "Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a". There was no clear prompt.
- Key check after: `true | 108`, OK.
- `git status --porcelain -- src/module_bindings`: empty, so no regeneration was needed.
- Owner's row: `combat_loot` 8195, Rat Tail (template 27, common), character 1, combat 8199, is still present. 8196 (Lesser Essence) is also there. The old announcement in history uses the legacy format and stays plain. Typing `loot` now writes a tokenized reward line whose `[Rat Tail]` and `[Take all]` are clickable.

## Deviations from Plan

**1. [Rule 2 - Security] Loot tokens are parsed only on the private source**
- **Found during:** Task 3.
- **What changed:** the plan's action text says only `kind === 'reward'`, but its key_links and T-f3m-01 say "private". `classifyByKind` also checks `entry.source === 'private'`.
- **Test:** lines.test.ts "the same token text in any other row" includes group and location reward rows.
- **Commit:** 9a9e8d68.

**2. [Minor] Extra trim and cut in cleanLootName and parseLootLine**
- `cleanLootName` trims again after the 80-character cut, so a cut never leaves a trailing space.
- `parseLootLine` trims with `trimStart`/`trimEnd` instead of a `\s+$` regex, which avoids quadratic backtracking on hostile whitespace.

Otherwise the plan was executed as written.

## Known Stubs

None.

## UAT backstop (deferred to milestone end)

1. Win a fight with two drops.
2. Tap one name on a phone: it lands in the bag, its link goes plain, and "You receive X." appears.
3. With a full bag, tap a name: "Backpack is full" appears and the link stays.
4. Tap [Take all]: every link goes plain.
5. Type `loot`: it re-lists any untaken drops as links.

## Self-Check: PASSED

- Files: spacetimedb/src/data/loot_line.ts, spacetimedb/src/reducers/loot_feed_links.test.ts, src/console/lootLine.ts and src/console/lootGuards.test.ts all exist.
- Commits: 6f01d831, 1711a2a9, 1cf5e86d, fcaf3429, 7980f63c and 9a9e8d68 are all in `git log`.
