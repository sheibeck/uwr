---
phase: quick
plan: 261006-h5w
subsystem: client
tags: [feed, keeper, hotbar, tooltip, a11y, long-press]
status: complete
key-files:
  modified:
    - src/console/lines.ts
    - src/console/FeedLine.vue
    - src/creation/creationLines.ts
    - src/hotbar/hotbar.ts
    - src/hotbar/HotbarRow.vue
commits:
  - 2cf45167 feat(quick-261006-h5w): one Keeper label per reply, paragraphs under it
  - e3ff4643 feat(quick-261006-h5w): hotbar ability tooltip on hover, focus and long-press
---

# Quick Task 261006-h5w: One Keeper label per reply, and a hotbar ability tooltip

## One-liner

Consecutive same-speaker segments of one event row now share one label (new `continued` flag on `FeedLineView`), and hotbar slots open a text-only popover (name, cost, cooldown in rounds in combat, cast time, description) on hover, keyboard focus and a 500 ms long-press, linked by `aria-describedby`.

## Task 1: one label per reply

- `classifySegments` sets `continued: true` when the previous line of the same row has the same kind and speaker (Keeper, or NPC with same name and id). Each segment stays its own `FeedLineView` with its own key, paragraph and keyword parts.
- `FeedLine.vue`: no header for a continued Keeper line; a continued NPC line shows only the quoted paragraph (no "Name says,"). The round tag sits on the first Keeper line of the entry, which always keeps its label, so "THE KEEPER · ROUND M" is preserved.
- Approach chosen: a flag on following segments (smallest; no view-model or FeedView change, no new CSS).
- No prompt, Keeper Bible or route text touched. The server prompt part of the todo (outro length) is not done and still needs owner approval.

## Task 2: hotbar tooltip

- `hotbar.ts`: `slotTooltip(ability, inCombat)` and `slotTooltipText(tip)`. Cooldown in rounds in combat via `cooldownTotalRounds` / `roundsText`; cast 0 reads "Instant"; "No cost" / "No cooldown" for free abilities.
- `HotbarRow.vue`: one popover above the row (not clipped by the scrolling strip), shown for mouse or pen hover, `:focus-visible` focus, or a 500 ms touch or pen press. Long-press does not cast and swallows the trailing click (reset on the next pointerdown); a normal tap casts. Escape and any touch or pen press elsewhere dismiss it. Context menu is suppressed during a touch long-press. `aria-describedby` on each filled slot points at a hidden element with the same text; the popover itself is `aria-hidden` so it is not read twice.
- Text nodes only; no tokens, colors, sizes or spacing outside the scale were added.

## Deviations from Plan

1. **[Rule 2 - consistency] `creationLines.ts` also groups.** It builds its own Keeper lines for the same segments contract, so a multi-paragraph creation reply would still show repeated labels. It now sets `continued` for later segments of a row. `CreationFeed.test.ts` had one test that asserted a label on both lines; updated to one label and two paragraphs.
2. **Native `title` removed from hotbar slots.** It would duplicate the popover on hover. `slotTitle` and `slotAriaLabel` keep their behaviour and tests, but `slotTitle` is no longer used by the component (kept exported as asked). Two `HotbarRow` assertions on `title` now assert it is absent.
3. `:focus-visible` is not modelled by happy-dom; the keyboard-focus test spies on `matches`.

## Verification

- `pnpm exec vitest run --dir src --maxWorkers=2`: 115 files, 2438 tests passed.
- `pnpm exec vue-tsc -b`: clean.
- `pnpm build`: passed, bundle check clean.

## Known Stubs

None.

## Notes

- An untracked `spacetimedb/src/reducers/zz_hp_probe.scratch.test.ts` exists in the working tree; it is not from this task and was left alone.
- Not verified in a real browser or on a real touch device (owner is on the Vite dev server); the long-press timing and context-menu suppression are covered by happy-dom tests only.

## Self-Check: PASSED

Commits 2cf45167 and e3ff4643 exist; all modified files present.
