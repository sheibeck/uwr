# Phase 20: Perk Variety Expansion - Research

**Researched:** 2026-02-16
**Domain:** Game design, character progression, SpacetimeDB data modeling
**Confidence:** HIGH

## Summary

Phase 20 expands the renown perk system (established in Phase 12) by replacing placeholder stat bonuses with diverse, meaningful perk choices across three domains: combat, crafting/gathering, and social/utility. The current system has a solid foundation with 15 named ranks, 14 perk pools (ranks 2-15), and a working perk selection UI, but most perks are basic stat bonuses (+STR, +MaxHP, etc.) with some placeholder active abilities.

The implementation requires designing 42 new perks (3 per rank × 14 ranks) with varied effect types including proc-based combat bonuses, crafting/gathering enhancements, and social/utility abilities. The existing architecture supports passive stat bonuses through `calculatePerkBonuses()` but will need extension for proc effects, active abilities, and non-combat bonuses.

**Primary recommendation:** Design perks first in data file, then extend the perk effect system incrementally by domain (combat → crafting → social/utility), with verification at each step to ensure effects apply correctly.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Perk effect diversity:**
- Balanced mix across three domains: combat, crafting/gathering, and social/utility
- Not combat-only or utility-only — spread effects across all three categories
- Every rank should offer at least one option from each domain

**Proc effect style:**
- Rare, impactful procs over high-frequency spam
- Low chance (2-10%) with big payoff when they trigger
- Examples: "2% chance on-crit to deal massive burst" over "10% chance on-hit for minor damage"
- Makes proc moments feel exciting and memorable

**Active ability perks:**
- New standalone abilities (not modifications to existing class abilities)
- Perks grant entirely new abilities with their own cooldowns and effects
- Example: "Summon Shadow Clone" as a new ability, NOT "Your Magic Missile splits"
- Creates more variety between characters with same class but different perk choices

**Crafting and gathering bonuses:**
- Mix across different perks: quantity, quality, and efficiency bonuses
- Quantity: extra yields, double gather chance
- Quality: rare material chance, better item rolls
- Efficiency: faster gathering, reduced crafting costs
- Different perks offer different types of advantages (no single "best" crafting perk)

**Power scaling approach:**
- Stepped growth at tier boundaries (not linear, not exponential)
- Perks within a tier are similar power, then a jump at the next tier
- Tiers roughly map to 5 original tiers from Phase 12: ranks 2-3, 4-6, 7-9, 10-11, (12-15 deferred)
- Power jumps feel noticeable when crossing tier boundaries

**Complexity progression:**
- Simple effects early (ranks 2-6), complex effects late (ranks 7-11+)
- Early tier: straightforward bonuses, single-part effects
- Mid tier: multi-part effects, conditionals
- Late tier: complex interactions, combo mechanics
- Players learn the perk system gradually through increasing complexity

**Numeric scaling:**
- Context-dependent scaling — different effect categories scale differently
- Damage/combat bonuses can be more aggressive (higher percentages)
- Utility/quality-of-life bonuses more conservative
- Specific scaling ranges are Claude's discretion based on combat balance

**System interactions:**
- Mix of static and scaling perks
- Some perks are fixed power when chosen (standalone bonuses)
- Some perks scale with character level or other progression (e.g., "1% bonus per character level")
- Not all perks need to scale — variety in how perks grow creates interesting trade-offs

**Choice architecture:**
- 3 options per rank (not 2, not 4+)
- Triangle of choices at each rank for meaningful decisions
- Consistent across all 14 perk pools

**Choice differentiation:**
- Domain-based differentiation: combat, crafting, social/utility
- Each rank offers one option from each of the three domains
- Example: Rank 5 might have "Vampiric Strike" (combat), "Double Harvest" (crafting), "Silver Tongue" (social)
- No role-based splits (tank/DPS/utility) — domain-based instead

**Perk synergies:**
- Soft synergies — perks work better together but no hard prerequisites
- Some perks naturally combo with earlier choices (e.g., two proc perks stack)
- No perk chains or required sequences
- Players can mix-and-match freely, but smart combos reward planning

**Balance philosophy:**
- Different use cases — each option best in specific situations
- No objectively "best" perk at any rank
- Combat perk is best for fighters, crafting perk is best for crafters
- Balance through situational strength, not equal power budget
- Avoid trap choices by ensuring every option excels in its domain

### Claude's Discretion
- Exact numeric values (proc chances, scaling percentages, cooldown durations)
- Specific perk names and flavor text (should match Shadeslinger tone)
- Perk effect implementations (how procs trigger, what new abilities do)
- Tier boundary thresholds (where complexity jumps happen)

