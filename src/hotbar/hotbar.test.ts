import { describe, expect, it } from 'vitest';
import {
  PhArrowFatLinesDown,
  PhArrowFatLinesUp,
  PhBandaids,
  PhBomb,
  PhCookingPot,
  PhDog,
  PhDrop,
  PhFirstAid,
  PhFlame,
  PhFlask,
  PhFootprints,
  PhGhost,
  PhHammer,
  PhHandHeart,
  PhHeart,
  PhMegaphone,
  PhMusicNotes,
  PhPawPrint,
  PhPlant,
  PhShield,
  PhShovel,
  PhSkull,
  PhSnowflake,
  PhSparkle,
  PhSunDim,
  PhSword,
  PhWrench,
} from '@phosphor-icons/vue';
import { ABILITY_KINDS, ABILITY_KIND_LABELS } from '@game-data/mechanical_vocabulary';
import {
  HOTBAR_SLOT_COUNT,
  abilityIcon,
  activeHotbar,
  cooldownFraction,
  cooldownLabel,
  cooldownRemainingMicros,
  hotbarSlots,
  isUnaffordable,
  nextHotbarIndex,
  orderedHotbars,
  selectorAriaLabel,
  slotAriaLabel,
  slotForKey,
  slotKey,
  slotTitle,
  slotTooltip,
  slotTooltipText,
} from './hotbar';

describe('slot keys', () => {
  it('maps slot 1..9 to the digits and slot 10 to 0', () => {
    expect(HOTBAR_SLOT_COUNT).toBe(10);
    expect([1, 2, 3, 9, 10].map(slotKey)).toEqual(['1', '2', '3', '9', '0']);
  });

  it('maps keys back to slots', () => {
    expect(slotForKey('0')).toBe(10);
    expect(slotForKey('5')).toBe(5);
    expect(slotForKey('1')).toBe(1);
    expect(slotForKey('9')).toBe(9);
  });

  it('rejects anything else', () => {
    for (const key of ['a', '10', '', ' ', '-1', 'Enter', '٣']) expect(slotForKey(key)).toBeNull();
  });
});

describe('orderedHotbars and activeHotbar', () => {
  const hotbars = [
    { id: 3n, sortOrder: 2, isActive: false },
    { id: 2n, sortOrder: 1, isActive: false },
    { id: 1n, sortOrder: 1, isActive: false },
  ];

  it('orders by sortOrder then id without mutating the input', () => {
    expect(orderedHotbars(hotbars).map((h) => h.id)).toEqual([1n, 2n, 3n]);
    expect(hotbars.map((h) => h.id)).toEqual([3n, 2n, 1n]);
  });

  it('picks the isActive row', () => {
    const rows = hotbars.map((h) => (h.id === 3n ? { ...h, isActive: true } : h));
    expect(activeHotbar(rows)!.id).toBe(3n);
  });

  it('falls back to the first by sortOrder, null when empty', () => {
    expect(activeHotbar(hotbars)!.id).toBe(1n);
    expect(activeHotbar([])).toBeNull();
  });
});

