---
phase: quick-320
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [QUICK-320]
must_haves:
  truths:
    - "Discordant Note damage per target uses the standard ability scaling pipeline (power*5 + hybrid stat scaling) * abilityMultiplier, then AOE_DAMAGE_MULTIPLIER (65%)"
    - "All 3 Discordant Note damage locations (on-cast, song tick, Finale burst) produce identical per-target damage"
    - "Discordant Note deals less damage per target than before (was using custom formula that overshot standard scaling)"
  artifacts:
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "On-cast immediate tick and Finale burst using standard AoE damage"
      contains: "AOE_DAMAGE_MULTIPLIER"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Song tick using standard AoE damage"
      contains: "AOE_DAMAGE_MULTIPLIER"
  key_links:
    - from: "spacetimedb/src/helpers/combat.ts"
      to: "spacetimedb/src/data/combat_scaling.ts"
      via: "AOE_DAMAGE_MULTIPLIER, getAbilityStatScaling, getAbilityMultiplier"
      pattern: "AOE_DAMAGE_MULTIPLIER"
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "spacetimedb/src/data/combat_scaling.ts"
      via: "AOE_DAMAGE_MULTIPLIER, getAbilityStatScaling, getAbilityMultiplier"
      pattern: "AOE_DAMAGE_MULTIPLIER"
---

<objective>
Fix Discordant Note to use the standard 65% AoE damage scaling pipeline instead of a custom formula that produces higher-than-intended damage.

Purpose: Discordant Note currently uses a custom formula `(8n + level*2n + cha) * 65n / 100n` that produces significantly more damage per target than the standard ability scaling pipeline would. At level 10 / CHA 20, the custom formula gives ~31 damage vs the standard pipeline's ~18. The Finale burst uses yet another unrelated formula `5n + level`. All 3 damage locations need to use the same standard scaling: `(power*5 + hybridStatScaling) * abilityMultiplier / 100 * AOE_DAMAGE_MULTIPLIER / 100`.

Output: Updated combat files with consistent, standard-pipeline Discordant Note damage.
</objective>

<context>
@spacetimedb/src/helpers/combat.ts (on-cast line 1015, Finale line 1076)
@spacetimedb/src/reducers/combat.ts (song tick line 1814)
@spacetimedb/src/data/combat_scaling.ts (AOE_DAMAGE_MULTIPLIER=65n, getAbilityStatScaling, getAbilityMultiplier)
@spacetimedb/src/data/abilities/bard_abilities.ts (bard_discordant_note: power=2, cooldownSeconds=1, castSeconds=0)
@spacetimedb/src/data/combat_scaling.ts line 204 (bard_discordant_note scaling type = 'hybrid')
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix Discordant Note damage in helpers/combat.ts (on-cast + Finale)</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
Replace the custom Discordant Note damage formula in TWO places within helpers/combat.ts with the standard ability scaling pipeline.

The standard AoE per-target damage formula is:
```
abilityBaseDamage = power * 5n  (power=2n for Discordant Note, so 10n)
statScaling = getAbilityStatScaling(characterStats, 'bard_discordant_note', character.className, 'hybrid')
abilityMultiplier = getAbilityMultiplier(0n, 1n)  // castSeconds=0, cooldownSeconds=1
scaledDamage = ((abilityBaseDamage + statScaling) * abilityMultiplier) / 100n
perTargetDamage = (scaledDamage * AOE_DAMAGE_MULTIPLIER) / 100n
```

Note: `getAbilityStatScaling` and `getAbilityMultiplier` and `AOE_DAMAGE_MULTIPLIER` are already imported in this file.

**Location 1 — On-cast immediate tick (around line 1011-1029):**
Replace the existing formula:
```typescript
const burstDmg = ((8n + character.level * 2n + character.cha) * 65n) / 100n;
```
With standard scaling:
```typescript
const abilityBase = 2n * 5n;  // Discordant Note power=2
const statScale = getAbilityStatScaling(
  { str: character.str, dex: character.dex, cha: character.cha, wis: character.wis, int: character.int },
  'bard_discordant_note', character.className, 'hybrid'
);
const abilityMult = getAbilityMultiplier(0n, 1n);
const scaledDmg = ((abilityBase + statScale) * abilityMult) / 100n;
const burstDmg = (scaledDmg * AOE_DAMAGE_MULTIPLIER) / 100n;
```

