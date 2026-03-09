---
phase: quick-383
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/intent.ts
  - src/App.vue
  - src/components/ActionBar.vue
  - src/composables/usePanelManager.ts
  - src/components/NarrativeHud.vue
autonomous: true
requirements: [QUICK-383]

must_haves:
  truths:
    - "Typing 'stats' shows full character stats with base values, derived combat stats, and equipment bonuses"
    - "Typing 'abilities' shows all unlocked abilities with level, description, kind, resource cost, cooldown"
    - "Typing 'character' shows race name, description, bonuses, penalties, level bonuses, and class name with proficiencies"
    - "Help text includes stats, abilities, and character commands"
    - "CharacterInfoPanel is removed from the UI entirely"
  artifacts:
    - path: "spacetimedb/src/reducers/intent.ts"
      provides: "stats, abilities, and character command handlers"
  key_links:
    - from: "spacetimedb/src/reducers/intent.ts"
      to: "ctx.db.abilityTemplate.by_character"
      via: "ability_template table lookup for abilities command"
    - from: "spacetimedb/src/reducers/intent.ts"
      to: "ctx.db.race"
      via: "race table lookup for character command"
---

<objective>
Replace the CharacterInfoPanel (Stats, Race, Abilities tabs) with three narrative chat commands: "stats", "abilities", and "character". Then remove CharacterInfoPanel from the UI. The Inventory tab from CharacterInfoPanel is already handled by the "inventory" and "backpack" commands (quick-356).

Purpose: Continue consolidating UI into the narrative console. All character info should be accessible via typed commands.
Output: Three new server-side commands, updated help text, CharacterInfoPanel removed.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/intent.ts (submit_intent reducer — add new command handlers)
@spacetimedb/src/schema/tables.ts (Character, Race, AbilityTemplate table schemas)
@src/components/CharacterInfoPanel.vue (to be removed)
@src/components/StatsPanel.vue (reference for stats display logic — formatPercent, block calculations)
@src/components/RacialProfilePanel.vue (reference for race display logic — fmtLabel, fmtVal, fmtPenalty)
@src/App.vue (remove CharacterInfoPanel usage)

<interfaces>
<!-- Key tables the executor needs for the new commands -->

AbilityTemplate (ctx.db.abilityTemplate.by_character.filter(characterId)):
  id, characterId, name, description, kind, targetRule, resourceType, resourceCost,
  castSeconds, cooldownSeconds, scaling, value1, value2, damageType, effectType,
  effectMagnitude, effectDuration, levelRequired, isGenerated

Race (ctx.db.race — iterate to find by name):
  id, name, description, availableClasses, bonus1Type, bonus1Value, bonus2Type, bonus2Value,
  penaltyType (optional), penaltyValue (optional), levelBonusType, levelBonusValue, unlocked

Character fields for stats:
  hp, maxHp, mana, maxMana, stamina, maxStamina, str, dex, cha, wis, int,
  hitChance, dodgeChance, parryChance, critMelee, critRanged, critDivine, critArcane,
  armorClass, perception, ccPower, vendorBuyMod, vendorSellMod, magicResistance (NOT on schema — skip),
  attackPower/spellPower (NOT on schema — skip), weaponProficiencies, armorProficiencies,
  race (string), className (string), level, xp, gold

Note: formatPercent for hit/dodge/parry/crit = (value / 10).toFixed(2) + '%'
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add stats, abilities, and character commands to submit_intent</name>
  <files>spacetimedb/src/reducers/intent.ts</files>
  <action>
In the `submit_intent` reducer in intent.ts, enhance the existing `stats` handler and add two new command handlers for `abilities` and `character`. Also update the help text.

1. **Update help text** (around line 168-196): Add these entries:
   - `[abilities] (ab) -- View your abilities with descriptions and costs.`
   - `[character] (char) -- View your race and class info with bonuses.`
   Change existing `[stats]` entry to: `[stats] -- View your full character stats and combat values.`

2. **Enhance the stats command** (around line 387-401): Replace current minimal stats output with a richer version modeled on StatsPanel.vue. Format:
   ```
   === {name} — Level {level} {race} {className} ===

   Resources:
     HP: {hp}/{maxHp}  Mana: {mana}/{maxMana}  Stamina: {stamina}/{maxStamina}
     XP: {xp}  Gold: {gold}

   Base Stats:
     STR {str}  DEX {dex}  INT {int}  WIS {wis}  CHA {cha}

   Combat:
     Hit: {formatPercent(hitChance)}  Dodge: {formatPercent(dodgeChance)}  Parry: {formatPercent(parryChance)}
     Crit (Melee): {formatPercent(critMelee)}  Crit (Ranged): {formatPercent(critRanged)}
     Crit (Divine): {formatPercent(critDivine)}  Crit (Arcane): {formatPercent(critArcane)}
     Armor Class: {armorClass}  Perception: {perception}
     CC Power: {formatPercent(ccPower)}
     Vendor Buy: -{formatPercent(vendorBuyMod)}  Vendor Sell: +{formatPercent(vendorSellMod)}
   ```
   Use helper: `const formatPercent = (v: bigint) => (Number(v) / 10).toFixed(2) + '%';`
   Define formatPercent as a local function inside the reducer scope (before the first command check).

