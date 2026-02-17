# Phase 18: World Events System Expansion - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

A persistent world event lifecycle system where server-wide and regional events fire (admin-triggered or threshold-triggered), players participate using event-exclusive spawned content, and resolved events leave permanent marks on the world state (the "Ripple" system). Events have self-contained objectives, success and failure paths, and contribution-scaled rewards.

</domain>

<decisions>
## Implementation Decisions

### Event Notification
- Notification on event fire: **log entry + brief banner overlay** (banner dismisses after a few seconds, log entry persists)
- Same full notification for ripple-consequence events (any new event, however it was triggered)

### WorldEventPanel
- **Dedicated action bar button** with a badge/highlight when at least one event is active
- Panel has **two sections**: Active (currently ongoing events) and History (resolved events, permanent record)
- Active event cards show: event name, region, objective progress bar, rewards preview
- Resolved events in history show: event name, outcome (success/fail), consequence that triggered, when it resolved

### World Events Are Self-Contained Experiences
- World events spawn their **own exclusive content** — enemies, items, quest objectives — that only exists while the event is active
- This content is entirely separate from NPC quests and the normal world
- On event resolution: event-specific spawns **linger briefly (~2 minutes) then despawn**
- Event content types: kill objectives (event-specific enemies), item collection (event-specific droppables), exploration objectives, protect objectives (friendly NPCs players must defend from event enemies)

### Joining & Participation
- Participation is **automatic on region entry** — any character in the region while the event is active is registered
- However, **rewards only land if the player interacted with at least one piece of event content** (killed an event enemy, picked up an event item, completed an event objective, etc.)
- Zero-contribution presence = no reward

### Contribution Tiers (Bronze / Silver / Gold)
- Contribution is tracked as a count of meaningful event interactions
- Tiered thresholds determine reward level — thresholds are configurable per event:
  - **Bronze** — minimum engagement (e.g. 1–9 contributions) → small reward
  - **Silver** — moderate engagement → medium reward
  - **Gold** — high engagement → full reward
- Rewards are fixed per tier (not proportional to exact count), keeping it accessible for casual contributors while rewarding dedicated ones

### Reward Types & Timing
- Rewards fire **immediately on event resolution**
- All four reward types apply: **overall renown, faction standing, gold, and special event loot (items)**
- **Success pays more than failure** — participants who were in a failing event get a consolation reward (for trying), but the full reward pool is only available on success
- Reward amounts per tier are specified in the event data constants

### The "Ripple" System — World Consequences, Not Geographic Cascade
- **"Ripple" does NOT mean the event spreads geographically to neighboring regions**
- "Ripple" means: when an event resolves (success or failure), it **permanently changes world state**
- Consequence types (extensible — new types added over time):
  - **Race/class/zone unlock** — resolving the event permanently opens locked content (e.g. Hollowed race becomes playable)
  - **Enemy composition change** — the types of enemies spawning in a region shift permanently
  - **NPC quest/dialogue unlock** — NPCs gain new dialogue branches or quest chains post-event
  - **Faction standing bonus** — server-wide standing award for all participants as historical recognition
  - **System unlock** — resolving an event can unlock an entire game mechanic that was previously unavailable
- Every event has both a **success consequence** AND a **failure consequence**
- Failure consequences darken the world (harder enemies, grimmer atmosphere, hostile faction gains power) but must **never make the game unplayable**
- One-time events are **locked out permanently** once resolved (success or failure) — the same event cannot fire again
- Recurring events must be **explicitly flagged** as recurring in event data; they are rare by design

### Event Failure Conditions
- Failure condition is **flexible per event type**:
  - **Time-based**: objective not completed within the event's duration → event fails
  - **Threshold-based (two-sided race)**: two counters compete — e.g. "enemies kill X villagers before players save Y" → whichever threshold is hit first determines outcome
- The data model for events should support both failure condition types

### Claude's Discretion
- Exact Bronze/Silver/Gold contribution thresholds per event (specified per event in data constants)
- How event-specific enemies are seeded and tracked (separate table or flag on existing tables)
- How the banner overlay is styled and dismissed (duration, animation)
- How the History section is structured in the WorldEventPanel (ordering, pagination if needed)
- Admin identity guard implementation pattern

</decisions>

<specifics>
## Specific Ideas

- **Villager protection events**: Friendly NPC "villagers" spawn during the event. Players must defeat event-enemies before those enemies kill the villagers. Event succeeds if enough villagers survive, fails if too many die. This is an example of the two-sided threshold failure model.
- **Failure darkens the world**: Failing events should make things grimmer — uglier new creatures, faction power shifts — but the world remains playable. Think "the world got harder" not "the world is now broken."
- **Event history as world lore**: The resolved events panel becomes a narrative record of the server's history — what happened, who won, what changed. Design with this storytelling angle in mind.

</specifics>

<deferred>
## Deferred Ideas

- None raised — discussion stayed within phase scope.

</deferred>

---

*Phase: 18-world-events-system-expansion*
*Context gathered: 2026-02-17*
