---
phase: quick-327
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/world_events.ts
  - spacetimedb/src/reducers/renown.ts
  - spacetimedb/src/reducers/quests.ts
  - spacetimedb/src/reducers/hunger.ts
  - spacetimedb/src/reducers/characters.ts
  - spacetimedb/src/reducers/npc_interaction.ts
  - spacetimedb/src/reducers/ui.ts
  - spacetimedb/src/reducers/social.ts
  - spacetimedb/src/reducers/items.ts
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/helpers/combat_perks.ts
autonomous: true
requirements: [QUICK-327]
must_haves:
  truths:
    - "SenderError is only used where character context is unavailable"
    - "fail() + return replaces throw SenderError everywhere character is in scope"
    - "Player sees error messages in their Log window instead of silent failures"
    - "Code compiles without errors after changes"
  artifacts:
    - path: "spacetimedb/src/reducers/world_events.ts"
      provides: "collect_event_item uses fail() for character-scoped errors"
    - path: "spacetimedb/src/reducers/renown.ts"
      provides: "choose_perk and grant_test_achievement use fail()"
    - path: "spacetimedb/src/reducers/quests.ts"
      provides: "loot_quest_item and pull_named_enemy use fail()"
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "executeAbility uses fail() for character-scoped errors"
    - path: "spacetimedb/src/helpers/combat_perks.ts"
      provides: "executePerkAbility uses fail() for character-scoped errors"
  key_links:
    - from: "all modified files"
      to: "spacetimedb/src/helpers/events.ts"
      via: "import { fail } from '../helpers/events'"
      pattern: "import.*fail.*from.*helpers/events"
---

<objective>
Replace `throw new SenderError(...)` with `fail(ctx, character, message); return;` across all server-side code where the function/reducer has access to both `ctx` and a `character` object.

Purpose: SenderError throws silently -- players never see the error. fail() writes to the player's Log window, giving them actionable feedback. This is a UX improvement across the entire server codebase.

Output: All reducers and helpers that have character context use fail() instead of SenderError. SenderError remains only in gatekeeping/infrastructure code where character is not available.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/events.ts (fail function definition -- line 103)
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Convert SenderError to fail() in reducers</name>
  <files>
    spacetimedb/src/reducers/world_events.ts
    spacetimedb/src/reducers/renown.ts
    spacetimedb/src/reducers/quests.ts
    spacetimedb/src/reducers/hunger.ts
    spacetimedb/src/reducers/characters.ts
    spacetimedb/src/reducers/npc_interaction.ts
    spacetimedb/src/reducers/ui.ts
    spacetimedb/src/reducers/social.ts
    spacetimedb/src/reducers/items.ts
  </files>
  <action>
For each file below, import `fail` from `../helpers/events` (add to existing import if one exists, or create new import). Then replace each listed `throw new SenderError(...)` with `fail(ctx, character, message); return;`.

CRITICAL PATTERN: `fail()` does NOT throw. Every conversion MUST add an explicit `return;` after the `fail()` call to stop execution. For void reducers, just `return;`. The pattern is:
```ts
// BEFORE:
throw new SenderError('Some error');

// AFTER:
fail(ctx, character, 'Some error');
return;

// Or for inline:
// BEFORE:
if (!x) throw new SenderError('msg');
// AFTER:
if (!x) { fail(ctx, character, 'msg'); return; }
```

Each file's `deps` destructure should include `fail` if it uses dependency injection. For files that import directly, add `fail` to the import from `../helpers/events`.

### world_events.ts
The `deps` destructure does NOT currently include `fail`. Add `fail` to the deps destructure: `const { spacetimedb, t, SenderError, fail } = deps;`
- Ensure `fail` is also passed in from index.ts deps (check index.ts wiring -- if `fail` is not in the deps object passed to `registerWorldEventReducers`, it must be added there too).

Convert in `collect_event_item` reducer (character is available after line 53):
- Line 54: `if (!character) throw new SenderError(...)` -- KEEP as SenderError (character not yet available!)
- Line 56: `throw new SenderError('You do not own this character')` -> `fail(ctx, character, ...); return;`
- Line 61: `if (!spawnItem) throw new SenderError(...)` -> `fail(ctx, character, ...); return;`
- Line 62: `if (spawnItem.collected) throw new SenderError(...)` -> `fail(ctx, character, ...); return;`
- Line 66: `throw new SenderError('You must be at the item location...')` -> `fail(ctx, character, ...); return;`
- Line 72: `throw new SenderError('This event is no longer active')` -> `fail(ctx, character, ...); return;`

