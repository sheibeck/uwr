import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { adjacencyOf } from './route';
import { travelChecks } from './travelChecks';
import type { TravellerLike } from './travelChecks';
import { buildDetail, travelAction } from './detailModel';
import type { BuildDetailInput, DetailLocation, DetailView } from './detailModel';
import type { MapRatingSource } from './nodeView';

const NOW = 1_000_000_000_000;
const secondsFromNow = (s: number): bigint => BigInt(NOW + s * 1_000_000);

const REGIONS = [
  { id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 300n },
  { id: 2n, name: 'Saltmarsh', dangerMultiplier: 500n },
];

const place = (id: bigint, name: string, extra: Partial<DetailLocation> = {}): DetailLocation => ({
  id,
  name,
  description: `About ${name}.`,
  regionId: 1n,
  terrainType: 'woods',
  isSafe: false,
  levelOffset: 0n,
  bindStone: false,
  craftingAvailable: false,
  ...extra,
});

const LOCATIONS = new Map<bigint, DetailLocation>(
  [
    place(10n, 'Ember Camp'),
    place(11n, 'Gloamwood', { levelOffset: 1n }),
    place(12n, 'Far Ridge', { terrainType: 'mountains' }),
    place(20n, 'Saltmarsh Gate', { regionId: 2n, levelOffset: 1n, terrainType: 'swamp' }),
    place(21n, 'Tide Flats', { regionId: 2n, terrainType: 'swamp' }),
    place(30n, 'The Edge Beyond Ashfall', { terrainType: 'uncharted', description: '' }),
    place(31n, 'Hollow Passage', { terrainType: 'passage' }),
    place(40n, 'Lost Hut'),
    place(50n, 'Haven', { terrainType: 'town', isSafe: true, bindStone: true, craftingAvailable: true }),
  ].map((l) => [l.id, l]),
);

const EDGES = [
  { a: 10n, b: 11n },
  { a: 11n, b: 12n },
  { a: 10n, b: 20n },
  { a: 20n, b: 21n },
  { a: 10n, b: 30n },
  { a: 10n, b: 31n },
  { a: 10n, b: 50n },
];
const ADJ = adjacencyOf(EDGES);

// The rating for a level 4 viewer: Gloamwood is Risky (a Stable family two levels above), Far
// Ridge's pool rows have not applied yet (Unknown, the range only).
const RATING: MapRatingSource = {
  pools: [
    { locationId: 11n, kind: 'creature', level: 2n, lvLo: 4n, lvHi: 6n },
    { locationId: 12n, kind: 'creature', level: 1n, lvLo: 2n, lvHi: 3n },
  ],
  poolsApplied: (id) => id !== 12n,
  ratingLevel: 4n,
  bossOrNamed: () => false,
};
const regionName = (id: bigint): string => REGIONS.find((r) => r.id === id)?.name ?? 'Unknown region';

const me: TravellerLike = { id: 1n, name: 'Aldric', locationId: 10n, stamina: 50n, online: true };
const mira: TravellerLike = { id: 2n, name: 'Mira', locationId: 10n, stamina: 50n, online: true };
const tolan: TravellerLike = { id: 3n, name: 'Tolan', locationId: 10n, stamina: 50n, online: true };

interface ChecksOpts {
  self?: TravellerLike;
  group?: { leaderCharacterId: bigint } | null;
  others?: TravellerLike[];
  cooldowns?: { characterId: bigint; readyAtMicros: bigint }[];
  gathering?: boolean;
}

function checksFor(destId: bigint, o: ChecksOpts = {}) {
  const dest = LOCATIONS.get(destId)!;
  const self = o.self ?? me;
  const others = o.others ?? [];
  return travelChecks({
    self,
    origin: { id: 10n, regionId: 1n },
    destination: { id: dest.id, regionId: dest.regionId },
    regionName,
    group: o.group ?? null,
    members: [self, ...others].map((c) => ({ characterId: c.id, followLeader: true })),
    characters: others,
    effects: [],
    cooldowns: o.cooldowns ?? [],
    nowMicros: NOW,
    gathering: o.gathering ?? false,
  });
}

const leaderOf = (...others: TravellerLike[]): ChecksOpts => ({ group: { leaderCharacterId: me.id }, others });

type Overrides = Partial<BuildDetailInput>;

