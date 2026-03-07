# Phase 28: Dynamic Skill Generation - Research

**Researched:** 2026-03-07
**Domain:** Combat engine refactor + LLM-generated skill offerings at level-up
**Confidence:** HIGH

## Summary

Phase 28 requires three major workstreams: (1) restructuring the AbilityTemplate table schema to align with mechanical_vocabulary.ts, (2) replacing the hardcoded ability dispatch in combat with a unified kind-based dispatch map, and (3) implementing LLM-generated skill offerings at level-up via the existing LLM proxy pipeline.

The existing codebase provides strong patterns to follow. Character creation (Phase 26) already inserts generated abilities with the new vocabulary-aligned fields (kind, targetRule, scaling, value1, etc.) into ability_template. The LLM proxy flow (useLlmProxy.ts) handles the client-side LLM relay pattern. The awardXp function in combat_rewards.ts returns `{ leveledUp: true, newLevel }`, providing the exact hook point for triggering skill generation.

**Primary recommendation:** Start with schema restructuring and dispatch map, then layer skill generation on top. The schema change is foundational -- everything else depends on it.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Delete all 106 hardcoded abilities and the entire switch statement in combat.ts
- Delete all 17 ability data files in spacetimedb/src/data/abilities/
- Delete ability_catalog.ts and all seeding/ensure_* files for abilities
- Implement a `Record<AbilityKind, handler>` dispatch map that handles all ability resolution
- Unify player and enemy ability dispatch into the same dispatch map -- one code path for all ability resolution regardless of source
- No migration needed -- v2.0 starts with clear-database, clean break from v1.0
- Formula-based power budget: power = base + (level * scaling), each kind has a budget range
- Auto-clamp on validation failure: server adjusts values to fit budget rather than re-generating or rejecting
- Core 6 fields mandatory on every generated skill: kind, targetRule, resourceType, resourceCost, cooldownSeconds, scaling
- Remaining fields optional depending on kind
- Biased diversity: prompt LLM to offer at least 2 different kinds among the 3 choices
- Every generated skill must pass schema validation against mechanical_vocabulary.ts enums
- Inline narrative in the console with clickable [skill names]
- Unchosen skills are deleted permanently
- Skill choice persists until chosen -- no timeout, subtle HUD reminder
- Follows same LLM proxy flow: server writes LlmTask, client proxies, submits result
- Restructure ability_template to use characterId ownership (replace className + key with characterId index)
- Unified schema for player and enemy abilities -- same table, same columns, enemyId or characterId determines source
- New pending_skill table for 3 offered skills at level-up
- Remove key, className, dotPowerSplit, debuffType, debuffMagnitude, debuffDuration, aoeTargets columns

### Claude's Discretion
- Exact dispatch map function signatures and helper decomposition
- Power budget formula constants and per-level scaling curves
- LLM prompt structure for skill generation
- HUD indicator design for pending skill choice
- Error handling for edge cases (LLM timeout during level-up, etc.)

### Deferred Ideas (OUT OF SCOPE)
- Skill respec/unlearn mechanic -- future phase
- Skill synergy system (combo abilities) -- future phase
- Skill evolution (existing skills grow/transform) -- future phase
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SKILL-01 | Level-up offers 3 LLM-generated skills based on class, race, and history | LLM proxy flow pattern from Phase 26/27; awardXp hook in combat_rewards.ts; LlmTask table for prompt relay |
| SKILL-02 | Player picks 1 skill; unchosen skills may vanish permanently | pending_skill table pattern; clickable keyword pattern from creation.ts; delete on choice |
| SKILL-03 | Generated skills use schema-constrained templates (valid damage types, effect types, power ranges) | mechanical_vocabulary.ts enums for validation; creation.ts already inserts with new schema fields |
| SKILL-04 | Power-budget validation rejects overpowered/underpowered skills before insertion | Formula-based clamping; THREAT_CONFIG constants as reference for balance ratios |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| spacetimedb | 1.11.x | Backend tables, reducers, scheduled tasks | Project foundation |
| Vue 3 | latest | Client UI framework | Already in use |
| OpenAI (via proxy) | gpt-5-mini / gpt-5.4 | Skill generation LLM | Established proxy pattern from Phase 26/27 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| mechanical_vocabulary.ts | n/a | Enum validation source | Every generated skill must validate against these enums |
| useLlmProxy.ts | n/a | Client-side LLM relay | Watches LlmTask, calls proxy, submits result |

