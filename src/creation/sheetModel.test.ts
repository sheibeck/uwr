import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeCreationStats } from '@game-data/race_bonuses';
import type { StatKey } from '@game-data/class_stats';
import { buildSheet } from './sheetModel';
import type { CreationStateLike, SheetModel } from './sheetModel';

const RACE = JSON.stringify({
  primary: { stat: 'dex', value: 2 },
  secondary: { stat: 'int', value: 1 },
  flavor: 'Moves unseen through dim places.',
});

const state = (over: Partial<CreationStateLike> = {}): CreationStateLike => ({ ...over });

const raceState = (over: Partial<CreationStateLike> = {}): CreationStateLike =>
  state({ raceName: 'Dark-Elf', raceBonuses: RACE, ...over });

const byKey = (sheet: SheetModel) => Object.fromEntries(sheet.stats.map(s => [s.key, s]));
const values = (sheet: SheetModel) => Object.fromEntries(sheet.stats.map(s => [s.key, s.value]));

describe('buildSheet: empty', () => {
  const emptyChecks = (sheet: SheetModel) => {
    expect(sheet.name).toBeNull();
    expect(sheet.avatarInitial).toBeNull();
    expect(sheet.raceName).toBeNull();
    expect(sheet.archetype).toBeNull();
    expect(sheet.className).toBeNull();
    expect(sheet.trait).toBeNull();
    expect(sheet.abilityName).toBeNull();
    expect(sheet.stats).toHaveLength(5);
    for (const stat of sheet.stats) {
      expect(stat.value).toBe('—');
      expect(stat.annotation).toBeNull();
      expect(stat.boosted).toBe(false);
      expect(stat.raceBonus).toBe(0);
      expect(stat.ariaLabel).toBe(`${stat.label} unwritten`);
    }
  };

  it('a null state gives the empty model', () => {
    emptyChecks(buildSheet(null));
  });

  it('a state with no raceName gives the empty model', () => {
    emptyChecks(buildSheet(state()));
    emptyChecks(buildSheet(state({ raceBonuses: RACE })));
  });

  it('empty strings count as absent', () => {
    emptyChecks(
      buildSheet(state({ raceName: '', raceBonuses: RACE, archetype: '', className: '', characterName: '', classStats: '' })),
    );
  });

  it('a go-back row (race and later fields cleared) gives the empty model again', () => {
    emptyChecks(
      buildSheet(
        state({
          raceName: undefined,
          raceNarrative: undefined,
          raceBonuses: undefined,
          archetype: undefined,
          className: undefined,
          classStats: undefined,
          abilities: undefined,
          chosenAbilityIndex: undefined,
          characterName: undefined,
        }),
      ),
    );
  });
});

describe('buildSheet: stat order and labels', () => {
  it('is Strength, Dexterity, Intelligence, Wisdom, Charisma', () => {
    const sheet = buildSheet(null);
    expect(sheet.stats.map(s => s.label)).toEqual(['Strength', 'Dexterity', 'Intelligence', 'Wisdom', 'Charisma']);
    expect(sheet.stats.map(s => s.key)).toEqual(['str', 'dex', 'int', 'wis', 'cha']);
  });
});

describe('buildSheet: after the race', () => {
  const sheet = buildSheet(raceState());

  it('shows the projection of base plus the race bonus', () => {
    expect(values(sheet)).toEqual({ str: '8', dex: '10', cha: '8', wis: '8', int: '9' });
  });

  it('annotates the boosted stats with the race part and marks them boosted', () => {
    const stats = byKey(sheet);
    expect(stats.dex.annotation).toBe('+2 race');
    expect(stats.dex.raceBonus).toBe(2);
    expect(stats.int.annotation).toBe('+1 race');
    expect(stats.int.raceBonus).toBe(1);
    expect(stats.dex.boosted).toBe(true);
    expect(stats.int.boosted).toBe(true);
    for (const key of ['str', 'wis', 'cha'] as const) {
      expect(stats[key].annotation).toBeNull();
      expect(stats[key].boosted).toBe(false);
    }
  });

  it('uses the flavor as the trait and the race name as given', () => {
    expect(sheet.trait).toBe('Moves unseen through dim places.');
    expect(sheet.raceName).toBe('Dark-Elf');
    expect(sheet.archetype).toBeNull();
    expect(sheet.className).toBeNull();
  });

  it('writes the aria label with the race part for boosted stats only', () => {
    const stats = byKey(sheet);
    expect(stats.dex.ariaLabel).toBe('Dexterity 10, including 2 from your race');
    expect(stats.int.ariaLabel).toBe('Intelligence 9, including 1 from your race');
    expect(stats.str.ariaLabel).toBe('Strength 8');
  });

  it('shows the trait only when the flavor is a non-empty string', () => {
    expect(buildSheet(raceState({ raceBonuses: JSON.stringify({ primary: { stat: 'dex', value: 2 }, flavor: '   ' }) })).trait).toBeNull();
    expect(buildSheet(raceState({ raceBonuses: JSON.stringify({ primary: { stat: 'dex', value: 2 } }) })).trait).toBeNull();
  });
});

