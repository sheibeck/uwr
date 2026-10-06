import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPlaceholderRace } from '@game-data/race_bonuses';
import { NO_RACES_LINE, raceCardDescription, raceCardTags, selectRaceCards } from './raceCards';
import type { RaceDefinitionLike } from './raceCards';

const bonuses = (primary?: unknown, secondary?: unknown, flavor?: unknown) =>
  JSON.stringify({ primary, secondary, flavor });

const row = (over: Partial<RaceDefinitionLike> & { id: bigint }): RaceDefinitionLike => ({
  name: `Race ${over.id}`,
  narrative: 'A people of the deep woods. They keep to themselves.',
  bonusesJson: bonuses({ stat: 'dex', value: 2 }, { stat: 'int', value: 1 }, 'Quick and watchful.'),
  createdAt: { microsSinceUnixEpoch: over.id * 1000n },
  ...over,
});

describe('selectRaceCards', () => {
  it('gives null while the subscription has not applied, whatever the rows', () => {
    expect(selectRaceCards([], false)).toBeNull();
    expect(selectRaceCards([row({ id: 1n })], false)).toBeNull();
  });

  it('gives an empty list for an applied subscription with no rows', () => {
    expect(selectRaceCards([], true)).toEqual([]);
  });

  it('gives only the stored races when there are fewer than 3', () => {
    expect(selectRaceCards([row({ id: 1n })], true)?.map(c => c.id)).toEqual([1n]);
    expect(selectRaceCards([row({ id: 1n }), row({ id: 2n })], true)?.map(c => c.id)).toEqual([2n, 1n]);
  });

  it('gives the newest 3 by createdAt of 5 rows', () => {
    const rows = [1n, 2n, 3n, 4n, 5n].map(id => row({ id }));
    expect(selectRaceCards(rows, true)?.map(c => c.id)).toEqual([5n, 4n, 3n]);
  });

  it('is deterministic for any input order', () => {
    const rows = [1n, 2n, 3n, 4n, 5n].map(id => row({ id }));
    const forward = selectRaceCards(rows, true)?.map(c => c.id);
    const backward = selectRaceCards([...rows].reverse(), true)?.map(c => c.id);
    const shuffled = selectRaceCards([rows[2], rows[4], rows[0], rows[3], rows[1]], true)?.map(c => c.id);
    expect(backward).toEqual(forward);
    expect(shuffled).toEqual(forward);
  });

  it('breaks createdAt ties with the larger id', () => {
    const same = { microsSinceUnixEpoch: 5000n };
    const rows = [1n, 2n, 3n, 4n].map(id => row({ id, createdAt: same }));
    expect(selectRaceCards(rows, true)?.map(c => c.id)).toEqual([4n, 3n, 2n]);
    expect(selectRaceCards([...rows].reverse(), true)?.map(c => c.id)).toEqual([4n, 3n, 2n]);
  });

  it('puts a newer createdAt ahead of a larger id', () => {
    const old = row({ id: 9n, createdAt: { microsSinceUnixEpoch: 1n } });
    const fresh = row({ id: 1n, createdAt: { microsSinceUnixEpoch: 99n } });
    expect(selectRaceCards([old, fresh], true)?.map(c => c.id)).toEqual([1n, 9n]);
  });

  it.each(['Unknown', 'unknown', ' UNKNOWN '])(
    'never offers a legacy row saved under the reserved placeholder name (%j), even when it is the newest',
    (placeholder) => {
      const rows = [
        row({ id: 1n }),
        row({ id: 2n }),
        row({ id: 3n }),
        row({ id: 9n, name: placeholder, createdAt: { microsSinceUnixEpoch: 99_999n } }),
      ];
      const cards = selectRaceCards(rows, true);
      expect(cards?.map(c => c.id)).toEqual([3n, 2n, 1n]);
      expect(cards?.some(c => isPlaceholderRace(c.name) || isPlaceholderRace(c.sends))).toBe(false);
    },
  );

  it('gives an empty list when the only stored row is the placeholder', () => {
    expect(selectRaceCards([row({ id: 1n, name: 'Unknown' })], true)).toEqual([]);
  });

  it('does not reorder the caller array', () => {
    const rows = [row({ id: 1n }), row({ id: 3n }), row({ id: 2n })];
    selectRaceCards(rows, true);
    expect(rows.map(r => r.id)).toEqual([1n, 3n, 2n]);
  });

  it('builds the card fields from the row', () => {
    const [card] = selectRaceCards([row({ id: 1n, name: 'Dark-Elf' })], true)!;
    expect(card.name).toBe('Dark-Elf');
    expect(card.sends).toBe('Dark-Elf');
    expect(card.tags).toEqual(['+2 DEX', '+1 INT']);
    expect(card.description).toBe('Quick and watchful.');
    expect(card.ariaLabel).toBe('Dark-Elf, +2 DEX, +1 INT. Choose this race.');
  });

  it('aria label is just the name when there are no tags', () => {
    const [card] = selectRaceCards([row({ id: 1n, name: 'Saltkin', bonusesJson: 'not json' })], true)!;
    expect(card.tags).toEqual([]);
    expect(card.ariaLabel).toBe('Saltkin. Choose this race.');
    expect(card.name).toBe('Saltkin');
  });

  it('keeps an img-onerror name verbatim in name, sends and aria label', () => {
    const name = '<img src=x onerror=alert(1)>';
    const [card] = selectRaceCards([row({ id: 1n, name })], true)!;
    expect(card.name).toBe(name);
    expect(card.sends).toBe(name);
    expect(card.ariaLabel).toContain(name);
    expect(card.ariaLabel).toBe(`${name}, +2 DEX, +1 INT. Choose this race.`);
  });

  it('keeps markup in the description verbatim', () => {
    const [card] = selectRaceCards([row({ id: 1n, bonusesJson: bonuses(undefined, undefined, '<b>x</b>') })], true)!;
    expect(card.description).toBe('<b>x</b>');
  });
});

