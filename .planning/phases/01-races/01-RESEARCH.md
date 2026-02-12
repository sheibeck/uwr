# Phase 1: Races - Research

**Researched:** 2026-02-11
**Domain:** SpacetimeDB TypeScript SDK 1.12.0, Vue 3 character creation flow
**Confidence:** HIGH (all findings verified from live codebase)

---

## Summary

The codebase already has a `race: t.string()` field on the `Character` table and the `create_character` reducer already accepts a `race` parameter — but race is currently a free-text string with no validation or stat effect. The Race table, RACE_DATA constant, and class-restriction logic do not yet exist.

The stat system stores base stats directly on the character row (str/dex/cha/wis/int). Racial bonuses should be baked into these values at creation time following the same pattern as class bonuses in `computeBaseStats`. The server-side `recomputeCharacterDerived` function then layers gear + effect bonuses on top of those stored base stats when computing derived values — racial bonuses do NOT need to plug into that function.

The seeding pattern is well-established: data constants live in `spacetimedb/src/data/`, an `ensure*` function upserts rows into the table, and `syncAllContent` calls that function. The `/synccontent` command triggers `syncAllContent` at runtime without a database wipe. The Race table should follow this exact pattern.

**Primary recommendation:** Add the Race table to `index.ts`, create `spacetimedb/src/data/races.ts` with RACE_DATA and an `ensureRaces` function, wire it into `syncAllContent`, update `create_character` to validate `raceId` and apply racial stat bonuses, then replace CharacterPanel's free-text race input with a race picker that reads from the Race table.

---

## Codebase Findings (Pre-existing State)

### What already exists

| Item | Location | State |
|------|----------|-------|
| `race: t.string()` on Character table | `spacetimedb/src/index.ts:226` | Stored as free text |
| `create_character` reducer accepts `race: t.string()` | `spacetimedb/src/reducers/characters.ts:100` | No validation, no stat effect |
| `race` text input in CharacterPanel.vue | `src/components/CharacterPanel.vue:14-21` | Free text `<input>` |
| `newCharacter.race` ref in useCharacterCreation | `src/composables/useCharacterCreation.ts:23` | Plain string |
| `character.race` displayed in character list | `CharacterPanel.vue:63`, `AppHeader.vue:15` | Display only |
| `statBonuses` prop on StatsPanel.vue | `src/components/StatsPanel.vue:98` | Only equipment bonuses |
| `equippedStatBonuses` computed in App.vue | `src/App.vue:1404` | Equipment only, no racial |

### What does NOT exist yet

- No `Race` table
- No `RACE_DATA` constant or `races.ts` file
- No `ensureRaces` function
- No race-class validation in `create_character`
- No racial stat application in `create_character`

---

## Architecture Patterns

### Pattern 1: Data Seeding (Established Pattern)

**What:** Static game data is stored in `spacetimedb/src/data/*.ts` as a constant, then seeded into a SpacetimeDB table via an `ensure*` function.

**When to use:** All static game data that needs to be readable by clients via subscription.

**Example from `ensureAbilityTemplates`:**
```typescript
// spacetimedb/src/data/ability_catalog.ts — data constant
export const ABILITIES = { wizard_bolt: { name: 'Arcane Bolt', className: 'wizard', ... } };

// spacetimedb/src/index.ts — ensure function (upsert pattern)
function ensureAbilityTemplates(ctx: any) {
  for (const [key, ability] of Object.entries(ABILITIES)) {
    const existing = [...ctx.db.abilityTemplate.iter()].find((row) => row.key === key);
    if (existing) {
      ctx.db.abilityTemplate.id.update({ ...existing, ...updatedFields });
      continue;
    }
    ctx.db.abilityTemplate.insert({ id: 0n, key, ...fields });
  }
}

// Wired into syncAllContent
function syncAllContent(ctx: any) {
  ensureAbilityTemplates(ctx);
  // ...other ensure calls
}
```

**The Race pattern follows this exactly:** `RACE_DATA` in `races.ts`, `ensureRaces(ctx)` in `index.ts`, called from `syncAllContent`.

### Pattern 2: Comma-Separated List Fields

**What:** Arrays of values are stored as comma-separated strings in table fields. Existing precedent in `ItemTemplate.allowedClasses`.