KEEP as SenderError (no character context -- admin reducers):
- Lines 17, 31, 37, 40 (fire_world_event, resolve_world_event -- admin-only, no character)
- Lines 122, 126, 130 (increment_event_counter -- no character)

### renown.ts
The `deps` destructure already has `SenderError` and `appendSystemMessage`. Add `fail` to the deps destructure.

Convert in `choose_perk` reducer (character available from `requireCharacterOwnedBy` on line 9):
- Line 19: `throw new SenderError('No renown record found')` -> `fail(ctx, character, ...); return;`
- Line 39: `throw new SenderError('No perk choices available')` -> `fail(ctx, character, ...); return;`
- Line 44: `throw new SenderError('No perk pool for rank...')` -> `fail(ctx, character, ...); return;`
- Line 50: `throw new SenderError('Invalid perk choice...')` -> `fail(ctx, character, ...); return;`

Convert in `grant_test_achievement` reducer (character available from line 104):
- Line 107: `throw new SenderError('Achievement already earned')` -> `fail(ctx, character, ...); return;`

### quests.ts
Already has `fail` in deps destructure (line 8). Good.

Convert in `loot_quest_item` reducer (character available from line 24):
- Line 28: `if (!questItem) throw new SenderError(...)` -> `{ fail(ctx, character, ...); return; }`
- Line 29: `if (questItem.characterId !== character.id) throw new SenderError(...)` -> same pattern
- Line 30: `if (!questItem.discovered) throw new SenderError(...)` -> same
- Line 31: `if (questItem.looted) throw new SenderError(...)` -> same

Convert in `pull_named_enemy` reducer (character available from line 101):
- Line 105: `if (!namedEnemy) throw new SenderError(...)` -> same
- Line 106: `if (namedEnemy.characterId !== character.id) throw new SenderError(...)` -> same
- Line 107: `if (!namedEnemy.isAlive) throw new SenderError(...)` -> same
- Line 111: `if (!enemyTemplate) throw new SenderError(...)` -> same

After converting, check if `SenderError` is still needed in the deps destructure. If no SenderError uses remain, remove it from deps.

### hunger.ts
Add `fail` to deps destructure.

Convert in `eat_food` reducer (character available from line 22):
- Line 25: `if (!instance) throw new SenderError('Item not found')` -> `{ fail(ctx, character, ...); return; }`
- Line 26: `if (instance.ownerCharacterId !== characterId) throw new SenderError('Not your item')` -> same
- Line 29: `if (!template) throw new SenderError('Item template not found')` -> same
- Line 30: `if (template.slot !== 'food') throw new SenderError('This item is not food')` -> same

After converting, remove `SenderError` from deps if no longer used.

### characters.ts
Add `fail` to deps destructure.

Convert in `bind_location` reducer (character available from line 319):
- Line 322: `throw new SenderError('No bindstone here')` -> `fail(ctx, character, 'No bindstone here'); return;`

Convert in `respawn_character` reducer (character available from line 469):
- Line 472: `throw new SenderError('Cannot respawn during combat')` -> `fail(ctx, character, 'Cannot respawn during combat'); return;`

KEEP as SenderError (no character context):
- Lines 108, 178 (`set_active_character`, `clear_active_character` -- player not found, before character)
- Lines 195, 199, 205, 206, 210, 214, 216 (`create_character` -- character does not exist yet)

### npc_interaction.ts
Already imports `fail` from `../helpers/events` (line 3).

Convert remaining SenderErrors (both reducers have `character` from `requireCharacterOwnedBy`):
- Line 18: `if (!npc) throw new SenderError('NPC not found')` in `choose_dialogue_option` -> `{ fail(ctx, character, 'NPC not found.'); return; }`
- Line 91: `if (!npc) throw new SenderError('NPC not found')` in `give_gift_to_npc` -> `{ fail(ctx, character, 'NPC not found.'); return; }`

