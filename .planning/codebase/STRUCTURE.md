# Codebase Structure

**Analysis Date:** 2026-02-11

## Directory Layout

```
uwr/
├── spacetimedb/                 # Backend server module
│   ├── src/
│   │   ├── index.ts             # Table definitions & module entry
│   │   ├── data/                # Game constants (abilities, XP, class stats)
│   │   ├── helpers/             # Shared business logic (group, combat helpers)
│   │   ├── reducers/            # State mutation handlers
│   │   ├── views/               # Data filtering & computed views
│   │   └── seed/                # (Optional) data seeding scripts
│   ├── package.json
│   └── tsconfig.json
│
├── src/                         # Frontend Vue 3 SPA
│   ├── main.ts                  # App entry, SpacetimeDB connection
│   ├── App.vue                  # Root component, orchestrator
│   ├── auth/                    # Authentication (SpacetimeAuth OIDC)
│   ├── components/              # Vue SFC components (UI)
│   ├── composables/             # Vue 3 composition functions (logic)
│   ├── data/                    # Frontend constants (unused currently)
│   ├── module_bindings/         # Generated (NEVER EDIT) - spacetime generate output
│   └── ui/                      # Styling (styles.ts - inline style objects)
│
├── .planning/
│   └── codebase/                # GSD analysis documents
│
├── dist/                        # Build output (vite build)
├── package.json                 # Frontend dependencies
├── tsconfig.json                # TypeScript config (frontend)
├── vite.config.ts               # Vite bundler config
└── README.md                    # Project documentation
```

## Directory Purposes

**Backend (`spacetimedb/src/`):**
- **index.ts:** Defines all tables (Character, ItemInstance, CombatEncounter, etc.), exports `spacetimedb` schema object
- **data/:** Constants used by reducers
  - `ability_catalog.ts`: All ability definitions, enemy abilities
  - `class_stats.ts`: Base HP/mana, armor rules, stat calculations
  - `xp.ts`: XP curve by level
- **helpers/:** Functions for shared logic across reducers
  - `group.ts`: Group membership checks, participant filtering
- **reducers/:** Organized by domain; each exports `register[Domain]Reducers()`
  - `auth.ts`: Player identity, login
  - `characters.ts`: Character creation, stats, death, respawn
  - `combat.ts`: Combat start, turn resolution, damage
  - `commands.ts`: Slash commands (e.g., `/w` whisper)
  - `groups.ts`: Group creation, invite, member management
  - `items.ts`: Equip, use, delete items; vendor transactions
  - `movement.ts`: Character travel between locations
  - `social.ts`: Friends, friend requests
- **views/:** Organized by domain; each exports `register[Domain]Views()`
  - `player.ts`: `my_player` (current user), `my_group_members`, `my_group_invites`
  - `events.ts`: `my_location_events`, `my_private_events`, `my_group_events`
  - `combat.ts`: `my_combat_results`, `my_combat_loot`
  - Others: Similar per-user filtered views

**Frontend (`src/`):**
- **main.ts:** Bootstrap - creates SpacetimeDB connection, mounts Vue app
- **App.vue:** 2k+ lines - orchestrator component:
  - Calls all composables (useGameData, useCharacters, useCombat, etc.)
  - Manages top-level UI state (activePanel, panelPos, tooltip)
  - Renders dynamic panels (inventory, combat, vendor, etc.)
  - Wires up reducer calls for user actions
- **auth/spacetimeAuth.ts:** SpacetimeAuth OIDC flow (login, token storage)
- **components/:** UI-only Vue components
  - Large panels: `CombatPanel.vue`, `InventoryPanel.vue`, `GroupPanel.vue`
  - Small components: `ActionBar.vue`, `LogWindow.vue`, `HotbarPanel.vue`
  - Each receives data via props, emits events to parent
  - No direct reducer calls; parent orchestrates
- **composables/:** Vue 3 composition functions - organized by feature
  - `useGameData.ts`: Subscribes to all tables, returns reactive refs
  - `useCharacters.ts`: Character selection, location tracking
  - `useCombat.ts`: Combat state, enemy targeting, damage calculation
  - `useHotbar.ts`: Hotbar slot assignment, ability casting
  - `useInventory.ts`: Item slots, equipment, inventory space
  - `useAuth.ts`: Login/logout, session state
  - Others: Groups, friends, crafting, movement, trading, events
- **ui/styles.ts:** 700+ lines of inline CSS-in-JS style objects (no separate CSS files)
- **module_bindings/:** Generated - contains:
  - Table types: `CharacterRow`, `ItemInstanceRow`, etc.
  - Reducer signatures with typed arguments
  - View types and table references
  - **NEVER MANUALLY EDIT** - run `spacetime generate` to update

## Key File Locations

**Entry Points:**
- `src/main.ts`: Frontend bootstrap
- `spacetimedb/src/index.ts`: Backend module entry, table definitions
- `src/App.vue`: Application root component

**Configuration:**
- `package.json`: Dependencies, scripts
- `spacetimedb/src/index.ts`: Backend table schema
- `src/module_bindings/`: Generated client bindings (spacetime types)
- `vite.config.ts`: Frontend build config

