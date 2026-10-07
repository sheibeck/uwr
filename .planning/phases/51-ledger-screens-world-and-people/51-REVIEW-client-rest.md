---
phase: 51-ledger-screens-world-and-people
reviewed: 2026-10-07T10:15:28Z
depth: deep
scope: "git diff 3ecb1520..HEAD -- src ':!src/map' ':!src/module_bindings' (client rest: rails, frame, console, combat, session, screens, styles guards; plus the Phase 50 iteration-3 fixes in crafting, inventory and ledger that fall in the same range)"
files_reviewed: 78
files_reviewed_list:
  - src/App.vue
  - src/combat/EncounterPanel.test.ts
  - src/combat/EncounterPanel.vue
  - src/console/FeedLine.test.ts
  - src/console/FeedView.test.ts
  - src/console/keywordLabel.ts
  - src/console/useConsole.test.ts
  - src/console/useConsole.ts
  - src/crafting/CraftingScreen.test.ts
  - src/crafting/CraftingScreen.vue
  - src/crafting/ReagentPicker.vue
  - src/crafting/RecipeDetail.test.ts
  - src/crafting/RecipeDetail.vue
  - src/crafting/SalvageDetail.vue
  - src/crafting/SalvageList.vue
  - src/crafting/SalvageTab.test.ts
  - src/crafting/craftingModel.test.ts
  - src/crafting/craftingModel.ts
  - src/crafting/salvageModel.test.ts
  - src/crafting/salvageModel.ts
  - src/frame/AppFrame.layout.test.ts
  - src/frame/AppFrame.populated.test.ts
  - src/frame/AppFrame.screens.test.ts
  - src/frame/AppFrame.vue
  - src/frame/ContextRail.test.ts
  - src/frame/LocationRow.test.ts
  - src/frame/LocationRow.vue
  - src/frame/Sheet.test.ts
  - src/frame/Sheet.vue
  - src/frame/TabBar.test.ts
  - src/frame/frameContract.test.ts
  - src/frame/frameControls.test.ts
  - src/game/context.ts
  - src/gameDataAlias.test.ts
  - src/inventory/Inspector.component.test.ts
  - src/inventory/Inspector.vue
  - src/inventory/InventoryScreen.test.ts
  - src/inventory/InventoryScreen.vue
  - src/inventory/backpack.test.ts
  - src/inventory/backpack.ts
  - src/inventory/inspector.ts
  - src/ledger/InlineConfirm.vue
  - src/ledger/ResultCard.vue
  - src/ledger/ResultCardDialog.test.ts
  - src/ledger/SegTabs.vue
  - src/ledger/ledgerContext.ts
  - src/ledger/ledgerData.test.ts
  - src/ledger/ledgerData.ts
  - src/ledger/parts.test.ts
  - src/ledger/resultCard.test.ts
  - src/ledger/resultCard.ts
  - src/ledger/salvagePreview.test.ts
  - src/ledger/salvagePreview.ts
  - src/ledger/useActionResult.test.ts
  - src/ledger/useActionResult.ts
  - src/rails/ContextContent.test.ts
  - src/rails/ExitChips.test.ts
  - src/rails/ExitChips.vue
  - src/rails/HereCard.test.ts
  - src/rails/HereCard.vue
  - src/rails/NearbyList.test.ts
  - src/rails/NearbyList.vue
  - src/rails/PartyBlock.test.ts
  - src/rails/PartyBlock.vue
  - src/rails/exits.test.ts
  - src/rails/exits.ts
  - src/rails/nearby.test.ts
  - src/rails/nearby.ts
  - src/rails/party.test.ts
  - src/rails/party.ts
  - src/rails/useExits.ts
  - src/screens/MapScreen.vue
  - src/screens/screens.test.ts
  - src/screens/screens.ts
  - src/session/useSession.test.ts
  - src/session/useSession.ts
  - src/styles/designContract.test.ts
  - src/styles/tokens.client.test.ts
findings:
  critical: 0
  warning: 6
  info: 9
  total: 15
status: issues_found
---

# Phase 51: Code Review Report (client rest)

**Reviewed:** 2026-10-07T10:15:28Z
**Depth:** deep
**Files Reviewed:** 78
**Status:** issues_found

## Summary

I reviewed the client changes outside `src/map` and `src/module_bindings`: the rail rows (Examine eye, Talk, the bind stone row with Bind), the eye beside `HostileCard`, `ConsoleApi.look`, `GameReducers.bindLocation`, the `Talk to` keyword label, party stamina (`party.ts`, `PartyBlock.vue`), the rail travel panel (`HereCard.vue`, `exits.ts`, `useExits.ts`), `LocationRow` and `ExitChips` on mobile, the AppFrame, screen and frameControls changes for the Map, the session wiring of the map hub, and the guard-test changes. I traced calls into `src/map/travelChecks.ts`, `src/map/mapData.ts`, `src/map/danger.ts`, `src/ledger/actionRunner.ts`, the console's `fire` path, and the server's `performTravel`, `bind_location`, the `bind` intent and `describeLookTarget`.

