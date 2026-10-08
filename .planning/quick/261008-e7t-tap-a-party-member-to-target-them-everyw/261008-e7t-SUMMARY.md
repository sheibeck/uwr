---
phase: quick-261008-e7t
plan: 01
subsystem: party targeting (server ability checks, combat controller, vitals strip, rail cards)
tags: [party, targeting, ally, out-of-combat, mobile, desktop, server-check]
status: complete
requires:
  - "51.1 party block, member cards and self target (in combat)"
  - "quick 261008-c4p memberBars"
provides:
  - "spacetimedb/src/data/ally_target_rules.ts: peaceAllyReason, peaceAllyRefusal, AllyCaster, AllyTarget, PeaceAllyReason"
  - "src/combat/ally.ts: peaceAllyResetNeeded, peaceAllyTargetFor"
  - "CombatController.canSelectAlly"
affects:
  - "use_ability and tick_casts (out-of-combat ally target)"
  - "VitalsStrip member chips and self row, MemberCard rail variant, VitalsRail self block, HotbarRow"
tech-stack:
  added: []
  patterns:
    - "One out-of-combat ally rule in @game-data shared by server enforcement and client selection"
    - "Pre-flush watcher for a reset that reads two separately updated refs"
key-files:
  created:
    - spacetimedb/src/data/ally_target_rules.ts
    - spacetimedb/src/data/ally_target_rules.test.ts
    - spacetimedb/src/reducers/ally_target_peace.integration.test.ts
  modified:
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/reducers/combat.ts
    - src/combat/ally.ts
    - src/combat/ally.test.ts
    - src/game/context.ts
    - src/combat/useCombatController.ts
    - src/combat/useCombatController.test.ts
    - src/hotbar/HotbarRow.vue
    - src/hotbar/HotbarRow.test.ts
    - src/frame/VitalsStrip.vue
    - src/frame/VitalsStrip.test.ts
    - src/social/MemberCard.vue
    - src/social/MemberCard.test.ts
    - src/frame/VitalsRail.vue
    - src/frame/VitalsRail.test.ts
    - src/rails/PartyBlock.test.ts
    - src/social/PartySheet.test.ts
    - .planning/phases/51.1-party-and-social/51.1-UI-SPEC.md
decisions:
  - "The mobile Party sheet member cards stay non-targets (the owner named the strip chips and the desktop cards)"
  - "Solo out of combat there is no self target; in a party out of combat the self blocks are the self target"
  - "Members who are offline or elsewhere cannot be selected out of combat (muted, aria-disabled)"
  - "A fight's end keeps an ally who is still in the party, online and here"
  - "The selected state is aria-pressed, never a word in the label"
  - "You selected out of combat sends no id (the server's own default reads 'on yourself')"
  - "Pet targeting is deferred to backlog 999.4"
metrics:
  duration: "about 45 minutes"
  completed: 2026-10-08
---

# Quick 261008-e7t: Tap a party member to target them, everywhere - Summary

One shared out-of-combat ally rule (`@game-data/ally_target_rules`: same party, online, here, standing) now drives both the server and the client. The server refuses any other out-of-combat ally target in `use_ability` and again when a cast completes in `tick_casts`, with a visible line and nothing spent. On the client, the ally selection stays selected out of combat and the hotbar sends it. Mobile member chips, desktop rail member cards and (in a party) the self blocks are now target buttons, and the mobile chips show 3px health, mana and stamina bars.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | ee189e96 | feat(261008-e7t): server checks an out-of-combat ally target - same party, online, here, standing |
| 2 | 77589b8d | feat(261008-e7t): the ally target persists out of combat and the hotbar sends it |
| 3a | b691aebe | feat(261008-e7t): mobile member chips target the member and show health, mana and stamina bars |
| 3b | a8722ca2 | feat(261008-e7t): rail member cards and the self block are target buttons out of combat |
| 3c | 1fed2765 | docs(261008-e7t): 51.1 UI-SPEC owner amendment - tap a party member to target them, everywhere |

## What changed

**Server (Task 1)**
- New `spacetimedb/src/data/ally_target_rules.ts` is pure, with no imports.
  - `peaceAllyReason(caster, target)` checks in this order: missing, you (always ok), not_in_party, offline, elsewhere, fallen, then ok.
  - `peaceAllyRefusal(reason, name)` gives the lines `That target is not in your party.` (missing and not in party share it, with no name), `{name} is offline.`, `{name} is not here.` and `{name} has fallen.`.
