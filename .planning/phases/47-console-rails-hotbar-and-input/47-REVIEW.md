---
phase: 47-console-rails-hotbar-and-input
reviewed: 2026-10-05T00:00:00Z
depth: standard
files_reviewed: 56
files_reviewed_list:
  - src/App.vue
  - src/console/FeedLine.vue
  - src/console/FeedView.vue
  - src/console/KeeperProgress.vue
  - src/console/cleanServerText.ts
  - src/console/feedStore.ts
  - src/console/indicator.ts
  - src/console/keywordLabel.ts
  - src/console/keywords.ts
  - src/console/lines.ts
  - src/console/pinning.ts
  - src/console/useConsole.ts
  - src/console/whisper.ts
  - src/frame/AppFrame.vue
  - src/frame/ContextRail.vue
  - src/frame/FeedShell.vue
  - src/frame/VitalsRail.vue
  - src/frame/VitalsStrip.vue
  - src/frame/useKeyboardOpen.ts
  - src/game/bindEventTable.ts
  - src/game/context.ts
  - src/game/gameData.ts
  - src/game/keyedBinding.ts
  - src/game/queries.ts
  - src/game/serverClock.ts
  - src/hotbar/HotbarRow.vue
  - src/hotbar/HotbarSelector.vue
  - src/hotbar/hotbar.ts
  - src/hotbar/useCooldownTicker.ts
  - src/input/Composer.vue
  - src/input/commands.ts
  - src/input/conversation.ts
  - src/input/history.ts
  - src/input/infoCommands.ts
  - src/input/limits.ts
  - src/input/narrativeQueue.ts
  - src/input/routeInput.ts
  - src/rails/ContextContent.vue
  - src/rails/EffectChips.vue
  - src/rails/HereCard.vue
  - src/rails/NearbyList.vue
  - src/rails/PartyBlock.vue
  - src/rails/TrackingList.vue
  - src/rails/WorldEventCard.vue
  - src/rails/effects.ts
  - src/rails/levelRange.ts
  - src/rails/nearby.ts
  - src/rails/party.ts
  - src/rails/quests.ts
  - src/rails/worldEvent.ts
  - src/rails/xp.ts
  - src/screens/MapScreen.vue
  - src/screens/SocialScreen.vue
  - src/session/useSession.ts
  - src/styles/frame.css
  - src/styles/tokens.client.css
findings:
  critical: 0
  warning: 5
  info: 7
  total: 12
status: issues_found
---

# Phase 47: Code Review Report

**Reviewed:** 2026-10-05
**Depth:** standard
**Files Reviewed:** 56
**Status:** issues_found

## Summary

All 56 files were read in full, plus `net/bindTable.ts` and the generated reducer and event-table bindings they call.
`vue-tsc --noEmit` is clean and `vitest run` over src/console, input, game, hotbar, rails, frame, screens and session passes (63 files, 1180 tests).

Verified clean on the stated focus areas:

- **XSS:** there is no `v-html`, `innerHTML` or `eval` anywhere in the reviewed source. Every model, server and player string reaches the DOM through `{{ }}` or a `:title` / `:aria-label` binding. `:style` values are derived from numbers only. `<component :is>` resolves only to static maps (`ICONS`, `abilityIcon`, `effectIcon`, `getScreen`).
- **Keyword matcher:** it is a manual code-point scanner and never builds a regex from a name, so there is no ReDoS and no regex-syntax injection. The length-preserving fold keeps indexes valid. The vocabulary is capped at 200. Surrogates are handled. The parts always rejoin to the input. Player-authored kinds (`say`, `emote`, `whisper`, `group`, `command`) and local echoes are not keyword-eligible, so T-47-06 holds for the kinds the server writes today.
- **Subscriptions:** every event-table subscription except `event_world` is filtered (`eventPrivate` by `ownerUserId`, `eventLocation` by `locationId`, `eventGroup` by `groupId`). Every keyed table carries a WHERE on an indexed column. There is no unfiltered `SELECT *` anywhere.
- **Identity:** reducers receive only `game.characterId`, which comes from the player's own `characters` binding (filtered by `ownerUserId`). The client never sends another identity.
- **Reducer args:** every reducer argument name and shape matches `src/module_bindings` (`targetName`, `fromName`, `hotbarName`, `abilityTemplateId`, `npcId`, `nodeId`, `locationId`, `text`, `message`).
- **Lifecycle:** the cooldown ticker interval, the progress rotation interval, the keyboard `visualViewport` listener, the document key listeners, the flash timers and the world-event timer are all cleared on unmount or scope dispose.

No BLOCKER-class defects were found. The five warnings are correctness and robustness gaps in the stale-data and queue paths. The seven info items are minor.

