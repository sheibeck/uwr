---
phase: 47-console-rails-hotbar-and-input
plan: 08
subsystem: client-rails-vitals
tags: [vue, vitals, party, effects, xp]
requires: ["47-03", "47-06"]
provides:
  - "EffectChips (props effects, nowrap): polarity chips, 8-chip cap with +n"
  - "PartyBlock: Party header, Invite pre-fill, member cards (reusable by the Social sheet in 47-12)"
  - "VitalsRail: XP bar, effect chips, leader crown, PartyBlock"
  - "VitalsStrip: 2px XP line, leader crown, scrolling chip row opening the Social sheet"
affects: [47-12]
tech-stack:
  added: []
  patterns: ["inject with inert defaults so Phase 45 props stay unchanged", "text-node rendering for every server and player string"]
key-files:
  created:
    - src/rails/EffectChips.vue
    - src/rails/EffectChips.test.ts
    - src/rails/PartyBlock.vue
    - src/rails/PartyBlock.test.ts
  modified:
    - src/frame/VitalsRail.vue
    - src/frame/VitalsRail.test.ts
    - src/frame/VitalsStrip.vue
    - src/frame/VitalsStrip.test.ts
key-decisions:
  - "'Party · n' counts every member including the player (partySize), as the plan flagged."
  - "A party member with no readable character row shows as a dimmed card (name empty) and as a plain 'Member' chip in the strip, with no percent, since a 0% would claim the member is at zero health."
  - "Party and member chips in the strip use a pointer-only hover tint (media hover: hover), per the UI-SPEC interaction table."
  - "The overflow chip carries a title '{n} more effects'; the UI-SPEC defines no title for it."
requirements-completed: [CON-03]
status: complete
duration: 25min
completed: 2026-10-05
---

# Phase 47 Plan 08: Vitals rail and strip Summary

The vitals rail and the mobile strip now show the XP bar (progress into the level, or a full track reading 'Max level'), the active character's effect chips (rounds left only in combat), the leader crown, and the party block with member health, mana or stamina bars and an Invite button that pre-fills `invite `; the strip adds a 2px XP line and a sideways-scrolling chip row that opens the Social sheet.

