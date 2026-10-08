import { describe, expect, it } from 'vitest';
import { travelEffectDiscount, travelStaminaCost } from '@game-data/travel_config';
import { travelChecks } from './travelChecks';
import type { TravellerLike } from './travelChecks';

const NOW = 1_000_000_000_000;
const secondsFromNow = (s: number): bigint => BigInt(NOW + s * 1_000_000);

const ORIGIN = { id: 10n, regionId: 1n };
const SAME = { id: 11n, regionId: 1n };
const OTHER = { id: 20n, regionId: 2n };
const REGIONS: Record<string, string> = { '1': 'Ashfall Wilds', '2': 'Saltmarsh' };
const regionName = (id: bigint): string => REGIONS[String(id)] ?? 'Unknown region';

const traveller = (id: bigint, name: string, extra: Partial<TravellerLike> = {}): TravellerLike => ({
  id,
  name,
  locationId: ORIGIN.id,
  stamina: 50n,
  online: true,
  ...extra,
});

const me = traveller(1n, 'Aldric');

interface Opts {
  self?: TravellerLike | null;
  destination?: { id: bigint; regionId: bigint };
  group?: { leaderCharacterId: bigint } | null;
  members?: { characterId: bigint; followLeader: boolean }[];
  characters?: TravellerLike[];
  effects?: { characterId: bigint; effectType: string; roundsRemaining: bigint; magnitude: bigint | number }[];
  cooldowns?: { characterId: bigint; readyAtMicros: bigint }[];
  gathering?: boolean;
}

function run(o: Opts = {}) {
  return travelChecks({
    self: o.self === undefined ? me : o.self,
    origin: ORIGIN,
    destination: o.destination ?? SAME,
    regionName,
    group: o.group ?? null,
    members: o.members ?? [],
    characters: o.characters ?? [],
    effects: o.effects ?? [],
    cooldowns: o.cooldowns ?? [],
    nowMicros: NOW,
    gathering: o.gathering ?? false,
  });
}

const row = (r: ReturnType<typeof run>, key: 'region' | 'stamina' | 'activity') =>
  r.checks.find((c) => c.key === key);

const mira = traveller(2n, 'Mira');
const tolan = traveller(3n, 'Tolan');
const partyOf = (...others: TravellerLike[]) => ({
  group: { leaderCharacterId: me.id },
  members: [{ characterId: me.id, followLeader: true }, ...others.map((o) => ({ characterId: o.id, followLeader: true }))],
  characters: others,
});

describe('travelChecks, solo', () => {
  it('same region: stamina and activity rows, no region row, no block', () => {
    const r = run();
    expect(r.crossRegion).toBe(false);
    expect(r.selfCost).toBe(5n);
    expect(r.costText).toBe('5 stamina');
    expect(r.checks.map((c) => c.key)).toEqual(['stamina', 'activity']);
    expect(row(r, 'stamina')).toMatchObject({ status: 'ok', label: 'You have the stamina', detail: '5 stamina' });
    expect(row(r, 'activity')).toMatchObject({ status: 'ok', label: 'Not in combat or gathering' });
    expect(r.block).toBeNull();
    expect(r.followers).toEqual([]);
    expect(r.leading).toBe(false);
    expect(r.member).toBe(false);
  });

  it('other region with an idle timer: a ready region row and cost 10', () => {
    const r = run({ destination: OTHER });
    expect(r.crossRegion).toBe(true);
    expect(r.selfCost).toBe(10n);
    expect(r.checks.map((c) => c.key)).toEqual(['region', 'stamina', 'activity']);
    expect(row(r, 'region')).toMatchObject({
      status: 'ok',
      label: 'Region travel ready',
      detail: 'Crossing starts the region travel timer for everyone who travels.',
      secondsLeft: null,
    });
    expect(r.block).toBeNull();
  });

  it('your timer running blocks a crossing but never a move within the region', () => {
    const cooldowns = [{ characterId: me.id, readyAtMicros: secondsFromNow(192) }];
    const cross = run({ destination: OTHER, cooldowns });
    expect(row(cross, 'region')).toMatchObject({
      status: 'wait',
      label: 'Region travel cooling down',
      detail: 'Ready in 3:12. Moving within Ashfall Wilds is still fine.',
      secondsLeft: 192,
    });
    expect(cross.block).toEqual({ reason: 'selfTimer', secondsLeft: 192 });
    expect(cross.selfTimer).toEqual({ running: true, secondsLeft: 192 });

    const within = run({ destination: SAME, cooldowns });
    expect(row(within, 'region')).toBeUndefined();
    expect(within.block).toBeNull();
  });

  it('treats a stale cooldown row as idle', () => {
    const cooldowns = [{ characterId: me.id, readyAtMicros: secondsFromNow(-30) }];
    const r = run({ destination: OTHER, cooldowns });
    expect(row(r, 'region')?.status).toBe('ok');
    expect(r.block).toBeNull();
    expect(r.selfTimer.running).toBe(false);
  });

  it('ignores another character cooldown rows for your own timer', () => {
    const cooldowns = [{ characterId: 99n, readyAtMicros: secondsFromNow(100) }];
    expect(run({ destination: OTHER, cooldowns }).block).toBeNull();
  });
});

