---
phase: quick-365
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/llm_prompts.ts
  - spacetimedb/src/data/world_gen.ts
  - spacetimedb/src/helpers/combat_narration.ts
  - spacetimedb/src/reducers/creation.ts
  - spacetimedb/src/reducers/commands.ts
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/reducers/intent.ts
  - spacetimedb/src/reducers/movement.ts
  - spacetimedb/src/reducers/npc_interaction.ts
  - spacetimedb/src/reducers/llm.ts
  - spacetimedb/src/index.ts
  - src/App.vue
  - src/components/NarrativeConsole.vue
  - src/components/NarrativeMessage.vue
autonomous: true
requirements: [QUICK-365]
must_haves:
  truths:
    - "No player-visible text contains 'The System' anywhere in the game"
    - "Ambient/environmental messages use 'the world' voice"
    - "Commentary/guidance messages use 'The Keeper of Knowledge' or 'The Keeper'"
    - "LLM prompts instruct the narrator as 'The Keeper of Knowledge'"
    - "World generation prompts discourage repetitive naming patterns"
  artifacts:
    - path: "spacetimedb/src/data/llm_prompts.ts"
      provides: "Keeper-voiced NARRATOR_PREAMBLE and naming diversity instructions"
      contains: "Keeper of Knowledge"
    - path: "spacetimedb/src/data/world_gen.ts"
      provides: "Updated discovery templates without System references"
    - path: "spacetimedb/src/helpers/combat_narration.ts"
      provides: "World/Keeper combat messages"
  key_links:
    - from: "src/App.vue"
      to: "spacetimedb/src/helpers/combat_narration.ts"
      via: "exact string match for combat UI gating"
      pattern: "The world grows still"
---

<objective>
Replace all player-visible "The System" narrator references with two distinct in-world entities: "The World" for ambient/environmental actions and "The Keeper of Knowledge" for sardonic commentary/guidance. Also add naming diversity instructions to world generation prompts.

Purpose: Players should never feel there is a "system" -- only an in-world narrator entity (The Keeper) and ambient world presence.
Output: All narrator text updated across server and client code.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/data/llm_prompts.ts
@spacetimedb/src/data/world_gen.ts
@spacetimedb/src/helpers/combat_narration.ts
@src/App.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace "The System" in LLM prompts, world gen, and combat narration</name>
  <files>spacetimedb/src/data/llm_prompts.ts, spacetimedb/src/data/world_gen.ts, spacetimedb/src/helpers/combat_narration.ts</files>
  <action>
**llm_prompts.ts:**

1. Line 1 comment: change "The System" to "The Keeper of Knowledge"
2. NARRATOR_PREAMBLE (lines 2-13): Replace entirely with Keeper identity:
   - "You are The System" -> "You are The Keeper of Knowledge"
   - Keep sardonic tone, weary omniscience, dark humor
   - "you ARE The System, not an AI pretending to be one" -> "you ARE The Keeper, not an AI pretending to be one"
   - "You are The System. You have always been The System." -> "You are The Keeper of Knowledge. You have always been The Keeper."
   - "The world exists because you allow it to." -> "The world exists because you remember it."