## What was built
- `src/rails/EffectChips.vue`: `span.tag` chips (buffs `tag-accent`, debuffs `effect-debuff` with the exact UI-SPEC color-mix), Phosphor icon at 12px, single-line ellipsis text, `title` = full text, at most 8 chips plus a `.tag.tag-neutral` `+n`, nothing rendered for no effects, `nowrap` variant for the strip.
- `src/rails/PartyBlock.vue`: injects `GAME_KEY` and `CONSOLE_KEY` (inert defaults). `Party` or `Party · n` heading, Invite ghost button (PhUserPlus 14, `console.prefill('invite ')`), `Not in a party.` when there is no group, otherwise one non-interactive card per other member (leader first, filled PhCrownSimple after the leader's name, class, `Lv N`, 4px health bar with `aria-label` `Mara health 95 of 100`, 3px mana or stamina bar). Unknown members render at 60% opacity with empty tracks.
- `src/frame/VitalsRail.vue`: props unchanged. Order is identity (crown for a leader), Health, Mana, Stamina, XP row (`.xp-row`, `.xp-value`, `.xp-track`, `.xp-fill`, `aria-label="Experience"`), effect chips, rule, `PartyBlock`. With no character row the XP row reads `0 / 0` with an empty track. HP/MP/SP keep the Phase 45 `.fill` and `.value` classes.
- `src/frame/VitalsStrip.vue`: props unchanged. Normal variant gains the crown, a 2px `.xp-line` (title `XP 58 / 220` or `XP Max level`, no text) under the bars at a 4px gap, and a `.chip-row` shown only with a party or effects (`overflow-x: auto; scrollbar-width: none`, children never shrink): `Party n` button, one `Name 95%` button per member, then `EffectChips nowrap`. Party and member chips call `frame.openScreen('social')`; effect chips are spans. The compact variant is untouched.

## Existing Phase 45 assertions changed (deliberate)
- `src/frame/VitalsRail.test.ts`: "renders three labelled progress bars in order" became "four ... Health, Mana, Stamina, Experience" (count 3 to 4, label list gains Experience).
- `src/frame/VitalsRail.test.ts`, source check: `expect(source).toContain('Not in a party.')` on `VitalsRail.vue` was replaced by a check on `src/rails/PartyBlock.vue` (the copy moved with the party block); the rail source now asserts `aria-label="Experience"`, `EffectChips` and `PartyBlock`.
- `src/frame/VitalsStrip.test.ts`: "shows HP, MP and SP micro labels over three progress bars" became "... plus the XP line": progressbar count 3 to 4 with Experience appended.
- Nothing else changed: the `.name`, `.avatar`, `.class-line`, tag, compact-variant, fill-width and escape assertions pass unmodified. `frameContract.test.ts` (252px width and the strip padding) and the AppFrame layout tests pass unmodified.

## Verification
- `pnpm exec vitest run --dir src --maxWorkers=2`: 66 files, 1159 tests pass (was 1111; 48 new tests across the four files).
- `pnpm exec vitest run src/frame src/rails src/styles --maxWorkers=1`: 25 files, 362 tests pass (design guards included: no literal colors, spacing and font scales, XSS sinks).
- `pnpm exec vue-tsc -b`: exits 0.
- `pnpm build`: passes, "bundle clean: 4 files scanned".
- `git status --porcelain spacetimedb src/module_bindings`: empty.

## Deviations from Plan
**1. [Rule 1 - Bug] Type error in a new test.** `DOMWrapper.get(...).exists()` does not type-check (`get` returns a wrapper without `exists`). Switched that assertion to `find(...).exists()` before the final commit; `vue-tsc -b` was green afterwards.

**2. Process:** as in 47-01 to 47-07, tests and implementation were committed once per task, not as separate RED/GREEN commits. The plan type is `execute`, so no TDD gate section applies.

**3. Minor additions beyond the plan text:** the unknown-member chip text ('Member') and aria-label fallback ('Member health 0 of 0'), the overflow chip title, and a `.member-class`/`.member-level` split so an unknown member shows no `Lv`. No behavior in the plan's bullets changed.

## Threat model
- T-47-01b mitigated: every name, class and ability string is a text interpolation; `PartyBlock.test.ts`, `EffectChips.test.ts` and `VitalsStrip.test.ts` assert an `<img src=x onerror=alert(1)>` name renders as text with no `img` element; the design-contract XSS guard passes over the new files.
- T-47-15 accepted: `effectViews` filters to the active character, so the rail and strip show only the player's own chips.

## Known Stubs
None. The `0 / 0` XP readout for a missing character row and the inert-game defaults are intentional empty states, not unwired data. Level up and New skill tags in the strip stay display-only (Phase 50 owns them), as the plan states.

## Threat Flags
None.

## Deferred owner verification
No checkpoint tasks in this plan. For the owner's try-out at milestone end, these are not covered by automated tests (happy-dom has no layout):
- Backstop truth: at 390px with 4 party members and 6 effects, the strip chip row scrolls sideways and never wraps, and the strip stays within its height.
- A long character name ellipsizes next to the crown in the 252px rail and on the strip without pushing the Level up tag.
- Real server data: effects appear and `rounds` counts down only in combat; party health bars follow member damage live; Invite focuses the input with `invite ` pre-filled (needs 47-09's console wiring, which is not part of this plan).
- Party and member chips open the Social sheet at mobile sizes (needs 47-12's Social screen content).

## Commits
- 4c32e269 feat(47-08): effect chips and party block
- b8e32531 feat(47-08): vitals rail and strip show XP, effects, crown and party

## Self-Check: PASSED
Created files exist: src/rails/EffectChips.vue, EffectChips.test.ts, PartyBlock.vue, PartyBlock.test.ts; modified files present; commits 4c32e269 and b8e32531 verified in git log.
