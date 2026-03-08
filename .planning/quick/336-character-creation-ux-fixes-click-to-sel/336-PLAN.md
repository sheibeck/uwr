---
phase: 336-character-creation-ux-fixes
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/llm_prompts.ts
  - spacetimedb/src/reducers/creation.ts
  - spacetimedb/src/index.ts
  - src/App.vue
autonomous: true
requirements: [CLICK-SELECT, SHORT-NAMES, SHORT-ABILITIES, GO-BACK-HINTS, RACE-SUGGESTIONS]
must_haves:
  truths:
    - "Clicking [Warrior], [Mystic], or ability names during creation selects them"
    - "Generated class names are 1-2 words with no adjective phrases"
    - "Generated ability names are 2-3 words max, punchy action names"
    - "Each creation step tells the user they can type 'go back'"
    - "Race step shows example races before asking for description"
  artifacts:
    - path: "spacetimedb/src/data/llm_prompts.ts"
      provides: "Constrained class/ability name schemas"
    - path: "spacetimedb/src/reducers/creation.ts"
      provides: "Go-back hints and race suggestions in creation messages"
    - path: "src/App.vue"
      provides: "Working click-to-select during creation"
  key_links:
    - from: "src/components/NarrativeMessage.vue"
      to: "window.clickNpcKeyword"
      via: "onclick handler in v-html"
      pattern: "clickNpcKeyword"
    - from: "src/App.vue"
      to: "submitCreationInput"
      via: "isInCreation check in clickNpcKeyword handler"
      pattern: "isInCreation.*submitCreationInput"
---

<objective>
Fix 5 character creation UX issues: click-to-select broken keywords, overly long class names, overly wordy ability names, missing go-back hints, and missing race suggestions.

Purpose: Character creation is the first experience -- it must feel polished and intuitive.
Output: Updated server creation messages, constrained LLM prompts, fixed click handler.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/data/llm_prompts.ts
@spacetimedb/src/reducers/creation.ts
@spacetimedb/src/index.ts (lines 780-840 — class generation result handler)
@src/App.vue (lines 1386-1402 — clickNpcKeyword handler)
@src/components/NarrativeMessage.vue
@src/composables/useCharacterCreation.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix click-to-select and add go-back hints + race suggestions</name>
  <files>src/App.vue, spacetimedb/src/reducers/creation.ts</files>
  <action>
**1. Debug and fix click-to-select (src/App.vue):**

The `window.clickNpcKeyword` handler at line ~1387 checks `isInCreation.value` before calling `submitCreationInput(keyword)`. This flow SHOULD work. Investigate and fix:

- Add `console.log('[clickNpcKeyword]', keyword, 'isInCreation:', isInCreation.value)` temporarily to trace the issue.
- Check if `isInCreation` is correctly reactive — it depends on `myCreationState` computed from `characterCreationStates` ref. If `characterCreationStates` is empty or not updating, `isInCreation` would be false.
- LIKELY FIX: The `clickNpcKeyword` function captures `isInCreation` and `submitCreationInput` at definition time. Since it's defined at module scope in `<script setup>`, the refs should be reactive. But verify the closure captures the reactive ref, not a stale value.
- If the issue is that `isInCreation` is stale in the closure, restructure to always read `.value` at call time (it already does — `isInCreation.value`). If that's not the issue, check if the onclick handler in NarrativeMessage is correctly calling `window.clickNpcKeyword`.
- One possible issue: NarrativeMessage uses `v-html` with inline onclick. The function name must match exactly. Verify no typos or casing issues between the two files.
- ALTERNATIVE FIX if the global handler truly works but creation state is not detected: Check if `characterCreationStates` subscription data is arriving. The `isInCreation` computed requires `myCreationState` which filters by `playerId.toHexString() === identity.toHexString()`. Verify this comparison works.

