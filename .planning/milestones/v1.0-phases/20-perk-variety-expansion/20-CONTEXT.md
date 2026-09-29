# Phase 20: Perk Variety Expansion - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Expand the renown perk pools (from Phase 12's 15-rank system) with diverse effect types beyond basic stat boosts. Replace/enhance existing placeholder perks across ranks 2-15 with interesting choices that create meaningful build variety and permanent character identity.

**Current state (Phase 12):**
- 15 named ranks (Unsung → Eternal) with stepped threshold curve across 5 tiers
- 14 perk pools (ranks 2-15, one permanent choice per rank)
- Mostly basic stat boosts (+STR, +INT, +MaxHP, etc.)
- Some placeholder active abilities

**Scope:** Design and implement diverse perk effects that create meaningful choices at each rank. Perks remain permanent (no respec) to maintain character identity and alt value.

</domain>

<decisions>
## Implementation Decisions

### Perk effect diversity
- **Balanced mix** across three domains: combat, crafting/gathering, and social/utility
- Not combat-only or utility-only — spread effects across all three categories
- Every rank should offer at least one option from each domain

### Proc effect style
- **Rare, impactful procs** over high-frequency spam
- Low chance (2-10%) with big payoff when they trigger
- Examples: "2% chance on-crit to deal massive burst" over "10% chance on-hit for minor damage"
- Makes proc moments feel exciting and memorable

### Active ability perks
- **New standalone abilities** (not modifications to existing class abilities)
- Perks grant entirely new abilities with their own cooldowns and effects
- Example: "Summon Shadow Clone" as a new ability, NOT "Your Magic Missile splits"
- Creates more variety between characters with same class but different perk choices

### Crafting and gathering bonuses
- **Mix across different perks:** quantity, quality, and efficiency bonuses
- Quantity: extra yields, double gather chance
- Quality: rare material chance, better item rolls
- Efficiency: faster gathering, reduced crafting costs
- Different perks offer different types of advantages (no single "best" crafting perk)

### Power scaling approach
- **Stepped growth** at tier boundaries (not linear, not exponential)
- Perks within a tier are similar power, then a jump at the next tier
- Tiers roughly map to 5 original tiers from Phase 12: ranks 2-3, 4-6, 7-9, 10-11, (12-15 deferred)
- Power jumps feel noticeable when crossing tier boundaries

### Complexity progression
- **Simple effects early (ranks 2-6), complex effects late (ranks 7-11+)**
- Early tier: straightforward bonuses, single-part effects
- Mid tier: multi-part effects, conditionals
- Late tier: complex interactions, combo mechanics
- Players learn the perk system gradually through increasing complexity

### Numeric scaling
- **Context-dependent scaling** — different effect categories scale differently
- Damage/combat bonuses can be more aggressive (higher percentages)
- Utility/quality-of-life bonuses more conservative
- Specific scaling ranges are Claude's discretion based on combat balance

### System interactions
- **Mix of static and scaling perks**
- Some perks are fixed power when chosen (standalone bonuses)
- Some perks scale with character level or other progression (e.g., "1% bonus per character level")
- Not all perks need to scale — variety in how perks grow creates interesting trade-offs

### Choice architecture
- **3 options per rank** (not 2, not 4+)
- Triangle of choices at each rank for meaningful decisions
- Consistent across all 14 perk pools

### Choice differentiation
- **Domain-based differentiation:** combat, crafting, social/utility
- Each rank offers one option from each of the three domains
- Example: Rank 5 might have "Vampiric Strike" (combat), "Double Harvest" (crafting), "Silver Tongue" (social)
- No role-based splits (tank/DPS/utility) — domain-based instead

### Perk synergies
- **Soft synergies** — perks work better together but no hard prerequisites
- Some perks naturally combo with earlier choices (e.g., two proc perks stack)
- No perk chains or required sequences
- Players can mix-and-match freely, but smart combos reward planning

### Balance philosophy
- **Different use cases** — each option best in specific situations
- No objectively "best" perk at any rank
- Combat perk is best for fighters, crafting perk is best for crafters
- Balance through situational strength, not equal power budget
- Avoid trap choices by ensuring every option excels in its domain

### Claude's Discretion
- Exact numeric values (proc chances, scaling percentages, cooldown durations)
- Specific perk names and flavor text (should match Shadeslinger tone)
- Perk effect implementations (how procs trigger, what new abilities do)
- Tier boundary thresholds (where complexity jumps happen)

</decisions>

<specifics>
## Specific Ideas

- **Shadeslinger inspiration:** Perks should feel like character-defining abilities from the books — unique, memorable, identity-forming
- **Proc effects:** Rare, impactful moments over constant spam — "2% on-crit for massive burst"
- **Domain balance:** Every rank should let players choose to specialize in combat, crafting, or social/utility
- **Permanent choices matter:** No respec means choices are significant — each perk picked defines that character forever

</specifics>

<deferred>
## Deferred Ideas

### Capstone perks (ranks 12-15)
**Vision:** "Open up avenues to new systems. Not just enhancements to existing systems. Sky is the limit."

Capstones should be transformative — enabling entirely new gameplay mechanics, not just bigger numbers or better versions of earlier perks. Examples: shapeshifting, flight, unique resource systems, stance mechanics.

**Reasoning:** Currently working on early game (levels 1-5), so endgame perk design (ranks 12-15) is premature. Focus Phase 20 on ranks 2-11, defer capstone design until closer to endgame content.

**Future phase:** Capstone perk design might warrant its own phase (20.1) once endgame systems are more defined and players are reaching ranks 12+.

---

**Other deferred:**
- Perk respec system — explicitly out of scope, permanent choices are core design decision from Phase 12
- Perk tree visualization UI — current plan uses simple list display, fancy trees deferred

</deferred>

---

*Phase: 20-perk-variety-expansion*
*Context gathered: 2026-02-16*
