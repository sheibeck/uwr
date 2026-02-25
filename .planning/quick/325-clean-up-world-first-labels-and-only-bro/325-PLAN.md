---
phase: quick-325
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/renown.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [only-broadcast-world-firsts, clean-up-labels]
must_haves:
  truths:
    - "Only position 1 (actual world first) gets a world broadcast"
    - "Boss kill world first message uses boss display name, not internal key"
    - "Achievement world first message uses achievement display name"
    - "Second and third completions still record in renown_server_first table and still award diminished renown, just no broadcast"
  artifacts:
    - path: "spacetimedb/src/helpers/renown.ts"
      provides: "awardServerFirst with first-only broadcast and clean label support"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Boss kill passes display name for clean broadcast"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "spacetimedb/src/helpers/renown.ts"
      via: "awardServerFirst call with displayLabel param"
      pattern: "awardServerFirst.*displayLabel"
---

<objective>
Fix server_first world broadcasts to only announce actual world firsts (position 1), and clean up the broadcast message format to use proper display names instead of internal keys.

Purpose: Current behavior broadcasts "second" and "third" completions as world events (spam/confusing) and uses ugly internal identifiers like "boss_kill: boss_mirewalker_thane" instead of clean achievement text.
Output: Clean world-first-only broadcasts like "Jouctas achieved World First: Mirewalker Thane slain!"
</objective>

<context>
@spacetimedb/src/helpers/renown.ts
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/data/renown_data.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Gate broadcasts to first-only and add displayLabel parameter</name>
  <files>spacetimedb/src/helpers/renown.ts, spacetimedb/src/reducers/combat.ts</files>
  <action>
In `spacetimedb/src/helpers/renown.ts`, modify `awardServerFirst`:

1. Add an optional `displayLabel?: string` parameter after `baseRenown`:
   ```
   export function awardServerFirst(
     ctx: any,
     character: any,
     category: string,
     achievementKey: string,
     baseRenown: bigint,
     displayLabel?: string
   ): bigint {
   ```

2. Replace the broadcast block (lines 93-101) that currently broadcasts for positions 1-3:
   ```typescript
   // OLD (remove):
   if (position <= 3n) {
     const ordinal = position === 1n ? 'first' : position === 2n ? 'second' : 'third';
     appendWorldEvent(
       ctx,
       'server_first',
       `${character.name} was ${ordinal} to ${category}: ${achievementKey}!`
     );
   }

   // NEW (replace with):
   if (position === 1n) {
     const label = displayLabel || `${category}: ${achievementKey}`;
     appendWorldEvent(
       ctx,
       'server_first',
       `${character.name} achieved World First: ${label}!`
     );
   }
   ```

   This ensures: only position 1 broadcasts, uses displayLabel if provided, falls back to category:key for any future callers that don't pass a label.

3. In `spacetimedb/src/reducers/combat.ts`, update the boss kill `awardServerFirst` call (around line 2725).
   The template.name already contains the clean display name (e.g., "Mirewalker Thane").
   Pass a displayLabel:
   ```typescript
   const bossKey = `boss_${template.name.toLowerCase().replace(/\s+/g, '_')}`;
   const serverFirstRenown = awardServerFirst(
     ctx, character, 'boss_kill', bossKey, RENOWN_GAIN.BOSS_KILL_BASE,
     `${template.name} slain`
   );
   ```

4. In `spacetimedb/src/helpers/renown.ts`, update the `grantAchievement` function's call to `awardServerFirst` (around line 234).
   Pass a displayLabel using the achievement definition name:
   ```typescript
   const serverFirstRenown = awardServerFirst(
     ctx, character, 'achievement', achievementKey, achievementDef.renown,
     `${achievementDef.name}`
   );
   ```

Keep everything else unchanged: the renown_server_first table still records all positions, diminishing renown still applies for 2nd/3rd, only the world broadcast is gated to first-only.
  </action>
  <verify>
    Run `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` to local server and confirm no compilation errors. Check spacetime logs for clean startup.
  </verify>
  <done>
    - Only position === 1n triggers appendWorldEvent broadcast
    - Boss kill broadcast reads like "Jouctas achieved World First: Mirewalker Thane slain!"
    - Achievement broadcast reads like "Jouctas achieved World First: First Steps!"
    - 2nd and 3rd completions still insert into renown_server_first table and award diminished renown but produce no world broadcast
  </done>
</task>

</tasks>

<verification>
1. Module compiles and publishes without errors
2. Review the broadcast message format in the code matches expected pattern
3. Confirm position check is strictly `=== 1n` (not `<= 3n`)
</verification>

<success_criteria>
- World broadcast only fires for position 1 (true first)
- Broadcast message uses clean display names, not internal keys
- Renown tracking for positions 2+ still works (table insert + diminished renown) but silently
</success_criteria>
