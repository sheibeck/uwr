---
phase: 50-ledger-screens-character-and-economy
plan: 14
subsystem: client-inventory
tags: [vue, inventory, inspector, comparison]

requires:
  - phase: 50-11
    provides: "itemModel, compare (compareRows, instanceStats), backpack (slotUsage)"
  - phase: 50-13
    provides: "InlineConfirm, GoldAmount; the action runner from 50-10"
provides:
  - "src/inventory/inspector.ts: inspectorView, salvagePrompt, dockSummary"
  - "src/inventory/Inspector.vue: desktop card and mobile dock with actions"
affects: [50-15 inventory screen]

tech-stack:
  added: []
  patterns:
    - "One pending runner key covers a two-call flow (unequip then salvage), so the confirm stays inert throughout"
    - "Action row hidden with v-show while a confirmation is open, so the opener element survives for focus return"

key-files:
  created:
    - src/inventory/inspector.ts
    - src/inventory/inspector.test.ts
    - src/inventory/Inspector.vue
    - src/inventory/Inspector.component.test.ts
  modified: []

key-decisions:
  - "Component tests live in Inspector.component.test.ts: the planned Inspector.test.ts and inspector.test.ts are the same file on case-insensitive Windows"
  - "The equip reason for a stackable or invalid-slot refusal shows the server's own message; the class and proficiency refusals show \"Your class can't use {type}.\""
  - "Learn recipe is chosen by the scroll name before the Use rule, so a scroll in a consumable slot still learns"

requirements-completed: [LDG-02]

status: complete
duration: 30min
completed: 2026-10-06
---

# Phase 50 Plan 14: Inventory inspector Summary

A pure `inspectorView` derives every row, action and reason of the inspector from the selected instance and the server's shared rules, and `Inspector.vue` draws it as a desktop card or a mobile dock and runs Equip, Unequip, Use, Learn recipe and Salvage through the screen's action runner.

## inspectorView shape (src/inventory/inspector.ts)

`inspectorView(input): InspectorView | null` (null while the template has not arrived).

Input: `{ instance, templates, affixes, items, character: { level, className, weaponProficiencies?, armorProficiencies?, vendorSellMod }, perkKeys, usage }`.

Output: `{ instanceId, rarity, rarityLabel, nameColor, name, kicker, typeWord, equipped, equippedSlot, gear, metaParts: { text, tone: 'normal' | 'short' | 'craft', craftQuality? }[], caption, rows: CompareRow[], affixRows: { name, text }[], flavor, primary: { kind: 'equip' | 'unequip' | 'use' | 'learn', label, mobileLabel, available, reason } | null, salvage: { visible, needsConfirm, available, reason }, footer: { kind: 'sell' | 'quest' | 'junk', text, amount } }`.

Also exported: `salvagePrompt(name, equipped)` and `dockSummary(view)` (the head plus at most four stats, for example `Rare chest · AC 14 ▲3 · INT +3 ▲1`).

Rules come from the shared helpers: `canEquipItem` (equip), `isSalvageableTemplate`, `isUsableItemName`, `isRecipeScrollName`, `isQuestItemTemplate` (kinds), `sellPayout` and `perkBonusByField(…, 'vendorSellBonus', level)` (sell value), `compareRows`, `instanceStats`, `affixesFor` (comparison). A level shortfall is only a `short`-tone meta part; it never makes Equip unavailable.

## Inspector component

Props: `instanceId: bigint | null`, `variant: 'card' | 'dock'`, `runner: ActionRunner` (the screen's runner, so the screen's NoticeLine sees its rejection counter). Emits: `close` (the dock's 44px `Close item details` button). Injects GAME_KEY and LEDGER_KEY with inert fallbacks.

- Card: kicker, name (wraps), meta, caption, stats grid with up/down markers (aria-hidden plus sr-only text), affix rows, flavor, actions, reason, footer. With nothing selected it shows only `Select an item to see its details.`
- Dock: name row with close, summary line, reason (before the actions), actions at min-height 44, footer; no affix rows and no flavor.
- Unavailable actions use `aria-disabled="true"` plus `aria-describedby` to the reason line; never the native attribute. Every action is also inert while pending or offline.
- Salvage: a common bag item runs at once; above common or equipped opens `InlineConfirm` (Keep it focused; Keep it and Esc send nothing and refocus Salvage). The equipped flow awaits `unequipItem`, then `salvageItem` only if the ledger no longer shows the item equipped. The confirmation closes when the selected instance changes or the item disappears.

## Verification

- `pnpm exec vitest run src/inventory src/ledger src/styles --maxWorkers=2`: 14 files, 228 tests passed (inspector.test.ts 30, Inspector.component.test.ts 28).
- `pnpm exec vue-tsc -b`: exit 0.
- `grep -c "canEquipItem(" src/inventory/inspector.ts` prints 1; `grep -c "sellPayout(" ...` prints 1; `grep -c "Select an item to see its details." src/inventory/Inspector.vue` prints 1.

## Task commits

1. `8aac02a8` inspector view model
2. `7642679b` inspector card and dock

## Deviations from Plan

**1. [Rule 3 - Blocking] Component test file renamed**
- The plan lists `inspector.test.ts` and `Inspector.test.ts`, which are one path on case-insensitive Windows (writing the second overwrote the first, which was restored from git). The component tests are `src/inventory/Inspector.component.test.ts`.

**2. [Rule 1 - Bug, found by the token guard] Craft color is a literal token map**
- A template-built `var(--color-craft-${q})` failed the `tokens.client` var-definition guard. The component uses a literal five-entry map and an own-property check, so an unknown quality (even `constructor`) gets no color.

## Known Stubs

None.

## Threat Flags

None. T-50-46 (text nodes only; escape test in both variants), T-50-47 (confirmation above common or when equipped; Keep it sends nothing), T-50-48 (runner ignores repeats; tested) and T-50-49 (level is information only) hold.

## Self-Check: PASSED

- FOUND: src/inventory/inspector.ts, inspector.test.ts, Inspector.vue, Inspector.component.test.ts
- FOUND commits: 8aac02a8, 7642679b
