---
phase: 48-combat-encounter
plan: 14
subsystem: phase-gate
tags: [phase-gate, integration, validation, combat]
status: complete
requires: ["48-13"]
provides:
  - "AppFrame.combat.test.ts: one populated combat frame at 1280 and 390 with every Phase 48 surface and the img-onerror escape check on every name surface"
  - "48-VALIDATION.md test map pointing at the real test files, Wave 0 complete"
  - "Phase gate results and the consolidated owner checklist for the end-of-milestone pass"
affects: [48]
tech-stack:
  added: []
  patterns: ["Date-only fake timers (vi.useFakeTimers({ toFake: ['Date'] })) keep the round timer at a fixed 6 s without touching Vue scheduling", "wire-less feed fixture: addRoundHeader and addWindup called directly with windupParts, the way wireCombatFeed does"]
key-files:
  created:
    - src/frame/AppFrame.combat.test.ts
  modified:
    - .planning/phases/48-combat-encounter/48-VALIDATION.md
key-decisions:
  - "Gate reads the full root suite (client, module and scripts in one run) instead of two separate module and scripts runs; the three allowed baselines are the only failures"
  - "The XSS cases assert on elements (findAll img and document.body querySelectorAll img), not on innerHTML text, because a title attribute legitimately carries the payload as escaped attribute text"
requirements-completed: [CMB-01, CMB-02, CMB-03, CMB-04, CMB-05, CMB-06]
metrics:
  tasks: 2
  files: 2
  completed: 2026-10-06
---

# Phase 48 Plan 14: Combat frame integration test and phase gate Summary

A single mounted AppFrame now carries every Phase 48 surface at desktop (1280) and mobile (390) widths, an img-onerror payload in every name field renders as text at both widths, the whole offline gate is green apart from the three known baselines, the validation map points at the real tests, and every hands-on check is written down below for the owner. Client only: nothing under `spacetimedb/` changed in this plan; nothing was published, no server was started or stopped, nothing was pushed, no LLM call was made.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Populated combat frame at desktop and mobile widths | 22e69c82 | src/frame/AppFrame.combat.test.ts |
| 2 | Validation map, Wave 0 complete (gate run, no source change) | 7a57bbd1 | .planning/phases/48-combat-encounter/48-VALIDATION.md |

## What was built

- **src/frame/AppFrame.combat.test.ts** (13 cases). The game is `createInertGame()` with refs for connected, character (in a group, `combatTargetEnemyId` 9n), group, members, known characters, hotbar, abilities, an ability cooldown with `roundsRemaining` 2n, the reducers (`vi.fn` each) and a full combat block (active, applied, aggroApplied, castsApplied, combatId, self, participants, two enemies and templates, an enemy ability, an open round 3 whose timer ends 6 s after the fixed clock, one cast aimed at the pet, a pet, two aggro rows, character and pet name maps). The round header and the wind-up block are added through `game.feed.addRoundHeader` and `game.feed.addWindup`. The frame provides its own controller, so only `GAME_KEY` is supplied.
  - Desktop: header tag 'In combat · Round 3' and six `aria-disabled` screen buttons (not natively disabled); `section.encounter-panel` in the context rail with two cards (one targeted), one wind-up row ('Rotfang winds up Bile Spray → Ember · lands in 2 rounds') and 'Threat on Rotfang' with a 'You' row first; the composer holds the round row before the hotbar row, chip 'Auto-attack → Rotfang', a `progressbar` timer at 6 (`6s`), Ready and Flee; slot 1 shows '2 rounds'; the vitals rail shows 'Click to target' and 'You' and Mara as `button.member` with the self card pressed; the feed shows a `.line-round.current` 'Round 3' and the wind-up block; a click on a card calls `setCombatTarget`.
  - Mobile: no tab bar, no location row, no context rail; `section.encounter-strip` before `main.feed` with two chips (one pressed); vitals strip In combat tag and two ally chips ('You' pressed); the round row is `stacked mobile` above the hotbar; the encounter sheet shows 'Round 3 · 6s', both cards, the wind-up row and the threat block; the account button opens a More sheet with only Log out, which emits `logout`.
  - Escape: with `<img src=x onerror=alert(1)>` in the hostile, the slot ability, the wind-up ability, the pet (wind-up target), the party member and the narration, both widths assert `findAll('img')` and `document.body.querySelectorAll('img')` are empty and each surface's text equals the payload (mobile also opens the sheet to cover its cards, wind-up and threat rows).
- **48-VALIDATION.md**: every test-map row points at an existing file (fixed the CMB-04 emphasis row, which lives in `src/combat/emphasis.test.ts`, and added `combatFeed.test.ts`, `FeedView.test.ts`, `VitalsStrip.test.ts`, `Sheet.test.ts`); a new All row for the integration test; the Wave 0 boxes are ticked; `wave_0_complete: true`. `status`, `nyquist_compliant` and the sign-off list are left for validate-phase.

