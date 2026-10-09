import { describe, expect, it } from 'vitest';
import { bossOrNamedAt, levelLabel, ratingClass, ratingForPlace, viewerRatingLevel } from './rating';
import type { RatingPool } from './rating';

// The client rating model (51.3.1.1 UI-SPEC "Rating Marks", D-08, D-33, D-34): one model over the
// shared @game-data/place_rating rule, so the header, Here card, exits, chips and location line agree.

const WILD = { isSafe: false, terrainType: 'woods' };
const TOWN = { isSafe: true, terrainType: 'town' };
// An uncharted edge is stored as safe by the server; it still reads Danger unknown.
const EDGE = { isSafe: true, terrainType: 'uncharted' };

function pool(over: Partial<RatingPool> = {}): RatingPool {
  return { kind: 'creature', level: 2n, lvLo: 4n, lvHi: 5n, ...over };
}

describe('ratingForPlace', () => {
  it('a safe place reads Safe with its line and no range', () => {
    expect(
      ratingForPlace({ location: TOWN, poolsHere: [pool()], ready: true, playerLevel: 4n, bossOrNamedHere: false }),
    ).toEqual({ key: 'safe', word: 'Safe', line: 'Nothing here will hurt you.', levelLabel: '' });
  });

  it('a safe place reads Safe even before its pools apply', () => {
    const rating = ratingForPlace({ location: TOWN, poolsHere: [], ready: false, playerLevel: null, bossOrNamedHere: false });
    expect(rating.key).toBe('safe');
    expect(rating.word).toBe('Safe');
  });

  it('a non-safe place whose pools have not applied is Unknown with no word, never Safe; the range stays', () => {
    const rating = ratingForPlace({ location: WILD, poolsHere: [pool()], ready: false, playerLevel: 4n, bossOrNamedHere: false });
    expect(rating).toEqual({ key: 'unknown', word: '', line: '', levelLabel: 'Lv 4–5' });
    const empty = ratingForPlace({ location: WILD, poolsHere: [], ready: false, playerLevel: 4n, bossOrNamedHere: false });
    expect(empty).toEqual({ key: 'unknown', word: '', line: '', levelLabel: '' });
  });

  it('a null player level is treated as not ready', () => {
    const rating = ratingForPlace({ location: WILD, poolsHere: [pool()], ready: true, playerLevel: null, bossOrNamedHere: false });
    expect(rating.key).toBe('unknown');
    expect(rating.word).toBe('');
  });

  it('an uncharted place reads Danger unknown with no line and no range', () => {
    expect(
      ratingForPlace({ location: EDGE, poolsHere: [pool()], ready: true, playerLevel: 4n, bossOrNamedHere: true }),
    ).toEqual({ key: 'unknown', word: 'Danger unknown', line: '', levelLabel: '' });
  });

  it('Goblins Overrun at lvHi 6 is Deadly for a level-3 viewer', () => {
    const rating = ratingForPlace({
      location: WILD,
      poolsHere: [pool({ level: 3n, lvLo: 5n, lvHi: 6n })],
      ready: true,
      playerLevel: 3n,
      bossOrNamedHere: false,
    });
    expect(rating).toEqual({
      key: 'deadly',
      word: 'Deadly',
      line: 'You should not be here alone. You are not alone.',
      levelLabel: 'Lv 5–6',
    });
  });

  it('a living named enemy or boss raises Quiet to Risky (D-34)', () => {
    const input = { location: WILD, poolsHere: [pool({ level: 1n, lvLo: 4n, lvHi: 4n })], ready: true, playerLevel: 4n };
    const quiet = ratingForPlace({ ...input, bossOrNamedHere: false });
    expect(quiet.key).toBe('quiet');
    expect(quiet.line).toBe('Something lives here, but it keeps to itself.');
    const risky = ratingForPlace({ ...input, bossOrNamedHere: true });
    expect(risky.key).toBe('risky');
    expect(risky.word).toBe('Risky');
    expect(risky.line).toBe('Watch the edges. Things here will come for you.');
  });

  it('only creature pools rate a place and set its range; resource pools do not', () => {
    const rating = ratingForPlace({
      location: WILD,
      poolsHere: [pool({ kind: 'resource', level: 3n, lvLo: 0n, lvHi: 0n }), pool({ level: 1n, lvLo: 2n, lvHi: 3n })],
      ready: true,
      playerLevel: 4n,
      bossOrNamedHere: false,
    });
    expect(rating.key).toBe('quiet');
    expect(rating.levelLabel).toBe('Lv 2–3');
  });

  it('a non-safe place with every family wiped out reads Quiet, never Safe; the range still describes them', () => {
    const rating = ratingForPlace({
      location: WILD,
      poolsHere: [pool({ level: 0n, lvLo: 7n, lvHi: 9n })],
      ready: true,
      playerLevel: 4n,
      bossOrNamedHere: false,
    });
    expect(rating.key).toBe('quiet');
    expect(rating.levelLabel).toBe('Lv 7–9');
  });

  it('no rendered string carries a count, a home level or a cap value (privacy)', () => {
    const rating = ratingForPlace({
      location: WILD,
      poolsHere: [pool({ level: 3n, lvLo: 12n, lvHi: 14n })],
      ready: true,
      playerLevel: 4n,
      bossOrNamedHere: false,
    });
    const text = `${rating.word} ${rating.line} ${rating.levelLabel}`;
    expect(text.replace('Lv 12–14', '')).not.toMatch(/\d/);
  });
});

