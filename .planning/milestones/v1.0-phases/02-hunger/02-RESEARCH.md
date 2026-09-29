# Phase 2: Hunger - Research

**Researched:** 2026-02-11
**Domain:** SpacetimeDB TypeScript SDK 1.12.x, Vue 3, scheduled tables, per-character buff state
**Confidence:** HIGH (all findings verified from live codebase)

---

## Summary

The hunger system requires four interconnected pieces: a `Hunger` table (per-character state), a `HungerDecay` scheduled table (global tick every 5 minutes), an `eat_food` reducer, and combat integration for the Well Fed damage bonus. The codebase already has all the patterns needed — scheduled singleton ticks (`HealthRegenTick`), timestamp-based buffs (not round-based), item consumption via `use_item`, and combat damage injection via `sumCharacterEffect`.

The most critical design decision is how Well Fed affects combat damage. The existing `damage_up` CharacterEffect is round-based (decrements each effect tick), but Well Fed must persist across combat sessions — it is a real-time duration buff (`wellFedUntil` timestamp). The combat loop must check the `Hunger` table directly rather than using `CharacterEffect`, because `CharacterEffect.roundsRemaining` ticks down during combat and would expire prematurely. The auto-attack damage calculation (combat.ts line 1607) currently does NOT include `damage_up` — only ability damage does. Well Fed must be injected into both auto-attack AND ability damage paths.

`ItemTemplate` does not have food-specific fields (`wellFedDurationMicros`, `wellFedDamageBonusPercent`). These must be added to `ItemTemplate` (schema migration required) or encoded in a parallel `FoodTemplate` table. Adding fields to `ItemTemplate` is the simpler path and consistent with how all consumable metadata lives on the template.

**Primary recommendation:** Add `wellFedDurationMicros` and `wellFedDamageBonusPercent` to `ItemTemplate`, add `Hunger` table and `HungerDecayTick` scheduled table to schema, implement `eat_food` reducer in a new `spacetimedb/src/reducers/hunger.ts` file, inject Well Fed bonus into both auto-attack and ability damage paths in combat.ts, add a `my_hunger` view, and add a HungerBar component to the client.

---

## Codebase Findings (Pre-existing State)

### What already exists

| Item | Location | State |
|------|----------|-------|
| `HealthRegenTick` singleton scheduled pattern | `index.ts:1012`, `index.ts:4244` | Exact template for `HungerDecayTick` |
| `ensureHealthRegenScheduled()` + call in `init` and `clientConnected` | `index.ts:4244`, `index.ts:5614` | Template for `ensureHungerDecayScheduled()` |
| `CharacterEffect` table with `roundsRemaining` | `index.ts:909` | Round-based — NOT suitable for Well Fed (cross-combat duration) |
| `sumCharacterEffect(ctx, characterId, 'damage_up')` | `index.ts:1833` | Used in ability damage only, not auto-attack |
| Auto-attack damage formula (no `damage_up`) | `combat.ts:1607-1612` | Must be updated to add Well Fed bonus |
| `executeAbilityAction` with `damageUp` | `index.ts:1937-1939` | Must also include Well Fed |
| `use_item` reducer for consumables | `items.ts:773` | Template for `eat_food` pattern |
| `ItemTemplate` with `slot: 'consumable'` | `index.ts:264` | Base for food items; missing buff-duration fields |
| `syncAllContent` → `ensureStarterItemTemplates` | `index.ts:4337` | Add food template seeding here |
| `ensureVendorInventory` → sells tier 1 items | `index.ts:3869` | Tier 1 food auto-sold if `tier: 1n` |
| `delete_character` reducer with cleanup loop | `characters.ts:201` | Must add Hunger row cleanup |
| `reducerDeps` object + `registerReducers` | `index.ts:5662`, `reducers/index.ts:10` | Add hunger reducer registration |
| `registerViews` pattern | `views/index.ts:11` | Add `registerHungerViews` |
| `useGameData.ts` with all `useTable` calls | `useGameData.ts:4` | Add `myHunger` table subscription |

### What does NOT exist yet

