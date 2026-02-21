---
phase: quick-233
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useHotbar.ts
autonomous: true
requirements: [Q-233]

must_haves:
  truths:
    - "Hovering a filled hotbar slot shows resource cost (e.g. '12 mana' or '6 stamina')"
    - "Hovering a filled hotbar slot shows cast time (e.g. '2s cast' or 'Instant')"
    - "Hovering a filled hotbar slot shows cooldown (e.g. '8s cooldown' or 'No cooldown')"
    - "Free/passive abilities with no resource show 'Free' for cost"
  artifacts:
    - path: "src/composables/useHotbar.ts"
      provides: "hotbarTooltipItem with cost/cast/cooldown stats"
      contains: "Cost"
  key_links:
    - from: "hotbarTooltipItem"
      to: "tooltip stats array"
      via: "cost, cast time, cooldown lines added to stats"
      pattern: "Cost.*mana|stamina|Free"
---

<objective>
Enrich the hotbar slot tooltip to show resource cost, cast time, and cooldown duration.

Purpose: Players need to know ability costs and timing at a glance without memorizing them.
Output: Updated `hotbarTooltipItem` in `useHotbar.ts` that returns cost, cast time, and cooldown in the stats array.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/projects/uwr/.planning/ROADMAP.md
@C:/projects/uwr/src/composables/useHotbar.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add cost, cast time, and cooldown to hotbarTooltipItem</name>
  <files>src/composables/useHotbar.ts</files>
  <action>
Modify `hotbarTooltipItem` (lines 264-277) to add three new stats entries after the existing Level/Type/Resource lines.

Cost calculation (mirrors server-side formulas in `spacetimedb/src/helpers/combat.ts`):
- If `liveAbility.resource === 'mana'`: cost = `4n + level * 2n + power` where level = `liveAbility.level`, power = `liveAbility.power ?? 0n`
- If `liveAbility.resource === 'stamina'`: cost = `2n + power / 2n` where power = `liveAbility.power ?? 0n`
- If resource is anything else (e.g. 'none', 'free', empty): display "Free"

Format the three new stat lines:
- `{ label: 'Cost', value: resource === 'mana' ? `${cost} mana` : resource === 'stamina' ? `${cost} stamina` : 'Free' }`
- `{ label: 'Cast', value: castSeconds > 0n ? `${Number(castSeconds)}s` : 'Instant' }` — read from `liveAbility.castSeconds`
- `{ label: 'Cooldown', value: cooldownSeconds > 0n ? `${Number(cooldownSeconds)}s` : 'No cooldown' }` — read from `liveAbility.cooldownSeconds ?? slot.cooldownSeconds`

Keep all existing stats (Level, Type, Resource) and append the new three after them. No other changes to the function or file.
  </action>
  <verify>
Hover over a filled hotbar slot in the game UI. The tooltip should now show 5 stat lines: Level, Type, Resource, Cost, Cast, Cooldown (6 total). No TypeScript compile errors: `npm run build` or check with `npx vue-tsc --noEmit` in the project root.
  </verify>
  <done>
Tooltip on hotbar ability shows numerical cost with resource label (e.g. "12 mana"), cast time ("2s" or "Instant"), and cooldown ("8s cooldown" or "No cooldown"). Free abilities show "Free" for cost.
  </done>
</task>

</tasks>

<verification>
Hover over abilities of different types:
- A mana ability (e.g. any caster spell): shows mana cost > 0
- A stamina ability (e.g. a warrior strike): shows stamina cost > 0
- A channeled/cast-time ability: shows "Xs" for cast
- An instant ability: shows "Instant" for cast
- An ability with cooldown: shows "Xs cooldown"
- An ability with no cooldown (GCD only): shows "No cooldown"
</verification>

<success_criteria>
All three new tooltip fields appear for every filled hotbar slot. Values are computed from the ability template data already available in `abilityLookup`. No server changes needed.
</success_criteria>

<output>
After completion, create `.planning/quick/233-hotbar-ability-tooltip-shows-cost-cast-t/233-01-SUMMARY.md` with what was changed and verified.
</output>
