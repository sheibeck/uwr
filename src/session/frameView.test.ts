import { describe, expect, it } from 'vitest';
import type { Character, Location, PendingSkill, Region, WorldState } from '../module_bindings/types';
import {
  UNKNOWN_PLACE,
  accountLine,
  avatarInitial,
  buildFrameView,
  classLine,
  describePlace,
  sortCharacters,
  timeOfDay,
} from './frameView';

function makeCharacter(overrides: Partial<Record<string, unknown>> = {}): Character {
  return {
    id: 1n,
    ownerUserId: 1n,
    name: 'Aria',
    race: 'Elf',
    className: 'Wizard',
    level: 6n,
    locationId: 10n,
    hp: 30n,
    maxHp: 40n,
    mana: 20n,
    maxMana: 50n,
    stamina: 5n,
    maxStamina: 9n,
    pendingLevels: 0n,
    createdAt: { microsSinceUnixEpoch: 10n },
    ...overrides,
  } as unknown as Character;
}

const location = { id: 10n, name: 'Ember Gate', regionId: 100n } as unknown as Location;
const region = { id: 100n, name: 'Ashfall Wilds' } as unknown as Region;

describe('frameView (copy from UI-SPEC)', () => {
  it('describePlace joins region and location with the middle-dot separator', () => {
    expect(describePlace(10n, [location], [region])).toEqual({
      placeLabel: 'Ashfall Wilds · Ember Gate',
      locationName: 'Ember Gate',
    });
  });

  it('describePlace falls back to Unknown place', () => {
    expect(UNKNOWN_PLACE).toBe('Unknown place');
    const unknown = { placeLabel: UNKNOWN_PLACE, locationName: UNKNOWN_PLACE };
    expect(describePlace(99n, [location], [region])).toEqual(unknown);
    expect(describePlace(10n, [location], [])).toEqual(unknown);
    expect(describePlace(null, [location], [region])).toEqual(unknown);
    expect(describePlace(undefined, [location], [region])).toEqual(unknown);
  });

  it('timeOfDay is null without a row, night or day from the first row', () => {
    expect(timeOfDay([])).toBeNull();
    expect(timeOfDay([{ isNight: true } as WorldState])).toBe('night');
    expect(timeOfDay([{ isNight: false } as WorldState])).toBe('day');
  });

  it('classLine and accountLine', () => {
    expect(classLine({ level: 6n, className: 'Wizard' })).toBe('Lv 6 · Wizard');
    expect(accountLine({ level: 6n, race: 'Elf', className: 'Wizard' })).toBe('Lv 6 · Elf Wizard');
  });

  it('avatarInitial upper-cases the first character, ? when empty', () => {
    expect(avatarInitial('aria')).toBe('A');
    expect(avatarInitial('')).toBe('?');
  });

  it('sortCharacters orders by createdAt then id and does not mutate', () => {
    const a = makeCharacter({ id: 3n, createdAt: { microsSinceUnixEpoch: 5n } });
    const b = makeCharacter({ id: 2n, createdAt: { microsSinceUnixEpoch: 20n } });
    const c = makeCharacter({ id: 1n, createdAt: { microsSinceUnixEpoch: 20n } });
    const input = [b, a, c];
    const sorted = sortCharacters(input);
    expect(sorted.map((x) => x.id)).toEqual([3n, 1n, 2n]);
    expect(input).toEqual([b, a, c]);
  });

  it('buildFrameView derives levelUp, newSkill and copies vitals as bigint', () => {
    const none = buildFrameView({
      character: makeCharacter(),
      locations: [location],
      regions: [region],
      worldState: [],
      pendingSkills: [{ characterId: 2n } as PendingSkill],
    });
    expect(none.levelUp).toBe(false);
    expect(none.newSkill).toBe(false);
    expect(none.timeOfDay).toBeNull();
    expect(none.characterName).toBe('Aria');
    expect(none.avatarInitial).toBe('A');
    expect(none.classLine).toBe('Lv 6 · Wizard');
    expect(none.accountLine).toBe('Lv 6 · Elf Wizard');
    expect(none.placeLabel).toBe('Ashfall Wilds · Ember Gate');
    expect(none.locationName).toBe('Ember Gate');
    expect([none.hp, none.maxHp, none.mana, none.maxMana, none.stamina, none.maxStamina]).toEqual([
      30n, 40n, 20n, 50n, 5n, 9n,
    ]);

    const both = buildFrameView({
      character: makeCharacter({ pendingLevels: 1n }),
      locations: [location],
      regions: [region],
      worldState: [{ isNight: true } as WorldState],
      pendingSkills: [{ characterId: 1n } as PendingSkill],
    });
    expect(both.levelUp).toBe(true);
    expect(both.newSkill).toBe(true);
    expect(both.timeOfDay).toBe('night');
  });
});