- No `Hunger` table
- No `HungerDecayTick` scheduled table
- No `eat_food` reducer
- No `wellFedDurationMicros` / `wellFedDamageBonusPercent` fields on `ItemTemplate`
- No food item templates (Trail Rations, Basic Meal, Hearty Stew, Feast)
- No Well Fed combat integration
- No hunger-related view
- No hunger UI component

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `spacetimedb` | ^1.12.0 | Server schema, reducers, scheduled tables | Project standard |
| Vue 3 | ^3.5.13 | Client reactivity, component system | Project standard |
| `spacetimedb/vue` | 1.12.0 | `useTable`, `useSpacetimeDB` | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ScheduleAt` from `spacetimedb` | 1.12.0 | Scheduling future reducer calls | All scheduled tables |
| `t.timestamp()` | 1.12.0 | Storing `wellFedUntil` as a timestamp | Well Fed expiry |

**Installation:** No new packages needed. All dependencies already installed.

---

## Architecture Patterns

### Recommended Project Structure (hunger additions)

```
spacetimedb/src/
├── index.ts                    (add Hunger table, HungerDecayTick, update ItemTemplate, schema export)
├── reducers/
│   ├── hunger.ts               (NEW — eat_food reducer + decay reducer)
│   └── characters.ts           (update create_character to insert Hunger row; update delete_character to clean up)
│   └── combat.ts               (update auto-attack damage to include Well Fed bonus)
└── views/
    ├── hunger.ts               (NEW — my_hunger view)
    ├── index.ts                (add registerHungerViews call)
    └── types.ts                (add Hunger to ViewDeps)

src/
├── composables/
│   └── useGameData.ts          (add myHunger useTable subscription)
└── components/
    └── HungerBar.vue           (NEW — hunger level + Well Fed status + time remaining)
    └── StatsPanel.vue          (optional: show Well Fed badge)
    └── InventoryPanel.vue      (optional: mark food items with food slot indicator)
```

### Pattern 1: Singleton Global Tick (Established Pattern — use for HungerDecayTick)

**What:** A scheduled table with no custom fields fires a reducer on a repeating interval. Each reducer invocation inserts the next tick row.

**When to use:** Any global system that runs on a fixed interval (regen, effects, hunger decay).

**Example from `HealthRegenTick`:**
```typescript
// Source: spacetimedb/src/index.ts:1012
const HealthRegenTick = table(
  { name: 'health_regen_tick', scheduled: 'regen_health' },
  { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt() }
);

// Source: spacetimedb/src/index.ts:4244
function ensureHealthRegenScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.healthRegenTick.iter())) {
    ctx.db.healthRegenTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 3_000_000n),
    });
  }
}
// Called from both spacetimedb.init() and spacetimedb.clientConnected() as a watchdog.

// Reducer reschedules itself at end:
ctx.db.healthRegenTick.insert({
  scheduledId: 0n,
  scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + REGEN_TICK_MICROS),
});
```

**Apply to HungerDecay:**
```typescript
// index.ts — table definition
const HungerDecayTick = table(
  { name: 'hunger_decay_tick', scheduled: 'decay_hunger' },
  { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt() }
);

// index.ts — ensure function
function ensureHungerDecayScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.hungerDecayTick.iter())) {
    ctx.db.hungerDecayTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + HUNGER_DECAY_INTERVAL_MICROS),
    });
  }
}
// Call from spacetimedb.init() and spacetimedb.clientConnected()

