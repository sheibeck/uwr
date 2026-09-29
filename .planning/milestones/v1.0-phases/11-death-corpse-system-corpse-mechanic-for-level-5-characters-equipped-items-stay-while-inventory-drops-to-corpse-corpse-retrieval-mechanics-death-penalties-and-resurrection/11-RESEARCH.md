# Phase 11: Death & Corpse System - Research

**Researched:** 2026-02-14
**Domain:** Death mechanics, corpse management, item persistence
**Confidence:** HIGH

## Summary

Death and corpse mechanics are foundational MMORPG systems that balance player consequence against retention. Historical games like EverQuest used harsh penalties (XP loss, corpse retrieval with time limits, full item loss risk) while modern MMOs favor lighter penalties (durability loss, spirit walks, minimal time investment).

This game already has a level-based death penalty threshold at level 5+ (5% XP loss within current level), respawn mechanics to bind points, and full combat/healing systems. The phase 11 goal is to add corpse persistence for inventory items while keeping equipped gear on the character, creating a moderate-penalty system that encourages risk awareness without creating excessive frustration.

**Primary recommendation:** Implement a WoW-inspired ghost walk system where players respawn at their bind point as a ghost, run back to retrieve their corpse containing inventory items (not equipped gear), with no time limits to reduce frustration. Add resurrection as a Cleric ability that prevents corpse creation if cast in time.

## Standard Stack

### Core (Existing)
| Component | Location | Purpose | Why Standard |
|-----------|----------|---------|--------------|
| Character table | `spacetimedb/src/schema/tables.ts` | Stores hp, boundLocationId | Already tracks death state (hp === 0n) |
| ItemInstance table | Already defined | Tracks ownerCharacterId, equippedSlot | Supports item transfer to corpse |
| Respawn reducer | `reducers/characters.ts` | Respawns at bind point with 1hp | Foundation for death flow |
| Death XP penalty | `helpers/combat.ts` | 5% loss if level > 5 | Already implements level threshold |
| AbilityTemplate | `schema/tables.ts` | Class-based abilities | Can add resurrection ability |

### New Components Required
| Component | Type | Purpose | Implementation |
|-----------|------|---------|----------------|
| Corpse table | Public table | Store corpse location, timestamp | New table with characterId index |
| CorpseItem table | Public table | Track items in corpse inventory | Links to corpse, references ItemInstance |
| Ghost state | Character field | Indicate spirit form | Add `isGhost: t.bool()` to Character |
| Resurrect ability | AbilityTemplate entry | Cleric spell to prevent corpse | Add to ability_catalog.ts |
| Retrieve corpse reducer | Reducer | Transfer items back to character | New reducer for proximity-based retrieval |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ScheduleAt | spacetimedb | Optional corpse decay timers | If implementing auto-cleanup |
| Timestamp | spacetimedb | Track corpse creation time | Display corpse age to player |

## Architecture Patterns

### Recommended Project Structure
```
spacetimedb/src/
├── schema/
│   └── tables.ts                 # Add Corpse, CorpseItem tables
├── reducers/
│   ├── characters.ts             # Modify respawn flow, add ghost state
│   ├── combat.ts                 # Trigger corpse creation on death
│   └── corpse.ts                 # NEW: retrieve_corpse, summon_corpse reducers
├── data/
│   └── ability_catalog.ts        # Add cleric_resurrect ability
└── helpers/
    └── corpse.ts                 # NEW: createCorpse, transferItemsToCorpse
```

### Pattern 1: Level-Gated Death Consequences

**What:** Different death outcomes based on character level threshold.

**When to use:** Reduce penalty for new players learning the game.

**Current implementation (existing):**
```typescript
// From helpers/combat.ts
export function applyDeathXpPenalty(ctx: any, character: any) {
  if (character.level <= 5n) return 0n;  // No penalty for levels 1-5
  const currentLevelFloor = xpRequiredForLevel(character.level);
  if (character.xp <= currentLevelFloor) return 0n;
  const progress = character.xp - currentLevelFloor;
  const loss = (progress * 5n) / 100n;  // 5% of current level progress
  // ... clamp to prevent de-leveling
  return loss;
}
```

**Extend for corpse mechanics:**
```typescript
function shouldCreateCorpse(character: any): boolean {
  return character.level > 5n;  // Levels 1-5: no corpse, just respawn
}
```

