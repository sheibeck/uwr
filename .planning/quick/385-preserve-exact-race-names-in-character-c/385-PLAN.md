---
phase: quick-385
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/data/llm_prompts.ts
  - spacetimedb/src/index.ts
autonomous: true
requirements: [QUICK-385]
must_haves:
  truths:
    - "When user types 'Cyclops', the race name stored is exactly 'Cyclops' not 'Stone-Eyed Cyclops'"
    - "Race definitions persist in a race_definition table after generation"
    - "Second player picking the same race name reuses the existing definition without LLM call"
  artifacts:
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "RaceDefinition table"
      contains: "race_definition"
    - path: "spacetimedb/src/data/llm_prompts.ts"
      provides: "Updated race prompt preserving exact names"
    - path: "spacetimedb/src/index.ts"
      provides: "Race lookup before LLM, save after LLM"
  key_links:
    - from: "spacetimedb/src/index.ts (prepare_creation_llm)"
      to: "race_definition table"
      via: "lookup by normalized name before creating LLM task"
    - from: "spacetimedb/src/index.ts (submit_llm_result)"
      to: "race_definition table"
      via: "insert after successful race generation"
---

<objective>
Fix character creation so race names are preserved exactly as typed, race definitions persist, and duplicate races are reused.

Purpose: Players typing "Cyclops" should get a Cyclops, not a "Stone-Eyed Cyclops". And when another player picks the same race, they get the same definition without burning an LLM credit.

Output: Updated schema, prompts, and reducers.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/schema/tables.ts (CharacterCreationState at line 1892, Race at line 1348, schema export at line 2108)
@spacetimedb/src/data/llm_prompts.ts (RACE_INTERPRETATION_SCHEMA at line 101, buildRaceInterpretationUserPrompt at line 137)
@spacetimedb/src/index.ts (prepare_creation_llm at line 451, submit_llm_result race handling at line 786)
@spacetimedb/src/reducers/creation.ts (AWAITING_RACE case at line 405)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add RaceDefinition table and update race prompt</name>
  <files>spacetimedb/src/schema/tables.ts, spacetimedb/src/data/llm_prompts.ts</files>
  <action>
1. In `spacetimedb/src/schema/tables.ts`, add a new `RaceDefinition` table near the CharacterCreationState table (after line ~1918):

```typescript
export const RaceDefinition = table(
  {
    name: 'race_definition',
    public: true,
    indexes: [{ accessor: 'by_name', algorithm: 'btree', columns: ['nameLower'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),           // Exact race name as displayed (e.g. "Cyclops")
    nameLower: t.string(),      // Lowercase for lookup (e.g. "cyclops")
    narrative: t.string(),      // Keeper's sardonic commentary
    bonusesJson: t.string(),    // JSON: { primary: {stat, value}, secondary: {stat, value}, flavor }
    createdAt: t.timestamp(),
  }
);
```

Register it in the schema export (the `schema(...)` call around line 2108) by adding `race_definition: RaceDefinition,` to the object.

2. In `spacetimedb/src/data/llm_prompts.ts`, modify `RACE_INTERPRETATION_SCHEMA` (line 101) to change the raceName field description:

```
"raceName": "string -- use the EXACT name the player provided. Do NOT expand, embellish, or add adjectives. If they said 'Cyclops', the raceName is 'Cyclops'. If they said 'fire goblin', the raceName is 'Fire Goblin' (just capitalize). Only invent a name if the player gave a vague description like 'some kind of shadow creature' rather than a specific race name."
```

Also update `buildRaceInterpretationUserPrompt` (line 137) to add an explicit instruction before the JSON schema:

```typescript
export function buildRaceInterpretationUserPrompt(playerDescription: string): string {
  return `The new arrival describes themselves as: "${playerDescription}"

Interpret this description into a race for the world of UWR. Be creative with the narrative and bonuses, but PRESERVE THE EXACT RACE NAME the player gave. If they said "Cyclops", the raceName MUST be "Cyclops" -- not "Stone-Eyed Cyclops" or "Ancient Cyclops" or any variation. Only invent a new name if the player gave a vague description rather than a specific race name (e.g. "some kind of shadow creature" -> you may name it "Shadeveil" or similar).

Respond with ONLY valid JSON matching this schema:
${RACE_INTERPRETATION_SCHEMA}`;
}
```
  </action>
  <verify>
    <automated>cd C:/projects/uwr && grep -c "race_definition" spacetimedb/src/schema/tables.ts && grep -c "EXACT" spacetimedb/src/data/llm_prompts.ts</automated>
  </verify>
  <done>RaceDefinition table exists in schema with by_name index. Race interpretation prompt explicitly instructs LLM to preserve exact race names.</done>
</task>

<task type="auto">
  <name>Task 2: Race lookup before LLM + save after LLM</name>
  <files>spacetimedb/src/index.ts</files>
  <action>
1. In `prepare_creation_llm` reducer (around line 472, the `if (generationType === 'race')` block), BEFORE creating the LLM task, check if a race_definition already exists for this race name:

```typescript
if (generationType === 'race') {
  if (state.step !== 'GENERATING_RACE') throw new SenderError('Invalid step for race generation');

  // Check for existing race definition (case-insensitive)
  const nameLower = (state.raceDescription || '').trim().toLowerCase();
  let existingRace: any = null;
  for (const rd of ctx.db.raceDefinition.by_name.filter(nameLower)) {
    existingRace = rd;
    break;
  }

  if (existingRace) {
    // Reuse existing race definition — skip LLM entirely
    ctx.db.character_creation_state.id.update({
      ...state,
      step: 'AWAITING_ARCHETYPE',
      raceName: existingRace.name,
      raceNarrative: existingRace.narrative,
      raceBonuses: existingRace.bonusesJson,
      updatedAt: ctx.timestamp,
    });

    let bonuses: any = {};
    try { bonuses = JSON.parse(existingRace.bonusesJson); } catch {}
    const bonusText = bonuses.primary
      ? `\n+${bonuses.primary.value || 2} ${(bonuses.primary.stat || 'STR').toUpperCase()}, +${bonuses.secondary?.value || 1} ${(bonuses.secondary?.stat || 'DEX').toUpperCase()}${bonuses.flavor ? `. ${bonuses.flavor}` : ''}`
      : '';

    appendCreationEvent(ctx, ctx.sender, 'creation',
      `${existingRace.narrative || 'An interesting choice.'}\n\n` +
      `**${existingRace.name}**${bonusText}\n\n` +
      `Now then. Every creature must choose its path. Are you a [Warrior] — all muscle and stubborn refusal to die gracefully? Or a [Mystic] — convinced that reality is merely a suggestion? Choose.` +
      `\n\n(If you're already regretting your choices, type "go back." The Keeper does not judge... much.)`
    );
    return;
  }

  // No existing definition — proceed with LLM generation
  systemPrompt = buildCharacterCreationPrompt('Interpreting a new arrival\'s race description.');
  userPrompt = buildRaceInterpretationUserPrompt(state.raceDescription);
}
```

NOTE: The `return` after the existing race block must exit the reducer. Since the race lookup block comes before the LLM task insert at the bottom, and the class branch also sets systemPrompt/userPrompt, structure the code so the race-found path returns early, while the race-not-found path falls through to set systemPrompt/userPrompt as before.

2. In `submit_llm_result` (around line 786, the `if (generationType === 'race')` block), AFTER successfully parsing the LLM result and updating creation state, save the race definition:

After the `ctx.db.character_creation_state.id.update(...)` call for the race case, add:

```typescript
// Persist race definition for reuse by future players
const raceLower = (data.raceName || '').trim().toLowerCase();
if (raceLower) {
  // Check if already saved (race condition safety)
  let alreadySaved = false;
  for (const existing of ctx.db.raceDefinition.by_name.filter(raceLower)) {
    alreadySaved = true;
    break;
  }
  if (!alreadySaved) {
    ctx.db.raceDefinition.insert({
      id: 0n,
      name: data.raceName,
      nameLower: raceLower,
      narrative: data.narrative || '',
      bonusesJson: JSON.stringify(data.bonuses || {}),
      createdAt: ctx.timestamp,
    });
  }
}
```

IMPORTANT: The table accessor for `race_definition` in ctx.db will be `raceDefinition` (camelCase). The index accessor is `by_name` exactly as declared.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && grep -c "raceDefinition.by_name" spacetimedb/src/index.ts && grep -c "existingRace" spacetimedb/src/index.ts</automated>
  </verify>
  <done>
    - prepare_creation_llm checks race_definition table before LLM call; reuses existing race and skips LLM if found
    - submit_llm_result saves new race definitions after successful LLM generation
    - Second player picking same race name gets instant response without LLM credit
  </done>
</task>

<task type="auto">
  <name>Task 3: Publish and verify</name>
  <files></files>
  <action>
Publish the module locally to verify the schema changes compile:

```bash
cd C:/projects/uwr && spacetime publish uwr -p spacetimedb --clear-database -y
```

Note: --clear-database is needed because we added a new table (race_definition).

After publish succeeds, regenerate client bindings:

```bash
spacetime generate --lang typescript --out-dir src/module_bindings -p spacetimedb
```
  </action>
  <verify>
    <automated>cd C:/projects/uwr && spacetime publish uwr -p spacetimedb --clear-database -y 2>&1 | tail -3</automated>
  </verify>
  <done>Module publishes without errors. Client bindings regenerated with race_definition table types.</done>
</task>

</tasks>

<verification>
1. Module compiles and publishes successfully
2. race_definition table exists in schema
3. LLM prompt contains exact-name preservation instructions
4. prepare_creation_llm has race lookup logic before LLM task creation
5. submit_llm_result saves race definitions after successful generation
</verification>

<success_criteria>
- Typing "Cyclops" during creation preserves "Cyclops" as raceName (prompt instructs LLM)
- Race definitions saved to race_definition table after first generation
- Second player typing "Cyclops" gets instant reuse without LLM call
- Class generation still uses LLM every time (race+archetype combos are unique)
- Module publishes and bindings generate cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/385-preserve-exact-race-names-in-character-c/385-SUMMARY.md`
</output>