**Example from `isClassAllowed`:**
```typescript
// spacetimedb/src/index.ts:2946
function isClassAllowed(allowedClasses: string, className: string) {
  if (!allowedClasses || allowedClasses.trim().length === 0) return true;
  const normalized = normalizeClassName(className);
  const allowed = allowedClasses
    .split(',')
    .map((entry) => normalizeClassName(entry))
    .filter((entry) => entry.length > 0);
  if (allowed.includes('any')) return true;
  return allowed.includes(normalized);
}
```

**Apply to Race:** `availableClasses: t.string()` — stored as `'warrior,paladin,rogue'` or `'all'`.

### Pattern 3: Stat Application at Creation (Established Pattern)

**What:** Character base stats are computed and stored in the Character row at creation. Derived stats (hitChance, maxHp, etc.) are recomputed via `recomputeCharacterDerived` when gear/effects change.

**How recomputeCharacterDerived works (source: `index.ts:2660`):**
```typescript
function recomputeCharacterDerived(ctx, character) {
  const gear = getEquippedBonuses(ctx, character.id);
  const effectStats = { str: sumCharacterEffect(ctx, character.id, 'str_bonus'), ... };
  const totalStats = {
    str: character.str + gear.str + effectStats.str,  // <-- character.str is the base
    // ...
  };
  // Derives maxHp, maxMana, hitChance, etc. from totalStats
}
```

**Critical insight:** `character.str` etc. are the stored base values. Racial bonuses should be added to these at creation — they become part of the base, not a separate additive layer. This means racial bonuses naturally flow through `recomputeCharacterDerived` automatically.

### Pattern 4: Dependency Injection via reducerDeps

**What:** Reducers are registered via `registerCharacterReducers(deps)` where `deps` is the `reducerDeps` object built in `index.ts`. To pass race validation logic to the character reducer, add the race lookup helper to `reducerDeps`.

**Example (source: `index.ts:5643`, `reducers/characters.ts:1`):**
```typescript
// index.ts — add to reducerDeps
const reducerDeps = {
  spacetimedb,
  t,
  // ... existing deps ...
  computeBaseStats,
  // Add: RACE_DATA
};

// reducers/characters.ts — destructure from deps
export const registerCharacterReducers = (deps: any) => {
  const { RACE_DATA, computeBaseStats, ... } = deps;
  // Use RACE_DATA in create_character
};
```

### Pattern 5: Client Table Subscription

**What:** New tables are added to `useGameData.ts` as `const [races] = useTable(tables.race)` after regenerating bindings. The `tables.race` accessor is auto-generated by `spacetime generate`.

**Example from `useGameData.ts:6`:**
```typescript
const [players] = useTable(tables.player);
```

**Race addition:**
```typescript
const [races] = useTable(tables.race);
// returned in the return object
```

### Recommended Project Structure (Race-specific additions)

```
spacetimedb/src/
├── data/
│   ├── class_stats.ts          (existing — add nothing here for pure stat bonuses)
│   └── races.ts                (NEW — RACE_DATA constant + ensureRaces function)
├── index.ts                    (add Race table def + schema export + ensureRaces call)
└── reducers/
    └── characters.ts           (update create_character to accept raceId, validate, apply bonuses)

src/
├── composables/
│   ├── useGameData.ts          (add races to useTable calls)
│   └── useCharacterCreation.ts (update to use raceId instead of race string)
└── components/
    └── CharacterPanel.vue      (replace text input with race picker dropdown)
```

### Anti-Patterns to Avoid

- **Storing race as a foreign key on Character:** The existing `race: t.string()` field stores the race name as a display string. The phase requirement uses `raceId` in the reducer argument for validation, but the character row likely still stores the race name string for display. Do NOT add a `raceId` column to Character — the reducer accepts `raceId`, looks up the race row, validates, then stores `race: raceName` on the character.
- **Dynamic racial bonus computation in recomputeCharacterDerived:** Do not add a `race` lookup to `recomputeCharacterDerived`. Apply bonuses at creation, store them in the character's base stats. The existing recompute logic will handle them transparently.
- **Using `.iter()` in a view for race data:** The Race table can be `public: true`, so all clients can subscribe directly — no view needed.
- **Multi-column indexes on Race:** The Race table only needs a primary key. Do not add unnecessary indexes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Comma-separated class list parsing | Custom tokenizer | Reuse `isClassAllowed` pattern from `index.ts:2946` | Already exists and tested |
| Race-class validation in reducer | Ad-hoc string logic | A helper function matching `isClassAllowed` shape | Consistent with item class restrictions |
| Race data seeding | Manual SQL inserts or init reducer | `ensureRaces(ctx)` called from `syncAllContent` | Established pattern, survives republish |
| Client race display | Hardcoded array in component | Read from `tables.race` via `useTable` | Allows World Event unlocks later |

