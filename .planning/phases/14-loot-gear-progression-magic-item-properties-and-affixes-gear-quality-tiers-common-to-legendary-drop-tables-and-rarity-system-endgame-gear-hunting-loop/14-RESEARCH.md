# Phase 14: Loot & Gear Progression - Research

**Researched:** 2026-02-17
**Domain:** SpacetimeDB TypeScript — item schema extension, deterministic drop rolls, affix system, loot generation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Quality Tiers:**
- 5 tiers: Common, Uncommon, Rare, Epic, Legendary
- Higher tier = better base stats AND more affixes (both scale together)
- Quality communicated via colored item name + colored tile border (both)
  - Common=white, Uncommon=green, Rare=blue, Epic=purple, Legendary=orange
- Legendary items are named uniques with fixed affixes — each has a specific identity (e.g., "Soulrender"). They are NOT part of the RNG tier system. They only drop from specific named/boss enemies. Small curated pool.

**Level-Gated Quality Unlocks:**
- Levels 1–10 (Tier 1): Common and Uncommon only. 1 affix max at +1 magnitude. Very small drop chance for affix items at low creature levels; scales up toward level 10.
- Levels 11–20 (Tier 2): Rare becomes possible. Up to 2 affixes at +2 magnitude.
- Levels 21–30 (Tier 3): Epic possible. Up to 3 affixes. Tier 3 unlocks non-stat affix types (procs, haste, sustain).
- Levels 31+ (Tier 4+): Higher affix counts and magnitudes, more powerful affix types.
- A level 10 creature drops items with more base damage/AC than a level 1 creature — smooth power curve within the tier.
- Enemies scale with region tier, not player level. Outgearing a region is intentional. No player-level enemy scaling.

