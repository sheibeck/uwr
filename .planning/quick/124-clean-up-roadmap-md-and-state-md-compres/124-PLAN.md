---
phase: "quick-124"
plan: "01"
type: "execute"
wave: 1
depends_on: []
files_modified: [".planning/STATE.md", ".planning/ROADMAP.md", ".planning/quick/ARCHIVE.md"]
autonomous: true
must_haves:
  truths: ["STATE.md Quick Tasks table shows only last 10 entries with summary count", "ARCHIVE.md contains all older quick task entries", "ROADMAP.md Phase Overview statuses match actual state", "Completed phases have checked plan checkboxes", "Phase 2 Hunger removal is documented"]
  artifacts: [{path: ".planning/quick/ARCHIVE.md", provides: "Archived quick task history"}, {path: ".planning/STATE.md", provides: "Trimmed quick tasks table"}, {path: ".planning/ROADMAP.md", provides: "Accurate phase statuses"}]
  key_links: [{from: ".planning/STATE.md", to: ".planning/quick/ARCHIVE.md", via: "Summary count references archive", pattern: "See.*ARCHIVE"}]
---

<objective>
Clean up STATE.md and ROADMAP.md to reduce file size and ensure accuracy.

Purpose: STATE.md is 366 lines with 121 quick task entries making it unwieldy. ROADMAP.md has stale phase statuses that don't match actual completion state. Both files need maintenance to remain useful as project references.

Output: Trimmed STATE.md, new ARCHIVE.md, corrected ROADMAP.md
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Archive old quick tasks from STATE.md</name>
  <files>.planning/quick/ARCHIVE.md, .planning/STATE.md</files>
  <action>
1. Create `.planning/quick/ARCHIVE.md` with:
   - Title: "# Quick Tasks Archive"
   - Subtitle: "Archived quick task entries from STATE.md. See STATE.md for recent entries."
   - A horizontal rule
   - The full quick tasks table header: `| # | Description | Date | Commit | Directory |` with separator row
   - All quick task rows from STATE.md entries quick-1 through quick-113 (the first 111 entries — everything EXCEPT the last 10 entries: quick-114 through quick-123)

2. In STATE.md, replace the Quick Tasks Completed section:
   - Keep the section header `## Quick Tasks Completed`
   - Add a summary line: `**113 earlier tasks archived** -- see [ARCHIVE.md](./quick/ARCHIVE.md) for full history.`
   - Add an empty line
   - Keep the table header row: `| # | Description | Date | Commit | Directory |`
   - Keep the separator row: `|---|-------------|------|--------|-----------|`
   - Keep ONLY the last 10 entries (quick-114 through quick-123)
   - Keep the `---` separator after the table

Do NOT modify any other section of STATE.md (Key Decisions, Performance Metrics, Current Position, Phase Status, Accumulated Context, Blocked/Risks, Last Session).
  </action>
  <verify>
- Count lines in STATE.md — should be roughly 246 lines (366 minus ~120 archived rows plus 1 summary line)
- ARCHIVE.md exists and contains 111+ table rows (quick-1 through quick-113)
- STATE.md Quick Tasks table has exactly 10 data rows (quick-114 through quick-123)
- STATE.md still has all other sections intact (grep for "## Key Decisions Locked", "## Performance Metrics", "## Current Position", etc.)
  </verify>
  <done>STATE.md reduced by ~110 lines. ARCHIVE.md contains full history. Last 10 quick tasks remain in STATE.md with archive link.</done>
</task>

<task type="auto">
  <name>Task 2: Fix ROADMAP.md phase statuses and checkboxes</name>
  <files>.planning/ROADMAP.md</files>
  <action>
Fix the following issues in ROADMAP.md:

**Phase Overview table (lines 11-31) — update Status column:**
- Phase 11: Change "Planned" to "In Progress" (1 plan done per STATE.md)
- Phase 12: Change "Pending" to "Complete (2026-02-14)" (human-verified per STATE.md)
- Phase 14: Change "Planned" to "In Progress" (4 plans done per STATE.md)
- Phase 19: Change "Planned" to "In Progress" (2 plans done per STATE.md)

**Phase 2 in Phase Overview table:**
- Change "Complete (2026-02-12)" to "Removed (quick-76)" to reflect the hunger system removal