**Key insight:** The codebase has clear conventions for every sub-problem in this phase. Follow them exactly — do not introduce new patterns.

---

## Common Pitfalls

### Pitfall 1: Passing raceId vs. race string to create_character
**What goes wrong:** The reducer signature could accept either `raceId: t.u64()` (lookup by ID) or `race: t.string()` (lookup by name). If `race: t.string()` is kept, validation is fragile (case mismatch).
**Why it happens:** The existing reducer already has `race: t.string()`. It's tempting to just validate against the table by name.
**How to avoid:** Change the reducer to accept `raceId: t.u64()`. Look up the Race row by ID. Throw `SenderError` if not found or `unlocked: false`. Store `race: raceRow.name` on the character for display.
**Warning signs:** Race picker sends an ID but reducer still expects a string.

### Pitfall 2: Forgetting to add Race to schema() export
**What goes wrong:** Table is defined but not included in the `schema()` call — SpacetimeDB won't create it.
**Why it happens:** The `schema()` call at line 1177 of `index.ts` must include every table.
**How to avoid:** Add `Race` to the `schema(...)` call alongside all other tables.
**Warning signs:** `ctx.db.race` is undefined at runtime; bindings generation produces no race table.

### Pitfall 3: Forgetting to regenerate bindings
**What goes wrong:** Frontend uses stale `module_bindings` — no `tables.race`, `reducers.createCharacter` still typed with old signature.
**Why it happens:** Easy to skip after backend changes.
**How to avoid:** Run `pnpm spacetime:generate` after every schema/reducer change. Verify `tables.race` exists in generated output.
**Warning signs:** TypeScript errors on `tables.race` access.

### Pitfall 4: Race not in syncAllContent
**What goes wrong:** Race rows exist after first publish (from `init`) but not after a `/synccontent` run, or vice versa.
**Why it happens:** Forgetting to call `ensureRaces(ctx)` from both `spacetimedb.init` (via `syncAllContent`) AND making `syncAllContent` the single source of truth.
**How to avoid:** `syncAllContent` calls `ensureRaces(ctx)`. `spacetimedb.init` calls `syncAllContent`. The `/synccontent` command also calls `syncAllContent`. All three paths are covered automatically.

### Pitfall 5: Missing Race in useGameData and useTable
**What goes wrong:** Race rows are in the database but the Vue component has no reactive data.
**Why it happens:** `useGameData.ts` must be manually updated with every new table.
**How to avoid:** Add `const [races] = useTable(tables.race)` to `useGameData.ts` and include `races` in the returned object.

### Pitfall 6: Class filter not applied client-side before reducer call
**What goes wrong:** User selects a race, then selects a class that the race doesn't allow, and submits. Server rejects with error.
**Why it happens:** The reducer enforces race-class restrictions, but the UI hasn't filtered the class dropdown.
**How to avoid:** When race is selected in CharacterPanel, filter `CLASS_OPTIONS` to only show classes permitted by the selected race's `availableClasses` field. Clear `className` if it becomes invalid.

---

## Code Examples

Verified patterns from live codebase:

### Race Table Definition
```typescript
// spacetimedb/src/index.ts — add before schema() export
const Race = table(
  { name: 'race', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    description: t.string(),
    availableClasses: t.string(),  // comma-separated: 'all' or 'warrior,paladin'
    strBonus: t.u64(),
    dexBonus: t.u64(),
    chaBonus: t.u64(),
    wisBonus: t.u64(),
    intBonus: t.u64(),
    unlocked: t.bool(),
  }
);
```

