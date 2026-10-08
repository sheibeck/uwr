import { describe, it, expect } from 'vitest';
import {
  CREATURE_DENSITY_WORDS,
  RESOURCE_DENSITY_WORDS,
  DENSITY_SR_PREFIX,
  CREATURE_LINES,
  RESOURCE_LINES,
  RATING_LINES,
  GROUP_HINTS,
  NUMBER_WORDS,
  PLACE_NOUN_BY_TERRAIN,
  DEFAULT_PLACE_NOUN,
  NOTHING_HUNTS,
  SLAIN_NAMED_LINE,
  numberWord,
  capitalNumberWord,
  densityWord,
  placeNounFor,
  creatureLine,
  resourceLine,
  ratingLine,
  groupHint,
  sentenceCase,
  ambushVerbForms,
  ambushLine,
  pullLeadIn,
  travelQuiet,
  densityDownLine,
  densityGoneLine,
  overrunSettleLine,
  vacuumLine,
  gatherResult,
  lastGatherLine,
  harvestCapRefusal,
  pullRefusal,
  outOfTimeRefusal,
  exhaustedRefusal,
  allExhaustedLine,
  encounterHeading,
  encounterSource,
  worldEventName,
  rumorItem,
} from './density_lines';

const PRONOUN = /\b(they|them|their|its|it)\b/i;
const BANNED = new RegExp('rip' + 'ple', 'i');
const TEMPERAMENTS = ['aggressive', 'wary', 'skittish'] as const;
const LEVELS = [0, 1, 2, 3] as const;

describe('level words', () => {
  it('index the creature and resource words by level', () => {
    expect([...CREATURE_DENSITY_WORDS]).toEqual(['Wiped out', 'Scarce', 'Stable', 'Overrun']);
    expect([...RESOURCE_DENSITY_WORDS]).toEqual(['Exhausted', 'Sparse', 'Plentiful', 'Abundant']);
    expect(DENSITY_SR_PREFIX).toEqual({ creature: 'Population: ', resource: 'Supply: ' });
    expect(densityWord('creature', 2)).toBe('Stable');
    expect(densityWord('resource', 3)).toBe('Abundant');
    expect(densityWord('creature', 9)).toBe('Overrun');
    expect(densityWord('resource', -1)).toBe('Exhausted');
  });

  it('number words run one to four', () => {
    expect([...NUMBER_WORDS]).toEqual(['one', 'two', 'three', 'four']);
    expect(numberWord(2)).toBe('two');
    expect(capitalNumberWord(3)).toBe('Three');
  });
});

describe('place nouns', () => {
  it('a non-empty place noun wins', () => {
    expect(placeNounFor({ placeNoun: 'the pans', terrainType: 'woods' })).toBe('the pans');
  });

  it('falls back to the terrain noun, then the default', () => {
    expect(placeNounFor({ placeNoun: '', terrainType: 'woods' })).toBe(PLACE_NOUN_BY_TERRAIN.woods);
    expect(placeNounFor({ placeNoun: '', terrainType: 'woods' })).toBe('the woods');
    expect(placeNounFor({ placeNoun: '  ', terrainType: 'Mountains' })).toBe('the slopes');
    expect(placeNounFor({ terrainType: 'nowhere' })).toBe('the area');
    expect(placeNounFor({})).toBe(DEFAULT_PLACE_NOUN);
    expect(DEFAULT_PLACE_NOUN).toBe('the area');
  });
});

