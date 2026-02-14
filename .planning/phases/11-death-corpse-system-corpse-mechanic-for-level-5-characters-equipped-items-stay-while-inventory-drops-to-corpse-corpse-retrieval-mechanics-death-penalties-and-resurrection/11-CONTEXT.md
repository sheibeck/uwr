# Phase 11: Death & Corpse System - Context

**Created:** 2026-02-14
**Source:** User discussion before execution

---

## Decisions (LOCKED)

### Corpse Creation Rules

**Level Gating:**
- Level 5+ characters create corpses on death
- Level 1-4 characters respawn normally with no corpse (no penalty)

**What Drops:**
- Equipped items: STAY on character (no loss)
- Inventory items: DROP to corpse
- Gold: STAYS on character (never drops)

**Multiple Corpses:**
- Players can have multiple corpses across different locations
- If you die in a location where you already have a corpse, combine both corpses into one
- Each corpse has independent 30-day decay timer
- Fully looted corpse disappears immediately

### Respawn Behavior

**No Ghost Mechanics:**
- ❌ No isGhost field
- ❌ No ghost walk
- ❌ No ghost UI/banner
- ❌ No ghost restrictions

**Simple Death Flow:**
1. Character dies in combat
2. Corpse created at death location (level 5+ only)
3. Character respawns at bind point (boundLocationId)
4. Corpse remains at death location

### Corpse Visibility & Looting

**Visibility:**
- Corpses visible to all players at the location
- Only visible if corpse owner is currently logged in
- Display format: "<CharacterName>'s corpse"

**Looting:**
- Only the owner can loot their own corpse
- Right-click context menu: "Loot Corpse"
- Retrieve items one-by-one or batch retrieve
- Fully looted corpse disappears (no empty corpse remains)

**Location Panel:**
- Add "Points of Interest" section to Location panel
- Corpses listed in this section
- Show corpse owner name and item count (optional)

### Resurrection Mechanics

**Target: Corpse (not character)**

**Flow:**
1. Cleric uses Resurrect ability
2. Cleric **targets the corpse** (not the dead player)
3. Dead player receives prompt: "Do you want to be resurrected?"
   - Yes → Cleric continues casting (cast time: ~6 seconds)
   - No → Cast cancelled, mana not consumed
4. On cast completion:
   - Dead character **teleports to corpse location**
   - Character restored to 50% HP/mana
   - Corpse remains (player must loot it separately)
5. Player loots their corpse to retrieve items

**Resurrection Requirements:**
- Cleric must be at same location as corpse
- Corpse must exist (can't resurrect if already looted/decayed)
- Target must confirm acceptance

### Corpse Summon Mechanics

**Target: Character (who has corpses)**

**Flow:**
1. Caster uses Corpse Summon ability
2. Caster **targets a character** (who has one or more corpses)
3. Target receives prompt: "Do you want your corpses summoned?"
   - Yes → Caster continues casting (cast time: ~8-10 seconds)
   - No → Cast cancelled, mana not consumed
4. On cast completion:
   - **ALL corpses from ALL locations** belonging to target are summoned
   - Corpses **merge into ONE corpse** at caster's location
   - Combined corpse contains all items from all merged corpses
5. Player can loot the combined corpse

**Corpse Summon Requirements:**
- Target must have at least one corpse
- Caster can be at any location (no proximity requirement)
- Target must confirm acceptance

### Corpse Decay

**30-Day Timer:**
- Each corpse has independent createdAt timestamp
- After 30 days (30 * 24 * 60 * 60 * 1_000_000 microseconds), corpse auto-deletes
- Items in decayed corpse are lost permanently
- Decay timer does NOT pause if player logs out

**Cleanup:**
- Scheduled reducer or opportunistic cleanup on login/location change
- No warnings before decay (player responsibility to retrieve)

---

## Claude's Discretion

### Implementation Details

**Table Structure:**
- How to structure Corpse table (id, characterId, locationId, createdAt, decayAt?)
- How to structure CorpseItem table (id, corpseId, itemInstanceId)
- Indexes for efficient lookups (by_character, by_location)

**Combining Corpses:**
- How to merge two corpses in same location (delete one, transfer items, keep newer?)
- Whether to update createdAt when combining (recommend: keep oldest timestamp)

**Resurrection Prompt:**
- UI implementation (modal, toast, in-game prompt?)
- Timeout duration if no response (recommend: 30 seconds auto-decline)

**Corpse Summon Prompt:**
- UI implementation
- Timeout duration

**Points of Interest UI:**
- Section ordering in Location panel
- Icon/styling for corpse entries
- Whether to show item count or just presence

**Decay Cleanup:**
- Scheduled reducer vs opportunistic cleanup
- Cleanup frequency (daily? on login?)

### Technical Choices

**Visibility Filtering:**
- How to check if corpse owner is online (Player.status == 'active'?)
- Client-side vs server-side filtering

**Teleportation:**
- Use existing move_character reducer or separate resurrect teleport?
- Group handling if resurrected player is in a group

**Confirmation System:**
- New table for pending actions (PendingResurrect, PendingCorpseSummon)?
- Timeout handling and cleanup

---

## Deferred Ideas

- Corpse waypoint markers on world map
- "Nearest corpse" indicator
- Corpse insurance items (prevent decay)
- Mass loot button (loot entire corpse at once)
- Corpse naming/tagging
- Soulbound items (stay on character even if unequipped)
- Different decay timers based on item quality
- Notification when corpse is about to decay

---

## Open Questions

None - all core mechanics locked by user decisions above.
