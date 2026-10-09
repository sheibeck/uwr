import { describe, expect, it } from 'vitest';
import { travelChecks } from '../map/travelChecks';
import type { TravelChecksInput, TravellerLike } from '../map/travelChecks';
import { exitLabel, exitRows } from './exits';
import type { ExitLocation, ExitPool, ExitRow } from './exits';

// The rail exits model (51-UI-SPEC "Rail Travel Panel"; 51.3.1.1 UI-SPEC "Exits, Here card and mobile
// chips"): ring, suffix, rating, note and button per exit, built from the same travel rules as the
// Map (travelChecks, placeDanger, terrainOf) and the shared place rating (rating.ts).

const REGIONS = [
  { id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 300n },
  { id: 2n, name: 'Saltmarsh', dangerMultiplier: 600n },
];

function place(over: Partial<ExitLocation> & { id: bigint; name: string }): ExitLocation {
  return {
    description: '',
    regionId: 1n,
    levelOffset: 0n,
    isSafe: false,
    terrainType: 'woods',
    bindStone: false,
    craftingAvailable: false,
    shortName: '',
    ...over,
  };
}

const HERE = place({ id: 10n, name: 'Ember Gate', terrainType: 'town', isSafe: true });
const GLOAM = place({ id: 11n, name: 'Gloamwood', levelOffset: 1n, bindStone: true, craftingAvailable: true });
const MARSH = place({ id: 12n, name: 'Brackwater', regionId: 2n, terrainType: 'swamp' });
const EDGE = place({ id: 13n, name: 'Beyond', terrainType: 'uncharted', isSafe: true });
const HAVEN = place({ id: 14n, name: 'Haven', terrainType: 'town', isSafe: true, description: 'A quiet harbour.' });

// Gloamwood: Goblins Stable at Lv 3-5 (gap 1 for a level-4 viewer): Risky. Brackwater: Bog wights
// Overrun at Lv 6 (gap 2): Deadly. Resource pools never rate a place.
const POOLS: ExitPool[] = [
  { locationId: 11n, kind: 'creature', level: 2n, lvLo: 3n, lvHi: 5n },
  { locationId: 11n, kind: 'resource', level: 3n, lvLo: 0n, lvHi: 0n },
  { locationId: 12n, kind: 'creature', level: 3n, lvLo: 6n, lvHi: 6n },
];

const SELF: TravellerLike = { id: 1n, name: 'Hero', locationId: 10n, stamina: 50n, online: true };

interface Setup {
  routes?: ExitLocation[];
  heardOf?: ReadonlySet<bigint>;
  connected?: boolean;
  gathering?: boolean;
  selfStamina?: bigint;
  timerSeconds?: number;
  followers?: TravellerLike[];
  followerTimers?: Record<string, number>;
  pools?: ExitPool[];
  applied?: (id: bigint) => boolean;
  ratingLevel?: bigint | null;
  namedAt?: ReadonlySet<bigint>;
}

function rowsFor(setup: Setup = {}): ExitRow[] {
  const routes = setup.routes ?? [GLOAM, MARSH];
  const self: TravellerLike = { ...SELF, stamina: setup.selfStamina ?? 50n };
  const followers = setup.followers ?? [];
  const cooldowns: TravelChecksInput['cooldowns'] = [];
  const list: { characterId: bigint; readyAtMicros: bigint }[] = [];
  if (setup.timerSeconds) list.push({ characterId: 1n, readyAtMicros: BigInt(setup.timerSeconds) * 1_000_000n });
  for (const [id, seconds] of Object.entries(setup.followerTimers ?? {})) {
    list.push({ characterId: BigInt(id), readyAtMicros: BigInt(seconds) * 1_000_000n });
  }
  const locations = new Map<bigint, ExitLocation>();
  for (const l of [HERE, ...routes]) locations.set(l.id, l);
  return exitRows({
    routes: routes.map((r) => ({ locationId: r.id, name: r.name })),
    here: HERE,
    locations,
    regions: REGIONS,
    heardOf: setup.heardOf ?? new Set<bigint>(),
    playerLevel: 4,
    pools: setup.pools ?? POOLS,
    poolsApplied: setup.applied ?? (() => true),
    ratingLevel: setup.ratingLevel === undefined ? 4n : setup.ratingLevel,
    bossOrNamed: (id) => setup.namedAt?.has(id) ?? false,
    connected: setup.connected ?? true,
    checksFor: (destination) =>
      travelChecks({
        self,
        origin: { id: HERE.id, regionId: HERE.regionId },
        destination: { id: destination.id, regionId: destination.regionId },
        regionName: (id) => REGIONS.find((r) => r.id === id)?.name ?? 'Unknown region',
        group: followers.length > 0 ? { leaderCharacterId: 1n } : null,
        members: followers.map((f) => ({ characterId: f.id, followLeader: true })),
        characters: [self, ...followers],
        effects: [],
        cooldowns: [...cooldowns, ...list],
        nowMicros: 0,
        gathering: setup.gathering ?? false,
      }),
  });
}