## Gate results (run 2026-10-06, nothing started or published)

Phase base for the server diff: `7470d512` (the parent of the first Phase 48 execution commit, 38637d22).

- `pnpm exec vitest run --dir src --maxWorkers=2`: Test Files 95 passed (95), Tests 1864 passed (1864). (94 files / 1851 tests before this plan; the new file adds 13.)
- `pnpm exec vue-tsc -b`: exit 0.
- `pnpm build` (vue-tsc, vite build, bundle guard): exit 0; 1945 modules, `bundle clean: 4 files scanned`.
- `pnpm exec vitest run --maxWorkers=2` (full root suite, includes the module and scripts suites): Test Files 3 failed | 178 passed (181); Tests 2 failed | 6190 passed (6192). The failing files are exactly the allowed baselines: `scripts/llm/call_log_report.test.mjs` (file-level, 0 tests), `scripts/llm/proof_rules.test.mjs` (file-level, 0 tests) and `spacetimedb/src/helpers/measurement.results.test.ts` (2 of 107: "finds every known recorded file" and "recorded results file none > exists"). The separate `cd spacetimedb && vitest --maxWorkers=1` and `vitest run scripts/llm` commands were not repeated, because the root run covers the same files with the same outcomes.
- `git diff --name-only 7470d512 HEAD -- spacetimedb`: only `spacetimedb/src/views/combat.test.ts` and `spacetimedb/src/views/combat.ts` (the 48-01 view files). `git diff --name-only 7470d512 HEAD -- src/module_bindings` lists the three files regenerated in 48-01 (`index.ts`, `my_combat_aggro_table.ts`, `types.ts`); no plan after 48-01 touched bindings.
- The design guards (23-token pin, scales, no literal colors, no raw-HTML directive, no inline SVG, frame contract) run as part of the client suite and pass. No LLM route, Keeper Bible, schema table or reducer changed in the phase.

## Pinned assertions changed in Phase 48

Only these Phase 45/47 assertions changed, each deliberately and listed by the plan that changed it. Every other plan (02, 03, 07 to 14, including this one) changed none.

1. **48-04, `src/game/gameData.test.ts`** (four edits): the hand-written `queries` literal gained the combat members (typing only); `STATIC_SQL` gained `'Q_COMBAT_AGGRO'` (9 entries); `expect(STATIC_SQL).toHaveLength(8)` became `toHaveLength(9)`; the title "attaches the 7 static bindings and event_world ..." became "attaches the 8 static bindings and event_world ...".
2. **48-05, `src/frame/AppFrame.populated.test.ts`** "shows the Phase 45 empty lines and the empty feed line with no spinner": `w.find('[role="status"]').exists()` became `w.find('[role="status"]:not(.target-status)').exists()`, because the plan-mandated hidden `role="status"` target line collides with the original selector; the intent (no loading status) is kept.
3. **48-06, `src/console/lines.test.ts`** "errors, warnings and combat kinds": `combat_round_header` and `combat_resolving` left the combat-kind list, and a new case asserts both classify to no lines (UI-SPEC A15, RESEARCH Q4).

## Deviations from Plan

None - the plan executed as written. Two small test-fixture corrections during Task 1 (sorting of the cards by ascending id, and the self card reading 'You'); an `innerHTML` substring assertion was replaced by element checks because the `title` attribute legitimately contains the escaped payload text.

## Deviations the owner should review (carried from plans 05 to 13)

These are the places where the built client departs from, or settles an open point in, the approved UI contract. Each also appears in the checklist below.

