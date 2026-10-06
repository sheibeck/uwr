---
phase: 47-console-rails-hotbar-and-input
plan: 09
subsystem: client-console-input
tags: [vue, input, console, reducers, queue]
requires: ["47-01", "47-03", "47-04", "47-06", "47-07"]
provides:
  - "createConsole: routing execution, echoes, info commands, narrative queue, conversation, keyword and rail actions, automatic look"
  - "INPUT_MAX_CHARS (parity-tested mirror of PLAYER_INPUT_MAX_CHARS)"
  - "Composer: input, Send action, history keys, conversation chip, offline state"
  - "FeedShell composer section; AppFrame provides CONSOLE_KEY"
affects: [47-10, 47-11, 47-12]
tech-stack:
  added: []
  patterns: ["reducer calls through typed thunks (fire(name, r => r.x({...})))", "queue release by watcher, one line at a time", "plain-object injection with a computed v-model"]
key-files:
  created:
    - src/console/useConsole.ts
    - src/console/useConsole.test.ts
    - src/input/limits.ts
    - src/input/Composer.vue
    - src/input/Composer.test.ts
    - src/frame/AppFrame.console.test.ts
  modified:
    - src/frame/FeedShell.vue
    - src/frame/AppFrame.vue
key-decisions:
  - "Reducer calls go through a typed thunk helper (r.submitIntent({ characterId, text })); only the routed reducer command uses a name lookup, with one cast. Every argument name was checked against src/module_bindings."
  - "A hail whose narrative send is refused (queue full) does not start the conversation; the text stays in the input."
  - "The automatic look tracks the last character id it looked for and resets it when the id goes null, so a reconnect never repeats it but a new character (or the same one after the feed was cleared) gets one."
  - "prefill is guarded offline like the other actions (the input is disabled then, and the draft is kept)."
  - "The conversation clears on a location change and when the NPC leaves npcsHere (watching npcsHere only, so hailing an NPC is not undone before the list changes)."
requirements-completed: [INP-01, INP-02, CON-02, CON-06]
status: complete
duration: 45min
completed: 2026-10-05
---

# Phase 47 Plan 09: Console controller and composer Summary

Typing now works end to end: sentences reach `submit_intent`, exact and slash forms run their command reducers, info commands print into the feed, narrative lines queue (max 3, one at a time) while the Keeper works, keywords and rail actions hail, travel, examine, gather, invite and pre-fill whispers, and one automatic `look` is sent when the frame opens.

## What was built
- **`src/console/useConsole.ts`** (`createConsole`): executes the `routeInput` descriptor and nothing else (T-47-03). Reducer commands send `{ characterId, ...args }` with the active character id only; failures log `console.warn('[console]', ...)` and add no client copy. Echo rules follow research: echo for intents, reducer commands, info commands, rail and keyword actions; none for the automatic look, `talk_to_npc`, whisper, group chat, say or `submit_command`. Info commands (`renown`, `factions`, `faction <name>`, `events`, bare `group`) append a local `look` block from subscribed data after the echo. Narrative queue: a send queues while a gating job is active, a narrative send is in flight, or lines are waiting; the fourth is refused with the System line and the draft kept. One watcher releases one line when the gate is clear and nothing is in flight; the route (talk or intent) is chosen at release (talk goes to `talk_to_npc` and drops its Queued echo while the NPC is here, else `submit_intent` with the suffix removed). A lost connection empties the queue, clears each Queued suffix and adds the System line once; a character change or dispose drops silently. Conversation clears on farewell, game action, travel, location change, the NPC leaving and `endConversation()`.
- **`src/input/limits.ts`**: `INPUT_MAX_CHARS = 1000`.
- **`src/input/Composer.vue`**: input (aria-label, placeholder states, `maxlength`, IME-safe Enter, Up/Down recall with caret at the end, Esc blurs), Send (desktop text button, mobile 44px icon button, both `aria-label="Send action"`), conversation chip with end button (mobile 44px with `margin-block: calc((32px - 44px) / 2)`), `focusTick` focus, desktop focus on mount, document Enter focus when nothing is focused and no screen is open.
- **`FeedShell.vue`**: `section.composer` under the feed (hotbar goes at its top in 47-11). **`AppFrame.vue`**: `createConsole({ game, frame })` provided as `CONSOLE_KEY`, disposed on unmount.