3. **Add abilities command** after the stats handler. Match: `lower === 'abilities' || lower === 'ab'`. Query `ctx.db.abilityTemplate.by_character.filter(character.id)`, collect into array, sort by levelRequired ascending. Format each ability as:
   ```
   {name} (Lv {levelRequired})
     {description}
     {kind} — {resourceType}: {resourceCost} — Cast: {castSeconds}s — CD: {cooldownSeconds}s
   ```
   If no abilities: "You have no abilities yet."
   Emit as kind 'look'.

4. **Add character command** after abilities. Match: `lower === 'character' || lower === 'char'`. Look up race from `ctx.db.race` by iterating and matching `race.name.toLowerCase() === character.race.toLowerCase()`. Format:
   ```
   === {character.name} ===

   Class: {character.className}
   {weapon/armor proficiencies if present}

   Race: {race.name}
   {race.description}

   Racial Bonuses:
     {fmtLabel(bonus1Type)}: {fmtVal(bonus1Type, bonus1Value)}
     {fmtLabel(bonus2Type)}: {fmtVal(bonus2Type, bonus2Value)}
     {if penalty: fmtLabel(penaltyType): fmtPenalty(penaltyType, penaltyValue)}

   Level Bonus (every 2 levels):
     {fmtLabel(levelBonusType)}: {fmtVal(levelBonusType, levelBonusValue)} per even level
     Total at level {level}: {fmtVal(levelBonusType, levelBonusValue * evenLevels)}
   ```

   Port the `fmtLabel`, `fmtVal`, `fmtPenalty` functions from RacialProfilePanel.vue as local helper functions. They use the same stat type string mapping (stat_str -> STR, crit_chance -> percentage formatting, etc.).

   If race not found, show just the class name and "Race data unavailable."
   Emit as kind 'look'.

5. For proficiencies in the character command: if `character.weaponProficiencies` is truthy, show `Weapon Proficiencies: {comma-separated list}`. Same for `character.armorProficiencies`.
  </action>
  <verify>
    <automated>cd spacetimedb && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>Typing "stats", "abilities"/"ab", "character"/"char" in the narrative console produces formatted output. Help text lists all three commands.</done>
</task>

<task type="auto">
  <name>Task 2: Remove CharacterInfoPanel from UI</name>
  <files>src/App.vue, src/components/ActionBar.vue, src/composables/usePanelManager.ts, src/components/NarrativeHud.vue</files>
  <action>
1. **src/App.vue**:
   - Remove the `import CharacterInfoPanel from './components/CharacterInfoPanel.vue';` line
   - Remove the entire `<!-- Character Info Panel (wide) -->` FloatingPanel block (lines ~136-139) containing CharacterInfoPanel
   - Remove any event handlers only used by CharacterInfoPanel (onCharacterTabChange if it exists solely for this). Keep equip/unequip/inventory handlers since those are used by the narrative inventory commands.
   - Do NOT remove InventoryPanel, StatsPanel, RacialProfilePanel imports if they are used elsewhere. Check before removing.

2. **src/components/ActionBar.vue**:
   - Remove the 'characterInfo' button (the one with `@click="emit('toggle', 'characterInfo')"`)
   - Remove 'characterInfo' from the type union if it exists
   - Keep all other action buttons

3. **src/composables/usePanelManager.ts**:
   - Remove 'characterInfo' from the panel ID list (line 5)

4. **src/components/NarrativeHud.vue**:
   - Remove the `{ id: 'characterInfo', label: 'Inv' }` entry from the buttons array (line 94)

Do NOT delete the CharacterInfoPanel.vue, StatsPanel.vue, or RacialProfilePanel.vue files themselves — just disconnect them from the app. They can be cleaned up later.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>CharacterInfoPanel no longer appears in the UI. No "Inv" / "Character" button in action bar or narrative hud. App compiles without errors.</done>
</task>

</tasks>

<verification>
1. `cd spacetimedb && npx tsc --noEmit` — server compiles
2. `cd C:/projects/uwr && npx vue-tsc --noEmit` — client compiles
3. Publish to local and test: type "help" shows stats/abilities/character commands
4. Type "stats" shows formatted character stats
5. Type "abilities" shows ability list with descriptions
6. Type "character" shows race/class info with bonuses
7. No CharacterInfoPanel visible in UI, no "Inv" button
</verification>

<success_criteria>
- Three new narrative commands (stats, abilities, character) produce rich formatted output in the narrative console
- Help text includes all three commands
- CharacterInfoPanel is fully disconnected from the UI
- Both server and client compile without errors
</success_criteria>

<output>
After completion, create `.planning/quick/383-replace-characterinfopanel-with-chat-com/383-SUMMARY.md`
</output>
