---
phase: 48-combat-encounter
plan: 11
subsystem: client-desktop-chrome
tags: [vue-client, header, vitals, party, combat]
status: complete
requires: ["48-10"]
provides:
  - "InCombatTag: 'In combat · Round N' header tag (health tint, 6px dot, aria-label from inCombatLabel)"
  - "HeaderBar inCombat and roundNumber props: combat-locked screen buttons (aria-disabled, 'Unavailable in combat', 45% opacity, focusable, click ignored); native disabled prop untouched"
  - "selfCardView and PartyBlock ally targeting: in combat and in a party, a 'You' card first and every known member as a button with aria-pressed, wired to COMBAT_KEY selectAlly and allyTargetId"
  - "VitalsRail HP damage flash on useDamageFlash: ghost chunk, fill and value colour, summed delta; static flash-reduced class under reduced motion"
affects: [48]
tech-stack:
  added: []
  patterns: ["combat gated on game.combat.active, never inCombat", "reduced-motion path is a timed static class with no animation or transition declared", "components bind composable refs and render text nodes only"]
key-files:
  created:
    - src/combat/InCombatTag.vue
  modified:
    - src/frame/HeaderBar.vue
    - src/frame/HeaderBar.test.ts
    - src/frame/AppFrame.vue
    - src/frame/AppFrame.layout.test.ts
    - src/rails/party.ts
    - src/rails/party.test.ts
    - src/rails/PartyBlock.vue
    - src/rails/PartyBlock.test.ts
    - src/frame/VitalsRail.vue
    - src/frame/VitalsRail.test.ts
key-decisions:
  - "Header lock uses a new inCombat prop with aria-disabled; the native disabled prop and its Phase 45 test are unchanged"
  - "PartyBlock renders one card loop with a dynamic tag (button in combat for known members, div otherwise), so the out-of-combat DOM is the Phase 47 DOM"
  - "VitalsRail latches the flash key: a sync watcher on the hp prop (declared before useDamageFlash) and a pre-flush watcher on game.characterId set it. The component is fed by props that lag the game refs by a render, so reading game.characterId directly would turn a switch into a false drop"
  - "The delta sits in a .readout wrapper beside .value so .value and .fill counts and texts stay as pinned in Phase 45/47"
requirements-completed: [CMB-05]
metrics:
  tasks: 3
  files: 11
  completed: 2026-10-06
---

# Phase 48 Plan 11: Header tag, ally targeting and damage flash Summary

The desktop combat chrome is finished: the header announces the fight and its round and locks the screen buttons without trapping focus, the vitals-rail party cards become ally-target buttons in combat, and the HP bar flashes on damage with a summed delta (static colour change only under reduced motion). Client only: nothing under `spacetimedb/` or `src/module_bindings/` changed.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | In combat header tag and locked screen buttons | 43e4d7e8 | InCombatTag.vue, HeaderBar.vue (+test), AppFrame.vue, AppFrame.layout.test.ts |
| 2 | Ally targeting on the party cards | 37d89125 | party.ts (+test), PartyBlock.vue (+test) |
| 3 | Damage flash on the HP bar | 94d23f39 | VitalsRail.vue (+test), AppFrame.layout.test.ts (type fix) |

## What was built

- **InCombatTag**: `span.tag.in-combat-tag` with an aria-hidden 6px dot and the `inCombatLabel` text ('In combat · Round 3', or 'In combat' with a null round); fill and text are `color-mix` of `--color-health`; no animation. It sits after the location and before the time of day.
- **HeaderBar**: optional `inCombat` and `roundNumber` props. In combat each of the six screen buttons gets `aria-disabled="true"`, title 'Unavailable in combat', class `combat-locked` (opacity 0.45, default cursor), stays focusable (no native `disabled`), and `onScreenClick` returns without emitting. `:disabled="props.disabled"` is exactly as before. The account button and the Level up / New skill tags are untouched. AppFrame passes `game.combat.active` and `game.combat.roundNumber`.
- **selfCardView**: pure; name 'You', the same mana-or-stamina rule as `partyMembers`, tested to equal the `partyMembers` view of the same character apart from name and leader.
- **PartyBlock**: `combatParty = game.combat.active && in a party`. Then the head shows `span.hint` 'Click to target' instead of Invite; cards are You first, then members; each known card is `button.member.ally` with `aria-pressed` (selected = card id equals `controller.allyTargetId`), `aria-label` 'Target {name} with your next ability', the `selected` class (inset accent ring and 12px glow), and `selectAlly(id)` on click; the right side is `{hp}/{max}` (12px, tabular-nums) instead of 'Lv N'. Unknown members stay dimmed `div`s reading 'Member'. Solo in combat is 'Not in a party.' with no You card. Out of combat it is the Phase 47 block.
- **VitalsRail flash** (health bar only): `useDamageFlash` drives `flash-motion` or `flash-reduced` on the bar, a `div.ghost` (aria-hidden, inline left and width) inside the now-relative track, and a `span.delta` ('−22', U+2212) after the value. Motion: 600 ms ghost fade, 400 ms fill and value keyframes from `--color-con-red`. Reduced: `.flash-reduced` sets fill and value to `--color-con-red` with no animation or transition (asserted statically over the rule bodies, and the file has no `transition` at all); a `prefers-reduced-motion` block also sets `animation: none` on the flash-motion rules, so an OS-level preference is honoured even if the class was applied.

