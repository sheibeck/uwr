# Architecture Patterns

**Domain:** v2.1 cleanup and feature integration for SpacetimeDB + Vue 3 narrative RPG
**Researched:** 2026-03-09

## Current Architecture Overview

The system is a two-tier architecture: SpacetimeDB TypeScript backend (server-authoritative) and Vue 3 SPA client. All state lives in SpacetimeDB tables. The client subscribes to reactive state via `useTable()`. Backend reducers are the only mutation path. LLM integration flows through a client-side proxy to Anthropic's API.

```
+------------------+       +--------------------+       +------------------+
|  Vue 3 SPA       | <---> |  SpacetimeDB       | <---> |  LLM Proxy       |
|  (NarrativeUI)   |  sub  |  (Tables/Reducers)  |       |  (CF Workers)    |
|                  |  +    |                    |       |                  |
|  composables/    |  call |  schema/tables.ts  |       |  Anthropic API   |
|  components/     | ----> |  reducers/         |       +------------------+
|  App.vue (wiring)|       |  helpers/          |
+------------------+       +--------------------+
```

### Key Data Flow Pattern
1. User types in NarrativeInput or clicks context action
2. App.vue routes to appropriate reducer call (via useCommands or direct useReducer)
3. Reducer mutates tables on server
4. SpacetimeDB pushes table changes to subscribed clients
5. Vue reactivity updates UI via useTable() refs

### Component Boundary Map

| Layer | Component | Responsibility |
|-------|-----------|----------------|
| **Orchestrator** | `App.vue` | Wires all composables, manages panels, routes commands |
| **Input** | `NarrativeInput.vue` | Text entry, sends to useCommands |
| **Display** | `NarrativeConsole.vue` | Renders event stream, HUD, progress bars |
| **Context** | `useContextActions.ts` | Generates clickable action chips from game state |
| **Commands** | `useCommands.ts` | Parses text input, calls reducers |
| **Intent** | `intent.ts` (server) | Server-side text command routing |
| **Events** | `useEvents.ts` | Merges 4 event scopes + local events into sorted stream |
| **Combat** | `useCombat.ts` | Combat state, enemy display, ability use |
| **Hotbar** | `useHotbar.ts` | Ability slot management, cooldown prediction |
| **Inventory** | `useInventory.ts` | Item display, equip/unequip/use/delete |
| **Panels** | `usePanelManager.ts` | Panel open/close state management |

---

## Feature Integration Analysis

### 1. Sell Items via Narrative UI

**Current state:** Two parallel code paths exist for selling items.
- **Panel path:** VendorPanel.vue renders sell buttons, calls `sellItem` reducer with `itemInstanceId` + `npcId`. Works but requires opening a panel.
- **Text path:** Intent reducer (`intent.ts` line 880) handles `sell <item>` text command. Finds vendor at location, matches item by name, duplicates sell logic from the `sell_item` reducer (including affix cleanup, vendor inventory addition, CHA bonus).

**Problem:** The intent reducer duplicates ~60 lines of sell logic from the `sell_item` reducer. The sell via text command does NOT apply renown perk bonuses (`vendorSellBonus`) that the reducer path applies.

**What needs to change:**

| Action | File | Type | Details |
|--------|------|------|---------|
| Extract shared sell logic | `spacetimedb/src/helpers/economy.ts` | **CREATE** | Move sell-item logic into a shared helper function called by both intent.ts and the sell_item reducer |
| Update intent sell handler | `spacetimedb/src/reducers/intent.ts` | **MODIFY** | Replace duplicated sell logic with call to shared helper |
| Update sell_item reducer | `spacetimedb/src/reducers/items.ts` | **MODIFY** | Replace inline sell logic with call to shared helper |
| Wire context action | `src/composables/useContextActions.ts` | **MODIFY** | Add "Sell" action when at vendor (optional; text "sell X" already works) |

**Architecture pattern:** Extract-and-delegate. Both the reducer and the intent handler should call the same helper. The helper owns item lookup, validation, gold transfer, vendor inventory update, and event logging.

### 2. Hotbar in Narrative UI

**Current state:** Two separate hotbar representations exist.
- **HotbarPanel.vue:** Legacy panel with dropdowns for assigning abilities to slots 1-10. Uses `abilityKey` (string-based, appears outdated).
- **useHotbar.ts composable:** Modern implementation using `abilityTemplateId` (bigint). Powers the CombatActionBar and inline combat UI. Has full cooldown prediction, cast state, resource pre-checks.
- **CombatActionBar.vue:** Renders abilities during combat inline in the narrative stream.

**Problem:** HotbarPanel.vue uses an older API (`abilityKey` string) while the actual hotbar system uses `abilityTemplateId` (bigint). The panel is a legacy artifact that should either be updated to match the composable or removed in favor of narrative-only hotbar management.