### Alternatives Considered
None -- all decisions are locked. The stack is established from prior phases.

## Architecture Patterns

### Recommended Project Structure
```
spacetimedb/src/
  schema/tables.ts         # Restructured AbilityTemplate + new PendingSkill table
  helpers/combat.ts        # Unified dispatch map replacing executeAbility/executeEnemyAbility
  helpers/skill_budget.ts  # NEW: Power budget formula + clamping logic
  helpers/skill_gen.ts     # NEW: Schema validation + LLM result parsing
  reducers/combat.ts       # Simplified -- delegates to dispatch map
  reducers/skills.ts       # NEW: prepare_skill_gen, choose_skill, submit_llm_result handler
  data/mechanical_vocabulary.ts  # Unchanged -- validation source

src/
  composables/useLlmProxy.ts      # Unchanged -- handles skill_gen domain
  composables/useSkillChoice.ts   # NEW: Watches pending_skill, manages choice UI state
  components/NarrativeConsole.vue  # Renders skill offerings inline
  components/NarrativeHud.vue      # Subtle indicator for pending skill choice
```

### Pattern 1: Unified Kind-Based Dispatch Map
**What:** A `Record<AbilityKind, (ctx, actor, ability, target, combat) => void>` that handles all ability resolution regardless of whether the actor is a player character, enemy, or pet.
**When to use:** Every time an ability fires in combat.
**Example:**
```typescript
// helpers/combat.ts
type AbilityActor = {
  type: 'character' | 'enemy' | 'pet';
  id: bigint;
  stats: { str: bigint; dex: bigint; int: bigint; wis: bigint; cha: bigint };
  level: bigint;
};

type AbilityContext = {
  actor: AbilityActor;
  ability: AbilityRow;  // Unified schema row
  combat: CombatState;
  target?: TargetInfo;
};

const DISPATCH: Record<string, (ctx: any, ac: AbilityContext) => void> = {
  damage: handleDamage,
  heal: handleHeal,
  dot: handleDot,
  hot: handleHot,
  buff: handleBuff,
  debuff: handleDebuff,
  shield: handleShield,
  taunt: handleTaunt,
  aoe_damage: handleAoeDamage,
  aoe_heal: handleAoeHeal,
  summon: handleSummon,
  cc: handleCc,
  drain: handleDrain,
  execute: handleExecute,
  utility: handleUtility,
};

export function resolveAbility(ctx: any, ac: AbilityContext) {
  const handler = DISPATCH[ac.ability.kind];
  if (!handler) throw new SenderError(`Unknown ability kind: ${ac.ability.kind}`);
  handler(ctx, ac);
}
```

### Pattern 2: Level-Up Skill Generation Flow (State Machine)
**What:** When awardXp detects levelUp, server writes an LlmTask; client proxies to LLM; server parses result into 3 pending_skill rows; player picks one via reducer.
**When to use:** Every level-up event.
**Flow:**
1. `awardXp()` returns `{ leveledUp: true }` -> insert LlmTask with domain `'skill_gen'`
2. Client useLlmProxy picks up pending task -> calls proxy -> submits result
3. `submit_llm_result` handler for `'skill_gen'` domain: parse JSON, validate against mechanical_vocabulary enums, clamp power budget, insert 3 pending_skill rows
4. Client watches pending_skill table -> renders inline narrative with clickable [skill names]
5. Player clicks -> `choose_skill` reducer: move chosen to ability_template, delete other 2, add to hotbar