### Pattern 2: Equipped vs Inventory Item Handling

**What:** Separate treatment for equipped gear (stays on character) vs inventory items (drops to corpse).

**When to use:** Balance consequence (inventory loss risk) against accessibility (can still fight/survive after respawn).

**Example:**
```typescript
function createCorpse(ctx: any, character: any) {
  if (character.level <= 5n) return;  // No corpse for low levels

  const corpse = ctx.db.corpse.insert({
    id: 0n,
    characterId: character.id,
    locationId: character.locationId,  // Where they died
    createdAt: ctx.timestamp,
  });

  // Transfer only NON-EQUIPPED inventory items to corpse
  for (const item of ctx.db.itemInstance.by_owner.filter(character.id)) {
    if (!item.equippedSlot) {  // Not equipped = drops to corpse
      ctx.db.corpseItem.insert({
        id: 0n,
        corpseId: corpse.id,
        itemInstanceId: item.id,
      });
      // Don't delete item - just link it to corpse, update owner later
    }
    // Equipped items (item.equippedSlot !== null) stay with character
  }
}
```

### Pattern 3: Ghost Walk for Corpse Retrieval

**What:** Upon death, character respawns as a ghost at bind point and must travel to corpse location.

**When to use:** Classic MMO mechanic providing time penalty without harsh item loss.

**Example flow:**
```typescript
// On death (in combat reducer when hp reaches 0)
function onCharacterDeath(ctx: any, character: any) {
  createCorpse(ctx, character);  // Create corpse at death location
  // Character will respawn as ghost via respawn_character reducer
}

// Modified respawn reducer
spacetimedb.reducer('respawn_character', { characterId: t.u64() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  if (character.hp > 0n) return;

  const hasCorpse = !!ctx.db.corpse.by_character.find(character.id);

  ctx.db.character.id.update({
    ...character,
    locationId: character.boundLocationId,  // Respawn at bind point
    hp: 1n,
    mana: character.maxMana > 0n ? 1n : 0n,
    isGhost: hasCorpse,  // Ghost if corpse exists, normal if not
  });

  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
    hasCorpse
      ? 'You awaken as a ghost. Return to your corpse to reclaim your belongings.'
      : 'You awaken at your bind point, shaken but alive.'
  );
});

// Retrieve corpse reducer (new)
spacetimedb.reducer('retrieve_corpse', { characterId: t.u64() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  if (!character.isGhost) throw new SenderError('You are not a ghost');

  const corpse = ctx.db.corpse.by_character.find(character.id);
  if (!corpse) throw new SenderError('No corpse found');

  // Proximity check
  if (character.locationId !== corpse.locationId) {
    throw new SenderError('You must be at your corpse location to retrieve it');
  }

  // Transfer items back to character inventory
  for (const corpseItem of ctx.db.corpseItem.by_corpse.filter(corpse.id)) {
    const item = ctx.db.itemInstance.id.find(corpseItem.itemInstanceId);
    if (item) {
      // Item already has ownerCharacterId, just remove from corpse
      ctx.db.corpseItem.id.delete(corpseItem.id);
    }
  }

  // Remove ghost state and corpse
  ctx.db.corpse.id.delete(corpse.id);
  ctx.db.character.id.update({ ...character, isGhost: false });

  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
    'You reclaim your belongings and return to the living.'
  );
});
```

### Pattern 4: Resurrection Prevents Corpse Creation

**What:** Healer resurrection ability that restores HP before corpse is created.

**When to use:** Reward group coordination, reduce death penalty for organized groups.