function detail(selected: bigint, o: Overrides = {}, c: ChecksOpts = {}): DetailView {
  const isNeighbour = (ADJ.get(10n) ?? []).includes(selected);
  return buildDetail({
    selected,
    current: 10n,
    locations: LOCATIONS,
    regions: REGIONS,
    visited: new Set([10n, 11n, 20n, 50n]),
    heardOf: new Set([12n, 21n, 30n, 31n]),
    adjacency: ADJ,
    playerLevel: 4,
    selfId: me.id,
    boundLocationId: null,
    npcsAtSelected: [],
    charactersAtSelected: [],
    peopleApplied: true,
    quests: [],
    questTemplates: [],
    giverNpcs: [],
    checks: isNeighbour ? checksFor(selected, c) : null,
    connected: true,
    rating: RATING,
    ...o,
  });
}

describe('buildDetail, your place', () => {
  it('shows the kicker, no trip rows, no checks and no button', () => {
    const d = detail(10n, {
      npcsAtSelected: [{ npcType: 'vendor', locationId: 10n }],
      charactersAtSelected: [
        { id: 1n, locationId: 10n, online: true },
        { id: 2n, locationId: 10n, online: true },
      ],
    });
    expect(d.kind).toBe('here');
    expect(d.kicker).toBe('You are here');
    expect(d.title).toBe('Ember Camp');
    expect(d.regionLine).toBe('Ashfall Wilds · Lv 3–5 · visited');
    expect(d.trip.stamina).toBeNull();
    expect(d.trip.regionTravel).toBeNull();
    expect(d.trip.services).toEqual({ items: ['Vendor'], text: null });
    expect(d.trip.players).toBe('1');
    expect(d.checks).toBeNull();
    expect(d.route).toBeNull();
    expect(d.crossing).toBeNull();
    expect(d.action).toMatchObject({ kind: 'none', note: '', icon: null, disabled: false, firstStopId: null });
  });
});

describe('buildDetail, same-region neighbour', () => {
  it('describes the destination and offers the one Travel button', () => {
    const d = detail(11n);
    expect(d.kind).toBe('neighbour');
    expect(d.kicker).toBe('Destination');
    expect(d.title).toBe('Gloamwood');
    expect(d.regionLine).toBe('Ashfall Wilds · Lv 3–5 · visited');
    expect(d.description).toBe('About Gloamwood.');
    expect(d.descriptionExtra).toBeNull();
    expect(d.trip.stamina).toBe('5 stamina');
    expect(d.trip.regionTravel).toEqual({ text: 'None within a region', tone: 'neutral', timeText: null, srText: null });
    expect(d.crossing).toBeNull();
    expect(d.checks?.map((c) => c.key)).toEqual(['stamina', 'activity']);
    expect(d.action).toMatchObject({
      kind: 'travel',
      label: 'Travel to Gloamwood',
      icon: 'signpost',
      primary: true,
      disabled: false,
      note: 'Arrive instantly',
      timeText: null,
      describedBy: null,
    });
  });

  it('notes the followers for a leader and the solo travel for a member', () => {
    expect(detail(11n, {}, leaderOf(mira, tolan)).action.note).toBe('Arrive instantly · 2 following');
    const member = detail(11n, {}, { group: { leaderCharacterId: 77n } });
    expect(member.action.note).toBe('Arrive instantly · only you travel');
    expect(member.action.label).toBe('Travel to Gloamwood');
  });
});

describe('buildDetail, other-region neighbour', () => {
  it('shows the crossing block with the band colour and the Cross button', () => {
    const d = detail(20n);
    expect(d.crossing).toEqual({
      from: 'Ashfall Wilds',
      to: 'Saltmarsh',
      levelText: 'Lv 5–7',
      levelColor: 'var(--color-con-red)',
    });
    expect(d.regionLine).toBe('Saltmarsh · Lv 5–7 · visited');
    expect(d.trip.stamina).toBe('10 stamina');
    expect(d.trip.regionTravel).toEqual({
      text: 'Starts the region travel timer',
      tone: 'text',
      timeText: null,
      srText: null,
    });
    expect(d.checks?.map((c) => c.key)).toEqual(['region', 'stamina', 'activity']);
    expect(d.action).toMatchObject({ kind: 'cross', label: 'Cross into Saltmarsh', icon: 'door', primary: true, disabled: false });
  });

  it('a running timer shows Blocked with the clock and a minute sentence', () => {
    const d = detail(20n, {}, { cooldowns: [{ characterId: me.id, readyAtMicros: secondsFromNow(192) }] });
    expect(d.trip.regionTravel).toEqual({
      text: 'Blocked · 3:12 left',
      tone: 'wait',
      timeText: '3:12',
      srText: 'Region travel ready in about 4 minutes',
    });
  });
});

