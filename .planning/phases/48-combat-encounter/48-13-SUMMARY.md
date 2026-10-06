---
phase: 48-combat-encounter
plan: 13
subsystem: client-mobile-chrome
tags: [vue-client, mobile, vitals, party, combat]
status: complete
requires: ["48-12"]
provides:
  - "VitalsStrip In combat tag (InCombatTag first in .tags, gated on game.combat.active)"
  - "VitalsStrip ally chips: Party n as plain text, You and member chips as aria-pressed buttons wired to COMBAT_KEY selectAlly/allyTargetId, 44px hit slop, inset accent ring"
  - "VitalsStrip HP damage flash on useDamageFlash (full and compact), latched flash key, ghost, Micro 10 delta, static flash-reduced class"
affects: [48]
tech-stack:
  added: []
  patterns: ["combat gated on game.combat.active, never inCombat", "flash key latched to the hp prop (same as VitalsRail)", "reduced-motion path is a timed static class declaring no motion"]
key-files:
  created: []
  modified:
    - src/frame/VitalsStrip.vue
    - src/frame/VitalsStrip.test.ts
key-decisions:
  - "Out of combat or solo the chip row markup is the Phase 47 markup; the combat branch is a separate v-if template"
  - "HP micro label is wrapped with the delta in a .readout span so .micro-label text stays 'HP n' (Phase 45 pins unchanged)"
  - "Ally rows get padding 8px and an equal calc negative margin plus overflow-y hidden, so the 44px ::after slop is not scrolled and is only partly clipped"
requirements-completed: [CMB-05]
metrics:
  tasks: 2
  files: 2
  completed: 2026-10-06
---

# Phase 48 Plan 13: Mobile strip combat tag, ally chips and damage flash Summary

The mobile vitals strip now announces the fight, lets the player pick an ally from the party chips, and flashes the HP bar on damage. Client only: nothing under `spacetimedb/` or `src/module_bindings/` changed.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 and 2 | In combat tag, ally chips and HP flash | 0e725b23 | VitalsStrip.vue, VitalsStrip.test.ts |

Both tasks touch the same two files and were committed together as one commit (see Deviations).

## What was built

- **In combat tag**: `<InCombatTag :round-number>` is the first child of `.tags` while `game.combat.active`. The existing one-row, wrap-and-clip rule makes Level up and New skill drop first; the name never wraps. Not rendered in the compact variant.
- **Ally chips** (combat active and in a party): `span.tag.tag-neutral.party-chip.party-count` ('Party n', plain text, default cursor, no hover), a 'You' `button.ally-chip` for the current character, then one `button.ally-chip` per known member ('Name 95%'), each with `aria-pressed`, `aria-label` 'Target {name} with your next ability', a `selected` class (inset 1px accent ring, no glow) and `controller.selectAlly(id)` on click. Unknown members are a non-interactive `span.member-chip.unknown` 'Member'. Effect chips follow. Solo: no You chip, no targeting. Out of combat: exactly the Phase 47 row (Party chip and member chips as buttons opening Social).
- **44px hit area**: `.ally-chip` is `position: relative` with an `::after` (left 0, right 0, top 50%, height 44px, translateY(-50%)). Because the chip row is an `overflow-x: auto` scroller that would clip and scroll the slop, ally rows get `padding: 8px 0`, `margin: calc(-1 * 8px) 0` (layout unchanged) and `overflow-y: hidden`.
- **HP flash**: `useDamageFlash({ hp, maxHp, key })` with the same latched key as the rail (sync watcher on `props.hp`, pre watcher on `game.characterId`). The HP cell (full) or HP compact bar gets `flash-motion` or `flash-reduced`; tracks are `position: relative`; `div.ghost` (aria-hidden) while set; full mode renders `span.delta` ('−n', Micro 10, `--color-con-red`, tabular-nums, margin-left 4px) after the HP label inside `.readout`. Motion: 600 ms ghost fade, 400 ms fill and label keyframes from `--color-con-red`. Reduced: `.flash-reduced` sets the fill and label to `--color-con-red`, declaring no animation; a `prefers-reduced-motion` block also nulls the flash-motion animations. No `transition` in the file.

