import { describe, expect, it } from 'vitest';
import { TRAVEL_CONFIG, travelEffectDiscount, travelStaminaCost } from './travel_config';

describe('travelEffectDiscount', () => {
  it('is 0n for an empty list', () => {
    expect(travelEffectDiscount([])).toBe(0n);
  });

  it('sums active travel_discount magnitudes (bigint or number)', () => {
    expect(
      travelEffectDiscount([
        { effectType: 'travel_discount', roundsRemaining: 3n, magnitude: 2n },
        { effectType: 'travel_discount', roundsRemaining: 1n, magnitude: 1 },
      ]),
    ).toBe(3n);
  });

  it('ignores expired rows and other effect types', () => {
    expect(
      travelEffectDiscount([
        { effectType: 'travel_discount', roundsRemaining: 0n, magnitude: 5n },
        { effectType: 'regen', roundsRemaining: 4n, magnitude: 5n },
        { effectType: 'travel_discount_x', roundsRemaining: 4n, magnitude: 5n },
      ]),
    ).toBe(0n);
  });
});

describe('travelStaminaCost', () => {
  it('is the base cost with no modifiers', () => {
    expect(travelStaminaCost({ crossRegion: false, effectDiscount: 0n })).toBe(5n);
    expect(travelStaminaCost({ crossRegion: true, effectDiscount: 0n })).toBe(10n);
    expect(travelStaminaCost({ crossRegion: false, effectDiscount: 0n })).toBe(TRAVEL_CONFIG.WITHIN_REGION_STAMINA);
    expect(travelStaminaCost({ crossRegion: true, effectDiscount: 0n })).toBe(TRAVEL_CONFIG.CROSS_REGION_STAMINA);
  });

  it('adds the racial increase', () => {
    expect(travelStaminaCost({ crossRegion: true, racialIncrease: 3n, effectDiscount: 0n })).toBe(13n);
  });

  it('subtracts the racial discount and the effect discount', () => {
    expect(
      travelStaminaCost({ crossRegion: false, racialDiscount: 2n, effectDiscount: 2n }),
    ).toBe(1n);
  });

  it('never goes below 0n', () => {
    expect(travelStaminaCost({ crossRegion: false, racialDiscount: 6n, effectDiscount: 0n })).toBe(0n);
    expect(travelStaminaCost({ crossRegion: true, racialDiscount: 20n, effectDiscount: 20n })).toBe(0n);
  });

  it('counts null and undefined racial fields as 0n', () => {
    expect(travelStaminaCost({ crossRegion: false, racialIncrease: null, racialDiscount: null, effectDiscount: 0n })).toBe(5n);
    expect(travelStaminaCost({ crossRegion: true, racialIncrease: undefined, racialDiscount: undefined, effectDiscount: 0n })).toBe(10n);
  });

  it('matches the old inline performTravel formula over a grid', () => {
    // The formula performTravel used before the shared rule, written out.
    const legacy = (
      crossRegion: boolean,
      racialIncrease: bigint | null,
      racialDiscount: bigint | null,
      effects: any[],
    ): bigint => {
      const staminaCost = crossRegion ? TRAVEL_CONFIG.CROSS_REGION_STAMINA : TRAVEL_CONFIG.WITHIN_REGION_STAMINA;
      const costIncrease = racialIncrease ?? 0n;
      const costDiscount = racialDiscount ?? 0n;
      const rawCost = staminaCost + costIncrease;
      const abilityDiscount = effects
        .filter((e: any) => e.effectType === 'travel_discount' && e.roundsRemaining > 0n)
        .reduce((sum: bigint, e: any) => sum + BigInt(e.magnitude), 0n);
      const totalDiscount = costDiscount + abilityDiscount;
      return rawCost > totalDiscount ? rawCost - totalDiscount : 0n;
    };
    const effectLists = [
      [],
      [{ effectType: 'travel_discount', roundsRemaining: 2n, magnitude: 2n }],
      [{ effectType: 'travel_discount', roundsRemaining: 0n, magnitude: 2n }],
      [
        { effectType: 'travel_discount', roundsRemaining: 2n, magnitude: 2n },
        { effectType: 'travel_discount', roundsRemaining: 5n, magnitude: 3n },
      ],
    ];
    for (const crossRegion of [true, false]) {
      for (const inc of [0n, 2n, null]) {
        for (const disc of [0n, 1n, 6n, null]) {
          for (const effects of effectLists) {
            expect(
              travelStaminaCost({
                crossRegion,
                racialIncrease: inc,
                racialDiscount: disc,
                effectDiscount: travelEffectDiscount(effects),
              }),
            ).toBe(legacy(crossRegion, inc, disc, effects));
          }
        }
      }
    }
  });
});
