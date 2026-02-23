---
phase: quick-296
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/combat_constants.ts
  - spacetimedb/src/data/combat_scaling.ts
  - spacetimedb/src/data/item_defs.ts
  - spacetimedb/src/helpers/items.ts
  - spacetimedb/src/reducers/items.ts
  - spacetimedb/src/seeding/ensure_items.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Staff, bow, and greatsword use 5.0s attack speed"
    - "Sword, blade, mace use 3.5s attack speed"
    - "Axe uses 4.0s attack speed"
    - "Dagger and rapier remain at 3.0s"
    - "Greatsword exists as a new weapon type with item definitions"
    - "Equipping a two-handed weapon (staff, bow, greatsword) auto-unequips offHand"
    - "Equipping an offHand item when a two-handed weapon is equipped auto-unequips the two-handed weapon"
    - "Base damage values scale inversely with speed to keep DPS balanced"
    - "Crit multipliers match the new speed tiers"
  artifacts:
    - path: "spacetimedb/src/data/combat_constants.ts"
      provides: "Updated WEAPON_SPEED_MICROS map and TWO_HANDED_WEAPON_TYPES set"
      contains: "TWO_HANDED_WEAPON_TYPES"
    - path: "spacetimedb/src/data/combat_scaling.ts"
      provides: "Updated crit multipliers and inferWeaponType with greatsword"
      contains: "greatsword"
    - path: "spacetimedb/src/data/item_defs.ts"
      provides: "Greatsword weapon definitions for starter and world drops"
      contains: "greatsword"
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "Two-handed equip logic in equip_item reducer"
    - path: "spacetimedb/src/helpers/items.ts"
      provides: "isTwoHandedWeapon helper and updated grantStarterItems"
  key_links:
    - from: "spacetimedb/src/reducers/items.ts"
      to: "spacetimedb/src/data/combat_constants.ts"
      via: "TWO_HANDED_WEAPON_TYPES import"
      pattern: "TWO_HANDED_WEAPON_TYPES"
    - from: "spacetimedb/src/data/combat_scaling.ts"
      to: "spacetimedb/src/data/combat_constants.ts"
      via: "WEAPON_SPEED_MICROS import"
      pattern: "WEAPON_SPEED_MICROS"
---

<objective>
Introduce two-handed weapons (staff, bow, greatsword) with new speed tiers and equip restrictions.

Purpose: Adds a new strategic layer where two-handed weapons deal higher per-hit damage at slower speed, but prevent offHand use. Rebalances all weapon speed tiers to create more differentiation.
Output: Updated weapon speed/damage constants, new greatsword weapon type with item defs, two-handed equip enforcement in the equip_item reducer.
</objective>

<context>
@spacetimedb/src/data/combat_constants.ts
@spacetimedb/src/data/combat_scaling.ts
@spacetimedb/src/data/item_defs.ts
@spacetimedb/src/helpers/items.ts
@spacetimedb/src/reducers/items.ts
@spacetimedb/src/seeding/ensure_items.ts
@spacetimedb/src/helpers/combat.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update weapon speed tiers, crit multipliers, and add greatsword to data constants</name>
  <files>
    spacetimedb/src/data/combat_constants.ts
    spacetimedb/src/data/combat_scaling.ts
  </files>
  <action>
**In `combat_constants.ts`:**

1. Update `WEAPON_SPEED_MICROS` to the new speed tiers:
   - `dagger: 3_000_000n` (unchanged)
   - `rapier: 3_000_000n` (unchanged)
   - `sword: 3_500_000n` (was 4_000_000n)
   - `blade: 3_500_000n` (was 4_000_000n)
   - `mace: 3_500_000n` (was 4_000_000n)
   - `axe: 4_000_000n` (was 5_000_000n)
   - `staff: 5_000_000n` (was 3_500_000n)
   - `bow: 5_000_000n` (was 3_500_000n)
   - `greatsword: 5_000_000n` (new)

2. Update the JSDoc comment block to reflect the new tiers:
   - Fast (3.0s): dagger, rapier
   - Normal (3.5s): sword, blade, mace
   - Medium (4.0s): axe
   - Slow (5.0s): staff, bow, greatsword (two-handed)

3. Add a new exported constant:
   ```typescript
   /** Weapon types that occupy both hands — cannot equip offHand alongside these. */
   export const TWO_HANDED_WEAPON_TYPES = new Set(['staff', 'bow', 'greatsword']);
   ```

