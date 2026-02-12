# Coding Conventions

**Analysis Date:** 2026-02-11

## Naming Patterns

**Files:**
- Composables use `use` prefix: `useAuth.ts`, `useInventory.ts`, `useMovement.ts`, `useCharacters.ts`
- Components use PascalCase: `CharacterPanel.vue`, `InventoryPanel.vue`, `AppHeader.vue`
- Regular TypeScript files use camelCase: `spacetimeAuth.ts`, `styles.ts`, `effectTimers.ts`
- Directories use camelCase: `src/composables/`, `src/components/`, `src/auth/`, `src/ui/`

**Functions and Variables:**
- camelCase for all function and variable names: `equipItem()`, `deleteCharacter()`, `inventoryItems`, `selectedCharacter`
- Vue composable functions are named with `use` prefix: `export const useAuth = (...)`
- Computed properties use descriptive names: `equippedSlots`, `inventoryItems`, `currentLocation`, `activePanel`
- Reducer functions use camelCase: `loginEmail`, `moveCharacter`, `equipItem`, `useItem`

**Types:**
- Row types from database bindings use `Row` suffix: `CharacterRow`, `ItemInstanceRow`, `PlayerRow`, `CharacterRow`
- Argument objects follow naming convention: `UseAuthArgs`, `UseInventoryArgs`, `UseMovementArgs`
- Enum-like constants use UPPER_SNAKE_CASE: `EQUIPMENT_SLOTS`, `STORAGE_KEYS`
- Type names are PascalCase: `InventoryItem`, `EquippedSlot`, `NewCharacterForm`

**Event Emitters:**
- Vue component emit names use kebab-case: `@update:newCharacter`, `@create`, `@select`, `@delete`, `@show-tooltip`, `@move-tooltip`, `@hide-tooltip`
- Internal handler functions use `on` prefix: `onNameInput()`, `onClassChange()`, `onHotbarClick()`, `onResearchRecipes()`, `onCraftRecipe()`
- Reducer invocations describe action: `equipItem()`, `unequipItem()`, `deleteCharacter()`, `createCharacter()`

## Code Style

**Formatting:**
- TypeScript strict mode enabled (`strict: true` in tsconfig.json)
- ES2020 as target with ESNext module resolution
- Unused variables/parameters flagged by TypeScript (`noUnusedLocals`, `noUnusedParameters`)
- No fallthrough cases in switches (`noFallthroughCasesInSwitch`)
- No explicit linter/formatter config (prettier/eslint not present)
- Vue single-file components use TypeScript (`lang="ts"`) and script setup syntax

**Indentation and Spacing:**
- Inferred from code: 2-space indentation
- Single quotes used in imports: `from 'vue'`, `from 'spacetimedb/vue'`
- Template strings used for complex interpolations: ``${variable}``

## Import Organization

**Order:**
1. Vue imports (from 'vue')
2. Framework imports (from 'spacetimedb/...')
3. Generated module bindings (from '../module_bindings')
4. Local relative imports (from '../...')
5. Component imports (from './...' or './components/...')

**Examples from codebase:**
```typescript
// Composable imports
import { computed, ref, watch, type Ref } from 'vue';
import { reducers, type PlayerRow } from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';
import { beginSpacetimeAuthLogin, clearAuthSession } from '../auth/spacetimeAuth';

// Component imports
import { useGameData } from './composables/useGameData';
import { useCharacters } from './composables/useCharacters';
import { styles } from './ui/styles';
```

**Path Aliases:**
- No path aliases in use; all imports are relative paths
- Module bindings always imported from `../module_bindings` in composables
- From App.vue, bindings imported from `./module_bindings`

## Error Handling

**Patterns:**
- Error instances checked with `instanceof Error`: `err instanceof Error ? err.message : 'Default message'`
- Try-catch blocks used for async operations and auth flows
- Vue watch callbacks use try-catch with fallback messages
- Reducer calls wrapped in guard conditions before execution: `if (!connActive.value || !selectedCharacter.value) return;`
- JSON parse errors caught silently with comment: `} catch { /* ignore malformed state */ }`

**Examples from codebase:**
```typescript
// From useAuth.ts
try {
  authMessage.value = 'Redirecting to SpacetimeAuth...';
  void beginSpacetimeAuthLogin();
} catch (err) {
  authMessage.value = '';
  authError.value = err instanceof Error ? err.message : 'Login failed';
}

// From spacetimeAuth.ts
if (!response.ok) {
  const text = await response.text();
  throw new Error(text || 'Failed to exchange auth code.');
}

// From App.vue - parsing with fallback
try {
  const parsed = JSON.parse(raw) as Partial<Record<AccordionKey, boolean>>;
  (Object.keys(accordionState) as AccordionKey[]).forEach((key) => {
    if (typeof parsed[key] === 'boolean') {
      accordionState[key] = parsed[key] as boolean;
    }
  });
} catch {
  // ignore malformed state
}
```

## Logging

**Framework:** console (no logging library detected)

**Patterns:**
- No logging framework or library in use
- No visible logging statements in analyzed files
- Errors surfaced through Vue state (authError, createError)
- Messages shown to user through computed properties and UI state

## Comments

**When to Comment:**
- Minimal commenting observed
- Comments used for intent clarification in complex logic
- Silent catch blocks use single-line comments: `// ignore malformed state`
- Function parameters documented through TypeScript types instead of comments

**JSDoc/TSDoc:**
- Not used in analyzed code
- Type definitions handle documentation through interfaces and type aliases
- Props/emits in Vue components use TypeScript `defineProps<>` and `defineEmits<>` for self-documenting signatures

## Function Design

**Size:**
- Functions are generally small and focused (5-50 lines typical)
- Composable functions return object with properties/methods
- Event handlers simple, delegating to composable methods
- Complex logic extracted to computed properties

**Parameters:**
- Composables accept single object parameter with type: `useAuth({ connActive, player }): UseAuthArgs`
- Reducer calls use object syntax (required by SpacetimeDB): `moveCharacterReducer({ characterId: ..., locationId: ... })`
- Event handlers receive Vue event objects

**Return Values:**
- Composables return objects with computed properties and methods: `{ email, isLoggedIn, login, logout, authMessage, authError }`
- Methods return void or early return on guard conditions
- Getters return single values or arrays

## Module Design

**Exports:**
- Named exports for composables: `export const useAuth = (...)`
- Named exports for utilities: `export const getStoredIdToken = ()`, `export const clearAuthSession = ()`
- Default export for Vue components: `<script setup lang="ts">` (implicit)
- Single object export for styles: `export const styles = { ... }`

**Barrel Files:**
- Not used; imports specify exact file location
- Each composable file is separate import

## Type System

**Generic Types:**
- Ref<T> used extensively for Vue reactivity: `connActive: Ref<boolean>`, `selectedCharacter: Ref<CharacterRow | null>`
- Computed<T> for derived state: `computed<InventoryItem[]>(() => ...)`
- Row types imported from bindings with strict typing
- Type guards use `instanceof` and truthiness checks

**Union Types:**
- Panel names as union literal: `'character' | 'inventory' | 'hotbar' | 'friends' | 'group' | ...`
- Optional chaining used extensively: `result?.id.toString()`, `currentLocation?.name`
- Nullish coalescing for defaults: `row.price ?? 0`

---

*Convention analysis: 2026-02-11*