- `use_ability` (items.ts) runs the check right after the in-combat branch and before the cooldown, cast and effect. A refusal is a `failItem` line and spends nothing. This closes the gap where any id anywhere could be healed or buffed, or raised from 0 HP.
- `tick_casts` (combat.ts) checks the live target again before the cooldown. On a refusal it deletes the cast row, posts the line with `appendPrivateEvent(..., 'ability', ...)`, and applies no cooldown.
- The in-fight path (`submitCombatChoice`) is untouched.

**Client rules (Task 2)**
- `src/combat/ally.ts` adds `peaceAllyResetNeeded` and `peaceAllyTargetFor`, built on the shared rule. `allyResetNeeded` now returns false out of combat, so it is the in-fight rule only.
- `CombatController.canSelectAlly(id)` is new. It is true for yourself and for anyone in a fight. Out of combat it is false for a member who is offline, not here or not in your party.
  - `selectAlly` ignores an id that cannot be selected.
  - `createInertCombat` returns true.
- `useCombatController`:
  - A sync watcher on `characterId` resets the selection.
  - A pre-flush watcher over `[combat.active, character, knownCharacters, selectedAlly]` resets out of combat. Because it runs pre-flush, a party that moves together keeps the ally.
  - `allyArgFor` picks the rule by `combat.active`. Out of combat it uses only the explicit selection.
- `HotbarRow.vue` now calls `controller.allyArgFor(ability)` in both modes.

**UI (Task 3)**
- `VitalsStrip.vue` (mobile):
  - Out of combat, each known member chip is a 44px `button.member-chip` with `{name} {pct}%` over 3px bars from `memberBars`.
  - Each chip has `aria-pressed`, the full label (`, offline` / `, not here`), the ring when selected, and muted plus `aria-disabled` when it cannot be selected. Clicking calls `controller.selectAlly(member.id)`.
  - An unknown member is a `span` reading `Member`.
  - The Party chip alone still opens the sheet.
  - In a party out of combat the self row is the self target.
- `MemberCard.vue` (desktop rail):
  - For a known member the content is `button.member-target`, with the `⋯` as its sibling.
  - The button has the full label (`, party leader`, `, too low to travel`, the follow phrase, `, offline`, `, not here`), `aria-pressed`, the accent ring and a 12px crosshair.
  - It is `aria-disabled` and muted when `canSelectAlly` is false. Right-click still opens the menu without selecting.
  - The sheet and unknown cards are unchanged.
  - The CSS is copied from CombatMemberCard, and the ring wins over the open-menu outline.
- `VitalsRail.vue`: in a party out of combat the self block is the self target, with the XP line inside it as spans.

## Verification

- Task 1 verify: 8 files, 169 tests passed. These were ally_target_rules, ally_target_peace (12 cases), combat_choices, combat_rounds, scheduled_guard, pronoun_rules, online, and no_ripple_word.
- Task 2 verify: 6 files, 254 tests passed.
- Task 3 verify: 13 files, 622 tests passed.
- Folder run (`src/social src/rails src/frame src/styles src/combat src/hotbar`): 81 files, 2055 tests passed.
- `npx vue-tsc -b`: clean (exit 0), after Task 2, Task 3a, Task 3b and the final run.
- Full root `npx vitest run --maxWorkers=1`: 385 files, 11675 tests passed and 2 failed. Only the three baseline files failed: `scripts/llm/call_log_report.test.mjs`, `scripts/llm/proof_rules.test.mjs` and `spacetimedb/src/helpers/measurement.results.test.ts`. `src/map/graphLayout.test.ts` passed on the first run.

## Publish (local only)

- `git status --porcelain -- spacetimedb/` before the publish was empty. Task 1 was committed first and no files under `spacetimedb/` from other executors were changed.
- Key check before: `spacetime sql uwr "SELECT * FROM admin_llm_status" --server local | grep -qE "true +[|] +108"` PASS.
- `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null` exited 0. The build finished successfully and the migration plan was empty. It ended with `Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a`. There was no clear prompt.
- Key check after: PASS. The recent logs had no panic or error lines.
- No schema or reducer signature change, and `src/module_bindings` is untouched.

## UI-SPEC