describe('travelChecks, party', () => {
  it('leader with two followers here: costs, cost text and the party row', () => {
    const racial = traveller(2n, 'Mira', { racialTravelCostIncrease: 3n });
    const discounted = traveller(3n, 'Tolan');
    const r = run({
      destination: OTHER,
      ...partyOf(racial, discounted),
      effects: [{ characterId: 3n, effectType: 'travel_discount', roundsRemaining: 4n, magnitude: 2n }],
    });
    expect(r.leading).toBe(true);
    expect(r.followers.map((f) => f.id)).toEqual([2n, 3n]);
    expect(r.selfCost).toBe(10n);
    expect(r.costText).toBe('8–13 stamina each');
    expect(row(r, 'stamina')).toMatchObject({
      status: 'ok',
      label: 'Party has the stamina',
      detail: 'You and 2 following · 8–13 stamina each',
    });
  });

  it('equal costs read as one number each', () => {
    const r = run(partyOf(mira, tolan));
    expect(r.costText).toBe('5 stamina each');
    expect(row(r, 'stamina')?.detail).toBe('You and 2 following · 5 stamina each');
  });

  it('a member standing elsewhere or with follow off is not a follower', () => {
    const away = traveller(2n, 'Mira', { locationId: 99n });
    const p = partyOf(away, tolan);
    p.members[2] = { characterId: 3n, followLeader: false };
    const r = run(p);
    expect(r.followers).toEqual([]);
    expect(r.leading).toBe(true);
    expect(row(r, 'stamina')?.label).toBe('You have the stamina');
  });

  it('an offline following member is not a follower: no cost, no stamina or timer block', () => {
    const offline = traveller(2n, 'Mira', { online: false, stamina: 0n });
    const r = run({
      destination: OTHER,
      ...partyOf(offline, tolan),
      cooldowns: [{ characterId: 2n, readyAtMicros: secondsFromNow(300) }],
    });
    expect(r.followers.map((f) => f.id)).toEqual([3n]);
    expect(r.costText).toBe('10 stamina each');
    expect(row(r, 'region')?.status).toBe('ok');
    expect(row(r, 'stamina')?.label).toBe('Party has the stamina');
    expect(r.block).toBeNull();
  });

  it('a character row with online missing or null reads offline', () => {
    const missing = { id: 2n, name: 'Mira', locationId: ORIGIN.id, stamina: 50n } as TravellerLike;
    expect(run(partyOf(missing)).followers).toEqual([]);
    expect(run(partyOf({ ...missing, online: null })).followers).toEqual([]);
    expect(run(partyOf({ ...missing, online: undefined })).followers).toEqual([]);
  });

  it('all other members offline: you travel alone and the cost text is one number', () => {
    const r = run(partyOf({ ...mira, online: false }, { ...tolan, online: false }));
    expect(r.followers).toEqual([]);
    expect(r.leading).toBe(true);
    expect(r.costText).toBe('5 stamina');
    expect(row(r, 'stamina')?.label).toBe('You have the stamina');
  });

  it('a member whose character row is not known is left out of the prediction', () => {
    const p = partyOf(mira);
    p.characters = [];
    expect(run(p).followers).toEqual([]);
  });

  it('you are a member, not the leader: no followers', () => {
    const r = run({
      group: { leaderCharacterId: 77n },
      members: [
        { characterId: 77n, followLeader: true },
        { characterId: me.id, followLeader: true },
        { characterId: 2n, followLeader: true },
      ],
      characters: [mira],
    });
    expect(r.followers).toEqual([]);
    expect(r.leading).toBe(false);
    expect(r.member).toBe(true);
  });

  it('a follower timer running: one name, then two names with the longer time', () => {
    const one = run({
      destination: OTHER,
      ...partyOf(mira),
      cooldowns: [{ characterId: 2n, readyAtMicros: secondsFromNow(65) }],
    });
    expect(row(one, 'region')).toMatchObject({
      status: 'wait',
      label: "Mira can't cross yet",
      detail: 'Ready in 1:05.',
      secondsLeft: 65,
    });
    expect(one.block).toEqual({ reason: 'followerTimer', secondsLeft: 65 });

    const two = run({
      destination: OTHER,
      ...partyOf(mira, tolan),
      cooldowns: [
        { characterId: 2n, readyAtMicros: secondsFromNow(65) },
        { characterId: 3n, readyAtMicros: secondsFromNow(120) },
      ],
    });
    expect(row(two, 'region')).toMatchObject({
      label: "Mira and Tolan can't cross yet",
      detail: 'Ready in 2:00.',
      secondsLeft: 120,
    });
    expect(two.block).toEqual({ reason: 'followerTimer', secondsLeft: 120 });
  });

  it('three short followers join with commas and and', () => {
    const third = traveller(4n, 'Wren', { stamina: 0n });
    const r = run(partyOf({ ...mira, stamina: 0n }, { ...tolan, stamina: 0n }, third));
    expect(row(r, 'stamina')?.label).toBe('Mira, Tolan and Wren are short on stamina');
  });
});