**Example:**
```typescript
// Add to ability_catalog.ts
cleric_resurrect: {
  name: 'Resurrect',
  description: 'Channels divine power to restore life to a fallen ally.',
  className: 'cleric',
  resource: 'mana',
  level: 6n,  // Higher level spell
  power: 0n,  // Not damage-based
  cooldownSeconds: 600n,  // 10 minute cooldown
  castSeconds: 6n,  // Long cast time
  damageType: 'none' as DamageType,
}

// In cast completion logic (combat reducer)
if (ability.kind === 'resurrect') {
  const target = ctx.db.character.id.find(cast.targetCharacterId);
  if (target.hp > 0n) {
    appendPrivateEvent(ctx, caster.id, caster.ownerUserId, 'combat',
      'Target is not dead.');
    continue;
  }

  // Check if corpse exists (too late to resurrect if retrieved)
  const corpse = ctx.db.corpse.by_character.find(target.id);
  if (!corpse) {
    appendPrivateEvent(ctx, caster.id, caster.ownerUserId, 'combat',
      'Target has no corpse to resurrect.');
    continue;
  }

  // Proximity check
  if (caster.locationId !== target.locationId) {
    throw new SenderError('Target is too far away');
  }

  // Restore to life, prevent corpse mechanics
  ctx.db.character.id.update({
    ...target,
    hp: target.maxHp / 2n,  // 50% health
    mana: target.maxMana / 2n,
    isGhost: false,
  });

  // Remove corpse and its items
  for (const corpseItem of ctx.db.corpseItem.by_corpse.filter(corpse.id)) {
    ctx.db.corpseItem.id.delete(corpseItem.id);
  }
  ctx.db.corpse.id.delete(corpse.id);

  appendPrivateEvent(ctx, target.id, target.ownerUserId, 'combat',
    `${caster.name} resurrects you!`);
}
```

### Anti-Patterns to Avoid

- **Time-limited corpses:** Modern players expect access to their items. EverQuest's 7-day timer created stress without gameplay value. Avoid expiration timers unless implementing graceful fallback (auto-summon to bind point).
- **Multiple simultaneous corpses:** Dying before retrieving previous corpse creates inventory management nightmare. Merge items into single corpse or auto-retrieve previous corpse on new death.
- **Full inventory blocking retrieval:** If player filled inventory at bind point, they can't retrieve corpse items. Implement overflow handling or force-clear inventory on retrieve.
- **Currency in corpse:** Gold/currency loss on death feels punitive without strategic value. Keep currency on character, only transfer inventory items.
- **Re-equipping tedium:** Don't drop equipped items unless implementing auto-re-equip on retrieval. Manual re-slotting of 8+ gear pieces creates frustration.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Item ownership transfer | Custom item movement logic | ItemInstance.ownerCharacterId + CorpseItem linking table | Preserves item identity, supports stacking, prevents duplication |
| Ghost movement speed | Custom movement multiplier | Character status field + client-side rendering | Server tracks state, client handles visual feedback |
| Corpse decay timers | Manual timestamp checking | ScheduledTable (if needed) | SpacetimeDB handles scheduled execution |
| Proximity detection | Complex distance calculation | locationId equality check | Game already uses discrete locations |
| Resurrection time window | Custom timer tracking | Combat state + corpse existence check | Corpse presence indicates rez availability |

**Key insight:** This game uses location-based positioning (locationId), not continuous coordinates. Proximity checks are simple equality comparisons, not distance calculations. Corpse retrieval is "in same location" not "within X meters."

## Common Pitfalls

### Pitfall 1: Corpse Created Before Respawn

**What goes wrong:** Player dies, corpse is created immediately, but respawn_character hasn't been called yet. UI shows conflicting state.

**Why it happens:** Death (hp = 0) and respawn are separate reducer calls.

**How to avoid:**
- Corpse creation is non-blocking (happens in background)
- Respawn reducer checks for corpse existence to set isGhost flag
- Client UI handles dead (hp=0) vs ghost (hp>0 && isGhost) states separately

**Warning signs:** Players report "I'm alive but can't do anything" or "corpse disappeared."

### Pitfall 2: Items in Limbo After Corpse Deletion

**What goes wrong:** Corpse is deleted (retrieved, despawned, etc.) but CorpseItem entries remain, orphaning items.

**Why it happens:** Cascade deletion not implemented, forgot to clean up linking table.

**How to avoid:**
```typescript
// ALWAYS delete CorpseItem entries before deleting Corpse
for (const corpseItem of ctx.db.corpseItem.by_corpse.filter(corpse.id)) {
  ctx.db.corpseItem.id.delete(corpseItem.id);
}
ctx.db.corpse.id.delete(corpse.id);
```

**Warning signs:** Items missing from inventory, CorpseItem table grows unbounded.

### Pitfall 3: Resurrection During Active Combat

**What goes wrong:** Player resurrects during combat, creating inconsistent combat state (participant marked dead but character alive).

