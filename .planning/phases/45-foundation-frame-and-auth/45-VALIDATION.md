---
phase: 45
slug: foundation-frame-and-auth
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-05
---

# Phase 45 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 45-RESEARCH.md "## Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 (root, default include covers `src`, `scripts`, `spacetimedb/src`) + `@vue/test-utils` 2.5.1 + happy-dom 20.14.5 (per-file `// @vitest-environment happy-dom` docblock, never global) + postcss 8.5.28 (static CSS contracts) |
| **Config file** | none (shared `vite.config.ts`; add only `resolve.alias` for game data and `server.port 5173` + `strictPort`) |
| **Quick run command** | `pnpm vitest run src` |
| **Full suite command** | `pnpm vitest run` |
| **Build gate** | `pnpm build` (`vue-tsc -b && vite build && node scripts/check-bundle.mjs`) |
| **Estimated runtime** | ~5 s quick, ~22 s full |

**Baseline (pre-existing, unrelated):** 4 failing files before any Phase 45 change — `scripts/llm/call_log_report.test.mjs`, `scripts/llm/golden_run.test.mjs`, `scripts/llm/proof_rules.test.mjs`, `spacetimedb/src/helpers/measurement.results.test.ts` (v2.2 phase folders moved to `.planning/milestones/`). Gate is "no new failures beyond this list".

---

## Sampling Rate

- **After every task commit:** `pnpm vitest run src`
- **After every plan wave:** `pnpm vitest run` (compare against the 4-file baseline) and `pnpm build`
- **Before `/gsd-verify-work`:** full suite shows no failures beyond the baseline, `pnpm build` green
- **Max feedback latency:** 30 seconds

---

## Per-Requirement Verification Map

Task IDs are assigned by the planner; each plan's tasks reference the rows below.

| Requirement | Behavior | Threat Ref | Test Type | Automated Command | File Exists | Status |
|-------------|----------|------------|-----------|-------------------|-------------|--------|
| CUT-03 | Old UI paths gone, `html2canvas` removed, tag `v2.2-client` exists | — | static | `pnpm vitest run src/legacyClientRemoval.test.ts` + `git tag -l v2.2-client` | ❌ W0 | ⬜ pending |
| CUT-03 | Surviving guards still pass after trim | — | static | `pnpm vitest run src/legacyLlmRemoval.test.ts src/legacyCredentials.test.ts src/llmAdminBindings.test.ts src/connectionLogging.test.ts scripts/check-bundle.test.mjs` | ✅ (edit) | ⬜ pending |
| CUT-03 | No private `llm_` table named by client source | private-table exposure | static | `pnpm vitest run src/legacyLlmRemoval.test.ts` | ✅ (extend) | ⬜ pending |
| FND-01 | Scripts unchanged, port 5173 strict, `index.html` mounts `/src/main.ts` | — | static | `pnpm vitest run src/legacyClientRemoval.test.ts` | ❌ W0 | ⬜ pending |
| FND-01 | Game-data alias resolves `spacetimedb/src/data` | — | unit | `pnpm vitest run src/gameDataAlias.test.ts` | ❌ W0 | ⬜ pending |
| FND-02 | No literal colors outside allowed CSS files | — | static | `pnpm vitest run src/styles/colors.guard.test.ts` | ❌ W0 | ⬜ pending |
| FND-02 | Token pin (17 hexes + 3 resource colors), every `var(--x)` defined | — | static | `pnpm vitest run src/styles/tokens.client.test.ts` | ❌ W0 | ⬜ pending |
| FND-02 | Type scale, weights, spacing scale, Nocturne overrides, Phosphor-only, Inter-only | — | static | `pnpm vitest run src/styles/designContract.test.ts` | ❌ W0 | ⬜ pending |
| FND-03 | Header data (location, Day/Night, tags, 7 buttons, account menu) | — | component | `pnpm vitest run src/frame/HeaderBar.test.ts` | ❌ W0 | ⬜ pending |
| FND-03 | Vitals bars clamp, `0 / 0`, bigint | — | component | `pnpm vitest run src/frame/VitalsRail.test.ts` | ❌ W0 | ⬜ pending |
| FND-03 | 900px three columns, 899px mobile | — | component | `pnpm vitest run src/frame/AppFrame.layout.test.ts` | ❌ W0 | ⬜ pending |
| FND-04 | One drawer at a time, Esc/close, focus return and trap | — | component | `pnpm vitest run src/frame/useScreens.test.ts src/frame/Drawer.test.ts` | ❌ W0 | ⬜ pending |
| FND-05 | Strip, tab bar order and mapping, More sheet, sheet shell | — | component | `pnpm vitest run src/frame/TabBar.test.ts src/frame/Sheet.test.ts` | ❌ W0 | ⬜ pending |
| FND-06 | Screen derivation (splash states, picker, no-characters, frame) | — | unit | `pnpm vitest run src/session/deriveScreen.test.ts` | ❌ W0 | ⬜ pending |
| FND-06 | Connection controller backoff, rejected token clears session, no retry on intentional disconnect | token handling | unit (fake timers) | `pnpm vitest run src/net/connection.test.ts src/net/backoff.test.ts` | ❌ W0 | ⬜ pending |
| FND-06 | `bindTable` keeps rows through a drop | — | unit | `pnpm vitest run src/net/bindTable.test.ts` | ❌ W0 | ⬜ pending |
| FND-06 | PKCE state check, token storage, expiry, `clearAuthSession` | OIDC state/CSRF | unit | `pnpm vitest run src/auth/spacetimeAuth.test.ts` | ❌ W0 | ⬜ pending |
| FND-06 | Picker and logout flow | — | component | `pnpm vitest run src/session/CharacterPicker.test.ts src/session/logout.test.ts` | ❌ W0 | ⬜ pending |
| FND-06 | Version prompt rules | — | unit + component | `pnpm vitest run src/session/versionCheck.test.ts` | ❌ W0 | ⬜ pending |
| FND-07 | Splash logo rule and asset | — | component + static | `pnpm vitest run src/session/SplashScreen.test.ts` | ❌ W0 | ⬜ pending |
| All | Type check, build, bundle credential guard | LLM credential leak | build | `pnpm build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `pnpm add -D @vue/test-utils happy-dom postcss@8.5.28` and `pnpm add @phosphor-icons/vue` (after a human-verify checkpoint on the new packages)
- [ ] `src/legacyClientRemoval.test.ts`, `src/gameDataAlias.test.ts`
- [ ] `src/styles/{colors.guard,tokens.client,designContract}.test.ts` + shared scanner helper
- [ ] `src/net/{connection,backoff,bindTable}.test.ts`
- [ ] `src/auth/spacetimeAuth.test.ts`
- [ ] `src/session/*.test.ts`, `src/frame/*.test.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real layout and computed styles at 1280x800 and 390x844 | FND-02, FND-03, FND-05 | happy-dom has no layout engine and parses Nocturne CSS to 0 rules | `pnpm dev`, Chrome DevTools device sizes; checklist items 1, 2, 5, 6 in 45-RESEARCH.md |
| Drawer/sheet focus ring and real Tab order | FND-04 | synthetic Tab does not move focus in happy-dom | Checklist item 3 |
| Splash fits at 1280x800, 1280x600, 390x844, 390x600 | FND-07 | real image rendering and viewport units | Checklist item 4 |
| Live SpacetimeAuth sign-in, reload, outage reconnect, >30 s outage returns picker, logout | FND-06 | needs the live auth provider and a local server stop/start | run-local skill; checklist item 7 |
| Reload bar in a production build after `set_app_version` | FND-06 | needs a production build and an admin call | Checklist item 8 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
