# Phase 21: Race Expansion - Research

**Researched:** 2026-02-18
**Domain:** SpacetimeDB schema migration, race data model, level-up stat computation, admin command pattern, character creation UI
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Dual-bonus system:**
- Exactly 2 bonuses per race — no more, no fewer
- Expanded bonus pool — not limited to stat points; includes:
  - +1 to a specific stat (STR, DEX, INT, WIS, CON, CHA)
  - Bonus spell damage (flat)
  - Bonus physical damage (flat)
  - Bonus max mana
  - Bonus mana regen (per regen tick)
  - Bonus max HP
  - Bonus stamina regen (per tick)
  - Bonus crit chance (flat %)
  - Bonus armor (flat)
- Race table schema change: Replace the 5 individual stat columns with a flexible `bonus1Type`/`bonus1Value`/`bonus2Type`/`bonus2Value` structure

**Balance philosophy:**
- Asymmetric by design — races are NOT required to be equivalent in power
- Scale: Small, flavor-level numbers (+1 stat, +1-2 flat damage, +5-10 max HP/mana)

**Starter race dual-bonus upgrades:**
- Human: +1 CHA + bonus stamina regen
- Eldrin: bonus spell damage + bonus max mana
- Ironclad: bonus physical damage + bonus armor
- Wyldfang: bonus crit chance + +1 DEX

**New races (11 total):**
- Goblin (unlocked): bonus magic damage + bonus mana regen
- Troll (unlocked): bonus max HP + bonus physical damage
- Dwarf (unlocked): bonus max HP + bonus physical damage
- Gnome (unlocked): bonus mana regen + bonus max mana
- Halfling (unlocked): bonus crit chance + bonus evasion/dodge
- Half-Elf (unlocked): +1 to two different stats (versatile)
- Orc (unlocked): bonus physical damage + bonus max HP
- Dark-Elf (locked): bonus spell damage + bonus mana regen
- Half-Giant (locked): bonus max HP + bonus physical damage
- Cyclops (locked): bonus physical damage + bonus armor
- Satyr (locked): bonus spell damage + bonus stamina regen

**Even-level stacking mechanic:**
- Level 1: racial bonuses applied at character creation
- Even levels (2, 4, 6, 8, 10...): racial bonuses re-applied again (stacking)
- Odd levels: class abilities only
- Stacking model: Diminishing returns / percentage-based scaling — NOT flat additive
- Bug fix included: Current level-up code silently drops racial bonuses

**Level-up feedback:**
- Visible notification when racial bonus re-applies at even level

**Locked race visibility:**
- Completely hidden — NOT shown with lock icon, fully invisible until unlocked

**Locked race unlock mechanism:**
- Admin command: `/unlockrace <name>` sets `Race.unlocked = true` globally
- Global unlock — one-way door, permanent
- World broadcast fires on unlock
- No per-player unlock

### Claude's Discretion
- Specific bonus values for each race (magnitude of flat bonuses)
- Diminishing returns formula for even-level stacking
- Exact wording of level-up racial bonus notification
- Exact wording of unlock broadcast messages
- Race `availableClasses` restrictions for new races
- Race descriptions and flavor text

### Deferred Ideas (OUT OF SCOPE)
- Percentage-scaling formula for levels 11-50
- Race-restricted classes for new races (new races default to unrestricted)
- Per-player race unlock
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RACE-EXP-01 | At least 11 new races added to RACE_DATA with unlocked/locked status and two distinct bonuses each | `races.ts` RACE_DATA array is the sole data source; `ensureRaces` upserts into the Race table via `syncAllContent`. Adding 11 entries to RACE_DATA + running `/synccontent` is the complete path. |
| RACE-EXP-02 | All 4 existing starter races upgraded to dual-bonus system | Requires schema migration: drop 5 old stat bonus columns, add 4 new columns (`bonus1Type`, `bonus1Value`, `bonus2Type`, `bonus2Value`). Needs `--clear-database` publish. Update `RACE_DATA` array and `create_character` reducer to apply new bonus model. |
| RACE-EXP-03 | Level-up racial bonus mechanic implemented — even-level hook re-applies racial bonuses | `awardXp` in `helpers/combat.ts` is the single level-up path (lines 1899-1938). Currently calls `computeBaseStats` then directly updates character stats, dropping race. Fix requires looking up the Race row by `character.race` (string name), then re-applying racial bonus at even levels. Also `level_character` admin command in `commands.ts` (lines 505-549) has the same bug. |
| RACE-EXP-04 | Locked races completely hidden in character creation UI; `/unlockrace` admin command with world broadcast | UI: `CharacterPanel.vue` already uses `unlockedRaces` computed (filters `r.unlocked`), so hiding is already done — no UI change needed if Race table rows have `unlocked: false`. Admin command: new case in `submit_command` reducer in `commands.ts`. Uses `appendWorldEvent` for broadcast. |
| RACE-EXP-05 | Racial bonuses cover the full bonus pool (spell damage, physical damage, max mana, mana regen, max HP) | New bonus types (spell damage, physical damage, crit chance, armor) need to be wired into: (1) `create_character` — apply bonuses at creation; (2) `awardXp` — re-apply at even levels; (3) `recomputeCharacterDerived` — for non-stat bonuses (maxHp, maxMana, armorClass) need to read racial bonus and add; combat helper for spell/physical damage bonuses via `sumCharacterEffect` pattern OR direct Character field. |
</phase_requirements>