describe('buildSheet: archetype, class and ability', () => {
  it('capitalizes the archetype and ignores anything else', () => {
    expect(buildSheet(raceState({ archetype: 'mystic' })).archetype).toBe('Mystic');
    expect(buildSheet(raceState({ archetype: 'warrior' })).archetype).toBe('Warrior');
    expect(buildSheet(raceState({ archetype: 'rogue' })).archetype).toBeNull();
    expect(buildSheet(raceState({ archetype: 'Mystic' })).archetype).toBeNull();
  });

  it('shows the class name from the reveal, with the projection until the stats exist', () => {
    const sheet = buildSheet(raceState({ archetype: 'mystic', className: 'Tidecaller' }));
    expect(sheet.className).toBe('Tidecaller');
    expect(values(sheet)).toEqual({ str: '8', dex: '10', cha: '8', wis: '8', int: '9' });
  });

  it('adds the class base to the race bonus once classStats exist', () => {
    const sheet = buildSheet(
      raceState({ archetype: 'mystic', className: 'Tidecaller', classStats: JSON.stringify({ primaryStat: 'int', secondaryStat: 'wis' }) }),
    );
    expect(values(sheet)).toEqual({ str: '8', dex: '10', cha: '8', wis: '10', int: '13' });
    const stats = byKey(sheet);
    expect(stats.dex.annotation).toBe('+2 race');
    expect(stats.int.annotation).toBe('+1 race');
    expect(stats.wis.annotation).toBeNull();
    expect(stats.wis.boosted).toBe(true);
    expect(stats.str.boosted).toBe(false);
    expect(stats.int.ariaLabel).toBe('Intelligence 13, including 1 from your race');
    expect(stats.wis.ariaLabel).toBe('Wisdom 10');
  });

  it("boosts only the primary when secondaryStat is 'none'", () => {
    const sheet = buildSheet(raceState({ classStats: JSON.stringify({ primaryStat: 'str', secondaryStat: 'none' }) }));
    expect(values(sheet)).toEqual({ str: '12', dex: '10', cha: '8', wis: '8', int: '9' });
  });

  it('applies the finalize rule for a missing primary and secondary', () => {
    const sheet = buildSheet(raceState({ classStats: JSON.stringify({}) }));
    expect(values(sheet)).toEqual({ str: '12', dex: '10', cha: '8', wis: '8', int: '9' });
  });

  it('keeps the projection when classStats does not parse', () => {
    for (const classStats of ['{oops', 'null', '[]', '"text"', '5']) {
      expect(values(buildSheet(raceState({ classStats })))).toEqual({ str: '8', dex: '10', cha: '8', wis: '8', int: '9' });
    }
  });

  it('keeps base values with no annotations and no trait when raceBonuses is malformed', () => {
    for (const raceBonuses of ['{oops', '[]', 'null', '']) {
      const sheet = buildSheet(raceState({ raceBonuses }));
      expect(values(sheet)).toEqual({ str: '8', dex: '8', cha: '8', wis: '8', int: '8' });
      expect(sheet.trait).toBeNull();
      for (const stat of sheet.stats) {
        expect(stat.annotation).toBeNull();
        expect(stat.boosted).toBe(false);
      }
    }
    const missing = buildSheet(raceState({ raceBonuses: undefined }));
    expect(values(missing)).toEqual({ str: '8', dex: '8', cha: '8', wis: '8', int: '8' });
  });

  it('still shows class stats with no annotations when raceBonuses is malformed', () => {
    const sheet = buildSheet(raceState({ raceBonuses: '{oops', classStats: JSON.stringify({ primaryStat: 'int', secondaryStat: 'wis' }) }));
    expect(values(sheet)).toEqual({ str: '8', dex: '8', cha: '8', wis: '10', int: '12' });
    expect(sheet.stats.every(s => s.annotation === null)).toBe(true);
  });

  it('shows the chosen ability name by index', () => {
    const abilities = JSON.stringify([{ name: 'First' }, { name: 'Second' }, { name: 'Third' }]);
    expect(buildSheet(raceState({ abilities, chosenAbilityIndex: 1n })).abilityName).toBe('Second');
    expect(buildSheet(raceState({ abilities })).abilityName).toBeNull();
    expect(buildSheet(raceState({ abilities, chosenAbilityIndex: 9n })).abilityName).toBeNull();
  });
});

