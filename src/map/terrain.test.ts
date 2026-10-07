import { describe, expect, it } from 'vitest';
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
import { TERRAIN_LEGEND, terrainOf } from './terrain';

describe('TERRAIN_LEGEND', () => {
  it('lists the eight legend terrains in UI-SPEC order with their words and icons', () => {
    expect(TERRAIN_LEGEND.map((t) => t.key)).toEqual([
      'town',
      'city',
      'dungeon',
      'woods',
      'plains',
      'mountains',
      'swamp',
      'uncharted',
    ]);
    expect(TERRAIN_LEGEND.map((t) => t.word)).toEqual([
      'Town',
      'City',
      'Dungeon',
      'Woods',
      'Plains',
      'Mountains',
      'Swamp',
      'Uncharted',
    ]);
    expect(TERRAIN_LEGEND.map((t) => t.icon)).toEqual([
      PhHouseLine,
      PhBuildings,
      PhSkull,
      PhTreeEvergreen,
      PhPlant,
      PhMountains,
      PhWaves,
      PhQuestion,
    ]);
  });
});

describe('terrainOf', () => {
  it('finds every legend terrain', () => {
    for (const entry of TERRAIN_LEGEND) expect(terrainOf(entry.key)).toBe(entry);
  });

  it('reads an explored edge that has not collapsed yet as Passage', () => {
    expect(terrainOf('passage')).toMatchObject({ word: 'Passage', icon: PhDoorOpen });
  });

  it('falls back to a map pin with the capitalised server value', () => {
    expect(terrainOf('volcano')).toMatchObject({ word: 'Volcano', icon: PhMapPin });
    expect(terrainOf('')).toMatchObject({ word: 'Place', icon: PhMapPin });
  });

  it('ignores inherited keys (T-51-08)', () => {
    expect(terrainOf('constructor').icon).toBe(PhMapPin);
    expect(terrainOf('__proto__').icon).toBe(PhMapPin);
    expect(terrainOf('toString').icon).toBe(PhMapPin);
  });
});