describe('buildDetail, blocked states', () => {
  const timerSelf = [{ characterId: me.id, readyAtMicros: secondsFromNow(192) }];

  it('your timer', () => {
    const a = detail(20n, {}, { cooldowns: timerSelf }).action;
    expect(a).toMatchObject({
      kind: 'cross',
      label: 'Region travel in',
      timeText: '3:12',
      icon: 'hourglass',
      disabled: true,
      primary: true,
      ariaLabel: 'Region travel locked for about 4 minutes',
      describedBy: 'region',
      note: '',
    });
  });

  it('a follower timer shows the follower time', () => {
    const a = detail(20n, {}, { ...leaderOf(mira), cooldowns: [{ characterId: 2n, readyAtMicros: secondsFromNow(65) }] }).action;
    expect(a).toMatchObject({
      label: 'Region travel in',
      timeText: '1:05',
      disabled: true,
      describedBy: 'region',
      ariaLabel: 'Region travel locked for about 2 minutes',
    });
  });

  it('stamina', () => {
    const a = detail(11n, {}, { self: { ...me, stamina: 1n } }).action;
    expect(a).toMatchObject({ label: 'Not enough stamina', disabled: true, describedBy: 'stamina', note: '', timeText: null });
  });

  it('gathering', () => {
    const a = detail(11n, {}, { gathering: true }).action;
    expect(a).toMatchObject({ label: 'Finish gathering first', disabled: true, describedBy: 'activity', note: '' });
  });

  it('offline keeps the label, disables the button and drops the reason', () => {
    const a = detail(11n, { connected: false }).action;
    expect(a).toMatchObject({ label: 'Travel to Gloamwood', disabled: true, describedBy: null, note: '' });
    const blocked = detail(20n, { connected: false }, { cooldowns: timerSelf }).action;
    expect(blocked).toMatchObject({ label: 'Region travel in', disabled: true, describedBy: null, note: '' });
  });
});

describe('buildDetail, uncharted, passage and heard-of places', () => {
  it('an uncharted neighbour', () => {
    const d = detail(30n);
    expect(d.tags.map((t) => t.text)).toContain('Danger unknown');
    expect(d.description).toBeNull();
    expect(d.descriptionExtra).toBe('Nobody has been here yet.');
    expect(d.action).toMatchObject({
      kind: 'travel',
      label: 'Travel to The Edge Beyond Ashfall',
      note: 'Travelling here opens a new region.',
    });
    expect(detail(30n, {}, leaderOf(mira, tolan)).action.note).toBe('Travelling here opens a new region. 2 following.');
    expect(detail(30n, {}, { group: { leaderCharacterId: 77n } }).action.note).toBe(
      'Travelling here opens a new region. Only you travel.',
    );
  });

  it('a passage neighbour has one Passage tag and the closing note', () => {
    const d = detail(31n);
    const terrainTags = d.tags.filter((t) => t.icon === 'terrain');
    expect(terrainTags.map((t) => t.text)).toEqual(['Passage']);
    expect(d.action.note).toBe('This passage closes once nobody stands in it.');
  });

  it('a heard-of place says so', () => {
    const d = detail(12n, {}, {});
    expect(d.regionLine.endsWith('· heard of')).toBe(true);
    expect(d.descriptionExtra).toBe("You've heard of this place but haven't been there.");
    expect(d.trip.services).toEqual({ items: [], text: 'Unknown until you visit' });
  });

  it('an empty description is omitted', () => {
    const empty = new Map(LOCATIONS);
    empty.set(11n, { ...LOCATIONS.get(11n)!, description: '   ' });
    const d = detail(11n, { locations: empty });
    expect(d.description).toBeNull();
    expect(d.descriptionExtra).toBeNull();
  });
});

