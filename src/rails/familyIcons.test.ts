import { describe, expect, it } from 'vitest';
import * as Phosphor from '@phosphor-icons/vue';
import {
  PhBird,
  PhBone,
  PhBug,
  PhCube,
  PhDiamond,
  PhDrop,
  PhFish,
  PhFlame,
  PhLeaf,
  PhMaskSad,
  PhPawPrint,
  PhPlant,
  PhSkull,
  PhSparkle,
  PhTree,
} from '@phosphor-icons/vue';
import { FAMILY_ICON_KEYS, RESOURCE_ICON_KEYS } from '@game-data/mechanical_vocabulary';
import { FAMILY_ICONS, RESOURCE_ICONS, familyIcon, resourceIcon } from './familyIcons';

// The closed icon-key maps of the Nearby cards (51.3.1.1 UI-SPEC "Phosphor icons used by Phase
// 51.3.1.1"): the server sends a key, the client maps it; an unknown key falls back.

describe('familyIcon', () => {
  it('maps every family key of the UI-SPEC table', () => {
    expect(familyIcon('humanoid')).toBe(PhMaskSad);
    expect(familyIcon('beast')).toBe(PhPawPrint);
    expect(familyIcon('insect')).toBe(PhBug);
    expect(familyIcon('spirit')).toBe(PhSparkle);
    expect(familyIcon('undead')).toBe(PhBone);
    expect(familyIcon('avian')).toBe(PhBird);
    expect(familyIcon('aquatic')).toBe(PhFish);
    expect(familyIcon('elemental')).toBe(PhFlame);
  });

  it('falls back to PhSkull for an unknown or empty key', () => {
    expect(familyIcon('robot')).toBe(PhSkull);
    expect(familyIcon('')).toBe(PhSkull);
    expect(familyIcon('constructor')).toBe(PhSkull);
    expect(familyIcon('__proto__')).toBe(PhSkull);
  });

  it('covers every server family icon key', () => {
    for (const key of FAMILY_ICON_KEYS) expect(familyIcon(key)).not.toBe(PhSkull);
    expect(Object.keys(FAMILY_ICONS).sort()).toEqual([...FAMILY_ICON_KEYS].sort());
  });
});

describe('resourceIcon', () => {
  it('maps every resource key of the UI-SPEC table', () => {
    expect(resourceIcon('mineral')).toBe(PhCube);
    expect(resourceIcon('herb')).toBe(PhPlant);
    expect(resourceIcon('gem')).toBe(PhDiamond);
    expect(resourceIcon('wood')).toBe(PhTree);
    expect(resourceIcon('fibre')).toBe(PhLeaf);
    expect(resourceIcon('fluid')).toBe(PhDrop);
  });

  it('falls back to PhCube for an unknown or empty key', () => {
    expect(resourceIcon('lava')).toBe(PhCube);
    expect(resourceIcon('')).toBe(PhCube);
    expect(resourceIcon('toString')).toBe(PhCube);
  });

  it('covers every server resource icon key', () => {
    expect(Object.keys(RESOURCE_ICONS).sort()).toEqual([...RESOURCE_ICON_KEYS].sort());
  });
});

describe('icons exist in @phosphor-icons/vue 2.2.1', () => {
  it('every mapped component is an export of the installed package', () => {
    const exported = new Set(Object.values(Phosphor));
    for (const icon of [...Object.values(FAMILY_ICONS), ...Object.values(RESOURCE_ICONS), PhSkull, PhCube]) {
      expect(icon).toBeDefined();
      expect(exported.has(icon)).toBe(true);
    }
  });
});
