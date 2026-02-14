# Phase 10: Travel & Movement Costs - Context

**Created:** 2026-02-14
**Source:** User discussion during planning

---

## Decisions (LOCKED)

### Travel Cost Model

**Within-Region Travel:**
- Cost: 5 stamina per character
- Every character in the group pays 5 stamina
- No cooldown
- No distance calculation

**Cross-Region Travel:**
- Cost: 10 stamina per character
- Every character in the group pays 10 stamina
- Applies a 5-minute cooldown per character before they can travel to another region again
- Cooldown is character-specific (not group-wide)

### Group Travel Validation

**All-or-Nothing Rule:**
- ALL group members must have enough stamina to travel
- If ANY group member lacks stamina, the entire group move fails
- Error message format: "[CharacterName] does not have enough stamina to travel"
- This message is shown to the entire group

**Example Scenarios:**
- 3-person group traveling within region: all 3 must have 5+ stamina, or move fails
- 2-person group traveling to new region: both must have 10+ stamina, or move fails
- If Bob has 4 stamina and tries to travel within region, group gets: "Bob does not have enough stamina to travel"

### What NOT to Include

- ❌ No BFS distance calculation
- ❌ No gold costs
- ❌ No distance-based scaling (e.g., "per step" costs)
- ❌ No "leader pays, followers free" pattern
- ❌ No bind stone travel (separate future feature)

---

## Claude's Discretion

### Implementation Details
- How to determine if travel crosses regions (compare fromLocation.regionId vs toLocation.regionId)
- Table structure for region travel cooldown
- UI layout for displaying region cooldown countdown
- How to communicate region boundaries to players (visual indicators, etc.)
- Whether to clean up expired cooldowns opportunistically or via scheduled reducer

### UI/UX Choices
- Exact wording of stamina cost display ("5 stamina" vs "5 sta" vs stamina icon)
- Color scheme for cost indicators
- Position of cooldown countdown in UI
- How to show "other region" vs "same region" visually
- Travel button states (disabled, enabled, on cooldown)

---

## Deferred Ideas

- Bind stone / hearthstone travel mechanics
- Mount system or travel speed bonuses
- Region-specific travel modifiers (hazardous regions, safe zones)
- Fast travel waypoints
- Guild halls or player housing as travel destinations
- Party leader override to force travel (kicking members who can't afford)

---

## Open Questions

None - all core mechanics locked by user decisions above.
