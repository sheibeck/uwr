---
phase: quick-181
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/abilities/enemy_abilities.ts
  - spacetimedb/src/data/ability_catalog.ts
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/index.ts
autonomous: true
must_haves:
  truths:
    - "ENEMY_ABILITIES is defined in exactly one place (enemy_abilities.ts)"
    - "All files that need ENEMY_ABILITIES import from data/abilities/enemy_abilities"
    - "ability_catalog.ts no longer exports ENEMY_ABILITIES"
    - "Every ENEMY_ABILITIES entry has a description field with flavour text"
    - "Combat log shows flavour description when enemy uses an ability"
  artifacts:
    - path: "spacetimedb/src/data/abilities/enemy_abilities.ts"
      provides: "Single source of truth for all enemy abilities with description field"
    - path: "spacetimedb/src/data/ability_catalog.ts"
      provides: "Only DamageType, AbilityMetadata, ABILITIES, GLOBAL_COOLDOWN_MICROS (no ENEMY_ABILITIES)"
  key_links:
    - from: "spacetimedb/src/helpers/combat.ts"
      to: "spacetimedb/src/data/abilities/enemy_abilities.ts"
      via: "import { ENEMY_ABILITIES }"
      pattern: "from.*abilities/enemy_abilities"
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "spacetimedb/src/data/abilities/enemy_abilities.ts"
      via: "import { ENEMY_ABILITIES }"
      pattern: "from.*abilities/enemy_abilities"
---

<objective>
Consolidate enemy abilities out of ability_catalog.ts into the canonical enemy_abilities.ts, add a description field to every ENEMY_ABILITIES entry, and surface that description in combat log messages when an enemy uses an ability.

Purpose: Remove duplicate data source that causes staleness bugs (ability_catalog copy was already missing targetRule). Add flavour text to make combat more immersive.
Output: Single source of truth for enemy abilities, richer combat logs.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/data/abilities/enemy_abilities.ts
@spacetimedb/src/data/ability_catalog.ts
@spacetimedb/src/helpers/combat.ts (executeEnemyAbility function, lines 1564-1744)
@spacetimedb/src/reducers/combat.ts (line 1, line 1808)
@spacetimedb/src/index.ts (line 53 - unused import)
@spacetimedb/src/seeding/ensure_world.ts (line 11 - already uses canonical)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add description field to all ENEMY_ABILITIES entries</name>
  <files>spacetimedb/src/data/abilities/enemy_abilities.ts</files>
  <action>
Add a `description` field (string) to every entry in ENEMY_ABILITIES. This is the flavour text shown in combat logs when the enemy uses the ability. Write short, evocative descriptions (10-20 words) that convey what the ability looks/feels like from the player's perspective.

Guidelines for descriptions by kind:
- **dot** (physical): focus on the wound/pain and ongoing effect. E.g. poison_bite: "Venomous fangs sink deep, leaving a festering wound that seeps poison."
- **dot** (magic): focus on magical visuals and burning/corruption. E.g. ember_burn: "Searing embers cling to flesh, igniting in waves of crackling flame."
- **debuff**: focus on the weakening/crushing effect. E.g. crushing_gore: "A brutal horn strike that cracks armor and leaves you staggering."
- **heal**: focus on dark/nature magic mending. E.g. shaman_heal: "Guttural chanting mends torn flesh with pulsing green light."
- **aoe_damage**: focus on area devastation. E.g. flame_burst: "A roiling eruption of fire scorches everything nearby."
- **buff**: focus on rallying/empowering allies. E.g. warchief_rally: "A thundering war cry that emboldens every nearby ally."

Add the description field after the `name` field in each entry for consistency. All 41 entries need descriptions. Here is the full list with suggested descriptions (adjust as you see fit for tone consistency):

DoT physical:
- poison_bite: "Venomous fangs sink deep, leaving a festering wound that seeps poison."
- rending_bite: "Savage jaws tear flesh in ragged strips."
- bleeding_shot: "A barbed arrow lodges in the wound, drawing blood with every movement."
- bog_slime: "Caustic muck splatters and burns, eating through armor."
- quick_nip: "A darting snap that draws a thin line of blood."
- thorn_venom: "Barbed thorns inject a slow-acting toxin that sears from within."
- blood_drain: "Lamprey-like tendrils latch on, siphoning lifeblood in dark pulses."
- rusty_bleed: "A jagged, corroded blade tears an ugly wound that refuses to close."
- stone_cleave: "A massive stone edge cleaves downward, splitting armor and bone."

DoT magic:
- ember_burn: "Searing embers cling to flesh, igniting in waves of crackling flame."
- shadow_rend: "Ribbons of living shadow slice through body and soul alike."
- scorching_snap: "A whip-crack of flame lashes out, leaving smoldering welts."
- ember_spark: "Tiny motes of fire burrow beneath the skin, burning from within."
- searing_talon: "White-hot claws rake across, leaving glowing furrows of pain."
- shadow_bleed: "Dark energy seeps into wounds, turning blood to black ichor."
- cinder_blight: "Choking ash and cinders smother and burn in equal measure."
- molten_bleed: "Liquid fire courses through open wounds, cauterizing nothing."