**Phase 2 Hunger detail section (around line 71):**
- Add a note after the Goal line: `**NOTE:** Hunger system removed in quick-76. Food buff system preserved as CharacterEffect rows. See Key Decisions #98-99.`

**Fix plan checkboxes for completed phases:**
- Phase 2 plans (lines 80-81): Change `- [ ]` to `- [x]` for both plans (completed before removal)
- Phase 5 plans (lines 272-274): Fix plan numbering from "04-01", "04-02", "04-03" to "05-01", "05-02", "05-03"
- Phase 6 plans (lines 314-316): Change `- [ ]` to `- [x]` for all 3 plans (Phase 6 is Complete)
- Phase 11 plans (lines 501-503): Change first plan `- [ ]` to `- [x]` (plan 01 done). Leave 02 and 03 as `- [ ]`.
- Phase 12 plans (lines 512-514): Change all `- [ ]` to `- [x]` (Phase 12 is Complete)
- Phase 14 plans (lines 532-535): Change all 4 `- [ ]` to `- [x]` (all 4 plans done)
- Phase 19 plans (lines 580-582): Change first two `- [ ]` to `- [x]` (plans 01-02 done). Leave 03 as `- [ ]`.

**Fix success criteria checkboxes:**
- Phase 3 success criteria (lines 124-130): Change all `- [ ]` to `- [x]` (Phase 3 is Complete)
- Phase 6 success criteria (lines 363-370): Change all `- [ ]` to `- [x]` (Phase 6 is Complete)

**Phase 12 detail section (around line 505):**
- Add `**Status:** Complete (2026-02-14)` after the Depends on line

**Phase 14 detail section (around line 525):**
- Add `**Status:** In Progress (4/4 plans done, awaiting human verification)` after the Depends on line

**Dependency graph (lines 467-479):** Remove the Phase 2 Hunger line and its reference in Phase 9:
```
Phase 1 (Races) ──────────────────────────────────────┐
Phase 3 (Renown) ──────────────────────────────────┐   │
Phase 4 (Config Tables) <- Phase 3                 │   │
Phase 5 (LLM Architecture) <- Phase 3        ──┐   │   │
                                              │   │   │
Phase 6 (Quests) <- Phase 3, Phase 5          │   │   │
Phase 7 (World Events) <- Phase 5 ─────────── │ ──┘   │
                                    (race unlock) ──────┘
Phase 8 (Tone) <- Phase 5, 6, 7
Phase 9 (Content Data) <- Phase 1, 3
```

Update the paragraph after the graph to remove "Phases 2" from the summary.

Do NOT modify phase scope descriptions, success criteria text (only checkboxes), or any other structural content.
  </action>
  <verify>
- In Phase Overview table: Phase 2 shows "Removed", Phase 11 shows "In Progress", Phase 12 shows "Complete", Phase 14 shows "In Progress", Phase 19 shows "In Progress"
- Phase 5 plans reference "05-01", "05-02", "05-03" (not "04-*")
- Phase 6 plan checkboxes all checked
- Phase 12 plan checkboxes all checked
- Phase 14 plan checkboxes all checked
- Phase 3 and 6 success criteria all checked
- Dependency graph does not mention Phase 2
  </verify>
  <done>ROADMAP.md accurately reflects all phase completion statuses, plan checkbox states match actual progress, dependency graph is current, and Phase 2 removal is documented.</done>
</task>

</tasks>

<verification>
- STATE.md is under 260 lines (was 366)
- ARCHIVE.md exists at .planning/quick/ARCHIVE.md with 111+ quick task rows
- ROADMAP.md Phase Overview table matches STATE.md Phase Status table
- No data loss — all quick task entries exist in either STATE.md or ARCHIVE.md
- grep for each section header in STATE.md confirms all sections preserved
</verification>

<success_criteria>
- STATE.md Quick Tasks reduced from ~121 entries to 10, with archive link
- ARCHIVE.md contains complete history of archived entries
- ROADMAP.md phase statuses match actual completion state
- All completed phase plan checkboxes are checked
- Phase 2 Hunger removal is documented
- Dependency graph reflects current state
</success_criteria>

<output>
After completion, create `.planning/quick/124-clean-up-roadmap-md-and-state-md-compres/124-SUMMARY.md`
</output>