### RACE_DATA Constant (races.ts)
```typescript
// spacetimedb/src/data/races.ts
export const RACE_DATA: Array<{
  name: string;
  description: string;
  availableClasses: string;
  strBonus: bigint;
  dexBonus: bigint;
  chaBonus: bigint;
  wisBonus: bigint;
  intBonus: bigint;
  unlocked: boolean;
}> = [
  {
    name: 'Human',
    description: 'Adaptable and resourceful, humans can pursue any path.',
    availableClasses: 'all',
    strBonus: 0n, dexBonus: 0n, chaBonus: 1n, wisBonus: 0n, intBonus: 0n,
    unlocked: true,
  },
  {
    name: 'Eldrin',
    description: 'Ancient scholars attuned to arcane and divine forces.',
    availableClasses: 'bard,enchanter,cleric,wizard,necromancer,spellblade,shaman,druid,reaver,summoner,paladin,ranger',
    strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 1n, intBonus: 2n,
    unlocked: true,
  },
  {
    name: 'Ironclad',
    description: 'Forged in industry, masters of strength and craft.',
    availableClasses: 'warrior,paladin,monk,beastmaster,spellblade,ranger,shaman',
    strBonus: 2n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n,
    unlocked: true,
  },
  {
    name: 'Wyldfang',
    description: 'Swift hunters bonded with the untamed wild.',
    availableClasses: 'rogue,ranger,monk,beastmaster,druid,shaman',
    strBonus: 0n, dexBonus: 2n, chaBonus: 0n, wisBonus: 1n, intBonus: 0n,
    unlocked: true,
  },
];

export function ensureRaces(ctx: any) {
  for (const data of RACE_DATA) {
    const existing = [...ctx.db.race.iter()].find(
      (row: any) => row.name === data.name
    );
    if (existing) {
      ctx.db.race.id.update({ ...existing, ...data });
      continue;
    }
    ctx.db.race.insert({ id: 0n, ...data });
  }
}
```

### Updated create_character Reducer Signature
```typescript
// spacetimedb/src/reducers/characters.ts
spacetimedb.reducer(
  'create_character',
  { name: t.string(), raceId: t.u64(), className: t.string() },
  (ctx, { name, raceId, className }) => {
    // ... existing name validation ...

    // Race validation
    const raceRow = ctx.db.race.id.find(raceId);
    if (!raceRow) throw new SenderError('Invalid race');
    if (!raceRow.unlocked) throw new SenderError('Race not unlocked');

    // Class restriction
    if (!isClassAllowed(raceRow.availableClasses, className)) {
      throw new SenderError(`${className} is not available to ${raceRow.name}`);
    }

    // Apply racial bonuses on top of base class stats
    const baseStats = computeBaseStats(className, 1n);
    const str = baseStats.str + raceRow.strBonus;
    const dex = baseStats.dex + raceRow.dexBonus;
    const cha = baseStats.cha + raceRow.chaBonus;
    const wis = baseStats.wis + raceRow.wisBonus;
    const int_ = baseStats.int + raceRow.intBonus;

    const manaStat = manaStatForClass(className, { str, dex, cha, wis, int: int_ });
    const maxHp = BASE_HP + str * 5n;
    const maxMana = usesMana(className) ? BASE_MANA + manaStat * 6n : 0n;
    const armorClass = baseArmorForClass(className);

    const character = ctx.db.character.insert({
      id: 0n,
      // ...
      race: raceRow.name,   // store display name
      className: className.trim(),
      str, dex, cha, wis, int: int_,
      // ... other derived fields using str/dex/etc ...
    });
    // ...
  }
);
```

### syncAllContent update
```typescript
// spacetimedb/src/index.ts
import { RACE_DATA, ensureRaces } from './data/races';

function syncAllContent(ctx: any) {
  ensureRaces(ctx);           // Add this line
  ensureWorldLayout(ctx);
  ensureStarterItemTemplates(ctx);
  // ... rest unchanged
}
```

### Client Race Picker (CharacterPanel.vue)
```vue
<!-- Replace free-text race input with dropdown -->
<select
  :value="newCharacter.raceId"
  :disabled="!connActive"
  :style="styles.input"
  @change="onRaceChange"
>
  <option value="">Select Race</option>
  <option
    v-for="race in unlockedRaces"
    :key="race.id.toString()"
    :value="race.id.toString()"
  >
    {{ race.name }}
  </option>
</select>
<div v-if="selectedRace" :style="styles.subtle">
  {{ selectedRace.description }}
  <span v-if="hasAnyRacialBonus"> — </span>
  <span v-if="selectedRace.strBonus > 0n">STR +{{ selectedRace.strBonus }} </span>
  <!-- ...other bonuses... -->
</div>
```