**Why it happens:** Resurrection doesn't update CombatParticipant.status.

**How to avoid:**
```typescript
// After resurrecting character
const participant = ctx.db.combatParticipant.by_character.find(target.id);
if (participant && participant.status === 'dead') {
  ctx.db.combatParticipant.id.update({ ...participant, status: 'active' });

  // Consider: Should resurrected player re-enter combat or be safe?
  // Option A: Back in combat (update status to 'active')
  // Option B: Remove from combat (delete participant)
}
```

**Warning signs:** Resurrected player can't act in combat, combat won't end despite all players alive.

### Pitfall 4: Multiple Corpses From Repeated Deaths

**What goes wrong:** Player dies, respawns as ghost, dies again before retrieving corpse, creating second corpse. Items split across corpses.

**Why it happens:** No check for existing corpse before creating new one.

**How to avoid:**
```typescript
function createCorpse(ctx: any, character: any) {
  if (character.level <= 5n) return;

  // Check for existing corpse
  const existingCorpse = [...ctx.db.corpse.by_character.filter(character.id)][0];
  if (existingCorpse) {
    // Option A: Merge into existing (move to new death location)
    ctx.db.corpse.id.update({
      ...existingCorpse,
      locationId: character.locationId,  // Update to new death location
      createdAt: ctx.timestamp,  // Refresh timestamp
    });
    // Items already in corpse, add new items
  } else {
    // Option B: Create new corpse (simpler, but can have multiple)
    const corpse = ctx.db.corpse.insert({ /* ... */ });
  }

  // Transfer inventory items...
}
```

**Warning signs:** Players report "some items at old corpse, some at new corpse."

### Pitfall 5: Ghost Can Die Again

**What goes wrong:** Ghost character has 1hp, takes environmental damage or enters combat, dies again while dead.

**Why it happens:** Ghost state doesn't prevent damage or combat.

**How to avoid:**
- Ghost characters should be immune to damage (check isGhost in damage application)
- OR ghosts cannot enter combat (check isGhost in start_combat)
- OR ghosts have invulnerability flag

**Warning signs:** "I died while running back to my corpse."

### Pitfall 6: Inventory Overflow on Retrieval

**What goes wrong:** Corpse has 20 items, player picked up 15 items at bind point, inventory can't fit all corpse items.

**Why it happens:** No capacity check before retrieval.

**How to avoid:**
```typescript
// In retrieve_corpse reducer
const corpseItems = [...ctx.db.corpseItem.by_corpse.filter(corpse.id)];
const currentInventory = [...ctx.db.itemInstance.by_owner.filter(character.id)]
  .filter(item => !item.equippedSlot);

const MAX_INVENTORY_SIZE = 40n;  // Example limit
const totalItems = BigInt(corpseItems.length) + BigInt(currentInventory.length);

if (totalItems > MAX_INVENTORY_SIZE) {
  throw new SenderError('Inventory full. Drop items before retrieving corpse.');
}

// OR: Auto-drop items to ground as loot
// OR: Force-retrieve (exceeding limit temporarily)
```

**Warning signs:** Items disappear after corpse retrieval.

## Code Examples

### Corpse Table Definition
```typescript
// In schema/tables.ts
export const Corpse = table(
  {
    name: 'corpse',
    public: true,
    indexes: [
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { name: 'by_location', algorithm: 'btree', columns: ['locationId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    locationId: t.u64(),
    createdAt: t.timestamp(),
  }
);

export const CorpseItem = table(
  {
    name: 'corpse_item',
    public: true,
    indexes: [
      { name: 'by_corpse', algorithm: 'btree', columns: ['corpseId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    corpseId: t.u64(),
    itemInstanceId: t.u64(),  // Reference to ItemInstance
  }
);
```

### Character Schema Update
```typescript
// Modify Character table in schema/tables.ts
export const Character = table(
  { /* existing config */ },
  {
    // ... existing fields ...
    hp: t.u64(),
    maxHp: t.u64(),
    // ... existing fields ...
    isGhost: t.bool(),  // ADD THIS FIELD
  }
);
```