- **A1**: Ready and Flee sit in a round row above the hotbar slots, not at the end of the slot strip (48-09).
- **A5**: the tab bar is hidden in mobile combat, and the account button sits on the encounter strip header row (CONTEXT) rather than on the vitals strip (RESEARCH Pitfall 9) (48-12).
- **A4**: Tab is scoped (not in a text field, no screen or menu open, focus on the body or inside the panel or feed, no modifier). Desktop focus starts in the composer input, so Tab cycles targets only after Esc or a click away; with nothing to change, Tab stays native. Esc blurs a control in the panel or feed (48-05).
- **A8**: the threat percent is relative to the top entry (top = 100%); only `src/combat/threat.ts` changes if the owner picks another basis (48-02, 48-08).
- **A26**: a dead or departed ally stays selectable, but is not sent as the target (`allyArgFor` returns nothing, so the default target applies) (48-02, 48-05, 48-10).
- **Ally chip tap height**: the mobile ally chips are about 37px high effective (21px chip plus 8px each side), not the 44px of the spec; full 44px needs an off-scale 12px padding (48-13).
- **Glow clipping**: the chosen-slot glow (slot strip has `overflow-y: hidden`), the selected card glow in the rail and the target ring on the mobile strip chips (`overflow-x: auto` row) may clip at their container edges (48-10, 48-11, 48-12).
- **Two-row round row**: uses a feature-detected ResizeObserver (`ROUND_ROW_STACK_PX = 520`, the row stacks when it is narrower) because the frame contract allows no new container queries (48-09).
- **Rounds cooldown total** comes from `cooldownSeconds`, not `durationMicros` (CONTEXT "Engine-driven fixes", supersedes the UI-SPEC text) (48-03).
- **Other flagged assumptions**: A19 the damage flash applies to any HP drop of the active character in or out of combat; the ally card is a `button` containing `div`s and its accessible name omits HP; More sheet stays open when a fight ends (only the encounter sheet closes itself); safe-area padding on the combat composer and sheets is a planner addition; a late narration with a known round but no header still shows the tag; a wind-up whose next round row is not yet known sits at the server-clock now; an unknown wind-up target character reads 'the party'.
- **Process note (48-13)**: Tasks 1 and 2 share one commit (0e725b23) because both edit only VitalsStrip.vue and its test.

## Deferred owner verification

Owner instruction 2026-10-05: hands-on testing happens once, at the end of the milestone. Nothing below was run live; every item is covered by unit or mount tests but not by eyes on a real fight. Run on the local server only (never maincloud).

### A. Live combat, desktop (1280) and mobile (390)

1. **Encounter rail (desktop):** in a fight the right rail reads 'Encounter · n hostiles' with 'Tab to cycle'; Here, Nearby, Tracking and the event card are gone and return when the fight ends. Each hostile is a card (name in its difficulty color, hover for the meaning, 'Lv n', HP bar with '212/480' centered). Click targets: the purple ring and crosshair appear only after the server echo.
2. **Keyboard:** click the page body or a feed line, then Tab and Shift+Tab cycle targets (A4: the cursor starts in the input, so Tab only cycles after Esc or a click away; with the cursor in the input Tab stays native and the target must not change). Esc from the panel or feed returns focus to the page. A pressed key must never cycle with a drawer, sheet or the account menu open.
3. **Threat order:** 'Threat on {target}' at the bottom, 'You' first in light purple, then members, percent against the top row (A8). With two accounts in two separate fights each shows only its own fight (optional live look).
4. **Wind-up:** an amber hourglass row on the card ('X winds up Y → you · lands in N rounds', count falls each round) and exactly one amber warning block in the feed per cast, not replayed on reload.
5. **Round headers:** 'Round 1' above the first combat lines, the open round in purple accent, earlier ones grey, all grey after the fight; after a reload only the current round header shows. A line stamped at a round boundary sits under the round it closes.
6. **Round row and timer:** '10s' down to '1s', then a spinner with 'Resolving…' and an empty bar (never '0s'). Solo play resolves almost at once after Ready. A killed connection dims Ready and Flee to 45% while the bar keeps counting.
7. **Ready, Flee, chosen:** Ready turns the chip accent with a check; an ability slot makes the chip '{Ability} → {target}'; Flee shows 'Fleeing' (red tint) and 'Flee chosen' with a check, clicking again does nothing, and an ability replaces it. The chosen slot shows the accent ring, soft glow and tint, clears next round.
8. **Rounds cooldowns:** a cooldown ability shows '2 rounds' or '1 round' with a shrinking clockwise sweep and a brief ring flash at ready; slots are inert while 'Resolving…' and at 0 HP. Out of combat the hotbar is unchanged (seconds at the top right).
9. **Ally heals in a party:** the vitals-rail Party block reads 'Click to target' with a 'You' card first (ringed by default); selecting a member and using a single-ally heal lands on that member; with that ally down or gone it targets the default (A26).
10. **Damage flash:** HP bar flashes red with a fading ghost and a '−n' that sums over quick hits and clears about 1.5 s after the last; healing, mana and stamina never flash. With the OS reduce-motion setting on it is a red color for about 0.6 s with no fade and the delta still shows. On mobile the same in the strip (compact mode flashes without delta text).
11. **Header tag and locked buttons (desktop):** 'In combat · Round N' (health tint, dot) between the location and Day/Night; the six screen buttons are dimmed with 'Unavailable in combat', can be tabbed to, do nothing; the account menu still opens. The tag vanishes at once when the fight ends and an open drawer closes at fight start.
12. **Mobile strip and sheet (390x844):** tab bar and location row gone; strip 'ENCOUNTER · n HOSTILES' with chips (con color, thin HP sliver, hourglass when winding up, ring on the target, defeated dimmed and inert); tap the header for the Encounter sheet ('Round N · 6s' meta, cards with wind-ups, threat block; tapping a card targets and keeps it open; closes itself when the fight ends); keyboard open collapses the strip to its header.
13. **Mobile vitals strip:** the In combat tag first in row 1 (Level up and New skill drop first); 'Party n' not tappable, 'You' ringed by default, 'Name 95%' chips; out of combat the old Party and member chips open Social.
14. **Log out from the strip:** the account (dots) button opens a 'More' sheet with only Log out, and Log out works mid-fight. On a notched phone the composer and open sheets keep clear of the home indicator.