**What needs to change:**

| Action | File | Type | Details |
|--------|------|------|---------|
| Decide: update or remove | `src/components/HotbarPanel.vue` | **MODIFY or DELETE** | Either update to use abilityTemplateId or remove entirely |
| Add narrative hotbar command | `spacetimedb/src/reducers/intent.ts` | **MODIFY** | Add `hotbar <slot> <ability>` text command |
| Hotbar display in console | `src/components/NarrativeConsole.vue` | **MODIFY** | Show hotbar bar below HUD (already partially there via CombatActionBar) |
| Always-visible hotbar | `src/App.vue` | **MODIFY** | Show CombatActionBar or similar bar outside combat too, for utility abilities |

**Architecture pattern:** The composable (`useHotbar.ts`) is the correct implementation. The panel should be brought in line with it or deleted. The hotbar bar should be visible at all times (not just combat), since utility abilities need access outside combat.

### 3. Event System Narrative Integration

**Current state:** Events are well-structured with 4 server scopes (world, location, private, group) plus client-local events. The `useEvents.ts` composable merges them chronologically and caps at 80 entries.

**Problem identified:** The event system itself works. The gap is that some game actions don't produce sufficiently descriptive events. Combat in particular needs:
- DoT/HoT tick events (damage/heal over time notifications)
- Debuff application/expiration events on enemies
- Multi-enemy pull clarity (which enemy is being attacked)

**What needs to change:**

| Action | File | Type | Details |
|--------|------|------|---------|
| Add DoT tick events | `spacetimedb/src/helpers/combat.ts` | **MODIFY** | In the combat loop tick handler, emit per-tick damage/heal events |
| Add debuff indicator events | `spacetimedb/src/helpers/combat.ts` | **MODIFY** | Log when debuffs are applied to enemies and when they expire |
| Add enemy effect display | `src/components/EnemyHud.vue` | **MODIFY** | Show active effects (DoTs, debuffs) under enemy HP bars |
| Multi-pull target clarity | `spacetimedb/src/helpers/combat.ts` | **MODIFY** | Include enemy name in all damage/heal log messages (already partially done) |

**Architecture pattern:** Server emits more granular events. Client renders them. No new tables needed -- existing event tables suffice.

### 4. Combat Balance and Logging Improvements

**Current state:** The `resolveAbility()` function in `combat.ts` (line 366) is the unified dispatch. It handles: `damage`, `heal`, `dot`, `hot`, `buff`, `debuff`, `shield`, `taunt`, `aoe_damage`, `aoe_heal`, `summon`, `cc`, `drain`, `execute`. Each kind has player-to-enemy and enemy-to-player paths.

Combat logging is inline with ability resolution. Messages go to private events and group events.

**What needs to change:**

| Action | File | Type | Details |
|--------|------|------|---------|
| Improve log messages | `spacetimedb/src/helpers/combat.ts` | **MODIFY** | Add damage type, crit indicator, resistance applied to log messages |
| DoT/HoT tick logging | `spacetimedb/src/helpers/combat.ts` | **MODIFY** | Combat loop should log each DoT/HoT tick with source ability name |
| Enemy effect tracking on client | `src/components/EnemyHud.vue` | **MODIFY** | Display active effects (DoTs, debuffs, CC) on enemies |
| Enemy effect data access | `src/App.vue` | **MODIFY** | Subscribe to combat_enemy_effect table if not already |
| Balance tuning | `spacetimedb/src/data/combat_scaling.ts` | **MODIFY** | Adjust scaling constants based on play testing |

**Architecture pattern:** Enhancement to existing dispatch. No structural changes needed -- the kind-based dispatch map is extensible by design. Logging improvements are additive within each kind handler.

### 5. Ability Type Expansion

**Current state:** The mechanical vocabulary (`mechanical_vocabulary.ts`) defines 14 ability kinds. The `resolveAbility()` dispatch handles all 14. Additional kinds referenced in client code: `resurrect`, `corpse_summon`, `track`, `group_heal` -- these are handled as special cases in `useHotbar.ts` (client-side routing) rather than through the server dispatch.

**Kinds that exist in client but NOT in mechanical vocabulary or server dispatch:**

| Kind | Where Used | Current Handling |
|------|------------|------------------|
| `resurrect` | `useHotbar.ts` line 338 | Client intercepts, calls `onResurrectRequested` |
| `corpse_summon` | `useHotbar.ts` line 347 | Client intercepts, calls `onCorpseSummonRequested` |
| `track` | `useHotbar.ts` line 358 | Client intercepts, opens track panel |
| `group_heal` | `combat.ts` hasHealingAbilities check | Checked but not in ABILITY_KINDS array |