---

## Summary

Phase 21 is a schema migration + data expansion + bug fix phase. The three pillars are: (1) replace the Race table's 5-column stat system with a 4-column flexible bonus system, (2) expand RACE_DATA from 4 to 15 entries with the new schema, and (3) fix the level-up racial bonus bug so bonuses persist and re-apply at even levels.

The schema change is the hardest constraint: adding non-optional columns to an existing SpacetimeDB table requires `--clear-database` on publish. This wipes all runtime data. The team is already aware of this (noted in context). The old columns (`strBonus`, `dexBonus`, `chaBonus`, `wisBonus`, `intBonus`) must be removed and replaced with `bonus1Type: string`, `bonus1Value: bigint`, `bonus2Type: string`, `bonus2Value: bigint`.

The level-up bug in `awardXp` (helpers/combat.ts lines 1924-1936) is confirmed: `computeBaseStats` returns class-only stats, and those are written to the character row without ever reading the race row. The fix must look up the character's race row by name (`character.race` is a string), then apply racial bonuses on top of class stats for every level-up. At even levels, it applies an additional stacked instance. The same bug exists in the `/level` admin command in `commands.ts`.

The UI side for locked races is already largely done: `CharacterPanel.vue` already computes `unlockedRaces = races.filter(r => r.unlocked)` and only shows those. If the Race table rows have `unlocked: false`, they simply will not appear. The race bonus display in the info panel (lines 36-41) still references the old field names and must be updated to show `bonus1Type/bonus1Value/bonus2Type/bonus2Value` instead.

**Primary recommendation:** Execute in this order — (1) schema change in tables.ts + races.ts data + create_character fix, (2) awardXp level-up fix + even-level mechanic, (3) /unlockrace admin command, (4) UI race info panel update to show new bonus fields.

---

## Standard Stack

### Core — All Verified from Codebase (HIGH confidence)

| Component | Location | Current State | Phase 21 Change |
|-----------|----------|---------------|-----------------|
| Race table definition | `spacetimedb/src/schema/tables.ts` lines 1272-1286 | 5 stat columns (strBonus..intBonus) + unlocked | Replace with bonus1Type/bonus1Value/bonus2Type/bonus2Value |
| Race data | `spacetimedb/src/data/races.ts` | 4 races, old schema | 15 races, new schema |
| ensureRaces seeding | `spacetimedb/src/data/races.ts` lines 42-51 | Upserts by name; updates existing rows | No structural change needed |
| syncAllContent | `spacetimedb/src/seeding/ensure_content.ts` line 95 | Calls ensureRaces first | No change needed |
| create_character reducer | `spacetimedb/src/reducers/characters.ts` lines 153-244 | Applies old stat bonus columns | Must apply new bonus1/bonus2 model |
| awardXp function | `spacetimedb/src/helpers/combat.ts` lines 1899-1938 | Drops race on level-up | Must re-apply racial bonuses, stack at even levels |
| level_character command | `spacetimedb/src/reducers/commands.ts` lines 505-549 | Same bug as awardXp | Same fix |
| submit_command reducer | `spacetimedb/src/reducers/commands.ts` lines 184-237 | Handles /synccontent and hail patterns | Add /unlockrace case |
| CharacterPanel.vue | `src/components/CharacterPanel.vue` | Already filters unlockedRaces, shows old bonus fields | Update bonus display section |
| recomputeCharacterDerived | `spacetimedb/src/helpers/character.ts` lines 53-128 | Computes maxHp, maxMana, armorClass from character stats + gear | May need racial bonus additions for non-stat bonuses |