### Deferred Ideas (OUT OF SCOPE)

**Capstone perks (ranks 12-15):**
Vision: "Open up avenues to new systems. Not just enhancements to existing systems. Sky is the limit."

Capstones should be transformative — enabling entirely new gameplay mechanics, not just bigger numbers or better versions of earlier perks. Examples: shapeshifting, flight, unique resource systems, stance mechanics.

**Reasoning:** Currently working on early game (levels 1-5), so endgame perk design (ranks 12-15) is premature. Focus Phase 20 on ranks 2-11, defer capstone design until closer to endgame content.

**Future phase:** Capstone perk design might warrant its own phase (20.1) once endgame systems are more defined and players are reaching ranks 12+.

**Other deferred:**
- Perk respec system — explicitly out of scope, permanent choices are core design decision from Phase 12
- Perk tree visualization UI — current plan uses simple list display, fancy trees deferred
</user_constraints>

## Standard Stack

### Core Technologies
| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| SpacetimeDB | 1.11.x | Backend database/server | Project foundation, established in Phase 12 |
| TypeScript | Latest | Type-safe data definitions | Project-wide language choice |
| Vue 3 | Composition API | Frontend UI components | Project frontend framework |

### Data Files
| File | Purpose | Location |
|------|---------|----------|
| `renown_data.ts` | Perk definitions, rank thresholds | `spacetimedb/src/data/renown_data.ts` |
| `tables.ts` | Schema definitions | `spacetimedb/src/schema/tables.ts` |
| `renown.ts` (helpers) | Perk calculation logic | `spacetimedb/src/helpers/renown.ts` |
| `renown.ts` (reducers) | Perk selection logic | `spacetimedb/src/reducers/renown.ts` |

### Frontend Components
| Component | Purpose | Location |
|-----------|---------|----------|
| `RenownPanel.vue` | Perk selection UI | `src/components/RenownPanel.vue` |

**No additional libraries needed** — all perk functionality can be implemented with existing SpacetimeDB patterns and project infrastructure.

## Architecture Patterns

### Current Perk System Architecture

```
Backend (SpacetimeDB):
├── Data Layer
│   └── renown_data.ts
│       ├── RENOWN_RANKS (15 ranks with thresholds)
│       ├── RENOWN_PERK_POOLS (14 pools, one per rank 2-15)
│       └── PerkEffect type (maxHp, str, dex, int, wis, cha, armorClass, crit)
│
├── Schema Layer
│   └── tables.ts
│       ├── Renown (characterId, points, currentRank)
│       └── RenownPerk (characterId, rank, perkKey, chosenAt)
│
├── Logic Layer
│   ├── helpers/renown.ts
│   │   ├── awardRenown() - Add renown points, check for rank-ups
│   │   ├── calculatePerkBonuses() - Sum all passive perk effects
│   │   └── grantAchievement() - Award achievement + server-first bonus
│   │
│   └── reducers/renown.ts
│       ├── choose_perk - Validate and record perk choice
│       ├── grant_test_renown - Testing reducer
│       └── grant_test_achievement - Testing reducer
│
└── Character Stats Integration
    └── helpers/character.ts
        └── recomputeCharacterDerived() - Applies perk bonuses to character stats

Frontend (Vue):
└── RenownPanel.vue
    ├── Displays current rank, progress, chosen perks
    ├── Shows available perks when rank-up occurs
    └── Calls choose_perk reducer when player selects perk
```

### Pattern 1: Passive Stat Bonus Perks (EXISTING)

**What:** Perks that add flat bonuses to character stats (HP, STR, DEX, etc.)

**Implementation:** Works through `calculatePerkBonuses()` which:
1. Queries all RenownPerk rows for character
2. Looks up perk definitions in RENOWN_PERK_POOLS
3. Sums all passive effect bonuses
4. Returns totals applied during `recomputeCharacterDerived()`

**Example from code:**
```typescript
// From renown_data.ts
{
  key: 'hp_boost_1',
  name: 'Vitality',
  type: 'passive',
  description: '+25 max health',
  effect: { maxHp: 25n },
}

// From renown.ts helper
export function calculatePerkBonuses(ctx: any, characterId: bigint) {
  const totals = {
    maxHp: 0n, str: 0n, dex: 0n, int: 0n, wis: 0n, cha: 0n,
    armorClass: 0n, critMelee: 0n, critRanged: 0n,
  };

  for (const perkRow of ctx.db.renownPerk.by_character.filter(characterId)) {
    const perkDef = /* lookup in RENOWN_PERK_POOLS */;
    if (perkDef?.type === 'passive') {
      if (effect.maxHp) totals.maxHp += effect.maxHp;
      // ... sum other stats
    }
  }
  return totals;
}
```

