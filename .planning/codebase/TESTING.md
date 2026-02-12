# Testing Patterns

**Analysis Date:** 2026-02-11

## Test Framework

**Status:** Not Detected

**Framework:** None

**Configuration:** No test framework configuration files found (`jest.config.*`, `vitest.config.*`, `mocha.opts`)

**Assertion Library:** Not Detected

**Run Commands:**
```bash
# No test commands defined in package.json
# Available scripts:
# npm run dev      # Start dev server
# npm run build    # Build for production
# npm run preview  # Preview production build
# npm run generate # Generate SpacetimeDB bindings
```

## Test File Organization

**Location:** No test files present

**Finding:** Zero test files found in project:
- No `*.test.ts` files
- No `*.spec.ts` files
- No `__tests__/` directories
- No `tests/` directories

**Implication:** Project has no unit tests, integration tests, or E2E tests in the analyzed codebase.

## Test Structure

**Not Applicable** - No test infrastructure present

## Testing Approach

**Manual Testing Only:**
The codebase appears to rely on manual testing through the running application. Key testable areas identified but not covered:

**Composables (High Priority for Testing):**
- `src/composables/useAuth.ts` - Login/logout flow, token handling
- `src/composables/useInventory.ts` - Item management, equipment logic
- `src/composables/useCharacters.ts` - Character selection, movement
- `src/composables/useGameData.ts` - Data subscription management
- `src/composables/useCombat.ts` - Combat state management

**Auth Module (Critical):**
- `src/auth/spacetimeAuth.ts` - PKCE flow, JWT parsing, token storage
- Methods like `beginSpacetimeAuthLogin()`, `handleSpacetimeAuthCallback()`
- Token validation and expiration checks

**Utilities (Should Be Tested):**
- `src/ui/styles.ts` - Style object generation
- String formatting and calculations in composables

## Mocking

**Framework:** Not Applicable

**What Would Need Mocking:**
- SpacetimeDB connection/reducers (useReducer, useTable from spacetimedb/vue)
- Window APIs (localStorage, crypto, fetch)
- Vue reactive refs and computed properties
- HTTP requests (auth flow, token exchange)

**Current Pattern:** No mocking infrastructure exists

## Fixtures and Factories

**Test Data:** Not Present

**Location:** No fixture files in codebase

**Observations:**
- Hardcoded test data in composables (e.g., EQUIPMENT_SLOTS in useInventory.ts)
- Hardcoded constants like usable item keys: `['bandage', 'basic_poultice', ...]`
- No factory functions for creating test data

## Coverage

**Requirements:** None enforced

**Status:** Unknown/Not Measured

## Security Testing

**Findings:**
- No automated security tests
- Auth flow in `src/auth/spacetimeAuth.ts` uses PKCE (good)
- JWT parsing done manually in `parseJwtEmail()` - would benefit from security review
- localStorage used for token storage - manual xss risk assessment needed

## Common Code Patterns Needing Tests

### Pattern 1: Reducer Guard with Computed State
```typescript
// From useInventory.ts
const equipItem = (itemInstanceId: bigint) => {
  if (!connActive.value || !selectedCharacter.value) return;
  equipReducer({ characterId: selectedCharacter.value.id, itemInstanceId });
};
```
Should test:
- Does not call reducer when disconnected
- Does not call reducer when no character selected
- Calls reducer with correct character ID when both conditions met

### Pattern 2: Complex Computed Filtering
```typescript
// From useInventory.ts - complex stat calculation and filtering
const inventoryItems = computed<InventoryItem[]>(() =>
  ownedInstances.value
    .filter((instance) => !instance.equippedSlot)
    .map((instance) => { /* 20+ line transformation */ })
    .sort((a, b) => a.name.localeCompare(b.name))
);
```
Should test:
- Correct filtering of only unequipped items
- Stat calculations with various template values
- Null/undefined handling for optional template fields
- Sorting order

### Pattern 3: State Watch Reactions
```typescript
// From App.vue
watch(
  [() => isLoggedIn.value, () => player.value?.activeCharacterId],
  ([loggedIn, activeId]) => {
    if (!loggedIn) {
      selectedCharacterId.value = '';
      activePanel.value = 'none';
      return;
    }
    // ... more state changes
  }
);
```
Should test:
- Clears state when logged out
- Selects character when login occurs and ID available
- Updates panel state appropriately

### Pattern 4: Async Auth Flow
```typescript
// From spacetimeAuth.ts
export const handleSpacetimeAuthCallback = async () => {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  // ... validation and token exchange
  const response = await fetch(`${ISSUER}/oidc/token`, { ... });
  if (!response.ok) throw new Error(...);
  const payload = await response.json();
  // ... store tokens, parse JWT
  return { idToken, email };
};
```
Should test:
- Extracts code from URL
- Validates state parameter
- Makes POST request with correct body
- Handles error responses
- Parses JWT email correctly
- Stores tokens in localStorage

### Pattern 5: localStorage Persistence
```typescript
// From App.vue - window position persistence
const loadAccordionState = () => {
  if (typeof window === 'undefined') return;
  const raw = window.localStorage.getItem('accordionState');
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    // ... apply to state
  } catch {
    // ignore malformed state
  }
};
```
Should test:
- Handles missing localStorage (SSR safety)
- Parses valid JSON correctly
- Silently ignores invalid JSON
- Applies only known keys from storage
- Persists changes back to localStorage

## Recommended Testing Strategy

**Priority Order:**

1. **Auth Module** (Critical)
   - `spacetimeAuth.ts` - All public functions
   - PKCE validation
   - JWT parsing
   - localStorage interaction

2. **Composables** (High)
   - Data filtering and transformation logic
   - Guard conditions before reducer calls
   - Watcher side effects
   - Computed property calculations

3. **UI State Management** (Medium)
   - Panel open/close logic
   - Position persistence
   - Tooltip management
   - Drag handlers

4. **Type Validation** (Medium)
   - Row type assertions
   - Template field nullability

**Test Framework Recommendation:**
- Vitest (aligned with Vite, modern, fast)
- Or Jest with Vue Test Utils for component testing
- Consider adding Playwright for E2E tests

---

*Testing analysis: 2026-02-11*
