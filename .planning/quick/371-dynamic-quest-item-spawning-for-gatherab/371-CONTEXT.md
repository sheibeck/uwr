# Quick Task 371: Dynamic Quest Item Spawning for Gatherables - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Task Boundary

Quest items like "cracked casks" from delivery quests aren't spawning as gatherables. The performPassiveSearch function only handles explore quests with a 40% discovery roll. Delivery quests never get their items created. Need dynamic quest item spawning so quest-required items appear at the correct location for players with active quests.

</domain>

<decisions>
## Implementation Decisions

### Quest Type Coverage
- Delivery + Explore quests should spawn gatherable quest items
- Kill/kill_loot quests get drops from enemies (no location gatherables needed)

### Spawn Reliability
- Quest items should ALWAYS be visible at the target location — no RNG discovery roll
- When a player arrives at the correct location with an active quest, items appear in LOOK output immediately
- Remove the 40% search chance for quest item discovery

### Location Targeting
- Use the quest's existing `targetLocationId` field to determine where items spawn
- No need for description parsing or new schema fields

### Claude's Discretion
- Implementation approach: whether to spawn QuestItem rows on quest accept vs. on location arrival
- How many items to spawn (match requiredCount from quest or always 1)

</decisions>

<specifics>
## Specific Ideas

- The "Casks to the Watchtower" quest is a delivery type with targetLocationId pointing to Gutterfall
- QuestItem table already exists with characterId, questTemplateId, locationId, name, discovered, looted fields
- buildLookOutput already renders discovered+unlooted QuestItems as gold [Loot ItemName] tags
- Key fix: create QuestItem rows with discovered=true for delivery/explore quests at the right location

</specifics>
