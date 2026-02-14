---
phase: quick-74
plan: 01
subsystem: git-configuration
tags: [git, tooling, line-endings]
dependency_graph:
  requires: []
  provides:
    - "Git operations unblocked (add/commit work without errors)"
    - "Line ending normalization via .gitattributes"
  affects:
    - "All future git operations"
    - "Line ending consistency across Windows/Unix environments"
tech_stack:
  added: [".gitattributes"]
  patterns: ["Line ending normalization", "Binary file declarations"]
key_files:
  created:
    - path: ".gitattributes"
      purpose: "Configure text normalization and binary file handling"
  modified: []
decisions:
  - what: "Use rm -f nul in git bash to delete Windows reserved device name"
    why: "Git bash POSIX-like environment handles reserved names correctly"
    alternatives: ["git clean -f nul", "rename via cmd then delete"]
  - what: "Force LF for all source files in .gitattributes"
    why: "Ensures consistent line endings across Windows/Unix, matches project convention"
    alternatives: ["text=auto only", "CRLF for Windows"]
  - what: "Explicit binary declarations for images and fonts"
    why: "Prevents git from attempting text normalization on binary files"
    alternatives: ["Rely on auto-detection only"]
metrics:
  duration_minutes: 0.5
  tasks_completed: 1
  files_created: 1
  files_modified: 0
  commits: 1
  completed_at: "2026-02-14T02:53:31Z"
---

# Quick Task 74: Fix Git Operations Blocked by Invalid nul File

**One-liner:** Removed Windows reserved device name 'nul' file and configured line ending normalization via .gitattributes

---

## Objective

Remove the invalid 'nul' file (Windows reserved device name) blocking git operations, and add .gitattributes for consistent line ending handling.

---

## What Was Built

### File Deletion
- **Removed nul file** using `rm -f nul` in git bash (POSIX-like handling of reserved names)
- **Verified deletion** with `ls nul` (now returns "No such file or directory")

### .gitattributes Configuration
- **Text normalization:** `* text=auto` for auto-detection
- **LF enforcement:** All source files (`.ts`, `.tsx`, `.js`, `.json`, `.md`, `.css`, `.html`, `.yaml`, `.yml`, `.toml`) use `text eol=lf`
- **Binary declarations:** Images (`.png`, `.jpg`, `.gif`, `.ico`) and fonts (`.woff`, `.woff2`) marked as binary

---

## Technical Implementation

### Task 1: Remove nul file and add .gitattributes

**Issue:** The `nul` file is a Windows reserved device name (like `CON`, `PRN`, `AUX`). Git could not add/commit it, causing all git operations to fail with "error: invalid path 'nul'".

**Solution:**
1. Used `rm -f nul` in git bash (POSIX-like environment handles reserved names)
2. Created `.gitattributes` in repo root with comprehensive normalization rules
3. Verified git operations: `git add .gitattributes` succeeded, `nul` no longer appears in status

**Files:**
- `.gitattributes` (created)

**Commit:** `12a0032` - chore(quick-74): fix git operations by removing invalid nul file and adding .gitattributes

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Verification Results

✅ **nul file deleted:** `ls nul` returns "No such file or directory"
✅ **Git operations work:** `git add .gitattributes` succeeds without errors
✅ **.gitattributes created:** Contains text=auto and LF normalization rules
✅ **Git status clean:** No "invalid path 'nul'" errors

**Note:** `git diff --check` shows CRLF→LF normalization warnings for existing files. These are informational (not errors) - .gitattributes is working correctly by converting existing CRLF files to LF in the repository.

---

## Self-Check: PASSED

**Created files:**
- FOUND: C:/projects/uwr/.gitattributes

**Commits:**
- FOUND: 12a0032 (chore(quick-74): fix git operations by removing invalid nul file and adding .gitattributes)

**Verification:**
- nul file deleted: ✅
- git add works: ✅
- .gitattributes content correct: ✅
- No "invalid path 'nul'" errors: ✅

---

## Impact

### Immediate
- **Git operations unblocked:** All `git add`, `git commit`, `git status` commands now work without errors
- **Line endings normalized:** Future commits will use consistent LF endings for source files

### Long-term
- **Cross-platform consistency:** Windows developers see CRLF in working directory, but repository uses LF (Unix standard)
- **Binary file safety:** Images and fonts won't be corrupted by text normalization
- **Reduced warnings:** LF/CRLF warning noise eliminated for tracked file types

---

## Dependencies

**This task required:**
- Git bash (POSIX-like environment for handling Windows reserved names)

**This task provides:**
- Working git operations (unblocks all future commits)
- Line ending normalization (enables consistent cross-platform development)

---

## Notes

**Why nul file existed:** Unknown (possibly created by redirecting output to `nul` on Windows cmd instead of `/dev/null` on Unix). Windows treats `nul` as a reserved device name, making it impossible to track in git.

**Git bash advantage:** Unlike Windows cmd/PowerShell, git bash's POSIX-like environment can delete reserved device name files with standard `rm -f` command.

**Line ending strategy:** Using `text=auto` + `eol=lf` ensures repository always stores LF, but Windows developers see CRLF in working directory (best of both worlds).