**Status:** ✅ Fully implemented, works for all stat bonuses

### Pattern 2: Active Ability Perks (PLACEHOLDER)

**What:** Perks that grant new abilities with their own cooldowns (e.g., Second Wind, Warcry)

**Current state:** Defined in data with `type: 'active'` but not implemented

**Example placeholder:**
```typescript
{
  key: 'second_wind',
  name: 'Second Wind',
  type: 'active',
  description: 'Restore 20% of your maximum health (5 minute cooldown)',
  effect: { cooldownSeconds: 300, description: 'Restores 20% HP' },
}
```

**Implementation needed:**
1. Add ability to character's hotbar automatically when perk chosen
2. Implement ability logic in reducers (similar to class abilities)
3. Track cooldowns in AbilityCooldown table
4. Handle casting/execution through existing ability system

**Pattern to follow:** Class abilities in `spacetimedb/src/data/abilities/` and ability execution in `helpers/combat.ts`

**Status:** ⚠️ Needs implementation

### Pattern 3: Proc Effects (NOT IMPLEMENTED)

**What:** Perks that trigger on combat events (on-hit, on-crit, on-kill, etc.)

**User requirements:**
- Low chance (2-10%), high impact
- Example: "2% chance on-crit to deal 200% weapon damage as a burst"

**Implementation needed:**
1. Extend `PerkEffect` type to include proc triggers and effects
2. Add proc checking logic to combat resolution (in `helpers/combat.ts`)
3. Query character's chosen perks during combat actions
4. Roll for proc chance and apply effects when triggered

**Combat hooks where procs could trigger:**
- Auto-attack resolution in `rollAttackOutcome()` (line ~133 in combat.ts)
- Ability damage calculation
- Critical hit determination (uses `calculateCritChance()`)
- Enemy defeat
- Taking damage

**Example implementation pattern:**
```typescript
// In PerkEffect type
type PerkEffect = {
  // Existing fields...
  procType?: 'on_crit' | 'on_hit' | 'on_kill' | 'on_damage_taken';
  procChance?: number; // 0-100 percentage
  procEffect?: {
    damageMultiplier?: bigint; // e.g., 200n for 200% weapon damage
    healAmount?: bigint;
    // ... other proc effects
  };
};

// In combat resolution
function resolveCombatProcs(ctx: any, characterId: bigint, eventType: string, baseValue: bigint) {
  const perks = /* get character perks */;
  for (const perk of perks) {
    if (perk.effect.procType === eventType) {
      const roll = /* random 0-100 */;
      if (roll < perk.effect.procChance) {
        // Apply proc effect
      }
    }
  }
}
```

**Status:** ❌ Not implemented, requires new pattern

### Pattern 4: Crafting/Gathering Bonuses (NOT IMPLEMENTED)

**What:** Perks that affect resource gathering and item crafting

**User requirements:**
- Mix of quantity, quality, and efficiency bonuses
- Different perks for different advantages (no single "best")

**Existing systems to hook into:**
- Resource gathering in `reducers/items.ts` (reducer: `gather_resource`)
- ResourceNode table tracks gathering state
- Recipe crafting (craft_item reducer)
- Item creation system

**Implementation needed:**
1. Extend `PerkEffect` type with crafting/gathering fields
2. Query perks during gather/craft actions
3. Apply bonuses:
   - **Quantity:** Increase item yield, chance for double gather
   - **Quality:** Chance for rare materials, better item stats
   - **Efficiency:** Reduce gathering time, lower craft costs

**Example perk definitions:**
```typescript
// Quantity bonus
{
  key: 'double_harvest',
  type: 'passive',
  effect: {
    gatherDoubleChance: 20, // 20% chance for 2x yield
  }
}

// Quality bonus
{
  key: 'master_crafter',
  type: 'passive',
  effect: {
    craftQualityBonus: 10, // +10% to item stat rolls
  }
}

// Efficiency bonus
{
  key: 'swift_hands',
  type: 'passive',
  effect: {
    gatherTimeReduction: 25, // 25% faster gathering
  }
}
```

**Gather aggro system consideration:** Current code has `GATHER_AGGRO_BASE_CHANCE` in items.ts reducer — efficiency bonuses should not affect aggro chance (risk stays same, just faster completion).

**Status:** ❌ Not implemented, requires new pattern

### Pattern 5: Social/Utility Bonuses (NOT IMPLEMENTED)

**What:** Perks that affect non-combat, non-crafting gameplay (NPC interactions, economy, convenience)