describe('creature lines', () => {
  it('fills the Overrun aggressive line with nouns, not a pronoun', () => {
    expect(
      creatureLine({ plural: 'goblins', singular: 'goblin', temperament: 'aggressive', level: 3, place: 'the orchard' }),
    ).toBe('Goblins swarm the orchard, and every last goblin has noticed you.');
  });

  it('gives a capitalized sentence with the noun for every level and temperament', () => {
    for (const temperament of TEMPERAMENTS) {
      expect(CREATURE_LINES[temperament]).toHaveLength(4);
      for (const level of LEVELS) {
        const line = creatureLine({ plural: 'skitterers', singular: 'skitterer', temperament, level, place: 'the pans' });
        expect(line.length).toBeGreaterThan(0);
        expect(line[0]).toBe(line[0]!.toUpperCase());
        expect(line.toLowerCase().includes('skitterer')).toBe(true);
        expect(line.includes('the pans')).toBe(true);
        expect(line).not.toMatch(/[{}]/);
      }
    }
  });

  it('an unknown temperament uses the wary row', () => {
    for (const level of LEVELS) {
      const args = { plural: 'wolves', singular: 'wolf', level, place: 'the woods' };
      expect(creatureLine({ ...args, temperament: 'grumpy' })).toBe(creatureLine({ ...args, temperament: 'wary' }));
    }
  });

  it('defaults an empty place to the area', () => {
    expect(creatureLine({ plural: 'rats', singular: 'rat', temperament: 'wary', level: 0, place: '' })).toBe(
      'The rats are gone from the area.',
    );
  });
});

describe('resource lines', () => {
  it('level 0 reads exhausted, lowercase resource', () => {
    expect(resourceLine({ resource: 'Panlight Salt', level: 0, place: 'the pans' })).toBe(
      'There is no panlight salt left in the pans, for now.',
    );
  });

  it('level 3 keeps the resource as written at the start', () => {
    expect(resourceLine({ resource: 'Panlight Salt', level: 3, place: 'the pans' })).toBe(
      'Panlight Salt lies thick across the pans.',
    );
  });

  it('has a line for every level', () => {
    expect(RESOURCE_LINES).toHaveLength(4);
    for (const level of LEVELS) {
      const line = resourceLine({ resource: 'ash', level, place: 'the slopes' });
      expect(line).toMatch(/^[A-Z]/);
      expect(line).not.toMatch(/[{}]/);
    }
  });
});

describe('rating lines and group hints', () => {
  it('rating lines match the UI-SPEC; unknown is empty', () => {
    expect(ratingLine('safe')).toBe('Nothing here will hurt you.');
    expect(ratingLine('quiet')).toBe('Something lives here, but it keeps to itself.');
    expect(ratingLine('risky')).toBe('Watch the edges. Things here will come for you.');
    expect(ratingLine('deadly')).toBe('You should not be here alone. You are not alone.');
    expect(ratingLine('unknown')).toBe('');
    expect(RATING_LINES.unknown).toBe('');
  });

  it('group hints by level, none when wiped out', () => {
    expect(groupHint(0)).toBe('');
    expect(groupHint(1)).toBe('Expect one, alone');
    expect(groupHint(2)).toBe('Expect one or two');
    expect(groupHint(3)).toBe('Expect a crowd');
    expect(GROUP_HINTS).toHaveLength(4);
  });
});

describe('sentenceCase', () => {
  it('capitalizes the first letter only', () => {
    expect(sentenceCase('skitterers')).toBe('Skitterers');
    expect(sentenceCase('brine sentinels')).toBe('Brine sentinels');
    expect(sentenceCase('')).toBe('');
  });
});