**What checks out:**
- **Travel.** It goes only through `consoleApi.travel`, and a row click only expands the row. One row (or chip) is open at a time.
- **Timers.** The chip, the lock and the clock read only the server's `travel_cooldown` rows and the server-sampled clock.
- **Follower blocks.** They match `performTravel`: all-or-nothing stamina for followers at the origin, and timers only on a crossing.
- **Bind.** The row changes only when the character row changes.
- **Reducer calls.** Both use object syntax.
- **XSS.** There is no `v-html`, and server strings render only as text nodes.
- **SVG guard.** The exemption is exactly the prefix `src/map/`, and sibling folders such as `src/mapping/` are still flagged.
- **Media guard.** The 1200px allowance for `src/map/` is actually used, by `MapScreen.vue`.
- **Inline-property guard.** The tokens guard is stricter than before.
- **Tests.** The adapted tests replace the old assertions rather than drop them.

The suites in scope pass: 79 files, 1630 tests.

No blockers. The defects are:
- a Bind rejection that fails silently;
- a focus flag that can go stale and later steal focus;
- focus lost to `body` after a trip from the mobile chips;
- a pending guard that is not shared between the travel surfaces;
- a gap in the colour guard that the new SVG allowance opens;
- `bind_location` skipping the combat rule that the `bind` intent enforces.

## Warnings

### WR-01: A rejected Bind is silent

**File:** `src/rails/NearbyList.vue:46`, `src/rails/NearbyList.vue:177-185`
**Issue:** Bind runs through `createActionRunner`, which counts a rejected promise in `runner.rejection` and returns `false` (`src/ledger/actionRunner.ts:39-44`). Nothing reads `runner.rejection` in NearbyList: there is no NoticeLine and no feed line, and the component comment says "Refusals and the server's line print in the feed", which is only true for `fail()` refusals.
**Failure scenario:** `bind_location` throws a `SenderError` (for example `requireCharacterOwnedBy` after a character switch mid-flight), or the transport rejects. The Bind button flips back from inert to enabled, and the player gets no line at all. The UI-SPEC copy contract requires `Couldn't send that. Try again.` for a client rejection.
**Fix:** Surface the rejection the way the ledger screens do, for example:
```ts
watch(() => runner.rejection.value, () => game.feed.appendLocal('system', SEND_ERROR_TEXT));
```
Alternatively, render `<NoticeLine :rejection="runner.rejection.value" />` under the list. Add a test that rejects `bindLocation` and expects the line.

### WR-02: The focus-after-Bind flag can stay set and steal focus later

**File:** `src/rails/NearbyList.vue:159-169`, `src/rails/NearbyList.vue:182-184`
**Issue:** `focusAfterBind` is set whenever the promise resolves, and is cleared only when `boundHere` becomes true. `bind_location` uses `fail()` and returns normally when the place has no bind stone (`spacetimedb/src/reducers/characters.ts:129-132`), and it binds wherever the character stands when the reducer runs. The reducer takes no location argument.
**Failure scenario:**
1. A party member clicks `Bind` (labelled "Bind to Ember Gate").
2. The leader's `move_character` runs first, and the follower moves to a place without a stone.
3. `bind_location` fails with "No bindstone here" but resolves, so the flag stays `true`.
4. Later in the same session the player walks back to the place they are bound to. `boundHere` turns true, the watch fires, and focus jumps to that place's bind-stone eye. This races HereCard's own move of focus to the card title.

If the leader instead moves them to a place that has a stone, they are bound there and not at the place the button named.
**Fix:** Record the target when Bind is clicked, and reset the flag when the place changes:
```ts
let bindTarget: bigint | null = null;
// in bind(): bindTarget = game.character.value?.locationId ?? null; … if (ok) focusBindEye();
watch(() => game.character.value?.locationId, () => { bindTarget = null; });
function focusBindEye() {
  const c = game.character.value;
  if (bindTarget === null || !c || c.boundLocationId !== bindTarget || c.locationId !== bindTarget) return;
  bindTarget = null; void nextTick(() => …focus());
}
```
Separately, consider a server-side `locationId` argument on `bind_location`, so that the bind refuses rather than binding somewhere else.

### WR-03: The mobile exit chips drop focus to `body` after a trip