**Existing systems to hook into:**
- NPC affinity system (NpcAffinity table)
- Faction standing (FactionStanding table)
- Vendor pricing (vendorBuyMod, vendorSellMod on Character)
- Travel cooldowns (TravelCooldown table)
- Gold and economy (Character.gold)

**Implementation needed:**
1. Extend `PerkEffect` type with social/utility fields
2. Query perks during relevant actions
3. Apply bonuses contextually

**Example perk definitions:**
```typescript
// NPC interaction
{
  key: 'silver_tongue',
  type: 'passive',
  effect: {
    npcAffinityGainBonus: 25, // +25% affinity gain from conversations
  }
}

// Economy
{
  key: 'shrewd_negotiator',
  type: 'passive',
  effect: {
    vendorBuyDiscount: 10, // 10% discount on purchases
    vendorSellBonus: 10,   // 10% better prices when selling
  }
}

// Convenience
{
  key: 'swift_traveler',
  type: 'passive',
  effect: {
    travelCooldownReduction: 30, // 30% shorter travel cooldowns
  }
}
```

**Status:** ❌ Not implemented, requires new pattern

### Pattern 6: Scaling Perks

**What:** Perks whose power grows with character level or other progression

**User decision:** Mix of static and scaling perks for variety

**Implementation needed:**
1. Add scaling metadata to PerkEffect
2. Calculate scaled value at runtime based on character level
3. Apply scaled value instead of fixed value

**Example:**
```typescript
// Static perk (current pattern)
{
  key: 'str_boost_2',
  effect: { str: 2n }, // Always +2 STR
}

// Scaling perk (new pattern)
{
  key: 'growing_might',
  effect: {
    str: 1n, // Base bonus
    strPerLevel: 0.1, // +0.1 STR per character level (10 levels = +1 STR)
  }
}

// In calculatePerkBonuses:
if (effect.strPerLevel) {
  const characterLevel = /* get character level */;
  totals.str += effect.str + BigInt(Math.floor(Number(characterLevel) * effect.strPerLevel));
}
```

**Complexity consideration:** Scaling perks increase decision complexity. Early ranks (2-6) should use static values, mid-late ranks (7-11) can introduce scaling for more interesting long-term growth.

**Status:** ⚠️ Pattern available (use character.level), not yet used

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Random number generation | Custom RNG | SpacetimeDB deterministic seeding with bigint seeds | Reducers must be deterministic, can't use Math.random() |
| Perk selection UI | Custom widget library | Vue 3 with existing styles | Project already uses Vue, RenownPanel.vue already working |
| Stat bonus application | Direct Character table updates | `calculatePerkBonuses()` + `recomputeCharacterDerived()` | Existing pattern ensures bonuses recalculate on any character update |
| Ability cooldown tracking | Custom cooldown system | AbilityCooldown table + existing ability system | Reuse class ability infrastructure for perk abilities |
| Combat event hooks | Event bus system | Direct queries in combat resolution functions | SpacetimeDB reducers are already event-driven, no need for extra layer |

**Key insight:** The existing character stat system, combat resolution, and ability framework provide all the hooks needed for perk effects. Extending existing patterns is safer and more maintainable than building parallel systems.

## Common Pitfalls

### Pitfall 1: Non-Deterministic Proc Rolls

**What goes wrong:** Using `Math.random()` in reducers causes non-deterministic behavior, breaking SpacetimeDB's consistency guarantees.

**Why it happens:** Proc effects need random chance (e.g., "5% chance on hit"), tempting to use standard RNG.

**How to avoid:**
- Use deterministic seeding from game state (combat turn counter, timestamp, character ID)
- SpacetimeDB uses bigint arithmetic for determinism: `seed % 10000n < 500n` for 5% chance
- Pattern already exists in combat system: `rollAttackOutcome()` uses `seed % 1000n` for outcomes

**Warning signs:** Tests fail with "reducer produced different results" or combat logs show different outcomes for same inputs.

**Example from code:**
```typescript
// From combat.ts - deterministic crit check
export function rollAttackOutcome(seed: bigint, opts: {...}) {
  const roll = seed % 1000n; // Deterministic roll 0-999
  let cursor = 0n;

  // Crit check
  const critChance = calculateCritChance(opts.characterDex);
  if (roll < cursor + critChance) {
    const multiplier = getCritMultiplier(opts.weaponType);
    return { outcome: 'crit', multiplier };
  }
  // ...
}
```

### Pitfall 2: PerkEffect Type Mismatch

**What goes wrong:** Adding new perk effect fields without updating TypeScript types causes runtime errors or silent failures.