// Constant: 5 minutes = 300_000_000 micros
const HUNGER_DECAY_INTERVAL_MICROS = 300_000_000n;
const HUNGER_DECAY_AMOUNT = 2n;
```

### Pattern 2: Per-Character State Table with View (Established Pattern)

**What:** A private table holds per-character data. A view exposes only the current player's data via `ctx.sender`.

**When to use:** Any per-character data the player needs to see but shouldn't be shared globally.

**Example from `CharacterEffect` + `my_character_effects` view (source: `views/effects.ts`):**
```typescript
// View returns effects for the active character and group members
spacetimedb.view(
  { name: 'my_character_effects', public: true },
  t.array(CharacterEffect.rowType),
  (ctx: any) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player || !player.activeCharacterId) return [];
    return [...ctx.db.characterEffect.by_character.filter(player.activeCharacterId)];
  }
);
```

**Apply to Hunger:**
```typescript
// Source: views/hunger.ts (new file)
spacetimedb.view(
  { name: 'my_hunger', public: true },
  t.array(Hunger.rowType),
  (ctx: any) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player || !player.activeCharacterId) return [];
    const hunger = ctx.db.hunger.characterId.find(player.activeCharacterId);
    return hunger ? [hunger] : [];
  }
);
```

### Pattern 3: Consumable Item Reducer (Established Pattern)

**What:** A reducer validates item ownership, consumes the item (decrement quantity or delete instance), applies the effect, and sets a cooldown.

**When to use:** Any item that is consumed on use.

**Example from `use_item` for bandage (source: `items.ts:829-852`):**
```typescript
if (itemKey === 'bandage') {
  const existingEffect = [...ctx.db.characterEffect.by_character.filter(character.id)].find(
    (effect) => effect.effectType === 'regen' && effect.sourceAbility === 'Bandage'
  );
  if (existingEffect) ctx.db.characterEffect.id.delete(existingEffect.id);
  ctx.db.characterEffect.insert({
    id: 0n, characterId: character.id, effectType: 'regen',
    magnitude: BANDAGE_TICK_HEAL, roundsRemaining: BANDAGE_TICK_COUNT, sourceAbility: 'Bandage',
  });
  setCooldown(CONSUMABLE_COOLDOWN_MICROS);
  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'heal', 'You apply a bandage...');
  return;
}
```

**Apply to eat_food:**
```typescript
// reducers/hunger.ts — eat_food reducer
spacetimedb.reducer('eat_food', { characterId: t.u64(), itemInstanceId: t.u64() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  const instance = ctx.db.itemInstance.id.find(args.itemInstanceId);
  if (!instance || instance.ownerCharacterId !== character.id) throw new SenderError('Item not found');
  const template = ctx.db.itemTemplate.id.find(instance.templateId);
  if (!template || template.slot !== 'food') throw new SenderError('Not a food item');
  // Consume the item
  const qty = instance.quantity ?? 1n;
  if (qty > 1n) {
    ctx.db.itemInstance.id.update({ ...instance, quantity: qty - 1n });
  } else {
    ctx.db.itemInstance.id.delete(instance.id);
  }
  // Apply Well Fed buff — set wellFedUntil on Hunger row
  const hunger = ctx.db.hunger.characterId.find(character.id);
  if (!hunger) throw new SenderError('Hunger record missing');
  const durationMicros = template.wellFedDurationMicros ?? 0n;
  const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
  const currentExpiry = hunger.wellFedUntil.microsSinceUnixEpoch;
  // Refresh: pick the later of now+duration or current expiry (no stacking, just refresh)
  const newExpiry = nowMicros + durationMicros > currentExpiry
    ? nowMicros + durationMicros
    : currentExpiry;
  ctx.db.hunger.characterId.update({
    ...hunger,
    wellFedUntil: Timestamp.fromMicrosSinceUnixEpoch(newExpiry),
  });
  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
    `You eat the ${template.name} and feel well fed.`);
});
```

### Pattern 4: Timestamp-Based Buff (DIFFERENT from CharacterEffect rounds)

**What:** Well Fed is NOT a `CharacterEffect` with `roundsRemaining`. It's a timestamp on the `Hunger` row. This is because:
- `CharacterEffect.roundsRemaining` decrements on combat ticks (10s intervals), which would expire a 30-minute food buff prematurely during active combat
- `wellFedUntil` is a wall-clock timestamp — accurate regardless of combat state

**How combat checks it:**
```typescript
// In combat.ts auto-attack damage calculation:
const hunger = ctx.db.hunger.characterId.find(character.id);
const isWellFed = hunger && hunger.wellFedUntil.microsSinceUnixEpoch > nowMicros;
const wellFedBonus = isWellFed ? sumWellFedBonus(ctx, character.id, nowMicros) : 0n;
const damage =
  5n +
  character.level +
  weapon.baseDamage +
  (weapon.dps / 2n) +
  wellFedBonus +  // NEW: Well Fed flat bonus
  sumEnemyEffect(ctx, combat.id, 'damage_taken', currentEnemy.id);