describe('levelLabel', () => {
  it("reads 'Lv 4–5', or 'Lv 4' when equal, or '' with no families", () => {
    expect(levelLabel([{ lvLo: 4n, lvHi: 5n }])).toBe('Lv 4–5');
    expect(levelLabel([{ lvLo: 4n, lvHi: 4n }])).toBe('Lv 4');
    expect(levelLabel([{ lvLo: 6n, lvHi: 8n }, { lvLo: 4n, lvHi: 5n }])).toBe('Lv 4–8');
    expect(levelLabel([])).toBe('');
  });
});

describe('ratingClass', () => {
  it('maps each key to its rate-* class', () => {
    expect(ratingClass('risky')).toBe('rate-risky');
    expect(ratingClass('safe')).toBe('rate-safe');
    expect(ratingClass('quiet')).toBe('rate-quiet');
    expect(ratingClass('deadly')).toBe('rate-deadly');
    expect(ratingClass('unknown')).toBe('rate-unknown');
  });
});

describe('bossOrNamedAt', () => {
  const templates = [
    { id: 1n, isBoss: true },
    { id: 2n, isBoss: false },
    { id: 3n, isBoss: undefined },
  ];

  it('a living named enemy of the viewer at the place counts; a slain one or one elsewhere does not', () => {
    expect(bossOrNamedAt(10n, [{ locationId: 10n, isAlive: true }], [], templates)).toBe(true);
    expect(bossOrNamedAt(10n, [{ locationId: 10n, isAlive: false }], [], templates)).toBe(false);
    expect(bossOrNamedAt(10n, [{ locationId: 11n, isAlive: true }], [], templates)).toBe(false);
  });

  it('a boss event spawn at the place counts; an ordinary one does not', () => {
    expect(bossOrNamedAt(10n, [], [{ locationId: 10n, enemyTemplateId: 1n }], templates)).toBe(true);
    expect(bossOrNamedAt(10n, [], [{ locationId: 10n, enemyTemplateId: 2n }], templates)).toBe(false);
    expect(bossOrNamedAt(10n, [], [{ locationId: 10n, enemyTemplateId: 3n }], templates)).toBe(false);
    expect(bossOrNamedAt(10n, [], [{ locationId: 12n, enemyTemplateId: 1n }], templates)).toBe(false);
    expect(bossOrNamedAt(10n, [], [{ locationId: 10n, enemyTemplateId: 99n }], templates)).toBe(false);
  });
});

describe('viewerRatingLevel', () => {
  const me = { id: 1n, level: 6n, locationId: 10n };

  it('is the viewer level alone, or null with no character', () => {
    expect(viewerRatingLevel(me, [], [])).toBe(6n);
    expect(viewerRatingLevel(null, [], [])).toBeNull();
  });

  it('in a party it is the LOWEST level among the members standing with you (D-56)', () => {
    const members = [{ characterId: 1n }, { characterId: 2n }, { characterId: 3n }];
    const characters = [
      { id: 2n, level: 3n, locationId: 10n, online: true },
      { id: 3n, level: 1n, locationId: 99n, online: true },
      { id: 4n, level: 1n, locationId: 10n, online: true },
    ];
    // Mira (3) stands with you; Jory (1) is elsewhere; a stranger (1) here is not in the party.
    expect(viewerRatingLevel(me, members, characters)).toBe(3n);
  });

  it('an OFFLINE member at the place does not lower the level (fightRoster, D-14; WR-02)', () => {
    const members = [{ characterId: 1n }, { characterId: 2n }, { characterId: 3n }];
    const characters = [
      { id: 2n, level: 1n, locationId: 10n, online: false },
      { id: 3n, level: 4n, locationId: 10n, online: true },
    ];
    // The level-1 member logged off here; the online level-4 member is the lowest that counts.
    expect(viewerRatingLevel(me, members, characters)).toBe(4n);
    expect(viewerRatingLevel(me, members, [{ id: 2n, level: 1n, locationId: 10n, online: false }])).toBe(6n);
  });
});