### Client createCharacter call update (useCharacterCreation.ts)
```typescript
// newCharacter ref shape change
const newCharacter = ref({ name: '', raceId: '', className: '' });

// reducer call
createCharacterReducer({
  name: newCharacter.value.name.trim(),
  raceId: BigInt(newCharacter.value.raceId),
  className: newCharacter.value.className.trim(),
});
```

### Adding races to useGameData.ts
```typescript
// src/composables/useGameData.ts — add after existing useTable calls
const [races] = useTable(tables.race);
// ...
return { ..., races };
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Race as TypeScript enum (locked at compile time) | Race as DB table with `unlocked: bool` | Enables World Event race unlocks at runtime |
| Free-text race input (current state) | Race picker dropdown from Race table | Enforces valid race selection |
| No race-class validation | Validated in `create_character` reducer | Server enforces combo rules |
| No racial stat bonuses | Bonuses applied at character creation | Racial identity matters mechanically |

---

## Open Questions

1. **Stat bonus values for the 4 races**
   - What we know: The scope says "bonuses" exist but doesn't specify exact values
   - What's unclear: Whether the above example values (Human: +1 CHA, Eldrin: +1 WIS +2 INT, Ironclad: +2 STR, Wyldfang: +2 DEX +1 WIS) are correct
   - Recommendation: These are reasonable starter values. The planner should note them as "example values — confirm before implementation" or treat them as decisions for the implementer.

2. **Should create_character's old `race: t.string()` parameter be renamed to `raceId: t.u64()` immediately?**
   - What we know: The reducer currently uses `race: t.string()`. The client calls it with `race: newCharacter.value.race.trim()`.
   - What's unclear: Whether renaming breaks existing characters or in-flight sessions
   - Recommendation: The Character row's `race` field (a string display name) stays as-is. Only the reducer parameter changes from `race: t.string()` to `raceId: t.u64()`. Existing characters are unaffected. This is a clean migration.

3. **Does the `ensureRaces` upsert need to handle existing characters whose race no longer maps?**
   - What we know: Existing characters store `race` as a string name (e.g., 'Human'). If race names change, the display still works.
   - What's unclear: Whether any migration of existing character data is needed
   - Recommendation: No migration needed. Existing characters keep their string race name. Only new character creation uses raceId.

---

## Sources

### Primary (HIGH confidence)
- Live codebase at `C:/projects/uwr/spacetimedb/src/index.ts` — table definitions, schema export, `recomputeCharacterDerived`, `isClassAllowed`, `syncAllContent`, `ensureAbilityTemplates` patterns
- `C:/projects/uwr/spacetimedb/src/reducers/characters.ts` — full `create_character` reducer implementation
- `C:/projects/uwr/spacetimedb/src/data/class_stats.ts` — `computeBaseStats`, stat keys, all class definitions
- `C:/projects/uwr/src/components/CharacterPanel.vue` — current UI, CLASS_OPTIONS, race input
- `C:/projects/uwr/src/composables/useCharacterCreation.ts` — client reducer call pattern
- `C:/projects/uwr/src/composables/useGameData.ts` — `useTable` subscription pattern
- `C:/projects/uwr/src/App.vue` — `equippedStatBonuses` computed, panel wiring
- `C:/projects/uwr/src/components/StatsPanel.vue` — `statBonuses` prop interface

### Secondary (MEDIUM confidence)
- CLAUDE.md SpacetimeDB TypeScript SDK rules — confirmed `table()` signature, `t` types, reducer object syntax, `useTable` tuple return

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from package.json (spacetimedb ^1.12.0, vue ^3.5.13)
- Architecture patterns: HIGH — all patterns verified from live code, not assumed
- Pitfalls: HIGH — derived from actual code structure, not general knowledge
- Stat bonus values: LOW — example values only, not specified in requirements

**Research date:** 2026-02-11
**Valid until:** 2026-03-13 (stable codebase, no external dependencies change)
