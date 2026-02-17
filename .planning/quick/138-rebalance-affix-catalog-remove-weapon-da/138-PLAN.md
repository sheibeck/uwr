---
phase: quick-138
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/affix_catalog.ts
autonomous: true
must_haves:
  truths:
    - "No affix in the catalog uses statKey 'weaponBaseDamage'"
    - "Stat affixes (str/dex/int/wis) cap at +4 for legendary tier on weapons and accessories"
    - "HP affixes cap at +25 (armor) and +18 (accessories) at legendary — not 35"
    - "AC affixes cap at +4 (sturdy/resilience) and +6 (fortified) at legendary"
    - "Legendary 'Dreadmaw' no longer has weaponBaseDamage — replaced with strBonus at magnitude 4n"
    - "Module published and affix data resynced in database"
  artifacts:
    - path: "spacetimedb/src/data/affix_catalog.ts"
      provides: "Rebalanced affix definitions"
      contains: "weaponBaseDamage"
      note: "weaponBaseDamage must NOT appear as any affix statKey"
  key_links:
    - from: "spacetimedb/src/data/affix_catalog.ts"
      to: "spacetimedb/src/helpers/items.ts generateAffixData"
      via: "PREFIXES/SUFFIXES arrays"
      pattern: "PREFIXES|SUFFIXES"
---

<objective>
Remove the `weaponBaseDamage` affix type from the catalog entirely and rebalance magnitude ranges
across all affix types to prevent double-dipping and power creep.

Purpose: The "Keen" prefix grants flat +weaponBaseDamage, which double-dips with STR scaling
(1.5%/point multiplicative). Since STR already multiplies the weapon base damage, adding flat base
damage ON TOP is compounded again by STR — making a "Keen ... of Power" weapon (weaponBaseDamage +
strBonus) dramatically stronger than intended. Stat affixes are the right primary offensive driver;
utility affixes (lifeOnHit, manaRegen, cooldownReduction) are quality-of-life bonuses.

Output: Rebalanced affix_catalog.ts with no weaponBaseDamage affixes, sensible magnitude caps, and
a republished module so database affix data reflects the new catalog.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/data/affix_catalog.ts
@spacetimedb/src/helpers/items.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite affix_catalog.ts — remove weaponBaseDamage, rebalance magnitudes</name>
  <files>spacetimedb/src/data/affix_catalog.ts</files>
  <action>
Replace the entire PREFIXES and SUFFIXES arrays and the LEGENDARIES array with the rebalanced
definitions below. Keep all other exports (QUALITY_TIERS, AFFIX_COUNT_BY_QUALITY,
QUALITY_TIER_COLORS, QUALITY_TIER_NUMBER) unchanged.

## Design rationale for each change

**weaponBaseDamage removal:**
The `keen` prefix (weaponBaseDamage [2,4,7,10]) is removed entirely. Flat +base damage double-dips
because STR multiplies weapon base damage at 1.5%/point, so a +10 base damage affix on a weapon
wielded by a 20 STR character effectively becomes +13 damage. There is no design space where flat
bonus-to-base is cleaner than just granting +STR. Removing this stat makes the damage scaling
cleaner and gear evaluation simpler.

**Replacing keen in PREFIXES:** Add `fierce` prefix (strBonus) for weapons — a thematic
strength-focused alternative to the existing `mighty` prefix. This gives weapons two str-prefix
options (`mighty` and `fierce`) which is fine because str is the primary melee damage stat.

**HP affix magnitudes (vital, of_endurance, of_vigor):**
Current legendary values of 35 (armor) and 25 (accessory) are too high. With base HP ~170 at
level 10 for a typical warrior, two epic affixes (vital + of_endurance) would grant 40 HP — that's
23% of base which is reasonable at epic. But at legendary the 35+35=70 HP from two affixes (41%)
is excessive. Reduce to [5,8,15,25] for armor HP affixes and [3,6,10,18] for accessories.

**AC affix magnitudes (sturdy, of_resilience, fortified):**
World-drop gear has AC values of 1-10 on individual pieces (tier-1 armor is 3-6 AC). The `fortified`
legendary tier at 8 AC is nearly a full armor piece worth of AC from one affix — too high. Reduce:
- sturdy/of_resilience: [1,2,3,4] (was [1,2,3,5])
- fortified: [0,2,4,6] (was [0,3,5,8])

**Magic resistance (warded, of_warding):** Minor trim on high end.
- warded: [1,2,3,5] (was [1,2,4,6])
- of_warding: [0,2,3,5] (was [0,2,4,7])

**Stat affixes (str/dex/int/wis) on weapons, armor, accessories:** Keep [1,2,3,4] — these are
correct. A +4 stat at legendary is impactful but not broken; the cascading effect through combat
scaling is exactly the intended design (finding +STR gear should feel exciting).