### Pattern 3: Power Budget Formula with Auto-Clamping
**What:** Formula determines acceptable power range per kind per level. Out-of-range values are clamped rather than rejected.
**When to use:** After LLM returns skill JSON, before inserting into pending_skill.
**Example:**
```typescript
// helpers/skill_budget.ts
const BASE_BUDGET: Record<string, { base: number; perLevel: number; min: number; max: number }> = {
  damage:     { base: 10, perLevel: 5, min: 0.7, max: 1.3 },
  heal:       { base: 8,  perLevel: 4, min: 0.7, max: 1.3 },
  dot:        { base: 6,  perLevel: 3, min: 0.7, max: 1.3 },
  // ... per kind
};

function clampToBudget(kind: string, level: bigint, value1: bigint): bigint {
  const budget = BASE_BUDGET[kind];
  if (!budget) return value1;
  const target = budget.base + budget.perLevel * Number(level);
  const min = Math.floor(target * budget.min);
  const max = Math.ceil(target * budget.max);
  if (Number(value1) < min) return BigInt(min);
  if (Number(value1) > max) return BigInt(max);
  return value1;
}
```

### Anti-Patterns to Avoid
- **Hardcoded ability keys in dispatch:** The entire point of this phase is eliminating the 106-case switch. Never check `abilityKey === 'fireball'` -- always dispatch on `kind`.
- **Separate player/enemy ability paths:** The dispatch map must be unified. Do not create `executePlayerAbility` and `executeEnemyAbility` as separate functions with duplicated logic.
- **Optimistic UI for skill choice:** Let the subscription drive state. Do not speculatively update the UI before the server confirms the choice.
- **Rejecting LLM output:** Auto-clamp, do not re-prompt. LLM calls are expensive and slow.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM relay | Custom HTTP client | Existing useLlmProxy + LlmTask table | Already handles auth, error reporting, task lifecycle |
| Enum validation | Manual string checks | Import from mechanical_vocabulary.ts | Single source of truth, catches typos at parse time |
| Clickable keywords | Custom click handlers | Existing [bracketed text] pattern from NarrativeConsole | Already parsed and rendered as interactive elements |
| Ability cooldown tracking | New cooldown system | Existing AbilityCooldown table + abilityCooldownMicros() | Works with any ability key/id |

**Key insight:** The LLM proxy pipeline, narrative rendering, and subscription patterns are all established from Phases 24-27. This phase composes existing infrastructure rather than building new plumbing.

## Common Pitfalls

### Pitfall 1: Schema Mismatch Between tables.ts and Actual Inserts
**What goes wrong:** The current AbilityTemplate in tables.ts still has old columns (key, className, dotPowerSplit, etc.) but creation.ts already inserts with new columns (characterId, kind, targetRule, value1, scaling, isGenerated). This mismatch will cause confusion.
**Why it happens:** Phase 26 partially migrated the schema in the reducer logic but did not update the table definition in tables.ts.
**How to avoid:** Update tables.ts FIRST with the new schema before touching any reducer logic. Since this is clear-database, no migration needed.
**Warning signs:** TypeScript errors about missing fields, runtime column not found errors.

### Pitfall 2: HotbarSlot Still Uses abilityKey (String)
**What goes wrong:** HotbarSlot currently references abilities by `abilityKey` string, but creation.ts already inserts with `abilityTemplateId` (bigint). The schema says `abilityKey` but runtime uses `abilityTemplateId`. Must update schema to match.
**Why it happens:** Incremental migration -- schema wasn't updated when creation.ts was written.
**How to avoid:** Migrate HotbarSlot to use `abilityTemplateId` (u64) since abilities are now per-character with unique IDs, not shared keys.
**Warning signs:** Hotbar stops working after schema change.

