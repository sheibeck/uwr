---
phase: quick-274
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements:
  - QUICK-274
must_haves:
  truths:
    - "Melody of Mending deducts 3 mana from the bard on each 6-second tick"
    - "If the bard has 0 mana, the mana field clamps at 0 (song continues, same as Discordant Note)"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "bard_melody_of_mending case with mana drain"
      contains: "manaCost"
  key_links:
    - from: "bard_melody_of_mending case"
      to: "ctx.db.character.id.update"
      via: "mana subtraction block"
      pattern: "mana.*manaCost"
---

<objective>
Add a 3-mana-per-tick cost to Melody of Mending in the `tick_bard_songs` reducer, mirroring the identical pattern already used by Discordant Note.

Purpose: Melody of Mending has no mana upkeep, making it free to maintain while other songs drain mana. Parity requires the same 3-mana drain per 6-second tick.
Output: Modified `bard_melody_of_mending` case in `tick_bard_songs` with a mana deduction block.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/projects/uwr/.planning/ROADMAP.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add mana drain to Melody of Mending tick</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In `tick_bard_songs` (around line 1794), inside the `case 'bard_melody_of_mending':` block, add a mana drain block immediately after the healing loop and before the `logPrivateAndGroup` call. Model it exactly after the Discordant Note mana drain (lines 1785-1790):

```typescript
// Small mana drain per pulse
const freshBardMoM = ctx.db.character.id.find(bard.id);
if (freshBardMoM && freshBardMoM.mana > 0n) {
  const manaCost = 3n;
  const newMana = freshBardMoM.mana > manaCost ? freshBardMoM.mana - manaCost : 0n;
  ctx.db.character.id.update({ ...freshBardMoM, mana: newMana });
}
```

Insert this block between the closing `}` of the `for (const member of partyMembers)` loop and the `logPrivateAndGroup` call for Melody of Mending. Use a different variable name (`freshBardMoM`) to avoid any shadowing with the Discordant Note block above. The song does NOT stop when mana reaches 0 — it just clamps to 0, matching Discordant Note behavior exactly.
  </action>
  <verify>
    Publish to local and run a bard with Melody of Mending active. Watch mana tick down 3 per 6-second pulse in the client.
    Alternatively: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` succeeds with no TypeScript errors.
  </verify>
  <done>
    The `bard_melody_of_mending` case in `tick_bard_songs` subtracts 3 mana from the bard on each tick, clamping at 0, matching the Discordant Note pattern exactly.
  </done>
</task>

</tasks>

<verification>
After publish succeeds:
- Activate Melody of Mending in a fight or open world
- Observe bard mana decreasing by 3 every 6 seconds
- Let mana hit 0 — song should continue (no stop, same as Discordant Note)
</verification>

<success_criteria>
Melody of Mending costs 3 mana per 6-second tick. Bard mana drains at the same rate as when Discordant Note is active. Song continues even at 0 mana (clamps, does not halt).
</success_criteria>

<output>
After completion, create `.planning/quick/274-melody-of-mending-costs-mana-per-tick-li/274-SUMMARY.md`
</output>
