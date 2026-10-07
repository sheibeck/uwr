// Terrain words and icons for the Map (51-UI-SPEC icon table). The legend lists the eight
// generator terrains in UI-SPEC order; 'passage' is an explored edge that has not collapsed yet;
// any other server value falls back to a map pin with its own word.

import type { Component } from 'vue';
import {
  PhBuildings,
  PhDoorOpen,
  PhHouseLine,
  PhMapPin,
  PhMountains,
  PhPlant,
  PhQuestion,
  PhSkull,
  PhTreeEvergreen,
  PhWaves,
} from '@phosphor-icons/vue';

export interface TerrainInfo {
  key: string;
  word: string;
  icon: Component;
}

export const TERRAIN_LEGEND: readonly TerrainInfo[] = [
  { key: 'town', word: 'Town', icon: PhHouseLine },
  { key: 'city', word: 'City', icon: PhBuildings },
  { key: 'dungeon', word: 'Dungeon', icon: PhSkull },
  { key: 'woods', word: 'Woods', icon: PhTreeEvergreen },
  { key: 'plains', word: 'Plains', icon: PhPlant },
  { key: 'mountains', word: 'Mountains', icon: PhMountains },
  { key: 'swamp', word: 'Swamp', icon: PhWaves },
  { key: 'uncharted', word: 'Uncharted', icon: PhQuestion },
];

const PASSAGE: TerrainInfo = { key: 'passage', word: 'Passage', icon: PhDoorOpen };

const BY_KEY: Record<string, TerrainInfo> = {};
for (const entry of TERRAIN_LEGEND) BY_KEY[entry.key] = entry;
BY_KEY[PASSAGE.key] = PASSAGE;

/** Own keys only (T-51-08): 'constructor' or '__proto__' from the server falls back to the pin. */
export function terrainOf(terrainType: string): TerrainInfo {
  if (Object.prototype.hasOwnProperty.call(BY_KEY, terrainType)) return BY_KEY[terrainType];
  const word = terrainType.length === 0 ? 'Place' : terrainType.charAt(0).toUpperCase() + terrainType.slice(1);
  return { key: terrainType, word, icon: PhMapPin };
}
