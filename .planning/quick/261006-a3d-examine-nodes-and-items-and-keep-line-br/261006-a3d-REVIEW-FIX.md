---
phase: quick-261006-a3d
fixed_at: 2026-10-06T00:00:00Z
review_path: .planning/quick/261006-a3d-examine-nodes-and-items-and-keep-line-br/261006-a3d-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 10
skipped: 3
status: partial
---

# Quick 261006-a3d: Code Review Fix Report

**Fixed at:** 2026-10-06
**Source review:** .planning/quick/261006-a3d-examine-nodes-and-items-and-keep-line-br/261006-a3d-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 13 (2 critical, 5 warning, 6 info)
- Fixed: 10 (IN-01, IN-02 share one commit; IN-06 is a SUMMARY edit that is not committed)
- Skipped: 3 (IN-03, IN-04, IN-05, by instruction)

Work ran in the main checkout on master, as instructed (no worktree), so the publish and the generated bindings check run against the real repo.

## Fixed Issues

### CR-01: A partial NPC, enemy or player match beats an exact node or item match

**Files modified:** `spacetimedb/src/helpers/examine.ts`, `spacetimedb/src/helpers/examine.test.ts`
**Commit:** e5341e30
**Applied fix:** `describeLookTarget` runs two passes (exact name across NPC, enemy, player, node, item; then partial), keeping category order inside each pass. The test that pinned a partial NPC beating an exact node is replaced by tests for: exact node beats partial NPC, exact NPC beats exact node, partial NPC beats partial node, Stone node vs Stone Golem enemy, Wood node vs player Woodrow, exact carried item beats partial node. Logic change: requires human verification.

### CR-02: Player-authored text can render as multi-line

**Files modified:** `spacetimedb/src/helpers/chat_text.ts` (new), `spacetimedb/src/reducers/commands.ts`, `spacetimedb/src/reducers/intent.ts`, `spacetimedb/src/reducers/npc_interaction.ts`, `spacetimedb/src/reducers/groups.ts`, `spacetimedb/src/reducers/chat_text.test.ts` (new)
**Commit:** 6a3b86eb (server), 0a6a516d (client: `src/console/lines.ts`, `src/console/FeedLine.vue`, `src/console/FeedLine.test.ts`, `src/console/lines.test.ts`)
**Applied fix:** Server: `flattenLineBreaks` turns each run of CR, LF, VT, FF, NEL, U+2028 and U+2029 into one space and trims. Applied to `submit_intent` (covers say, whisper, the command echo and the Keeper fallback), `submit_command`, `say`, `group_message`, `whisper` (message and target), `talk_to_npc` and `create_group` (group names reach other players in "You were removed from X."). An empty result goes through the existing `fail()` path. There is no emote reducer; `submit_creation_input` was left alone (its text is never echoed to other players, and Phase 49 touched it). Client: lines.ts sets `playerAuthored` on the group fallback (sender not in the party list) and the command echo, FeedLine adds `line-player-text`, and the CSS pins `.line-player-text .body` to `white-space: normal`. Tests: 14 reducer-level tests on the real handlers (verified to fail with the flatten disabled), classification tests, mount test, CSS contract. Not reducer-tested: `talk_to_npc` (needs the LLM queue); its change is the same one-line helper call.

### WR-01: Item stats leave out affix and craft-quality bonuses

**Files modified:** `spacetimedb/src/helpers/examine.ts`, `spacetimedb/src/helpers/examine.test.ts`
**Commit:** 211f7a8b
**Applied fix:** The Stats line sums template stats with every `item_affix` row for the instance (via `by_instance`). No existing per-instance helper exists (`getEquippedBonuses` and `getEquippedWeaponStats` are equipped-only and live in a file that imports `spacetimedb/server`), so examine.ts stays pure and mirrors their statKey handling. Also shows affix-only stats (life on hit, cooldown reduction, mana regen) and DPS. Test with four affix rows plus another instance's affix.

### WR-02: Duplicate items

**Files modified:** `spacetimedb/src/helpers/examine.ts`, `spacetimedb/src/helpers/examine.test.ts`
**Commit:** 92c7e0c4
**Applied fix:** Copies with the same template, display name and quality tier are one entry. "You carry 3." sums quantities; with an equipped copy: "You carry 3 (one equipped)." (a single equipped copy still reads "You have it equipped."). Candidates are ordered by instance id and the described copy is an equipped one when any exists, so the result no longer depends on index order (tested with both row orders). Copies with different display names are not merged. Logic change: requires human verification.

### WR-03: Whitespace on server lines

**Files modified:** `src/console/cleanServerText.ts`, `src/console/lines.ts`, `src/console/cleanServerText.test.ts`, `src/console/FeedLine.test.ts`
**Commit:** ef1b6827
**Applied fix:** `pre-wrap` kept. `cleanServerText` trims leading and trailing whitespace only (no internal collapsing); the NPC parser trims the spoken text so the closing quote stays on the row. Mount tests for NPC (trailing newlines outside and inside the quotes), Keeper and help-style lines. Segment text is still never cleaned (Phase 46 contract).

