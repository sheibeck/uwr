---
phase: 42-client-cutover-and-legacy-removal
plan: 04
subsystem: client-cutover
tags: [llm, indicator, vue, spacetimedb-view, dead-code-removal, docs]
status: complete
one_liner: "The console's Keeper line now comes only from the player's own my_llm_jobs view through useLlmStatus (only creation and world gen lock input), and the proxy composable, the tracked llm-proxy Worker, the stale client/ bindings copy and every proxy mention in the README and run-local skill are gone, with static guards keeping them out"
requires:
  - phase: 42-02 (useLlmStatus, resolveDisplayedLine, indicator lines, legacy credential cleanup, bundle guard)
  - phase: 42-03 (client-trusted result reducer and old validation reducer removed server-side)
provides:
  - "useCoreData: llmJobs over the my_llm_jobs view (subscribe, refresh, rebind on insert, update and delete)"
  - "App.vue: llmStatus, isLlmInputLocked (creation or world gen only), llmIndicatorLine passed to both consoles"
  - "NarrativeConsole: optional llmIndicatorLine prop, role=status / aria-live=polite indicator, prefers-reduced-motion rule"
  - "src/legacyLlmRemoval.test.ts: 15 static guards (client wiring, proxy removal, docs)"
affects: [42-05 (regenerate bindings after publish 1, run the bundle guard, publish 1), 42-07 (user checklist: delete the Worker and local llm-proxy folder, remove VITE_LLM_PROXY_* lines)]
tech-stack:
  added: []
  patterns:
    - "View handle rebound on insert, update and delete (a view has no primary key, so a status change is delete plus insert)"
    - "Inline animation overridden by a class rule with !important inside prefers-reduced-motion"
key-files:
  created:
    - src/legacyLlmRemoval.test.ts
  modified:
    - src/composables/data/useCoreData.ts
    - src/App.vue
    - src/components/NarrativeConsole.vue
    - src/composables/useNpcConversation.ts
    - README.md
    - .claude/skills/run-local/SKILL.md
  deleted:
    - src/composables/useLlmProxy.ts
    - "llm-proxy/ (8 tracked files: .gitignore, package.json, pnpm-lock.yaml, pnpm-workspace.yaml, scripts/smoke.sh, src/index.ts, tsconfig.json, wrangler.toml)"
    - "client/ (tracked stale module_bindings copy)"
key-decisions:
  - "Only isCreationLlmProcessing and isWorldGenProcessing lock input; isNarrativeLlmProcessing is now an alias of isLlmInputLocked and the indicator never feeds any disabled state"
  - "Failed or expired jobs show no client error UI: the row leaves the active set and the server's in-voice log line carries the failure"
  - "llm-proxy/ leftovers are hidden with a local-only rule in .git/info/exclude (not a tracked file) because removing llm-proxy/.gitignore with git rm made the ignored leftovers show as untracked"
metrics:
  tasks: 3
  commits: 3
  tests: "116 root tests in the four verified files (legacyLlmRemoval, useLlmStatus, legacyCredentials, check-bundle), single worker, all passing; pnpm build passes"
completed: 2026-09-30
---

# Phase 42 Plan 04: Client cutover to my_llm_jobs and proxy removal Summary

The client half of publish 1 is done: the browser no longer subscribes to `llm_task`, holds no LLM plumbing, and shows one in-voice Keeper line derived from the player's own job rows.

## What was done

**Task 1 (dc2effed): drive the console from my_llm_jobs.** `useCoreData.ts` renames the old task ref to `llmJobs`, fills it from `dbConn.db.my_llm_jobs.iter()`, subscribes with `toSql(tables.my_llm_jobs)` and rebinds on insert, update and delete. `App.vue` drops the proxy import and block and adds `useLlmStatus({ llmJobs })`, `isLlmInputLocked = isCreationLlmProcessing || isWorldGenProcessing` and `llmIndicatorLine = resolveDisplayedLine(llmStatus.indicatorLine, isLlmInputLocked)`. `isNarrativeLlmProcessing` is now `isLlmInputLocked` (both input guards unchanged), the creation console's lock uses `isLlmInputLocked`, and both consoles get `:llm-indicator-line`. `NarrativeConsole.vue` has the optional `llmIndicatorLine` prop; the indicator div (`class="llm-indicator"`, `role="status"`, `aria-live="polite"`, same `consideringStyle`) renders only while the line is non-null; the hard-coded "considering your fate" text is gone; one `prefers-reduced-motion: reduce` rule sets `animation: none !important` on `.llm-indicator` because the pulse is inline. `NarrativeInput`'s `:disabled` is unchanged.

