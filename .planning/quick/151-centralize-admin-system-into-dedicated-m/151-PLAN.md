---
phase: 151-centralize-admin-system
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/admin.ts
  - spacetimedb/src/data/world_event_data.ts
  - spacetimedb/src/reducers/world_events.ts
  - spacetimedb/src/reducers/commands.ts
  - spacetimedb/src/reducers/corpse.ts
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/reducers/renown.ts
  - spacetimedb/src/index.ts
autonomous: true
must_haves:
  truths:
    - "ADMIN_IDENTITIES is defined in exactly one place: spacetimedb/src/data/admin.ts"
    - "All admin/test commands throw SenderError when called by non-admin identity"
    - "All admin/test commands work normally for admin identities"
  artifacts:
    - path: "spacetimedb/src/data/admin.ts"
      provides: "ADMIN_IDENTITIES set and requireAdmin helper"
      exports: ["ADMIN_IDENTITIES", "requireAdmin"]
    - path: "spacetimedb/src/data/world_event_data.ts"
      provides: "World event definitions only, no ADMIN_IDENTITIES export"
  key_links:
    - from: "spacetimedb/src/data/admin.ts"
      to: "all reducer files with admin commands"
      via: "requireAdmin(ctx) import"
      pattern: "requireAdmin"
---

<objective>
Centralize ADMIN_IDENTITIES into a dedicated admin module and add admin guards to all admin/test commands.

Purpose: Currently ADMIN_IDENTITIES lives in world_event_data.ts (a content data file) and only fire_world_event and resolve_world_event check admin identity. The following reducers are admin/test commands with NO server-side admin guard: submit_command /synccontent handler, create_test_item, create_recipe_scroll, level_character, spawn_corpse, grant_test_renown, grant_test_achievement. Any connected player can call these reducers directly.

Output: Single admin module with requireAdmin helper, all admin reducers guarded.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/data/world_event_data.ts (current ADMIN_IDENTITIES location)
@spacetimedb/src/reducers/world_events.ts (current admin guard pattern)
@spacetimedb/src/reducers/commands.ts (unguarded: /synccontent, create_test_item, create_recipe_scroll, level_character)
@spacetimedb/src/reducers/corpse.ts (unguarded: spawn_corpse)
@spacetimedb/src/reducers/combat.ts (end_combat - has group leader check but no admin guard)
@spacetimedb/src/reducers/renown.ts (unguarded: grant_test_renown, grant_test_achievement)
@spacetimedb/src/index.ts (DI deps object)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create admin module and migrate ADMIN_IDENTITIES</name>
  <files>
    spacetimedb/src/data/admin.ts
    spacetimedb/src/data/world_event_data.ts
    spacetimedb/src/reducers/world_events.ts
  </files>
  <action>
1. Create `spacetimedb/src/data/admin.ts` with:
   - Move the `ADMIN_IDENTITIES` Set from `world_event_data.ts` to this file (keep the same hex string: `"c20006ce5893a0e7f3531d8cfc2bd561f78b60d08eb5137cc2ae3ca4ec060b80"`)
   - Export a `requireAdmin` helper function:
     ```typescript
     import { SenderError } from 'spacetimedb/server';

     export const ADMIN_IDENTITIES = new Set<string>([
       "c20006ce5893a0e7f3531d8cfc2bd561f78b60d08eb5137cc2ae3ca4ec060b80"
     ]);

     export function requireAdmin(ctx: any): void {
       if (!ADMIN_IDENTITIES.has(ctx.sender.toHexString())) {
         throw new SenderError('Admin only');
       }
     }
     ```

2. Remove the `ADMIN_IDENTITIES` export and its comments from `spacetimedb/src/data/world_event_data.ts` (lines 37-42). Do NOT touch any other content in that file.

