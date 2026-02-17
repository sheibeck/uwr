---
phase: quick-126
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useHotbar.ts
autonomous: true
must_haves:
  truths:
    - "Cleric casts Mend on a targeted group member and the heal applies to that group member, not self"
    - "Beneficial spells (heals, buffs, cleanses) resolve to the defensiveTargetId when a group member is targeted"
    - "When no group member is targeted, beneficial spells still default to self (no regression)"
    - "Damage abilities (kind 'combat' without heal/buff behavior) still work as before with no target passed"
  artifacts:
    - path: "src/composables/useHotbar.ts"
      provides: "Updated onHotbarClick that passes defensiveTargetId for all non-utility abilities"
  key_links:
    - from: "src/composables/useHotbar.ts"
      to: "spacetimedb/src/helpers/combat.ts"
      via: "useAbility reducer call with targetCharacterId"
      pattern: "useAbility.*defensiveTargetId"
---

<objective>
Fix beneficial spells (heals, buffs, cleanses) ignoring the player's targeted group member and always resolving to self.

Purpose: When a Cleric targets a Ranger via the group panel and casts Mend, the heal should apply to the Ranger, not default back to the Cleric. The server-side code already handles targetCharacterId correctly (resolvedTargetId = targetCharacterId ?? character.id), but the client never passes a target for non-utility abilities.

Output: Updated useHotbar.ts where onHotbarClick passes defensiveTargetId for all ability kinds (not just 'utility').
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/composables/useHotbar.ts
@spacetimedb/src/helpers/combat.ts (executeAbility function - lines 285-345 for target resolution)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pass defensiveTargetId for all ability kinds in onHotbarClick</name>
  <files>src/composables/useHotbar.ts</files>
  <action>
In the `onHotbarClick` function (around line 342-346), change the targetId logic.

Currently (line 344-346):
```typescript
const targetId =
  slot.kind === 'utility' ? defensiveTargetId.value ?? selectedCharacter.value.id : undefined;
useAbility(slot.abilityKey, targetId);
```

Change to ALWAYS pass defensiveTargetId when it is set (regardless of ability kind). When defensiveTargetId is null (no group member targeted), pass undefined to let server default to self:
```typescript
const targetId = defensiveTargetId.value ?? undefined;
useAbility(slot.abilityKey, targetId);
```

WHY this works:
- `defensiveTargetId` is set by clicking on group members in GroupPanel (defaults to self when character is selected, line 1973 in App.vue)
- The server-side `executeAbility` (combat.ts line 322) already does `resolvedTargetId = targetCharacterId ?? character.id` which defaults to self when undefined
- The server validates the target is in the same group (line 331-337) so passing a target for damage abilities just means the server validates and proceeds normally (damage abilities ignore targetCharacter for their switch cases, they use enemy targeting from aggro tables)
- For heals/buffs/cleanses (Mend, Heal, Sanctify, Spirit Mender, Ancestral Ward, etc.), the server uses `targetCharacter` directly in the ability switch cases
- The old `?? selectedCharacter.value.id` fallback for utility kind is unnecessary because defensiveTargetId already defaults to self (set in App.vue watch on selectedCharacter.id, line 1973)

Do NOT change any server-side code. The server already handles targeting correctly.
Do NOT change how special abilities (resurrect, corpse summon, ranger_track) work - they have their own early-return handling above this code.
  </action>
  <verify>
1. Read the modified useHotbar.ts and confirm the targetId logic passes defensiveTargetId.value for all ability activations
2. Confirm the special ability early-returns (resurrect, corpse summon, track) are untouched above the change
3. Run `npm run build` from the client directory (or equivalent) to verify no TypeScript errors
  </verify>
  <done>
- onHotbarClick passes defensiveTargetId.value (or undefined) as targetCharacterId for ALL ability kinds
- Beneficial spells like Mend will now resolve to the targeted group member on the server
- When no group member is targeted, defensiveTargetId defaults to caster's own id (set in App.vue), preserving self-cast behavior
- No TypeScript compilation errors
  </done>
</task>

</tasks>

<verification>
- Build client successfully with no TypeScript errors
- Code review: onHotbarClick passes defensiveTargetId to useAbility for all non-special abilities
- Server-side executeAbility already validates group membership for the target
</verification>

<success_criteria>
- The targetId passed to useAbility is defensiveTargetId.value (not gated by slot.kind === 'utility')
- No regression: when no target is selected, abilities default to self via server fallback
- Special abilities (resurrect, corpse summon, track) remain unchanged
</success_criteria>

<output>
After completion, create `.planning/quick/126-fix-beneficial-spells-ignoring-player-ta/126-SUMMARY.md`
</output>
