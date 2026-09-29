# Phase 21: Race Expansion - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Expand the race roster from 4 starter races to 15+ traditional fantasy races, upgrade all races to a dual-bonus system (exactly 2 bonuses each), and implement a level-up racial bonus mechanic that re-applies at every even level. Locked races (Dark-Elf, Half-Giant, Cyclops, Satyr) are completely hidden in the character creation UI until globally unlocked by a world event.

**Current state:**
- 4 races: Human, Eldrin, Ironclad, Wyldfang
- Race table has 5 stat bonus columns (strBonus, dexBonus, chaBonus, wisBonus, intBonus)
- Racial bonuses applied once at character creation and then silently lost on level-up (bug to fix)
- `Race.unlocked` field already exists on the Race table

**Scope:** Add 11 new races, upgrade all 4 existing races to dual-bonus, fix the level-up racial bonus bug, implement the even-level stacking mechanic, implement locked race UI (completely hidden), implement `/unlockrace` admin command.

</domain>

<decisions>
## Implementation Decisions

### Dual-bonus system
- **Exactly 2 bonuses per race** — no more, no fewer
- **Expanded bonus pool** — not limited to stat points; includes:
  - +1 to a specific stat (STR, DEX, INT, WIS, CON, CHA)
  - Bonus spell damage (flat)
  - Bonus physical damage (flat)
  - Bonus max mana
  - Bonus mana regen (per regen tick)
  - Bonus max HP
  - Bonus stamina regen (per tick)
  - Bonus crit chance (flat %)
  - Bonus armor (flat)
- **Race table schema change:** Replace the 5 individual stat columns with a flexible `bonus1Type`/`bonus1Value`/`bonus2Type`/`bonus2Value` structure. This is extensible and cleanly models "exactly 2 bonuses."

### Balance philosophy
- **Asymmetric by design** — races are NOT required to be equivalent in power
- Races that specialize strongly in one area should be weaker or more situational in the other bonus
- Example: Half-Giant gets high physical damage + high max HP but reduced mana elsewhere — strong focus with a trade-off
- **Scale:** Small, flavor-level numbers. Racial bonuses should be clearly smaller than gear affix magnitudes. Examples: +1 stat, +1-2 flat damage, +5-10 max HP/mana. These are identity markers, not power items.

### Starter race dual-bonus upgrades
- **Human:** +1 CHA + bonus stamina regen
- **Eldrin:** bonus spell damage + bonus max mana
- **Ironclad:** bonus physical damage + bonus armor
- **Wyldfang:** bonus crit chance + +1 DEX

### New races
11 new races to add — 7 unlocked, 4 locked:
- Goblin (unlocked): bonus magic damage + bonus mana regen
- Troll (unlocked): bonus max HP + bonus physical damage
- Dwarf (unlocked): bonus max HP + bonus physical damage (stout and stubborn)
- Gnome (unlocked): bonus mana regen + bonus max mana
- Halfling (unlocked): bonus crit chance + bonus evasion / dodge
- Half-Elf (unlocked): +1 to two different stats (versatile)
- Orc (unlocked): bonus physical damage + bonus max HP
- Dark-Elf (locked): bonus spell damage + bonus mana regen
- Half-Giant (locked): bonus max HP + bonus physical damage (massive; reduced mana is flavor handled by class choices)
- Cyclops (locked): bonus physical damage + bonus armor
- Satyr (locked): bonus spell damage + bonus stamina regen

*Exact stat values for each race are Claude's discretion, calibrated to the small-scale flavor philosophy above.*

### Even-level stacking mechanic
- **Level 1:** racial bonuses applied at character creation
- **Even levels (2, 4, 6, 8, 10...):** racial bonuses re-applied again (stacking — flat additive)
- **Odd levels:** class abilities only — race has no interaction
- **Stacking model:** Flat additive — the same incremental bonus applies each even level. Simple, predictable, and transparent to players. The increment per even-level application is half the base value (`floor(baseValue / 2)`), so a race with +2 spell damage would add +1 spell damage at each even level.
- **Bug fix included:** Current level-up code silently drops racial bonuses when recalculating stats. Phase 21 must fix this — racial bonuses must be preserved at EVERY level-up, and ADDITIONALLY stacked again at even levels.

### Level-up feedback
- **Visible notification:** When a character reaches an even level and their racial bonus is re-applied, a message appears in level-up feedback (e.g., "Your racial heritage grows stronger."). Players should understand the system is working for them.

### Locked race visibility
- **Completely hidden** — locked races do NOT appear in the character creation picker at all. Not greyed out, not shown with a lock icon. Simply absent.
- Players discover locked races exist through world events, lore, and in-game broadcast — not through the UI.
- The `Race.unlocked` field on the Race table controls this at the data level.

### Locked race unlock mechanism
- **Admin command:** `/unlockrace <name>` sets `Race.unlocked = true` for the named race globally (affects all players)
- **Global unlock:** One-way door — once unlocked, the race is permanently available. Cannot be re-locked.
- **World broadcast:** When a race is unlocked, a broadcast message fires to all online players (e.g., "The Dark Elves have emerged from the Shadowwood! A new race is now available for character creation.")
- **No per-player unlock:** All players gain access simultaneously when the admin fires the command.

### Claude's Discretion
- Specific bonus values for each race (magnitude of flat bonuses)
- Diminishing returns formula for even-level stacking
- Exact wording of level-up racial bonus notification
- Exact wording of unlock broadcast messages
- Race `availableClasses` restrictions for new races (if any — may be open like Human)
- Race descriptions and flavor text

</decisions>

<specifics>
## Specific Ideas

- **Half-Elf versatility:** Could implement as "choose 2 different stats at character creation" — unique among races in that the player customizes both bonuses. Worth the implementation complexity for the identity appeal.
- **Troll vs Orc:** Both get max HP + physical damage — differentiate them via magnitude or by giving Orc a slightly offensive lean and Troll a defensive lean, OR give them distinct secondary bonuses.
- **Wyldfang fix:** Previously had +1 bonus that was mana regen — changed to crit chance + +1 DEX to better fit the "swift hunter" identity.
- **Stacking by level 10:** With a 50-level design in mind, by level 10 a character will have had 5 even-level applications (levels 2, 4, 6, 8, 10) plus the level 1 application. The diminishing returns formula should make these 5+1 applications feel meaningful but not dominant at level 10.

</specifics>

<deferred>
## Deferred Ideas

### Stacking tuning for levels 11-50
At the level cap of 50, the flat additive model will produce 25 half-value applications (plus the full base at creation). Whether to introduce diminishing returns at higher tiers is deferred to a future phase when the level cap expands. Phase 21 establishes the flat additive baseline; curve tuning can be revisited later.

### Race-restricted classes for new races
Whether new races should have class restrictions (like Eldrin and Ironclad) is deferred. For Phase 21, new races default to unrestricted (like Human) unless a strong identity reason exists. Restrictions can be added in a future balance pass.

### Per-player race unlock (future world state complexity)
The current design unlocks races globally. If a future phase wants per-player story-gated race access, that would require a `PlayerRaceUnlock` table and significant UI changes. Deferred.

</deferred>

---

*Phase: 21-race-expansion*
*Context gathered: 2026-02-18*
