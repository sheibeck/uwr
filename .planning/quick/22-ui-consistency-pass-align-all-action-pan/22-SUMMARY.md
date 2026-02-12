# Quick Task 22: UI Consistency Pass - Align All Action Panels

**One-liner:** Unified panel structure across Inventory, Stats, Crafting, CharacterActions, and Renown panels with consistent panelBody wrappers and card-style layouts.

---

## Overview

Aligned 5 action panel components with the cohesive visual language established by HotbarPanel and QuestPanel. Removed redundant panel titles (already shown in App.vue's floatingPanelHeader), added panelBody wrappers for consistent spacing, and polished RenownPanel inline styles into reusable patterns.

---

## Changes

### Modified Files

| File | Changes |
|------|---------|
| `src/components/InventoryPanel.vue` | Removed redundant "Inventory" title, added panelBody wrapper to root element |
| `src/components/StatsPanel.vue` | Added panelBody wrapper to root element |
| `src/components/CraftingPanel.vue` | Removed redundant "Crafting" title, added panelBody wrapper to root element |
| `src/components/CharacterActionsPanel.vue` | Added panelBody wrapper, replaced grid layout with flex-column gap for button stacking |
| `src/components/RenownPanel.vue` | Replaced raw inline styles with resultCard containers, recipeName, and pill-shaped progress bars |

### Commits

| Hash | Message |
|------|---------|
| d44bbe3 | refactor(quick-22): align panel structure with panelBody wrapper |
| 050cef4 | refactor(quick-22): polish RenownPanel with consistent card styling |

---

## Technical Details

### Panel Title Removal

**Problem:** InventoryPanel and CraftingPanel rendered panel-level titles (e.g., "Inventory", "Crafting") inside the component body, duplicating the title already shown in App.vue's `floatingPanelHeader`.

**Solution:** Removed these redundant titles. Section titles like "Backpack" (InventoryPanel), "Core" (StatsPanel), "Base Stats" (StatsPanel) remain because they label subsections within the panel.

**Pattern:**
```vue
<!-- Before -->
<template>
  <div>
    <div :style="styles.panelSectionTitle">Inventory</div>  <!-- ❌ Redundant -->
    ...
  </div>
</template>

<!-- After -->
<template>
  <div :style="styles.panelBody">
    <!-- Panel title removed, App.vue floatingPanelHeader handles it -->
    ...
  </div>
</template>
```

### PanelBody Wrapper

**Problem:** Panels had inconsistent root wrapper styles, leading to varied internal spacing and layout behavior.

**Solution:** All 5 panels now use `styles.panelBody` on the root element:
```typescript
panelBody: {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
}
```

This provides:
- Consistent vertical rhythm (1rem gap between sections)
- Flex-column layout for vertical stacking
- Proper overflow handling for scrollable content

### CharacterActionsPanel Layout

**Before:** Used `styles.panelForm` (grid layout) which stretched buttons awkwardly.

**After:** Replaced with flex-column gap layout:
```vue
<div :style="{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }">
  <button :style="styles.ghostButton">Trade</button>
  <button :style="styles.ghostButton">Invite to Group</button>
  ...
</div>
```

Buttons now stack vertically with consistent spacing, matching the card-style rows used in HotbarPanel.

### RenownPanel Polish

**Before:** Raw inline styles with pixel-based margins, `#333` hex colors, and inconsistent spacing.

**After:** Faction entries use established style patterns:

1. **Card containers:** `styles.resultCard` (border, borderRadius, padding, background, gap)
2. **Faction names:** `styles.recipeName` (fontWeight, letterSpacing)
3. **Descriptions:** `styles.subtleSmall` (fontSize, color)
4. **Progress bars:**
   - Container: `background: 'rgba(255,255,255,0.1)'` (matches hpBar pattern)
   - Fill: `borderRadius: '999px'` (pill-shaped, consistent with HP/mana/stamina bars)
   - Height: `6px` (slim progress indicator)

**Result:** No raw `#333` colors, no pixel-based margins, all spacing handled by resultCard's gap property.

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Self-Check: PASSED

### Files Verified
```
FOUND: src/components/InventoryPanel.vue
FOUND: src/components/StatsPanel.vue
FOUND: src/components/CraftingPanel.vue
FOUND: src/components/CharacterActionsPanel.vue
FOUND: src/components/RenownPanel.vue
```

### Commits Verified
```
FOUND: d44bbe3 (refactor(quick-22): align panel structure with panelBody wrapper)
FOUND: 050cef4 (refactor(quick-22): polish RenownPanel with consistent card styling)
```

### Validation Checks
- ✅ `npx vue-tsc --noEmit` passes (259 pre-existing errors, no new errors introduced)
- ✅ InventoryPanel `panelSectionTitle` grep shows only "Backpack" (section title, not panel title)
- ✅ CraftingPanel `panelSectionTitle` grep shows no matches (panel title removed)
- ✅ StatsPanel `panelSectionTitle` grep shows "Core", "Base Stats", "Derived" (all section titles)
- ✅ CharacterActionsPanel `panelSectionTitle` grep shows no matches (no titles)
- ✅ RenownPanel `#333|marginBottom.*px|marginTop.*px` grep shows no matches (raw styles eliminated)

---

## Metrics

- **Duration:** ~2.5 minutes
- **Tasks completed:** 2
- **Files modified:** 5
- **Commits:** 2
- **Lines changed:** ~20 (net: removed 7 lines, added 6 lines due to multiline formatting)

---

## Outcome

All 7 target panels (Inventory, Stats, Crafting, Journal/NpcDialog, Quests, Renown, CharacterActions, Hotbar) now use consistent structure:

1. **panelBody wrapper** on root element for flex-column gap layout
2. **No redundant titles** duplicating floatingPanelHeader
3. **Card-style containers** for grouped content (resultCard, recipeCard patterns)
4. **Unified progress bar styling** (pill-shaped, rgba backgrounds, consistent height)

The visual language is now cohesive across all floating panels, matching the patterns established in quick tasks 18 and 20.
