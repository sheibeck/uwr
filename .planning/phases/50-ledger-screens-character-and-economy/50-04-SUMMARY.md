---
phase: 50-ledger-screens-character-and-economy
plan: 04
subsystem: spacetimedb
tags: [spacetimedb, game-data, items, equip, quest-items]

requires:
  - phase: 50-02
    provides: "itemKeyFromName in data/crafting_rules.ts"
provides:
  - "spacetimedb/src/data/item_usability.ts: isClassAllowed (moved), canEquipItem"
  - "spacetimedb/src/data/item_rules.ts: quest marker, use keys, salvage and scroll rules"
  - "equip_item and use_item call the shared rules; real-handler parity tests"
affects: [50-05, 50-07 sell helper quest refusal, 50-09 publish, Inventory screen, Vendor screen]

tech-stack:
  added: []
  patterns:
    - "Import-free data module with a source pin test; the reducer calls it and a real-handler test pins parity"

key-files:
  created:
    - spacetimedb/src/data/item_usability.ts
    - spacetimedb/src/data/item_usability.test.ts
    - spacetimedb/src/data/item_rules.ts
    - spacetimedb/src/data/item_rules.test.ts
    - spacetimedb/src/reducers/item_rules_parity.test.ts
  modified:
    - spacetimedb/src/helpers/character.ts
    - spacetimedb/src/reducers/items.ts

key-decisions:
  - "Level is not an equip rule: canEquipItem reports levelShort and requiredLevel as information only (RESEARCH Open Question 4)"
  - "Quest items are templates with slot 'quest' (Open Question 13); no generated item carries it yet, so the refusal is a guard"
  - "items.ts keeps isClassAllowed and EQUIPMENT_SLOTS in its deps destructure (EQUIPMENT_SLOTS is still used by create_item_template; isClassAllowed is now unused there but left alone as the plan says)"

requirements-completed: [LDG-02, LDG-08, LDG-09]

status: complete
duration: 20min
completed: 2026-10-06
---

# Phase 50 Plan 04: Shared equip rule and item-kind rules Summary

`equip_item` now refuses through one `canEquipItem` function (same order and messages as before), `use_item` builds its accepted names from `USE_ITEM_KEYS`, and the quest marker, effectful-use list, salvage rule and scroll rule each have an import-free home the client can import.

## Exported signatures

`spacetimedb/src/data/item_usability.ts` (imports only `./class_stats`, `./mechanical_vocabulary`):

- `isClassAllowed(allowedClasses: string, className: string): boolean` (moved verbatim; `helpers/character.ts` re-exports it, so `index.ts` is unchanged)
- `interface EquipTemplateLike { slot; stackable?; weaponType?; armorType?; allowedClasses?; requiredLevel? }`, `interface EquipCharacterLike { className; level; weaponProficiencies?; armorProficiencies? }`
- `type EquipCheck = { ok: true; levelShort: boolean; requiredLevel: bigint } | { ok: false; reason; message: string; levelShort: boolean; requiredLevel: bigint }`
- `canEquipItem(template, character): EquipCheck`

Reason codes and messages, in the server's order:

| reason | message |
|--------|---------|
| stackable | `Cannot equip this item` |
| weapon | `Your class cannot wield this weapon type` |
| armor | `Your class cannot wear this armor type` |
| legacyWeapon | `Weapon type not allowed for this class` |
| legacyClass | `Class cannot use this item` |
| slot | `Invalid slot` |

`spacetimedb/src/data/item_rules.ts` (imports only `./crafting_rules`, `./mechanical_vocabulary`):

- `isQuestItemTemplate(t: { slot?: string | null }): boolean` (`slot === 'quest'`)
- `QUEST_ITEM_SALE_REFUSAL = "Quest items can't be sold."`
- `USE_ITEM_KEYS` (10 names, `as const`), `USABLE_ITEM_KEYS` (bandage, basic_poultice, travelers_tea, simple_rations)
- `isUsableItemName(name: string): boolean`
- `isSalvageableTemplate(t: { slot?; isJunk? }): boolean` (not junk and in the 12 equipment slots)
- `isRecipeScrollName(name: string): boolean` (`startsWith('Scroll:')`)

## Task Commits

1. Task 1: canEquipItem and equip_item delegation: `8ae580b4`
2. Task 2: item_rules and use_item reading USE_ITEM_KEYS: `d71288e0`

## Verification

- `item_usability.test.ts`: 19 tests; `item_rules.test.ts`: 10 tests; `item_rules_parity.test.ts`: 50 tests (12 equip fixtures plus both-outcome and replace-slot cases, use_item accept and refuse names, salvage_item refusals and all 12 equipment slots). All 79 pass together with `--maxWorkers=1`.
- The parity test was written to pass against the old handler and was re-run after each reducer edit.
- `git diff --stat spacetimedb/src/schema spacetimedb/src/reducers/items_crafting.ts` is empty.
- `grep -c "canEquipItem(" items.ts` is 1; `grep -c "Your class cannot wield this weapon type" items.ts` is 0; `grep -c "from '../data/item_usability'" helpers/character.ts` is 1; `grep -c "USE_ITEM_KEYS" items.ts` is 2.

## Deviations from Plan

None to scope. `learn_recipe_scroll` still uses its inline `startsWith('Scroll:')`; `isRecipeScrollName` exists for the client and the later sell and inspector code, and items_crafting.ts was left untouched as the plan requires.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- FOUND: item_usability.ts, item_usability.test.ts, item_rules.ts, item_rules.test.ts, item_rules_parity.test.ts
- FOUND commits: 8ae580b4, d71288e0