## Warnings

### WR-01: The client-side second filter does not check the row's location, group or owner

**File:** `src/console/feedStore.ts:89-110` (with `src/game/gameData.ts:227-246`)
**Issue:** The header calls `acceptRow` the second, client-side filter after the subscription filter (T-47-04a). It never looks at `row.locationId`, `row.groupId` or `row.ownerUserId`, although all three exist on the generated rows.

`bindEventTable` attaches its listener to the table-wide `onInsert`, so the listener sees every row the SDK delivers for that table, not only rows from its own subscription.

On a location change `keyedEvent` uses `swap: 'immediate'`. The new binding subscribes and listens first, then the old binding is unsubscribed. Rows the server already sent for the old location can still arrive after the swap. They pass `acceptRow('location')`, because only `excludeCharacterId` is tested, and appear in the new location's feed.

The same window exists when a player leaves or joins a group (`event_group`) and on any reconnect overlap. This is a straggler leak, not a security hole, because the event tables are already public server-side. It does defeat the stated purpose of the second filter.

**Fix:** Carry the key on the row and have the binding's `onRow` drop rows that do not match the key the binding was made for:
```ts
// gameData.ts, keyedEvent: make(k) => bindEvent({ ..., onRow: (row) => {
//   if (matches(row, k)) onEvent(source)(row);
// }})
// with matches: location -> row.locationId === k; group -> row.groupId === k;
// private -> row.ownerUserId === k
```
Add `locationId?`, `groupId?` and `ownerUserId?` to `EventRowLike`, or pass a `matches` predicate into `keyedEvent` the way `keyedTable` already does.

### WR-02: A stale `settle()` from a dropped send clears `inFlight` for a newer send

**File:** `src/console/useConsole.ts:191` and `:216` (with `src/input/narrativeQueue.ts:61-71`)
**Issue:** `void sent.finally(queue.settle)` is unconditional. `queue.drop()`, called on disconnect, on a character change and from `dispose`, sets `inFlight = false` while the old reducer promise is still pending.

If the player then makes a new direct send, `beginDirect()` sets `inFlight = true`. When the old promise finally settles it clears the flag. `mustQueue()` then returns false although a send is in flight. The next narrative line goes out concurrently and a queued line can be released early. That breaks the one-at-a-time release guarantee.

The window is narrow (a reconnect or character switch overlapping a pending reducer call), but a reconnect is exactly when reducer promises hang longest.

**Fix:** Give each send a generation token:
```ts
// narrativeQueue: let generation = 0;
// beginDirect()/takeNext(): return ++generation; drop(): generation++;
// settle(token): if (token === generation) inFlight.value = false;
// useConsole: const token = queue.beginDirect(); sent.finally(() => queue.settle(token));
```

### WR-03: A refused submit still ends the conversation

**File:** `src/console/useConsole.ts:295-298`
**Issue:** For an `intent` route, `if (route.endsConversation) conversation.value = null` runs before `narrativeSend`. `narrativeSend` returns `'refused'` when the queue is full (`QUEUE_FULL_LINE`) and the draft is deliberately kept.

The line was not sent and stays in the input, yet the player has silently left the conversation. Their retry then routes as a plain intent or hail instead of a game action in conversation. The `hail` case at line 309 already guards on `result !== 'refused'`.

**Fix:** Clear the conversation only after the send is accepted:
```ts
result = narrativeSend({ ... });
if (route.endsConversation && result !== 'refused') conversation.value = null;
```
For the non-queue branch, which always sends, clear it right after `fire`.

### WR-04: A party member with no character row renders a blank name

**File:** `src/rails/PartyBlock.vue:53`
**Issue:** For `known === false`, `partyMembers` returns `name: ''` and `className: ''`. The template renders `{{ member.name }}`, so the visible row is an empty dimmed card. `memberLabel()` ('Member') exists and is used only for the aria-labels, and `VitalsStrip.memberChipText` correctly falls back to 'Member'. The existing test checks only the `unknown` class and the empty tracks, not the visible text.

Unknown members are routine: the `known` id-list binding applies after the group-member binding, and an offline or out-of-range member may never get a row.

**Fix:**
```vue
<span class="member-name" :title="memberLabel(member)">{{ memberLabel(member) }}</span>
```
Add a test that the unknown member row reads 'Member'.

### WR-05: Swap-on-applied has no failure path, so stale rows stay forever

**File:** `src/game/keyedBinding.ts:77-98`
**Issue:** When the key changes with a current binding present (and `swap` is `'onApplied'`), the new binding becomes `pending` and is promoted only when `applied` turns true. `AttachableBinding` exposes no `failed`. If the new subscription errors (a rejected query, a dropped subscription), the old rows remain the "current" data indefinitely, with only a `console.warn`.