describe('travelChecks, stamina and activity', () => {
  it('you are short: needs and has', () => {
    const r = run({ self: { ...me, stamina: 3n } });
    expect(row(r, 'stamina')).toMatchObject({
      status: 'bad',
      label: 'You are short on stamina',
      detail: 'Needs 5, you have 3.',
      secondsLeft: null,
    });
    expect(r.block).toEqual({ reason: 'selfStamina', secondsLeft: null });
  });

  it('one follower short, then two', () => {
    const lowMira = { ...mira, stamina: 4n };
    const one = run({ destination: OTHER, ...partyOf(lowMira, tolan) });
    expect(row(one, 'stamina')).toMatchObject({
      status: 'bad',
      label: 'Mira is short on stamina',
      detail: 'Needs 10, has 4. Party travel is all or nothing.',
    });
    expect(one.block).toEqual({ reason: 'followerStamina', secondsLeft: null });

    const two = run({ destination: OTHER, ...partyOf(lowMira, { ...tolan, stamina: 1n }) });
    expect(row(two, 'stamina')).toMatchObject({
      label: 'Mira and Tolan are short on stamina',
      detail: 'Party travel is all or nothing.',
    });
  });

  it('gathering is a bad activity row and the first block, even with a running timer', () => {
    const r = run({
      destination: OTHER,
      gathering: true,
      cooldowns: [{ characterId: me.id, readyAtMicros: secondsFromNow(60) }],
    });
    expect(row(r, 'activity')).toMatchObject({ status: 'bad', label: 'Gathering', detail: 'Finish gathering first.' });
    expect(r.block).toEqual({ reason: 'gathering', secondsLeft: null });
  });
});