### Corpse Creation Helper
```typescript
// In helpers/corpse.ts (new file)
export function createCorpse(ctx: any, character: any) {
  if (character.level <= 5n) {
    // Low level characters don't create corpses
    return null;
  }

  // Check for existing corpse - merge strategy
  const existing = [...ctx.db.corpse.by_character.filter(character.id)][0];

  let corpse;
  if (existing) {
    // Update existing corpse to new death location
    corpse = existing;
    ctx.db.corpse.id.update({
      ...existing,
      locationId: character.locationId,
      createdAt: ctx.timestamp,
    });
  } else {
    // Create new corpse
    corpse = ctx.db.corpse.insert({
      id: 0n,
      characterId: character.id,
      locationId: character.locationId,
      createdAt: ctx.timestamp,
    });
  }

  // Transfer inventory items (not equipped) to corpse
  for (const item of ctx.db.itemInstance.by_owner.filter(character.id)) {
    if (item.equippedSlot) {
      // Equipped items stay with character
      continue;
    }

    // Check if already in corpse (for existing corpse merge)
    const alreadyInCorpse = [...ctx.db.corpseItem.by_corpse.filter(corpse.id)]
      .some(ci => ci.itemInstanceId === item.id);

    if (!alreadyInCorpse) {
      ctx.db.corpseItem.insert({
        id: 0n,
        corpseId: corpse.id,
        itemInstanceId: item.id,
      });
    }
  }

  return corpse;
}

export function retrieveCorpse(ctx: any, character: any, corpse: any) {
  // Transfer items back to character
  for (const corpseItem of ctx.db.corpseItem.by_corpse.filter(corpse.id)) {
    // Item ownership already set to characterId, just remove from corpse
    ctx.db.corpseItem.id.delete(corpseItem.id);
  }

  // Clean up corpse
  ctx.db.corpse.id.delete(corpse.id);

  // Remove ghost state
  ctx.db.character.id.update({ ...character, isGhost: false });
}
```

### Modified Death Flow in Combat
```typescript
// In reducers/combat.ts, modify markParticipantDead or equivalent
import { createCorpse } from '../helpers/corpse';

function markParticipantDead(ctx: any, participant: any, character: any, killerName: string) {
  const current = ctx.db.combatParticipant.id.find(participant.id);
  if (!current || current.status === 'dead') return;

  ctx.db.combatParticipant.id.update({ ...participant, status: 'dead' });
  clearCharacterEffectsOnDeath(ctx, character);

  // CREATE CORPSE HERE
  createCorpse(ctx, character);

  logPrivateAndGroup(
    ctx,
    character,
    'combat',
    `You have died. Killed by ${killerName}.`
  );

  // ... rest of death handling
}
```

### Retrieve Corpse Reducer
```typescript
// In reducers/corpse.ts (new file)
export const registerCorpseReducers = (deps: any) => {
  const { spacetimedb, t, SenderError, requireCharacterOwnedBy, appendPrivateEvent } = deps;

  spacetimedb.reducer('retrieve_corpse', { characterId: t.u64() }, (ctx, { characterId }) => {
    const character = requireCharacterOwnedBy(ctx, characterId);

    if (!character.isGhost) {
      throw new SenderError('You are not a ghost.');
    }

    const corpse = [...ctx.db.corpse.by_character.filter(character.id)][0];
    if (!corpse) {
      throw new SenderError('No corpse found.');
    }

    // Proximity check
    if (character.locationId !== corpse.locationId) {
      const corpseLocation = ctx.db.location.id.find(corpse.locationId);
      throw new SenderError(
        `Your corpse is at ${corpseLocation?.name ?? 'unknown location'}.`
      );
    }

    // Inventory capacity check (optional)
    const corpseItemCount = [...ctx.db.corpseItem.by_corpse.filter(corpse.id)].length;
    const currentInventory = [...ctx.db.itemInstance.by_owner.filter(character.id)]
      .filter(item => !item.equippedSlot).length;
    const MAX_INVENTORY = 50;  // Example

    if (corpseItemCount + currentInventory > MAX_INVENTORY) {
      throw new SenderError('Inventory full. Drop items before retrieving corpse.');
    }

    // Transfer items back
    for (const corpseItem of ctx.db.corpseItem.by_corpse.filter(corpse.id)) {
      ctx.db.corpseItem.id.delete(corpseItem.id);
    }

    // Clean up
    ctx.db.corpse.id.delete(corpse.id);
    ctx.db.character.id.update({ ...character, isGhost: false });

    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      'You reclaim your belongings and return to the living.'
    );
  });

  // Optional: Summon corpse (bind point stone feature)
  spacetimedb.reducer('summon_corpse', { characterId: t.u64() }, (ctx, { characterId }) => {
    const character = requireCharacterOwnedBy(ctx, characterId);

    if (!character.isGhost) {
      throw new SenderError('You are not a ghost.');
    }

    const location = ctx.db.location.id.find(character.locationId);
    if (!location?.bindStone) {
      throw new SenderError('You must be at a bind stone to summon your corpse.');
    }

    const corpse = [...ctx.db.corpse.by_character.filter(character.id)][0];
    if (!corpse) {
      throw new SenderError('No corpse to summon.');
    }

    // Move corpse to character location (quality of life feature)
    ctx.db.corpse.id.update({ ...corpse, locationId: character.locationId });

    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      'Your corpse materializes before you.'
    );
  });
};
```