### Bonus Type String Keys (Recommended)

The bonus pool uses string type keys in `bonus1Type`/`bonus2Type`. Recommended canonical string keys:

| Bonus Pool Item | Recommended Type Key | Applied Where |
|-----------------|---------------------|---------------|
| +1 to STR | `'stat_str'` | `character.str += bonus1Value` at creation/level-up |
| +1 to DEX | `'stat_dex'` | `character.dex += bonus1Value` |
| +1 to INT | `'stat_int'` | `character.int += bonus1Value` |
| +1 to WIS | `'stat_wis'` | `character.wis += bonus1Value` |
| +1 to CHA | `'stat_cha'` | `character.cha += bonus1Value` |
| Bonus spell damage | `'spell_damage'` | CharacterEffect with effectType `'spell_damage_bonus'` OR direct field — see architecture section |
| Bonus physical damage | `'phys_damage'` | CharacterEffect with effectType `'phys_damage_bonus'` OR direct field |
| Bonus max mana | `'max_mana'` | Added to maxMana in recomputeCharacterDerived |
| Bonus mana regen | `'mana_regen'` | Added to manaRegenBonus in regen_health reducer path |
| Bonus max HP | `'max_hp'` | Added to maxHp in recomputeCharacterDerived |
| Bonus stamina regen | `'stamina_regen'` | Added to staminaRegenBonus in regen_health reducer path |
| Bonus crit chance | `'crit_chance'` | Added to critMelee/critRanged in recomputeCharacterDerived |
| Bonus armor | `'armor'` | Added to armorClass in recomputeCharacterDerived |
| Bonus evasion/dodge | `'dodge'` | Added to dodgeChance in recomputeCharacterDerived |

---

## Architecture Patterns

### Pattern 1: Schema Migration with --clear-database

The Race table currently has non-optional columns (`strBonus`, `dexBonus`, etc.). Replacing them with 4 new non-optional columns requires `--clear-database`. This is the standard SpacetimeDB approach for removing/replacing non-optional columns.

```bash
# After updating tables.ts and races.ts
spacetime publish <db-name> --clear-database -y --project-path spacetimedb
# Then regenerate client bindings
spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb
```

**Key constraint:** `--clear-database` wipes ALL tables, not just Race. All world data, characters, items reset. This is acceptable for a dev database and must be in the plan.

### Pattern 2: Flexible Dual-Bonus Schema

```typescript
// In spacetimedb/src/schema/tables.ts
export const Race = table(
  { name: 'race', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    description: t.string(),
    availableClasses: t.string(),
    bonus1Type: t.string(),    // e.g., 'stat_cha', 'spell_damage', 'max_mana'
    bonus1Value: t.u64(),      // magnitude (always positive bigint)
    bonus2Type: t.string(),
    bonus2Value: t.u64(),
    unlocked: t.bool(),
  }
);
```

**Why u64 for bonus values:** All bonus values in context are positive (buffs, not debuffs). Using u64 avoids signed arithmetic complications. The stat bonus application adds the value; crit_chance and dodge values are in the same units as the existing character fields (which are bigints, e.g., critMelee = dex * 12n).

### Pattern 3: Applying Racial Bonuses at Character Creation

Current flow in `create_character` (characters.ts lines 182-188):
```typescript
// CURRENT (broken for Phase 21):
const baseStats = {
  str: classStats.str + raceRow.strBonus,
  dex: classStats.dex + raceRow.dexBonus,
  ...
};
```

New flow must handle all bonus types:
```typescript
// NEW PATTERN:
function applyRacialBonus(stats: CharacterStats, bonusType: string, bonusValue: bigint): void {
  // Mutates stats in place for stat-type bonuses
  // Returns extra values (maxHpBonus, maxManaBonus, etc.) separately
}
```

The cleaner approach is a helper `applyRacialBonuses(character, raceRow)` that returns a `RacialBonusResult` object covering stat deltas and non-stat bonuses separately, avoiding mutation side effects in the complex `create_character` reducer.

### Pattern 4: Level-Up Bug Fix + Even-Level Stacking

The level-up path in `awardXp` (combat.ts ~line 1924):

```typescript
// CURRENT BUG:
const newBase = computeBaseStats(character.className, newLevel);
const updated = {
  ...character,
  level: newLevel,
  xp: newXp,
  str: newBase.str,      // ← race bonus silently dropped
  dex: newBase.dex,
  cha: newBase.cha,
  wis: newBase.wis,
  int: newBase.int,
};
```

