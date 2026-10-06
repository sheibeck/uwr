---
phase: quick-261006-a3d
reviewed: 2026-10-06T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - spacetimedb/src/helpers/examine.ts
  - spacetimedb/src/helpers/examine.test.ts
  - spacetimedb/src/reducers/intent.ts
  - src/console/FeedLine.vue
  - src/console/FeedLine.test.ts
findings:
  critical: 2
  warning: 5
  info: 6
  total: 13
status: issues_found
---

# Quick 261006-a3d: Code Review Report

**Reviewed:** 2026-10-06
**Depth:** standard (with targeted cross-file checks on lines.ts, whisper.ts, FeedView.vue, gameData.ts, look.ts, commands.ts, items.ts, schema)
**Files Reviewed:** 5 (reviewed at commit 8fc50e03 via `git show`; the two Phase 49 `.planning` files in the diff range are out of scope)
**Status:** issues_found

## Summary

The examine helper is pure and deterministic. It uses only index lookups (`by_location`, `by_owner`, `id.find`) and runs no `.iter()` scan. Item privacy is sound: only `item_instance.by_owner(character.id)` is read, and banked or corpse items are re-owned to `0n`. Personal-node privacy matches `visibleNodes`. `parseLookCommand` handles case, the whole-word "at" and articles correctly for the planned cases. The design guards hold: no raw HTML, no literal colors, no `replaceAll`, `.at(` or `Object.hasOwn`.

Two problems block the stated goals:

1. **CR-01: a node click can describe the wrong thing.** The check order lets a partial NPC, enemy or player match win over an exact node or item match. The feature's main path (clicking an underlined node name) then describes a different entity in common cases, such as a "Stone" node next to a "Stone Golem".
2. **CR-02: the spoofing defence is incomplete.** The CSS pins only the `echo`, `say`, `whisper` and `party` line kinds to `normal`. Player-authored group chat that fails party-name parsing falls back to a `system` line, which now uses `pre-wrap`. A party member can therefore draw a fake system line in other members' feeds.

Secondary issues:
- The `Stats:` line leaves out affix and craft-quality bonuses.
- Item counts are wrong for duplicate unstacked items.
- `pre-wrap`, used instead of the planned `pre-line`, also keeps leading and trailing whitespace. No test covers this.
- Bare `look` (pre-existing, unchanged) still lists other characters' personal nodes.
- Behavior-level tests are missing.

## Critical Issues

### CR-01: A partial NPC, enemy or player match beats an exact node or item match, so node keyword clicks describe the wrong entity

**File:** `spacetimedb/src/helpers/examine.ts:147-175` (test pinning it: `spacetimedb/src/helpers/examine.test.ts:251-258`)

**Issue:** The client sends a node keyword click as the name only: `useConsole.ts:397` sends `look at ${name}`, with no node id. `describeLookTarget` then runs NPC (exact or `includes`), enemy (`includes`) and player (`includes`) checks before it looks at nodes. Any NPC, enemy or player at the location whose name contains the node name wins.

Node names are short material names, for example `Stone`, `Sand`, `Wood`, `Resin` and `Clear Water` (`location.ts:69-79`). Collisions are therefore likely:
- A "Stone Golem" or "Sand Wurm" enemy captures a click on `Stone` or `Sand`, and the player gets `You study Stone Golem. Level ...` instead of the node.
- A player named "Woodrow" or "Sandy" captures a click on `Wood` or `Sand`, and the player gets `Woodrow, Level 3 ...`.

This contradicts the success criterion: "Clicking an underlined resource-node name ... shows the node's name, its state ... and what gathering it yields".

The same flaw exists between (d) and (e): a partial node match (`return describeNode(...) ?? describeItem(...)`) beats an exact match on a carried item. The exact-before-partial rule is applied only inside each category, never across categories.

