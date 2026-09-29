---
phase: 38-platform-upgrade
plan: 08
subsystem: platform
tags: [phase-gate, human-verify, spacetimedb-2.10, pnpm, vite-8, typescript-6]
requires: [38-07]
provides:
  - Consolidated phase gate proving SC-1..SC-7 machine-checkable parts
  - Human approval of the upgraded stack running end to end
affects: []
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified: []
key-decisions:
  - "Phase 38 approved by the user; real /api/llm 200 deferred to a new LLM milestone (credits/provider and llm-proxy architecture)"
requirements-completed: [SC-1, SC-2, SC-3, SC-5, SC-6, SC-7]
requirements-partial: [SC-4]
metrics:
  tasks: 2
  commits: 0
completed: 2026-09-29
status: complete
---

# Phase 38 Plan 08: Consolidated phase gate and human verification Summary

Every machine-checkable success criterion passed in one consolidated gate, the full local stack was brought up, and the user approved the upgraded game end to end. The real `/api/llm` call stays deferred to a new LLM milestone the user requested.

Human verdict: approved

The user's words: "Approved. I want a new milestone to address the LLM issues."

## Task 1: Consolidated phase gate (ALL PASS)

| SC | Check | Result |
|----|-------|--------|
| SC-1 | `spacetime --version` | tool + lib 2.10.1 |
| SC-1 | `node_modules/spacetimedb` (root, `spacetimedb/`) | 2.10.1 in both |
| SC-3 | root typescript / vue-tsc / vite / plugin-vue / vitest / vue | 6.0.3 / 3.3.11 / 8.3.1 / 6.0.9 / 5.0.2 / 3.5.43 |
| SC-3 | `spacetimedb/` vitest | 5.0.2 |
| SC-4 | llm-proxy hono / openai / wrangler / workers-types | 4.13.10 / 7.23.0 / 4.143.0 / 5.20260928.1 |
| SC-5 | `git ls-files '*package-lock.json'` | 0 |
| SC-5 | `pnpm install --frozen-lockfile` (root, `spacetimedb/`, `llm-proxy/`) | exit 0 in all three |
| SC-5 | `engines.node` in all three | `>=22.12` |
| SC-6 | `pnpm run build` | exit 0 |
| SC-6 | `pnpm test` | 19 files, 513/513 |
| SC-6 | `pnpm --dir spacetimedb test` | 16 files, 478/478 |
| SC-6 | `spacetime build -p spacetimedb` | exit 0 (cosmetic "tsc not found" note, expected) |
| SC-7 | `cmp CLAUDE.md AGENTS.md` | exit 0 |
| SC-2 | `grep -c "logDisconnect(err)" src/main.ts` | 1 |
| SC-2 | 38-04 SUMMARY 16-row scheduled-reducer audit | present, none order-sensitive |

Stack bring-up checks:

- SpacetimeDB ping returned 200.
- No-op `pnpm spacetime:publish` exited 0 with `Updated database with name: uwr` and an empty migration plan.
- `bash llm-proxy/scripts/smoke.sh` printed PASS health, PASS auth-required, PASS validation.
- Vite 8.3.1 served http://localhost:5173/ with 200.

Execution adjustment (orchestrator-directed): the executor stopped its own processes, and the orchestrator started long-lived copies in its own session for the human check (SpacetimeDB 127.0.0.1:3000, wrangler dev 127.0.0.1:8787, Vite http://localhost:5173/uwr). All were verified healthy and smoke-passing.

## Task 2: Human verification (checkpoint:human-verify)

Per-step results:

| Step | Check | Result |
|------|-------|--------|
| 1 | App loads with no console errors | approved |
| 2 | Login, existing characters present (2.0.1 data survived 2.10.1 migration) | approved |
| 3 | `look` shows gold location name and description | approved |
| 4 | Travel to a connected location | approved |
| 5 | Combat, hotbar click, number-key `1` fires slot 1 | approved |
| 6 | `my_*` view panels (bank, quests, friends, group, effects) populate and update | approved |
| 7 | Bug Report screenshot preview (html2canvas under Vite 8) | approved |
| 8 | Real LLM round trip through the local proxy | deferred (see below) |
| 9 | Optional server stop/start disconnect logging | not reported |

Step 8: the real `/api/llm` call remains deferred because the OpenAI account returned 429 "no credits" (38-05). The user approved the phase and requested a NEW MILESTONE to address the LLM issues (credits/provider and the llm-proxy architecture). SC-4 status: upgrade verified to the provider; real 200 deferred to the LLM milestone.

The two 38-02 behavior changes were accepted as part of the approval:

1. Number-key hotbar shortcuts (1-9, 0) restored.
2. Dead `ranger_track` call removed.

No issues were reported, so there is no gap-closure input.

## Deviations from Plan

None. The plan executed as written; the only adjustment was the orchestrator-directed process handoff noted above. No source files were changed (`git status --porcelain src spacetimedb/src llm-proxy/src` is empty).

## Stop commands

The local processes are still running because the user may still be testing. To stop them:

- SpacetimeDB: `taskkill //F //IM spacetimedb-standalone.exe`
- llm-proxy: `taskkill //F //IM workerd.exe`, plus the wrangler background process
- Vite: stop the vite background process

## Related work

The orchestrator added the `.claude/skills/run-local/SKILL.md` project skill and a README llm-proxy setup step (commit da17e17c) at the user's request. Neither is part of this plan's output.

## Carried-forward notes for the user

- The first maincloud publish will show the 14-view re-creation plan and needs `--break-clients`.
- Check any external host's package-manager detection before the next push, because the lockfile moved to pnpm.
- The tracked `client/src/module_bindings/` is stale.
- The orphaned CharacterInfoPanel cluster (4 components) is a candidate for deletion.
- Follow up on `ranger_track` / TrackPanel.
- Consider adding `*.sh text eol=lf` to `.gitattributes`.
- New LLM milestone requested: real `/api/llm` 200 (credits/provider) and the llm-proxy architecture. The existing todo `2026-09-29-spike-procedure-http-to-retire-llm-proxy.md` is related input.

## Known Stubs

None. This plan changed no files.

## Self-Check: PASSED

- Acceptance grep for `human verdict: approved` matches this file.
- `git status --porcelain src spacetimedb/src llm-proxy/src` is empty.
- No task commits exist (verification-only plan).