4. Add `'Training Greatsword'` to the `STARTER_ITEM_NAMES` Set.

**In `combat_scaling.ts`:**

1. Update `WEAPON_CRIT_MULTIPLIERS` to match new speed tiers:
   - `dagger: 150n` (Fast - 1.5x, unchanged)
   - `rapier: 150n` (Fast - 1.5x, unchanged)
   - `sword: 175n` (Normal - 1.75x, was 200n)
   - `blade: 175n` (Normal - 1.75x, was 200n)
   - `mace: 175n` (Normal - 1.75x, was 200n)
   - `axe: 200n` (Medium - 2.0x, was 250n)
   - `bow: 225n` (Slow - 2.25x, was 200n)
   - `staff: 225n` (Slow - 2.25x, was 150n)
   - `greatsword: 250n` (Slow - 2.5x, new — highest crit for melee 2H)

2. Update `inferWeaponType()` to detect greatsword. Add `if (name.includes('greatsword')) return 'greatsword';` BEFORE the `sword` check (since 'greatsword' contains 'sword').
  </action>
  <verify>
    Grep for `greatsword` in combat_constants.ts and combat_scaling.ts to confirm it appears. Grep for `5_000_000n` in combat_constants.ts to verify staff/bow/greatsword are all 5s. Grep for `3_500_000n` in combat_constants.ts to verify sword/blade/mace. Grep for `4_000_000n` to verify axe (and the DEFAULT remains 4_000_000n).
  </verify>
  <done>
    All weapon speed tiers match the spec. Greatsword added to speed map, crit map, inferWeaponType, TWO_HANDED_WEAPON_TYPES set, and STARTER_ITEM_NAMES.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add greatsword item definitions and rebalance base damage values</name>
  <files>
    spacetimedb/src/data/item_defs.ts
    spacetimedb/src/seeding/ensure_items.ts
  </files>
  <action>
**In `item_defs.ts`:**

1. Add a starter greatsword to `STARTER_WEAPON_DEFS`:
   ```typescript
   { name: 'Training Greatsword', allowed: 'warrior,paladin,reaver', weaponType: 'greatsword', description: 'A heavy two-handed practice sword. Slow but devastating.' },
   ```
   Allowed classes: warrior (already has sword, greatsword gives a 2H option), paladin (2H option vs mace+shield), reaver (dark knight archetype fits 2H).

2. Add Tier 1 world drop greatsword to `WORLD_DROP_GEAR_DEFS` (in the Tier 1 weapons section):
   ```typescript
   { name: 'Crude Greatsword', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 1n, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,reaver', weaponType: 'greatsword', weaponBaseDamage: 7n, weaponDps: 8n, description: 'A massive blade meant for two-handed sweeping strikes. Crude but powerful.' },
   ```

3. Add Tier 2 world drop greatsword to `WORLD_DROP_GEAR_DEFS` (in the Tier 2 weapons section):
   ```typescript
   { name: 'Steel Greatsword', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,reaver', weaponType: 'greatsword', weaponBaseDamage: 9n, weaponDps: 10n, description: 'A well-forged two-handed blade. Its weight cleaves through armor.' },
   ```

4. Rebalance ALL existing weapon `weaponBaseDamage` and `weaponDps` values in `WORLD_DROP_GEAR_DEFS` to match new speed tiers, keeping DPS roughly equivalent across weapon types within the same tier. The principle: DPS = baseDamage / attackSpeed. Use this target DPS-per-tier scheme:

   **Tier 1 targets (DPS ~1.3/s balanced):**
   - Fast 3.0s (dagger, rapier): baseDamage=3n, dps=5n (unchanged for dagger/rapier)
   - Normal 3.5s (sword, blade, mace): baseDamage=4n, dps=6n (sword/blade/mace already have 4n/6n -- keep, though these were "medium" before the rename)
   - Medium 4.0s (axe): baseDamage=5n, dps=8n (unchanged)
   - Slow 5.0s (staff, bow): baseDamage=6n, dps=7n (was 4n/5n -- buff since they are now much slower)
   - Slow 5.0s (greatsword): baseDamage=7n, dps=8n (new -- slightly higher per-hit than staff/bow since melee 2H trades shield for damage)

   **Tier 2 targets:**
   - Fast 3.0s (dagger, rapier): baseDamage=4n, dps=5n (unchanged)
   - Normal 3.5s (sword, blade, mace): baseDamage=5n, dps=7n (unchanged)
   - Medium 4.0s (axe): baseDamage=7n, dps=9n (unchanged)
   - Slow 5.0s (staff, bow): baseDamage=8n, dps=8n (was 5n/6n -- buff)
   - Slow 5.0s (greatsword): baseDamage=9n, dps=10n (new)

   Update these specific items:
   - `Hunting Bow` T1: weaponBaseDamage 4n->6n, weaponDps 5n->7n
   - `Gnarled Staff` T1: weaponBaseDamage 4n->6n, weaponDps 5n->7n
   - `Yew Bow` T2: weaponBaseDamage 5n->8n, weaponDps 6n->8n
   - `Oak Staff` T2: weaponBaseDamage 5n->8n, weaponDps 6n->8n