3. Update `spacetimedb/src/reducers/world_events.ts`:
   - Change import from `import { ADMIN_IDENTITIES } from '../data/world_event_data'` to `import { requireAdmin } from '../data/admin'`
   - Replace both inline admin guard blocks (`if (!ADMIN_IDENTITIES.has(ctx.sender.toHexString())) { throw new SenderError('Admin only'); }`) with a single call: `requireAdmin(ctx);`
   - This applies to `fire_world_event` (line 12) and `resolve_world_event` (line 28)
  </action>
  <verify>Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` -- no type errors. Confirm world_event_data.ts no longer exports ADMIN_IDENTITIES. Confirm admin.ts exports both ADMIN_IDENTITIES and requireAdmin.</verify>
  <done>ADMIN_IDENTITIES lives only in admin.ts. world_events.ts uses requireAdmin(ctx) instead of inline checks. No references to ADMIN_IDENTITIES remain in world_event_data.ts.</done>
</task>

<task type="auto">
  <name>Task 2: Add admin guards to all unprotected admin/test reducers</name>
  <files>
    spacetimedb/src/reducers/commands.ts
    spacetimedb/src/reducers/corpse.ts
    spacetimedb/src/reducers/renown.ts
    spacetimedb/src/reducers/combat.ts
    spacetimedb/src/index.ts
  </files>
  <action>
The admin guard must be added via the existing dependency injection pattern. The `requireAdmin` function needs to be passed through `reducerDeps` so each reducer file can use it.

1. **spacetimedb/src/index.ts**:
   - Add import: `import { requireAdmin } from './data/admin';`
   - Add `requireAdmin` to the `reducerDeps` object (around line 331+)

2. **spacetimedb/src/reducers/commands.ts**:
   - Destructure `requireAdmin` from deps (add to the existing destructuring at the top of `registerCommandReducers`)
   - Add `requireAdmin(ctx);` as the FIRST line inside these reducer callbacks:
     - `submit_command` reducer: Add guard ONLY inside the `/synccontent` branch (line ~190), right after the `if (trimmed.toLowerCase() === '/synccontent')` check, before `syncAllContent(ctx)`. Place it as: `requireAdmin(ctx);` then continue with existing code.
     - `create_test_item` reducer (line ~357): Add `requireAdmin(ctx);` as the first line of the callback, BEFORE `requireCharacterOwnedBy`
     - `create_recipe_scroll` reducer (line ~440): Add `requireAdmin(ctx);` as the first line, BEFORE `requireCharacterOwnedBy`
     - `level_character` reducer (line ~481): Add `requireAdmin(ctx);` as the first line, BEFORE `requireCharacterOwnedBy`
   - Do NOT add admin guard to: `submit_command` (general), `say`, `hail_npc`, `group_message`, `whisper` -- these are normal player commands

3. **spacetimedb/src/reducers/corpse.ts**:
   - Destructure `requireAdmin` from deps (add to existing destructuring)
   - Add `requireAdmin(ctx);` as the first line inside the `spawn_corpse` reducer callback (line ~581), BEFORE `requireCharacterOwnedBy`
   - Do NOT touch any other corpse reducers (loot_corpse, resurrect_character, etc. are player commands)

4. **spacetimedb/src/reducers/combat.ts**:
   - Destructure `requireAdmin` from deps
   - Add `requireAdmin(ctx);` as the first line inside the `end_combat` reducer callback (line ~1113), BEFORE `requireCharacterOwnedBy`. This adds admin-only restriction on top of the existing group leader check.

5. **spacetimedb/src/reducers/renown.ts**:
   - Destructure `requireAdmin` from deps (add to existing destructuring alongside spacetimedb, t, SenderError, etc.)
   - Add `requireAdmin(ctx);` as the first line inside `grant_test_renown` (line ~86), BEFORE `requireCharacterOwnedBy`
   - Add `requireAdmin(ctx);` as the first line inside `grant_test_achievement` (line ~91), BEFORE `requireCharacterOwnedBy`
   - Do NOT add admin guard to `choose_perk` -- that is a normal player action
  </action>
  <verify>Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` -- no type errors. Grep for `requireAdmin` to confirm it appears in: admin.ts (definition), index.ts (DI), world_events.ts, commands.ts, corpse.ts, combat.ts, renown.ts. Grep for `ADMIN_IDENTITIES` to confirm it ONLY appears in admin.ts (and nowhere else in src/ except possibly comments).</verify>
  <done>All 8 admin commands are guarded: /synccontent, create_test_item, create_recipe_scroll, level_character, spawn_corpse, end_combat, grant_test_renown, grant_test_achievement. Non-admin players calling any of these get "Admin only" SenderError. Normal player commands (say, hail, move, combat abilities, choose_perk, etc.) are unaffected.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit --project spacetimedb/tsconfig.json` passes with zero errors
2. `grep -r "ADMIN_IDENTITIES" spacetimedb/src/` shows results ONLY in `data/admin.ts`
3. `grep -r "requireAdmin" spacetimedb/src/` shows usage in: data/admin.ts, reducers/world_events.ts, reducers/commands.ts, reducers/corpse.ts, reducers/combat.ts, reducers/renown.ts, index.ts
4. No changes to any client-side files -- client commands still call the same reducers, non-admins will now get SenderError responses
</verification>

<success_criteria>
- ADMIN_IDENTITIES defined in exactly one file (spacetimedb/src/data/admin.ts)
- requireAdmin helper exported from admin.ts, used by all admin reducer files
- 8 admin commands protected: fire_world_event, resolve_world_event, /synccontent, create_test_item, create_recipe_scroll, level_character, spawn_corpse, end_combat, grant_test_renown, grant_test_achievement
- TypeScript compiles without errors
- No regression to player-facing commands
</success_criteria>

<output>
After completion, create `.planning/quick/151-centralize-admin-system-into-dedicated-m/151-SUMMARY.md`
</output>