describe('hotbarSlots', () => {
  const abilities = [
    { id: 100n, name: 'Firebolt' },
    { id: 101n, name: 'Heal' },
  ];

  it('always returns ten slots keyed 1..9 then 0', () => {
    const out = hotbarSlots({ id: 1n }, [], abilities);
    expect(out).toHaveLength(10);
    expect(out.map((s) => s.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(out.map((s) => s.key)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
    expect(out.every((s) => s.ability === null)).toBe(true);
  });

  it('places abilities by slot and ignores other hotbars', () => {
    const slots = [
      { hotbarId: 1n, slot: 3, abilityTemplateId: 100n },
      { hotbarId: 1n, slot: 10, abilityTemplateId: 101n },
      { hotbarId: 2n, slot: 1, abilityTemplateId: 101n },
    ];
    const out = hotbarSlots({ id: 1n }, slots, abilities);
    expect(out[2].ability).toEqual({ id: 100n, name: 'Firebolt' });
    expect(out[9].ability).toEqual({ id: 101n, name: 'Heal' });
    expect(out[0].ability).toBeNull();
  });

  it('leaves a slot empty when its ability row is missing', () => {
    const out = hotbarSlots({ id: 1n }, [{ hotbarId: 1n, slot: 2, abilityTemplateId: 999n }], abilities);
    expect(out[1].ability).toBeNull();
  });

  it('ignores out-of-range slots', () => {
    const out = hotbarSlots({ id: 1n }, [{ hotbarId: 1n, slot: 11, abilityTemplateId: 100n }], abilities);
    expect(out).toHaveLength(10);
    expect(out.every((s) => s.ability === null)).toBe(true);
  });

  it('gives ten empty slots without a hotbar', () => {
    const out = hotbarSlots(null, [{ hotbarId: 1n, slot: 1, abilityTemplateId: 100n }], abilities);
    expect(out).toHaveLength(10);
    expect(out.every((s) => s.ability === null)).toBe(true);
  });
});

describe('abilityIcon', () => {
  it('follows the UI-SPEC table', () => {
    const table: [string, unknown][] = [
      ['damage', PhSword],
      ['aoe_damage', PhBomb],
      ['dot', PhFlame],
      ['drain', PhDrop],
      ['execute', PhSkull],
      ['heal', PhHeart],
      ['aoe_heal', PhFirstAid],
      ['group_heal', PhFirstAid],
      ['hot', PhPlant],
      ['buff', PhArrowFatLinesUp],
      ['debuff', PhArrowFatLinesDown],
      ['shield', PhShield],
      ['taunt', PhMegaphone],
      ['summon', PhPawPrint],
      ['pet_command', PhDog],
      ['cc', PhSnowflake],
      ['fear', PhGhost],
      ['utility', PhWrench],
      ['song', PhMusicNotes],
      ['aura', PhSunDim],
      ['travel', PhFootprints],
      ['bandage', PhBandaids],
      ['potion', PhFlask],
      ['food_summon', PhCookingPot],
      ['resurrect', PhHandHeart],
      ['craft_boost', PhHammer],
      ['gather_boost', PhShovel],
    ];
    for (const [kind, icon] of table) expect(abilityIcon(kind), kind).toBe(icon);
  });

  it('resolves every kind in the server vocabulary to a non-fallback icon', () => {
    for (const kind of ABILITY_KINDS) expect(abilityIcon(kind), kind).not.toBe(PhSparkle);
  });

  it('falls back to the sparkle for unknown kinds and prototype names', () => {
    for (const kind of ['track', 'corpse_summon', '', 'constructor', 'toString', '__proto__']) {
      expect(abilityIcon(kind), kind).toBe(PhSparkle);
    }
  });
});

describe('cooldownRemainingMicros (CON-05 boundary)', () => {
  const row = { startedAtMicros: 1_000_000n, durationMicros: 10_000_000n };

  it('is 0 without a row', () => {
    expect(cooldownRemainingMicros(undefined, 5)).toBe(0);
  });

  it('is the full duration at the start', () => {
    expect(cooldownRemainingMicros(row, 1_000_000)).toBe(10_000_000);
  });

  it('is 0 at the end and positive one microsecond before', () => {
    expect(cooldownRemainingMicros(row, 11_000_000)).toBe(0);
    expect(cooldownRemainingMicros(row, 10_999_999)).toBe(1);
  });

  it('is 0 well past the end', () => {
    expect(cooldownRemainingMicros(row, 99_000_000)).toBe(0);
  });

  it('clamps a row from the future (clock skew) to the full duration', () => {
    expect(cooldownRemainingMicros(row, 0)).toBe(10_000_000);
  });

  it('is 0 for a zero duration or a non-finite clock', () => {
    expect(cooldownRemainingMicros({ startedAtMicros: 5n, durationMicros: 0n }, 1)).toBe(0);
    expect(cooldownRemainingMicros(row, Number.NaN)).toBe(0);
  });

  it('keeps precision at current epoch magnitudes', () => {
    const big = { startedAtMicros: 1_760_000_000_000_000n, durationMicros: 6_000_000n };
    expect(cooldownRemainingMicros(big, 1_760_000_000_000_001 + 5_999_998)).toBe(1);
  });
});

describe('cooldownLabel (CON-05 precision)', () => {
  it.each([
    [0, ''],
    [-5, ''],
    [Number.NaN, ''],
    [1, '1'],
    [500_000, '1'],
    [1_000_000, '1'],
    [1_000_001, '2'],
    [59_000_000, '59'],
    [59_000_001, '1m'],
    [60_000_000, '1m'],
    [119_000_000, '1m'],
    [120_000_000, '2m'],
    [3_599_000_000, '59m'],
    [3_600_000_000, '1h'],
    [7_300_000_000, '2h'],
  ])('%d -> %j', (micros, label) => {
    expect(cooldownLabel(micros)).toBe(label);
  });
});

describe('cooldownFraction', () => {
  it('is the remaining share', () => {
    expect(cooldownFraction(5_000_000, 10_000_000n)).toBe(0.5);
    expect(cooldownFraction(10_000_000, 10_000_000n)).toBe(1);
    expect(cooldownFraction(0, 10_000_000n)).toBe(0);
  });

  it('is 0 for a zero duration and clamps out-of-range input', () => {
    expect(cooldownFraction(5, 0n)).toBe(0);
    expect(cooldownFraction(20_000_000, 10_000_000n)).toBe(1);
    expect(cooldownFraction(-1, 10_000_000n)).toBe(0);
  });
});

describe('slot text', () => {
  const firebolt = { name: 'Firebolt', resourceCost: 12n, resourceType: 'mana', cooldownSeconds: 6n };

  it('builds the title', () => {
    expect(slotTitle(firebolt)).toBe('Firebolt · 12 mana · 6s');
    expect(slotTitle({ name: 'Rest', resourceCost: 0n, resourceType: 'none', cooldownSeconds: 30n })).toBe(
      'Rest · 30s',
    );
  });

  it('builds the aria label with key and cooldown', () => {
    expect(slotAriaLabel('Firebolt', 3, 0)).toBe('Firebolt, key 3');
    expect(slotAriaLabel('Firebolt', 3, 4_200_000)).toBe('Firebolt, key 3, ready in 5 seconds');
    expect(slotAriaLabel('Firebolt', 3, 1)).toBe('Firebolt, key 3, ready in 1 second');
    expect(slotAriaLabel('Firebolt', 10, 0)).toBe('Firebolt, key 0');
  });
});

describe('slotTooltip', () => {
  const firebolt = {
    name: 'Firebolt',
    kind: 'damage',
    description: '  Hurls a bolt of fire.  ',
    resourceCost: 12n,
    resourceType: 'mana',
    cooldownSeconds: 6n,
    castSeconds: 2n,
  };

  it('lists cost, cooldown in seconds and cast time out of combat, with the trimmed description', () => {
    expect(slotTooltip(firebolt, false)).toEqual({
      name: 'Firebolt',
      type: 'Damage',
      stats: ['12 mana', '6s cooldown', '2s cast'],
      description: 'Hurls a bolt of fire.',
    });
  });

  it('reads the cooldown in rounds in combat (4 s a round, at least 1)', () => {
    expect(slotTooltip(firebolt, true).stats[1]).toBe('2 rounds cooldown');
    expect(slotTooltip({ ...firebolt, cooldownSeconds: 1n }, true).stats[1]).toBe('1 round cooldown');
    expect(slotTooltip({ ...firebolt, cooldownSeconds: 12n }, true).stats[1]).toBe('3 rounds cooldown');
  });

  it('says Instant for a zero cast time and No cost / No cooldown for free, ready abilities', () => {
    const rest = { ...firebolt, resourceType: 'none', resourceCost: 0n, cooldownSeconds: 0n, castSeconds: 0n };
    expect(slotTooltip(rest, false).stats).toEqual(['No cost', 'No cooldown', 'Instant']);
    expect(slotTooltip(rest, true).stats).toEqual(['No cost', 'No cooldown', 'Instant']);
  });

  it('keeps hostile text as plain strings', () => {
    const tip = slotTooltip({ ...firebolt, name: '<b>x</b>', description: '<img src=x onerror=alert(1)>' }, false);
    expect(tip.name).toBe('<b>x</b>');
    expect(tip.description).toBe('<img src=x onerror=alert(1)>');
  });

  it('builds one sentence for aria-describedby, omitting an empty description', () => {
    expect(slotTooltipText(slotTooltip(firebolt, false))).toBe(
      'Damage, 12 mana, 6s cooldown, 2s cast. Hurls a bolt of fire.',
    );
    expect(slotTooltipText(slotTooltip({ ...firebolt, description: '   ' }, false))).toBe(
      'Damage, 12 mana, 6s cooldown, 2s cast',
    );
  });

  it('gives the type line from ability_template.kind in the server vocabulary words', () => {
    const typeOf = (kind: string) => slotTooltip({ ...firebolt, kind }, false).type;
    expect(typeOf('damage')).toBe('Damage');
    expect(typeOf('dot')).toBe('Damage over time');
    expect(typeOf('heal')).toBe('Heal');
    expect(typeOf('hot')).toBe('Heal over time');
    expect(typeOf('buff')).toBe('Buff');
    expect(typeOf('debuff')).toBe('Debuff');
    expect(typeOf('cc')).toBe('Crowd control');
  });

  it('labels every kind of the server vocabulary, and falls back to words for an unknown kind', () => {
    for (const kind of ABILITY_KINDS) {
      const type = slotTooltip({ ...firebolt, kind }, false).type;
      expect(type, kind).toBe(ABILITY_KIND_LABELS[kind]);
      expect(type.length, kind).toBeGreaterThan(0);
    }
    expect(slotTooltip({ ...firebolt, kind: 'track_prey' }, false).type).toBe('Track prey');
    expect(slotTooltip({ ...firebolt, kind: 'constructor' }, false).type).toBe('Constructor');
  });

  it('leaves the type out of the sentence when the kind is empty', () => {
    const tip = slotTooltip({ ...firebolt, kind: '' }, false);
    expect(tip.type).toBe('');
    expect(slotTooltipText(tip)).toBe('12 mana, 6s cooldown, 2s cast. Hurls a bolt of fire.');
  });
});

describe('isUnaffordable', () => {
  const c = { mana: 10n, stamina: 5n, hp: 40n };

  it('compares the cost with the matching resource', () => {
    expect(isUnaffordable({ resourceType: 'mana', resourceCost: 11n }, c)).toBe(true);
    expect(isUnaffordable({ resourceType: 'mana', resourceCost: 10n }, c)).toBe(false);
    expect(isUnaffordable({ resourceType: 'stamina', resourceCost: 6n }, c)).toBe(true);
    expect(isUnaffordable({ resourceType: 'stamina', resourceCost: 5n }, c)).toBe(false);
    expect(isUnaffordable({ resourceType: 'hp', resourceCost: 41n }, c)).toBe(true);
    expect(isUnaffordable({ resourceType: 'hp', resourceCost: 40n }, c)).toBe(false);
  });

  it('never flags none or unknown types', () => {
    expect(isUnaffordable({ resourceType: 'none', resourceCost: 999n }, c)).toBe(false);
    expect(isUnaffordable({ resourceType: 'rage', resourceCost: 999n }, c)).toBe(false);
  });
});

describe('selector', () => {
  it('wraps around in both directions', () => {
    expect(nextHotbarIndex(2, 3, 1)).toBe(0);
    expect(nextHotbarIndex(0, 3, -1)).toBe(2);
    expect(nextHotbarIndex(0, 3, 1)).toBe(1);
    expect(nextHotbarIndex(1, 3, -1)).toBe(0);
  });

  it('stays at 0 with zero or one hotbar', () => {
    expect(nextHotbarIndex(0, 0, 1)).toBe(0);
    expect(nextHotbarIndex(0, 1, 1)).toBe(0);
    expect(nextHotbarIndex(0, 1, -1)).toBe(0);
  });

  it('labels the selector', () => {
    expect(selectorAriaLabel('Combat', 0, 3)).toBe('Hotbar Combat, 1 of 3. Switch to next hotbar.');
  });
});