### WR-04: Bare look listed other characters' personal nodes

**Files modified:** `spacetimedb/src/helpers/look.ts`, `spacetimedb/src/helpers/examine.ts`, `spacetimedb/src/reducers/intent.test.ts`
**Commit:** a5074e8d
**Applied fix:** Shared `isNodeVisibleTo(node, character)` exported from examine.ts and used by both `describeNode` and `buildLookOutput`. Tests for shared, own and foreign nodes.

### WR-05: Test gaps

**Files modified:** `spacetimedb/src/reducers/look_intent.test.ts` (new), `spacetimedb/src/reducers/intent.test.ts`, `src/console/FeedLine.test.ts`
**Commit:** 9fc1cc78
**Applied fix:** Reducer-level LOOK tests through the real `submit_intent` handler: bare look, filler-only targets, a hit (one `look` event), a miss (`fail` line with the stripped target), personal-node privacy. The stale copied regex block in `intent.test.ts` now tests `parseLookCommand`. The FeedLine CSS contract also pins `.line-ripple` pre-wrap. Regression tests for CR-01, CR-02, WR-01, WR-02 and WR-03 are in the commits above.

### IN-01: TYPE_LABELS reads the object prototype

**Files modified:** `spacetimedb/src/helpers/examine.ts`, `spacetimedb/src/helpers/examine.test.ts`
**Commit:** c618be77
**Applied fix:** `Object.prototype.hasOwnProperty.call(TYPE_LABELS, key)` guard (no `Object.hasOwn`). Tested with slots named toString and constructor.

### IN-02: Lone article or "at" targets

**Files modified:** `spacetimedb/src/helpers/examine.ts`, `spacetimedb/src/helpers/examine.test.ts`
**Commit:** c618be77
**Applied fix:** A target that is only filler words (look the, look at the, look a, look at at) becomes a bare look. `look theron` still targets "theron".

### IN-06: SUMMARY disagrees with shipped code

**Files modified:** `.planning/quick/261006-a3d-examine-nodes-and-items-and-keep-line-br/261006-a3d-SUMMARY.md`
**Commit:** none (edited only, per instruction)
**Applied fix:** pre-wrap vs pre-line claims corrected (plan artifact check marked superseded), Threat Flags rewritten to state CR-02 and its fix, new Review fixes section.

## Skipped Issues

### IN-03: Unmapped vocabulary slots fall back to raw keys

**File:** `spacetimedb/src/helpers/examine.ts:23-45`
**Reason:** Skipped by instruction. Cosmetic, and the labels belong with the mechanical vocabulary; the harmful part (prototype read) is fixed by IN-01.
**Original issue:** Slots such as resource, food and quest have no label.

### IN-04: Ambiguous partial matches pick silently

**File:** `spacetimedb/src/helpers/examine.ts`
**Reason:** Skipped by instruction. An "also here" hint is a UX decision that needs new player-facing copy.
**Original issue:** First partial match wins with no hint that others exist. (Output is deterministic: id order for items, index order for nodes.)

### IN-05: Quirks in code moved verbatim

**File:** `spacetimedb/src/helpers/examine.ts`
**Reason:** Skipped by instruction. The NPC, enemy and player strings are pinned byte-identical by the plan; the redundant NPC test disappeared as a side effect of the predicate refactor, the rest is left as is.
**Original issue:** `[Name]:` bracket markup, `as any` casts, `undefined` description rendering.

## Gates

- Module: full suite excluding `measurement.results.test.ts`: 81 files, 3781 tests passed.
- Client: `pnpm exec vitest run --dir src --maxWorkers=2`: 99 files, 1992 tests passed.
- `pnpm exec vue-tsc -b`: clean. `pnpm build`: succeeded (chunk-size warning only, "bundle clean").

## Local publish

- Before: `admin_llm_status` key_set true, key_length 108.
- `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null`: exit 0, "Database Migration Plan" with no clear prompt or refusal, "Updated database with name: uwr, identity: c200f202...c14a".
- After: key_set true, key_length 108.
- `pnpm spacetime:generate -y`: succeeded; `git status --porcelain src/module_bindings` printed nothing.
- No maincloud, no `--clear-database`, no push, no server start or stop.

## Notes

- One slip: a WR-02 commit briefly contained a corrupted examine.ts (a bad splice; the test run failed but the commit chained after a `tail` pipe). It was caught within the same minute, the file was rebuilt from the previous commit and the commit amended before any other work. No broken commit remains in history; the gates above ran on the final tree.
- Phase 49 files (`race_bonuses.ts`, `creation.ts`) were not touched. `index.ts` was not edited. `commands.ts` and `intent.ts` were edited only at the lines named above.
- `intent.ts`, `lines.ts` and `cleanServerText.ts` working copies had CRLF endings while git stores LF (eol=lf); they were normalised to LF, which git sees as no change.

---

_Fixed: 2026-10-06_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