**Location 2 — Finale burst (around line 1074-1079):**
Replace the existing formula:
```typescript
const dmg = 5n + character.level;
```
With the same standard scaling (identical to Location 1):
```typescript
const abilityBase = 2n * 5n;
const statScale = getAbilityStatScaling(
  { str: character.str, dex: character.dex, cha: character.cha, wis: character.wis, int: character.int },
  'bard_discordant_note', character.className, 'hybrid'
);
const abilityMult = getAbilityMultiplier(0n, 1n);
const scaledDmg = ((abilityBase + statScale) * abilityMult) / 100n;
const dmg = (scaledDmg * AOE_DAMAGE_MULTIPLIER) / 100n;
```

Do NOT change anything else about the surrounding logic (mana cost, log messages, enemy HP updates, etc.).
  </action>
  <verify>Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` from the repo root — no type errors.</verify>
  <done>Both on-cast and Finale Discordant Note damage use the standard `(power*5 + hybridStatScaling) * abilityMultiplier / 100 * AOE_DAMAGE_MULTIPLIER / 100` formula instead of custom formulas.</done>
</task>

<task type="auto">
  <name>Task 2: Fix Discordant Note damage in reducers/combat.ts (song tick)</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
Replace the custom Discordant Note damage formula in the song tick scheduled reducer with the standard ability scaling pipeline.

**Step 1 — Add missing imports:**
Add `AOE_DAMAGE_MULTIPLIER`, `getAbilityStatScaling`, and `getAbilityMultiplier` to the existing import from `'../data/combat_scaling'`.

The file already has two import statements from `'../data/combat_scaling'` (lines 3 and 5). Add the three new identifiers to one of them. For example, extend the line 5 import:
```typescript
import { TANK_THREAT_MULTIPLIER, HEALER_THREAT_MULTIPLIER, SUMMONER_THREAT_MULTIPLIER, SUMMONER_PET_INITIAL_AGGRO, HEALING_THREAT_PERCENT, AOE_DAMAGE_MULTIPLIER, getAbilityStatScaling, getAbilityMultiplier } from '../data/combat_scaling';
```

**Step 2 — Replace song tick damage formula (around line 1810-1818):**
Replace:
```typescript
const dmg = ((8n + bard.level * 2n + bard.cha) * 65n) / 100n;
```
With:
```typescript
const abilityBase = 2n * 5n;  // Discordant Note power=2
const statScale = getAbilityStatScaling(
  { str: bard.str, dex: bard.dex, cha: bard.cha, wis: bard.wis, int: bard.int },
  'bard_discordant_note', bard.className, 'hybrid'
);
const abilityMult = getAbilityMultiplier(0n, 1n);
const scaledDmg = ((abilityBase + statScale) * abilityMult) / 100n;
const dmg = (scaledDmg * AOE_DAMAGE_MULTIPLIER) / 100n;
```

Do NOT change anything else — mana cost, log messages, HP updates, etc. remain the same.
  </action>
  <verify>Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` from the repo root — no type errors. Then grep all three files for the old formula pattern `8n + ` to confirm no remnants: `grep -rn "8n + " spacetimedb/src/helpers/combat.ts spacetimedb/src/reducers/combat.ts` should return zero Discordant Note matches.</verify>
  <done>Song tick Discordant Note damage uses the standard pipeline with AOE_DAMAGE_MULTIPLIER. All 3 Discordant Note damage locations now produce identical per-target damage using the standard scaling formula.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit --project spacetimedb/tsconfig.json` passes with no errors.
2. Grep for old formula pattern: `grep -n "8n +" spacetimedb/src/helpers/combat.ts spacetimedb/src/reducers/combat.ts` returns no Discordant Note matches.
3. Grep for old Finale formula: `grep -n "5n + character.level" spacetimedb/src/helpers/combat.ts` returns no matches.
4. Grep confirms `AOE_DAMAGE_MULTIPLIER` appears in all 3 Discordant Note damage blocks: `grep -n "AOE_DAMAGE_MULTIPLIER" spacetimedb/src/helpers/combat.ts spacetimedb/src/reducers/combat.ts` shows matches at on-cast, Finale, and song tick locations.
</verification>

<success_criteria>
- All 3 Discordant Note damage locations (on-cast, song tick, Finale) use the standard formula: (power*5 + hybridStatScaling) * abilityMultiplier / 100 * AOE_DAMAGE_MULTIPLIER / 100
- No hardcoded damage formulas remain for Discordant Note
- AOE_DAMAGE_MULTIPLIER constant (65n) is used instead of hardcoded 65n
- TypeScript compiles without errors
- Discordant Note damage is lower than before at all levels (standard pipeline produces less than custom formula)
</success_criteria>
