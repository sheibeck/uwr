import { describe, expect, it } from 'vitest';
import {
  PhArrowFatLinesDown,
  PhArrowFatLinesUp,
  PhFlame,
  PhHeart,
  PhMegaphone,
  PhShield,
  PhSnowflake,
  PhSparkle,
  PhSword,
} from '@phosphor-icons/vue';
import { CC_TYPES } from '@game-data/mechanical_vocabulary';
import {
  EFFECT_CHIP_LIMIT,
  effectIcon,
  effectName,
  effectPolarity,
  effectTimeText,
  effectViews,
  splitOverflow,
} from './effects';

describe('effectPolarity', () => {
  it.each(['armor_down', 'damage_down', 'damage_taken', 'dot', 'stun', 'root', 'silence', 'slow', 'mesmerize', 'fear'])(
    '%s is a debuff',
    (type) => {
      expect(effectPolarity(type, 5n)).toBe('debuff');
    },
  );

  it('treats every CC type as a debuff', () => {
    for (const type of CC_TYPES) expect(effectPolarity(type, 1n)).toBe('debuff');
  });

  it('follows the sign of a stat bonus', () => {
    expect(effectPolarity('str_bonus', 5n)).toBe('buff');
    expect(effectPolarity('str_bonus', -5n)).toBe('debuff');
  });

  it('treats regen and unknown types as buffs', () => {
    expect(effectPolarity('regen', 3n)).toBe('buff');
    expect(effectPolarity('pull_veil', 1n)).toBe('buff');
    expect(effectPolarity('', 0n)).toBe('buff');
  });
});

describe('effectName', () => {
  it('prefers the source ability', () => {
    expect(effectName({ effectType: 'armor_up', sourceAbility: 'Stoneskin' })).toBe('Stoneskin');
  });

  it('spells the effect type in words otherwise', () => {
    expect(effectName({ effectType: 'damage_taken' })).toBe('damage taken');
    expect(effectName({ effectType: 'damage_taken', sourceAbility: null })).toBe('damage taken');
    expect(effectName({ effectType: 'mana_regen_bonus', sourceAbility: '  ' })).toBe('mana regen bonus');
  });
});

describe('effectTimeText', () => {
  it('shows rounds only in combat', () => {
    expect(effectTimeText(3n, true)).toBe('3 rounds');
    expect(effectTimeText(1n, true)).toBe('1 round');
  });

  it('shows nothing at 0 or below', () => {
    expect(effectTimeText(0n, true)).toBeNull();
    expect(effectTimeText(-1n, true)).toBeNull();
  });

  it('shows nothing out of combat, where the value is frozen', () => {
    expect(effectTimeText(5n, false)).toBeNull();
    expect(effectTimeText(1n, false)).toBeNull();
  });
});

describe('effectIcon', () => {
  it('maps type families to their icons', () => {
    expect(effectIcon('str_bonus', 'buff')).toBe(PhArrowFatLinesUp);
    expect(effectIcon('hp_bonus', 'buff')).toBe(PhArrowFatLinesUp);
    expect(effectIcon('armor_up', 'buff')).toBe(PhArrowFatLinesUp);
    expect(effectIcon('damage_up', 'buff')).toBe(PhSword);
    expect(effectIcon('damage_shield', 'buff')).toBe(PhShield);
    expect(effectIcon('magic_resist', 'buff')).toBe(PhShield);
    expect(effectIcon('dot', 'debuff')).toBe(PhFlame);
    expect(effectIcon('stun', 'debuff')).toBe(PhSnowflake);
    expect(effectIcon('root', 'debuff')).toBe(PhSnowflake);
    expect(effectIcon('slow', 'debuff')).toBe(PhSnowflake);
    expect(effectIcon('silence', 'debuff')).toBe(PhMegaphone);
  });

  it.each([
    'regen',
    'mana_regen',
    'stamina_regen',
    'health_regen',
    'mana_regen_bonus',
    'food_health_regen',
    'food_mana_regen',
    'food_stamina_regen',
  ])('%s is a heart', (type) => {
    expect(effectIcon(type, 'buff')).toBe(PhHeart);
  });

  it('uses the down arrow for other debuffs, including negative stat bonuses', () => {
    expect(effectIcon('armor_down', 'debuff')).toBe(PhArrowFatLinesDown);
    expect(effectIcon('damage_down', 'debuff')).toBe(PhArrowFatLinesDown);
    expect(effectIcon('damage_taken', 'debuff')).toBe(PhArrowFatLinesDown);
    expect(effectIcon('mesmerize', 'debuff')).toBe(PhArrowFatLinesDown);
    expect(effectIcon('str_bonus', 'debuff')).toBe(PhArrowFatLinesDown);
  });

  it('falls back to the sparkle for anything unclassified', () => {
    expect(effectIcon('pull_veil', 'buff')).toBe(PhSparkle);
    expect(effectIcon('stamina_free', 'buff')).toBe(PhSparkle);
    expect(effectIcon('', 'buff')).toBe(PhSparkle);
  });
});

describe('effectViews', () => {
  const rows = [
    { id: 5n, characterId: 1n, effectType: 'dot', magnitude: 3n, roundsRemaining: 2n, sourceAbility: 'Poison' },
    { id: 2n, characterId: 2n, effectType: 'armor_up', magnitude: 4n, roundsRemaining: 9n, sourceAbility: 'Stoneskin' },
    { id: 3n, characterId: 1n, effectType: 'armor_up', magnitude: 4n, roundsRemaining: 1n, sourceAbility: 'Stoneskin' },
  ];

  it('keeps only the active character, ordered by id', () => {
    const views = effectViews(rows, 1n, true);
    expect(views.map((v) => v.id)).toEqual([3n, 5n]);
  });

  it('builds text and title from name and time in combat', () => {
    const [armor, dot] = effectViews(rows, 1n, true);
    expect(armor.text).toBe('Stoneskin · 1 round');
    expect(armor.title).toBe('Stoneskin · 1 round');
    expect(armor.polarity).toBe('buff');
    expect(armor.timeText).toBe('1 round');
    expect(dot.text).toBe('Poison · 2 rounds');
    expect(dot.polarity).toBe('debuff');
    expect(dot.icon).toBe(PhFlame);
  });

  it('drops the time out of combat', () => {
    const [armor] = effectViews(rows, 1n, false);
    expect(armor.text).toBe('Stoneskin');
    expect(armor.timeText).toBeNull();
  });

  it('returns [] for no character or no rows', () => {
    expect(effectViews(rows, null, true)).toEqual([]);
    expect(effectViews([], 1n, true)).toEqual([]);
    expect(effectViews(rows, 99n, true)).toEqual([]);
  });
});

describe('splitOverflow', () => {
  it('limits to 8 chips by default', () => {
    expect(EFFECT_CHIP_LIMIT).toBe(8);
    const items = Array.from({ length: 10 }, (_, i) => i);
    const out = splitOverflow(items);
    expect(out.shown).toHaveLength(8);
    expect(out.overflow).toBe(2);
  });

  it('shows everything under the limit', () => {
    expect(splitOverflow([1, 2, 3])).toEqual({ shown: [1, 2, 3], overflow: 0 });
    expect(splitOverflow([])).toEqual({ shown: [], overflow: 0 });
  });

  it('takes an explicit limit', () => {
    expect(splitOverflow([1, 2, 3], 1)).toEqual({ shown: [1], overflow: 2 });
    expect(splitOverflow([1, 2, 3], 0)).toEqual({ shown: [], overflow: 3 });
  });
});
