---
phase: quick-95
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/corpse.ts
  - src/composables/useCommands.ts
  - src/components/CommandBar.vue
autonomous: true
must_haves:
  truths:
    - "User can type /spawncorpse to create a test corpse with one junk item at current location"
    - "Corpse appears in the corpse system and is lootable via existing corpse loot UI"
  artifacts:
    - path: "spacetimedb/src/reducers/corpse.ts"
      provides: "spawn_corpse reducer that creates Corpse + junk ItemInstance + CorpseItem"
    - path: "src/composables/useCommands.ts"
      provides: "/spawncorpse command handler calling spawnCorpse reducer"
    - path: "src/components/CommandBar.vue"
      provides: "/spawncorpse entry in autocomplete list"
  key_links:
    - from: "src/composables/useCommands.ts"
      to: "module_bindings reducers.spawnCorpse"
      via: "useReducer + object call syntax"
      pattern: "spawnCorpse.*characterId"
    - from: "spacetimedb/src/reducers/corpse.ts"
      to: "ctx.db.corpse, ctx.db.corpseItem, ctx.db.itemInstance, ctx.db.itemTemplate"
      via: "direct table access in spawn_corpse reducer"
      pattern: "spawn_corpse"
---

<objective>
Add a /spawncorpse admin command that creates a corpse for the current player's character at their current location with a single random junk item, for testing the corpse/loot system without needing to die in combat.

Purpose: The Death & Corpse System (Phase 11) needs testing but requires dying in combat (level 5+) to generate corpses. This admin command bypasses that for faster iteration.
Output: Working /spawncorpse slash command that creates a lootable corpse.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/reducers/corpse.ts
@spacetimedb/src/helpers/corpse.ts
@spacetimedb/src/reducers/commands.ts
@src/composables/useCommands.ts
@src/components/CommandBar.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add spawn_corpse reducer to backend</name>
  <files>spacetimedb/src/reducers/corpse.ts</files>
  <action>
Add a new `spawn_corpse` reducer at the end of `registerCorpseReducers` (after the `decline_corpse_summon` reducer, before the closing `};`).

The reducer takes `{ characterId: t.u64() }` and does:

1. Call `requireCharacterOwnedBy(ctx, args.characterId)` to get the character.
2. Find a random junk item template: `const junkTemplates = [...ctx.db.itemTemplate.iter()].filter((row: any) => row.isJunk);` — this matches the existing pattern in `spacetimedb/src/helpers/combat.ts` line 1028.
3. If no junk templates exist, throw `new SenderError('No junk item templates found')`.
4. Pick a random one using timestamp-based seed: `const seed = ctx.timestamp.microsSinceUnixEpoch; const template = junkTemplates[Number(seed % BigInt(junkTemplates.length))];`
5. Create an ItemInstance owned by the character: `const item = ctx.db.itemInstance.insert({ id: 0n, templateId: template.id, ownerCharacterId: character.id, equippedSlot: undefined, quantity: 1n });`
6. Check for existing corpse at character's current location (same pattern as `createCorpse` in helpers/corpse.ts): `const existingCorpses = [...ctx.db.corpse.by_character.filter(character.id)]; const existingAtLocation = existingCorpses.find((c: any) => c.locationId === character.locationId);`
7. If existing corpse at location, reuse it (update timestamp): `corpse = ctx.db.corpse.id.update({ ...existingAtLocation, createdAt: ctx.timestamp });`
8. Otherwise create new: `corpse = ctx.db.corpse.insert({ id: 0n, characterId: character.id, locationId: character.locationId, createdAt: ctx.timestamp });`
9. Insert CorpseItem linking the item to the corpse: `ctx.db.corpseItem.insert({ id: 0n, corpseId: corpse.id, itemInstanceId: item.id });`
10. Log a message: `appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', \`A corpse appears with ${template.name}.\`);`

The `SenderError` import is already available from the `deps` destructuring at the top of `registerCorpseReducers`. The reducer needs `SenderError` which is already destructured. It also needs `appendPrivateEvent` which is already in deps. The `spacetimedb` and `t` are already destructured.

Note: This intentionally does NOT use the `createCorpse` helper because that transfers ALL inventory items and has level 5+ gating. This reducer creates a fresh corpse with a single new junk item regardless of level.
  </action>
  <verify>
Grep for `spawn_corpse` in `spacetimedb/src/reducers/corpse.ts` to confirm the reducer exists.
  </verify>
  <done>
- `spawn_corpse` reducer exists in corpse.ts
- Creates a Corpse row at character's location
- Creates an ItemInstance (junk) and links it via CorpseItem
- Reuses existing corpse at same location (matching createCorpse pattern)
- Logs a private event message
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire /spawncorpse command on client</name>
  <files>src/composables/useCommands.ts, src/components/CommandBar.vue</files>
  <action>
**1. CommandBar.vue — Add autocomplete entry (around line 75, before the closing `]`):**

Add to the `commands` array:
```
{ value: '/spawncorpse', hint: 'Spawn test corpse with junk item' },
```

**2. useCommands.ts — Wire up the reducer:**

- Add `const spawnCorpseReducer = useReducer(reducers.spawnCorpse);` after the `grantTestRenownReducer` declaration (around line 34).
- Add a new `else if` branch before the final `else` block (before line 158). Pattern:
```typescript
} else if (lower === '/spawncorpse') {
  spawnCorpseReducer({
    characterId: selectedCharacter.value.id,
  });
}
```

Note: This command takes no arguments (unlike /grantrenown which takes a number). The reducer is `spawn_corpse` server-side which becomes `spawnCorpse` in client bindings (snake_case to camelCase conversion per CLAUDE.md).

**3. After both files are modified, regenerate client bindings:**

Run: `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb`

This is needed because `spawn_corpse` is a new reducer and the client bindings won't have `reducers.spawnCorpse` until regenerated. However, if SpacetimeDB server is not running or module not published, the bindings can't be generated yet. In that case, the executor should note this in the summary as a follow-up step.

If the generate command fails (server not running), that is acceptable — the code changes are correct and bindings will be generated on next publish cycle.
  </action>
  <verify>
1. Grep for `spawncorpse` in CommandBar.vue to confirm autocomplete entry
2. Grep for `spawnCorpse` in useCommands.ts to confirm reducer wiring
3. Attempt `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb` (may fail if server not running — that is OK)
  </verify>
  <done>
- /spawncorpse appears in CommandBar.vue autocomplete list
- useCommands.ts has spawnCorpse reducer wired with characterId-only call
- Client bindings regenerated (or noted as follow-up if server unavailable)
  </done>
</task>

</tasks>

<verification>
- `spacetimedb/src/reducers/corpse.ts` contains `spawn_corpse` reducer
- `src/components/CommandBar.vue` contains `/spawncorpse` in commands array
- `src/composables/useCommands.ts` imports and calls `spawnCorpse` reducer
- Reducer creates Corpse + ItemInstance + CorpseItem with a random junk template
</verification>

<success_criteria>
1. Typing `/sp` in command bar shows `/spawncorpse` in autocomplete
2. Executing `/spawncorpse` creates a corpse at current location with one junk item
3. The spawned corpse is lootable via the existing corpse loot system
</success_criteria>

<output>
After completion, create `.planning/quick/95-create-spawncorpse-admin-command-that-sp/95-SUMMARY.md`
</output>
