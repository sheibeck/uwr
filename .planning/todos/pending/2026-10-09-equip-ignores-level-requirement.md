---
created: 2026-10-09T18:40:00.000Z
title: Gear shows "Requires Lv n" but equips at any level - enforce the level or drop the label
area: general
files:
  - spacetimedb/src/reducers/items.ts:583-588 (equip_item: the level check is commented out "per world-tier spec")
  - spacetimedb/src/data/item_usability.ts:58-66 (canEquipItem computes levelShort and requiredLevel but never refuses on them)
  - src/inventory/inspector.ts:134-140 ("Requires Lv n", red when short), src/vendor/vendorModel.ts:220-231, src/crafting/craftingModel.ts:512, src/ledger/itemDetails.ts:102
  - .planning/phases/50-ledger-screens-character-and-economy/50-23-SUMMARY.md:136 (the recorded design: no level gate)
---

## Problem

Owner, 2026-10-09: "I crafter Scrap Cloth Boots of the Arcane. They have a Level 4 requirement, but it let me equip it anyway."

By design today, gear has no level gate. An older "world-tier" decision removed it ("gear availability is world-driven, not character-level-gated. Any item found in the world can be equipped by any character"), and `equip_item` keeps the old check commented out. But the client still shows "Requires Lv n" (in red when you are short) in the inspector, vendor, crafting and ledger. So the game says one thing and does another. Phase 50-23 recorded the gap ("A hard gate would be a one-line model change").

## Solution

Owner decides (likely: enforce, since the label promises it):
- **Enforce:** `canEquipItem` returns not ok with reason 'level' when `levelShort` (message for example "You must be level 4 to wear this."; wording needs approval); `equip_item` refuses through it; the client's Equip action shows the reason and the "Usable by you" filter treats level-short gear as not usable now (still listed, maybe "Usable soon"). Decide: can you still buy or craft gear above your level (yes, probably, to grow into it)? Already-equipped level-short gear (this owner's boots) stays on, or is unequipped at the next equip check (probably stays).
- **Or drop the label:** keep the world-tier design and stop showing "Requires Lv n" anywhere.
Tests for the server rule and the client reason either way. Candidate home: Phase 51.5 Character, Level Up and New Skill (levels), or a quick task if the owner wants it sooner.