describe('ambush grammar', () => {
  it('a plain regular verb adds s for one', () => {
    expect(ambushVerbForms('break', 'from the trees')).toEqual({ one: 'breaks', many: 'break', rest: 'from the trees' });
    expect(ambushVerbForms('burst', 'up through the salt')).toEqual({
      one: 'bursts',
      many: 'burst',
      rest: 'up through the salt',
    });
  });

  it('anything else falls back to burst out of the dark', () => {
    const fallback = { one: 'bursts', many: 'burst', rest: 'out of the dark' };
    for (const verb of ['rush', 'Break!', 'go', 'fly', 'fix', 'buzz', 'lurches', 'catch', 'ab', 'overextending', '', 'peel off']) {
      expect(ambushVerbForms(verb, 'from the trees')).toEqual(fallback);
    }
  });

  it('enter, one and many', () => {
    const args = { phase: 'enter' as const, party: false, placeName: 'Glass Orchard', singular: 'goblin', plural: 'goblins', verb: 'break', rest: 'from the trees' };
    expect(ambushLine({ ...args, count: 3 })).toBe('As you cross into Glass Orchard, three goblins break from the trees!');
    expect(ambushLine({ ...args, count: 1 })).toBe('As you cross into Glass Orchard, one goblin breaks from the trees!');
    expect(ambushLine({ ...args, count: 2, party: true })).toBe(
      'As your party crosses into Glass Orchard, two goblins break from the trees!',
    );
  });

  it('leave, gather and other lead-ins', () => {
    const args = { party: false, placeName: 'Mother Pan Flats', count: 2, singular: 'skitterer', plural: 'skitterers', verb: 'burst', rest: 'up through the salt' };
    expect(ambushLine({ ...args, phase: 'leave' })).toBe(
      'As you try to leave Mother Pan Flats, two skitterers burst up through the salt!',
    );
    expect(ambushLine({ ...args, phase: 'leave', party: true })).toMatch(/^As your party tries to leave Mother Pan Flats, /);
    expect(ambushLine({ ...args, phase: 'gather', resource: 'Panlight Salt' })).toBe(
      'While you gather panlight salt, two skitterers burst up through the salt!',
    );
    expect(ambushLine({ ...args, phase: 'other' })).toBe('Before you can move on, two skitterers burst up through the salt!');
  });

  it('an irregular verb falls back in the line', () => {
    const args = { phase: 'enter' as const, party: false, placeName: 'Glass Orchard', singular: 'goblin', plural: 'goblins', rest: 'from the trees' };
    expect(ambushLine({ ...args, count: 1, verb: 'rush' })).toBe('As you cross into Glass Orchard, one goblin bursts out of the dark!');
    expect(ambushLine({ ...args, count: 4, verb: 'Break!' })).toBe('As you cross into Glass Orchard, four goblins burst out of the dark!');
  });
});

describe('feed lines', () => {
  it('pull lead-in, one and many', () => {
    expect(pullLeadIn(2, 'skitterer', 'skitterers')).toBe('You make some noise. Two skitterers answer.');
    expect(pullLeadIn(1, 'skitterer', 'skitterers')).toBe('You make some noise. One skitterer answers.');
  });

  it('quiet travel, alone and as a party', () => {
    expect(travelQuiet('Glass Orchard', false)).toBe('You travel to Glass Orchard. Nothing follows you. This time.');
    expect(travelQuiet('Glass Orchard', true)).toBe('Your party travels to Glass Orchard. Nothing follows you. This time.');
  });

  it('density changes', () => {
    expect(densityDownLine('Skitterers', 'Mother Pan Flats', 'scarce')).toBe(
      'Skitterers thin out around Mother Pan Flats. Skitterers read scarce now.',
    );
    expect(densityDownLine('skitterers', 'Mother Pan Flats', 'Stable')).toBe(
      'Skitterers thin out around Mother Pan Flats. Skitterers read stable now.',
    );
    expect(densityGoneLine('skitterers', 'Mother Pan Flats')).toBe('The skitterers are gone from Mother Pan Flats.');
    expect(overrunSettleLine('Skitterers', 'Mother Pan Flats')).toBe(
      'Skitterers around Mother Pan Flats settle back down to stable.',
    );
    expect(vacuumLine('skitterers', 'goblins', 'Mother Pan Flats')).toBe(
      'With the skitterers gone, goblins move into Mother Pan Flats. Fast.',
    );
  });

  it('gather results and refusals', () => {
    expect(gatherResult('Panlight Salt', 2)).toBe('You gather Panlight Salt ×2.');
    expect(gatherResult('Panlight Salt', 1n)).toBe('You gather Panlight Salt ×1.');
    expect(lastGatherLine('Panlight Salt')).toBe('That is the last of the panlight salt here, for a while.');
    expect(harvestCapRefusal()).toBe('You have taken what you can carry from here for now.');
    expect(pullRefusal('skitterers')).toBe('There are no skitterers here to pull.');
    expect(outOfTimeRefusal('Moonmoss', true)).toBe('You will not find moonmoss here until nightfall.');
    expect(outOfTimeRefusal('Sunpetal', false)).toBe('You will not find sunpetal here until morning.');
    expect(exhaustedRefusal('Panlight Salt', 'the pans')).toBe('There is no panlight salt left in the pans, for now.');
    expect(exhaustedRefusal('Panlight Salt', '')).toBe('There is no panlight salt left in the area, for now.');
  });

  it('empty and slain lines', () => {
    expect(NOTHING_HUNTS).toBe('Nothing hunts here now.');
    expect(allExhaustedLine('the pans')).toBe('Everything worth taking has been picked from the pans.');
    expect(SLAIN_NAMED_LINE).toBe('Slain · back after a long rest');
  });
});

