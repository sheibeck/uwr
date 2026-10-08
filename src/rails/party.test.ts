import { describe, expect, it } from 'vitest';
import { healthPercent, isPartyLeader, lowStaminaFor, partyMembers, partySize, selfCardView } from './party';

const at = (n: number) => ({ microsSinceUnixEpoch: BigInt(n) });

function character(id: bigint, over: Record<string, unknown> = {}) {
  return {
    id,
    name: `Hero${id}`,
    className: 'Warrior',
    level: 4n,
    hp: 80n,
    maxHp: 100n,
    mana: 0n,
    maxMana: 0n,
    stamina: 30n,
    maxStamina: 60n,
    ...over,
  };
}

describe('healthPercent', () => {
  it('rounds to a whole percent', () => {
    expect(healthPercent(95n, 100n)).toBe(95);
    expect(healthPercent(1n, 3n)).toBe(33);
  });

  it('is 0 when max is not positive', () => {
    expect(healthPercent(5n, 0n)).toBe(0);
    expect(healthPercent(5n, -3n)).toBe(0);
  });

  it('clamps to 0..100', () => {
    expect(healthPercent(500n, 100n)).toBe(100);
    expect(healthPercent(-5n, 100n)).toBe(0);
  });
});

describe('partySize and isPartyLeader', () => {
  it('counts member rows including the player', () => {
    expect(partySize([{ characterId: 1n }, { characterId: 2n }])).toBe(2);
    expect(partySize([])).toBe(0);
  });

  it('is leader only when the ids match', () => {
    expect(isPartyLeader({ leaderCharacterId: 1n }, 1n)).toBe(true);
    expect(isPartyLeader({ leaderCharacterId: 1n }, 2n)).toBe(false);
    expect(isPartyLeader({ leaderCharacterId: 1n }, null)).toBe(false);
    expect(isPartyLeader(null, 1n)).toBe(false);
  });
});

describe('partyMembers', () => {
  const characters = [
    character(1n, { name: 'Self' }),
    character(2n, { name: 'Bryn', maxMana: 50n, mana: 40n }),
    character(3n, { name: 'Cole' }),
    character(4n, { name: 'Dara' }),
  ];

  it('excludes the player, leader first then join order', () => {
    const members = [
      { id: 10n, characterId: 1n, joinedAt: at(1) },
      { id: 11n, characterId: 4n, joinedAt: at(2) },
      { id: 12n, characterId: 3n, joinedAt: at(3) },
      { id: 13n, characterId: 2n, joinedAt: at(4) },
    ];
    const out = partyMembers({ group: { leaderCharacterId: 2n }, members, characters, selfId: 1n });
    expect(out.map((m) => m.name)).toEqual(['Bryn', 'Dara', 'Cole']);
    expect(out[0].isLeader).toBe(true);
    expect(out[1].isLeader).toBe(false);
  });

  it('lists a leader who is the player nowhere and keeps join order', () => {
    const members = [
      { id: 10n, characterId: 1n, joinedAt: at(1) },
      { id: 12n, characterId: 3n, joinedAt: at(3) },
      { id: 11n, characterId: 4n, joinedAt: at(2) },
    ];
    const out = partyMembers({ group: { leaderCharacterId: 1n }, members, characters, selfId: 1n });
    expect(out.map((m) => m.name)).toEqual(['Dara', 'Cole']);
    expect(out.every((m) => !m.isLeader)).toBe(true);
  });

  it('breaks join-time ties by member id', () => {
    const members = [
      { id: 21n, characterId: 3n, joinedAt: at(5) },
      { id: 20n, characterId: 4n, joinedAt: at(5) },
    ];
    const out = partyMembers({ group: null, members, characters, selfId: 1n });
    expect(out.map((m) => m.name)).toEqual(['Dara', 'Cole']);
  });

  it('picks mana for mana users and stamina otherwise, with health percent', () => {
    const members = [
      { id: 1n, characterId: 2n, joinedAt: at(1) },
      { id: 2n, characterId: 3n, joinedAt: at(2) },
    ];
    const [bryn, cole] = partyMembers({ group: null, members, characters, selfId: null });
    expect(bryn).toMatchObject({ resourceKind: 'mana', resource: 40n, maxResource: 50n, healthPercent: 80, known: true });
    expect(cole).toMatchObject({ resourceKind: 'stamina', resource: 30n, maxResource: 60n });
  });

  it('keeps a member without a character row as unknown with zero vitals', () => {
    const members = [{ id: 1n, characterId: 99n, joinedAt: at(1) }];
    const [m] = partyMembers({ group: { leaderCharacterId: 99n }, members, characters, selfId: 1n });
    expect(m).toMatchObject({ known: false, name: '', hp: 0n, maxHp: 0n, healthPercent: 0, isLeader: true });
  });

  it('returns [] for empty input and a solo player', () => {
    expect(partyMembers({ group: null, members: [], characters, selfId: 1n })).toEqual([]);
    const solo = [{ id: 1n, characterId: 1n, joinedAt: at(1) }];
    expect(partyMembers({ group: { leaderCharacterId: 1n }, members: solo, characters, selfId: 1n })).toEqual([]);
  });

  it('survives a zero max health', () => {
    const members = [{ id: 1n, characterId: 3n, joinedAt: at(1) }];
    const chars = [character(3n, { hp: 0n, maxHp: 0n })];
    expect(partyMembers({ group: null, members, characters: chars, selfId: null })[0].healthPercent).toBe(0);
  });
});