This affects everything the player acts on, and the actions are keyed to those stale rows:

- Nearby, `routeContext.npcsHere` and the keyword vocabulary keep describing the old location, so `hail` and `gather` clicks use the old ids.
- The route list also stays stale.
- The same applies to hotbar and ability data when the key is the character.

**Fix:** Add `failed` to `AttachableBinding`. When the pending binding reports `failed`, promote it anyway (it clears the rows) or reset `current` to empty and retry. For example, in the pending watch use `watch(() => [binding.applied.value, binding.failed.value], ...)` and call `promote` when either is true.

## Info

### IN-01: Bare `accept` / `decline` inside a conversation never reach the NPC

**File:** `src/input/routeInput.ts:217-222`
**Issue:** Per CONTEXT, `accept` and `decline` with nothing after them are commands, and rule 3 runs before the conversation rule. With no pending group invite, `defaultInviter` returns `''` and `acceptGroupInvite({ fromName: '' })` is sent. A player answering an NPC's quest offer with the single word "accept" gets a group-invite refusal, not a reply.

This matches the written spec but is a likely UX trap. **Fix:** When `ctx.pendingInviterNames` is empty, fall through to the conversation or intent path instead of returning the reducer route. Tests would need to cover that case.

### IN-02: Safari IME composition commit can submit the line

**File:** `src/input/Composer.vue:62-69`
**Issue:** The `Enter` guard relies on `event.isComposing`. Safari reports `isComposing === false` with `keyCode === 229` for the Enter that commits an IME composition, so a CJK or other IME user can send a half-composed line. **Fix:** Also bail when `event.keyCode === 229`.

### IN-03: Hotbar number keys use `event.key`

**File:** `src/hotbar/HotbarRow.vue:190`
**Issue:** On layouts where the unshifted top row is not digits (AZERTY), `event.key` is `&`, `é` and so on, so slots 1-0 cannot be triggered from the keyboard. **Fix:** Match `event.code` (`Digit1`..`Digit0`, optionally `Numpad`) as well as `event.key`.

### IN-04: `inputFocused` can stick at true when the Composer unmounts focused

**File:** `src/input/Composer.vue:111-113`
**Issue:** `onBeforeUnmount` removes the document listener but does not reset `consoleApi.inputFocused`. A desktop-to-mobile breakpoint swap remounts `FeedShell` (the `v-if` in `AppFrame`), and browsers do not reliably fire `blur` on a removed element. `useKeyboardOpen` can then treat the input as focused until the next focus and blur. **Fix:** Set `consoleApi.inputFocused.value = false` in `onBeforeUnmount`.

### IN-05: Keyword surface that depends on server and LLM text

**File:** `src/console/keywords.ts:99-130`, `src/console/useConsole.ts:369-377`
**Issue:** Two related observations, both within the design. Neither is an exploit today.

- Player names are letters-only, 3-20 characters (`creation.ts:612-627`). A player named after a common word ("Door", "Torch") gets a player keyword. NPC, place and node names win the dedupe, but a generic noun in Keeper narration becomes a whisper pre-fill button for everyone at that location. It is cosmetic noise.
- A `place` keyword click calls `moveCharacter` immediately, with no confirmation. Eligible `location`-source narrative text is LLM output that another player's input can influence, so a crafted intent could steer the narration toward containing an adjacent place name.

**Fix:** Restrict `player` keywords to lines whose kind carries player names (`move`, `presence`, `system`), and consider a one-step confirm for travel keywords that come from `location`-source lines.

### IN-06: No timeout on a reducer promise that holds `inFlight`

**File:** `src/console/useConsole.ts:187-192`
**Issue:** `inFlight` is released only when the reducer promise settles or `drop()` runs (on disconnect). A reducer call that never resolves on a live connection leaves every later narrative line queued. After three lines, every further narrative line is refused ("Wait for the Keeper to finish first.") until a reconnect. **Fix:** Cap the in-flight hold with a timer (for example 15 s, matching `SIGNIN_TIMEOUT_MS`) that calls `settle(token)`.

### IN-07: Server clock skew is 0 until the first event row

**File:** `src/game/serverClock.ts:15-26`
**Issue:** `skewMicros` starts at 0 and is sampled only from event rows. The first `look` row usually arrives within moments, but until then cooldown sweeps use the raw client clock. A client clock behind the server shows lingering, already-expired `ability_cooldown` rows as cooling at the full duration, up to the clock offset. After the first sample it self-corrects. **Fix:** None needed beyond awareness. Optionally treat the clock as "unsynced" and suppress sweeps until the first `sample()`.

---

_Reviewed: 2026-10-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
