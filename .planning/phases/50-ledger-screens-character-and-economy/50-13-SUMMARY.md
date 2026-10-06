---
phase: 50-ledger-screens-character-and-economy
plan: 13
subsystem: client-components
tags: [vue, components, accessibility, design-contract]

requires:
  - phase: 50-10
    provides: "SEND_ERROR_TEXT, the action runner rejection counter"
  - phase: 50-11
    provides: "itemModel (itemName, itemRarity, itemIcon, nameColor, ringColor, itemCategory)"
provides:
  - "src/ledger/GoldAmount.vue, FilterChips.vue, SegTabs.vue, InlineConfirm.vue, ItemTile.vue, NoticeLine.vue"
affects: [50-14 inspector, 50-15 inventory screen, 50-16 and later stats, vendor and crafting screens]

tech-stack:
  added: []
  patterns:
    - "Capture-phase Esc on the document so an inner confirmation closes first and the drawer's defaultPrevented check holds"
    - "Per-tile ring as an inline box-shadow of var(--...) tokens, so no new custom property is introduced"

key-files:
  created:
    - src/ledger/GoldAmount.vue
    - src/ledger/FilterChips.vue
    - src/ledger/SegTabs.vue
    - src/ledger/InlineConfirm.vue
    - src/ledger/ItemTile.vue
    - src/ledger/NoticeLine.vue
    - src/ledger/parts.test.ts
    - src/ledger/NoticeLine.test.ts
  modified: []

key-decisions:
  - "InlineConfirm listens for Escape on the document in the capture phase: the drawer's own handler is a bubble-phase document listener registered earlier, so a bubble-phase handler here would run second and the drawer would already have closed"
  - "NoticeLine remembers the last server key it showed, so an older mirrored line does not replace a client rejection when an unrelated entry arrives"
  - "NoticeLine uses warning only for client rejections, check for reward and heal, info for system (RESEARCH Open Question 7, a recorded deviation from the UI-SPEC color table)"

requirements-completed: [LDG-01, LDG-08, LDG-09, LDG-10]

status: complete
duration: 40min
completed: 2026-10-06
---

# Phase 50 Plan 13: Shared Ledger parts Summary

Six accessible, contract-compliant building blocks every Ledger screen uses: gold, filter chips, ARIA segmented tabs, inline confirmation, the backpack tile and the notice line. Every server string they render is a text node (img-onerror escape tests pass).

## Components

- **GoldAmount** props `amount: bigint`, `size?: 'label' | 'body'` (12 or 14px), `delta?: boolean` (leading `+`), `tone?: 'default' | 'muted' | 'short'` (neutral 500 or con-red). Emits none, no slots. 8px coin (`--color-line-quest`, aria-hidden), en-US grouped amount, `role="img"` with `aria-label="{n} gold"` (`+{n} gold` for a delta).
- **FilterChips** props `options: {id, label}[]`, `modelValue`, `groupLabel`, `mobile?`, `disabled?`. Emits `update:modelValue(id)`. `role="group"`, `aria-pressed` buttons (`.tag-accent` selected, `.tag-neutral` others), 44px `::after` slop and a hidden-scrollbar row on mobile; `aria-disabled` and no emit when disabled.
- **SegTabs** props `tabs: {id, label}[]`, `modelValue`, `label`, `idPrefix`. Emits `update:modelValue(id)`. Default slot `{ active }`, rendered only for the selected tab inside `role="tabpanel"` (`tabindex="0"`, `aria-labelledby`). Roving tabindex, arrows wrap, Home and End, all `preventDefault()`, focus follows selection. Root is a flex column that fills its parent; the panel is the scroll region.
- **InlineConfirm** props `prompt`, `confirmLabel`, `keepLabel?` (default `Keep it`), `pending?`, `mobile?`, `opener?: HTMLElement | null`. Emits `confirm`, `keep`. Focuses Keep it on mount; Keep it and Escape emit `keep` and refocus the opener (Escape prevented in the capture phase); confirm is `aria-disabled` and inert while pending. No slots.
- **ItemTile** props `instance`, `template`, `selected`, `mobile?`, `tabindex?`. Emits `select`. Button with the item icon in the name color, the name on desktop only, the quantity above 1 (absolutely positioned), ring as an inline inset box-shadow in the ring color (2px selected), `aria-pressed`, `aria-label="{name}, {rarity}{, quantity n}{, junk}{, quest item}"`. No slots.
- **NoticeLine** props `rejection?: number` (the action runner's counter). No emits or slots. Exports `MIRRORED_KINDS` (system, reward, heal). Snapshots the feed keys at mount, shows the newest private mirrored line that arrived since, or `SEND_ERROR_TEXT` when `rejection` increments; `role="status"`, `aria-live="polite"`; nothing renders until a line arrives; reads `game.feed.entries` through `GAME_KEY` (inert fallback).

## Verification

- `pnpm exec vitest run src/ledger/NoticeLine.test.ts src/ledger/parts.test.ts src/styles --maxWorkers=2`: 6 files, 102 tests passed (parts 27, NoticeLine 11).
- `pnpm exec vue-tsc -b`: exit 0.
- `grep -l 'role="tablist"' src/ledger/SegTabs.vue` prints the file; `preventDefault` appears in SegTabs.vue and InlineConfirm.vue; `MIRRORED_KINDS` appears in NoticeLine.vue.

## Task commits

1. `142f63ab` gold, filter chips, segmented tabs, inline confirmation, item tile (with parts.test.ts)
2. `ac454739` notice line (with NoticeLine.test.ts)

## Deviations from Plan

**1. [Rule 1 - Design, recorded] Escape is handled in the capture phase on the document**
- **Issue:** the plan says Esc calls `preventDefault` so the drawer does not close. The drawer registers a bubble-phase document listener on mount, before this component mounts; a bubble-phase listener here would run after it and the drawer would already have closed.
- **Fix:** a capture-phase document listener (removed on unmount). Tested: a later document listener sees `defaultPrevented` true.

**2. [Interpretation] Notice icon colors**
- Per RESEARCH Open Question 7 (resolved in the plan): warning icon only for client rejections, check for reward and heal, info for system. This differs from the UI-SPEC color table, which paired the warning icon with error-like lines.

**3. [Note] The notice line has no always-present live region**
- UI-SPEC and the plan say nothing renders before the first line (no empty box), so the `role="status"` container is created with its first line. Some screen readers announce a live region that already exists when its text changes more reliably than one inserted with its text. If the owner's UAT finds the line is not announced, the fix is an always-present zero-height container.

## Known Stubs

None.

## Threat Flags

None. T-50-43 (text nodes only; the designContract guard forbids raw-HTML rendering; img-onerror tests for ItemTile and NoticeLine), T-50-44 (only private rows of the active character and only three kinds) and T-50-45 (one entry held, no timers) hold.

## Self-Check: PASSED

- FOUND: the six components and both test files; commits 142f63ab, ac454739