Debuff physical:
- crushing_gore: "A brutal horn strike that cracks armor and leaves you staggering."
- quake_stomp: "The ground itself buckles underfoot, shattering defensive stances."

Debuff magic:
- sapping_chant: "A droning incantation drains vitality, leaving limbs heavy and slow."
- withering_hex: "Cursed sigils etch into armor, weakening its protective wards."
- mire_curse: "Swamp magic seeps into joints, corroding metal and resolve."
- ember_slam: "A concussive blast of flame hammers defenses into ruin."
- chill_touch: "Spectral cold numbs the body and brittles armor to cracking."
- grave_shield_break: "Necrotic energy gnaws at protective enchantments, unraveling them."
- vault_crush: "Ancient stone magic grinds against your guard, pulverizing defenses."
- soot_hex: "A choking hex of black soot blinds and weakens in equal measure."

Heal:
- shaman_heal: "Guttural chanting mends torn flesh with pulsing green light."
- dark_mend: "Shadow-stitched wounds knit together with an unnatural dark glow."

AoE:
- flame_burst: "A roiling eruption of fire scorches everything nearby."
- quake_wave: "The earth splits and heaves, sending shockwaves through all who stand."

Night enemies (DoT physical):
- moth_dust: "A cloud of stinging scales billows forth, irritating exposed skin."
- plague_bite: "Diseased fangs clamp down, injecting filth into the bloodstream."
- shadow_pounce: "A blur of darkness slams into you, claws raking deep."
- venom_fang: "Needle-thin fangs deliver a burning venom that spreads fast."

Night enemies (DoT magic):
- spectral_flame: "Ghostly fire flickers to life, burning without heat but searing the soul."
- drowning_grasp: "Phantom water fills the lungs, choking without a drop in sight."
- soul_rend: "A spectral claw tears at the essence within, fraying life force."

Night enemies (debuff):
- sonic_screech: "An ear-splitting shriek rattles bones and loosens armor straps."

Buff:
- warchief_rally: "A thundering war cry that emboldens every nearby ally."
- bolster_defenses: "Dark magic hardens scales and toughens hides across the pack."
  </action>
  <verify>
Grep for `description:` in enemy_abilities.ts — should find 41 matches (one per ability).
Grep for entries WITHOUT description — should find 0 (every entry between `name:` and `castSeconds:` should have `description:`).
  </verify>
  <done>All 41 ENEMY_ABILITIES entries have a description field with flavour text.</done>
</task>

<task type="auto">
  <name>Task 2: Remove duplicate ENEMY_ABILITIES from ability_catalog.ts and re-point imports</name>
  <files>
    spacetimedb/src/data/ability_catalog.ts
    spacetimedb/src/helpers/combat.ts
    spacetimedb/src/reducers/combat.ts
    spacetimedb/src/index.ts
  </files>
  <action>
**Step 1: Remove ENEMY_ABILITIES from ability_catalog.ts**

Delete the entire `export const ENEMY_ABILITIES = { ... };` block from `spacetimedb/src/data/ability_catalog.ts` (lines 54-527). Leave the rest of the file intact (DamageType, AbilityMetadata, ABILITIES, GLOBAL_COOLDOWN_MICROS).

**Step 2: Update combat.ts import**

In `spacetimedb/src/helpers/combat.ts` line 38, change:
```typescript
import { ENEMY_ABILITIES } from '../data/ability_catalog';
```
to:
```typescript
import { ENEMY_ABILITIES } from '../data/abilities/enemy_abilities';
```

**Step 3: Update reducers/combat.ts import**

In `spacetimedb/src/reducers/combat.ts` line 1, change:
```typescript
import { ENEMY_ABILITIES } from '../data/ability_catalog';
```
to:
```typescript
import { ENEMY_ABILITIES } from '../data/abilities/enemy_abilities';
```

**Step 4: Remove unused ENEMY_ABILITIES import from index.ts**

In `spacetimedb/src/index.ts` lines 51-55, remove `ENEMY_ABILITIES` from the import. It is imported but never used in this file. Change:
```typescript
import {
  ABILITIES,
  ENEMY_ABILITIES,
  GLOBAL_COOLDOWN_MICROS,
} from './data/ability_catalog';
```
to:
```typescript
import {
  ABILITIES,
  GLOBAL_COOLDOWN_MICROS,
} from './data/ability_catalog';
```

**Step 5: Use description in combat log messages**

In `spacetimedb/src/helpers/combat.ts` inside `executeEnemyAbility` function, update the log messages for each ability kind to include the description. The `ability` variable already holds the ENEMY_ABILITIES entry. Access `(ability as any).description` (since the type is inferred from the const object). For each kind:

**dot (lines ~1614-1621):** Change the log messages from:
```typescript
const privateMessage = `${enemyName} uses ${ability.name} on you${dmgMsg}.`;
const groupMessage = `${enemyName} uses ${ability.name} on ${target.name}${dmgMsg}.`;
```
to:
```typescript
const desc = (ability as any).description ?? '';
const privateMessage = desc
  ? `${enemyName} uses ${ability.name} on you${dmgMsg}. ${desc}`
  : `${enemyName} uses ${ability.name} on you${dmgMsg}.`;
const groupMessage = desc
  ? `${enemyName} uses ${ability.name} on ${target.name}${dmgMsg}. ${desc}`
  : `${enemyName} uses ${ability.name} on ${target.name}${dmgMsg}.`;
```

**debuff (lines ~1640-1647):** Same pattern:
```typescript
const desc = (ability as any).description ?? '';
const privateMessage = desc
  ? `${enemyName} uses ${ability.name}${dmgMsg} afflicts you. ${desc}`
  : `${enemyName} uses ${ability.name}${dmgMsg} afflicts you.`;
const groupMessage = desc
  ? `${enemyName} uses ${ability.name}${dmgMsg} afflicts ${target.name}. ${desc}`
  : `${enemyName} uses ${ability.name}${dmgMsg} afflicts ${target.name}.`;
```

**aoe_damage (lines ~1708-1713):** Same pattern for both private and group:
```typescript
const desc = (ability as any).description ?? '';
appendPrivateEvent(ctx, pc.id, pc.ownerUserId, 'damage',
  desc
    ? `${enemyName} hits you with ${ability.name} for ${actualDamage}. ${desc}`
    : `${enemyName} hits you with ${ability.name} for ${actualDamage}.`);
if (pc.groupId) {
  appendGroupEvent(ctx, pc.groupId, pc.id, 'damage',
    desc
      ? `${enemyName} hits ${pc.name} with ${ability.name} for ${actualDamage}. ${desc}`
      : `${enemyName} hits ${pc.name} with ${ability.name} for ${actualDamage}.`);
}
```

**heal (lines ~1684-1685):** Add description to heal log:
```typescript
const desc = (ability as any).description ?? '';
const healMsg = desc
  ? `${enemyName} heals ${healTargetName} for ${directHeal}. ${desc}`
  : `${enemyName} heals ${healTargetName} for ${directHeal}.`;
appendPrivateEvent(ctx, pc.id, pc.ownerUserId, 'combat', healMsg);
```
And same for the group event at line ~1692-1693.

**buff (lines ~1731-1732):** Add description to buff log:
```typescript
const desc = (ability as any).description ?? '';
const buffMsg = desc
  ? `${enemyName} rallies allies with ${ability.name}! ${desc}`
  : `${enemyName} rallies allies with ${ability.name}!`;
appendPrivateEvent(ctx, pc.id, pc.ownerUserId, 'combat', buffMsg);
```
And same for the group event at line ~1739-1740.

Note: Extract `desc` once at the top of the function (right after `if (!ability) return;` on line 1574) so it is available in all branches:
```typescript
const desc = (ability as any).description ?? '';
```
Then use `desc` in each branch's log messages.
  </action>
  <verify>
1. Grep for `ENEMY_ABILITIES` in ability_catalog.ts — should find 0 matches.
2. Grep for `from.*ability_catalog` in helpers/combat.ts — should find 0 matches.
3. Grep for `ENEMY_ABILITIES.*ability_catalog` in reducers/combat.ts — should find 0 matches.
4. Grep for `ENEMY_ABILITIES` in index.ts — should find 0 matches.
5. Grep for `from.*abilities/enemy_abilities` in helpers/combat.ts — should find 1 match.
6. Grep for `from.*abilities/enemy_abilities` in reducers/combat.ts — should find 1 match.
7. Grep for `desc` in combat.ts executeEnemyAbility — should find references in log messages.
8. Run `cd spacetimedb && npx tsc --noEmit` to verify no type errors from the import changes.
  </verify>
  <done>
ENEMY_ABILITIES only exists in enemy_abilities.ts. All consumers import from the canonical source. ability_catalog.ts no longer exports ENEMY_ABILITIES. Combat log messages include the flavour description for all ability kinds (dot, debuff, heal, aoe_damage, buff).
  </done>
</task>

</tasks>

<verification>
- `grep -r "ENEMY_ABILITIES" spacetimedb/src/data/ability_catalog.ts` returns nothing
- `grep -r "from.*ability_catalog.*ENEMY" spacetimedb/src/` returns nothing
- `grep -c "description:" spacetimedb/src/data/abilities/enemy_abilities.ts` returns 41
- `npx tsc --noEmit` in spacetimedb/ passes with no errors
- Combat log messages in executeEnemyAbility include description text for all 5 ability kinds
</verification>

<success_criteria>
- ENEMY_ABILITIES defined in exactly one file (enemy_abilities.ts)
- All 41 entries have a description field
- helpers/combat.ts and reducers/combat.ts import from abilities/enemy_abilities
- index.ts no longer imports ENEMY_ABILITIES at all
- Combat log messages append the description flavour text when an enemy uses any ability type
- TypeScript compilation passes
</success_criteria>

<output>
After completion, create `.planning/quick/181-consolidate-enemy-abilities-out-of-abili/181-SUMMARY.md`
</output>
