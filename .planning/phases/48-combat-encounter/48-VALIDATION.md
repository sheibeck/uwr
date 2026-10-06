---
phase: 48
slug: combat-encounter
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-10-06
---

# Phase 48 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 48-RESEARCH.md "## Validation Architecture".

> `workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 5.0.2 (client config in `vite.config.ts`; `spacetimedb/` has its own vitest) |
| Config file | none separate; `// @vitest-environment happy-dom` per component test; `@game-data` alias via `vite.config.ts` |
| Quick run command | `pnpm exec vitest run src/<dir>/<file>.test.ts` (server: `cd spacetimedb && pnpm exec vitest run src/views/combat.test.ts`) |
| Full suite command | `pnpm exec vitest run --dir src --maxWorkers=2` plus `pnpm exec vue-tsc -b`; server `cd spacetimedb && pnpm exec vitest run --maxWorkers=1` (baseline: client 78 files / 1372 tests green at 46.1-09; server baseline has one known failing file `measurement.results.test.ts`) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CMB-01 | `conFor` boundaries (-6,-5,-4,-2,-1,0,1,2,3,9), missing template -> white, meaning words | unit | `pnpm exec vitest run src/combat/difficulty.test.ts` | exists |
| CMB-01 | hostile rows: ascending id, HP clamp, `0/0`, boss only when `isBoss === true`, defeated inert, count text | unit + component | `pnpm exec vitest run src/combat/hostiles.test.ts src/combat/EncounterPanel.test.ts` | exists |
| CMB-01 | click calls `set_combat_target`; ring follows `combatTargetEnemyId` only | component | `pnpm exec vitest run src/combat/EncounterPanel.test.ts` | exists |
| CMB-01 | Tab/Shift+Tab: forward, backward, wrap, none -> first/last, skip defeated, one hostile no-op, rapid presses, scope (input, drawer/sheet, modifier, header button, hotbar slot), `preventDefault` only when acting, `Target:` status | unit + component | `pnpm exec vitest run src/combat/cycling.test.ts src/combat/useCombatController.test.ts` | exists |
| CMB-01 | rail swaps Here/Nearby/Tracking for the Encounter panel only when `combat.active` | component | `pnpm exec vitest run src/frame/ContextRail.test.ts src/frame/railsShell.test.ts` | exists |
| CMB-02 | server view: own fights only, never another user's, per-sender, no `iter()`, pet rows dropped, keys | server unit | `cd spacetimedb && pnpm exec vitest run src/views/combat.test.ts` | exists |
| CMB-02 | threat rows: descending, id tiebreak, percent vs top, `You`, empty, no target hides | unit + component | `pnpm exec vitest run src/combat/threat.test.ts` | exists |
| CMB-02 | `queries.myCombatAggro` is an unfiltered view subscription; bindings contain `myCombatAggro` | unit | `pnpm exec vitest run src/game/queries.test.ts` | exists |
| CMB-03 | N formula (rail live vs feed at announcement), `lands this round`, targets you/name/pet/the party, row follows the cast row | unit | `pnpm exec vitest run src/combat/windup.test.ts` | exists |
| CMB-03 | feed block once per cast id, not on snapshot, same string as the rail | unit + component | `pnpm exec vitest run src/console/feedStore.test.ts src/console/FeedLine.test.ts src/combat/combatFeed.test.ts` | exists |
| CMB-04 | header placement `start(N) < t <= start(N+1)` incl. equality, opening lines before Round 1, header before any line, boundaries survive row deletion, dedupe, accent vs neutral, 300 cap, insert-by-timestamp | unit | `pnpm exec vitest run src/console/feedStore.test.ts src/console/lines.test.ts` | exists |
| CMB-04 | late narration tag only when rounds differ and known; correlation by createdAt; survives binding disposal | unit | `pnpm exec vitest run src/console/feedStore.test.ts src/combat/combatFeed.test.ts src/game/gameData.test.ts` | exists |
| CMB-04 | combat lines Body neutral, last integer emphasised for damage/heal only, `<b>` literal, round header/resolving kinds render nothing, no `v-html` | component | `pnpm exec vitest run src/console/FeedLine.test.ts src/console/FeedView.test.ts src/combat/emphasis.test.ts` | exists |
| CMB-04 | rounds cooldown: `{n} rounds`/`1 round`, total from `cooldownSeconds` (not `durationMicros`), no wall clock in combat, out-of-combat unchanged | unit + component | `pnpm exec vitest run src/combat/roundCooldown.test.ts src/hotbar/HotbarRow.test.ts` | exists |
| CMB-05 | header `In combat · Round N`, six screen buttons `aria-disabled` and focusable, account enabled, drawer closes at start | component | `pnpm exec vitest run src/frame/HeaderBar.test.ts src/frame/AppFrame.screens.test.ts` | exists |
| CMB-05 | ally targeting: default self, `You` first, aria-pressed, reset on leave/fight end, `allyTargetFor` omits dead/left/non-ally-rule, not shown solo | unit + component | `pnpm exec vitest run src/combat/ally.test.ts src/rails/PartyBlock.test.ts src/frame/VitalsStrip.test.ts` | exists |
| CMB-05 | Flee calls `flee_combat`, `Flee chosen` from the row, reverts when an ability replaces it | component | `pnpm exec vitest run src/combat/RoundRow.test.ts` | exists |
| CMB-05 | damage flash: drop yes, first load/character switch no, healing no, delta sums, reduced-motion class path with no animation | unit + component | `pnpm exec vitest run src/combat/useDamageFlash.test.ts src/frame/VitalsRail.test.ts src/frame/VitalsStrip.test.ts` | exists |
| CMB-05 | mobile: tab bar and location row hidden in combat, strip chips target, header opens `encounter` sheet, sheet meta, closes at fight end, strip collapses with the keyboard, tag priority over Level up/New skill, account button reaches Log out | component | `pnpm exec vitest run src/frame/AppFrame.layout.test.ts src/frame/useScreens.test.ts src/frame/Sheet.test.ts src/combat/EncounterStrip.test.ts` | exists |
| CMB-06 | timer: ceil seconds never `0s`, fraction, skew, `Resolving...` at 0 and with no open round, controls inert, 1 s tick under reduced motion | unit + component | `pnpm exec vitest run src/combat/roundClock.test.ts src/combat/RoundRow.test.ts` | exists |
| CMB-06 | chip states (default, no target, Ready, ability enemy/ally/no target, flee, down), chosen slot from the row only and cleared next round, Ready uses `submit_combat_action` and disables once a row exists | unit + component | `pnpm exec vitest run src/combat/choice.test.ts src/combat/RoundRow.test.ts src/hotbar/HotbarRow.test.ts` | exists |
| All | every combat surface at once at 1280 and 390, img-onerror in every name surface renders as text (no img element) | integration | `pnpm exec vitest run src/frame/AppFrame.combat.test.ts` | exists |
| All | design guards, 23 tokens, computed sizes/weights on a populated combat frame | static | `pnpm exec vitest run src/styles` | exists |
| All | Phase 47 suites still green | regression | `pnpm exec vitest run --dir src --maxWorkers=2` | exists |

