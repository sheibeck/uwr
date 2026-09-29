# Phase 8: Narrative Tone Rollout - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Apply Shadeslinger narrative tone consistently across all LLM-generated content (quest text, event consequences, NPC dialogue) and all existing hardcoded strings (combat log messages, system/failure messages, quest/NPC dialogue seeds). This phase finalizes the system prompt, fallback content pool, loading state copy, and audits/rewrites hardcoded strings throughout the backend. Depends on Phase 5 (LLM pipeline) being implemented.

</domain>

<decisions>
## Implementation Decisions

### System Prompt Design
- **Tone anchor:** "A smart, self-aware fantasy voice that blends genuine stakes, sharp character-driven humor, and conversational modern language within a world that treats every choice as meaningful."
- **Examples:** 3–5 tight worked examples in the system prompt — focused, not exhaustive
- **Anti-patterns:** Do NOT include negative examples in the prompt; rely on positive examples only (priming bad patterns is a risk)
- **Prompt architecture:** One shared system prompt for tone; per-call user message provides content-type-specific instructions (output format, length expectations, what to generate)

### Fallback Content
- **Authorship:** Claude generates the fallback pool during the implementation phase (not written manually by developer)
- **Pool size:** 5–7 fallbacks per content type
- **Context-awareness:** Fallbacks use template substitution with placeholders (e.g. `{targetName}`, `{locationName}`) — context-aware, not fully generic
- **Visibility:** Completely invisible to the player — fallback content looks identical to LLM output; no UI indicator

### Hardcoded String Audit
- **Categories in scope:** Combat event log messages, system/failure messages, quest/NPC dialogue strings
- **UI labels excluded:** Panel headers, button labels, status indicators are out of scope
- **Rewrite bar:** High — any string that is generic or neutral gets updated. Zero sterile game-copy. Full audit, not a sample.
- **Ability names:** Keep exact (e.g. "Shadow Cut" always stays "Shadow Cut"); vary the surrounding narration, not the mechanic names

### Loading State Copy
- **Register:** In-world flavor — the narrator "preparing" the scene (e.g. "The fates are consulting their notes...")
- **Variety:** Rotate through 3–5 in-tone lines per content type; each generation can show a different line
- **Visual:** Text only — no spinner, dots, or animation; the copy does the work
- **Timeout behavior:** If generation takes too long and fallback kicks in, show a brief in-tone message first — the feel is the world eagerly awaiting the character's actions, so the message should be something like "The world hesitates..." before the fallback appears

### Claude's Discretion
- Exact wording of the 3–5 system prompt examples
- Specific fallback strings (Claude writes them; they must pass the same tone bar as LLM output)
- The exact "world hesitates" phrasing for the timeout transition message
- Specific loading lines per content type (quest loading vs. event loading vs. NPC greeting loading)
- Timeout threshold duration before fallback kicks in

</decisions>

<specifics>
## Specific Ideas

- The world is portrayed as eagerly awaiting to see what the character does next — tension and anticipation, not detachment
- Loading timeout message register: "The world hesitates..." — sense of the world holding its breath, not a system error
- Examples given by user: `"Congratulations. You've achieved the bare minimum. The guild acknowledges your existence."` — self-aware, dry, never cruel, treats the player as capable
- Tone is NOT full sarcasm — it has genuine stakes. The humor is warm and character-driven, not cynical.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-narrative-tone-rollout*
*Context gathered: 2026-02-18*