**Dreadmaw legendary:** Replace `keen` (weaponBaseDamage: 10n) with `mighty` (strBonus: 4n).
A legendary axe with +4 STR and +4 STR from the suffix would be very powerful — so use magnitude
3n for the prefix to distinguish from the cap. Actually use the exact same magnitude as the
`mighty` catalog entry at tier 4: 4n. Two +STR affixes on a legendary weapon is fine thematically
("this weapon makes you stronger AND is wielded by the powerful"). Keep of_power strBonus: 4n.

## Final PREFIXES array

```typescript
export const PREFIXES: AffixDef[] = [
  // --- Weapon-slot offensive prefixes ---
  {
    key: 'mighty',
    name: 'Mighty',
    type: 'prefix',
    slots: ['mainHand', 'offHand'],
    statKey: 'strBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'fierce',
    name: 'Fierce',
    type: 'prefix',
    slots: ['mainHand', 'offHand'],
    statKey: 'strBonus',
    minTier: 2,
    magnitudeByTier: [0n, 2n, 3n, 4n],
  },
  {
    key: 'swift',
    name: 'Swift',
    type: 'prefix',
    slots: ['mainHand', 'offHand'],
    statKey: 'dexBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'arcane',
    name: 'Arcane',
    type: 'prefix',
    slots: ['mainHand', 'offHand'],
    statKey: 'intBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'wise',
    name: 'Wise',
    type: 'prefix',
    slots: ['mainHand', 'offHand'],
    statKey: 'wisBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'vampiric',
    name: 'Vampiric',
    type: 'prefix',
    slots: ['mainHand', 'offHand'],
    statKey: 'lifeOnHit',
    minTier: 3,
    magnitudeByTier: [0n, 0n, 3n, 5n],
  },

  // --- Armor-slot defensive prefixes ---
  {
    key: 'sturdy',
    name: 'Sturdy',
    type: 'prefix',
    slots: ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt'],
    statKey: 'armorClassBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'vital',
    name: 'Vital',
    type: 'prefix',
    slots: ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt'],
    statKey: 'hpBonus',
    minTier: 1,
    magnitudeByTier: [5n, 8n, 15n, 25n],
  },
  {
    key: 'warded',
    name: 'Warded',
    type: 'prefix',
    slots: ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt'],
    statKey: 'magicResistanceBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 5n],
  },
  {
    key: 'fortified',
    name: 'Fortified',
    type: 'prefix',
    slots: ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt'],
    statKey: 'armorClassBonus',
    minTier: 2,
    magnitudeByTier: [0n, 2n, 4n, 6n],
  },

  // --- Accessory-slot mixed prefixes ---
  {
    key: 'empowered',
    name: 'Empowered',
    type: 'prefix',
    slots: ['neck', 'earrings', 'cloak'],
    statKey: 'intBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'resolute',
    name: 'Resolute',
    type: 'prefix',
    slots: ['neck', 'earrings', 'cloak'],
    statKey: 'wisBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
];
```

## Final SUFFIXES array

```typescript
export const SUFFIXES: AffixDef[] = [
  // --- Weapon-slot offensive suffixes ---
  {
    key: 'of_power',
    name: 'of Power',
    type: 'suffix',
    slots: ['mainHand', 'offHand'],
    statKey: 'strBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'of_precision',
    name: 'of Precision',
    type: 'suffix',
    slots: ['mainHand', 'offHand'],
    statKey: 'dexBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'of_haste',
    name: 'of Haste',
    type: 'suffix',
    slots: ['mainHand', 'offHand'],
    statKey: 'cooldownReduction',
    minTier: 3,
    magnitudeByTier: [0n, 0n, 10n, 15n],
  },

  // --- Armor-slot defensive suffixes ---
  {
    key: 'of_endurance',
    name: 'of Endurance',
    type: 'suffix',
    slots: ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt'],
    statKey: 'hpBonus',
    minTier: 1,
    magnitudeByTier: [5n, 8n, 15n, 25n],
  },
  {
    key: 'of_strength',
    name: 'of Strength',
    type: 'suffix',
    slots: ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt'],
    statKey: 'strBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'of_the_mind',
    name: 'of the Mind',
    type: 'suffix',
    slots: ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt'],
    statKey: 'intBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'of_warding',
    name: 'of Warding',
    type: 'suffix',
    slots: ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt'],
    statKey: 'magicResistanceBonus',
    minTier: 2,
    magnitudeByTier: [0n, 2n, 3n, 5n],
  },
  {
    key: 'of_resilience',
    name: 'of Resilience',
    type: 'suffix',
    slots: ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt'],
    statKey: 'armorClassBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },

  // --- Accessory-slot mixed suffixes ---
  {
    key: 'of_mana_flow',
    name: 'of Mana Flow',
    type: 'suffix',
    slots: ['neck', 'earrings', 'cloak'],
    statKey: 'manaRegen',
    minTier: 3,
    magnitudeByTier: [0n, 0n, 5n, 8n],
  },
  {
    key: 'of_insight',
    name: 'of Insight',
    type: 'suffix',
    slots: ['neck', 'earrings', 'cloak'],
    statKey: 'wisBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'of_vigor',
    name: 'of Vigor',
    type: 'suffix',
    slots: ['neck', 'earrings', 'cloak'],
    statKey: 'hpBonus',
    minTier: 1,
    magnitudeByTier: [3n, 6n, 10n, 18n],
  },
];
```