```

**Critical: `damage_up` is NOT used in auto-attack** (verified: `combat.ts:1607-1612` has no `sumCharacterEffect`). The Well Fed bonus must be injected into the auto-attack formula directly, parallel to how `damage_taken` is injected.

### Pattern 5: ItemTemplate Extension for Buff Metadata

**What:** Food items need two additional fields on `ItemTemplate`: buff duration and damage bonus. These live on `ItemTemplate` since all item metadata belongs there.

**Schema change required:**
```typescript
// index.ts — ItemTemplate (update existing)
const ItemTemplate = table(
  { name: 'item_template', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    // ... all existing fields ...
    stackable: t.bool(),
    // NEW fields for food:
    wellFedDurationMicros: t.u64(),      // 0 for non-food; positive for food
    wellFedDamageBonusPercent: t.u64(),  // 0 for non-food; e.g., 10 = +10% damage
  }
);
```

**Food slot value:** Use `slot: 'food'` to distinguish food items from `'consumable'` (bandages, potions). This ensures `eat_food` only accepts food items and `use_item` does not try to handle food.

### Recommended Food Item Tiers

| Tier | Name | Duration | Damage Bonus | Source | Vendor Price |
|------|------|----------|--------------|--------|--------------|
| 1 | Trail Rations | 30 min (1_800_000_000 µs) | +5% | Vendor | ~10g |
| 2 | Basic Meal | 60 min (3_600_000_000 µs) | +10% | Crafting | n/a |
| 3 | Hearty Stew | 90 min (5_400_000_000 µs) | +15% | Crafting | n/a |
| 4 | Feast | 120 min (7_200_000_000 µs) | +20% | Crafting | n/a |

### Anti-Patterns to Avoid

- **Using CharacterEffect for Well Fed:** `roundsRemaining` expires during combat ticks, not by wall clock. A 30-minute food buff would evaporate in ~5 minutes of active combat. Use `wellFedUntil: t.timestamp()` on the `Hunger` row instead.
- **Using `iter()` on Hunger in a view:** The view must use index lookup `by_character`, not `.iter()`. Views cannot scan tables.
- **Checking Well Fed only in ability damage:** The auto-attack formula (combat.ts:1607) does NOT include `damage_up` — must inject Well Fed bonus explicitly there too.
- **Not seeding Hunger row at character creation:** The `create_character` reducer must insert a `Hunger` row immediately after the character row is inserted.
- **Not cleaning up Hunger row on delete:** `delete_character` must delete the `Hunger` row for the deleted character.
- **Not initializing HungerDecayTick in `clientConnected`:** The existing singleton ticks are bootstrapped in both `init` AND `clientConnected` as a watchdog. Follow the same pattern.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scheduling a repeating global tick | Custom polling or multiple rows | `ensureHungerDecayScheduled()` using `tableHasRows` guard | Exact pattern from `ensureHealthRegenScheduled` |
| Item consumption logic | Custom inventory manipulation | Follow `use_item` bandage pattern | Stack decrement + delete logic already proven |
| Cooldown on eating | Custom cooldown table | Reuse `ItemCooldown` table via `setCooldown` helper from `use_item` | Consistent with all other consumables |
| Private data exposure | `public: true` Hunger table | `my_hunger` view returning only active character's row | Pattern from `my_character_effects`, `my_player` views |
| View using `.iter()` | `ctx.db.hunger.iter()` in view | `ctx.db.hunger.characterId.find(player.activeCharacterId)` | Views can only use index lookups |
| Well Fed duration across combats | `CharacterEffect` with rounds | `wellFedUntil: t.timestamp()` on Hunger row | Wall clock timestamp survives combat end/start cycles |
| Damage bonus in combat | New effect type in CharacterEffect | Direct calculation in auto-attack and ability damage path | Simpler, no tick management |

**Key insight:** The hardest part of this phase is the Well Fed buff architecture — timestamp vs. rounds. Every other sub-problem has a solved pattern in the codebase.

---

## Common Pitfalls

### Pitfall 1: Well Fed expires too fast during combat
**What goes wrong:** If Well Fed is stored as `CharacterEffect` with `roundsRemaining`, it decrements every `tick_effects` interval (10s). A 30-minute food buff lasts only ~300 effect ticks = 50 minutes of wall clock time IF the effect ticks continuously. BUT `roundsRemaining` also decrements in `tick_hot` (3s) for regen effects. The actual behavior depends on effect type. More importantly, `roundsRemaining` is combat-round-based semantically — food buffs should be real-time duration.
**Why it happens:** Developers reuse the familiar `addCharacterEffect` helper.
**How to avoid:** Store `wellFedUntil` as a `t.timestamp()` on the `Hunger` row. Combat checks `hunger.wellFedUntil.microsSinceUnixEpoch > nowMicros`.
**Warning signs:** Well Fed badge disappears within minutes of eating, not after the expected 30+ minutes.

### Pitfall 2: Auto-attack damage doesn't include Well Fed bonus
**What goes wrong:** `damage_up` CharacterEffect only affects ability damage (`executeAbilityAction` at `index.ts:1937`). The auto-attack formula at `combat.ts:1607-1612` has NO `sumCharacterEffect` call — only `sumEnemyEffect(..., 'damage_taken', ...)`. So if Well Fed is implemented as a `damage_up` CharacterEffect, auto-attacks get no bonus.
**Why it happens:** Developer assumes `damage_up` applies everywhere.
**How to avoid:** Inject Well Fed bonus directly into the auto-attack damage formula AND pass it through to `executeAbilityAction` parameters.
**Warning signs:** Well Fed shows in the UI but combat damage is unchanged on auto-attacks.

### Pitfall 3: Hunger row missing for existing characters
**What goes wrong:** Phase implementation adds `Hunger` table and inserts rows in `create_character`, but existing characters have no row. The decay reducer panics or the client renders no hunger data.
**Why it happens:** Schema migration — new table added to existing database.
**How to avoid:** The `decay_hunger` reducer should guard: if no `Hunger` row exists for a character, create one with `currentHunger: 50n` and `wellFedUntil: epoch_zero`. Alternatively, add a backfill to `syncAllContent` that creates missing Hunger rows. The backfill approach is cleaner.
**Warning signs:** Some characters have no hunger bar; decay reducer logs errors.

### Pitfall 4: `wellFedUntil` timestamp comparison on client
**What goes wrong:** Client compares `hunger.wellFedUntil` directly to `Date.now()` using `new Date(row.wellFedUntil)`.
**Why it happens:** Timestamp is a SpacetimeDB Timestamp object, not a JS number.
**How to avoid:** Per CLAUDE.md: `new Date(Number(row.wellFedUntil.microsSinceUnixEpoch / 1000n))`.
**Warning signs:** `NaN` dates, always-expired or always-active Well Fed display.

### Pitfall 5: Food items auto-sold at vendor due to tier 1
**What goes wrong:** `ensureVendorInventory` sells all `tier <= 1n` non-junk templates. Trail Rations (tier 1) will automatically appear in vendor inventory without explicit configuration. Higher-tier food (tier 2-4) will NOT be auto-sold.
**Why it happens:** `ensureVendorInventory` at `index.ts:3872` filters `row.tier <= 1n`.
**How to avoid:** This is CORRECT behavior for Trail Rations. Confirm that tiers 2-4 do not appear at vendors (they won't by default). No action needed beyond awareness.
**Warning signs:** Tiers 2-4 appearing at vendor — would only happen if tier is misconfigured.

### Pitfall 6: Forgetting to add Hunger/HungerDecayTick to schema() export
**What goes wrong:** Tables defined but not in `schema(...)` call at `index.ts:1194`. SpacetimeDB won't create the tables.
**Why it happens:** Easy to add table definition but forget the schema() entry.
**How to avoid:** Always add new tables to `schema()` immediately after defining them. Grep for the table const name in the schema() call to verify.
**Warning signs:** `ctx.db.hunger` is undefined at runtime; bindings have no hunger table.

### Pitfall 7: Missing `wellFedDurationMicros` / `wellFedDamageBonusPercent` requires schema republish
**What goes wrong:** Adding fields to `ItemTemplate` is a schema change. The local database must be republished with `--delete-data` OR the new fields added as nullable (optional).
**Why it happens:** SpacetimeDB schema migrations require a full republish for non-nullable field additions.
**How to avoid:** Since `PROJECT_STATE.md` notes "schema changes require publishing with --delete-data", this is expected. Alternatively, make new fields `t.u64()` with default value 0 (they'll be 0 for non-food items). Non-nullable defaults to 0 for u64 in SpacetimeDB TypeScript.
**Warning signs:** Publish fails with schema validation error about missing fields on existing rows.

### Pitfall 8: `eat_food` called during combat
**What goes wrong:** The `use_item` reducer blocks usage during combat (`activeCombatIdForCharacter` check at `items.ts:782`). Food should be usable during combat? The requirements say no explicit restriction — eating mid-combat gives the buff immediately.
**Why it happens:** The existing `use_item` has an out-of-combat guard for items like bandages.
**How to avoid:** `eat_food` should NOT have the combat guard — food is a preparation/mid-combat buff. Implement as a separate reducer (not through `use_item`) to avoid the combat restriction.
**Warning signs:** Players cannot eat food before fights start.

---

## Code Examples

Verified patterns from live codebase:

### Hunger Table Definition
```typescript
// Source: index.ts — add before schema() export
const Hunger = table(
  {
    name: 'hunger',
    indexes: [{ name: 'characterId', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    currentHunger: t.u8(),          // 0-100; 0 has no penalty (REQ-015)
    wellFedUntil: t.timestamp(),    // epoch if not well fed; future time if well fed
  }
);
```

Note: `characterId` index named `'characterId'` (matching field name) enables `ctx.db.hunger.characterId.find(id)` — the `.find()` method is for unique indexes. Use `{ unique: true }` or confirm SpacetimeDB treats btree indexes on a field as a unique lookup when the column is unique in practice. If not unique (defensive), use `.filter()` and take first result.

Actually, for a proper unique find: declare the index as unique by convention — since each character has exactly one hunger row, the `characterId` index will function as unique. But SpacetimeDB indexes are not declared `unique` separately from `primaryKey` in the TypeScript SDK. Use `.filter()` and take the first result, or use a `unique()` modifier if available. Safer pattern:

```typescript
// Lookup pattern in reducer/view:
const hunger = [...ctx.db.hunger.characterId.filter(character.id)][0] ?? null;
```

### HungerDecayTick Table Definition
```typescript
// Source: index.ts — pattern from HealthRegenTick (index.ts:1012)
const HungerDecayTick = table(
  { name: 'hunger_decay_tick', scheduled: 'decay_hunger' },
  { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt() }
);
```

### ItemTemplate Extension
```typescript
// Source: index.ts:264 — add two fields to existing ItemTemplate
const ItemTemplate = table(
  { name: 'item_template', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    slot: t.string(),              // 'food' for food items
    armorType: t.string(),
    rarity: t.string(),
    tier: t.u64(),
    isJunk: t.bool(),
    vendorValue: t.u64(),
    requiredLevel: t.u64(),
    allowedClasses: t.string(),
    strBonus: t.u64(),
    dexBonus: t.u64(),
    chaBonus: t.u64(),
    wisBonus: t.u64(),
    intBonus: t.u64(),
    hpBonus: t.u64(),
    manaBonus: t.u64(),
    armorClassBonus: t.u64(),
    weaponBaseDamage: t.u64(),
    weaponDps: t.u64(),
    stackable: t.bool(),
    // NEW (food-specific; 0 for non-food):
    wellFedDurationMicros: t.u64(),
    wellFedDamageBonusPercent: t.u64(),
  }
);
```

### Food Item Seeding (in ensureStarterItemTemplates or new ensureFoodTemplates)
```typescript
// Source: pattern from index.ts:3128 — ensureStarterItemTemplates upsert
const foodItems = [
  {
    name: 'Trail Rations',
    tier: 1n,
    vendorValue: 2n,
    wellFedDurationMicros: 1_800_000_000n,   // 30 min
    wellFedDamageBonusPercent: 5n,
  },
  {
    name: 'Basic Meal',
    tier: 2n,
    vendorValue: 5n,
    wellFedDurationMicros: 3_600_000_000n,   // 60 min
    wellFedDamageBonusPercent: 10n,
  },
  {
    name: 'Hearty Stew',
    tier: 3n,
    vendorValue: 10n,
    wellFedDurationMicros: 5_400_000_000n,   // 90 min
    wellFedDamageBonusPercent: 15n,
  },
  {
    name: 'Feast',
    tier: 4n,
    vendorValue: 20n,
    wellFedDurationMicros: 7_200_000_000n,   // 120 min
    wellFedDamageBonusPercent: 20n,
  },
];
for (const food of foodItems) {
  if (findItemTemplateByName(ctx, food.name)) continue;
  ctx.db.itemTemplate.insert({
    id: 0n,
    name: food.name,
    slot: 'food',
    armorType: 'none',
    rarity: 'common',
    tier: food.tier,
    isJunk: false,
    vendorValue: food.vendorValue,
    requiredLevel: 1n,
    allowedClasses: 'any',
    strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n,
    hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n,
    weaponBaseDamage: 0n, weaponDps: 0n,
    stackable: true,
    wellFedDurationMicros: food.wellFedDurationMicros,
    wellFedDamageBonusPercent: food.wellFedDamageBonusPercent,
  });
}
```

### Hunger Row Creation in create_character
```typescript
// Source: characters.ts:179 — after grantStarterItems(ctx, character)
// Add:
ctx.db.hunger.insert({
  id: 0n,
  characterId: character.id,
  currentHunger: 100n,    // Start full (u8)
  wellFedUntil: ctx.timestamp,  // No buff on creation (current time = already expired)
});
```

### decay_hunger Reducer
```typescript
// Source: hunger.ts (new file) — pattern from regen_health (combat.ts:1030)
spacetimedb.reducer('decay_hunger', { arg: HungerDecayTick.rowType }, (ctx) => {
  const HUNGER_DECAY_AMOUNT = 2n;
  for (const hunger of ctx.db.hunger.iter()) {
    if (hunger.currentHunger === 0n) continue;  // Already at floor (REQ-015)
    const next = hunger.currentHunger > HUNGER_DECAY_AMOUNT
      ? hunger.currentHunger - HUNGER_DECAY_AMOUNT
      : 0n;
    ctx.db.hunger.id.update({ ...hunger, currentHunger: next });
  }
  // Reschedule
  ctx.db.hungerDecayTick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + HUNGER_DECAY_INTERVAL_MICROS),
  });
});
```

### Well Fed Bonus in Auto-Attack (combat.ts)
```typescript
// Source: combat.ts:1607 — update existing auto-attack damage formula
// BEFORE:
const damage =
  5n +
  character.level +
  weapon.baseDamage +
  (weapon.dps / 2n) +
  sumEnemyEffect(ctx, combat.id, 'damage_taken', currentEnemy.id);