Fix pattern:
```typescript
// FIXED:
const newBase = computeBaseStats(character.className, newLevel);
const raceRow = [...ctx.db.race.iter()].find(r => r.name === character.race);

// Count how many even-level applications apply up to newLevel
// Level 1 = initial application (1 application)
// Each even level adds 1 more
const evenLevelCount = newLevel / 2n;  // BigInt division, floors automatically
const totalApplications = 1n + evenLevelCount;  // level 1 + all even levels up to newLevel

// Apply racial stat bonuses
const racialStatStr = applyStatBonus('stat_str', raceRow, totalApplications);
// ... etc

const updated = {
  ...character,
  level: newLevel,
  xp: newXp,
  str: newBase.str + racialStatStr,
  ...
};
```

**Critical insight on stacking model:** The decision says "diminishing returns / percentage-based" — NOT flat additive. The planner must design the formula. Research recommendation: a simple approach for levels 1-10 is `baseValue + floor(baseValue * (applications-1) * scalingFactor)` where `scalingFactor` is something like 0.5 (each additional application is worth 50% of the first). At level 10, that's 1 + 5 even levels = 6 applications, so a +1 stat bonus becomes +1 + 5*0.5 = +3.5 → +3. This feels meaningful without being dominant.

### Pattern 5: /unlockrace Admin Command

The `submit_command` reducer parses commands with regex. Pattern for adding `/unlockrace`:

```typescript
// In commands.ts, inside submit_command reducer:
const unlockRaceMatch = trimmed.match(/^\/unlockrace\s+(.+)$/i);
if (unlockRaceMatch) {
  requireAdmin(ctx);
  const raceName = unlockRaceMatch[1].trim();
  let found = false;
  for (const race of ctx.db.race.iter()) {
    if (race.name.toLowerCase() === raceName.toLowerCase()) {
      if (race.unlocked) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', `${race.name} is already unlocked.`);
        return;
      }
      ctx.db.race.id.update({ ...race, unlocked: true });
      appendWorldEvent(ctx, 'world_event', `A new race has been unlocked: ${race.name}!`);
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', `Unlocked race: ${race.name}.`);
      found = true;
      break;
    }
  }
  if (!found) {
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', `Race not found: "${raceName}".`);
  }
  return;
}
```

**Key facts from codebase:**
- `requireAdmin(ctx)` is in `data/admin.ts` and already imported in `commands.ts` deps
- `appendWorldEvent` is in `helpers/events.ts` and IS imported in `world_events.ts` — need to verify it's available in `commands.ts` deps or import it
- `ctx.db.race.iter()` works (no index on name, but 15 races is trivially small)

### Pattern 6: Non-Stat Bonus Application Points

For bonus types that are NOT stat points, the application flow differs:

| Bonus Type | Application Point | Mechanism |
|------------|-------------------|-----------|
| `max_hp` | `create_character` + `recomputeCharacterDerived` | Add racial max_hp contribution to maxHp computation |
| `max_mana` | `create_character` + `recomputeCharacterDerived` | Add racial max_mana contribution to maxMana computation |
| `armor` | `create_character` + `recomputeCharacterDerived` | Add racial armor to armorClass computation |
| `crit_chance` | `create_character` + `recomputeCharacterDerived` | Add racial crit to critMelee/critRanged computation |
| `dodge` | `create_character` + `recomputeCharacterDerived` | Add racial dodge to dodgeChance computation |
| `spell_damage` | `create_character` ONLY (baked into... needs decision) | See pitfalls |
| `phys_damage` | `create_character` ONLY (baked into... needs decision) | See pitfalls |
| `mana_regen` | `regen_health` reducer path (combat.ts ~line 1220) | Add alongside `food_mana_regen` effect sum |
| `stamina_regen` | `regen_health` reducer path | Add alongside `food_stamina_regen` effect sum |

**Critical architecture question for spell/physical damage bonuses:** The Character table has no `spellDamageBonus` or `physDamageBonus` field. Current spell damage flows through ability power + stat scaling in `executeAbilityAction`. There are two options:

**Option A — CharacterEffect approach:** Insert a persistent CharacterEffect row with effectType `'spell_damage_bonus'` at character creation and re-insert at even levels. The combat helper `sumCharacterEffect(ctx, character.id, 'spell_damage_bonus')` then picks it up. Pro: uses existing pattern. Con: CharacterEffect rows are temporary/combat-oriented; on death/respawn these effects could be cleared.

