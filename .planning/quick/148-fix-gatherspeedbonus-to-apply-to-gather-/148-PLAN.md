---
phase: quick-148
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/items.ts
  - .planning/phases/20-perk-variety-expansion/20-VERIFICATION.md
autonomous: true
must_haves:
  truths:
    - "Characters with gatherSpeedBonus perks complete gathering faster than base 8 seconds"
    - "The gather cast duration scales proportionally with accumulated gatherSpeedBonus percentage"
    - "The VERIFICATION.md no longer claims gathering is instant"
  artifacts:
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "gatherSpeedBonus applied to endsAt calculation in start_gather_resource"
      contains: "gatherSpeedBonus"
  key_links:
    - from: "spacetimedb/src/reducers/items.ts"
      to: "getPerkBonusByField"
      via: "gatherSpeedBonus lookup before endsAt calculation"
      pattern: "getPerkBonusByField.*gatherSpeedBonus"
---

<objective>
Apply gatherSpeedBonus perk effect to the gather progress bar duration in the backend.

Purpose: The VERIFICATION.md for Phase 20 incorrectly stated "gathering is instant, no cooldown to reduce" — but gathering has an 8-second scheduled timer (`RESOURCE_GATHER_CAST_MICROS = 8_000_000n`). gatherSpeedBonus is defined, accumulated by `getPerkBonusByField`, and granted by 3 perks (Efficient Hands, Master Harvester, Resourceful) but never applied. This fixes it.
Output: `gatherSpeedBonus` reduces gather cast duration proportionally; VERIFICATION.md updated to reflect resolution.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/reducers/items.ts
@.planning/phases/20-perk-variety-expansion/20-VERIFICATION.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Apply gatherSpeedBonus to gather cast duration</name>
  <files>spacetimedb/src/reducers/items.ts</files>
  <action>
In `start_gather_resource` (around line 783), before the `endsAt` calculation, read `gatherSpeedBonus` via `getPerkBonusByField` and reduce the gather duration proportionally.

The existing pattern for perk lookup in this file (used in `finish_gather`) is:
```typescript
const gatherDoubleChance = getPerkBonusByField(ctx, character.id, 'gatherDoubleChance', character.level);
```

Apply the same pattern before line 783. The fix should look like this (insert before the `endsAt` line):

```typescript
const gatherSpeedBonus = getPerkBonusByField(ctx, character.id, 'gatherSpeedBonus', character.level);
const gatherDurationMicros = gatherSpeedBonus > 0
  ? BigInt(Math.round(Number(RESOURCE_GATHER_CAST_MICROS) * (1 - gatherSpeedBonus / 100)))
  : RESOURCE_GATHER_CAST_MICROS;
const endsAt = ctx.timestamp.microsSinceUnixEpoch + gatherDurationMicros;
```

Then remove (or replace) the existing `const endsAt = ctx.timestamp.microsSinceUnixEpoch + RESOURCE_GATHER_CAST_MICROS;` line at ~783 since the new code computes `endsAt` already.

Cap the minimum duration to prevent zero/negative durations — clamp `gatherDurationMicros` to no less than `500_000n` (0.5 seconds):

```typescript
const rawDuration = BigInt(Math.round(Number(RESOURCE_GATHER_CAST_MICROS) * (1 - gatherSpeedBonus / 100)));
const gatherDurationMicros = rawDuration < 500_000n ? 500_000n : rawDuration;
```

Do not touch any other logic in `start_gather_resource` or `finish_gather`.
  </action>
  <verify>
    Publish the module: `spacetime publish uwr --project-path spacetimedb`
    Check logs for compile errors: `spacetime logs uwr`
    Grep to confirm the fix is present: `grep -n "gatherSpeedBonus" spacetimedb/src/reducers/items.ts`
  </verify>
  <done>
    `gatherSpeedBonus` is read via `getPerkBonusByField` in `start_gather_resource`.
    The `endsAt` value is derived from a duration that accounts for `gatherSpeedBonus` percentage reduction.
    Module publishes without errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix VERIFICATION.md — remove false "gathering is instant" claim</name>
  <files>.planning/phases/20-perk-variety-expansion/20-VERIFICATION.md</files>
  <action>
Update `.planning/phases/20-perk-variety-expansion/20-VERIFICATION.md` to reflect that `gatherSpeedBonus` is now wired.

Specific changes needed:
1. In the gap/truth entry around line 10-17, change the `gatherSpeedBonus` sub-item from "apply to a gather cooldown or document as deferred (gathering is instant, no cooldown to reduce)" to note it is now resolved.
2. In the Gaps Summary section (Gap 1, ~line 142), update to split Gap 1: mark `gatherSpeedBonus` as resolved (wired to gather cast duration), keep `craftQualityBonus` as the remaining true no-op.
3. In the truth table (~line 72), update the PARTIAL status for truth 7 to note `gatherSpeedBonus` is now wired (only `craftQualityBonus` remains no-op).
4. In the artifacts table (~line 88), update the PARTIAL entry for items.ts to reflect `gatherSpeedBonus` is now wired.

Do not alter any other content — leave Gap 2 (undying_fury) and Gap 3 (Wrath of the Fallen) untouched.
  </action>
  <verify>
    Read the file and confirm: no remaining text says "gathering is instant" in a way that implies gatherSpeedBonus is a no-op. Confirm craftQualityBonus is still marked as a no-op gap.
  </verify>
  <done>
    VERIFICATION.md accurately reflects the post-fix state: gatherSpeedBonus is wired and functional, craftQualityBonus remains a documented no-op, the "gathering is instant" false claim is removed.
  </done>
</task>

</tasks>

<verification>
- `grep -n "gatherSpeedBonus" /c/projects/uwr/spacetimedb/src/reducers/items.ts` shows the perk lookup in `start_gather_resource`
- Module compiles and publishes: `spacetime publish uwr --project-path spacetimedb`
- VERIFICATION.md no longer contains "gathering is instant" as a reason gatherSpeedBonus cannot apply
</verification>

<success_criteria>
Characters with gatherSpeedBonus from perks (Efficient Hands rank 3 = 15%, Master Harvester rank 5 = 10%, Resourceful rank 8 = 20%) experience proportionally shorter gather cast bars. The base 8-second gather duration is reduced by the bonus percentage. The codebase no longer has a defined, accumulated, and silently non-functional perk field for gather speed.
</success_criteria>

<output>
After completion, create `.planning/quick/148-fix-gatherspeedbonus-to-apply-to-gather-/148-SUMMARY.md`
</output>