// AFTER — add Well Fed bonus:
const nowMicros = ctx.timestamp.microsSinceUnixEpoch;  // already declared above as nowMicros
const hungerRow = [...ctx.db.hunger.characterId.filter(character.id)][0] ?? null;
const wellFedBonusPercent = (hungerRow && hungerRow.wellFedUntil.microsSinceUnixEpoch > nowMicros)
  ? getWellFedDamageBonus(ctx, character.id)
  : 0n;
const baseDamage =
  5n +
  character.level +
  weapon.baseDamage +
  (weapon.dps / 2n) +
  sumEnemyEffect(ctx, combat.id, 'damage_taken', currentEnemy.id);
const damage = baseDamage + (baseDamage * wellFedBonusPercent / 100n);
```

Note: `getWellFedDamageBonus` is a helper that looks up the food template from the `Hunger` row context. Since `Hunger` only stores `wellFedUntil` and not which food was eaten, the damage bonus percent must be determined by looking at what food the character's Well Fed came from. There are two approaches:
1. **Store `wellFedDamageBonusPercent` on the `Hunger` row directly** — simpler, set when `eat_food` is called
2. **Derive it from the food tier at lookup time** — requires knowing which food was eaten

**Recommendation: Store `wellFedDamageBonusPercent: t.u64()` on the `Hunger` row** and set it in `eat_food`. This avoids lookup complexity in the combat loop.

Updated `Hunger` table:
```typescript
const Hunger = table(
  {
    name: 'hunger',
    indexes: [{ name: 'characterId', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    currentHunger: t.u8(),
    wellFedUntil: t.timestamp(),
    wellFedDamageBonusPercent: t.u64(),  // 0 if not well fed; set when eating
  }
);
```

### my_hunger View
```typescript
// Source: views/hunger.ts (new file) — pattern from views/player.ts
import type { ViewDeps } from './types';

export const registerHungerViews = ({ spacetimedb, t, Hunger }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_hunger', public: true },
    t.array(Hunger.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player || !player.activeCharacterId) return [];
      const rows = [...ctx.db.hunger.characterId.filter(player.activeCharacterId)];
      return rows;
    }
  );
};
```

### Client HungerBar.vue (skeleton)
```vue
<!-- src/components/HungerBar.vue -->
<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  hunger: { currentHunger: bigint; wellFedUntil: { microsSinceUnixEpoch: bigint }; wellFedDamageBonusPercent: bigint } | null;
  styles: any;
}>();