**Why it happens:** `PerkEffect` type defined in `renown_data.ts` must be extended for new effect categories (procs, gathering, social).

**How to avoid:**
1. Update `PerkEffect` type definition FIRST
2. Update `calculatePerkBonuses()` to handle new fields
3. Add TypeScript compilation as verification step
4. Test with `/grant_test_renown` and actual perk selection

**Warning signs:**
- Perk bonuses not applying when they should
- TypeScript errors during `spacetime publish`
- Frontend shows perk chosen but no effect in-game

**Example extension:**
```typescript
// Current type (lines 36-48 in renown_data.ts)
type PerkEffect = {
  maxHp?: bigint;
  str?: bigint;
  // ... existing stats
};

// Extended type (needed for new perks)
type PerkEffect = {
  // Existing fields...

  // Proc effects
  procType?: 'on_crit' | 'on_hit' | 'on_kill' | 'on_damage_taken';
  procChance?: number;
  procDamageMultiplier?: bigint;

  // Crafting/gathering
  gatherDoubleChance?: number;
  craftQualityBonus?: number;
  gatherTimeReduction?: number;

  // Social/utility
  npcAffinityGainBonus?: number;
  vendorBuyDiscount?: number;
  travelCooldownReduction?: number;
};
```

### Pitfall 3: Forgetting Client-Side Data Sync

**What goes wrong:** Backend has new perk definitions but frontend still shows old placeholder descriptions.

**Why it happens:** Perk pools are duplicated in two places:
- Backend: `spacetimedb/src/data/renown_data.ts` (line 58-395)
- Frontend: `src/components/RenownPanel.vue` (line 248-319)

Both must be kept in sync for consistent display.

**How to avoid:**
1. Update backend perk definitions first
2. Copy new perks to frontend RENOWN_PERK_POOLS
3. Run `spacetime generate` to update client bindings
4. Test perk selection UI shows correct names/descriptions

**Warning signs:**
- Perk names in UI don't match what's actually applied
- Players complain "perk description says X but it does Y"
- New perks don't show in selection interface

**Prevention pattern:**
```typescript
// Option 1: Generate client data from backend (future enhancement)
// - Add reducer to fetch perk pool for rank
// - Remove client-side duplication
// - Always shows current backend data

// Option 2: Validation test (can implement now)
// - Script to compare backend vs frontend perk definitions
// - Run before each publish
// - Fail if mismatches found
```

### Pitfall 4: Balance Broken by Perk Stacking

**What goes wrong:** Multiple perks combine in unexpected ways, creating overpowered builds or trap choices.

**Why it happens:**
- Proc perks stack multiplicatively (two 5% procs = 9.75% combined chance)
- Stat scaling perks amplify each other (STR bonus + crit bonus + damage proc)
- Not testing full 11-perk builds (ranks 2-11), only individual perks

**How to avoid:**
1. Design perks with diminishing returns in mind
2. Test "best case" perk combinations at each tier
3. Set caps on certain effect types (e.g., max 30% proc chance total)
4. Use stepped power scaling (tier jumps) to control power curve

**Warning signs:**
- Certain perk paths clearly superior to others
- High-level characters trivialize content
- No one chooses certain perks (trap options)

**User decision alignment:** "Balance through situational strength, not equal power budget" — perks should be best in their domain, not equally powerful in all scenarios.

### Pitfall 5: Active Abilities Without Hotbar Integration

**What goes wrong:** Active ability perks granted but player can't actually use them (no way to cast).

**Why it happens:** Existing class abilities auto-populate hotbar on character creation, but perk abilities are chosen mid-game.

**How to avoid:**
1. When perk chosen, check if it's an active ability
2. Auto-add to first empty hotbar slot
3. If no empty slots, prompt player or provide ability management UI
4. Ensure ability appears in hotbar after rank-up

**Warning signs:**
- Players say "I picked Second Wind but can't find it"
- Hotbar doesn't update when perk selected
- Active ability perks feel useless compared to passive bonuses

**Implementation note:** HotbarSlot table exists (line 459-472 in tables.ts), reducer for assignment exists. Need to extend `choose_perk` reducer to auto-assign active abilities.

## Code Examples

Verified patterns from codebase:

### Example 1: Defining a New Perk