describe('encounter heading and source', () => {
  it('heading with and without a title', () => {
    expect(encounterHeading('Goblins', 3)).toBe('Encounter · Goblins · 3 left');
    expect(encounterHeading('', 2)).toBe('Encounter · 2 left');
  });

  it('source by origin', () => {
    expect(encounterSource('pull', 'Skitterers', 'Stable')).toBe('Pulled from Skitterers that read stable here.');
    expect(encounterSource('ambush_enter')).toBe('Ambushed on the way in.');
    expect(encounterSource('ambush_leave')).toBe('Ambushed on the way out.');
    expect(encounterSource('named')).toBe('A named fight. No one else comes.');
    expect(encounterSource('ambush_gather')).toBe('Ambushed while you gather.');
    expect(encounterSource('ambush_other')).toBe('Ambushed.');
    expect(encounterSource('')).toBe('');
    expect(encounterSource('something_else')).toBe('');
  });
});

describe('World event names and rumour items', () => {
  it('names follow the World event hooks table', () => {
    expect(worldEventName({ kind: 'overrun_surge', plural: 'skitterers', placeName: 'Mother Pan Flats' })).toBe(
      'Skitterers swarm Mother Pan Flats',
    );
    expect(worldEventName({ kind: 'family_wiped', familyName: 'Salt-Crust Skitterers', placeName: 'Mother Pan Flats' })).toBe(
      'The Salt-Crust Skitterers are gone from Mother Pan Flats',
    );
    expect(worldEventName({ kind: 'family_wiped', plural: 'skitterers', placeName: 'Mother Pan Flats' })).toBe(
      'The skitterers are gone from Mother Pan Flats',
    );
    expect(
      worldEventName({ kind: 'vacuum_takeover', oldPlural: 'skitterers', newPlural: 'goblins', placeName: 'Mother Pan Flats' }),
    ).toBe('With the skitterers gone, goblins move into Mother Pan Flats');
    expect(worldEventName({ kind: 'region_trend', regionName: 'Kesterlane Basin', trend: 'wilder' })).toBe(
      'Kesterlane Basin grows wilder',
    );
    expect(worldEventName({ kind: 'region_trend', regionName: 'Kesterlane Basin', trend: 'quieter' })).toBe(
      'Kesterlane Basin grows quieter',
    );
  });

  it('rumour items are short lowercase clauses', () => {
    expect(rumorItem({ kind: 'family_wiped', plural: 'skitterers', placeName: 'Mother Pan Flats' })).toBe(
      'the skitterers are gone from Mother Pan Flats',
    );
    expect(rumorItem({ kind: 'overrun_surge', plural: 'Brine sentinels', placeName: 'the Salt Stair' })).toBe(
      'brine sentinels swarm the Salt Stair',
    );
    expect(
      rumorItem({ kind: 'vacuum_takeover', oldPlural: 'skitterers', newPlural: 'goblins', placeName: 'Mother Pan Flats' }),
    ).toBe('with the skitterers gone, goblins have moved into Mother Pan Flats');
    expect(rumorItem({ kind: 'region_trend', regionName: 'Kesterlane Basin', trend: 'wilder' })).toBe(
      'Kesterlane Basin grows wilder',
    );
  });
});

