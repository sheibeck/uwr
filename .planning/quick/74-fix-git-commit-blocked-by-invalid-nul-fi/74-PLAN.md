---
phase: quick-74
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [".gitattributes"]
autonomous: true
must_haves:
  truths:
    - "The nul file no longer exists in the working directory"
    - "git add and git commit succeed without invalid path nul errors"
    - "Line ending warnings are suppressed via .gitattributes"
  artifacts:
    - path: ".gitattributes"
      provides: "Line ending normalization config"
      contains: "text=auto"
  key_links: []
---

<objective>
Remove the invalid 'nul' file (Windows reserved device name) that blocks git operations, and add a .gitattributes file to handle line ending normalization consistently.

Purpose: Unblock all git commits currently failing with "error: invalid path 'nul'" and eliminate LF/CRLF warnings.
Output: Clean git state, .gitattributes file.
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
  <name>Task 1: Remove nul file and add .gitattributes</name>
  <files>.gitattributes</files>
  <action>
1. Delete the `nul` file from the repo root. On Windows, `nul` is a reserved device name so standard `rm nul` may fail. Use one of these approaches:
   - Try `rm -f nul` in git bash (may work since git bash is POSIX-like)
   - If that fails, use `git clean -f nul` or rename first with `cmd //c "ren nul nul.tmp"` then delete `nul.tmp`
   - Verify the file is gone with `ls -la nul` (should show "No such file")

2. Create `.gitattributes` in the repo root with these contents:
   ```
   # Auto detect text files and normalize line endings
   * text=auto

   # Force LF for all source files
   *.ts text eol=lf
   *.tsx text eol=lf
   *.js text eol=lf
   *.json text eol=lf
   *.md text eol=lf
   *.css text eol=lf
   *.html text eol=lf
   *.yaml text eol=lf
   *.yml text eol=lf
   *.toml text eol=lf

   # Binary files
   *.png binary
   *.jpg binary
   *.gif binary
   *.ico binary
   *.woff binary
   *.woff2 binary
   ```

3. Verify git operations work:
   - `git add .gitattributes` should succeed
   - `git status` should show .gitattributes as new file and nul should NOT appear
  </action>
  <verify>
Run: `ls nul 2>&1` should show "No such file or directory"
Run: `git add .gitattributes && git status` should succeed without errors
Run: `git diff --check` should show no whitespace errors
  </verify>
  <done>
The nul file is deleted, .gitattributes exists with line ending config, and git add/commit operations complete without "invalid path 'nul'" errors or LF/CRLF warnings.
  </done>
</task>

</tasks>

<verification>
- `ls nul` returns "No such file or directory"
- `git add .` does NOT produce "error: invalid path 'nul'"
- `cat .gitattributes` shows line ending normalization rules
- LF/CRLF warnings suppressed for tracked file types
</verification>

<success_criteria>
Git operations (add, commit) work without errors. The nul file is gone. Line endings are normalized via .gitattributes.
</success_criteria>

<output>
After completion, create `.planning/quick/74-fix-git-commit-blocked-by-invalid-nul-fi/74-SUMMARY.md`
</output>