**Fix:** Run two passes, exact matches across every category first and partial matches second. Keep the category order within each pass so an exact NPC still wins ties:
```ts
export function describeLookTarget(ctx: any, character: any, target: string): string | null {
  const t = target.toLowerCase();
  return describeAll(ctx, character, (name) => name.toLowerCase() === t)
      ?? describeAll(ctx, character, (name) => name.toLowerCase().includes(t));
}
// describeAll runs npc -> enemy -> player -> node -> item with the given predicate.
```
Alternatively, have node keyword clicks send an id-specific examine. Add a test where an enemy named "Stone Golem" and a node named "Stone" share a location, and `describeLookTarget(ctx, ME, 'Stone')` must contain `Gathering yields`.

### CR-02: Player-authored group chat can still draw fake system lines (T-a3d-03 mitigation incomplete)

**File:** `src/console/FeedLine.vue:146-157`. Cross-file paths: `src/console/lines.ts:223-235`, `src/console/FeedView.vue:43-48`, `src/game/gameData.ts:536`, `spacetimedb/src/reducers/commands.ts:568-574`

**Issue:** The new rule pins `normal` wrapping by line kind (`.line-echo/.line-say/.line-whisper/.line-party .body`). Player-authored rows do not always become those kinds:
- `lines.ts:223-229`: a `group` row whose sender is not in `partyNames` becomes a `system` line. `partyNames` comes from `knownCharacters`, which is party-keyed (`gameData.ts:536`, `keyedIdList(partyKey, ...)`). Every historical chat row from a member who has left the group, or a row that arrives before the member's character row has synced, is re-classified as `system`.
- `lines.ts:233-235`: `command` echo rows (`> ${raw}`) become `system` lines. These are self-only and low impact.

The base `.body` is now `white-space: pre-wrap`, so those `system` bodies render embedded newlines. The server does not strip newlines: `group_message` stores `${character.name}: ${trimmed}` as-is (`commands.ts:568-574`), and `trim()` removes only leading and trailing whitespace.

Attack sequence:
1. A party member sends `ok\nYou have been removed from the group.` (or any fake system notice) through a modified client.
2. The member leaves the group.
3. Every remaining member's feed recomputes the row as a 12px neutral `system` line. The second line renders on its own with no `Name:` prefix and looks exactly like a genuine system message.

The FeedLine comment ("a typed newline cannot draw a fake second line") and the SUMMARY's "Threat Flags: None" are therefore wrong. No test covers this path.

**Fix:** Defend in depth:
1. Server: reject or collapse newlines in player chat payloads.
   ```ts
   const trimmed = args.message.replace(/[\r\n  ]+/g, ' ').trim();
   ```
   Apply this in `group_message`, `say`, whisper and emote, and in the `submit_intent` command echo.
2. Client: give player-authored fallbacks a distinct marker so CSS can pin them. For example, have `lines.ts` emit the unparsed `group` row and the `command` row with a `playerAuthored: true` flag, which FeedLine renders as `line-player-text`. Then add:
   ```css
   .line-player-text .body { white-space: normal; }
   ```
3. Add a mount test: a `group` entry from a non-member containing `\n` must not render as a pre-wrap `system` body.

## Warnings

### WR-01: The `Stats:` line leaves out affix and craft-quality bonuses

**File:** `spacetimedb/src/helpers/examine.ts:119-137`

**Issue:** Stats come only from `item_template`. Real item power also includes `item_affix` rows: prefixes and suffixes such as "of Haste", and craft-quality implicit affixes (see `helpers/items.ts:301-316` and `getEquippedWeaponStats` at 325-339). For example, an examined "Reinforced" sword or a "Sturdy ... of Haste" jerkin reports lower damage and stats than it actually has. The `displayName` advertises the affix while the stats line omits it. The plan copied the INVENTORY block's stat set, which has the same gap, but examine presents its line as the item's stats.

