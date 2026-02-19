---
phase: quick-190
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/combat_scaling.ts
  - spacetimedb/src/data/affix_catalog.ts
  - spacetimedb/src/data/ability_catalog.ts
  - spacetimedb/src/data/crafting_materials.ts
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/index.ts
  - src/ui/colors.ts
  - src/App.vue
  - src/App.vue.backup
  - src/components/CraftingModal.vue
autonomous: true
requirements: []
must_haves:
  truths:
    - "No dead imports, empty placeholder exports, or unreferenced constants remain in server data files"
    - "No large commented-out code blocks remain in affix_catalog.ts or combat.ts"
    - "Rarity/quality color maps defined once in src/ui/colors.ts, imported everywhere"
    - "Codebase compiles and builds without errors after all changes"
    - "No dead backup files remain in src/"
  artifacts:
    - path: "src/ui/colors.ts"
      provides: "Single source of truth for rarity and craft quality color maps"
      exports: ["RARITY_COLORS", "CRAFT_QUALITY_COLORS", "rarityColor", "craftQualityColor"]
  key_links:
    - from: "src/App.vue"
      to: "src/ui/colors.ts"
      via: "import { rarityColor, craftQualityColor }"
      pattern: "import.*from.*ui/colors"
    - from: "src/components/CraftingModal.vue"
      to: "src/ui/colors.ts"
      via: "import { rarityColor, craftQualityColor }"
      pattern: "import.*from.*ui/colors"
---

<objective>
Comprehensive codebase re-org: remove dead code from server data files, remove commented-out placeholder blocks, delete dead backup file, and consolidate duplicated client-side color maps into a single utility.

Purpose: Reduce maintenance burden by eliminating dead code that confuses future readers and consolidating duplicated color constants that drift out of sync.
Output: Cleaner server data files, single-source-of-truth color utility on client.
</objective>

<context>
## Audit Findings Summary

### SEEDING UPSERT AUDIT: CLEAN
All ensure* functions in spacetimedb/src/seeding/ already use upsert patterns (find-or-insert+update). Quick-175 already converted the last 4 insert-only functions. No action needed.

### DEAD CODE (server-side)
1. `combat_scaling.ts` line 2: imports `ABILITIES` from `ability_catalog.ts` but never references it
2. `index.ts` line 52: imports `ABILITIES` from `ability_catalog` but never references it (only `GLOBAL_COOLDOWN_MICROS` from that import is used)
3. `ability_catalog.ts` line 50-52: `export const ABILITIES = {}` is empty -- all abilities moved to individual class files. Only imported by combat_scaling.ts and index.ts (both dead imports)
4. `affix_catalog.ts` line 362: `export const LEGENDARIES: any[] = []` -- empty placeholder, never imported anywhere
5. `affix_catalog.ts` lines 368-396: `QUALITY_TIERS`, `QualityTier`, `QUALITY_TIER_COLORS`, `QUALITY_TIER_NUMBER` -- never imported by any other file
6. `crafting_materials.ts` lines 155-160: `materialTierToQuality()` function -- defined but never called (only `materialTierToCraftQuality()` is used)
7. `affix_catalog.ts` lines 21-35: ~15 lines commented-out `LegendaryDef` interface
8. `affix_catalog.ts` lines 260-359: ~100 lines commented-out `LEGENDARIES` array with placeholder data
9. `combat.ts` lines 2433-2482: ~50 lines commented-out legendary drop logic referencing empty `LEGENDARIES`

### DEAD FILE
- `src/App.vue.backup` -- stale backup file, should be deleted

### DUPLICATED CLIENT-SIDE COLOR MAPS
Rarity colors defined in 3 places:
- `src/App.vue` lines 2155-2165: `tooltipRarityColor()` function
- `src/components/CraftingModal.vue` lines 336-345: `rarityColor()` function
- `src/ui/styles.ts` lines 1289-1308: `rarityCommon`..`rarityLegendary` + `qualityBorder*` style objects

Craft quality colors defined in 2 places:
- `src/App.vue` lines 2167-2176: `craftQualityColor()` function
- `src/components/CraftingModal.vue` lines 227-235: `craftQualityColor` computed

### NOT IN SCOPE (acceptable mirrors)
- `useCrafting.ts` client-side mirrors of server crafting data (MODIFIER_ITEM_NAMES, MODIFIER_STAT_KEYS, etc.) -- client cannot import server code, mirrors are documented with comments, already consolidated in quick-189.
- `styles.ts` rarity/qualityBorder style objects used by InventoryPanel.vue and LootPanel.vue -- these are style objects (with `color:` or `borderColor:` keys) not simple string returns, so they serve a different purpose. However, they should reference the new color constants instead of hardcoding hex values.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove dead code from server data files and delete dead backup</name>
  <files>
    spacetimedb/src/data/combat_scaling.ts
    spacetimedb/src/data/ability_catalog.ts
    spacetimedb/src/data/affix_catalog.ts
    spacetimedb/src/data/crafting_materials.ts
    spacetimedb/src/reducers/combat.ts
    spacetimedb/src/index.ts
    src/App.vue.backup
  </files>
  <action>