- 'owner 2026-10-08' occurrences went from 24 to 36. The phrase "Tap a party member to target them, everywhere" appears once.
- Amended: the fourth owner bullet, the Self Block out-of-combat paragraph, Party Block item 6, the Mobile Party in Combat intro, the new "Mobile chip row (out of combat)" block, Accessibility, Copywriting (three new rows and the self target row) and Tests (item 1 struck and replaced, new item 16).

## Tests changed that pinned the old behaviour

- `AppFrame.combat.test.ts`: no case needed a change.
- `VitalsStrip.test.ts`:
  - 'opens the Social sheet from the party chip and member chips only' became 'opens the Social sheet from the party chip only'.
  - 'in a party: the fight ending while the self target has focus moves focus to the Party chip' now keeps focus on the self target.
  - 'keeps the Phase 47 chip row out of combat and shows no pet tag there': the member chip click now selects and the Party chip opens social.
- `VitalsRail.test.ts`:
  - 'as a member' child order is now `[self-target, player-menu, pet-row]`.
  - 'the fight ending ... in a party' now keeps focus on the self target.
  - 'out of combat the self block is not a button' is now solo only, with a new party case.
  - 'brings the XP line back and drops the button' is now solo, with a new party case.
  - The three self follow icon cases (comes, none, elsewhere) now expect the decorative icon inside the self target, with the phrase in the button label.
- `PartyBlock.test.ts`:
  - 'cards are not targets' became 'out of combat each known member card is a target button beside its ⋯'.
  - 'is exactly the out-of-combat block out of a fight' now expects the out-of-combat recipe with targets.
  - 'a fight ending while a member target has focus' now keeps focus on that member's out-of-combat target.
- `useCombatController.test.ts`: 'resets to the player when the fight ends' became the keep case. The fake character now carries groupId, locationId and online, and Bo is a full row.
- `HotbarRow.test.ts`: 'never consults allyArgFor out of combat' was replaced by two out-of-combat cases.
- `ally.test.ts`: 'resets when the fight is over' now expects false.

## Judgement calls

- The mobile Party sheet member cards stay non-targets, because the owner named the strip chips and the desktop cards. PartySheet.test.ts pins this.
- Solo out of combat there is no self target. In a party out of combat the self blocks target you.
- Members who are offline or elsewhere cannot be selected out of combat: they are muted and `aria-disabled`. A fallen member can be selected (as in a fight), but no id is sent for him.
- A fight's end keeps an ally who is still in the party, online and here.
- The selected state is `aria-pressed`, never a word in the label.
- When you are selected out of combat, no id is sent, so the server's own default still reads 'You use X on yourself.'.

## Deferred

- **Pet targeting is deferred to backlog 999.4** (999.27 was merged into it). It needs server work. Pets stay non-targetable.

## Deviations from Plan

1. **[Rule 3 - Blocking] The acceptance grep counts.** The `@game-data/ally_target_rules` reference in the `ally.ts` header comment was reworded so the import is the one match. The integration refusal cases were written as five explicit `it(` blocks instead of a loop, so the file has 12 literal `it(` cases.
2. **[Rule 1 - Bug] Line endings.** The plan said every touched file uses CRLF in the working copy. In fact the working copies are mixed: items.ts, combat.ts, ally.ts, useCombatController.ts, VitalsStrip.vue, MemberCard.vue, context.ts and the UI-SPEC are LF, while useCombatController.test.ts, HotbarRow.vue, VitalsRail.vue and AppFrame.combat.test.ts are CRLF. Every file kept its own ending. New files are LF, which matches `.gitattributes eol=lf`. The index is LF either way.
3. **TDD order in Task 2.** `ally.ts` was implemented before the controller RED run. The ally.test.ts cases were written first but not run red on their own. The controller and hotbar cases did run red (13 failures) before GREEN.
4. **Extra test changes.** The plan named the VitalsStrip, VitalsRail and PartyBlock focus cases but did not list some other cases that pinned the old out-of-combat markup. Those are in VitalsStrip (Phase 47 chip row click) and VitalsRail (three follow icon cases, the 'as a member' order, the XP-back case). They were updated, as listed above.

## Known Stubs

None.

## Threat surface

All mitigations in the plan's threat register (T-e7t-01 to T-e7t-06) are implemented and tested. No new surface was added outside the register.

## Self-Check: PASSED

- All five created or modified key files exist on disk.
- Commits ee189e96, 77589b8d, b691aebe, a8722ca2 and 1fed2765 are present in `git log`.