## Verification
- `pnpm exec vitest run --dir src --maxWorkers=2`: 69 files, 1228 tests pass (was 1159; 69 new: useConsole 45, Composer 21, AppFrame console 3).
- `pnpm exec vue-tsc -b`: exits 0. `pnpm build`: passes, "bundle clean: 4 files scanned".
- `git status --porcelain spacetimedb src/module_bindings`: empty. Nothing published, no server touched, no push.
- Design guards (`src/styles`) pass over the new `.vue` file.

## Existing Phase 45 assertions changed
None. All Phase 45 shell, frame and App tests pass unchanged (the composer mounts with inert defaults).

## Deviations from Plan
**1. Process:** Tasks 1 and 2 share one file and were implemented and tested together, so they are one commit (44149aaf) rather than two; Task 3 is its own commit (afdec77e). Tests and implementation were committed together (no separate RED/GREEN), as in earlier 47 plans. The plan type is `execute`, so no TDD gate section applies.

**2. [Rule 1 - Test bug] Own test used a non-action line.** The first draft of the conversation test used `look around` as a game action; the router (47-01) treats only bare `look` and `look at X` as actions, so the test now uses `look`. No code change.

**3. Added beyond the plan:** `src/frame/AppFrame.console.test.ts` covers the AppFrame provide and dispose (the plan listed the wiring but no test file for it).

## Threat model
- T-47-03 mitigated: dispatch follows the descriptor only; the four roadmap sentences are asserted to call `submitIntent` and none of the group, whisper or command reducers.
- T-47-16 mitigated: queue capped at 3, one in flight; tested (fourth refused, one release per settle, gate closing again holds the next line).
- T-47-01c mitigated: echoes are plain strings rendered by FeedLine interpolation; the composer keeps a markup draft as an input value and renders NPC names as text (img-onerror tests).
- T-47-05 and T-47-07 accepted as planned.
- CON-06 transparency prohibition: a dropped queue always announces itself (disconnect), or is a character switch / dispose where the feed is cleared or the frame is gone.
- INP-01 prohibition: no social or group reducer runs unless `routeInput` returned that exact descriptor.

## Known Stubs
None. `ConsoleApi` is fully implemented; the FeedView keyword clicks now reach the real console.

## Threat Flags
None.

## Flagged assumptions
- Research A7 not adopted: no repeat look after reconnect.
- iOS focus zoom (UI-SPEC A9): input stays 14px, viewport meta has no maximum-scale; on the owner try-out list (47-12 Task 4).
- A sentence typed in a conversation that is not a farewell or game action goes to the NPC; `hail X` for an NPC not in `npcsHere` still sends the intent (the server answers) and sets the chip until the next `npcsHere` change.

## Deferred owner verification
No checkpoint tasks in this plan. Not exercised against a live server (owner constraint) and not covered by happy-dom layout:
- Type `Who is that over there?`: it is answered by the Keeper, not a command; `who`, `/who`, `invite Bob` run commands.
- While the Keeper works: type three lines (each shows Queued and releases in order), a fourth is refused with the System line and stays in the input.
- Drop the connection with queued lines: the System line appears and the lines lose Queued.
- Click an NPC keyword: chip `Talking with {Name}`, free text goes to the NPC, travelling or the end button ends it.
- Mobile: the input is 14px, so iOS Safari zooms on focus (accepted for now); the chip end button (44px) does not enlarge the 32px chip row.
- Desktop: the composer input lines up with the feed lines at 1280px and 900px.

## Commits
- 44149aaf feat(47-09): console controller with routing, echoes, queue, conversation and actions
- afdec77e feat(47-09): composer under the feed and console provided by AppFrame

## Self-Check: PASSED