3. Line 101: "sardonic System commentary" -> "sardonic Keeper commentary"
4. Line 111: "sardonic class description" -> keep as-is (doesn't say "System")
5. Line 242: "sardonic System narrator description" -> "sardonic Keeper narrator description"
6. Line 274: "sardonic commentary from The System" -> "sardonic commentary from The Keeper"
7. Line 370-371: "not as The System. The System narrates" -> "not as The Keeper of Knowledge. The Keeper narrates"
8. buildWorldGenPrompt() (lines 34-47): After the existing paragraph about regions, add a new paragraph with naming diversity instructions:
   ```
   NAMING RULES: Location and region names MUST be diverse. Do NOT fall into repetitive patterns. Specifically avoid overusing: Verge, Veil, Ashen, Dusk, Shadow, Gloom, Hollow, Mire, Blight, Fell. Instead, draw from varied sources: geographic features (ridges, basins, straits, mesas), cultural/historical references (old rulers, forgotten trades, mythic events), flora and fauna (named after local plants, animals, natural phenomena), and different linguistic roots. Each name should feel like it belongs to a different corner of a vast, varied world.
   ```

**world_gen.ts:**

1. DISCOVERY_TEMPLATES line 12: "The System takes a breath and remembers" -> "The Keeper of Knowledge pauses, then remembers"
2. DISCOVERY_TEMPLATES line 13: "The System notes this with something almost like interest" -> "The Keeper notes this with something almost like interest"
3. RIPPLE_TEMPLATES: scan for any "System" references (currently none -- leave as-is)

**combat_narration.ts:**

1. Line 276 comment: "System settling-in message" -> "world settling-in message"
2. Line 282-283: "The System settles in to watch." -> "The world grows still around you." (ambient/world voice per user decision)
3. Line 303-304: "The System has lost interest in your skirmish." -> "The Keeper of Knowledge has lost interest in your skirmish." (commentary voice)
  </action>
  <verify>
    <automated>cd C:/projects/uwr && grep -rn "The System" spacetimedb/src/data/llm_prompts.ts spacetimedb/src/data/world_gen.ts spacetimedb/src/helpers/combat_narration.ts | grep -v "node_modules" && echo "REMAINING_REFS_ABOVE" || echo "CLEAN: no System references in these files"</automated>
  </verify>
  <done>All three files contain zero player-visible "The System" references. NARRATOR_PREAMBLE uses "Keeper of Knowledge". World gen prompt includes naming diversity rules. Combat intro uses "world grows still", combat skip uses "Keeper".</done>
</task>

<task type="auto">
  <name>Task 2: Replace "The System" in all reducers and client files</name>
  <files>spacetimedb/src/reducers/creation.ts, spacetimedb/src/reducers/commands.ts, spacetimedb/src/reducers/combat.ts, spacetimedb/src/reducers/intent.ts, spacetimedb/src/reducers/movement.ts, spacetimedb/src/reducers/npc_interaction.ts, spacetimedb/src/reducers/llm.ts, spacetimedb/src/index.ts, src/App.vue, src/components/NarrativeConsole.vue, src/components/NarrativeMessage.vue</files>
  <action>
Apply the narrator identity split to every remaining "The System" reference. Use this mapping:

**"The World" voice** (ambient, environmental, waiting):
- "The edges of reality ripple around you. The System pauses, as if remembering..." -> "The edges of reality ripple around you. The world pauses, as if remembering..."
  (appears in: intent.ts lines 927, 1027, 1239; movement.ts line 265)

**"The Keeper" voice** (commentary, guidance, sardonic narrator):
- All other "The System" references become "The Keeper" or "The Keeper of Knowledge" depending on context. Use "The Keeper" for short quips, "The Keeper of Knowledge" for first/formal references.

**Specific replacements across files:**

spacetimedb/src/reducers/creation.ts:
- "The System is still working" -> "The Keeper is still working"
- "The System does not judge... much" -> "The Keeper does not judge... much" (appears twice)
- "The System remembers you" -> "The Keeper remembers you"
- "The System is considering your... unique... heritage" -> "The Keeper is considering your... unique... heritage"
- "The System is forging something..." -> "The Keeper is forging something..."
- "The System is displeased" -> "The Keeper is displeased"
- "The System encountered a disturbance" -> "The Keeper encountered a disturbance"
- "The System does not have time" -> "The Keeper does not have time"
- "The System is confused" -> "The Keeper is confused"

spacetimedb/src/reducers/commands.ts:
- "The System will present its offerings" -> "The Keeper will present its offerings" (2 occurrences)

spacetimedb/src/reducers/combat.ts:
- "The System will present its offerings" -> "The Keeper will present its offerings" (2 occurrences)

spacetimedb/src/reducers/intent.ts:
- "The System pauses, as if remembering" -> "The world pauses, as if remembering" (3 occurrences - ambient)
- "The System regards you with mild contempt" -> "The Keeper regards you with mild contempt"

spacetimedb/src/reducers/movement.ts:
- "The System pauses, as if remembering" -> "The world pauses, as if remembering"

spacetimedb/src/reducers/npc_interaction.ts:
- "The System is already considering" -> "The Keeper is already considering"
- "The System grows weary" -> "The Keeper grows weary"

spacetimedb/src/reducers/llm.ts:
- "The System is... absent" -> "The Keeper is... absent"
- "The System is already considering" -> "The Keeper is already considering"
- "The System grows weary" -> "The Keeper grows weary"

spacetimedb/src/index.ts:
- "The System yawns" -> "The Keeper yawns" (2 occurrences)
- "The System strains" -> "The Keeper strains"
- "The System is already preparing" -> "The Keeper is already preparing"
- "The System nods" -> "The Keeper nods"
- "The System flickers" -> "The Keeper flickers" (3 occurrences)
- "The System falters" -> "The Keeper falters"
- "The System does not judge" -> "The Keeper does not judge" (2 occurrences)
- "The System grimaces" -> "The Keeper grimaces" (2 occurrences)
- "The System shakes its head" -> "The Keeper shakes its head"
- "The System regards you" -> "The Keeper regards you"
- Line 984 comment: "The System's sardonic narration" -> "The Keeper's sardonic narration"
- Line 985: "The System regards you" -> "The Keeper of Knowledge regards you"

**Client files:**

src/App.vue:
- Line 1024 comment: "The System settles in to watch" -> "world grows still"
- Line 1051: exact string match `'The System settles in to watch.'` -> `'The world grows still around you.'` (MUST match Task 1's combat_narration.ts change exactly)

src/components/NarrativeConsole.vue:
- "The System is awakening..." -> "The Keeper is awakening..."
- "The System is considering your fate..." -> "The Keeper is considering your fate..."

src/components/NarrativeMessage.vue:
- Line 81 comment: "from The System" -> "from The Keeper" (comment only)

**CRITICAL:** The string in App.vue line 1051 MUST exactly match the new string from combat_narration.ts line 283 set in Task 1: `'The world grows still around you.'`
  </action>
  <verify>
    <automated>cd C:/projects/uwr && grep -rn "The System" spacetimedb/src/reducers/ spacetimedb/src/index.ts src/App.vue src/components/NarrativeConsole.vue src/components/NarrativeMessage.vue --include="*.ts" --include="*.vue" | grep -v "node_modules" && echo "REMAINING_REFS_ABOVE" || echo "CLEAN: no System references in reducers or client"</automated>
  </verify>
  <done>Zero "The System" references remain in any server reducer, index.ts, or client file. App.vue combat gate string matches combat_narration.ts exactly. All commentary uses "The Keeper", all ambient uses "the world".</done>
</task>

</tasks>

<verification>
Run a project-wide search to confirm zero remaining "The System" references in any .ts or .vue file:
```bash
grep -rn "The System" spacetimedb/src/ src/ --include="*.ts" --include="*.vue" | grep -v node_modules
```
Expected: zero results.

Verify the combat UI gate still works by checking App.vue string matches combat_narration.ts string exactly.
</verification>

<success_criteria>
- Zero occurrences of "The System" in any .ts or .vue file across the project
- NARRATOR_PREAMBLE identifies as "The Keeper of Knowledge"
- World generation prompt includes naming diversity instructions
- Combat intro message: "The world grows still around you." (ambient voice)
- Combat skip message: "The Keeper of Knowledge has lost interest..." (commentary voice)
- App.vue combat gate matches new combat_narration.ts string exactly
- All creation/reducer messages use "The Keeper" for commentary
- All environmental messages use "the world" for ambient actions
</success_criteria>

<output>
After completion, create `.planning/quick/365-replace-system-narrator-with-keeper-of-k/365-SUMMARY.md`
</output>