```typescript
// In spacetimedb/src/data/renown_data.ts, within RENOWN_PERK_POOLS

// Rank 7 perks (Tier 3 - steeper climb)
7: [
  // Combat: Proc effect (NEW PATTERN)
  {
    key: 'vampiric_strike',
    name: 'Vampiric Strike',
    type: 'passive',
    description: '5% chance on critical hit to heal for 50% of damage dealt',
    effect: {
      procType: 'on_crit',
      procChance: 5,
      procHealPercent: 50,
    },
  },

  // Crafting: Quantity bonus (NEW PATTERN)
  {
    key: 'double_harvest',
    name: 'Double Harvest',
    type: 'passive',
    description: '20% chance to gather twice the resources',
    effect: {
      gatherDoubleChance: 20,
    },
  },

  // Social: NPC interaction bonus (NEW PATTERN)
  {
    key: 'silver_tongue',
    name: 'Silver Tongue',
    type: 'passive',
    description: '+25% NPC affinity gain from conversations',
    effect: {
      npcAffinityGainBonus: 25,
    },
  },
],
```

### Example 2: Applying Proc Effects in Combat

```typescript
// In spacetimedb/src/helpers/combat.ts, after damage calculation

function applyPerkProcs(
  ctx: any,
  characterId: bigint,
  eventType: 'on_crit' | 'on_hit' | 'on_kill',
  damageDealt: bigint,
  seed: bigint
): bigint {
  let totalProc = 0n;

  // Get character's chosen perks
  for (const perkRow of ctx.db.renownPerk.by_character.filter(characterId)) {
    const perkDef = /* lookup in RENOWN_PERK_POOLS by perkRow.rank and perkRow.perkKey */;
    if (!perkDef?.effect?.procType) continue;

    // Check if this perk procs on this event type
    if (perkDef.effect.procType === eventType) {
      // Roll for proc (deterministic)
      const roll = (seed + BigInt(perkRow.id)) % 100n;
      if (roll < BigInt(perkDef.effect.procChance ?? 0)) {
        // Proc triggered!
        if (perkDef.effect.procHealPercent) {
          const healAmount = (damageDealt * BigInt(perkDef.effect.procHealPercent)) / 100n;
          // Apply healing to character
          totalProc += healAmount;
        }
        if (perkDef.effect.procDamageMultiplier) {
          const bonusDamage = (damageDealt * perkDef.effect.procDamageMultiplier) / 100n;
          totalProc += bonusDamage;
        }
      }
    }
  }

  return totalProc;
}
```

### Example 3: Applying Gathering Bonuses

```typescript
// In spacetimedb/src/reducers/items.ts, in gather_resource reducer
// After line ~300 where quantity is calculated

// Check for Double Harvest perk
let finalQuantity = baseQuantity;
for (const perkRow of ctx.db.renownPerk.by_character.filter(character.id)) {
  const perkDef = /* lookup perk definition */;
  if (perkDef?.effect?.gatherDoubleChance) {
    // Deterministic roll using node ID + timestamp
    const seed = BigInt(node.id) + BigInt(ctx.timestamp.microsSinceUnixEpoch);
    const roll = seed % 100n;
    if (roll < BigInt(perkDef.effect.gatherDoubleChance)) {
      finalQuantity = finalQuantity * 2n;
      appendSystemMessage(ctx, character, 'Double Harvest proc! You gathered twice as many resources.');
    }
  }
}
```

### Example 4: Auto-Assigning Active Ability to Hotbar

```typescript
// In spacetimedb/src/reducers/renown.ts, in choose_perk reducer
// After inserting RenownPerk row (line 43-50)

// If perk is an active ability, auto-assign to hotbar
if (perk.type === 'active') {
  // Find first empty hotbar slot
  const usedSlots = new Set<number>();
  for (const hotbarRow of ctx.db.hotbarSlot.by_character.filter(characterId)) {
    usedSlots.add(Number(hotbarRow.slot));
  }

  let emptySlot = null;
  for (let i = 0; i < 12; i++) { // Assuming 12 hotbar slots
    if (!usedSlots.has(i)) {
      emptySlot = i;
      break;
    }
  }

  if (emptySlot !== null) {
    ctx.db.hotbarSlot.insert({
      id: 0n,
      characterId,
      slot: emptySlot,
      abilityKey: perkKey, // Use perk key as ability key
      assignedAt: ctx.timestamp,
    });
    appendSystemMessage(ctx, character, `${perk.name} added to hotbar slot ${emptySlot + 1}`);
  } else {
    appendSystemMessage(ctx, character, `${perk.name} granted! (Hotbar full - manage slots to use)`);
  }
}
```

## State of the Art

### Current Implementation Status

