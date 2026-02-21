---
phase: 264-remove-groupcount-from-pull-logic-adds-c
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements:
  - QUICK-264
must_haves:
  truths:
    - "resolve_pull adds come only from candidates (location pool), never from groupCount/group members"
    - "reserveAdds() iterates candidates directly, marks each as engaged+lockedCombatId, no takeSpawnMember group block"
    - "No unused remainingGroup variables remain in resolve_pull"
    - "maxAdds equals candidates.length only"
    - "groupCount does not appear in pull log message or pull-logic computations"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "resolve_pull reducer with groupCount-free add logic"
  key_links:
    - from: "reserveAdds()"
      to: "candidates array"
      via: "direct iteration, state=engaged, lockedCombatId set"
      pattern: "candidates.*engaged"
---

<objective>
Retire groupCount from pull logic in the resolve_pull reducer. Every enemy at a location is an independent spawn in the pool — adds come exclusively from the location's available social spawn candidates, never from the group member block.

Purpose: groupCount is being retired as a concept. The schema column stays but must not drive pull logic.
Output: resolve_pull in combat.ts with the group-member add path removed, maxAdds = candidates.length, reserveAdds() operating on candidates only.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove groupCount-based add logic from resolve_pull</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
Make the following targeted edits inside the resolve_pull reducer body (approximately lines 905–1145). Do NOT touch any other part of the file.

**Edit 1 — Pull log message (line ~905):**
Remove `(group size ${spawn.groupCount})` from the private log string. Result:
```typescript
`You begin a ${pullType === 'careful' ? 'Careful Pull' : 'Body Pull'} on ${spawn.name}.`
```

**Edit 2 — maxAdds computation (lines ~1019–1022):**
Replace:
```typescript
const initialGroupCount = spawn.groupCount > 0n ? Number(spawn.groupCount) : 1;
const groupAddsAvailable = Math.max(0, initialGroupCount - 1);
const maxAdds = groupAddsAvailable + candidates.length;
const addCount = maxAdds > 0 ? Math.min(maxAdds, Math.max(1, targetRadius || 1)) : 0;
```
With:
```typescript
const maxAdds = candidates.length;
const addCount = maxAdds > 0 ? Math.min(maxAdds, Math.max(1, targetRadius || 1)) : 0;
```

**Edit 3 — reserveAdds() function (lines ~1052–1082):**
Replace the entire reserveAdds function body with a version that iterates candidates only (no group member block, no takeSpawnMember calls):
```typescript
const reserveAdds = (count: number) => {
  if (count <= 0) return [] as { spawn: any; roleTemplateId?: bigint }[];
  const reserved: { spawn: any; roleTemplateId?: bigint }[] = [];
  let remaining = count;
  for (const candidate of candidates) {
    if (remaining <= 0) break;
    if (!candidate.spawn) continue;
    const candidateSpawn = ctx.db.enemySpawn.id.find(candidate.spawn.id);
    if (!candidateSpawn || candidateSpawn.state !== 'available') continue;
    ctx.db.enemySpawn.id.update({
      ...candidateSpawn,
      state: 'engaged',
      lockedCombatId: combat.id,
    });
    reserved.push({ spawn: candidateSpawn, roleTemplateId: candidate.template?.id });
    remaining -= 1;
  }
  return reserved;
};
```
Note: roleTemplateId is left undefined here (as before for candidates) so addEnemyToCombat picks a role via pickRoleTemplate. Pass `candidate.template?.id` only if a roleTemplateId is needed — otherwise pass undefined. Check the existing push call for candidates to replicate the exact roleTemplateId value used before (it was `member.roleTemplateId` from takeSpawnMember, which is no longer called — use `undefined` instead so addEnemyToCombat falls back to pickRoleTemplate).

Concretely the push should be:
```typescript
reserved.push({ spawn: candidateSpawn, roleTemplateId: undefined });
```

**Edit 4 — Remove three unused remainingGroup declarations:**
Remove these three lines (one each in the partial, failure, and success branches):
- Line ~1087: `const remainingGroup = ctx.db.enemySpawn.id.find(spawn.id)?.groupCount ?? 0n;` (in `if (outcome === 'partial' && addCount > 0)` block)
- Line ~1109: `const remainingGroup = ctx.db.enemySpawn.id.find(spawn.id)?.groupCount ?? 0n;` (in `else if (outcome === 'failure' && addCount > 0)` block)
- Line ~1133: `const remainingGroup = ctx.db.enemySpawn.id.find(spawn.id)?.groupCount ?? 0n;` (in the `else` success block)

After all edits, confirm no remaining references to `initialGroupCount`, `groupAddsAvailable`, or `remainingGroup` exist anywhere in the resolve_pull reducer. The `takeSpawnMember` helper function definition (lines ~53–64) and its call in `addEnemyToCombat` (line ~83) remain — they are used outside the pull path and must NOT be removed.
  </action>
  <verify>Run `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` to confirm the module compiles without errors. If publish is unavailable locally, at minimum run `tsc --noEmit` from C:/projects/uwr/spacetimedb to check types.</verify>
  <done>Module compiles. No TypeScript errors. `initialGroupCount`, `groupAddsAvailable`, and `remainingGroup` are gone from resolve_pull. `takeSpawnMember` definition and its call in addEnemyToCombat remain untouched.</done>
</task>

</tasks>

<verification>
After the edit:
- Grep `groupCount` in combat.ts — must NOT appear in the resolve_pull function body (lines 910-1147)
- Grep `takeSpawnMember` in combat.ts — must still appear at its definition (~line 53) and in addEnemyToCombat (~line 83), but NOT inside reserveAdds or resolve_pull
- Grep `remainingGroup` in combat.ts — zero results
- Grep `initialGroupCount` in combat.ts — zero results
- Grep `groupAddsAvailable` in combat.ts — zero results
- Module publishes (or tsc passes) without errors
</verification>

<success_criteria>
resolve_pull adds come exclusively from candidates (location pool). The group-member add path (`takeSpawnMember` called on the pull spawn or candidates' groupCount) is fully removed. All three `remainingGroup` dead assignments are removed. `maxAdds` equals `candidates.length`. Module compiles.
</success_criteria>

<output>
After completion, create `.planning/quick/264-remove-groupcount-from-pull-logic-adds-c/264-01-SUMMARY.md`
</output>