**Option B — Store on Character row:** Add `racialSpellDamage: t.u64()` and `racialPhysDamage: t.u64()` columns to the Character table. Pro: permanent, cannot be accidentally cleared. Con: adds columns, requires `--clear-database` (but we're already doing that).

**Recommendation:** Option B is safer for permanent racial bonuses. Since `--clear-database` is already required for the Race schema change, adding two optional columns to Character is low-cost. Use `.optional()` columns defaulting to undefined/0 so existing data is not broken on future plain publishes. However, if the planner prefers minimal schema changes, Option A (CharacterEffect with a source marker) can work if the respawn/death code never clears effects with `sourceAbility === 'racial'`.

**Confirmed from code:** The respawn_character reducer in characters.ts (lines 397-453) does:
```typescript
for (const effect of ctx.db.characterEffect.by_character.filter(character.id)) {
  ctx.db.characterEffect.id.delete(effect.id);
}
```
This deletes ALL CharacterEffects on respawn — which would wipe racial spell/phys damage bonuses. **This confirms Option B (Character row fields) is required for spell_damage and phys_damage bonuses.**

### Pattern 7: Race Data Structure in races.ts

Current structure:
```typescript
export const RACE_DATA: Array<{
  name: string;
  description: string;
  availableClasses: string;
  strBonus: bigint;
  // ...
  unlocked: boolean;
}> = [...]
```

New structure:
```typescript
export const RACE_DATA: Array<{
  name: string;
  description: string;
  availableClasses: string;
  bonus1Type: string;
  bonus1Value: bigint;
  bonus2Type: string;
  bonus2Value: bigint;
  unlocked: boolean;
}> = [
  // 4 existing + 11 new = 15 total
]
```

The `ensureRaces` function (races.ts lines 42-51) upserts by name match with `ctx.db.race.iter()`. This works fine — it spreads all data fields including the new bonus columns. No change to the seeding logic needed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Admin authentication | Custom auth check | `requireAdmin(ctx)` from `data/admin.ts` | Already exists and imported |
| World broadcast | Custom event insert | `appendWorldEvent(ctx, 'world_event', message)` from `helpers/events.ts` | Handles trim/cleanup |
| Race lookup by name | Linear scan in new code | Pattern already used in world_events.ts `applyConsequence` for race_unlock | Same pattern, same table, same 15-row size |
| Seeding upsert logic | New upsert function | `ensureRaces` in races.ts already does name-based upsert | Extend the existing array, not the function |
| Effect type string management | Enum or constant file | Inline string literals (existing codebase pattern) | Consistent with how all other effectTypes are handled |
| Command parsing | Complex parser | Simple regex match pattern (existing submit_command pattern) | All existing commands use this approach |

---

## Common Pitfalls

### Pitfall 1: Respawn Clears All CharacterEffects
**What goes wrong:** If racial spell damage or physical damage bonuses are stored as CharacterEffect rows, they are deleted by `respawn_character` (characters.ts line 407-409) which deletes ALL effects for a character on death. After respawn, racial bonuses would be gone permanently (until next level-up reapplication).
**Why it happens:** CharacterEffect was designed for combat buffs/debuffs, not permanent stat storage.
**How to avoid:** Use Character table columns (`racialSpellDamage`, `racialPhysDamage`) for bonuses that must survive death. These are set once and persist on the row.
**Warning signs:** Spell/phys damage bonus works after creation but disappears after first death.

### Pitfall 2: --clear-database Wipes Everything
**What goes wrong:** Schema migration requires `--clear-database`, which deletes all database rows — characters, locations, items, NPCs, enemies, world state. The game is reset to zero.
**Why it happens:** SpacetimeDB requires this for non-optional column additions/removals.
**How to avoid:** Ensure `syncAllContent` runs on module load (it does, via `clientConnected` or init). The world re-seeds automatically. Characters must be recreated by players.
**Warning signs:** After publish, the world appears empty until someone logs in and triggers re-seeding. Check that `clientConnected` calls `syncAllContent` or equivalent.

### Pitfall 3: Level-Up Bug Also in /level Admin Command
**What goes wrong:** The `level_character` reducer in commands.ts (lines 536-548) also calls `computeBaseStats` and replaces stats without applying racial bonuses. Fixing only `awardXp` and missing this leaves a second bug path.
**Why it happens:** Two independent level-up paths exist.
**How to avoid:** Fix both `awardXp` and `level_character` in the same phase.
**Warning signs:** Characters leveled via `/level` command have missing racial bonuses; characters who leveled naturally are fine.

### Pitfall 4: Race Lookup by Name (Not by ID) at Level-Up
**What goes wrong:** Character stores race as a string name (`character.race = 'Ironclad'`), not a raceId. At level-up in `awardXp`, you must look up the Race row by iterating `ctx.db.race.iter()` and matching on name. If someone uses `ctx.db.race.id.find(character.raceId)` — that field doesn't exist.
**Why it happens:** Phase 1 design decision: race stored as display name string.
**How to avoid:** Always look up race by `[...ctx.db.race.iter()].find(r => r.name === character.race)`. Handle the case where raceRow is undefined (character pre-dates race seeding — treat as no racial bonus).
**Warning signs:** TypeScript error on `character.raceId` (field doesn't exist).

### Pitfall 5: CharacterPanel.vue Race Bonus Display Still References Old Fields
**What goes wrong:** The race info panel (CharacterPanel.vue lines 36-41) renders `selectedRaceRow.strBonus`, `selectedRaceRow.dexBonus`, etc. After schema change and binding regeneration, these fields no longer exist. The panel shows nothing or throws.
**Why it happens:** Template directly accesses old field names.
**How to avoid:** Update the template to render `bonus1Type`/`bonus1Value`/`bonus2Type`/`bonus2Value` instead. Need a display label function to convert type keys to human-readable strings.
**Warning signs:** Race info panel shows blank bonus section after regenerating bindings.

### Pitfall 6: Troll vs Orc Differentiation
**What goes wrong:** Both Troll and Orc have `bonus max HP + bonus physical damage`. If both use the same magnitudes, they are functionally identical.
**Why it happens:** Context notes this as a concern.
**How to avoid:** Lean one toward HP (Troll: +15 HP, +1 phys damage) and the other toward damage (Orc: +10 HP, +2 phys damage). The magnitude values are Claude's discretion.
**Warning signs:** Players notice Troll = Orc effectively.

### Pitfall 7: Even-Level Stacking Formula Must Use BigInt Math
**What goes wrong:** The diminishing returns formula involves multiplication and division. Using JavaScript `Number` arithmetic with BigInt values causes `TypeError: Cannot mix BigInt and other types`.
**Why it happens:** All SpacetimeDB server-side numeric values are bigint; mixing with Number constants requires explicit casts.
**How to avoid:** Use BigInt arithmetic throughout: `totalBonus = baseValue + (baseValue * (applications - 1n) * scalingNumerator) / scalingDenominator`. All constants must be `n`-suffixed.
**Warning signs:** Runtime TypeError in the level-up reducer.

### Pitfall 8: Halfling Bonus Evasion/Dodge — dodgeChance Field
**What goes wrong:** Halfling has `bonus crit chance + bonus evasion/dodge`. The dodge bonus needs to add to `character.dodgeChance`. However `dodgeChance` is computed by `recomputeCharacterDerived` as `dex * 12n`. If dodge is only stored in derived computation, the racial dodge bonus needs to be added there, not stored as a base stat.
**Why it happens:** dodgeChance is a derived field, not a base stat.
**How to avoid:** Add racial dodge contribution in `recomputeCharacterDerived` (same approach as crit_chance and armor bonuses). The racial dodge value is read from the character's race row during recomputation.

### Pitfall 9: appendWorldEvent Not in commands.ts deps
**What goes wrong:** The `submit_command` reducer in `commands.ts` uses a `deps` injection pattern. `appendWorldEvent` from `helpers/events.ts` may not be in the deps object passed to `registerCommandReducers`.
**Why it happens:** The command reducer was designed for character-scoped actions, not world broadcasts.
**How to avoid:** Check `index.ts` to see what's in the deps passed to `registerCommandReducers`, and add `appendWorldEvent` to the deps if needed. Alternatively, import it directly at the top of commands.ts (the file already imports `appendSystemMessage` directly).
**Warning signs:** `appendWorldEvent is not a function` runtime error in the /unlockrace command.

---

## Code Examples

Verified patterns from actual codebase:

### Race Unlock in World Events (existing pattern — applyConsequence in world_events.ts)
```typescript
// Source: spacetimedb/src/helpers/world_events.ts lines 316-325
case 'race_unlock': {
  for (const race of ctx.db.race.iter()) {
    if (race.name === payload) {
      ctx.db.race.id.update({ ...race, unlocked: true });
      appendWorldEvent(ctx, 'world_event', `The ${race.name} race has been unlocked!`);
      break;
    }
  }
  break;
}
```
The `/unlockrace` admin command should follow this exact same pattern.

### Admin Guard Pattern (commands.ts — existing)
```typescript
// Source: spacetimedb/src/reducers/commands.ts lines 207-209
if (trimmed.toLowerCase() === '/synccontent') {
  requireAdmin(ctx);
  // ...
}
```

### Level-Up Path (awardXp — the bug location)
```typescript
// Source: spacetimedb/src/helpers/combat.ts lines 1924-1936
const newBase = computeBaseStats(character.className, newLevel);
const updated = {
  ...character,
  level: newLevel,
  xp: newXp,
  str: newBase.str,   // ← race bonus lost here
  dex: newBase.dex,
  cha: newBase.cha,
  wis: newBase.wis,
  int: newBase.int,
};
ctx.db.character.id.update(updated);
recomputeCharacterDerived(ctx, updated);
return { xpGained: gained, leveledUp: true, newLevel };
```

### recomputeCharacterDerived — Where Non-Stat Bonuses Are Applied
```typescript
// Source: spacetimedb/src/helpers/character.ts lines 53-128
// Currently computes:
const maxHp = BASE_HP + totalStats.str * HP_STR_MULTIPLIER + gear.hpBonus;
const maxMana = usesMana(...) ? BASE_MANA + manaStat * 6n + gear.manaBonus : 0n;
const armorClass = baseArmorForClass(character.className) + gear.armorClassBonus + acBonus;
const critMelee = totalStats.dex * 12n;
// ↑ Phase 21 must add racial contributions to each of these
```

### ensureRaces — How Seeding Works
```typescript
// Source: spacetimedb/src/data/races.ts lines 42-51
export function ensureRaces(ctx: any) {
  for (const data of RACE_DATA) {
    const existing = [...ctx.db.race.iter()].find((row: any) => row.name === data.name);
    if (existing) {
      ctx.db.race.id.update({ ...existing, ...data });
    } else {
      ctx.db.race.insert({ id: 0n, ...data });
    }
  }
}
```
Adding new races to RACE_DATA is sufficient — ensureRaces handles both insert and update.

### Regen Path — Where mana_regen and stamina_regen Bonuses Apply
```typescript
// Source: spacetimedb/src/reducers/combat.ts lines 1213-1228
let manaRegenBonus = 0n;
let staminaRegenBonus = 0n;
for (const effect of ctx.db.characterEffect.by_character.filter(character.id)) {
  if (effect.effectType === 'food_mana_regen') manaRegenBonus += effect.magnitude;
  else if (effect.effectType === 'food_stamina_regen') staminaRegenBonus += effect.magnitude;
}
// Phase 21: add racial mana_regen / stamina_regen contribution here
// Options: read from character.racialManaRegen field OR re-query race row each tick
```

For mana_regen and stamina_regen racial bonuses: reading the race row every regen tick (3-second interval) for every character is expensive. **Recommendation:** Store `racialManaRegen` and `racialStaminaRegen` as optional columns on the Character table (set at creation and each level-up re-application), read like gear bonuses.

---

## Recommended Bonus Values (Claude's Discretion)

Magnitudes that are clearly smaller than gear affix values (which reach +3-6 on stats and +10-30 on HP/mana at higher tiers):

| Race | Bonus 1 | Value | Bonus 2 | Value |
|------|---------|-------|---------|-------|
| Human | stat_cha | 1n | stamina_regen | 1n |
| Eldrin | spell_damage | 2n | max_mana | 10n |
| Ironclad | phys_damage | 2n | armor | 1n |
| Wyldfang | crit_chance | 5n (0.5% effective) | stat_dex | 1n |
| Goblin | spell_damage | 1n | mana_regen | 1n |
| Troll | max_hp | 15n | phys_damage | 1n |
| Dwarf | max_hp | 10n | phys_damage | 2n |
| Gnome | mana_regen | 2n | max_mana | 15n |
| Halfling | crit_chance | 8n (~0.8%) | dodge | 8n |
| Half-Elf | stat_str | 1n | stat_int | 1n |
| Orc | phys_damage | 3n | max_hp | 8n |
| Dark-Elf | spell_damage | 3n | mana_regen | 1n |
| Half-Giant | max_hp | 20n | phys_damage | 2n |
| Cyclops | phys_damage | 4n | armor | 2n |
| Satyr | spell_damage | 2n | stamina_regen | 2n |

**Notes:**
- Crit values are in the same unit as `critMelee = dex * 12n` (e.g., dex 10 = 120 crit, which is percentage-hundredths: 1.20%)
- Half-Elf gets +1 to two different stats — this is a versatility play, not power
- Troll vs Orc: Troll is tankier (more HP), Orc is more aggressive (more phys damage)
- Dwarf vs Troll: Dwarf has slightly less HP but more phys damage than Troll

### Recommended Diminishing Returns Formula (Levels 1-10)
For a bonus that starts at value `V` at level 1:
- Total bonus at level `L` = `V * totalApplications` where each application after the first is worth 50% of `V`
- More precisely: `bonus = V + floor(V * (evenLevelCount) / 2n)`
- At level 10: 5 even levels → `V + floor(V * 5n / 2n)` = `V + 2V` = `3V` for most values
- This means a +2 phys damage Orc gains +6 phys damage by level 10 — small but noticeable

BigInt formula:
```typescript
const evenLevelCount = newLevel / 2n;
const racialBonus = baseValue + (baseValue * evenLevelCount) / 2n;
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| 5 individual stat bonus columns | 4-column flexible type/value schema | Enables all 9+ bonus pool types without new columns |
| Race bonuses applied once and lost on level-up | Bonuses preserved in stats + re-applied at even levels | Races feel meaningful throughout progression |
| 4 starter races | 15 races (7 unlocked, 4 locked) | Richer character creation experience |
| All races always visible | Locked races completely hidden | Creates world event discovery excitement |

---

## Open Questions

1. **How should mana_regen and stamina_regen bonuses be stored across regen ticks?**
   - What we know: regen_health reducer at combat.ts ~line 1220 sums `food_mana_regen` CharacterEffects each tick
   - What's unclear: CharacterEffect rows are cleared on respawn — not safe for racial bonuses
   - Recommendation: Add `racialManaRegen: t.u64().optional()` and `racialStaminaRegen: t.u64().optional()` to Character table, set at creation and reapplication. Read directly in regen path like a field access, not an effect sum.

2. **Should spell_damage and phys_damage bonuses be Character fields or CharacterEffects?**
   - What we know: CharacterEffects are cleared on respawn; Character fields persist
   - What's unclear: How combat computes spell/phys damage — currently no flat racial bonus in that path
   - Recommendation: Add `racialSpellDamage: t.u64().optional()` and `racialPhysDamage: t.u64().optional()` to Character table. Read them in ability execution alongside weapon damage computation.

3. **Is appendWorldEvent available in registerCommandReducers deps?**
   - What we know: commands.ts imports `appendSystemMessage` directly from events.ts at line 2
   - What's unclear: Whether `appendWorldEvent` is in deps or needs a direct import
   - Recommendation: Add a direct import of `appendWorldEvent` from `helpers/events.ts` at top of commands.ts (matches existing pattern for appendSystemMessage).

---

## Sources

### Primary (HIGH confidence)
- Codebase direct read: `spacetimedb/src/schema/tables.ts` — Race table definition (lines 1272-1286)
- Codebase direct read: `spacetimedb/src/data/races.ts` — RACE_DATA and ensureRaces
- Codebase direct read: `spacetimedb/src/helpers/combat.ts` — awardXp level-up bug (lines 1899-1938)
- Codebase direct read: `spacetimedb/src/reducers/characters.ts` — create_character reducer
- Codebase direct read: `spacetimedb/src/reducers/commands.ts` — admin command pattern, level_character bug
- Codebase direct read: `spacetimedb/src/helpers/character.ts` — recomputeCharacterDerived
- Codebase direct read: `spacetimedb/src/helpers/events.ts` — appendWorldEvent
- Codebase direct read: `spacetimedb/src/helpers/world_events.ts` — applyConsequence race_unlock pattern
- Codebase direct read: `spacetimedb/src/seeding/ensure_content.ts` — syncAllContent
- Codebase direct read: `src/components/CharacterPanel.vue` — race display and unlockedRaces computed
- Codebase direct read: `spacetimedb/src/reducers/combat.ts` (~line 1220) — regen path for mana/stamina bonuses

### Secondary (MEDIUM confidence)
- CLAUDE.md / spacetimedb-typescript.mdc: Non-optional columns require --clear-database confirmed
- CLAUDE.md: Optional columns can be added with plain publish confirmed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all read directly from codebase
- Architecture: HIGH — level-up bug confirmed from source, solutions derived from existing patterns
- Pitfalls: HIGH — respawn clears effects confirmed from source; all other pitfalls derived from code analysis
- Bonus values: MEDIUM — Claude's discretion, no external validation needed

**Research date:** 2026-02-18
**Valid until:** Stable until Race schema or awardXp logic changes
