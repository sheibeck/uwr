# Phase 44: Live Verification and Tone Eval - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Every domain is proven working with real Claude, every failure class produces the right player-facing behavior, and the owner signs off on the Keeper's tone.

In scope:
- A golden set of about 25 prompts, 5 of them adversarial, checked with mechanical assertions.
- End-to-end local verification of every domain, with per-route latency percentiles recorded.
- Reconciliation of recorded token totals against the Anthropic Console.
- Failure drills: truncation, refusal, 401, 429, 529, spend cap and timeout.
- The streaming decision, recorded in PROJECT.md.

Requirements: QUAL-01, QUAL-02, QUAL-03. Depends on Phase 43 (tuned routes, kill switch and `/llm stats`).

</domain>

<decisions>
## Implementation Decisions

### Golden set and tone sign-off (QUAL-01)
- **The prompts:** Claude drafts about 25, weighted by route:
  - NPC chat 6
  - creation 5
  - world gen 4
  - skills 3
  - renown 2
  - combat narration 2
  - plus 5 adversarial prompts that inject through a name, a description or NPC speech
  
  The user reviews the list before any live call.
- **Tone review:** a private review page (an Artifact) shows each live output next to its prompt, with a pass/fail toggle and a comment per item, and one overall approve. The user's approval is the QUAL-01 sign-off.
- **Live runs:** one approved live run, about $1–2. After fixes, only the failed items are re-run. Every live run is gated on operator approval. The golden-set harness also runs offline against recorded or mocked responses in the normal suite.
- **Mechanical assertions:**
  - The output schema is valid.
  - Ranges and budgets are respected.
  - Injection did not break the Keeper's voice, and refusals are in-voice.
  - The in-game pronoun rule holds:
    - An NPC's he/she matches their stored gender.
    - The Keeper is always "he".
    - The player's own character is always "you".
    - Beasts may be "it".
    
    Automated checks flag violations.

### Failure drills and reconciliation (QUAL-02, QUAL-03)
- **Unit drills for all 7 classes:** truncation, refusal, 401, 429, 529, spend cap and timeout. Each is an automated test over the mock procedure context and asserts:
  - an in-voice message
  - the lock released
  - the budget refunded
  - no unwanted auto-retry
- **Live confirmation (local)** covers the four drills that are safe to induce:
  - 401: set a bad key, then restore the real one with `scripts/llm/set-key.mjs`
  - spend cap: lower the global ceiling to about $0.01, then restore it
  - the kill switch
  - timeout: a temporary tiny timeout
  
  429, 529, refusal and truncation stay unit-only.
- **Console reconciliation:** the user reads the token totals for the live-run window from the Anthropic Console and pastes them in. Claude compares them with the `llm_call_log` totals, and the check passes within ±2%.
- **Latency:** record p50/p95/p99 per route from the live runs, in the phase verification. `/llm stats` shows them as well.

### Streaming decision and maincloud
- **Streaming:** the "out of scope" decision stands unless the measured NPC-chat p95 is over about 6 s. If it is, record streaming in PROJECT.md as a candidate for the next milestone, with the numbers. Nothing is built in v2.2.
- **Maincloud leg of QUAL-02:** Claude writes a checklist (user publish, key script with `--target maincloud --confirm-maincloud`, smoke test, one call per domain) and records the results the user pastes back. If the user defers, the phase closes as `human_needed` with the deferral recorded. Claude never publishes to or calls maincloud.

### Claude's Discretion
- The golden-set file format and harness structure. It should extend the Phase 41 and 43 live harness.
- The review page design.
- The exact adversarial payloads. Draw them from the Keeper Bible's player-input section and the Phase 40 injection tests.

### UI design contract: skipped
- No UI-SPEC for this phase (`--skip-ui`). The UI gate flags it as frontend, but the phase adds no game screen. Its only page is the private tone-review Artifact. This follows the user's rule to skip UI-SPECs before the UX overhaul (backlog 999.6). Recorded 2026-10-04.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- The live-proof harness from Phase 41 (41-15 and 41-16) and the effort-sweep harness from Phase 43.
- The Phase 40 injection tests and the `<player_input>` escaping in `data/llm_layers.ts`.
- `llm_call_log` (usage counts, latency, cost), `/llm stats` and `admin_llm_status`.
- `scripts/llm/set-key.mjs` and `docs/runbooks/llm-key.md` for the key.
- The mock procedure context (`createMockProcCtx`) for offline drills.

### Established Patterns
- Live calls run locally only. Spend is capped by a ledger or ceiling, and each run gets operator approval.
- The Keeper's failure lines come from `helpers/llm_status.ts` and `applyLlmFailure`.

### Integration Points
- The per-domain entry points are `talk_to_npc`, creation `submit_creation_input`, the world-gen explore trigger, `apply_level_up` / `request_skill_offer`, renown rank-up and the combat victory/defeat outro.

</code_context>

<specifics>
## Specific Ideas

- **In-game pronoun rule (user, 2026-09-30):** the Keeper is male (he/his); every NPC or humanoid person is male or female; the player's own character is always "you"; beasts may be "it".
- Maincloud actions are always the user's. There are no pushes to master.

</specifics>

<deferred>
## Deferred Ideas

- Streaming NPC replies. It is a candidate for the next milestone only if measured NPC-chat p95 is over about 6 s.

</deferred>