describe('selfCardView', () => {
  it('names the player You and uses mana for a mana class', () => {
    const view = selfCardView(character(1n, { maxMana: 50n, mana: 20n, hp: 50n, maxHp: 200n }), false);
    expect(view.name).toBe('You');
    expect(view.id).toBe(1n);
    expect(view.known).toBe(true);
    expect(view.resourceKind).toBe('mana');
    expect(view.resource).toBe(20n);
    expect(view.maxResource).toBe(50n);
    expect(view.healthPercent).toBe(25);
    expect(view.isLeader).toBe(false);
  });

  it('uses stamina when the maximum mana is 0', () => {
    const view = selfCardView(character(1n, { maxMana: 0n }), true);
    expect(view.resourceKind).toBe('stamina');
    expect(view.resource).toBe(30n);
    expect(view.maxResource).toBe(60n);
    expect(view.isLeader).toBe(true);
  });

  it('matches the partyMembers view of the same character apart from the name and leader flag', () => {
    const c = character(2n, { maxMana: 40n, mana: 10n });
    const [other] = partyMembers({
      group: { leaderCharacterId: 9n },
      members: [{ id: 5n, characterId: 2n, joinedAt: at(1) }],
      characters: [c],
      selfId: 1n,
    });
    expect({ ...selfCardView(c, false), name: other.name }).toEqual(other);
  });

  it('reads 0 percent for a max of 0', () => {
    expect(selfCardView(character(1n, { hp: 5n, maxHp: 0n }), false).healthPercent).toBe(0);
  });
});

describe('partyMembers follow fields', () => {
  const run = (
    members: { id: bigint; characterId: bigint; joinedAt: { microsSinceUnixEpoch: bigint }; followLeader?: boolean }[],
    characters: ReturnType<typeof character>[],
  ) => partyMembers({ group: null, members, characters, selfId: 1n });

  it('fills online and locationId from the character row and followLeader from the member row', () => {
    const [a, b] = run(
      [
        { id: 10n, characterId: 2n, joinedAt: at(1), followLeader: false },
        { id: 11n, characterId: 3n, joinedAt: at(2), followLeader: true },
      ],
      [character(2n, { online: true, locationId: 10n }), character(3n, { online: false, locationId: 11n })],
    );
    expect(a).toMatchObject({ online: true, followLeader: false, locationId: 10n });
    expect(b).toMatchObject({ online: false, followLeader: true, locationId: 11n });
  });

  it('reads an online field that is not exactly true as offline', () => {
    const [a, b, c] = run(
      [
        { id: 10n, characterId: 2n, joinedAt: at(1) },
        { id: 11n, characterId: 3n, joinedAt: at(2) },
        { id: 12n, characterId: 4n, joinedAt: at(3) },
      ],
      [character(2n), character(3n, { online: undefined }), character(4n, { online: null })],
    );
    expect([a.online, b.online, c.online]).toEqual([false, false, false]);
  });

  it('defaults followLeader to true when the member row has no such field, and locationId to null', () => {
    const [a] = run([{ id: 10n, characterId: 2n, joinedAt: at(1) }], [character(2n)]);
    expect(a).toMatchObject({ followLeader: true, locationId: null });
  });

  it('keeps an unknown member as offline, elsewhere and following by default', () => {
    const [a] = run([{ id: 10n, characterId: 99n, joinedAt: at(1), followLeader: false }], []);
    expect(a).toMatchObject({ known: false, online: false, locationId: null, followLeader: false });
  });
});