describe('no pronoun for a creature, no banned word', () => {
  function allOutputs(): string[] {
    const out: string[] = [];
    const nouns = [
      { plural: 'goblins', singular: 'goblin' },
      { plural: 'brine sentinels', singular: 'brine sentinel' },
    ];
    for (const n of nouns) {
      for (const temperament of [...TEMPERAMENTS, 'unknown']) {
        for (const level of LEVELS) {
          out.push(creatureLine({ ...n, temperament, level, place: 'the orchard' }));
          out.push(creatureLine({ ...n, temperament, level, place: '' }));
        }
      }
      for (const count of [1, 2, 3, 4]) {
        for (const phase of ['enter', 'leave', 'gather', 'other'] as const) {
          for (const party of [false, true]) {
            for (const verb of ['break', 'rush']) {
              out.push(
                ambushLine({ phase, party, placeName: 'Glass Orchard', resource: 'Panlight Salt', count, ...n, verb, rest: 'from the trees' }),
              );
            }
          }
        }
        out.push(pullLeadIn(count, n.singular, n.plural));
        out.push(gatherResult('Panlight Salt', count));
      }
      out.push(densityDownLine(n.plural, 'Glass Orchard', 'scarce'));
      out.push(densityGoneLine(n.plural, 'Glass Orchard'));
      out.push(overrunSettleLine(n.plural, 'Glass Orchard'));
      out.push(vacuumLine(n.plural, 'wolves', 'Glass Orchard'));
      out.push(pullRefusal(n.plural));
      out.push(encounterSource('pull', n.plural, 'Overrun'));
      for (const kind of ['overrun_surge', 'family_wiped', 'vacuum_takeover', 'region_trend'] as const) {
        const shift = { kind, plural: n.plural, familyName: 'Salt-Crust Skitterers', oldPlural: n.plural, newPlural: 'wolves', placeName: 'Glass Orchard', regionName: 'Kesterlane Basin', trend: 'wilder' as const };
        out.push(worldEventName(shift));
        out.push(rumorItem(shift));
      }
    }
    for (const level of LEVELS) out.push(resourceLine({ resource: 'Panlight Salt', level, place: 'the pans' }));
    for (const travel of [false, true]) out.push(travelQuiet('Glass Orchard', travel));
    out.push(lastGatherLine('Panlight Salt'), harvestCapRefusal(), outOfTimeRefusal('Moonmoss', true), outOfTimeRefusal('Moonmoss', false));
    out.push(exhaustedRefusal('Panlight Salt', 'the pans'), allExhaustedLine('the pans'), NOTHING_HUNTS, SLAIN_NAMED_LINE);
    for (const origin of ['', 'ambush_enter', 'ambush_leave', 'ambush_gather', 'ambush_other', 'named']) out.push(encounterSource(origin));
    for (const level of LEVELS) out.push(groupHint(level));
    out.push(encounterHeading('Goblins', 3), encounterHeading('', 1));
    return out;
  }

  it('no density, ambush, feed, World event or rumour output uses they, them, their, its or it', () => {
    const outputs = allOutputs();
    expect(outputs.length).toBeGreaterThan(200);
    expect(outputs.filter((s) => PRONOUN.test(s))).toEqual([]);
  });

  it('no output or template carries the banned World-event word', () => {
    const templates = [
      ...Object.values(CREATURE_LINES).flat(),
      ...RESOURCE_LINES,
      ...Object.values(RATING_LINES),
      ...GROUP_HINTS,
      ...CREATURE_DENSITY_WORDS,
      ...RESOURCE_DENSITY_WORDS,
    ];
    expect([...allOutputs(), ...templates].filter((s) => BANNED.test(s))).toEqual([]);
  });

  it('the creature templates carry no pronoun and no "every one of them"', () => {
    const lines = Object.values(CREATURE_LINES).flat();
    expect(lines.filter((s) => PRONOUN.test(s))).toEqual([]);
    expect(lines.some((s) => s.includes('every one of them'))).toBe(false);
  });
});