## Pinned assertions changed deliberately

None. `HeaderBar.test.ts` 'disables all screen buttons when disabled' (native disabled) is unchanged, as are all Phase 47 `PartyBlock` and `VitalsRail` cases (effect chips still read `game.inCombat`). New cases were added to the same files. One earlier-phase style check holds: the 23-token pin and the design guards pass with the new styles.

## Verification

- `pnpm exec vitest run src/frame/HeaderBar.test.ts src/frame/AppFrame.layout.test.ts src/styles`: 103 passed. `pnpm exec vitest run src/rails src/styles`: 244 passed.
- `pnpm exec vitest run --dir src --maxWorkers=2`: 93 files, 1791 tests passed (1748 before). No new failures.
- `pnpm exec vue-tsc -b`: exit 0.
- Acceptance greps hold: HeaderBar.vue has `Unavailable in combat`, `combat-locked`, `InCombatTag`; PartyBlock.vue has `Click to target`, `selectAlly`, `aria-pressed`, `with your next ability`; party.ts has `export function selfCardView`; VitalsRail.vue has `useDamageFlash(`, `flash-reduced`, `flash-motion`, `prefers-reduced-motion`.
- The latch was proven load-bearing: with `key: () => game.characterId.value` the switch test fails; with the latch it passes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] False damage flash on a character switch**
- **Found during:** Task 3
- **Issue:** The plan binds `key` to `game.characterId` and `hp` to `props.hp`. The props update one render after the game refs, so a switch to a character with lower HP changed the key first (baseline taken from the old hp) and then delivered the new hp under the same key, which read as a drop. The plan requires a switch never to flash.
- **Fix:** A latched `flashKey` (sync watcher on `props.hp`, created before `useDamageFlash` so it fires first; pre-flush watcher on `game.characterId` so a switch with an unchanged hp still moves the key). `useDamageFlash(` is still called with `hp: () => props.hp`.
- **Files modified:** src/frame/VitalsRail.vue (+test: switch with lower hp, switch alone then a real drop)
- **Commit:** 94d23f39

**2. [Rule 1 - Bug] vue-tsc error in my own Task 1 test**
- **Issue:** `w.get(...).exists()` does not type-check. Committed in 43e4d7e8, caught by `vue-tsc -b` before the Task 3 commit.
- **Fix:** `w.find(...)`. **Commit:** 94d23f39

Otherwise the plan was executed as written. Note: in the app the frame is remounted per character (the picker is a separate screen), so the latch is defensive; the contract note from 48-03 (key and hp from one row) is now satisfied inside the component.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None beyond the register. T-48-37: names and the tag render as text; `<img onerror>` tests for party card names and aria-labels. T-48-38 (accepted): cards come from the player's own group rows; `allyArgFor` filters invalid allies. T-48-39: static `flash-reduced` and reduced-motion block tested. T-48-40: locked buttons use `aria-disabled`, stay focusable, tested.

## Flagged assumptions (carried for the verifier)

- CMB-05 prohibition (no animation under reduced motion): delivered by the `flash-reduced` class with no animation or transition and the `prefers-reduced-motion` block, covered by runtime and static tests. Not verified visually.
- A19: the flash applies to any HP drop of the active character, in or out of combat (the vitals component is shared).
- A selected ally at 0 HP stays selected (tested); the controller's `allyArgFor` decides what is sent.
- Ally buttons contain the card's progressbars; assistive tech treats button children as presentational, so the button's accessible name is the specified 'Target {name} with your next ability' and the HP is only visible on screen. Matches the spec's wording; revisit if the owner wants HP announced.
- The ally card is a `button` containing `div`s (the Phase 47 card markup reused). Browsers render it correctly; strict HTML validation would flag it.

## Deferred owner verification

On desktop, in a fight:
1. The header shows 'In combat · Round N' (health tint, small dot) between the location and Day/Night, and the round number advances. At the end of the fight the tag disappears instantly.
2. The six header screen buttons (Map, Bag, Stats, Craft, Social, Events) are dimmed with the tooltip 'Unavailable in combat', can be tabbed to, and clicking does nothing. The account menu still opens.
3. In a party: the vitals-rail Party block reads 'Party · n' with 'Click to target' (no Invite), a 'You' card first with the accent ring by default, then the members with HP as '95/100'. Clicking a member moves the ring to them; a single-ally heal then lands on that member (see also the 48-10 check). Solo: 'Not in a party.' and nothing to click. Out of combat the block looks as before (Lv N, Invite).
4. Take damage: the HP bar flashes red with a fading ghost over the lost part and a '−n' after the HP text that sums over quick hits and clears about 1.5 s after the last. Healing does not flash. Mana and stamina never flash.
5. With the OS "reduce motion" setting on, the same damage turns the bar and HP text red for about 0.6 s with no fade; the delta still shows for 1.5 s.
6. The selected-card glow is not clipped awkwardly by the rail edge.

## Self-Check: PASSED

- FOUND: src/combat/InCombatTag.vue and the ten modified files listed above
- FOUND commits: 43e4d7e8, 37d89125, 94d23f39
