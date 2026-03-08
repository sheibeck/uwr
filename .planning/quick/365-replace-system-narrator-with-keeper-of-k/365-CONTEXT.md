# Quick Task 365: Replace system narrator with Keeper of Knowledge - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Task Boundary

Replace all "System" narrator identity with two distinct entities:
- **The World** — environmental/ambient actions (watching, waiting, settling in, breathing)
- **The Keeper of Knowledge** — sardonic narrator who comments, guides, and helps players

Also fix LLM world generation prompts to avoid repetitive naming patterns (Verge, Veil, Ashen, etc.)

</domain>

<decisions>
## Implementation Decisions

### Narrator Identity Split
- "The System settles in to watch" → "The World" doing something (ambient)
- Sardonic narrator commentary → "The Keeper of Knowledge" (guides/comments)
- Same sardonic tone as before, just the identity changes
- NARRATOR_PREAMBLE: rename from "The System" to "The Keeper of Knowledge"
- Environmental messages use "The World" (e.g. "The world grows still around you")
- Commentary/guidance messages use "The Keeper" (e.g. "The Keeper of Knowledge notes...")

### Location Naming Diversity
- Fix LLM prompts to explicitly discourage repetitive naming patterns
- Add negative examples (avoid Verge, Veil, Ashen, Dusk, Shadow, etc. overuse)
- Encourage diverse naming conventions: geographic features, cultural references, historical events, flora/fauna
- Seeded locations are legacy remnants but NOT being removed in this task (separate effort)

### Event Kind
- Claude's Discretion — keep internal `kind='system'` as technical identifier (players don't see it)

</decisions>

<specifics>
## Specific Ideas

- User explicitly wants players to never feel there is a "system" — only "the world"
- The Keeper of Knowledge is an in-world entity, not a meta-system
- World generation prompt should instruct LLM to vary naming across different linguistic roots, terrains, and cultural influences
</specifics>