**Affix System:**
- Prefix + Suffix structure — items can have both a prefix and a suffix, combining into a unique item name (e.g., "Sturdy Blade of Haste")
- Slot-specific affix pools: Weapons: offensive (procs, haste/cooldown reduction, STR/INT/DEX bonuses). Armor: defensive (life on hit, max HP bonus, resistances). Accessories: mix (Claude's discretion).
- Fixed values per tier — no range rolling. A Tier 2 item always has exactly +2 magnitude affixes.
- Affix types by tier: Tier 1–2: Stat bonuses only. Tier 3+: non-stat types (procs, sustain, haste/cooldown reduction).
- No utility affixes — no gold find, XP boost, travel cost reduction.
- Procs are high-tier only — unlock at Tier 3+.

**Drop Sources:**
- Regular enemy kills: Low chance at any affix item. Drop quality capped by creature level/region tier.
- Named/elite enemies (boss_kill quest targets): Guaranteed drop of higher-tier item than regular mobs at same level. Primary targeted farming loop.
- Quest rewards: Specific quests reward specific gear pieces. Deterministic/narrative-tied gear.
- No exploration chests for gear.
- Salvage or sell: Old gear can be vendored for gold OR salvaged into crafting materials.

**Identification & Discovery:**
- Immediately identified — affixes visible the moment gear drops. No ID scrolls.
- Tooltip format: Quality color on name + base stats + each affix line by line.
- Loot panel: Gear shows with quality-colored name. Epic and Legendary drops get a brief animated flash.
- No comparison arrows — player reads tooltip and decides.

### Claude's Discretion
- Exact affix pool contents (specific names, exact values) — tuned during planning/seeding
- Accessory affix pool composition
- Exact drop rate percentages per creature level
- Loot panel animation specifics (CSS transition style for the Epic/Legendary flash)
- Number of named Legendaries in the first pass

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

## Summary

The existing codebase already has significant scaffolding for this phase. `ItemTemplate` has `rarity` and `tier` fields already. The UI already has all five rarity color styles defined (`rarityCommon` through `rarityLegendary`). The loot generation pipeline is fully established: combat end calls `generateLootTemplates()` which picks from `LootTableEntry` rows, creates `CombatLoot` rows, and the client resolves them via `itemTemplate` lookup.

The core gap is that affixes are currently baked directly into `ItemTemplate` columns (`strBonus`, `armorClassBonus`, etc.) and there is no per-instance affix data. For this phase, the approach must extend the existing schema: either add affix columns to `ItemInstance` or introduce a new `ItemAffix` table. An `ItemAffix` table is the right choice because it allows variable numbers of affixes per instance, prefix/suffix naming, and future expansion without schema bloat.

The deterministic roll pattern is already established in the codebase: `ctx.timestamp.microsSinceUnixEpoch + character.id` and variants with `+ 11n`, `+ 19n`, `+ 23n` as seed modifiers. This same XOR/modulo pattern must be used for quality tier rolls, affix selection, and named legendary drops.

**Primary recommendation:** Add an `ItemAffix` table (one row per affix per item instance), extend `ItemInstance` with `qualityTier` (string enum), `displayName` (affix-generated name), and `isNamed` flag. Extend `generateLootTemplates()` to also call `generateAffixes()` at drop time. The affix pool lives in a seed data file (`affix_catalog.ts`), mirroring how `ability_catalog.ts` and `npc_data.ts` work.

---

## Standard Stack

### Core (already in codebase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `spacetimedb/server` | 1.11.x | Table definitions, reducers | Project standard |
| Vue 3 Composition API | 3.x | Client UI reactivity | Project standard |
| `spacetimedb/react` (via SpacetimeDB Vue bindings) | 1.11.x | useTable, connection | Project standard |

### Supporting (existing patterns to follow)
| Pattern | File | Purpose |
|---------|------|---------|
| Seed data file | `data/affix_catalog.ts` (new) | Static affix pool definitions, mirrors `ability_catalog.ts` |
| Ensure function | `seeding/ensure_items.ts` (extend) | Upsert gear templates with quality tiers |
| Helper function | `helpers/items.ts` (extend) | `generateItemAffixes()`, `getItemDisplayName()` |
| Weighted roll | `reducers/combat.ts` (extend) | Affix slot selection at drop time |

**Installation:** No new packages required. All functionality uses existing SpacetimeDB SDK.

---

## Architecture Patterns

### Recommended Project Structure
```
spacetimedb/src/
├── data/
│   └── affix_catalog.ts     # NEW: affix pool definitions (prefixes, suffixes by slot/tier)
├── schema/
│   └── tables.ts            # EXTEND: ItemInstance + ItemAffix new table
├── helpers/
│   └── items.ts             # EXTEND: generateItemAffixes(), getItemDisplayName()
├── seeding/
│   └── ensure_items.ts      # EXTEND: gear templates with quality tiers
│   └── ensure_enemies.ts    # EXTEND: named legendary enemy loot tables
├── reducers/
│   ├── combat.ts            # EXTEND: generateLootTemplates() calls affix generation
│   └── items.ts             # EXTEND: salvage_item reducer
src/
├── components/
│   └── LootPanel.vue        # EXTEND: affix lines in tooltip, flash animation for Epic/Legendary
│   └── InventoryPanel.vue   # EXTEND: border color by quality tier, tooltip shows affixes
└── composables/
    └── useCombat.ts         # EXTEND: pendingLoot includes affix data from ItemAffix rows
```

### Pattern 1: ItemAffix Table (new table)
**What:** One row per affix per item instance. Allows variable affix counts and prefix/suffix distinction.
**When to use:** Every time a non-Common item is created (drops and crafted gear).

```typescript
// Source: schema/tables.ts — new table definition
export const ItemAffix = table(
  {
    name: 'item_affix',
    public: true,
    indexes: [{ name: 'by_instance', algorithm: 'btree', columns: ['itemInstanceId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    itemInstanceId: t.u64(),
    affixType: t.string(),      // 'prefix' | 'suffix'
    affixKey: t.string(),       // e.g., 'sturdy', 'of_haste'
    affixName: t.string(),      // display name, e.g., 'Sturdy', 'of Haste'
    statKey: t.string(),        // e.g., 'strBonus', 'lifeOnHit', 'cooldownReduction'
    magnitude: t.i64(),         // fixed per tier; positive = bonus
  }
);
```

### Pattern 2: Extend ItemInstance with quality metadata
**What:** Add `qualityTier` (string: 'common'|'uncommon'|'rare'|'epic'|'legendary'), `displayName` (the affix-generated name), and `isNamed` (bool for Legendary uniques) to `ItemInstance`.
**When to use:** All item instances — Common items have empty `displayName` and no `ItemAffix` rows.

```typescript
// Source: schema/tables.ts — extend ItemInstance
export const ItemInstance = table(
  {
    name: 'item_instance',
    public: true,
    indexes: [{ name: 'by_owner', algorithm: 'btree', columns: ['ownerCharacterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    templateId: t.u64(),
    ownerCharacterId: t.u64(),
    equippedSlot: t.string().optional(),
    quantity: t.u64(),
    // NEW fields:
    qualityTier: t.string().optional(),    // 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'; undefined = 'common'
    displayName: t.string().optional(),    // null for common, e.g., "Sturdy Scout Jerkin of Haste"
    isNamed: t.bool().optional(),          // true only for Legendary unique items
  }
);
```

### Pattern 3: Affix Catalog (data file)
**What:** Static TypeScript catalog mirroring `ability_catalog.ts`. No DB table needed — purely seeding logic.
**When to use:** Referenced by the loot generation function to pick prefix/suffix.

```typescript
// Source: data/affix_catalog.ts — NEW file
export interface AffixDef {
  key: string;
  name: string;              // display: 'Sturdy', 'of Haste'
  type: 'prefix' | 'suffix';
  slots: string[];           // which gear slots this applies to: ['chest','legs','boots'] or ['mainHand'] etc.
  statKey: string;           // which stat it modifies
  minTier: number;           // minimum quality tier this affix can appear on (1-4)
  magnitudeByTier: bigint[]; // index 0 = tier 1 magnitude, index 1 = tier 2, etc.
}

export const PREFIXES: AffixDef[] = [
  { key: 'sturdy', name: 'Sturdy', type: 'prefix', slots: ['chest','legs','boots','head','hands','wrists','belt'], statKey: 'armorClassBonus', minTier: 1, magnitudeByTier: [1n, 2n, 3n, 4n] },
  { key: 'mighty', name: 'Mighty', type: 'prefix', slots: ['mainHand','offHand'], statKey: 'strBonus', minTier: 1, magnitudeByTier: [1n, 2n, 3n, 4n] },
  { key: 'swift', name: 'Swift', type: 'prefix', slots: ['mainHand','offHand'], statKey: 'dexBonus', minTier: 1, magnitudeByTier: [1n, 2n, 3n, 4n] },
  { key: 'wise', name: 'Wise', type: 'prefix', slots: ['mainHand','offHand'], statKey: 'wisBonus', minTier: 1, magnitudeByTier: [1n, 2n, 3n, 4n] },
  { key: 'arcane', name: 'Arcane', type: 'prefix', slots: ['mainHand','offHand'], statKey: 'intBonus', minTier: 1, magnitudeByTier: [1n, 2n, 3n, 4n] },
  { key: 'vital', name: 'Vital', type: 'prefix', slots: ['chest','legs','boots','head','hands','wrists','belt'], statKey: 'hpBonus', minTier: 1, magnitudeByTier: [5n, 10n, 20n, 35n] },
  // Tier 3+ proc prefixes:
  { key: 'vampiric', name: 'Vampiric', type: 'prefix', slots: ['mainHand'], statKey: 'lifeOnHit', minTier: 3, magnitudeByTier: [0n, 0n, 3n, 5n] },
  { key: 'swift_striker', name: 'Swift Striker', type: 'prefix', slots: ['mainHand'], statKey: 'cooldownReduction', minTier: 3, magnitudeByTier: [0n, 0n, 10n, 15n] },
];

export const SUFFIXES: AffixDef[] = [
  { key: 'of_endurance', name: 'of Endurance', type: 'suffix', slots: ['chest','legs','boots','head','hands','wrists','belt'], statKey: 'hpBonus', minTier: 1, magnitudeByTier: [5n, 10n, 20n, 35n] },
  { key: 'of_strength', name: 'of Strength', type: 'suffix', slots: ['chest','legs','boots','head','hands','wrists','belt'], statKey: 'strBonus', minTier: 1, magnitudeByTier: [1n, 2n, 3n, 4n] },
  { key: 'of_the_mind', name: 'of the Mind', type: 'suffix', slots: ['mainHand','neck','earrings','cloak'], statKey: 'intBonus', minTier: 1, magnitudeByTier: [1n, 2n, 3n, 4n] },
  { key: 'of_haste', name: 'of Haste', type: 'suffix', slots: ['mainHand','offHand'], statKey: 'cooldownReduction', minTier: 3, magnitudeByTier: [0n, 0n, 10n, 15n] },
  { key: 'of_warding', name: 'of Warding', type: 'suffix', slots: ['chest','legs','boots','head'], statKey: 'magicResistanceBonus', minTier: 2, magnitudeByTier: [0n, 5n, 10n, 15n] },
  // Tier 3+ sustain suffixes:
  { key: 'of_the_lifedrinker', name: 'of the Lifedrinker', type: 'suffix', slots: ['mainHand'], statKey: 'lifeOnHit', minTier: 3, magnitudeByTier: [0n, 0n, 3n, 5n] },
  { key: 'of_mana_flow', name: 'of Mana Flow', type: 'suffix', slots: ['neck','earrings','cloak'], statKey: 'manaRegen', minTier: 3, magnitudeByTier: [0n, 0n, 5n, 8n] },
];
```

### Pattern 4: Deterministic Loot Roll (established codebase pattern)
**What:** XOR/modulo arithmetic seeded from timestamp + character id + item id. No Math.random().
**When to use:** Quality tier roll, affix slot pick, legendary eligibility check.

```typescript
// Source: reducers/combat.ts — existing established pattern
const rollPercent = (seed: bigint) => Number(seed % 100n);

// Quality tier roll — called from generateLootTemplates()
function rollQualityTier(seed: bigint, creatureLevel: bigint): string {
  const tierFloor = getMaxQualityForLevel(creatureLevel);
  const roll = rollPercent(seed);
  // tierFloor caps what's possible. Within cap, weight toward lower tiers.
  // Tier 1 zone (level 1-10): ~75% common, ~25% uncommon (if level >= 5)
  // Exact values: Claude's discretion per CONTEXT.md
  if (tierFloor === 1) {
    if (roll < 25 && creatureLevel >= 5n) return 'uncommon';
    return 'common';
  }
  if (tierFloor === 2) {
    if (roll < 10) return 'rare';
    if (roll < 40) return 'uncommon';
    return 'common';
  }
  // etc.
  return 'common';
}

// Affix count by quality tier
const AFFIX_COUNT: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 0, // legendaries use fixed affixes, not rolled
};

// Magnitude by tier number
const AFFIX_MAGNITUDE: Record<number, bigint> = {
  1: 1n,
  2: 2n,
  3: 3n,
  4: 4n,
};
```

### Pattern 5: Named Legendary Drop (boss-only)
**What:** Named enemies (from `NamedEnemy` table) get a special post-combat check. If the killed enemy template has a legendary drop assignment, that specific item instance is created with `isNamed: true` and fixed affixes from a catalog.
**When to use:** Only when a `NamedEnemy` row's `enemyTemplateId` is killed.

```typescript
// Source: combat.ts — extend the enemy death handling loop
// After regular loot: check if this enemy template has a legendary assignment
const NAMED_LEGENDARY_DROPS: Record<string, string> = {
  // enemyTemplateName -> legendary item key
  // e.g., 'Soulrender' from boss template 'Hollowmere Champion'
};

// Each legendary defined in affix_catalog.ts as LegendaryDef:
export interface LegendaryDef {
  key: string;
  name: string;
  templateName: string;    // base ItemTemplate name it's based on
  affixes: { type: 'prefix'|'suffix', affixKey: string }[];
  enemyTemplateName: string;  // which named enemy drops this
}
```

### Anti-Patterns to Avoid
- **Storing affixes in ItemTemplate columns:** The current `strBonus`, `armorClassBonus` etc. columns on `ItemTemplate` represent the BASE item stats (no affix). Affixes are per-instance and live in `ItemAffix` rows. Do NOT encode affix-modified values back into the template.
- **Multi-column index on LootTable:** The existing `LootTable` index `by_key` is on `['terrainType', 'creatureType', 'tier']` — a multi-column index which is BROKEN in SpacetimeDB 1.11. The `findLootTable()` function in `combat.ts` already works around this with `.iter()` and manual filtering. Do not add more multi-column indexes.
- **Math.random() anywhere:** All randomness must use `ctx.timestamp.microsSinceUnixEpoch` variants. Established seed modifiers: `+ 11n` (junk pick), `+ 19n` (gear roll), `+ 23n` (gear pick). Use `+ 31n`, `+ 37n`, `+ 41n` for quality roll, prefix pick, suffix pick.
- **CombatLoot storing affix data:** `CombatLoot` only stores `itemTemplateId`. When `take_loot` is called, the `ItemInstance` row is created WITH its `ItemAffix` rows at that moment. Do not create `ItemAffix` rows before the player takes the loot.
- **Standalone affix DB table for catalog:** Affix definitions belong in a TypeScript data file (`affix_catalog.ts`), not in a database table. Only the per-instance affixes (which were rolled) live in the DB as `ItemAffix` rows.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Weighted random pick | Custom shuffle | Existing `pickWeightedEntry()` in `combat.ts` | Already handles edge cases, deterministic |
| Percent roll | Custom modulo | Existing `rollPercent()` in `combat.ts` | Consistent seed usage |
| Item template upsert | Direct inserts | `upsertItemTemplateByName()` in `ensure_items.ts` | Handles re-seeding on redeploy |
| Rarity color mapping | New style system | Existing `rarityCommon`/`rarityUncommon`/`rarityRare`/`rarityEpic`/`rarityLegendary` in `styles.ts` | Already defined, used in InventoryPanel, LootPanel, VendorPanel |
| Item stats display | New tooltip logic | Extend existing stats array in `useCombat.ts` `pendingLoot` computed | Same pattern already maps all stat bonuses |

**Key insight:** The codebase already has the entire display pipeline for loot; affixes are just additional stat lines in the existing stats array.

---

## Common Pitfalls

### Pitfall 1: ItemInstance.qualityTier vs ItemTemplate.rarity Confusion
**What goes wrong:** Using `itemTemplate.rarity` to drive affix behavior, but the template's rarity field represents the base item type (e.g., a starter item is `common`). The quality of a dropped item comes from the roll, stored in `itemInstance.qualityTier`.
**Why it happens:** `ItemTemplate` already has a `rarity` field which looks like it should drive quality color. It does — for un-affixed items. For dropped items with affixes, `itemInstance.qualityTier` overrides the template rarity for display.
**How to avoid:** When rendering loot in `pendingLoot`, check `itemInstance.qualityTier` first, fall back to `itemTemplate.rarity`. Store the rolled quality on the instance, not the template.
**Warning signs:** All dropped gear shows as 'common' regardless of roll, or legendary displays on Common items.

### Pitfall 2: Creating ItemAffix Rows Before take_loot
**What goes wrong:** If `ItemAffix` rows are created at drop time (when `CombatLoot` is inserted), they're orphaned until the player takes the loot. If the combat result is auto-cleaned, the affixes have no owner.
**Why it happens:** Wanting to generate affixes "at drop time" rather than "at take time."
**How to avoid:** Create `ItemAffix` rows inside the `take_loot` reducer, right after `addItemToInventory()` creates the `ItemInstance`. Pass the affix data as part of the `CombatLoot` row or as a parallel data structure.
**Implementation note:** The simplest approach: store a `affixDataJson` string on `CombatLoot` (JSON-serialized list of affix keys). When `take_loot` fires, parse it and create `ItemAffix` rows. This avoids a separate lookup table for pending affixes.

### Pitfall 3: getEquippedBonuses Not Reading Affixes
**What goes wrong:** Player equips an affixed item but the character's derived stats don't include the affix bonuses.
**Why it happens:** `getEquippedBonuses()` in `helpers/items.ts` reads only `ItemTemplate` columns (`strBonus`, `armorClassBonus`, etc.). It doesn't know about `ItemAffix` rows.
**How to avoid:** Extend `getEquippedBonuses()` to also sum `ItemAffix` rows for each equipped instance. New affix stat keys (like `lifeOnHit`, `cooldownReduction`) need corresponding accumulation in the bonuses object AND corresponding application in `recomputeCharacterDerived()`.
**Warning signs:** Equipped uncommon+ item shows correct tooltip stats but character sheet doesn't reflect the affix bonuses.

### Pitfall 4: LootTable by_key Multi-Column Index
**What goes wrong:** If a new index is added on `LootTable` with multiple columns, it will panic or silently return empty results.
**Why it happens:** SpacetimeDB 1.11 has a known broken multi-column btree index. The existing `by_key` index on `['terrainType', 'creatureType', 'tier']` is already present in the schema but the code works around it with `.iter()` manual scan.
**How to avoid:** Do NOT call `ctx.db.lootTable.by_key.filter(...)`. The manual scan approach in `findLootTable()` is the correct pattern. If adding new per-tier loot tables (e.g., for tier 2+ drops), keep the same manual scan pattern.
**Warning signs:** Server panics, or `findLootTable()` always returns null for non-tier-1 entries.

### Pitfall 5: Named Legendary Drop on Group Kill
**What goes wrong:** In a group, all participants receive the same legendary drop (one per participant). Named Legendaries should drop once per kill, not once per participant.
**Why it happens:** The existing `generateLootTemplates()` is called inside a loop over `participants`. A legendary that drops once should be picked up by the group leader or looted from the enemy's corpse.
**How to avoid:** Named legendary drops use a separate non-participant-looped path. Insert one `CombatLoot` row for the group leader character only (not all participants). Alternatively, insert one row owned by the first eligible participant and announce in group log.

### Pitfall 6: Affix Names Not Updating Display Name on Re-equip
**What goes wrong:** `displayName` on `ItemInstance` (e.g., "Sturdy Scout Jerkin of Haste") is set once at loot-take time and never changes. This is correct — don't recompute it from `ItemAffix` rows on every equip.
**Why it happens:** Temptation to derive display name dynamically.
**How to avoid:** Set `displayName` once in `take_loot` after all affixes are applied. Read it directly in the client without recomputing.

---

## Code Examples

Verified patterns from official sources and existing codebase:

### Deterministic Quality Roll (follow existing seed pattern)
```typescript
// Source: reducers/combat.ts — existing rollPercent and seed arithmetic
const QUALITY_TIER_ROLL_OFFSET = 31n; // new offset, doesn't collide with existing 11n, 19n, 23n

function rollQualityTier(creatureLevel: bigint, seedBase: bigint): string {
  const tierCeiling = getMaxTierForLevel(creatureLevel); // 1 | 2 | 3 | 4
  const roll = Number((seedBase + QUALITY_TIER_ROLL_OFFSET) % 100n);
  // Tier 1 zone
  if (tierCeiling === 1) {
    const uncommonThreshold = Math.min(25, Math.max(0, Number(creatureLevel) * 2));
    if (roll < uncommonThreshold) return 'uncommon';
    return 'common';
  }
  // Tier 2 zone
  if (tierCeiling === 2) {
    if (roll < 10) return 'rare';
    if (roll < 40) return 'uncommon';
    return 'common';
  }
  // Tier 3 zone
  if (tierCeiling === 3) {
    if (roll < 5) return 'epic';
    if (roll < 20) return 'rare';
    if (roll < 50) return 'uncommon';
    return 'common';
  }
  // Tier 4+ zone
  if (roll < 3) return 'epic';
  if (roll < 15) return 'rare';
  if (roll < 45) return 'uncommon';
  return 'common';
}

function getMaxTierForLevel(level: bigint): number {
  if (level <= 10n) return 1;
  if (level <= 20n) return 2;
  if (level <= 30n) return 3;
  return 4;
}
```

### Affix Generation (new helper)
```typescript
// Source: helpers/items.ts — new function
import { PREFIXES, SUFFIXES } from '../data/affix_catalog';

export function generateAffixData(
  slot: string,
  qualityTier: string,
  seedBase: bigint
): { affixKey: string; affixType: 'prefix' | 'suffix'; magnitude: bigint; statKey: string; affixName: string }[] {
  const tierNum = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 }[qualityTier] ?? 0;
  const affixCount = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 0 }[qualityTier] ?? 0;
  if (affixCount === 0) return [];

  const results = [];
  const eligiblePrefixes = PREFIXES.filter(a => a.slots.includes(slot) && a.minTier <= tierNum);
  const eligibleSuffixes = SUFFIXES.filter(a => a.slots.includes(slot) && a.minTier <= tierNum);

  // Always try prefix first for uncommon+
  if (eligiblePrefixes.length > 0) {
    const idx = Number((seedBase + 37n) % BigInt(eligiblePrefixes.length));
    const chosen = eligiblePrefixes[idx];
    results.push({
      affixKey: chosen.key,
      affixType: 'prefix' as const,
      magnitude: chosen.magnitudeByTier[tierNum - 1] ?? 0n,
      statKey: chosen.statKey,
      affixName: chosen.name,
    });
  }

  // Add suffix for rare+ (affixCount >= 2)
  if (affixCount >= 2 && eligibleSuffixes.length > 0) {
    const idx = Number((seedBase + 41n) % BigInt(eligibleSuffixes.length));
    const chosen = eligibleSuffixes[idx];
    results.push({
      affixKey: chosen.key,
      affixType: 'suffix' as const,
      magnitude: chosen.magnitudeByTier[tierNum - 1] ?? 0n,
      statKey: chosen.statKey,
      affixName: chosen.name,
    });
  }

  // Additional affixes for epic (affixCount = 3) — pick second prefix or suffix
  if (affixCount >= 3) {
    // Pick whichever pool has more options after excluding already-chosen
    // Use seed + 43n offset
  }

  return results;
}

export function buildDisplayName(baseItemName: string, affixes: { affixType: string; affixName: string }[]): string {
  const prefix = affixes.find(a => a.affixType === 'prefix')?.affixName;
  const suffix = affixes.find(a => a.affixType === 'suffix')?.affixName;
  const parts = [];
  if (prefix) parts.push(prefix);
  parts.push(baseItemName);
  if (suffix) parts.push(suffix);
  return parts.join(' ');
}
```

### Extended take_loot Reducer (affix creation at take time)
```typescript
// Source: reducers/items.ts — extend take_loot
spacetimedb.reducer('take_loot', { characterId: t.u64(), lootId: t.u64() }, (ctx, args) => {
  // ... existing validation ...
  addItemToInventory(ctx, character.id, template.id, 1n);

  // NEW: Apply affixes if loot row has affix data
  if (loot.affixDataJson && loot.affixDataJson.length > 0) {
    const instance = [...ctx.db.itemInstance.by_owner.filter(character.id)]
      .find(row => row.templateId === loot.itemTemplateId && !row.equippedSlot && !row.qualityTier);
    // Parse stored affixes and create ItemAffix rows...
    // Update the instance with qualityTier and displayName
  }

  ctx.db.combatLoot.id.delete(loot.id);
  // ... existing log message + result cleanup ...
});
```

### Affix Stat Lines in Loot Tooltip (client-side)
```typescript
// Source: composables/useCombat.ts — extend pendingLoot computed
// After existing stats array, add affix stats from itemAffixes reactive ref
const affixRows = itemAffixes.value.filter(a => a.itemInstanceId.toString() === instanceId);
const affixStats = affixRows.map(a => ({
  label: formatAffixStatKey(a.statKey),
  value: `+${a.magnitude} (${a.affixName})`,
}));
// Merge into stats array
```

### Epic/Legendary Flash Animation
```css
/* Add to styles.ts */
lootFlashEpic: {
  animation: 'lootFlash 0.6s ease-in-out 2',
  // keyframes defined in App.vue <style> block or injected via CSS
},
lootFlashLegendary: {
  animation: 'lootFlashLegendary 0.8s ease-in-out 3',
},
```

### CombatLoot Table Extension (affix data transport)
```typescript
// Source: schema/tables.ts — extend CombatLoot
export const CombatLoot = table(
  {
    name: 'combat_loot',
    public: true,
    indexes: [
      { name: 'by_owner', algorithm: 'btree', columns: ['ownerUserId'] },
      { name: 'by_combat', algorithm: 'btree', columns: ['combatId'] },
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    ownerUserId: t.u64(),
    characterId: t.u64(),
    itemTemplateId: t.u64(),
    createdAt: t.timestamp(),
    // NEW:
    qualityTier: t.string().optional(),   // rolled quality, e.g., 'uncommon'
    affixDataJson: t.string().optional(), // JSON array of affix keys to apply at take time
    isNamed: t.bool().optional(),         // true for Legendary uniques
  }
);
```

### Extended getEquippedBonuses (affix stat sum)
```typescript
// Source: helpers/items.ts — extend getEquippedBonuses
export function getEquippedBonuses(ctx: any, characterId: bigint) {
  const bonuses = {
    str: 0n, dex: 0n, cha: 0n, wis: 0n, int: 0n,
    hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n,
    // NEW:
    magicResistanceBonus: 0n,
    lifeOnHit: 0n,          // applied during combat hit processing
    cooldownReduction: 0n,   // applied when computing ability cooldowns
    manaRegen: 0n,           // applied in health regen tick
  };
  for (const instance of ctx.db.itemInstance.by_owner.filter(characterId)) {
    if (!instance.equippedSlot) continue;
    const template = ctx.db.itemTemplate.id.find(instance.templateId);
    if (!template) continue;
    bonuses.str += template.strBonus;
    // ... existing fields ...
    // NEW: sum ItemAffix rows
    for (const affix of ctx.db.itemAffix.by_instance.filter(instance.id)) {
      if (affix.statKey === 'strBonus') bonuses.str += affix.magnitude;
      if (affix.statKey === 'armorClassBonus') bonuses.armorClassBonus += affix.magnitude;
      if (affix.statKey === 'hpBonus') bonuses.hpBonus += affix.magnitude;
      if (affix.statKey === 'lifeOnHit') bonuses.lifeOnHit += affix.magnitude;
      if (affix.statKey === 'cooldownReduction') bonuses.cooldownReduction += affix.magnitude;
      // etc.
    }
  }
  return bonuses;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Gear stats only in ItemTemplate | Affixes in separate ItemAffix rows (per instance) | This phase | Enables variable affix counts without template explosion |
| LootTableEntry points to pre-built template | LootTableEntry still points to template, but quality tier + affixes rolled at drop | This phase | Same base template, different quality realization |
| CombatLoot only stores templateId | CombatLoot also stores qualityTier + affixDataJson | This phase | Affix data transported to take_loot reducer |
| ItemInstance has no quality field | ItemInstance has qualityTier + displayName + isNamed | This phase | Client reads quality from instance, not template |

**Deprecated/outdated:**
- The existing `rarity` field on `ItemTemplate` remains but represents "base rarity" (all starters are 'common'). Rolled gear uses `itemInstance.qualityTier` for display. The planner should clarify whether `ItemTemplate.rarity` stays used or is superseded — recommendation: keep it for vendor items and base template classification; use `itemInstance.qualityTier` for dropped gear quality.

---

## Existing Schema Analysis

### What's Already Present (no schema change needed)
| Element | Location | Notes |
|---------|----------|-------|
| `rarity` field on ItemTemplate | `schema/tables.ts` line 313 | Already exists as string |
| `tier` field on ItemTemplate | `schema/tables.ts` line 315 | Already exists as u64 |
| 5-tier rarity color styles | `ui/styles.ts` lines 1289-1303 | white/green/blue/yellow/orange |
| Rarity color mapping in LootPanel | `components/LootPanel.vue` lines 59-66 | All 5 tiers mapped |
| Rarity color mapping in InventoryPanel | `components/InventoryPanel.vue` lines 144-150 | All 5 tiers mapped |
| `generateLootTemplates()` in combat | `reducers/combat.ts` line 585 | Entry point for extension |
| `rollPercent()` deterministic helper | `reducers/combat.ts` line 570 | Reuse for quality rolls |
| `pickWeightedEntry()` | `reducers/combat.ts` line 572 | Reuse for affix selection |
| Existing vendor value scaling | `seeding/ensure_enemies.ts` line 176 | `vendorValue * 6n` for buy price |

### What Needs to Be Added (schema)
| Element | Table | Notes |
|---------|-------|-------|
| `ItemAffix` table | New | One row per affix per item instance |
| `qualityTier` on ItemInstance | Extend | Optional string field |
| `displayName` on ItemInstance | Extend | Optional string field |
| `isNamed` on ItemInstance | Extend | Optional bool |
| `qualityTier` on CombatLoot | Extend | Transport rolled quality to take_loot |
| `affixDataJson` on CombatLoot | Extend | Transport affix keys to take_loot |
| `isNamed` on CombatLoot | Extend | Flag for named legendary special treatment |

### What Needs to Be Added (seeding)
| Element | File | Notes |
|---------|------|-------|
| `data/affix_catalog.ts` | New | PREFIXES + SUFFIXES + LEGENDARIES arrays |
| Tiered gear templates (Tier 2+) | `seeding/ensure_items.ts` | Common/uncommon base templates per slot per tier level |
| Named legendary definitions | `seeding/ensure_items.ts` or `data/affix_catalog.ts` | Fixed-affix unique items |
| Extended loot tables for Tier 2+ | `seeding/ensure_enemies.ts` | Higher-tier entries for level 11-20+ enemies |
| Named enemy legendary assignment | `seeding/ensure_enemies.ts` | Link boss template to legendary item |

### What Needs to Be Added (reducers)
| Element | File | Notes |
|---------|------|-------|
| Quality tier roll in `generateLootTemplates()` | `reducers/combat.ts` | Extend existing function |
| Named legendary drop path in combat end | `reducers/combat.ts` | After regular loot, separate loop |
| Affix creation in `take_loot` | `reducers/items.ts` | After `addItemToInventory()` |
| `salvage_item` reducer | `reducers/items.ts` | Delete instance, grant crafting materials |

### What Needs to Be Added (client)
| Element | File | Notes |
|---------|------|-------|
| `itemAffixes` reactive table subscription | `App.vue` + composables | Subscribe to `item_affix` table |
| Affix lines in tooltip stats | `composables/useCombat.ts` | Extend `pendingLoot` stats array |
| `qualityTier` for color in LootPanel | `composables/useCombat.ts` | Use `itemInstance.qualityTier` not `template.rarity` |
| Affix lines in inventory tooltip | `composables/useInventory.ts` or `App.vue` | Same pattern |
| Epic/Legendary flash CSS animation | `App.vue` style block | Brief keyframe animation on new drops |
| Border color on loot items by quality | `components/LootPanel.vue` | Apply border style matching rarity color |
| Salvage button in inventory context menu | `components/InventoryPanel.vue` | Add to context menu items |

---

## Salvage System

The salvage mechanic converts a gear item into crafting materials. Since the crafting system (Phase 13) uses `RecipeTemplate` with specific material `ItemTemplate` IDs, salvage must grant those same materials.

```typescript
// reducers/items.ts — new salvage_item reducer
spacetimedb.reducer('salvage_item', { characterId: t.u64(), itemInstanceId: t.u64() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  const instance = ctx.db.itemInstance.id.find(args.itemInstanceId);
  if (!instance) return fail(ctx, character, 'Item not found', 'system');
  if (instance.ownerCharacterId !== character.id) return fail(...);
  if (instance.equippedSlot) return fail(ctx, character, 'Unequip item first', 'system');
  const template = ctx.db.itemTemplate.id.find(instance.templateId);
  if (!template) return fail(ctx, character, 'Template missing', 'system');
  if (template.isJunk) return fail(ctx, character, 'Cannot salvage junk', 'system');
  if (template.slot === 'resource' || template.slot === 'consumable') {
    return fail(ctx, character, 'Cannot salvage this item type', 'system');
  }

  // Determine salvage yield based on tier + qualityTier
  const tier = Number(template.tier ?? 1n);
  const quality = instance.qualityTier ?? 'common';
  const materials = getSalvageYield(tier, quality); // returns array of {templateId, qty}

  // Delete instance (+ affix rows)
  for (const affix of ctx.db.itemAffix.by_instance.filter(instance.id)) {
    ctx.db.itemAffix.id.delete(affix.id);
  }
  ctx.db.itemInstance.id.delete(instance.id);

  // Grant materials
  for (const mat of materials) {
    addItemToInventory(ctx, character.id, mat.templateId, mat.qty);
  }

  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
    `You salvage ${instance.displayName ?? template.name} into ${materials.map(m => `${m.qty}x ${m.name}`).join(', ')}.`
  );
});
```

Salvage yield should scale: Common = 1-2 scraps, Uncommon = 3-4, Rare = 5-6, Epic = 7-10 (with chance of rarer material). The exact material IDs come from the existing crafting material `ItemTemplate` names defined in `ensure_items.ts`.

---

## Open Questions

1. **Does `ItemTemplate.rarity` stay relevant after this phase?**
   - What we know: It's used by vendor panel and loot panel for color. All starters are `'common'`.
   - What's unclear: For dropped gear, should the template still be `'common'` (with quality on instance) or should templates be seeded per-rarity?
   - Recommendation: Keep `ItemTemplate.rarity` as 'common' for all base templates. Dropped quality lives on `ItemInstance.qualityTier`. This avoids template explosion (you'd need a template per quality tier per item otherwise).

2. **How does the loot panel know to flash for Epic/Legendary?**
   - What we know: `pendingLoot` in `useCombat.ts` maps `CombatLoot` rows. The quality information needs to reach the client before the item is taken.
   - What's unclear: Should `CombatLoot.qualityTier` be used, or computed from affix data on the client?
   - Recommendation: Store `qualityTier` on `CombatLoot` row directly (already in the schema extension above). Client checks this field for the flash trigger.

3. **How many named Legendaries in first pass?**
   - What we know: Marked as Claude's discretion. Named enemies in the codebase currently include boss_kill quest targets from `NamedEnemy` table.
   - What's unclear: How many named enemies currently exist that could be Legendary sources.
   - Recommendation: Start with 3-5 Legendaries mapping to the highest-level named enemies. Expand in later phases.

4. **What crafting materials does salvage yield?**
   - What we know: Phase 13 crafting material templates are in `ensure_items.ts`. Specific template IDs are not visible without reading the full file.
   - What's unclear: Whether Phase 13 introduced "tier 2" or "tier 3" materials that higher-quality salvage should yield.
   - Recommendation: Read `ensure_items.ts` fully during planning to map salvage yield to the correct material template names.

5. **Does `lifeOnHit` / `cooldownReduction` need new combat loop handling?**
   - What we know: `getEquippedBonuses()` returns a bonus object. `recomputeCharacterDerived()` reads from it for stat bonuses. The combat loop in `combat.ts` currently doesn't check for life-on-hit.
   - What's unclear: Whether Tier 3 proc affixes (life on hit, cooldown reduction) require changes to the combat loop or just the stat derivation.
   - Recommendation: For Tier 3 affixes: `cooldownReduction` modifies `abilityCooldownMicros()` (already in `helpers/combat.ts`). `lifeOnHit` needs a new check in the auto-attack hit path. Plan these as separate tasks.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: `spacetimedb/src/schema/tables.ts` — full ItemTemplate and ItemInstance schemas
- Direct codebase analysis: `spacetimedb/src/helpers/items.ts` — `getEquippedBonuses()`, `addItemToInventory()`
- Direct codebase analysis: `spacetimedb/src/helpers/character.ts` — `recomputeCharacterDerived()`
- Direct codebase analysis: `spacetimedb/src/reducers/combat.ts` — `generateLootTemplates()`, `rollPercent()`, `pickWeightedEntry()`
- Direct codebase analysis: `spacetimedb/src/reducers/items.ts` — `take_loot`, `sell_item` reducers
- Direct codebase analysis: `spacetimedb/src/seeding/ensure_enemies.ts` — `ensureLootTables()` pattern
- Direct codebase analysis: `spacetimedb/src/views/combat.ts` — `my_combat_loot` view
- Direct codebase analysis: `src/ui/styles.ts` — all 5 rarity color styles confirmed present
- Direct codebase analysis: `src/composables/useCombat.ts` — `pendingLoot` computed structure

### Secondary (MEDIUM confidence)
- CLAUDE.md / spacetimedb-typescript.mdc — SpacetimeDB 1.11.x patterns, single-column index constraint, deterministic-only reducers, `public: true` table pattern

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all verified from codebase
- Architecture: HIGH — follows established codebase patterns exactly
- Pitfalls: HIGH — derived from reading actual running code; multi-column index bug confirmed from CLAUDE.md
- Affix catalog exact values: LOW — marked as Claude's discretion; planner should define specific values

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (30 days — SpacetimeDB 1.11.x API is stable)