After converting, remove `SenderError` import from line 1 if no SenderError uses remain.

### ui.ts
Currently calls `requireCharacterOwnedBy(ctx, characterId)` but does NOT save the return value. Change to `const character = requireCharacterOwnedBy(ctx, characterId);` then convert:
- Line 17: `throw new SenderError('Panel states JSON cannot be empty')` -> `fail(ctx, character, ...); return;`
- Line 20: `throw new SenderError('Panel states JSON exceeds maximum size')` -> `fail(ctx, character, ...); return;`

Add `fail` to deps destructure. Remove `SenderError` from deps.

### social.ts
Convert in `send_friend_request_to_character` reducer (has `requester` from `requireCharacterOwnedBy` on line 47):
- Line 49: `if (!targetName) throw new SenderError('Target required')` -> `{ fail(ctx, requester, 'Target required'); return; }`
- Line 51: `if (!target) throw new SenderError('Target not found')` -> `{ fail(ctx, requester, 'Target not found'); return; }`
- Line 53: `throw new SenderError('Cannot friend yourself')` -> `fail(ctx, requester, 'Cannot friend yourself'); return;`

Add `fail` to deps destructure.

KEEP as SenderError (no character context -- player-level reducers):
- Lines 14, 16 (`set_display_name` -- player, not character)
- Lines 23, 25, 26 (`send_friend_request` -- user-level, no character)
- Line 114 (`accept_friend_request` -- user-level, no character)

### items.ts
Already has `fail` imported and used via `failItem` wrapper (line 48). The only SenderErrors remaining are:
- Lines 78, 82 in `create_item_template` -- no character context, KEEP as SenderError.

No changes needed for items.ts.

### index.ts wiring check
Read `spacetimedb/src/index.ts` to verify `fail` is included in the deps objects passed to each register function. If `fail` is missing from deps for any of the modified files' register calls, add it. The `fail` function is exported from `helpers/events.ts`.
  </action>
  <verify>
Run `cd C:/projects/uwr && npx tsc --noEmit --project spacetimedb/tsconfig.json` (or equivalent build check) to verify no TypeScript errors.
Then grep to confirm: `grep -rn "throw new SenderError" spacetimedb/src/reducers/ spacetimedb/src/helpers/combat.ts spacetimedb/src/helpers/combat_perks.ts` should show ONLY the expected kept usages (admin, player-level, pre-character-lookup, infrastructure).
  </verify>
  <done>
All reducer files that have character context use fail() instead of SenderError. SenderError remains only where character is not available. TypeScript compiles cleanly.
  </done>
</task>

<task type="auto">
  <name>Task 2: Convert SenderError to fail() in helper files</name>
  <files>
    spacetimedb/src/helpers/combat.ts
    spacetimedb/src/helpers/combat_perks.ts
  </files>
  <action>
These helper functions receive `character` as a parameter, so every SenderError can be converted.

CRITICAL: These are helper functions that THROW to abort execution in the calling reducer. Converting `throw SenderError` to `fail() + return` changes the control flow -- the `return` will exit the HELPER function, not the calling reducer. This means the caller would continue executing after a failed validation. To handle this correctly:

**Pattern for helper functions:** Use `fail()` to log the message, then still `throw` to abort execution -- but throw a non-SenderError so the caller's existing catch blocks can handle it. OR: change the function to return a success/failure indicator.

RECOMMENDED APPROACH: Since these helpers are called from `use_ability` in items.ts which already wraps `executeAbilityAction` and `executePerkAbility` in try/catch blocks that convert errors to `appendPrivateEvent` messages (see items.ts lines 820-886 and 746-778), the SenderError throw pattern is already being caught and converted to player-visible messages.

**Therefore, for combat.ts and combat_perks.ts: the SenderErrors are already being surfaced to the player** via the try/catch in the `use_ability` reducer (items.ts lines 877-886 and 775-778 which do `appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability', 'Ability failed: ' + message)`).

However, there are direct callers that do NOT wrap in try/catch. Check each call site:

For `executeAbility` in combat.ts -- this is called by `executeAbilityAction` which is called from `use_ability` (wrapped in try/catch) and from combat tick reducers. The combat tick callers also need to handle errors gracefully.