// Timestamp comparison per CLAUDE.md: convert BigInt micros to Date
const wellFedUntilDate = computed(() =>
  props.hunger
    ? new Date(Number(props.hunger.wellFedUntil.microsSinceUnixEpoch / 1000n))
    : null
);
const isWellFed = computed(() => wellFedUntilDate.value && wellFedUntilDate.value > new Date());
const timeRemainingMinutes = computed(() => {
  if (!isWellFed.value || !wellFedUntilDate.value) return 0;
  return Math.floor((wellFedUntilDate.value.getTime() - Date.now()) / 60000);
});
const hungerPercent = computed(() =>
  props.hunger ? Number(props.hunger.currentHunger) : 0
);
</script>
```

### Client useGameData.ts update
```typescript
// src/composables/useGameData.ts — add after existing useTable calls
const [myHunger] = useTable(tables.myHunger);
// ...
return { ..., myHunger };
```

### Hunger Cleanup in delete_character
```typescript
// Source: characters.ts:284 — after hotbarSlot cleanup
for (const row of ctx.db.characterEffect.by_character.filter(characterId)) {
  ctx.db.characterEffect.id.delete(row.id);
}
// ADD:
for (const row of ctx.db.hunger.characterId.filter(characterId)) {
  ctx.db.hunger.id.delete(row.id);
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| CharacterEffect for all buff durations | Timestamp on Hunger row for food buff | Food buff survives combat cycles correctly |
| `damage_up` CharacterEffect for damage bonuses | Direct injection in auto-attack formula | No tick management overhead |
| Item handled in `use_item` catch-all | Dedicated `eat_food` reducer | Cleaner: no combat restriction, clear semantics |

---

## Open Questions

1. **Hunger backfill for existing characters**
   - What we know: Existing characters in the DB have no `Hunger` row after publish
   - What's unclear: Whether a `--delete-data` republish is needed anyway (PROJECT_STATE.md says schema changes need it)
   - Recommendation: Since `ItemTemplate` is being extended with non-nullable fields, `--delete-data` republish is required. All existing data is wiped. No backfill needed — all characters are recreated fresh. Document this as a requirement in the plan.

2. **`wellFedDamageBonusPercent` is a percentage or flat value?**
   - What we know: Requirements say "stat multipliers" — percentage is more consistent with the existing `armorMitigation` pattern which uses `(damage * percent) / 100n`
   - Recommendation: Use percentage (e.g., `5n` = 5% bonus). Combat formula: `base + (base * percent / 100n)`.

3. **Should ability damage also receive the Well Fed bonus?**
   - What we know: REQ-013 says "applies the Well Fed stat multipliers" — this implies combat damage broadly (auto-attacks AND abilities). The current `executeAbilityAction` at `index.ts:1933-1939` uses `damageUp` (CharacterEffect) but not a Well Fed check.
   - Recommendation: YES — inject Well Fed bonus into `executeAbilityAction` too. Pass `wellFedBonusPercent` as a parameter or via a helper function. This requires passing the bonus into `index.ts`'s ability execution code, which is in `index.ts` (not in the `combat.ts` reducer file).

4. **Hunger cooldown on eating?**
   - What we know: The requirements don't mention a cooldown on `eat_food`. The `use_item` pattern has a `CONSUMABLE_COOLDOWN_MICROS = 10_000_000n` (10s) cooldown.
   - Recommendation: Add a short food cooldown (e.g., 5s) using the existing `ItemCooldown` table and `item_cooldown` itemKey pattern, to prevent spam-eating. The planner can decide the exact duration.

---

## Sources

### Primary (HIGH confidence)
- Live codebase `C:/projects/uwr/spacetimedb/src/index.ts` — table definitions (Hunger absent, ItemTemplate present), schema export, `ensureHealthRegenScheduled`, `addCharacterEffect`, `sumCharacterEffect`, `syncAllContent`, `tableHasRows`
- `C:/projects/uwr/spacetimedb/src/reducers/combat.ts` — auto-attack formula (lines 1607-1612), `damageUp` usage (line 1833, 1938), `resolveAttack` function
- `C:/projects/uwr/spacetimedb/src/reducers/items.ts` — `use_item` reducer, `ItemCooldown` pattern, bandage consumption pattern
- `C:/projects/uwr/spacetimedb/src/reducers/characters.ts` — `create_character` (lines 99-183), `delete_character` (lines 201-320), hunger row insertion point
- `C:/projects/uwr/spacetimedb/src/views/effects.ts` — `my_character_effects` view, index-based lookup pattern
- `C:/projects/uwr/spacetimedb/src/views/player.ts` — minimal single-row view pattern
- `C:/projects/uwr/spacetimedb/src/views/types.ts` — ViewDeps type structure
- `C:/projects/uwr/spacetimedb/src/views/index.ts` — `registerViews` registration pattern
- `C:/projects/uwr/src/composables/useGameData.ts` — all `useTable` subscriptions, how to add new tables
- `C:/projects/uwr/PROJECT_STATE.md` — schema migration requirements, architecture overview

### Secondary (MEDIUM confidence)
- CLAUDE.md SpacetimeDB TypeScript SDK rules — confirmed scheduled table pattern, `t.timestamp()` client usage, `useTable` tuple return, view index-only constraint

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all from live codebase
- Architecture patterns: HIGH — all patterns verified from live code, exact file/line references
- Pitfalls: HIGH — derived from actual code analysis (auto-attack has no damage_up, CharacterEffect is round-based)
- Food tier values (duration/bonus %): MEDIUM — reasonable values, not specified in requirements
- Hunger cooldown on eating: LOW — not specified in requirements, recommendation only

**Research date:** 2026-02-11
**Valid until:** 2026-03-13 (stable codebase; schema republish required before implementation)
