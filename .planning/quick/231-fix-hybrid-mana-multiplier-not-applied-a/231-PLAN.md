---
phase: quick-231
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/index.ts
  - spacetimedb/src/reducers/characters.ts
autonomous: true
requirements: [QUICK-231]

must_haves:
  truths:
    - "create_character uses HYBRID_MANA_MULTIPLIER (4n) for paladin/ranger/reaver/spellblade"
    - "create_character uses MANA_MULTIPLIER (6n) for pure caster classes"
    - "Module publishes without errors"
  artifacts:
    - path: "spacetimedb/src/index.ts"
      provides: "MANA_MULTIPLIER, HYBRID_MANA_MULTIPLIER, HYBRID_MANA_CLASSES, normalizeClassName in reducerDeps"
    - path: "spacetimedb/src/reducers/characters.ts"
      provides: "create_character maxMana uses manaMultiplier not hardcoded 6n"
      contains: "HYBRID_MANA_CLASSES.has(normalizeClassName"
---

<objective>
Fix hybrid mana multiplier not being applied at character creation.

Root cause: The `create_character` reducer at line 268 of characters.ts hardcodes `* 6n` instead of using the HYBRID_MANA_MULTIPLIER constant added in quick-229. Brand new hybrid characters (paladin, ranger, reaver, spellblade) get full-caster mana pools.

The fix is three changes:
1. index.ts: import MANA_MULTIPLIER, HYBRID_MANA_MULTIPLIER, HYBRID_MANA_CLASSES, normalizeClassName from class_stats and add to reducerDeps
2. characters.ts: destructure those 4 from deps
3. characters.ts: replace the hardcoded `* 6n` with conditional multiplier lookup
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add hybrid mana constants to reducerDeps in index.ts</name>
  <files>spacetimedb/src/index.ts</files>
  <action>
**Change 1: Add to import from './data/class_stats' (around line 40-53)**

Currently imports end with:
```typescript
  TANK_CLASSES,
  HEALER_CLASSES,
} from './data/class_stats';
```

Change to:
```typescript
  TANK_CLASSES,
  HEALER_CLASSES,
  MANA_MULTIPLIER,
  HYBRID_MANA_MULTIPLIER,
  HYBRID_MANA_CLASSES,
  normalizeClassName,
} from './data/class_stats';
```

**Change 2: Add to reducerDeps object (around line 492-495, after BASE_MANA)**

Currently:
```typescript
  BASE_HP,
  HP_STR_MULTIPLIER,
  BASE_MANA,
  abilityCooldownMicros,
```

Change to:
```typescript
  BASE_HP,
  HP_STR_MULTIPLIER,
  BASE_MANA,
  MANA_MULTIPLIER,
  HYBRID_MANA_MULTIPLIER,
  HYBRID_MANA_CLASSES,
  normalizeClassName,
  abilityCooldownMicros,
```
  </action>
  <verify>
grep -n "HYBRID_MANA_CLASSES\|MANA_MULTIPLIER\|normalizeClassName" spacetimedb/src/index.ts
Expected: 3 lines in import block and 3-4 lines in reducerDeps block.
  </verify>
  <done>MANA_MULTIPLIER, HYBRID_MANA_MULTIPLIER, HYBRID_MANA_CLASSES, normalizeClassName all imported and present in reducerDeps.</done>
</task>

<task type="auto">
  <name>Task 2: Fix hardcoded 6n in create_character and destructure new deps</name>
  <files>spacetimedb/src/reducers/characters.ts</files>
  <action>
**Change 1: Add new constants to deps destructuring (around line 95-98)**

Currently:
```typescript
    BASE_HP,
    HP_STR_MULTIPLIER,
    BASE_MANA,
    ScheduleAt,
```

Change to:
```typescript
    BASE_HP,
    HP_STR_MULTIPLIER,
    BASE_MANA,
    MANA_MULTIPLIER,
    HYBRID_MANA_MULTIPLIER,
    HYBRID_MANA_CLASSES,
    normalizeClassName,
    ScheduleAt,
```

**Change 2: Fix the hardcoded maxMana formula (line 268)**

Currently:
```typescript
      const maxMana = usesMana(className) ? BASE_MANA + manaStat * 6n + (racial.racialMaxMana || 0n) : 0n;
```

Change to:
```typescript
      const manaMultiplier = HYBRID_MANA_CLASSES.has(normalizeClassName(className)) ? HYBRID_MANA_MULTIPLIER : MANA_MULTIPLIER;
      const maxMana = usesMana(className) ? BASE_MANA + manaStat * manaMultiplier + (racial.racialMaxMana || 0n) : 0n;
```
  </action>
  <verify>
grep -n "HYBRID_MANA_CLASSES\|manaMultiplier\|6n" spacetimedb/src/reducers/characters.ts
Expected: HYBRID_MANA_CLASSES in destructuring + manaMultiplier lines; no raw `* 6n` in the maxMana formula.

Then publish: spacetime publish uwr --project-path C:/projects/uwr/spacetimedb 2>&1 | tail -5
  </verify>
  <done>create_character uses manaMultiplier conditional. New paladin has ~half the mana of a new wizard at the same level.</done>
</task>

</tasks>

<verification>
After both tasks:
1. spacetime publish uwr --project-path C:/projects/uwr/spacetimedb — clean build
2. grep -n "6n" spacetimedb/src/reducers/characters.ts — no hardcoded 6n in maxMana formula
3. grep -n "HYBRID_MANA_CLASSES" spacetimedb/src/reducers/characters.ts — confirms usage
</verification>

<success_criteria>
- New paladin/ranger/reaver/spellblade characters created with ~4/6 the mana of an equivalent caster
- Module publishes without errors
- No regressions in warrior/rogue/monk (non-mana) or wizard/cleric (full caster) creation
</success_criteria>

<output>
After completion, create `.planning/quick/231-fix-hybrid-mana-multiplier-not-applied-a/231-SUMMARY.md`
</output>