describe('buildDetail, far places', () => {
  it('a place with a path offers only Select first stop', () => {
    const d = detail(12n);
    expect(d.kind).toBe('far');
    expect(d.route?.steps.map((s) => s.id)).toEqual([10n, 11n, 12n]);
    expect(d.route?.steps.map((s) => s.crossingInto)).toEqual([null, null, null]);
    expect(d.route?.note).toBe('2 stops · all within Ashfall Wilds');
    expect(d.checks).toBeNull();
    expect(d.trip.stamina).toBeNull();
    expect(d.trip.regionTravel).toBeNull();
    expect(d.action).toEqual({
      kind: 'firstStop',
      label: 'Select first stop: Gloamwood',
      timeText: null,
      ariaLabel: 'Select first stop: Gloamwood',
      title: 'Select first stop: Gloamwood',
      icon: 'firstStop',
      primary: false,
      disabled: false,
      describedBy: null,
      note: 'Not next to you. Walk there step by step, or use a teleport ability.',
      firstStopId: 11n,
    });
  });

  it('marks the first step into a new region', () => {
    const d = detail(21n);
    expect(d.kind).toBe('far');
    expect(d.route?.steps).toEqual([
      { id: 10n, name: 'Ember Camp', crossingInto: null },
      { id: 20n, name: 'Saltmarsh Gate', crossingInto: 'Saltmarsh' },
      { id: 21n, name: 'Tide Flats', crossingInto: null },
    ]);
    expect(d.route?.note).toBe('2 stops · 1 region crossing');
    expect(d.action.firstStopId).toBe(20n);
  });

  it('a place with no known path', () => {
    const d = detail(40n);
    expect(d.kind).toBe('noPath');
    expect(d.route).toBeNull();
    expect(d.checks).toBeNull();
    expect(d.action).toMatchObject({ kind: 'none', note: 'No known path from here.', firstStopId: null });
  });
});

describe('buildDetail, tags', () => {
  it('the danger tag reads {Rating} · Lv a-b with the sword in the rating colour, Safe is green, unknown is a question', () => {
    const risky = detail(11n).tags.find((t) => t.key === 'danger');
    expect(risky).toMatchObject({ icon: 'sword', text: 'Risky · Lv 4–6', color: 'var(--color-con-yellow)' });
    const deadly = detail(11n, { rating: { ...RATING, ratingLevel: 1n } }).tags.find((t) => t.key === 'danger');
    expect(deadly).toMatchObject({ icon: 'sword', text: 'Deadly · Lv 4–6', color: 'var(--color-con-red)' });
    const safe = detail(50n).tags.find((t) => t.icon === 'shield');
    expect(safe).toMatchObject({ text: 'Safe', color: 'var(--color-con-light-green)' });
    expect(detail(30n).tags.find((t) => t.icon === 'question')?.text).toBe('Danger unknown');
  });

  it('a place whose pool rows have not applied is Unknown: the range only, neutral, never Safe', () => {
    const loading = detail(12n).tags.find((t) => t.key === 'danger');
    expect(loading).toMatchObject({ icon: 'question', text: 'Lv 2–3', color: 'var(--color-neutral-500)' });
    expect(detail(11n, { rating: undefined }).tags.some((t) => t.key === 'danger')).toBe(false);
    expect(detail(11n, { rating: undefined }).tags.some((t) => t.text === 'Safe')).toBe(false);
  });

  it('a quiet place with no family has the word alone', () => {
    const quiet = detail(21n).tags.find((t) => t.key === 'danger');
    expect(quiet).toMatchObject({ icon: 'sword', text: 'Quiet', color: 'var(--color-con-blue)' });
  });

  it('the region line and the crossing keep the band range of the region (B9)', () => {
    expect(detail(11n).regionLine).toBe('Ashfall Wilds · Lv 3–5 · visited');
  });

  it('bind stone, your bind point and crafting', () => {
    const haven = detail(50n);
    expect(haven.tags.find((t) => t.icon === 'castle')?.text).toBe('Bind stone');
    expect(haven.tags.find((t) => t.icon === 'hammer')?.text).toBe('Crafting');
    const bound = detail(50n, { boundLocationId: 50n });
    const castle = bound.tags.find((t) => t.icon === 'castle');
    expect(castle?.text).toBe('Your bind point');
    expect(castle?.color).toBe('var(--color-accent-300)');
    expect(detail(11n).tags.some((t) => t.icon === 'castle' || t.icon === 'hammer')).toBe(false);
  });

  it('terrain comes first with the word of the terrain', () => {
    const d = detail(12n);
    expect(d.tags[0]).toMatchObject({ icon: 'terrain', text: 'Mountains' });
    expect(d.terrain.word).toBe('Mountains');
  });
});