describe('travelChecks, blocking order', () => {
  const timerSelf = { characterId: me.id, readyAtMicros: secondsFromNow(30) };
  const timerMira = { characterId: 2n, readyAtMicros: secondsFromNow(50) };
  const lowMe = { ...me, stamina: 1n };
  const lowMira = { ...mira, stamina: 1n };

  it('your timer before a follower timer', () => {
    const r = run({ destination: OTHER, ...partyOf(mira), cooldowns: [timerSelf, timerMira] });
    expect(r.block?.reason).toBe('selfTimer');
    expect(row(r, 'region')?.label).toBe('Region travel cooling down');
  });

  it('a follower timer before your stamina', () => {
    const r = run({ destination: OTHER, self: lowMe, ...partyOf(mira), cooldowns: [timerMira] });
    expect(r.block?.reason).toBe('followerTimer');
  });

  it('your stamina before a follower stamina', () => {
    const r = run({ destination: OTHER, self: lowMe, ...partyOf(lowMira) });
    expect(r.block?.reason).toBe('selfStamina');
    expect(row(r, 'stamina')?.label).toBe('You are short on stamina');
  });

  it('your timer before your stamina', () => {
    const r = run({ destination: OTHER, self: lowMe, cooldowns: [timerSelf] });
    expect(r.block?.reason).toBe('selfTimer');
  });

  it('a follower stamina alone', () => {
    expect(run({ destination: OTHER, ...partyOf(lowMira) }).block?.reason).toBe('followerStamina');
  });
});

describe('travelChecks, parity with the server rule', () => {
  it('every cost equals travelStaminaCost called directly', () => {
    const racial = traveller(2n, 'Mira', { racialTravelCostIncrease: 3n, racialTravelCostDiscount: 1n });
    const effects = [
      { characterId: 1n, effectType: 'travel_discount', roundsRemaining: 2n, magnitude: 4n },
      { characterId: 1n, effectType: 'travel_discount', roundsRemaining: 0n, magnitude: 9n },
      { characterId: 2n, effectType: 'travel_discount', roundsRemaining: 1n, magnitude: 2 },
      { characterId: 2n, effectType: 'haste', roundsRemaining: 5n, magnitude: 7n },
    ];
    for (const destination of [SAME, OTHER]) {
      const r = run({ destination, ...partyOf(racial), effects, self: { ...me, racialTravelCostDiscount: 2n } });
      const cross = destination === OTHER;
      expect(r.selfCost).toBe(
        travelStaminaCost({
          crossRegion: cross,
          racialIncrease: null,
          racialDiscount: 2n,
          effectDiscount: travelEffectDiscount(effects.filter((e) => e.characterId === 1n)),
        }),
      );
      const miraCost = travelStaminaCost({
        crossRegion: cross,
        racialIncrease: 3n,
        racialDiscount: 1n,
        effectDiscount: travelEffectDiscount(effects.filter((e) => e.characterId === 2n)),
      });
      const lo = r.selfCost < miraCost ? r.selfCost : miraCost;
      const hi = r.selfCost < miraCost ? miraCost : r.selfCost;
      expect(r.costText).toBe(lo === hi ? `${lo} stamina each` : `${lo}–${hi} stamina each`);
    }
  });

  it('the file imports the shared rule and not the server cooldown length', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/map/travelChecks.ts', 'utf8');
    expect(source).toContain('@game-data/travel_config');
    expect(source).not.toMatch(/COOLDOWN_MICROS/);
    expect(source).not.toMatch(/WITHIN_REGION_STAMINA|CROSS_REGION_STAMINA/);
  });
});

describe('travelChecks, no character', () => {
  it('returns a quiet result without a self row', () => {
    const r = run({ self: null });
    expect(r.block).toBeNull();
    expect(r.followers).toEqual([]);
  });
});