## Pinned assertions changed deliberately

None. All existing VitalsStrip cases are untouched, including 'shows Party n, a Name pct chip per member, then the effect chips' (inCombat true, inert combat block: Party chip stays a BUTTON). The test file only gained imports (`beforeEach`, `nextTick`, COMBAT_KEY, createInertCombat, CombatController) and new cases.

## Verification

- `pnpm exec vitest run src/frame/VitalsStrip.test.ts src/styles`: 118 passed.
- `pnpm exec vitest run --dir src --maxWorkers=2`: 94 files, 1851 tests passed (1791 before). No new failures.
- `pnpm exec vue-tsc -b`: exit 0.
- Acceptance greps hold: `InCombatTag`, `selectAlly`, `ally-chip`, `with your next ability`, `useDamageFlash(`, `flash-reduced`, `flash-motion`, `prefers-reduced-motion`.

## Deviations from Plan

**1. [Process] Tasks 1 and 2 share one commit.** Both tasks edit only VitalsStrip.vue and VitalsStrip.test.ts, and were developed together, so splitting by hunk would have needed interactive staging. Both tasks' tests pass in the one commit.

**2. [Rule 2 - Correctness] Scroller clipping of the hit slop.** The plan's bare `::after` would be clipped by the chip row's `overflow-x: auto` (and, since overflow-y then computes to auto, would add a small vertical scroll). Added the padding, negative `calc()` margin and `overflow-y: hidden` on the ally row only. The padded box is 37px tall (21px chip plus 8px each side), so the effective vertical tap area is about 37px rather than the full 44px. Going to a full 44px would need an off-scale 12px padding or overlap of neighbours; left as flagged below.

**3. [Design] Micro label wrapper.** The plan puts the delta after the HP label; a `.readout` span wraps the label and delta for HP only, so `.micro-label` texts stay 'HP 212', 'MP 140', 'SP 60' as the Phase 45 tests pin.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None beyond the register. T-48-44: names render as text nodes; `<img onerror>` test covers chip text and aria-label. T-48-45 (accepted): chips come from the player's own group rows; `allyArgFor` filters invalid allies. T-48-46: static `flash-reduced` class, a reduced-motion block, runtime and static tests.

## Flagged assumptions (carried for the verifier)

- CMB-05 prohibition (no flash animation under reduced motion): delivered and unit-tested, not verified visually.
- CMB-05 unclassified edge: In combat tag and flash appear only on `game.combat.active` and on an HP drop respectively; the Phase 47 inCombat-true party case still shows the Party chip as a button (pinned test unchanged).
- Effective hit height on ally chips is about 37px, not 44px (see Deviation 2).
- The 'You' chip appears whenever the character id is known; `allyTargetId` default (self) is the controller's job.
- Effect chips in combat read `game.inCombat` (Phase 47 behavior, unchanged), so the rounds text depends on that flag.

## Deferred owner verification

On a 390px-wide viewport, in a fight:
1. Row 1 shows 'In combat · Round N' at the right (health tint, dot); with Level up and New skill pending they drop first, and the name never wraps. The tag disappears when the fight ends.
2. In a party: the chip row reads 'Party n' (not tappable), 'You' (ringed by default), then 'Name 95%' chips. Tapping a member moves the ring; a single-ally heal lands on that member. Taps slightly above or below a chip still hit it. Out of combat the row is the old one (Party and member chips open Social).
3. With 5 allies, 6 effects and the tag the chip row scrolls sideways with no vertical wobble.
4. Taking damage flashes the strip's HP bar red with a fading ghost and a small '−n' after 'HP n' that sums over quick hits and clears about 1.5 s after the last. Healing does not flash; mana and stamina never do.
5. With OS reduce motion on, the bar and HP label turn red for about 0.6 s with no fade; the delta still shows.
6. In compact mode (keyboard open) the HP bar flashes without delta text.

## Self-Check: PASSED

- FOUND: src/frame/VitalsStrip.vue, src/frame/VitalsStrip.test.ts
- FOUND commit: 0e725b23