### Resurrection Ability
```typescript
// In data/ability_catalog.ts
export const ABILITIES = {
  // ... existing abilities ...

  cleric_resurrect: {
    name: 'Resurrect',
    description: 'Channels divine power to restore life to a fallen ally, returning them to 50% health and mana.',
    className: 'cleric',
    resource: 'mana',
    level: 6n,
    power: 0n,  // Not damage-based
    cooldownSeconds: 600n,  // 10 minute cooldown
    castSeconds: 6n,  // Long cast, interruptible
    damageType: 'none' as DamageType,
  },
};

// In combat reducer, cast completion section
// Add resurrection logic similar to healing, but:
// 1. Target must have hp === 0
// 2. Target must have corpse (corpse existence check)
// 3. Caster must be in same location as corpse
// 4. Restores to 50% hp/mana, removes isGhost, deletes corpse
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Full item loss on death (Ultima Online) | Keep equipped, drop inventory (this implementation) | Mid-2000s | Reduced frustration while maintaining consequence |
| Time-limited corpses (EverQuest 7 day) | Permanent corpses or auto-summon | WoW era (2004+) | Players don't lose items due to real-life obligations |
| XP de-leveling on death | XP loss within current level only | Modern MMOs | Prevents regression, maintains progression feel |
| Corpse runs required for all deaths | Threshold-based (level 5+) | Modern design | New players protected during learning phase |
| In-combat resurrection rare | Class-defined resurrection abilities | WoW+ | Rewards healer classes, encourages group play |
| Ghost speed = normal speed | Ghost speed 125-150% of normal | WoW (2004) | Reduces time penalty, respects player time |

**Deprecated/outdated:**
- **Body camping:** Enemies camping corpses preventing retrieval. Modern games use safe ghost forms.
- **Corpse summoning NPCs:** Paid services to retrieve corpses. Replaced by in-game mechanics.
- **Permanent item loss:** Full inventory wipe. Considered too harsh for retention.
- **Random respawn points:** Modern games use bind points/graveyards for predictability.

## Open Questions

1. **Should ghosts be visible to other players?**
   - What we know: WoW ghosts are translucent and visible to living players
   - What's unclear: Gameplay impact of ghost visibility/invisibility in this game
   - Recommendation: Make ghosts visible but translucent (client-side rendering based on isGhost flag). Allows coordination ("I see your corpse, head north") without mechanical advantage.

2. **Currency (gold) handling on death?**
   - What we know: Character table has `gold` field, game already has currency
   - What's unclear: Should gold drop to corpse or stay on character?
   - Recommendation: Keep gold on character. Gold loss feels punitive without strategic depth. Focus penalty on inventory item retrieval.

3. **Can ghosts be attacked or enter combat?**
   - What we know: Ghost has 1hp after respawn, technically vulnerable
   - What's unclear: Should ghosts be immune or vulnerable?
   - Recommendation: Ghosts should be immune to damage and unable to initiate combat. Check `isGhost` in combat start and damage application. Prevents death spiral (dying while retrieving corpse).

4. **How to handle group members when one dies?**
   - What we know: Game has group system, combat can involve groups
   - What's unclear: Does ghost stay in group? Can ghost follow group leader?
   - Recommendation: Ghost remains in group but cannot participate in combat. Group can see ghost location to coordinate corpse retrieval. Consider resurrection as group utility.

5. **Should there be a corpse summon feature?**
   - What we know: Bind points (bindStone locations) exist in game
   - What's unclear: Quality of life vs consequence balance
   - Recommendation: Add `summon_corpse` reducer usable at bind stones. Allows retrieval without long corpse run, but requires returning to safe area first. Balances accessibility with some inconvenience.

6. **What happens if player logs out as ghost?**
   - What we know: Character state persists across sessions
   - What's unclear: Should ghost state persist or auto-resolve?
   - Recommendation: Ghost state persists. Player logs back in as ghost at bind point, corpse still at death location. Prevents exploiting logout to avoid corpse retrieval.

7. **Resurrection in vs out of combat?**
   - What we know: Combat system distinguishes active combat from resolved combat
   - What's unclear: Can cleric resurrect during active combat?
   - Recommendation: Allow resurrection during combat (battle resurrection) but with long cast time (6s) that can be interrupted. Rewards skilled play and coordination. Consider adding combat participant status update after resurrection.

## Sources

### Primary (HIGH confidence)
- Current game codebase (C:/projects/uwr/spacetimedb/src)
  - `reducers/characters.ts` - Existing respawn_character reducer
  - `reducers/combat.ts` - Death mechanics, markParticipantDead function
  - `helpers/combat.ts` - applyDeathXpPenalty (level 5+ threshold, 5% loss)
  - `schema/tables.ts` - Character, ItemInstance, Location tables
  - `data/ability_catalog.ts` - Cleric abilities (no resurrection yet)
- SpacetimeDB TypeScript documentation (CLAUDE.md)

### Secondary (MEDIUM confidence)
- [Massively Overpowered: What should MMO corpse runs look like in 2025?](https://massivelyop.com/2025/03/06/massively-overthinking-what-should-mmo-corpse-runs-look-like-in-2025/) - Modern corpse run perspectives
- [Massively Overpowered: Perfect Ten - The big book of MMORPG death mechanics](https://massivelyop.com/2018/09/26/perfect-ten-the-big-book-of-mmorpg-death-mechanics/) - Comprehensive death mechanics survey
- [Massively Overpowered: Guide to MMORPG death penalties](https://massivelyop.com/2016/03/05/massively-ops-guide-to-death-penalties/) - Death penalty taxonomy
- [Wolfshead Online: Death Penalty Mechanic and Loss Aversion in MMO Design](https://wolfsheadonline.com/the-death-penalty-mechanic-and-loss-aversion-in-mmo-design/) - Design psychology
- [WoW Wiki: Corpse Running](https://wowwiki-archive.fandom.com/wiki/Corpse_running) - WoW ghost walk mechanics
- [WoW Wiki: Death](https://vanilla-wow-archive.fandom.com/wiki/Death) - Death flow and respawn
- [Almar's Guides: EverQuest Death](https://www.almarsguides.com/eq/general/death.cfm) - EverQuest corpse mechanics
- [Wowpedia: Resurrect](https://wowpedia.fandom.com/wiki/Resurrect) - Resurrection spell mechanics
- [WoW Rookie: Method in the madness of resurrection](https://www.engadget.com/2010-05-27-wow-rookie-the-method-in-the-madness-of-resurrection.html) - Resurrection strategies
- [Dot Esports: All classes with battle resurrection in WoW](https://dotesports.com/wow/news/all-classes-with-a-battle-resurrection-ability-in-world-of-warcraft) - Battle res mechanics
- [Path of Exile Wiki: Experience](https://www.poewiki.net/wiki/Experience) - Level-based death penalties
- [Game8: Path of Exile 2 Death Penalty](https://game8.co/games/Path-of-Exile-2/archives/494914) - Modern death penalty implementation
- [Wowpedia: Graveyard](https://wowpedia.fandom.com/wiki/Graveyard) - Bind point respawn mechanics

### Tertiary (LOW confidence)
- MMO forums and community discussions (marked for validation, not used as primary source)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Based on existing codebase examination
- Architecture: HIGH - Patterns drawn from current implementation + verified historical MMO mechanics
- Pitfalls: MEDIUM-HIGH - Some pitfalls verified in codebase, others extrapolated from standard corpse mechanics
- Code examples: HIGH - Based on existing code patterns in this codebase

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (30 days - death mechanics are stable design pattern)
