import { describe, it, expect, vi } from 'vitest';

// combat_rewards.ts has no imports that require mocking for the tested function
// computeRacialAtLevelFromRow is a pure function — no mocks needed

import { computeRacialAtLevelFromRow } from './combat_rewards';
import { RACE_DATA } from '../data/races';

describe('computeRacialAtLevelFromRow — every-level heritage formula', () => {
  const mockRaceRow = {
    name: 'TestRace',
    bonus1Type: 'max_hp',
    bonus1Value: 10n,
    bonus2Type: 'stat_str',
    bonus2Value: 2n,
    penaltyType: undefined,
    penaltyValue: undefined,
    levelBonusType: 'max_hp',
    levelBonusValue: 1n,
  };

  it('applies levelBonusValue * 1 at level 1 (not 0)', () => {
    const result = computeRacialAtLevelFromRow(mockRaceRow, 1n);
    // bonus1 (max_hp +10) + levelBonus at level 1 (1 * 1 = 1) = 11
    expect(result.racialMaxHp).toBe(10n + 1n);
  });

  it('applies levelBonusValue * 5 at level 5 (not 5/2=2)', () => {
    const result = computeRacialAtLevelFromRow(mockRaceRow, 5n);
    // bonus1 (max_hp +10) + levelBonus at level 5 (1 * 5 = 5) = 15
    expect(result.racialMaxHp).toBe(10n + 5n);
  });

  it('applies levelBonusValue * 10 at level 10', () => {
    const result = computeRacialAtLevelFromRow(mockRaceRow, 10n);
    // bonus1 (max_hp +10) + levelBonus at level 10 (1 * 10 = 10) = 20
    expect(result.racialMaxHp).toBe(10n + 10n);
  });

  it('at level 10, total heritage bonus equals levelBonusValue * 10 (not * 5)', () => {
    const result = computeRacialAtLevelFromRow(mockRaceRow, 10n);
    // If old formula: bonus1 + levelBonus * (10/2=5) = 10 + 5 = 15
    // New formula: bonus1 + levelBonus * 10 = 10 + 10 = 20
    expect(result.racialMaxHp).toBe(20n);
    // Ensure it is NOT 15 (the old every-2-levels value)
    expect(result.racialMaxHp).not.toBe(15n);
  });

  it('applies zero heritage bonus at level 0', () => {
    const result = computeRacialAtLevelFromRow(mockRaceRow, 0n);
    // levelBonus = 0, only creation bonuses
    expect(result.racialMaxHp).toBe(10n);
  });

  it('applies creation bonuses regardless of level', () => {
    const result = computeRacialAtLevelFromRow(mockRaceRow, 1n);
    expect(result.str).toBe(2n);
  });

  it('Eldrin with halved levelBonusValue (1n) reaches same cap at 20 as old 2n at 10', () => {
    const eldrinRow = RACE_DATA.find(r => r.name === 'Eldrin')!;
    // After halving: levelBonusValue should be 1n
    // At level 20: 1 * 20 = 20 (same total as old: 2 * 10 = 20)
    const result = computeRacialAtLevelFromRow(eldrinRow, 20n);
    // base bonus2 max_mana (15n) + level bonus (1n * 20 = 20n)
    expect(eldrinRow.levelBonusValue).toBe(1n); // halved from 2n
    expect(result.racialMaxMana).toBe(15n + 20n);
  });
});

describe('RACE_DATA — race ability definitions', () => {
  it('each RACE_DATA entry has abilityKind field', () => {
    for (const race of RACE_DATA) {
      expect(race, `${race.name} missing abilityKind`).toHaveProperty('abilityKind');
      expect(typeof (race as any).abilityKind).toBe('string');
      expect((race as any).abilityKind.length).toBeGreaterThan(0);
    }
  });

  it('each RACE_DATA entry has abilityName field', () => {
    for (const race of RACE_DATA) {
      expect(race, `${race.name} missing abilityName`).toHaveProperty('abilityName');
      expect(typeof (race as any).abilityName).toBe('string');
    }
  });

  it('each RACE_DATA entry has abilityKey field', () => {
    for (const race of RACE_DATA) {
      expect(race, `${race.name} missing abilityKey`).toHaveProperty('abilityKey');
      expect(typeof (race as any).abilityKey).toBe('string');
    }
  });

  it('each RACE_DATA entry has abilityDescription field', () => {
    for (const race of RACE_DATA) {
      expect(race, `${race.name} missing abilityDescription`).toHaveProperty('abilityDescription');
    }
  });

  it('each RACE_DATA entry has abilityCooldownSeconds field (bigint)', () => {
    for (const race of RACE_DATA) {
      expect(race, `${race.name} missing abilityCooldownSeconds`).toHaveProperty('abilityCooldownSeconds');
      expect(typeof (race as any).abilityCooldownSeconds).toBe('bigint');
    }
  });

  it('each RACE_DATA entry has abilityValue field (bigint)', () => {
    for (const race of RACE_DATA) {
      expect(race, `${race.name} missing abilityValue`).toHaveProperty('abilityValue');
      expect(typeof (race as any).abilityValue).toBe('bigint');
    }
  });

  it('each RACE_DATA entry has abilityTargetRule field', () => {
    for (const race of RACE_DATA) {
      expect(race, `${race.name} missing abilityTargetRule`).toHaveProperty('abilityTargetRule');
    }
  });

  it('abilityKey values are unique across races', () => {
    const keys = RACE_DATA.map(r => (r as any).abilityKey as string);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });
});