**Fix:** Sum the affixes through the existing index:
```ts
for (const a of ctx.db.item_affix.by_instance.filter(instance.id)) {
  // add a.magnitude to the matching statKey bucket (strBonus, dexBonus, ..., weaponBaseDamage)
}
```
Then build the list from the totals. Add a test with one affix row.

### WR-02: The carried count is wrong for duplicate unstacked items, and the chosen instance is arbitrary

**File:** `spacetimedb/src/helpers/examine.ts:88-115`

**Issue:** `candidates.find(...)` takes the first matching instance in `by_owner` order and reports only that instance's `quantity`. Several separate instances of the same item (non-stackable gear, or one equipped plus one in the pack) produce:
- "You carry one." when the character carries three;
- "You have it equipped." or "You carry one." depending on index order.

**Fix:** Collect every instance whose display or template name matches the chosen hit. Sum their quantities for the carry line, and add the equipped status separately, for example `You carry 3 (one equipped).`. Add a test with two instances of the same template.

### WR-03: `pre-wrap` keeps leading and trailing whitespace for every server kind, with no trim and no test

**File:** `src/console/FeedLine.vue:146-149` (plan contract: `261006-a3d-PLAN.md:33,49,278`)

**Issue:** The plan specified `pre-line`. The executor switched to `pre-wrap` to keep `help` indentation. `pre-wrap` also keeps trailing newlines, leading newlines and runs of spaces. It now applies to `keeper`, `npc`, `system`, `warning`, `quest`, `damage` and `combat` bodies. `cleanServerText` does not trim, and unsegmented server rows (for example `npc` rows such as `${npc.name}: ${rootOption.npcResponse}` at `commands.ts:216`, or `narrative` rows) are not guaranteed to be trimmed. Effects:
- A trailing `\n` adds a blank row.
- On a quoted NPC line, the closing `”` (`FeedLine.vue:127`) drops onto its own line.
- Leftover double spaces from removed `{{color}}` tokens become visible.

The only mount test covers a hand-built `system` line, so none of these cases is checked.

**Fix:** Trim leading and trailing whitespace on server-kind text before rendering, in one place (for example in `classifyByKind`, after `cleanServerText`, using `text.replace(/^\n+|\s+$/g, '')`, which keeps leading indentation). Alternatively, use `pre-line` and indent `help` with a non-collapsing character. Add mount tests for a quoted `npc` line and a `keeper` line with trailing newlines.

### WR-04: Bare `look` still lists other characters' personal nodes (pre-existing, outside the diff)

**File:** `spacetimedb/src/helpers/look.ts:89-100` (unchanged, but now inconsistent with `examine.ts:47-52`)

**Issue:** `buildLookOutput` lists every `available` node at the location without filtering on `characterId`. Another character's personal node therefore appears as `Gather Iron Shard`. The new examine path correctly hides that node, so `look iron shard` then answers "You don't see ..." or describes an inventory item instead. This breaks the review's privacy rule ("never reveal another character's personal nodes"), and the two look paths now disagree.

**Fix:** Apply the same visibility filter in `look.ts`:
```ts
.filter((r: any) => r.state === 'available' && (r.characterId == null || r.characterId === character.id))
```
Ideally, share a single `isNodeVisibleTo(node, character)` helper with `examine.ts`.

### WR-05: Test gaps around the shipped behavior

**File:** `spacetimedb/src/helpers/examine.test.ts:295-302`, `spacetimedb/src/reducers/intent.test.ts:213-250,685`, `src/console/FeedLine.test.ts:400-438`

**Issue:**
- The intent wiring guard only checks that substrings exist in `intent.ts`. No reducer-level test covers that:
  - `look at` with nothing after it falls back to bare look;
  - a miss calls `fail` with `lookMissLine(target)` and the stripped target;
  - a hit appends a `look` private event.