**Core Logic:**
- `spacetimedb/src/reducers/`: All state mutations
- `src/composables/useGameData.ts`: Central data subscription orchestrator
- `src/App.vue`: UI state management and component orchestration

**Testing:**
- Not detected (no test files present)

## Naming Conventions

**Files:**

- **Backend schemas:** camelCase in code (e.g., `Character`), snake_case in `table({ name: 'character' })`
- **Reducers:** `register[Domain]Reducers` in files: `reducers/auth.ts`, `reducers/characters.ts`
- **Views:** `register[Domain]Views` in files: `views/player.ts`, `views/combat.ts`
- **Composables:** `use[Feature]` (e.g., `useCharacters.ts`, `useCombat.ts`)
- **Components:** PascalCase `.vue` files (e.g., `CharacterPanel.vue`, `InventoryPanel.vue`)

**Functions:**

- **Reducers (backend):** snake_case: `create_character`, `start_combat_with_enemy`, `set_active_character`
- **Reducer calls (client):** camelCase: `conn.reducers.createCharacter()`, `conn.reducers.startCombatWithEnemy()`
- **Composable exports:** camelCase: `selectedCharacter`, `activeCombat`, `useAbility()`
- **Helper functions:** camelCase: `getGroupOrSoloParticipants()`, `activeCombatIdForCharacter()`

**Variables:**

- **Reactive state:** camelCase refs: `selectedCharacter`, `activeCombat`, `isLoading`
- **Computed:** camelCase: `availableAbilities`, `inventoryItems`
- **Constants:** UPPER_SNAKE_CASE: `MAX_LEVEL`, `BASE_HP`, `GLOBAL_COOLDOWN_MICROS`
- **Props:** camelCase: `selectedCharacter`, `connActive`

**Types:**

- **Table rows (generated):** `[TableName]Row` (e.g., `CharacterRow`, `ItemInstanceRow`)
- **Custom interfaces:** PascalCase: `HotbarDisplaySlot`, `UseHotbarArgs`
- **Enums/unions:** PascalCase: `AccordionKey`

## Where to Add New Code

**New Feature (e.g., Leveling System):**

1. **Backend tables:** Add to `spacetimedb/src/index.ts`
   - Define table structure: `const LevelEvent = table(...)`
   - Export in schema: `export const spacetimedb = schema(Character, LevelEvent, ...)`

2. **Backend reducers:** Create/extend `spacetimedb/src/reducers/characters.ts`
   - Add reducer: `spacetimedb.reducer('grant_level', { args }, (ctx, args) => { ... })`
   - Register in `spacetimedb/src/reducers/index.ts`: `registerCharacterReducers()`

3. **Backend helpers:** Add to `spacetimedb/src/helpers/` if shared logic
   - E.g., `spacetimedb/src/helpers/leveling.ts`: `export function grantLevel(ctx, character) { ... }`

4. **Backend views:** Add to `spacetimedb/src/views/` if data filtering needed
   - E.g., `spacetimedb/src/views/quests.ts`: `my_available_quests`

5. **Regenerate bindings:** `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb`
   - Commit generated files

6. **Frontend composable:** Create `src/composables/use[Feature].ts`
   - Subscribe to tables: `const [data] = useTable(tables.levelEvent)`
   - Export refs and functions for components

7. **Frontend component:** Create `src/components/[Feature]Panel.vue`
   - Receive data via props
   - Call composable functions on user action
   - Emit events to parent (`App.vue`)

8. **Wire in App.vue:** Import composable and component
   - Call composable: `const { ... } = use[Feature]({...})`
   - Pass data to component: `<[Feature]Panel :data="data" @action="onAction" />`
   - Implement action handler calling reducer

**New Component (e.g., Hotbar Visual):**

1. Create `src/components/HotbarVisual.vue`
2. Receives props: `selectedCharacter`, `hotbar`, `hotbarDisplay`
3. Emits events: `@click-slot`, `@show-tooltip`
4. Import in `App.vue`, add to template with prop/event bindings

**New Utility Function:**

- **Backend:** Add to appropriate helper in `spacetimedb/src/helpers/`
- **Frontend:** Add to `src/composables/` if reusable logic, or inline in component if UI-specific

**New Constants:**

- **Game data:** Add to `spacetimedb/src/data/ability_catalog.ts`, `class_stats.ts`, or `xp.ts`
- **UI styles:** Add to `src/ui/styles.ts`
- **Feature constants:** Inline in reducer or composable if only used there

## Special Directories

**Generated (`src/module_bindings/`):**
- Purpose: Type bindings between backend schema and client
- Generated: By `spacetime generate` CLI
- Committed: Yes (check into git)
- Do NOT edit: Regenerate with `spacetime generate` after backend schema changes

**Build Output (`dist/`):**
- Purpose: Compiled frontend (HTML, JS, CSS)
- Generated: By `vite build`
- Committed: No (in .gitignore)
- Deployed: To web server

**Node Modules (`node_modules/`):**
- Committed: No
- Install: `npm install` or `pnpm install`

**.planning/codebase/ (Analysis Documents):**
- Purpose: Architecture and structure reference for future development
- Committed: Yes
- Updated: By GSD mapper when codebase architecture changes

---

*Structure analysis: 2026-02-11*
