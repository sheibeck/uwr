---
created: 2026-10-08T22:30:00.000Z
title: Herbal Draught (a drink) shows as Food with "Eat", a "None" line and no real description
area: ui
files:
  - spacetimedb/src/data/recipe_rules.ts (FOOD_FORMS: health_regen -> "Draught", mana_regen -> "Broth", stamina_regen -> "Stew", str -> "Roast", dex -> "Salad")
  - spacetimedb/src/reducers/items_crafting.ts (generated outputs: description "Crafted from {a} and {b}.")
  - src/inventory/inspector.ts (~line 250: slot 'food' -> primary action "Eat")
  - src/inventory/Inspector.vue (the "None" line)
---
## Problem

The owner, 2026-10-08, verbatim: "herbal drought has no description. It's in my inventory as a food, but probably should actually say drink. the button says eat:" and pasted the inspector:

```
Common · Tier 1 · Food
Herbal Draught
None
Crafted from Herbs and Murky Water.
```

Scout (2026-10-08): the local row is `item_template` 4101, `name "Herbal Draught"`, `slot "food"`, `description "Crafted from Herbs and Murky Water."`. It is a rule-crafted consumable: `FOOD_FORMS` names a health-regeneration food a "Draught" (mana a "Broth", stamina a "Stew"). The inspector picks the primary action from the slot (`slot === 'food'` -> "Eat") and the category label "Food". The "None" line is not literal client text (not found in `src`); it is probably the item's effect or stat summary rendering an empty value.

Three issues:
1. **Drinks read as food.** A Draught (and maybe a Broth) should show the category "Drink" and the action "Drink" (the server path can stay `eat_food`, but the word should match the item).
2. **"None" line.** Find what renders "None" for a consumable and replace it with the real effect (e.g. "Restores health over time while Well Fed" with magnitude and duration from the template's buff fields), or hide the line when there is nothing to show.
3. **Description.** "Crafted from Herbs and Murky Water." is the only flavour. Give rule-crafted consumables a short description of what they are and do (template text by food form, server-side), keeping the "crafted from" line if useful.

## Solution

TBD. A quick task: a shared rule (in `@game-data`, e.g. by `FOOD_FORMS` word or a drink flag) decides food vs drink for both the inspector label and action; fix the "None" source; server-side rule descriptions for generated consumables (existing rows backfilled or fixed on next craft; additive only, no clear). Player-facing wording to the owner for approval. Unit tests required.