**Task 2 (73504aa3): remove the proxy client, Worker source and stale bindings copy.** `useLlmProxy.ts` was deleted after grep showed only App.vue (already cut over) used it. `useNpcConversation.ts` comments now describe the executor flow (comments only). `git grep` showed no import of `client/`, so `git rm -r client` and `git rm -r llm-proxy` removed the tracked files. The test walks `src/` (skipping `module_bindings`, `node_modules` and test files), asserts 20 or more files scanned, no forbidden word, the retired key name only in `legacyCredentials.ts`, no whole-object `import.meta.env`, and the removed paths absent.

**Task 3 (f6aecaff): docs.** README loses the proxy install line and the proxy step, renumbers the dev-server step to 6 and adds a short paragraph on the server-side executor with `node scripts/llm/set-key.mjs` and `docs/runbooks/llm-key.md`. The run-local skill now lists three processes (server, publish, Vite), ports 3000 and 5173, the runbook, and the Stopping section without workerd or wrangler; the stop-and-ask rule for a database clear is kept.

## Verification

- `CI=true pnpm exec vitest run --maxWorkers=1 src/legacyLlmRemoval.test.ts src/composables/useLlmStatus.test.ts src/legacyCredentials.test.ts scripts/check-bundle.test.mjs`: 4 files, 116 tests passed.
- `pnpm build` succeeds after each task.
- `node scripts/check-bundle.mjs` on the fresh `dist/`: "bundle clean: 4 files scanned", exit 0 (default output only; before the cutover it reported proxy-key-name, proxy-secret and proxy-url). Plan 42-05 still owns the formal run.
- `git ls-files llm-proxy client` prints 0 lines; `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` stayed unstaged.
- Not run here: the manual visual checks (per-route line, no indicator for combat narration, narrow-width wrap of the longest line). They need real LLM jobs and ride with the deferred live proof (/gsd-verify-work).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Ignored llm-proxy leftovers became visible as untracked**
- **Found during:** Task 2
- **Issue:** The ignore rules for `.dev.vars`, `.wrangler/`, `node_modules/` and `dist/` lived in the tracked `llm-proxy/.gitignore`. After `git rm` removed it, `git status` listed `llm-proxy/.dev.vars` and the `.wrangler` files as untracked, which risked an accidental commit of a secrets file by a later `git add`.
- **Fix:** Added `/llm-proxy/` to `.git/info/exclude` (local only, no tracked file changed). Nothing inside `llm-proxy/` was read, listed or deleted; I only saw the path names git reported.
- **Commit:** none (local git config); recorded here.

**2. [Scope note] Line endings**
- `NarrativeConsole.vue` uses CRLF; edits preserved it (diff stats stay small). `App.vue` triggers git's LF-to-CRLF normalization warning as before.

## Known Stubs

None.

## Threat model

- T-42-15 (proxy env vars in the bundle): proxy composable deleted; static scan forbids the env var names and whole-object `import.meta.env`; bundle guard on the fresh build is clean.
- T-42-16 (other players' job rows): the client subscribes only to the per-sender `my_llm_jobs` view and maps id, route, status and createdAt only.
- T-42-17 (client calling the result reducer or proxy): composable deleted, static scan, reducer already removed server-side (42-03).
- T-42-18 (deployed Worker with a live OpenAI key): transferred to the user checklist in 42-07; wrangler was never run.
- T-42-19 (input stuck locked): only creation and world-gen state rows lock; the indicator never feeds the lock.
- T-42-SC: no packages installed.

## Threat Flags

None.

## Notes for later plans

- `llm-proxy/` still exists on disk with ignored or untracked leftovers only (including `.dev.vars`); none of it was read or listed. The user deletes the folder after revoking the key and deleting the Worker (42-07 checklist). It is hidden from `git status` by the local `.git/info/exclude` entry; remove that entry when the folder is deleted.
- `src/module_bindings` still contains the removed reducers (`submit_llm_result`, `validate_llm_request`, `purge_llm_tasks`); Plan 42-05 regenerates it after publish 1. The client no longer calls any of them.
- The user removes the `VITE_LLM_PROXY_*` lines from `.env.local` (not edited here).

## Self-Check: PASSED

- Files exist: `src/legacyLlmRemoval.test.ts`; `src/composables/useLlmProxy.ts`, `llm-proxy/src/index.ts`, `llm-proxy/wrangler.toml` and `client/` do not.
- Commits found in git log: dc2effed, 73504aa3, f6aecaff.
