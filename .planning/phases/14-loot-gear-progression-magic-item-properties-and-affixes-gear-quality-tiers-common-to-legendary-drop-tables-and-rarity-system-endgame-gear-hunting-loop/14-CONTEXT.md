# Phase 14: Loot & Gear Progression - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Magic item properties and affixes, gear quality tiers (Common to Legendary), drop tables and rarity system, and an endgame gear hunting loop. This phase builds the item property layer on top of existing gear slots — how items get affixes, where they drop from, and how they're presented to the player.

</domain>

<decisions>
## Implementation Decisions

### Quality Tiers

- **5 tiers:** Common, Uncommon, Rare, Epic, Legendary
- Higher tier = better base stats AND more affixes (both scale together)
- Quality communicated via **colored item name + colored tile border** (both)
  - Common=white, Uncommon=green, Rare=blue, Epic=purple, Legendary=orange
- **Legendary items are named uniques** with fixed affixes — each has a specific identity (e.g., "Soulrender"). They are NOT part of the RNG tier system. They only drop from specific named/boss enemies. Small curated pool.

### Level-Gated Quality Unlocks

Gear quality is gated by creature level and region tier. Items cannot exceed the tier ceiling of the region they drop in:

- **Levels 1–10 (Tier 1):** Common and Uncommon only. 1 affix max at +1 magnitude. Very small drop chance for affix items at low creature levels; scales up toward level 10.
- **Levels 11–20 (Tier 2):** Rare becomes possible. Up to 2 affixes at +2 magnitude.
- **Levels 21–30 (Tier 3):** Epic possible. Up to 3 affixes. Tier 3 unlocks non-stat affix types (procs, haste, sustain).
- **Levels 31+ (Tier 4+):** Higher affix counts and magnitudes, more powerful affix types.
- A level 10 creature drops items with more base damage/AC than a level 1 creature — smooth power curve within the tier.
- Enemies scale with region tier, not player level. **Outgearing a region is intentional** — players move to higher-tier regions for a challenge. No player-level enemy scaling.

### Affix System

- **Prefix + Suffix structure** — items can have both a prefix and a suffix, combining into a unique item name (e.g., "Sturdy Blade of Haste")
- **Slot-specific affix pools:**
  - Weapons: offensive affixes (procs, haste/cooldown reduction, STR/INT/DEX bonuses)
  - Armor: defensive affixes (life on hit, max HP bonus, resistances)
  - Accessories: mix (Claude's discretion on which pool)
- **Fixed values per tier** — no range rolling. A Tier 2 item always has exactly +2 magnitude affixes. No "perfect roll" hunting within a tier.
- **Affix types by tier:**
  - Tier 1–2: Stat bonuses only (+STR, +INT, +DEX, +HP, etc.)
  - Tier 3+: Unlocks non-stat types — combat procs (% chance on hit), sustain (life on hit, mana regen), haste/cooldown reduction
- **No utility affixes** — no gold find, XP boost, travel cost reduction. Gear should not steal class identity. All affixes are combat-focused.
- **Procs are high-tier only** — combat procs (e.g., "10% chance to deal bonus fire damage on hit") unlock at Tier 3+.

### Drop Sources

- **Regular enemy kills:** Low chance at any affix item. Drop quality capped by creature level/region tier. A level 1 creature has a very small chance; a level 10 creature has a meaningful chance.
- **Named/elite enemies (boss_kill quest targets):** Guaranteed drop of higher-tier item than regular mobs at same level. Primary targeted farming loop.
- **Quest rewards:** Specific quests reward specific gear pieces. Deterministic/narrative-tied gear.
- **No exploration chests for gear** — Search system reveals resources and quest items, not gear.
- **Salvage or sell:** Old gear can be vendored for gold OR salvaged into crafting materials (player's choice per item). Both options available.

### Identification & Discovery

- **Immediately identified** — affixes visible the moment gear drops. No ID scrolls or NPC visit required.
- **Tooltip format:** Quality color on name + base stats + each affix line by line. Clean, complete, no comparison arrows.
- **Loot panel:** Gear shows with quality-colored name. Epic and Legendary drops get a brief animated flash to draw the eye.
- No up/down arrows comparing to equipped gear — player reads the tooltip and decides.

### Claude's Discretion

- Exact affix pool contents (specific names, exact values) — tuned during planning/seeding
- Accessory affix pool composition
- Exact drop rate percentages per creature level
- Loot panel animation specifics (CSS transition style for the Epic/Legendary flash)
- Number of named Legendaries in the first pass

</decisions>

<specifics>
## Specific Ideas

- Smooth power curve is a core requirement — each level step should feel like a small upgrade, not a sudden jump
- Combat should never become trivial from gear alone — enemy difficulty is region-tied, not player-level-tied
- Prefix + suffix naming creates emergent item identity (e.g., "Sturdy Blade of Haste") without requiring hand-crafted names for every random item
- Named Legendaries are collectibles with specific identities — a player can say "I want Soulrender" and hunt for it

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-loot-gear-progression*
*Context gathered: 2026-02-17*