const row = (rows: ExitRow[], name: string): ExitRow => {
  const found = rows.find((r) => r.name === name);
  if (!found) throw new Error(`no row ${name}`);
  return found;
};

describe('exitRows, same region', () => {
  it('a visited neighbour: rating, band colour kept, note, Travel button', () => {
    const gloam = row(rowsFor(), 'Gloamwood');
    expect(gloam.rating).toEqual({
      key: 'risky',
      word: 'Risky',
      line: 'Watch the edges. Things here will come for you.',
      levelLabel: 'Lv 3–5',
    });
    expect(gloam.danger.color).toBe('var(--color-con-yellow)');
    expect(gloam.danger.band).toBe('tough');
    expect(gloam.crossing).toBe(false);
    expect(gloam.locked).toBe(false);
    expect(gloam.timeText).toBeNull();
    expect(gloam.terrain.word).toBe('Woods');
    expect(gloam.note.text).toBe('Woods · 5 stamina · Bind stone · Crafting');
    expect(gloam.note.tone).toBe('neutral');
    expect(gloam.note.timeText).toBeNull();
    expect(gloam.button.label).toBe('Travel');
    expect(gloam.button.ariaLabel).toBe('Travel to Gloamwood');
    expect(gloam.button.secondsLeft).toBeNull();
    expect(gloam.button.icon).toBe('signpost');
    expect(gloam.button.disabled).toBe(false);
    expect(gloam.following).toBe(0);
  });

  it('a heard-of neighbour says so in its note', () => {
    const gloam = row(rowsFor({ routes: [place({ id: 11n, name: 'Gloamwood', levelOffset: 1n })], heardOf: new Set([11n]) }), 'Gloamwood');
    expect(gloam.heardOf).toBe(true);
    expect(gloam.note.text).toBe('Woods · heard of · 5 stamina');
  });

  it('an uncharted neighbour reads Danger unknown in the unknown colour (review IN-08)', () => {
    const edge = row(rowsFor({ routes: [EDGE] }), 'Beyond');
    expect(edge.rating).toEqual({ key: 'unknown', word: 'Danger unknown', line: '', levelLabel: '' });
    expect(edge.danger.kind).toBe('unknown');
    expect(edge.danger.color).toBe('var(--color-neutral-500)');
    expect(edge.terrain.word).toBe('Uncharted');
  });

  it('a safe neighbour reads Safe', () => {
    const haven = row(rowsFor({ routes: [HAVEN] }), 'Haven');
    expect(haven.rating).toEqual({ key: 'safe', word: 'Safe', line: 'Nothing here will hurt you.', levelLabel: '' });
  });

  it('a destination whose pool rows have not applied is Unknown (no word), never Safe; the range stays', () => {
    const rows = rowsFor({ applied: (id) => id !== 11n });
    expect(row(rows, 'Gloamwood').rating).toEqual({ key: 'unknown', word: '', line: '', levelLabel: 'Lv 3–5' });
    expect(row(rows, 'Brackwater').rating.key).toBe('deadly');
    const noLevel = rowsFor({ ratingLevel: null });
    expect(row(noLevel, 'Gloamwood').rating.word).toBe('');
  });

  it('reads each destination only from its own pools', () => {
    const rows = rowsFor({ pools: [{ locationId: 12n, kind: 'creature', level: 1n, lvLo: 1n, lvHi: 2n }] });
    expect(row(rows, 'Gloamwood').rating).toMatchObject({ key: 'quiet', levelLabel: '' });
    expect(row(rows, 'Brackwater').rating).toMatchObject({ key: 'quiet', levelLabel: 'Lv 1–2' });
  });

  it('a living boss or named enemy at the destination raises its rating one step (D-34)', () => {
    const rows = rowsFor({ namedAt: new Set([11n]) });
    expect(row(rows, 'Gloamwood').rating.key).toBe('deadly');
  });

  it('the short name is used when the place has one, else the full name', () => {
    const rows = rowsFor({ routes: [{ ...GLOAM, shortName: 'Gloam' }, MARSH] });
    expect(row(rows, 'Gloamwood').shortName).toBe('Gloam');
    expect(row(rows, 'Gloamwood').name).toBe('Gloamwood');
    expect(row(rows, 'Brackwater').shortName).toBe('Brackwater');
    const blank = rowsFor({ routes: [{ ...GLOAM, shortName: '   ' }] });
    expect(row(blank, 'Gloamwood').shortName).toBe('Gloamwood');
  });

  it('the title is the description when there is one, else empty', () => {
    const rows = rowsFor({ routes: [GLOAM, HAVEN] });
    expect(row(rows, 'Haven').title).toBe('A quiet harbour.');
    expect(row(rows, 'Gloamwood').title).toBe('');
  });
});

