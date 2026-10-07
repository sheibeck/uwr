import { describe, expect, it } from 'vitest';
import { travelChecks } from '../map/travelChecks';
import type { TravelChecksInput, TravellerLike } from '../map/travelChecks';
import { exitLabel, exitRows } from './exits';
import type { ExitLocation, ExitRow } from './exits';

// The rail exits model (51-UI-SPEC "Rail Travel Panel"): ring, suffix, right text, note and button
// per exit, built from the same travel rules as the Map (travelChecks, placeDanger, terrainOf).

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
    ...over,
  };
}

const HERE = place({ id: 10n, name: 'Ember Gate', terrainType: 'town', isSafe: true });
const GLOAM = place({ id: 11n, name: 'Gloamwood', levelOffset: 1n, bindStone: true, craftingAvailable: true });
const MARSH = place({ id: 12n, name: 'Brackwater', regionId: 2n, terrainType: 'swamp' });
const EDGE = place({ id: 13n, name: 'Beyond', terrainType: 'uncharted', isSafe: true });
const HAVEN = place({ id: 14n, name: 'Haven', terrainType: 'town', isSafe: true, description: 'A quiet harbour.' });

const SELF: TravellerLike = { id: 1n, name: 'Hero', locationId: 10n, stamina: 50n };

interface Setup {
  routes?: ExitLocation[];
  heardOf?: ReadonlySet<bigint>;
  connected?: boolean;
  gathering?: boolean;
  selfStamina?: bigint;
  timerSeconds?: number;
  followers?: TravellerLike[];
  followerTimers?: Record<string, number>;
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
  it('a visited neighbour: level text, band colour, note, Travel button', () => {
    const gloam = row(rowsFor(), 'Gloamwood');
    expect(gloam.rightText).toBe('Lv 3–5');
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

  it('an uncharted neighbour has no level text and the unknown colour', () => {
    const edge = row(rowsFor({ routes: [EDGE] }), 'Beyond');
    expect(edge.rightText).toBe('');
    expect(edge.danger.kind).toBe('unknown');
    expect(edge.danger.color).toBe('var(--color-neutral-500)');
    expect(edge.terrain.word).toBe('Uncharted');
  });

  it('a safe neighbour reads Safe', () => {
    const haven = row(rowsFor({ routes: [HAVEN] }), 'Haven');
    expect(haven.rightText).toBe('Safe');
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
    const mira: TravellerLike = { id: 2n, name: 'Mira', locationId: 10n, stamina: 50n };
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
  const mira: TravellerLike = { id: 2n, name: 'Mira', locationId: 10n, stamina: 50n };
  const jory: TravellerLike = { id: 3n, name: 'Jory', locationId: 10n, stamina: 50n };

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
  it('names the full place, region, level and band; a locked crossing adds the minute sentence', () => {
    const rows = rowsFor({ timerSeconds: 192 });
    expect(exitLabel(row(rows, 'Gloamwood'))).toBe('Gloamwood, Lv 3–5, tough');
    expect(exitLabel(row(rows, 'Brackwater'))).toBe(
      'Brackwater (Saltmarsh), Lv 6, tough, Region travel ready in about 4 minutes',
    );
    expect(exitLabel(row(rowsFor({ routes: [EDGE] }), 'Beyond'))).toBe('Beyond, Danger unknown');
  });

  it('carries the shared stamina text', () => {
    expect(row(rowsFor(), 'Gloamwood').costText).toBe('5 stamina');
    expect(row(rowsFor(), 'Brackwater').costText).toBe('10 stamina');
  });
});