**In `ensure_items.ts`:**

5. Update `STARTER_WEAPON_STATS` to match the new speed tiers:
   ```typescript
   const STARTER_WEAPON_STATS: Record<string, { baseDamage: bigint; dps: bigint }> = {
     dagger:      { baseDamage: 2n, dps: 4n },  // Fast 3.0s (unchanged)
     rapier:      { baseDamage: 2n, dps: 4n },  // Fast 3.0s (unchanged)
     sword:       { baseDamage: 3n, dps: 5n },  // Normal 3.5s (was 3n/5n - unchanged)
     blade:       { baseDamage: 3n, dps: 5n },  // Normal 3.5s (was 3n/5n - unchanged)
     mace:        { baseDamage: 3n, dps: 5n },  // Normal 3.5s (was 3n/5n - unchanged)
     axe:         { baseDamage: 4n, dps: 6n },  // Medium 4.0s (unchanged)
     staff:       { baseDamage: 4n, dps: 5n },  // Slow 5.0s (was 3n/4n - buffed)
     bow:         { baseDamage: 4n, dps: 5n },  // Slow 5.0s (was 3n/4n - buffed)
     greatsword:  { baseDamage: 5n, dps: 6n },  // Slow 5.0s (new - highest starter per-hit)
   };
   ```
  </action>
  <verify>
    Grep for `greatsword` in item_defs.ts to confirm starter and world drop entries. Grep for `greatsword` in ensure_items.ts to confirm starter weapon stats entry. Verify Hunting Bow and Gnarled Staff have updated damage values.
  </verify>
  <done>
    Greatsword exists as starter weapon and tier 1/2 world drops. All weapon base damage values are rebalanced to match new speed tiers with DPS parity. Starter weapon stats updated.
  </done>
</task>

<task type="auto">
  <name>Task 3: Implement two-handed equip enforcement and update helpers</name>
  <files>
    spacetimedb/src/helpers/items.ts
    spacetimedb/src/reducers/items.ts
  </files>
  <action>
**In `helpers/items.ts`:**

1. Add import at the top:
   ```typescript
   import { TWO_HANDED_WEAPON_TYPES } from '../data/combat_constants';
   ```

2. Add a new exported helper function after the existing `STARTER_WEAPONS` object:
   ```typescript
   /** Returns true if the given weaponType is a two-handed weapon. */
   export function isTwoHandedWeapon(weaponType: string): boolean {
     return TWO_HANDED_WEAPON_TYPES.has(weaponType);
   }
   ```

3. In `grantStarterItems()`: Do NOT grant a Wooden Shield if the starter weapon for the class is two-handed. Modify the shield grant block to also check the weapon type:
   ```typescript
   const SHIELD_CLASSES = new Set(['warrior', 'paladin', 'cleric', 'shaman']);
   if (SHIELD_CLASSES.has(normalizeClassName(character.className))) {
     // Don't grant shield if the class starter weapon is two-handed
     const weaponEntry = STARTER_WEAPONS[normalizeClassName(character.className)];
     const starterWeaponDef = weaponEntry ? STARTER_WEAPON_DEFS.find(w => w.name === weaponEntry.name) : null;
     if (!starterWeaponDef || !isTwoHandedWeapon(starterWeaponDef.weaponType)) {
       const shieldTemplate = findItemTemplateByName(ctx, 'Wooden Shield');
       if (shieldTemplate) {
         addItemToInventory(ctx, character.id, shieldTemplate.id, 1n);
       }
     }
   }
   ```
   This requires importing `STARTER_WEAPON_DEFS` from `../data/item_defs`. Add it to the existing import from that file (there are currently no imports from item_defs in items.ts, so add a new import line).