describe('buildDetail, services and players', () => {
  it('vendor and banker, a lore npc alone is None, trainers and inns never appear', () => {
    const both = detail(11n, {
      npcsAtSelected: [
        { npcType: 'banker', locationId: 11n },
        { npcType: 'vendor', locationId: 11n },
        { npcType: 'trainer', locationId: 11n },
        { npcType: 'inn', locationId: 11n },
        { npcType: 'vendor', locationId: 11n },
      ],
    });
    expect(both.trip.services).toEqual({ items: ['Vendor', 'Banker'], text: null });
    const lore = detail(11n, { npcsAtSelected: [{ npcType: 'lore', locationId: 11n }] });
    expect(lore.trip.services).toEqual({ items: [], text: 'None' });
  });

  it('players excludes you and counts online characters at the place; none reads None', () => {
    const three = detail(11n, {
      charactersAtSelected: [
        { id: 1n, locationId: 11n, online: true },
        { id: 2n, locationId: 11n, online: true },
        { id: 3n, locationId: 11n, online: true },
        { id: 4n, locationId: 99n, online: true },
      ],
    });
    expect(three.trip.players).toBe('2');
    expect(detail(11n).trip.players).toBe('None');
  });

  it('players leaves out offline characters, and a row without the online field reads offline', () => {
    const mixed = detail(11n, {
      charactersAtSelected: [
        { id: 1n, locationId: 11n, online: true },
        { id: 2n, locationId: 11n, online: true },
        { id: 3n, locationId: 11n, online: false },
        { id: 4n, locationId: 11n },
        { id: 5n, locationId: 11n, online: null },
      ],
    });
    expect(mixed.trip.players).toBe('1');
  });

  it('players reads None when only offline characters are at the place', () => {
    const d = detail(11n, {
      charactersAtSelected: [
        { id: 2n, locationId: 11n, online: false },
        { id: 3n, locationId: 11n, online: false },
      ],
    });
    expect(d.trip.players).toBe('None');
  });
});

describe('buildDetail, the selected place still loading (review WR-02)', () => {
  it('leaves Services and Players out instead of reading None until the subscriptions apply', () => {
    const d = detail(11n, { peopleApplied: false, npcsAtSelected: [{ npcType: 'vendor', locationId: 11n }] });
    expect(d.trip.services).toBeNull();
    expect(d.trip.players).toBeNull();
  });

  it('a heard-of place keeps Unknown until you visit, which needs no subscription', () => {
    const d = detail(12n, { peopleApplied: false });
    expect(d.trip.services).toEqual({ items: [], text: 'Unknown until you visit' });
    expect(d.trip.players).toBeNull();
  });

  it('the fallback to your place (an unknown selection) never borrows the selected rows', () => {
    const d = detail(999n, {
      npcsAtSelected: [{ npcType: 'vendor', locationId: 10n }],
      charactersAtSelected: [{ id: 2n, locationId: 10n, online: true }],
    });
    expect(d.title).toBe('Ember Camp');
    expect(d.trip.services).toBeNull();
    expect(d.trip.players).toBeNull();
  });

  it('no selection at all shows your place without the people rows', () => {
    const d = detail(10n, { selected: null, peopleApplied: false });
    expect(d.kind).toBe('here');
    expect(d.trip.services).toBeNull();
    expect(d.trip.players).toBeNull();
  });
});

