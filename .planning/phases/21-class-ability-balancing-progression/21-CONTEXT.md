# Phase 21: Class Ability Balancing & Progression - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Design, implement, and balance the full ability set for all 15 classes across levels 1–10. This includes: redesigning the unlock curve (abilities granted on odd levels, stat bonuses on even levels), defining class identity pillars and the 4-role structure, extending every class from level 5 to level 10, implementing all missing backend mechanics required by class abilities, and a free-revision pass on existing level 1–5 abilities. This phase is expected to be broken into sub-phases grouped by shared mechanic dependencies.

</domain>

<decisions>
## Implementation Decisions

### Unlock Curve
- **Ability unlock levels:** 1, 3, 5, 7, 9, and 10 (10 is the Tier 1 capstone). Not strict 1-per-level — some levels can grant multiple abilities if the class identity warrants it.
- **Even levels (2, 4, 6, 8):** Grant racial stat bonuses (+2 total stat points distributed per race — e.g. +1 primary / +1 secondary). Races must have a defined "level-up stat bonus" as part of RACE_DATA. This is a dependency: races need to be extended before Phase 21 can fully implement even-level progression.
- **Long-term design principle:** Pace must scale to eventual level 50 cap. 1 ability every other level is the intended cadence across all tiers; the 1–10 curve establishes the pattern.
- **No 1-ability-per-level assumption:** Some odd levels may grant 2 abilities if the class has utility + combat to hand out at that level.

### Class Identity Pillars
- **4-pillar role structure:** Tank / Healer / DPS / Utility (utility and support are the same pillar).
- **Role exclusivity:** Each class has a unique primary niche that no other class can fully replace. No two classes occupy the exact same role.
- **Enforcement model:** Hybrid — a few signature mechanics are class-exclusive (e.g. Resurrect = Cleric only), but most differentiation is through tuning and stat scaling, not hard locks.
- **Role assignments:** Claude proposes role assignments for all 15 classes based on name and 4-pillar structure; user reviews during planning.

### Levels 6–10 Design Philosophy
- **Mix of approaches per class:** Some classes deepen mastery (stronger versions of early patterns), some diversify (new mechanic introduced), some specialize. No single pattern applies to all.
- **Level 10 capstone:** Varies by class. Tanks get a stance change; healers get a passive aura; DPS gets an ultimate nuke; utility gets a signature control or group effect. The capstone completes the class fantasy for Tier 1.
- **Level 1–5 revision:** Freely revisable. Existing abilities can be renamed, retuned, redesigned, or replaced if they don't align with the class identity pillar.
- **Resource cost philosophy:** Priced for sustainable rotation — costs scale with the character's resource growth so fights don't become resource-starved at higher levels.
- **Soft synergy design:** Some abilities are best used in sequence (e.g. a setup ability that improves the follow-up) but no hard combo requirements. Informed play is rewarded; casual play still functions.
- **Hotbar loadout:** Out-of-combat/utility abilities share slots with combat abilities. Players choose their loadout and make tradeoffs. No separate utility slot.

### Missing Mechanic Handling
- **Default approach:** Implement the mechanic properly. If an ability promises something, build it.
- **Known mechanics to implement in this phase:**
  - **Taunt / threat redirect** (Warrior, Paladin) — forces enemies to attack the taunting character for N seconds
  - **Group buffs / morale** (Bard, Druid, Paladin) — abilities that apply effects to all group members simultaneously
  - **Stance system** (Warrior) — character enters a persistent mode that changes stat profile or active ability behavior
  - **Summon / pet system** (Necromancer, Beastmaster, Summoner) — persistent minion that fights alongside the player
  - **Charm** — forces an enemy to fight for your side temporarily
  - **Fear** — causes an enemy to flee or be unable to act
  - **Aggro reduction** — allows a character to drop threat and pull themselves out of enemy targeting
  - **Mesmerize / crowd control** — immobilizes or incapacitates a target
  - **Summon consumables** — conjure food, bandages, or temporary equipment from ability
- **Sub-phase structure:** Phase 21 will be broken into sub-phases grouped by shared mechanic dependencies. Claude proposes the grouping during planning (e.g. classes that share mechanic needs like taunt/group-buffs/stances/pets/CC are grouped together so each sub-phase ships coherent mechanic sets).

### Claude's Discretion
- Proposed role assignments for all 15 classes (user reviews at planning)
- Specific sub-phase groupings and ordering
- Exact ability names, descriptions, and power values for levels 6–10
- Which specific levels for each class grant 1 vs. 2 abilities at once
- Specific RACE_DATA level-up stat bonus values per race (to be defined in coordination with Race data expansion)

</decisions>

<specifics>
## Specific Ideas

- Level 50 is the eventual cap — the 1–10 unlock curve must establish a cadent pattern that works at scale, not front-load everything
- Even-level racial stat bonuses means races are a meaningful long-term choice, not just a cosmetic one at character creation
- The phase is expected to be large: 15 classes × ~5 new abilities each + multiple new mechanic systems. Sub-phases are the right delivery vehicle.
- "Soft synergy" example: Rogue ability that applies a bleed → follow-up ability does bonus damage to bleeding targets. Works alone, better in sequence.
- Stance system (Warrior) is a potential level 10 capstone: entering a stance changes the character's combat mode, not just a buff.

</specifics>

<deferred>
## Deferred Ideas

- None scoped out of this phase — all mechanics discussed are in-scope. Sub-phases will handle the sequencing.
- Passive ability upgrades at even levels (beyond stat bonuses) — user mentioned this as a possibility but resolved to racial stat bonuses; ability upgrades as a future enhancement if needed.

</deferred>

---

*Phase: 21-class-ability-balancing-progression*
*Context gathered: 2026-02-20*
