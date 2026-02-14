---
phase: quick-75
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: false

must_haves:
  truths:
    - "phase-4-config-tables branch is merged into master"
    - "All merge conflicts are resolved correctly"
    - "No changes are pushed to remote"
    - "Working tree is clean after merge"
  artifacts: []
  key_links: []
---

<objective>
Merge the phase-4-config-tables branch into master locally.

Purpose: Integrate Phase 4 (Config Table Architecture) work — ability metadata extension, database-driven ability execution, and related refactoring — into master branch.
Output: Clean merge commit on master with all phase-4-config-tables changes integrated.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Branch analysis:
- Common ancestor: a21d2ae (quick-65 healing values)
- phase-4-config-tables has ~50 commits since divergence (quick-66 through quick-70, Phase 4 work, refactoring)
- master has ~17 commits since divergence (quick-70 through quick-74, bugfixes)
- 6 files modified on BOTH branches (potential conflicts):
  1. .planning/STATE.md — planning doc, both branches updated project state
  2. spacetimedb/src/data/ability_catalog.ts — phase-4 added metadata fields, master has other changes
  3. spacetimedb/src/index.ts — phase-4 has refactoring (quick-69 then revert), master has changes
  4. spacetimedb/src/reducers/combat.ts — phase-4 migrated to DB lookups, master has combat changes
  5. src/App.vue — both branches modified app root
  6. src/composables/usePanelManager.ts — both branches modified panel manager
- Working tree is clean on master
- master is ahead of origin/master by 19 commits
</context>

<tasks>

<task type="auto">
  <name>Task 1: Merge phase-4-config-tables into master</name>
  <files></files>
  <action>
Run `git merge phase-4-config-tables` on the master branch.

If the merge completes cleanly (no conflicts), the task is done.

If there are merge conflicts (likely in the 6 overlapping files listed in context):

For each conflicted file, resolve as follows:

1. **`.planning/STATE.md`** — Take master's version as the base (it has the latest quick task entries 71-74), but ensure Phase 4 status shows as complete (from phase-4 branch). The phase-4 branch has decisions #36-#48 and quick tasks through #70. Master has quick tasks through #74 and decisions through #48. Combine both: keep master's full quick tasks list (through #74) and ensure all decisions from both branches are present.

2. **`spacetimedb/src/data/ability_catalog.ts`** — The phase-4 branch added metadata fields (description, damageType, targetType, etc.) to ability definitions. Master has a change to "sapping chant" text. Accept BOTH changes — the metadata fields from phase-4 AND any text changes from master. If the phase-4 branch has a more complete version with metadata, prefer that as the base and apply master's text changes on top.

3. **`spacetimedb/src/index.ts`** — The phase-4 branch did a major refactor (quick-69) then REVERTED it (commit 40b14d6). Master also has changes. Check what the phase-4 version looks like after the revert — it should be close to the pre-refactor state. Compare carefully and ensure all reducers and logic from both branches are present. Master's changes (quick-70 myPlayer view removal, quick-72 spawn rate fixes) must be preserved.

4. **`spacetimedb/src/reducers/combat.ts`** — Phase-4 migrated ability execution to database lookups (feat 04-02). Master may have combat-related fixes. Keep phase-4's database-driven approach as the base and layer in any master-only fixes.

5. **`src/App.vue`** — Phase-4 branch has changes from quick-66 through quick-70. Master has changes from quick-70 through quick-73. Both branches have the quick-70 myPlayer view fix. Combine: ensure master's latest fixes (quick-71 vendor auto-open, quick-73 z-index) are present alongside phase-4's changes.

6. **`src/composables/usePanelManager.ts`** — Phase-4 has panel manager changes. Master has quick-73 z-index fix (removed early-return guard). Ensure the z-index fix from master is present in the merged result.

After resolving all conflicts:
- Stage all resolved files with `git add`
- Complete the merge commit (git will use the default merge message)
- Do NOT push to remote

IMPORTANT: Do NOT use `git push` at any point.
  </action>
  <verify>
Run `git log --oneline -5` to confirm merge commit exists at HEAD.
Run `git status` to confirm clean working tree.
Run `git log --oneline master..phase-4-config-tables` to confirm it returns empty (all phase-4 commits now in master).
Run `git branch --merged` to confirm phase-4-config-tables appears.
  </verify>
  <done>
phase-4-config-tables is fully merged into master with all conflicts resolved. Working tree is clean. No push to remote. Both branches' changes are preserved correctly.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Merged phase-4-config-tables branch into master locally. The merge integrates Phase 4 (Config Table Architecture) with all recent master fixes (quick-70 through quick-74).</what-built>
  <how-to-verify>
    1. Run `git log --oneline -10` to review the merge commit and recent history
    2. If there were conflicts, review the resolved files:
       - `spacetimedb/src/data/ability_catalog.ts` — metadata fields present
       - `spacetimedb/src/index.ts` — all reducers intact
       - `spacetimedb/src/reducers/combat.ts` — database-driven ability execution
       - `src/App.vue` — all quick fixes present
       - `src/composables/usePanelManager.ts` — z-index fix present
    3. Optionally run a build to verify no compilation errors
    4. Confirm `git status` shows clean working tree and NO push was made
  </how-to-verify>
  <resume-signal>Type "approved" if merge looks correct, or describe any issues</resume-signal>
</task>

</tasks>

<verification>
- `git log --oneline master..phase-4-config-tables` returns empty (branch fully merged)
- `git status` shows clean working tree
- `git log --oneline -1` shows merge commit
- Remote has NOT been updated (no push)
</verification>

<success_criteria>
- phase-4-config-tables branch is merged into master
- All merge conflicts resolved with both branches' changes preserved
- Working tree is clean
- No push to remote
</success_criteria>

<output>
After completion, create `.planning/quick/75-merge-branch-phase-4-config-tables-into-/75-SUMMARY.md`
</output>