## Dreadmaw legendary fix

In LEGENDARIES, find the `dreadmaw` entry. Replace its first affix (currently `keen`/weaponBaseDamage)
with:
```typescript
{
  affixKey: 'mighty',
  type: 'prefix',
  statKey: 'strBonus',
  magnitude: 4n,
  affixName: 'Mighty',
},
```
Keep the second affix (`of_power` / strBonus / 4n) unchanged. The resulting legendary is
"Mighty Training Axe of Power" — a weapon with +4 STR prefix AND +4 STR suffix, making it a
distinctive strength weapon, which is appropriate for a legendary axe.

Note: The `keen` affix key no longer exists in PREFIXES after this change. Removing it from
LEGENDARIES prevents any reference to a defunct affix key. No other changes to LEGENDARIES.

Also verify: the `weaponBaseDamage` key must NOT appear anywhere in the PREFIXES or SUFFIXES
arrays after the rewrite. Grep the file after writing to confirm.
  </action>
  <verify>
Run: grep -n "weaponBaseDamage" /c/projects/uwr/spacetimedb/src/data/affix_catalog.ts

Expected: zero matches in the PREFIXES/SUFFIXES/LEGENDARIES sections. The only remaining
reference to weaponBaseDamage in the file should be in the AffixDef interface comment or
absent entirely (it's not in the interface, so it should be zero matches total).

Also verify the new `fierce` prefix exists:
grep -n "fierce" /c/projects/uwr/spacetimedb/src/data/affix_catalog.ts
Expected: 3 lines (key, name, one in context)

TypeScript compile check (no separate tsconfig needed, rely on publish step):
cd /c/projects/uwr/spacetimedb && spacetime publish uwr --project-path . 2>&1 | head -40
  </verify>
  <done>
No weaponBaseDamage affix in PREFIXES, SUFFIXES, or LEGENDARIES. Dreadmaw uses strBonus prefix.
HP/AC/MR magnitudes updated to new values per the rationale above.
  </done>
</task>

<task type="auto">
  <name>Task 2: Publish module to resync affix data in database</name>
  <files></files>
  <action>
After the catalog is rewritten, publish the SpacetimeDB module with --clear-database to ensure
any existing ItemAffix rows from the old catalog (particularly any with statKey='weaponBaseDamage')
are cleared. Existing gear with the old Keen affix will be gone, but that is acceptable — the
rebalance is a clean slate for affix data.

Command:
  cd /c/projects/uwr/spacetimedb && spacetime publish uwr --clear-database -y --project-path .

Then regenerate TypeScript bindings:
  spacetime generate --lang typescript --out-dir /c/projects/uwr/client/src/module_bindings --project-path /c/projects/uwr/spacetimedb

The module_bindings won't change (no schema changes, only data changes in affix_catalog.ts),
but run generate anyway to confirm the module compiled cleanly.

Check logs after publish to confirm no errors:
  spacetime logs uwr 2>&1 | tail -20
  </action>
  <verify>
spacetime logs uwr 2>&1 | grep -i "error\|panic\|fail" | head -10

Expected: no errors. Module online with fresh affix catalog.

Also sanity-check via /createitem epic in the game client:
- Create an epic weapon with /createitem epic
- Check that NO "Keen" prefix appears (weaponBaseDamage removed)
- Check that affix names match the new catalog (Mighty, Swift, Arcane, Wise, Fierce, Vampiric for prefixes; of Power, of Precision, of Haste for suffixes)
  </verify>
  <done>
Module published cleanly. No weaponBaseDamage affixes appear on newly generated items.
New catalog affixes roll correctly on weapon/armor/accessory slots.
  </done>
</task>

</tasks>

<verification>
1. grep "weaponBaseDamage" spacetimedb/src/data/affix_catalog.ts returns 0 results
2. Dreadmaw legendary has affixKey='mighty', statKey='strBonus', magnitude=4n as first affix
3. vital/of_endurance legendary tier = 25n (was 35n)
4. sturdy/of_resilience legendary tier = 4n (was 5n)
5. fortified legendary tier = 6n (was 8n)
6. Module published, no compile errors, no runtime panics in logs
</verification>

<success_criteria>
- weaponBaseDamage is not a valid rolled affix (no double-dipping)
- Stat affixes (str/dex/int/wis) remain [1,2,3,4] — exciting but not dominant
- HP affixes are trimmed: armor HP caps at 25n, accessory HP caps at 18n
- AC affixes are trimmed: sturdy/resilience cap at 4n, fortified at 6n
- Dreadmaw is "Mighty Training Axe of Power" — coherent STR-focused legendary
- Module live with fresh data, old weaponBaseDamage rows gone via --clear-database
</success_criteria>

<output>
After completion, create `.planning/quick/138-rebalance-affix-catalog-remove-weapon-da/138-SUMMARY.md`
</output>
