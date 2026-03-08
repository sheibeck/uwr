# Quick Task 358: Summary

## What Changed

### Problem
Dynamic LLM-generated classes couldn't equip their starter items because:
1. Warrior archetype armor proficiencies didn't include "cloth" (starter gear was cloth)
2. `equip_item` reducer used hardcoded `allowedClasses` which didn't match dynamic class names
3. Client-side `equipable` check had the same legacy class name issue
4. Starter weapon picked by hardcoded class name lookup (fails for generated classes)
5. All characters got cloth armor regardless of proficiency

### Fixes
- **Cloth always included** in armor proficiencies (base tier everyone can wear)
- **Equip check refactored**: characters with dynamic proficiencies use proficiency-based checks; legacy characters fall back to `allowedClasses`
- **Client-side mirrored**: `useInventory.ts` uses same proficiency logic for `equipable` flag
- **Starter weapon from proficiencies**: picks first matching weapon type from character's weapon proficiencies
- **Best armor tier for starters**: plate > chain > leather > cloth based on character's armor proficiencies

## Files Modified
- `spacetimedb/src/reducers/creation.ts` — cloth always in armor proficiencies
- `spacetimedb/src/reducers/items.ts` — proficiency-based equip check for v2.0 classes
- `spacetimedb/src/helpers/items.ts` — starter weapon from proficiencies, best armor tier
- `src/composables/useInventory.ts` — client-side proficiency-based equipable check

## Commits
- 55a15d3: fix(quick-358): fix equipment proficiency checks for dynamic classes
- 47649a5: feat(quick-358): grant starter armor matching highest proficiency tier
