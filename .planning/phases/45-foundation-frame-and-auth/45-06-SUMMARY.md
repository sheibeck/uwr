---
phase: 45-foundation-frame-and-auth
plan: 06
subsystem: ui
tags: [vue, layout, vitals, rails]
requires:
  - phase: 45-01
    provides: fresh Vue client scaffold at repo root
  - phase: 45-02
    provides: tokens.client.css resource colors and design guards
provides:
  - barFraction and vitalText bar math
  - VitalsRail (desktop 252px), VitalsStrip (mobile, normal and compact), ContextRail (288px), FeedShell
affects: [45-10, 47]
tech-stack:
  added: []
  patterns: [static source-string tests resolved from process.cwd(), inline width percentage only for bar fills]
key-files:
  created:
    - src/frame/vitals.ts
    - src/frame/VitalsRail.vue
    - src/frame/VitalsRail.test.ts
    - src/frame/VitalsStrip.vue
    - src/frame/VitalsStrip.test.ts
    - src/frame/ContextRail.vue
    - src/frame/FeedShell.vue
    - src/frame/railsShell.test.ts
  modified: []
key-decisions:
  - "Bar fills use the inline width percentage only; colors come from per-resource classes using --color-health/mana/stamina"
  - "Strip tag group is one tag row high (max-height 24px, overflow hidden, flex-wrap) so New skill is clipped before Level up and the name never wraps"
patterns-established:
  - "Rail and strip components take plain props (bigint vitals) and leave projection to src/session/frameView.ts"
requirements-completed: [FND-03, FND-05]
duration: 15min
completed: 2026-10-05
status: complete
---

# Phase 45 Plan 06: Vitals Rail, Strip, Context Rail and Feed Shell Summary

**Persistent vitals displays (252px desktop rail, mobile strip with compact sheet-open variant) plus empty context rail and bottom-anchored feed shell with the documented empty lines.**

## Accomplishments
- `vitals.ts`: `barFraction` (clamped 0..1, 0 when max <= 0) and `vitalText` ('212 / 260', '0 / 0').
- `VitalsRail.vue`: 44px avatar, name with ellipsis and title, class line, three role="progressbar" bars with tabular readouts, Party empty line.
- `VitalsStrip.vue`: 36px avatar identity row, display-only Level up (outline) and New skill (accent) tags, HP/MP/SP 4px micro bars; compact variant is one row with name plus HP and MP bars.
- `ContextRail.vue` (288px; Here, Nearby, Tracking empty lines) and `FeedShell.vue` (flex-end, 760px line, compact mobile padding).

## Task Commits
1. Task 1 RED: c93b9e2b; GREEN: 9741cc09
2. Task 2 RED: 859b9058; GREEN: 6dbd89a0
3. Task 3 RED: 861a2049; GREEN: 2b202157

## Verification
- `pnpm vitest run` on the three new test files: 30 tests pass; `pnpm exec vue-tsc -b` exits 0.
- `pnpm vitest run src --maxWorkers=1`: 3401 pass, 2 fail, both in the baseline `spacetimedb/src/helpers/measurement.results.test.ts` (pre-existing, not touched).
- 45-02 guards (colors, spacing, icons, fonts, v-html) pass over the new files.

## Deviations from Plan
None - plan executed exactly as written. (A transient `barWidth` helper was added and removed within Task 1 before commit; templates call `barFraction` directly as the plan's key links require.)

## Known Stubs
None. The "Not in a party.", "Your location appears here.", "No one is nearby.", "No quests tracked." and "Your story will appear here." lines are the documented Copywriting Contract empty states; Phase 47 fills them.

## Threat Flags
None. T-45-08 mitigated: names rendered via mustache interpolation only (a test asserts markup in a name is not parsed), CSS truncation, full name in `title`.

## Self-Check: PASSED