**File:** `src/rails/ExitChips.vue:31-37`, `src/rails/ExitChips.vue:103-142`
**Issue:** The card's Travel or Cross button is the focused element when the player travels. When the place changes, `openId` is reset, the card (`v-if="openRow"`) unmounts with the focused button, and focus falls to `document.body`. The same happens when a leader moves a follower while the card is open. HereCard handles this case by moving focus to its `tabindex="-1"` title (`HereCard.vue:55-65`), but ExitChips has no equivalent. The UI-SPEC rule "focus never falls to body" (Phase 50, reused in 51) is broken on the main mobile travel path.
**Fix:** In the place-change watch, check whether `document.activeElement` is inside the component root (flush `'pre'`, before the DOM updates). If it is, move focus after `nextTick` to a stable target: the first chip, or a `tabindex="-1"` name on `LocationRow`. Add a test like HereCard's "focus inside the card moves to the title".

### WR-04: The travel pending guard is per instance, so two surfaces can send two moves

**File:** `src/rails/useExits.ts:127-151`; callers `src/rails/HereCard.vue:18,38-41`, `src/rails/ExitChips.vue:18,64-67`; and the Map's separate `'travel'` runner (`src/map/useDestination.ts:130`)
**Issue:** Each `useExits()` call creates its own `pending` ref and 2s release timer. On mobile, the Here tab of the Map sheet (HereCard), the Story-screen chips (ExitChips) and the Map dock (its own runner) each guard only themselves.
**Failure scenario:**
1. On mobile the player taps Travel on the Here tab.
2. `consoleApi.travel` closes the sheet, and the chips become visible at once with their own `pending === false`.
3. A quick chip tap followed by Travel sends a second `move_character` before the first one's character row arrives.

The server re-checks adjacency, but if the second destination is also next to the first destination (a triangle of routes), the character moves twice and pays stamina twice. The same happens between the dock's Travel and the Here tab's Travel, since the dock keeps the sheet open.
**Fix:** Keep one in-flight flag per character in a shared place. One option is to put it in the console and have `consoleApi.travel` ignore calls until the location changes or a timeout passes. Another is to put it on the map hub and have `useExits` and `useDestination` read it. Test that two surfaces cannot each send a move within one round trip.

### WR-05: The SVG allowance opens a hole in the literal-colour guard

**File:** `src/styles/designContract.test.ts:251-270`; `src/styles/cssContract.ts:107-108,156-164`; `src/styles/colors.guard.test.ts:80-82`
**Issue:** The CONTEXT decision is that SVG is allowed in `src/map/` but "the SVG still uses tokens, never literal colors". Template text is checked only by `textColorOffenders`, and that matches only hex and functional notations (`#…`, `rgb(`, `oklch(` and so on). Named colours are checked only inside `<style>` declarations by `colorOffenders`. So a template such as:
```html
<line stroke="crimson" /> <rect fill="white" /> <polyline :stroke="'gold'" />
```
in any `src/map/*.vue` file passes every guard. Before this phase, `<svg>` was banned everywhere, so presentation attributes were not a reachable channel. Now they are the natural way to colour SVG.
**Fix:** Add a guard for `.vue` templates under `SVG_FOLDER`. Every `fill`, `stroke`, `stop-color`, `flood-color`, `lighting-color` or `color` attribute, static or bound to a string literal, must be `none`, `currentColor`, `transparent` or `var(--…)`. Also run the `NAMED_COLORS` word check over attribute values in those templates. Optionally pin the allowed SVG element names to the set `GraphPlane` uses (`svg`, `rect`, `line`, `polyline`), so `foreignObject`, `image` and `a` stay out.

### WR-06: The Bind button calls a reducer that skips the combat rule the `bind` intent enforces

**File:** `src/rails/NearbyList.vue:171-185` (client); `spacetimedb/src/reducers/characters.ts:126-141` vs `spacetimedb/src/reducers/intent.ts:1328-1331`
**Issue:**
- The typed `bind` intent refuses in combat ("You cannot bind while in combat.") and handles "already bound". `bind_location`, which the new Bind button calls, has neither check.
- On the client, `bindBlocked` does not include `game.combat.active`. The rail hides Nearby in combat only after the combat row arrives.
**Failure scenario:** A party member pulls, or an enemy aggroes, and the server starts combat. The player clicks Bind before the client swaps the rail to the Encounter panel. The bind is applied mid-fight, which the same server forbids through the intent path. The two paths also print different success lines ("You are now bound to …" vs "You bind your soul to the stone at …").
**Fix:** Server: add `if (activeCombatIdForCharacter(ctx, character.id)) return fail(ctx, character, 'You cannot bind while in combat.');` to `bind_location`, or have both paths share one helper. Client: add `game.combat.active.value` to `bindBlocked`, and the same check in `bind()`.

## Info

### IN-01: Dead or duplicated fields in the exits model

