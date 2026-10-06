---
status: testing
phase: 50-ledger-screens-character-and-economy
source: [50-VERIFICATION.md, 50-23-SUMMARY.md, 50-24-SUMMARY.md, 50-25-SUMMARY.md, 50-26-SUMMARY.md, 50-27-SUMMARY.md]
started: 2026-10-06T00:00:00Z
updated: 2026-10-06T00:00:00Z
deferred: The owner deferred hands-on verification to one end-of-milestone UAT pass. The owner tried parts of this live during the phase, and that feedback produced gap plans 50-24 to 50-27.
---

## Current Test

number: 1
name: The four Ledger screens at 1280
expected: |
  Inventory, Stats, Trade and Crafting open from the header and More. Every action works against the local server. The try-out steps are in 50-23-SUMMARY "Owner try-out list"; step 3 was corrected in the client review fix.
awaiting: user response (deferred to end-of-milestone UAT)

## Tests

### 1. Inventory and inspector (LDG-01, LDG-02)
expected: |
  - Slots and the backpack are shown, with filters, the slot count and gold.
  - The inspector compares against equipped gear (▲/▼).
  - Equip, Unequip, Use and Eat work.
  - Salvage asks for confirmation on a non-common, crafted, affixed or equipped item.
result: [pending]

### 2. Stats (LDG-03)
expected: |
  - Base stats show as bars with the gear bonus, plus the derived table.
  - Renown rank and the perk chooser appear. A server refusal keeps the chooser open.
  - Faction standing is shown. The `/faction` tier labels match the screen.
result: [pending]

### 3. Trade: stock, buy, sell, buy-back (LDG-08, LDG-09)
expected: |
  - Base stock fits the area and vendor role, refreshes every 15 minutes and is never sold out forever.
  - Each listing shows "×n", and a sold-out listing says so.
  - The buy price is always above the sell value, including at high Charisma.
  - The sell quantity picker offers 1, All and −/+.
  - Sell all junk shows a preview and skips quest items.
  - Buy-back refunds exactly. It refuses on a wrong place, a full bag, an item already resold, or gold that is too short.
  - Buy, sell and sell-all-junk require a vendor at your location.
result: [pending]

### 4. Crafting (LDG-10, LDG-11)
expected: |
  - Discover recipes at a station generates rule-based recipes from your materials. Elfansworth at Cormorant Stair: first Copper Dagger, Scrap Cloth Robe and Stone Pendant; then Herbal Draught and Iron Shard Dagger.
  - Crafting shows "Quality: {Tier}" plus a hint.
  - The reagent and essence pairing works.
  - A refused craft consumes nothing.
result: [pending]

### 5. Mobile 390×844
expected: |
  - Bag opens Inventory. More opens Stats, Crafting and Vendor (titled "Trade").
  - Screens open as sheets above the tab bar.
  - The quantity picker and the sold-out row fit.
  - Touch targets are 44px.
result: [pending]

### 6. Owner decisions and wording to confirm
expected: |
  - The craft-quality hint reads "A recipe with a tier {n+1} primary material would make it {Tier}." The UI-SPEC example was shorter.
  - "Usable by you" ignores level.
  - No generator marks items as quest items yet.
  - Renown passive perks have no effect (a todo).
  - Two guard-test edits need sign-off: the 1200px tier, now scoped to the screen folders, and the icon pattern, now limited to package imports.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
