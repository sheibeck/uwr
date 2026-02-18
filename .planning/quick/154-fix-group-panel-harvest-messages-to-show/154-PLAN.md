---
phase: quick-154
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/items.ts
autonomous: true
must_haves:
  truths:
    - "When a group member starts gathering, other group members see '<Character Name> begins gathering <node>.' in the group log"
    - "The gathering player's own private log still shows 'You begin gathering <node>.'"
    - "The finish_gather group message continues to show '<Character Name> gathers <node> x<qty>.' (already correct, unchanged)"
  artifacts:
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "Fixed start_gather_resource logPrivateAndGroup call with group message"
      contains: "begins gathering"
  key_links:
    - from: "spacetimedb/src/reducers/items.ts"
      to: "spacetimedb/src/helpers/events.ts"
      via: "logPrivateAndGroup groupMessage parameter"
      pattern: "logPrivateAndGroup.*character\\.name.*begins gathering"
---

<objective>
Fix the start_gather_resource log message so group members see the gathering character's name instead of "You" in the group log.

Purpose: When a group member begins gathering a resource node, all other group members currently see "You begin gathering X." in their group log — confusing because it looks like they are the ones gathering. The fix adds a separate group message using the character's name.

Output: Updated `logPrivateAndGroup` call in `start_gather_resource` reducer with a proper group message.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/items.ts (lines 804-809 — the buggy call; lines 857-862 — the correct pattern to follow)
@spacetimedb/src/helpers/events.ts (lines 122-133 — logPrivateAndGroup signature)
@.planning/quick/3-fix-group-log-messages-to-show-character/3-SUMMARY.md (prior art: same class of bug fixed for combat rewards)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add group message to start_gather_resource logPrivateAndGroup call</name>
  <files>spacetimedb/src/reducers/items.ts</files>
  <action>
In the `start_gather_resource` reducer (around line 804-809), the `logPrivateAndGroup` call currently only passes a private message and no group message:

```typescript
logPrivateAndGroup(
  ctx,
  character,
  'system',
  `You begin gathering ${node.name}.`
);
```

Add a 5th argument (groupMessage) so group members see the character's name:

```typescript
logPrivateAndGroup(
  ctx,
  character,
  'system',
  `You begin gathering ${node.name}.`,
  `${character.name} begins gathering ${node.name}.`
);
```

This follows the exact same pattern already used by `finish_gather` (line 857-862) and `take_loot` (line 322-327) in the same file. The private message stays as "You begin gathering..." for the gathering player; the group message uses third-person "{name} begins gathering..." for other group members.

Do NOT modify the `finish_gather` logPrivateAndGroup call (line 857-862) — it already has the correct group message.
Do NOT modify the `take_loot` logPrivateAndGroup call (line 322-327) — it already has the correct group message.
  </action>
  <verify>
1. Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` — no type errors
2. Grep for the updated call: `grep -n "begins gathering" spacetimedb/src/reducers/items.ts` — should show the new group message line
3. Grep to confirm no remaining gather-related logPrivateAndGroup calls are missing group messages: all 3 calls in items.ts should have 5 arguments
  </verify>
  <done>
The `start_gather_resource` reducer passes a group-specific message to `logPrivateAndGroup` so that group members see "{Character Name} begins gathering {node}." instead of "You begin gathering {node}."
  </done>
</task>

</tasks>

<verification>
- The `start_gather_resource` logPrivateAndGroup call has 5 arguments (ctx, character, kind, privateMessage, groupMessage)
- Private message uses "You begin gathering" (unchanged for the gathering player)
- Group message uses "${character.name} begins gathering" (new, for other group members)
- TypeScript compiles without errors
- Module can be published: `spacetime publish uwr --project-path spacetimedb`
</verification>

<success_criteria>
- Group members see "<Character Name> begins gathering <node>." in group log when another member starts gathering
- The gathering player still sees "You begin gathering <node>." in their private log
- No regression to finish_gather or take_loot messages (both already correct)
</success_criteria>

<output>
After completion, create `.planning/quick/154-fix-group-panel-harvest-messages-to-show/154-SUMMARY.md`
</output>
