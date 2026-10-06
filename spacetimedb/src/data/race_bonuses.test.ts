import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  RACE_PRIMARY_BONUS_MAX,
  RACE_SECONDARY_BONUS_MAX,
  computeCreationStats,
  levelUpBaseStats,
  parseRaceBonuses,
  raceBonusDelta,
} from './race_bonuses';
import { BASE_STAT, computeBaseStatsForGenerated, detectPrimarySecondary } from './class_stats';

const DARK_ELF =
  '{"primary":{"stat":"dex","value":2},"secondary":{"stat":"int","value":1},"flavor":"Underlight Eyes"}';

function importSpecifiers(fileName: string): string[] {
  const path = fileURLToPath(new URL(`./${fileName}`, import.meta.url));
  const source = readFileSync(path, 'utf8');
  const out: string[] = [];
  const re = /from\s+'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1]);
  return out;
}

describe('parseRaceBonuses', () => {
  it('reads primary, secondary and flavor', () => {
    expect(parseRaceBonuses(DARK_ELF)).toEqual({
      primary: { stat: 'dex', value: 2n },
      secondary: { stat: 'int', value: 1n },
      flavor: 'Underlight Eyes',
    });
  });

  it('drops an unknown stat code for that entry only', () => {
    const p = parseRaceBonuses('{"primary":{"stat":"con","value":2},"secondary":{"stat":"wis","value":1}}');
    expect(p.primary).toBeNull();
    expect(p.secondary).toEqual({ stat: 'wis', value: 1n });
  });

  it('clamps primary to 3 and secondary to 2', () => {
    const p = parseRaceBonuses('{"primary":{"stat":"str","value":9},"secondary":{"stat":"wis","value":9}}');
    expect(p.primary?.value).toBe(RACE_PRIMARY_BONUS_MAX);
    expect(p.secondary?.value).toBe(RACE_SECONDARY_BONUS_MAX);
    expect(RACE_PRIMARY_BONUS_MAX).toBe(3n);
    expect(RACE_SECONDARY_BONUS_MAX).toBe(2n);
  });

  it('drops zero, negative, non-number values and truncates fractions', () => {
    expect(parseRaceBonuses('{"primary":{"stat":"str","value":0}}').primary).toBeNull();
    expect(parseRaceBonuses('{"primary":{"stat":"str","value":-2}}').primary).toBeNull();
    expect(parseRaceBonuses('{"primary":{"stat":"str","value":"2"}}').primary).toBeNull();
    expect(parseRaceBonuses('{"primary":{"stat":"str","value":null}}').primary).toBeNull();
    expect(parseRaceBonuses('{"primary":{"stat":"str","value":0.4}}').primary).toBeNull();
    expect(parseRaceBonuses('{"primary":{"stat":"str","value":2.7}}').primary).toEqual({ stat: 'str', value: 2n });
  });

  it('never throws on malformed input and returns all null', () => {
    const empty = { primary: null, secondary: null, flavor: null };
    for (const bad of ['not json', null, undefined, '', '[]', '5', '"x"', 'null', '{']) {
      expect(parseRaceBonuses(bad as string | null | undefined)).toEqual(empty);
    }
  });

  it('gives null flavor for empty, whitespace or non-string flavor', () => {
    expect(parseRaceBonuses('{"flavor":""}').flavor).toBeNull();
    expect(parseRaceBonuses('{"flavor":"   "}').flavor).toBeNull();
    expect(parseRaceBonuses('{"flavor":7}').flavor).toBeNull();
    expect(parseRaceBonuses('{"flavor":"  Keen  "}').flavor).toBe('Keen');
  });
});

describe('raceBonusDelta', () => {
  it('returns all five stats with 0n default', () => {
    expect(raceBonusDelta(DARK_ELF)).toEqual({ str: 0n, dex: 2n, cha: 0n, wis: 0n, int: 1n });
    expect(raceBonusDelta(null)).toEqual({ str: 0n, dex: 0n, cha: 0n, wis: 0n, int: 0n });
  });
});