describe('exitRows, crossings', () => {
  it('an idle crossing: door button, region name and the accent note', () => {
    const marsh = row(rowsFor(), 'Brackwater');
    expect(marsh.crossing).toBe(true);
    expect(marsh.regionName).toBe('Saltmarsh');
    expect(marsh.note.text).toBe('New region · 10 stamina · starts the region travel timer');
    expect(marsh.note.tone).toBe('accent');
    expect(marsh.button.label).toBe('Cross');
    expect(marsh.button.ariaLabel).toBe('Cross into Saltmarsh');
    expect(marsh.button.secondsLeft).toBeNull();
    expect(marsh.button.icon).toBe('door');
    expect(marsh.button.disabled).toBe(false);
    expect(marsh.locked).toBe(false);
  });

  it('while the timer runs the crossing is locked and its button waits; a same-region row is unaffected', () => {
    const rows = rowsFor({ timerSeconds: 192 });
    const marsh = row(rows, 'Brackwater');
    expect(marsh.locked).toBe(true);
    expect(marsh.timeText).toBe('3:12');
    expect(marsh.note.text).toBe('Region travel in ');
    expect(marsh.note.timeText).toBe('3:12');
    expect(marsh.note.tone).toBe('wait');
    expect(marsh.note.srText).toBe('Region travel ready in about 4 minutes');
    expect(marsh.note.blocker).toBeNull();
    expect(marsh.button.disabled).toBe(true);
    expect(marsh.button.timeText).toBe('3:12');
    expect(marsh.button.label).toBe('Cross');
    expect(marsh.button.secondsLeft).toBe(192);

    const gloam = row(rows, 'Gloamwood');
    expect(gloam.locked).toBe(false);
    expect(gloam.button.disabled).toBe(false);
    expect(gloam.note.tone).toBe('neutral');
  });

  it('a follower timer blocks the crossing with the longest follower time', () => {
    const mira: TravellerLike = { id: 2n, name: 'Mira', locationId: 10n, stamina: 50n, online: true };
    const rows = rowsFor({ followers: [mira], followerTimers: { '2': 75 } });
    const marsh = row(rows, 'Brackwater');
    // review IN-03: the note names who waits, never reading as your own timer
    expect(marsh.note.text).toBe("Mira can't cross yet · ready in ");
    expect(marsh.note.blocker).toBe("Mira can't cross yet");
    expect(marsh.note.srText).toBe("Mira can't cross yet. Region travel ready in about 2 minutes");
    expect(marsh.note.timeText).toBe('1:15');
    expect(marsh.button.disabled).toBe(true);
    expect(marsh.button.timeText).toBe('1:15');
    expect(marsh.locked).toBe(false);
  });
});

describe('exitRows, followers, blocks and offline', () => {
  const mira: TravellerLike = { id: 2n, name: 'Mira', locationId: 10n, stamina: 50n, online: true };
  const jory: TravellerLike = { id: 3n, name: 'Jory', locationId: 10n, stamina: 50n, online: true };

  it('an offline follower is left behind: not counted, no cost, no block', () => {
    const rows = rowsFor({
      followers: [{ ...mira, online: false, stamina: 0n }, jory],
      followerTimers: { '2': 600 },
    });
    expect(row(rows, 'Gloamwood').following).toBe(1);
    expect(row(rows, 'Gloamwood').note.text).toBe('Woods · 5 stamina each · Bind stone · Crafting · 1 following');
    expect(row(rows, 'Brackwater').button.disabled).toBe(false);
  });

  it('leading with followers appends the count to the same-region and idle-crossing notes', () => {
    const rows = rowsFor({ followers: [mira, jory] });
    expect(row(rows, 'Gloamwood').note.text).toBe('Woods · 5 stamina each · Bind stone · Crafting · 2 following');
    expect(row(rows, 'Brackwater').note.text).toBe(
      'New region · 10 stamina each · starts the region travel timer · 2 following',
    );
    expect(row(rows, 'Gloamwood').following).toBe(2);
  });

  it('gathering blocks every row with its label unchanged', () => {
    const rows = rowsFor({ gathering: true });
    for (const r of rows) {
      expect(r.note.text).toBe('Finish gathering first.');
      expect(r.note.tone).toBe('bad');
      expect(r.button.disabled).toBe(true);
      expect(r.button.timeText).toBeNull();
    }
    expect(row(rows, 'Gloamwood').button.label).toBe('Travel');
    expect(row(rows, 'Brackwater').button.label).toBe('Cross');
  });

  it('your own stamina short reads Not enough stamina.', () => {
    const gloam = row(rowsFor({ selfStamina: 2n }), 'Gloamwood');
    expect(gloam.note.text).toBe('Not enough stamina.');
    expect(gloam.note.tone).toBe('bad');
    expect(gloam.button.disabled).toBe(true);
  });

  it('a short follower is named', () => {
    const gloam = row(rowsFor({ followers: [{ ...mira, stamina: 1n }] }), 'Gloamwood');
    expect(gloam.note.text).toBe('Mira is short on stamina.');
    expect(gloam.note.tone).toBe('bad');
    expect(gloam.button.disabled).toBe(true);
  });

  it('offline disables every button and keeps the notes', () => {
    const online = rowsFor();
    const offline = rowsFor({ connected: false });
    expect(offline.map((r) => r.button.disabled)).toEqual([true, true]);
    expect(offline.map((r) => r.note.text)).toEqual(online.map((r) => r.note.text));
  });
});