### Pitfall 3: AbilityCooldown Uses abilityKey String
**What goes wrong:** AbilityCooldown tracks cooldowns by `abilityKey` string. With generated abilities, there are no shared keys -- each ability has a unique ID.
**Why it happens:** Legacy design assumed shared ability definitions by class.
**How to avoid:** Migrate AbilityCooldown to use `abilityTemplateId` (u64) instead of `abilityKey` string.
**Warning signs:** Cooldowns not working for generated abilities.

### Pitfall 4: Enemy Abilities Have Different Schema
**What goes wrong:** EnemyAbility table has its own schema (enemyTemplateId, abilityKey, name, kind, castSeconds, cooldownSeconds, targetRule) that differs from AbilityTemplate. The decision says "unified schema" but these are structurally different ownership models.
**Why it happens:** Enemy abilities are templates (one ability shared by all instances of an enemy type) while player abilities are per-character.
**How to avoid:** Keep EnemyAbility table separate but ensure the dispatch map handler signatures work with a common interface extracted from either table's row type. The "unified" part is the dispatch, not necessarily the storage.
**Warning signs:** Trying to merge tables causes ownership confusion.

### Pitfall 5: awardXp is Called During Combat Victory
**What goes wrong:** If skill generation LlmTask is written inside the combat victory reducer, it happens in the middle of a complex transaction. The LLM call takes seconds -- the client must pick it up asynchronously.
**Why it happens:** Level-up detection and combat resolution happen in the same reducer call.
**How to avoid:** The awardXp function should just set a flag/state on the character (e.g., `pendingSkillChoice: true`) or insert a row in a `skill_gen_state` table. A separate flow handles the actual LLM task creation -- either the client watches for the flag and calls a `prepare_skill_gen` reducer, or the server inserts the LlmTask directly.
**Warning signs:** LLM task created but never picked up; combat reducer becoming more complex.

### Pitfall 6: LLM Returns Invalid Kind or Effect Types
**What goes wrong:** The LLM generates a skill with kind "blast" or effectType "burn" which don't exist in mechanical_vocabulary.ts.
**Why it happens:** LLM hallucinates enum values despite being given the list.
**How to avoid:** Strict validation: check every enum field against the exported arrays from mechanical_vocabulary.ts. For invalid values, map to closest valid value or use sensible defaults (kind='damage', damageType='physical').
**Warning signs:** Runtime errors when the dispatch map encounters unknown kinds.

## Code Examples

### Current awardXp Hook Point
```typescript
// spacetimedb/src/helpers/combat_rewards.ts:313
export function awardXp(ctx, character, enemyLevel, baseXp) {
  // ... XP calculation ...
  if (newLevel === character.level) {
    ctx.db.character.id.update({ ...character, xp: newXp });
    return { xpGained: gained, leveledUp: false };
  }
  // ... stat recomputation ...
  return { xpGained: gained, leveledUp: true, newLevel };
}
```
The caller (combat victory handler) checks `leveledUp` and can trigger skill generation.

### Current Creation Ability Insert Pattern
```typescript
// spacetimedb/src/reducers/creation.ts:427
const abilityRow = ctx.db.ability_template.insert({
  id: 0n,
  name: chosen.name || chosen.abilityName || 'Unknown Ability',
  description: chosen.description || '',
  characterId: character.id,
  kind: chosen.kind || chosen.type || 'damage',
  targetRule: chosen.targetRule || 'single_enemy',
  resourceType: chosen.resourceType || (state.archetype === 'mystic' ? 'mana' : 'stamina'),
  resourceCost: BigInt(chosen.resourceCost || 10),
  castSeconds: BigInt(chosen.castSeconds || 0),
  cooldownSeconds: BigInt(chosen.cooldownSeconds || 6),
  value1: BigInt(chosen.value1 || chosen.damage || chosen.healAmount || 15),
  value2: chosen.value2 != null ? BigInt(chosen.value2) : undefined,
  scaling: chosen.scaling || primaryStat,
  effectType: chosen.effectType || undefined,
  effectMagnitude: chosen.effectMagnitude != null ? BigInt(chosen.effectMagnitude) : undefined,
  effectDuration: chosen.effectDuration != null ? BigInt(chosen.effectDuration) : undefined,
  levelRequired: 1n,
  isGenerated: true,
});
```
This is the template for the new schema -- it already uses the vocabulary-aligned fields.