describe('computeCreationStats', () => {
  it('mystic int/wis with Dark-Elf bonuses', () => {
    const r = computeCreationStats('int', 'wis', DARK_ELF);
    expect(r.stats).toEqual({ str: 8n, dex: 10n, cha: 8n, wis: 10n, int: 13n });
    expect(r.raceBonus).toEqual({ str: 0n, dex: 2n, cha: 0n, wis: 0n, int: 1n });
  });

  it('secondary none does not throw (F1)', () => {
    const r = computeCreationStats('str', 'none', DARK_ELF);
    expect(r.stats).toEqual({ str: 12n, dex: 10n, cha: 8n, wis: 8n, int: 9n });
  });

  it('no class yet projects base plus race', () => {
    const r = computeCreationStats(undefined, undefined, DARK_ELF);
    expect(r.stats).toEqual({ str: 8n, dex: 10n, cha: 8n, wis: 8n, int: 9n });
  });

  it('keeps todays class math for primary equal to secondary and no race', () => {
    const r = computeCreationStats('int', 'int', null);
    expect(r.stats.int).toBe(14n);
    expect(r.raceBonus).toEqual({ str: 0n, dex: 0n, cha: 0n, wis: 0n, int: 0n });
  });

  it('unknown primary gives base stats plus race and never throws', () => {
    const r = computeCreationStats('strength', 'dex', DARK_ELF);
    expect(r.stats).toEqual({
      str: BASE_STAT,
      dex: BASE_STAT + 2n,
      cha: BASE_STAT,
      wis: BASE_STAT,
      int: BASE_STAT + 1n,
    });
  });
});

describe('levelUpBaseStats', () => {
  it('keeps the race bonus through a level-up', () => {
    const r = levelUpBaseStats({ str: 8n, dex: 10n, cha: 8n, wis: 10n, int: 13n }, 2n, DARK_ELF);
    expect(r.stats).toEqual({ str: 9n, dex: 11n, cha: 9n, wis: 12n, int: 16n });
    expect(r.raceBonus).toEqual({ str: 0n, dex: 2n, cha: 0n, wis: 0n, int: 1n });
  });

  it('matches todays rebuild when there is no usable bonus', () => {
    const fixtures = [
      { str: 8n, dex: 8n, cha: 8n, wis: 10n, int: 12n },
      { str: 12n, dex: 8n, cha: 8n, wis: 8n, int: 8n },
      { str: 10n, dex: 14n, cha: 8n, wis: 10n, int: 8n },
    ];
    for (const fx of fixtures) {
      for (const json of [null, undefined, 'not json', '{}', '{"primary":{"stat":"con","value":2}}']) {
        for (const level of [2n, 5n]) {
          const { primary, secondary } = detectPrimarySecondary(fx);
          const expected = computeBaseStatsForGenerated(primary, secondary, level);
          const r = levelUpBaseStats(fx, level, json);
          expect(r.stats).toEqual(expected);
          expect(r.raceBonus).toEqual({ str: 0n, dex: 0n, cha: 0n, wis: 0n, int: 0n });
        }
      }
    }
  });
});

describe('levelUpBaseStats legacy delta (WR-01)', () => {
  it('removes the legacy race-table delta before detection and does not add it to the result', () => {
    // A Human warrior at level 2: class rebuild plus cha +3 from the legacy race table.
    const l2 = computeBaseStatsForGenerated('str', 'dex', 2n);
    const onCharacter = { ...l2, cha: l2.cha + 3n };
    // Without the delta cha ties dex and the secondary is lost.
    expect(detectPrimarySecondary(onCharacter).secondary).not.toBe('dex');
    const r = levelUpBaseStats(onCharacter, 3n, null, { cha: 3n });
    expect(r.stats).toEqual(computeBaseStatsForGenerated('str', 'dex', 3n));
  });

  it('a null or empty legacy delta changes nothing', () => {
    const fx = { str: 12n, dex: 10n, cha: 8n, wis: 8n, int: 8n };
    const plain = levelUpBaseStats(fx, 2n, DARK_ELF).stats;
    expect(levelUpBaseStats(fx, 2n, DARK_ELF, null).stats).toEqual(plain);
    expect(levelUpBaseStats(fx, 2n, DARK_ELF, {}).stats).toEqual(plain);
  });
});

describe('import pin', () => {
  it('race_bonuses imports only ./class_stats and class_stats imports nothing', () => {
    expect(new Set(importSpecifiers('race_bonuses.ts'))).toEqual(new Set(['./class_stats']));
    expect(importSpecifiers('class_stats.ts')).toEqual([]);
  });
});
