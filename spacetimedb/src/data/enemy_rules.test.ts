/**
 * Quick 261008-ag8: the pure enemy level rules shared by the server and the client.
 * A spawn at a place no enemy type fits takes the place's target level; its stats follow the
 * world-gen formulas; a row from before the level column (0) reads as its type's level.
 */
import { describe, it, expect } from 'vitest';
import {
  enemyStatsForLevel,
  placeLevelBand,
  placeSpawnLevel,
  effectiveEnemyLevel,
  templateAtLevel,
} from './enemy_rules';

describe('enemyStatsForLevel', () => {
  it('follows the world-gen formulas for levels 1..10', () => {
    for (let n = 1; n <= 10; n += 1) {
      const L = BigInt(n);
      expect(enemyStatsForLevel(L)).toEqual({
        maxHp: L * 12n + 20n,
        baseDamage: L * 3n + 5n,
        armorClass: L * 2n + 2n,
        xpReward: L * 15n + 10n,
      });
    }
  });
});

describe('placeLevelBand', () => {
  it('is +-1 around the target when the place has an offset, else exactly the target', () => {
    expect(placeLevelBand(5n, 4n)).toEqual({ min: 4n, max: 6n });
    expect(placeLevelBand(1n, 2n)).toEqual({ min: 1n, max: 2n });
    expect(placeLevelBand(3n, 0n)).toEqual({ min: 3n, max: 3n });
  });
});

describe('placeSpawnLevel', () => {
  it('uses the place target when the type does not fit the band', () => {
    expect(placeSpawnLevel(1n, 5n, 4n)).toBe(5n);
    expect(placeSpawnLevel(9n, 2n, 1n)).toBe(2n);
    expect(placeSpawnLevel(2n, 3n, 0n)).toBe(3n);
  });

  it('keeps the type level when it is inside the band', () => {
    expect(placeSpawnLevel(4n, 5n, 4n)).toBe(4n);
    expect(placeSpawnLevel(6n, 5n, 4n)).toBe(6n);
    expect(placeSpawnLevel(5n, 5n, 4n)).toBe(5n);
  });

  it('never returns a level outside the place band (matrix)', () => {
    for (let type = 1n; type <= 12n; type += 1n) {
      for (let target = 1n; target <= 10n; target += 1n) {
        for (let offset = 0n; offset <= 6n; offset += 1n) {
          const band = placeLevelBand(target, offset);
          const level = placeSpawnLevel(type, target, offset);
          expect(level >= band.min && level <= band.max, `${type}/${target}/${offset}`).toBe(true);
        }
      }
    }
  });
});

describe('effectiveEnemyLevel', () => {
  it('reads the row level when positive, else the template level', () => {
    expect(effectiveEnemyLevel(5n, 1n)).toBe(5n);
    expect(effectiveEnemyLevel(0n, 3n)).toBe(3n);
    expect(effectiveEnemyLevel(undefined, 3n)).toBe(3n);
    expect(effectiveEnemyLevel(null, 3n)).toBe(3n);
    expect(effectiveEnemyLevel(5n, undefined)).toBe(5n);
    expect(effectiveEnemyLevel(0n, undefined)).toBeUndefined();
  });
});

describe('templateAtLevel', () => {
  const t = {
    id: 7n,
    name: 'Cave Rat',
    role: 'melee',
    creatureType: 'beast',
    terrainTypes: 'dungeon',
    level: 1n,
    maxHp: 32n,
    baseDamage: 8n,
    armorClass: 4n,
    xpReward: 25n,
  };

  it('returns the very same object when the level is unchanged or unset', () => {
    expect(templateAtLevel(t, t.level)).toBe(t);
    expect(templateAtLevel(t, 0n)).toBe(t);
    expect(templateAtLevel(t, undefined)).toBe(t);
  });

  it('rescales stats to the world-gen formulas and keeps the identity fields', () => {
    const s = templateAtLevel(t, 5n);
    expect(s).not.toBe(t);
    expect(s.id).toBe(7n);
    expect(s.name).toBe('Cave Rat');
    expect(s.role).toBe('melee');
    expect(s.creatureType).toBe('beast');
    expect(s.terrainTypes).toBe('dungeon');
    expect(s.level).toBe(5n);
    const e = enemyStatsForLevel(5n);
    expect(s.maxHp).toBe(e.maxHp);
    expect(s.baseDamage).toBe(e.baseDamage);
    expect(s.armorClass).toBe(e.armorClass);
    expect(s.xpReward).toBe(e.xpReward);
  });
});
