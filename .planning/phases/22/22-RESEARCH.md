# Phase 22: Class Ability Balancing & Progression - Research

**Researched:** 2026-02-20
**Domain:** SpacetimeDB TypeScript game backend — ability data files, combat system, character effects
**Confidence:** HIGH (all findings from direct codebase inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Core Design Rule:** Abilities unlock at odd levels only: 1, 3, 5, 7, 9. Level 10 = capstone. Even levels are reserved exclusively for racial bonuses. This gives 6 ability unlock points per class.

**New Backend Systems Required:**
| System | Required By | Description |
|--------|-------------|-------------|
| Stun debuff | Monk L3, Shaman L10, Enchanter L3 | New debuffType: 'stun' |
| Life drain tick | Necromancer L5, Reaver L1 | DoT that heals caster for % per tick |
| Debuff DoT | Necromancer L7 | DoT that also applies AC debuff per tick |
| BardSong system | Bard all abilities | Active song table + 6s tick scheduler |
| Haste buff | Enchanter L7 | New CharacterEffect: faster auto-attacks + reduced cast times |
| Charm/Copy pet | Enchanter L10 | Spawns copy of current target as temporary pet |
| Shapeshifter form | Druid L10 | 30s physical mode + temp bonus HP buffer |
| Pet aggro | Beastmaster L1, Summoner, Necromancer L3 | Pets immediately generate and hold aggro |
| Pet swap | Summoner | 10s overlap on swap |
| Conjure items | Summoner L3/L9 | Creates inventory items (food, temp gear with affixes) |
| Temp equipment | Summoner L9 | ItemInstance flag: lasts until logout |
| Travel discount buff | Bard L7 | CharacterEffect: reduces travel stamina cost |
| Berserker stance | Warrior L10 | 30s buff: +50% dmg, cannot use defensive abilities |
| Plague Lord Form | Necromancer L10 | 30s: DoTs 2x faster, life drains heal 2x |

**Full Class Progressions (ALL LOCKED — implement exactly as specified):**
- Warrior: L1 Slam, L3 Intimidating Presence, L5 Crushing Blow, L7 Cleave, L9 Rally, L10 Berserker Rage
- Cleric: L1 Mend, L3 Blessing of Might (group STR 45min), L5 Heal, L7 Sanctify (group armor+HP regen 45min), L9 Resurrect, L10 Holy Nova
- Wizard: L1 Magic Missile, L3 Frost Shard, L5 Lightning Surge, L7 Mana Shield, L9 Arcane Storm, L10 Arcane Explosion (power 10, 3s cast)
- Rogue: L1 Shadow Cut, L3 Evasion, L5 Shadow Strike, L7 Bleed, L9 Pickpocket, L10 Death Mark
- Ranger: L1 Marked Shot (physical/stamina), L3 Track (mana), L5 Piercing Arrow (physical/stamina), L7 Nature's Balm (mana), L9 Rapid Shot (physical/stamina), L10 Rain of Arrows
- Druid: L1 Thorn Lash, L3 Nature's Mark, L5 Wild Surge, L7 Nature's Gift (HoT), L9 Entangle (AoE root+DoT), L10 Shapeshifter Form
- Bard: L1 Discordant Note, L3 Melody of Mending, L5 Chorus of Vigor, L7 March of Wayfarers (travel discount), L9 Battle Hymn, L10 Finale. ALL have 1s cooldown. Melody weaving system required.
- Monk: L1 Crippling Kick, L3 Stunning Strike (stun), L5 Tiger Flurry, L7 Centering, L9 Inner Focus, L10 Hundred Fists
- Paladin: L1 Holy Strike, L3 Shield of Faith, L5 Radiant Smite, L7 Lay on Hands (600s CD), L9 Devotion (group), L10 Consecrated Ground
- Shaman: L1 Spirit Mender, L3 Hex, L5 Stormcall, L7 Spirit Wolf, L9 Ancestral Ward, L10 Earthquake (stun all)
- Necromancer: L1 Plague Spark, L3 Bone Servant (pet), L5 Wither (life drain DoT), L7 Soul Rot (debuff DoT), L9 Corpse Summon, L10 Plague Lord Form
- Beastmaster: L1 Call Beast, L3 Pack Rush, L5 Alpha Assault, L7 Wild Howl, L9 Beast Fang, L10 Wild Hunt
- Enchanter: L1 Mind Fray (DoT), L3 Mesmerize (stun), L5 Clarity (group mana regen), L7 Haste (party speed), L9 Bewilderment (AoE debuff), L10 Charm (enemy copy pet)
- Reaver: L1 Blood Rend (lifesteal), L3 Soul Rend, L5 Oblivion, L7 Dread Aura, L9 Blood Pact, L10 Death's Embrace
- Spellblade: L1 Flame Strike, L3 Frost Armor, L5 Thunder Cleave (AoE), L7 Stone Skin, L9 Magma Shield, L10 Elemental Surge
- Summoner: L1 Earth Elemental, L3 Conjure Sustenance, L5 Fire Elemental, L7 Water Elemental, L9 Conjure Equipment, L10 Primal Titan

### Claude's Discretion
(Not specified in provided context — planner may use judgment on cooldown values, power values, and resource costs for new abilities, consistent with existing class patterns.)

### Deferred Ideas (OUT OF SCOPE)
(None specified)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ABILITY-01 | All 16 classes have abilities defined for levels 1-10 in their respective data files | All 16 class ability files exist; each currently has 5-6 abilities at wrong level assignments. Research shows exact rewrite needed per class. |
| ABILITY-02 | Each class has a documented identity pillar | Ability files have descriptions but no identity pillar field. Identity implied by ability design. Research shows this lives in ability file comments or a new data constant. |
| ABILITY-03 | Every ability with a mechanic tag has corresponding backend reducer support | Research shows which mechanic tags are new (stun, life_drain, BardSong, haste, charm-pet, shapeshifter, temp equipment, travel discount, berserker stance, Plague Lord Form) vs already supported. |
| ABILITY-04 | Unlock curve explicitly designed (odd levels only) and applied consistently | Existing ability files use levels 1-5 with some at even levels. Every ability file must be rewritten with levels 1n, 3n, 5n, 7n, 9n, 10n. The `level` field on AbilityMetadata is the gate used by `executeAbility`. |
| ABILITY-05 | Power values reviewed and balanced relative to level | Research shows existing power range: 0n-7n for L1-L5. New L7/L9 abilities should use 6n-9n. L10 capstones: 8n-12n. Exact values are Claude's discretion. |
| ABILITY-06 | New abilities human-verified in-game | Out of scope for automated work — flagged for manual QA after implementation. |
</phase_requirements>

---

## Summary

This phase completely rewrites all 16 class ability files in `spacetimedb/src/data/abilities/`, shifting the progression from the current 5-ability (levels 1-5) structure to 6 abilities at levels 1, 3, 5, 7, 9, 10. Most class files currently have abilities at even levels (2n, 4n) that must shift to the new odd-level grid.

All ability file changes feed into `ensure_items.ts::ensureAbilityTemplates()`, which upserts them into the `AbilityTemplate` table. The `executeAbility()` function in `helpers/combat.ts` then needs a `switch` case for every new ability key. Several new mechanic types (stun, life drain, BardSong table, haste, charm-pet, temp equipment, travel discount buff, berserker stance, Plague Lord form) require new backend systems beyond the data files.

The largest new systems are BardSong (needs its own table + scheduler), life drain DoT (heals caster each tick), haste (modifies auto-attack interval and cast time), charm-pet (spawns an enemy copy as a CombatPet), and temp equipment (ItemInstance with a logout flag). The stun debuff is the simplest: add effectType 'stun' that skips the enemy's auto-attack turn (identical to existing 'skip' type — may reuse or extend).

**Primary recommendation:** Rewrite all 16 ability data files first (they are pure data, no backend logic), then add `executeAbility` switch cases for new abilities in `helpers/combat.ts`, then implement new backend systems in order of complexity: stun (trivial), life drain (minor combat loop change), travel discount (read CharacterEffect in movement.ts), berserker/Plague Lord forms (timed CharacterEffect that modifies combat logic), BardSong (new table + scheduler), haste (combat loop change), charm-pet (new summonPet variant), temp equipment (new ItemInstance flag + logout cleanup).

---

## Standard Stack

This is a self-contained SpacetimeDB TypeScript project. No new libraries are needed.

### Core (already present)
| Component | Location | Purpose | Notes |
|-----------|----------|---------|-------|
| `AbilityMetadata` type | `spacetimedb/src/data/ability_catalog.ts` | Shape of every ability data entry | Supports all existing field types; may need new optional fields |
| `AbilityTemplate` table | `spacetimedb/src/schema/tables.ts` | Persisted ability definitions | Seeded from data files via `ensureAbilityTemplates()` |
| `CharacterEffect` table | `spacetimedb/src/schema/tables.ts` | Active buffs/debuffs on characters | Used for all effect types |
| `CombatEnemyEffect` table | `spacetimedb/src/schema/tables.ts` | Active effects on enemies | Includes 'skip', 'dot', 'damage_down', 'ac_bonus', 'armor_down', 'damage_taken' |
| `CombatPet` table | `spacetimedb/src/schema/tables.ts` | Active combat pet | Full pet combat system already exists |
| `executeAbility()` | `spacetimedb/src/helpers/combat.ts` | Dispatches ability execution | Giant switch on abilityKey |
| `addCharacterEffect()` | `spacetimedb/src/helpers/combat.ts` | Adds/refreshes CharacterEffect rows | Call this for all buff/debuff application |
| `addEnemyEffect()` | `spacetimedb/src/helpers/combat.ts` | Adds/refreshes CombatEnemyEffect rows | Call this for debuffs on enemies |
| `summonPet()` | `spacetimedb/src/helpers/combat.ts` (inner fn) | Spawns CombatPet row | Already handles name pool, stats, ability key |
| `ensureAbilityTemplates()` | `spacetimedb/src/seeding/ensure_items.ts` | Upserts all AbilityTemplate rows | Processes merged ABILITIES object from all class files |
| Movement reducer | `spacetimedb/src/reducers/movement.ts` | Travel stamina deduction | Reads `racialTravelCostDiscount` — travel discount buff needs similar read of CharacterEffect |

---

## Architecture Patterns

### Pattern 1: Ability Data File Structure
**What:** Each class has a `*_ABILITIES` constant exported from its data file. All fields map directly to AbilityTemplate columns.
**When to use:** For all 16 ability rewrites.

```typescript
// Source: spacetimedb/src/data/abilities/warrior_abilities.ts
import type { AbilityMetadata, DamageType } from '../ability_catalog.js';

export const WARRIOR_ABILITIES: Record<string, AbilityMetadata> = {
  warrior_slam: {
    name: 'Slam',
    description: '...',
    className: 'warrior',
    resource: 'stamina',       // 'stamina' | 'mana' | 'none'
    level: 1n,                 // MUST be odd: 1n, 3n, 5n, 7n, 9n or 10n
    power: 3n,                 // Used in damage/heal calculations
    cooldownSeconds: 6n,
    castSeconds: 0n,
    damageType: 'physical' as DamageType,
    // Optional fields:
    debuffType: 'ac_bonus',
    debuffMagnitude: -5n,
    debuffDuration: 7n,
    dotPowerSplit: 0.5,        // 0-1 fraction of power to DoT
    dotDuration: 3n,           // ticks (1 tick = 3 seconds)
    hotPowerSplit: 0.5,
    hotDuration: 2n,
    aoeTargets: 'all_enemies', // | 'all_allies' | 'all_party'
    combatState: 'any',        // | 'combat_only' | 'out_of_combat_only' | 'out_of_combat'
  },
};
```

**Level assignment rule (LOCKED):**
- L1 = level: 1n (granted at character creation, always available)
- L3 = level: 3n
- L5 = level: 5n
- L7 = level: 7n
- L9 = level: 9n
- L10 capstone = level: 10n

### Pattern 2: executeAbility() Switch Case
**What:** Every ability key must have a case in the `switch (abilityKey)` block in `helpers/combat.ts`.
**When to use:** Every new ability that does anything beyond data-only.

```typescript
// Source: spacetimedb/src/helpers/combat.ts - executeAbility() inner switch
case 'warrior_slam':
  applyDamage(0n, 0n, {
    threatBonus: 10n,
    debuff: { type: 'skip', magnitude: 1n, rounds: 1n, source: 'Slam' },
  });
  return;

case 'necromancer_bone_servant':
  summonPet('Skeleton', 'a skeleton', ['Rattle', 'Grin', 'Shard', 'Grave', 'Morrow'],
    undefined,
    { damageBase: 4n, damagePerLevel: 2n, weaponScalePercent: 45n }
  );
  return;

case 'cleric_mend':
  if (!targetCharacter) throw new SenderError('Target required');
  applyHeal(targetCharacter, 18n, 'Mend');
  return;
```

**Available helpers inside executeAbility:**
- `applyDamage(weaponPercent, weaponBonus, options?)` — handles AoE, DoT, debuffs, multi-hit
- `applyHeal(target, amount, source)` — handles HoT, stat scaling, healing threat
- `applyMana(target, amount, source)` — direct mana restore
- `applyPartyEffect(effectType, magnitude, rounds, source)` — applies CharacterEffect to all party members
- `applyPartyHpBonus(amount, rounds, source)` — HP bonus to all party members
- `addCharacterEffect(ctx, charId, effectType, magnitude, rounds, sourceAbility)` — single character effect
- `addEnemyEffect(ctx, combatId, enemyId, effectType, magnitude, rounds, sourceAbility)` — single enemy effect
- `summonPet(label, description, namePool, ability?, stats?)` — spawns CombatPet
- `appendPrivateEvent(ctx, charId, userId, kind, msg)` — private log message
- `logGroup(kind, message)` — group-visible log message

### Pattern 3: CharacterEffect Types (Already Supported)
Confirmed by reading `combat.ts` (effect tick processor) and `helpers/combat.ts`:

| effectType | Where Used | What It Does |
|-----------|-----------|-------------|
| `'regen'` | tick_hot reducer | HP heal per tick |
| `'dot'` | tick_hot reducer | HP damage per tick (on character) |
| `'mana_regen'` | tick_effects reducer | Mana per tick |
| `'stamina_regen'` | tick_effects reducer | Stamina per tick |
| `'ac_bonus'` | combat/damage formula | Adds to armorClass |
| `'damage_up'` | applyDamage | Adds flat damage bonus |
| `'hp_bonus'` | character.maxHp | Temporary max HP increase |
| `'stamina_free'` | executeAbility resource cost | Next stamina ability is free |
| `'str_bonus'`, `'dex_bonus'`, `'cha_bonus'`, `'wis_bonus'`, `'int_bonus'` | recomputeCharacterDerived | Stat bonuses (trigger recompute on expire) |
| `'damage_shield'` | combat hit resolution | Absorbs incoming damage |
| `'pull_veil'` | pull system | Reduces enemy add chance on pull |
| `'tracking'` | cosmetic | Indicates Track ability active |
| `'food_health_regen'`, `'food_mana_regen'`, `'food_stamina_regen'` | regen_health reducer | Food buff regen bonuses |

### Pattern 4: CombatEnemyEffect Types (Already Supported)
| effectType | What It Does |
|-----------|-------------|
| `'dot'` | DoT damage on enemy per tick |
| `'skip'` | Enemy misses one auto-attack turn (stagger) |
| `'damage_down'` | Reduces enemy attack damage |
| `'ac_bonus'` | Applied to enemy's armorClass (negative = less armor) |
| `'armor_down'` | Reduces enemy armorClass for damage mitigation |
| `'damage_taken'` | Extra damage taken per hit |

### Pattern 5: Pet System (Fully Implemented)
`CombatPet` table already exists with full combat participation (auto-attacks, pet abilities). The `summonPet()` inner function handles:
- Replacing existing pet for same owner (one pet per character per combat)
- Name pool selection (deterministic, not random)
- Stats: hpBase + hpPerLevel + damageBase + damagePerLevel + weaponScalePercent
- Optional pet ability key + cooldown
- Immediate aggro targeting (targetEnemyId set on summon)
- AggroEntry management done by combat loop, not summon function

**Key insight:** Pets DO immediately generate aggro in the combat loop. The `getTopAggroId` helper filters out petId entries (`if (entry.petId) continue`), but the combat loop does track pet aggro for enemy targeting. The enemy attack logic checks `topPet` when a pet has top aggro.

### Pattern 6: Ability Seeding Flow
1. Class ability constants exported from `data/abilities/*.ts`
2. `ensureAbilityTemplates()` in `seeding/ensure_items.ts` merges all into one `ABILITIES` object
3. Iterates ABILITIES, upserts each into `abilityTemplate` table
4. `combatOnlyKeys`, `utilityKeys`, `outOfCombatOnlyKeys` sets control the `kind` and `combatState` fields
5. When adding new utility abilities (e.g., March of Wayfarers as out-of-combat travel buff), add their key to the appropriate set

**Critical:** `ensureAbilityTemplates()` runs on every `syncAllContent` call. Adding a key to the class ability object and redeploying automatically seeds it. No manual DB migration needed.

### Pattern 7: Level-Gating — How It Works
`executeAbility()` checks: `if (character.level < ability.level) throw new SenderError('Ability not unlocked');`

The `ability.level` comes from the `AbilityTemplate` row, which was seeded from the data file. Setting `level: 9n` on an ability means it cannot be used until the character is level 9. **There is no auto-grant system** — abilities appear in the AbilityTemplate table for the class, and players can manually assign any to hotbar slots via `assign_hotbar_slot` reducer in `items.ts`. The client-side UI shows all abilities for the class; the server enforces the level gate at use time.

### Pattern 8: Travel Discount (for Bard L7 - March of Wayfarers)
The movement reducer already supports `racialTravelCostDiscount` on the Character row. For a temporary CharacterEffect-based discount, the movement reducer must be updated to also read a `travel_discount` CharacterEffect and subtract it from the stamina cost. Pattern:

```typescript
// In movement.ts, within the stamina cost calculation per traveler:
const travelDiscountEffect = [...ctx.db.characterEffect.by_character.filter(traveler.id)]
  .find(e => e.effectType === 'travel_discount');
const buffDiscount = travelDiscountEffect?.magnitude ?? 0n;
const rawCost = staminaCost + costIncrease;
const effectiveCost = rawCost > (costDiscount + buffDiscount)
  ? rawCost - costDiscount - buffDiscount
  : 0n;
```

### Anti-Patterns to Avoid
- **Setting ability levels to even numbers:** Violates the locked design rule. Every ability in the data files must use 1n, 3n, 5n, 7n, 9n, or 10n.
- **Adding new abilities without switch cases:** The `default:` branch in executeAbility just logs "not implemented" but silently consumes the resource cost. Always add the switch case.
- **Using `.iter()` in views:** Not relevant here (no views involved), but noted as SpacetimeDB pitfall.
- **Inventing new debuffTypes without handling them:** Adding `debuffType: 'stun'` to ability metadata does NOT automatically make stun work. The combat loop must explicitly handle the 'stun' effectType.
- **Forgetting to add to `combatOnlyKeys` for pet summons:** New pet summoning abilities (Summoner elementals, Beastmaster at new level) must be in `combatOnlyKeys` set in `ensure_items.ts` or set `combatState: 'combat_only'` in the ability metadata.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pet spawning | Custom pet insertion code | `summonPet()` inner function in executeAbility | Already handles duplicate replacement, naming, stat calculation, aggro entry, auto-attack timing |
| CharacterEffect application | Direct ctx.db.characterEffect.insert | `addCharacterEffect()` in helpers/combat.ts | Handles refresh (update existing instead of duplicate) |
| Enemy debuff application | Direct ctx.db.combatEnemyEffect.insert | `addEnemyEffect()` in helpers/combat.ts | Handles refresh by effectType + sourceAbility |
| AoE damage | Loop over enemies manually | `applyDamage(0n, 0n, { aoeTargets: 'all_enemies' })` + `aoeTargets: 'all_enemies'` in ability metadata | AoE reduction multiplier applied automatically |
| DoT on enemies | Direct combatEnemyEffect insert | Pass `dot: { magnitude, rounds, source }` to `applyDamage()` options | Consistent with tick loop expectations |
| HoT on characters | Direct characterEffect insert | Call `applyHeal()` with hotPowerSplit/hotDuration in ability metadata | HoT calculation handled in applyHeal |
| Multi-hit | Looping applyDamage | `applyDamage(0n, 0n, { hits: 3n })` | Single call handles logging per-hit |
| Ability template seeding | Manual INSERT reducers | Add to class ability constant + redeploy | `ensureAbilityTemplates()` handles upsert automatically |

---

## Common Pitfalls

### Pitfall 1: Level Assignment — Even vs. Odd
**What goes wrong:** Current ability files have abilities at levels 2n and 4n (e.g., warrior `intimidating_presence` is level 2n, `rally` is level 4n). If these entries are simply renamed without changing level, they will have the wrong unlock gate.
**Why it happens:** Previous progression was L1-L5 with all levels. New design is strict odd-only.
**How to avoid:** Every ability key must have a level from this set: `1n, 3n, 5n, 7n, 9n, 10n`. Do a final pass before committing.
**Warning signs:** Any ability with `level: 2n`, `level: 4n`, `level: 6n`, `level: 8n` in the data files.

### Pitfall 2: Old Ability Keys Still in executeAbility Switch
**What goes wrong:** Old ability keys (e.g., `warrior_rally` at level 4n becomes `warrior_rally` at level 9n) may keep the same key but need their switch case updated. More critically, removed/renamed abilities (e.g., current `bard_ballad_of_resolve` key is gone, replaced by `bard_melody_of_mending`) will hit the `default:` branch silently.
**Why it happens:** The switch cases in `helpers/combat.ts` and the data files in `data/abilities/` must be kept in sync manually.
**How to avoid:** After rewriting each class data file, do a diff of old vs. new ability keys and update the switch cases.
**Warning signs:** New ability being cast shows "ability logic not yet implemented" in game log.

### Pitfall 3: BardSong Table — New Scheduled System
**What goes wrong:** The BardSong system (6 song types, each ticking every 6s) requires a new table, new scheduler, and new reducer. If the table is not added to `schema/tables.ts` and re-exported from `schema/scheduled_tables.ts` and `index.ts`, the scheduler will not fire.
**Why it happens:** SpacetimeDB scheduled tables require the `scheduled: 'reducer_name'` option and must be included in the schema export.
**How to avoid:** Follow the pattern of `EffectTick` / `HotTick` tables for new song tick table.
**Warning signs:** Song effects apply once but never tick.

### Pitfall 4: Life Drain DoT Requires Combat Loop Change
**What goes wrong:** A DoT that heals the caster needs to tick in `tick_hot` (the HoT/DoT reducer) and also apply healing to the caster for each tick. Currently the DoT tick on enemies only deals damage; there is no "reverse link" to heal the owner.
**Why it happens:** `CombatEnemyEffect` DoTs don't know who owns them (no `ownerCharacterId` field). The effect row has `sourceAbility` (string) but not a character ID reference.
**How to avoid:** Add `ownerCharacterId` optional field to `CombatEnemyEffect` table, or implement life drain as a new effectType (`'life_drain_dot'`) processed separately in the combat loop where the owner can be looked up from the combat context.
**Warning signs:** Life drain deals damage to enemy but caster HP does not increase.

### Pitfall 5: Temp Equipment — ItemInstance Flag
**What goes wrong:** Summoner's Conjure Equipment (L9) creates items that should be deleted at logout. If the logout handler does not check for the temp flag, the items persist.
**Why it happens:** `ItemInstance` table currently has no expiry mechanism.
**How to avoid:** Add `isTemporary: t.bool().optional()` to `ItemInstance` table. The `character_logout` reducer must iterate owned items and delete those with `isTemporary: true`. Also handle at the `clear_active_character` reducer if camping should also expire temp items.
**Warning signs:** Conjured gear persists after server restart or logout.

### Pitfall 6: Stun vs. Skip
**What goes wrong:** The existing `'skip'` effectType on `CombatEnemyEffect` already causes the enemy to miss a turn. The new `'stun'` debuff (Monk L3, Shaman L10, Enchanter L3) could be implemented as `'skip'` with more rounds — but the design specifies a new debuffType `'stun'`.
**Why it happens:** Design intent calls for a named stun that differs from the "stagger" (1-round skip).
**How to avoid:** Implement `'stun'` as a CombatEnemyEffect with effectType `'stun'` that the combat loop processes identically to `'skip'` (skips auto-attacks while active). The difference is naming and potentially more rounds. The combat loop in `combat.ts` currently checks for `effect.effectType === 'skip'` — add `|| effect.effectType === 'stun'` to that check, or create a separate handler.
**Warning signs:** Stun ability fires but enemy continues attacking.

### Pitfall 7: Berserker / Plague Lord Forms — Timed Buffs That Restrict Actions
**What goes wrong:** Berserker Rage (Warrior L10) prevents use of defensive abilities while active. Plague Lord Form (Necromancer L10) doubles DoT speed and life drain. These require game-logic checks beyond simple CharacterEffect application.
**Why it happens:** There is no existing "form" or "stance" system. Implementing these by just adding a CharacterEffect won't prevent defensive ability use or accelerate DoT ticks.
**How to avoid:**
- Berserker Rage: Add a `'berserker_rage'` CharacterEffect. In `executeAbility`, check for this effect before allowing defensive abilities (ac_bonus-type abilities) — throw error if in berserker rage. Add damage bonus from the effect in `applyDamage`.
- Plague Lord Form: Add `'plague_lord'` CharacterEffect. In the DoT processing section of the combat loop, check if the enemy's life_drain DoT source is owned by a character with the `'plague_lord'` effect and multiply damage/healing accordingly.
**Warning signs:** Form applies but restrictions/bonuses do not take effect.

### Pitfall 8: Haste — Modifies Combat Loop Timing
**What goes wrong:** The Haste buff (Enchanter L7) needs to reduce auto-attack interval and cast time. These are time values (microseconds) computed at runtime, not stored stats. Simply adding a `'haste'` CharacterEffect doesn't automatically change timing.
**Why it happens:** `nextAutoAttackAt` is computed from `AUTO_ATTACK_INTERVAL` constant in the combat loop; cast time is computed from `ability.castSeconds` in `tick_casts` reducer.
**How to avoid:** In the combat loop where `nextAutoAttackAt` is set, check for a `'haste'` CharacterEffect and apply a shorter interval. In `tick_casts` where cast completion is checked, the cast end time was already set when the cast started — for cast time reduction, the haste must be applied at cast START (when `CharacterCast` row is inserted). This means `abilityCastMicros()` in `helpers/combat.ts` must check for the haste effect.
**Warning signs:** Haste applies but auto-attack speed and cast times are unchanged.

---

## Code Examples

### New Ability in Data File (Warrior L10 — Berserker Rage)
```typescript
// Source: codebase pattern from warrior_abilities.ts
warrior_berserker_rage: {
  name: 'Berserker Rage',
  description: 'Enters a savage rage for 30 seconds: +50% damage, but cannot use defensive abilities.',
  className: 'warrior',
  resource: 'stamina',
  level: 10n,
  power: 0n,
  cooldownSeconds: 120n,
  castSeconds: 0n,
  damageType: 'none' as DamageType,
  combatState: 'combat_only',
},
```

### Life Drain DoT — Recommended Table Extension
```typescript
// Source: schema/tables.ts pattern for CombatEnemyEffect
// Add ownerCharacterId field to track who gets the healing
export const CombatEnemyEffect = table(
  { ... },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    enemyId: t.u64(),
    effectType: t.string(),
    magnitude: t.i64(),
    roundsRemaining: t.u64(),
    sourceAbility: t.string().optional(),
    ownerCharacterId: t.u64().optional(),  // NEW: for life drain healing
  }
);
```

### BardSong System — New Table Pattern
```typescript
// Source: EffectTick table pattern from schema/tables.ts
export const ActiveBardSong = table(
  {
    name: 'active_bard_song',
    public: true,
    indexes: [{ name: 'by_bard', algorithm: 'btree', columns: ['bardCharacterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    bardCharacterId: t.u64(),
    songKey: t.string(),        // e.g., 'bard_melody_of_mending'
    startedAt: t.timestamp(),
    nextTickAt: t.u64(),        // microsSinceUnixEpoch
  }
);

export const BardSongTick = table(
  { name: 'bard_song_tick', scheduled: 'tick_bard_songs' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);
```

### Stun Implementation in executeAbility
```typescript
// Source: pattern from warrior_slam case in helpers/combat.ts
case 'monk_stunning_strike':
  applyDamage(0n, 0n, {
    debuff: { type: 'stun', magnitude: 1n, rounds: 2n, source: 'Stunning Strike' },
  });
  return;
```

Then in combat.ts auto-attack check:
```typescript
// Extend existing skip check (combat.ts ~line 2648)
const skipEffect = [...ctx.db.combatEnemyEffect.by_enemy.filter(enemy.id)].find(
  (effect) => effect.effectType === 'skip' || effect.effectType === 'stun'
);
```

### Travel Discount Effect (Bard L7 — March of Wayfarers)
```typescript
// executeAbility case:
case 'bard_march_of_wayfarers':
  applyPartyEffect('travel_discount', 2n, 60n, 'March of Wayfarers');
  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
    'March of Wayfarers lightens the party\'s step.');
  return;

// In movement.ts, stamina cost calculation:
const travelDiscountBuff = [...ctx.db.characterEffect.by_character.filter(traveler.id)]
  .reduce((sum, e) => e.effectType === 'travel_discount' ? sum + e.magnitude : sum, 0n);
const rawCost = staminaCost + costIncrease;
const totalDiscount = costDiscount + travelDiscountBuff;
const effectiveCost = rawCost > totalDiscount ? rawCost - totalDiscount : 0n;
```

---

## Current State: What Exists vs. What's New

### What Already Exists (Confirmed)
| Ability File | Current Count | Current Max Level | Keys in executeAbility |
|-------------|--------------|------------------|----------------------|
| warrior | 5 abilities | L5 (crusher_blow) | All 5 |
| cleric | 6 abilities | L6 (resurrect) | All 6 |
| wizard | 5 abilities | L5 (lightning_surge) | All 5 |
| rogue | 5 abilities | L5 (shadow_strike) | All 5 |
| ranger | 5 abilities | L5 (piercing_arrow) | All 5 |
| druid | 5 abilities | L5 (wild_surge) | All 5 |
| bard | 5 abilities | L5 (crushing_crescendo) | All 5 |
| monk | 5 abilities | L5 (tiger_flurry) | All 5 |
| paladin | 5 abilities | L5 (radiant_smite) | All 5 |
| shaman | 5 abilities | L5 (stormcall) | All 5 (incl. spirit_wolf pet) |
| necromancer | 6 abilities | L6 (corpse_summon) | All 6 (incl. bone_servant pet) |
| beastmaster | 5 abilities | L5 (alpha_assault) | All 5 (incl. call_beast pet) |
| enchanter | 5 abilities | L5 (charm_fray) | All 5 |
| reaver | 5 abilities | L5 (oblivion) | All 5 (incl. blood_rend lifesteal) |
| spellblade | 5 abilities | L5 (spellstorm) | All 5 |
| summoner | 6 abilities | L6 (corpse_summon) | All 6 (incl. earth_familiar pet) |

### What's New Per Class (Gap Analysis)
| Class | Abilities to Rewrite | Net New Abilities | New Mechanics Needed |
|-------|---------------------|-------------------|---------------------|
| Warrior | All 5 renamed/reshuffled + 1 new | +1 (Berserker Rage L10) | Berserker stance CharacterEffect |
| Cleric | All 6 reshuffled to odd levels | 0 net new | Group buff 45min duration |
| Wizard | All 5 + 1 new | +1 (Arcane Explosion L10) | AoE + high-power capstone |
| Rogue | All 5 reshuffled + 1 new | +1 (Death Mark L10) | Mark debuff |
| Ranger | All 5 renamed + 1 new | +1 (Rain of Arrows L10) | AoE physical |
| Druid | All 5 reshuffled + 2 new | +2 (Entangle L9, Shapeshifter L10) | AoE root DoT, HP buffer form |
| Bard | All 5 completely replaced + 1 new | +6 (all new) | BardSong table + scheduler, travel discount |
| Monk | All 5 reshuffled + 2 new | +2 (Stunning Strike L3, Hundred Fists L10) | Stun debuff |
| Paladin | All 5 reshuffled + 1 new | +1 (Consecrated Ground L10) | Ground AoE |
| Shaman | All 5 reshuffled + 1 new | +1 (Earthquake L10) | AoE stun |
| Necromancer | All 6 reshuffled + 2 new | +2 (Soul Rot L7, Plague Lord L10) | Life drain DoT, debuff DoT, Plague Lord form |
| Beastmaster | All 5 reshuffled + 1 new | +1 (Wild Hunt L10) | AoE/multi-hit |
| Enchanter | All 5 completely replaced + 1 new | +6 (all new) | Stun, group mana regen, haste, AoE debuff, charm-pet |
| Reaver | All 5 reshuffled + 1 new | +1 (Death's Embrace L10) | Life steal capstone |
| Spellblade | All 5 renamed + 1 new | +1 (Elemental Surge L10) | Multi-element capstone |
| Summoner | All 6 reshuffled + 2 new | +2 (Conjure Sustenance L3, Conjure Equipment L9, Primal Titan L10) | Conjure items, temp equipment |

**Total new switch cases needed in executeAbility:** approximately 40-50 new case entries.

### Level Remapping Required for Existing Keys
Many existing ability keys survive but at new levels. The data file changes the `level:` field; the switch case in `helpers/combat.ts` needs no change (same key, same behavior, new level gate). Keys that are being RENAMED require both old case removal and new case addition.

**Example — Warrior current vs. target:**
| Current Key | Current Level | New Key | New Level | Change Type |
|-------------|--------------|---------|-----------|-------------|
| warrior_slam | 1n | warrior_slam | 1n | Level same, behavior update |
| warrior_intimidating_presence | 2n | warrior_intimidating_presence | 3n | Level fix only |
| warrior_cleave | 3n | warrior_crushing_blow | 5n | Rename + level change |
| warrior_rally | 4n | warrior_cleave | 7n | Rename + level change |
| warrior_crushing_blow | 5n | warrior_rally | 9n | Rename + level change |
| (none) | — | warrior_berserker_rage | 10n | Fully new |

---

## Open Questions

1. **Life drain DoT — CombatEnemyEffect schema change vs. workaround**
   - What we know: Life drain (Necromancer L5 Wither, Reaver L1 Blood Rend) needs to heal the caster each tick. CombatEnemyEffect has no `ownerCharacterId` field.
   - What's unclear: Whether to add `ownerCharacterId: t.u64().optional()` to CombatEnemyEffect (schema change, requires republish with --clear-database) or implement via a new effectType that stores ownerCharacterId in a separate parallel structure.
   - Recommendation: Add `ownerCharacterId: t.u64().optional()` to CombatEnemyEffect. The field is optional so existing rows are unaffected. The combat loop's DoT processor checks for this field and applies healing to the owner if present.

2. **Reaver's Blood Rend is ALREADY lifesteal (30% leech on hit) — is this the same as "life drain DoT"?**
   - What we know: Current `reaver_blood_rend` case in executeAbility already does `applyHeal(character, leech, 'Blood Rend')` for 30% of damage dealt. This is instant lifesteal, not a DoT.
   - What's unclear: The design specifies "DoT that heals caster for % per tick" for Reaver L1. Current implementation is instant, not DoT.
   - Recommendation: The CONTEXT.md says "Life drain tick | Necromancer L5, Reaver L1 | DoT that heals caster for % per tick." This means Blood Rend's behavior must change from instant lifesteal to a DoT mechanic. The planner should implement this as a proper life drain DoT with `ownerCharacterId` tracking.

3. **BardSong — does "melody weaving" mean songs stack or are exclusive?**
   - What we know: The CONTEXT.md says "Active song table + 6s tick scheduler" and "1s cooldown" on all Bard abilities. "Melody weaving system required."
   - What's unclear: Whether multiple songs can be active simultaneously or only one at a time. The `ActiveBardSong` table with `by_bard` index suggests one row per bard — implying single active song.
   - Recommendation: One active song per bard (new song replaces old). The 1s cooldown means fast switching is possible but songs overwrite. The planner should implement single-song active system.

4. **Conjure Equipment items — what item templates to conjure?**
   - What we know: Summoner L9 Conjure Equipment creates "temp gear with affixes." `ItemTemplate` and `ItemInstance` tables exist. `addItemToInventory()` helper is available.
   - What's unclear: What specific templates to conjure and how to generate affixes.
   - Recommendation: Conjure gear appropriate to character level using existing `rollQualityTier()` and `generateAffixData()` helpers from `helpers/items.ts`. Mark as `isTemporary: true` on the new `ItemInstance` flag.

5. **Charm (Enchanter L10) — spawning a copy of the current target**
   - What we know: `summonPet()` creates pets with pre-defined stats. The enemy's current stats are available via `enemy` and `enemyTemplate` variables inside executeAbility.
   - What's unclear: How "copy of current target" is scoped — does it inherit exact current HP, or full HP? Does it inherit enemy abilities?
   - Recommendation: Spawn pet with enemy's `maxHp` (full HP copy), `attackDamage` from the enemy's current attack value. No pet ability key (keeps it simple). This is Claude's discretion territory.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `spacetimedb/src/data/ability_catalog.ts` — AbilityMetadata type definition
- `spacetimedb/src/data/abilities/*.ts` — all 16 class ability files (current state)
- `spacetimedb/src/schema/tables.ts` — AbilityTemplate, CharacterEffect, CombatEnemyEffect, CombatPet, ItemInstance schemas
- `spacetimedb/src/helpers/combat.ts` — executeAbility(), addCharacterEffect(), addEnemyEffect(), summonPet(), awardXp()
- `spacetimedb/src/reducers/combat.ts` — combat loop, effect processing, skip handler
- `spacetimedb/src/reducers/characters.ts` — create_character, no auto-ability-grant at level-up
- `spacetimedb/src/reducers/movement.ts` — travel stamina cost calculation
- `spacetimedb/src/seeding/ensure_items.ts` — ensureAbilityTemplates(), seeding pattern

### No External Sources Required
This is entirely an internal codebase investigation. No external library documentation was needed.

---

## Metadata

**Confidence breakdown:**
- Current ability file contents: HIGH — read directly
- executeAbility switch case coverage: HIGH — read directly
- CharacterEffect effectTypes in use: HIGH — enumerated from combat loop
- New backend system scope: HIGH — based on CONTEXT.md locked decisions + codebase gaps
- Power value recommendations: MEDIUM — based on existing range (0n-7n for L1-L5); L7-L10 values are Claude's discretion
- BardSong system design: MEDIUM — table structure is standard SpacetimeDB scheduled pattern, song semantics are inferred from "1s cooldown + weaving system"

**Research date:** 2026-02-20
**Valid until:** This research is based on codebase state as of the research date. Valid until any combat.ts or schema/tables.ts changes are merged.

---

## RESEARCH COMPLETE