| System | Status | Implementation Date | Notes |
|--------|--------|---------------------|-------|
| Rank progression (15 ranks) | ✅ Complete | Phase 12 | Stepped threshold curve working |
| Perk selection UI | ✅ Complete | Phase 12 | RenownPanel.vue shows perks, handles selection |
| Basic stat bonus perks | ✅ Complete | Phase 12 | +HP, +STR, +DEX, +AC, +crit all working |
| Active ability perk definitions | ⚠️ Placeholder | Phase 12 | Defined in data but not implemented |
| Proc-based combat perks | ❌ Not started | N/A | Core feature for Phase 20 |
| Crafting/gathering perks | ❌ Not started | N/A | Core feature for Phase 20 |
| Social/utility perks | ❌ Not started | N/A | Core feature for Phase 20 |
| Scaling perks | ❌ Not started | N/A | Optional enhancement for Phase 20 |
| Capstone perks (ranks 12-15) | 🚫 Deferred | Future phase | Out of scope per CONTEXT.md |

### Design Evolution Notes

**Phase 12 established:**
- 5-tier structure with power jumps at tier boundaries
- Permanent perk choices (no respec) for character identity
- Server-first achievements tied to renown gains
- Clean separation: data definitions → helper logic → reducer actions

**Phase 20 extends:**
- From stat bonuses → diverse effect types
- From passive-only → mix of passive + active
- From combat-focused → three-domain balance (combat/craft/social)
- From simple → complexity progression with rank advancement

**Key constraint:** Permanent choices mean careful balance testing is critical. Once players pick a perk, it can't be changed, so trap options are unacceptable.

## Open Questions

### Question 1: Proc Effect Implementation Architecture

**What we know:**
- Procs need to trigger on combat events (on-hit, on-crit, on-kill)
- Must be deterministic (use seed-based RNG)
- Current combat code has attack resolution in `rollAttackOutcome()`

**What's unclear:**
- Best place to inject proc checks in combat flow
- How to pass proc effects back to damage resolution
- Should procs trigger before or after armor/mitigation?

**Recommendation:**
- Add proc checking immediately after damage calculation, before final application
- Pass proc results as additional damage/healing values
- Document as new combat phase: Calculate Base Damage → Apply Mitigation → **Check Perks** → Apply Final Damage
- Start with on-crit procs (easiest to test with existing crit system)

### Question 2: Crafting Quality Bonus Mechanics

**What we know:**
- Items have stat bonuses (strBonus, dexBonus, etc.) in ItemTemplate
- Crafting creates ItemInstance from template
- User wants "better item rolls" as a perk effect

**What's unclear:**
- Are item stats currently random or fixed per template?
- If fixed, need to add randomness system for quality variation
- If random, how much variance exists? (e.g., 10-15 STR on a template)

**Recommendation:**
- Review ItemTemplate and item creation code to determine current system
- If stats are fixed, defer quality bonuses to simpler quantity/efficiency perks first
- If stats vary, quality bonus can scale the random range (e.g., roll 80-120% instead of 90-110%)
- Focus initial implementation on quantity (double harvest) and efficiency (faster gather) which don't require item stat variance

### Question 3: Active Ability Perk Execution

**What we know:**
- Active abilities need cooldowns, casting, targeting
- Class abilities use AbilityTemplate table + ability reducers
- Perks grant abilities outside class system

**What's unclear:**
- Should perk abilities use same AbilityTemplate table or separate system?
- How to handle ability descriptions for UI (tooltip, cast bar)
- Do perk abilities use mana/stamina or free to cast?

**Recommendation:**
- Reuse AbilityTemplate system — insert perk abilities as templates when chosen
- Mark perk abilities with special prefix (e.g., `perk_second_wind`) to distinguish from class abilities
- Start with zero resource cost (free to cast, cooldown only) for simplicity
- Consider resource costs in future iteration if balance requires

### Question 4: Numeric Balance Targets

**What we know:**
- User decision: "Context-dependent scaling — damage can be aggressive, utility conservative"
- Proc chances should be 2-10% (rare, impactful)
- Stepped power scaling at tier boundaries

**What's unclear:**
- Exact percentages for crafting bonuses (gather speed, quality chance)
- How much vendor discount is meaningful but not economy-breaking?
- Travel cooldown reduction percentages (10%? 30%? 50%?)

**Recommendation:**
- Start conservative, iterate based on playtesting
- **Crafting suggestions:** 20% double harvest chance, 25% faster gathering, 10% rare material chance
- **Economy suggestions:** 10-15% vendor discounts (small but noticeable), 5-10% better sell prices
- **Utility suggestions:** 25-33% travel cooldown reduction (10 min → 7.5 min or 6.7 min)
- Document assumptions in perk descriptions, easy to adjust by changing numbers in data file

## Implementation Approach

### Recommended Sequence