SAFEST APPROACH for helpers: Replace `throw new SenderError(msg)` with `fail(ctx, character, msg); throw new SenderError(msg);` -- this way the player ALSO sees the message in their log (in addition to any catch block handling), and the throw still aborts execution. This is safe because `fail()` is idempotent (just inserts a log row) and the throw ensures the function aborts.

Actually, re-examining: the try/catch in `use_ability` already does `appendPrivateEvent(ctx, ..., 'Ability failed: ' + message)`. If we add `fail()` before the throw, the player would see BOTH:
- "Some error" (from fail)
- "Ability failed: Some error" (from the catch block)

That's a double message. Instead, the BEST approach is:

**For combat.ts `executeAbility`:** Add `fail()` call AND keep the throw. Then in the calling code (items.ts `use_ability` try/catch), remove the redundant `appendPrivateEvent` in the catch block since `fail()` already handled it. BUT that's a bigger refactor.

**SIMPLEST CORRECT APPROACH:** Just add `fail()` before each `throw new SenderError(...)` in these helpers. Yes, the player may see a duplicate message in some call paths, but that's harmless and strictly better than the current state where some call paths show nothing. The duplicates can be cleaned up in a future pass.

### combat.ts (executeAbility function, starts line 320)
Import `fail` -- it's not currently imported. Add to the import from `../helpers/events` or add a new import. Check existing imports from events.ts.

Actually, combat.ts already imports from `spacetimedb/server` for SenderError. Check if there's already an import from `../helpers/events`. If not, add: `import { fail } from './events';` (it's in the same helpers directory).

Add `fail(ctx, character, msg);` BEFORE each `throw new SenderError(msg);` in `executeAbility`:
- Line 329: `throw new SenderError('Unknown ability')` -> add `fail(ctx, character, 'Unknown ability');` before
- Line 331: `throw new SenderError('Ability not available')` -> add fail before
- Line 334: `throw new SenderError('Ability not unlocked')` -> add fail before
- Line 352: `throw new SenderError('Not enough mana')` -> add fail before
- Line 354: `throw new SenderError('Not enough stamina')` -> add fail before
- Line 365: `throw new SenderError('Target not found')` -> add fail before
- Line 368: `throw new SenderError('Target not in your group')` -> add fail before
- Line 371: `throw new SenderError('Target is not at your location')` -> add fail before
- Line 374: `throw new SenderError('Target must be yourself')` -> add fail before
- Line 379: `throw new SenderError('Target not found')` -> add fail before
- Line 433: `throw new SenderError('You have no target...')` -> add fail before
- Line 522: `throw new SenderError('You have no target...')` -> add fail before
- Lines 883, 904, 934, 977, 1138, 1166, 1182, 1227, 1295, 1385, 1414, 1506, 1534: same pattern -- add `fail(ctx, character, msg);` before each throw
- Lines 1675, 1680, 1683: check if character is in scope at these lines. Line 1675-1683 are in the rest/camp section -- read context to see if character is available. If character is the parameter, convert.
- Lines 1839, 1842: Redirect ability section -- check character scope.

NOTE: Some SenderErrors in combat.ts may be in branches where `character` is available as the function parameter. The function signature is `executeAbility(ctx, character, abilityKey, targetCharacterId?)` so `character` is always available throughout.

### combat_perks.ts (executePerkAbility function, starts line 165)
Import `fail` from `./events` (same directory).

Add `fail(ctx, character, msg);` BEFORE each throw:
- Line 174: `throw new SenderError('Invalid perk ability')` -> add fail before
- Line 186: `throw new SenderError('You do not have this perk')` -> add fail before
- Line 207: `throw new SenderError('Thunderous Blow can only be used in combat')` -> add fail before
- Line 215: `throw new SenderError('No target in combat')` -> add fail before
- Line 242: `throw new SenderError('Unknown active perk effect type')` -> add fail before

  </action>
  <verify>
Run `cd C:/projects/uwr && npx tsc --noEmit --project spacetimedb/tsconfig.json` to verify no TypeScript errors.
Then grep: `grep -c "fail(ctx, character" spacetimedb/src/helpers/combat.ts spacetimedb/src/helpers/combat_perks.ts` should show non-zero counts indicating fail() was added.
  </verify>
  <done>
