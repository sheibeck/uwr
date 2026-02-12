# Features Research

**Project:** UWR — Multiplayer Browser RPG (SpacetimeDB 1.12.0, TypeScript)
**Domain:** Hunger, Faction/Renown, World Events, Quest, Race systems
**Researched:** 2026-02-11

---

## Hunger Systems (Game Design Patterns)

### Core principle: Reward, not punishment
UWR's decision to make hunger reward-only (buffs for eating, no starvation penalty) is validated by modern game design. WoW's "Well Fed" buff from food is universally praised; the original "hungry" debuff was broadly disliked and removed. Players engage with food buffs willingly; they resent mandatory maintenance mechanics.

### Proven patterns
**World of Warcraft Well Fed system:**
- Food grants a 1-hour stat buff (e.g., +20 Agility for grilled fish)
- Different foods grant different stats → drives crafting choice (cook the food your class needs)
- Multiple buff tiers correlate with food difficulty: simple campfire food < raid-quality feasts
- Communal feast mechanic: one player places a feast, whole group gets buffed → social interaction

**Meal tiers for UWR:**
| Tier | Example name | Source | Buff strength | Duration |
|------|-------------|--------|--------------|----------|
| 1 | Trail Rations | Vendor buy | +2% damage | 30 min |
| 2 | Grilled Marsh Boar | Simple crafting | +5% damage, +3% defense | 45 min |
| 3 | Ranger's Stew | Resource crafting | +10% damage, +5% crit | 60 min |
| 4 | Feast of the Fallen | Rare ingredients | +15% all stats | 90 min |

**Hunger decay design:**
- Hunger starts at 100 (full) and decays over time (e.g., 1 point per 2 minutes real time)
- Below 50: "Peckish" state — no penalty, no buff
- At 100 (just eaten): "Well Fed" — buff active
- Well Fed buff lasts N minutes after eating regardless of hunger level (like WoW)
- No "starving" state with penalties — design decision confirmed

**Implementation in SpacetimeDB:**
- `Hunger` table with `characterId`, `currentHunger`, `lastDecayAt`, `wellFedUntil`
- Scheduled table `HungerDecay` fires every 5 minutes to tick down hunger
- `eat_food` reducer consumes food item, sets `wellFedUntil = ctx.timestamp + bufDuration`
- Combat reducer checks `wellFedUntil > ctx.timestamp` to apply well-fed stat bonuses

---

## Faction / Reputation Systems

### Core concepts (WoW-inspired, broadly validated)

**Faction definition:**
- A named organization with distinct identity, goals, and aesthetic
- Has ranks (Hostile → Neutral → Friendly → Honored → Revered → Exalted)
- Players gain/lose standing through quests, kills, crafting, world events

**Standing mechanics:**
- Standing is stored per-player per-faction: `FactionStanding { characterId, factionId, standing: i64 }`
- Standing is points-based (e.g., 0-999 = Neutral, 1000-2999 = Friendly, 3000-5999 = Honored, 6000-8999 = Revered, 9000+ = Exalted)
- Negative standing possible (Unfriendly → Hostile)
- Actions grant standing: completing a faction quest (+250), killing a faction enemy (+10), offering tribute (+50)