**What needs to change:**

| Action | File | Type | Details |
|--------|------|------|---------|
| Add missing kinds to vocabulary | `spacetimedb/src/data/mechanical_vocabulary.ts` | **MODIFY** | Add `resurrect`, `corpse_summon`, `track`, `group_heal` to ABILITY_KINDS |
| Add server dispatch for new kinds | `spacetimedb/src/helpers/combat.ts` | **MODIFY** | Add resolveAbility handlers for resurrect, corpse_summon, track, group_heal |
| Move client special-casing to server | `src/composables/useHotbar.ts` | **MODIFY** | Remove client-side kind interception, let server handle via standard ability flow |
| Add any new utility kinds | `spacetimedb/src/data/mechanical_vocabulary.ts` | **MODIFY** | Consider: `gather_boost`, `travel`, `perception_boost` for non-combat utility |

**Architecture pattern:** The vocabulary is extensible. Add kind to vocabulary, add dispatch branch in `resolveAbility()`, and the LLM can now generate abilities of that type. The client should NOT special-case kinds -- it should call `useAbility` uniformly and let the server decide what happens.

### 6. Global UI Scaling (Font Size Control)

**Current state:** No global font scaling exists. All font sizes are hardcoded in component styles as inline style objects. The app uses no CSS custom properties for font sizing.

**What needs to change:**

| Action | File | Type | Details |
|--------|------|------|---------|
| Add CSS custom properties | `src/main.ts` or root CSS | **MODIFY** | Define `--font-scale` CSS custom property on `:root` |
| Create settings composable | `src/composables/useSettings.ts` | **CREATE** | Manage font scale setting, persist to localStorage |
| Apply scale to base font | Root CSS | **MODIFY** | Set `html { font-size: calc(16px * var(--font-scale, 1)) }` |
| Convert hardcoded sizes | Multiple components | **MODIFY** | Replace `px` sizes with `rem` where they should scale |
| Add UI control | `src/components/ActionBar.vue` or settings | **MODIFY** | Add +/- buttons or slider for font scale |

**Architecture pattern:** CSS custom property approach. A single `--font-scale` variable on `:root` controls all scaled text. Components that already use `rem` scale automatically. Components with hardcoded `px` need conversion. Persist preference in localStorage.

---

## Component Dependency Graph

```
App.vue
  |-- NarrativeConsole.vue
  |     |-- NarrativeHud.vue
  |     |-- GroupMemberBar.vue
  |     |-- NarrativeMessage.vue
  |     |-- NarrativeInput.vue
  |     |-- EnemyHud.vue (during combat)
  |     +-- CombatActionBar.vue (during combat)
  |
  |-- FloatingPanel.vue (shell for all panels)
  |     |-- VendorPanel.vue
  |     |-- InventoryPanel.vue
  |     |-- HotbarPanel.vue (legacy)
  |     |-- QuestPanel.vue
  |     +-- ... (other panels)
  |
  |-- ActionBar.vue (top bar with panel toggles)
  |
  |-- Composables:
        |-- useCommands.ts (text input routing)
        |-- useContextActions.ts (action chips)
        |-- useHotbar.ts (ability management)
        |-- useInventory.ts (item management)
        |-- useEvents.ts (event merging)
        |-- useCombat.ts (combat state)
        |-- usePanelManager.ts (panel state)
        +-- useSettings.ts (NEW - font scale)
```

---

## Recommended Architecture Patterns

### Pattern 1: Extract-and-Delegate for Duplicated Logic

**What:** When both a reducer and the intent handler perform the same game action, extract the core logic into a helper function.

**When:** Any time `intent.ts` duplicates logic from a dedicated reducer (sell, buy, use item, etc.)

**Example:**
```typescript
// spacetimedb/src/helpers/economy.ts
export function performSellItem(ctx: any, character: any, instance: any, template: any, vendorNpc: any) {
  // Shared logic: base value calc, perk bonuses, CHA bonus, affix cleanup,
  // item deletion, gold update, vendor inventory update, event logging
}
```

Both `sell_item` reducer and intent handler call this. Single source of truth for sell mechanics.

### Pattern 2: Server-Authoritative Kind Dispatch (No Client Special Cases)

**What:** All ability kinds should resolve through `resolveAbility()` on the server. The client calls `useAbility` uniformly.

**When:** Adding any new ability kind.

**Why bad (anti-pattern):** Client-side kind interception (`useHotbar.ts` checking kind === 'resurrect' and routing to a different function) creates two dispatch points and means the server doesn't validate the ability's preconditions.

**Instead:**
```typescript
// Server handles ALL kinds uniformly
if (kind === 'resurrect') {
  // Validate corpse exists, validate caster has ability, resolve resurrection
  // No client-side interception needed
}
```

