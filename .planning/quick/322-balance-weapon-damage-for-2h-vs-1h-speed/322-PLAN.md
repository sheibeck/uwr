---
phase: quick-322
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/seeding/ensure_items.ts
  - spacetimedb/src/data/item_defs.ts
  - spacetimedb/src/data/named_enemy_defs.ts
autonomous: true
requirements: [BALANCE-WEAPONS]
must_haves:
  truths:
    - "2H weapons (staff, bow, greatsword) deal significantly more damage per hit than 1H weapons"
    - "2H weapons have roughly equal or slightly higher effective DPS than equivalent 1H weapons despite slower speed"
    - "Starter weapons are slightly weaker than same-tier world drops across all weapon types"
    - "Boss drops remain the strongest weapons per tier"
    - "Fast weapons (dagger, rapier) still have lowest per-hit but compensate with speed"
  artifacts:
    - path: "spacetimedb/src/seeding/ensure_items.ts"
      provides: "Rebalanced STARTER_WEAPON_STATS"
      contains: "STARTER_WEAPON_STATS"
    - path: "spacetimedb/src/data/item_defs.ts"
      provides: "Rebalanced WORLD_DROP_GEAR_DEFS weapon entries"
      contains: "weaponBaseDamage"
    - path: "spacetimedb/src/data/named_enemy_defs.ts"
      provides: "Rebalanced BOSS_DROP_DEFS weapon entries"
      contains: "weaponBaseDamage"
  key_links:
    - from: "spacetimedb/src/seeding/ensure_items.ts"
      to: "spacetimedb/src/reducers/combat.ts"
      via: "weaponBaseDamage/weaponDps used in rawWeaponDamage formula"
      pattern: "weapon\\.baseDamage"
---

<objective>
Balance all weapon damage values so 2H weapons deal more damage per hit than 1H weapons,
DPS is roughly equalized across speed tiers, and starter weapons are slightly weaker than
equivalent world drops.

Purpose: Currently 2H weapons (staff, bow, greatsword) actually have LOWER DPS than 1H weapons
despite swinging 40-67% slower. The per-hit damage difference is negligible. This makes 2H
weapons feel terrible — players lose an offhand slot for no damage benefit.

Output: Rebalanced baseDamage and dps values across all three weapon data sources (starter,
world drop, boss drop).
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/seeding/ensure_items.ts (STARTER_WEAPON_STATS on lines 187-197)
@spacetimedb/src/data/item_defs.ts (WORLD_DROP_GEAR_DEFS weapon entries, lines 151-214)
@spacetimedb/src/data/named_enemy_defs.ts (BOSS_DROP_DEFS weapon entries)
@spacetimedb/src/data/combat_constants.ts (WEAPON_SPEED_MICROS — speed tiers)
@spacetimedb/src/data/combat_scaling.ts (calculateStatScaledAutoAttack)
@spacetimedb/src/reducers/combat.ts (line 2337 — rawWeaponDamage formula)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rebalance all weapon baseDamage and dps values</name>
  <files>
    spacetimedb/src/seeding/ensure_items.ts
    spacetimedb/src/data/item_defs.ts
    spacetimedb/src/data/named_enemy_defs.ts
  </files>
  <action>
The combat auto-attack damage formula is (line 2337 of combat.ts):
```
rawWeaponDamage = 5n + character.level + weapon.baseDamage + (weapon.dps / 2n)
```
Then: `statScaledDamage = rawWeaponDamage + (rawWeaponDamage * str * 15n) / 1000n`

Effective DPS = rawWeaponDamage / (speed_seconds).

Weapon speed tiers (from combat_constants.ts):
- Fast (3.0s): dagger, rapier
- Normal (3.5s): sword, blade, mace
- Medium (4.0s): axe
- Slow (5.0s): staff, bow, greatsword (all 2H)

Design goals:
- Target ~3.5 effective raw DPS at level 1 for all speed tiers (before STR scaling)
- 2H weapons should have ~5-8 more raw damage per hit than fast 1H weapons
- Starter weapons: ~85-90% of world drop damage
- Boss drops: ~120-130% of world drop damage

**STARTER_WEAPON_STATS** in ensure_items.ts (lines 187-197):
Rebalance to these values:

```typescript
const STARTER_WEAPON_STATS: Record<string, { baseDamage: bigint; dps: bigint }> = {
  dagger:     { baseDamage: 2n, dps: 3n },  // Fast 3.0s  — raw: 5+1+2+1 = 9, DPS: 3.0
  rapier:     { baseDamage: 2n, dps: 3n },  // Fast 3.0s  — raw: 9, DPS: 3.0
  sword:      { baseDamage: 3n, dps: 4n },  // Normal 3.5s — raw: 5+1+3+2 = 11, DPS: 3.14
  blade:      { baseDamage: 3n, dps: 4n },  // Normal 3.5s — raw: 11, DPS: 3.14
  mace:       { baseDamage: 3n, dps: 4n },  // Normal 3.5s — raw: 11, DPS: 3.14
  axe:        { baseDamage: 4n, dps: 5n },  // Medium 4.0s — raw: 5+1+4+2 = 12, DPS: 3.0
  staff:      { baseDamage: 7n, dps: 8n },  // Slow 5.0s  — raw: 5+1+7+4 = 17, DPS: 3.4
  bow:        { baseDamage: 7n, dps: 8n },  // Slow 5.0s  — raw: 17, DPS: 3.4
  greatsword: { baseDamage: 8n, dps: 9n },  // Slow 5.0s  — raw: 5+1+8+4 = 18, DPS: 3.6
};
```

Key change: staff/bow go from baseDamage 4/dps 5 to baseDamage 7/dps 8. Greatsword goes from 5/6 to 8/9. This makes 2H hit for ~17-18 raw vs 1H ~9-12, nearly double per swing which compensates for 40-67% slower speed. DPS normalizes around 3.0-3.6 across all types, with greatsword slightly ahead as the "pure damage" 2H choice.

**WORLD_DROP_GEAR_DEFS** in item_defs.ts:
Update all weapon entries to be ~10-15% stronger than starter equivalents. Apply the same 2H > 1H scaling philosophy.

Tier 1 world drop weapons (requiredLevel: 1n):
- Iron Shortsword (sword): baseDamage 4n, dps 5n (raw: 5+1+4+2=12, DPS 3.43)
- Hunting Bow (bow): baseDamage 8n, dps 10n (raw: 5+1+8+5=19, DPS 3.8)
- Gnarled Staff (staff): baseDamage 8n, dps 10n (raw: 19, DPS 3.8)
- Worn Mace (mace): baseDamage 4n, dps 5n (raw: 12, DPS 3.43)
- Rusty Axe (axe): baseDamage 5n, dps 7n (raw: 5+1+5+3=14, DPS 3.5)
- Notched Rapier (rapier): baseDamage 3n, dps 4n (raw: 5+1+3+2=11, DPS 3.67)
- Chipped Dagger (dagger): baseDamage 3n, dps 4n (raw: 11, DPS 3.67)
- Cracked Blade (blade): baseDamage 4n, dps 5n (raw: 12, DPS 3.43)
- Crude Greatsword (greatsword): baseDamage 9n, dps 11n (raw: 5+1+9+5=20, DPS 4.0)

Tier 2 world drop weapons (requiredLevel: 11n):
- Steel Longsword (sword): baseDamage 6n, dps 7n (raw: 5+11+6+3=25, DPS 7.14)
- Yew Bow (bow): baseDamage 11n, dps 13n (raw: 5+11+11+6=33, DPS 6.6)
- Oak Staff (staff): baseDamage 11n, dps 13n (raw: 33, DPS 6.6)
- Steel Greatsword (greatsword): baseDamage 12n, dps 14n (raw: 5+11+12+7=35, DPS 7.0)
- Flanged Mace (mace): baseDamage 6n, dps 7n (raw: 25, DPS 7.14)
- Hardened Axe (axe): baseDamage 8n, dps 10n (raw: 5+11+8+5=29, DPS 7.25)
- Stiletto (dagger): baseDamage 4n, dps 6n (raw: 5+11+4+3=23, DPS 7.67)
- Dueling Rapier (rapier): baseDamage 4n, dps 6n (raw: 23, DPS 7.67)
- Tempered Blade (blade): baseDamage 6n, dps 7n (raw: 25, DPS 7.14)