**File:** `src/rails/exits.ts:48-49,66,170,178`; `src/rails/useExits.ts:39-40,153`; `src/rails/ExitChips.vue:42-51,137-140`
**Issue:**
- `ExitRow.rightColor` and `ExitButton.fullLabel` are only read by tests.
- `ExitsPanel.pending` is returned but no component reads it.
- ExitChips rebuilds the full label in its template, and gets seconds back by parsing the formatted clock (`clockSeconds(row.button.timeText)`), although the block already carries `secondsLeft`.

**Fix:** Drop the unused fields, or use them. Carry `secondsLeft` (or the minute sentence) on `ExitButton` instead of re-parsing `m:ss`.

### IN-02: The pending state is invisible in the rail and chips

**File:** `src/rails/HereCard.vue:160-174`, `src/rails/ExitChips.vue:127-141`
**Issue:** While a trip is pending, the Travel or Cross button stays enabled in markup, and a second press silently does nothing. The Map's DetailPanel and MapDock set `aria-busy` while their runner is pending.
**Fix:** Bind `aria-busy`, or `aria-disabled`, to `pending` for consistency.

### IN-03: The follower-timer copy reads as your own timer

**File:** `src/rails/ExitChips.vue:106-118`, `src/rails/exits.ts:103-112`
**Issue:** When only a follower's timer blocks the crossing, the mobile card says `Region travel ready in {m:ss}. Moving within {Region} is fine.`, and the rail note says `Region travel in {m:ss}`. Neither names who is waiting. The Map checklist does: `{name} can't cross yet`.
**Fix:** For `followerTimer`, use the region check's label from `checks.checks`.

### IN-04: An exit row's accessible name loses the lock when gathering outranks the timer

**File:** `src/rails/exits.ts:155-159,207-212`
**Issue:** `exitLabel` appends the minute sentence only when `row.note.srText` is set. When gathering is also true, the block is `gathering` and `srText` is null, yet the row still visibly shows the lock and clock (`locked` comes from `checks.selfTimer`).
**Fix:** Build the lock sentence from `checks.selfTimer` whenever `locked` is true.

### IN-05: The mobile location line reads its separators aloud

**File:** `src/frame/LocationRow.vue:35`
**Issue:** `· {Terrain} ·` is plain text, so screen readers say "dot Woods dot". HereCard hides its separator (`.sub-sep aria-hidden`).
**Fix:** Wrap each `·` in `<span aria-hidden="true">`.

### IN-06: Vendor arguments leak into the Map when switching by header or tab

**File:** `src/frame/AppFrame.vue:48-56`
**Issue:** The sync watch clears `screenArgs` only when the new screen takes no arguments. Opening the Map from the header toggle or the tab bar while the vendor is open keeps `{ npcId, npcName }` as the Map's arguments. It is harmless today, because `applyArgs` falls back to the default. But it contradicts the comment, and `frameControls.test.ts` "each keep only their own arguments" only covers the `openScreen` path.
**Fix:** Clear on any change of the active id. `openScreen` sets the arguments again after `open`:
```ts
watch(screens.active, (id, prev) => { if (id !== prev) screenArgs.value = null; }, { flush: 'sync' });
```

### IN-07: Examine in the mobile encounter sheet closes the encounter sheet

**File:** `src/combat/EncounterPanel.vue:63-66` → `src/console/useConsole.ts:393-399`
**Issue:** `consoleApi.examine` always calls `frame.closeScreen()`. In the mobile `sheet` variant that closes the encounter sheet mid-fight. The UI-SPEC covers only the Here tab ("the sheet closes first").
**Fix:** Confirm the intent with the owner. If the encounter sheet should stay open, skip `closeScreen` when the active screen is `'encounter'`.

### IN-08: Uncharted exits have an empty right-hand column

**File:** `src/rails/HereCard.vue:139`, `src/rails/exits.ts:169`
**Issue:** `placeDanger` returns `levelLabel: ''` for uncharted places, so the row's right-hand side is blank. The chip shows `Danger unknown`, and the sub-line uses `dangerText`.
**Fix:** Use `danger.levelLabel || danger.word`, as `LocationRow` already does, or a short `?` with the word in the label.

### IN-09: Examine by name can hit another category with the same name

**File:** `src/rails/HereCard.vue:48-51` and `src/rails/NearbyList.vue:126-129` → `spacetimedb/src/helpers/examine.ts:237-290`
**Issue:**
- `describeLookTarget` tries NPC, enemy, player, node and item before neighbouring places, even in the exact-match pass. `Examine {place}` on a neighbour that shares its name with an NPC here, or with an item in the bag, describes the NPC or the item.
- Duplicate enemy names always resolve to the first spawn.

**Fix:** This is a server-side concern. If it matters, add typed look targets (for example `look at place {name}`) and have the eyes send them.

---

_Reviewed: 2026-10-07T10:15:28Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