All SenderError throws in combat.ts executeAbility() and combat_perks.ts executePerkAbility() are preceded by fail() calls, ensuring the player sees the error message in their Log window. Throws are preserved to maintain control flow for callers.
  </done>
</task>

<task type="auto">
  <name>Task 3: Verify index.ts wiring and remove unused SenderError imports</name>
  <files>
    spacetimedb/src/index.ts
  </files>
  <action>
Read `spacetimedb/src/index.ts` to find where deps objects are constructed and passed to each register function.

Ensure `fail` is included in the deps object for every register function that was modified in Task 1:
- `registerWorldEventReducers(deps)` -- needs `fail`
- `registerRenownReducers(deps)` -- needs `fail`
- `registerQuestReducers(deps)` -- already has `fail` (confirmed in quests.ts line 8)
- `registerFoodReducers(deps)` -- needs `fail` (hunger.ts)
- `registerCharacterReducers(deps)` -- needs `fail`
- `registerNpcInteractionReducers(deps)` -- already imports directly, but verify
- `registerUiReducers(deps)` -- needs `fail`
- `registerSocialReducers(deps)` -- needs `fail`

The `fail` function is exported from `helpers/events.ts`. If index.ts already imports it, just add it to the deps objects. If not, add the import.

After all tasks complete, do a final grep to produce a summary of remaining SenderError uses and confirm they are all in appropriate locations (no character context):
- `helpers/events.ts` - requirePlayerUserId, requireCharacterOwnedBy (gatekeeping)
- `helpers/location.ts` - spawn functions (internal, no character)
- `helpers/items.ts` - addItemToInventory, removeItemFromInventory (characterId only)
- `helpers/character.ts` - findCharacterByName (no character)
- `data/admin.ts` - requireAdmin (no character)
- `reducers/auth.ts` - player-level operations
- `reducers/social.ts` - player-level reducers (set_display_name, send_friend_request, accept_friend_request)
- `reducers/characters.ts` - create_character (character doesn't exist yet), set/clear_active_character player errors
- `reducers/combat.ts` - addEnemyToCombat internal helper
- `reducers/items.ts` - create_item_template (no character)
- `helpers/combat.ts` - kept alongside fail() (throw still needed for control flow)
- `helpers/combat_perks.ts` - kept alongside fail() (throw still needed for control flow)
  </action>
  <verify>
Run: `grep -rn "throw new SenderError" spacetimedb/src/` and confirm every remaining use is in an expected location (listed above). The total count should be significantly reduced from the original ~100+ occurrences.
Run: `cd C:/projects/uwr && npx tsc --noEmit --project spacetimedb/tsconfig.json` one final time.
  </verify>
  <done>
All register functions receive `fail` in their deps. No unused SenderError imports remain in converted files. Final TypeScript compilation passes. Remaining SenderError uses are only in code paths without character context.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit --project spacetimedb/tsconfig.json` passes with zero errors
- `grep -rn "throw new SenderError" spacetimedb/src/reducers/` shows only: world_events.ts admin reducers, social.ts player-level reducers, characters.ts pre-character reducers, auth.ts player-level, combat.ts addEnemyToCombat, items.ts create_item_template
- `grep -rn "fail(ctx," spacetimedb/src/reducers/` shows conversions in world_events, renown, quests, hunger, characters, npc_interaction, ui, social
- `grep -rn "fail(ctx, character" spacetimedb/src/helpers/combat.ts spacetimedb/src/helpers/combat_perks.ts` shows fail() calls added before throws
</verification>

<success_criteria>
- Every `throw new SenderError(...)` where `character` is in scope has been replaced with `fail(ctx, character, msg); return;` (reducers) or `fail(ctx, character, msg);` before the throw (helpers)
- SenderError remains ONLY in code paths where character context is NOT available
- TypeScript compiles cleanly
- No behavioral regressions (fail + return stops execution same as throw did; fail + throw in helpers preserves abort semantics)
</success_criteria>

<output>
After completion, create `.planning/quick/327-replace-sendererror-with-fail-where-char/327-SUMMARY.md`
</output>