describe('lowStaminaFor', () => {
  const effect = (characterId: bigint, over: Record<string, unknown> = {}) => ({
    characterId,
    effectType: 'travel_discount',
    roundsRemaining: 4n,
    magnitude: 2n,
    ...over,
  });

  it('is true below the within-region cost and false at it', () => {
    expect(lowStaminaFor(character(1n, { stamina: 4n }), [])).toBe(true);
    expect(lowStaminaFor(character(1n, { stamina: 5n }), [])).toBe(false);
  });

  it('honours only the own travel_discount effects', () => {
    expect(lowStaminaFor(character(1n, { stamina: 3n }), [effect(1n)])).toBe(false);
    expect(lowStaminaFor(character(1n, { stamina: 3n }), [effect(2n)])).toBe(true);
  });

  it('applies the racial increase and discount', () => {
    expect(lowStaminaFor(character(1n, { stamina: 6n, racialTravelCostIncrease: 2n }), [])).toBe(true);
    expect(lowStaminaFor(character(1n, { stamina: 2n, racialTravelCostDiscount: 3n }), [])).toBe(false);
  });
});

describe('partyMembers stamina and the low mark', () => {
  const members = [
    { id: 10n, characterId: 2n, joinedAt: at(1) },
    { id: 11n, characterId: 3n, joinedAt: at(2) },
  ];
  const discount = (characterId: bigint, over: Record<string, unknown> = {}) => ({
    characterId,
    effectType: 'travel_discount',
    roundsRemaining: 4n,
    magnitude: 2n,
    ...over,
  });
  const run = (characters: ReturnType<typeof character>[], effects?: ReturnType<typeof discount>[]) =>
    partyMembers({ group: null, members, characters, selfId: 1n, effects });

  it('carries stamina and maxStamina from the character row', () => {
    const [a] = run([character(2n, { stamina: 12n, maxStamina: 40n }), character(3n)]);
    expect(a).toMatchObject({ stamina: 12n, maxStamina: 40n, lowStamina: false });
  });

  it('is low only below the within-region cost (5)', () => {
    const [a, b] = run([character(2n, { stamina: 4n }), character(3n, { stamina: 5n })]);
    expect(a.lowStamina).toBe(true);
    expect(b.lowStamina).toBe(false);
  });

  it('applies the racial increase and discount', () => {
    const [a, b] = run([
      character(2n, { stamina: 6n, racialTravelCostIncrease: 2n }),
      character(3n, { stamina: 2n, racialTravelCostDiscount: 3n }),
    ]);
    expect(a.lowStamina).toBe(true);
    expect(b.lowStamina).toBe(false);
  });

  it('lets a member own active travel_discount effect lower the threshold, never another member', () => {
    const characters = [character(2n, { stamina: 3n }), character(3n, { stamina: 3n })];
    const [a, b] = run(characters, [discount(2n)]);
    expect(a.lowStamina).toBe(false);
    expect(b.lowStamina).toBe(true);
    const [expired] = run(characters, [discount(2n, { roundsRemaining: 0n })]);
    expect(expired.lowStamina).toBe(true);
  });

  it('is not low for a member without a character row', () => {
    const [a] = run([character(3n)]);
    expect(a).toMatchObject({ known: false, stamina: 0n, maxStamina: 0n, lowStamina: false });
  });
});