**BOSS_DROP_DEFS** in named_enemy_defs.ts:
Boss drops should remain the strongest per tier. Review each boss weapon and ensure 2H boss weapons follow the same pattern (higher baseDamage than 1H boss weapons).

Tier 1 boss weapons (requiredLevel: 1n or 3n):
- Venomfang (dagger, T1 req1): baseDamage 5n, dps 7n — OK, fast weapon, higher than world drop dagger
- Mirewalker's Bludgeon (mace, T1 req1): baseDamage 6n, dps 8n — OK, higher than world drop mace
- Briarwood Staff (staff, T1 req1): baseDamage 10n, dps 12n (was 8/9 — bump to match 2H philosophy; raw: 5+1+10+6=22, DPS 4.4)
- Crag Tyrant's Edge (greatsword, T1 req3): baseDamage 11n, dps 12n (was 8/9 — bump; raw: 5+3+11+6=25, DPS 5.0)
- Hexweaver's Rod (staff, T1 req3): baseDamage 9n, dps 10n (was 7/7 — bump; raw: 5+3+9+5=22, DPS 4.4)
- Nightfang Ritual Knife (dagger, T1 req3): baseDamage 4n, dps 5n — leave as is (fast weapon, has manaBonus)
- Scorchfang Fang (blade, T1 req3): baseDamage 5n, dps 7n — leave as is (normal speed, has dual stat bonus)
- Ashwarden's Cleaver (axe, T1 req3): baseDamage 7n, dps 9n — leave as is (medium speed, OK)
- Dirge of the Fallen (rapier, T1 req3): baseDamage 4n, dps 5n — leave as is (fast, has chaBonus)

Tier 2 boss weapons (requiredLevel: 5n or 7n):
- Pyrelord's Flamebrand (greatsword, req5): baseDamage 15n, dps 16n (was 12/13 — bump for 2H; raw: 5+5+15+8=33, DPS 6.6)
- Ashen Conduit (staff, req5): baseDamage 13n, dps 14n (was 10/10 — bump for 2H; raw: 5+5+13+7=30, DPS 6.0)
- Sacrificial Edge (dagger, req5): baseDamage 6n, dps 7n — leave as is (fast, has hpBonus)
- Matriarch's Longbow (bow, req7): baseDamage 13n, dps 14n (was 10/10 — bump for 2H; raw: 5+7+13+7=32, DPS 6.4)

The key principle: for every speed tier, verify that:
1. per-hit raw damage scales: fast < normal < medium < slow (2H)
2. DPS roughly normalizes but 2H gets a slight premium (~5-10% higher) to compensate for losing offhand slot

Do NOT modify combat.ts formula or weapon speed values. Only change the data constants.
Add inline comments showing the DPS math for each weapon entry as a sanity check.
  </action>
  <verify>
    Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` to confirm no type errors.
    Manually verify in the data files that:
    1. Every 2H weapon (staff/bow/greatsword) has higher baseDamage than same-tier 1H weapons
    2. Starter weapons are weaker than world drops of same type
    3. Boss weapons are stronger than world drops of same type
    4. No weapon has baseDamage 0n or negative values
  </verify>
  <done>
    All weapon baseDamage and dps values across starter, world drop, and boss drop definitions
    follow the 2H > 1H per-hit damage pattern with normalized DPS. Starter weapons are ~85-90%
    of world drop equivalents. Boss weapons exceed world drops. TypeScript compiles cleanly.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles with no errors
- 2H starter weapons (staff/bow/greatsword) have baseDamage >= 7n (was 4-5n)
- 2H world drops have baseDamage >= 8n at T1 (was 6-7n)
- All starter weapons have lower baseDamage AND dps than same-type T1 world drops
- All boss weapons have higher baseDamage AND dps than same-type same-tier world drops
</verification>

<success_criteria>
Weapon damage hierarchy is correct across all data files: fast 1H < normal 1H < medium 1H < slow 2H per hit, with DPS roughly normalized. Starter < World Drop < Boss at each tier.
</success_criteria>

<output>
After completion, create `.planning/quick/322-balance-weapon-damage-for-2h-vs-1h-speed/322-SUMMARY.md`
</output>
