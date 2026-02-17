# Phase 13: Crafting System — Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

A crafting system covering all gear slots (weapons, armor, jewelry, cloaks, accessories) where players gather tiered materials, discover recipes as drops/quest rewards, and combine them at crafting-enabled locations to produce fully deterministic gear with known affixes. Phase 13 also upgrades the existing salvage system (currently gold-only) to yield materials instead. Crafting is a reliable alternative to RNG drops — same power ceiling, predictable output.

Note: The phase is named "Weapons & Armor" but scope extends to ALL craftable equipment including jewelry and cloaks.

</domain>

<decisions>
## Implementation Decisions

### Material Acquisition
- Materials come from TWO sources: world gathering nodes (mineral/plant types) AND enemy drops (hide, bone, essence types)
- Materials are tiered — higher-tier materials produce higher-quality gear (Tier 1 → common, Tier 2 → uncommon, Tier 3 → rare, etc.)
- Medium material taxonomy: 8–12 distinct material types giving meaningful choice (Claude defines exact types to fit existing zone/enemy structure)
- Salvage system upgraded: salvaging gear now yields materials ONLY (gold yield removed). Crafted gear salvages the same as any dropped gear — no special recycle path back to original materials

### Recipe Discovery
- Recipes discovered via THREE paths: drop from enemies/exploration (passive search can surface recipe scrolls), awarded as quest rewards (faction-adjacent quests), and **salvaging an item has a high chance to teach the recipe for that item type**
- Salvage-to-recipe: salvaging a Longsword (regardless of quality) rolls a high-probability chance to add the Longsword recipe to the character's known recipes. This is the primary organic discovery path — dismantle gear you find, learn to build it
- Recipes are per-item-type, NOT per-rarity — one recipe covers all quality tiers of that item (e.g. a single "Longsword" recipe). Quality tier is determined by the material tier used, not a separate recipe. No need to find a "Rare Longsword Recipe" separately from a "Common Longsword Recipe"
- Recipes are character-specific — each character has their own recipe book; alts discover recipes independently
- Any character can craft any recipe they've discovered — no class restriction on crafting
- Learning is automatic on pickup or salvage trigger: recipe immediately added to known list with a Log entry ("You have learned: [Recipe Name]")
- Recipes have types for sorting and filtering: Weapon, Armor, Consumable (and any other relevant categories)

### Crafted Gear Power & Identity
- Material TYPE determines the affix pool — e.g. darksteel enables STR affixes, moonweave enables INT/WIS affixes. Players choose what stats they want by choosing material type
- Material TIER determines quality tier of output — Tier 1 materials → common output, Tier 2 → uncommon, Tier 3 → rare, etc.
- Output is FULLY DETERMINISTIC — a given recipe + material type + material tier always produces the exact same item with the exact same affixes. Zero RNG. Players know exactly what they're crafting before they start
- Power parity with drops: crafted gear has equal stat budget to dropped gear of the same quality tier. Crafting trades RNG for effort and material cost
- Crafting is one-way: crafted gear cannot be salvaged back into the original materials (treats same as any other dropped gear for salvage purposes)

### Crafting UI & Workflow
- Crafting requires a crafting-enabled location (a location that has crafting benches flagged on it) — not any NPC specifically, just the location property
- Crafting is instant on confirmation — no cast bar, no wait. Materials consumed, item created immediately
- Uses the existing Crafting panel (already in the codebase) extended with the new recipe/material system
- Panel layout: single scrollable recipe list with type filter chips (All / Weapon / Armor / Consumable / etc.)
- All known recipes always visible regardless of materials owned. Missing materials shown in red. Craft button disabled when requirements unmet
- Toggle to hide recipes you can't currently craft (default: show all). Lets players plan ahead or focus on what's craftable

### Claude's Discretion
- Exact material type names and taxonomy (8–12 types fitting the existing zone/enemy roster)
- Which specific affixes map to which material types
- How many materials per recipe (cost balance)
- Which locations get the crafting-bench flag seeded
- How recipe scrolls enter the loot table and quest reward system technically

</decisions>

<specifics>
## Specific Ideas

- The phrase "deterministic progression path" is intentional: players should be able to plan their gear acquisition. If I know I want a STR sword, I gather darksteel, find a sword recipe, and craft it. No luck dependency.
- Material choice → stat direction is the core differentiation from drops. Drops are powerful but random; crafting lets you target the stat profile you want.
- Recipe scroll auto-learn + Log entry creates a satisfying discovery moment without requiring an extra interaction step.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 13-crafting-system*
*Context gathered: 2026-02-17*