- `intent.test.ts` still tests a copied regex literal (`/^(?:look|l)(?:\s+(.+))?$/i`) that production no longer uses (`examine.ts:4`). It will silently drift.
- No test covers precedence across categories (CR-01), the group fallback carrying a newline (CR-02), affixes (WR-01), duplicate instances (WR-02), or whitespace on non-system kinds (WR-03).
- The FeedLine CSS contract asserts `.line-scene` pre-wrap but not `.line-ripple`.

**Fix:**
- Add a reducer-level test that drives `submit_intent` with the strict mock db for the three LOOK outcomes.
- Make `intent.test.ts` import `parseLookCommand` instead of re-declaring the regex.
- Add the regression tests named in CR-01, CR-02, WR-01, WR-02 and WR-03.

## Info

### IN-01: The `TYPE_LABELS` lookup reads the object prototype

**File:** `spacetimedb/src/helpers/examine.ts:41-45`

**Issue:** `TYPE_LABELS[key] ?? key.toLowerCase()` returns `Object.prototype` members for keys such as `constructor` or `toString`. A template slot with one of those values would render as `function Object() { [native code] }`. Slots come from server and LLM-generated templates. This is unlikely, but the lookup is not total.

**Fix:** `Object.prototype.hasOwnProperty.call(TYPE_LABELS, key) ? TYPE_LABELS[key] : key.toLowerCase()`, or use a `Map`.

### IN-02: A lone article or "at" becomes a one-word partial-match target

**File:** `spacetimedb/src/helpers/examine.ts:14-15`

**Issue:** `look the`, `look at the`, `look a` and `look at at` produce the targets `the`, `the`, `a` and `at`, because the article strip needs trailing whitespace and "at" is stripped only once. These then `includes`-match the first NPC, enemy or player name containing the letters, such as "Theron" or "Mara".

**Fix:** Treat a remaining lone article or `at` as bare look, or require a minimum target length for partial matching.

### IN-03: Unmapped vocabulary slots fall back to raw keys

**File:** `spacetimedb/src/helpers/examine.ts:23-45`

**Issue:** The slots `resource`, `food` and `quest`, used in `items.ts:60`, `hunger.ts:30` and `items_crafting.ts:362`, have no label. They render as "Common resource." or "Common food.", and a camelCase slot would be lower-cased into a single word (for example `twohand`).

**Fix:** Add labels for every slot in the mechanical vocabulary, and test the fallback.

### IN-04: Ambiguous partial matches pick silently

**File:** `spacetimedb/src/helpers/examine.ts:53-56, 91-95`

**Issue:** With several partial matches (for example `look shard` with "Iron Shard" and "Copper Shard" carried), the first row in index order wins and the player gets no hint that others exist. The result is deterministic, but it is not discoverable.

**Fix:** When the partial pool has more than one distinct name, append a line such as `Also here: Copper Shard.`, or ask the player to be more specific.

### IN-05: Quirks in the code moved verbatim

**File:** `spacetimedb/src/helpers/examine.ts:148-150`

**Issue:**
- The NPC test `=== targetLower || includes(targetLower)` is redundant.
- The NPC output keeps `[Name]:` bracket markup, contrary to the "no bracket markup in new lines" rule. It is an old string, so it relies on client cleaning.
- The block uses repeated `(npc as any)` casts.
- A missing NPC description renders as `[Name]: undefined`.

These were accepted as byte-identical in the plan, but they are noted here for a later cleanup.

### IN-06: The plan contract and SUMMARY disagree with the shipped code

**File:** `.planning/quick/261006-a3d-examine-nodes-and-items-and-keep-line-br/261006-a3d-SUMMARY.md:46-49,82-84`

**Issue:**
- The plan's `must_haves.artifacts` says FeedLine.vue `contains: "white-space: pre-line"`, but the shipped code uses `pre-wrap`. The deviation is documented, but the artifact check is now false.
- "Threat Flags: None" contradicts CR-02.

**Fix:** Update the SUMMARY's threat section after CR-02 is fixed.

---

_Reviewed: 2026-10-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