describe('buildDetail, related quests', () => {
  const at = (n: number) => ({ microsSinceUnixEpoch: BigInt(n) });
  const tpl = (id: bigint, name: string, extra: Record<string, unknown> = {}) => ({
    id,
    name,
    requiredCount: 3n,
    npcId: 900n + id,
    targetLocationId: null,
    sourceLocationId: null,
    ...extra,
  });
  const quest = (id: bigint, templateId: bigint, extra: Record<string, unknown> = {}) => ({
    id,
    characterId: 1n,
    questTemplateId: templateId,
    progress: 1n,
    completed: false,
    acceptedAt: at(Number(id)),
    ...extra,
  });

  it('roles: giver, goal, pick up, and several together', () => {
    const d = detail(11n, {
      quests: [quest(1n, 1n), quest(2n, 2n), quest(3n, 3n), quest(4n, 4n, { progress: 3n, completed: true })],
      questTemplates: [
        tpl(1n, 'Wolves'),
        tpl(2n, 'Reach the wood', { targetLocationId: 11n }),
        tpl(3n, 'Fetch a crate', { sourceLocationId: 11n }),
        tpl(4n, 'Both ways', { targetLocationId: 11n }),
      ],
      giverNpcs: [
        { id: 901n, locationId: 11n },
        { id: 904n, locationId: 11n },
      ],
    });
    expect(d.quests).toEqual([
      { key: 'quest-1', name: 'Wolves', progress: '1/3', role: 'Giver here' },
      { key: 'quest-2', name: 'Reach the wood', progress: '1/3', role: 'Goal here' },
      { key: 'quest-3', name: 'Fetch a crate', progress: '1/3', role: 'Pick up here' },
      { key: 'quest-4', name: 'Both ways', progress: 'Ready', role: 'Giver here · Goal here' },
    ]);
  });

  it('leaves out finished quests, other characters and unrelated quests', () => {
    const d = detail(11n, {
      quests: [
        quest(1n, 1n, { completedAt: at(9) }),
        quest(2n, 2n, { characterId: 5n }),
        quest(3n, 3n),
      ],
      questTemplates: [
        tpl(1n, 'Done', { targetLocationId: 11n }),
        tpl(2n, 'Theirs', { targetLocationId: 11n }),
        tpl(3n, 'Elsewhere', { targetLocationId: 12n }),
      ],
      giverNpcs: [],
    });
    expect(d.quests).toEqual([]);
  });
});

describe('buildDetail, plain strings', () => {
  it('keeps a hostile place name unchanged as data', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const locations = new Map(LOCATIONS);
    locations.set(11n, { ...LOCATIONS.get(11n)!, name: evil });
    const d = detail(11n, { locations });
    expect(d.title).toBe(evil);
    expect(d.action.label).toBe(`Travel to ${evil}`);
    const far = detail(12n, { locations });
    expect(far.action.label).toBe(`Select first stop: ${evil}`);
    expect(far.route?.steps[1].name).toBe(evil);
  });

  it('an unknown selection falls back to your place, and no place at all reads empty', () => {
    const fallback = detail(999n);
    expect(fallback.kind).toBe('here');
    expect(fallback.title).toBe('Ember Camp');
    const empty = detail(999n, { current: null, locations: new Map() });
    expect(empty.title).toBe('');
    expect(empty.action.kind).toBe('none');
    expect(empty.tags).toEqual([]);
  });
});

describe('travelAction label guard', () => {
  it('produces exactly the UI-SPEC set of labels', () => {
    const timerSelf = [{ characterId: me.id, readyAtMicros: secondsFromNow(100) }];
    const actions = [
      detail(11n).action,
      detail(20n).action,
      detail(30n).action,
      detail(20n, {}, { cooldowns: timerSelf }).action,
      detail(11n, {}, { self: { ...me, stamina: 0n } }).action,
      detail(11n, {}, { gathering: true }).action,
      detail(12n).action,
      detail(40n).action,
      detail(10n).action,
    ];
    const stems = new Set<string>();
    for (const a of actions) {
      if (a.kind === 'none') {
        expect(a.label).toBe('');
        continue;
      }
      const stem = ['Travel to ', 'Cross into ', 'Region travel in', 'Not enough stamina', 'Finish gathering first', 'Select first stop: ']
        .find((s) => a.label.startsWith(s));
      expect(stem, a.label).toBeDefined();
      stems.add(stem as string);
    }
    expect([...stems].sort()).toEqual(
      ['Cross into ', 'Finish gathering first', 'Not enough stamina', 'Region travel in', 'Select first stop: ', 'Travel to '].sort(),
    );
  });

  it('has no second travel button, no solo or party label, and no level lock', () => {
    const source = readFileSync('src/map/detailModel.ts', 'utf8');
    expect(source).not.toMatch(/Travel alone|Travel with party|party travel button/i);
    expect(source).not.toMatch(/level lock|locked until level|minLevel/i);
    expect(source).not.toMatch(/COOLDOWN_MICROS/);
  });

  it('travelAction on its own: far with a path but no names falls back to a plain word', () => {
    const a = travelAction({
      kind: 'far',
      destination: null,
      crossing: false,
      regionName: '',
      checks: null,
      path: [10n, 11n, 12n],
      names: new Map(),
      connected: true,
    });
    expect(a.firstStopId).toBe(11n);
    expect(a.label).toBe('Select first stop: Unknown place');
  });
});
