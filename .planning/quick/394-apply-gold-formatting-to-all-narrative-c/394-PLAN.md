---
phase: quick-394
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/look.ts
  - spacetimedb/src/reducers/intent.ts
autonomous: true
requirements: [GOLD-FMT, INV-DESC]
must_haves:
  truths:
    - "Location name in LOOK output is displayed in gold with font-weight 600 style"
    - "Abilities command header uses gold formatting instead of === delimiters"
    - "Stats command header uses gold formatting instead of === delimiters"
    - "Character command header uses gold formatting instead of === delimiters"
    - "Inventory command header uses gold formatting and shows item descriptions"
    - "All five narrative commands (look, abilities, stats, character, inv) have consistent gold headers"
  artifacts:
    - path: "spacetimedb/src/helpers/look.ts"
      provides: "Gold-formatted location name in look output"
      contains: "color:#fbbf24"
    - path: "spacetimedb/src/reducers/intent.ts"
      provides: "Gold-formatted headers for stats, abilities, character, inventory commands"
      contains: "color:#fbbf24"
  key_links:
    - from: "spacetimedb/src/helpers/look.ts"
      to: "spacetimedb/src/reducers/intent.ts"
      via: "buildLookOutput called from intent reducer"
      pattern: "buildLookOutput"
---

<objective>
Apply consistent gold (#fbbf24) formatting to all narrative command windows (look, abilities, stats, character, inv) and add item descriptions to inventory output.

Purpose: The command outputs currently use plain text or ugly === delimiters for headers. The gold color style is already used for faction standings and world events formatting (quick-392). This brings all narrative commands to the same visual standard.
Output: All five narrative commands display with gold-colored headers and consistent formatting.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/look.ts
@spacetimedb/src/reducers/intent.ts (lines 152-450 — inventory, stats, abilities, character handlers)

<interfaces>
<!-- Color tag system used in NarrativeMessage.vue -->
<!-- {{color:#HEX}}text{{/color}} renders as colored span -->
<!-- {{color:#HEX}}[text]{{/color}} renders as clickable colored link -->

<!-- Gold formatting pattern (already used in factions, events, renown, quests): -->
<!-- {{color:#fbbf24}}Header Text{{/color}} -->

<!-- All five commands already use 'look' event kind (border styling) via appendPrivateEvent -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add gold formatting to look output location name</name>
  <files>spacetimedb/src/helpers/look.ts</files>
  <action>
In `buildLookOutput()`, change line 14 from:
```
parts.push(location.name);
```
to:
```
parts.push(`{{color:#fbbf24}}${location.name}{{/color}}`);
```

This wraps the location name in the same gold color tag used by faction/event/quest formatting. The location description on line 15 stays plain text (it is narrative prose, not a header).
  </action>
  <verify>
    <automated>grep -n "color:#fbbf24.*location.name\|location.name.*color:#fbbf24" spacetimedb/src/helpers/look.ts && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>Location name in look output is wrapped in gold color tag.</done>
</task>

<task type="auto">
  <name>Task 2: Apply gold headers to stats, abilities, character, and inventory commands; add item descriptions to inv</name>
  <files>spacetimedb/src/reducers/intent.ts</files>
  <action>
Modify four command handlers in intent.ts to use gold formatting instead of === delimiters:

**STATS handler (line ~276):**
Change:
```
parts.push(`=== ${character.name} — Level ${character.level} ${character.race} ${character.className} ===`);
```
to:
```
parts.push(`{{color:#fbbf24}}${character.name} — Level ${character.level} ${character.race} ${character.className}{{/color}}`);
```
Also add gold to section sub-headers — change "Resources:", "Base Stats:", and "Combat:" to:
```
parts.push('{{color:#fbbf24}}Resources:{{/color}}');
parts.push('{{color:#fbbf24}}Base Stats:{{/color}}');
parts.push('{{color:#fbbf24}}Combat:{{/color}}');
```

**ABILITIES handler (line ~311):**
Change:
```
parts.push(`=== Abilities (${abilities.length}) ===`);
```
to:
```
parts.push(`{{color:#fbbf24}}Abilities (${abilities.length}){{/color}}`);
```
Also format each ability name in gold:
Change:
```
parts.push(`${ab.name} (Lv ${ab.levelRequired})`);
```
to:
```
parts.push(`{{color:#fbbf24}}${ab.name}{{/color}} (Lv ${ab.levelRequired})`);
```
And format the "choose ability" link:
Change `'[choose ability] — The Keeper will present new offerings'` to use gold color tag for the clickable link:
```
'{{color:#fbbf24}}[choose ability]{{/color}} — The Keeper will present new offerings'
```

**CHARACTER handler (line ~388):**
Change:
```
parts.push(`=== ${character.name} ===`, '');
```
to:
```
parts.push(`{{color:#fbbf24}}${character.name}{{/color}}`, '');
```
Also format section sub-headers "Racial Bonuses:", "Level Bonus (every 2 levels):" in gold:
- `'Racial Bonuses:'` -> `'{{color:#fbbf24}}Racial Bonuses:{{/color}}'`
- `'Level Bonus (every 2 levels):'` -> `'{{color:#fbbf24}}Level Bonus (every 2 levels):{{/color}}'`

**INVENTORY handler (line ~165):**
Change header from:
```
const parts: string[] = ['Equipment:'];
```
to:
```
const parts: string[] = ['{{color:#fbbf24}}Equipment:{{/color}}'];
```

Add item descriptions to inventory output. After the line that pushes the equipped item (line ~198):
```
parts.push(`  ${label}: {{color:${color}}}[${itemName}]{{/color}}${statsStr}`);
```
Add a description line (matching the backpack pattern at lines ~250-252):
```
if (template.description) {
  parts.push(`    ${template.description}`);
}
```

Also format "Gold:" line in the inv output:
Change `parts.push(`\nGold: ${character.gold ?? 0n}`);` to:
```
parts.push(`\n{{color:#fbbf24}}Gold:{{/color}} ${character.gold ?? 0n}`);
```
  </action>
  <verify>
    <automated>grep -c "color:#fbbf24" spacetimedb/src/reducers/intent.ts | xargs -I{} bash -c 'if [ {} -ge 10 ]; then echo "PASS: {} gold color tags found"; else echo "FAIL: only {} gold tags, expected 10+"; fi'</automated>
  </verify>
  <done>Stats, abilities, character, and inventory commands all use gold-formatted headers. Inventory shows item descriptions. No === delimiters remain in any of the four handlers.</done>
</task>

</tasks>

<verification>
1. `grep "===" spacetimedb/src/reducers/intent.ts` should NOT match any of the stats/abilities/character headers (only unrelated code if any)
2. `grep "color:#fbbf24" spacetimedb/src/helpers/look.ts` should match the location name line
3. `grep "template.description" spacetimedb/src/reducers/intent.ts` should match in both backpack AND inventory handlers
4. Publish to local SpacetimeDB and test all five commands in-game
</verification>

<success_criteria>
- All five narrative commands (look, abilities, stats, character, inv) display with gold (#fbbf24) headers
- No === delimiter headers remain in stats, abilities, or character output
- Inventory (inv) command shows item descriptions below equipped items
- Location name in look output is gold-formatted
- Ability names are individually gold-formatted
- Section sub-headers (Resources, Base Stats, Combat, Racial Bonuses, etc.) are gold-formatted
</success_criteria>

<output>
After completion, create `.planning/quick/394-apply-gold-formatting-to-all-narrative-c/394-SUMMARY.md`
</output>
