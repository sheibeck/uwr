# Phase 36: Ability Expansion - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning
**Source:** User design decisions (inline)

<domain>
## Phase Boundary

This phase expands the dynamic ability system to cover all game systems, adds pure buff/debuff abilities, makes race abilities functional, implements per-level heritage bonuses, and unifies renown perks into the ability system with LLM-driven selection.

</domain>

<decisions>
## Implementation Decisions

### More Ability Types
- Add new ability kinds: songs, auras, travel, pets, fear, buffs, summoning food, bandages, potions
- These should all work through the existing dynamic ability system (kind-based dispatch)
- Server and client dispatch must handle all new kinds

### Pure Buffs and Debuffs
- Many LLM-suggested abilities are both debuffs AND damage — we need abilities that are JUST buffs or JUST debuffs
- Example debuffs: slow (reduces enemy attack speed), fear (CC effect)
- Example buffs: haste, strength, intelligence (stat buffs)
- Pure buffs should be castable OUTSIDE of combat on self or party members

### Race Abilities
- When the LLM displays a race during character creation, it lists an ability that is currently purely narrative
- This race ability must become a REAL, functional ability in the game
- Should be minor — passive or active, can work with any existing system (pulling, fleeing, movement, combat bonus, defensive effect)
- Can be on longer cooldown timers
- These should be minor boons, not game-changing

### Heritage Bonuses
- In v1.0 heritage bonuses were applied every OTHER level — now they should apply EVERY level
- Must be shown during character creation (so player knows what they'll get each level)
- Must be expressed/shown during the level-up phase
- Heritage bonuses are per-race bonuses gained at each level

### Renown Perks as Abilities
- Renown perks are essentially abilities — bring them into the dynamic ability system
- Abilities now have different sources: Class, Renown, Race
- All abilities should use the same dynamic system regardless of source
- Renown perks should be offered dynamically via the LLM just like level-up abilities

### Renown Rank-Up Flow
- When gaining a renown rank, provide a similar process to level-up
- Notify user in the header that they've gained a renown rank
- Player goes into renown UI and chooses their rewards for the new renown level
- LLM needs specific rules/constraints for generating renown perks (different flavor from class abilities)

### Claude's Discretion
- Specific ability kind enum values and naming
- Internal data structures for ability source tracking
- How heritage bonuses interact with the existing stat system
- Exact LLM prompt rules for renown perk generation
- UI layout details for renown rank-up flow

</decisions>

<specifics>
## Specific Ideas

- Songs: could be toggle-on/off abilities that provide party-wide effects while active
- Auras: passive area effects around the character
- Pets: summoned companions that assist in combat
- Fear: CC debuff that prevents enemies from acting
- Bandages/potions: consumable-like abilities with charges or long cooldowns
- Food summoning: create consumable items that provide temporary buffs
- Travel abilities: increase movement speed, reveal nearby locations
- Slow debuff: reduces enemy attack speed
- Haste buff: increases character attack speed
- Stat buffs (strength, intelligence): temporary stat increases

</specifics>

<deferred>
## Deferred Ideas

None — all items are in scope for this phase

</deferred>

---

*Phase: 36-ability-expansion*
*Context gathered: 2026-03-10 via user design decisions*