**Decay rules (contested — design choice for UWR):**
- WoW: NO decay — once Exalted, always Exalted → players feel rewarded for grinding
- Some games: Slow decay to keep players engaged → feels like a chore
- **Recommendation for UWR**: No decay, but add "floor" mechanics (hostile factions don't go below -5000 automatically)

**Rank rewards:**
| Rank | Standing | Unlock |
|------|----------|--------|
| Neutral | 0 | Faction vendor available |
| Friendly | 1000 | Tier 1 faction quests, vendor discounts |
| Honored | 3000 | Tier 2 quests, faction gear |
| Revered | 6000 | Tier 3 quests, unique cosmetics |
| Exalted | 9000 | Faction title, endgame gear, secret quest |

**Faction suggestions for UWR (aligned with RPG world building):**
1. **The Iron Compact** — merchants, smiths, artifact traders (rewards: gear, crafting blueprints)
2. **The Verdant Circle** — nature spirits, druids, harvesters (rewards: food recipes, harvest bonuses)
3. **The Ashen Order** — scholars, mages, lore-keepers (rewards: ability upgrades, lore entries)
4. **The Hollow Crown** — undead remnants, cursed warriors (rewards: dark abilities, rare drops)
5. **The Free Blades** — mercenaries, combat specialists (rewards: combat gear, group bonuses)

**Cross-faction conflict:**
- Actions that increase standing with one faction should sometimes decrease standing with a rival
- The Verdant Circle and The Iron Compact are rivals (exploitation vs. preservation)
- Adds meaningful choices to faction grinding

---

## World Events & Dynamic World

### What World Events are
Server-wide broadcasts that change game state, unlock content, or react to collective player actions. The "Ripple" system from Shadeslinger is the primary design reference.

### Trigger categories
1. **Time-triggered**: Events fire on schedule (e.g., "Festival of Blades" every in-game month)
2. **Threshold-triggered**: Total server stat reaches a threshold (e.g., 10,000 enemies killed → event fires)
3. **Player-triggered**: A high-renown player action triggers a world event (completing the Faction Champion quest)
4. **Admin-triggered**: GMs manually fire events for live events

### Consequence categories
1. **Unlock new race**: The Hollowed race becomes playable after enough Hollow Crown standing is achieved server-wide
2. **Unlock new faction**: A previously hidden faction reveals itself
3. **Unlock new system**: A new game mechanic becomes available (e.g., group crafting tables appear)
4. **Change world state**: A zone's enemies change, a vendor's stock shifts, a new boss spawns
5. **Narrative lore reveal**: LLM generates a journal entry or town crier announcement

### Event visibility
- World events appear in the event log (`EventWorld` table in UWR)
- All players subscribed to the world event log see the consequence text
- LLM generates consequence flavor text ("The world cracks. Something old stirs beneath the ash.")

### World Event table schema (recommendation)
```typescript
WorldEvent {
  id: u64 PK autoInc
  eventType: string       // 'race_unlock', 'faction_reveal', 'system_unlock', etc.
  targetId: string        // Which race/faction/system is affected
  triggerCondition: string // Description of what triggered it
  consequenceText: string  // LLM-generated narrative text (may be pending initially)
  status: string          // 'pending_generation' | 'active' | 'resolved'
  firedAt: timestamp
}
```

### LLM integration for events
- When event fires: write row with `status: 'pending_generation'`
- Procedure generates consequence text, updates row to `status: 'active'`
- All clients subscribed to `world_events` see the row update
- Event log renders consequence text to all players

---

## Quest Systems with Reputation Gating

### Quest structure (validated pattern)
```
Quest {
  id: u64 PK
  title: string
  description: string (LLM-generated)
  factionId: string
  requiredStanding: i64    // Minimum faction standing to unlock
  objectives: Objective[]  // JSON or separate table
  rewardXp: u32
  rewardGold: u32
  rewardStanding: i64      // Standing gained on completion
  rewardItemTemplateId: u64 (optional)
}
```

### Reputation-gating pattern
1. Quest definition includes `requiredStanding` per faction
2. Client view `available_quests` filters `quest.requiredStanding <= player.factionStanding`
3. Player can see locked quests (with standing requirement shown) to motivate grinding
4. Completing a quest grants `rewardStanding` to the associated faction

### Shadeslinger-style quest delivery
- Quest text uses Shadeslinger tone (sarcastic, charming narrator)
- NPC "givers" deliver quests with brief, witty dialogue
- LLM generates both quest body and NPC intro line for variety
- Pre-written fallback content for each quest type/faction combination

### Quest types
| Type | Objective | Example |
|------|-----------|---------|
| Kill | Defeat N enemies | "Something in the swamp is making a racket. Silence it." |
| Retrieve | Collect N items | "The merchant lost her ledger. It's somewhere wet and unpleasant." |
| Escort | Complete N group combats | "The caravan won't move itself. Unfortunately." |
| Discover | Travel to a location | "The Order wants eyes on the northern ruins. Yours are apparently acceptable." |
| Craft | Create a specific item | "Forge the blade. Try not to lose a finger." |

---

## Race Systems & Class Restrictions

### Race design goals
- Races are flavor + mechanical differentiation
- Race determines which classes are available at character creation
- Races grant passive bonuses that scale through the game
- New races unlock via World Events (e.g., The Hollowed unlocks after Hollow Crown event)

### Race-class restriction pattern (WoW, FFXIV model)
A `race_class_availability` table or inline lookup defines which classes each race can take:
```typescript
const RACE_CLASS_MAP: Record<string, string[]> = {
  'human':     ['warrior', 'mage', 'rogue', 'priest', 'ranger'],
  'eldrin':    ['mage', 'priest', 'ranger', 'druid'],
  'ironclad':  ['warrior', 'paladin', 'smith'],
  'wyldfang':  ['rogue', 'ranger', 'beastmaster', 'druid'],
  'hollowed':  ['necromancer', 'warrior', 'shadow_priest'],  // World event unlock
};
```

### Racial bonuses (passive stats, not abilities)
| Race | Flavor | Bonus |
|------|--------|-------|
| Human | Adaptable survivors | +5% XP gain, +1 to all stats |
| Eldrin | Ancient scholars | +15% spell damage, +10% mana regen |
| Ironclad | Living constructs | +20% physical defense, immune to stagger |
| Wyldfang | Feral hunters | +15% attack speed, +10% crit chance |
| Hollowed | Cursed undead | +20% dark damage, +10% health drain |

### Race as a data row (not enum)
Recommended approach: races are rows in a `Race` table, not TypeScript enums. This allows:
- Adding new races via World Events without code deploys
- Races can have dynamic `unlocked: bool` field toggled by world events
- Client filters to only show `unlocked: true` races at character creation

### Character creation flow with races
1. Player opens character creation
2. Client queries `Race` table (subscribed) — shows only `unlocked: true` races
3. Player selects race → client filters available classes to `RACE_CLASS_MAP[raceId]`
4. Player selects class → creates character with `raceId` field
5. Backend `create_character` reducer validates race-class combination
6. Character gets base stats = class stats + race modifiers

---

## Key Recommendations

1. **Hunger**: Implement as scheduled tick (every 5 min) + `eat_food` reducer. Well Fed buff stored as timestamp. No starvation penalty.
2. **Faction**: Start with 3-4 factions. Standing is `i64` per player per faction. No decay. Rival faction standing changes add meaningful tradeoffs.
3. **Races**: Store as `Race` table rows with `unlocked: bool`. Start with 4 unlocked races, leave "locked" races in data for World Event reveals.
4. **World Events**: Threshold + admin triggers. LLM generates consequence text asynchronously. Consequences write to `WorldEvent` table, broadcast via subscription.
5. **Quests**: Faction-gated by standing threshold. LLM generates text when quest becomes available. Pre-written fallbacks required.