1. **combat_scaling.ts**: Remove the dead import on line 2: `import { ABILITIES } from './ability_catalog.js';`. The ABILITIES object is empty and never referenced in this file.

2. **index.ts**: Remove `ABILITIES` from the import on lines 51-54. Currently reads:
   ```typescript
   import {
     ABILITIES,
     GLOBAL_COOLDOWN_MICROS,
   } from './data/ability_catalog';
   ```
   Change to:
   ```typescript
   import {
     GLOBAL_COOLDOWN_MICROS,
   } from './data/ability_catalog';
   ```
   Or collapse to a single-line import if preferred: `import { GLOBAL_COOLDOWN_MICROS } from './data/ability_catalog';`

3. **ability_catalog.ts**: Remove the empty `export const ABILITIES = {}` block (lines 50-52) and its preceding comment block (lines 37-49 listing class files). Keep `AbilityMetadata` interface, `DamageType` type, and `GLOBAL_COOLDOWN_MICROS` which ARE used by class ability files and other modules.

4. **affix_catalog.ts**: Remove all of the following dead code:
   - Lines 21-35: Commented-out `LegendaryDef` interface (preceded by DISABLED comment on line 21)
   - Lines 258-362: The entire commented-out LEGENDARIES section header, commented-out array (lines 266-359), and the empty placeholder `export const LEGENDARIES: any[] = []` on line 362. Remove the section divider comments too.
   - Lines 368-396: `QUALITY_TIERS`, `QualityTier`, `QUALITY_TIER_COLORS`, and `QUALITY_TIER_NUMBER` -- all never imported anywhere. `AFFIX_COUNT_BY_QUALITY` uses `Record<string, number>` not `Record<QualityTier, number>`, so `QualityTier` and `QUALITY_TIERS` are also dead.
   - Keep: `AffixDef` interface, `PREFIXES`, `SUFFIXES`, `AFFIX_COUNT_BY_QUALITY` (all actively imported by helpers/items.ts).

5. **crafting_materials.ts**: Remove the dead `materialTierToQuality()` function (lines 155-160, including its JSDoc comment). Keep `materialTierToCraftQuality()` which IS used by reducers/items.ts.

6. **reducers/combat.ts**: Remove the commented-out legendary drop block (lines 2433-2482). Replace with a single-line TODO: `// TODO: Legendary drops -- implement when World Bosses phase adds boss encounters`

7. **Delete `src/App.vue.backup`**: This is a stale backup file with no references. Remove it via `rm src/App.vue.backup`.

After removals, ensure no dangling references. The combat.ts file no longer references LEGENDARIES (the reference was inside the commented-out block being removed). The index.ts file no longer imports the dead ABILITIES.
  </action>
  <verify>