### Sampling Rate
- **Per task commit:** the quick command of the touched module, plus `pnpm exec vitest run src/styles` when a `.vue` or `.css` changed.
- **Per wave merge:** full client suite and `pnpm exec vue-tsc -b`; server suite after the view task.
- **Phase gate:** full suites green, `pnpm build` (includes the bundle guard), then `/gsd-verify-work`. Live round play stays deferred to the milestone UAT.

### Wave 0 Gaps
- [x] `spacetimedb/src/views/combat.test.ts` (new): the view, no-scan Proxy, per-sender
- [x] `src/combat/{difficulty,hostiles,threat,windup,roundClock,choice,cycling,ally,emphasis,roundCooldown}.test.ts`
- [x] `src/combat/{useCombatController,useDamageFlash}.test.ts`
- [x] `src/combat/{EncounterPanel,EncounterStrip,RoundRow}.test.ts` (component, happy-dom, inject inert defaults then override)
- [x] Update fixtures: `gameData.test.ts` (`queries` literal, static SQL), `queries.test.ts`, `lines.test.ts:210`, `VitalsStrip`/`PartyBlock`/`HeaderBar`/`useScreens`/`Composer`/`HotbarRow` extensions
- [x] A shared test builder for combat rows (bigint ids, `{ microsSinceUnixEpoch }` timestamps), kept inside test files (production-file guards must not scan helpers, as in 45-10)
- [x] Server publish and `pnpm spacetime:generate -y` are execution tasks, not test gaps; the client tests that import `myCombatAggro` come after regeneration

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Local publish of the `my_combat_aggro` view with `--break-clients` and no clear; the stored key is unchanged | CMB-02 | Needs the owner's running local server (never maincloud) | Run `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null`. Check that `admin_llm_status` key_length is 108 before and after, then run `pnpm spacetime:generate -y`. |
| Live combat in the new client: the encounter rail, targeting, threat list, wind-up warning, round headers, timer, Ready and Flee, ally heals, damage flash, mobile strip | CMB-01..06 | Needs a real fight on a real server | Deferred to the end-of-milestone UAT |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