If after investigation the click handler genuinely works (the code looks correct), the issue may be specific to certain creation steps. Ensure the handler works at EVERY step (AWAITING_RACE, AWAITING_ARCHETYPE, CLASS_REVEALED, AWAITING_NAME).

**2. Add go-back hints to creation messages (spacetimedb/src/reducers/creation.ts):**

Add "(You can type 'go back' to return to the previous step.)" hint to the end of messages at these steps. Modify the `appendCreationEvent` calls:

- AWAITING_ARCHETYPE message (line ~803 in index.ts where race result is shown, ending with "Choose."): Add go-back hint after the archetype choice text.
  - BUT WAIT: This message is in `index.ts` not `creation.ts`. The race result handler at index.ts line 800-803 sends the archetype prompt. Add hint there.
  - Also the resume message in creation.ts line 87 for AWAITING_ARCHETYPE.
- CLASS_REVEALED message (line ~833-837 in index.ts): Add go-back hint after "Choose wisely" text.
  - Also the resume message in creation.ts line 88-89 for CLASS_REVEALED.
- Do NOT add go-back hint to AWAITING_RACE (it's the first step, nowhere to go back to).
- Do NOT add go-back hint to AWAITING_NAME (go-back is not supported from this step per `determineGoBackTarget`).

Style the hint sardonic: something like `\n\n(If you're already regretting your choices, type "go back." The System does not judge... much.)`

**3. Add race suggestions to AWAITING_RACE (spacetimedb/src/reducers/creation.ts):**

Modify the `GREETING_MESSAGE` constant to include example races after the "Describe what manner of creature you are" paragraph. Add something like:

```
\n\nNeed inspiration? Others before you have walked in as [Elves], [Dwarves], [Goblins], [Dragonborn], [Shadelings], [Myconids], [Crystalborn] -- or invented something entirely their own. Describe what you are, ask about a race, or simply make something up. I've seen it all.
```

Make the race names bracketed `[keywords]` so they're clickable. When clicked, they'll be sent as `submitCreationInput` text which goes to the AWAITING_RACE handler — the server will interpret it as a race description and pass it to the LLM.

Also update the resume message for AWAITING_RACE (line ~83) to mention race examples.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>
    - Go-back hint appears in AWAITING_ARCHETYPE and CLASS_REVEALED messages
    - Race suggestions with clickable [keywords] appear in GREETING_MESSAGE
    - Click handler verified working (or diagnosed and fixed)
  </done>
</task>

<task type="auto">
  <name>Task 2: Constrain LLM prompts for shorter class and ability names</name>
  <files>spacetimedb/src/data/llm_prompts.ts</files>
  <action>
**1. Fix class name generation (llm_prompts.ts):**

In `CLASS_GENERATION_SCHEMA` (line ~110), change:
```
"className": "string — wildly creative class name (not generic fantasy)"
```
to:
```
"className": "string — 1-2 words, no adjective phrases (e.g. 'Gatebreaker', 'Pyroclast', 'Voidcaller' — NOT 'Mire-Crowned Gatebreaker')"
```

In `COMBINED_CREATION_SCHEMA` (line ~167), apply the same change to its `className` field.

In `buildClassGenerationUserPrompt()` (line ~143-155), change the instruction:
```
Generate a wildly creative and unique class for this ${archetype} ${raceName}. The class name should be evocative and unexpected — not "Fire Mage" but "Ember-Blooded Pyroclast" or "Ash Whisperer of the Burnt Meridian." Go wild with naming and flavor.
```
to:
```
Generate a creative and unique class for this ${archetype} ${raceName}. The class name must be 1-2 words only — no adjective phrases or titles. Good: "Gatebreaker", "Pyroclast", "Voidcaller", "Ashweaver". Bad: "Mire-Crowned Gatebreaker", "Ember-Blooded Pyroclast", "Ash Whisperer of the Burnt Meridian". Keep it punchy and evocative.
```

In `buildCombinedCreationUserPrompt()` (line ~191-207), apply the same class name constraint.

In `buildCharacterCreationPrompt()` (line ~16-31), update the instruction about class names:
Change: `The class name should be evocative and unexpected — not "Fire Mage" but "Ember-Blooded Pyroclast" or "Ash Whisperer of the Burnt Meridian."`
To: `The class name should be 1-2 words, punchy and evocative — not "Fire Mage" and not "Ember-Blooded Pyroclast" either. Good: "Pyroclast", "Ashweaver", "Voidcaller".`

**2. Fix ability name generation (llm_prompts.ts):**

In `CLASS_GENERATION_SCHEMA` (line ~121-131), change the ability name field:
```
"name": "string — evocative ability name"
```
to:
```
"name": "string — 2-3 words max, punchy action name (e.g. 'Moonsap Strike', 'Void Rend', 'Iron Tide' — NOT 'Grievance of the Blackbriar Choir')"
```

Apply the same change in `COMBINED_CREATION_SCHEMA` abilities section.

In the user prompt text within `buildClassGenerationUserPrompt()`, change:
`Names should be creative and memorable.`
to:
`Ability names must be 2-3 words max — punchy and action-oriented, not narrative phrases. Good: "Void Rend", "Iron Tide", "Ember Lash". Bad: "Grievance of the Blackbriar Choir", "Cathedral of Hollow Leaves".`

Apply the same in `buildCombinedCreationUserPrompt()`.

Also update `SKILL_GENERATION_SCHEMA` (line ~232-252) ability name field:
```
"name": "string — creative, unique name specific to the character's identity"
```
to:
```
"name": "string — 2-3 words max, punchy action name (NOT narrative phrases like 'Echoing Spite of the Hollow King')"
```

And in `buildSkillGenSystemPrompt()` (line ~260-263), change:
```
Skill names should be evocative and memorable. "Echoing Spite of the Hollow King" is better than "Dark Blast."
```
to:
```
Skill names should be 2-3 words max — punchy and action-oriented. "Hollow Spite" is better than both "Dark Blast" and "Echoing Spite of the Hollow King." No narrative phrases.
```

Also update the instruction at line ~268:
```
Names should be creative and specific to the character's identity, not generic (no "Fireball", "Ice Bolt", "Power Strike").
```
to:
```
Names must be 2-3 words, creative but concise. Not generic ("Fireball") and not narrative-length ("Echoing Spite of the Hollow King"). Good: "Hollow Spite", "Void Rend", "Iron Tide".
```
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>
    - CLASS_GENERATION_SCHEMA className field specifies "1-2 words, no adjective phrases"
    - CLASS_GENERATION_SCHEMA ability name field specifies "2-3 words max"
    - COMBINED_CREATION_SCHEMA has same constraints
    - SKILL_GENERATION_SCHEMA has "2-3 words max" constraint
    - All user prompt builder functions reference the shorter name constraints
    - System prompt no longer uses long examples as "good" names
  </done>
</task>

</tasks>

<verification>
1. Server TypeScript compiles: `npx tsc --noEmit -p spacetimedb/tsconfig.json`
2. Client TypeScript compiles: `npx vue-tsc --noEmit` (or equivalent)
3. GREETING_MESSAGE contains race suggestions with [bracketed] keywords
4. Go-back hints present in archetype and class reveal messages
5. LLM schemas specify word count limits for class and ability names
</verification>

<success_criteria>
- All 5 user-reported issues addressed
- Click-to-select verified working (or definitively diagnosed with fix applied)
- LLM prompts constrain class names to 1-2 words and ability names to 2-3 words
- Go-back hints appear at AWAITING_ARCHETYPE and CLASS_REVEALED steps
- Race suggestions with clickable keywords appear in the greeting message
</success_criteria>

<output>
After completion, create `.planning/quick/336-character-creation-ux-fixes-click-to-sel/336-SUMMARY.md`
</output>