**Phase 1: Extend Data Model** (Foundation)
1. Extend `PerkEffect` type with all new field categories
2. Design complete perk list for ranks 2-11 (30 perks total, 3 per rank)
3. Update backend `RENOWN_PERK_POOLS` with new perks
4. Update frontend `RenownPanel.vue` with matching definitions
5. Verify: TypeScript compiles, perks show in UI

**Phase 2: Implement Combat Perks** (High Value)
6. Add proc effect handling to combat resolution
7. Test with simple on-crit proc (e.g., 5% chance for +50% damage)
8. Extend to other proc types (on-hit, on-kill)
9. Add combat logging for proc triggers
10. Verify: Procs trigger at expected rates, damage applies correctly

**Phase 3: Implement Crafting Perks** (Medium Complexity)
11. Add gathering bonus handling to `gather_resource` reducer
12. Implement double harvest chance (quantity bonus)
13. Implement gathering speed reduction (efficiency bonus)
14. Add system messages for bonus triggers
15. Verify: Bonuses apply, messages show, balance feels right

**Phase 4: Implement Social/Utility Perks** (Low Risk)
16. Add vendor price modifiers to buy/sell reducers
17. Add NPC affinity gain bonuses to conversation system
18. Add travel cooldown reduction to travel reducer
19. Verify: Bonuses apply, UI reflects changes

**Phase 5: Active Abilities** (High Impact, Do Last)
20. Implement hotbar auto-assignment for active perks
21. Create ability templates for each active perk
22. Implement ability execution logic (healing, buffs, etc.)
23. Add cooldown tracking
24. Verify: Abilities cast correctly, cooldowns work, UI shows status

**Phase 6: Balance & Polish**
25. Playtest each perk path (combat-focused, craft-focused, mixed)
26. Adjust numeric values based on feedback
27. Add perk-specific visual/audio feedback (if time permits)
28. Document perk system for players

**Rationale:** Combat perks first because they're most complex and highest value. Crafting/social perks are simpler extensions. Active abilities last because they depend on other systems working.

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** - Direct examination of current implementation
  - `C:/projects/uwr/spacetimedb/src/data/renown_data.ts` (lines 1-427) - Perk definitions, rank thresholds
  - `C:/projects/uwr/spacetimedb/src/schema/tables.ts` (lines 1254-1313) - Renown/RenownPerk/Achievement tables
  - `C:/projects/uwr/spacetimedb/src/helpers/renown.ts` (lines 1-177) - Perk calculation logic
  - `C:/projects/uwr/spacetimedb/src/reducers/renown.ts` (lines 1-68) - Perk selection reducer
  - `C:/projects/uwr/src/components/RenownPanel.vue` (lines 1-472) - Perk UI implementation
  - `C:/projects/uwr/spacetimedb/src/helpers/combat.ts` (lines 1-150) - Combat resolution patterns
  - `C:/projects/uwr/spacetimedb/src/data/combat_scaling.ts` (lines 1-100) - Combat constants and scaling

- **Phase 20 CONTEXT.md** - User decisions from `/gsd:discuss-phase`
  - Locked design decisions for perk variety, proc style, choice architecture
  - Clear scope boundaries (ranks 2-11 in scope, 12-15 deferred)

### Secondary (MEDIUM confidence)
- **SpacetimeDB TypeScript documentation** - From CLAUDE.md rules
  - Deterministic reducer requirements (no Math.random())
  - Table schema patterns and index usage
  - Scheduled table patterns (not needed for this phase)

### Tertiary (LOW confidence)
- **Shadeslinger book series context** - Mentioned in CONTEXT.md as inspiration
  - "Perks should feel like character-defining abilities from the books"
  - Not directly referenced in code, used as thematic guide

## Metadata

**Confidence breakdown:**
- Current system understanding: **HIGH** - Direct code inspection, working features observed
- Combat proc implementation: **MEDIUM** - Pattern exists (crit rolls), extension straightforward but untested
- Crafting/gathering implementation: **MEDIUM** - Hooks exist, logic clear, numeric balance needs playtesting
- Active ability implementation: **MEDIUM-HIGH** - Class ability system provides template, hotbar integration adds complexity
- Balance and numeric values: **LOW-MEDIUM** - User granted discretion, playtesting needed for final tuning

**Research date:** 2026-02-16
**Valid until:** 60 days (stable system, design phase not fast-moving)

**Notes:**
- This phase is primarily **game design** (perk effects, balance, player choice) not new technical patterns
- Implementation risk is LOW — extending existing patterns, not building new infrastructure
- Biggest unknown is **balance**: numeric values need iteration based on actual gameplay
- User provided clear guardrails (domain balance, proc style, no respec) which reduce design ambiguity
