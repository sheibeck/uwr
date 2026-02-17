---
phase: quick-107
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useHotbar.ts
  - spacetimedb/src/reducers/items.ts
autonomous: true
must_haves:
  truths:
    - "When in a group and not the puller, clicking Track shows 'You must be the puller to use this ability' and does NOT open the Track panel"
    - "When in a group and not the puller, the use_ability reducer for ranger_track does NOT execute the ability or start cooldown"
    - "When solo or when the puller, Track works exactly as before"
  artifacts:
    - path: "src/composables/useHotbar.ts"
      provides: "Client-side puller guard for ranger_track before opening Track panel"
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "Server-side puller guard for ranger_track in use_ability reducer"
  key_links:
    - from: "src/composables/useHotbar.ts"
      to: "Track panel open"
      via: "puller check before onTrackRequested callback"
      pattern: "groupId.*pullerId.*ranger_track"
    - from: "spacetimedb/src/reducers/items.ts"
      to: "ability execution"
      via: "puller check before executeAbilityAction for ranger_track"
      pattern: "requirePullerOrLog.*ranger_track"
---

<objective>
Fix Ranger Track ability so it cannot be activated when the character is in a group and is not the designated puller.

Purpose: Currently, Track can be used by non-puller group members, consuming the ability and putting it on cooldown without useful effect (since start_tracked_combat already blocks non-pullers). The fix adds guards at both client and server layers.

Output: Modified useHotbar.ts (client guard) and items.ts (server guard)
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/helpers/group.ts (requirePullerOrLog, effectiveGroupId)
@src/composables/useHotbar.ts (onHotbarClick, ranger_track special case)
@spacetimedb/src/reducers/items.ts (use_ability reducer)
@src/App.vue (selectTrackedTarget flow, pullerId computed)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add client-side puller guard in useHotbar.ts</name>
  <files>src/composables/useHotbar.ts</files>
  <action>
In useHotbar.ts, add two new props to UseHotbarArgs:

1. `groupId: Ref<bigint | null | undefined>` - the selected character's groupId
2. `pullerId: Ref<bigint | null>` - the computed puller ID from useGroups

In the `onHotbarClick` function, modify the `ranger_track` special case (currently at line 283-286). BEFORE calling `onTrackRequested?.()`, add a puller check:

```typescript
if (slot.abilityKey === 'ranger_track') {
  // Block Track if in group and not puller
  if (selectedCharacter.value?.groupId && pullerId.value !== null && pullerId.value !== selectedCharacter.value.id) {
    addLocalEvent?.('blocked', 'You must be the puller to use this ability.');
    return;
  }
  onTrackRequested?.();
  return;
}
```

The logic: if `groupId` exists (character is in a group) AND `pullerId` is known AND character is NOT the puller, block with message. Solo characters (no groupId) pass through. Pullers pass through.

Then in App.vue where useHotbar is called (around line 1723), add the two new props:
- `groupId: computed(() => selectedCharacter.value?.groupId ?? null)`
- `pullerId` (already available from useGroups destructuring at line 1160)
  </action>
  <verify>
TypeScript compiles without errors: `npx vue-tsc --noEmit` (or build check). Inspect the diff to confirm the guard is added before `onTrackRequested()` and the new props are passed from App.vue.
  </verify>
  <done>
Clicking Track in hotbar while in a group and not the puller shows "You must be the puller to use this ability" in the log and does NOT open the Track panel. Solo characters and pullers can still use Track normally.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add server-side puller guard in use_ability reducer</name>
  <files>spacetimedb/src/reducers/items.ts</files>
  <action>
In items.ts, add `requirePullerOrLog` to the destructured deps at the top of `registerItemReducers` (around line 2, alongside existing imports like `effectiveGroupId`).

In the `use_ability` reducer (starting at line 428), add a puller check specifically for `ranger_track` AFTER the cooldown check but BEFORE executing the ability. Insert it just before the `executeAbilityAction` call (around line 519), or right after the cast-time check block. The best location is after all the existing guards (cooldown, combatState, combat participant, cast time) but before `executeAbilityAction`:

```typescript
// Block ranger_track for non-pullers in groups
if (abilityKey === 'ranger_track') {
  const pullerResult = requirePullerOrLog(ctx, character, fail, 'You must be the puller to use this ability.');
  if (!pullerResult.ok) return;
}
```

This reuses the existing `requirePullerOrLog` helper which:
- Returns `{ ok: true }` for solo characters (no group)
- Returns `{ ok: true }` for the puller
- Calls `fail()` with the message and returns `{ ok: false }` for non-pullers

This prevents the ability from executing and the cooldown from being applied even if the client-side check is bypassed.
  </action>
  <verify>
Module compiles: run `cd spacetimedb && npx tsc --noEmit` or attempt `spacetime publish`. Inspect the diff to confirm the guard is placed before executeAbilityAction and after existing cooldown/combatState checks.
  </verify>
  <done>
Server-side use_ability reducer blocks ranger_track for non-puller group members with "You must be the puller to use this ability" message, no cooldown applied. Solo and puller characters unaffected.
  </done>
</task>

</tasks>

<verification>
1. Solo ranger can use Track normally (opens panel, selects target, starts combat)
2. Group puller ranger can use Track normally
3. Non-puller group ranger sees "You must be the puller to use this ability" when clicking Track in hotbar
4. Non-puller group ranger's Track does NOT go on cooldown
5. Track panel does NOT open for non-puller group members
</verification>

<success_criteria>
- Client-side guard in useHotbar.ts blocks Track panel from opening for non-pullers in groups
- Server-side guard in use_ability reducer blocks ranger_track execution for non-pullers in groups
- Both guards show "You must be the puller to use this ability" message
- No cooldown is consumed when blocked
- Solo and puller rangers are completely unaffected
</success_criteria>

<output>
After completion, create `.planning/quick/107-fix-ranger-track-ability-when-in-a-group/107-SUMMARY.md`
</output>
