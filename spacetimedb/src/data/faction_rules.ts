// faction_rules.ts
// Mechanical rules extracted from legacy faction_data.ts.
// Contains faction relationship structure and type vocabulary.
// All specific faction data (names, descriptions) are discarded -- factions are generated through play.
// The faction tier rule at the bottom imports only ./mechanical_vocabulary.
import { FACTION_STANDING_THRESHOLDS } from './mechanical_vocabulary';

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

// ---------------------------------------------------------------------------
// FACTION TIER -- one rule for the Stats screen and the /faction command
// ---------------------------------------------------------------------------
// Positive thresholds are reached with >=, negative thresholds with <=, and everything between
// the first negative and first positive threshold is Neutral. Thresholds come from
// FACTION_STANDING_THRESHOLDS. Imports only ./mechanical_vocabulary (itself import-free) so the
// client can reach it through @game-data. Browser-safe, ES2020 only, never throws.

export type FactionTierKey =
  | 'hated'
  | 'hostile'
  | 'unfriendly'
  | 'neutral'
  | 'friendly'
  | 'honored'
  | 'revered'
  | 'exalted';

/** Tier labels from lowest to highest standing. */
export const FACTION_TIER_LABELS: readonly string[] = [
  'Hated',
  'Hostile',
  'Unfriendly',
  'Neutral',
  'Friendly',
  'Honored',
  'Revered',
  'Exalted',
];

function tier(key: FactionTierKey): { key: FactionTierKey; label: string } {
  return { key, label: key.charAt(0).toUpperCase() + key.slice(1) };
}

export function factionTier(standing: bigint): { key: FactionTierKey; label: string } {
  const t = FACTION_STANDING_THRESHOLDS;
  if (standing >= t.exalted) return tier('exalted');
  if (standing >= t.revered) return tier('revered');
  if (standing >= t.honored) return tier('honored');
  if (standing >= t.friendly) return tier('friendly');
  if (standing <= t.hated) return tier('hated');
  if (standing <= t.hostile) return tier('hostile');
  if (standing <= t.unfriendly) return tier('unfriendly');
  return tier('neutral');
}