### B. Deviations and judgment calls (decide at the pass)

- **A1:** Ready and Flee sit in a round row above the hotbar slots, not at the end of the slot strip (CONTEXT "Placement (UI-SPEC, A1)").
- **A5:** the tab bar is hidden in mobile combat; the account button sits on the encounter strip header row, not on the vitals strip.
- **A4:** Tab is scoped and desktop focus starts in the input, so Tab cycles only after Esc or a click away; with nothing to change Tab stays native.
- **A8:** threat percent is relative to the top entry.
- **A26** (CONTEXT "Ally targeting (A7, A26)"): a dead or departed ally stays selectable but is not sent as the target.
- **Ally chip tap height:** about 37px effective, not 44px; taps slightly above or below a chip should still hit it.
- **Glow clipping:** is the chosen-slot glow, the selected-card glow in the rail and the target ring on the mobile chips clipped awkwardly at their container edges?
- **Copy:** 'Ready' and 'Flee' labels kept (verb-noun labels available on request); confirm each server refusal line (cooldown, no target, flee failed) states its reason.
- **Boss tag:** nothing sets `enemy_template.isBoss` yet, so the Boss tag will rarely show.
- **Accessible names:** ally buttons announce 'Target {name} with your next ability' without HP; revisit if HP should be read out.

### C. UI backstops (visual, not unit-testable)

- The round row at 900px (composer 296px) and at 390 with long ability and enemy names: two rows, nothing overflows the composer. The two-row form at 900px uses a ResizeObserver (the frame contract forbids new container queries); confirm it switches at the right width on resize.
- The mobile strip with 6 or more chips (scrolls sideways, never wraps, long names ellipsize).
- The mobile vitals chip row with 5 allies, 6 effects and the tag (scrolls sideways, no vertical wobble).
- The encounter sheet with 8 hostiles and a long threat list (body scrolls inside the sheet).
- The desktop panel with 8 hostiles, 5 threat rows and 3 wind-ups (scrolls inside the 288px rail, dark scrollbar, threat block at the bottom when everything fits).

### D. Needs a paid call or a publish (wait for the owner's go-ahead)

- **Late-narration round tag:** needs a real Keeper narration landing after its round resolved ('The Keeper · Round M' in muted text). Paid LLM calls run locally with the stored key; none were made in this phase.
- **Maincloud publish at the end of the milestone** needs `--break-clients` for the new `my_combat_aggro` view (additive, no clear). For the local server: `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null`, checking `admin_llm_status` key_length (108) before and after, then `pnpm spacetime:generate -y` (the 48-01 bindings were already regenerated and are in the repo).

## Auth gates

None.

## Known Stubs

None. Enemy effect chips and a cast bar are intentionally not drawn (A9, backlog 999.1).

## Threat Flags

None beyond the register. T-48-47: the populated frame test renders the img-onerror payload in every name surface at both widths and finds no img element. T-48-48: no LLM route was called; the scripts suite ran only in its offline form (baseline failures untouched). T-48-49: nothing was published, no server started, stopped or restarted, no maincloud, no clear, no push. T-48-50: every deviation is listed above for the owner.

## Flagged assumptions (carried for the verifier)

- All four unclassified CMB rows (01, 02, 03, 05) were reviewed by hand in plans 01 to 13 and are exercised together here in a mounted frame; live round play is deferred (see the checklist).
- CMB-02 prohibition (never publish, clear, push, start or stop servers, or spend on an LLM during the gate): held; no command in this plan did any of those.
- The module and scripts suites were checked through the full root run (181 files), not as separate invocations.

## Self-Check: PASSED

- FOUND: src/frame/AppFrame.combat.test.ts, .planning/phases/48-combat-encounter/48-VALIDATION.md, .planning/phases/48-combat-encounter/48-14-SUMMARY.md
- FOUND commits: 22e69c82, 7a57bbd1
- `grep -c "wave_0_complete: true"` on 48-VALIDATION.md prints 1; `grep -c "useCombatController.test.ts"` prints 1.