describe('exitRows, edge cases', () => {
  it('skips a route whose place is unknown and keeps the order given', () => {
    const rows = exitRows({
      routes: [
        { locationId: 99n, name: 'Ghost' },
        { locationId: 11n, name: 'Gloamwood' },
      ],
      here: HERE,
      locations: new Map([[11n, GLOAM]]),
      regions: REGIONS,
      heardOf: new Set(),
      playerLevel: 4,
      pools: [],
      poolsApplied: () => true,
      ratingLevel: 4n,
      bossOrNamed: () => false,
      connected: true,
      checksFor: () =>
        travelChecks({
          self: SELF,
          origin: { id: 10n, regionId: 1n },
          destination: { id: 11n, regionId: 1n },
          regionName: () => 'Ashfall Wilds',
          group: null,
          members: [],
          characters: [SELF],
          effects: [],
          cooldowns: [],
          nowMicros: 0,
          gathering: false,
        }),
    });
    expect(rows.map((r) => r.name)).toEqual(['Gloamwood']);
  });

  it('no here place means no crossings', () => {
    const rows = exitRows({
      routes: [{ locationId: 12n, name: 'Brackwater' }],
      here: null,
      locations: new Map([[12n, MARSH]]),
      regions: REGIONS,
      heardOf: new Set(),
      playerLevel: 4,
      pools: [],
      poolsApplied: () => true,
      ratingLevel: 4n,
      bossOrNamed: () => false,
      connected: true,
      checksFor: () =>
        travelChecks({
          self: SELF,
          origin: null,
          destination: { id: 12n, regionId: 2n },
          regionName: () => 'x',
          group: null,
          members: [],
          characters: [SELF],
          effects: [],
          cooldowns: [],
          nowMicros: 0,
          gathering: false,
        }),
    });
    expect(rows[0].crossing).toBe(false);
  });
});

describe('exitLabel and costText', () => {
  it('names the full place, region, rating and level; a locked crossing adds the minute sentence', () => {
    const rows = rowsFor({ timerSeconds: 192 });
    expect(exitLabel(row(rows, 'Gloamwood'))).toBe('Gloamwood, Risky, Lv 3–5');
    expect(exitLabel(row(rows, 'Brackwater'))).toBe(
      'Brackwater (Saltmarsh), Deadly, Lv 6, Region travel ready in about 4 minutes',
    );
    expect(exitLabel(row(rowsFor({ routes: [EDGE] }), 'Beyond'))).toBe('Beyond, Danger unknown');
    expect(exitLabel(row(rowsFor({ routes: [HAVEN] }), 'Haven'))).toBe('Haven, Safe');
  });

  it('the full name is in the label even when a short name is shown; Unknown keeps the range only', () => {
    const rows = rowsFor({ routes: [{ ...GLOAM, shortName: 'Gloam' }], applied: () => false });
    expect(exitLabel(row(rows, 'Gloamwood'))).toBe('Gloamwood, Lv 3–5');
  });

  it('no label carries a count, a home level or a cap value (privacy)', () => {
    for (const r of rowsFor()) {
      const label = exitLabel(r).replace(/Lv \d+(–\d+)?/, '');
      expect(label).not.toMatch(/\d/);
    }
  });

  it('keeps the lock sentence when gathering outranks the timer as the block (review IN-04)', () => {
    const marsh = row(rowsFor({ timerSeconds: 192, gathering: true }), 'Brackwater');
    expect(marsh.locked).toBe(true);
    expect(marsh.note.text).toBe('Finish gathering first.');
    expect(marsh.note.srText).toBeNull();
    expect(exitLabel(marsh)).toBe('Brackwater (Saltmarsh), Deadly, Lv 6, Region travel ready in about 4 minutes');
  });

  it('carries the shared stamina text', () => {
    expect(row(rowsFor(), 'Gloamwood').costText).toBe('5 stamina');
    expect(row(rowsFor(), 'Brackwater').costText).toBe('10 stamina');
  });
});