### Pattern 3: Event-Driven UI Updates (No Optimistic Client State)

**What:** Game state changes flow through server events. The client renders what the server says happened.

**When:** Always. The established pattern in this codebase.

**Why:** SpacetimeDB subscriptions are the source of truth. Optimistic UI (predicting server responses) leads to desync. The only exception is cooldown prediction in `useHotbar.ts`, which is purely cosmetic and gets corrected by server state.

### Anti-Pattern: Inline Style Proliferation

**What:** Components define styles as inline JavaScript objects rather than CSS.

**Why bad:** Makes global styling changes (like font scaling) require touching every component. Prevents CSS cascade and inheritance.

**Instead:** For v2.1, the pragmatic approach is CSS custom properties on `:root` with `rem`-based font sizing. Full CSS refactor is out of scope for this milestone. Convert component font sizes to `rem` incrementally as they are touched for other reasons.

---

## Modification vs Creation Summary

### Files to CREATE

| File | Purpose |
|------|---------|
| `spacetimedb/src/helpers/economy.ts` | Shared sell/buy logic extracted from duplicated code |
| `src/composables/useSettings.ts` | Font scale + UI preferences, persisted to localStorage |

### Files to MODIFY (by feature area)

**Sell items narrative integration:**
- `spacetimedb/src/reducers/intent.ts` -- replace duplicated sell logic
- `spacetimedb/src/reducers/items.ts` -- use shared helper

**Hotbar narrative integration:**
- `src/components/HotbarPanel.vue` -- update or delete
- `src/App.vue` -- show hotbar bar outside combat
- `spacetimedb/src/reducers/intent.ts` -- add hotbar text command

**Combat logging improvements:**
- `spacetimedb/src/helpers/combat.ts` -- richer log messages, DoT/HoT tick events
- `src/components/EnemyHud.vue` -- show active effects on enemies

**Ability type expansion:**
- `spacetimedb/src/data/mechanical_vocabulary.ts` -- add missing kinds
- `spacetimedb/src/helpers/combat.ts` -- add dispatch branches
- `src/composables/useHotbar.ts` -- remove client-side kind interception

**Global font scaling:**
- Root CSS / `src/main.ts` -- CSS custom properties
- Multiple components -- convert px to rem (incremental)
- `src/components/ActionBar.vue` -- settings control

### Files to DELETE (candidates)

| File | Reason |
|------|--------|
| `src/components/HotbarPanel.vue` | Legacy panel using outdated abilityKey API; composable is the real implementation |

---

## Build Order (Dependency-Aware)

The features have minimal interdependencies. Recommended order based on risk and foundation:

1. **Dead code removal and tech debt** -- Foundation cleanup before adding features. Reduces confusion, removes outdated patterns.
2. **Extract shared economy helper** -- Eliminates sell logic duplication. Low risk, high value. Foundation for narrative sell integration.
3. **Ability type expansion** -- Adds to mechanical vocabulary and dispatch. Should come before combat logging since new kinds need logging too.
4. **Combat logging improvements** -- Depends on knowing which kinds exist (step 3). Modifies the same `combat.ts` dispatch.
5. **Sell items narrative integration** -- Uses the extracted helper from step 2. Independent of combat work.
6. **Hotbar narrative integration** -- Independent of other features. Decision point: update or delete HotbarPanel.
7. **Enemy effect display** -- Client-only work on EnemyHud.vue. Depends on combat logging emitting the right events (step 4).
8. **Global font scaling** -- Fully independent. Can be done at any point. Low risk.
9. **Unit tests** -- Should accompany each step above, but can also be done as a dedicated pass.

---

## Scalability Considerations

| Concern | Current State | v2.1 Impact |
|---------|--------------|-------------|
| Event table growth | Events are session-scoped, client caps at 80 | Combat logging adds more events per combat but within bounds |
| Ability kinds | 14 kinds in vocabulary, 14 in dispatch | Adding 4-6 more is trivial; dispatch is O(1) lookup by kind |
| Inline styles | ~39 components with inline styles | Font scaling requires rem conversion; do incrementally |
| Combat helper size | `combat.ts` is ~1300 lines | Adding kind handlers grows it; consider splitting dispatch into `combat_dispatch.ts` if it exceeds ~2000 lines |
| Sell logic duplication | 2 copies (intent + reducer) | Extract fixes this permanently |

## Sources

- Direct codebase analysis of `spacetimedb/src/` and `src/` directories
- SpacetimeDB TypeScript SDK patterns from CLAUDE.md
- Mechanical vocabulary in `spacetimedb/src/data/mechanical_vocabulary.ts`
- Component analysis of `src/components/` and `src/composables/`