### LLM Task Creation Pattern (from world gen)
```typescript
// spacetimedb/src/index.ts:540-557
ctx.db.llm_task.insert({
  id: 0n,
  playerId: ctx.sender,
  domain: 'world_gen',
  model: 'gpt-5-mini',
  systemPrompt: systemPrompt,
  userPrompt: userPrompt,
  maxTokens: 2000n,
  status: 'pending',
  contextJson: JSON.stringify({ genStateId: genStateId.toString() }),
  createdAt: ctx.timestamp,
});
```
Skill generation will follow this exact pattern with domain `'skill_gen'`.

### LLM Result Handling Pattern (from submit_llm_result)
```typescript
// spacetimedb/src/index.ts:561-596
spacetimedb.reducer('submit_llm_result', {
  taskId: t.u64(), resultText: t.string(), success: t.bool(), errorMessage: t.string().optional(),
}, (ctx, { taskId, resultText, success, errorMessage }) => {
  const task = ctx.db.llm_task.id.find(taskId);
  // ... validation ...
  if (task.domain === 'skill_gen') {
    // Parse JSON, validate enums, clamp power budget, insert pending_skill rows
  }
});
```

### Mechanical Vocabulary Validation
```typescript
// Validation helper using imported enums
import { ABILITY_KINDS, DAMAGE_TYPES, EFFECT_TYPES, TARGET_RULES, RESOURCE_TYPES, SCALING_TYPES } from '../data/mechanical_vocabulary';

function validateSkillFields(skill: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!ABILITY_KINDS.includes(skill.kind)) errors.push(`Invalid kind: ${skill.kind}`);
  if (skill.damageType && !DAMAGE_TYPES.includes(skill.damageType)) errors.push(`Invalid damageType`);
  if (skill.effectType && !EFFECT_TYPES.includes(skill.effectType)) errors.push(`Invalid effectType`);
  if (!TARGET_RULES.includes(skill.targetRule)) errors.push(`Invalid targetRule`);
  if (!RESOURCE_TYPES.includes(skill.resourceType)) errors.push(`Invalid resourceType`);
  if (!SCALING_TYPES.includes(skill.scaling)) errors.push(`Invalid scaling`);
  return { valid: errors.length === 0, errors };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 106-case switch on abilityKey | Kind-based dispatch map | This phase | Enables generated abilities to work without code changes |
| className-based ability ownership | characterId-based ownership | Phase 26 (partial) | Each character has unique abilities |
| Shared ability definitions by class | Per-character generated abilities | Phase 26 (partial) | No two characters have the same abilities |
| hotbar uses abilityKey string | hotbar uses abilityTemplateId | This phase | Links to specific ability instance, not shared key |

**Deprecated/outdated:**
- `ability_catalog.ts`: All 17 ability definition files -- to be deleted
- `seeding/ensure_*` ability files: No more seeded abilities
- `by_key` and `by_class` indexes on AbilityTemplate: Replaced by `by_character` index
- `dotPowerSplit`, `debuffType`, `debuffMagnitude`, `debuffDuration`, `aoeTargets` columns: Replaced by generic `value1`, `value2`, `effectType`, `effectMagnitude`, `effectDuration` columns

## Key Integration Points

| File | Line | What | Impact |
|------|------|------|--------|
| `helpers/combat.ts:320` | `executeAbility()` | Player ability execution -- lookup by abilityKey + className | Must be rewritten to use characterId + dispatch map |
| `helpers/combat.ts:2006` | `executeEnemyAbility()` | Enemy ability execution -- separate if/else chain | Must be unified into shared dispatch map |
| `helpers/combat.ts:2409` | `executeAbilityAction()` | Router to player/enemy/pet ability functions | Simplified to single dispatch entry point |
| `helpers/combat_rewards.ts:313` | `awardXp()` | Returns `{ leveledUp: true }` | Hook point for triggering skill generation |
| `schema/tables.ts:593` | `AbilityTemplate` table | Old schema with key/className | Must be restructured |
| `schema/tables.ts:578` | `HotbarSlot` table | Uses abilityKey string | Must switch to abilityTemplateId |
| `schema/tables.ts:629` | `AbilityCooldown` table | Uses abilityKey string | Must switch to abilityTemplateId |
| `schema/tables.ts:753` | `EnemyAbility` table | Separate enemy ability schema | Keep separate but dispatch map handles both |
| `reducers/creation.ts:427` | Ability insert in creation | Already uses new schema fields | Template for skill generation insert |
| `index.ts:561` | `submit_llm_result` reducer | Handles LLM results by domain | Add `'skill_gen'` domain handler |
| `src/composables/useLlmProxy.ts` | LLM proxy relay | Watches LlmTask, calls proxy | No changes needed -- already generic |

## Open Questions

1. **How should the dispatch map handle bard songs?**
   - What we know: Bard songs have a unique tick-based mechanic (bard_song_tick table, active_bard_song table) with a switch on songKey in combat.ts:1809
   - What's unclear: Whether generated abilities can be bard songs, or if bard songs are a special case outside the dispatch map
   - Recommendation: Bard songs are a legacy mechanic. Since all classes are now generated, the bard song system is likely dead code. Remove it. If needed later, add a 'channel' ability kind.

2. **Should enemy abilities migrate to the same table as player abilities?**
   - What we know: The decision says "unified schema" but enemy abilities are per-template (shared by instances) while player abilities are per-character (unique)
   - What's unclear: Whether "unified" means same table or same dispatch interface
   - Recommendation: Keep separate tables (AbilityTemplate for players, EnemyAbility for enemies) but use a common interface type for the dispatch map. The ownership models are fundamentally different.

3. **What happens if player levels up multiple times in one combat?**
   - What we know: awardXp() loops through levels but only returns the final newLevel
   - What's unclear: Should each level offer 3 skills (6 skills for 2 level-ups)?
   - Recommendation: One skill offering per level-up event. If multi-level, offer skills for the highest new level. Queue multiple offerings if needed.

## Sources

### Primary (HIGH confidence)
- `spacetimedb/src/data/mechanical_vocabulary.ts` -- Complete enum definitions (read directly)
- `spacetimedb/src/schema/tables.ts:593-627` -- Current AbilityTemplate schema (read directly)
- `spacetimedb/src/helpers/combat.ts:320-500` -- Current executeAbility function (read directly)
- `spacetimedb/src/helpers/combat_rewards.ts:313-392` -- awardXp with level-up detection (read directly)
- `spacetimedb/src/reducers/creation.ts:427-454` -- New-style ability insert pattern (read directly)
- `spacetimedb/src/index.ts:561-596` -- submit_llm_result handler pattern (read directly)
- `src/composables/useLlmProxy.ts` -- Client LLM proxy relay (read directly)
- `src/composables/useCharacterCreation.ts` -- State machine watcher pattern (read directly)

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions and code_context sections -- user-provided integration points

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries and patterns already in use in the project
- Architecture: HIGH - dispatch map pattern is straightforward; LLM proxy flow is proven
- Pitfalls: HIGH - identified from direct code reading of schema mismatches and abilityKey references
- Power budget: MEDIUM - formula constants are Claude's discretion; no existing reference in codebase

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable project-specific patterns, no external dependencies)
