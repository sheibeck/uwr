// faction_rules.ts
// Mechanical rules extracted from legacy faction_data.ts.
// Contains faction relationship structure and type vocabulary.
// All specific faction data (names, descriptions) are discarded -- factions are generated through play.

// ---------------------------------------------------------------------------
// FACTION RELATIONSHIP STRUCTURE
// ---------------------------------------------------------------------------
// Factions have a rivalFactionId field that creates paired rival relationships.
// Each faction has exactly one rival (bidirectional).
// Rival relationships affect:
// - Standing gains/losses (killing members of rival grants standing with the other)
// - NPC dialogue and quest availability
// - Regional territory control

// ---------------------------------------------------------------------------
// FACTION TYPE VOCABULARY
// ---------------------------------------------------------------------------
// Factions can be categorized by their archetype for generation purposes.
export const FACTION_ARCHETYPES = [
  'military',     // organized martial forces
  'nature',       // druids, herbalists, wilderness defenders
  'arcane',       // scholars, mages, secret societies
  'mercenary',    // unaligned guilds, rogues, adventurers
] as const;

export type FactionArchetype = typeof FACTION_ARCHETYPES[number];