describe('raceCardTags', () => {
  it('lists primary first as a whole number with an uppercase stat code', () => {
    expect(raceCardTags(bonuses({ stat: 'dex', value: 2 }, { stat: 'int', value: 1 }))).toEqual(['+2 DEX', '+1 INT']);
  });

  it('puts the primary first even when secondary is written first in the JSON', () => {
    expect(raceCardTags('{"secondary":{"stat":"wis","value":1},"primary":{"stat":"str","value":3}}')).toEqual(['+3 STR', '+1 WIS']);
  });

  it('drops only the tag with an unknown stat code', () => {
    expect(raceCardTags(bonuses({ stat: 'luck', value: 2 }, { stat: 'int', value: 1 }))).toEqual(['+1 INT']);
    expect(raceCardTags(bonuses({ stat: 'dex', value: 2 }, { stat: 'luck', value: 1 }))).toEqual(['+2 DEX']);
  });

  it('drops a tag with a missing value', () => {
    expect(raceCardTags(bonuses({ stat: 'dex' }, { stat: 'int', value: 1 }))).toEqual(['+1 INT']);
  });

  it('gives no tags for malformed JSON, empty or non-object input', () => {
    expect(raceCardTags('{oops')).toEqual([]);
    expect(raceCardTags('')).toEqual([]);
    expect(raceCardTags('[]')).toEqual([]);
    expect(raceCardTags('null')).toEqual([]);
  });
});

describe('raceCardDescription', () => {
  it('uses the trimmed flavor when present', () => {
    expect(raceCardDescription(bonuses(undefined, undefined, '  Sharp-eyed.  '), 'Ignored. Entirely.')).toBe('Sharp-eyed.');
  });

  it('falls back to the first sentence of the narrative', () => {
    expect(raceCardDescription('{}', 'They roam the salt flats. They trade in glass.')).toBe('They roam the salt flats.');
    expect(raceCardDescription('not json', 'Do they roam? Nobody knows.')).toBe('Do they roam?');
  });

  it('uses the whole narrative when it has no sentence end', () => {
    expect(raceCardDescription('{}', 'A quiet people')).toBe('A quiet people');
  });

  it('does not split a sentence on a decimal point', () => {
    expect(raceCardDescription('{}', 'They stand 2.5 meters tall. Gentle.')).toBe('They stand 2.5 meters tall.');
  });

  it('cuts a long first sentence at a word boundary with an ellipsis', () => {
    const word = 'wandering';
    const narrative = Array.from({ length: 40 }, () => word).join(' ') + '.';
    const out = raceCardDescription('{}', narrative);
    expect(out.endsWith('…')).toBe(true);
    const body = out.slice(0, -1);
    expect(body.length).toBeLessThanOrEqual(160);
    expect(body.endsWith(' ')).toBe(false);
    expect(body.split(' ').every(w => w === word)).toBe(true);
  });

  it('hard cuts a single word longer than 160 characters', () => {
    const out = raceCardDescription('{}', 'x'.repeat(400));
    expect(out).toBe('x'.repeat(160) + '…');
  });

  it('does not add an ellipsis at exactly 160 characters', () => {
    const exact = 'y'.repeat(160);
    expect(raceCardDescription('{}', exact)).toBe(exact);
  });

  it('gives an empty string for an empty narrative with no flavor', () => {
    expect(raceCardDescription('{}', '')).toBe('');
    expect(raceCardDescription('{}', '   ')).toBe('');
  });

  it('collapses newlines inside the sentence to single spaces', () => {
    expect(raceCardDescription('{}', 'They roam\nthe flats. More.')).toBe('They roam the flats.');
  });
});

describe('NO_RACES_LINE', () => {
  it('is the UI-SPEC copy', () => {
    expect(NO_RACES_LINE).toBe('No races have been written yet. Describe one, or choose Surprise me.');
  });
});

describe('source pin', () => {
  it('reads bonuses through the shared server parser', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/creation/raceCards.ts'), 'utf8');
    expect(source).toContain("from '@game-data/race_bonuses'");
    expect(source).toContain('parseRaceBonuses');
    expect(source).toContain('isPlaceholderRace');
    expect(source).not.toMatch(/\bv-html\b|innerHTML/);
  });
});