Run `npx vue-tsc --noEmit` from project root to confirm no type errors. Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` (or the equivalent server build check) to confirm server compiles. Grep for any remaining references to removed exports: `ABILITIES` (should only appear in ability class files as type import for AbilityMetadata/DamageType -- NOT the ABILITIES object), `LEGENDARIES` (should be zero hits in non-planning files), `QUALITY_TIER_COLORS` (zero hits), `QUALITY_TIER_NUMBER` (zero hits), `materialTierToQuality` (zero hits, note: `materialTierToCraftQuality` should still exist). Confirm `src/App.vue.backup` no longer exists.
  </verify>
  <done>
All identified dead code removed: empty ABILITIES export, dead ABILITIES imports in combat_scaling.ts and index.ts, empty LEGENDARIES placeholder, unused QUALITY_TIER_COLORS/QUALITY_TIER_NUMBER/QUALITY_TIERS/QualityTier, dead materialTierToQuality function, ~165 lines of commented-out legendary code across affix_catalog.ts and combat.ts, and stale App.vue.backup file. Server and client compile without errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Consolidate rarity and craft quality color maps into single utility</name>
  <files>
    src/ui/colors.ts
    src/App.vue
    src/components/CraftingModal.vue
    src/ui/styles.ts
  </files>
  <action>
1. **Create `src/ui/colors.ts`** with the following exports:
   ```typescript
   /** Rarity tier color hex values -- single source of truth for all client UI */
   export const RARITY_COLORS: Record<string, string> = {
     common: '#ffffff',
     uncommon: '#22c55e',
     rare: '#3b82f6',
     epic: '#aa44ff',
     legendary: '#ff8800',
   };

   /** Craft quality color hex values */
   export const CRAFT_QUALITY_COLORS: Record<string, string> = {
     dented: '#888',
     standard: '#ccc',
     reinforced: '#6c9',
     exquisite: '#9cf',
     mastercraft: '#f90',
   };

   /** Returns hex color string for a rarity tier (case-insensitive, defaults to common white) */
   export function rarityColor(rarity: string): string {
     return RARITY_COLORS[(rarity ?? 'common').toLowerCase()] ?? '#ffffff';
   }

   /** Returns hex color string for a craft quality level (defaults to standard gray) */
   export function craftQualityColor(cq: string): string {
     return CRAFT_QUALITY_COLORS[cq] ?? '#ccc';
   }
   ```

2. **Update `src/App.vue`**:
   - Add import: `import { rarityColor, craftQualityColor } from './ui/colors';`
   - Replace the `tooltipRarityColor` function (lines 2155-2165) with:
     ```typescript
     const tooltipRarityColor = (item: any): Record<string, string> => {
       const key = ((item?.qualityTier ?? item?.rarity ?? 'common') as string).toLowerCase();
       return { color: rarityColor(key) };
     };
     ```
     Note: This function wraps the color in a style object `{ color: ... }` for Vue binding, so it keeps its signature but delegates to the shared `rarityColor()`.
   - Remove the standalone `craftQualityColor` function (lines 2167-2176) entirely -- the imported `craftQualityColor` from colors.ts has the same signature `(cq: string) => string`.

3. **Update `src/components/CraftingModal.vue`**:
   - Add import: `import { rarityColor, craftQualityColor as craftQualityColorFn } from '../ui/colors';`
   - Remove the local `rarityColor` function (lines 336-345).
   - Replace the `craftQualityColor` computed (lines 227-235) with:
     ```typescript
     const craftQualityColor = computed(() => craftQualityColorFn(craftQuality.value));
     ```
     This keeps it as a computed (it reads `craftQuality.value` which is a computed from props) but delegates to the shared function.

4. **Update `src/ui/styles.ts`** (minimal change):
   - Add import at top: `import { RARITY_COLORS } from './colors';`
   - Replace the hardcoded hex values in `rarityCommon` through `rarityLegendary` and `qualityBorderCommon` through `qualityBorderLegendary` to reference `RARITY_COLORS`:
     ```typescript
     rarityCommon: { color: RARITY_COLORS.common },
     rarityUncommon: { color: RARITY_COLORS.uncommon },
     rarityRare: { color: RARITY_COLORS.rare },
     rarityEpic: { color: RARITY_COLORS.epic },
     rarityLegendary: { color: RARITY_COLORS.legendary },
     qualityBorderCommon: { borderColor: '#555555' },  // common border is different (#555 vs #fff) -- keep as-is
     qualityBorderUncommon: { borderColor: RARITY_COLORS.uncommon },
     qualityBorderRare: { borderColor: RARITY_COLORS.rare },
     qualityBorderEpic: { borderColor: RARITY_COLORS.epic },
     qualityBorderLegendary: { borderColor: RARITY_COLORS.legendary },
     ```
   - Note: The `as const` assertion at the end of the styles object will need to remain. Since `RARITY_COLORS` values are typed as `string`, the style object properties will still satisfy `as const` since they're used as `Record<string, string>` style bindings anyway.
  </action>
  <verify>
Run `npx vue-tsc --noEmit` to confirm type-checking passes. Grep for hardcoded rarity hex values (`#22c55e`, `#3b82f6`, `#aa44ff`, `#ff8800`) in App.vue and CraftingModal.vue -- should be zero hits (moved to colors.ts). Verify the color utility is correctly imported in all three consumer files.
  </verify>
  <done>
Rarity color map consolidated from 3 independent definitions to 1 shared source in `src/ui/colors.ts`. Craft quality color map consolidated from 2 definitions to 1. App.vue, CraftingModal.vue, and styles.ts all import from the shared utility. No visual changes -- same hex values throughout.
  </done>
</task>

</tasks>

<verification>
1. Server compiles: `npx tsc --noEmit` in spacetimedb/ directory (or equivalent build check)
2. Client compiles: `npx vue-tsc --noEmit` in project root
3. No remaining references to removed dead code (ABILITIES empty export, LEGENDARIES, QUALITY_TIER_COLORS, QUALITY_TIER_NUMBER, materialTierToQuality)
4. No hardcoded rarity color hex values remaining in App.vue or CraftingModal.vue
5. `src/ui/colors.ts` exists and exports RARITY_COLORS, CRAFT_QUALITY_COLORS, rarityColor, craftQualityColor
6. `src/App.vue.backup` no longer exists
</verification>

<success_criteria>
- All identified dead code removed (~165 lines of commented-out code, 4 unreferenced exports, 2 dead imports, 1 dead function, 1 dead backup file)
- Client rarity/quality color maps exist in exactly 1 place (src/ui/colors.ts) with all consumers importing from it
- Both server and client compile without errors
- No visual/behavioral changes -- purely structural cleanup
</success_criteria>

<output>
After completion, create `.planning/quick/190-codebase-re-org-audit-all-duplicated-dat/190-SUMMARY.md`
</output>