**In `reducers/items.ts`:**

4. In the `equip_item` reducer, after the `if (!EQUIPMENT_SLOTS.has(template.slot))` check and BEFORE the loop that unequips existing items in the same slot, add two-handed weapon enforcement:

   ```typescript
   // --- Two-handed weapon enforcement ---
   const { TWO_HANDED_WEAPON_TYPES } = await import('../data/combat_constants');
   ```

   WAIT -- this is a reducer file using the `deps` injection pattern, not direct imports. Instead, import `TWO_HANDED_WEAPON_TYPES` at the top of the file (outside registerItemReducers) since it's a pure data constant with no circular dep risk:

   Add at the top of the file:
   ```typescript
   import { TWO_HANDED_WEAPON_TYPES } from '../data/combat_constants';
   ```

   Then in the `equip_item` reducer, after the `EQUIPMENT_SLOTS` check, add:

   ```typescript
   // --- Two-handed weapon enforcement ---
   // If equipping a mainHand weapon that is two-handed, auto-unequip offHand
   if (template.slot === 'mainHand' && template.weaponType && TWO_HANDED_WEAPON_TYPES.has(template.weaponType)) {
     for (const other of ctx.db.itemInstance.by_owner.filter(character.id)) {
       if (other.equippedSlot === 'offHand') {
         ctx.db.itemInstance.id.update({ ...other, equippedSlot: undefined });
       }
     }
   }
   // If equipping an offHand item, check if mainHand is two-handed and auto-unequip it
   if (template.slot === 'offHand') {
     for (const other of ctx.db.itemInstance.by_owner.filter(character.id)) {
       if (other.equippedSlot === 'mainHand') {
         const otherTemplate = ctx.db.itemTemplate.id.find(other.templateId);
         if (otherTemplate && otherTemplate.weaponType && TWO_HANDED_WEAPON_TYPES.has(otherTemplate.weaponType)) {
           ctx.db.itemInstance.id.update({ ...other, equippedSlot: undefined });
         }
       }
     }
   }
   ```

   This goes BEFORE the existing loop that unequips items in the same slot (line ~476), so the flow is:
   1. Validate class, armor type, slot
   2. Handle two-handed conflicts (auto-unequip conflicting slot)
   3. Unequip existing item in the target slot (existing logic)
   4. Equip the new item
   5. Recompute derived stats

   The auto-unequip approach is user-friendly: no confusing error messages, just swap gear seamlessly.
  </action>
  <verify>
    Grep for `TWO_HANDED_WEAPON_TYPES` in reducers/items.ts to confirm the import and usage. Grep for `isTwoHandedWeapon` in helpers/items.ts to confirm the helper exists. Run `spacetime build --project-path C:/projects/uwr/spacetimedb` (if build tooling available) or verify TypeScript compiles by checking for syntax errors.
  </verify>
  <done>
    Equipping a two-handed weapon (staff, bow, greatsword) auto-unequips the offHand. Equipping an offHand item auto-unequips a two-handed mainHand weapon. Starter item grants skip shield for classes with 2H starter weapons. All compilation errors resolved.
  </done>
</task>

</tasks>

<verification>
1. Grep for `greatsword` across all modified files to confirm it is defined everywhere needed
2. Verify WEAPON_SPEED_MICROS has exactly 9 entries (dagger, rapier, sword, blade, mace, axe, staff, bow, greatsword)
3. Verify TWO_HANDED_WEAPON_TYPES contains exactly staff, bow, greatsword
4. Verify equip_item reducer imports and uses TWO_HANDED_WEAPON_TYPES
5. Verify inferWeaponType checks greatsword before sword
6. Publish locally: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` (verifies compilation)
7. After publish, run `spacetime logs uwr` to check for any runtime errors
</verification>

<success_criteria>
- All nine weapon types have correct speed values in WEAPON_SPEED_MICROS
- TWO_HANDED_WEAPON_TYPES is exported and contains staff, bow, greatsword
- Greatsword appears in starter weapons, tier 1 world drops, and tier 2 world drops
- equip_item reducer enforces two-handed/offHand mutual exclusion
- inferWeaponType correctly detects greatsword (before sword check)
- Staff and bow base damage values are buffed to match their new 5.0s speed
- Local publish succeeds without errors
</success_criteria>

<output>
After completion, create `.planning/quick/296-two-handed-weapons-system-staff-bow-grea/296-SUMMARY.md`
</output>