describe('buildSheet: the name comes last', () => {
  it('is null until the server stores it', () => {
    const sheet = buildSheet(raceState({ archetype: 'warrior', className: 'Vanguard' }));
    expect(sheet.name).toBeNull();
    expect(sheet.avatarInitial).toBeNull();
  });

  it('gives the name and its uppercase initial', () => {
    const sheet = buildSheet(raceState({ characterName: 'Mirel' }));
    expect(sheet.name).toBe('Mirel');
    expect(sheet.avatarInitial).toBe('M');
    expect(buildSheet(raceState({ characterName: 'mirel' })).avatarInitial).toBe('M');
  });
});

describe('buildSheet: parity with finalize (computeCreationStats)', () => {
  const fixtures: Array<[string, CreationStateLike]> = [
    ['mystic int/wis with a dex+int race', raceState({ classStats: JSON.stringify({ primaryStat: 'int', secondaryStat: 'wis' }) })],
    ['no classStats yet', raceState()],
    ["secondaryStat 'none'", raceState({ classStats: JSON.stringify({ primaryStat: 'cha', secondaryStat: 'none' }) })],
    [
      'str primary with a str-boosting race',
      raceState({
        raceBonuses: JSON.stringify({ primary: { stat: 'str', value: 3 }, secondary: { stat: 'wis', value: 2 } }),
        classStats: JSON.stringify({ primaryStat: 'str', secondaryStat: 'dex' }),
      }),
    ],
  ];

  it.each(fixtures)('%s', (_name, fixture) => {
    const sheet = buildSheet(fixture);
    let expected;
    const cs = fixture.classStats ? (JSON.parse(fixture.classStats) as { primaryStat?: string; secondaryStat?: string }) : null;
    if (cs) expected = computeCreationStats(cs.primaryStat || 'str', cs.secondaryStat || undefined, fixture.raceBonuses);
    else expected = computeCreationStats(undefined, undefined, fixture.raceBonuses);
    for (const key of ['str', 'dex', 'cha', 'wis', 'int'] as StatKey[]) {
      expect(byKey(sheet)[key].value).toBe(expected.stats[key].toString());
      expect(byKey(sheet)[key].raceBonus).toBe(Number(expected.raceBonus[key]));
    }
  });
});

describe('buildSheet: strings stay plain', () => {
  it('keeps markup in race, class, name and flavor verbatim', () => {
    const sheet = buildSheet(
      state({
        raceName: '<b>x</b>',
        raceBonuses: JSON.stringify({ primary: { stat: 'dex', value: 2 }, flavor: '<b>x</b>' }),
        className: '<img src=x onerror=alert(1)>',
        characterName: '<b>x</b>',
      }),
    );
    expect(sheet.raceName).toBe('<b>x</b>');
    expect(sheet.className).toBe('<img src=x onerror=alert(1)>');
    expect(sheet.name).toBe('<b>x</b>');
    expect(sheet.trait).toBe('<b>x</b>');
    expect(sheet.avatarInitial).toBe('<');
  });
});

describe('source pin', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/creation/sheetModel.ts'), 'utf8');

  it("imports the shared helper through the @game-data alias", () => {
    expect(source).toContain("from '@game-data/race_bonuses'");
    expect(source).toContain("from '@game-data/class_stats'");
    expect(source).not.toMatch(/spacetimedb\/src\/data/);
  });

  it('holds no copy of the class bonus constants (no literal 4n or 2n)', () => {
    expect(source).not.toMatch(/\b[24]n\b/);
  });
});
